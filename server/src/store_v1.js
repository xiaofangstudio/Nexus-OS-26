/**
 * ============================================================
 * Nexus OS 26 · 开发者工坊 · HTML 应用发布 v1
 * ------------------------------------------------------------
 * 与旧市场（store.js, store:pkg:*）并行，不改变 Float 发布接口。
 *
 * KV：
 *   store:v1:app:<appId>                   应用（跨版本稳定）
 *   store:v1:rel:<appId>:<releaseId>       单次发布（含文件体）
 *   store:v1:pending                       [{appId,releaseId,at}]
 *   store:v1:idx                           已上架 appId 列表
 *   store:v1:pub:<publisherId>             某发布者的 appId 列表
 *
 * 接口（前缀 /api/store/v1）：
 *   POST /publish          提交新版本（无 appId 时创建）
 *   GET  /mine             提交人自查：草稿/待审/通过/驳回/下架 + 版本 + 驳回原因
 *   GET  /status           单应用状态（公开，返回审核原因）
 *   GET  /pending          管理端待审
 *   POST /review           管理端 approve / reject（驳回必须给原因）
 *   POST /unpublish        管理端下架
 *   POST /preview-token    签发预览令牌（HMAC，2 小时）
 *   GET  /release          用令牌或管理端读取完整文件
 *   GET  /raw/<appId>/<rel>/<path>   原始资源（正确 MIME + CSP sandbox）
 * ============================================================
 */

const KINDS = { htmlapp: 'htmlapp', app: 'htmlapp' };
const LIMITS = { bytes: 6 * 1024 * 1024, single: 1024 * 1024, files: 300, releases: 60 };
const TEXT_EXT = /\.(html?|css|js|mjs|json|md|txt|svg|csv|xml|webmanifest|map)$/i;
const BIN_EXT = /\.(png|jpe?g|webp|gif|ico|bmp|woff2?|ttf|otf)$/i;
const IMG_MIME = /^data:image\/(png|jpeg|jpg|webp|gif|bmp|x-icon|svg\+xml);base64,/i;
const FONT_MIME = /^data:(font\/(woff2?|ttf|otf)|application\/(font-woff2?|x-font-ttf|x-font-otf|vnd\.ms-fontobject));base64,/i;

