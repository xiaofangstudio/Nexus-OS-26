/**
 * ============================================================
 * Nexus Cloud API v1 · 数据层
 * ------------------------------------------------------------
 * App / Release / Blob（KV 8MB 分片）/ 图标 / 截图 / 公开索引。
 * 只在 n26: 前缀下读写，从不触碰 store:* 与 acc:*。
 * ============================================================
 */

import { getJSON, putJSON, putBytes, getBytes, delBytes, delKey, LIMITS, nowISO } from './core.js';

/* ───────────── App ───────────── */

export async function getApp(env, appId) {
  return await getJSON(env, 'app:' + appId);
}

export async function saveApp(env, app) {
  app.updatedAt = nowISO();
  await putJSON(env, 'app:' + app.id, app);
  return app;
}

export async function listAppIds(env) {
  const ids = await getJSON(env, 'appidx', []);
  return Array.isArray(ids) ? ids : [];
}

export async function addAppId(env, appId) {
  const ids = await listAppIds(env);
  if (!ids.includes(appId)) ids.unshift(appId);
  await putJSON(env, 'appidx', ids);
}

export async function devAppCount(env, devId) {
  const ids = await getJSON(env, 'devidx:' + devId, []);
  return Array.isArray(ids) ? ids.length : 0;
}

export async function listDevAppIds(env, devId) {
  const ids = await getJSON(env, 'devidx:' + devId, []);
  return Array.isArray(ids) ? ids : [];
}

export async function addDevAppId(env, devId, appId) {
  const ids = await listDevAppIds(env, devId);
  if (!ids.includes(appId)) ids.unshift(appId);
  await putJSON(env, 'devidx:' + devId, ids);
}

/* ───────────── Release ───────────── */

export async function getRelease(env, releaseId) {
  return await getJSON(env, 'rel:' + releaseId);
}

export async function saveRelease(env, rel) {
  await putJSON(env, 'rel:' + rel.releaseId, rel);
  return rel;
}

export async function listReleaseIds(env, appId) {
  const ids = await getJSON(env, 'relidx:' + appId, []);
  return Array.isArray(ids) ? ids : [];
}

export async function addReleaseId(env, appId, releaseId) {
  const ids = await listReleaseIds(env, appId);
  ids.unshift(releaseId);
  await putJSON(env, 'relidx:' + appId, ids);
}

export async function listReleases(env, appId) {
  const ids = await listReleaseIds(env, appId);
  const out = await Promise.all(ids.map(id => getRelease(env, id)));
  return out.filter(Boolean);
}

/* ───────────── Blob（KV 分片） ───────────── */

export async function putBlob(env, releaseId, bytes) {
  const size = bytes.byteLength;
  const chunk = LIMITS.chunkBytes;
  const count = Math.ceil(size / chunk);
  const written = [];
  try {
    for (let i = 0; i < count; i++) {
      const part = bytes.subarray(i * chunk, Math.min(size, (i + 1) * chunk));
      const key = 'blob:' + releaseId + ':' + i;
      await putBytes(env, key, part);
      written.push(key);
    }
  } catch (e) {
    for (const key of written) await delBytes(env, key);
    throw e;
  }
  return count;
}

export async function getBlobRange(env, releaseId, chunks, start, end) {
  const chunk = LIMITS.chunkBytes;
  const first = Math.floor(start / chunk);
  const last = Math.floor((end - 1) / chunk);
  const idx = [];
  for (let i = first; i <= last; i++) idx.push(i);
  const parts = await Promise.all(idx.map(i => getBytes(env, 'blob:' + releaseId + ':' + i)));
  if (parts.some(p => !p)) return null;
  const sliceStart = start - first * chunk;
  const sliceEnd = sliceStart + (end - start);
  if (idx.length === 1) return new Uint8Array(parts[0], sliceStart, sliceEnd - sliceStart);
  const out = new Uint8Array(end - start);
  let pos = 0;
  for (let k = 0; k < parts.length; k++) {
    const buf = new Uint8Array(parts[k]);
    const from = k === 0 ? sliceStart : 0;
    const to = k === parts.length - 1 ? sliceEnd - (parts.length - 1) * chunk : buf.length;
    const piece = buf.subarray(from, to);
    out.set(piece, pos);
    pos += piece.length;
  }
  return out;
}

export async function deleteBlob(env, releaseId, chunks) {
  for (let i = 0; i < chunks; i++) await delBytes(env, 'blob:' + releaseId + ':' + i);
}

/* ───────────── 资源 ───────────── */

export async function saveIcon(env, appId, icon) {
  if (!icon) return;
  await putJSON(env, 'icon:' + appId, { mime: icon.mime, bytes: icon.bytes.length, b64: toBase64(icon.bytes), at: nowISO() });
}

export async function getIcon(env, appId) {
  const rec = await getJSON(env, 'icon:' + appId);
  if (!rec) return null;
  return { mime: rec.mime, bytes: fromBase64(rec.b64) };
}

