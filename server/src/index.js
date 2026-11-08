/**
 * ============================================================
 * Nexus OS 26 · AI 小方后端（Cloudflare Worker）· BYOK 版
 * ------------------------------------------------------------
 * 原则：**后端不持有任何 API Key，也不花站长的钱。**
 *   每个用户在自己的 Nexus OS 设置里填自己的 Key（存本地），请求时随请求带上；
 *   本 Worker 只做两件事：补 CORS（各 AI 官方接口都不给浏览器跨域）+ 转发。
 *   用户 Key 用完即走，不落盘、不打日志、不写 KV。
 *
 * 接口：
 *   POST /api/chat   —— OpenAI 兼容转发（用户自带 Key；支持 tools/流式/多供应商）
 *   GET  /api/health —— 服务状态与支持的供应商列表（无任何密钥信息）
 *   ALL  /api/mx/*   —— MX 应用商店反向代理（补 CORS、绕 http 混合内容）
 *   POST /api/translate        —— 字幕逐句翻译中转（Google，KV 缓存 30 天）
 *   GET  /api/translate?selftest=1 —— 探测 Google 出口是否可达
 *
 * 鉴权：请求头二选一
 *   Authorization: Bearer sk-xxxx        （推荐，兼容 OpenAI SDK 习惯）
 *   X-AI-Key: sk-xxxx
 * ============================================================
 */

import { handleAccount } from './account.js';
import { handleStore } from './store.js';
import { handleStoreV1 } from './store_v1.js';
import { handleMusic } from './music.js';
import { handleNexusAdmin } from './admin.js';
import { handleBili } from './bili.js';
import { handleTranslate } from './translate.js';
import { handleWeather } from './weather.js';
import { handleMap } from './map.js';
import { handleNews } from './news.js';
import { handleV1 } from './v1/index.js';
import { corsHeaders as corsBase } from './http.js';

/** 内置供应商（只含地址与默认模型，绝不含密钥） */
const PROVIDERS = {
  deepseek:   { name: 'DeepSeek',    baseUrl: 'https://api.deepseek.com/v1',                       model: 'deepseek-chat' },
  openai:     { name: 'OpenAI',      baseUrl: 'https://api.openai.com/v1',                         model: 'gpt-4o-mini' },
  qwen:       { name: '通义千问',    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  moonshot:   { name: 'Moonshot',    baseUrl: 'https://api.moonshot.cn/v1',                        model: 'moonshot-v1-8k' },
  zhipu:      { name: '智谱 GLM',    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',              model: 'glm-4-flash' },
  siliconflow:{ name: '硅基流动',    baseUrl: 'https://api.siliconflow.cn/v1',                     model: 'Qwen/Qwen2.5-7B-Instruct' },
  groq:       { name: 'Groq',        baseUrl: 'https://api.groq.com/openai/v1',                    model: 'llama-3.1-8b-instant' },
  ollama:     { name: '本地 Ollama', baseUrl: 'http://127.0.0.1:11434/v1',                          model: 'qwen2.5:7b' },
};

/** CORS 白名单：ALLOW_ORIGIN 支持 "*" 或逗号分隔的来源列表（见 http.js） */
function corsHeaders(env, request) {
  return corsBase(env, request);
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders(env || {})),
  });
}

/** 从请求头取出用户自己的 Key（没有就不给用，绝不回退到站长 Key） */
function userKey(request) {
  const auth = request.headers.get('Authorization') || '';
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  const k = request.headers.get('X-AI-Key');
  return k ? k.trim() : '';
}

/** 防 SSRF：自定义 baseUrl 只允许 https，且拒绝内网/本地地址（明确的本机 Ollama 除外） */
function isSafeBaseUrl(u) {
  if (!u) return false;
  let url;
  try { url = new URL(u); } catch (e) { return false; }
  if (url.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)) return true; // 本机 Ollama
  if (url.protocol !== 'https:') return false;
  const h = url.hostname;
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
  if (/\.(internal|local|localhost)$/i.test(h)) return false;
  return true;
}

/** 按模型名猜供应商（OpenAI 兼容端点的模型名通常能区分） */
function inferProvider(model) {
  if (!model) return 'deepseek';
  var m = String(model).toLowerCase();
  if (/^gpt|^o[134]|^chatgpt/.test(m)) return 'openai';
  if (/^qwen|^qwq/.test(m)) return 'qwen';
  if (/^glm/.test(m)) return 'zhipu';
  if (/^moonshot|^kimi/.test(m)) return 'moonshot';
  if (/^llama|^mixtral/.test(m)) return 'groq';
  return 'deepseek';
}

