/**
 * ============================================================
 * Nexus OS 26 · 字幕翻译中转（/api/translate）
 * ------------------------------------------------------------
 * 只做一件事：浏览器 → 本 Worker → Google 翻译，补 CORS 并缓存。
 * 前端绝不直连 Google（国内不可达，且会暴露用户 IP）。
 *
 * 接口：
 *   POST /api/translate
 *     body: { q: string[], sl?: 'auto', tl?: 'zh-CN' }
 *     resp: { ok:true, code:0, data:{ tl, sl, count, cached, items:[{i,t}] } }
 *   限制：单次 ≤40 句、总字符 ≤2000；按行缓存 tr:<tl>:<sha1> 30 天。
 *   失败一律返回真实上游错误，**绝不回填原文冒充译文**。
 *
 *   GET /api/translate?selftest=1 —— 逐个探测候选上游，返回真实状态码
 * ============================================================
 */

import { fail, fetchTimeout, json, kvGet, kvPut, readUpstream } from './http.js';

const CACHE_TTL = 30 * 24 * 3600; // 30 天
const MAX_LINES = 40;
const MAX_CHARS = 2000;
const TIMEOUT = 10000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * Google 翻译候选上游（按实测可达性排序）。
 * 实测：Cloudflare 共享出口访问 translate_a/single / clients5 基本全是 429，
 * 唯一稳定的是 translate.goog 反向代理（与 B站中转同源，Google 服务器自己去取）。
 * 所以 relay 放第一，其余仅作备份；relay 429 时退避 3 次再换通道。
 */