const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml', md: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8', xml: 'application/xml; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8', map: 'application/json; charset=utf-8',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', ico: 'image/x-icon', bmp: 'image/bmp',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf'
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function kvOk(env) { return !!(env && env.STORE_KV && typeof env.STORE_KV.get === 'function'); }
async function kvGet(env, key, fallback) {
  try {
    const raw = await env.STORE_KV.get(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) { return fallback; }
}
async function kvPut(env, key, val) { await env.STORE_KV.put(key, JSON.stringify(val)); }

function adminOk(request, env) {
  const key = (request.headers.get('X-N26-Admin') || '').trim();
  const expect = String(env.STORE_ADMIN || '').trim();
  if (!expect) return { ok: false, status: 503, why: '服务端未配置 STORE_ADMIN，管理端已锁定' };
  return key.length > 0 && key === expect ? { ok: true } : { ok: false, status: 401, why: '管理令牌不对' };
}

const appKey = id => 'store:v1:app:' + id;
const relKey = (id, rid) => 'store:v1:rel:' + id + ':' + rid;
const pubKey = id => 'store:v1:pub:' + id;
const REL_ID = /^rel_[a-z0-9]{6,40}$/i;
const APP_ID = /^app_[a-z0-9]{6,40}$/i;
const PUB_ID = /^[a-z0-9_\-]{6,64}$/i;

function rid() {
  return 'rel_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}
function aid() {
  return 'app_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}
function extOf(p) { const m = String(p).match(/\.([a-z0-9]+)$/i); return m ? m[1].toLowerCase() : ''; }
function normPath(p) {
  const parts = [];
  String(p || '').replace(/\\/g, '/').split('/').forEach(seg => {
    if (!seg || seg === '.') return;
    if (seg === '..') parts.pop(); else parts.push(seg);
  });
  return parts.join('/');
}
function unsafe(p) {
  const s = String(p || '');
  return /^[a-zA-Z]:/.test(s) || s.startsWith('/') || s.includes('\\') || s.split('/').includes('..') || s.includes('\0');
}
function bytesOf(v) {
  if (typeof v === 'string') return v.length;
  if (v && typeof v.dataUrl === 'string') return Math.floor(v.dataUrl.length * 3 / 4);
  return 0;
}

/** 校验并规范化；失败返回 { error, code } */
function sanitize(body) {
  if (!body || typeof body !== 'object') return { error: '请求不是 JSON 对象', code: 'format' };
  const name = String(body.name || '').trim();
  if (name.length < 1 || name.length > 40) return { error: '名称需 1–40 字', code: 'format' };
  const desc = String(body.desc || '').trim().slice(0, 120);
  const version = String(body.version || '').trim();
  if (!/^\d+\.\d+\.\d+([\-+][\w.\-]+)?$/.test(version)) return { error: '版本号需形如 1.0.0', code: 'format' };
  const publisher = String(body.publisher || '匿名开发者').trim().slice(0, 30) || '匿名开发者';
  const publisherId = String(body.publisherId || '').trim();
  if (!PUB_ID.test(publisherId)) return { error: 'publisherId 不合法', code: 'format' };
  const entry = normPath(String(body.entry || 'index.html'));
  const category = String(body.category || '工具').trim().slice(0, 20);
  const icon = /^fa[a-z]?\s+fa-[\w\-]+$/i.test(String(body.icon || '')) ? String(body.icon) : 'fa-cube';
  const color = /^#[0-9a-fA-F]{6}$/.test(String(body.color || '')) ? String(body.color) : '#4A9BF5';
  const iconImage = String(body.iconImage || '');
  if (iconImage && !(IMG_MIME.test(iconImage) && iconImage.length < 400 * 1024)) {
    return { error: '图标需为 ≤ 300 KB 的图片 dataURL', code: 'format' };
  }
  const promo = (Array.isArray(body.promo) ? body.promo : []).slice(0, 3).map(s => String(s || ''));
  for (const p of promo) {
    if (!IMG_MIME.test(p) || p.length > LIMITS.single * 1.4) return { error: '宣传图需为 ≤ 1 MB 的图片 dataURL', code: 'size' };
  }

  const files = body.files && typeof body.files === 'object' ? body.files : null;
  if (!files) return { error: '包里没有任何文件', code: 'format' };
  const names = Object.keys(files);
  if (!names.length) return { error: '包里没有任何文件', code: 'format' };
  if (names.length > LIMITS.files) return { error: '文件数超过 ' + LIMITS.files + ' 个上限', code: 'size' };

  let total = 0;
  const clean = {};
  for (const p of names) {
    if (unsafe(p)) return { error: '路径不安全：' + p, code: 'path' };
    const path = normPath(p);
    const v = files[p];
    if (typeof v === 'string') {
      if (!TEXT_EXT.test(path)) return { error: '不支持的文件类型：' + path, code: 'format' };
      if (v.length > LIMITS.single) return { error: '单个资源超过 1 MB：' + path, code: 'size' };
      clean[path] = v;
      total += v.length;
    } else if (v && typeof v.dataUrl === 'string') {
      if (!BIN_EXT.test(path)) return { error: '不支持的文件类型：' + path, code: 'format' };
      const binOk = /\.(png|jpe?g|webp|gif|bmp|ico)$/i.test(path) ? IMG_MIME : FONT_MIME;
      if (!binOk.test(v.dataUrl)) return { error: '二进制资源编码不合法：' + path, code: 'format' };
      const size = bytesOf(v);
      if (size > LIMITS.single) return { error: '单个资源超过 1 MB：' + path, code: 'size' };
      clean[path] = { dataUrl: v.dataUrl, size: size };
      total += size;
    } else {
      return { error: '文件内容必须是文本或 dataURL：' + path, code: 'format' };
    }
    if (total > LIMITS.bytes) return { error: '应用包超过 6 MB 上限', code: 'size' };
  }
  if (!clean[entry]) return { error: '入口文件不在包里：' + entry, code: 'format' };
  if (!/\.html?$/i.test(entry)) return { error: '入口必须是 .html 文件', code: 'format' };

  return {
    meta: {
      name, desc, version, publisher, publisherId, entry, category, icon, color,
      iconImage, promo, bytes: total, fileCount: names.length,
      runtime: 'htmlapp', origin: 'devstudio'
    },
    files: clean
  };
}

/* ---------- 预览令牌：HMAC-SHA256(ACC_SECRET) ---------- */
function b64url(buf) {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmac(env, text) {
  const secret = String(env.ACC_SECRET || '');
  if (!secret) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}
async function makeToken(env, appId, releaseId, ttlMs) {
  const exp = Date.now() + (ttlMs || 2 * 3600 * 1000);
  const sig = await hmac(env, appId + '|' + releaseId + '|' + exp);
  return sig ? exp + '.' + sig : null;
}
async function verifyToken(env, appId, releaseId, token) {
  const m = String(token || '').match(/^(\d{10,16})\.([A-Za-z0-9_-]{20,})$/);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!exp || exp < Date.now()) return false;
  const sig = await hmac(env, appId + '|' + releaseId + '|' + exp);
  return !!sig && sig === m[2];
}

function statusOf(app, rel) {
  if (!app) return 'draft';
  if (app.status === 'offline') return 'offline';
  return (rel && rel.status) || app.status || 'draft';
}

/* ---------- 原始资源 ---------- */
function assetResponse(value, path, cacheOk) {
  const type = MIME[extOf(path)] || 'application/octet-stream';
  let body;
  if (typeof value === 'string') body = value;
  else if (value && typeof value.dataUrl === 'string') {
    const comma = value.dataUrl.indexOf(',');
    const b64 = comma >= 0 ? value.dataUrl.slice(comma + 1) : '';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    body = arr;
  } else {
    return json({ ok: false, error: 'asset type not supported' }, 400);
  }
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': cacheOk ? 'public, max-age=300' : 'no-store'
    }
  });
}

