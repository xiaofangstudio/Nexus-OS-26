/**
 * ============================================================
 * Nexus OS 26 · B站（方哩方哩）后端代理 · /api/bili/*
 * ------------------------------------------------------------
 * 为什么需要代理：
 *   浏览器直连 api.bilibili.com 会被 CORS 拦；且 B站要求 Referer/UA/Cookie，
 *   缺一个就 -412 风控。Worker 在这里补齐请求头、做 WBI 签名、统一 JSON。
 *
 * 端点（全部 GET，统一信封 { ok, code, data } / { ok:false, code, error }）：
 *   GET /api/bili/feed?page=&ps=          首页/热门信息流
 *   GET /api/bili/search?keyword=&page=&order=   视频搜索（WBI 签名）
 *   GET /api/bili/video?bvid=            视频详情（标题/UP/封面/简介/cid/分P）
 *   GET /api/bili/play?bvid=&cid=&q=     播放地址（优先 MP4 durl，可直接播）
 *   GET /api/bili/related?bvid=          相关推荐
 *   GET /api/bili/img?url=               封面/头像代理（补 Referer，防 403）
 *   GET /api/bili/stream?url=            视频字节代理，支持 Range（206）
 *   GET /api/bili/health                 代理状态（是否配置 Cookie / WBI 是否可用）
 *
 * 兼容旧前端（保留）：
 *   GET /api/bili/popular?ps=&pn=        → feed
 *   GET /api/bili/ranking?rid=&type=     → 排行榜
 *   GET /api/bili/api/popular            → 同 popular（旧前端多拼一层 /api）
 *
 * 约定：
 *   - 上游超时 12s；播放地址 15s。
 *   - KV 缓存（BILI_KV，复用 XF_KV 命名空间）：feed 5min / search 10min / video 10min /
 *     play 5min / related 10min；图片交给边缘缓存 1 天；视频流不缓存。
 *   - 服务器级 Cookie：wrangler.toml [vars] BILI_COOKIE（可选，自备 SESSDATA 可提升清晰度）。
 *     请求头 X-Bili-Cookie 可覆盖（服务器不落盘）。
 *   - 无 Cookie 时如实返回上游 accept_quality，不伪造 1080P。
 * ============================================================
 */

import qrcode from 'qrcode-generator';
import { corsHeaders, fail, fetchTimeout, json, kvGet, kvPut, readUpstream } from './http.js';

const API = 'https://api.bilibili.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const TTL = { feed: 300, search: 600, video: 600, play: 300, related: 600 };
const API_TIMEOUT = 12000;
const PLAY_TIMEOUT = 15000;

/* ---------- MD5（WBI 签名必需；crypto.subtle 不提供 MD5） ---------- */
const S_SHIFT = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const K_TABLE = (() => {
  const k = new Int32Array(64);
  for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  return k;
})();

function rotl(x, c) {
  return (x << c) | (x >>> (32 - c));
}

export function md5(str) {
  const bytes = new TextEncoder().encode(String(str));
  const len = bytes.length;
  const words = new Int32Array((((len + 8) >> 6) + 1) * 16);
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  words[len >> 2] |= 0x80 << ((len % 4) * 8);
  const bits = len * 8;
  words[words.length - 2] = bits >>> 0;
  words[words.length - 1] = Math.floor(bits / 4294967296);

  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < words.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d;
    for (let j = 0; j < 64; j++) {
      let f, g, s;
      if (j < 16) {
        f = (b & c) | (~b & d);
        g = j;
        s = S_SHIFT[j % 4];
      } else if (j < 32) {
        f = (d & b) | (~d & c);
        g = (5 * j + 1) % 16;
        s = S_SHIFT[4 + (j % 4)];
      } else if (j < 48) {
        f = b ^ c ^ d;
        g = (3 * j + 5) % 16;
        s = S_SHIFT[8 + (j % 4)];
      } else {
        f = c ^ (b | ~d);
        g = (7 * j) % 16;
        s = S_SHIFT[12 + (j % 4)];
      }
      const tmp = d;
      d = c;
      c = b;
      b = (b + rotl((a + f + K_TABLE[j] + words[i + g]) | 0, s)) | 0;
      a = tmp;
    }
    a = (a + oa) | 0;
    b = (b + ob) | 0;
    c = (c + oc) | 0;
    d = (d + od) | 0;
  }
  return [a, b, c, d]
    .map((n) => {
      let hex = '';
      for (let i = 0; i < 4; i++) hex += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0');
      return hex;
    })
    .join('');
}

/* ---------- WBI 签名 ---------- */
const MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21,
  56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

let MEM_WBI = null; // { img, sub, ts }
let MEM_BUVID = null; // { cookie, ts }

async function getWbiKeys(env, force) {
  if (!force && MEM_WBI && Date.now() - MEM_WBI.ts < 6 * 3600 * 1000) return MEM_WBI;
  if (!force) {
    const cached = await kvGet(env, 'bili:wbi');
    if (cached && cached.img && cached.sub) {
      MEM_WBI = { img: cached.img, sub: cached.sub, ts: cached.ts || Date.now() };
      return MEM_WBI;
    }
  }
  const rm = relayMode(env);
  const urls = [];
  if (rm.on) urls.push(rm.base + '/x/web-interface/nav?' + qs(RELAY_PARAMS));
  urls.push(API + '/x/web-interface/nav');
  for (const u of urls) {
    try {
      const res = await fetchTimeout(
        u,
        { headers: u.includes('translate.goog') ? { 'User-Agent': UA } : baseHeaders(await getCookie(env)) },
        API_TIMEOUT
      );
      const { json: body } = await readUpstream(res);
      const wi = body && body.data && body.data.wbi_img;
      if (!wi || !wi.img_url || !wi.sub_url) continue;
      const img = wi.img_url.split('/').pop().split('.')[0];
      const sub = wi.sub_url.split('/').pop().split('.')[0];
      MEM_WBI = { img, sub, ts: Date.now() };
      await kvPut(env, 'bili:wbi', MEM_WBI, 6 * 3600);
      return MEM_WBI;
    } catch (e) {
      /* 试下一个通道 */
    }
  }
  return null;
}

function wbiQuery(params, keys) {
  const raw = keys.img + keys.sub;
  const mixin = MIXIN_TAB.map((i) => raw[i] || '').join('').slice(0, 32);
  const all = Object.assign({}, params, { wts: Math.floor(Date.now() / 1000) });
  const query = Object.keys(all)
    .sort()
    .map((k) => {
      const v = String(all[k]).replace(/[!'()*]/g, '');
      return encodeURIComponent(k) + '=' + encodeURIComponent(v);
    })
    .join('&');
  return query + '&w_rid=' + md5(query + mixin);
}

/* ---------- 设备指纹 / Cookie ---------- */
function baseHeaders(cookie) {
  const h = {
    'User-Agent': UA,
    Referer: 'https://www.bilibili.com/',
    Origin: 'https://www.bilibili.com',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
  };
  if (cookie) h.Cookie = cookie;
  return h;
}

async function getBuvid(env) {
  if (MEM_BUVID && Date.now() - MEM_BUVID.ts < 12 * 3600 * 1000) return MEM_BUVID.cookie;
  const cached = await kvGet(env, 'bili:buvid');
  if (cached && cached.cookie) {
    MEM_BUVID = { cookie: cached.cookie, ts: cached.ts || Date.now() };
    return MEM_BUVID.cookie;
  }
  try {
    const res = await fetchTimeout(API + '/x/frontend/finger/spi', { headers: baseHeaders('') }, API_TIMEOUT);
    const { json: body } = await readUpstream(res);
    const d = body && body.data;
    if (!d || !d.b_3) return '';
    const cookie =
      'buvid3=' + d.b_3 + '; buvid4=' + (d.b_4 || '') + '; b_nut=' + Math.floor(Date.now() / 1000) + '; buvid_fp=' + d.b_3;
    MEM_BUVID = { cookie, ts: Date.now() };
    await kvPut(env, 'bili:buvid', MEM_BUVID, 12 * 3600);
    return cookie;
  } catch (e) {
    return '';
  }
}

async function getCookie(env, userCookie) {
  if (userCookie) return userCookie;
  if (env.BILI_COOKIE) return String(env.BILI_COOKIE);
  return await getBuvid(env);
}

/* ---------- 上游调用 ---------- */
function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])))
    .join('&');
}

function mapError(status, body, note) {
  if (status === 412) {
    return {
      code: 'BILI_412',
      status: 502,
      error:
        'B站风控拦截（HTTP 412）。当前出口 IP 被临时限制，' +
        (note || '可配置服务器 Cookie（BILI_COOKIE）提升成功率，或稍后重试。'),
    };
  }
  if (body && typeof body.code === 'number' && body.code !== 0) {
    const st = body.code === -404 ? 404 : body.code === -10403 ? 403 : 502;
    return { code: 'BILI_' + body.code, status: st, error: body.message || '上游返回错误', upstream: body };
  }
  return { code: 'BILI_UPSTREAM', status: 502, error: '上游 HTTP ' + status, upstream: body };
}

/* ---------- 上游调用 ----------
 * 现实约束：Cloudflare 的全部出口 IP 都被 B站整段 412（连 www.bilibili.com 的 HTML
 * 都拦），直连在 Worker 里永远拿不到数据。实测唯一稳定通道是 Google 翻译代理
 * （api-bilibili-com.translate.goog）—— 它是 Google 的服务器去抓 B站，不受 CF 出口影响。
 *
 * 所以默认走「中转优先，直连兜底」：
 *   1) 中转：只发 UA，绝不把 BILI_COOKIE / 用户 Cookie 发给 Google；
 *   2) 直连：中转挂掉（429/超时/非 JSON）时才试，仍会 412，但保留将来解封的可能。
 *
 * 关键细节：Google 会强制带上 _x_tr_sl/_x_tr_tl/_x_tr_hl 等参数，而 WBI 签名
 * 是对「B站收到的整串 query」算 w_rid。所以签名前先把这几个参数并进 params，
 * 让签名覆盖 Google 追加的参数，否则 search/playurl 会 -352。
 */
