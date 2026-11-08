/**
 * ============================================================
 * Nexus OS 26 · 后台管理接口（/api/admin/*）
 * ------------------------------------------------------------
 * 仅供「小方控制台」调用：xiaofang-backend 先验证 Bearer 登录态，
 * 再用 X-N26-Admin: <STORE_ADMIN> 转发进来。浏览器不能直连这里。
 *
 * 接口：
 *   GET  /api/admin/overview                 账号 / 商店分状态汇总 / 审计摘要
 *   GET  /api/admin/users                    账号列表（含可解密密码副本）
 *   POST /api/admin/revoke                   { accountName | uid | id } 注销账号密码
 *   GET  /api/admin/inventory                Nexus OS 内置应用清单
 *   GET  /api/admin/apps?kind=&status=&q=    应用 / 插件列表（按状态筛选）
 *   GET  /api/admin/app?kind=&id=            包详情（体积 / SHA-256 / 版本 / 权限 / 预览）
 *   POST /api/admin/review                   {kind,id,action:approve|reject|offline|online,reason}
 *   POST /api/admin/edit-app                 {kind,id,patch} 编辑名称/副标题/简介/分类/标签/图标/宣传图
 *   GET  /api/admin/audit?limit=             审核审计日志（谁、何时、动作、原因）
 *
 * 鉴权：X-N26-Admin 头（值 = Worker secret STORE_ADMIN）。
 * ============================================================
 */

import { decryptPass, saveAccount, WRITE_QUOTA_MSG, isQuotaErr } from './account.js';

const ACC_PREFIX = 'acc:';
const ACC_INDEX_KEY = 'acc:index';
const UID_SEQ_KEY = 'meta:uidSeq';   // 与 account.js 共用：下一个分配的 UID 序号
const STORE_ALL_PREFIX = 'store:all:';
const KINDS = { app: 1, plugin: 1 };
const AUDIT_KEY = 'audit:list';
const AUDIT_MAX = 300;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
function bad(msg, status = 400) { return json({ ok: false, error: msg }, status); }

/** 管理令牌：只认请求头，不接受 query（避免 URL 泄漏令牌） */
function adminOk(request, env) {
  const want = env.STORE_ADMIN || '';
  if (!want) return { ok: false, why: 'STORE_ADMIN 未配置' };
  const got = request.headers.get('X-N26-Admin') || '';
  if (got && got === want) return { ok: true };
  return { ok: false, why: 'admin-unauthorized' };
}

function lower(s) { return String(s || '').toLowerCase(); }
function pickKind(v) { return KINDS[v] ? v : 'app'; }

const enc = new TextEncoder();
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* 用 KV 真实 key 列表重建 acc:index。
   索引是读-改-写，KV 读缓存会让连续删除互相覆盖（把已删的名字又写回去），
   所以删除后一律按 list() 的真实结果重建，而不是对旧索引做 filter。 */
