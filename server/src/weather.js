/**
 * Nexus OS 26 · 天气（和风 QWeather）Worker 代理
 * ------------------------------------------------------------
 * key 只放服务端 secret：QWEATHER_KEY（或 QWEATHER_JWT）
 *   wrangler secret put QWEATHER_KEY
 *   wrangler secret put QWEATHER_JWT   （可选，替代 key 时用）
 *
 * 环境变量（可选）：
 *   QWEATHER_BASE  默认 https://devapi.qweather.com
 *                  （和风新版按项目分配专属域名时填你自己的，如 https://xxx.qweather.com）
 *
 * 端点（全部 GET）：
 *   /api/weather/now?lat=&lon= | ?location=
 *   /api/weather/hourly?lat=&lon=&hours=24|72
 *   /api/weather/daily?lat=&lon=&days=3|7
 *   /api/weather/city?q=北京
 *   /api/weather/health
 *
 * 无 key 时返回 503 WEATHER_NO_KEY，前端显示「未配置」，不回退假数据。
 * 缓存：now 10min / hourly 30min / daily 30min / city 7d。
 */

import { json, fail, fetchTimeout, kvGet, kvPut, cacheHeader } from './http.js';

const BASE = 'https://devapi.qweather.com';
const TIMEOUT = 10000;
const TTL = { now: 600, hourly: 1800, daily: 1800, city: 604800 };

const ICON = (code) => 'https://icons.qweather.com/assets/icons/' + String(code || '999') + '.svg';

function hasKey(env) {
  return !!(env && (env.QWEATHER_KEY || env.QWEATHER_JWT));
}

function noKey(env, request) {
  return fail('WEATHER_NO_KEY',
    '天气服务未配置：请执行 wrangler secret put QWEATHER_KEY 后重新部署', 503, env, request);
}

/** 经纬度 → QWeather location（经度,纬度，最多两位小数） */
function locationOf(q) {
  const direct = (q.get('location') || '').trim();
  if (direct) return direct;
  const lat = parseFloat(q.get('lat'));
  const lon = parseFloat(q.get('lon'));
  if (!isFinite(lat) || !isFinite(lon)) return '';
  return lon.toFixed(2) + ',' + lat.toFixed(2);
}

async function qweather(env, path, params) {
  const base = (env.QWEATHER_BASE || BASE).replace(/\/+$/, '');
  const u = new URL(base + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v != null) u.searchParams.set(k, String(v));
  });
  if (env.QWEATHER_KEY) u.searchParams.set('key', env.QWEATHER_KEY);
  if (env.QWEATHER_JWT) u.searchParams.set('jwt', env.QWEATHER_JWT);

  const res = await fetchTimeout(u.toString(), {
    headers: { 'Accept-Encoding': 'gzip', 'User-Agent': 'NexusOS26/1.0 (+https://fanggame.company)' },
  }, TIMEOUT);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* 上游非 JSON */ }
  if (!data) throw Object.assign(new Error('上游返回非 JSON'), { status: res.status });
  if (String(data.code) !== '200') {
    throw Object.assign(new Error('QWeather ' + data.code), { qcode: String(data.code), status: res.status });
  }
  return data;
}

function failFromQ(err, env, request) {
  const code = err && err.qcode;
  if (code === '401' || code === '403') {
    return fail('WEATHER_KEY_INVALID', '和风 Key 无效或无权限（code ' + code + '），请检查 QWEATHER_KEY', 502, env, request, {}, code);
  }
  if (code === '402') {
    return fail('WEATHER_QUOTA', '和风调用额度已用完（code 402）', 502, env, request, {}, code);
  }
  if (code === '404' || code === '204') {
    return fail('WEATHER_NO_DATA', '该位置暂无天气数据（code ' + code + '）', 404, env, request, {}, code);
  }
  return fail('WEATHER_UPSTREAM', '和风上游异常：' + (err && err.message || 'unknown'), 502, env, request, {}, code);
}

const nowOf = (d) => ({
  obsTime: d.obsTime || '',
  temp: d.temp,
  feelsLike: d.feelsLike,
  text: d.text || '',
  icon: d.icon || '',
  iconUrl: ICON(d.icon),
  wind360: d.wind360,
  windDir: d.windDir || '',
  windScale: d.windScale || '',
  windSpeed: d.windSpeed || '',
  humidity: d.humidity,
  precip: d.precip,
  pressure: d.pressure,
  vis: d.vis,
  cloud: d.cloud,
  dew: d.dew,
});

const hourOf = (d) => ({
  time: d.fxTime || '',
  temp: d.temp,
  text: d.text || '',
  icon: d.icon || '',
  iconUrl: ICON(d.icon),
  windDir: d.windDir || '',
  windScale: d.windScale || '',
  pop: d.pop,
  precip: d.precip,
  humidity: d.humidity,
});

