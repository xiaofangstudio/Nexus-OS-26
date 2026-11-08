/**
 * ============================================================
 * Nexus OS 26 · 方聊（N聊）后端 · Cloudflare Worker
 * ------------------------------------------------------------
 * 依据 ../../API文档大全.md 第一部分「N聊 项目 API」规范实现：
 *   REST（Authorization: Bearer <mxos_session_token>）
 *     POST /api/ws-ticket                      → { ticket }（60s 有效）
 *     GET  /api/friends                        → 好友列表
 *     GET  /api/friends/request                → 待处理好友请求
 *     POST /api/friends/request                → 发好友请求 { targetUserId }（需对方同意）
 *     PUT  /api/friends/request/{id}           → 响应 { action:'accept'|'reject' }
 *     DELETE /api/friends/{friendId}           → 删除好友
 *     GET  /api/messages?chatId=&offset=       → 聊天历史
 *     GET  /api/chats                          → 聊天对象列表（world + 好友）
 *     GET  /api/users/search?q=                → 搜索用户
 *     （开发模式附加）POST /api/dev/register | /api/dev/login
 *   WebSocket
 *     /api/ws?chatId=...        聊天房间（world / friend:a:b）
 *     /api/notifications/ws     通知通道（friend_request / friend_request_result）
 *     认证：Sec-WebSocket-Protocol: nliao-auth.<base64url(token)>，回应 nliao-v1
 *   验证：配置 AUTH_API_BASE 后，Worker 请求 `${AUTH_API_BASE}/api/auth/me`
 *         验证会话，防止客户端伪造 senderId / 好友关系。
 * ============================================================
 */

const WORLD_CHAT = 'world';

