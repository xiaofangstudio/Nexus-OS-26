/**
 * Nexus OS 26 · 地图（高德 AMap Web 服务）Worker 代理
 * ------------------------------------------------------------
 * key 只放服务端 secret：AMAP_KEY
 *   wrangler secret put AMAP_KEY
 *
 * 端点（全部 GET）：
 *   /api/map/geocode?address=&city=
 *   /api/map/regeo?lat=&lon=
 *   /api/map/poi?keyword=&city=&page=&size=
 *   /api/map/health
 *
 * 无 key 时返回 503 MAP_NO_KEY（前端显示「未配置」，不空白、不伪造）。
 * 缓存：geocode/regeo 24h，poi 6h；限流：每实例每 IP 60 次/分钟（超限 429）。
 */

import { json, fail, fetchTimeout, kvGet, kvPut, cacheHeader } from './http.js';

const BASE = 'https://restapi.amap.com';
const TIMEOUT = 10000;
const TTL = { geocode: 86400, regeo: 86400, poi: 21600 };
const LIMIT = { max: 60, windowMs: 60 * 1000 };

// 每实例内存计数（Worker 隔离级限流，够用且零成本）
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const e = hits.get(ip) || { n: 0, reset: now + LIMIT.windowMs };
  if (now > e.reset) { e.n = 0; e.reset = now + LIMIT.windowMs; }
  e.n += 1;
  hits.set(ip, e);
  if (hits.size > 5000) hits.clear();
  return { limited: e.n > LIMIT.max, remain: Math.max(0, LIMIT.max - e.n), reset: e.reset };
}

function hasKey(env) { return !!(env && env.AMAP_KEY); }

async function amap(env, path, params) {
  const u = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v != null) u.searchParams.set(k, String(v));
  });
  u.searchParams.set('key', env.AMAP_KEY);
  const res = await fetchTimeout(u.toString(), {
    headers: { 'User-Agent': 'NexusOS26/1.0 (+https://fanggame.company)' },
  }, TIMEOUT);
  const text = await res.text();
  let d = null;
  try { d = JSON.parse(text); } catch (e) { /* ignore */ }
  if (!d) throw Object.assign(new Error('上游非 JSON'), { kind: 'nonjson', status: res.status });
  if (String(d.status) !== '1') {
    throw Object.assign(new Error(d.info || 'AMap error'), { info: String(d.info || ''), infocode: String(d.infocode || '') });
  }
  return d;
}

function failFrom(e, env, request) {
  const info = (e && e.info) || '';
  if (/INVALID_USER_KEY|USERKEY_PLAT_NOMATCH|INVALID_USER_SCODE/i.test(info)) {
    return fail('MAP_KEY_INVALID', '高德 Key 无效或无权限（' + info + '），请检查 AMAP_KEY', 502, env, request, {}, info);
  }
  if (/DAILY_QUERY_OVER_LIMIT|OVER_QUOTA|CUQPS_HAS_EXCEEDED/i.test(info)) {
    return fail('MAP_QUOTA', '高德调用额度/并发超限（' + info + '）', 502, env, request, {}, info);
  }
  return fail('MAP_UPSTREAM', '高德上游异常：' + (e && e.message || 'unknown'), 502, env, request, {}, info + (e && e.infocode || ''));
}