async function rebuildAccIndex(env) {
  const names = [];
  let cursor = undefined;
  for (let i = 0; i < 10; i++) {
    const page = await env.ACC_KV.list({ prefix: ACC_PREFIX, cursor });
    for (const k of page.keys) {
      const n = k.name.slice(ACC_PREFIX.length);
      if (n === 'index') continue;
      names.push(n);
    }
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  await env.ACC_KV.put(ACC_INDEX_KEY, JSON.stringify(names.slice(0, 500)));
  return names;
}

/* 账号列表：读 acc:index 索引（不再每次 list()）；索引缺失时扫一次并回填 */
let ACC_SCAN_ERROR = '';
async function listAccounts(env) {
  const out = [];
  if (!env.ACC_KV) return out;
  let names = [];
  let hasIndex = false;
  const raw = await env.ACC_KV.get(ACC_INDEX_KEY);
  if (raw) {
    /* 索引存在就以它为准 —— 哪怕是空数组 []，也代表「确认没有账号」，
       不能再回退去 scan，否则会把 acc:index 这个键本身当成账号读出来。 */
    try { const v = JSON.parse(raw); if (Array.isArray(v)) { names = v; hasIndex = true; } } catch (e) { names = []; }
  }
  if (!hasIndex) {
    names = await enumerateByUid(env);
    if (names.length) { try { await env.ACC_KV.put(ACC_INDEX_KEY, JSON.stringify(names.slice(0, 500))); } catch (e) { /* 回填失败不阻断 */ } }
  }
  if (!hasIndex && !names.length) {
    try {
      names = await scanAccountNames(env);
      if (names.length) { try { await env.ACC_KV.put(ACC_INDEX_KEY, JSON.stringify(names.slice(0, 500))); } catch (e) { /* 回填失败不阻断 */ } }
    } catch (e) {
      ACC_SCAN_ERROR = e && e.message ? e.message : 'unknown';
      names = [];
    }
  }
  for (const name of names.slice(0, 500)) {
    if (name === 'index') continue;                 // 索引键自身不是账号
    const r = await env.ACC_KV.get(ACC_PREFIX + lower(name));
    if (!r) continue;
    try {
      const o = JSON.parse(r);
      if (!o || typeof o !== 'object' || Array.isArray(o) || !o.accountName) continue;  // 脏数据跳过
      out.push(o);
    } catch (e) { /* 脏数据跳过 */ }
    if (out.length >= 500) break;
  }
  return out;
}

/* 无 list 枚举：UID 是连续分配的，按 meta:uidSeq 逐个 get('uid:xxxxxxx') 反查账户名 */
async function enumerateByUid(env) {
  const seq = parseInt((await env.ACC_KV.get('meta:uidSeq')) || '0', 10) || 0;
  if (seq <= 0) return [];
  const names = [];
  const max = Math.min(seq, 500);
  for (let i = 1; i <= max; i++) {
    const name = await env.ACC_KV.get('uid:' + String(i).padStart(7, '0'));
    if (name) names.push(name);
  }
  return names;
}

/* 仅在索引缺失时使用：扫一遍 acc: 前缀（每次调用 = 若干次 KV list） */
async function scanAccountNames(env) {
  const names = [];
  let cursor = undefined;
  for (let i = 0; i < 10; i++) {
    const page = await env.ACC_KV.list({ prefix: ACC_PREFIX, cursor });
    for (const k of page.keys) {
      const n = k.name.slice(ACC_PREFIX.length);
      if (n === 'index') continue;
      names.push(n);
    }
    if (page.list_complete) break;
    cursor = page.cursor;
    if (names.length >= 500) break;
  }
  return names;
}

async function findAccount(env, q) {
  q = String(q || '').trim();
  if (!q) return null;
  // 账户名
  const direct = await env.ACC_KV.get(ACC_PREFIX + lower(q));
  if (direct) { try { return JSON.parse(direct); } catch (e) { return null; } }
  // UID（1–7 位数字）
  if (/^\d{1,7}$/.test(q)) {
    const name = await env.ACC_KV.get('uid:' + q.padStart(7, '0'));
    if (name) {
      const raw = await env.ACC_KV.get(ACC_PREFIX + lower(name));
      if (raw) { try { return JSON.parse(raw); } catch (e) { return null; } }
    }
  }
  // ID 号
  const owner = await env.ACC_KV.get('hid:' + lower(q.replace(/^@/, '')));
  if (owner) {
    const raw = await env.ACC_KV.get(ACC_PREFIX + lower(owner));
    if (raw) { try { return JSON.parse(raw); } catch (e) { return null; } }
  }
  return null;
}

/* ───────────── 审计日志 ───────────── */
async function readAudit(env) {
  if (!env.STORE_KV) return [];
  const raw = await env.STORE_KV.get(AUDIT_KEY);
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
async function writeAudit(request, env, entry) {
  if (!env.STORE_KV) return;
  const who = String(request.headers.get('X-N26-Operator') || 'admin').slice(0, 40);
  const rec = Object.assign({
    id: 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36),
    at: Date.now(),
    who,
  }, entry);
  const list = await readAudit(env);
  list.unshift(rec);
  if (list.length > AUDIT_MAX) list.length = AUDIT_MAX;
  try { await env.STORE_KV.put(AUDIT_KEY, JSON.stringify(list)); } catch (e) { /* 审计写失败不影响主流程 */ }
  return rec;
}

/* ───────────── 账号 ───────────── */
/* 账号列表：密码字段优先取可逆副本解密；旧账号只有哈希 → 返回 null 并标注 */
async function handleUsers(env) {
  const accs = await listAccounts(env);
  const items = [];
  for (const a of accs) {
    let password = '';
    let passNote = '';
    if (a.passEnc) {
      password = await decryptPass(env, a.passEnc);
      if (!password) passNote = '解密失败（密钥可能已更换）';
    } else if (a.passHash) {
      passNote = '未记录（旧账号只有哈希）';
    } else {
      passNote = '已清空';
    }
    items.push({
      accountName: a.accountName,
      userName: a.userName || a.accountName,
      uid: a.uid || '',
      id: a.id || '',
      password,
      passNote,
      passAlgo: a.passAlgo || 'sha256-legacy',
      status: a.status || 'active',
      createdAt: a.createdAt || 0,
      updatedAt: a.updatedAt || 0,
      lastLoginAt: a.lastLoginAt || 0,
      lastLoginIp: a.lastLoginIp || '',
      deviceCount: Array.isArray(a.devices) ? a.devices.length : 0,
      revokedAt: a.revokedAt || 0,
      claimedFrom: a.claimedFrom || '',
      claimedAt: a.claimedAt || 0,
      sourceText: a.claimedFrom === 'local-claim' ? '本机同步'
        : (a.claimedFrom === 'register' ? '新建' : (a.claimedFrom ? a.claimedFrom : '未知')),
      title: a.title || '',
      verified: !!a.verified,
    });
  }
  items.sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
  const active = items.filter(i => i.status !== 'revoked').length;
  const revoked = items.length - active;
  return json({
    ok: true, total: items.length, active, revoked, items,
    degraded: ACC_SCAN_ERROR || '',
    note: ACC_SCAN_ERROR ? '账号索引尚未建立且 KV list 配额已用尽，等配额重置（UTC 00:00 / 北京 08:00）后自动回填' : '',
  });
}

/* 删除账号：彻底移除 acc:<name> / uid:<uid> / hid:<id> 三处记录与索引项。
   用于清理排查时留下的测试号；正式用户请优先用 /revoke（保留账号记录只清密码）。 */
async function handleDeleteAccount(request, env) {
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};
  const q = String(b.accountName || b.uid || b.id || '').trim();
  if (!q) return bad('缺少 accountName / uid / id');
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV', 503);
  const acc = await findAccount(env, q);
  if (!acc) return bad('账号不存在', 404);
  if (b.confirm !== acc.accountName) {
    return bad('需要在 confirm 字段里原样填账户名「' + acc.accountName + '」才允许删除');
  }

  const name = String(acc.accountName || '');
  const uid = String(acc.uid || '');
  const hid = String(acc.id || '');
  const ops = [env.ACC_KV.delete(ACC_PREFIX + lower(name))];
  if (uid) ops.push(env.ACC_KV.delete('uid:' + uid));
  if (hid) ops.push(env.ACC_KV.delete('hid:' + lower(hid)));
  await Promise.all(ops);

  let rest = await rebuildAccIndex(env);
  if (rest.some(n => lower(n) === lower(name))) {
    rest = rest.filter(n => lower(n) !== lower(name));
    await env.ACC_KV.put(ACC_INDEX_KEY, JSON.stringify(rest.slice(0, 500)));
  }

  await writeAudit(request, env, {
    action: 'delete-account', targetType: 'account', targetId: name,
    targetName: acc.userName || name, reason: '管理员彻底删除账号（测试号清理）',
  });

  const gone = await kvGetUntil(env, ACC_PREFIX + lower(name), null, v => v === null, 4, 250);
  return json({
    ok: true, accountName: name, uid, id: hid,
    verified: gone.ok,
    remaining: rest.length,
    note: '已删除账号记录与 UID / ID 索引；同名用户下次登录会重新注册（新 UID）。',
  });
}

/* 重置 UID 序号：只在「云端一个账号都没有」时允许，
   用于清空测试号后让真正的首位用户重新拿到 0000001。 */
async function handleResetUidSeq(request, env) {
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV', 503);
  const names = await rebuildAccIndex(env);
  if (names.length > 0) {
    return bad('仍有 ' + names.length + ' 个账号存在，不能重置 UID 序号（会撞号）。请先删干净：' + names.slice(0, 10).join(', '));
  }
  const prev = await env.ACC_KV.get(UID_SEQ_KEY);
  await env.ACC_KV.put(UID_SEQ_KEY, '0');
  await writeAudit(request, env, {
    action: 'reset-uid-seq', targetType: 'account', targetId: 'meta:uidSeq',
    targetName: 'UID 序号', reason: '清空测试号后重置，下个账号从 0000001 开始（原值 ' + (prev || '空') + '）',
  });
  const back = await kvGetUntil(env, UID_SEQ_KEY, null, v => String(v) === '0', 4, 250);
  return json({ ok: true, previous: prev, next: '0000001', verified: back.ok, accounts: 0 });
}

async function handleRevoke(request, env) {
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};
  const q = String((b && (b.accountName || b.uid || b.id)) || '').trim();
  if (!q) return bad('缺少 accountName / uid / id');
  const acc = await findAccount(env, q);
  if (!acc) return bad('账号不存在', 404);
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV', 503);

  acc.salt = '';
  acc.passHash = '';
  acc.passEnc = '';
  acc.status = 'revoked';
  acc.revokedAt = Date.now();
  acc.updatedAt = Date.now();
  await env.ACC_KV.put(ACC_PREFIX + lower(acc.accountName), JSON.stringify(acc));
  await writeAudit(request, env, {
    action: 'revoke-account', targetType: 'account', targetId: acc.accountName,
    targetName: acc.userName || acc.accountName, reason: '管理员注销账号密码',
  });
  return json({ ok: true, accountName: acc.accountName, status: acc.status });
}