export async function saveScreenshots(env, appId, shots) {
  for (let i = 0; i < LIMITS.screenshots; i++) {
    if (i < shots.length) {
      await putJSON(env, 'shot:' + appId + ':' + i, { mime: shots[i].mime, b64: toBase64(shots[i].bytes) });
    } else {
      await delKey(env, 'shot:' + appId + ':' + i);
    }
  }
}

export async function getScreenshot(env, appId, index) {
  const rec = await getJSON(env, 'shot:' + appId + ':' + index);
  if (!rec) return null;
  return { mime: rec.mime, bytes: fromBase64(rec.b64) };
}

function toBase64(u8) {
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ───────────── 公开索引（60 秒懒刷新） ───────────── */

export function ratingOf(app) {
  const count = app.ratingCount || 0;
  const sum = app.ratingSum || 0;
  return {
    avg: count ? Number((sum / count).toFixed(2)) : 0,
    count,
    dist: app.ratingDist || [0, 0, 0, 0, 0],
  };
}

export function appSummary(app) {
  const rel = app.latestReleaseId ? {
    releaseId: app.latestReleaseId,
    version: app.latestVersion,
    size: app.latestSize || 0,
    sha256: app.latestSha256 || '',
  } : {};
  return {
    id: app.id,
    name: app.name,
    subtitle: app.subtitle || '',
    developer: app.developerName || '',
    developerId: app.developerId || '',
    category: app.category || 'other',
    tags: app.tags || [],
    download_count: app.downloadCount || 0,
    latest_version: app.latestVersion || null,
    latest_version_id: app.latestReleaseId || null,
    releaseId: app.latestReleaseId || null,
    size: rel.size || 0,
    sha256: rel.sha256 || '',
    iconUrl: '/api/v1/apps/' + app.id + '/icon',
    rating: { avg: ratingOf(app).avg, count: ratingOf(app).count },
    published_at: app.publishedAt || null,
    channel: app.latestChannel || 'stable',
    // 仅用于服务端搜索，返回给客户端前会被 stripItem 去掉
    _desc: String(app.description || '').slice(0, 240),
  };
}

export function stripItem(item) {
  const o = Object.assign({}, item);
  delete o._desc;
  return o;
}

export async function publicIndex(env, force) {
  if (!force) {
    const cached = await getJSON(env, 'pub:index');
    if (cached && Array.isArray(cached.items) && Date.now() - cached.builtAt < 60000) return cached;
  }
  const ids = await listAppIds(env);
  const apps = (await Promise.all(ids.slice(0, 300).map(id => getApp(env, id)))).filter(a => a && a.status === 'published');
  const items = apps.map(appSummary);
  const idx = { builtAt: Date.now(), items };
  try { await putJSON(env, 'pub:index', idx); } catch (e) { /* 索引是缓存，写失败不影响响应 */ }
  return idx;
}

export async function invalidateIndex(env) {
  try { await delKey(env, 'pub:index'); } catch (e) { /* ignore */ }
}

/* ───────────── 下载计数（60 秒去抖） ───────────── */

export async function bumpDownload(env, appId, releaseId) {
  try {
    const key = 'dl:' + appId + ':' + releaseId;
    const last = await getJSON(env, key);
    if (last && Date.now() - last.at < 60000) return;
    await putJSON(env, key, { at: Date.now() });
    const app = await getApp(env, appId);
    if (app) {
      app.downloadCount = (app.downloadCount || 0) + 1;
      await saveApp(env, app);
    }
    const rel = await getRelease(env, releaseId);
    if (rel) {
      rel.downloadCount = (rel.downloadCount || 0) + 1;
      await putJSON(env, 'rel:' + releaseId, rel);
    }
    await invalidateIndex(env);
  } catch (e) { /* 计数失败不影响下载 */ }
}

/* ───────────── 评分 ───────────── */

export async function addRating(env, appId, stars, comment, author) {
  const app = await getApp(env, appId);
  if (!app) return null;
  const sum = (app.ratingSum || 0) + stars;
  const count = (app.ratingCount || 0) + 1;
  const dist = Array.isArray(app.ratingDist) ? app.ratingDist.slice() : [0, 0, 0, 0, 0];
  while (dist.length < 5) dist.push(0);
  dist[stars - 1] = (dist[stars - 1] || 0) + 1;
  app.ratingSum = sum;
  app.ratingCount = count;
  app.ratingDist = dist;
  await saveApp(env, app);

  const list = await getJSON(env, 'ratings:' + appId, []);
  const items = Array.isArray(list) ? list : [];
  items.unshift({
    ratingId: 'rt_' + Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4),
    stars, comment: comment || '', author: author || '匿名用户', createdAt: nowISO(),
  });
  if (items.length > 200) items.length = 200;
  await putJSON(env, 'ratings:' + appId, items);
  await invalidateIndex(env);
  return { summary: ratingOf(app), item: items[0] };
}

export async function ratingList(env, appId, limit) {
  const list = await getJSON(env, 'ratings:' + appId, []);
  const items = Array.isArray(list) ? list : [];
  return items.slice(0, limit || 20);
}
