/**
 * ============================================================
 * Nexus OS 26 · 应用/插件市场服务（v2.9.52）
 * ------------------------------------------------------------
 * 一条龙：上传 → 审核 → 上架 → 下载 → 后台管理。
 *   kind = 'app'    应用（Float IDE CW Script 包，装进 apps/floatapp 受限框架）
 *   kind = 'plugin' 插件（Float IDE 插件包：plugin.json + 可选 main.js）
 *
 * 存储（KV）：
 *   store:idx:<kind>            已上架 id 列表（JSON 数组）
 *   store:pend:<kind>           待审核 id 列表（JSON 数组）
 *   store:pkg:<kind>:<id>       完整包（meta + files）
 *
 * 鉴权：管理操作（看待审 / 过审 / 拒绝 / 下架）需要请求头
 *   X-N26-Admin: <STORE_ADMIN>     （wrangler.toml [vars] 里配置，部署脚本自动生成）
 * 浏览与下载完全公开，不需要任何令牌。
 *
 * 没绑 STORE_KV 时所有接口返回 503，前端自动退回「本地模式」。
 * ============================================================
 */

import { listV1Approved, getV1Item } from './store_v1.js';

const KINDS = { app: 1, plugin: 1 };
/** 应用包上限 2MB、插件包上限 256KB；文件数 300 */
const LIMITS = { app: { bytes: 2 * 1024 * 1024, files: 300 }, plugin: { bytes: 256 * 1024, files: 60 } };

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function adminOk(request, env) {
  const key = (request.headers.get('X-N26-Admin') || '').trim();
  const expect = (env.STORE_ADMIN || '').trim();
  // 没配 STORE_ADMIN = 管理端关闭（防止裸奔），但返回明确提示
  if (!expect) return { ok: false, status: 503, why: '服务端未配置 STORE_ADMIN，管理端已锁定' };
  return { ok: key.length > 0 && key === expect };
}

function kvOk(env) {
  return !!(env && env.STORE_KV && typeof env.STORE_KV.get === 'function');
}

async function kvGet(env, key, fallback) {
  try {
    const raw = await env.STORE_KV.get(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) { return fallback; }
}
async function kvPut(env, key, val) {
  await env.STORE_KV.put(key, JSON.stringify(val));
}

/* 后台改动分组存（与 admin.js 同一套键）：
     store:md:info|shots|icon:<kind>:<id>
   商城读的时候合并进来，保证「后台改名 / 换图标 / 删预览图」在商城真实生效，
   同时避免多个后台操作互相整包覆盖。 */
const MD_GROUPS = ['info', 'shots', 'icon'];
async function getMd(env, kind, id) {
  const out = {};
  for (const g of MD_GROUPS) {
    const o = await kvGet(env, 'store:md:' + g + ':' + kind + ':' + id, null);
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      for (const k of Object.keys(o)) {
        if (k === 'versions' || k === 'updatedAt') continue;
        out[k] = o[k];
      }
    }
  }
  return out;
}
function applyMd(pkg, md) {
  if (!pkg) return pkg;
  if (!md || !Object.keys(md).length) return pkg;
  pkg.meta = Object.assign({}, pkg.meta || {}, md);
  return pkg;
}
async function loadPkg(env, kind, id) {
  const p = await kvGet(env, 'store:pkg:' + kind + ':' + id, null);
  if (!p) return null;
  return applyMd(p, await getMd(env, kind, id));
}

/** id：可读 slug + 时间戳 base36，避免重名覆盖 */
function makeId(name) {
  const slug = String(name || 'app').toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'app';
  return slug + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
}

/** 发布校验。返回 { error } 或 { meta, files }
 * files: { "路径": "文本内容" } —— 只收文本（cw/html/css/js/json/md/svg/txt），
 * 二进制一律拒收（市场是代码市场，不是网盘；也堵住滥用）。 */