/* 账号详情：字段真实读库；客户端没采集过的字段返回 null，由后台显示「未记录」 */
async function handleAccountDetail(env, url) {
  const q = String(url.searchParams.get('q') || '').trim();
  if (!q) return bad('缺少 q（账户名 / UID / ID 号）');
  const acc = await findAccount(env, q);
  if (!acc) return bad('账号不存在', 404);

  let password = '';
  let passNote = '';
  if (acc.passEnc) {
    password = await decryptPass(env, acc.passEnc);
    if (!password) passNote = '解密失败（密钥可能已更换）';
  } else if (acc.passHash) passNote = '未记录（旧账号只有哈希）';
  else passNote = '已清空';

  const devices = Array.isArray(acc.devices) ? acc.devices : [];
  const missing = [];
  if (!acc.avatar) missing.push('avatar');
  if (!acc.email) missing.push('email');
  if (!acc.phone) missing.push('phone');
  if (!devices.length) missing.push('devices');
  if (!acc.lastLoginIp) missing.push('lastLoginIp');

  return json({
    ok: true,
    item: {
      accountName: acc.accountName,
      userName: acc.userName || acc.accountName,
      uid: acc.uid || '',
      id: acc.id || '',
      avatar: acc.avatar || '',
      email: acc.email || '',
      phone: acc.phone || '',
      gender: acc.gender || 'secret',
      birthday: acc.birthday || '',
      createdAt: acc.createdAt || 0,
      updatedAt: acc.updatedAt || 0,
      lastLoginAt: acc.lastLoginAt || 0,
      lastLoginIp: acc.lastLoginIp || '',
      devices,
      status: acc.status || 'active',
      revokedAt: acc.revokedAt || 0,
      title: acc.title || '',
      titleAt: acc.titleAt || 0,
      verified: !!acc.verified,
      verifiedAt: acc.verifiedAt || 0,
      claimedFrom: acc.claimedFrom || '',
      claimedAt: acc.claimedAt || 0,
      password,
      passNote,
      passAlgo: acc.passAlgo || 'sha256-legacy',
    },
    missing,
    note: missing.length ? '以下字段客户端尚未采集过，返回 null 而非编造：' + missing.join('、') : '',
  });
}

/* 头衔：可设、可改、可清空（清空即删除字段）；落账号记录，方聊刷新即可见 */
async function handleSetTitle(request, env) {
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};
  const q = String(b.accountName || b.uid || b.id || '').trim();
  if (!q) return bad('缺少 accountName / uid / id');
  if (b.title === undefined || b.title === null) return bad('缺少 title（传空字符串即清空）');
  const acc = await findAccount(env, q);
  if (!acc) return bad('账号不存在', 404);
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV', 503);

  const title = String(b.title).replace(/[\r\n\t]/g, ' ').trim().slice(0, 24);
  acc.title = title;
  if (title) acc.titleAt = Date.now(); else delete acc.titleAt;
  acc.updatedAt = Date.now();
  await saveAccount(env, acc);
  await writeAudit(request, env, {
    action: 'set-title', targetType: 'account', targetId: acc.accountName,
    targetName: acc.userName || acc.accountName, reason: title ? '设置头衔：' + title : '清空头衔',
  });
  return json({ ok: true, accountName: acc.accountName, title: acc.title, titleAt: acc.titleAt || 0 });
}

/* UID 修改：账号主键是 accountName（acc:<accountName>），UID 只是 uid:<uid> → accountName 的索引。
   所以迁移 = 写新索引 + 删旧索引 + 更新账号记录里的 uid 字段；
   头衔 / 蓝 V 挂在账号记录（accountName）上，天然不受影响；
   方聊的会话 / 好友以「账户名 / 昵称」为键，不引用 UID，也不需要迁移。 */
const UID_RESERVED = [0, 9999999];   // 0000000 非法；9999999 系统保留
const UID_MIN_LEN = 4;
const UID_MAX_LEN = 12;

function canonicalUid(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!/^\d+$/.test(raw)) return { err: 'UID 只能是数字，不能含字母 / 符号 / 空格' };
  if (raw.length < UID_MIN_LEN || raw.length > UID_MAX_LEN) {
    return { err: 'UID 长度需为 ' + UID_MIN_LEN + '–' + UID_MAX_LEN + ' 位纯数字（当前 ' + raw.length + ' 位）' };
  }
  const n = parseInt(raw, 10);
  if (!isFinite(n) || n <= 0) return { err: 'UID 不能是 0' };
  if (UID_RESERVED.indexOf(n) >= 0) return { err: 'UID ' + raw + ' 属于系统保留号段，不能使用' };
  /* 小于 1000 万的号统一补成 7 位，0000000001 与 1 视为同一个号，避免出现两个「1」 */
  const canonical = n < 10000000 ? String(n).padStart(7, '0') : raw;
  return { uid: canonical, value: n };
}

async function handleSetUid(request, env) {
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};
  const q = String(b.accountName || b.oldUid || b.uid || b.id || '').trim();
  if (!q) return bad('缺少 accountName');
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV', 503);
  const nextRaw = (b.newUid !== undefined && b.newUid !== null) ? b.newUid : b.uid;
  if (nextRaw === undefined || nextRaw === null || String(nextRaw).trim() === '') return bad('缺少 newUid');

  const acc = await findAccount(env, q);
  if (!acc) return bad('账号不存在', 404);
  if (!acc.accountName) return bad('账号记录损坏：缺少 accountName', 500);

  const parsed = canonicalUid(nextRaw);
  if (parsed.err) return bad(parsed.err);
  const oldUid = acc.uid || '';
  if (parsed.uid === oldUid) {
    return json({ ok: true, unchanged: true, accountName: acc.accountName, uid: oldUid });
  }

  /* 全局唯一：uid:<uid> 索引上不能已经属于别的账号 */
  const owner = await env.ACC_KV.get('uid:' + parsed.uid);
  if (owner && String(owner).toLowerCase() !== String(acc.accountName).toLowerCase()) {
    return bad('UID ' + parsed.uid + ' 已被账号「' + owner + '」占用（输入 ' + String(nextRaw).trim() +
      ' 归一化后为 ' + parsed.uid + '），换个号或先把占用账号改走', 409);
  }
  /* 双保险：扫一遍账号索引，防止索引缺失但账号记录里已占号 */
  const all = await listAccounts(env);
  const clash = all.find(function (a) {
    return a.accountName.toLowerCase() !== acc.accountName.toLowerCase() && String(a.uid || '') === parsed.uid;
  });
  if (clash) return bad('UID ' + parsed.uid + ' 已被账号「' + clash.accountName + '」占用', 409);

  acc.uid = parsed.uid;
  acc.updatedAt = Date.now();
  let note = '';
  try {
    await env.ACC_KV.put('uid:' + parsed.uid, acc.accountName);
    await saveAccount(env, acc);
    if (oldUid && oldUid !== parsed.uid) await env.ACC_KV.delete('uid:' + oldUid);
  } catch (e) {
    if (e && (e.quota || isQuotaErr(e))) return bad(WRITE_QUOTA_MSG, 503);
    const msg = String((e && e.message) || e);
    return bad('UID 迁移失败，已保留原值：' + msg, 500);
  }

  await writeAudit(request, env, {
    action: 'set-uid', targetType: 'account', targetId: acc.accountName,
    targetName: acc.userName || acc.accountName,
    oldUid, newUid: parsed.uid,
    reason: 'UID ' + (oldUid || '(空)') + ' → ' + parsed.uid,
  });

  return json({
    ok: true,
    accountName: acc.accountName,
    oldUid,
    uid: parsed.uid,
    id: acc.id || '',
    idUnchanged: true,
    note: '账号主键是 accountName，UID 只是索引；头衔/认证挂在账号记录上，不受影响。方聊会话以昵称为键，无需迁移。' + note,
  });
}