function resolveTarget(body) {
  if (body.provider && PROVIDERS[body.provider]) {
    const p = PROVIDERS[body.provider];
    return { id: body.provider, baseUrl: p.baseUrl, model: body.model || p.model };
  }
  if (body.baseUrl) {
    if (!isSafeBaseUrl(body.baseUrl)) return { error: 'baseUrl 不安全或不支持（仅允许 https，禁止内网地址）' };
    return { id: 'custom', baseUrl: String(body.baseUrl).replace(/\/+$/, ''), model: body.model || 'gpt-4o-mini' };
  }
  // 未指定供应商：按模型名推断（默认 DeepSeek）
  const id = inferProvider(body.model);
  const p = PROVIDERS[id] || PROVIDERS.deepseek;
  return { id: id, baseUrl: p.baseUrl, model: body.model || p.model };
}

function buildPayload(body, target, stream) {
  const payload = {
    model: body.model || target.model,
    messages: Array.isArray(body.messages) ? body.messages : [],
  };
  const passthrough = ['temperature', 'top_p', 'max_tokens', 'n', 'stop', 'presence_penalty',
    'frequency_penalty', 'seed', 'response_format', 'tools', 'tool_choice', 'parallel_tool_calls'];
  for (const k of passthrough) if (body[k] !== undefined) payload[k] = body[k];
  if (stream) payload.stream = true;
  return payload;
}

function oaiError(message, status, env, type) {
  return new Response(JSON.stringify({ error: { message: message, type: type || 'upstream_error' } }), {
    status: status || 400,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders(env)),
  });
}

async function handleChat(request, env, raw) {
  const fail = (msg, status, code, extra) => raw
    ? oaiError(msg, status, env, code)
    : json(Object.assign({ ok: false, code: code, error: msg }, extra || {}), status, env);

  if (request.method !== 'POST') return fail('POST only', 405, 'METHOD');

  let body;
  try { body = await request.json(); } catch (e) { return fail('invalid JSON body', 400, 'BAD_JSON'); }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return fail('messages required', 400, 'NO_MESSAGES');
  }

  // 开发用 mock（需显式 MOCK_AI=true，默认关）
  if (env.MOCK_AI === 'true') {
    const lastUser = [...body.messages].reverse().find(m => m.role === 'user');
    const reply = `【模拟回复】收到：「${String(lastUser && lastUser.content || '').slice(0, 120)}」。请在你的 Nexus OS 设置里填入自己的 API Key。`;
    if (raw) {
      return new Response(JSON.stringify({
        id: 'mock', object: 'chat.completion', model: 'mock',
        choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }), { headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(env)) });
    }
    return json({ ok: true, mock: true, provider: 'mock', content: reply, tool_calls: null, finish_reason: 'stop' }, 200, env);
  }

  // BYOK：没带 Key 就明确提示去设置里填，绝不偷偷用站长的
  const key = userKey(request);
  if (!key) {
    return fail('未提供 API Key。请在本机 Nexus OS 设置 → AI 小方 里填入你自己的 Key（只存你本机，不会上传到服务器）。', 401, 'NO_KEY');
  }

  const target = resolveTarget(body);
  if (target.error) return fail(target.error, 400, 'BAD_TARGET');

  const stream = !!body.stream;
  const url = target.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const payload = buildPayload(body, target, stream);

  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return fail('无法连接上游：' + (e && e.message), 502, 'UPSTREAM_FETCH');
  }

  if (stream && upstream.ok) {
    const headers = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    };
    Object.assign(headers, corsHeaders(env));
    return new Response(upstream.body, { status: 200, headers });
  }

  let data = null, textBody = '';
  try { textBody = await upstream.text(); } catch (e) { /* ignore */ }
  try { data = JSON.parse(textBody); } catch (e) { /* 上游可能返回纯文本错误 */ }

  if (!upstream.ok) {
    const msg = (data && data.error && (data.error.message || data.error)) || textBody.slice(0, 500) || ('HTTP ' + upstream.status);
    return fail(String(msg), upstream.status >= 500 ? 502 : upstream.status, upstream.status === 401 ? 'BAD_KEY' : 'UPSTREAM_ERROR', { status: upstream.status, provider: target.id });
  }
  if (!data) return fail('上游返回非 JSON', 502, 'NON_JSON', { raw: textBody.slice(0, 300) });

  // OpenAI 兼容模式：原样返回上游响应（供 /v1/chat/completions 用）
  if (raw) {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders(env)),
    });
  }

  const choice = (data.choices && data.choices[0]) || {};
  const message = choice.message || {};
  return json({
    ok: true,
    provider: target.id,
    model: data.model || target.model,
    content: message.content == null ? '' : message.content,
    tool_calls: message.tool_calls || null,
    finish_reason: choice.finish_reason || null,
    usage: data.usage || null,
  }, 200, env);
}

