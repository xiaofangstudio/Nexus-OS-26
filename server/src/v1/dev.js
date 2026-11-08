/**
 * ============================================================
 * Nexus Cloud API v1 · 开发者接口
 * ------------------------------------------------------------
 * /dev/me、/dev/apps（CRUD）、/dev/apps/{id}/releases（上传）、
 * /dev/releases/{id}（详情 / 提交 / 撤回）、/dev/tokens。
 * 全部需要 n26_ Token；scope 细分。
 * ============================================================
 */

import {
  ApiError, json, readJSON, pagination, pageSlice, nowISO, clip, normalizeTagList,
  CATEGORIES, APP_ID_RE, SEMVER_RE, LIMITS, sha256Hex, rateLimitKV, getJSON, putJSON, appendAudit, clientIP,
} from './core.js';
import { requireDev, issueToken, listTokens, revokeToken } from './auth.js';
import { buildPackage } from './pkg.js';
import {
  getApp, saveApp, listAppIds, listDevAppIds, addAppId, addDevAppId, devAppCount,
  getRelease, saveRelease, listReleases, addReleaseId, listReleaseIds,
  putBlob, saveIcon, saveScreenshots, invalidateIndex,
} from './data.js';

/* ───────────── 序列化 ───────────── */

export function serializeRelease(rel, full) {
  const out = {
    version: rel.version,
    releaseId: rel.releaseId,
    channel: rel.channel,
    status: rel.status,
    size: rel.size,
    sha256: rel.sha256,
    fileCount: rel.fileCount,
    release_notes: rel.releaseNotes || '',
    force_update: !!rel.forceUpdate,
    uploaded_at: rel.uploadedAt,
    submitted_at: rel.submittedAt || null,
    published_at: rel.publishedAt || null,
  };
  if (full) {
    out.appId = rel.appId;
    out.format = rel.format;
    out.entry = rel.entry;
    out.manifest = rel.manifest;
    out.review = rel.review || null;
  } else if (rel.review && rel.review.status !== 'approved') {
    out.review = rel.review;
  }
  return out;
}

function serializeApp(app) {
  return {
    id: app.id,
    name: app.name,
    subtitle: app.subtitle || '',
    developer: app.developerName || '',
    developerId: app.developerId,
    category: app.category,
    tags: app.tags || [],
    description: app.description || '',
    status: app.status,
    latestVersion: app.latestVersion || null,
    latestChannel: app.latestChannel || null,
    downloadCount: app.downloadCount || 0,
    rating: { avg: app.ratingCount ? Number(((app.ratingSum || 0) / app.ratingCount).toFixed(2)) : 0, count: app.ratingCount || 0 },
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    publishedAt: app.publishedAt || null,
  };
}

async function loadOwnApp(env, appId, devId) {
  if (!APP_ID_RE.test(appId)) throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');
  const app = await getApp(env, appId);
  if (!app) throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');
  if (app.developerId !== devId) throw new ApiError('FORBIDDEN', 403, '无权操作该应用');
  return app;
}

/* ───────────── /dev/me ───────────── */

export async function getMe(request, env) {
  const { dev, token } = await requireDev(request, env, 'app:read');
  const apps = await devAppCount(env, dev.devId);
  return json({
    developer: {
      devId: dev.devId,
      type: dev.type,
      name: dev.name,
      email: dev.email || '',
      status: dev.status,
      appLimit: dev.appLimit || LIMITS.appsPerDev,
      webhookUrl: dev.webhookUrl || null,
      createdAt: dev.createdAt,
    },
    token: { tokenId: token.tokenId, name: token.name, scopes: token.scopes || [] },
    usage: { apps, appLimit: dev.appLimit || LIMITS.appsPerDev },
  });
}

export async function patchMe(request, env) {
  const { dev } = await requireDev(request, env, 'app:write');
  const body = await readJSON(request);
  if (body.name !== undefined) {
    const name = clip(body.name, 60);
    if (!name) throw new ApiError('BAD_REQUEST', 400, 'name 不能为空');
    dev.name = name;
  }
  if (body.email !== undefined) dev.email = clip(body.email, 120);
  if (body.webhookUrl !== undefined) {
    if (body.webhookUrl === null || body.webhookUrl === '') {
      dev.webhookUrl = '';
      dev.webhookSecret = '';
    } else {
      const u = String(body.webhookUrl);
      let parsed;
      try { parsed = new URL(u); } catch (e) { throw new ApiError('BAD_REQUEST', 400, 'webhookUrl 不是合法 URL'); }
      if (parsed.protocol !== 'https:') throw new ApiError('BAD_REQUEST', 400, 'webhookUrl 必须是 https');
      dev.webhookUrl = u.slice(0, 300);
      if (!dev.webhookSecret) dev.webhookSecret = (await sha256Hex(crypto.randomUUID() + Date.now())).slice(0, 32);
    }
  }
  dev.updatedAt = nowISO();
  await putJSON(env, 'dev:' + dev.devId, dev);
  await appendAudit(env, { actor: { type: 'developer', id: dev.devId }, action: 'dev.patch', target: dev.devId });
  return getMe(request, env);
}

