/**
 * ============================================================
 * Nexus OS 26 · 账号服务（Cloudflare Worker 模块）
 * ------------------------------------------------------------
 * 和 AI 转发共用一个 Worker，挂在 /api/acc/* 下。
 *
 * 数据模型（按产品要求的 6 个字段 + 额外）：
 *   accountName   账户名，注册即定型，**不可改**，全局唯一
 *   userName      用户名 = 这台电脑的名字，可随便改
 *   uid           7 位顺序号（0000001、0000002…），注册顺序分配，不可改
 *   id            ID 号（@ 后面的 handle），字母/数字/符号，可改，唯一
 *   pass          账号密码（PBKDF2-SHA256 + 每用户随机盐 + 100k 迭代，只存哈希）
 *   passEnc       密码可逆副本（AES-GCM，Worker secret ACC_ENC_KEY，仅后台可解）
 *   computerPass  电脑密码（本机锁屏用，可随便改）
 *   gender        性别（male/female/secret）
 *   birthday      生日（YYYY-MM-DD 或空 = 保密）
 *   avatar        头像
 *   aiApi         AI 配置 {provider, baseUrl, model, key} —— 登录后拉下来自动填好
 *
 * KV 键位：
 *   acc:<accountName 小写>   → 账号 JSON
 *   uid:<uid>                → accountName
 *   hid:<id 小写>            → accountName
 *   meta:uidSeq              → 已分配到的最大序号
 *
 * 接口：
 *   POST /api/acc/register  {accountName, pass, gender, birthday, userName}
 *   POST /api/acc/login     {q, pass}          q = 账户名 或 UID
 *   GET  /api/acc/check?accountName=&id=        查重
 *   GET  /api/acc/lookup?q=                     按 账户名/UID/ID号 查人（方聊加好友）
 *   GET  /api/acc/me?token=                     用 token 拉自己的资料
 *   POST /api/acc/update    {token, patch}      改资料
 *   POST /api/acc/sync      {accounts:[{accountName,pass}]}  本地账号认领（登录时自动补建云端记录）
 *   GET  /api/acc/profile?token=                同上 me（别名）
 *   POST /api/acc/profile   {token, patch}      同上 update（别名）
 *
 * 绑定要求（wrangler.toml）：
 *   [[kv_namespaces]] binding = "ACC_KV"  id = "..."   # 账号数据
 *   [vars] ACC_SECRET = "换成一串随机字符"              # 签发登录 token 用
 * ============================================================
 */

const ACC_PREFIX = 'acc:';
const ACC_INDEX_KEY = 'acc:index';
const UID_PREFIX = 'uid:';
const HID_PREFIX = 'hid:';
const UID_SEQ_KEY = 'meta:uidSeq';
const UID_START = 1;          // 第 1 个账号 = 0000001
const UID_WIDTH = 7;

/* ───────────── 工具 ───────────── */
const enc = new TextEncoder();

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra }
  });
}
function bad(msg, status = 400) { return json({ ok: false, error: msg }, status); }

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function randHex(n = 16) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ───────────── 密码哈希：PBKDF2-SHA256 · 每用户随机盐 · 100k 次迭代 ─────────────
 * 只存 passHash（hex），不存明文；老账号的 sha256(salt|pass) 仍可校验，
 * 登录成功后自动升级为 PBKDF2（见 handleLogin）。 */
const PASS_ALGO = 'pbkdf2-sha256-100k';
const PBKDF2_ITER = 100000;