const RELAY_BASE = 'https://api-bilibili-com.translate.goog';
const RELAY_PARAMS = { _x_tr_sl: 'auto', _x_tr_tl: 'zh-CN', _x_tr_hl: 'zh-CN' };

function relayMode(env) {
  const m = String((env && env.BILI_RELAY) || '').toLowerCase();
  if (m === 'direct' || m === 'off') return { on: false, base: RELAY_BASE };
  if (/^https?:\/\//.test(m)) return { on: true, base: m.replace(/\/+$/, '') };
  return { on: true, base: RELAY_BASE };
}

function buildTargets(env, path, query, withRelayParams) {
  const rm = relayMode(env);
  const extras = withRelayParams ? qs(RELAY_PARAMS) : '';
  const relayQuery = [query, extras].filter(Boolean).join('&');
  const out = [];
  if (rm.on) out.push({ url: rm.base + path + '?' + relayQuery, mode: 'relay' });
  out.push({ url: API + path + (query ? '?' + query : ''), mode: 'direct' });
  return out;
}

async function biliGet(env, request, path, paramsIn, opt = {}) {
  const ttl = opt.ttl || 0;
  const userCookie = request.headers.get('X-Bili-Cookie') || '';
  const useCache = ttl > 0 && !userCookie;
  const key = 'bili:v3:' + path + '?' + qs(paramsIn) + (opt.wbi ? '&wbi' : '');
  if (useCache) {
    const hit = await kvGet(env, key);
    if (hit && hit.data) return { ok: true, body: hit.data, cached: true, via: hit.via || 'kv' };
  }

  // 中转场景：把 Google 的固定参数并进签名范围
  const params = Object.assign({}, paramsIn);
  const rm = relayMode(env);
  if (rm.on) Object.assign(params, RELAY_PARAMS);

  let query;
  if (opt.wbi) {
    const keys = await getWbiKeys(env, false);
    query = keys ? wbiQuery(params, keys) : qs(params);
  } else {
    query = qs(params);
  }

  const cookie = await getCookie(env, userCookie);
  const targets = buildTargets(env, path, query, false);

  let last = null;
  let relayErr = null;
  for (const t of targets) {
    const attempts = t.mode === 'relay' ? (opt.attempts || 5) : 1;
    for (let i = 0; i < attempts; i++) {
      let res;
      try {
        const headers = t.mode === 'relay' ? { 'User-Agent': UA, Accept: 'application/json, */*' } : baseHeaders(cookie);
        res = await fetchTimeout(t.url, { headers }, opt.timeout || API_TIMEOUT);
      } catch (e) {
        last = { code: 'BILI_TIMEOUT', status: 504, error: '连接上游超时（' + t.mode + '）：' + (e && e.message) };
        if (t.mode === 'relay') relayErr = last;
        await new Promise((r) => setTimeout(r, 900 + i * 1400));
        continue;
      }
      const parsed = await readUpstream(res);
      if (!parsed.json) {
        last = {
          code: parsed.status === 429 ? 'BILI_RELAY_LIMIT' : 'BILI_NON_JSON',
          status: 502,
          error: '上游返回非 JSON（' + t.mode + ' HTTP ' + parsed.status + '）',
        };
        if (t.mode === 'relay') relayErr = last;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 900 + i * 1400));
        continue;
      }
      if (parsed.status !== 200 || (parsed.json.code !== 0 && parsed.json.code !== undefined)) {
        last = mapError(parsed.status, parsed.json, t.mode === 'relay' ? '' : '未配置 BILI_COOKIE 时较常见。');
        if (t.mode === 'relay') relayErr = last;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 900 + i * 1400));
        continue;
      }
      if (useCache) await kvPut(env, key, { data: parsed.json, ts: Date.now(), via: t.mode }, ttl);
      return { ok: true, body: parsed.json, cached: false, via: t.mode, tries: i + 1 };
    }
  }
  // 直连的 412 是「已知环境问题」，报错时优先展示中转的真实原因
  return { ok: false, err: relayErr || last || { code: 'BILI_UPSTREAM', status: 502, error: '上游不可用' } };
}

/* ---------- 归一化 ---------- */
const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
const httpsPic = (u) => {
  let s = String(u || '');
  if (/^\/\//.test(s)) s = 'https:' + s;
  return s.replace(/^http:\/\//i, 'https://');
};

function normArchive(v) {
  const pic = httpsPic(v.pic || v.cover || '');
  return {
    bvid: v.bvid || '',
    aid: v.aid || v.id || 0,
    title: stripTags(v.title),
    cover: pic,
    author: (v.owner && v.owner.name) || v.author || '',
    mid: (v.owner && v.owner.mid) || v.mid || 0,
    view: (v.stat && v.stat.view) || v.play || 0,
    danmaku: (v.stat && v.stat.danmaku) || v.video_review || 0,
    duration: v.duration || 0,
    pubdate: v.pubdate || v.ctime || 0,
    tag: v.tname || '',
  };
}

/* ---------- HTML 兜底（API 被风控时，从页面 __INITIAL_STATE__ 取数据） ---------- */
function relayBaseFor(env) {
  return relayMode(env).base;
}

function extractState(html) {
  const marker = '__INITIAL_STATE__';
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const eq = html.indexOf('{', i);
  if (eq < 0) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let p = eq; p < html.length; p++) {
    const ch = html[p];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = p;
        break;
      }
    }
  }
  if (end < 0) return null;
  let raw = html.slice(eq, end + 1).replace(/:\s*undefined/g, ':null');
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function fetchHtml(env, targetPath, params, hostBase) {
  const base = hostBase || relayBaseFor(env);
  const url = base + targetPath + '?' + qs(Object.assign({}, params, RELAY_PARAMS));
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetchTimeout(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } }, 20000);
      if (res.status === 200) return await res.text();
    } catch (e) {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 900 + i * 1200));
  }
  return null;
}

function normVideoData(d, bvid) {
  const pages = (Array.isArray(d.pages) ? d.pages : []).map((p) => ({
    cid: p.cid,
    page: p.page,
    part: stripTags(p.part),
    duration: p.duration || 0,
    width: p.dimension && p.dimension.width,
    height: p.dimension && p.dimension.height,
  }));
  // UGC 合集（B2）：只有 UP 主把视频放进「合集」时才有；官方 PGC 不做（B4）
  const ugc = d.ugc_season || null;
  const season = ugc
    ? {
        id: ugc.id || 0,
        title: stripTags(ugc.title),
        sections: (Array.isArray(ugc.sections) ? ugc.sections : []).map((s) => ({
          title: stripTags(s.title),
          episodes: (Array.isArray(s.episodes) ? s.episodes : []).map((e) => ({
            bvid: e.bvid || '',
            cid: e.cid || 0,
            aid: e.aid || 0,
            title: stripTags(e.title),
            cover: httpsPic((e.arc && e.arc.pic) || ''),
            duration: (e.arc && e.arc.duration) || e.duration || 0,
            pubdate: (e.arc && e.arc.pubdate) || 0,
          })),
        })),
      }
    : null;
  return {
    bvid: d.bvid || bvid,
    aid: d.aid,
    cid: d.cid,
    title: stripTags(d.title),
    cover: httpsPic(d.pic),
    author: { mid: d.owner && d.owner.mid, name: (d.owner && d.owner.name) || '', face: httpsPic(d.owner && d.owner.face) },
    desc: String(d.desc || ''),
    duration: d.duration || 0,
    pubdate: d.pubdate || 0,
    tname: d.tname || d.tname_v2 || '',
    videos: d.videos || 0,
    stat: d.stat || {},
    pages,
    season,
    url: 'https://www.bilibili.com/video/' + (d.bvid || bvid),
  };
}

/* 搜索页兜底：B站搜索 API 会返回 v_voucher（Gaia 验证）而拿不到列表，
   但搜索页 HTML 的首屏结果仍然 SSR 渲染（卡片标题与 BV 号数量一一对应）。
   这里按 DOM 顺序配对，是免 Cookie 时唯一能拿到搜索结果的路径。 */
function parseSearchHtml(html) {
  if (!html) return [];
  const bvSet = [];
  const seen = new Set();
  const bvRe = /BV[0-9A-Za-z]{10}/g;
  let m;
  while ((m = bvRe.exec(html))) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      bvSet.push({ bvid: m[0], i: m.index });
    }
  }
  const titles = [];
  const tRe = /class="bili-video-card__info--tit(?:\s[^"]*)?"([^>]*)>([\s\S]*?)<\/h3>/g;
  while ((m = tRe.exec(html))) {
    const attrs = m[1] || '';
    const attrTitle = /title="([^"]*)"/.exec(attrs);
    titles.push({ title: stripTags(attrTitle ? attrTitle[1] : stripTags(m[2])), i: m.index });
  }
  const n = Math.min(bvSet.length, titles.length);
  const items = [];
  for (let k = 0; k < n; k++) {
    const t = titles[k];
    const seg = html.slice(Math.max(0, t.i - 2600), t.i);
    const after = html.slice(t.i, t.i + 900);
    const coverM = /bfs\/archive\/([A-Za-z0-9/._-]+?\.(?:jpg|png|webp))/i.exec(seg);
    const authorM = /class="bili-video-card__info--(?:author|owner|name|up-name)"[^>]*>(?:<[^>]+>)*([^<]{1,40})/.exec(after);
    const durM = /class="bili-video-card__info--bottom"[^]*?([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)/.exec(after);
    const viewM = /class="bili-video-card__stats--item"[^]*?<span[^>]*>([\d.]+[万亿]?)</.exec(after);
    const viewNum = viewM
      ? (() => {
          const n = parseFloat(viewM[1]);
          if (!n) return 0;
          if (/亿/.test(viewM[1])) return Math.round(n * 1e8);
          if (/万/.test(viewM[1])) return Math.round(n * 1e4);
          return Math.round(n);
        })()
      : 0;
    items.push({
      bvid: bvSet[k].bvid,
      aid: 0,
      title: t.title,
      cover: coverM ? 'https://i0.hdslb.com/bfs/archive/' + coverM[1] : '',
      author: authorM ? stripTags(authorM[1]) : '',
      mid: 0,
      view: viewNum,
      danmaku: 0,
      duration: durM ? durM[1] : '',
      pubdate: 0,
      tag: '',
    });
  }
  return items.filter((v) => v.bvid && v.title);
}

