/**
 * ============================================================
 * Nexus Cloud API v1 · 公开接口
 * ------------------------------------------------------------
 * 列表 / 详情 / 版本 / 图标 / 截图 / 下载 / 分类。
 * 无需认证；只暴露 published / archived 的版本。
 * ============================================================
 */

import {
  ApiError, json, pagination, pageSlice, CATEGORIES, CATEGORY_LABELS, LIMITS,
  readJSON, rateLimitLocal, rateLimitKV, clientIP, clip, compareSemver,
} from './core.js';
import {
  getApp, publicIndex, getRelease, listReleases, getIcon, getScreenshot, bumpDownload, ratingOf,
  stripItem, addRating, ratingList, getBlobRange,
} from './data.js';
import { serializeRelease } from './dev.js';

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#12141a"/><path d="M40 88V40h20c12 0 20 8 20 20s-8 20-20 20H48" stroke="#6ee7ff" stroke-width="6" fill="none"/><circle cx="86" cy="88" r="6" fill="#6ee7ff"/></svg>`;

export async function listApps(request, env, url) {
  const p = pagination(url);
  const category = url.searchParams.get('category');
  if (category && !CATEGORIES.includes(category)) {
    throw new ApiError('INVALID_CATEGORY', 400, '分类不在枚举内', { category });
  }
  const sort = url.searchParams.get('sort') || 'hot';
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const channel = url.searchParams.get('channel') || 'stable';

  const idx = await publicIndex(env);
  let items = idx.items.slice();
  if (category) items = items.filter(a => a.category === category);
  if (channel === 'beta') items = items.filter(a => a.channel === 'beta' || a.channel === 'stable');
  if (q) {
    items = items.filter(a =>
      a.name.toLowerCase().includes(q)
      || (a.subtitle || '').toLowerCase().includes(q)
      || (a.tags || []).some(t => t.toLowerCase().includes(q)));
  }

  if (sort === 'new') items.sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
  else if (sort === 'rating') items.sort((a, b) => (b.rating.avg - a.rating.avg) || (b.rating.count - a.rating.count));
  else items.sort((a, b) => (b.download_count - a.download_count) || String(b.published_at || '').localeCompare(String(a.published_at || '')));

  return json({
    items: pageSlice(items, p).map(stripItem),
    page: p.page,
    page_size: p.pageSize,
    total: items.length,
  });
}

export async function getAppDetail(request, env, appId) {
  const app = await getApp(env, appId);
  if (!app || app.status !== 'published') throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');

  let latest = null;
  if (app.latestReleaseId) latest = await getRelease(env, app.latestReleaseId);

  const shots = [];
  const shotCount = (latest && latest.manifest && latest.manifest.screenshots) ? latest.manifest.screenshots.length : 0;
  for (let i = 0; i < Math.min(shotCount, LIMITS.screenshots); i++) {
    shots.push(`/api/v1/apps/${appId}/screenshots/${i}`);
  }

  return json({
    app: {
      id: app.id,
      name: app.name,
      subtitle: app.subtitle || '',
      developer: app.developerName || '',
      developerId: app.developerId,
      category: app.category,
      description: app.description || '',
      tags: app.tags || [],
      status: app.status,
      rating: ratingOf(app),
      download_count: app.downloadCount || 0,
      screenshots: shots,
      iconUrl: `/api/v1/apps/${appId}/icon`,
    },
    latest_version: latest ? serializeRelease(latest, false) : null,
    permissions: (latest && latest.manifest && latest.manifest.permissions) || [],
    minOsVersion: (latest && latest.manifest && latest.manifest.minOsVersion) || null,
    i18n: (latest && latest.manifest && latest.manifest.i18n) || {},
  });
}

export async function listVersions(request, env, appId) {
  const app = await getApp(env, appId);
  if (!app || app.status !== 'published') throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');
  const rels = (await listReleases(env, appId)).filter(r => r.status === 'published' || r.status === 'archived');
  return json({ appId, items: rels.map(r => serializeRelease(r, false)) });
}

export async function getAppIcon(request, env, appId) {
  const app = await getApp(env, appId);
  if (!app) throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');
  const icon = app.latestReleaseId ? await getIcon(env, app.latestReleaseId) : null;
  if (!icon) {
    return new Response(PLACEHOLDER_SVG, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  return binaryResponse(request, icon.bytes, icon.mime, 'public, max-age=31536000, immutable');
}

export async function getAppScreenshot(request, env, appId, index) {
  const app = await getApp(env, appId);
  if (!app) throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');
  const shot = app.latestReleaseId ? await getScreenshot(env, app.latestReleaseId, index) : null;
  if (!shot) throw new ApiError('ASSET_NOT_FOUND', 404, '截图不存在');
  return binaryResponse(request, shot.bytes, shot.mime, 'public, max-age=31536000, immutable');
}

/** 二进制响应：ETag + If-None-Match → 304 */
export async function binaryResponse(request, bytes, mime, cacheControl) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const etag = '"' + hex(digest).slice(0, 32) + '"';
  const inm = request.headers.get('If-None-Match');
  if (inm && inm === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': cacheControl } });
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
      ETag: etag,
      'Cache-Control': cacheControl,
      'X-Content-SHA256': hex(digest),
    },
  });
}

