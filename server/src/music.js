/**
 * Nexus OS 26 · v2.9.53 音乐聚合层（/api/music/*）
 * ------------------------------------------------------------
 * 定位：本地曲库管理 + 在线试听发现。不承诺无损全曲库（版权红线）。
 *
 * 端点（全部 GET，全部带 CORS）：
 *   /api/music/search?q=&src=auto&limit=20   统一搜索（src=netease|itunes|deezer|auto）
 *   /api/music/url?src=&id=&br=              播放地址 → { ok, play(同源代理), br, preview }
 *                                            VIP/无版权 → { ok:false, reason:'vip' }
 *   /api/music/lrc?src=&id=                  LRC 歌词 → { ok, lrc }
 *   /api/music/toplist?board=hot|new|up      榜单（网易云，KV 缓存 1h）
 *   /api/music/cover?u=<b64>                 封面代理（破 referer 防盗链，域名白名单）
 *   /api/music/stream?u=<b64>                音频流代理（透传 Range；解决 http 混合内容）
 *
 * 降级链（src=auto）：netease → itunes → deezer。
 * 健康降权：某源连续失败 3 次 → KV 记录，30 分钟内 auto 跳过它。
 * 上游一律 8s 超时；KV 缓存：search 10min / url 10min / lrc 24h / toplist 1h。
 *
 * 上游事实（2026-11-05 实测）：
 *   - music.163.com 旧版开放端点免加密可用（需 Referer + appver Cookie）：
 *       /api/search/get/web（搜索）、/api/v3/song/detail（批量详情含封面）、
 *       /api/song/lyric（歌词）、/api/song/enhance/player/url（播放地址，免费歌有 url，
 *       VIP 返回 url:null —— 用它判 vip）、/api/playlist/detail（榜单）。
 *   - /api/search/pc 已封（-462 要手机绑定）；jkyapi 聚合 403 弃用。
 *   - Deezer 从境内 IP 不通，从 Cloudflare 出口可用（health 机制兜底）。
 *   - iTunes Search 免 Key，previewUrl 30s。
 */

const NE = 'https://music.163.com';
const UP_TIMEOUT = 8000;

// 音频/封面的域名白名单：代理只放行这些（防被当开放代理滥用）
const STREAM_HOSTS = [
  /(^|\.)music\.126\.net$/i,
  /(^|\.)music\.163\.com$/i,
  /(^|\.)dzcdn\.net$/i,
  /(^|\.)deezer\.com$/i,
  /(^|\.)mzstatic\.com$/i,
  /(^|\.)itunes\.apple\.com$/i,
  /(^|\.)apple\.com$/i,
  /(^|\.)injahow\.cn$/i,
];

const BOARDS = { hot: '3778678', new: '3779629', up: '19723756' };

// 免 key 的网易云镜像（Cloudflare 出口直连 music.163.com 搜索会 -462，用它对网易云取数）
const GD = 'https://music-api.gdstudio.xyz/api.php';
const VK = 'https://api.vkeys.cn/v2/music/netease';
const MT = 'https://api.injahow.cn/meting/';

/* ---------------- 工具 ---------------- */

function json(obj, status, env) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': (env && env.ALLOW_ORIGIN) || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
  return new Response(JSON.stringify(obj), { status: status || 200, headers: h });
}

function b64urlDecode(s) {
  try {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return atob(s);
  } catch (e) { return ''; }
}

async function upFetch(url, headers) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UP_TIMEOUT);
  try {
    return await fetch(url, { headers: headers || {}, signal: ctl.signal, redirect: 'follow' });
  } finally { clearTimeout(timer); }
}

async function kvGetJSON(env, key) {
  try { const v = await env.MUSIC_KV.get(key); return v ? JSON.parse(v) : null; }
  catch (e) { return null; }
}
async function kvPutJSON(env, key, val, ttl) {
  try { await env.MUSIC_KV.put(key, JSON.stringify(val), ttl ? { expirationTtl: ttl } : undefined); }
  catch (e) { /* KV 抖动不致命 */ }
}

/* ---------------- 健康降权 ---------------- */