async function handleFeed(request, env, url, origin) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || url.searchParams.get('pn') || '1', 10) || 1);
  const ps = Math.min(40, Math.max(1, parseInt(url.searchParams.get('ps') || '20', 10) || 20));
  const params = {
    ps,
    fresh_type: 3,
    fresh_idx: page,
    fresh_idx_1h: page,
    brush: page,
    homepage_ver: 1,
    feed_version: 'V8',
  };
  /* 只有第一页取 rcmd（真正的「推荐」）；后续页走 popular 分页，
     它支持 pn 且内容稳定，能把中转调用次数压到最低（429 时不会整页卡死）。 */
  let r = { ok: false };
  let source = 'popular';
  if (page === 1) {
    r = await biliGet(env, request, '/x/web-interface/wbi/index/top/feed/rcmd', params, {
      wbi: true,
      ttl: TTL.feed,
      attempts: 3,
    });
    source = 'rcmd';
  }
  if (!r.ok) {
    r = await biliGet(env, request, '/x/web-interface/popular', { ps, pn: page }, { ttl: TTL.feed, attempts: 3 });
    source = 'popular';
  }
  if (!r.ok) {
    const last = await kvGet(env, 'bili:feed:last:' + page);
    if (last && last.data && last.data.length) {
      return json(
        { page, ps, source: 'stale', hasMore: true, items: last.data },
        200,
        env,
        request,
        { 'Cache-Control': 'no-store', 'X-Bili-Via': 'stale' }
      );
    }
    return fail(r.err.code, r.err.error, r.err.status, env, request, {}, r.err.upstream);
  }

  const d = r.body.data || {};
  const list = Array.isArray(d.item) ? d.item : Array.isArray(d.list) ? d.list : [];
  const items = list
    .map((v) => {
      const a = normArchive(v);
      if (!a.bvid && v.id) a.bvid = String(v.id);
      return a;
    })
    .filter((v) => v.bvid && v.title);
  /* rcmd 是无限推荐流，接口本身不返回 has_more；popular 用 no_more 表示到底 */
  const hasMore = source === 'rcmd' ? true : !d.no_more;
  if (items.length) await kvPut(env, 'bili:feed:last:' + page, { data: items, ts: Date.now() }, 7 * 24 * 3600);
  return json(
    { page, ps, source, hasMore, items },
    200,
    env,
    request,
    { 'Cache-Control': 'public, max-age=300', 'X-Cache': r.cached ? 'HIT' : 'MISS', 'X-Bili-Via': r.via || 'kv' }
  );
}

/* 搜索页兜底抓取：Google 翻译代理会被 429，allorigins 是另一条独立出口。
   两家都试，单次 12s、不叠加重试，避免整个搜索请求拖到 40s+ 被前端超时掐断。 */
async function fetchSearchPage(env, keyword, page) {
  const pn = Math.max(1, parseInt(page || '1', 10) || 1);
  const target =
    'https://search.bilibili.com/all?keyword=' + encodeURIComponent(keyword) + '&page=' + pn + '&from_source=video_tag';
  /* 搜索页要走 search-bilibili-com.translate.goog（不是 api 那条），
     这是实测唯一能稳定拿到 SSR 卡片的通道；allorigins 作为独立出口兜底。 */
  const searchRelay = relayBaseFor(env).replace('api-bilibili-com', 'search-bilibili-com');
  const enc = encodeURIComponent(target);
  const urls = [
    { u: searchRelay + '/all?' + qs(Object.assign({ keyword, page: pn }, RELAY_PARAMS)), n: 2 },
    { u: 'https://api.allorigins.win/get?url=' + enc, n: 1 },
    { u: 'https://api.allorigins.win/raw?url=' + enc, n: 1 },
  ];
  for (const item of urls) {
    for (let i = 0; i < item.n; i++) {
      try {
        const res = await fetchTimeout(item.u, { headers: { 'User-Agent': UA, Accept: 'text/html' } }, 12000);
        if (res.status !== 200) {
          if (i < item.n - 1) await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        let html = await res.text();
        if (/allorigins\.win\/get/.test(item.u)) {
          try {
            html = (JSON.parse(html) || {}).contents || '';
          } catch (e) {
            html = '';
          }
        }
        if (html && /bili-video-card__info--tit|__INITIAL_STATE__/.test(html)) {
          return { html, via: item.u.indexOf('allorigins') > 0 ? 'html-allorigins' : 'html' };
        }
      } catch (e) {
        /* 换下一条出口 */
      }
    }
  }
  return null;
}

async function handleSearch(request, env, url, origin) {
  const keyword = String(url.searchParams.get('keyword') || url.searchParams.get('q') || '').trim();
  if (!keyword) return fail('BAD_REQUEST', '缺少 keyword 参数', 400, env, request);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || url.searchParams.get('pn') || '1', 10) || 1);
  const order = String(url.searchParams.get('order') || '');
  const params = { search_type: 'video', keyword, page };
  if (order) params.order = order;

  let r = await biliGet(env, request, '/x/web-interface/wbi/search/type', params, {
    wbi: true,
    ttl: TTL.search,
    attempts: 3,
  });
  if (!r.ok) r = await biliGet(env, request, '/x/web-interface/search/type', params, { ttl: TTL.search });

  let items = [];
  let via = '';
  let verifyBlocked = false;
  if (r.ok) {
    const d = r.body.data || {};
    /* code 0 但带 v_voucher 且没有列表 = 上游人机验证，不是「真的没有结果」 */
    verifyBlocked = !!d.v_voucher && !Array.isArray(d.result);
    items = (Array.isArray(d.result) ? d.result : [])
      .map((v) => {
        const a = normArchive(v);
        if (v.pic && !/^https?:/.test(a.cover)) a.cover = httpsPic(v.pic);
        return a;
      })
      .filter((v) => v.bvid && v.title);
    via = r.via || 'api';
  }

  // 搜索 API 现在会回 v_voucher（Gaia 人机验证），列表为空时走搜索页 SSR 兜底
  if (items.length === 0) {
    const hk = 'bili:v3:search_html:' + keyword + ':p' + page;
    const hc = await kvGet(env, hk);
    if (hc && hc.data && hc.data.length) {
      items = hc.data;
      via = 'html-cache';
    } else {
      const pageRes = await fetchSearchPage(env, keyword, page);
      const parsed = pageRes ? parseSearchHtml(pageRes.html) : [];
      if (parsed.length) {
        items = parsed;
        via = pageRes.via || 'html';
        await kvPut(env, hk, { data: items, ts: Date.now() }, TTL.search);
      }
    }
    /* 长缓存兜底：中转全挂时，同一个关键词仍然给出上一次抓到的真实结果，
       并在 via 里标 stale（前端据此提示「结果来自缓存」），而不是空列表。 */
    if (items.length === 0) {
      const last = await kvGet(env, 'bili:search:last:' + keyword + ':p' + page);
      if (last && last.data && last.data.length) {
        items = last.data;
        via = 'stale';
      }
    }
  }
  if (items.length) {
    await kvPut(env, 'bili:search:last:' + keyword + ':p' + page, { data: items, ts: Date.now() }, 7 * 24 * 3600);
  }
  if (items.length === 0 && !r.ok) return fail(r.err.code, r.err.error, r.err.status, env, request);
  /* 同页去重：SSR 兜底偶尔把同一张卡片重复渲染 */
  const seenBv = new Set();
  items = items.filter((v) => (seenBv.has(v.bvid) ? false : (seenBv.add(v.bvid), true)));
  /* 不许静默成空列表：人机验证拦截要如实报错，让前端区分「失败」与「0 条结果」 */
  if (items.length === 0 && verifyBlocked) {
    return fail(
      'BILI_SEARCH_VERIFY',
      'B站对本次搜索返回人机验证（v_voucher），搜索页兜底也没抓到内容，请稍后重试。',
      502,
      env,
      request
    );
  }

  return json(
    {
      keyword,
      page,
      via,
      numResults: items.length,
      items,
    },
    200,
    env,
    request,
    { 'Cache-Control': 'public, max-age=600', 'X-Cache': r.cached ? 'HIT' : 'MISS', 'X-Bili-Via': via }
  );
}

async function handleVideo(request, env, url, origin) {
  const bvid = String(url.searchParams.get('bvid') || '').trim();
  const aid = String(url.searchParams.get('aid') || '').trim();
  if (!bvid && !aid) return fail('BAD_REQUEST', '缺少 bvid（或 aid）参数', 400, env, request);
  const params = bvid ? { bvid } : { aid };

  const key = 'bili:v3:video:' + (bvid || 'aid' + aid);
  const cached = await kvGet(env, key);
  if (cached && cached.data) {
    return json(cached.data, 200, env, request, { 'Cache-Control': 'public, max-age=600', 'X-Cache': 'HIT', 'X-Bili-Via': 'kv' });
  }

  let data = null, via = '';
  let err = null;
  if (bvid) {
    let r = await biliGet(env, request, '/x/web-interface/view', params, { ttl: TTL.video });
    if (!r.ok) r = await biliGet(env, request, '/x/web-interface/wbi/view', params, { wbi: true, ttl: TTL.video });
    if (r.ok) {
      data = normVideoData(r.body.data || {}, bvid);
      via = r.via || 'api';
    } else {
      err = r.err;
    }
  }

  // API 被风控时，从视频页 __INITIAL_STATE__ 兜底
  if ((!data || !data.cid) && bvid) {
    const html = await fetchHtml(env, '/video/' + bvid, {});
    const st = html ? extractState(html) : null;
    const vd = st && (st.videoData || (st.video && st.video.videoData));
    if (vd) {
      data = normVideoData(vd, bvid);
      via = 'html';
    }
  }
  if (!data) {
    const e = err || { code: 'BILI_UPSTREAM', status: 502, error: '无法获取视频信息（API 与页面兜底均失败）' };
    return fail(e.code, e.error, e.status, env, request, {}, e.upstream);
  }
  await kvPut(env, key, { data, ts: Date.now() }, TTL.video);
  return json(data, 200, env, request, {
    'Cache-Control': 'public, max-age=600',
    'X-Cache': 'MISS',
    'X-Bili-Via': via,
  });
}

