/**
 * ============================================================
 * Nexus Cloud API v1 · 认证
 * ------------------------------------------------------------
 * 开发者 Token（n26_<32 hex>）：只存 sha256，scope 细粒度。
 * 管理员：X-N26-Admin，独立身份，不复用开发者 Token。
 * 与终端用户账号（acc:）完全隔离，不读写 acc:*。
 * ============================================================
 */

import { ApiError, sha256Hex, getJSON, putJSON, nowISO } from './core.js';

export const TOKEN_PREFIX = 'n26_';
export const TOKEN_RE = /^n26_[0-9a-f]{32}$/;

export function hasScope(scopes, need) {
  const list = Array.isArray(scopes) ? scopes : [];
  return list.includes('*') || list.includes(need);
}

export async function requireDev(request, env, scope) {
  const auth = request.headers.get('Authorization') || '';
  const headerToken = (/^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, '').trim() : '')
    || (request.headers.get('X-N26-Token') || '').trim();
  if (!headerToken) throw new ApiError('UNAUTHORIZED', 401, '缺少开发者 Token');
  if (!TOKEN_RE.test(headerToken)) throw new ApiError('UNAUTHORIZED', 401, 'Token 格式无效');

  const hash = await sha256Hex(headerToken);
  const rec = await getJSON(env, 'tok:' + hash);
  if (!rec) throw new ApiError('UNAUTHORIZED', 401, 'Token 无效');
  if (rec.revokedAt) throw new ApiError('TOKEN_REVOKED', 401, 'Token 已吊销');

  const dev = await getJSON(env, 'dev:' + rec.devId);
  if (!dev) throw new ApiError('UNAUTHORIZED', 401, '开发者不存在');
  if (dev.status !== 'active') throw new ApiError('FORBIDDEN', 403, '开发者账号已停用');

  if (scope && !hasScope(rec.scopes, scope)) {
    throw new ApiError('SCOPE_REQUIRED', 403, `需要 scope: ${scope}`, { required: scope, granted: rec.scopes || [] });
  }

  // lastUsedAt 节流写（5 分钟一次），避免每次请求都写 KV
  if (!rec.lastUsedAt || Date.now() - rec.lastUsedAt > 300000) {
    rec.lastUsedAt = Date.now();
    try { await putJSON(env, 'tok:' + hash, rec); } catch (e) { /* ignore */ }
  }

  return { dev, token: rec, tokenHash: hash };
}

export function requireAdmin(request, env) {
  // N26_ADMIN 优先（可为 v1 单独轮换），否则回退到既有 STORE_ADMIN
  const expect = String(env.N26_ADMIN || env.STORE_ADMIN || '').trim();
  if (!expect) throw new ApiError('ADMIN_LOCKED', 503, '服务端未配置 STORE_ADMIN，管理端已锁定');
  const got = String(request.headers.get('X-N26-Admin') || '').trim();
  if (!got || got !== expect) throw new ApiError('ADMIN_UNAUTHORIZED', 401, '管理员令牌无效');
  return { id: 'admin' };
}

export async function issueToken(env, devId, name, scopes) {
  const plain = TOKEN_PREFIX + (await sha256Hex(crypto.randomUUID() + Date.now())).slice(0, 32);
  const hash = await sha256Hex(plain);
  const rec = {
    tokenId: 'tk_' + hash.slice(0, 10),
    devId,
    name,
    scopes,
    createdAt: nowISO(),
    lastUsedAt: null,
    revokedAt: null,
  };
  await putJSON(env, 'tok:' + hash, rec);
  const idx = await getJSON(env, 'tokidx:' + devId, []);
  const list = Array.isArray(idx) ? idx : [];
  list.unshift(hash);
  await putJSON(env, 'tokidx:' + devId, list);
  return { plain, rec };
}

export async function revokeToken(env, devId, tokenId) {
  const idx = await getJSON(env, 'tokidx:' + devId, []);
  const hashes = Array.isArray(idx) ? idx : [];
  for (const h of hashes) {
    const rec = await getJSON(env, 'tok:' + h);
    if (!rec) continue;
    if (rec.tokenId !== tokenId) continue;
    if (rec.revokedAt) return rec;
    rec.revokedAt = nowISO();
    await putJSON(env, 'tok:' + h, rec);
    return rec;
  }
  throw new ApiError('NOT_FOUND', 404, 'Token 不存在');
}

export async function listTokens(env, devId) {
  const idx = await getJSON(env, 'tokidx:' + devId, []);
  const hashes = Array.isArray(idx) ? idx : [];
  const out = [];
  for (const h of hashes) {
    const rec = await getJSON(env, 'tok:' + h);
    if (!rec) continue;
    out.push({
      tokenId: rec.tokenId,
      prefix: rec.tokenId.slice(0, 5) + '…',
      name: rec.name,
      scopes: rec.scopes || [],
      createdAt: rec.createdAt,
      lastUsedAt: rec.lastUsedAt ? new Date(rec.lastUsedAt).toISOString() : null,
      revokedAt: rec.revokedAt || null,
    });
  }
  return out;
}