function hexToBytes(hex) {
  const s = String(hex || '');
  const out = new Uint8Array(Math.floor(s.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16) || 0;
  return out;
}
async function pbkdf2Hex(pass, saltHex, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(pass)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: hexToBytes(saltHex),
    iterations: Math.max(100000, Number(iter) || PBKDF2_ITER),
    hash: 'SHA-256',
  }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/** 校验密码：兼容 PBKDF2 与旧 sha256(salt|pass) */
async function verifyPass(acc, pass) {
  if (!acc || !acc.passHash) return false;
  if (acc.passAlgo === PASS_ALGO) {
    if (!acc.salt) return false;
    return (await pbkdf2Hex(pass, acc.salt, acc.passIter)) === acc.passHash;
  }
  /* 本机账号认领（localHash）沿用客户端本地哈希：sha256('local|' + 密码) */
  if (acc.passAlgo === 'sha-local') {
    return (await sha256Hex('local|' + String(pass || ''))) === acc.passHash;
  }
  return (await sha256Hex(acc.salt + '|' + pass)) === acc.passHash;
}

/* ───────────── 密码可逆副本（仅管理员接口解密） ─────────────
 * 校验仍用 passHash；passEnc 是 AES-GCM(明文) 的 base64，密钥来自
 * Worker secret ACC_ENC_KEY（SHA-256 派生），从不下发前端。
 * 老账号只有 hash、没有 passEnc → 后台显示「未记录（旧账号）」。
 */
const ENC_SALT = 'nexus-pass-enc-v1';
let _encKey = null;
async function encKey(env) {
  if (_encKey) return _encKey;
  if (!env.ACC_ENC_KEY) return null;
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(ENC_SALT + '|' + env.ACC_ENC_KEY));
  _encKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return _encKey;
}
function toB64(buf) {
  let s = '';
  const a = new Uint8Array(buf);
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s);
}
function fromB64(str) {
  const s = atob(str);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
async function encryptPass(env, plain) {
  const k = await encKey(env);
  if (!k) return '';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(String(plain)));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0); out.set(new Uint8Array(ct), 12);
  return toB64(out);
}
async function decryptPass(env, blob) {
  const k = await encKey(env);
  if (!k || !blob) return '';
  try {
    const buf = fromB64(blob);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, k, buf.slice(12));
    return new TextDecoder().decode(pt);
  } catch (e) { return ''; }
}
export { encryptPass, decryptPass, putAccount as saveAccount, WRITE_QUOTA_MSG, isQuotaErr };