/* ───────────── /dev/apps ───────────── */

export async function createApp(request, env) {
  const { dev } = await requireDev(request, env, 'app:write');
  const body = await readJSON(request);
  const appId = String(body.appId || body.id || '').trim();
  if (!APP_ID_RE.test(appId)) throw new ApiError('INVALID_APP_ID', 400, 'appId 必须是 3-64 位小写字母/数字/._-，且以字母或数字开头');
  const name = clip(body.name, 60);
  if (!name) throw new ApiError('BAD_REQUEST', 400, 'name 不能为空');
  if (await getApp(env, appId)) throw new ApiError('APP_EXISTS', 409, 'appId 已被占用');

  const limit = dev.appLimit || LIMITS.appsPerDev;
  if ((await devAppCount(env, dev.devId)) >= limit) {
    throw new ApiError('QUOTA_EXCEEDED', 429, `应用数量达到上限（${limit}）`, { limit });
  }

  const category = CATEGORIES.includes(String(body.category || '').toLowerCase())
    ? String(body.category).toLowerCase() : 'other';

  const app = {
    id: appId,
    name,
    subtitle: clip(body.subtitle, 80),
    developerId: dev.devId,
    developerName: clip(dev.name, 60),
    category,
    tags: normalizeTagList(body.tags, 8, 16),
    description: clip(body.description, 4000),
    status: 'draft',
    latestVersion: null,
    latestChannel: null,
    downloadCount: 0,
    ratingSum: 0,
    ratingCount: 0,
    ratingDist: [0, 0, 0, 0, 0],
    createdAt: nowISO(),
    updatedAt: nowISO(),
    publishedAt: null,
  };
  await saveApp(env, app);
  await addAppId(env, appId);
  await addDevAppId(env, dev.devId, appId);
  await appendAudit(env, { actor: { type: 'developer', id: dev.devId }, action: 'app.create', target: appId });

  return json({ app: serializeApp(app) }, 201);
}

export async function listMyApps(request, env, url) {
  const { dev } = await requireDev(request, env, 'app:read');
  const p = pagination(url);
  const status = url.searchParams.get('status');
  const ids = await listDevAppIds(env, dev.devId);
  const apps = (await Promise.all(ids.map(id => getApp(env, id)))).filter(Boolean);
  const filtered = status ? apps.filter(a => a.status === status) : apps;
  return json({
    items: pageSlice(filtered, p).map(serializeApp),
    page: p.page,
    page_size: p.pageSize,
    total: filtered.length,
  });
}

export async function getMyApp(request, env, appId) {
  const { dev } = await requireDev(request, env, 'app:read');
  const app = await loadOwnApp(env, appId, dev.devId);
  const rels = await listReleases(env, appId);
  return json({
    app: serializeApp(app),
    releases: rels.map(r => serializeRelease(r, true)),
  });
}

export async function patchApp(request, env, appId) {
  const { dev } = await requireDev(request, env, 'app:write');
  const app = await loadOwnApp(env, appId, dev.devId);
  const body = await readJSON(request);

  if (body.name !== undefined) {
    const name = clip(body.name, 60);
    if (!name) throw new ApiError('BAD_REQUEST', 400, 'name 不能为空');
    app.name = name;
  }
  if (body.subtitle !== undefined) app.subtitle = clip(body.subtitle, 80);
  if (body.description !== undefined) app.description = clip(body.description, 4000);
  if (body.category !== undefined) {
    const c = String(body.category).toLowerCase();
    if (!CATEGORIES.includes(c)) throw new ApiError('INVALID_CATEGORY', 400, '分类不在枚举内', { category: body.category });
    app.category = c;
  }
  if (body.tags !== undefined) app.tags = normalizeTagList(body.tags, 8, 16);
  if (body.developerName !== undefined) app.developerName = clip(body.developerName, 60) || app.developerName;

  await saveApp(env, app);
  await invalidateIndex(env);
  await appendAudit(env, { actor: { type: 'developer', id: dev.devId }, action: 'app.patch', target: appId });
  return json({ app: serializeApp(app) });
}

/* ───────────── 上传 ───────────── */

