/**
 * ============================================================
 * Nexus Cloud API v1 · 路由
 * ------------------------------------------------------------
 * 所有 /api/v1/* 请求从这里分发；错误统一走 core.toErrorResponse。
 * ============================================================
 */

import { ApiError, json, toErrorResponse, notFound } from './core.js';
import * as pub from './public.js';
import * as dev from './dev.js';
import * as adm from './admin.js';
import * as tel from './telemetry.js';

function methodNotAllowed(allow) {
  const err = new ApiError('METHOD_NOT_ALLOWED', 405, '方法不支持');
  err.allow = allow;
  return err;
}

export async function handleV1(request, env, ctx, url) {
  try {
    const raw = url.pathname.slice('/api/v1'.length);
    const segs = raw.split('/').filter(Boolean).map(s => {
      try { return decodeURIComponent(s); } catch (e) { return s; }
    });
    return await route(request, env, ctx, url, segs);
  } catch (e) {
    const res = toErrorResponse(e);
    if (e && e.allow) res.headers.set('Allow', e.allow);
    return res;
  }
}

async function route(request, env, ctx, url, segs) {
  const method = request.method === 'HEAD' ? 'GET' : request.method;
  const n = segs.length;

  if (n === 0) {
    return json({
      service: 'nexus-cloud',
      apiVersion: 'v1',
      docs: '/docs/Nexus-Cloud-API.md',
      openapi: '/docs/openapi.json',
      storage: env && env.STORE_KV ? 'kv' : 'unavailable',
    });
  }

  const root = segs[0];

  /* ───────────── 公开 ───────────── */
  if (root === 'health' && n === 1) {
    if (method !== 'GET') throw methodNotAllowed('GET');
    return json({
      ok: true,
      service: 'nexus-cloud',
      apiVersion: 'v1',
      storage: env && env.STORE_KV ? 'kv' : 'unavailable',
      features: ['apps', 'releases', 'reviews', 'ratings', 'telemetry', 'webhooks'],
    });
  }

  if (root === 'categories' && n === 1) {
    if (method !== 'GET') throw methodNotAllowed('GET');
    return pub.listCategories();
  }

  if (root === 'apps' && n === 1) {
    if (method !== 'GET') throw methodNotAllowed('GET');
    return pub.listApps(request, env, url);
  }

  if (root === 'apps' && n >= 2) {
    const appId = segs[1];
    if (n === 2) {
      if (method !== 'GET') throw methodNotAllowed('GET');
      return pub.getAppDetail(request, env, appId);
    }
    const sub = segs[2];
    if (sub === 'versions' && n === 3) {
      if (method !== 'GET') throw methodNotAllowed('GET');
      return pub.listVersions(request, env, appId);
    }
    if (sub === 'icon' && n === 3) {
      if (method !== 'GET') throw methodNotAllowed('GET');
      return pub.getAppIcon(request, env, appId);
    }
    if (sub === 'screenshots' && n === 4) {
      if (method !== 'GET') throw methodNotAllowed('GET');
      const idx = Number(segs[3]);
      if (!Number.isInteger(idx) || idx < 0) throw new ApiError('ASSET_NOT_FOUND', 404, '截图不存在');
      return pub.getAppScreenshot(request, env, appId, idx);
    }
    if (sub === 'ratings' && n === 3) {
      if (method === 'GET') return pub.getRatings(request, env, url, appId);
      if (method === 'POST') return pub.postRating(request, env, appId);
      throw methodNotAllowed('GET, POST');
    }
    if (sub === 'updates' && n === 3) {
      if (method !== 'GET') throw methodNotAllowed('GET');
      return pub.checkUpdate(request, env, url, appId);
    }
  }

  if (root === 'search' && n === 1) {
    if (method !== 'GET') throw methodNotAllowed('GET');
    return pub.searchApps(request, env, url);
  }

  if (root === 'rankings' && n === 1) {
    if (method !== 'GET') throw methodNotAllowed('GET');
    return pub.rankings(request, env, url);
  }

  if (root === 'telemetry' && n === 2) {
    if (method !== 'POST') throw methodNotAllowed('POST');
    if (segs[1] === 'download') return tel.postDownload(request, env);
    if (segs[1] === 'install') return tel.postInstall(request, env);
    if (segs[1] === 'launch') return tel.postLaunch(request, env);
    throw notFound('路由不存在');
  }

  if (root === 'download' && n === 2) {
    if (method !== 'GET') throw methodNotAllowed('GET');
    return pub.downloadRelease(request, env, segs[1]);
  }

  /* ───────────── 开发者 ───────────── */
  if (root === 'dev') {
    const sub = segs[1];

    if (sub === 'me' && n === 2) {
      if (method === 'GET') return dev.getMe(request, env);
      if (method === 'PATCH' || method === 'PUT') return dev.patchMe(request, env);
      throw methodNotAllowed('GET, PATCH');
    }

    if (sub === 'apps' && n === 2) {
      if (method === 'GET') return dev.listMyApps(request, env, url);
      if (method === 'POST') return dev.createApp(request, env);
      throw methodNotAllowed('GET, POST');
    }

    if (sub === 'apps' && n === 3) {
      if (method === 'GET') return dev.getMyApp(request, env, segs[2]);
      if (method === 'PATCH' || method === 'PUT') return dev.patchApp(request, env, segs[2]);
      throw methodNotAllowed('GET, PATCH');
    }

    if (sub === 'apps' && n === 4 && segs[3] === 'releases') {
      if (method === 'GET') return dev.listMyReleases(request, env, segs[2]);
      if (method === 'POST') return dev.uploadRelease(request, env, segs[2]);
      throw methodNotAllowed('GET, POST');
    }

    if (sub === 'releases' && n === 3) {
      if (method !== 'GET') throw methodNotAllowed('GET');
      return dev.getMyRelease(request, env, segs[2]);
    }

    if (sub === 'releases' && n === 4) {
      if (method !== 'POST') throw methodNotAllowed('POST');
      if (segs[3] === 'submit') return dev.submitRelease(request, env, segs[2]);
      if (segs[3] === 'withdraw') return dev.withdrawRelease(request, env, segs[2]);
      throw notFound('路由不存在');
    }

    if (sub === 'tokens' && n === 2) {
      if (method === 'GET') return dev.getTokens(request, env);
      if (method === 'POST') return dev.createToken(request, env);
      throw methodNotAllowed('GET, POST');
    }

    if (sub === 'tokens' && n === 3) {
      if (method !== 'DELETE') throw methodNotAllowed('DELETE');
      return dev.deleteToken(request, env, segs[2]);
    }
  }

  /* ───────────── 审核 / 运营 ───────────── */
  if (root === 'admin') {
    const sub = segs[1];

    if (sub === 'developers' && n === 2) {
      if (method === 'GET') return adm.adminListDevelopers(request, env);
      if (method === 'POST') return adm.adminCreateDeveloper(request, env);
      throw methodNotAllowed('GET, POST');
    }

    if (sub === 'reviews' && n === 2) {
      if (method !== 'GET') throw methodNotAllowed('GET');
      return adm.adminListReviews(request, env, url);
    }

    if (sub === 'reviews' && n === 4) {
      if (method !== 'POST') throw methodNotAllowed('POST');
      if (segs[3] === 'approve') return adm.adminApprove(request, env, segs[2], ctx);
      if (segs[3] === 'reject') return adm.adminReject(request, env, segs[2], ctx);
      throw notFound('路由不存在');
    }

    if (sub === 'apps' && n === 4) {
      if (method !== 'POST') throw methodNotAllowed('POST');
      if (segs[3] === 'takedown') return adm.adminTakedown(request, env, segs[2], ctx);
      if (segs[3] === 'restore') return adm.adminRestore(request, env, segs[2]);
      throw notFound('路由不存在');
    }

    if (sub === 'migrate' && n === 3 && segs[2] === 'legacy-store') {
      if (method !== 'POST') throw methodNotAllowed('POST');
      return adm.adminMigrateLegacy(request, env, ctx);
    }

    if (sub === 'audit-logs' && n === 2) {
      if (method !== 'GET') throw methodNotAllowed('GET');
      return adm.adminAuditLogs(request, env, url);
    }

    if (sub === 'stats' && n === 2) {
      if (method !== 'GET') throw methodNotAllowed('GET');
      return adm.adminStats(request, env);
    }
  }

  throw notFound('路由不存在');
}
