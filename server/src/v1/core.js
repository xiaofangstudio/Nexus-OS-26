/**
 * ============================================================
 * Nexus Cloud API v1 · 公共层
 * ------------------------------------------------------------
 * 统一错误结构 { error: { code, message, details } }、
 * KV 读写、哈希、分页、审计、限流。
 * 键空间前缀 n26: —— 与 acc: / store: / music: 完全不重叠。
 * ============================================================
 */

const enc = new TextEncoder();

export const KV = 'n26:';
export const CATEGORIES = ['tools', 'games', 'media', 'productivity', 'social', 'education', 'system', 'demo', 'other'];
export const CATEGORY_LABELS = {
  tools: '工具', games: '游戏', media: '媒体', productivity: '效率',
  social: '社交', education: '教育', system: '系统', demo: '演示', other: '其他',
};
export const SCOPES = ['app:read', 'app:write', 'release:publish', 'review:read', 'telemetry:write', '*'];

export const LIMITS = {
  packageBytes: 64 * 1024 * 1024,
  unpackedBytes: 256 * 1024 * 1024,
  files: 800,
  manifestBytes: 64 * 1024,
  iconBytes: 512 * 1024,
  screenshotBytes: 2 * 1024 * 1024,
  screenshots: 8,
  chunkBytes: 8 * 1024 * 1024,
  appsPerDev: 50,
  releasesPerApp: 60,
  queueMax: 200,
};

export class ApiError extends Error {
  constructor(code, status, message, details) {
    super(message || code);
    this.code = code;
    this.status = status || 400;
    this.details = details || null;
  }
}

export function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {}),
  });
}

export function empty(status, headers) {
  return new Response(null, { status, headers: headers || {} });
}

/** 统一把 ApiError / 未知异常转成响应 */
export function toErrorResponse(e) {
  if (e instanceof ApiError) {
    return json({ error: { code: e.code, message: e.message, details: e.details } }, e.status, e.retryAfter ? { 'Retry-After': String(e.retryAfter) } : undefined);
  }
  return json({
    error: {
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
      details: { traceId: randHex(6), reason: String((e && e.message) || e).slice(0, 200) },
    },
  }, 500);
}

export function bad(code, message, details) { return new ApiError(code, 400, message, details); }
export function notFound(message) { return new ApiError('NOT_FOUND', 404, message || '资源不存在'); }

/* ───────────── 哈希 / 随机 / 时间 ───────────── */

export async function sha256Hex(input) {
  const data = typeof input === 'string' ? enc.encode(input) : input;
  const buf = await crypto.subtle.digest('SHA-256', data);
  const u8 = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < u8.length; i++) hex += u8[i].toString(16).padStart(2, '0');
  return hex;
}

export function randHex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  let hex = '';
  for (let i = 0; i < a.length; i++) hex += a[i].toString(16).padStart(2, '0');
  return hex;
}

export function nowISO() { return new Date().toISOString(); }

/* ───────────── KV ───────────── */

export function storage(env) {
  const ns = env && env.STORE_KV;
  if (!ns || typeof ns.get !== 'function') throw new ApiError('STORAGE_UNAVAILABLE', 503, '服务端未绑定 STORE_KV');
  return ns;
}

export async function getJSON(env, key, fallback) {
  try {
    const raw = await storage(env).get(KV + key);
    return raw == null ? (fallback === undefined ? null : fallback) : JSON.parse(raw);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    return fallback === undefined ? null : fallback;
  }
}

export async function putJSON(env, key, val, opts) {
  await storage(env).put(KV + key, JSON.stringify(val), opts || undefined);
}

export async function delKey(env, key) {
  await storage(env).delete(KV + key);
}

/** 二进制分片读写 */
export async function putBytes(env, key, bytes, opts) {
  await storage(env).put(KV + key, bytes, opts || undefined);
}
export async function getBytes(env, key) {
  try {
    return await storage(env).get(KV + key, { type: 'arrayBuffer' });
  } catch (e) {
    return null;
  }
}
export async function delBytes(env, key) {
  try { await storage(env).delete(KV + key); } catch (e) { /* ignore */ }
}

/** 追加式审计日志：一条一键（避免 KV 读改写竞态），按 ISO 时间倒序读取 */
export async function appendAudit(env, entry) {
  try {
    const rec = Object.assign({ auditId: 'au_' + randHex(5), at: nowISO() }, entry);
    await putJSON(env, 'audit:e:' + rec.at + ':' + rec.auditId, rec, { expirationTtl: 90 * 86400 });
    return rec;
  } catch (e) { return null; /* 审计失败不影响主流程 */ }
}