/* 蓝 V 认证：布尔字段落账号记录 */
async function handleSetVerified(request, env) {
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};
  const q = String(b.accountName || b.uid || b.id || '').trim();
  if (!q) return bad('缺少 accountName / uid / id');
  if (b.verified === undefined) return bad('缺少 verified（true / false）');
  const acc = await findAccount(env, q);
  if (!acc) return bad('账号不存在', 404);
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV', 503);

  acc.verified = !!b.verified && b.verified !== 'false' && b.verified !== '0';
  if (acc.verified) acc.verifiedAt = Date.now(); else delete acc.verifiedAt;
  acc.updatedAt = Date.now();
  await saveAccount(env, acc);
  await writeAudit(request, env, {
    action: 'set-verified', targetType: 'account', targetId: acc.accountName,
    targetName: acc.userName || acc.accountName, reason: acc.verified ? '开启蓝 V 认证' : '取消蓝 V 认证',
  });
  return json({ ok: true, accountName: acc.accountName, verified: acc.verified, verifiedAt: acc.verifiedAt || 0 });
}

async function handleInventory(env) {
  if (!env.STORE_KV) return json({ ok: true, total: 0, items: [], note: 'STORE_KV 未绑定' });
  const raw = await env.STORE_KV.get('nexus:inventory');
  let list = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : []);
    } catch (e) { list = []; }
  }
  return json({ ok: true, total: list.length, items: list });
}

/* ───────────── 商店包（应用 / 插件） ───────────── */
async function kvGet(env, key, fallback) {
  const raw = await env.STORE_KV.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}
async function kvPut(env, key, val) {
  await env.STORE_KV.put(key, JSON.stringify(val));
}

/* KV 读取是最终一致的（实测写后 5–10s 内读可能拿到旧值，不同边缘节点缓存 60s）。
   回读校验不能只读一次就判成功/失败，这里轮询到条件满足或超时，结果如实返回。 */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function kvGetUntil(env, key, fallback, check, tries, gapMs) {
  const n = tries || 5;
  const gap = gapMs || 300;
  let value = null;
  for (let i = 0; i < n; i++) {
    value = await kvGet(env, key, fallback);
    if (check(value)) return { value, ok: true, tries: i + 1 };
    if (i < n - 1) await sleep(gap);
  }
  return { value, ok: false, tries: n };
}

/* ───────────── 管理员改动分组存储（避免 KV 最终一致导致互相覆盖）─────────────
   KV 没有原子读改写：若「改简介」和「换图标」都去读整包再整包写回，
   后一次可能读到旧包并把前一次的名字回滚。
   所以后台改动按组落到独立小键，读取时合并：
     store:md:info:<kind>:<id>   名称/简介/分类/标签/权限/版本/入口…
     store:md:shots:<kind>:<id>  预览图数组
     store:md:icon:<kind>:<id>   上传的图标 URL
   每组只由一种操作写，互不覆盖。 */
const MD_GROUPS = ['info', 'shots', 'icon'];
function mdKey(kind, id, g) { return 'store:md:' + g + ':' + kind + ':' + id; }
async function getMd(env, kind, id) {
  const out = {};
  for (const g of MD_GROUPS) {
    const o = await kvGet(env, mdKey(kind, id, g), null);
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      for (const k of Object.keys(o)) {
        if (k === 'versions') { if (Array.isArray(o.versions) && o.versions.length) out.__versions = o.versions; }
        else if (k === 'updatedAt') out.__updatedAt = o.updatedAt;
        else out[k] = o[k];
      }
    }
  }
  return out;
}
/** 把后台改动合并进包（只用于读路径与回读校验，不回写整包） */
function applyMd(pkg, md) {
  if (!pkg) return pkg;
  if (!md || !Object.keys(md).length) return pkg;
  const versions = md.__versions;
  const clean = Object.assign({}, md);
  delete clean.__versions;
  delete clean.__updatedAt;
  pkg.meta = Object.assign({}, pkg.meta || {}, clean);
  if (Array.isArray(versions)) {
    const base = Array.isArray(pkg.versions) ? pkg.versions : [];
    pkg.versions = base.concat(versions.filter(v => !base.some(b => b && b.version === v.version)));
  }
  if (md.__updatedAt) pkg.updatedAt = md.__updatedAt;
  return pkg;
}
/** 只写被改动的那一组（空组不写，省 KV 写额度） */
async function putMd(env, kind, id, groups) {
  for (const g of Object.keys(groups || {})) {
    const patch = groups[g];
    if (!patch || !Object.keys(patch).length) continue;
    const key = mdKey(kind, id, g);
    const cur = await kvGet(env, key, null);
    const base = (cur && typeof cur === 'object' && !Array.isArray(cur)) ? cur : {};
    await kvPut(env, key, Object.assign({}, base, patch));
  }
}
async function loadPkg(env, kind, id) {
  const p = await kvGet(env, 'store:pkg:' + kind + ':' + id, null);
  if (!p) return null;
  return applyMd(p, await getMd(env, kind, id));
}
async function loadPkgUntil(env, kind, id, check, tries, gapMs) {
  const n = tries || 5;
  const gap = gapMs === undefined ? 300 : gapMs;
  let pkg = null;
  for (let i = 0; i < n; i++) {
    pkg = await loadPkg(env, kind, id);
    if (check(pkg)) return { value: pkg, ok: true, tries: i + 1 };
    if (i < n - 1) await sleep(gap);
  }
  return { value: pkg, ok: false, tries: n };
}

/** 包列表：读 store:all:<kind> 全量索引；索引缺失时扫一次并回填 */
async function scanPackages(env, kind) {
  if (!env.STORE_KV) return [];
  const prefix = 'store:pkg:' + kind + ':';
  let ids = [];
  const raw = await env.STORE_KV.get(STORE_ALL_PREFIX + kind);
  if (raw) {
    try { const v = JSON.parse(raw); if (Array.isArray(v)) ids = v; } catch (e) { ids = []; }
  }
  if (!ids.length) {
    // 无 list 兜底：已上架 idx + 待审核 pend 两个数组就够用（rejected/offline 等索引回填后可见）
    try {
      const idx = await kvGet(env, 'store:idx:' + kind, []);
      const pend = await kvGet(env, 'store:pend:' + kind, []);
      const seen = {};
      for (const id of (Array.isArray(idx) ? idx : []).concat(Array.isArray(pend) ? pend : [])) {
        if (!id || seen[id]) continue;
        seen[id] = 1; ids.push(id);
      }
    } catch (e) { /* 忽略，继续走 list 兜底 */ }
  }
  if (!ids.length) {
    try {
      ids = await scanPackageIds(env, prefix);
      if (ids.length) { try { await env.STORE_KV.put(STORE_ALL_PREFIX + kind, JSON.stringify(ids.slice(0, 500))); } catch (e) { /* 回填失败不阻断 */ } }
    } catch (e) {
      ids = [];
    }
  }
  const out = [];
  for (const id of ids.slice(0, 500)) {
    const p = await kvGet(env, prefix + id, null);
    if (!p) continue;
    p.id = p.id || id;
    out.push(applyMd(p, await getMd(env, kind, id)));
  }
  return out;
}

