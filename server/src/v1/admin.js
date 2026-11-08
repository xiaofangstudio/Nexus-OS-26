/**
 * ============================================================
 * Nexus Cloud API v1 · 审核 / 运营接口
 * ------------------------------------------------------------
 * X-N26-Admin 独立鉴权。
 * 开发者创建、审核通过/拒绝、下架/恢复、审计、统计、旧数据迁移。
 * ============================================================
 */

import {
  ApiError, json, readJSON, nowISO, clip, appendAudit, clientIP, compareSemver,
  rateLimitLocal, SCOPES, LIMITS, sha256Hex, CATEGORIES, APP_ID_RE, randHex, putBytes, listAudit,
} from './core.js';
import { requireAdmin, issueToken } from './auth.js';
import {
  getApp, saveApp, getRelease, saveRelease, listReleases, listReleaseIds,
  invalidateIndex, putBlob, addAppId, addDevAppId,
} from './data.js';
import { getJSON, putJSON } from './core.js';
import { serializeRelease } from './dev.js';
import { buildZip } from './zip.js';

/* ───────────── Webhook ───────────── */

async function hmacHex(secret, body) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 事件推送到开发者登记的 webhookUrl，失败静默（不阻塞审核响应） */
async function notifyWebhook(env, ctx, devId, event, data) {
  if (!devId) return;
  try {
    const dev = await getJSON(env, 'dev:' + devId);
    if (!dev || !dev.webhookUrl || !dev.webhookSecret) return;
    const body = JSON.stringify({ event, sentAt: nowISO(), data });
    const signature = 'sha256=' + await hmacHex(dev.webhookSecret, body);
    const task = fetch(dev.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-N26-Event': event, 'X-N26-Signature': signature },
      body,
    }).catch(() => null);
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(task);
    else await task;
  } catch (e) { /* 推送失败不影响主流程 */ }
}

/* ───────────── 开发者 ───────────── */