async function healthGet(env) {
  return (await kvGetJSON(env, 'music:health')) || {};
}
async function healthMark(env, src, okFlag) {
  if (env.__mockHealth) return;                       // 单测注入
  const h = await healthGet(env);
  const e = h[src] || { fails: 0, until: 0 };
  if (okFlag) { e.fails = 0; e.until = 0; }
  else {
    e.fails = (e.fails || 0) + 1;
    if (e.fails >= 3) { e.until = Date.now() + 30 * 60 * 1000; e.fails = 0; }
  }
  h[src] = e;
  await kvPutJSON(env, 'music:health', h, 24 * 3600);
}
function srcBlocked(h, src) { const e = h[src]; return e && e.until && Date.now() < e.until; }

/* ---------------- 网易云（主源） ---------------- */

const NE_HEADERS = {
  'Referer': 'https://music.163.com/',
  'Cookie': 'appver=2.9.7; os=pc',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
};

async function neGet(env, path, cacheKey, ttl) {
  if (cacheKey) {
    const hit = await kvGetJSON(env, cacheKey);
    if (hit) return hit;
  }
  const res = await upFetch(NE + path, NE_HEADERS);
  if (!res.ok) throw new Error('ne http ' + res.status);
  const j = await res.json();
  if (j && (j.code === 200 || j.code === undefined)) {
    if (cacheKey) await kvPutJSON(env, cacheKey, j, ttl);
    return j;
  }
  throw new Error('ne code ' + (j && j.code));
}

/** 统一曲目 schema */
function neTrack(s) {
  const ar = s.ar || s.artists || [];
  const al = s.al || s.album || {};
  return {
    id: String(s.id),
    src: 'netease',
    name: s.name || '',
    artist: ar.map(a => a.name).filter(Boolean).join('/') || '未知歌手',
    album: al.name || '',
    cover: al.picUrl || '',
    dur: Math.round((s.dt || s.duration || 0) / 1000),
    fee: s.fee == null ? null : s.fee,
    preview: false,
  };
}

async function neSearch(env, q, limit) {
  const key = 'music:q2:ne:' + q + ':' + limit;
  const hit = await kvGetJSON(env, key);
  if (Array.isArray(hit) && hit.length) return hit;
  let lastErr = null;

  // ① 网易云官方（境内 IP 可用；CF 出口常 -462）
  try {
    const r1 = await neGet(env, '/api/search/get/web?s=' + encodeURIComponent(q) + '&type=1&limit=' + limit + '&offset=0', null, 0);
    const songs = (r1.result && r1.result.songs) || [];
    if (songs.length) {
      const ids = songs.slice(0, limit).map(s => ({ id: s.id }));
      let det = {};
      try {
        const r2 = await neGet(env, '/api/v3/song/detail?c=' + encodeURIComponent(JSON.stringify(ids)), null, 0);
        (r2.songs || []).forEach(s => { det[s.id] = s; });
      } catch (e) { /* 无封面也能出列表 */ }
      const out = songs.map(s => Object.assign(neTrack(det[s.id] || s), { playable: null, via: 'netease' }));
      await kvPutJSON(env, key, out, 600);
      return out;
    }
    lastErr = 'netease empty';
  } catch (e) { lastErr = 'netease ' + (e && e.message); }

  // ② VKeys（免 key，返回网易云曲库 + 封面）
  try {
    const out = await vkSearch(env, q, limit);
    if (out.length) { await kvPutJSON(env, key, out, 600); return out; }
    lastErr = 'vkeys empty';
  } catch (e) { lastErr = 'vkeys ' + (e && e.message); }

  // ③ GD Studio 镜像
  const tracks = await gdSearch(env, q, limit);
  if (tracks.length) { await kvPutJSON(env, key, tracks, 600); return tracks; }
  throw new Error(lastErr || 'netease unavailable');
}

async function neUrl(env, id, br) {
  const key = 'music:url:ne:' + id + ':' + br;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  try {
    const j = await neGet(env, '/api/song/enhance/player/url?ids=' + encodeURIComponent('[' + id + ']') + '&br=' + br, null, 0);
    const d = (j.data || [])[0] || {};
    if (d.url) {
      const out = { ok: true, url: d.url, br: d.br || br, type: d.type || 'mp3', via: 'netease' };
      await kvPutJSON(env, key, out, 600);                      // 网易 URL 签名约 20 分钟，缓存 10 分钟
      return out;
    }
  } catch (e) { /* 风控/超时 → 镜像兜底 */ }
  const mt = await mtUrl(env, id);
  if (mt && mt.ok) { await kvPutJSON(env, key, mt, 600); return mt; }
  const gd = await gdUrl(env, id, br);
  if (gd && gd.ok) { await kvPutJSON(env, key, gd, 600); return gd; }
  return { ok: false, reason: 'vip', playable: false };
}