async function scanPackageIds(env, prefix) {
  const ids = [];
  let cursor = undefined;
  for (let i = 0; i < 10; i++) {
    const page = await env.STORE_KV.list({ prefix, cursor });
    for (const k of page.keys) ids.push(k.name.slice(prefix.length));
    if (page.list_complete) break;
    cursor = page.cursor;
    if (ids.length >= 500) break;
  }
  return ids;
}

function pkgStatus(pkg) {
  const s = String((pkg && pkg.status) || 'pending');
  if (s === 'approved' || s === 'pending' || s === 'rejected' || s === 'offline') return s;
  return 'pending';
}

/* ───────────── 来源分类 ─────────────
   builtin = 系统自带（nexus:inventory，只读，不在这里）
   mxos    = MXOS 合作包（只展示，后台不可改）
   user    = 用户自行上传（后台可改简介 / 预览图 / 图标 / 名称 / 上下架 / 删除 / 审核）
   判定顺序：显式 origin > 发布者里带 MXOS > 默认 user。
   这样不会把用户上传的包误判成 MXOS，也不会让 MXOS 包被后台误改。 */
const SOURCE_LABELS = { user: '用户上传', mxos: 'MXOS 合作包', builtin: '系统自带' };
function pkgSource(pkg) {
  const m = (pkg && pkg.meta) || {};
  const raw = String((pkg && pkg.origin) || m.origin || m.source || '').toLowerCase();
  if (raw === 'mxos' || m.mxos === true || /mxos/i.test(String(m.publisher || ''))) return 'mxos';
  if (raw === 'builtin' || (pkg && pkg.builtin)) return 'builtin';
  return 'user';
}
function sourceLabel(s) { return SOURCE_LABELS[s] || s; }
/** 只有用户上传的包允许后台改动；MXOS / 系统自带一律拒绝 */
function guardEditable(pkg) {
  const s = pkgSource(pkg);
  if (s !== 'user') return '该包来源为「' + sourceLabel(s) + '」，后台只能查看，不能改动';
  return '';
}

function pkgSummary(pkg) {
  const m = pkg.meta || {};
  return {
    id: pkg.id,
    kind: pkg.kind || 'app',
    status: pkgStatus(pkg),
    source: pkgSource(pkg),
    sourceLabel: sourceLabel(pkgSource(pkg)),
    name: m.name || pkg.id,
    subtitle: m.subtitle || '',
    desc: m.desc || '',
    version: m.version || '',
    category: m.category || '',
    tags: Array.isArray(m.tags) ? m.tags : [],
    icon: m.icon || '',
    iconUrl: m.iconUrl || '',
    screenshots: Array.isArray(m.screenshots) ? m.screenshots : [],
    publisher: m.publisher || pkg.submitter || '匿名开发者',
    submittedAt: pkg.submittedAt || m.createdAt || 0,
    updatedAt: pkg.updatedAt || 0,
    approvedAt: pkg.approvedAt || 0,
    rejectedAt: pkg.rejectedAt || 0,
    offlineAt: pkg.offlineAt || 0,
    rejectReason: pkg.rejectReason || '',
    bytes: m.bytes || 0,
    fileCount: m.fileCount || 0,
    downloads: pkg.downloads || 0,
    versions: Array.isArray(pkg.versions) ? pkg.versions : [],
    changelog: m.changelog || '',
    entry: m.entry || '',
    previewUrl: m.previewUrl || '',
    permissions: Array.isArray(m.permissions) ? m.permissions : [],
    canEdit: pkgSource(pkg) === 'user',
  };
}

/* 真实分页 + 真实筛选（状态 / 关键词 / 来源）全部在服务端对 KV 里的包生效 */
async function handleApps(env, url) {
  if (!env.STORE_KV) return json({ ok: false, error: 'STORE_KV 未绑定' }, 503);
  const kind = pickKind(url.searchParams.get('kind'));
  const status = String(url.searchParams.get('status') || 'all');
  const q = lower(url.searchParams.get('q') || '');
  const source = String(url.searchParams.get('source') || 'all');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('page_size') || '20', 10) || 20));

  const all = (await scanPackages(env, kind)).map(pkgSummary);
  const counts = { all: all.length, pending: 0, approved: 0, offline: 0, rejected: 0 };
  for (const i of all) counts[i.status] = (counts[i.status] || 0) + 1;

  let items = all;
  if (status !== 'all' && status !== '') items = items.filter(i => i.status === status);
  if (source && source !== 'all') items = items.filter(i => i.source === source);
  if (q) items = items.filter(i =>
    lower(i.name).indexOf(q) >= 0 || lower(i.id).indexOf(q) >= 0 || lower(i.publisher).indexOf(q) >= 0);
  items.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const slice = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return json({
    ok: true, kind, status, source, q: q,
    counts, total, page: safePage, pageSize, totalPages,
    items: slice,
  });
}

async function handleAppDetail(env, url) {
  if (!env.STORE_KV) return json({ ok: false, error: 'STORE_KV 未绑定' }, 503);
  const kind = pickKind(url.searchParams.get('kind'));
  const id = String(url.searchParams.get('id') || '');
  if (!id) return bad('缺少 id');
  const pkg = await loadPkg(env, kind, id);
  if (!pkg) return bad('包不存在', 404);

  const files = pkg.files && typeof pkg.files === 'object' ? pkg.files : {};
  const names = Object.keys(files);
  const fileList = names.map(n => ({ name: n, bytes: String(files[n] || '').length }));

  // 包内容 SHA-256：按「文件名 + 内容」规范化排序后求哈希
  let sha = '';
  try {
    const text = names.sort().map(n => n + '\n' + String(files[n] || '')).join('\n');
    sha = await sha256Hex(text);
  } catch (e) { /* 忽略 */ }

  const m = pkg.meta || {};
  return json({
    ok: true,
    item: Object.assign(pkgSummary(pkg), {
      entry: m.entry || '',
      previewUrl: m.previewUrl || '',
      permissions: Array.isArray(m.permissions) ? m.permissions : [],
      changelog: m.changelog || '',
      sha256: sha,
      files: fileList.slice(0, 80),
      fileTotal: fileList.length,
    }),
  });
}