async function handlePlay(request, env, url, origin) {
  let bvid = String(url.searchParams.get('bvid') || '').trim();
  let cid = String(url.searchParams.get('cid') || '').trim();
  const qn = parseInt(url.searchParams.get('q') || url.searchParams.get('qn') || '64', 10) || 64;
  const aid = String(url.searchParams.get('aid') || '').trim();
  if (!bvid && !aid) return fail('BAD_REQUEST', '缺少 bvid（或 aid）参数', 400, env, request);

  // 没给 cid：先取详情的第一 P（API 失败时用页面兜底，避免播放页整条链路断掉）
  if (!cid) {
    let got = null;
    if (bvid || aid) {
      const vr = await biliGet(env, request, '/x/web-interface/view', bvid ? { bvid } : { aid }, { ttl: TTL.video });
      if (vr.ok) got = vr.body.data || {};
    }
    if ((!got || !got.cid) && bvid) {
      const html = await fetchHtml(env, '/video/' + bvid, {});
      const st = html ? extractState(html) : null;
      const vd = st && (st.videoData || (st.video && st.video.videoData));
      if (vd) got = vd;
    }
    if (!got) return fail('NO_CID', '无法获取视频 cid（视频信息接口与页面兜底均失败）', 502, env, request);
    bvid = bvid || got.bvid;
    cid = String((got.pages && got.pages[0] && got.pages[0].cid) || got.cid || '');
    if (!cid) return fail('NO_CID', '无法获取 cid', 502, env, request);
  }

  // 三级尝试：WBI(MP4) → 普通(MP4) → html5 平台（历史上免登录直接给单文件 MP4）
  let r = await biliGet(env, request, '/x/player/wbi/playurl', { bvid, cid, qn, fnval: 1, fnver: 0, fourk: 1 }, {
    wbi: true,
    ttl: TTL.play,
    timeout: PLAY_TIMEOUT,
  });
  if (!r.ok || !(r.body.data && Array.isArray(r.body.data.durl) && r.body.data.durl.length)) {
    r = await biliGet(env, request, '/x/player/playurl', { bvid, cid, qn, fnval: 1, fnver: 0, fourk: 1 }, {
      ttl: TTL.play,
      timeout: PLAY_TIMEOUT,
    });
  }
  if (!r.ok || !(r.body.data && Array.isArray(r.body.data.durl) && r.body.data.durl.length)) {
    r = await biliGet(
      env,
      request,
      '/x/player/playurl',
      { bvid, cid, qn, fnval: 0, fnver: 0, platform: 'html5', high_quality: 1, fourk: 1 },
      { ttl: TTL.play, timeout: PLAY_TIMEOUT }
    );
  }
  if (!r.ok) return fail(r.err.code, r.err.error, r.err.status, env, request, {}, r.err.upstream);

  const d = r.body.data || {};
  const qualities = (d.accept_quality || []).map((q, i) => ({
    id: q,
    label: (d.accept_description || [])[i] || String(q),
  }));
  const durl = (Array.isArray(d.durl) ? d.durl : []).map((u) => {
    const all = [u.url || '', ...(u.backup_url || [])].filter(Boolean);
    // 实测：主 CDN（upos-sz-mirror*.bilivideo.com）在 Cloudflare 出口被 EdgeOne 回 567，
    // Akamai 备份线可用，所以按可达性排序，proxy 里带上全部候选供 worker 逐个尝试
    all.sort((a, b) => urlScore(b) - urlScore(a));
    const q = all.map((x) => 'url=' + encodeURIComponent(x)).join('&');
    return {
      order: u.order,
      size: u.size || 0,
      length: u.length || 0,
      format: 'mp4',
      url: all[0] || '',
      backup: all.slice(1),
      proxy: all.length && origin ? origin + '/api/bili/stream?' + q : '',
    };
  });
  const chosen = qualities.find((q) => q.id === (Number(d.quality) || qn)) || { id: d.quality || qn, label: '' };
  return json(
    {
      bvid,
      cid: Number(cid),
      quality: chosen,
      accept: qualities,
      loginRequired: !durl.length,
      note: durl.length ? '' : '上游未返回可直接播放的 MP4，可能需要在服务器配置 BILI_COOKIE（SESSDATA）。',
      durl,
    },
    200,
    env,
    request,
    { 'Cache-Control': 'public, max-age=300', 'X-Cache': r.cached ? 'HIT' : 'MISS', 'X-Bili-Via': r.via || 'kv' }
  );
}

async function handleRelated(request, env, url, origin) {
  const bvid = String(url.searchParams.get('bvid') || '').trim();
  if (!bvid) return fail('BAD_REQUEST', '缺少 bvid 参数', 400, env, request);
  const r = await biliGet(env, request, '/x/web-interface/archive/related', { bvid }, { ttl: TTL.related });
  if (!r.ok) return fail(r.err.code, r.err.error, r.err.status, env, request, {}, r.err.upstream);
  const items = (Array.isArray(r.body.data) ? r.body.data : []).map(normArchive).filter((v) => v.bvid && v.title);
  return json({ bvid, items }, 200, env, request, {
    'Cache-Control': 'public, max-age=600',
    'X-Cache': r.cached ? 'HIT' : 'MISS',
    'X-Bili-Via': r.via || 'kv',
  });
}

/* ---------- 图片 / 视频字节代理 ---------- */
const IMG_HOSTS = [/(^|\.)hdslb\.com$/i, /(^|\.)bilibili\.com$/i, /(^|\.)biliimg\.com$/i];
const MEDIA_HOSTS = [
  /(^|\.)bilivideo\.com$/i,
  /(^|\.)bilivideo\.cn$/i,
  /(^|\.)hdslb\.com$/i,
  /(^|\.)akamaized\.net$/i,
  /(^|\.)szbdyd\.com$/i,
  /(^|\.)bilibili\.com$/i,
  /(^|\.)com\.cn$/i,
];

/** CDN 可达性打分（在 Cloudflare 出口实测得出）：Akamai 备份 > hdslb > bilivideo 主站 */
function urlScore(u) {
  try {
    const h = new URL(u).hostname;
    if (/akamaized\.net$/i.test(h)) return 20;
    if (/hdslb\.com$/i.test(h)) return 15;
    if (/bilivideo\.cn$/i.test(h)) return 10;
    if (/bilivideo\.com$/i.test(h)) return 5;
    return 1;
  } catch (e) {
    return 0;
  }
}

function allowedHost(u, list) {
  try {
    const h = new URL(u).hostname;
    return list.some((re) => re.test(h));
  } catch (e) {
    return false;
  }
}

async function handleImg(request, env, url) {
  const target = url.searchParams.get('url') || '';
  if (!target) return fail('BAD_REQUEST', '缺少 url 参数', 400, env, request);
  if (!/^https?:\/\//.test(target) || !allowedHost(target, IMG_HOSTS)) {
    return fail('BAD_TARGET', '仅允许 B站图片域名', 400, env, request);
  }
  let res;
  try {
    res = await fetchTimeout(target, { headers: baseHeaders(await getCookie(env)) }, API_TIMEOUT);
  } catch (e) {
    return fail('UPSTREAM_TIMEOUT', '图片上游超时', 504, env, request);
  }
  if (!res.ok) return fail('UPSTREAM_HTTP', '图片上游 HTTP ' + res.status, 502, env, request);
  const headers = Object.assign(corsHeaders(env, request), {
    'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
    'Cache-Control': 'public, max-age=86400, immutable',
    'X-Cache': 'MISS',
  });
  return new Response(res.body, { status: 200, headers });
}