async function neLrc(env, id) {
  const key = 'music:lrc:ne:' + id;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  try {
    const j = await neGet(env, '/api/song/lyric?id=' + id + '&lv=1&kv=1&tv=-1', null, 0);
    const out = { ok: true, lrc: (j.lrc && j.lrc.lyric) || '', via: 'netease' };
    if (out.lrc) { await kvPutJSON(env, key, out, 24 * 3600); return out; }
  } catch (e) { /* 走镜像 */ }
  const mt = await mtLrc(env, id);
  if (mt && mt.ok) { await kvPutJSON(env, key, mt, 24 * 3600); return mt; }
  const gd = await gdLrc(env, id);
  if (gd.ok) { await kvPutJSON(env, key, gd, 24 * 3600); return gd; }
  return { ok: true, lrc: '', via: 'none' };
}

async function neTop(env, board) {
  const pid = BOARDS[board] || BOARDS.hot;
  const key = 'music:top:' + board;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  const j = await neGet(env, '/api/playlist/detail?id=' + pid, null, 0);
  const tracks = ((j.result && j.result.tracks) || []).slice(0, 50).map(neTrack);
  const out = { ok: true, board, tracks };
  await kvPutJSON(env, key, out, 3600);
  return out;
}

/* ---------------- iTunes（兜底 1） ---------------- */

async function itSearch(env, q, limit) {
  const key = 'music:q:it:' + q + ':' + limit;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  const res = await upFetch('https://itunes.apple.com/search?term=' + encodeURIComponent(q) +
    '&media=music&entity=song&limit=' + limit + '&country=CN');
  if (!res.ok) throw new Error('itunes http ' + res.status);
  const j = await res.json();
  const out = (j.results || []).map(t => ({
    id: String(t.trackId),
    src: 'itunes',
    name: t.trackName || '',
    artist: t.artistName || '未知歌手',
    album: t.collectionName || '',
    cover: (t.artworkUrl100 || '').replace('100x100', '400x400'),
    dur: Math.round((t.trackTimeMillis || 0) / 1000),
    fee: null,
    preview: true,                       // iTunes 只有 30s 试听
  })).filter(t => t.name);
  await kvPutJSON(env, key, out, 600);
  return out;
}

async function itUrl(env, id) {
  const key = 'music:url:it:' + id;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  const res = await upFetch('https://itunes.apple.com/lookup?id=' + id + '&entity=song&country=CN');
  if (!res.ok) throw new Error('itunes http ' + res.status);
  const j = await res.json();
  const t = (j.results || []).find(x => String(x.trackId) === String(id) && x.previewUrl);
  if (!t || !t.previewUrl) return { ok: false, reason: 'vip' };
  const out = { ok: true, url: t.previewUrl, br: 0, type: 'm4a', preview: true };
  await kvPutJSON(env, key, out, 24 * 3600);
  return out;
}

/* ---------------- Deezer（兜底 2，境外出口可用） ---------------- */

async function dzSearch(env, q, limit) {
  const key = 'music:q:dz:' + q + ':' + limit;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  const res = await upFetch('https://api.deezer.com/search?q=' + encodeURIComponent(q) + '&limit=' + limit);
  if (!res.ok) throw new Error('deezer http ' + res.status);
  const j = await res.json();
  const out = (j.data || []).map(t => ({
    id: String(t.id),
    src: 'deezer',
    name: t.title || '',
    artist: (t.artist && t.artist.name) || '未知歌手',
    album: (t.album && t.album.title) || '',
    cover: (t.album && t.album.cover_medium) || '',
    dur: t.duration || 0,
    fee: null,
    preview: true,
  })).filter(t => t.name);
  await kvPutJSON(env, key, out, 600);
  return out;
}

