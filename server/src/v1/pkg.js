/**
 * ============================================================
 * Nexus Cloud API v1 · 包解析与 manifest 校验
 * ------------------------------------------------------------
 * 三种形态：zip（.zip/.mx）、单文件 HTML、目录（多文件）。
 * 所有路径做穿越拦截；扩展名白名单；体积 / 文件数限制；
 * 兼容 MxOS：manifest 缺 version → 1.0.0，缺 entry → app.bin / index.html。
 * ============================================================
 */

import { ApiError, LIMITS, APP_ID_RE, SEMVER_RE, CATEGORIES, normalizeTagList, clip } from './core.js';
import { listZip, readEntry, buildZip } from './zip.js';

export const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', map: 'application/json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  wasm: 'application/wasm', txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
  mp4: 'video/mp4', webm: 'video/webm',
};

const OK_EXT = new Set(Object.keys(MIME));
const SKIP = /(__MACOSX\/|^\.DS_Store$|\/\.DS_Store$|^Thumbs\.db$)/i;

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function mimeOf(name) {
  return MIME[extOf(name)] || 'application/octet-stream';
}

/** 路径安全：拒绝绝对路径 / 反斜杠 / 穿越 / 盘符 / 控制字符 */
export function safePath(raw) {
  let name = String(raw == null ? '' : raw);
  if (!name) throw new ApiError('UNSAFE_PATH', 400, '包内存在空文件名');
  if (name.length > 200) throw new ApiError('UNSAFE_PATH', 400, '路径过长（>200）');
  if (name.startsWith('/') || name.startsWith('\\')) throw new ApiError('UNSAFE_PATH', 400, `禁止绝对路径：${name}`);
  if (name.includes('\\')) throw new ApiError('UNSAFE_PATH', 400, `禁止反斜杠：${name}`);
  if (/^[a-zA-Z]:/.test(name)) throw new ApiError('UNSAFE_PATH', 400, `禁止盘符：${name}`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(name)) throw new ApiError('UNSAFE_PATH', 400, '路径含控制字符');
  const segs = name.split('/');
  for (const s of segs) {
    if (s === '..' || s === '.' || s === '') throw new ApiError('UNSAFE_PATH', 400, `非法路径段：${name}`);
  }
  return name;
}

function isSkippable(name) { return SKIP.test(name); }

/** manifest 校验 → 规范化对象 */
export function normalizeManifest(raw, pathAppId, fallbackVersion) {
  if (!raw || typeof raw !== 'object') throw new ApiError('INVALID_MANIFEST', 400, 'manifest 必须是 JSON 对象');

  const id = String(raw.id || '').trim();
  if (!APP_ID_RE.test(id)) throw new ApiError('INVALID_MANIFEST', 400, 'manifest.id 不符合命名规则（^[a-z0-9][a-z0-9._-]{2,63}$）', { field: 'id' });
  if (pathAppId && id !== pathAppId) {
    throw new ApiError('APP_ID_MISMATCH', 400, `manifest.id(${id}) 与请求路径(${pathAppId}) 不一致`);
  }

  const name = clip(raw.name, 60);
  if (!name) throw new ApiError('INVALID_MANIFEST', 400, 'manifest.name 缺失', { field: 'name' });

  let version = String(raw.version || fallbackVersion || '1.0.0').trim();
  if (!SEMVER_RE.test(version)) {
    throw new ApiError('INVALID_MANIFEST', 400, `版本号不符合 semver：${version}`, { field: 'version' });
  }
  version = version.slice(0, 64);

  const entry = clip(raw.entry || raw.main, 200);
  const category = CATEGORIES.includes(String(raw.category || '').toLowerCase())
    ? String(raw.category).toLowerCase() : 'other';

  const permissions = Array.isArray(raw.permissions)
    ? raw.permissions.map(p => String(p)).filter(p => /^[a-z][a-z0-9:._-]{1,31}$/i.test(p)).slice(0, 16)
    : [];

  const minOsVersion = /^\d+(\.\d+){0,3}$/.test(String(raw.minOsVersion || '')) ? String(raw.minOsVersion).slice(0, 16) : null;

  const screenshots = Array.isArray(raw.screenshots)
    ? raw.screenshots.map(s => String(s)).filter(Boolean).slice(0, LIMITS.screenshots)
    : [];

  let i18n = {};
  if (raw.i18n && typeof raw.i18n === 'object' && !Array.isArray(raw.i18n)) {
    const keys = Object.keys(raw.i18n).slice(0, 12);
    for (const k of keys) {
      const v = raw.i18n[k];
      if (!v || typeof v !== 'object') continue;
      i18n[k.slice(0, 20)] = {
        name: clip(v.name, 60) || undefined,
        description: clip(v.description, 4000) || undefined,
      };
    }
    if (!keys.length) i18n = {};
  }

  return {
    id,
    name,
    subtitle: clip(raw.subtitle, 80),
    version,
    entry,
    icon: clip(raw.icon, 200),
    category,
    description: clip(raw.description, 4000),
    author: clip(raw.author || raw.developer, 60),
    tags: normalizeTagList(raw.tags, 8, 16),
    permissions,
    minOsVersion,
    screenshots,
    i18n,
  };
}