const UPSTREAMS = [
  { id: 'relay', url: 'https://translate-googleapis-com.translate.goog/translate_a/single', mode: 'relay' },
  { id: 'gtx', url: 'https://translate.googleapis.com/translate_a/single', mode: 'post' },
  { id: 'gtx-www', url: 'https://translate.google.com/translate_a/single', mode: 'post' },
  { id: 'clients5', url: 'https://clients5.google.com/translate_a/t', mode: 'clients5' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sha1Hex(s) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function upstreamRequest(up, text, sl, tl) {
  const common = 'sl=' + encodeURIComponent(sl || 'auto') + '&tl=' + encodeURIComponent(tl) + '&dt=t';
  if (up.mode === 'post') {
    return {
      url: up.url,
      init: {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Accept: '*/*',
        },
        body: 'q=' + encodeURIComponent(text) + '&' + common + '&client=gtx',
      },
    };
  }
  const q = up.mode === 'relay'
    ? 'client=gtx&' + common + '&_x_tr_sl=auto&_x_tr_tl=' + encodeURIComponent(tl) + '&_x_tr_hl=zh-CN&q=' + encodeURIComponent(text)
    : 'client=dict-chrome-ex&' + common + '&q=' + encodeURIComponent(text);
  return {
    url: up.url + '?' + q,
    init: { method: 'GET', headers: { 'User-Agent': UA, Accept: '*/*' } },
  };
}

/** 兼容 translate_a/single 与 translate_a/t 两种返回结构 */
function extractText(j) {
  if (typeof j === 'string') return j;
  if (!Array.isArray(j) || !j.length) return '';
  // A: [[["译","源"],["译2","源2"]], ...]
  if (Array.isArray(j[0]) && Array.isArray(j[0][0])) {
    return j[0].map((s) => String(s[0] == null ? '' : s[0])).join('');
  }
  // B: ["译","源",null,null,10]（translate_a/t 单句）
  if (typeof j[0] === 'string') return j[0];
  // C: [["译1",...],["译2",...]]（translate_a/t 多句）
  if (Array.isArray(j[0]) && typeof j[0][0] === 'string') {
    return j.map((x) => String(x[0] == null ? '' : x[0])).join('\n');
  }
  return '';
}

/** 调一次候选上游：429 / 5xx / 超时按 3s、6s 退避重试（最多 3 次） */
async function callGoogle(up, text, sl, tl, attempts) {
  const n = attempts || 3;
  const req = upstreamRequest(up, text, sl, tl);
  let last = { status: 0, code: 'TL_UPSTREAM', error: 'Google 翻译不可达' };
  for (let i = 0; i < n; i++) {
    let res;
    try {
      res = await fetchTimeout(req.url, req.init, TIMEOUT);
    } catch (e) {
      last = { status: 0, code: 'TL_TIMEOUT', error: '连接 Google 翻译超时（' + (e && e.message) + '）' };
      if (i < n - 1) await sleep(3000 * (i + 1));
      continue;
    }
    const parsed = await readUpstream(res);
    if (parsed.status === 429 || parsed.status >= 500 || !parsed.json) {
      last = {
        status: parsed.status,
        code: parsed.status === 429 ? 'TL_429' : 'TL_UPSTREAM',
        error: 'Google 翻译返回 HTTP ' + parsed.status,
      };
      if (i < n - 1) await sleep(3000 * (i + 1));
      continue;
    }
    if (parsed.status !== 200) {
      last = { status: parsed.status, code: 'TL_UPSTREAM', error: 'Google 翻译返回 HTTP ' + parsed.status };
      break;
    }
    const translated = extractText(parsed.json);
    if (!translated.trim()) {
      last = { status: 200, code: 'TL_SHAPE', error: 'Google 翻译返回结构异常（取不到译文）' };
      break;
    }
    return { ok: true, text: translated, status: 200, via: up.id };
  }
  return { ok: false, err: Object.assign({ via: up.id }, last) };
}

/** 主通道（relay）失败时退避 3 次；备份通道只探一次，避免整体拖太久 */
async function translateOnce(text, sl, tl) {
  let last = null;
  for (let i = 0; i < UPSTREAMS.length; i++) {
    const r = await callGoogle(UPSTREAMS[i], text, sl, tl, i === 0 ? 3 : 1);
    if (r.ok) return r;
    last = r.err;
  }
  return { ok: false, err: last };
}

/**
 * 批量翻译：整批用 \n 拼接一次请求，按返回换行对齐；
 * 对齐失败才逐句补请求（保证句序绝不串行错位）。
 * 整批请求本身失败时直接返回真实错误，不做 40 次无效重试。
 */
async function translateMany(lines, sl, tl) {
  if (lines.length === 1) {
    const r = await translateOnce(lines[0], sl, tl);
    return r.ok ? { ok: true, items: [r.text.trim()] } : { ok: false, err: r.err };
  }

  const batch = await translateOnce(lines.join('\n'), sl, tl);
  if (batch.ok) {
    const parts = batch.text.split('\n');
    while (parts.length > lines.length && parts[parts.length - 1].trim() === '') parts.pop();
    if (parts.length === lines.length) return { ok: true, items: parts.map((s) => s.trim()) };
  } else if (!batch.ok && batch.err && (batch.err.status === 0 || batch.err.status === 429 || batch.err.status >= 500)) {
    return { ok: false, err: batch.err };
  }

  // 逐句兜底（并发 4）
  const out = new Array(lines.length);
  let err = null;
  for (let i = 0; i < lines.length && !err; i += 4) {
    const chunk = lines.slice(i, i + 4);
    const rs = await Promise.all(chunk.map((t) => translateOnce(t, sl, tl)));
    for (let k = 0; k < rs.length; k++) {
      if (!rs[k].ok) {
        err = rs[k].err;
        break;
      }
      out[i + k] = rs[k].text.trim();
    }
  }
  return err ? { ok: false, err } : { ok: true, items: out };
}

function langCode(v, dflt) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return dflt;
  return /^[A-Za-z][A-Za-z0-9-]{1,9}$/.test(s) ? s : '';
}