async function dzUrl(env, id) {
  const key = 'music:url:dz:' + id;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  const res = await upFetch('https://api.deezer.com/track/' + id);
  if (!res.ok) throw new Error('deezer http ' + res.status);
  const t = await res.json();
  if (!t.preview) return { ok: false, reason: 'vip' };
  const out = { ok: true, url: t.preview, br: 0, type: 'mp3', preview: true };
  await kvPutJSON(env, key, out, 24 * 3600);
  return out;
}

/* ---------------- VKeys / Meting 免 key 兜底 ---------------- */

async function vkSearch(env, q, limit) {
  const res = await upFetch(VK + '?word=' + encodeURIComponent(q) + '&num=' + limit, {
    'User-Agent': NE_HEADERS['User-Agent'],
    'Accept': 'application/json',
  });
  if (!res.ok) throw new Error('vkeys http ' + res.status);
  const j = await res.json();
  const arr = (j && j.data) || [];
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => ({
    id: String(t.id),
    src: 'netease',
    name: t.song || '',
    artist: t.singer || '未知歌手',
    album: t.album || '',
    cover: (t.cover || '').replace(/^http:/, 'https:'),
    picId: '',
    dur: 0,
    fee: null,
    vip: null,
    playable: null,
    preview: false,
    via: 'vkeys',
  })).filter((t) => t.name);
}