async function loadApp(env, appId) {
  if (!APP_ID.test(String(appId || ''))) return null;
  return kvGet(env, appKey(appId), null);
}

export async function handleStoreV1(request, env, url) {
  if (!kvOk(env)) return json({ ok: false, error: 'store-kv-unbound' }, 503);
  const path = url.pathname.replace(/^\/api\/store\/v1/, '') || '/';
  const method = request.method;

  /* 原始资源：/raw/<appId>/<releaseId>/<path...> */
  if (path.startsWith('/raw/') && method === 'GET') {
    const rest = decodeURIComponent(path.slice('/raw/'.length));
    const seg = rest.split('/');
    const appId = seg[0];
    const releaseId = seg[1];
    const filePath = normPath(seg.slice(2).join('/'));
    if (!APP_ID.test(appId) || !REL_ID.test(releaseId) || !filePath) {
      return json({ ok: false, error: 'bad raw path' }, 400);
    }
    const rel = await kvGet(env, relKey(appId, releaseId), null);
    if (!rel) return json({ ok: false, error: 'release not found' }, 404);
    const publicOk = rel.status === 'approved';
    const tokenOk = !publicOk && await verifyToken(env, appId, releaseId, url.searchParams.get('t'));
    if (!publicOk && !tokenOk) return json({ ok: false, error: 'release not available' }, 403);
    const v = rel.files && rel.files[filePath];
    if (v == null) return json({ ok: false, error: 'asset not found' }, 404);
    return assetResponse(v, filePath, publicOk);
  }

  const body = async () => {
    try { return await request.json(); } catch (e) { return null; }
  };

  /* 发布（创建 / 新版本） */
  if (path === '/publish' && method === 'POST') {
    const b = await body();
    if (!b) return json({ ok: false, error: '请求不是 JSON' }, 400);
    const s = sanitize(b);
    if (s.error) return json({ ok: false, error: s.error, code: s.code }, 400);

    let app = null;
    let appId = String(b.appId || '');
    if (appId) {
      app = await loadApp(env, appId);
      if (!app) return json({ ok: false, error: '应用不存在，无法提交新版本' }, 404);
      if (app.publisherId && app.publisherId !== s.meta.publisherId) {
        return json({ ok: false, error: 'publisherId 与首次提交不一致' }, 403);
      }
    } else {
      appId = aid();
      app = {
        appId, publisherId: s.meta.publisherId, publisher: s.meta.publisher,
        createdAt: Date.now(), releases: [], status: 'draft', downloads: 0
      };
    }

    if ((app.releases || []).some(r => r.status === 'pending' && r.version === s.meta.version)) {
      return json({ ok: false, error: 'v' + s.meta.version + ' 已在待审队列，修改内容请提升版本号' }, 409);
    }

    const releaseId = rid();
    const now = Date.now();
    const rel = {
      appId, releaseId,
      status: 'pending',
      meta: s.meta,
      files: s.files,
      submittedAt: now,
      updatedAt: now,
      audit: [{ at: now, action: 'submit', by: s.meta.publisher, note: b.notes ? String(b.notes).slice(0, 200) : '' }]
    };

    app.name = s.meta.name;
    app.meta = Object.assign({}, s.meta, { files: undefined });
    app.latestReleaseId = releaseId;
    app.status = 'pending';
    app.updatedAt = now;
    app.releases = (app.releases || []).slice(0, LIMITS.releases - 1);
    app.releases.unshift({ releaseId, version: s.meta.version, status: 'pending', submittedAt: now });

    try {
      await kvPut(env, relKey(appId, releaseId), rel);
      await kvPut(env, appKey(appId), app);

      const pend = await kvGet(env, 'store:v1:pending', []);
      pend.unshift({ appId, releaseId, at: now });
      if (pend.length > 300) pend.length = 300;
      await kvPut(env, 'store:v1:pending', pend);

      const mine = await kvGet(env, pubKey(s.meta.publisherId), []);
      if (mine.indexOf(appId) < 0) {
        mine.unshift(appId);
        if (mine.length > 100) mine.length = 100;
        await kvPut(env, pubKey(s.meta.publisherId), mine);
      }
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/limit exceeded|quota|429/i.test(msg)) {
        return json({ ok: false, error: 'kv-write-quota-exhausted', hint: '云端写入额度已用尽，稍后重试' }, 503);
      }
      return json({ ok: false, error: 'publish-failed', detail: msg }, 500);
    }

    return json({ ok: true, appId, releaseId, version: s.meta.version, status: 'pending' }, 200);
  }

  /* 提交人自查 */
  if (path === '/mine' && method === 'GET') {
    const publisherId = String(url.searchParams.get('publisherId') || '').trim();
    if (!PUB_ID.test(publisherId)) return json({ ok: false, error: '缺少或非法的 publisherId' }, 400);
    const ids = await kvGet(env, pubKey(publisherId), []);
    const items = [];
    for (const appId of ids.slice(0, 100)) {
      const app = await kvGet(env, appKey(appId), null);
      if (!app) continue;
      const versions = [];
      for (const r of (app.releases || []).slice(0, 12)) {
        versions.push({ releaseId: r.releaseId, version: r.version, status: r.status, submittedAt: r.submittedAt, reviewedAt: r.reviewedAt || 0, rejectReason: r.rejectReason || '' });
      }
      const latestRel = app.latestReleaseId ? await kvGet(env, relKey(appId, app.latestReleaseId), null) : null;
      const approvedRel = app.approvedReleaseId ? await kvGet(env, relKey(appId, app.approvedReleaseId), null) : null;
      const shown = latestRel || approvedRel;
      const m = (shown && shown.meta) || app.meta || {};
      items.push({
        appId, name: m.name || app.name || appId,
        version: m.version || '', desc: m.desc || '', category: m.category || '',
        status: statusOf(app, latestRel) || 'draft',
        latestReleaseId: app.latestReleaseId || '',
        approvedReleaseId: app.approvedReleaseId || '',
        rejectReason: (latestRel && latestRel.rejectReason) || '',
        reviewedAt: (latestRel && latestRel.reviewedAt) || 0,
        updatedAt: app.updatedAt || 0,
        versions
      });
    }
    items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return json({ ok: true, publisherId, total: items.length, items }, 200);
  }

  /* 单应用状态（公开） */
  if (path === '/status' && method === 'GET') {
    const app = await loadApp(env, url.searchParams.get('appId'));
    if (!app) return json({ ok: false, error: 'not found' }, 404);
    const rel = app.latestReleaseId ? await kvGet(env, relKey(app.appId, app.latestReleaseId), null) : null;
    return json({
      ok: true, appId: app.appId, status: app.status,
      releaseId: app.latestReleaseId || '', version: (rel && rel.meta && rel.meta.version) || '',
      rejectReason: (rel && rel.rejectReason) || '', updatedAt: app.updatedAt || 0
    }, 200);
  }

  /* 预览令牌 */
  if (path === '/preview-token' && method === 'POST') {
    const b = await body();
    const appId = String((b && b.appId) || '');
    const releaseId = String((b && b.releaseId) || '');
    if (!APP_ID.test(appId) || !REL_ID.test(releaseId)) return json({ ok: false, error: 'bad appId/releaseId' }, 400);
    const rel = await kvGet(env, relKey(appId, releaseId), null);
    if (!rel) return json({ ok: false, error: 'release not found' }, 404);
    const token = await makeToken(env, appId, releaseId, 2 * 3600 * 1000);
    if (!token) return json({ ok: false, error: 'ACC_SECRET 未配置，无法签发预览令牌' }, 503);
    return json({ ok: true, token, appId, releaseId, expiresIn: 7200 }, 200);
  }

  if (path === '/release' && method === 'GET') {
    const appId = String(url.searchParams.get('appId') || '');
    const releaseId = String(url.searchParams.get('releaseId') || '');
    if (!APP_ID.test(appId) || !REL_ID.test(releaseId)) return json({ ok: false, error: 'bad ids' }, 400);
    const rel = await kvGet(env, relKey(appId, releaseId), null);
    if (!rel) return json({ ok: false, error: 'not found' }, 404);
    const gate = adminOk(request, env);
    const tokenOk = await verifyToken(env, appId, releaseId, url.searchParams.get('t'));
    if (!gate.ok && !tokenOk) return json({ ok: false, error: 'unauthorized' }, 401);
    return json({ ok: true, release: { appId, releaseId, status: rel.status, meta: rel.meta, files: rel.files, rejectReason: rel.rejectReason || '', audit: rel.audit || [] } }, 200);
  }

  /* ---------- 管理端 ---------- */
  const gate = adminOk(request, env);

  if (path === '/pending' && method === 'GET') {
    if (!gate.ok) return json({ ok: false, error: gate.why || 'admin-unauthorized' }, gate.status || 401);
    const pend = await kvGet(env, 'store:v1:pending', []);
    const items = [];
    for (const p of pend.slice(0, 200)) {
      const app = await kvGet(env, appKey(p.appId), null);
      const rel = await kvGet(env, relKey(p.appId, p.releaseId), null);
      if (!rel || rel.status !== 'pending') continue;
      const m = rel.meta || {};
      items.push({
        appId: p.appId, releaseId: p.releaseId, at: p.at,
        status: rel.status, bytes: m.bytes || 0, fileCount: m.fileCount || 0,
        appStatus: app ? app.status : '',
        /* 不返回 iconImage / promo / files，避免待审列表响应过大 */
        meta: {
          name: m.name || '', version: m.version || '', desc: m.desc || '',
          category: m.category || '', publisher: m.publisher || '',
          entry: m.entry || 'index.html', icon: m.icon || 'fa-cube', color: m.color || '#4A9BF5'
        }
      });
    }
    return json({ ok: true, items }, 200);
  }

  if (path === '/review' && method === 'POST') {
    if (!gate.ok) return json({ ok: false, error: gate.why || 'admin-unauthorized' }, gate.status || 401);
    const b = await body();
    const appId = String((b && b.appId) || '');
    const releaseId = String((b && b.releaseId) || '');
    const action = b && b.action;
    if (!APP_ID.test(appId) || !REL_ID.test(releaseId)) return json({ ok: false, error: 'bad ids' }, 400);
    if (action !== 'approve' && action !== 'reject') return json({ ok: false, error: 'action 必须是 approve / reject' }, 400);
    const reason = String((b && b.reason) || '').trim().slice(0, 300);
    if (action === 'reject' && !reason) return json({ ok: false, error: '驳回必须填写原因' }, 400);

    const app = await kvGet(env, appKey(appId), null);
    const rel = await kvGet(env, relKey(appId, releaseId), null);
    if (!app || !rel) return json({ ok: false, error: 'not found' }, 404);
    if (rel.status !== 'pending') return json({ ok: false, error: '该版本不在待审状态：' + rel.status }, 409);

    const now = Date.now();
    rel.audit = (rel.audit || []).slice(-49);
    rel.audit.push({ at: now, action, by: 'admin', note: reason });

    if (action === 'approve') {
      rel.status = 'approved';
      rel.reviewedAt = now;
      rel.rejectReason = '';
      /* 旧版本标 superseded（最多回看 12 个，控制读次数） */
      for (const r of (app.releases || []).slice(0, 12)) {
        if (r.releaseId === releaseId) { r.status = 'approved'; r.reviewedAt = now; continue; }
        if (r.status !== 'approved') continue;
        const old = await kvGet(env, relKey(appId, r.releaseId), null);
        if (!old || old.status !== 'approved') continue;
        old.status = 'superseded';
        old.updatedAt = now;
        old.audit = (old.audit || []).slice(-49);
        old.audit.push({ at: now, action: 'superseded', by: 'system', note: '被 ' + releaseId + ' 替换' });
        try { await kvPut(env, relKey(appId, r.releaseId), old); } catch (e) { }
        r.status = 'superseded';
      }
      app.status = 'approved';
      app.approvedReleaseId = releaseId;
      app.approvedAt = now;
      const idx = await kvGet(env, 'store:v1:idx', []);
      if (idx.indexOf(appId) < 0) {
        idx.unshift(appId);
        if (idx.length > 300) idx.length = 300;
        await kvPut(env, 'store:v1:idx', idx);
      }
    } else {
      rel.status = 'rejected';
      rel.reviewedAt = now;
      rel.rejectReason = reason;
      if (app.latestReleaseId === releaseId) app.status = 'rejected';
      for (const r of (app.releases || [])) {
        if (r.releaseId === releaseId) { r.status = 'rejected'; r.reviewedAt = now; r.rejectReason = reason; }
      }
    }

    app.updatedAt = now;
    const pend = (await kvGet(env, 'store:v1:pending', [])).filter(p => !(p.appId === appId && p.releaseId === releaseId));
    await kvPut(env, 'store:v1:pending', pend);
    await kvPut(env, relKey(appId, releaseId), rel);
    await kvPut(env, appKey(appId), app);
    return json({ ok: true, appId, releaseId, action, status: rel.status, reason: rel.rejectReason || '' }, 200);
  }

  if (path === '/unpublish' && method === 'POST') {
    if (!gate.ok) return json({ ok: false, error: gate.why || 'admin-unauthorized' }, gate.status || 401);
    const b = await body();
    const appId = String((b && b.appId) || '');
    if (!APP_ID.test(appId)) return json({ ok: false, error: 'bad appId' }, 400);
    const app = await kvGet(env, appKey(appId), null);
    if (!app) return json({ ok: false, error: 'not found' }, 404);
    const reason = String((b && b.reason) || '').slice(0, 300);
    const now = Date.now();
    app.status = 'offline';
    app.offlineAt = now;
    app.updatedAt = now;
    app.offlineReason = reason;
    const idx = (await kvGet(env, 'store:v1:idx', [])).filter(x => x !== appId);
    await kvPut(env, 'store:v1:idx', idx);
    await kvPut(env, appKey(appId), app);
    if (app.latestReleaseId) {
      const rel = await kvGet(env, relKey(appId, app.latestReleaseId), null);
      if (rel) {
        rel.status = 'offline';
        rel.updatedAt = now;
        rel.audit = (rel.audit || []).slice(-49);
        rel.audit.push({ at: now, action: 'unpublish', by: 'admin', note: reason });
        try { await kvPut(env, relKey(appId, app.latestReleaseId), rel); } catch (e) { }
      }
    }
    return json({ ok: true, appId, status: 'offline' }, 200);
  }

  return json({ ok: false, error: 'not found', hint: 'v1: publish|mine|status|pending|review|unpublish|preview-token|release|raw' }, 404);
}