/* 账户名：2–20 字符，不含空格/控制字符；允许中英文、数字、下划线、连字符 */
const RE_ACCOUNT = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,20}$/;
/* ID 号：要求「数字、字母、符号」，明确不许中文。允许 @ 开头，可含 . _ - # + ~ */
const RE_HID = /^@?[A-Za-z0-9._#+~-]{2,20}$/;

function normAccount(s) { return String(s || '').trim(); }
function normHid(s) { return String(s || '').trim(); }
function lower(s) { return String(s || '').toLowerCase(); }

/* ───────────── token（无状态签名，避免额外 KV 写入） ───────────── */
async function signToken(accountName, env) {
  const exp = Date.now() + 30 * 24 * 3600 * 1000;   // 30 天
  const body = accountName + '|' + exp;
  const sig = await sha256Hex(body + '|' + (env.ACC_SECRET || 'dev-secret-change-me'));
  return btoa(body + '|' + sig).replace(/=+$/, '');
}
async function verifyToken(token, env) {
  try {
    const raw = atob(token + '==='.slice((token.length + 3) % 4));
    const parts = raw.split('|');
    if (parts.length < 3) return null;
    const sig = parts.pop();
    const exp = Number(parts.pop());
    const accountName = parts.join('|');
    if (!accountName || !exp || Date.now() > exp) return null;
    const want = await sha256Hex(accountName + '|' + exp + '|' + (env.ACC_SECRET || 'dev-secret-change-me'));
    return want === sig ? accountName : null;
  } catch (e) { return null; }
}

/* ───────────── 账号读写 ───────────── */
async function getAccount(env, accountName) {
  if (!accountName) return null;
  const raw = await env.ACC_KV.get(ACC_PREFIX + lower(accountName));
  return raw ? JSON.parse(raw) : null;
}
/* KV 写额度：免费版每天 1000 次写，读几乎无限（10 万/天）。
   策略：索引「值没变就不写」——读一次判断，用读换写；写失败必须抛明确错误，不静默。 */
const WRITE_QUOTA_MSG = '今日写额度已用尽，次日 08:00 恢复（免费版 KV 1000 写/天，读接口不受影响）';
function isQuotaErr(e) {
  return /limit exceeded|10048|quota/i.test(String((e && e.message) || e));
}
function quotaErr() {
  const e = new Error(WRITE_QUOTA_MSG);
  e.quota = true;
  return e;
}
async function kvPut(env, key, value) {
  try {
    await env.ACC_KV.put(key, value);
  } catch (e) {
    if (isQuotaErr(e)) throw quotaErr();
    throw e;
  }
}

async function putAccount(env, acc) {
  /* 主键必写；两个索引只在「指针指向别人 / 不存在」时才写 */
  await kvPut(env, ACC_PREFIX + lower(acc.accountName), JSON.stringify(acc));
  const uidOwner = await env.ACC_KV.get(UID_PREFIX + acc.uid);
  if (!uidOwner || lower(uidOwner) !== lower(acc.accountName)) {
    await kvPut(env, UID_PREFIX + acc.uid, acc.accountName);
  }
  if (acc.id) {
    const hidOwner = await env.ACC_KV.get(HID_PREFIX + lower(acc.id));
    if (!hidOwner || lower(hidOwner) !== lower(acc.accountName)) {
      await kvPut(env, HID_PREFIX + lower(acc.id), acc.accountName);
    }
  }
  await touchAccIndex(env, acc.accountName);
}

/** 账号全量索引（acc:index）：后台列表读它，避免 KV list() 配额被反复消耗 */
async function touchAccIndex(env, accountName) {
  try {
    const raw = await env.ACC_KV.get(ACC_INDEX_KEY);
    let list = [];
    if (raw) {
      try { const v = JSON.parse(raw); if (Array.isArray(v)) list = v; } catch (e) { list = []; }
    }
    const n = lower(accountName);
    if (!list.some(x => lower(x) === n)) {
      list.push(accountName);
      if (list.length > 500) list = list.slice(-500);
      await kvPut(env, ACC_INDEX_KEY, JSON.stringify(list));
    }
  } catch (e) { /* 索引写失败不影响注册/登录主流程 */ }
}
/* 最后登录时间：10 分钟内重复登录不再回写，省掉每次登录 1 次写。
   真的写不进去时返回提示文案，由调用方放进响应，不静默。 */
const LOGIN_TOUCH_MS = 10 * 60 * 1000;
async function touchLogin(env, acc) {
  const now = Date.now();
  const prev = Number(acc.lastLoginAt) || 0;
  if (prev && now - prev < LOGIN_TOUCH_MS) return '';
  acc.lastLoginAt = now;
  acc.updatedAt = now;
  try {
    await putAccount(env, acc);
    return '';
  } catch (e) {
    if (e && e.quota) return WRITE_QUOTA_MSG;
    throw e;
  }
}

async function deleteHidIndex(env, hid) {
  if (hid) await env.ACC_KV.delete(HID_PREFIX + lower(hid));
}

/** 对外公开的字段（绝不返回 pass / salt / token） */
function publicView(acc) {
  if (!acc) return null;
  return {
    accountName: acc.accountName,
    userName: acc.userName || acc.accountName,
    uid: acc.uid,
    id: acc.id || '',
    gender: acc.gender || 'secret',
    birthday: acc.birthday || '',
    avatar: acc.avatar || '',
    aiApi: acc.aiApi || null,
    createdAt: acc.createdAt || 0,
    updatedAt: acc.updatedAt || 0,
    lastLoginAt: acc.lastLoginAt || 0,
    status: acc.status || 'active',
    /* 后台可设：自定义头衔（金色铭牌）+ 蓝 V 认证 */
    title: acc.title || '',
    verified: !!acc.verified
  };
}

/** 按 账户名 / UID / ID号 任一种找账号（方聊加好友、登录都用它） */
async function findByQuery(env, q) {
  q = String(q || '').trim();
  if (!q) return null;
  // 1) 纯 1–7 位数字 → 先当 UID 试
  if (/^\d{1,7}$/.test(q)) {
    const uid = q.padStart(UID_WIDTH, '0');
    const name = await env.ACC_KV.get(UID_PREFIX + uid);
    if (name) return await getAccount(env, name);
  }
  // 2) 当 ID 号（handle）
  if (RE_HID.test(q)) {
    const name = await env.ACC_KV.get(HID_PREFIX + lower(q));
    if (name) return await getAccount(env, name);
  }
  // 3) 当账户名
  return await getAccount(env, q);
}

/** 分配 UID：按注册顺序 +1（0000001 起） */
async function allocUid(env) {
  let seq = parseInt((await env.ACC_KV.get(UID_SEQ_KEY)) || '0', 10) || 0;
  seq = seq + 1;
  await env.ACC_KV.put(UID_SEQ_KEY, String(seq));
  return String(UID_START + seq - 1).padStart(UID_WIDTH, '0');
}

/** 创建云端账号记录（注册 / 本地账号认领共用） */
async function createAccountRecord(env, b, opts = {}) {
  const accountName = normAccount(b.accountName);
  const pass = String(b.pass || '');
  /* 本机账号认领：客户端没有明文密码，只有本地哈希 sha256('local|'+密码)。
     直接存这个哈希并标记 algo=sha-local，登录时按同一算法校验，用户无感。 */
  const localHash = /^[0-9a-f]{64}$/.test(String(b.localHash || '').toLowerCase())
    ? String(b.localHash).toLowerCase() : '';
  const useLocal = !!localHash && !pass;
  const salt = useLocal ? '' : randHex(16);
  let uid = '';
  /* 优先沿用本机 UID（7 位纯数字且未被占用），否则走全局自增 */
  const wantUid = String(b.uid || '').trim();
  if (/^\d{7}$/.test(wantUid) && wantUid !== '0000000') {
    const owner = await env.ACC_KV.get(UID_PREFIX + wantUid);
    if (!owner || lower(owner) === lower(accountName)) uid = wantUid;
  }
  const acc = {
    accountName,
    userName: normAccount(b.userName) || accountName,
    uid: uid || await allocUid(env),
    // 默认 ID 号 = uid（可改）
    id: '',
    salt,
    passAlgo: useLocal ? 'sha-local' : PASS_ALGO,
    passIter: useLocal ? 0 : PBKDF2_ITER,
    passHash: useLocal ? localHash : await pbkdf2Hex(pass, salt, PBKDF2_ITER),
    passEnc: pass ? await encryptPass(env, pass) : '',
    status: 'active',
    lastLoginAt: opts.lastLogin ? Date.now() : 0,
    claimedAt: opts.source === 'local-claim' ? Date.now() : 0,
    claimedFrom: opts.source || 'cloud',
    computerPass: '',
    gender: (b.gender === 'male' || b.gender === 'female') ? b.gender : 'secret',
    birthday: String(b.birthday || '').slice(0, 10),
    avatar: String(b.avatar || '').slice(0, 300000),
    aiApi: null,
    title: '',
    verified: false,
    createdAt: Number(b.createdAt) || Date.now(),
    updatedAt: Date.now()
  };
  if (!acc.id) acc.id = acc.uid;
  await putAccount(env, acc);
  return acc;
}

/* ───────────── 具体接口 ───────────── */
async function handleRegister(request, env) {
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV（见 wrangler.toml 说明）', 503);
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};

  const accountName = normAccount(b.accountName);
  const pass = String(b.pass || '');

  if (!RE_ACCOUNT.test(accountName)) return bad('账户名需 2–20 位，只能用中英文、数字、下划线或连字符，不能有空格');
  if (pass.length < 4) return bad('账号密码至少 4 位');

  // 账户名唯一
  const exists = await getAccount(env, accountName);
  if (exists) return bad('该账户名已被占用', 409);

  const acc = await createAccountRecord(env, { ...b, accountName, pass }, { source: 'register', lastLogin: true });
  const token = await signToken(accountName, env);
  return json({ ok: true, account: publicView(acc), token });
}

