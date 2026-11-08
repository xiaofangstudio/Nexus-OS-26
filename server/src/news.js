/**
 * Nexus OS 26 · 新闻 RSS 聚合（/api/news/*）
 * ------------------------------------------------------------
 * 纯 Worker、无需 key。只做 RSS/Atom 抓取 + 归一化 + KV 缓存。
 *
 * 端点：
 *   GET /api/news/sources
 *   GET /api/news/feed?source=all|<id>&limit=30&fresh=1
 *
 * 统一条目结构：
 *   { id, title, link, summary, cover, source, sourceName, published, time }
 *
 * 缓存：单源 10 分钟（KV: news:v1:<source>）；`fresh=1` 跳过缓存。
 * 单源失败不影响其他源：响应带 `failed[]`，前端可展示「部分源不可用」。
 */

import { json, fail, fetchTimeout, kvGet, kvPut, cacheHeader } from './http.js';

const TTL = 600;
const TIMEOUT = 10000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_BYTES = 1.5 * 1024 * 1024;

/** 源清单：只放实测可用的公开 RSS（顺序即默认排序权重） */
export const SOURCES = [
  { id: '36kr', name: '36氪', url: 'https://www.36kr.com/feed-newsflash', site: 'https://36kr.com' },
  { id: 'ithome', name: 'IT之家', url: 'https://www.ithome.com/rss/', site: 'https://www.ithome.com' },
  { id: 'sspai', name: '少数派', url: 'https://sspai.com/feed', site: 'https://sspai.com' },
  { id: 'ifanr', name: '爱范儿', url: 'https://www.ifanr.com/feed', site: 'https://www.ifanr.com' },
  { id: 'chinanews', name: '中国新闻网', url: 'https://www.chinanews.com.cn/rss/scroll-news.xml', site: 'https://www.chinanews.com.cn' },
];

const byId = (id) => SOURCES.find((s) => s.id === id);

/* ---------------- XML 小工具（Workers 无 DOMParser，用正则足够） ---------------- */