export async function adminCreateDeveloper(request, env) {
  requireAdmin(request, env);
  const body = await readJSON(request);
  const type = body.type === 'org' ? 'org' : 'personal';
  const name = clip(body.name, 60);
  if (!name) throw new ApiError('BAD_REQUEST', 400, 'name 不能为空');
  const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : ['*'];
  if (scopes.some(s => !SCOPES.includes(s))) {
    throw new ApiError('INVALID_SCOPE', 400, 'scopes 非法', { allowed: SCOPES });
  }

  const devId = 'dev_' + Math.random().toString(16).slice(2, 8) + Date.now().toString(16).slice(-6);
  const limit = Number.isInteger(body.appLimit) ? Math.min(Math.max(body.appLimit, 1), 500) : LIMITS.appsPerDev;
  const dev = {
    devId,
    type,
    name,
    email: clip(body.email, 120),
    status: 'active',
    appLimit: limit,
    webhookUrl: '',
    webhookSecret: '',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await putJSON(env, 'dev:' + devId, dev);
  const idx = await getJSON(env, 'devidx', []);
  const list = Array.isArray(idx) ? idx : [];
  list.unshift(devId);
  await putJSON(env, 'devidx', list);

  const { plain, rec } = await issueToken(env, devId, 'admin-issued', scopes);
  await appendAudit(env, {
    actor: { type: 'admin', id: 'admin' },
    action: 'developer.create',
    target: devId,
    ip: clientIP(request),
  });

  return json({
    developer: {
      devId, type, name,
      email: dev.email,
      status: 'active',
      appLimit: limit,
      webhookUrl: null,
      createdAt: dev.createdAt,
    },
    token: { tokenId: rec.tokenId, token: plain, name: 'admin-issued', scopes },
  }, 201);
}

export async function adminListDevelopers(request, env) {
  requireAdmin(request, env);
  const idx = await getJSON(env, 'devidx', []);
  const ids = Array.isArray(idx) ? idx : [];
  const devs = (await Promise.all(ids.map(id => getJSON(env, 'dev:' + id)))).filter(Boolean);
  return json({
    items: devs.map(d => ({
      devId: d.devId, type: d.type, name: d.name, email: d.email || '',
      status: d.status, appLimit: d.appLimit, webhookUrl: d.webhookUrl || null, createdAt: d.createdAt,
    })),
    total: devs.length,
  });
}

/* ───────────── 审核 ───────────── */

export async function adminListReviews(request, env, url) {
  requireAdmin(request, env);
  const status = url.searchParams.get('status') || 'pending';
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') || 20)));

  if (status === 'pending') {
    const queue = await getJSON(env, 'revq', []);
    const ids = Array.isArray(queue) ? queue : [];
    const items = [];
    for (const id of ids.slice((page - 1) * pageSize, page * pageSize)) {
      const rel = await getRelease(env, id);
      if (!rel) continue;
      const app = await getApp(env, rel.appId);
      items.push({
        releaseId: rel.releaseId,
        appId: rel.appId,
        appName: app ? app.name : '',
        developer: app ? (app.developerName || '') : '',
        version: rel.version,
        channel: rel.channel,
        size: rel.size,
        sha256: rel.sha256,
        fileCount: rel.fileCount,
        submittedAt: rel.submittedAt,
      });
    }
    return json({ items, page, page_size: pageSize, total: ids.length });
  }

  const appIds = await getJSON(env, 'appidx', []);
  const ids = Array.isArray(appIds) ? appIds : [];
  const all = [];
  for (const appId of ids) {
    for (const rel of await listReleases(env, appId)) {
      if (rel.review && rel.review.status === status) {
        all.push(Object.assign(serializeRelease(rel, false), {
          appId: rel.appId,
          review: rel.review,
        }));
      }
    }
  }
  return json({ items: all.slice((page - 1) * pageSize, page * pageSize), page, page_size: pageSize, total: all.length });
}

export async function adminApprove(request, env, releaseId, ctx) {
  const admin = requireAdmin(request, env);
  await rateLimitLocal('admin', admin.id + '|approve', 200, 60);

  const rel = await getRelease(env, releaseId);
  if (!rel) throw new ApiError('RELEASE_NOT_FOUND', 404, '版本不存在');
  if (rel.status !== 'pending') {
    throw new ApiError('REVIEW_CONFLICT', 409, `当前状态 ${rel.status} 不可审核`, { status: rel.status });
  }
  const app = await getApp(env, rel.appId);
  if (!app) throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');

  if (app.latestVersion && app.latestChannel === rel.channel && compareSemver(rel.version, app.latestVersion) <= 0 && rel.version !== app.latestVersion) {
    throw new ApiError('REVIEW_CONFLICT', 409, `已有更高版本 ${app.latestVersion} 在线，请先撤销或发布更高版本`);
  }

  let note = '';
  try { const b = await request.json(); note = clip(b && b.note, 500); } catch (e) { /* 可空 */ }

  // 同通道旧版本 → archived
  const siblings = await listReleases(env, rel.appId);
  for (const s of siblings) {
    if (s.releaseId !== releaseId && s.status === 'published' && s.channel === rel.channel) {
      s.status = 'archived';
      s.archivedAt = nowISO();
      await saveRelease(env, s);
    }
  }

  rel.status = 'published';
  rel.publishedAt = nowISO();
  rel.review = { status: 'approved', reason: note || null, reviewer: admin.id, submittedAt: rel.submittedAt || null, reviewedAt: nowISO() };
  await saveRelease(env, rel);

  app.status = 'published';
  app.latestVersion = rel.version;
  app.latestChannel = rel.channel;
  app.latestReleaseId = rel.releaseId;
  app.latestSize = rel.size;
  app.latestSha256 = rel.sha256;
  app.publishedAt = app.publishedAt || nowISO();
  app.unpublishedReason = null;
  if (!app.name && rel.manifest) app.name = rel.manifest.name;
  await saveApp(env, app);

  await removeFromQueue(env, releaseId);
  await invalidateIndex(env);
  await appendAudit(env, {
    actor: { type: 'admin', id: admin.id },
    action: 'review.approve',
    target: releaseId,
    reason: note || undefined,
    ip: clientIP(request),
  });
  await notifyWebhook(env, ctx, app.developerId, 'release.approved', {
    appId: rel.appId, releaseId, version: rel.version, channel: rel.channel, publishedAt: rel.publishedAt,
  });

  return json({ releaseId, appId: rel.appId, status: 'published', publishedAt: rel.publishedAt });
}

export async function adminReject(request, env, releaseId, ctx) {
  const admin = requireAdmin(request, env);
  const body = await readJSON(request);
  const reason = clip(body.reason, 500);
  if (!reason) throw new ApiError('REJECT_REASON_REQUIRED', 400, '拒绝必须填写 reason');

  const rel = await getRelease(env, releaseId);
  if (!rel) throw new ApiError('RELEASE_NOT_FOUND', 404, '版本不存在');
  if (rel.status !== 'pending') {
    throw new ApiError('REVIEW_CONFLICT', 409, `当前状态 ${rel.status} 不可审核`, { status: rel.status });
  }

  rel.status = 'rejected';
  rel.review = { status: 'rejected', reason, reviewer: admin.id, submittedAt: rel.submittedAt || null, reviewedAt: nowISO() };
  await saveRelease(env, rel);
  await removeFromQueue(env, releaseId);
  await appendAudit(env, {
    actor: { type: 'admin', id: admin.id },
    action: 'review.reject',
    target: releaseId,
    reason,
    ip: clientIP(request),
  });
  const app = await getApp(env, rel.appId);
  await notifyWebhook(env, ctx, app && app.developerId, 'release.rejected', {
    appId: rel.appId, releaseId, version: rel.version, reason,
  });

  return json({ releaseId, status: 'rejected', reason });
}

async function removeFromQueue(env, releaseId) {
  const queue = await getJSON(env, 'revq', []);
  const list = Array.isArray(queue) ? queue : [];
  const i = list.indexOf(releaseId);
  if (i >= 0) { list.splice(i, 1); await putJSON(env, 'revq', list); }
}

/* ───────────── 下架 / 恢复 ───────────── */

export async function adminTakedown(request, env, appId, ctx) {
  const admin = requireAdmin(request, env);
  const body = await readJSON(request);
  const reason = clip(body.reason, 500);
  if (!reason) throw new ApiError('REJECT_REASON_REQUIRED', 400, '下架必须填写 reason');

  const app = await getApp(env, appId);
  if (!app) throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');

  for (const rel of await listReleases(env, appId)) {
    if (rel.status === 'published') {
      rel.status = 'archived';
      rel.archivedAt = nowISO();
      await saveRelease(env, rel);
    }
  }

  app.status = 'unpublished';
  app.unpublishedReason = reason;
  app.unpublishedAt = nowISO();
  await saveApp(env, app);
  await invalidateIndex(env);
  await appendAudit(env, {
    actor: { type: 'admin', id: admin.id },
    action: 'app.takedown',
    target: appId,
    reason,
    ip: clientIP(request),
  });
  await notifyWebhook(env, ctx, app.developerId, 'app.takedown', { appId, reason });

  return json({ appId, status: 'unpublished', reason });
}

export async function adminRestore(request, env, appId) {
  const admin = requireAdmin(request, env);
  const app = await getApp(env, appId);
  if (!app) throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');
  if (app.status === 'published') throw new ApiError('REVIEW_CONFLICT', 409, '应用已处于上架状态');

  const rels = await listReleases(env, appId);
  const latestPublished = rels.filter(r => r.status === 'archived').sort((a, b) => compareSemver(b.version, a.version))[0];
  if (!latestPublished) throw new ApiError('REVIEW_CONFLICT', 409, '没有任何可恢复的已发布版本，请先发布新版本');

  latestPublished.status = 'published';
  latestPublished.publishedAt = latestPublished.publishedAt || nowISO();
  await saveRelease(env, latestPublished);

  app.status = 'published';
  app.latestVersion = latestPublished.version;
  app.latestChannel = latestPublished.channel;
  app.latestReleaseId = latestPublished.releaseId;
  app.latestSize = latestPublished.size;
  app.latestSha256 = latestPublished.sha256;
  app.unpublishedReason = null;
  await saveApp(env, app);
  await invalidateIndex(env);
  await appendAudit(env, { actor: { type: 'admin', id: admin.id }, action: 'app.restore', target: appId, ip: clientIP(request) });

  return json({ appId, status: 'published', version: latestPublished.version });
}

/* ───────────── 审计 / 统计 ───────────── */

export async function adminAuditLogs(request, env, url) {
  requireAdmin(request, env);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));
  const action = url.searchParams.get('action');
  const actor = url.searchParams.get('actor');
  let items = await listAudit(env, 1000);
  if (action) items = items.filter(e => e.action === action);
  if (actor) items = items.filter(e => e.actor && e.actor.id === actor);
  return json({ items: items.slice(0, limit), total: items.length });
}