export function hex(buf) {
  const u8 = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, '0');
  return s;
}

/* ───────────── 下载 ───────────── */

export async function downloadRelease(request, env, releaseId) {
  const rel = await getRelease(env, releaseId);
  if (!rel || !['published', 'archived'].includes(rel.status)) {
    throw new ApiError('RELEASE_NOT_FOUND', 404, '版本不存在或未上架');
  }
  const app = await getApp(env, rel.appId);
  if (!app || app.status !== 'published') throw new ApiError('RELEASE_NOT_FOUND', 404, '应用已下架');

  const etag = '"' + rel.sha256 + '"';
  const inm = (request.headers.get('If-None-Match') || '').replace(/^W\//i, '').replace(/"/g, '').trim().toLowerCase();
  if (inm && inm === rel.sha256) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const total = Number(rel.size) || 0;
  const mime = rel.format === 'html' ? 'text/html; charset=utf-8' : 'application/zip';
  const ext = rel.format === 'html' ? 'html' : 'zip';
  const filename = `${rel.appId}-${rel.version}.${ext}`;
  const baseHeaders = {
    'Content-Type': mime,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Accept-Ranges': 'bytes',
    'X-Content-SHA256': rel.sha256,
    ETag: etag,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Security-Policy': "sandbox; default-src 'none'",
  };

  const rangeHeader = request.headers.get('Range');
  if (rangeHeader && total > 0) {
    const parsed = parseRange(rangeHeader, total);
    if (!parsed) {
      return json({ error: { code: 'RANGE_NOT_SATISFIABLE', message: 'Range 超出资源范围', details: { total } } }, 416, {
        'Content-Range': `bytes */${total}`,
        'Accept-Ranges': 'bytes',
        ETag: etag,
      });
    }
    const bytes = await getBlobRange(env, rel.releaseId, rel.chunks || 0, parsed.start, parsed.end + 1);
    if (!bytes) throw new ApiError('STORAGE_UNAVAILABLE', 503, '安装包数据不可读');
    bumpDownloadAsync(env, rel);
    return new Response(bytes, {
      status: 206,
      headers: Object.assign({}, baseHeaders, {
        'Content-Length': String(bytes.length),
        'Content-Range': `bytes ${parsed.start}-${parsed.end}/${total}`,
      }),
    });
  }

  const bytes = await assemble(env, rel);
  if (!bytes) throw new ApiError('STORAGE_UNAVAILABLE', 503, '安装包数据不可读');

  bumpDownloadAsync(env, rel);
  return new Response(bytes, {
    status: 200,
    headers: Object.assign({}, baseHeaders, { 'Content-Length': String(bytes.length) }),
  });
}

/** 解析单段 Range（多段返回 null → 416）；返回 { start, end }（inclusive） */
function parseRange(raw, total) {
  const m = /^bytes=(\d*)-(\d*)$/i.exec(String(raw).trim());
  if (!m) return null;
  const [, a, b] = m;
  if (!a && !b) return null;
  let start, end;
  if (!a) {
    const n = Number(b);
    if (!Number.isInteger(n) || n <= 0) return null;
    start = Math.max(0, total - n);
    end = total - 1;
  } else {
    start = Number(a);
    end = b ? Number(b) : total - 1;
    if (!Number.isInteger(start) || start < 0) return null;
    if (end >= total) end = total - 1;
  }
  if (start >= total || start > end) return null;
  return { start, end };
}

export async function assemble(env, rel) {
  const parts = await Promise.all(
    Array.from({ length: rel.chunks || 0 }, (_, i) => env.STORE_KV.get('n26:blob:' + rel.releaseId + ':' + i, { type: 'arrayBuffer' }))
  );
  if (parts.some(p => !p)) return null;
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { out.set(new Uint8Array(p), pos); pos += p.byteLength; }
  return out;
}

function bumpDownloadAsync(env, rel) {
  bumpDownload(env, rel.appId, rel.releaseId).catch(() => {});
}

/* ───────────── 分类 ───────────── */

export function listCategories() {
  return json({ items: CATEGORIES.map(id => ({ id, name: CATEGORY_LABELS[id] })) });
}

/* ───────────── 搜索 ───────────── */

export async function searchApps(request, env, url) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) throw new ApiError('QUERY_REQUIRED', 400, '搜索需要 q 参数');
  if (q.length > 80) throw new ApiError('BAD_REQUEST', 400, 'q 过长（≤80）');
  const category = url.searchParams.get('category');
  if (category && !CATEGORIES.includes(category)) throw new ApiError('INVALID_CATEGORY', 400, '分类不在枚举内');
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 10)));

  const ql = q.toLowerCase();
  const idx = await publicIndex(env);
  const hits = [];
  for (const a of idx.items) {
    if (category && a.category !== category) continue;
    let score = 0;
    let matched = '';
    const name = (a.name || '').toLowerCase();
    if (name === ql) { score = 1.4; matched = 'name'; }
    else if (name.startsWith(ql)) { score = 1.15; matched = 'name'; }
    else if (name.includes(ql)) { score = 1.0; matched = 'name'; }
    else if ((a.id || '').toLowerCase().includes(ql)) { score = 0.9; matched = 'id'; }
    else if ((a.tags || []).some(t => t.toLowerCase().includes(ql))) { score = 0.7; matched = 'tag'; }
    else if ((a.subtitle || '').toLowerCase().includes(ql)) { score = 0.5; matched = 'description'; }
    else if ((a._desc || '').toLowerCase().includes(ql)) { score = 0.4; matched = 'description'; }
    if (!score) continue;
    score += Math.min(0.2, (a.download_count || 0) / 10000);
    hits.push({ id: a.id, name: a.name, score: Number(score.toFixed(3)), matched });
  }
  hits.sort((x, y) => y.score - x.score);

  return json({ query: q, hits: hits.slice(0, limit), estimated_total: hits.length });
}