async function handleStream(request, env, url) {
  // 支持多个候选：?url=A&url=B —— 主 CDN 被 EdgeOne 拒时可自动换 Akamai 备份
  const targets = url.searchParams.getAll('url').filter(Boolean);
  if (!targets.length) return fail('BAD_REQUEST', '缺少 url 参数', 400, env, request);
  if (targets.some((t) => !/^https?:\/\//.test(t) || !allowedHost(t, MEDIA_HOSTS))) {
    return fail('BAD_TARGET', '仅允许 B站视频 CDN 域名', 400, env, request);
  }

  const headers = baseHeaders(await getCookie(env));
  const range = request.headers.get('Range');
  if (range) headers.Range = range; // 拖进度条关键：透传 Range

  let lastStatus = 0;
  const tried = [];
  for (const target of targets) {
    let res;
    try {
      res = await fetch(target, { headers, redirect: 'follow' });
    } catch (e) {
      tried.push(new URL(target).hostname + ':timeout');
      lastStatus = 0;
      continue;
    }
    tried.push(new URL(target).hostname + ':' + res.status);
    if (!res.ok && res.status !== 206) {
      lastStatus = res.status;
      continue;
    }
    const out = Object.assign(corsHeaders(env, request), {
      'Content-Type': res.headers.get('Content-Type') || 'video/mp4',
      'Accept-Ranges': res.headers.get('Accept-Ranges') || 'bytes',
      'Cache-Control': 'no-store',
      'X-Bili-Cdn': new URL(target).hostname,
    });
    for (const name of ['Content-Length', 'Content-Range', 'Last-Modified', 'ETag']) {
      const v = res.headers.get(name);
      if (v) out[name] = v;
    }
    return new Response(res.body, { status: res.status, headers: out });
  }
  return fail(
    lastStatus ? 'UPSTREAM_HTTP' : 'UPSTREAM_TIMEOUT',
    '视频上游全部候选不可用（' + tried.join(', ') + '）',
    502,
    env,
    request,
    {},
    { tried }
  );
}

/* ---------- 状态 ---------- */
async function handleDiag(request, env, url) {
  const probe = url && url.searchParams.get('html');
  if (probe) {
    const html = await fetchHtml(env, '/all', { keyword: probe }, 'https://search-bilibili-com.translate.goog');
    const idx = html ? html.indexOf('__INITIAL_STATE__') : -2;
    const cardIdx = html ? html.indexOf('/video/BV') : -1;
    const jsonBvidIdx = html ? html.indexOf('"bvid":"') : -1;
    const bvs = html ? html.match(/BV[0-9A-Za-z]{10}/g) || [] : [];
    const titles = html ? html.match(/bili-video-card__info--tit/g) || [] : [];
    return json(
      {
        len: html ? html.length : 0,
        hasJsonBvid: jsonBvidIdx > 0,
        bvTotal: bvs.length,
        bvUnique: new Set(bvs).size,
        titleBlocks: titles.length,
        jsonSnippet: html && jsonBvidIdx > 0 ? html.slice(jsonBvidIdx - 200, jsonBvidIdx + 500) : '',
        cardSnippet: html && cardIdx > 0 ? html.slice(cardIdx - 120, cardIdx + 260) : '',
      },
      200,
      env,
      request,
      { 'Cache-Control': 'no-store' }
    );
  }
  const synthetic = (() => {
    const hex = '0123456789ABCDEF';
    const seg = (n) => {
      let s = '';
      for (let i = 0; i < n; i++) s += hex[Math.floor(Math.random() * 16)];
      return s;
    };
    return seg(8) + '-' + seg(4) + '-' + seg(4) + '-' + seg(4) + '-' + seg(12) + 'infoc';
  })();
  const ua = UA;
  const tests = [
    {
      name: 'popular_plain',
      url: API + '/x/web-interface/popular?ps=3&pn=1',
      headers: { 'User-Agent': ua, Referer: 'https://www.bilibili.com/' },
    },
    {
      name: 'popular_synthetic_buvid',
      url: API + '/x/web-interface/popular?ps=3&pn=1',
      headers: {
        'User-Agent': ua,
        Referer: 'https://www.bilibili.com/',
        Cookie: 'buvid3=' + synthetic + '; b_nut=' + Math.floor(Date.now() / 1000) + '; buvid_fp=' + synthetic,
      },
    },
    {
      name: 'popular_no_referer',
      url: API + '/x/web-interface/popular?ps=3&pn=1',
      headers: { 'User-Agent': ua },
    },
    {
      name: 'nav',
      url: API + '/x/web-interface/nav',
      headers: { 'User-Agent': ua, Referer: 'https://www.bilibili.com/' },
    },
    {
      name: 'view',
      url: API + '/x/web-interface/view?bvid=BV1GJ411x7h7',
      headers: { 'User-Agent': ua, Referer: 'https://www.bilibili.com/' },
    },
    {
      name: 'www_video_html',
      url: 'https://www.bilibili.com/video/BV1GJ411x7h7',
      headers: { 'User-Agent': ua },
    },
    {
      name: 'search_html',
      url: 'https://search.bilibili.com/all?keyword=%E5%8E%9F%E7%A5%9E',
      headers: { 'User-Agent': ua },
    },
    {
      name: 'app_feed',
      url: 'https://app.bilibili.com/x/v2/feed/index?build=8400&mobi_app=android&platform=android&ps=3',
      headers: { 'User-Agent': ua },
    },
    {
      name: 'img_cdn',
      url: 'https://i0.hdslb.com/bfs/face/member/noface.jpg',
      headers: { 'User-Agent': ua, Referer: 'https://www.bilibili.com/' },
    },
    {
      name: 'relay_allorigins',
      url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(API + '/x/web-interface/popular?ps=3&pn=1'),
      headers: { 'User-Agent': ua },
    },
    {
      name: 'relay_jina',
      url: 'https://r.jina.ai/' + API + '/x/web-interface/popular?ps=3&pn=1',
      headers: { 'User-Agent': ua, 'X-Return-Format': 'text' },
    },
    {
      name: 'relay_corslol',
      url: 'https://api.cors.lol/?url=' + encodeURIComponent(API + '/x/web-interface/popular?ps=3&pn=1'),
      headers: { 'User-Agent': ua },
    },
    {
      name: 'relay_corsfix',
      url: 'https://proxy.corsfix.com/?' + API + '/x/web-interface/popular?ps=3&pn=1',
      headers: { 'User-Agent': ua },
    },
    {
      name: 'relay_allorigins_get',
      url: 'https://api.allorigins.win/get?url=' + encodeURIComponent(API + '/x/web-interface/popular?ps=3&pn=1'),
      headers: { 'User-Agent': ua },
    },
    {
      name: 'relay_codetabs',
      url: 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(API + '/x/web-interface/popular?ps=3&pn=1'),
      headers: { 'User-Agent': ua },
    },
    {
      name: 'relay_corsproxy',
      url: 'https://corsproxy.io/?url=' + encodeURIComponent(API + '/x/web-interface/popular?ps=3&pn=1'),
      headers: { 'User-Agent': ua },
    },
    {
      name: 'relay_thingproxy',
      url: 'https://thingproxy.freeboard.io/fetch/' + API + '/x/web-interface/popular?ps=3&pn=1',
      headers: { 'User-Agent': ua },
    },
  ];
  const out = [];
  for (const t of tests) {
    try {
      const res = await fetchTimeout(t.url, { headers: t.headers }, 20000);
      const text = (await res.text()).slice(0, 160);
      out.push({ name: t.name, status: res.status, body: text.replace(/\s+/g, ' ') });
    } catch (e) {
      out.push({ name: t.name, status: 0, body: String((e && e.message) || e) });
    }
  }

  // Jina Reader 免费额度按 IP 共享：429 时退避重试，看看到底是被限流还是被 B站封
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetchTimeout(
        'https://r.jina.ai/' + API + '/x/web-interface/view?bvid=BV1GJ411x7h7',
        { headers: { 'User-Agent': ua, 'X-Return-Format': 'text' } },
        25000
      );
      const text = (await res.text()).slice(0, 200);
      out.push({ name: 'jina_try' + i, status: res.status, body: text.replace(/\s+/g, ' ') });
      if (res.status === 200) break;
    } catch (e) {
      out.push({ name: 'jina_try' + i, status: 0, body: String((e && e.message) || e) });
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  for (const t of [
    {
      name: 'corsfix_with_origin',
      url: 'https://proxy.corsfix.com/?https://api.bilibili.com/x/web-interface/popular?ps=3&pn=1',
      headers: { 'User-Agent': ua, Origin: 'https://www.bilibili.com' },
    },
    { name: 'relay_injahow2', url: 'https://api.injahow.cn/bparse/?av=BV1GJ411x7h7&p=1&q=80&otype=json', headers: { 'User-Agent': ua } },
    { name: 'relay_isogit', url: 'https://cors.isomorphic-git.org/https://api.bilibili.com/x/web-interface/popular?ps=3&pn=1', headers: { 'User-Agent': ua } },
    { name: 'relay_whateverorigin', url: 'https://whateverorigin.org/get?url=' + encodeURIComponent(API + '/x/web-interface/popular?ps=3&pn=1'), headers: { 'User-Agent': ua } },
    { name: 'relay_afeld', url: 'https://jsonp.afeld.me/?url=' + encodeURIComponent(API + '/x/web-interface/popular?ps=3&pn=1'), headers: { 'User-Agent': ua } },
    { name: 'relay_yacdn', url: 'https://yacdn.org/proxy/' + API + '/x/web-interface/popular?ps=3&pn=1', headers: { 'User-Agent': ua } },
    {
      name: 'gtranslate_auto',
      url: 'https://api-bilibili-com.translate.goog/x/web-interface/popular?ps=3&pn=1&_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN',
      headers: { 'User-Agent': ua },
    },
    { name: 'host_api_live', url: 'https://api.live.bilibili.com/xlive/web-interface/v1/index/getList?platform=web', headers: { 'User-Agent': ua, Referer: 'https://live.bilibili.com/' } },
    { name: 'host_grpc', url: 'https://grpc.biliapi.net/bilibili.app.view.v1.View/View', headers: { 'User-Agent': ua } },
    { name: 'relay_bilibili_tv', url: 'https://api.bilibili.tv/intl/gateway/web/v2/search?keyword=naruto&page=1', headers: { 'User-Agent': ua } },
    { name: 'popular_xff', url: API + '/x/web-interface/popular?ps=3&pn=1', headers: { 'User-Agent': ua, Referer: 'https://www.bilibili.com/', 'X-Forwarded-For': '223.5.5.5', 'X-Real-IP': '223.5.5.5' } },
    { name: 'relay_popular', url: 'https://api-bilibili-com.translate.goog/x/web-interface/popular?ps=3&pn=1&_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN', headers: { 'User-Agent': ua } },
    { name: 'relay_view', url: 'https://api-bilibili-com.translate.goog/x/web-interface/view?bvid=BV1GJ411x7h7&_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN', headers: { 'User-Agent': ua } },
    { name: 'relay_view_detail', url: 'https://api-bilibili-com.translate.goog/x/web-interface/view/detail?bvid=BV1GJ411x7h7&_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN', headers: { 'User-Agent': ua } },
    { name: 'relay_related', url: 'https://api-bilibili-com.translate.goog/x/web-interface/archive/related?bvid=BV1GJ411x7h7&_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN', headers: { 'User-Agent': ua } },
    { name: 'relay_nav', url: 'https://api-bilibili-com.translate.goog/x/web-interface/nav?_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN', headers: { 'User-Agent': ua } },
    { name: 'relay_video_html', url: 'https://www-bilibili-com.translate.goog/video/BV1GJ411x7h7?_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN', headers: { 'User-Agent': ua } },
    { name: 'relay_search_html2', url: 'https://search-bilibili-com.translate.goog/all?keyword=%E7%8E%8B%E8%80%85%E8%8D%A3%E8%80%80&_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN', headers: { 'User-Agent': ua } },
  ]) {
    try {
      const res = await fetchTimeout(t.url, { headers: t.headers }, 20000);
      const text = await res.text();
      out.push({ name: t.name, status: res.status, body: text.slice(0, 300).replace(/\s+/g, ' ') });
    } catch (e) {
      out.push({ name: t.name, status: 0, body: String((e && e.message) || e) });
    }
  }
  // 搜索链路专测：确认 WBI 签名在中转下是否被 B站接受
  try {
    const keys = await getWbiKeys(env, false);
    const q = keys
      ? wbiQuery(Object.assign({ search_type: 'video', keyword: '王者荣耀', page: 1 }, RELAY_PARAMS), keys)
      : qs(Object.assign({ search_type: 'video', keyword: '王者荣耀', page: 1 }, RELAY_PARAMS));
    const res = await fetchTimeout(relayBaseFor(env) + '/x/web-interface/wbi/search/type?' + q, { headers: { 'User-Agent': ua } }, 20000);
    const t = await res.text();
    out.push({ name: 'search_signed', status: res.status, body: t.slice(0, 400).replace(/\s+/g, ' ') });
  } catch (e) {
    out.push({ name: 'search_signed', status: 0, body: String((e && e.message) || e) });
  }

  return json({ at: new Date().toISOString(), synthetic, tests: out }, 200, env, request, { 'Cache-Control': 'no-store' });
}

async function handleHealth(request, env) {
  const keys = await getWbiKeys(env, false);
  const cookie = await getCookie(env);
  return json(
    {
      service: 'nexus-bili-proxy',
      upstream: API,
      relay: relayMode(env).on ? relayMode(env).base : 'direct',
      cookieMode: env.BILI_COOKIE ? 'server' : cookie ? 'buvid-auto' : 'none',
      wbi: keys ? 'ok' : 'unavailable',
      endpoints: ['feed', 'search', 'video', 'play', 'related', 'danmaku', 'img', 'stream', 'login/qrcode', 'login/poll', 'login/me', 'login/logout'],
      cache: TTL,
    },
    200,
    env,
    request,
    { 'Cache-Control': 'no-store' }
  );
}

/* ============================================================
 * 真·B站扫码登录（Worker 侧）
 * ------------------------------------------------------------
 * 前端只拿到：会话 token / 二维码 SVG / 昵称头像粉丝数。
 * Cookie 永远不下发前端；Cookie 用 AES-GCM 加密后写 BILI_KV，7 天过期。
 * 二维码由 Worker 用 qrcode-generator 渲染，不经过任何第三方二维码服务。
 *
 * 出口策略：passport 先直连，失败再试 passport.biligame.com，最后退 Google 翻译中转。
 * 中转 429 限流时会短暂退避重试；poll 仍失败由前端按「网络波动」继续轮询。
 * 中转拿不到 Set-Cookie 时，从 poll 返回的 data.url 里解析 SESSDATA 等字段。
 * ============================================================ */
const PASSPORT = 'https://passport.bilibili.com';
const PASSPORT_ALT = 'https://passport.biligame.com';
const PASSPORT_RELAY = 'https://passport-bilibili-com.translate.goog';
const LOGIN_TTL = 7 * 24 * 3600;
const COOKIE_KEYS = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5'];

function randomToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function shortErrText(status, mode, text) {
  if (status === 429) return (mode === 'relay' ? '中转限流' : '上游限流') + '（429）';
  if (status === 412) return '上游风控（412）';
  const t = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 60) : '无响应';
}