async function handleLogin(request, env) {
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV', 503);
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};

  const q = String(b.q || '').trim();
  const pass = String(b.pass || '');
  if (!q || !pass) return bad('请填写账户名/UID 与密码');

  const acc = await findByQuery(env, q);
  if (!acc) return bad('账号不存在', 404);

  const token = await signToken(acc.accountName, env);

  // 被管理员注销：不校验密码，直接放行，但标记 revoked，让客户端引导重设密码
  if ((acc.status || 'active') === 'revoked') {
    const warn = await touchLogin(env, acc);
    return json({ ok: true, revoked: true, account: publicView(acc), token, ...(warn ? { warn } : {}) });
  }

  const hash = await verifyPass(acc, pass);
  if (!hash) return bad('密码错误', 401);

  // 旧 sha256 账号登录成功后自动升级为 PBKDF2（不改变密码）
  const upgraded = acc.passAlgo !== PASS_ALGO;
  if (upgraded) {
    const salt = randHex(16);
    acc.salt = salt;
    acc.passAlgo = PASS_ALGO;
    acc.passIter = PBKDF2_ITER;
    acc.passHash = await pbkdf2Hex(pass, salt, PBKDF2_ITER);
    if (!acc.passEnc) acc.passEnc = await encryptPass(env, pass);
  }

  // 密码算法升级时必须落库；只是「最近登录」则按 10 分钟节流
  let warn = '';
  if (upgraded) {
    acc.lastLoginAt = Date.now();
    acc.updatedAt = Date.now();
    try { await putAccount(env, acc); } catch (e) { if (e && e.quota) warn = WRITE_QUOTA_MSG; else throw e; }
  } else {
    warn = await touchLogin(env, acc);
  }
  return json({ ok: true, account: publicView(acc), token, ...(warn ? { warn } : {}) });
}