export async function handleMap(request, env, url) {
  if (request.method !== 'GET') return fail('METHOD', '仅支持 GET', 405, env, request);
  const route = url.pathname.replace(/\/+$/, '').slice('/api/map'.length) || '/';
  const q = url.searchParams;

  if (route === '/health') {
    const r = rateLimited(request.headers.get('CF-Connecting-IP') || 'anon');
    return json({ configured: hasKey(env), rate: { remain: r.remain, reset: r.reset } }, 200, env, request);
  }

  if (!hasKey(env)) {
    return fail('MAP_NO_KEY', '地图服务未配置：请执行 wrangler secret put AMAP_KEY 后重新部署', 503, env, request);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  const rl = rateLimited(ip);
  if (rl.limited) {
    return fail('MAP_RATE_LIMIT', '请求过于频繁，请稍后再试（每 IP 60 次/分钟）', 429, env, request, { 'Retry-After': '60' });
  }

  try {
    if (route === '/geocode') {
      const address = (q.get('address') || '').trim();
      if (!address) return fail('BAD_ADDRESS', '缺少 address', 400, env, request);
      const city = (q.get('city') || '').trim();
      const key = 'map:geo:' + city + ':' + address;
      const hit = await kvGet(env, key);
      if (hit) return json(hit, 200, env, request, Object.assign({ 'X-Cache': 'HIT', 'X-RateLimit-Remaining': String(rl.remain) }, cacheHeader(TTL.geocode)));
      const d = await amap(env, '/v3/geocode/geo', { address, city, batch: 'false' });
      const out = {
        query: { address, city },
        items: (d.geocodes || []).map((g) => ({
          formattedAddress: g.formatted_address || '',
          province: g.province || '',
          city: g.city || '',
          district: g.district || '',
          adcode: g.adcode || '',
          level: g.level || '',
          location: g.location || '',
          lat: parseFloat((g.location || ',').split(',')[1]),
          lon: parseFloat((g.location || ',').split(',')[0]),
        })),
      };
      await kvPut(env, key, out, TTL.geocode);
      return json(out, 200, env, request, Object.assign({ 'X-Cache': 'MISS', 'X-RateLimit-Remaining': String(rl.remain) }, cacheHeader(TTL.geocode)));
    }

    if (route === '/regeo') {
      const lat = parseFloat(q.get('lat'));
      const lon = parseFloat(q.get('lon'));
      if (!isFinite(lat) || !isFinite(lon)) return fail('BAD_LOCATION', '缺少 lat/lon 或格式不合法', 400, env, request);
      const loc = lon.toFixed(6) + ',' + lat.toFixed(6);
      const key = 'map:regeo:' + loc;
      const hit = await kvGet(env, key);
      if (hit) return json(hit, 200, env, request, Object.assign({ 'X-Cache': 'HIT', 'X-RateLimit-Remaining': String(rl.remain) }, cacheHeader(TTL.regeo)));
      const d = await amap(env, '/v3/geocode/regeo', { location: loc, extensions: 'all', radius: '1000' });
      const r = d.regeocode || {};
      const ac = r.addressComponent || {};
      const out = {
        location: loc,
        formattedAddress: r.formatted_address || '',
        addressComponent: {
          province: ac.province || '', city: ac.city || '', district: ac.district || '',
          township: ac.township || '', neighborhood: (ac.neighborhood && ac.neighborhood.name) || '',
          street: ac.streetNumber ? ((ac.streetNumber.street || '') + (ac.streetNumber.number || '')) : '',
          adcode: ac.adcode || '', citycode: ac.citycode || '',
        },
        pois: (r.pois || []).slice(0, 10).map((p) => ({
          id: p.id || '', name: p.name || '', type: p.type || '', address: p.address || '', distance: p.distance || '',
        })),
      };
      await kvPut(env, key, out, TTL.regeo);
      return json(out, 200, env, request, Object.assign({ 'X-Cache': 'MISS', 'X-RateLimit-Remaining': String(rl.remain) }, cacheHeader(TTL.regeo)));
    }

    if (route === '/poi') {
      const keyword = (q.get('keyword') || q.get('q') || '').trim();
      if (!keyword) return fail('BAD_KEYWORD', '缺少 keyword', 400, env, request);
      const city = (q.get('city') || '').trim();
      const page = Math.max(1, parseInt(q.get('page') || '1', 10) || 1);
      const size = Math.min(25, Math.max(1, parseInt(q.get('size') || '20', 10) || 20));
      const key = 'map:poi:' + city + ':' + keyword + ':' + page + ':' + size;
      const hit = await kvGet(env, key);
      if (hit) return json(hit, 200, env, request, Object.assign({ 'X-Cache': 'HIT', 'X-RateLimit-Remaining': String(rl.remain) }, cacheHeader(TTL.poi)));
      const d = await amap(env, '/v3/place/text', { keywords: keyword, city, offset: size, page, extensions: 'base' });
      const out = {
        query: { keyword, city, page, size },
        count: parseInt(d.count || '0', 10) || 0,
        items: (d.pois || []).map((p) => ({
          id: p.id || '', name: p.name || '', type: p.type || '', typecode: p.typecode || '',
          address: p.address || '', location: p.location || '',
          lat: parseFloat((p.location || ',').split(',')[1]),
          lon: parseFloat((p.location || ',').split(',')[0]),
          tel: p.tel || '', adcode: p.adcode || '', cityname: p.cityname || '',
        })),
      };
      await kvPut(env, key, out, TTL.poi);
      return json(out, 200, env, request, Object.assign({ 'X-Cache': 'MISS', 'X-RateLimit-Remaining': String(rl.remain) }, cacheHeader(TTL.poi)));
    }

    return fail('NOT_FOUND', '未知地图接口，可用：/geocode /regeo /poi /health', 404, env, request);
  } catch (e) {
    return failFrom(e, env, request);
  }
}