/* ================= 工具 ================= */
const json = (data, status, env) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...(corsHeaders(env)) },
});
const corsHeaders = (env) => ({
  'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400',
});
const uuid = () => crypto.randomUUID();
const b64url = {
  enc: (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))),
};
async function hmacSign(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return b64url.enc(String.fromCharCode(...new Uint8Array(sig)));
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

/* ================= 认证 ================= */
// token 从 Authorization 头提取；返回 { id, displayName, email, avatar }
async function authUser(request, env) {
  const auth = (request.headers.get('Authorization') || '');
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  return authUserFromToken(env, token);
}

async function authUserFromToken(env, token) {
  if (!token) throw new HttpError(401, '缺少会话令牌（Authorization: Bearer <token>）');

  // 开发模式：AUTH_API_BASE 为空 → token 形如 dev.<b64url(json)>
  if (!env.AUTH_API_BASE) {
    if (!token.startsWith('dev.')) throw new HttpError(401, '开发模式仅接受 dev.* 令牌');
    try {
      const u = JSON.parse(b64url.dec(token.slice(4)));
      if (!u.id) throw new Error('bad');
      return { id: String(u.id), displayName: u.displayName || u.id, email: u.email || '', avatar: u.avatar || '' };
    } catch (e) { throw new HttpError(401, '令牌无效'); }
  }

  // 生产：向 MXOS 账户中心验证（防止伪造 senderId / 好友关系）
  const base = env.AUTH_API_BASE.replace(/\/+$/, '');
  const r = await fetch(base + '/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
  if (!r.ok) throw new HttpError(401, 'MXOS 会话验证失败（HTTP ' + r.status + '）');
  const me = await r.json().catch(() => null);
  const u = me && (me.user || me.data || me);
  if (!u || !u.id) throw new HttpError(401, 'MXOS 会话无效');
  return { id: String(u.id), displayName: u.displayName || u.name || u.id, email: u.email || '', avatar: u.avatar || '' };
}

// WS 票据：stateless HMAC，60 秒有效，绑定用户
async function makeTicket(env, user) {
  const exp = Date.now() + 60_000;
  const payload = b64url.enc(JSON.stringify({ uid: user.id, dp: user.displayName, exp }));
  const sig = await hmacSign(env.TICKET_SECRET || 'dev-secret', payload);
  return payload + '.' + sig;
}
async function verifyTicket(env, ticket) {
  if (!ticket || !ticket.includes('.')) throw new HttpError(401, 'WS 票据无效');
  const dot = ticket.lastIndexOf('.');
  const payload = ticket.slice(0, dot), sig = ticket.slice(dot + 1);
  const want = await hmacSign(env.TICKET_SECRET || 'dev-secret', payload);
  if (sig !== want) throw new HttpError(401, 'WS 票据签名不符');
  const data = JSON.parse(b64url.dec(payload));
  if (Date.now() > data.exp) throw new HttpError(401, 'WS 票据已过期');
  return { id: data.uid, displayName: data.dp };
}

/* ================= D1 数据访问 ================= */
const friendKey = (a, b) => [a, b].sort().join(':');
const chatIdOf = (a, b) => 'friend:' + friendKey(a, b);

async function ensureUser(env, u) {
  // Nexus 账号可能没有 email：生成稳定的占位邮箱，避免 users.email UNIQUE 冲突
  const email = (u.email && String(u.email).trim()) || (u.id + '@nliao.local');
  const displayName = u.displayName || u.id;
  await env.DB.prepare(
    'INSERT INTO users (id, displayName, email, avatar, createdAt) VALUES (?1, ?2, ?3, ?4, ?5) ' +
    'ON CONFLICT(id) DO UPDATE SET displayName=excluded.displayName, email=excluded.email, avatar=excluded.avatar'
  ).bind(u.id, displayName, email, u.avatar || '', Date.now()).run();
}
async function isFriend(env, a, b) {
  const [x, y] = [a, b].sort();
  const r = await env.DB.prepare('SELECT 1 FROM friends WHERE userA=?1 AND userB=?2').bind(x, y).first();
  return !!r;
}
async function getUserName(env, uid) {
  const r = await env.DB.prepare('SELECT displayName, avatar FROM users WHERE id=?1').bind(uid).first();
  return { displayName: (r && r.displayName) || uid, avatar: (r && r.avatar) || '' };
}

/* ================= REST 处理器 ================= */
async function handleFriends(request, env, user) {
  const rows = await env.DB.prepare(
    'SELECT CASE WHEN userA=?1 THEN userB ELSE userA END AS fid FROM friends WHERE userA=?1 OR userB=?1'
  ).bind(user.id).all();
  const friends = [];
  for (const row of rows.results || []) {
    const info = await getUserName(env, row.fid);
    friends.push({ id: row.fid, displayName: info.displayName, online: false });
  }
  return json({ ok: true, friends }, 200, env);
}

async function handleFriendRequests(request, env, user, url) {
  // GET：待处理列表
  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      "SELECT id, fromId, createdAt FROM friend_requests WHERE toId=?1 AND status='pending' ORDER BY createdAt DESC"
    ).bind(user.id).all();
    const requests = [];
    for (const r of rows.results || []) {
      const info = await getUserName(env, r.fromId);
      requests.push({ id: r.id, from: { id: r.fromId, displayName: info.displayName, avatar: info.avatar }, createdAt: r.createdAt });
    }
    return json({ ok: true, requests }, 200, env);
  }
  // POST：发送好友请求（对方需同意 —— 规范要求）
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const targetId = String(body.targetUserId || '').trim();
    if (!targetId) throw new HttpError(400, '缺少 targetUserId');
    if (targetId === user.id) throw new HttpError(400, '不能添加自己');
    if (await isFriend(env, user.id, targetId)) throw new HttpError(409, '已经是好友了');
    const dup = await env.DB.prepare(
      "SELECT id FROM friend_requests WHERE fromId=?1 AND toId=?2 AND status='pending'"
    ).bind(user.id, targetId).first();
    if (dup) return json({ ok: true, requestId: dup.id, duplicated: true }, 200, env);
    const rid = uuid();
    await env.DB.prepare(
      'INSERT INTO friend_requests (id, fromId, toId, status, createdAt) VALUES (?1, ?2, ?3, ?4, ?5)'
    ).bind(rid, user.id, targetId, 'pending', Date.now()).run();
    await notify(env, targetId, {
      type: 'friend_request',
      data: { requestId: rid, from: { id: user.id, displayName: user.displayName, avatar: user.avatar } },
    });
    return json({ ok: true, requestId: rid }, 200, env);
  }
  throw new HttpError(405, '方法不支持');
}

async function handleFriendRequestRespond(request, env, user, requestId) {
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  if (!['accept', 'reject'].includes(action)) throw new HttpError(400, "action 必须是 'accept' | 'reject'");
  const req = await env.DB.prepare(
    "SELECT * FROM friend_requests WHERE id=?1 AND toId=?2 AND status='pending'"
  ).bind(requestId, user.id).first();
  if (!req) throw new HttpError(404, '好友请求不存在或已处理');
  await env.DB.prepare('UPDATE friend_requests SET status=?1 WHERE id=?2')
    .bind(action === 'accept' ? 'accepted' : 'rejected', requestId).run();
  if (action === 'accept') {
    const [a, b] = [req.fromId, user.id].sort();
    await env.DB.prepare('INSERT OR IGNORE INTO friends (userA, userB, createdAt) VALUES (?1, ?2, ?3)').bind(a, b, Date.now()).run();
  }
  await notify(env, req.fromId, {
    type: 'friend_request_result',
    data: { requestId, action, by: { id: user.id, displayName: user.displayName } },
  });
  return json({ ok: true, action }, 200, env);
}