async function handleCheck(request, env, url) {
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV', 503);
  const out = { ok: true };
  const an = normAccount(url.searchParams.get('accountName'));
  const hid = normHid(url.searchParams.get('id'));
  if (an) {
    if (!RE_ACCOUNT.test(an)) out.accountNameInvalid = true;
    else out.accountNameTaken = !!(await getAccount(env, an));
  }
  if (hid) {
    if (!RE_HID.test(hid)) out.idInvalid = true;
    else {
      const owner = await env.ACC_KV.get(HID_PREFIX + lower(hid));
      out.idTaken = !!owner;
      if (owner) out.idOwner = owner;
    }
  }
  return json(out);
}

async function handleLookup(request, env, url) {
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV', 503);
  const q = String(url.searchParams.get('q') || '').trim();
  if (!q) return bad('缺少查询词');
  const acc = await findByQuery(env, q);
  if (!acc) return json({ ok: true, found: false });
  // 加好友只给基础信息
  return json({
    ok: true, found: true,
    user: {
      accountName: acc.accountName,
      userName: acc.userName || acc.accountName,
      uid: acc.uid,
      id: acc.id || '',
      gender: acc.gender || 'secret',
      birthday: acc.birthday || '',
      avatar: acc.avatar || '',
      title: acc.title || '',
      verified: !!acc.verified
    }
  });
}

async function handleMe(request, env, url) {
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV', 503);
  const name = await verifyToken(url.searchParams.get('token') || '', env);
  if (!name) return bad('登录已过期，请重新登录', 401);
  const acc = await getAccount(env, name);
  if (!acc) return bad('账号不存在', 404);
  return json({ ok: true, account: publicView(acc) });
}

async function handleUpdate(request, env) {
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV', 503);
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};
  const name = await verifyToken(b.token || '', env);
  if (!name) return bad('登录已过期，请重新登录', 401);
  const acc = await getAccount(env, name);
  if (!acc) return bad('账号不存在', 404);
  const patch = b.patch || {};

  // 账户名、UID 谁都不能改
  delete patch.accountName; delete patch.uid; delete patch.passHash; delete patch.salt;

  // 用户名 / 电脑密码 / 性别 / 生日 / 头像 / AI 配置
  if (patch.userName !== undefined) {
    const v = normAccount(patch.userName);
    if (!v) return bad('用户名不能为空');
    acc.userName = v.slice(0, 24);
  }
  if (patch.computerPass !== undefined) acc.computerPass = String(patch.computerPass).slice(0, 64);
  if (patch.gender !== undefined) {
    acc.gender = (patch.gender === 'male' || patch.gender === 'female') ? patch.gender : 'secret';
  }
  if (patch.birthday !== undefined) acc.birthday = String(patch.birthday || '').slice(0, 10);
  if (patch.avatar !== undefined) acc.avatar = String(patch.avatar || '').slice(0, 64);
  if (patch.aiApi !== undefined) {
    const a = patch.aiApi || null;
    if (a && typeof a === 'object') {
      acc.aiApi = {
        provider: String(a.provider || '').slice(0, 24),
        baseUrl: String(a.baseUrl || '').slice(0, 200),
        model: String(a.model || '').slice(0, 80),
        key: String(a.key || '').slice(0, 200)
      };
    } else acc.aiApi = null;
  }

  // ID 号：可改，需合法 + 唯一
  if (patch.id !== undefined) {
    let hid = normHid(patch.id);
    if (!hid) return bad('ID 号不能为空');
    if (!RE_HID.test(hid)) return bad('ID 号只能用字母、数字和 . _ - # + ~ @，2–20 位，不能有中文');
    if (lower(hid) !== lower(acc.id)) {
      const owner = await env.ACC_KV.get(HID_PREFIX + lower(hid));
      if (owner && lower(owner) !== lower(acc.accountName)) return bad('这个 ID 号已被占用', 409);
      await deleteHidIndex(env, acc.id);
      acc.id = hid;
    }
  }

  // 改账号密码要验旧密码；被注销的账号允许直接重设（客户端引导流程）
  if (patch.newPass) {
    if (String(patch.newPass).length < 4) return bad('新密码至少 4 位');
    if ((acc.status || 'active') !== 'revoked') {
      if (!(await verifyPass(acc, String(patch.oldPass || '')))) return bad('原密码不正确', 401);
    }
    const salt = randHex(16);
    acc.salt = salt;
    acc.passAlgo = PASS_ALGO;
    acc.passIter = PBKDF2_ITER;
    acc.passHash = await pbkdf2Hex(String(patch.newPass), salt, PBKDF2_ITER);
    acc.passEnc = await encryptPass(env, String(patch.newPass));
    acc.status = 'active';
    delete acc.revokedAt;
  }

  acc.updatedAt = Date.now();
  await putAccount(env, acc);
  return json({ ok: true, account: publicView(acc) });
}