async function handleReview(request, env) {
  if (!env.STORE_KV) return json({ ok: false, error: 'STORE_KV 未绑定' }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};
  const kind = pickKind(b && b.kind);
  const id = String((b && b.id) || '');
  const action = String((b && b.action) || '');
  const reason = String((b && b.reason) || '').trim().slice(0, 300);
  if (!id) return bad('缺少 id');
  if (!['approve', 'reject', 'offline', 'online'].includes(action)) {
    return bad('action 必须是 approve / reject / offline / online');
  }
  if (action === 'reject' && !reason) return bad('拒绝必须填写原因');

  const pkg = await kvGet(env, 'store:pkg:' + kind + ':' + id, null);
  if (!pkg) return bad('包不存在', 404);
  const notAllowed = guardEditable(pkg);
  if (notAllowed) return bad(notAllowed, 403);
  const from = pkgStatus(pkg);

  const pend = await kvGet(env, 'store:pend:' + kind, []);
  const pi = pend.indexOf(id);
  if (pi >= 0) { pend.splice(pi, 1); await kvPut(env, 'store:pend:' + kind, pend); }

  const idx = await kvGet(env, 'store:idx:' + kind, []);

  if (action === 'approve' || action === 'online') {
    // 同名旧版本自动下线（保留包体供审计追溯）
    for (const oldId of idx.slice()) {
      if (oldId === id) continue;
      const op = await kvGet(env, 'store:pkg:' + kind + ':' + oldId, null);
      if (op && op.meta && op.meta.name === pkg.meta.name) {
        op.status = 'offline';
        op.offlineAt = Date.now();
        op.updatedAt = Date.now();
        op.supersededBy = id;
        await kvPut(env, 'store:pkg:' + kind + ':' + oldId, op);
        const oi = idx.indexOf(oldId);
        if (oi >= 0) idx.splice(oi, 1);
      }
    }
    pkg.status = 'approved';
    pkg.approvedAt = Date.now();
    pkg.updatedAt = Date.now();
    pkg.rejectReason = '';
    if (idx.indexOf(id) < 0) idx.unshift(id);
  } else if (action === 'reject') {
    pkg.status = 'rejected';
    pkg.rejectedAt = Date.now();
    pkg.updatedAt = Date.now();
    pkg.rejectReason = reason;
    const ii = idx.indexOf(id);
    if (ii >= 0) idx.splice(ii, 1);
  } else {
    pkg.status = 'offline';
    pkg.offlineAt = Date.now();
    pkg.updatedAt = Date.now();
    const ii = idx.indexOf(id);
    if (ii >= 0) idx.splice(ii, 1);
  }

  await kvPut(env, 'store:idx:' + kind, idx);
  await kvPut(env, 'store:pkg:' + kind + ':' + id, pkg);
  await writeAudit(request, env, {
    action: action + '-package', targetType: kind, targetId: id,
    targetName: pkg.meta && pkg.meta.name || id, from, to: pkg.status, reason,
  });
  /* 回读：状态与索引都要真的落库（决定商城是否可见），轮询等 KV 一致 */
  const expectedVisible = pkg.status === 'approved';
  const wantStatus = pkg.status;
  const rbPkg = await kvGetUntil(env, 'store:pkg:' + kind + ':' + id, null,
    v => !!v && pkgStatus(v) === wantStatus, 5, 300);
  const rbIdx = await kvGetUntil(env, 'store:idx:' + kind, [],
    v => (Array.isArray(v) && v.indexOf(id) >= 0) === expectedVisible, 5, 300);
  const isVisible = Array.isArray(rbIdx.value) && rbIdx.value.indexOf(id) >= 0;
  return json({
    ok: true, id, kind, action, status: pkg.status, rejectReason: pkg.rejectReason || '',
    verified: rbPkg.ok && rbIdx.ok,
    verifyTries: Math.max(rbPkg.tries, rbIdx.tries),
    visibleInStore: isVisible,
  });
}

/* 编辑上架信息：名称 / 副标题 / 简介 / 分类 / 标签 / 图标 / 宣传图 / 版本 … */
async function handleEditApp(request, env) {
  if (!env.STORE_KV) return json({ ok: false, error: 'STORE_KV 未绑定' }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};
  const kind = pickKind(b && b.kind);
  const id = String((b && b.id) || '');
  const patch = (b && b.patch) || {};
  if (!id) return bad('缺少 id');
  const pkg = await kvGet(env, 'store:pkg:' + kind + ':' + id, null);
  if (!pkg) return bad('包不存在', 404);
  const notAllowed = guardEditable(pkg);
  if (notAllowed) return bad(notAllowed, 403);

  /* 现生效值 = 原始包 meta + 后台已改过的分组键（不回写整包，避免与换图标互相覆盖） */
  const md = await getMd(env, kind, id);
  const cur = Object.assign({}, pkg.meta || {}, md);
  delete cur.__versions;

  const info = {};    // → store:md:info
  const iconPatch = {}; // → store:md:icon
  const shotsPatch = {}; // → store:md:shots
  const changed = [];
  const asStr = v => String(v == null ? '' : v);

  function str(key, max, label, bucket) {
    if (patch[key] === undefined) return;
    const v = String(patch[key] == null ? '' : patch[key]).trim().slice(0, max);
    if (v === asStr(cur[key])) return;
    (bucket || info)[key] = v;
    changed.push(label || key);
  }
  str('name', 40, '名称');
  str('subtitle', 80, '副标题');
  str('desc', 400, '简介');
  str('category', 20, '分类');
  str('icon', 40, '图标');
  str('iconUrl', 500, 'Icon 图片', iconPatch);
  str('entry', 160, '入口');
  str('previewUrl', 500, '预览地址');
  str('changelog', 400, '更新说明');

  if (patch.tags !== undefined) {
    const tags = Array.isArray(patch.tags)
      ? patch.tags.slice(0, 6).map(t => String(t).slice(0, 12)).filter(Boolean)
      : String(patch.tags || '').split(/[,，]/).map(t => t.trim()).filter(Boolean).slice(0, 6);
    if (JSON.stringify(tags) !== JSON.stringify(Array.isArray(cur.tags) ? cur.tags : [])) {
      info.tags = tags; changed.push('标签');
    }
  }
  if (patch.screenshots !== undefined) {
    const shots = (Array.isArray(patch.screenshots) ? patch.screenshots : String(patch.screenshots || '').split(/\s+/))
      .map(s => String(s || '').trim()).filter(Boolean).slice(0, 8).map(s => s.slice(0, 500));
    if (JSON.stringify(shots) !== JSON.stringify(Array.isArray(cur.screenshots) ? cur.screenshots : [])) {
      shotsPatch.screenshots = shots; changed.push('宣传图');
    }
  }
  if (patch.permissions !== undefined) {
    const perms = (Array.isArray(patch.permissions) ? patch.permissions : String(patch.permissions || '').split(/[,，]/))
      .map(p => String(p || '').trim()).filter(Boolean).slice(0, 12).map(p => p.slice(0, 30));
    if (JSON.stringify(perms) !== JSON.stringify(Array.isArray(cur.permissions) ? cur.permissions : [])) {
      info.permissions = perms; changed.push('权限声明');
    }
  }
  if (patch.version !== undefined) {
    const v = String(patch.version || '').replace(/[^\w.\-]/g, '').slice(0, 20);
    if (v && v !== asStr(cur.version)) {
      const base = Array.isArray(md.__versions) ? md.__versions.slice()
        : (Array.isArray(pkg.versions) ? pkg.versions.slice() : []);
      base.unshift({ version: v, at: Date.now(), by: 'admin' });
      info.version = v;
      info.versions = base.slice(0, 30);
      changed.push('版本');
    }
  }

  if (!changed.length) {
    return json({ ok: true, id, kind, changed: [], verified: true, verifyTries: 0, item: pkgSummary(applyMd(pkg, md)) });
  }

  info.updatedAt = Date.now();
  const groups = {};
  if (Object.keys(info).length) groups.info = info;
  if (Object.keys(iconPatch).length) groups.icon = iconPatch;
  if (Object.keys(shotsPatch).length) groups.shots = shotsPatch;
  await putMd(env, kind, id, groups);

  const effName = info.name || cur.name || (pkg.meta && pkg.meta.name) || id;
  await writeAudit(request, env, {
    action: 'edit-package', targetType: kind, targetId: id,
    targetName: effName, fields: changed,
    reason: '管理员编辑上架信息：' + changed.join('、'),
  });

  /* 回读校验：把分组键合并后轮询，证明商城读到的就是这一份 */
  const want = Object.assign({}, cur, info, iconPatch, shotsPatch);
  const wantKeys = Object.keys(Object.assign({}, info, iconPatch, shotsPatch)).filter(k => k !== 'versions' && k !== 'updatedAt');
  const rb = await loadPkgUntil(env, kind, id, p => {
    if (!p) return false;
    const em = p.meta || {};
    return wantKeys.every(k => JSON.stringify(em[k]) === JSON.stringify(want[k]));
  }, 5, 300);
  return json({
    ok: true, id, kind, changed,
    verified: rb.ok,
    verifyTries: rb.tries,
    item: pkgSummary(rb.value || applyMd(pkg, md)),
  });
}