/* ───────────── 旧市场迁移（只读 store:*，写入 n26:*） ───────────── */

const LEGACY_DEV_ID = 'dev_legacy';

function legacyAppId(kind, legacyId) {
  const base = ('legacy-' + kind + '-' + String(legacyId))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
  return base.length >= 3 ? base : 'legacy-' + kind + '-' + randHex(4);
}

function legacyPackFiles(pkg) {
  const files = pkg && pkg.files && typeof pkg.files === 'object' ? pkg.files : {};
  const out = [];
  for (const [rawName, content] of Object.entries(files)) {
    const name = String(rawName).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!name || name.includes('..') || name.length > 200) continue;
    out.push({ name, bytes: new TextEncoder().encode(String(content)) });
    if (out.length >= 600) break;
  }
  return out;
}

export async function adminMigrateLegacy(request, env, ctx) {
  const admin = requireAdmin(request, env);
  let body = {};
  try { body = await readJSON(request); } catch (e) { body = {}; }
  const dryRun = body.dryRun === undefined ? true : !!body.dryRun;

  if (!dryRun) {
    let dev = await getJSON(env, 'dev:' + LEGACY_DEV_ID);
    if (!dev) {
      dev = {
        devId: LEGACY_DEV_ID, type: 'org', name: '旧市场迁移', email: '',
        status: 'active', appLimit: 500, webhookUrl: '', webhookSecret: '',
        createdAt: nowISO(), updatedAt: nowISO(),
      };
      await putJSON(env, 'dev:' + dev.devId, dev);
      const devIdx = await getJSON(env, 'devidx', []);
      const list = Array.isArray(devIdx) ? devIdx : [];
      if (!list.includes(LEGACY_DEV_ID)) { list.unshift(LEGACY_DEV_ID); await putJSON(env, 'devidx', list); }
    }
  }

  const scanned = {};
  const migrated = [];
  const skipped = [];

  for (const kind of ['app', 'plugin']) {
    const idx = await env.STORE_KV.get('store:idx:' + kind);
    const pend = await env.STORE_KV.get('store:pend:' + kind);
    const published = idx ? JSON.parse(idx) : [];
    const pending = pend ? JSON.parse(pend) : [];
    const ids = Array.from(new Set([...published, ...pending]));
    scanned[kind] = ids.length;

    for (const legacyId of ids) {
      const raw = await env.STORE_KV.get('store:pkg:' + kind + ':' + legacyId);
      if (!raw) { skipped.push({ kind, legacyId, why: '包不存在' }); continue; }
      let pkg;
      try { pkg = JSON.parse(raw); } catch (e) { skipped.push({ kind, legacyId, why: '包不是合法 JSON' }); continue; }

      const meta = (pkg && pkg.meta) || pkg || {};
      const appId = legacyAppId(kind, legacyId);
      if (!APP_ID_RE.test(appId)) { skipped.push({ kind, legacyId, why: '无法生成合法 appId' }); continue; }
      if (await getApp(env, appId)) { skipped.push({ kind, legacyId, appId, why: 'appId 已存在' }); continue; }

      const version = String(meta.version || '1.0.0').replace(/[^\w.\-]/g, '').slice(0, 20) || '1.0.0';
      const releaseId = appId + '@' + version;
      const isPublished = published.includes(legacyId);
      const files = legacyPackFiles(pkg);
      const manifest = {
        id: appId,
        name: String(meta.name || appId).slice(0, 60),
        version,
        entry: String(meta.entry || 'index.html').replace(/\\/g, '/').replace(/^\/+/, '') || 'index.html',
        category: CATEGORIES.includes(meta.category) ? meta.category : (kind === 'plugin' ? 'tools' : 'other'),
        description: String(meta.desc || '').slice(0, 500),
        permissions: [],
        legacy: { kind, id: legacyId },
      };
      const zipBytes = files.length ? buildZip([
        { name: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) },
        ...files,
      ]) : null;

      const plan = {
        kind, legacyId, appId, releaseId, name: manifest.name,
        version, fileCount: files.length, size: zipBytes ? zipBytes.length : 0,
        status: isPublished ? 'published' : 'draft',
      };
      if (dryRun) { migrated.push(plan); continue; }
      if (!zipBytes || zipBytes.length > LIMITS.packageBytes) {
        skipped.push({ kind, legacyId, appId, why: zipBytes ? '包超过 64MB' : '无可迁移文件' });
        continue;
      }

      const sha256 = await sha256Hex(zipBytes);
      const chunks = await putBlob(env, releaseId, zipBytes);
      const now = nowISO();
      const app = {
        id: appId,
        name: manifest.name,
        subtitle: String(meta.subtitle || '').slice(0, 80),
        description: manifest.description,
        category: manifest.category,
        tags: Array.isArray(meta.tags) ? meta.tags.slice(0, 8).map(t => String(t).slice(0, 12)) : [],
        developerId: LEGACY_DEV_ID,
        developerName: String(meta.publisher || '匿名开发者').slice(0, 60),
        status: isPublished ? 'published' : 'draft',
        downloadCount: Number(pkg.downloads || pkg.downloadCount || 0) || 0,
        ratingSum: 0, ratingCount: 0, ratingDist: [0, 0, 0, 0, 0],
        createdAt: now, updatedAt: now,
        publishedAt: isPublished ? now : null,
      };
      if (isPublished) {
        app.latestVersion = version;
        app.latestChannel = 'stable';
        app.latestReleaseId = releaseId;
        app.latestSize = zipBytes.length;
        app.latestSha256 = sha256;
      }
      await saveApp(env, app);
      await addAppId(env, appId);
      await addDevAppId(env, LEGACY_DEV_ID, appId);

      const rel = {
        releaseId, appId, version, channel: 'stable',
        status: isPublished ? 'published' : 'draft',
        size: zipBytes.length, sha256, chunks, fileCount: files.length,
        format: 'zip', entry: manifest.entry, manifest,
        releaseNotes: '', forceUpdate: false,
        uploadedAt: now,
        submittedAt: isPublished ? now : null,
        publishedAt: isPublished ? now : null,
        review: isPublished
          ? { status: 'approved', reason: null, reviewer: 'migration', submittedAt: now, reviewedAt: now }
          : { status: 'draft', reason: null, reviewer: null, submittedAt: null, reviewedAt: null },
      };
      await saveRelease(env, rel);
      const relIdx = await getJSON(env, 'relidx:' + appId, []);
      const relList = Array.isArray(relIdx) ? relIdx : [];
      if (!relList.includes(releaseId)) { relList.unshift(releaseId); await putJSON(env, 'relidx:' + appId, relList); }

      migrated.push(plan);
    }
  }

  if (!dryRun) {
    await invalidateIndex(env);
    await appendAudit(env, {
      actor: { type: 'admin', id: admin.id },
      action: 'legacy.migrate',
      target: 'store:*',
      ip: clientIP(request),
      details: { scanned, migrated: migrated.length, skipped: skipped.length },
    });
  }

  return json({ dryRun, scanned, migrated, skipped, note: dryRun ? 'dryRun 模式，未写入任何数据' : '已写入 n26:*，store:* 保持只读未改动' });
}

export async function adminStats(request, env) {
  requireAdmin(request, env);
  const devIdx = await getJSON(env, 'devidx', []);
  const appIdx = await getJSON(env, 'appidx', []);
  const devIds = Array.isArray(devIdx) ? devIdx : [];
  const appIds = Array.isArray(appIdx) ? appIdx : [];
  const apps = (await Promise.all(appIds.map(id => getApp(env, id)))).filter(Boolean);
  const queue = await getJSON(env, 'revq', []);
  let releases = 0, downloads = 0;
  for (const a of apps) {
    downloads += a.downloadCount || 0;
    releases += (await listReleaseIds(env, a.id)).length;
  }
  return json({
    apps: apps.length,
    published: apps.filter(a => a.status === 'published').length,
    draft: apps.filter(a => a.status === 'draft').length,
    unpublished: apps.filter(a => a.status === 'unpublished').length,
    pending: Array.isArray(queue) ? queue.length : 0,
    developers: devIds.length,
    releases,
    downloads,
  });
}