/** Meting url：上游 302 → 取 Location（网易云真实音频直链） */
async function mtUrl(env, id) {
  try {
    const res = await upFetch(MT + '?server=netease&type=url&id=' + encodeURIComponent(id), {
      'User-Agent': NE_HEADERS['User-Agent'],
      'Referer': 'https://music.163.com/',
      'Accept': '*/*',
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('Location') || '';
      if (loc) return { ok: true, url: loc, br: 0, type: 'mp3', via: 'meting', size: 0 };
    }
    if (res.ok && /audio|octet-stream/.test(res.headers.get('Content-Type') || '')) {
      return { ok: true, url: MT + '?server=netease&type=url&id=' + encodeURIComponent(id), br: 0, type: 'mp3', via: 'meting', size: 0 };
    }
  } catch (e) { /* 落到 vip */ }
  return { ok: false, reason: 'vip', playable: false };
}

async function mtLrc(env, id) {
  try {
    const res = await upFetch(MT + '?server=netease&type=lrc&id=' + encodeURIComponent(id), {
      'User-Agent': NE_HEADERS['User-Agent'], 'Accept': 'text/plain',
    });
    if (res.ok) {
      const t = await res.text();
      if (t && !/<html/i.test(t)) return { ok: true, lrc: t, via: 'meting' };
    }
  } catch (e) { /* ignore */ }
  return { ok: false };
}

/* ---------------- 免 key 网易云镜像（Cloudflare 出口可用） ---------------- */

async function gdGet(env, params) {
  const u = new URL(GD);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  const res = await upFetch(u.toString(), { 'User-Agent': NE_HEADERS['User-Agent'] });
  if (!res.ok) throw new Error('gd http ' + res.status);
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { throw new Error('gd non-json'); }
}

async function gdSearch(env, q, limit) {
  const key = 'music:q:gd:' + q + ':' + limit;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  const arr = await gdGet(env, { types: 'search', source: 'netease', name: q, count: limit });
  if (!Array.isArray(arr)) return [];
  const tracks = arr.map((t) => ({
    id: String(t.id),
    src: 'netease',
    name: t.name || '',
    artist: Array.isArray(t.artist) ? t.artist.filter(Boolean).join('/') : (t.artist || '未知歌手'),
    album: t.album || '',
    cover: '',
    picId: t.pic_id || '',
    dur: 0,
    fee: null,
    vip: null,
    playable: null,
    preview: false,
    via: 'gdstudio',
  })).filter((t) => t.name);
  await kvPutJSON(env, key, tracks, 600);
  return tracks;
}

async function gdUrl(env, id, br) {
  try {
    const j = await gdGet(env, { types: 'url', source: 'netease', id, br: br || 320 });
    if (j && j.url) return { ok: true, url: j.url, br: j.br || br || 0, type: 'mp3', via: 'gdstudio', size: j.size || 0 };
  } catch (e) { /* 落到 vip */ }
  return { ok: false, reason: 'vip', playable: false };
}

async function gdLrc(env, id) {
  try {
    const j = await gdGet(env, { types: 'lyric', source: 'netease', id });
    const lrc = (j && (j.lyric || j.lrc)) || '';
    return { ok: true, lrc, via: lrc ? 'gdstudio' : 'none' };
  } catch (e) { return { ok: true, lrc: '', via: 'none' }; }
}

async function gdCover(env, picId) {
  const key = 'music:pic:' + picId;
  const hit = await kvGetJSON(env, key);
  if (hit && hit.url) return hit.url;
  const j = await gdGet(env, { types: 'pic', source: 'netease', id: picId, size: 300 });
  const u = (j && j.url) || '';
  if (u) await kvPutJSON(env, key, { url: u }, 7 * 24 * 3600);
  return u;
}

/* ---------------- 路由 ---------------- */

export async function handleMusic(request, env, url) {
  const p = url.pathname.replace(/\/+$/, '');
  const route = p.slice('/api/music'.length) || '/';
  const q = url.searchParams;

  if (request.method === 'OPTIONS') return json({ ok: true }, 200, env);
  if (request.method !== 'GET') return json({ ok: false, error: 'method not allowed' }, 405, env);

  if (!env.MUSIC_KV) return json({ ok: false, error: '市场/音乐 KV 未绑定（MUSIC_KV）' }, 503, env);

  try {
    /* ---- 搜索 ---- */
    if (route === '/health' || route === '/') {
      return json({
        ok: true,
        src: 'netease',
        chain: ['netease-direct', 'vkeys', 'meting', 'gdstudio'],
        health: await healthGet(env),
      }, 200, env);
    }

    if (route === '/search') {
      const qs = (q.get('q') || q.get('keyword') || '').trim();
      const limit = Math.min(50, Math.max(5, parseInt(q.get('limit') || '20', 10) || 20));
      let want = q.get('src') || 'auto';
      if (!qs) return json({ ok: false, error: '缺少关键词 q（或 keyword）' }, 400, env);

      const chain = want === 'auto' ? ['netease', 'itunes', 'deezer'] : [want];
      const health = await healthGet(env);
      let lastErr = null;
      for (const src of chain) {
        if (want === 'auto' && srcBlocked(health, src)) continue;   // 指定源不受降权限制（用户明确要它）
        try {
          const tracks = src === 'netease' ? await neSearch(env, qs, limit)
            : src === 'itunes' ? await itSearch(env, qs, limit)
            : src === 'deezer' ? await dzSearch(env, qs, limit)
            : null;
          if (!tracks) return json({ ok: false, error: '未知曲源 ' + src }, 400, env);
          if (!Array.isArray(tracks) || !tracks.length) { lastErr = src + ': 空结果'; continue; }
          await healthMark(env, src, true);
          const origin = url.origin;
          const items = tracks.map((t) => {
            if (!t.cover && t.picId) return Object.assign({}, t, { cover: origin + '/api/music/cover?id=' + t.picId });
            return t;
          });
          return json({ ok: true, src, tracks: items }, 200, env);
        } catch (e) { lastErr = src + ': ' + (e && e.message); await healthMark(env, src, false); }
      }
      return json({ ok: false, error: '全部曲源不可用' + (lastErr ? '（' + lastErr + '）' : '') }, 502, env);
    }

    /* ---- 播放地址 ---- */
    if (route === '/url') {
      const src = q.get('src') || 'netease';
      const id = (q.get('id') || q.get('songId') || '').trim();
      if (!id) return json({ ok: false, error: '缺少 id' }, 400, env);
      const br = src === 'netease' ? (parseInt(q.get('br') || '320', 10) || 320) : 0;
      let r;
      try {
        r = src === 'netease' ? await neUrl(env, id, br)
          : src === 'itunes' ? await itUrl(env, id)
          : src === 'deezer' ? await dzUrl(env, id)
          : { ok: false, reason: 'unknown src' };
        await healthMark(env, src, true);
      } catch (e) {
        await healthMark(env, src, false);
        return json({ ok: false, error: '取播放地址失败（' + src + '）' }, 502, env);
      }
      // 不可播放：明确业务态，前端据此置灰（不伪造可播）
      if (!r.ok) return json({ ok: false, playable: false, reason: r.reason || 'vip', id, src }, 200, env);
      // 统一回同源代理地址：前端直接 audio.src = BASE + play（解决 http 混合内容 + CORS）
      const b64 = btoa(r.url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return json({ ok: true, playable: true, play: '/api/music/stream?u=' + b64, br: r.br || 0, type: r.type || 'mp3', via: r.via || src, preview: !!r.preview }, 200, env);
    }

    /* ---- 歌词 ---- */
    if (route === '/lrc') {
      const src = q.get('src') || 'netease';
      const id = (q.get('id') || q.get('songId') || '').trim();
      if (!id) return json({ ok: false, error: '缺少 id' }, 400, env);
      if (src !== 'netease') return json({ ok: true, lrc: '' }, 200, env);   // 国际源暂无歌词
      try { return json(await neLrc(env, id), 200, env); }
      catch (e) { await healthMark(env, 'netease', false); return json({ ok: true, lrc: '' }, 200, env); }
    }

    /* ---- 榜单 ---- */
    if (route === '/toplist') {
      const board = q.get('board') || 'hot';
      try { return json(await neTop(env, board), 200, env); }
      catch (e) { await healthMark(env, 'netease', false); return json({ ok: false, error: '榜单暂不可用' }, 502, env); }
    }

    /* ---- 封面代理 ---- */
    if (route === '/cover') {
      // 网易云镜像封面：?id=<pic_id> → 302 到网易云图床（浏览器缓存 7 天，不占 Worker 流量）
      const picId = q.get('id');
      if (picId) {
        try {
          const u2 = await gdCover(env, picId);
          if (u2) {
            return new Response(null, {
              status: 302,
              headers: {
                'Location': u2,
                'Cache-Control': 'public, max-age=604800',
                'Access-Control-Allow-Origin': (env && env.ALLOW_ORIGIN) || '*',
              },
            });
          }
        } catch (e) { /* 落到 404 */ }
        return json({ ok: false, error: 'cover not found' }, 404, env);
      }
      const target = b64urlDecode(q.get('u'));
      if (!/^https?:\/\//i.test(target) || !STREAM_HOSTS.some(rx => rx.test((new URL(target)).hostname))) {
        return json({ ok: false, error: 'host not allowed' }, 403, env);
      }
      try {
        const res = await upFetch(target, { 'Referer': 'https://music.163.com/' });
        const h = { 'Content-Type': res.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' };
        return new Response(res.body, { status: res.status, headers: Object.assign(h, { 'Access-Control-Allow-Origin': (env && env.ALLOW_ORIGIN) || '*' }) });
      } catch (e) { return json({ ok: false, error: 'cover fetch failed' }, 502, env); }
    }

    /* ---- 音频流代理（透传 Range； 解决网易 http 直链的混合内容问题） ---- */
    if (route === '/stream') {
      const target = b64urlDecode(q.get('u'));
      if (!/^https?:\/\//i.test(target)) return json({ ok: false, error: 'bad u' }, 400, env);
      let host = '';
      try { host = new URL(target).hostname; } catch (e) { return json({ ok: false, error: 'bad u' }, 400, env); }
      if (!STREAM_HOSTS.some(rx => rx.test(host))) return json({ ok: false, error: 'host not allowed' }, 403, env);
      const headers = { 'Referer': 'https://music.163.com/', 'User-Agent': NE_HEADERS['User-Agent'] };
      const range = request.headers.get('Range');
      if (range) headers['Range'] = range;
      let up;
      try { up = await upFetch(target, headers); }
      catch (e) { return json({ ok: false, error: 'stream unreachable' }, 502, env); }
      const h = {
        'Content-Type': up.headers.get('Content-Type') || 'audio/mpeg',
        'Access-Control-Allow-Origin': (env && env.ALLOW_ORIGIN) || '*',
        'Cache-Control': 'public, max-age=3600',
      };
      const cr = up.headers.get('Content-Range');
      const cl = up.headers.get('Content-Length');
      if (cr) h['Content-Range'] = cr;
      if (cl) h['Content-Length'] = cl;
      if (up.headers.get('Accept-Ranges')) h['Accept-Ranges'] = 'bytes';
      return new Response(up.body, { status: up.status, headers: h });
    }

    return json({ ok: false, error: 'not found' }, 404, env);
  } catch (e) {
    return json({ ok: false, error: 'music internal: ' + (e && e.message) }, 500, env);
  }
}