/* ───────────── 删除软件（彻底移除：包体 + 全部索引）───────────── */
async function handleDeleteApp(request, env) {
  if (!env.STORE_KV) return json({ ok: false, error: 'STORE_KV 未绑定' }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};
  const kind = pickKind(b.kind);
  const id = String(b.id || '');
  if (!id) return bad('缺少 id');
  const pkg = await kvGet(env, 'store:pkg:' + kind + ':' + id, null);
  if (!pkg) return bad('包不存在（可能已被删除）', 404);
  const notAllowed = guardEditable(pkg);
  if (notAllowed) return bad(notAllowed, 403);

  const name = (pkg.meta && pkg.meta.name) || id;
  for (const listKey of ['store:all:' + kind, 'store:idx:' + kind, 'store:pend:' + kind]) {
    const list = await kvGet(env, listKey, []);
    if (!Array.isArray(list)) continue;
    const i = list.indexOf(id);
    if (i >= 0) { list.splice(i, 1); await kvPut(env, listKey, list); }
  }
  await env.STORE_KV.delete('store:pkg:' + kind + ':' + id);
  for (const g of MD_GROUPS) { try { await env.STORE_KV.delete(mdKey(kind, id, g)); } catch (e) { /* 忽略 */ } }

  await writeAudit(request, env, {
    action: 'delete-package', targetType: kind, targetId: id,
    targetName: name, reason: '管理员删除软件（彻底移除，不可恢复）',
  });

  /* 回读校验：包体必须真的没了，索引里也必须真的没了（轮询等 KV 一致） */
  const gone = await kvGetUntil(env, 'store:pkg:' + kind + ':' + id, null, v => v === null, 5, 300);
  const idx = await kvGetUntil(env, 'store:idx:' + kind, [], v => !(Array.isArray(v) && v.indexOf(id) >= 0), 5, 300);
  const all = await kvGet(env, 'store:all:' + kind, []);
  const pend = await kvGet(env, 'store:pend:' + kind, []);
  return json({
    ok: true, id, kind, name,
    verified: gone.ok && idx.ok &&
      !(Array.isArray(all) && all.indexOf(id) >= 0) &&
      !(Array.isArray(pend) && pend.indexOf(id) >= 0),
    readBack: { pkgGone: gone.ok, inIdx: !idx.ok, tries: Math.max(gone.tries, idx.tries) },
  });
}

/* ───────────── 预览图：删除单张 / 调整顺序 ─────────────
   action = del    → { index } 或 { url }
   action = move   → { index, to }（to 为目标位置，0 起）
   action = swap   → { index, dir: -1 | 1 } */
async function handlePreview(request, env) {
  if (!env.STORE_KV) return json({ ok: false, error: 'STORE_KV 未绑定' }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};
  const kind = pickKind(b.kind);
  const id = String(b.id || '');
  const action = String(b.action || '');
  if (!id) return bad('缺少 id');
  if (!['del', 'move', 'swap'].includes(action)) return bad('action 必须是 del / move / swap');

  const pkg = await kvGet(env, 'store:pkg:' + kind + ':' + id, null);
  if (!pkg) return bad('包不存在', 404);
  const notAllowed = guardEditable(pkg);
  if (notAllowed) return bad(notAllowed, 403);
  /* 预览图单独存 store:md:shots，不整包回写，避免把后台改过的名称/简介覆盖回旧值 */
  const md = await getMd(env, kind, id);
  const shots = Array.isArray(md.screenshots) ? md.screenshots.slice()
    : (Array.isArray((pkg.meta || {}).screenshots) ? pkg.meta.screenshots.slice() : []);
  if (!shots.length) return bad('这个包没有预览图', 409);

  let removed = '';
  if (action === 'del') {
    let i = Number(b.index);
    if (!Number.isInteger(i) || i < 0 || i >= shots.length) {
      const byUrl = String(b.url || '');
      i = byUrl ? shots.indexOf(byUrl) : -1;
    }
    if (i < 0 || i >= shots.length) return bad('预览图下标越界（当前 ' + shots.length + ' 张）');
    removed = shots.splice(i, 1)[0];
  } else if (action === 'swap') {
    const i = Number(b.index);
    const dir = Number(b.dir) < 0 ? -1 : 1;
    const j = i + dir;
    if (!Number.isInteger(i) || i < 0 || i >= shots.length || j < 0 || j >= shots.length) {
      return bad('预览图下标越界（当前 ' + shots.length + ' 张）');
    }
    const t = shots[i]; shots[i] = shots[j]; shots[j] = t;
  } else {
    const from = Number(b.index);
    const to = Number(b.to);
    if (!Number.isInteger(from) || from < 0 || from >= shots.length) return bad('from 越界');
    if (!Number.isInteger(to) || to < 0 || to >= shots.length) return bad('to 越界');
    const [item] = shots.splice(from, 1);
    shots.splice(to, 0, item);
  }

  const nextShots = shots.slice(0, 8);
  await putMd(env, kind, id, { shots: { screenshots: nextShots } });
  await writeAudit(request, env, {
    action: 'edit-preview', targetType: kind, targetId: id,
    targetName: md.name || (pkg.meta && pkg.meta.name) || id,
    reason: action === 'del' ? '删除一张预览图：' + removed : '调整预览图顺序',
  });

  const wantShots = JSON.stringify(nextShots);
  const rbShots = await loadPkgUntil(env, kind, id,
    v => !!(v && v.meta && JSON.stringify(v.meta.screenshots || []) === wantShots), 5, 300);
  const backShots = (rbShots.value && rbShots.value.meta && Array.isArray(rbShots.value.meta.screenshots))
    ? rbShots.value.meta.screenshots : [];
  return json({
    ok: true, id, kind, action, removed,
    count: backShots.length,
    screenshots: backShots,
    verified: rbShots.ok,
    verifyTries: rbShots.tries,
  });
}