const OK_EXT = /\.(cw|html?|css|js|mjs|json|md|txt|svg|csv)$/i;
function sanitizePackage(body, kind) {
  const meta = body || {};
  const name = String(meta.name || '').trim();
  if (name.length < 1 || name.length > 40) return { error: '名称需 1-40 字' };
  const desc = String(meta.desc || '').trim().slice(0, 200);
  const version = String(meta.version || '0.1.0').replace(/[^\w.\-]/g, '').slice(0, 20) || '0.1.0';
  const publisher = String(meta.publisher || '匿名开发者').trim().slice(0, 30) || '匿名开发者';
  const icon = /^fa[a-z]?\s+fa-[\w\-]+$/i.test(String(meta.icon || '')) ? String(meta.icon) : 'fa-cube';
  const color = /^#[0-9a-fA-F]{6}$/.test(String(meta.color || '')) ? String(meta.color) : '#0e7490';
  const entry = String(meta.entry || 'index.html').replace(/\\/g, '/').replace(/^\/+/, '').slice(0, 120);
  const tags = Array.isArray(meta.tags) ? meta.tags.slice(0, 5).map(t => String(t).slice(0, 12)) : [];
  /* v3.2 · 审核台需要的上架字段：副标题 / 分类 / 图标图片 / 宣传图 / 权限声明 / 预览地址 */
  const subtitle = String(meta.subtitle || '').trim().slice(0, 80);
  const category = String(meta.category || '').trim().slice(0, 20);
  const iconUrl = /^https?:\/\//.test(String(meta.iconUrl || '')) ? String(meta.iconUrl).slice(0, 500) : '';
  const screenshots = (Array.isArray(meta.screenshots) ? meta.screenshots : [])
    .map(s => String(s || '').trim()).filter(s => /^https?:\/\//.test(s)).slice(0, 8).map(s => s.slice(0, 500));
  const permissions = (Array.isArray(meta.permissions) ? meta.permissions : [])
    .map(p => String(p || '').trim()).filter(Boolean).slice(0, 12).map(p => p.slice(0, 30));
  const previewUrl = /^https?:\/\//.test(String(meta.previewUrl || '')) ? String(meta.previewUrl).slice(0, 500) : '';
  const changelog = String(meta.changelog || '').trim().slice(0, 400);

  const files = meta.files && typeof meta.files === 'object' ? meta.files : null;
  if (!files || !Object.keys(files).length) return { error: '包里没有任何文件' };
  const lim = LIMITS[kind];
  const names = Object.keys(files);
  if (names.length > lim.files) return { error: `文件数超过上限（${lim.files}）` };
  let total = 0;
  for (const p of names) {
    if (!OK_EXT.test(p)) return { error: '只允许文本文件（html/css/js/json/md/txt/svg/csv）' };
    const v = files[p];
    if (typeof v !== 'string') return { error: '文件内容必须是文本' };
    total += v.length;
    if (total > lim.bytes) return { error: kind === 'app' ? '应用包超过 2MB 上限' : '插件包超过 256KB 上限' };
  }
  if (kind === 'app' && !names.length) return { error: '应用包里没有任何文件' };
  if (kind === 'plugin' && !names.some(p => /plugin\.json$/i.test(p))) {
    return { error: '插件包里必须有 plugin.json 清单' };
  }
  return {
    meta: {
      name, desc, version, publisher, icon, color, entry, tags, kind,
      subtitle, category, iconUrl, screenshots, permissions, previewUrl, changelog,
      bytes: total, fileCount: names.length, createdAt: Date.now()
    },
    files,
  };
}

export async function handleStore(request, env, url) {
  if (!kvOk(env)) return json({ ok: false, error: 'store-kv-unbound', hint: 'Worker 未绑定 STORE_KV，市场退回本地模式' }, 503);
  const path = url.pathname.replace(/^\/api\/store/, '') || '/';
  const method = request.method;

  // ── 公开接口 ──────────────────────────────────────────────

  /* 图标资源：后台更换图标时把图片真的存在 KV 里，这里公开读出来。
     只允许 icon-<hex>.<png|jpg|jpeg|webp|gif|svg>，防止被当网盘。 */
  if (path.startsWith('/asset/') && method === 'GET') {
    const name = decodeURIComponent(path.slice('/asset/'.length));
    const m = /^icon-[a-f0-9]{16,64}\.(png|jpg|jpeg|webp|gif|svg)$/i.exec(name);
    if (!m) return json({ ok: false, error: 'bad asset name' }, 404);
    const ext = m[1].toLowerCase();
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' }[ext];
    const buf = await env.STORE_KV.get('store:asset:' + name, { type: 'arrayBuffer' });
    if (!buf) return json({ ok: false, error: 'asset not found' }, 404);
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  /* 提交人自查：?publisher=xxx[&kind=app]
     返回该提交人所有提交的状态与驳回原因 —— 用户侧能看到「待审 / 通过 / 驳回（原因）」。
     只返回元信息，不返回文件体。 */
  if (path === '/mine' && method === 'GET') {
    const publisher = String(url.searchParams.get('publisher') || '').trim();
    if (publisher.length < 1) return json({ ok: false, error: '缺少 publisher' }, 400);
    const kind = KINDS[url.searchParams.get('kind')] ? url.searchParams.get('kind') : 'app';
    const ids = await kvGet(env, 'store:all:' + kind, []);
    const lower = publisher.toLowerCase();
    const items = [];
    for (const id of ids.slice(0, 500)) {
      const pkg = await loadPkg(env, kind, id);
      if (!pkg) continue;
      const who = String((pkg.meta && pkg.meta.publisher) || pkg.submitter || '');
      if (who.toLowerCase() !== lower) continue;
      const m = pkg.meta || {};
      items.push({
        id, kind, status: pkg.status || 'pending',
        name: m.name || id, version: m.version || '',
        desc: m.desc || '', iconUrl: m.iconUrl || '',
        submittedAt: pkg.submittedAt || 0,
        updatedAt: pkg.updatedAt || 0,
        reviewedAt: pkg.approvedAt || pkg.rejectedAt || pkg.offlineAt || 0,
        rejectReason: pkg.rejectReason || '',
      });
    }
    items.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    return json({ ok: true, publisher, kind, total: items.length, items }, 200);
  }

  // 发布（任何人都能投递到待审队列；垃圾由审核端拦）
  if (path === '/publish' && method === 'POST') {
    let body = null;
    try { body = await request.json(); } catch (e) { return json({ ok: false, error: '请求不是 JSON' }, 400); }
    const kind = KINDS[body && body.kind] ? body.kind : 'app';
    const s = sanitizePackage(body, kind);
    if (s.error) return json({ ok: false, error: s.error }, 400);
    const id = makeId(s.meta.name);
    const pkg = {
      id, kind,
      origin: 'user',                  // 来源标记：用户自行上传（后台据此判定可管控）
      meta: s.meta,
      files: s.files,
      status: 'pending',
      downloads: 0,
      submitter: s.meta.publisher || '匿名开发者',
      submittedAt: Date.now(),
      updatedAt: Date.now(),
      versions: [{ version: s.meta.version, at: Date.now(), by: s.meta.publisher || '匿名开发者' }],
    };
    /* KV 每日写额度用尽时 put() 会直接抛异常（以前会变成 1101 脚本错误），
       这里统一转成 503 + 明确文案，前端和后台能看到真实原因。 */
    try {
      const pend = await kvGet(env, 'store:pend:' + kind, []);
      pend.unshift(id);
      if (pend.length > 200) pend.length = 200;   // 队列上限，防灌水
      await kvPut(env, 'store:pend:' + kind, pend);
      // 全量索引：后台列表靠它，避免每次 scan 都触发 KV list()（list 免费额度只有 1000 次/天）
      const all = await kvGet(env, 'store:all:' + kind, []);
      if (all.indexOf(id) < 0) {
        all.unshift(id);
        if (all.length > 500) all.length = 500;
        await kvPut(env, 'store:all:' + kind, all);
      }
      await kvPut(env, 'store:pkg:' + kind + ':' + id, pkg);
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/limit exceeded|quota|429/i.test(msg)) {
        return json({ ok: false, error: 'kv-write-quota-exhausted', detail: msg, hint: 'Cloudflare KV 每日写入额度已用尽，额度恢复后重试' }, 503);
      }
      return json({ ok: false, error: 'publish-failed', detail: msg }, 500);
    }
    return json({ ok: true, id, kind, status: 'pending' }, 200);
  }

  // 列表：?kind=app|plugin（缺省 app），只返回已上架的 meta（不含文件体）
  if (path === '/list' && method === 'GET') {
    const kind = KINDS[url.searchParams.get('kind')] ? url.searchParams.get('kind') : 'app';
    const ids = await kvGet(env, 'store:idx:' + kind, []);
    const items = [];
    for (const id of ids.slice(0, 300)) {
      const pkg = await loadPkg(env, kind, id);
      if (pkg && pkg.status === 'approved') items.push(Object.assign({ id, kind }, pkg.meta, { downloads: pkg.downloads || 0 }));
    }
    /* 开发者工坊 v1 上架应用合并进旧商店列表（同名去重，旧包优先） */
    if (kind === 'app') {
      const seen = new Set(items.map(x => String(x.name || '')));
      const v1 = await listV1Approved(env, 100);
      for (const it of v1) {
        if (seen.has(String(it.name || ''))) continue;
        items.push(it);
      }
    }
    return json({ ok: true, kind, items }, 200);
  }

  // 包详情（含文件体）：?id=&kind=；?dl=1 时顺带计数
  if (path === '/item' && method === 'GET') {
    const kind = KINDS[url.searchParams.get('kind')] ? url.searchParams.get('kind') : 'app';
    const id = String(url.searchParams.get('id') || '');
    if (!/^[a-z0-9\u4e00-\u9fa5_\-]{1,64}$/i.test(id)) return json({ ok: false, error: 'bad id' }, 400);
    const pkg = await kvGet(env, 'store:pkg:' + kind + ':' + id, null);
    if (!pkg || pkg.status !== 'approved') {
      /* v1 工坊应用兜底：id 即 appId，取最新已上架 release */
      if (kind === 'app') {
        const v1 = await getV1Item(env, id);
        if (v1) {
          return json({ ok: true, item: Object.assign({ id, kind: 'app' }, v1.item), files: v1.files, downloads: v1.item.downloads || 0 }, 200);
        }
      }
      return json({ ok: false, error: 'not found' }, 404);
    }
    if (url.searchParams.get('dl') === '1') {
      pkg.downloads = (pkg.downloads || 0) + 1;
      try { await kvPut(env, 'store:pkg:' + kind + ':' + id, pkg); } catch (e) { /* 计数失败不影响下载 */ }
    }
    /* 输出用「原包 + 后台改过分组键」的合并值，下载计数仍只写原包 */
    const eff = applyMd(JSON.parse(JSON.stringify(pkg)), await getMd(env, kind, id));
    return json({ ok: true, item: Object.assign({ id, kind }, eff.meta), files: pkg.files, downloads: pkg.downloads }, 200);
  }

  // ── 管理接口（要 STORE_ADMIN）──────────────────────────────

  const gate = adminOk(request, env);
  if (path === '/pending' && method === 'GET') {
    if (!gate.ok) return json({ ok: false, error: gate.why || 'admin-unauthorized' }, gate.status || 401);
    const out = {};
    for (const kind of Object.keys(KINDS)) {
      const ids = await kvGet(env, 'store:pend:' + kind, []);
      const items = [];
      for (const id of ids.slice(0, 200)) {
        const pkg = await loadPkg(env, kind, id);
        if (pkg) items.push(Object.assign({ id, kind }, pkg.meta));
      }
      out[kind] = items;
    }
    return json({ ok: true, pending: out }, 200);
  }

  if (path === '/review' && method === 'POST') {
    if (!gate.ok) return json({ ok: false, error: gate.why || 'admin-unauthorized' }, gate.status || 401);
    let b = null;
    try { b = await request.json(); } catch (e) { return json({ ok: false, error: '请求不是 JSON' }, 400); }
    const kind = KINDS[b && b.kind] ? b.kind : 'app';
    const action = b.action === 'approve' ? 'approve' : b.action === 'reject' ? 'reject' : null;
    if (!action) return json({ ok: false, error: 'action 必须是 approve / reject' }, 400);
    const id = String(b.id || '');
    const pkg = await kvGet(env, 'store:pkg:' + kind + ':' + id, null);
    if (!pkg) return json({ ok: false, error: 'not found' }, 404);
    const pend = await kvGet(env, 'store:pend:' + kind, []);
    const pi = pend.indexOf(id);
    if (pi >= 0) { pend.splice(pi, 1); await kvPut(env, 'store:pend:' + kind, pend); }
    if (action === 'approve') {
      // 同名顶旧版（更新语义）：旧包标记下线并保留，便于审计追溯
      const ids = await kvGet(env, 'store:idx:' + kind, []);
      for (const old of ids.slice()) {
        const op = await kvGet(env, 'store:pkg:' + kind + ':' + old, null);
        if (op && op.meta && op.meta.name === pkg.meta.name && old !== id) {
          op.status = 'offline';
          op.offlineAt = Date.now();
          op.updatedAt = Date.now();
          op.supersededBy = id;
          try { await kvPut(env, 'store:pkg:' + kind + ':' + old, op); } catch (e) { /* 忽略 */ }
          const oi = ids.indexOf(old);
          if (oi >= 0) ids.splice(oi, 1);
        }
      }
      pkg.status = 'approved';
      pkg.approvedAt = Date.now();
      pkg.updatedAt = Date.now();
      pkg.rejectReason = '';
      if (ids.indexOf(id) < 0) ids.unshift(id);
      await kvPut(env, 'store:idx:' + kind, ids);
    } else {
      pkg.status = 'rejected';
      pkg.rejectedAt = Date.now();
      pkg.updatedAt = Date.now();
      pkg.rejectReason = String((b && b.reason) || '').slice(0, 300);
    }
    await kvPut(env, 'store:pkg:' + kind + ':' + id, pkg);
    return json({ ok: true, id, action, status: pkg.status }, 200);
  }

  if (path === '/unpublish' && method === 'POST') {
    if (!gate.ok) return json({ ok: false, error: gate.why || 'admin-unauthorized' }, gate.status || 401);
    let b = null;
    try { b = await request.json(); } catch (e) { return json({ ok: false, error: '请求不是 JSON' }, 400); }
    const kind = KINDS[b && b.kind] ? b.kind : 'app';
    const id = String(b.id || '');
    const ids = await kvGet(env, 'store:idx:' + kind, []);
    const i = ids.indexOf(id);
    if (i >= 0) { ids.splice(i, 1); await kvPut(env, 'store:idx:' + kind, ids); }
    // 下架 ≠ 删除：保留包体与历史版本，只把状态置为 offline（后台可再上架）
    const pkg = await kvGet(env, 'store:pkg:' + kind + ':' + id, null);
    if (pkg) {
      pkg.status = 'offline';
      pkg.offlineAt = Date.now();
      pkg.updatedAt = Date.now();
      await kvPut(env, 'store:pkg:' + kind + ':' + id, pkg);
    }
    return json({ ok: true, id, removed: i >= 0, status: pkg ? pkg.status : 'not-found' }, 200);
  }

  if (path === '/admin-check' && method === 'GET') {
    return json({ ok: true, admin: gate.ok, why: gate.ok ? null : (gate.why || '令牌不对') }, gate.ok ? 200 : 401);
  }

  return json({ ok: false, error: 'not found', hint: '/api/store/publish|list|item|pending|review|unpublish' }, 404);
}