export async function listAudit(env, limit) {
  try {
    const res = await storage(env).list({ prefix: KV + 'audit:e:', limit: 1000 });
    const names = (res.keys || []).map(k => k.name.slice(KV.length));
    const items = (await Promise.all(names.map(n => getJSON(env, n)))).filter(Boolean);
    return items.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit || 200);
  } catch (e) { return []; }
}

/** KV 滚动窗口限流（低频接口用，如上传） */
export async function rateLimitKV(env, bucket, key, limit, windowSec) {
  const win = Math.floor(Date.now() / (windowSec * 1000));
  const k = `rl:${bucket}:${key}:${win}`;
  let cur = 0;
  try { cur = Number((await storage(env).get(KV + k)) || 0); } catch (e) { return; }
  if (cur >= limit) {
    const err = new ApiError('RATE_LIMITED', 429, '请求过于频繁，请稍后再试', { bucket, limit, windowSec });
    err.retryAfter = windowSec - Math.floor((Date.now() / 1000) % windowSec);
    throw err;
  }
  try { await storage(env).put(KV + k, String(cur + 1), { expirationTtl: windowSec * 2 }); } catch (e) { /* 计数失败放行 */ }
}

/** 进程内限流（高频、可容忍误差的接口用） */
const _buckets = new Map();
export function rateLimitLocal(bucket, key, limit, windowSec) {
  const win = Math.floor(Date.now() / (windowSec * 1000));
  const k = bucket + '|' + key + '|' + win;
  const cur = _buckets.get(k) || 0;
  if (cur >= limit) {
    const err = new ApiError('RATE_LIMITED', 429, '请求过于频繁，请稍后再试', { bucket, limit, windowSec });
    err.retryAfter = windowSec - Math.floor((Date.now() / 1000) % windowSec);
    throw err;
  }
  _buckets.set(k, cur + 1);
  if (_buckets.size > 2000) {
    const cutoff = win - 2;
    for (const kk of _buckets.keys()) {
      const parts = kk.split('|');
      if (Number(parts[2]) < cutoff) _buckets.delete(kk);
    }
  }
}

export function clientIP(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || request.headers.get('X-Real-IP')
    || '0.0.0.0';
}

/* ───────────── 请求解析 ───────────── */

export async function readJSON(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not object');
    return body;
  } catch (e) {
    throw new ApiError('INVALID_JSON', 400, '请求体不是合法 JSON 对象');
  }
}

export function queryInt(url, name, def, min, max) {
  const raw = url.searchParams.get(name);
  if (raw == null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    throw new ApiError('INVALID_PAGE', 400, `参数 ${name} 必须是 ${min}–${max} 的整数`);
  }
  return n;
}

export function pagination(url) {
  const page = queryInt(url, 'page', 1, 1, 100000);
  const pageSize = queryInt(url, 'page_size', 20, 1, 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pageSlice(items, p) {
  return items.slice(p.offset, p.offset + p.pageSize);
}

/* ───────────── 领域工具 ───────────── */

export const APP_ID_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;
export const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

export function parseReleaseId(raw) {
  const s = String(raw || '');
  const at = s.lastIndexOf('@');
  if (at <= 0 || at === s.length - 1) throw new ApiError('RELEASE_NOT_FOUND', 404, '版本不存在');
  const appId = s.slice(0, at);
  const version = s.slice(at + 1);
  if (!APP_ID_RE.test(appId) || !SEMVER_RE.test(version)) {
    throw new ApiError('RELEASE_NOT_FOUND', 404, '版本不存在');
  }
  return { appId, version, releaseId: appId + '@' + version };
}

export function compareSemver(a, b) {
  const pa = String(a).split('+')[0].split('-')[0].split('.').map(Number);
  const pb = String(b).split('+')[0].split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  const ra = String(a).includes('-'), rb = String(b).includes('-');
  if (ra && !rb) return -1;
  if (!ra && rb) return 1;
  return 0;
}

export function normalizeTagList(list, maxItems, maxLen) {
  if (!Array.isArray(list)) return [];
  return list.map(t => String(t).trim()).filter(Boolean).slice(0, maxItems).map(t => t.slice(0, maxLen));
}

export function clip(str, max) {
  return String(str == null ? '' : str).trim().slice(0, max);
}
