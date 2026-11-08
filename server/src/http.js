/**
 * ============================================================
 * Nexus OS 26 · Worker 公共 HTTP 层
 * ------------------------------------------------------------
 * 统一：CORS 白名单 / JSON 信封 / 错误结构 / 上游超时 / 缓存头。
 * 所有新增接口（/api/bili/*、/api/news/*、/api/map/*、/api/weather/*）
 * 都从这里取工具，避免各写一套。
 *
 * CORS 白名单：wrangler.toml [vars] ALLOW_ORIGIN
 *   "*"                       → 允许所有来源（默认，兼容现有前端）
 *   "https://a.com,https://b" → 仅这些来源，命中时回显 Origin
 * ============================================================
 */

export function allowedOrigins(env) {
  return String((env && env.ALLOW_ORIGIN) || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function corsHeaders(env, request) {
  const list = allowedOrigins(env);
  const origin = request ? request.headers.get('Origin') || '' : '';
  let allow = '*';
  if (list.length && !list.includes('*')) {
    allow = origin && list.includes(origin) ? origin : list[0];
  }
  const h = {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AI-Key, X-Requested-With, X-Bili-Cookie, Range, X-N26-Token, X-N26-Admin',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type, X-Cache, X-Upstream-Status, ETag, X-Content-SHA256, Content-Disposition, Retry-After',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allow !== '*') h['Access-Control-Allow-Credentials'] = 'true';
  return h;
}

/** 成功信封：{ ok:true, code:0, data, ... } */
export function json(data, status = 200, env, request, extra = {}) {
  const headers = Object.assign(
    { 'Content-Type': 'application/json; charset=utf-8' },
    corsHeaders(env, request),
    extra
  );
  return new Response(JSON.stringify({ ok: true, code: 0, data }), { status, headers });
}

/** 失败信封：{ ok:false, code:'XXX', error:'人话', upstream? } */
export function fail(code, error, status = 502, env, request, extra = {}, upstream) {
  const body = { ok: false, code, error };
  if (upstream !== undefined) body.upstream = upstream;
  const headers = Object.assign(
    { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    corsHeaders(env, request),
    extra
  );
  return new Response(JSON.stringify(body), { status, headers });
}

/** 带超时的 fetch（Workers 的 fetch 默认可能挂很久，业务必须显式超时） */
export async function fetchTimeout(url, init, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, Object.assign({}, init || {}, { signal: ctl.signal }));
  } finally {
    clearTimeout(timer);
  }
}

/** 浏览器/边缘缓存头 */
export function cacheHeader(maxAge) {
  return { 'Cache-Control': 'public, max-age=' + Math.max(0, maxAge) };
}

/** 读 KV JSON（未绑定 KV 时静默跳过） */
export async function kvGet(env, key) {
  const ns = env.BILI_KV || env.MUSIC_KV || env.STORE_KV;
  if (!ns) return null;
  try {
    const raw = await ns.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export async function kvPut(env, key, value, ttl) {
  const ns = env.BILI_KV || env.MUSIC_KV || env.STORE_KV;
  if (!ns) return;
  try {
    await ns.put(key, JSON.stringify(value), ttl ? { expirationTtl: ttl } : undefined);
  } catch (e) {
    /* KV 抖动不影响主流程 */
  }
}

/** 上游响应统一解析（JSON / 文本 / 空） */
export async function readUpstream(res) {
  let text = '';
  try {
    text = await res.text();
  } catch (e) {
    /* ignore */
  }
  let jsonBody = null;
  try {
    jsonBody = JSON.parse(text);
  } catch (e) {
    /* 非 JSON */
  }
  return { status: res.status, json: jsonBody, text };
}
