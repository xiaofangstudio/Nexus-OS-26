/**
 * ============================================================
 * Nexus Cloud API v1 · 遥测
 * ------------------------------------------------------------
 * 下载 / 安装 / 启动事件。匿名可用（IP 限流）；
 * 带 telemetry:write 的 Token 额外写开发者维度统计。
 * ============================================================
 */

import { ApiError, json, readJSON, clientIP, rateLimitLocal, rateLimitKV, clip, getJSON, putJSON } from './core.js';
import { getRelease, getApp, bumpDownload } from './data.js';
import { requireDev } from './auth.js';

async function resolve(env, body) {
  const releaseId = clip(body.releaseId, 200);
  let appId = clip(body.appId, 64);
  let rel = null;
  if (releaseId) rel = await getRelease(env, releaseId);
  if (rel) appId = rel.appId;
  if (!appId && !rel) throw new ApiError('BAD_REQUEST', 400, '必须提供 appId 或 releaseId');
  return { releaseId: rel ? rel.releaseId : '', appId, rel };
}

/** 可选 Token：有就校验 scope，没有就按匿名处理 */
async function optionalDev(request, env) {
  const auth = request.headers.get('Authorization') || request.headers.get('X-N26-Token') || '';
  if (!auth) return null;
  const { token } = await requireDev(request, env, 'telemetry:write');
  return token;
}

async function bumpCounter(env, key) {
  try {
    const cur = Number(await getJSON(env, key, 0)) || 0;
    await putJSON(env, key, cur + 1);
    return cur + 1;
  } catch (e) { return null; }
}

export async function postDownload(request, env) {
  rateLimitLocal('telemetry', clientIP(request), 60, 60);
  await rateLimitKV(env, 'telemetry', clientIP(request), 60, 60);
  const body = await readJSON(request);
  const { rel, appId } = await resolve(env, body);
  if (!appId) throw new ApiError('BAD_REQUEST', 400, '无法定位应用');
  const app = await getApp(env, appId);
  if (!app) throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');
  if (rel && !['published', 'archived'].includes(rel.status)) {
    throw new ApiError('RELEASE_NOT_FOUND', 404, '版本未上架');
  }
  const rid = rel ? rel.releaseId : (app.latestReleaseId || '');
  if (rid) await bumpDownload(env, appId, rid);
  return json({ ok: true, counted: true });
}

export async function postInstall(request, env) {
  rateLimitLocal('telemetry', clientIP(request), 60, 60);
  await rateLimitKV(env, 'telemetry', clientIP(request), 60, 60);
  const token = await optionalDev(request, env);
  const body = await readJSON(request);
  const { appId, rel } = await resolve(env, body);
  const app = await getApp(env, appId);
  if (!app) throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');
  const n = await bumpCounter(env, 'telem:' + appId + ':install');
  if (token) await bumpCounter(env, 'telem:dev:' + token.devId + ':install');
  return json({ ok: true, counted: !!n, appId, releaseId: rel ? rel.releaseId : '' });
}

export async function postLaunch(request, env) {
  rateLimitLocal('telemetry', clientIP(request), 60, 60);
  await rateLimitKV(env, 'telemetry', clientIP(request), 60, 60);
  const token = await optionalDev(request, env);
  const body = await readJSON(request);
  const { appId, rel } = await resolve(env, body);
  const app = await getApp(env, appId);
  if (!app) throw new ApiError('APP_NOT_FOUND', 404, '应用不存在');
  const n = await bumpCounter(env, 'telem:' + appId + ':launch');
  if (token) await bumpCounter(env, 'telem:dev:' + token.devId + ':launch');
  return json({ ok: true, counted: !!n, appId, releaseId: rel ? rel.releaseId : '' });
}