/** GET ?selftest=1：逐个上游探测（单次，不重试，如实报状态码） */
async function selftest(env, request, url) {
  const tl = langCode(url.searchParams.get('tl'), 'zh-CN') || 'zh-CN';
  const sample = 'Hello, this is a subtitle translation self-test.';
  const results = [];
  for (const up of UPSTREAMS) {
    const t0 = Date.now();
    const r = await callGoogle(up, sample, 'auto', tl, 1);
    results.push(
      Object.assign(
        { upstream: up.id, url: up.url, ms: Date.now() - t0 },
        r.ok
          ? { ok: true, status: r.status, sample: r.text }
          : { ok: false, status: r.err.status, code: r.err.code, error: r.err.error }
      )
    );
  }
  const ok = results.some((r) => r.ok);
  return json(
    {
      tl,
      ok,
      note: ok ? '至少一个 Google 翻译上游可达，可以启用字幕翻译' : '全部上游不可达，前端不得启用字幕翻译',
      results,
    },
    200,
    env,
    request,
    { 'Cache-Control': 'no-store' }
  );
}

export async function handleTranslate(request, env, url) {
  if (request.method === 'GET') {
    if (url.searchParams.get('selftest') === '1') return await selftest(env, request, url);
    return fail('METHOD', '仅支持 POST；GET 只允许 ?selftest=1', 405, env, request);
  }
  if (request.method !== 'POST') return fail('METHOD', '仅支持 POST', 405, env, request);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return fail('BAD_JSON', '请求体不是合法 JSON', 400, env, request);
  }

  const q = body && body.q;
  if (!Array.isArray(q) || q.length === 0) {
    return fail('BAD_Q', 'q 必须是非空字符串数组', 400, env, request);
  }
  if (q.length > MAX_LINES) {
    return fail('TOO_MANY', '单次最多 ' + MAX_LINES + ' 句，本次 ' + q.length + ' 句', 400, env, request);
  }

  const tl = langCode(body.tl, 'zh-CN');
  const sl = langCode(body.sl, 'auto');
  if (!tl || !sl) return fail('BAD_LANG', '语种代码不合法（示例：auto / zh-CN / en）', 400, env, request);

  const lines = q.map((x) => String(x == null ? '' : x));
  const total = lines.reduce((n, s) => n + s.length, 0);
  if (total > MAX_CHARS) {
    return fail('TOO_LONG', '单次最多 ' + MAX_CHARS + ' 字符，本次 ' + total + ' 字符', 400, env, request);
  }

  // 按行查缓存（同句去重，避免一次请求里重复翻译）
  const uniq = [];
  const seen = new Set();
  const map = new Map(); // 原文 -> 译文
  let hits = 0;
  for (const line of lines) {
    if (!line.trim() || seen.has(line)) continue;
    seen.add(line);
    const key = 'tr:' + tl + ':' + (await sha1Hex(line));
    const cached = await kvGet(env, key);
    if (cached && typeof cached.t === 'string' && cached.t.trim()) {
      map.set(line, cached.t);
      hits++;
    } else {
      uniq.push({ line, key });
    }
  }

  if (uniq.length) {
    const r = await translateMany(uniq.map((u) => u.line), sl, tl);
    if (!r.ok) {
      const e = r.err || {};
      return fail(
        e.code || 'TL_FAIL',
        (e.error || '翻译失败') + (e.via ? '（通道：' + e.via + '）' : ''),
        e.status === 0 ? 504 : 502,
        env,
        request,
        {},
        { upstreamStatus: e.status || 0, via: e.via || '' }
      );
    }
    for (let i = 0; i < uniq.length; i++) {
      const t = r.items[i];
      if (!t) continue;
      map.set(uniq[i].line, t);
      await kvPut(env, uniq[i].key, { t, tl, at: Date.now() }, CACHE_TTL);
    }
  }

  const items = lines.map((line, i) => ({ i, t: line.trim() ? map.get(line) || '' : '' }));
  return json(
    { tl, sl, count: lines.length, cached: hits, items },
    200,
    env,
    request,
    { 'Cache-Control': 'no-store' }
  );
}
