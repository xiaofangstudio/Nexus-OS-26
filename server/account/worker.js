/**
 * Nexus OS 26 · 账号后端（Cloudflare Worker + D1 + KV + Turnstile）
 * 小方工作室出品
 *
 * 提供：注册（账户名唯一校验 / 密码二次确认 / 人机验证 / 分配 7 位账户号与 UID）
 *      登录（账户名 / 账户号 / UID 三种方式 + 密码）
 *      邮箱验证码（忘记密码 / 后期绑定）
 *      好友（按账户名或 UID 添加）
 *
 * 环境变量 / 绑定（wrangler.toml）：
 *   DB              D1 database   （账号与会话表）
 *   CODES           KV namespace  （邮箱验证码，带 TTL）
 *   TURNSTILE_SECRET string        （Turnstile 密钥；不配则跳过人机验证，仅用于本地调试）
 *   ALLOWED_ORIGIN  string        （可选，CORS 白名单；不配则允许全部）
 */

const ACCOUNT_NO_START = 1;          // 首位账户号：0000001
const ACCOUNT_NO_LEN = 7;
const UID_MAX_CHANGES = 3;           // UID 自定义次数上限

/* ==================== 工具 ==================== */
const enc = new TextEncoder();

function b64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}
function hex(buf) {
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function randHex(len) {
    const a = new Uint8Array(len);
    crypto.getRandomValues(a);
    return hex(a.buffer);
}
function padNo(n) {
    return String(n).padStart(ACCOUNT_NO_LEN, '0');
}

/** PBKDF2-SHA256 密码哈希 */
async function hashPassword(pw, saltHex) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(saltHex), iterations: 120000, hash: 'SHA-256' },
        key, 256
    );
    return hex(bits);
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json;charset=utf-8',
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'access-control-allow-headers': 'content-type'
        }
    });
}
const ok = (data = {}) => json({ ok: true, ...data });
const fail = (msg, status = 400) => json({ ok: false, error: msg }, status);

/* ==================== 校验 ==================== */
// 账户名：4-20 位，字母/数字/下划线，字母开头（存后端、唯一、不可改）
const ACCOUNT_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{3,19}$/;
// UID：3-16 位，字母/数字/下划线
const UID_RE = /^[A-Za-z0-9_]{3,16}$/;

function validateAccountName(v) {
    if (!v) return '账户名不能为空（必填）';
    if (v.length < 4 || v.length > 20) return '账户名需 4-20 位';
    if (!ACCOUNT_NAME_RE.test(v)) return '账户名只能含字母/数字/下划线，且以字母开头';
    return '';
}
function validateDisplayName(v) {
    if (!v) return '用户名不能为空（必填）';
    if (v.length > 24) return '用户名最多 24 字';
    return '';
}
function validatePassword(v, v2) {
    if (!v) return '密码不能为空（必填）';
    if (v.length < 6) return '密码至少 6 位';
    if (v !== v2) return '两次输入的密码不一致';
    return '';
}

function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
}

/* ==================== 密码学 ==================== */
async function makePassHash(pw) {
    const salt = randHex(16);
    const h = await hashPassword(pw, salt);
    return { hash: h, salt: salt };
}
async function verifyPass(pw, salt, expect) {
    const h = await hashPassword(pw, salt);
    return h === expect;
}

/* ==================== 账户号 / UID 分配 ==================== */
async function nextAccountNo(env) {
    const row = await env.DB.prepare('SELECT MAX(CAST(account_no AS INTEGER)) AS m FROM accounts').first();
    const max = (row && row.m) ? Number(row.m) : (ACCOUNT_NO_START - 1);
    return padNo(max + 1);
}
async function uniqueUid(env) {
    for (let i = 0; i < 12; i++) {
        const u = 'U' + randHex(4).toUpperCase();
        const row = await env.DB.prepare('SELECT id FROM accounts WHERE uid=?').bind(u).first();
        if (!row) return u;
    }
    return 'U' + Date.now().toString(36).toUpperCase();
}