/* ───────────── 更换图标：真的把图片存进 KV，并把 URL 写回包 ─────────────
   支持 data:image/png|jpeg|webp|gif|svg+xml;base64，最大 512KB。
   存储键 store:asset:<name>，公开读取 /api/store/asset/<name>。 */
const ICON_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
};
async function handleIconUpload(request, env) {
  if (!env.STORE_KV) return json({ ok: false, error: 'STORE_KV 未绑定' }, 503);
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};
  const kind = pickKind(b.kind);
  const id = String(b.id || '');
  if (!id) return bad('缺少 id');
  const raw = String(b.dataUrl || b.data || '');
  const m = /^data:image\/([a-z+]+);base64,(.+)$/i.exec(raw);
  if (!m) return bad('图标必须是 data:image/...;base64 的图片');
  let ext = m[1].toLowerCase();
  if (ext === 'svg+xml') ext = 'svg';
  if (!ICON_MIME[ext]) return bad('只支持 png / jpeg / webp / gif / svg');
  let buf;
  try {
    const bin = atob(m[2]);
    buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  } catch (e) { return bad('图片 base64 解码失败'); }
  if (!buf.length) return bad('图片内容为空');
  if (buf.length > 512 * 1024) return bad('图标不能超过 512KB（当前 ' + Math.round(buf.length / 1024) + 'KB）');

  const pkg = await kvGet(env, 'store:pkg:' + kind + ':' + id, null);
  if (!pkg) return bad('包不存在', 404);
  const notAllowed = guardEditable(pkg);
  if (notAllowed) return bad(notAllowed, 403);

  const dig = await crypto.subtle.digest('SHA-256', buf);
  const hash = Array.from(new Uint8Array(dig))
    .map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
  const name = 'icon-' + hash + '.' + ext;
  const assetKey = 'store:asset:' + name;
  await env.STORE_KV.put(assetKey, buf);

  const origin = (() => { try { return new URL(request.url).origin; } catch (e) { return 'https://ai.fanggame.company'; } })();
  const iconUrl = origin + '/api/store/asset/' + name;

  /* 图标单独存 store:md:icon，不整包回写（否则会把后台改过的名称/简介覆盖回旧值） */
  const md = await getMd(env, kind, id);
  const prev = md.iconUrl || (pkg.meta && pkg.meta.iconUrl) || '';
  await putMd(env, kind, id, { icon: { iconUrl } });
  await writeAudit(request, env, {
    action: 'edit-icon', targetType: kind, targetId: id,
    targetName: md.name || (pkg.meta && pkg.meta.name) || id,
    reason: '更换图标（' + Math.round(buf.length / 1024) + 'KB ' + ext + '）',
  });

  const rbIcon = await loadPkgUntil(env, kind, id,
    v => !!(v && v.meta && v.meta.iconUrl === iconUrl), 5, 300);
  const stored = await env.STORE_KV.get(assetKey, { type: 'arrayBuffer' });
  return json({
    ok: true, id, kind, iconUrl, previousIconUrl: prev,
    bytes: buf.length,
    verified: rbIcon.ok && !!stored && stored.byteLength === buf.length,
    verifyTries: rbIcon.tries,
    assetBytes: stored ? stored.byteLength : 0,
  });
}

async function handleAudit(env, url) {
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
  const list = await readAudit(env);
  return json({ ok: true, total: list.length, items: list.slice(0, limit) });
}

async function handleOverview(env) {
  const out = {
    ok: true,
    version: '3.2.0-review',
    users: { total: 0, active: 0, revoked: 0 },
    store: { apps: 0, plugins: 0, pending: 0, byStatus: { app: {}, plugin: {} } },
    inventory: 0,
    audit: [],
  };

  const accs = await listAccounts(env);
  out.users.total = accs.length;
  out.users.revoked = accs.filter(a => (a.status || 'active') === 'revoked').length;
  out.users.active = out.users.total - out.users.revoked;

  if (env.STORE_KV) {
    for (const kind of Object.keys(KINDS)) {
      const pkgs = await scanPackages(env, kind);
      const c = { pending: 0, approved: 0, offline: 0, rejected: 0 };
      for (const p of pkgs) c[pkgStatus(p)] = (c[pkgStatus(p)] || 0) + 1;
      out.store.byStatus[kind] = Object.assign({ total: pkgs.length }, c);
      out.store.pending += c.pending;
      if (kind === 'app') out.store.apps = c.approved;
      else out.store.plugins = c.approved;
    }
    const inv = await kvGet(env, 'nexus:inventory', []);
    out.inventory = Array.isArray(inv) ? inv.length : (inv && Array.isArray(inv.items) ? inv.items.length : 0);
    out.audit = (await readAudit(env)).slice(0, 8);
  }

  out.degraded = ACC_SCAN_ERROR || '';
  if (out.degraded) out.note = 'KV 免费额度今日用尽（' + out.degraded + '），列表暂为空，配额重置（UTC 00:00 / 北京 08:00）后自动回填索引';
  return json(out);
}

export async function handleNexusAdmin(request, env, url) {
  const sub = url.pathname.replace(/^\/api\/admin/, '') || '/';
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204 });

  const gate = adminOk(request, env);
  if (!gate.ok) return bad(gate.why || 'admin-unauthorized', 401);

  ACC_SCAN_ERROR = '';

  try {
    if (sub === '/overview' && method === 'GET') return await handleOverview(env);
    if (sub === '/users' && method === 'GET') return await handleUsers(env);
    if (sub === '/revoke' && method === 'POST') return await handleRevoke(request, env);
    if (sub === '/delete-account' && method === 'POST') return await handleDeleteAccount(request, env);
    if (sub === '/reset-uid-seq' && method === 'POST') return await handleResetUidSeq(request, env);
    if (sub === '/account' && method === 'GET') return await handleAccountDetail(env, url);
    if (sub === '/set-title' && method === 'POST') return await handleSetTitle(request, env);
    if (sub === '/set-verified' && method === 'POST') return await handleSetVerified(request, env);
    if (sub === '/set-uid' && method === 'POST') return await handleSetUid(request, env);
    if (sub === '/inventory' && method === 'GET') return await handleInventory(env);
    if (sub === '/apps' && method === 'GET') return await handleApps(env, url);
    if (sub === '/app' && method === 'GET') return await handleAppDetail(env, url);
    if (sub === '/review' && method === 'POST') return await handleReview(request, env);
    if (sub === '/edit-app' && method === 'POST') return await handleEditApp(request, env);
    if (sub === '/delete-app' && method === 'POST') return await handleDeleteApp(request, env);
    if (sub === '/preview' && method === 'POST') return await handlePreview(request, env);
    if (sub === '/icon-upload' && method === 'POST') return await handleIconUpload(request, env);
    if (sub === '/audit' && method === 'GET') return await handleAudit(env, url);
    return bad('未知的管理接口：' + sub, 404);
  } catch (e) {
    if (e && (e.quota || isQuotaErr(e))) return bad(WRITE_QUOTA_MSG, 503);
    const msg = e && e.message ? e.message : 'unknown';
    return bad('管理接口异常：' + msg, 500);
  }
}