/* ───────────── 榜单 ───────────── */

export async function rankings(request, env, url) {
  const type = url.searchParams.get('type') || 'hot';
  if (!['hot', 'new', 'weekly', 'rating'].includes(type)) {
    throw new ApiError('BAD_REQUEST', 400, 'type 必须是 hot / new / weekly / rating');
  }
  const p = pagination(url);
  const idx = await publicIndex(env);
  let items = idx.items.slice();
  let period = 'all';
  let degraded = false;

  if (type === 'new') {
    period = 'latest';
    items.sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
  } else if (type === 'rating') {
    items.sort((a, b) => (b.rating.avg - a.rating.avg) || (b.rating.count - a.rating.count));
  } else if (type === 'weekly') {
    period = '7d';
    const cutoff = Date.now() - 7 * 86400000;
    const recent = items.filter(a => a.published_at && Date.parse(a.published_at) >= cutoff);
    if (recent.length < 3) { degraded = true; items.sort((a, b) => b.download_count - a.download_count); }
    else { items = recent.sort((a, b) => b.download_count - a.download_count); }
  } else {
    items.sort((a, b) => (b.download_count - a.download_count) || String(b.published_at || '').localeCompare(String(a.published_at || '')));
  }

  const out = { type, period, items: pageSlice(items, p).map(stripItem), page: p.page, page_size: p.pageSize };
  if (degraded) out.degraded = true;
  return json(out);
}

/* ───────────── 评分 ───────────── */

export async function getRatings(request, env, url, appId) {
  const app = await getApp(env, appId);
  if (!app || app.status !== 'published') throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)));
  return json({ appId, summary: ratingOf(app), items: await ratingList(env, appId, limit) });
}

export async function postRating(request, env, appId) {
  const ip = clientIP(request);
  rateLimitLocal('rating', ip + '|' + appId, 5, 3600);
  await rateLimitKV(env, 'rating', ip + '|' + appId, 5, 3600);

  const app = await getApp(env, appId);
  if (!app || app.status !== 'published') throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');

  const body = await readJSON(request);
  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new ApiError('INVALID_RATING', 400, 'stars 必须是 1–5 的整数');

  const comment = clip(body.comment, 500);
  const author = clip(body.author, 32) || '匿名用户';
  const r = await addRating(env, appId, stars, comment, author);
  if (!r) throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');
  return json({ ok: true, rating: r.summary, item: r.item }, 201);
}

/* ───────────── 更新检查 ───────────── */

export async function checkUpdate(request, env, url, appId) {
  const app = await getApp(env, appId);
  if (!app || app.status !== 'published') throw new ApiError('APP_NOT_FOUND', 404, '应用不存在或已下架');
  const channel = url.searchParams.get('channel') || 'stable';
  if (!['stable', 'beta'].includes(channel)) throw new ApiError('INVALID_CHANNEL', 400, 'channel 必须是 stable / beta');
  const current = clip(url.searchParams.get('current') || url.searchParams.get('version'), 32);

  const rels = (await listReleases(env, appId))
    .filter(r => r.status === 'published' && (r.channel === channel || (channel === 'beta' && r.channel === 'stable')))
    .sort((a, b) => compareSemver(b.version, a.version));
  const latest = rels[0];
  if (!latest) throw new ApiError('RELEASE_NOT_FOUND', 404, '该通道暂无可用版本');

  const available = current ? compareSemver(latest.version, current) > 0 : true;
  return json({
    appId,
    channel,
    installed_version: current || null,
    update_available: available,
    latest: {
      version: latest.version,
      releaseId: latest.releaseId,
      channel: latest.channel,
      size: latest.size,
      sha256: latest.sha256,
      release_notes: latest.releaseNotes || '',
      force_update: !!latest.forceUpdate,
      published_at: latest.publishedAt || null,
      download_url: '/api/v1/download/' + latest.releaseId,
    },
  });
}
