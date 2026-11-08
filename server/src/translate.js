/**
 * ============================================================
 * Nexus OS 26 · 字幕翻译中转（/api/translate）
 * ------------------------------------------------------------
 * 浏览器 → 本 Worker → 翻译通道，补 CORS 并缓存。
 * 主通道：Cloudflare Workers AI（@cf/meta/m2m100-1.2b，逐句对齐）；
 * 备通道：Google 翻译（translate.goog 中转 + 直连，429 时退避）。
 *
 * 接口：
 *   POST /api/translate
 *     body: { q: string[], sl?: 'auto', tl?: 'zh-CN' }
 *     resp: { ok:true, code:0, data:{ tl, sl, count, cached, items:[{i,t}] } }
 *   限制：单次 ≤40 句、总字符 ≤2000；按行缓存 tr:<tl>:<sha1> 30 天。
 *   失败一律返回真实上游错误，**绝不回填原文冒充译文**。
 *
 *   GET /api/translate?selftest=1 —— 探测 AI + 各 Google 上游，返回真实状态码
 *   GET /api/translate?probe=ai    —— Workers AI 单次探针（model/sl/tl/text 可调）
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

/* ---------------- Workers AI 主通道 ---------------- */
const AI_MODEL = '@cf/meta/m2m100-1.2b';
const AI_CONCURRENCY = 12;
/* m2m100 支持的语言代码（实测传 'auto' 会 8006 参数错误，必须给具体语种） */
const MM_LANGS = new Set(
  ('af am ar ast az ba be bg bn br bs ca ceb cs cy da de el en es et fa ff fi fr fy ga gd gl gu ha he hi hr ht hu hy id ig ilo is it ja jv ka kk km kn ko lb lg ln lo lt lv mg mk ml mn mr ms my ne nl no ns oc or pa pl ps pt ro ru sd si sk sl so sq sr ss su sv sw ta th tl tn tr uk ur uz vi wo xh yi yo zh zu').split(' ')
);

function aiLang(code) {
  const s = String(code == null ? '' : code).trim().toLowerCase();
  if (!s) return '';
  const base = s.split('-')[0];
  return MM_LANGS.has(base) ? base : '';
}

/** sl=auto 时的轻量语种猜测（假名/谚文/西里尔/阿拉伯/汉字/泰文，兜底英文） */
function guessLang(texts) {
  const s = texts.join(' ');
  if (/[\u3040-\u30ff]/.test(s)) return 'ja';
  if (/[\uac00-\ud7af]/.test(s)) return 'ko';
  if (/[\u0400-\u04ff]/.test(s)) return 'ru';
  if (/[\u0600-\u06ff]/.test(s)) return 'ar';
  if (/[\u0e00-\u0e7f]/.test(s)) return 'th';
  if (/[\u4e00-\u9fff]/.test(s)) return 'zh';
  return 'en';
}

function withTimeout(p, ms) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Workers AI 超时（' + ms + 'ms）')), ms)),
  ]);
}

/** 单句走 Workers AI：参数错误/模型下线不重试，其余最多 2 次 */
async function callAI(env, text, sl, tl) {
  let last = { status: 502, code: 'AI_FAIL', error: 'Workers AI 不可用' };
  for (let i = 0; i < 2; i++) {
    try {
      const out = await withTimeout(
        env.AI.run(AI_MODEL, { text, source_lang: sl, target_lang: tl }),
        20000
      );
      const t = String((out && (out.translated_text || out.response || out.text)) || '').trim();
      if (!t) {
        last = { status: 502, code: 'AI_EMPTY', error: 'Workers AI 返回空译文' };
        break;
      }
      return { ok: true, text: t, via: 'workers-ai', usage: (out && out.usage) || null };
    } catch (e) {
      const msg = (e && (e.message || e.toString())) || '未知错误';
      last = { status: 502, code: 'AI_FAIL', error: 'Workers AI 翻译失败：' + msg };
      if (/Invalid data|deprecated|not found|No such|8006|5028|5016/.test(msg)) break;
      if (i < 1) await sleep(1000 * (i + 1));
    }
  }
  return { ok: false, err: Object.assign({ via: 'workers-ai' }, last) };
}

/**
 * Workers AI 逐句翻译（m2m100 不用 \n 对齐：实测换行会被吞，分隔符会丢句）。
 * 返回 null 表示当前场景不适用（未绑定 AI / 语种不支持），交给 Google 备通道。
 */