/** 供旧商店合并：已上架 v1 应用 */
export async function listV1Approved(env, limit) {
  if (!kvOk(env)) return [];
  const ids = await kvGet(env, 'store:v1:idx', []);
  const out = [];
  for (const appId of ids.slice(0, limit || 100)) {
    const app = await kvGet(env, appKey(appId), null);
    if (!app || app.status === 'offline' || !app.approvedReleaseId) continue;
    const rel = await kvGet(env, relKey(appId, app.approvedReleaseId), null);
    if (!rel || rel.status !== 'approved') continue;
    const m = rel.meta || app.meta || {};
    out.push({
      id: appId, appId, kind: 'app', runtime: 'htmlapp', origin: 'devstudio',
      name: m.name || appId, desc: m.desc || '', version: m.version || '',
      publisher: m.publisher || '', category: m.category || '工具',
      icon: m.icon || 'fa-cube', color: m.color || '#4A9BF5',
      bytes: m.bytes || 0, fileCount: Object.keys(rel.files || {}).length,
      downloads: app.downloads || 0
    });
  }
  return out;
}

/** 供旧 /item 兜底：按 appId 取最新已上架 release */
export async function getV1Item(env, appId) {
  if (!kvOk(env)) return null;
  const app = await loadApp(env, appId);
  if (!app || app.status === 'offline' || !app.approvedReleaseId) return null;
  const rel = await kvGet(env, relKey(appId, app.approvedReleaseId), null);
  if (!rel || rel.status !== 'approved') return null;
  const m = rel.meta || {};
  return {
    item: {
      id: appId, appId, kind: 'app', runtime: 'htmlapp', origin: 'devstudio',
      name: m.name || appId, desc: m.desc || '', version: m.version || '',
      publisher: m.publisher || '', category: m.category || '工具',
      icon: m.icon || 'fa-cube', color: m.color || '#4A9BF5',
      entry: m.entry || 'index.html', bytes: m.bytes || 0,
      fileCount: Object.keys(rel.files || {}).length,
      downloads: app.downloads || 0
    },
    files: rel.files
  };
}