/** MX 应用商店反向代理：/api/mx/apps -> {MX_STORE_BASE}/apps，补 CORS */
async function handleMx(request, env, url) {
  const base = (env.MX_STORE_BASE || '').replace(/\/+$/, '');
  if (!base) return json({ ok: false, error: 'MX_STORE_BASE not configured' }, 503, env);

  const sub = url.pathname.replace(/^\/api\/mx/, '') || '/';
  const target = base + sub + (url.search || '');

  const init = { method: request.method, headers: {} };
  const ct = request.headers.get('Content-Type');
  if (ct) init.headers['Content-Type'] = ct;
  const auth = request.headers.get('Authorization');
  if (auth) init.headers['Authorization'] = auth; // 管理接口 Bearer 透传
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try { init.body = await request.arrayBuffer(); } catch (e) { /* ignore */ }
  }

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    return json({ ok: false, error: 'MX upstream unreachable: ' + (e && e.message) }, 502, env);
  }

  const headers = corsHeaders(env);
  const upCt = upstream.headers.get('Content-Type');
  if (upCt) headers['Content-Type'] = upCt;
  const sha = upstream.headers.get('X-Content-SHA256');
  if (sha) headers['X-Content-SHA256'] = sha;
  const cd = upstream.headers.get('Content-Disposition');
  if (cd) headers['Content-Disposition'] = cd;
  headers['X-MX-Upstream-Status'] = String(upstream.status);

  return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
}

/* B站代理已拆分到 src/bili.js（WBI 签名 / 播放地址 / 图片与视频流代理 / KV 缓存）：
   /api/bili/feed|search|video|play|related|danmaku|subtitle|img|stream|health
   字幕翻译中转在 src/translate.js：POST /api/translate（GET ?selftest=1 自检） */

/**
 * 方聊（N聊）认证桥：/api/auth/me
 * nliao Worker 以 AUTH_API_BASE=https://ai.fanggame.company 调用本端点；
 * 这里把 Authorization: Bearer <Nexus 账号 token> 转给 /api/acc/me 校验，
 * 再摊平成 nliao 期望的 { ok, user:{ id, displayName, avatar, email } }。
 * 账号 token 只做校验，不落盘、不打日志。
 */
async function handleAuthMe(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = /^Bearer\s+/i.test(auth)
    ? auth.replace(/^Bearer\s+/i, '').trim()
    : (new URL(request.url).searchParams.get('token') || '');
  if (!token) return json({ ok: false, code: 'NO_TOKEN', error: '缺少会话令牌' }, 401, env);

  const u = new URL(request.url);
  u.pathname = '/api/acc/me';
  u.search = '?token=' + encodeURIComponent(token);
  let res;
  try { res = await handleAccount(request, env, u); }
  catch (e) { return json({ ok: false, code: 'AUTH_UPSTREAM', error: '账号服务不可用' }, 502, env); }

  const j = await res.json().catch(() => null);
  if (!j || !j.ok || !j.account) {
    return json({ ok: false, code: 'BAD_TOKEN', error: (j && j.error) || '登录已过期，请重新登录' }, 401, env);
  }
  const a = j.account;
  return json({
    ok: true,
    user: {
      id: a.accountName,
      displayName: a.userName || a.accountName,
      avatar: a.avatar || '',
      email: a.email || '',
      uid: a.uid,
      accountName: a.accountName,
    },
  }, 200, env);
}

/**
 * v2.9.61 · 必应每日壁纸（服务端反代）
 * 前端零外部 CDN 铁律：不直连 bing.com，统一走自有 Worker 补 CORS + 缓存。
 * 只返回元信息（图片 URL / 标题 / 版权），不代存图片，不落任何用户数据。
 */