/* ==================== 会话 ==================== */
async function newSession(env, accountId) {
    const token = randHex(24);
    const now = Date.now();
    const exp = now + 30 * 24 * 3600 * 1000;   // 30 天
    await env.DB.prepare('INSERT INTO sessions(token,account_id,created_at,expires_at) VALUES(?,?,?,?)')
        .bind(token, accountId, new Date(now).toISOString(), new Date(exp).toISOString()).run();
    return token;
}
async function sessionAccount(env, token) {
    if (!token) return null;
    const row = await env.DB.prepare('SELECT account_id, expires_at FROM sessions WHERE token=?').bind(token).first();
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
        await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(token).run();
        return null;
    }
    return row.account_id;
}

/* ==================== 接口实现 ==================== */
async function register(body, env, request) {
    const accountName = (body.accountName || '').trim();
    const displayName = (body.displayName || '').trim();
    const password = body.password || '';
    const confirm = body.confirmPassword || '';
    const email = (body.email || '').trim();      // ★ 可留空
    const avatar = body.avatar || '';             // ★ 可留空（后期再传）

    // 1) 后端二次校验（前端提示只是体验，后端才是权威）
    let e = validateAccountName(accountName) || validateDisplayName(displayName) || validatePassword(password, confirm);
    if (e) return fail(e);
    if (email && !isEmail(email)) return fail('邮箱格式不正确（也可以留空）');

    // 2) 人机验证（Cloudflare Turnstile；未配置密钥时放行，仅供本地调试）
    const secret = env.TURNSTILE_SECRET;
    if (secret) {
        const t = body.turnstileToken || '';
        if (!t) return fail('请先完成人机验证');
        const vr = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'secret=' + encodeURIComponent(secret) + '&response=' + encodeURIComponent(t) +
                  '&remoteip=' + encodeURIComponent(request.headers.get('CF-Connecting-IP') || '')
        });
        const vj = await vr.json().catch(() => ({}));
        if (!vj.success) return fail('人机验证未通过，请重试');
    }

    // 3) 账户名唯一性（后端权威校验）
    const exists = await env.DB.prepare('SELECT id FROM accounts WHERE account_name=?').bind(accountName).first();
    if (exists) return fail('已有人注册过这个账户名了，名字不能重复哦～换一个，或者这就是你的账号，直接用密码登录');

    // 4) 分配 7 位账户号（按注册顺序）+ UID
    const accountNo = await nextAccountNo(env);
    const uid = await uniqueUid(env);

    const { hash, salt } = await makePassHash(password);
    const nowIso = new Date().toISOString();

    await env.DB.prepare(
        `INSERT INTO accounts(account_name, display_name, pass_hash, salt, account_no, uid, email, avatar, created_at, uid_changes)
         VALUES(?,?,?,?,?,?,?,?,?,0)`
    ).bind(accountName, displayName, hash, salt, accountNo, uid, email, avatar, nowIso).run();

    const row = await env.DB.prepare('SELECT * FROM accounts WHERE account_name=?').bind(accountName).first();
    const token = await newSession(env, row.id);
    return ok({ account: publicAccount(row), token });
}

async function login(body, env) {
    const identifier = (body.identifier || '').trim();
    const password = body.password || '';
    if (!identifier) return fail('请输入账户名 / 账户号 / UID');
    if (!password) return fail('请输入密码');

    // 三种登录方式：账户名、7 位账户号、UID
    const row = await env.DB.prepare(
        'SELECT * FROM accounts WHERE account_name=? OR account_no=? OR uid=?'
    ).bind(identifier, identifier, identifier).first();
    if (!row) return fail('账号不存在，检查一下账户名 / 账户号 / UID');

    const good = await verifyPass(password, row.salt, row.pass_hash);
    if (!good) return fail('密码不对，再试一次');

    const token = await newSession(env, row.id);
    return ok({ account: publicAccount(row), token });
}

async function checkName(body, env) {
    const accountName = (body.accountName || '').trim();
    const e = validateAccountName(accountName);
    if (e) return ok({ valid: false, reason: e, taken: false });
    const row = await env.DB.prepare('SELECT id FROM accounts WHERE account_name=?').bind(accountName).first();
    return ok({ valid: true, taken: !!row });
}