/** 在文件清单里按候选名找图标 */
function findIcon(manifest, names) {
  const candidates = [manifest.icon, 'assets/svg.png', 'icon.png', 'assets/icon.png', 'icon.svg', 'assets/icon.svg']
    .filter(Boolean);
  for (const c of candidates) {
    const n = c.replace(/^\.?\//, '');
    if (names.has(n)) return n;
  }
  return null;
}

function pickEntry(manifest, names, warnings) {
  if (manifest.entry) {
    const n = manifest.entry.replace(/^\.?\//, '');
    if (!names.has(n)) throw new ApiError('ENTRY_MISSING', 400, `入口文件不存在：${manifest.entry}`, { field: 'entry' });
    return n;
  }
  if (names.has('app.bin')) { warnings.push('manifest 未声明 entry，按 MxOS 约定使用 app.bin'); return 'app.bin'; }
  if (names.has('index.html')) { warnings.push('manifest 未声明 entry，回退 index.html'); return 'index.html'; }
  throw new ApiError('INVALID_MANIFEST', 400, 'manifest.entry 缺失且包内没有 app.bin / index.html', { field: 'entry' });
}

function checkExt(name, entryName) {
  const ext = extOf(name);
  if (ext === '') {
    if (name === 'app.bin' || name === entryName) return;
    throw new ApiError('UNSUPPORTED_TYPE', 415, `文件没有扩展名：${name}`);
  }
  if (!OK_EXT.has(ext)) throw new ApiError('UNSUPPORTED_TYPE', 415, `不支持的扩展名 .${ext}：${name}`);
}

/**
 * 解析上传内容。
 * @param {object} opts { file, files, manifestText, appId, versionFallback, channel }
 * @returns {format, bytes, manifest, entry, fileCount, icon, screenshots, warnings}
 */
export async function buildPackage(opts) {
  const warnings = [];
  const appId = opts.appId || null;

  if (opts.file) {
    const f = opts.file;
    const name = String(f.name || 'upload');
    const size = f.size || 0;
    if (size > LIMITS.packageBytes) throw new ApiError('PACKAGE_TOO_LARGE', 413, '安装包超过 64MB 上限');
    const head = new Uint8Array(await (await f.slice(0, 4).arrayBuffer()).buffer);
    const looksZip = head[0] === 0x50 && head[1] === 0x4b;
    const ext = extOf(name);

    if (looksZip || ext === 'zip' || ext === 'mx') {
      const bytes = new Uint8Array(await f.arrayBuffer());
      return await parseZipPackage(bytes, appId, opts.manifestText, warnings, opts.versionFallback);
    }
    if (ext === 'html' || ext === 'htm') {
      return await parseHtmlPackage(name, new Uint8Array(await f.arrayBuffer()), appId, opts.manifestText, warnings, opts.versionFallback);
    }
    throw new ApiError('UNSUPPORTED_TYPE', 415, `只接受 .zip / .mx / .html 单文件，收到 ${name}`);
  }

  if (opts.files && opts.files.length) {
    return await parseDirPackage(opts.files, appId, opts.manifestText, warnings, opts.versionFallback);
  }

  throw new ApiError('BAD_REQUEST', 400, '缺少上传内容：需要 file 或 files 字段');
}

async function parseZipPackage(bytes, appId, manifestText, warnings, versionFallback) {
  const zip = listZip(bytes);
  const byName = new Map();
  for (const e of zip.entries) {
    if (e.name.endsWith('/')) continue;
    if (isSkippable(e.name)) continue;
    // Windows 自带 zip 可能用反斜杠分隔，先归一化再安全检查（`..\x` 会变成 `../x` 被拦截）
    const n = safePath(e.name.replace(/\\/g, '/'));
    byName.set(n, e);
  }
  if (!byName.size) throw new ApiError('BAD_ZIP', 400, 'zip 内没有任何文件');

  const mEntry = byName.get('manifest.json');
  if (!mEntry) throw new ApiError('MANIFEST_MISSING', 400, '包根目录缺少 manifest.json');
  if (mEntry.usize > LIMITS.manifestBytes) throw new ApiError('INVALID_MANIFEST', 400, 'manifest.json 超过 64KB');

  const mBytes = await readEntry(zip, mEntry, LIMITS.manifestBytes);
  let rawManifest;
  try { rawManifest = JSON.parse(new TextDecoder('utf-8').decode(mBytes)); }
  catch (e) { throw new ApiError('INVALID_MANIFEST', 400, 'manifest.json 不是合法 JSON'); }
  if (manifestText) warnings.push('包内 manifest.json 优先于表单字段');

  const manifest = normalizeManifest(rawManifest, appId, versionFallback);
  const entry = pickEntry(manifest, byName, warnings);
  checkExt(entry, entry);

  let total = 0;
  for (const [n, e] of byName) {
    total += e.usize;
    if (n !== 'manifest.json') checkExt(n, entry);
  }
  if (total > LIMITS.unpackedBytes) throw new ApiError('PACKAGE_TOO_LARGE', 413, '解压后总体积超限');

  const iconName = findIcon(manifest, byName);
  let icon = null;
  if (iconName) {
    const e = byName.get(iconName);
    if (e.usize > LIMITS.iconBytes) throw new ApiError('ICON_TOO_LARGE', 413, '图标超过 512KB');
    const b = await readEntry(zip, e, LIMITS.iconBytes);
    icon = { name: iconName, mime: mimeOf(iconName), bytes: b };
  }

  const shots = [];
  for (let i = 0; i < manifest.screenshots.length; i++) {
    const raw = manifest.screenshots[i].replace(/^\.?\//, '');
    const e = byName.get(raw);
    if (!e) { warnings.push(`截图不存在，已跳过：${raw}`); continue; }
    if (e.usize > LIMITS.screenshotBytes) throw new ApiError('SCREENSHOT_TOO_LARGE', 413, `截图超过 2MB：${raw}`);
    const ext = extOf(raw);
    if (!['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
      throw new ApiError('UNSUPPORTED_TYPE', 415, `截图格式不支持：${raw}`);
    }
    shots.push({ mime: mimeOf(raw), bytes: await readEntry(zip, e, LIMITS.screenshotBytes) });
  }

  return { format: 'zip', bytes, manifest, entry, fileCount: byName.size, icon, screenshots: shots, warnings };
}

async function parseHtmlPackage(filename, bytes, appId, manifestText, warnings, versionFallback) {
  if (bytes.length > LIMITS.packageBytes) throw new ApiError('PACKAGE_TOO_LARGE', 413, '安装包超过 64MB 上限');
  if (!manifestText) throw new ApiError('MANIFEST_MISSING', 400, '单文件 HTML 上传必须同时提供 manifest 表单字段');
  let rawManifest;
  try { rawManifest = JSON.parse(manifestText); }
  catch (e) { throw new ApiError('INVALID_MANIFEST', 400, 'manifest 表单字段不是合法 JSON'); }

  const manifest = normalizeManifest(rawManifest, appId, versionFallback);
  const base = safePath(String(filename).split('/').pop());
  if (!/\.html?$/i.test(base)) throw new ApiError('UNSUPPORTED_TYPE', 415, '单文件必须是 .html / .htm');
  manifest.entry = base;
  manifest.icon = '';

  const icon = null;
  const shots = [];
  if (manifest.screenshots.length) warnings.push('单文件 HTML 无外部截图，已忽略 manifest.screenshots');
  manifest.screenshots = [];

  return { format: 'html', bytes, manifest, entry: base, fileCount: 1, icon, screenshots: shots, warnings };
}

async function parseDirPackage(files, appId, manifestText, warnings, versionFallback) {
  if (!manifestText) throw new ApiError('MANIFEST_MISSING', 400, '目录上传必须同时提供 manifest 表单字段');
  let rawManifest;
  try { rawManifest = JSON.parse(manifestText); }
  catch (e) { throw new ApiError('INVALID_MANIFEST', 400, 'manifest 表单字段不是合法 JSON'); }

  const manifest = normalizeManifest(rawManifest, appId, versionFallback);

  if (files.length > LIMITS.files) throw new ApiError('TOO_MANY_FILES', 413, `文件数超过上限（${LIMITS.files}）`);

  const map = new Map();
  let total = 0;
  for (const f of files) {
    const name = safePath(String(f.name || '').replace(/\\/g, '/').replace(/^\.?\//, ''));
    if (isSkippable(name)) continue;
    if (name === 'manifest.json') { warnings.push('表单已提供 manifest，忽略同名文件'); continue; }
    const bytes = new Uint8Array(await f.arrayBuffer());
    total += bytes.length;
    if (total > LIMITS.packageBytes) throw new ApiError('PACKAGE_TOO_LARGE', 413, '上传内容超过 64MB 上限');
    map.set(name, { bytes, mime: mimeOf(name) });
  }
  if (!map.size) throw new ApiError('BAD_REQUEST', 400, '目录里没有任何文件');

  const names = new Set(map.keys());
  const entry = pickEntry(manifest, names, warnings);

  const zipFiles = [];
  zipFiles.push({ name: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(Object.assign({}, manifest, { entry }))) });
  for (const [name, f] of map) {
    checkExt(name, entry);
    zipFiles.push({ name, bytes: f.bytes });
  }
  const zipBytes = buildZip(zipFiles);

  const iconName = findIcon(manifest, names);
  let icon = null;
  if (iconName) {
    const f = map.get(iconName);
    if (f.bytes.length > LIMITS.iconBytes) throw new ApiError('ICON_TOO_LARGE', 413, '图标超过 512KB');
    icon = { name: iconName, mime: f.mime, bytes: f.bytes };
  }

  const shots = [];
  for (const raw of manifest.screenshots) {
    const n = raw.replace(/^\.?\//, '');
    const f = map.get(n);
    if (!f) { warnings.push(`截图不存在，已跳过：${raw}`); continue; }
    if (f.bytes.length > LIMITS.screenshotBytes) throw new ApiError('SCREENSHOT_TOO_LARGE', 413, `截图超过 2MB：${raw}`);
    shots.push({ mime: f.mime, bytes: f.bytes });
  }

  return { format: 'dir', bytes: zipBytes, manifest, entry, fileCount: map.size + 1, icon, screenshots: shots, warnings };
}