async function translateViaAI(env, lines, sl, tl) {
  if (!env || !env.AI || typeof env.AI.run !== 'function') return null;
  const T = aiLang(tl);
  if (!T) return null;
  const S = sl && sl !== 'auto' ? aiLang(sl) : guessLang(lines);
  if (!S) return null;
  if (S === T) return { ok: true, items: lines.slice() };

  const out = new Array(lines.length);
  let err = null;
  for (let i = 0; i < lines.length && !err; i += AI_CONCURRENCY) {
    const chunk = lines.slice(i, i + AI_CONCURRENCY);
    const rs = await Promise.all(chunk.map((t) => callAI(env, t, S, T)));
    for (let k = 0; k < rs.length; k++) {
      if (!rs[k].ok) {
        err = rs[k].err;
        break;
      }
      out[i + k] = rs[k].text;
    }
  }
  return err ? { ok: false, err } : { ok: true, items: out };
}

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

/** GET ?probe=ai：Workers AI 翻译探针（可传 model/sl/tl/text，记录真实响应/耗时） */
async function probeAI(env, request, url) {
  const q = (url && url.searchParams) || new URLSearchParams();
  const model = q.get('model') || '@cf/meta/m2m100-1.2b';
  const sl = q.get('sl') || 'en';
  const tl = q.get('tl') || 'zh';
  const text = q.get('text') || 'Hello, this is a subtitle translation self-test.';
  if (!env || !env.AI || typeof env.AI.run !== 'function') {
    return fail('AI_NOT_BOUND', '当前 Worker 未绑定 Workers AI（缺少 [ai] binding = "AI"）', 503, env, request);
  }
  const isM2m = model.indexOf('m2m100') >= 0;
  const input = isM2m
    ? { text, source_lang: sl, target_lang: tl }
    : {
        messages: [
          { role: 'system', content: 'You are a subtitle translator. Translate each line separately and keep the same number of lines.' },
          { role: 'user', content: 'Translate to ' + tl + ':\n' + text },
        ],
        max_tokens: 1024,
      };
  const t0 = Date.now();
  try {
    const out = await env.AI.run(model, input);
    const translated = (out && (out.translated_text || out.response || out.text)) || '';
    return json(
      {
        ok: !!String(translated).trim(),
        model,
        sl,
        tl,
        ms: Date.now() - t0,
        sample: text,
        translated,
        usage: (out && out.usage) || null,
        raw: out,
        note: 'usage.neurons 为本次实际消耗；是否落在免费额度取决于账号计划',
      },
      200,
      env,
      request,
      { 'Cache-Control': 'no-store' }
    );
  } catch (e) {
    return fail(
      'AI_FAIL',
      'Workers AI 调用失败：' + ((e && (e.message || e.toString())) || '未知错误'),
      502,
      env,
      request,
      { ms: Date.now() - t0, model, sl, tl, raw: e && e.toString ? e.toString() : '' }
    );
  }
}

/** GET ?selftest=1：探测 Workers AI + 各 Google 上游（单次，不重试，如实报状态码） */
async function selftest(env, request, url) {
  const tl = langCode(url.searchParams.get('tl'), 'zh-CN') || 'zh-CN';
  const sample = 'Hello, this is a subtitle translation self-test.';
  const aiTl = aiLang(tl) || 'zh';
  const results = [];
  {
    const t0 = Date.now();
    if (env && env.AI && typeof env.AI.run === 'function') {
      try {
        const out = await withTimeout(
          env.AI.run(AI_MODEL, { text: sample, source_lang: 'en', target_lang: aiTl }),
          20000
        );
        const t = String((out && (out.translated_text || out.response || out.text)) || '').trim();
        results.push({
          upstream: 'workers-ai',
          model: AI_MODEL,
          ms: Date.now() - t0,
          ok: !!t,
          status: 200,
          sample: t,
          usage: (out && out.usage) || null,
        });
      } catch (e) {
        results.push({
          upstream: 'workers-ai',
          model: AI_MODEL,
          ms: Date.now() - t0,
          ok: false,
          status: 502,
          error: 'Workers AI 调用失败：' + ((e && (e.message || e.toString())) || '未知错误'),
        });
      }
    } else {
      results.push({ upstream: 'workers-ai', ok: false, status: 503, error: '未绑定 env.AI' });
    }
  }
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
      note: ok ? '至少一个翻译通道可达（优先 Workers AI）' : '全部翻译通道不可达，前端不得启用字幕翻译',
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
    if (url.searchParams.get('probe') === 'ai') return await probeAI(env, request, url);
    if (url.searchParams.get('selftest') === '1') return await selftest(env, request, url);
    return fail('METHOD', '仅支持 POST；GET 只允许 ?selftest=1 / ?probe=ai', 405, env, request);
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
    const texts = uniq.map((u) => u.line);
    const ai = await translateViaAI(env, texts, sl, tl);
    let r;
    if (ai && ai.ok) {
      r = ai;
    } else {
      const g = await translateMany(texts, sl, tl);
      r = g.ok ? g : ai && ai.err ? ai : g;
    }
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