async function handleFriendDelete(request, env, user, friendId) {
  const [a, b] = [user.id, friendId].sort();
  const r = await env.DB.prepare('DELETE FROM friends WHERE userA=?1 AND userB=?2').bind(a, b).run();
  if (!r.meta.changes) throw new HttpError(404, '好友不存在');
  return json({ ok: true }, 200, env);
}

async function handleMessages(request, env, user, url) {
  // 兼容两种字段：chatId（N聊规范） / chat（Nexus 前端旧字段）
  const chatId = url.searchParams.get('chatId') || url.searchParams.get('chat') || WORLD_CHAT;
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
  if (chatId !== WORLD_CHAT) {
    const m = /^friend:(.+):(.+)$/.exec(chatId);
    if (!m || !m.includes(user.id)) throw new HttpError(403, '无权读取该聊天');
    if (!(await isFriend(env, m[1], m[2]))) throw new HttpError(403, '仅好友之间可读私聊');
  }
  const rows = await env.DB.prepare(
    'SELECT id, senderId, content, timestamp FROM messages WHERE chatId=?1 ORDER BY timestamp DESC LIMIT 50 OFFSET ?2'
  ).bind(chatId, offset).all();
  const messages = [];
  for (const r of (rows.results || []).reverse()) {
    const info = await getUserName(env, r.senderId);
    // 同时给两套字段：senderId/content/timestamp（规范） + from/text/ts（前端旧字段）
    messages.push({
      id: r.id, senderId: r.senderId, content: r.content, timestamp: r.timestamp,
      from: r.senderId, text: r.content, ts: r.timestamp,
      sender: { displayName: info.displayName },
    });
  }
  return json({ ok: true, chatId, messages }, 200, env);
}

/** POST /api/messages：REST 发送（兼容 chat/chatId、text/content；senderId 一律取认证用户） */
async function handlePostMessage(request, env, user) {
  let b;
  try { b = await request.json(); } catch (e) { throw new HttpError(400, '请求体不是 JSON'); }
  b = b || {};
  const chatId = String(b.chatId || b.chat || WORLD_CHAT).trim() || WORLD_CHAT;
  const content = String(b.content != null ? b.content : (b.text || '')).trim().slice(0, 4000);
  if (!content) throw new HttpError(400, '消息内容不能为空');

  if (chatId !== WORLD_CHAT) {
    const m = /^friend:(.+):(.+)$/.exec(chatId);
    if (!m || !m.includes(user.id)) throw new HttpError(403, '无权发送到该聊天');
    if (!(await isFriend(env, m[1], m[2]))) throw new HttpError(403, '仅好友之间可私聊');
  }

  const msg = { id: uuid(), chatId, senderId: user.id, content, timestamp: Date.now() };
  await env.DB.prepare(
    'INSERT INTO messages (id, chatId, senderId, content, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)'
  ).bind(msg.id, msg.chatId, msg.senderId, msg.content, msg.timestamp).run();

  const payload = {
    type: 'message',
    data: {
      id: msg.id, chatId, senderId: msg.senderId, content: msg.content, timestamp: msg.timestamp,
      from: msg.senderId, text: msg.content, ts: msg.timestamp,
      sender: { displayName: user.displayName },
    },
  };
  try {
    const stub = env.ROOM.get(env.ROOM.idFromName('chat:' + chatId));
    await stub.fetch('https://room/broadcast', { method: 'POST', body: JSON.stringify(payload) });
  } catch (e) { /* 无人在线则忽略 */ }

  return json({ ok: true, chatId, message: payload.data }, 200, env);
}

async function handleChats(request, env, user) {
  const chats = [{ id: WORLD_CHAT, name: '方聊大厅', kind: 'world', online: true }];
  const rows = await env.DB.prepare(
    'SELECT CASE WHEN userA=?1 THEN userB ELSE userA END AS fid FROM friends WHERE userA=?1 OR userB=?1'
  ).bind(user.id).all();
  for (const row of rows.results || []) {
    const info = await getUserName(env, row.fid);
    chats.push({ id: chatIdOf(user.id, row.fid), name: info.displayName, kind: 'friend', friendId: row.fid, online: false });
  }
  return json({ ok: true, chats }, 200, env);
}

