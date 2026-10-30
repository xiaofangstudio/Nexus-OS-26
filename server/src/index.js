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
 *
 * 鉴权：请求头二选一
 *   Authorization: Bearer sk-xxxx        （推荐，兼容 OpenAI SDK 习惯）
 *   X-AI-Key: sk-xxxx
 * ============================================================
 */

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

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AI-Key, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  };
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

/** B站 API 反向代理：/api/bili/* -> https://api.bilibili.com/*，补 CORS + 风控头
 *  浏览器直连 B站 API 会被 CORS 拦 + 无 Referer/UA 会触发 -412 风控；本代理补齐两者。
 *  可选请求头 X-Bili-Cookie：透传用户自己的 B站 Cookie（搜索等需登录态的接口用）。 */
// —— B站设备指纹（buvid3/buvid4）自动获取 + 模块级缓存 ——
// 无 cookie 的云 IP 访问 B站 web API 会被风控 -412；带上 buvid3 即可放行。
let BILI_BUVID = null;          // 'buvid3=...; buvid4=...'
let BILI_BUVID_TS = 0;          // 获取时间戳
async function getBiliBuvid() {
  if (BILI_BUVID && Date.now() - BILI_BUVID_TS < 24 * 3600 * 1000) return BILI_BUVID;
  try {
    const r = await fetch('https://api.bilibili.com/x/frontend/finger/spi', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
      },
    });
    const j = await r.json();
    const b3 = j && j.data && j.data.b_3, b4 = j && j.data && j.data.b_4;
    if (b3) {
      BILI_BUVID = 'buvid3=' + b3 + (b4 ? '; buvid4=' + b4 : '') + '; b_nut=' + Date.now();
      BILI_BUVID_TS = Date.now();
    }
  } catch (e) { /* 获取失败则不带，尽力而为 */ }
  return BILI_BUVID;
}

/* 方哩方哩短路由表：前端只记 /api/popular 这种好读的名字，
   这里翻译成 B站真实路径。原来前端拼出来的地址和 B站接口对不上，
   等于代理永远 404 —— 这是「配了 Worker 也看不了」的第二个坑。 */
const BILI_SHORTCUT = {
  '/popular': '/x/web-interface/popular',
  '/ranking': '/x/web-interface/ranking/v2',
  '/rank': '/x/web-interface/ranking/v2',
  '/search': '/x/web-interface/search/type'
};

async function handleBili(request, env, url) {
  let sub = url.pathname.replace(/^\/api\/bili/, '') || '/';
  // 兼容前端多拼一层 /api：/api/bili/api/popular → /popular
  if (/^\/api\//.test(sub)) sub = sub.slice(4);

  const params = new URLSearchParams(url.search || '');
  if (BILI_SHORTCUT[sub]) {
    sub = BILI_SHORTCUT[sub];
    // 搜索接口必须带 search_type，否则 B站返回 -400
    if (sub === '/x/web-interface/search/type' && !params.get('search_type')) {
      params.set('search_type', 'video');
    }
  }
  const qs = params.toString();
  const target = 'https://api.bilibili.com' + sub + (qs ? '?' + qs : '');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
    'Origin': 'https://www.bilibili.com',
    'Accept': 'application/json, text/plain, */*',
  };
  const cookie = request.headers.get('X-Bili-Cookie');
  if (cookie) {
    headers['Cookie'] = cookie; // 用户自带，服务器不存
  } else {
    const buvid = await getBiliBuvid(); // 无用户 cookie 时带设备指纹过风控
    if (buvid) headers['Cookie'] = buvid;
  }

  const init = { method: request.method, headers };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try { init.body = await request.arrayBuffer(); } catch (e) { /* ignore */ }
  }

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    return json({ ok: false, error: 'bili upstream unreachable: ' + (e && e.message) }, 502, env);
  }

  const out = corsHeaders(env);
  const upCt = upstream.headers.get('Content-Type');
  if (upCt) out['Content-Type'] = upCt;
  out['X-Bili-Upstream-Status'] = String(upstream.status);
  return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: out });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });

    if (url.pathname === '/api/health' || url.pathname === '/healthz') {
      return json({
        ok: true,
        service: 'nexus-os-ai',
        version: '2.0.0-byok',
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
    // OpenAI 兼容端点：Base URL 填 https://ai.fanggame.company/v1 即可直接用
    if (url.pathname === '/v1/chat/completions' || url.pathname === '/chat/completions') return handleChat(request, env, true);
    if (url.pathname === '/v1/models') {
      return json({ object: 'list', data: Object.keys(PROVIDERS).map(id => ({ id: PROVIDERS[id].model, object: 'model', owned_by: id })) }, 200, env);
    }
    if (url.pathname.startsWith('/api/mx')) return handleMx(request, env, url);
    if (url.pathname.startsWith('/api/bili')) return handleBili(request, env, url);

    if (url.pathname === '/' || url.pathname === '') {
      return json({ ok: true, hint: 'Nexus OS 26 AI backend (BYOK). POST /api/chat with your own key in Authorization header.' }, 200, env);
    }
    return json({ ok: false, error: 'not found' }, 404, env);
  },
};