async function handleBingDaily(request, env) {
  const cors = corsHeaders(env, request);
  const mkt = new URL(request.url).searchParams.get('mkt') || 'zh-CN';
  try {
    const upstream = await fetch(
      'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=' + encodeURIComponent(mkt),
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexusOS26/1.0)' }, cf: { cacheTtl: 3600 } }
    );
    if (!upstream.ok) throw new Error('upstream ' + upstream.status);
    const j = await upstream.json();
    const im = j && j.images && j.images[0];
    if (!im || !im.url) throw new Error('empty image');
    const full = /^https?:\/\//.test(im.url) ? im.url : 'https://www.bing.com' + im.url;
    return new Response(JSON.stringify({
      ok: true,
      url: full,
      title: im.title || '',
      copyright: im.copyright || '',
      date: im.startdate || ''
    }), {
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: String(e && e.message || e) }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, request) });

    if (url.pathname === '/api/health' || url.pathname === '/healthz') {
      return json({
        ok: true,
        service: 'nexus-os-ai',
        version: '3.2.0-review',
        mode: 'byok',
        ownerKey: false, // 明确：服务器不持有任何人的 Key
        providers: Object.keys(PROVIDERS).map(id => ({ id, name: PROVIDERS[id].name, model: PROVIDERS[id].model })),
        mxBase: env.MX_STORE_BASE || null,
      }, 200, env);
    }

    if (url.pathname === '/api/models') {
      return json({ ok: true, providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, model: p.model })) }, 200, env);
    }

    if (url.pathname === '/api/chat') return handleChat(request, env, false);
    // 方聊（N聊）认证桥：nliao Worker 用 Bearer token 换取用户信息
    if (url.pathname === '/api/auth/me') return handleAuthMe(request, env);
    // OpenAI 兼容端点：Base URL 填 https://ai.fanggame.company/v1 即可直接用
    if (url.pathname === '/v1/chat/completions' || url.pathname === '/chat/completions') return handleChat(request, env, true);
    if (url.pathname === '/v1/models') {
      return json({ object: 'list', data: Object.keys(PROVIDERS).map(id => ({ id: PROVIDERS[id].model, object: 'model', owned_by: id })) }, 200, env);
    }
    // v3.1：Nexus Cloud API v1（开发者 / 应用 / 版本 / 审核 / CDN / 遥测）
    if (url.pathname.startsWith('/api/v1')) {
      const res = await handleV1(request, env, ctx, url);
      const h = new Headers(res.headers);
      Object.entries(corsHeaders(env, request)).forEach(([k, v]) => h.set(k, v));
      if (request.method === 'HEAD') return new Response(null, { status: res.status, headers: h });
      return new Response(res.body, { status: res.status, headers: h });
    }
    // v2.9.47：Nexus 账号服务（注册 / 登录 / 查重 / 改资料 / 加好友查询）
    if (url.pathname.startsWith('/api/acc')) {
      const res = await handleAccount(request, env, url);
      // 统一补 CORS（account.js 里只写了 Content-Type）
      const h = new Headers(res.headers);
      Object.entries(corsHeaders(env, request)).forEach(([k, v]) => h.set(k, v));
      return new Response(res.body, { status: res.status, headers: h });
    }
    if (url.pathname.startsWith('/api/mx')) return handleMx(request, env, url);
    if (url.pathname.startsWith('/api/translate')) return handleTranslate(request, env, url);
    if (url.pathname.startsWith('/api/bili')) return handleBili(request, env, url);
    // v3.2：和风天气 / 高德地图 / 新闻 RSS（key 只走 Worker secrets）
    if (url.pathname.startsWith('/api/weather')) return handleWeather(request, env, url);
    if (url.pathname.startsWith('/api/map')) return handleMap(request, env, url);
    if (url.pathname.startsWith('/api/news')) return handleNews(request, env, url);
    // v2.9.61：必应每日壁纸（前端走同源反代，失败自动降级到内置壁纸）
    if (url.pathname === '/api/bing/daily') return handleBingDaily(request, env);
    // 开发者工坊 v1：稳定 appId / releaseId、版本、原始资源、预览令牌
    if (url.pathname.startsWith('/api/store/v1')) {
      const res = await handleStoreV1(request, env, url);
      const h = new Headers(res.headers);
      Object.entries(corsHeaders(env, request)).forEach(([k, v]) => h.set(k, v));
      return new Response(res.body, { status: res.status, headers: h });
    }
    // v2.9.52：应用/插件市场（上传 → 审核 → 上架 → 下载 → 后台管理）
    if (url.pathname.startsWith('/api/store')) {
      const res = await handleStore(request, env, url);
      const h = new Headers(res.headers);
      Object.entries(corsHeaders(env, request)).forEach(([k, v]) => h.set(k, v));
      return new Response(res.body, { status: res.status, headers: h });
    }
    // v2.9.53：音乐聚合层（网易/Deezer/iTunes；KV 复用 STORE_KV，键空间 music:* 隔离）
    if (url.pathname.startsWith('/api/music')) {
      env.MUSIC_KV = env.MUSIC_KV || env.STORE_KV;
      return handleMusic(request, env, url);
    }
    // v3.0：控制台管理接口（账号列表 / 注销 / 概览 / 内置应用清单）
    if (url.pathname.startsWith('/api/admin')) {
      const res = await handleNexusAdmin(request, env, url);
      const h = new Headers(res.headers);
      Object.entries(corsHeaders(env, request)).forEach(([k, v]) => h.set(k, v));
      return new Response(res.body, { status: res.status, headers: h });
    }

    if (url.pathname === '/' || url.pathname === '') {
      return json({ ok: true, hint: 'Nexus OS 26 AI backend (BYOK). POST /api/chat with your own key in Authorization header.' }, 200, env);
    }
    return json({ ok: false, error: 'not found' }, 404, env);
  },
};
