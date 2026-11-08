/* Nexus OS · 开发者工坊 · 文件与 ZIP 读取
   硬规则：300 文件 / 总计 6 MB / 单资源 1 MB / ZIP 解压输出 6 MB 上限。
   浏览器端使用 DecompressionStream('deflate-raw')，不引入第三方库。 */
(function () {
  'use strict';

  var LIMITS = {
    files: 300,
    total: 6 * 1024 * 1024,
    single: 1 * 1024 * 1024,
    zipEntries: 300,
    zipOut: 6 * 1024 * 1024
  };

  var TEXT_EXT = /\.(html?|css|js|mjs|json|md|txt|svg|csv|cw|webmanifest)$/i;
  var BINARY_EXT = /\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|woff2?|ttf|otf)$/i;
  var MEDIA_MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp',
    svg: 'image/svg+xml', woff: 'font/woff', woff2: 'font/woff2',
    ttf: 'font/ttf', otf: 'font/otf'
  };

  /* 错误分类：dsCode 让上层能区分「格式问题」和「体积问题」，而不是只拿到一句话 */
  function zerr(code, msg) {
    var e = new Error(msg);
    e.dsCode = code;
    return e;
  }

  function extOf(p) { var m = String(p).match(/\.([a-z0-9]+)$/i); return m ? m[1].toLowerCase() : ''; }
  function basename(p) { return String(p).split('/').pop(); }
  function dirname(p) { var i = String(p).lastIndexOf('/'); return i >= 0 ? String(p).slice(0, i + 1) : ''; }
  function isText(p) { return TEXT_EXT.test(p); }
  function isBinary(p) { return BINARY_EXT.test(p); }
  function isZip(p) { return /\.zip$/i.test(p); }

  function normPath(p) {
    var s = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
    var parts = [];
    s.split('/').forEach(function (seg) {
      if (!seg || seg === '.') return;
      if (seg === '..') parts.pop(); else parts.push(seg);
    });
    return parts.join('/');
  }

  function unsafePath(p) {
    var s = String(p || '');
    return /^[a-zA-Z]:/.test(s) || /^\//.test(s) || /\\/.test(s) || s.split('/').indexOf('..') >= 0 || s.indexOf('\0') >= 0;
  }

  function fileText(files, p) {
    var v = files && files[p];
    return typeof v === 'string' ? v : (v && v.text) || null;
  }
  function fileDataUrl(files, p) {
    var v = files && files[p];
    return v && typeof v === 'object' ? v.dataUrl : null;
  }
  function totalSize(files) {
    var n = 0;
    Object.keys(files || {}).forEach(function (p) {
      var v = files[p];
      n += typeof v === 'string' ? v.length : ((v && v.dataUrl) ? v.dataUrl.length : 0);
    });
    return n;
  }
  function fmtBytes(n) {
    if (!n) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function readDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('读取文件失败')); };
      r.readAsDataURL(blob);
    });
  }

  function readOne(file, path) {
    var p = normPath(path);
    if (unsafePath(path)) return Promise.reject(zerr('path', '路径不安全：' + path));
    if (isZip(p)) {
      if (file.size > LIMITS.total) return Promise.reject(zerr('size', 'ZIP 体积 ' + fmtBytes(file.size) + '，超过 6 MB 上限'));
      return file.arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
    }
    if (file.size > LIMITS.single) {
      return Promise.reject(zerr('size', '单个资源 ' + fmtBytes(file.size) + '，超过 1 MB：' + p));
    }
    if (isText(p)) {
      return file.arrayBuffer().then(function (buf) {
        try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
        catch (e) { throw zerr('encoding', '文本不是 UTF-8 编码：' + p + '，请另存为 UTF-8 后再导入'); }
      });
    }
    if (isBinary(p)) {
      return readDataUrl(file).then(function (u) {
        return { dataUrl: u, mime: MEDIA_MIME[extOf(p)] || 'application/octet-stream', size: file.size };
      });
    }
    return file.text().then(function (t) { return t; });
  }

  function collectEntries(roots) {
    var out = [], pending = [];
    function walk(entry, path) {
      return new Promise(function (resolve) {
        if (entry.isFile) {
          entry.file(function (f) {
            out.push({ file: f, path: path + f.name });
            resolve();
          }, function () { resolve(); });
        } else if (entry.isDirectory) {
          var reader = entry.createReader();
          var readAll = function () {
            reader.readEntries(function (batch) {
              if (!batch.length) { resolve(); return; }
              batch.forEach(function (child) { pending.push(walk(child, path + entry.name + '/')); });
              readAll();
            }, function () { resolve(); });
          };
          readAll();
        } else { resolve(); }
      });
    }
    roots.forEach(function (r) { pending.push(walk(r, '')); });
    return Promise.all(pending).then(function () { return out; });
  }

  function readU16(b, o) { return b[o] | (b[o + 1] << 8); }
  function readU32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function inflateEntry(raw, method) {
    if (method === 0) return Promise.resolve(raw);
    if (method !== 8) return Promise.reject(zerr('format', '不支持的 ZIP 压缩方式（' + method + '），请用标准 deflate 重新压缩'));
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(zerr('unsupported', '当前浏览器不支持 ZIP 解压（需要 DecompressionStream），请改拖文件夹或单个 HTML。'));
    }
    var stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  /* 解压 ZIP，带输出上限：先按目录声明的解压尺寸做总量预检，避免 zip bomb。 */
  function unzipBytes(bytes, onProgress) {
    return new Promise(function (resolve, reject) {
      if (typeof DecompressionStream === 'undefined') {
        reject(zerr('unsupported', '当前浏览器不支持 ZIP 解压（需要 DecompressionStream），请改拖文件夹或单个 HTML。'));
        return;
      }
      var eocd = -1;
      for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) {
        if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { eocd = i; break; }
      }
      if (eocd < 0) { reject(zerr('format', '不是有效的 ZIP：找不到目录结尾，文件可能没下载完整')); return; }

      var total = readU16(bytes, eocd + 10);
      var offset = readU32(bytes, eocd + 16);
      var entries = [];
      var p = offset;
      var declaredOut = 0;

      for (var n = 0; n < total; n++) {
        if (readU32(bytes, p) !== 0x02014b50) break;
        var method = readU16(bytes, p + 10);
        var compSize = readU32(bytes, p + 20);
        var uncompSize = readU32(bytes, p + 24);
        var nameLen = readU16(bytes, p + 28);
        var extraLen = readU16(bytes, p + 30);
        var commentLen = readU16(bytes, p + 32);
        var localOff = readU32(bytes, p + 42);
        var name = new TextDecoder('utf-8').decode(bytes.slice(p + 46, p + 46 + nameLen));
        entries.push({ name: name, method: method, compSize: compSize, uncompSize: uncompSize, localOff: localOff });
        declaredOut += uncompSize;
        p += 46 + nameLen + extraLen + commentLen;
      }

      if (!entries.length) {
        reject(zerr('format', 'ZIP 里没有任何文件条目，可能是空压缩包'));
        return;
      }
      if (entries.length > LIMITS.zipEntries) {
        reject(zerr('size', 'ZIP 内条目 ' + entries.length + ' 个，超过 ' + LIMITS.zipEntries + ' 个上限'));
        return;
      }
      if (declaredOut > LIMITS.zipOut) {
        reject(zerr('size', 'ZIP 解压后约 ' + fmtBytes(declaredOut) + '，超过 6 MB 上限'));
        return;
      }

      var out = {};
      var queue = Promise.resolve();
      var seen = 0;
      var written = 0;
      var doneCount = 0;

      function finish() {
        resolve(cleanMap(out));
      }

      entries.forEach(function (en) {
        if (/\/$/.test(en.name)) return; // 目录
        if (/__MACOSX|\.DS_Store|Thumbs\.db/i.test(en.name)) return;
        if (unsafePath(en.name)) {
          queue = queue.then(function () {
            throw zerr('path', 'ZIP 内含不安全路径：' + en.name);
          });
          return;
        }
        seen++;
        if (seen > LIMITS.zipEntries) return;
        if (en.uncompSize > LIMITS.single) {
          queue = queue.then(function () {
            throw zerr('size', 'ZIP 内单个资源 ' + fmtBytes(en.uncompSize) + '，超过 1 MB：' + normPath(en.name));
          });
          return;
        }
        queue = queue.then(function () {
          var lp = en.localOff;
          if (readU32(bytes, lp) !== 0x04034b50) throw zerr('format', 'ZIP 结构损坏：找不到 ' + normPath(en.name) + ' 的文件头');
          var nl = readU16(bytes, lp + 26), el = readU16(bytes, lp + 28);
          var start = lp + 30 + nl + el;
          var raw = bytes.slice(start, start + en.compSize);
          return inflateEntry(raw, en.method).then(function (data) {
            written += data.length;
            if (written > LIMITS.zipOut) throw zerr('size', 'ZIP 解压输出超过 6 MB 上限，已中止');
            var path = normPath(en.name);
            if (!path) return;
            if (isText(path)) {
              try { out[path] = new TextDecoder('utf-8', { fatal: true }).decode(data); }
              catch (e2) { throw zerr('encoding', '文本不是 UTF-8 编码：' + path + '，请另存为 UTF-8 后重新打包'); }
            } else if (isBinary(path)) {
              var blob = new Blob([data], { type: MEDIA_MIME[extOf(path)] || 'application/octet-stream' });
              out[path] = readDataUrl(blob).then(function (u) {
                return { dataUrl: u, mime: MEDIA_MIME[extOf(path)] || '', size: data.length };
              });
            } else {
              // 未知类型不进入包，交给校验阶段提示
            }
            doneCount++;
            if (typeof onProgress === 'function') onProgress(doneCount, seen, path);
          });
        });
      });

      queue.then(function () {
        return Promise.all(Object.keys(out).map(function (k) {
          return Promise.resolve(out[k]).then(function (v) { out[k] = v; });
        }));
      }).then(finish, reject);
    });
  }

  function unzipText(text, onProgress) {
    return Promise.resolve().then(function () {
      return new TextEncoder().encode(text);
    }).then(function (bytes) { return unzipBytes(bytes, onProgress); });
  }

  /* 去掉系统垃圾文件，并移除唯一的公共顶层目录（例如 myapp/index.html → index.html） */
  function cleanMap(map) {
    var out = {};
    var keys = Object.keys(map || {}).filter(function (p) {
      return p && !/__MACOSX|\.DS_Store|Thumbs\.db/i.test(p);
    });
    if (!keys.length) return out;
    var firstSegs = {};
    keys.forEach(function (p) { var s = p.split('/')[0]; firstSegs[s] = (firstSegs[s] || 0) + 1; });
    var segs = Object.keys(firstSegs);
    if (segs.length === 1 && keys.every(function (p) { return p.indexOf(segs[0] + '/') === 0; })) {
      keys.forEach(function (p) { out[p.slice(segs[0].length + 1)] = map[p]; });
      return out;
    }
    keys.forEach(function (p) { out[p] = map[p]; });
    return out;
  }

  window.N26DSZip = {
    LIMITS: LIMITS,
    MEDIA_MIME: MEDIA_MIME,
    extOf: extOf,
    basename: basename,
    dirname: dirname,
    isText: isText,
    isBinary: isBinary,
    isZip: isZip,
    normPath: normPath,
    unsafePath: unsafePath,
    fileText: fileText,
    fileDataUrl: fileDataUrl,
    totalSize: totalSize,
    fmtBytes: fmtBytes,
    readOne: readOne,
    collectEntries: collectEntries,
    unzipBytes: unzipBytes,
    unzipText: unzipText,
    cleanMap: cleanMap
  };
})();