/* ───────────── 本地账号认领（sync） ─────────────
 * 客户端在**本机账号登录成功**后，把「账户名 + 明文密码」发来一次：
 *   - 云端已有 → 不覆盖密码，只更新 lastLoginAt
 *   - 云端没有 → 用同一账户名/密码建立云端记录（认领），后台立刻可见
 *   - 已注销 → 不动（避免本地登录把注销状态冲掉）
 * 这样用户已有的本地账号不需要重建，下次登录就自动进入统一账号库。 */
async function handleSync(request, env) {
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV', 503);
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }
  b = b || {};
  const list = Array.isArray(b.accounts) ? b.accounts : (b.accountName ? [b] : []);
  if (!list.length) return bad('缺少 accounts');
  if (list.length > 5) return bad('单次最多同步 5 个账号');

  const out = { ok: true, created: [], existed: [], skipped: [] };
  for (const item of list) {
    const accountName = normAccount(item && item.accountName);
    const pass = String((item && item.pass) || '');
    const localHash = /^[0-9a-f]{64}$/.test(String((item && item.localHash) || '').toLowerCase())
      ? String(item.localHash).toLowerCase() : '';
    if (!RE_ACCOUNT.test(accountName)) { out.skipped.push({ accountName, reason: '账户名不合规' }); continue; }
    /* 本机账号只有本地哈希（sha256('local|'+密码')），不再强制要明文密码 */
    if (pass.length < 4 && !localHash) { out.skipped.push({ accountName, reason: '缺少本地哈希，无法认领' }); continue; }

    const exists = await getAccount(env, accountName);
    if (exists) {
      if ((exists.status || 'active') === 'revoked') {
        out.existed.push({ accountName, status: 'revoked', uid: exists.uid });
        continue;
      }
      const warn = await touchLogin(env, exists);
      if (warn) out.warn = warn;
      out.existed.push({ accountName, status: 'exists', uid: exists.uid });
      continue;
    }

    const acc = await createAccountRecord(env, item, { source: 'local-claim', lastLogin: true });
    out.created.push({ accountName: acc.accountName, uid: acc.uid, id: acc.id });
  }
  return json(out);
}

/* ───────────── 入口 ───────────── */
export async function handleAccount(request, env, url) {
  const sub = url.pathname.replace(/^\/api\/acc/, '') || '/';
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') return new Response(null, { status: 204 });

  try {
    if (sub === '/register' && method === 'POST') return await handleRegister(request, env);
    if (sub === '/login' && method === 'POST') return await handleLogin(request, env);
    if (sub === '/check' && method === 'GET') return await handleCheck(request, env, url);
    if (sub === '/lookup' && method === 'GET') return await handleLookup(request, env, url);
    if (sub === '/me' && method === 'GET') return await handleMe(request, env, url);
    if (sub === '/update' && method === 'POST') return await handleUpdate(request, env);
    // 统一云账号库：本地账号认领（登录时自动补建云端记录）
    if (sub === '/sync' && method === 'POST') return await handleSync(request, env);
    // 资料读取 / 修改的别名（供客户端统一走 profile）
    if (sub === '/profile' && method === 'GET') return await handleMe(request, env, url);
    if (sub === '/profile' && method === 'POST') return await handleUpdate(request, env);
    return bad('未知的账号接口：' + sub, 404);
  } catch (e) {
    if (e && (e.quota || isQuotaErr(e))) return bad(WRITE_QUOTA_MSG, 503);
    return bad('服务端错误：' + (e && e.message ? e.message : String(e)), 500);
  }
}