async function me(env, token) {
    const id = await sessionAccount(env, token);
    if (!id) return fail('登录已过期，请重新登录', 401);
    const row = await env.DB.prepare('SELECT * FROM accounts WHERE id=?').bind(id).first();
    if (!row) return fail('账号不存在', 404);
    return ok({ account: publicAccount(row) });
}

// 更新用户名（用户名可随时改；账户名不可改）
async function updateDisplayName(body, env, token) {
    const id = await sessionAccount(env, token);
    if (!id) return fail('登录已过期，请重新登录', 401);
    const displayName = (body.displayName || '').trim();
    const e = validateDisplayName(displayName);
    if (e) return fail(e);
    await env.DB.prepare('UPDATE accounts SET display_name=? WHERE id=?').bind(displayName, id).run();
    return ok({ displayName });
}

// UID 可定制，每人限 3 次
async function updateUid(body, env, token) {
    const id = await sessionAccount(env, token);
    if (!id) return fail('登录已过期，请重新登录', 401);
    const uid = (body.uid || '').trim();
    if (!UID_RE.test(uid)) return fail('UID 需 3-16 位字母/数字/下划线');
    const row = await env.DB.prepare('SELECT uid_changes FROM accounts WHERE id=?').bind(id).first();
    const used = (row && row.uid_changes) || 0;
    if (used >= UID_MAX_CHANGES) return fail('UID 只能修改 3 次，已达上限');
    const dup = await env.DB.prepare('SELECT id FROM accounts WHERE uid=? AND id<>?').bind(uid, id).first();
    if (dup) return fail('该 UID 已被占用');
    await env.DB.prepare('UPDATE accounts SET uid=?, uid_changes=? WHERE id=?')
        .bind(uid, used + 1, id).run();
    return ok({ uid, remaining: UID_MAX_CHANGES - (used + 1) });
}

// 邮箱验证码：发送（用于忘记密码 / 绑定邮箱）
async function sendEmailCode(body, env, request) {
    const email = (body.email || '').trim();
    if (!isEmail(email)) return fail('请输入有效的邮箱地址');
    if (env.TURNSTILE_SECRET && !body.turnstileToken) return fail('请先完成人机验证');

    // 60 秒限流：同一邮箱 1 分钟只能发一次
    const last = await env.CODES.get('rate:' + email);
    if (last && Date.now() - Number(last) < 60000) return fail('发送太频繁了，等 1 分钟再试');

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await env.CODES.put('code:' + email, code, { expirationTtl: 600 });  // 10 分钟有效
    await env.CODES.put('rate:' + email, String(Date.now()), { expirationTtl: 60 });

    // 发信：优先 MailChannels（CF 生态常用），可通过 EMAIL_FROM 配置发件人
    const from = env.EMAIL_FROM || 'noreply@xiaofangstudio.local';
    try {
        await fetch('https://api.mailchannels.net/tx/v1/send', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                personalizations: [{ to: [{ email }] }],
                from: { email: from, name: 'Nexus OS 26' },
                subject: 'Nexus OS 26 验证码',
                content: [{ type: 'text/plain', value: '你的验证码是：' + code + '（10 分钟内有效）' }]
            })
        });
    } catch (e) {
        // 发信失败不阻断流程，但把验证码回抛以便本地调试（生产应删除该分支）
        return ok({ sent: false, debugCode: code });
    }
    return ok({ sent: true });
}

async function verifyEmailCode(body, env) {
    const email = (body.email || '').trim();
    const code = (body.code || '').trim();
    const real = await env.CODES.get('code:' + email);
    if (!real) return fail('验证码已过期，请重新获取');
    if (real !== code) return fail('验证码不对');
    await env.CODES.delete('code:' + email);
    return ok({ verified: true });
}

