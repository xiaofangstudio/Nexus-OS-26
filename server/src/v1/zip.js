/**
 * ============================================================
 * Nexus Cloud API v1 · ZIP 读写（纯 JS）
 * ------------------------------------------------------------
 * 读：解析中央目录，只对 manifest / 图标 / 截图等少量条目解压；
 *     其余条目只记录元信息，避免把 64MB 包整包解压进内存。
 * 写：目录上传时用 store（不压缩）方式打包成 zip。
 * 不支持 ZIP64；遇到 0xFFFFFFFF 字段直接判 BAD_ZIP。
 * ============================================================
 */

import { ApiError, LIMITS } from './core.js';

const SIG_EOCD = 0x06054b50;
const SIG_CD = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

function u16(dv, off) { return dv.getUint16(off, true); }
function u32(dv, off) { return dv.getUint32(off, true); }

function fail(msg) { throw new ApiError('BAD_ZIP', 400, msg || 'zip 结构损坏'); }

/** 返回 { entries: [{name, method, csize, usize, offset, flags}], buf, dv } */
export function listZip(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.length < 22) fail('文件过小，不是 zip');

  let eocd = -1;
  const stop = Math.max(0, u8.length - 22 - 65535);
  for (let i = u8.length - 22; i >= stop; i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) fail('找不到 zip 目录结构');

  const count = u16(dv, eocd + 10);
  const cdOffset = u32(dv, eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) fail('不支持 ZIP64');
  if (count > LIMITS.files) {
    const err = new ApiError('TOO_MANY_FILES', 413, `文件数超过上限（${LIMITS.files}）`);
    throw err;
  }
  if (cdOffset > u8.length) fail('中央目录偏移越界');

  const entries = [];
  let p = cdOffset;
  let unpacked = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > u8.length || u32(dv, p) !== SIG_CD) fail('中央目录条目损坏');
    const flags = u16(dv, p + 8);
    const method = u16(dv, p + 10);
    const csize = u32(dv, p + 20);
    const usize = u32(dv, p + 24);
    const nameLen = u16(dv, p + 28);
    const extraLen = u16(dv, p + 30);
    const cmtLen = u16(dv, p + 32);
    const offset = u32(dv, p + 42);
    if (csize === 0xffffffff || usize === 0xffffffff || offset === 0xffffffff) fail('不支持 ZIP64');
    const rawName = u8.subarray(p + 46, p + 46 + nameLen);
    const name = new TextDecoder('utf-8').decode(rawName);
    if (p + 46 + nameLen + extraLen + cmtLen > u8.length) fail('中央目录越界');
    unpacked += usize;
    if (unpacked > LIMITS.unpackedBytes) {
      throw new ApiError('PACKAGE_TOO_LARGE', 413, '解压后体积超过上限');
    }
    entries.push({ name, method, csize, usize, offset, flags });
    p += 46 + nameLen + extraLen + cmtLen;
  }

  // zip bomb 防护：单条目压缩比 > 100× 且解压后 > 1MB
  for (const e of entries) {
    if (e.usize > 1024 * 1024 && e.csize > 0 && e.usize / e.csize > 100) {
      fail('压缩比异常，疑似 zip bomb');
    }
    if (e.usize > LIMITS.packageBytes) {
      throw new ApiError('PACKAGE_TOO_LARGE', 413, '单文件解压后超过 64MB');
    }
  }

  return { entries, u8, dv };
}

async function inflateRaw(bytes) {
  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 读取单个条目的解压后内容 */
export async function readEntry(zip, entry, maxBytes) {
  if (maxBytes && entry.usize > maxBytes) {
    throw new ApiError('PACKAGE_TOO_LARGE', 413, `条目 ${entry.name} 超过大小上限`);
  }
  const { u8, dv } = zip;
  const off = entry.offset;
  if (off + 30 > u8.length || dv.getUint32(off, true) !== SIG_LOCAL) fail('条目本地头损坏');
  const nameLen = u16(dv, off + 26);
  const extraLen = u16(dv, off + 28);
  const start = off + 30 + nameLen + extraLen;
  const end = start + entry.csize;
  if (end > u8.length) fail('条目数据越界');
  const data = u8.subarray(start, end);
  if (entry.method === 0) return new Uint8Array(data);
  if (entry.method === 8) return inflateRaw(data);
  throw new ApiError('BAD_ZIP', 400, `不支持的压缩算法（method=${entry.method}）`);
}

/* ───────────── 写 zip（store 模式） ───────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | (Math.floor(d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

/** files: [{name, bytes: Uint8Array}] → 完整 zip 字节 */
export function buildZip(files, now) {
  const d = now || new Date();
  const { time, date } = dosTime(d);
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = new TextEncoder().encode(f.name);
    const data = f.bytes;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, SIG_LOCAL, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, time, true);
    dv.setUint16(12, date, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    chunks.push(local, data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, SIG_CD, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + data.length;
  }

  let cdSize = 0;
  for (const c of central) cdSize += c.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, SIG_EOCD, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const all = chunks.concat(central, [eocd]);
  let total = 0;
  for (const c of all) total += c.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of all) { out.set(c, pos); pos += c.length; }
  return out;
}