async function passportGet(env, path, params) {
  const rm = relayMode(env);
  const plain = qs(params || {});
  const relayQuery = [plain, qs(RELAY_PARAMS)].filter(Boolean).join('&');
  /* 实测 Cloudflare 出口对 passport / biligame 都是 412，中转是唯一可用链路，
     所以中转放第一位，避免每次先白等 biligame 12s 超时。 */
  const targets = [];
  if (rm.on) targets.push({ url: PASSPORT_RELAY + path + '?' + relayQuery, mode: 'relay', attempt: 3 });
  targets.push({ url: PASSPORT + path + '?' + plain, mode: 'direct', attempt: 1 });
  targets.push({ url: PASSPORT_ALT + path + '?' + plain, mode: 'direct-alt', attempt: 1 });
  let last = null;
  const hops = [];
  for (const t of targets) {
    for (let i = 0; i < t.attempt; i += 1) {
      try {
        const res = await fetchTimeout(
          t.url,
          {
            headers: {
              'User-Agent': UA,
              Referer: 'https://www.bilibili.com/',
              Accept: 'application/json, */*',
              'Accept-Language': 'zh-CN,zh;q=0.9',
            },
          },
          t.mode === 'relay' ? 6000 : 12000
        );
        const text = await res.text();
        let body = null;
        try {
          body = JSON.parse(text);
        } catch (e) {
          /* 非 JSON */
        }
        let setCookies = [];
        try {
          setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
        } catch (e) {
          setCookies = [];
        }
        if (res.status === 200 && body) return { ok: true, body, via: t.mode, setCookies };
        last = { status: res.status, mode: t.mode, text: shortErrText(res.status, t.mode, text) };
        hops.push(t.mode + ':' + res.status);
        if (!(res.status === 429 || res.status >= 500) || i === t.attempt - 1) break;
      } catch (e) {
        last = { status: 0, mode: t.mode, text: (e && e.message) || '连接失败' };
        hops.push(t.mode + ':timeout');
        if (i === t.attempt - 1) break;
      }
      await new Promise((r) => setTimeout(r, 1500 + i * 1500));
    }
  }
  const err = last || { status: 0, mode: 'none', text: 'passport 不可用' };
  err.hops = hops;
  /* 直连 412 会把中转 429 的真实原因顶掉，这里按链路还原：先中转、后直连 */
  if (hops.some((h) => h.indexOf('relay:429') >= 0)) {
    err.error = '扫码接口中转限流（429），直连被 B站风控（412）；稍等几秒点「换一张」重试';
  } else {
    err.error = String(err.text || 'passport 不可用') + (hops.length ? '（尝试：' + hops.join(' → ') + '）' : '');
  }
  return { ok: false, err };
}

function pickLoginCookie(setCookies) {
  const out = {};
  (setCookies || []).forEach((line) => {
    COOKIE_KEYS.forEach((k) => {
      const m = new RegExp('(?:^|;\\s*)' + k + '=([^;]+)').exec(String(line));
      if (m && !out[k]) out[k] = decodeURIComponent(m[1]);
    });
  });
  return COOKIE_KEYS.map((k) => (out[k] ? k + '=' + out[k] : '')).filter(Boolean).join('; ');
}

function cookieFromLoginUrl(u) {
  try {
    const q = new URL(String(u || '')).searchParams;
    const out = {};
    COOKIE_KEYS.forEach((k) => {
      const v = q.get(k);
      if (v) out[k] = v;
    });
    return COOKIE_KEYS.map((k) => (out[k] ? k + '=' + out[k] : '')).filter(Boolean).join('; ');
  } catch (e) {
    return '';
  }
}

function midOfCookie(cookie) {
  const m = /(?:^|;\s*)DedeUserID=([^;]+)/.exec(String(cookie || ''));
  return m ? m[1] : '';
}

function normProfile(c, fallbackMid) {
  c = c || {};
  return {
    mid: c.mid || Number(fallbackMid) || 0,
    name: c.name || '',
    face: httpsPic(c.face || ''),
    fans: Number(c.fans || 0),
    following: Number(c.attention || 0),
    level: (c.level_info && c.level_info.current_level) || 0,
    sign: c.sign || '',
  };
}

async function profileFromCookie(env, request, cookie) {
  const mid = midOfCookie(cookie);
  if (!mid) return null;
  // 公开名片接口（走中转，不需要用户 Cookie）
  try {
    const r = await biliGet(env, request, '/x/web-interface/card', { mid, photo: 'true' }, { ttl: 300, timeout: 20000 });
    if (r.ok && r.body && r.body.code === 0 && r.body.data && r.body.data.card) {
      const p = normProfile(r.body.data.card, mid);
      try {
        const rel = await biliGet(env, request, '/x/relation/stat', { vmid: mid }, { ttl: 300, timeout: 15000 });
        if (rel.ok && rel.body && rel.body.data) {
          p.fans = Number(rel.body.data.follower || p.fans);
          p.following = Number(rel.body.data.following || p.following);
        }
      } catch (e) {
        /* 粉丝数拿不到就保留名片里的 */
      }
      return p;
    }
  } catch (e) {
    /* 走下面的直连兜底 */
  }
  // 兜底：直连 nav（Cloudflare 出口常 412，失败就如实返回空资料）
  try {
    const res = await fetchTimeout(API + '/x/web-interface/nav', { headers: baseHeaders(cookie) }, 15000);
    const { json: body } = await readUpstream(res);
    if (body && body.code === 0 && body.data && body.data.isLogin) {
      return normProfile(
        {
          mid: body.data.mid,
          name: body.data.uname,
          face: body.data.face,
          fans: body.data.follower,
          attention: body.data.following,
          level_info: body.data.level_info,
          sign: body.data.sign,
        },
        mid
      );
    }
  } catch (e) {
    /* ignore */
  }
  return { mid: Number(mid) || 0, name: '', face: '', fans: 0, following: 0, level: 0, sign: '' };
}

function b64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

async function loginAesKey(env, token) {
  const secret = String((env && env.BILI_LOGIN_SECRET) || 'n26-bili-login-v1') + '|' + token;
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function sealSession(env, token, cookie, profile) {
  const key = await loginAesKey(env, token);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(cookie));
  return { v: 1, iv: b64(iv), c: b64(enc), profile, at: Date.now() };
}

async function kvDel(env, key) {
  try {
    if (env.BILI_KV) await env.BILI_KV.delete(key);
  } catch (e) {
    /* ignore */
  }
}

/* ---- 登录态存储：KV 写入额度用尽时退回 Cache API ----
   KV 免费额度每天 1000 写，写满后 put 会抛「limit exceeded」；
   登录二维码/会话都是短生命周期的，Cache API 也能满足（按 colo 生效）。 */
