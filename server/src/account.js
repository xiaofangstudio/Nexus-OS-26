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
 *   pass          账号密码（存 sha256(salt+pass)，不存明文）
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
 *
 * 绑定要求（wrangler.toml）：
 *   [[kv_namespaces]] binding = "ACC_KV"  id = "..."   # 账号数据
 *   [vars] ACC_SECRET = "换成一串随机字符"              # 签发登录 token 用
 * ============================================================
 */

const ACC_PREFIX = 'acc:';
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
async function putAccount(env, acc) {
  // 主键 + 两个索引一起写
  await env.ACC_KV.put(ACC_PREFIX + lower(acc.accountName), JSON.stringify(acc));
  await env.ACC_KV.put(UID_PREFIX + acc.uid, acc.accountName);
  if (acc.id) await env.ACC_KV.put(HID_PREFIX + lower(acc.id), acc.accountName);
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
    updatedAt: acc.updatedAt || 0
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

/* ───────────── 具体接口 ───────────── */
async function handleRegister(request, env) {
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV（见 wrangler.toml 说明）', 503);
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }

  const accountName = normAccount(b.accountName);
  const pass = String(b.pass || '');

  if (!RE_ACCOUNT.test(accountName)) return bad('账户名需 2–20 位，只能用中英文、数字、下划线或连字符，不能有空格');
  if (pass.length < 4) return bad('账号密码至少 4 位');

  // 账户名唯一
  const exists = await getAccount(env, accountName);
  if (exists) return bad('该账户名已被占用', 409);

  // 分配 UID：按注册顺序 +1
  let seq = parseInt((await env.ACC_KV.get(UID_SEQ_KEY)) || '0', 10) || 0;
  seq = seq + 1;
  await env.ACC_KV.put(UID_SEQ_KEY, String(seq));
  const uid = String(UID_START + seq - 1).padStart(UID_WIDTH, '0');

  const salt = randHex(12);
  const acc = {
    accountName,
    userName: normAccount(b.userName) || accountName,
    uid,
    // 默认 ID 号 = uid（可改）
    id: uid,
    salt,
    passHash: await sha256Hex(salt + '|' + pass),
    computerPass: '',
    gender: (b.gender === 'male' || b.gender === 'female') ? b.gender : 'secret',
    birthday: String(b.birthday || '').slice(0, 10),
    avatar: '',
    aiApi: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await putAccount(env, acc);
  const token = await signToken(accountName, env);
  return json({ ok: true, account: publicView(acc), token });
}

async function handleLogin(request, env) {
  if (!env.ACC_KV) return bad('服务端未配置 ACC_KV', 503);
  let b;
  try { b = await request.json(); } catch (e) { return bad('请求体不是 JSON'); }

  const q = String(b.q || '').trim();
  const pass = String(b.pass || '');
  if (!q || !pass) return bad('请填写账户名/UID 与密码');

  const acc = await findByQuery(env, q);
  if (!acc) return bad('账号不存在', 404);

  const hash = await sha256Hex(acc.salt + '|' + pass);
  if (hash !== acc.passHash) return bad('密码错误', 401);

  const token = await signToken(acc.accountName, env);
  return json({ ok: true, account: publicView(acc), token });
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
      avatar: acc.avatar || ''
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

  // 改账号密码要验旧密码
  if (patch.newPass) {
    const oldHash = await sha256Hex(acc.salt + '|' + String(patch.oldPass || ''));
    if (oldHash !== acc.passHash) return bad('原密码不正确', 401);
    if (String(patch.newPass).length < 4) return bad('新密码至少 4 位');
    acc.salt = randHex(12);
    acc.passHash = await sha256Hex(acc.salt + '|' + String(patch.newPass));
  }

  acc.updatedAt = Date.now();
  await putAccount(env, acc);
  return json({ ok: true, account: publicView(acc) });
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
    return bad('未知的账号接口：' + sub, 404);
  } catch (e) {
    return bad('服务端错误：' + (e && e.message ? e.message : String(e)), 500);
  }
}