function unescapeXml(s) {
  return String(s || '')
    .replace(/<![CDATA[\s\S]*?\]\]>/g, (m) => m.slice(9, -3))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function stripTags(s) {
  // 先去掉真标签，再反转义实体，再洗一遍「反转义后出现的标签」，最后压空白
  let t = String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  t = unescapeXml(t);
  t = t.replace(/<[^>]+>/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function pick(block, tag) {
  const m = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i').exec(block);
  return m ? m[1] : '';
}

function pickAttr(block, tag, attr) {
  const m = new RegExp('<' + tag + '[^>]*' + attr + '\\s*=\\s*["\']([^"\']+)["\'][^>]*>', 'i').exec(block);
  return m ? m[1] : '';
}

function toTime(s) {
  const t = Date.parse(String(s || '').trim());
  return isFinite(t) ? t : 0;
}

function normalizeItem(block, src, isAtom) {
  const title = stripTags(isAtom ? pick(block, 'title') : pick(block, 'title'));
  const link = isAtom
    ? (pickAttr(block, 'link', 'href') || stripTags(pick(block, 'link')))
    : stripTags(pick(block, 'link'));
  const summary = stripTags(pick(block, 'description') || pick(block, 'summary') || pick(block, 'content'));
  const pub = toTime(pick(block, 'pubDate') || pick(block, 'published') || pick(block, 'updated') || pick(block, 'dc:date'));
  let cover = '';
  const enc = pickAttr(block, 'enclosure', 'url');
  if (enc) cover = enc;
  if (!cover) {
    const m = /<img[^>]+src=["']([^"']+)["']/i.exec(pick(block, 'content:encoded') || pick(block, 'description') || '');
    if (m) cover = m[1];
  }
  if (!title || !link) return null;
  const guid = stripTags(pick(block, 'guid') || pick(block, 'id')) || link;
  return {
    id: src.id + ':' + guid.slice(0, 120),
    title,
    link,
    summary: summary.slice(0, 240),
    cover: cover || '',
    source: src.id,
    sourceName: src.name,
    published: pub ? new Date(pub).toISOString() : '',
    time: pub,
  };
}

export function parseFeed(xml, src) {
  const text = String(xml || '');
  const isAtom = /<feed[\s>]/i.test(text) && !/<rss[\s>]/i.test(text);
  const blocks = [];
  if (isAtom) {
    const re = /<entry[\s>][\s\S]*?<\/entry>/gi;
    let m; while ((m = re.exec(text))) blocks.push(m[0]);
  } else {
    const re = /<item[\s>][\s\S]*?<\/item>/gi;
    let m; while ((m = re.exec(text))) blocks.push(m[0]);
    if (!blocks.length) {   // 有的源用 RSS1.0 / RDF
      const re2 = /<item[\s>][\s\S]*?<\/item>/gi;
      while ((m = re2.exec(text))) blocks.push(m[0]);
    }
  }
  return blocks.map((b) => normalizeItem(b, src, isAtom)).filter(Boolean);
}

async function loadSource(env, src, fresh) {
  const key = 'news:v1:' + src.id;
  if (!fresh) {
    const hit = await kvGet(env, key);
    if (hit && Array.isArray(hit.items)) return hit;
  }
  const res = await fetchTimeout(src.url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
    redirect: 'follow',
    cf: { cacheTtl: 300, cacheEverything: true },
  }, TIMEOUT);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new Error('源过大');
  const xml = new TextDecoder('utf-8').decode(buf);
  const items = parseFeed(xml, src).slice(0, 60);
  if (!items.length) throw new Error('解析到 0 条（上游可能返回了 HTML 或已停更）');
  const out = { source: src.id, fetchedAt: Date.now(), items };
  await kvPut(env, key, out, TTL);
  return out;
}

export async function handleNews(request, env, url) {
  if (request.method !== 'GET') return fail('METHOD', '仅支持 GET', 405, env, request);
  const route = url.pathname.replace(/\/+$/, '').slice('/api/news'.length) || '/';
  const q = url.searchParams;

  if (route === '/sources') {
    return json({
      items: SOURCES.map((s) => ({ id: s.id, name: s.name, site: s.site })),
      total: SOURCES.length,
    }, 200, env, request, Object.assign({ 'X-Cache': 'STATIC' }, cacheHeader(3600)));
  }

  if (route === '/feed' || route === '/') {
    const want = (q.get('source') || 'all').trim();
    const limit = Math.min(80, Math.max(1, parseInt(q.get('limit') || '30', 10) || 30));
    const fresh = q.get('fresh') === '1';
    const list = want === 'all' ? SOURCES : (byId(want) ? [byId(want)] : null);
    if (!list) return fail('BAD_SOURCE', '未知新闻源：' + want + '（可用 /api/news/sources）', 400, env, request);

    const settled = await Promise.allSettled(list.map((s) => loadSource(env, s, fresh)
      .then((r) => ({ id: s.id, name: s.name, items: r.items, fetchedAt: r.fetchedAt }))
      .catch((e) => Promise.reject(Object.assign(e, { source: s.id })))));

    const items = [];
    const failed = [];
    const sources = [];
    let hitCount = 0;
    settled.forEach((r, i) => {
      const s = list[i];
      if (r.status === 'fulfilled') {
        sources.push({ id: s.id, name: s.name, count: r.value.items.length, fetchedAt: r.value.fetchedAt });
        hitCount += 1;
        r.value.items.forEach((it) => items.push(it));
      } else {
        failed.push({ id: s.id, name: s.name, error: String(r.reason && r.reason.message || r.reason) });
      }
    });

    if (!items.length && failed.length) {
      return fail('NEWS_ALL_FAILED', '所有新闻源暂不可用', 502, env, request, {}, failed);
    }

    items.sort((a, b) => (b.time || 0) - (a.time || 0));
    const dedup = [];
    const seen = new Set();
    for (const it of items) {
      const k = it.title.slice(0, 60);
      if (seen.has(k)) continue;
      seen.add(k);
      dedup.push(it);
      if (dedup.length >= limit) break;
    }

    return json({
      source: want,
      total: dedup.length,
      sources,
      failed,
      items: dedup.map((it) => (it.cover && it.cover.startsWith('//') ? Object.assign({}, it, { cover: 'https:' + it.cover }) : it)),
    }, 200, env, request, Object.assign({
      'X-Cache': hitCount === list.length ? 'MISS' : 'PARTIAL',
      'X-News-Sources-Ok': String(hitCount),
      'X-News-Sources-Failed': String(failed.length),
    }, cacheHeader(TTL)));
  }

  return fail('NOT_FOUND', '未知新闻接口，可用：/feed /sources', 404, env, request);
}