const LSTORE = 'https://ai.fanggame.company/__login-store/';
function lreq(key) {
  return new Request(LSTORE + encodeURIComponent(key));
}
async function lPut(env, key, value, ttl) {
  try {
    if (env.BILI_KV) await env.BILI_KV.put(key, value, { expirationTtl: ttl });
  } catch (e) {
    /* KV 额度用尽，走 Cache */
  }
  try {
    await caches.default.put(
      lreq(key),
      new Response(JSON.stringify(value), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=' + Math.max(60, ttl),
        },
      })
    );
  } catch (e) {
    /* ignore */
  }
}
async function lGet(env, key) {
  try {
    if (env.BILI_KV) {
      const v = await env.BILI_KV.get(key);
      if (v) return v;
    }
  } catch (e) {
    /* ignore */
  }
  try {
    const r = await caches.default.match(lreq(key));
    if (r) return await r.json();
  } catch (e) {
    /* ignore */
  }
  return null;
}
async function lDel(env, key) {
  try {
    if (env.BILI_KV) await env.BILI_KV.delete(key);
  } catch (e) {
    /* ignore */
  }
  try {
    await caches.default.delete(lreq(key));
  } catch (e) {
    /* ignore */
  }
}

async function handleLoginDiag(request, env) {
  /* 传 key 时改测 poll，用来判断「刚生成的二维码是不是被中转缓存成 expired」 */
  const url = new URL(request.url);
  const key = String(url.searchParams.get('key') || '');
  const path = key
    ? '/x/passport-login/web/qrcode/poll?' + qs({ qrcode_key: key, source: 'main-fe-header', _t: String(Date.now()) })
    : '/x/passport-login/web/qrcode/generate';
  const list = [
    { mode: 'direct', url: PASSPORT + path },
    { mode: 'direct-alt', url: PASSPORT_ALT + path },
  ];
  if (relayMode(env).on) list.push({ mode: 'relay', url: PASSPORT_RELAY + path + (path.indexOf('?') >= 0 ? '&' : '?') + qs(RELAY_PARAMS) });
  const results = [];
  for (const t of list) {
    const started = Date.now();
    try {
      const res = await fetchTimeout(
        t.url,
        {
          headers: {
            'User-Agent': UA,
            Referer: 'https://www.bilibili.com/',
            Accept: 'application/json, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
          },
        },
        10000
      );
      const text = await res.text();
      results.push({
        mode: t.mode,
        status: res.status,
        ms: Date.now() - started,
        json: (() => { try { return !!JSON.parse(text); } catch (e) { return false; } })(),
        body: key ? String(text).slice(0, 300) : shortErrText(res.status, t.mode, text),
      });
    } catch (e) {
      results.push({ mode: t.mode, status: 0, ms: Date.now() - started, body: (e && e.message) || '连接失败' });
    }
  }
  return json({ at: Date.now(), results }, 200, env, request, { 'Cache-Control': 'no-store' });
}

async function handleLoginQrcode(request, env) {
  /* _t 只为打掉 Google 翻译中转的缓存：它按 URL 缓存，复用同一个 generate
     URL 会拿到已经过期的那张二维码，表现为「刚生成就 expired」。 */
  const r = await passportGet(env, '/x/passport-login/web/qrcode/generate', { _t: String(Date.now()) });
  if (!r.ok) {
    return fail(
      'BILI_LOGIN_UPSTREAM',
      r.err.error || ('passport ' + (r.err.mode || '') + ' HTTP ' + (r.err.status || 0) + '（' + (r.err.text || '') + '）'),
      502,
      env,
      request,
      { 'Cache-Control': 'no-store' },
      r.err
    );
  }
  const d = r.body && r.body.data;
  if (!d || !d.qrcode_key || !d.url) {
    return fail('BILI_LOGIN_UPSTREAM', '二维码生成失败：上游没有返回 qrcode_key', 502, env, request, { 'Cache-Control': 'no-store' }, r.body);
  }
  const token = randomToken();
  const qrKey = 'bili:login:qr:' + token;
  await lPut(env, qrKey, { key: d.qrcode_key, at: Date.now(), via: r.via }, 240);
  let svg = '';
  try {
    const qr = qrcode(0, 'M');
    qr.addData(d.url);
    qr.make();
    svg = qr.createSvgTag({ cellSize: 3, margin: 3, scalable: true });
  } catch (e) {
    /* SVG 失败时前端仍可用 url 自行渲染 */
  }
  return json(
    { token, url: d.url, svg, expires_in: 180, via: r.via },
    200,
    env,
    request,
    { 'Cache-Control': 'no-store' }
  );
}

async function handleLoginPoll(request, env, url) {
  const token = String(url.searchParams.get('token') || '');
  if (!/^[0-9a-f]{24,64}$/.test(token)) {
    return fail('BILI_LOGIN_TOKEN', '缺少或非法的登录 token', 400, env, request, { 'Cache-Control': 'no-store' });
  }
  const rec = await lGet(env, 'bili:login:qr:' + token);
  if (!rec || !rec.key) {
    return json({ status: 'expired', message: '二维码已过期，请重新生成' }, 200, env, request, { 'Cache-Control': 'no-store' });
  }
  const p = await passportGet(env, '/x/passport-login/web/qrcode/poll', { qrcode_key: rec.key, source: 'main-fe-header', _t: String(Date.now()) });
  if (!p.ok) {
    return fail(
      'BILI_LOGIN_POLL',
      '扫码状态查询失败：passport ' + (p.err.mode || '') + ' HTTP ' + (p.err.status || 0),
      502,
      env,
      request,
      { 'Cache-Control': 'no-store' },
      p.err
    );
  }
  const d = (p.body && p.body.data) || {};
  const code = d.code;
  if (code === 86101) return json({ status: 'waiting', message: '等待扫码' }, 200, env, request, { 'Cache-Control': 'no-store' });
  if (code === 86090) return json({ status: 'scanned', message: '已扫码，请在手机确认' }, 200, env, request, { 'Cache-Control': 'no-store' });
  if (code === 86038) {
    await lDel(env, 'bili:login:qr:' + token);
    return json({ status: 'expired', message: '二维码已过期，请重新生成' }, 200, env, request, { 'Cache-Control': 'no-store' });
  }
  if (code !== 0) {
    return json({ status: 'error', code, message: d.message || '未知扫码状态' }, 200, env, request, { 'Cache-Control': 'no-store' });
  }

  const cookie = pickLoginCookie(p.setCookies) || cookieFromLoginUrl(d.url);
  if (!cookie) {
    return fail(
      'BILI_LOGIN_COOKIE',
      'B站已确认登录，但没拿到 Cookie（上游剥离了 Set-Cookie，且 data.url 无 SESSDATA）',
      502,
      env,
      request,
      { 'Cache-Control': 'no-store' }
    );
  }
  const profile = await profileFromCookie(env, request, cookie);
  const sealed = await sealSession(env, token, cookie, profile);
  const sessKey = 'bili:login:sess:' + token;
  await lPut(env, sessKey, sealed, LOGIN_TTL);
  await lDel(env, 'bili:login:qr:' + token);
  /* 写后回读：拿不到会话就别报 ok，避免「扫码通过了但下次又变成未登录」 */
  const back = await lGet(env, sessKey);
  if (!back || !back.c) {
    return fail(
      'BILI_LOGIN_STORE',
      'B站登录已通过、Cookie 也拿到了，但会话没写进存储（KV 配额/Cache 写入失败），本次登录没有生效，请重新扫码。',
      502,
      env,
      request,
      { 'Cache-Control': 'no-store' }
    );
  }
  const pending = !profile || (!profile.name && !profile.mid);
  return json(
    {
      status: 'ok',
      profile,
      ttl: LOGIN_TTL,
      sessionSaved: true,
      profilePending: pending,
      message: pending ? '登录已生效，但昵称/头像没有回读（上游 412 限流）' : '登录成功',
    },
    200,
    env,
    request,
    { 'Cache-Control': 'no-store' }
  );
}

async function handleLoginMe(request, env, url) {
  const token = String(url.searchParams.get('token') || '');
  if (!/^[0-9a-f]{24,64}$/.test(token)) {
    return json({ status: 'anonymous' }, 200, env, request, { 'Cache-Control': 'no-store' });
  }
  const rec = await lGet(env, 'bili:login:sess:' + token);
  if (!rec || !rec.profile) {
    return json({ status: 'anonymous' }, 200, env, request, { 'Cache-Control': 'no-store' });
  }
  return json({ status: 'ok', profile: rec.profile, at: rec.at || 0 }, 200, env, request, { 'Cache-Control': 'no-store' });
}

async function handleLoginLogout(request, env, url) {
  const token = String(url.searchParams.get('token') || '');
  if (/^[0-9a-f]{24,64}$/.test(token)) {
    await lDel(env, 'bili:login:qr:' + token);
    await lDel(env, 'bili:login:sess:' + token);
  }
  return json({ ok: true }, 200, env, request, { 'Cache-Control': 'no-store' });
}

/* ---------- 弹幕：XML → JSON ----------
   GET /api/bili/danmaku?cid=
   上游 comment.bilibili.com 不带 CORS，浏览器直连必失败；这里做代理并解析成
   { t, mode, color, text }，前端按时间轴滚动渲染。KV 缓存 15 分钟。 */
function decodeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