export async function uploadRelease(request, env, appId) {
  const { dev, token } = await requireDev(request, env, 'release:publish');
  const app = await loadOwnApp(env, appId, dev.devId);
  if (app.status === 'unpublished') throw new ApiError('APP_TAKEDOWN', 403, '应用已下架，禁止上传');

  await rateLimitKV(env, 'upload', token.tokenId, 10, 3600);

  const rels = await listReleaseIds(env, appId);
  if (rels.length >= LIMITS.releasesPerApp) {
    throw new ApiError('QUOTA_EXCEEDED', 429, `单应用版本数达到上限（${LIMITS.releasesPerApp}）`, { limit: LIMITS.releasesPerApp });
  }

  let form;
  try { form = await request.formData(); }
  catch (e) { throw new ApiError('BAD_REQUEST', 400, '请求不是合法 multipart/form-data'); }

  const file = form.get('file');
  const files = form.getAll('files');
  const manifestText = form.get('manifest') ? String(form.get('manifest')) : '';
  const channel = String(form.get('channel') || 'stable');
  if (!['stable', 'beta'].includes(channel)) throw new ApiError('INVALID_CHANNEL', 400, 'channel 必须是 stable / beta');
  const releaseNotes = clip(form.get('release_notes'), 1000);
  const forceUpdate = String(form.get('force_update') || '') === 'true';
  const versionFallback = form.get('version') ? String(form.get('version')).trim() : '';

  const pkg = await buildPackage({
    file: file && typeof file === 'object' ? file : null,
    files: files.filter(f => f && typeof f === 'object'),
    manifestText,
    appId,
    versionFallback,
    channel,
  });

  if (pkg.manifest.version.includes('-') && channel === 'stable') {
    throw new ApiError('INVALID_CHANNEL', 400, '预发布版本只能发布到 beta 通道');
  }

  const releaseId = appId + '@' + pkg.manifest.version;
  if (await getRelease(env, releaseId)) {
    throw new ApiError('VERSION_EXISTS', 409, `版本已存在：${releaseId}`, { releaseId });
  }

  const sha256 = await sha256Hex(pkg.bytes);
  const chunks = await putBlob(env, releaseId, pkg.bytes);

  const rel = {
    releaseId,
    appId,
    version: pkg.manifest.version,
    channel,
    status: 'draft',
    format: pkg.format,
    entry: pkg.entry,
    size: pkg.bytes.length,
    sha256,
    chunks,
    fileCount: pkg.fileCount,
    manifest: pkg.manifest,
    releaseNotes,
    forceUpdate,
    downloadCount: 0,
    uploadedAt: nowISO(),
    submittedAt: null,
    publishedAt: null,
    review: { status: 'draft', reason: null, reviewer: null, submittedAt: null, reviewedAt: null },
    storage: 'kv-chunks',
  };
  await saveRelease(env, rel);
  await addReleaseId(env, appId, releaseId);
  await saveIcon(env, releaseId, pkg.icon);
  await saveScreenshots(env, releaseId, pkg.screenshots);

  // 草稿上直接同步元数据，方便开发者先看到效果（不会改变已上架应用展示，直到发布）
  if (app.status === 'draft') {
    app.name = pkg.manifest.name || app.name;
    app.subtitle = pkg.manifest.subtitle || app.subtitle;
    app.category = pkg.manifest.category || app.category;
    app.tags = (pkg.manifest.tags && pkg.manifest.tags.length) ? pkg.manifest.tags : app.tags;
    app.description = pkg.manifest.description || app.description;
    await saveApp(env, app);
  }

  await appendAudit(env, {
    actor: { type: 'developer', id: dev.devId },
    action: 'release.upload',
    target: releaseId,
    ip: clientIP(request),
  });

  return json({
    release: serializeRelease(rel, true),
    manifest: pkg.manifest,
    warnings: pkg.warnings,
  }, 201);
}

/* ───────────── /dev/apps/{id}/releases ───────────── */

export async function listMyReleases(request, env, appId) {
  const { dev } = await requireDev(request, env, 'app:read');
  await loadOwnApp(env, appId, dev.devId);
  const rels = await listReleases(env, appId);
  return json({
    appId,
    items: rels.map(r => serializeRelease(r, false)),
  });
}

export async function getMyRelease(request, env, releaseId) {
  const { dev } = await requireDev(request, env, 'review:read');
  const rel = await getRelease(env, releaseId);
  if (!rel) throw new ApiError('RELEASE_NOT_FOUND', 404, '版本不存在');
  if (rel.appId) await loadOwnApp(env, rel.appId, dev.devId);
  return json({ release: serializeRelease(rel, true), review: rel.review || null });
}

/* ───────────── 提交 / 撤回 ───────────── */