async function handleUserSearch(request, env, user, url) {
  const q = (url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
  if (!q) return json({ ok: true, users: [] }, 200, env);
  const rows = await env.DB.prepare(
    'SELECT id, displayName, avatar FROM users WHERE id=?1 OR displayName LIKE ?2 OR email LIKE ?2 LIMIT 10'
  ).bind(q, '%' + q + '%').all();
  return json({ ok: true, users: (rows.results || []).map((u) => ({ id: u.id, displayName: u.displayName, avatar: u.avatar || '' })) }, 200, env);
}

/* ============ 开发模式账户（AUTH_API_BASE 为空时可用；生产请接 MXOS） ============ */
async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function handleDevAccount(request, env, mode) {
  const body = await request.json().catch(() => ({}));
  const emailU = String(body.email || '').trim().toLowerCase();
  const pass = String(body.password || '');
  const displayName = String(body.displayName || emailU.split('@')[0] || '用户');
  if (!emailU || !pass) throw new HttpError(400, '需要 email 与 password');
  const uid = 'u_' + (await sha256Hex(emailU)).slice(0, 16);
  const row = await env.DB.prepare('SELECT * FROM users WHERE id=?1').bind(uid).first();
  if (mode === 'register') {
    if (row) throw new HttpError(409, '该邮箱已注册');
    const salt = uuid();
    await env.DB.prepare(
      'INSERT INTO users (id, displayName, email, avatar, passHash, salt, createdAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    ).bind(uid, displayName, emailU, '', await sha256Hex(salt + pass), salt, Date.now()).run();
  } else {
    if (!row || row.passHash !== (await sha256Hex(row.salt + pass))) throw new HttpError(401, '邮箱或密码错误');
  }
  const u = { id: uid, displayName: row ? row.displayName : displayName, email: emailU, avatar: '' };
  return json({
    ok: true,
    token: 'dev.' + b64url.enc(JSON.stringify(u)),
    user: { id: u.id, displayName: u.displayName, email: u.email, avatar: u.avatar },
  }, 200, env);
}

/* ================= 通知（跨用户投递） ================= */
async function notify(env, userId, event) {
  try {
    const stub = env.ROOM.get(env.ROOM.idFromName('user:' + userId));
    await stub.fetch('https://room/notify', { method: 'POST', body: JSON.stringify(event) });
  } catch (e) { /* 对方不在线则忽略 */ }
}

/* ================= Room Durable Object（内存扇出） ================= */
export class Room {
  constructor(state, env) { this.state = state; this.env = env; this.sockets = new Set(); }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/notify') {
      const event = await request.json();
      this.broadcast(JSON.stringify(event));
      return new Response('ok');
    }
    if (url.pathname === '/connect') {
      const pair = new WebSocketPair();
      pair[1].accept();                       // 常驻内存模式（连接数可控，逻辑最简单）
      this.sockets.add(pair[1]);
      pair[1].addEventListener('close', () => this.sockets.delete(pair[1]));
      pair[1].addEventListener('message', (ev) => {
        try {
          const d = JSON.parse(ev.data);
          if (d && d.type === 'ping') pair[1].send(JSON.stringify({ type: 'pong' }));
        } catch (e) { /* ignore */ }
      });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === '/broadcast') {
      this.broadcast(await request.text());
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  }

  broadcast(msg) {
    for (const ws of this.sockets) { try { ws.send(msg); } catch (e) { this.sockets.delete(ws); } }
  }
}

/* ================= WebSocket 升级（双 pair 桥接） ================= */
async function handleWs(request, env, url, kind) {
  // 1) 从 Sec-WebSocket-Protocol 取 nliao-auth.<token>
  const proto = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map((s) => s.trim());
  let token = null;
  for (const p of proto) if (p.startsWith('nliao-auth.')) token = p.slice('nliao-auth.'.length);
  const user = await authUserFromToken(env, token);
  await ensureUser(env, user);

  // 2) 确定房间
  let roomName, chatId = null;
  if (kind === 'chat') {
    chatId = url.searchParams.get('chatId') || WORLD_CHAT;
    if (chatId !== WORLD_CHAT) {
      const m = /^friend:(.+):(.+)$/.exec(chatId);
      if (!m || !m.includes(user.id)) throw new HttpError(403, '无权进入该聊天');
      if (!(await isFriend(env, m[1], m[2]))) throw new HttpError(403, '仅好友之间可私聊');
    }
    roomName = 'chat:' + chatId;
  } else {
    roomName = 'user:' + user.id;
  }
  const stub = env.ROOM.get(env.ROOM.idFromName(roomName));

  // 3) 双 pair 桥接：bp ↔ Worker 逻辑 ↔ Room
  const bp = new WebSocketPair();                                   // bp[0]→浏览器
  const up = await stub.fetch('https://room/connect', { headers: { 'Upgrade': 'websocket' } });
  const roomServer = up.webSocket;                                  // Room 的 rp[0]

  // Room → 浏览器：转发广播/通知
  roomServer.addEventListener('message', (ev) => {
    try { bp[1].send(ev.data); } catch (e) { /* ignore */ }
  });

  // 浏览器 → Room：校验 + 持久化 + 广播
  bp[1].addEventListener('message', async (ev) => {
    let d = null;
    try { d = JSON.parse(ev.data); } catch (e) { return; }
    if (!d || d.type === 'ping') return;
    if (d.type !== 'message' || !d.payload || !d.payload.content) return;
    const msg = {
      id: uuid(),
      senderId: user.id,
      content: String(d.payload.content).slice(0, 4000),
      timestamp: Number(d.payload.timestamp) || Date.now(),
    };
    if (kind !== 'chat') return;                                    // 通知通道只收不发明文消息
    try {
      await env.DB.prepare('INSERT INTO messages (id, chatId, senderId, content, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(msg.id, chatId, msg.senderId, msg.content, msg.timestamp).run();
    } catch (e) { /* 持久化失败也不中断聊天 */ }
    const out = JSON.stringify({
      type: 'message',
      data: { id: msg.id, content: msg.content, senderId: msg.senderId, sender: { displayName: user.displayName }, timestamp: msg.timestamp },
    });
    try { await stub.fetch('https://room/broadcast', { method: 'POST', body: out }); } catch (e) { /* ignore */ }
  });

  // 4) 以 nliao-v1 子协议回应
  return new Response(null, { status: 101, webSocket: bp[0], headers: { 'Sec-WebSocket-Protocol': 'nliao-v1' } });
}

/* ================= 路由 ================= */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });

      // —— 开发模式账户（生产接 MXOS 后自动关闭）——
      if (!env.AUTH_API_BASE && url.pathname === '/api/dev/register' && request.method === 'POST') return await handleDevAccount(request, env, 'register');
      if (!env.AUTH_API_BASE && url.pathname === '/api/dev/login' && request.method === 'POST') return await handleDevAccount(request, env, 'login');

      // —— WS 票据（Bearer）——
      if (url.pathname === '/api/ws-ticket') {
        const user = await authUser(request, env);
        await ensureUser(env, user);
        return json({ ok: true, ticket: await makeTicket(env, user) }, 200, env);
      }
      // —— WS（子协议认证）——
      if (url.pathname === '/api/ws') return await handleWs(request, env, url, 'chat');
      if (url.pathname === '/api/notifications/ws') return await handleWs(request, env, url, 'notify');

      // —— REST（全部要求 Bearer）——
      const user = await authUser(request, env);
      await ensureUser(env, user);

      if (url.pathname === '/api/friends' && request.method === 'GET') return await handleFriends(request, env, user);
      if (url.pathname === '/api/friends/request' && (request.method === 'GET' || request.method === 'POST')) return await handleFriendRequests(request, env, user, url);
      const mRespond = /^\/api\/friends\/request\/([^/]+)$/.exec(url.pathname);
      if (mRespond && request.method === 'PUT') return await handleFriendRequestRespond(request, env, user, mRespond[1]);
      const mDel = /^\/api\/friends\/([^/]+)$/.exec(url.pathname);
      if (mDel && request.method === 'DELETE') return await handleFriendDelete(request, env, user, mDel[1]);
      if (url.pathname === '/api/messages' && request.method === 'GET') return await handleMessages(request, env, user, url);
      if (url.pathname === '/api/messages' && request.method === 'POST') return await handlePostMessage(request, env, user);
      if (url.pathname === '/api/chats' && request.method === 'GET') return await handleChats(request, env, user);
      if (url.pathname === '/api/users/search' && request.method === 'GET') return await handleUserSearch(request, env, user, url);

      if (url.pathname === '/' || url.pathname === '') {
        return json({
          ok: true,
          service: 'nexus-nliao',
          spec: 'N聊 API v1（见 API文档大全.md 第一部分）',
          auth: env.AUTH_API_BASE ? 'mxos' : 'dev-mode',
        }, 200, env);
      }
      return json({ ok: false, error: 'not found' }, 404, env);
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.message }, e.status, env);
      return json({ ok: false, error: '服务器内部错误：' + (e && e.message) }, 500, env);
    }
  },
};