async function handleDanmaku(request, env, url) {
  const cid = String(url.searchParams.get('cid') || '').trim();
  if (!/^\d{1,20}$/.test(cid)) return fail('PARAM', '缺少或非法的 cid', 400, env, request);

  const key = 'bili:dm:' + cid;
  const cached = await kvGet(env, key);
  if (cached && Array.isArray(cached.items)) {
    return json({ cid, count: cached.items.length, items: cached.items }, 200, env, request, {
      'Cache-Control': 'public, max-age=900',
      'X-Cache': 'HIT',
    });
  }

  // CF 出口访问 B站会 412，优先走 Google 中转；中转失败再直连兜底。
  const dmTargets = [
    'https://api-bilibili-com.translate.goog/x/v1/dm/list.so?oid=' + cid + '&_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN',
    'https://api.bilibili.com/x/v1/dm/list.so?oid=' + cid,
    'https://comment.bilibili.com/' + cid + '.xml',
  ];
  let text = '';
  let lastStatus = 0;
  const dmDbg = [];
  for (const target of dmTargets) {
    const isRelay = /translate\.goog/.test(target);
    const attempts = isRelay ? 4 : 1;
    for (let i = 0; i < attempts; i++) {
      let res;
      try {
        res = await fetchTimeout(
          target,
          {
            headers: isRelay
              ? { 'User-Agent': UA, Accept: 'application/xml, text/xml, */*' }
              : {
                  'User-Agent': UA,
                  Referer: 'https://www.bilibili.com/',
                  Accept: 'application/xml, text/xml, */*',
                },
          },
          12000
        );
      } catch (e) {
        dmDbg.push({ t: target.slice(0, 34), err: (e && e.message) || 'fail' });
        if (isRelay && i < attempts - 1) await new Promise((r) => setTimeout(r, 700 + i * 900));
        continue;
      }
      lastStatus = res.status;
      if (!res.ok) {
        dmDbg.push({ t: target.slice(0, 34), s: res.status });
        if (isRelay && i < attempts - 1) await new Promise((r) => setTimeout(r, 700 + i * 900));
        continue;
      }
      const body = await res.text();
      dmDbg.push({ t: target.slice(0, 34), s: res.status, len: body.length, head: body.slice(0, 60) });
      if (body.indexOf('<d ') !== -1 || body.indexOf('<d>') !== -1) { text = body; break; }
    }
    if (text) break;
  }
  if (!text) {
    return fail('BILI_DM_UPSTREAM', '弹幕上游不可用（HTTP ' + (lastStatus || '—') + '）', 502, env, request, {}, dmDbg);
  }
  const items = [];
  const re = /<d[^>]*p="([^"]+)"[^>]*>([\s\S]*?)<\/d>/g;
  let m;
  while ((m = re.exec(text)) && items.length < 3000) {
    const p = String(m[1]).split(',');
    const t = Number(p[0]);
    if (!isFinite(t)) continue;
    const mode = Number(p[1] || 1);
    const color = Number(p[3] || 16777215);
    const body = decodeXml((m[2] || '').trim());
    if (!body) continue;
    items.push({ t: Math.round(t * 100) / 100, m: mode, c: isFinite(color) ? color : 16777215, x: body.slice(0, 120) });
  }
  if (!items.length) {
    return fail('BILI_DM_EMPTY', '该视频暂时没有拉取到弹幕', 404, env, request);
  }
  items.sort((a, b) => a.t - b.t);
  await kvPut(env, key, { items, at: Date.now() }, 900);
  return json({ cid, count: items.length, items }, 200, env, request, {
    'Cache-Control': 'public, max-age=900',
    'X-Cache': 'MISS',
  });
}

/* ---------- CC 字幕 ----------
 * /api/bili/subtitle?bvid=&cid=
 * 上游：/x/player/wbi/v2 → data.subtitle.subtitles[].subtitle_url（CC 字幕 json）
 * 注意：B站未登录时多数视频拿不到字幕列表；配了 BILI_COOKIE 才会返回。
 * 没有字幕就如实 404，绝不伪造。
 */
const SUB_TTL = 6 * 3600;

const pickSubtitle = (list) =>
  list.find((s) => /^zh|^ai-zh/i.test(String(s.lan || ''))) || list[0];

async function handleSubtitle(request, env, url, origin) {
  const bvid = String(url.searchParams.get('bvid') || '').trim();
  const aid = String(url.searchParams.get('aid') || '').trim();
  let cid = String(url.searchParams.get('cid') || '').trim();
  if (!bvid && !aid) return fail('BAD_REQUEST', '缺少 bvid（或 aid）参数', 400, env, request);

  const key = 'bili:v3:subtitle:' + (bvid || 'aid' + aid) + ':' + (cid || '0');
  const cached = await kvGet(env, key);
  if (cached && Array.isArray(cached.items)) {
    return json(cached, 200, env, request, {
      'Cache-Control': 'public, max-age=' + SUB_TTL,
      'X-Cache': 'HIT',
    });
  }

  // 没给 cid：取详情第一 P
  if (!cid) {
    let got = null;
    const vr = await biliGet(env, request, '/x/web-interface/view', bvid ? { bvid } : { aid }, { ttl: TTL.video });
    if (vr.ok) got = vr.body.data || {};
    if ((!got || !got.cid) && bvid) {
      const html = await fetchHtml(env, '/video/' + bvid, {});
      const st = html ? extractState(html) : null;
      const vd = st && (st.videoData || (st.video && st.video.videoData));
      if (vd) got = vd;
    }
    if (!got) return fail('NO_CID', '无法获取视频 cid（详情与页面兜底均失败）', 502, env, request);
    cid = String((got.pages && got.pages[0] && got.pages[0].cid) || got.cid || '');
    if (!cid) return fail('NO_CID', '无法获取 cid', 502, env, request);
  }

  const r = await biliGet(env, request, '/x/player/wbi/v2', { bvid, cid }, { wbi: true, ttl: 600 });
  if (!r.ok) return fail(r.err.code, r.err.error, r.err.status, env, request, {}, r.err.upstream);

  const sub = (r.body && r.body.data && r.body.data.subtitle) || {};
  const list = Array.isArray(sub.subtitles) ? sub.subtitles : [];
  if (!list.length) {
    return fail(
      'BILI_NO_SUBTITLE',
      '该视频没有可用字幕（UP 主未上传 CC 字幕，或该接口需要登录 Cookie）',
      404,
      env,
      request
    );
  }

  let subUrl = String(pickSubtitle(list).subtitle_url || '');
  if (/^\/\//.test(subUrl)) subUrl = 'https:' + subUrl;
  if (!/^https:\/\//.test(subUrl) || !allowedHost(subUrl, IMG_HOSTS)) {
    return fail('BAD_TARGET', '字幕地址不在允许的 B站域名内', 502, env, request);
  }

  let res;
  try {
    res = await fetchTimeout(subUrl, { headers: baseHeaders(await getCookie(env)) }, API_TIMEOUT);
  } catch (e) {
    return fail('UPSTREAM_TIMEOUT', '字幕文件下载超时：' + (e && e.message), 504, env, request);
  }
  if (!res.ok) return fail('UPSTREAM_HTTP', '字幕文件 HTTP ' + res.status, 502, env, request);

  let j = null;
  try {
    j = await res.json();
  } catch (e) {
    /* 非 JSON */
  }
  const bodyArr = j && (Array.isArray(j.body) ? j.body : Array.isArray(j) ? j : null);
  if (!bodyArr) return fail('BILI_SUB_BAD', '字幕文件格式异常', 502, env, request);

  const chosen = pickSubtitle(list);
  const items = bodyArr
    .map((l) => ({
      from: Math.max(0, Number(l.from) || 0),
      to: Math.max(0, Number(l.to) || 0),
      text: stripTags(l.content).replace(/\s+/g, ' ').trim(),
    }))
    .filter((x) => x.text && x.to > x.from);
  if (!items.length) return fail('BILI_SUB_EMPTY', '字幕文件没有有效句子', 404, env, request);

  const data = {
    bvid: bvid || (r.body && r.body.data && r.body.data.bvid) || '',
    cid: Number(cid),
    lang: chosen.lan || '',
    langDoc: chosen.lan_doc || chosen.lan || '',
    count: items.length,
    items,
  };
  await kvPut(env, key, data, SUB_TTL);
  return json(data, 200, env, request, {
    'Cache-Control': 'public, max-age=' + SUB_TTL,
    'X-Cache': 'MISS',
  });
}

/* ---------- 入口 ---------- */
export async function handleBili(request, env, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env, request) });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return fail('METHOD', '仅支持 GET', 405, env, request);
  }

  const origin = url.origin;
  let sub = url.pathname.replace(/^\/api\/bili/, '') || '/';
  if (/^\/api\//.test(sub)) sub = sub.slice(4); // 兼容 /api/bili/api/popular
  sub = sub.replace(/\/+$/, '') || '/';

  try {
    if (sub === '/feed' || sub === '/popular' || sub === '/') return await handleFeed(request, env, url, origin);
    if (sub === '/search') return await handleSearch(request, env, url, origin);
    if (sub === '/video') return await handleVideo(request, env, url, origin);
    if (sub === '/play') return await handlePlay(request, env, url, origin);
    if (sub === '/related') return await handleRelated(request, env, url, origin);
    if (sub === '/danmaku') return await handleDanmaku(request, env, url);
    if (sub === '/subtitle') return await handleSubtitle(request, env, url, origin);
    if (sub === '/img') return await handleImg(request, env, url);
    if (sub === '/stream') return await handleStream(request, env, url);
    if (sub === '/login/qrcode') return await handleLoginQrcode(request, env);
    if (sub === '/login/diag') return await handleLoginDiag(request, env);
    if (sub === '/login/poll') return await handleLoginPoll(request, env, url);
    if (sub === '/login/me') return await handleLoginMe(request, env, url);
    if (sub === '/login/logout') return await handleLoginLogout(request, env, url);
    if (sub === '/health') return await handleHealth(request, env);
    if (sub === '/diag') return await handleDiag(request, env, url);
    if (sub === '/ranking' || sub === '/rank') {
      const rid = parseInt(url.searchParams.get('rid') || '0', 10) || 0;
      const r = await biliGet(env, request, '/x/web-interface/ranking/v2', { rid, type: url.searchParams.get('type') || 'all' }, { ttl: 600 });
      if (!r.ok) return fail(r.err.code, r.err.error, r.err.status, env, request, {}, r.err.upstream);
      const list = (r.body.data && r.body.data.list) || [];
      return json({ rid, items: list.map(normArchive).filter((v) => v.bvid) }, 200, env, request, {
        'Cache-Control': 'public, max-age=600',
        'X-Cache': r.cached ? 'HIT' : 'MISS',
      });
    }
    return fail('NOT_FOUND', '未知的 B站接口：' + sub, 404, env, request);
  } catch (e) {
    return fail('SERVER', '服务端错误：' + (e && e.message ? e.message : String(e)), 500, env, request);
  }
}