// 忘记密码：验证码 + 新密码（含二次确认）→ 重置
async function resetPassword(body, env) {
    const v = await verifyEmailCode({ email: body.email, code: body.code }, env);
    if (!v.ok) return v;
    const e = validatePassword(body.password || '', body.confirmPassword || '');
    if (e) return fail(e);

    const row = await env.DB.prepare('SELECT id FROM accounts WHERE email=?').bind(body.email).first();
    if (!row) return fail('该邮箱未绑定任何账号');

    const { hash, salt } = await makePassHash(body.password);
    await env.DB.prepare('UPDATE accounts SET pass_hash=?, salt=? WHERE id=?')
        .bind(hash, salt, row.id).run();
    return ok({ reset: true });
}

/* 好友：按账户名或 UID 添加 */
async function friendAdd(body, env, token) {
    const owner = await sessionAccount(env, token);
    if (!owner) return fail('登录已过期，请重新登录', 401);
    const identifier = (body.identifier || '').trim();
    if (!identifier) return fail('请输入对方的账户名或 UID');

    const target = await env.DB.prepare(
        'SELECT id, account_name, display_name, uid, avatar FROM accounts WHERE account_name=? OR uid=?'
    ).bind(identifier, identifier).first();
    if (!target) return fail('没有找到这个用户');
    if (target.id === owner) return fail('不能添加自己为好友');

    await env.DB.prepare(
        'INSERT OR IGNORE INTO friends(owner_id, friend_id, created_at) VALUES(?,?,?)'
    ).bind(owner, target.id, new Date().toISOString()).run();

    return ok({ friend: publicAccount(target) });
}

async function friendList(env, token) {
    const owner = await sessionAccount(env, token);
    if (!owner) return fail('登录已过期，请重新登录', 401);
    const rs = await env.DB.prepare(
        `SELECT a.id, a.account_name, a.display_name, a.uid, a.avatar
         FROM friends f JOIN accounts a ON a.id = f.friend_id
         WHERE f.owner_id=? ORDER BY f.created_at DESC`
    ).bind(owner).all();
    return ok({ friends: (rs.results || []).map(publicAccount) });
}

function publicAccount(r) {
    return {
        id: r.id,
        accountName: r.account_name,
        displayName: r.display_name,
        accountNo: r.account_no,
        uid: r.uid,
        email: r.email || '',
        avatar: r.avatar || '',
        createdAt: r.created_at
    };
}

/* ==================== 路由 ==================== */
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const p = url.pathname;

        if (request.method === 'OPTIONS') return json({}, 204);

        const ct = (request.headers.get('content-type') || '');
        let body = {};
        if (request.method === 'POST' && ct.indexOf('application/json') !== -1) {
            body = await request.json().catch(() => ({}));
        }

        const token = request.headers.get('authorization') || body.token || '';

        try {
            if (p === '/api/account/register') return await register(body, env, request);
            if (p === '/api/account/login')    return await login(body, env);
            if (p === '/api/account/check')    return await checkName(body, env);
            if (p === '/api/account/me')       return await me(env, token);
            if (p === '/api/account/display-name') return await updateDisplayName(body, env, token);
            if (p === '/api/account/uid')      return await updateUid(body, env, token);
            if (p === '/api/email/send-code')  return await sendEmailCode(body, env, request);
            if (p === '/api/email/verify')     return await verifyEmailCode(body, env);
            if (p === '/api/account/reset-password') return await resetPassword(body, env);
            if (p === '/api/friend/add')        return await friendAdd(body, env, token);
            if (p === '/api/friend/list')       return await friendList(env, token);
            if (p === '/api/health')             return ok({ ts: Date.now() });
        } catch (err) {
            return fail(String((err && err.message) || err), 500);
        }

        return fail('Not Found: ' + p, 404);
    }
};

/* ==================== D1 建表语句（首次部署执行） ====================
npx wrangler d1 execute nexus-accounts --file=./server/account/schema.sql

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  account_no TEXT UNIQUE NOT NULL,
  uid TEXT UNIQUE NOT NULL,
  email TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  uid_changes INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS friends (
  owner_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, friend_id)
);
========================================================== */