export async function submitRelease(request, env, releaseId) {
  const { dev } = await requireDev(request, env, 'release:publish');
  const rel = await getRelease(env, releaseId);
  if (!rel) throw new ApiError('RELEASE_NOT_FOUND', 404, '版本不存在');
  const app = await loadOwnApp(env, rel.appId, dev.devId);
  if (app.status === 'unpublished') throw new ApiError('APP_TAKEDOWN', 403, '应用已下架，禁止提交');

  if (rel.status !== 'draft') {
    throw new ApiError('RELEASE_NOT_REVIEWABLE', 409, `当前状态 ${rel.status} 不可提交`, { status: rel.status });
  }

  await rateLimitKV(env, 'submit', dev.devId, 20, 86400);

  const queue = await getJSON(env, 'revq', []);
  const list = Array.isArray(queue) ? queue : [];
  if (list.length >= LIMITS.queueMax) throw new ApiError('REVIEW_QUEUE_FULL', 429, '待审队列已满，请稍后再试');
  if (!list.includes(releaseId)) list.push(releaseId);
  await putJSON(env, 'revq', list);

  let notes;
  try { const b = await request.json(); notes = clip(b && b.release_notes, 1000); }
  catch (e) { /* 允许空 body */ }

  rel.status = 'pending';
  rel.submittedAt = nowISO();
  if (notes) rel.releaseNotes = notes;
  rel.review = { status: 'pending', reason: null, reviewer: null, submittedAt: rel.submittedAt, reviewedAt: null };
  await saveRelease(env, rel);

  await appendAudit(env, {
    actor: { type: 'developer', id: dev.devId },
    action: 'release.submit',
    target: releaseId,
    ip: clientIP(request),
  });

  return json({ releaseId, status: 'pending', submittedAt: rel.submittedAt });
}

export async function withdrawRelease(request, env, releaseId) {
  const { dev } = await requireDev(request, env, 'release:publish');
  const rel = await getRelease(env, releaseId);
  if (!rel) throw new ApiError('RELEASE_NOT_FOUND', 404, '版本不存在');
  await loadOwnApp(env, rel.appId, dev.devId);

  if (rel.status !== 'pending') {
    throw new ApiError('RELEASE_NOT_REVIEWABLE', 409, `当前状态 ${rel.status} 不可撤回`, { status: rel.status });
  }

  const queue = await getJSON(env, 'revq', []);
  const list = Array.isArray(queue) ? queue : [];
  const i = list.indexOf(releaseId);
  if (i >= 0) { list.splice(i, 1); await putJSON(env, 'revq', list); }

  rel.status = 'draft';
  rel.submittedAt = null;
  rel.review = { status: 'draft', reason: null, reviewer: null, submittedAt: null, reviewedAt: null };
  await saveRelease(env, rel);

  await appendAudit(env, { actor: { type: 'developer', id: dev.devId }, action: 'release.withdraw', target: releaseId });
  return json({ releaseId, status: 'draft' });
}

/* ───────────── Token ───────────── */

export async function createToken(request, env) {
  const { dev } = await requireDev(request, env, 'app:write');
  const body = await readJSON(request);
  const name = clip(body.name, 40);
  if (!name) throw new ApiError('BAD_REQUEST', 400, 'Token 名称不能为空');
  const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : [];
  const allowed = ['app:read', 'app:write', 'release:publish', 'review:read', 'telemetry:write', '*'];
  if (!scopes.length || scopes.some(s => !allowed.includes(s))) {
    throw new ApiError('INVALID_SCOPE', 400, 'scopes 非法', { allowed });
  }
  const tokens = await listTokens(env, dev.devId);
  if (tokens.filter(t => !t.revokedAt).length >= 12) throw new ApiError('TOKEN_LIMIT', 429, 'Token 数量达到上限（12）');
  await rateLimitKV(env, 'token', dev.devId, 10, 86400);

  const { plain, rec } = await issueToken(env, dev.devId, name, scopes);
  await appendAudit(env, { actor: { type: 'developer', id: dev.devId }, action: 'token.create', target: rec.tokenId });

  return json({
    tokenId: rec.tokenId,
    token: plain,
    name,
    scopes,
    note: '完整 Token 只返回这一次，请立即保存',
  }, 201);
}

export async function getTokens(request, env) {
  const { dev } = await requireDev(request, env, 'app:read');
  return json({ items: await listTokens(env, dev.devId) });
}

export async function deleteToken(request, env, tokenId) {
  const { dev } = await requireDev(request, env, 'app:write');
  const rec = await revokeToken(env, dev.devId, tokenId);
  await appendAudit(env, { actor: { type: 'developer', id: dev.devId }, action: 'token.revoke', target: tokenId });
  return json({ ok: true, tokenId: rec.tokenId, revokedAt: rec.revokedAt });
}

/* 供 public 端点使用：判断某应用是否属于当前 Token（用于 unpublished 可见性） */
export async function ownedBy(env, appId, devId) {
  const app = await getApp(env, appId);
  return !!(app && app.developerId === devId);
}

export async function allAppIds(env) { return listAppIds(env); }