const dayOf = (d) => ({
  date: d.fxDate || '',
  sunrise: d.sunrise || '',
  sunset: d.sunset || '',
  moonrise: d.moonrise || '',
  moonset: d.moonset || '',
  moonPhase: d.moonPhase || '',
  tempMax: d.tempMax,
  tempMin: d.tempMin,
  textDay: d.textDay || '',
  textNight: d.textNight || '',
  iconDay: d.iconDay || '',
  iconDayUrl: ICON(d.iconDay),
  iconNight: d.iconNight || '',
  windDirDay: d.windDirDay || '',
  windScaleDay: d.windScaleDay || '',
  precip: d.precip,
  uvIndex: d.uvIndex,
});

export async function handleWeather(request, env, url) {
  if (request.method !== 'GET') return fail('METHOD', '仅支持 GET', 405, env, request);
  const route = url.pathname.replace(/\/+$/, '').slice('/api/weather'.length) || '/';
  const q = url.searchParams;

  if (route === '/health') {
    return json({ configured: hasKey(env), base: env.QWEATHER_BASE || BASE }, 200, env, request);
  }
  if (!hasKey(env)) return noKey(env, request);

  try {
    if (route === '/now' || route === '/') {
      const loc = locationOf(q);
      if (!loc) return fail('BAD_LOCATION', '缺少 location，或 lat/lon 不合法', 400, env, request);
      const key = 'wx:now:' + loc;
      const hit = await kvGet(env, key);
      if (hit) return json(hit, 200, env, request, Object.assign({ 'X-Cache': 'HIT' }, cacheHeader(TTL.now)));
      const d = await qweather(env, '/v7/weather/now', { location: loc });
      const out = Object.assign({ location: loc, updateTime: d.updateTime || '' }, nowOf(d.now || {}));
      await kvPut(env, key, out, TTL.now);
      return json(out, 200, env, request, Object.assign({ 'X-Cache': 'MISS' }, cacheHeader(TTL.now)));
    }

    if (route === '/hourly') {
      const loc = locationOf(q);
      if (!loc) return fail('BAD_LOCATION', '缺少 location，或 lat/lon 不合法', 400, env, request);
      const hours = String(q.get('hours') || '24');
      const path = hours === '72' ? '/v7/weather/72h' : '/v7/weather/24h';
      const key = 'wx:hourly:' + hours + ':' + loc;
      const hit = await kvGet(env, key);
      if (hit) return json(hit, 200, env, request, Object.assign({ 'X-Cache': 'HIT' }, cacheHeader(TTL.hourly)));
      const d = await qweather(env, path, { location: loc });
      const out = { location: loc, updateTime: d.updateTime || '', items: (d.hourly || []).map(hourOf) };
      await kvPut(env, key, out, TTL.hourly);
      return json(out, 200, env, request, Object.assign({ 'X-Cache': 'MISS' }, cacheHeader(TTL.hourly)));
    }

    if (route === '/daily') {
      const loc = locationOf(q);
      if (!loc) return fail('BAD_LOCATION', '缺少 location，或 lat/lon 不合法', 400, env, request);
      const days = String(q.get('days') || '7');
      const path = days === '3' ? '/v7/weather/3d' : '/v7/weather/7d';
      const key = 'wx:daily:' + days + ':' + loc;
      const hit = await kvGet(env, key);
      if (hit) return json(hit, 200, env, request, Object.assign({ 'X-Cache': 'HIT' }, cacheHeader(TTL.daily)));
      const d = await qweather(env, path, { location: loc });
      const out = { location: loc, updateTime: d.updateTime || '', items: (d.daily || []).map(dayOf) };
      await kvPut(env, key, out, TTL.daily);
      return json(out, 200, env, request, Object.assign({ 'X-Cache': 'MISS' }, cacheHeader(TTL.daily)));
    }

    if (route === '/city') {
      const name = (q.get('q') || q.get('name') || q.get('keyword') || '').trim();
      if (!name) return fail('BAD_QUERY', '缺少 q（城市名）', 400, env, request);
      const key = 'wx:city:' + name;
      const hit = await kvGet(env, key);
      if (hit) return json(hit, 200, env, request, Object.assign({ 'X-Cache': 'HIT' }, cacheHeader(TTL.city)));
      const d = await qweather(env, '/v2/city/lookup', { location: name, number: q.get('number') || '5', lang: q.get('lang') || 'zh' });
      const out = {
        query: name,
        items: (d.location || []).map((c) => ({
          id: c.id, name: c.name, adm1: c.adm1 || '', adm2: c.adm2 || '',
          country: c.country || '', lat: parseFloat(c.lat), lon: parseFloat(c.lon),
          tz: c.tz || '', type: c.type || '',
        })),
      };
      await kvPut(env, key, out, TTL.city);
      return json(out, 200, env, request, Object.assign({ 'X-Cache': 'MISS' }, cacheHeader(TTL.city)));
    }

    return fail('NOT_FOUND', '未知天气接口，可用：/now /hourly /daily /city /health', 404, env, request);
  } catch (e) {
    return failFromQ(e, env, request);
  }
}
