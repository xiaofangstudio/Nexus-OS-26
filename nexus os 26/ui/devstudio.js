/* Nexus OS · 开发者工坊 · 主控
   本地优先：草稿进 IndexedDB；提交写 n26_store_pending；审核通过写 n26SelfPub。
   不依赖主壳，可被 apps/devstudio.html 直接通过 URL 打开。 */
(function () {
  'use strict';

  var Z = window.N26DSZip;
  var P = window.N26DSPreview;
  var LIMITS = Z.LIMITS;
  var INLINE_MAX = 160 * 1024;
  /* 按本脚本 URL 反推，避免在 iframe / 不同基址下被多拼一层目录 */
  var LOGO = (function () {
    var rel = '../../Desktop icon/Nexus OS 26.png';
    try {
      var sc = Array.prototype.find.call(document.scripts, function (s) { return s.src && s.src.indexOf('devstudio.js') >= 0; });
      if (sc && sc.src) return new URL(rel, sc.src).href;
    } catch (e) { }
    return rel;
  })();
  var GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3" y="4" width="18" height="14" rx="3"/><path d="M3 9h18"/><circle cx="6.6" cy="6.5" r=".9" fill="currentColor" stroke="none"/><circle cx="9.3" cy="6.5" r=".9" fill="currentColor" stroke="none"/></svg>';
  var ICON = {
    pass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 6v7M12 17.5v.5"/></svg>',
    fail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 4a8 8 0 1 0 8 8"/></svg>'
  };

  var KEY_PENDING = 'n26_store_pending';
  var KEY_SELFPUB = 'n26SelfPub';
  var KEY_MIRROR = 'n26_store_selfpub';

  var DB_NAME = 'n26-devstudio';
  var DB_VER = 1;
  var STORE = 'packages';

  var state = {
    pkgKey: null,
    files: null,
    manifest: null,
    entry: 'index.html',
    validation: null,
    importToken: 0,
    reviewTarget: null,
    approveTarget: null,
    versionsTarget: null,
    editTarget: null,
    editRec: null,
    editDraft: null,
    iconImage: '',
    draftSaved: false
  };
  var importStartTs = 0;

  /* ================= 云端（工坊 v1） ================= */
  var API_BASE = String(localStorage.getItem('n26_devstudio_api') || 'https://ai.fanggame.company').replace(/\/+$/, '');
  var CLOUD = { online: null, error: '', at: 0, fetching: false };

  function publisherId() {
    var id = '';
    try { id = localStorage.getItem('n26_devstudio_pid') || ''; } catch (e) { }
    if (!/^[a-z0-9_\-]{6,64}$/i.test(id)) {
      id = 'pub_' + now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      try { localStorage.setItem('n26_devstudio_pid', id); } catch (e) { }
    }
    return id;
  }
  function adminToken() {
    try {
      if (localStorage.getItem('n26_devstudio_admin')) return localStorage.getItem('n26_devstudio_admin');
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /_n26StoreAdmin$/.test(k)) return localStorage.getItem(k) || '';
      }
      return localStorage.getItem('n26StoreAdmin') || '';
    } catch (e) { return ''; }
  }
  function apiFetch(path, opts, timeout) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeout || 12000) : null;
    var o = Object.assign({}, opts || {});
    if (ctrl) o.signal = ctrl.signal;
    return fetch(API_BASE + path, o).then(function (r) {
      return r.text().then(function (t) {
        var b = null;
        try { b = JSON.parse(t); } catch (e) { }
        if (!r.ok) {
          var err = new Error((b && (b.error || b.hint)) || ('HTTP ' + r.status));
          err.status = r.status;
          err.body = b;
          throw err;
        }
        return b || {};
      });
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  /* 真实上传进度（XHR 才能拿到 upload.onprogress） */
  function cloudPublish(payload, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API_BASE + '/api/store/v1/publish', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = 30000;
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && onProgress) onProgress(Math.min(92, Math.round(e.loaded / e.total * 92)));
      };
      xhr.onload = function () {
        var b = null;
        try { b = JSON.parse(xhr.responseText); } catch (e) { }
        if (xhr.status >= 200 && xhr.status < 300 && b && b.ok) {
          if (onProgress) onProgress(97);
          resolve(b);
        } else {
          var err = new Error((b && (b.error || b.hint)) || ('HTTP ' + xhr.status));
          err.status = xhr.status;
          err.body = b;
          reject(err);
        }
      };
      xhr.onerror = function () { reject(new Error('连不上云端，检查网络后重试')); };
      xhr.ontimeout = function () { reject(new Error('上传超时，包可能太大')); };
      xhr.send(JSON.stringify(payload));
    });
  }

  function updateCloudChip() {
    var el = $('cloudChip');
    if (!el) return;
    if (CLOUD.online === null) el.textContent = '云端：检查中…';
    else if (CLOUD.online) el.textContent = '云端已连接 · ' + API_BASE.replace(/^https?:\/\//, '');
    else el.textContent = '云端未连接 · ' + (CLOUD.error || '本地模式');
    el.className = 'tiny cloud-chip ' + (CLOUD.online === true ? 'ok' : CLOUD.online === false ? 'bad' : '');
  }

  /* 从后端拉取自己的应用状态，覆盖本地镜像 */
  function refreshCloud(force) {
    if (CLOUD.fetching) return Promise.resolve(CLOUD.online);
    if (!force && now() - CLOUD.at < 15000) return Promise.resolve(CLOUD.online);
    CLOUD.fetching = true;
    return apiFetch('/api/store/v1/mine?publisherId=' + encodeURIComponent(publisherId()), {}, 10000).then(function (r) {
      CLOUD.online = true;
      CLOUD.error = '';
      CLOUD.at = now();
      var byApp = {};
      (r.items || []).forEach(function (it) { byApp[it.appId] = it; });
      return dbAll().then(function (all) {
        var jobs = [];
        (all || []).forEach(function (rec) {
          var it = rec.appId && byApp[rec.appId];
          if (!it) return;
          var changed = false;
          if (rec.status !== it.status) { rec.status = it.status; changed = true; }
          if ((rec.reviewNotes || '') !== (it.rejectReason || '')) { rec.reviewNotes = it.rejectReason || ''; changed = true; }
          if (it.version && rec.version !== it.version) { rec.version = it.version; changed = true; }
          if (it.desc && rec.desc !== it.desc) { rec.desc = it.desc; changed = true; }
          if (changed) { rec.updatedAt = now(); jobs.push(dbPut(rec)); }
        });
        return Promise.all(jobs);
      }).then(function () {
        updateCloudChip();
        refreshBadge();
        if ($('view-projects').classList.contains('on')) renderProjects();
        if ($('view-review').classList.contains('on')) renderReview();
        return true;
      });
    }).catch(function (e) {
      CLOUD.online = false;
      CLOUD.error = e.status === 400 ? '身份无效' : (e.message || '云端不可达');
      CLOUD.at = now();
      updateCloudChip();
      return false;
    }).finally(function () {
      CLOUD.fetching = false;
    });
  }

  /* ================= 基础工具 ================= */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return P.esc(s); }
  function now() { return Date.now(); }
  function uid(prefix) { return (prefix || 'ds') + '_' + now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function fmtBytes(n) { return Z.fmtBytes(n); }
  function pkgBytes(files) {
    var n = 0;
    Object.keys(files || {}).forEach(function (p) {
      var v = files[p];
      n += typeof v === 'string' ? v.length
        : v && v.dataUrl ? v.dataUrl.length
          : v && v.byteLength != null ? v.byteLength
            : (v && v.size) || 0;
    });
    return n;
  }
  function toast(msg, kind) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast on ' + (kind || '');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = 'toast'; }, 2600);
  }

  /* ================= localStorage（与主壳 nexus_ 前缀兼容） ================= */
  function readLS(key, fallback) {
    var names = ['nexus_' + key, key];
    for (var i = 0; i < names.length; i++) {
      try {
        var v = JSON.parse(localStorage.getItem(names[i]));
        if (v != null) return v;
      } catch (e) { }
    }
    return fallback;
  }
  function writeLS(key, value) {
    var str = JSON.stringify(value);
    var ok = false;
    try { localStorage.setItem('nexus_' + key, str); ok = true; } catch (e) { }
    if (!ok) return false;
    // 裸键便于直接打开的运行时读取；失败不影响主流程
    try { localStorage.setItem(key, str); } catch (e) { }
    if (key === KEY_SELFPUB) {
      try { localStorage.setItem(KEY_MIRROR, str); } catch (e) { }
    }
    return true;
  }
  function slimList(list) {
    return (list || []).map(function (p) {
      if (!p || !p.origin || p.origin !== 'devstudio') return p;
      var c = Object.assign({}, p);
      c.sources = null;
      return c;
    });
  }
  function persistList(key, list) {
    if (writeLS(key, list)) return true;
    var slim = slimList(list);
    if (writeLS(key, slim)) {
      toast('本地存储接近上限，已改为只保存索引（包体仍在 IndexedDB）', 'bad');
      return true;
    }
    return false;
  }

  /* ================= IndexedDB 草稿 ================= */
  var dbPromise = null;
  var idbBroken = false;
  var memoryDB = {};

  function dbOpen() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('indexeddb-unavailable')); return; }
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'pkgKey' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('indexeddb-open-failed')); };
    });
    return dbPromise;
  }
  function idbOp(mode, fn) {
    return dbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var store = tx.objectStore(STORE);
        var req = fn(store);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('indexeddb-op-failed')); };
      });
    });
  }
  function dbPut(rec) {
    if (idbBroken) { memoryDB[rec.pkgKey] = rec; return Promise.resolve(rec); }
    return idbOp('readwrite', function (s) { return s.put(rec); }).catch(function () {
      idbBroken = true;
      memoryDB[rec.pkgKey] = rec;
      toast('IndexedDB 不可用，草稿仅保存在本次会话', 'bad');
      return rec;
    });
  }
  function dbGet(key) {
    if (idbBroken) return Promise.resolve(memoryDB[key] || null);
    return idbOp('readonly', function (s) { return s.get(key); }).catch(function () {
      idbBroken = true;
      return memoryDB[key] || null;
    });
  }
  function dbAll() {
    if (idbBroken) return Promise.resolve(Object.keys(memoryDB).map(function (k) { return memoryDB[k]; }));
    return idbOp('readonly', function (s) { return s.getAll(); }).catch(function () {
      idbBroken = true;
      return Object.keys(memoryDB).map(function (k) { return memoryDB[k]; });
    });
  }

  function findRecord(all, name) {
    var same = (all || []).filter(function (r) { return r.name === name; });
    if (!same.length) return null;
    same.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return same[0];
  }

  /* ================= 视图切换 ================= */
  var VIEW_META = {
    workbench: ['开发者工坊 / 创建与导入', '把 HTML 拖进来，剩下的交给工坊'],
    projects: ['开发者工坊 / 我的应用', '版本、状态与审核回写'],
    review: ['开发者工坊 / 审核台', '过审或拒绝，并回写原因'],
    market: ['开发者工坊 / 应用市场', '已上架版本在这里出现']
  };
  function switchView(name) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('on'); });
    var el = $('view-' + name);
    if (el) el.classList.add('on');
    document.querySelectorAll('.fm-sidebar-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === name);
    });
    var meta = VIEW_META[name] || VIEW_META.workbench;
    $('crumb').textContent = meta[0];
    $('pageTitle').textContent = meta[1];
    if (name === 'projects') { renderProjects(); refreshCloud(); }
    if (name === 'review') { renderReview(); refreshCloud(); }
    if (name === 'market') renderMarket();
    var sc = document.querySelector('.fm-main');
    if (sc) sc.scrollTop = 0;
  }
  window.N26DSNav = switchView;
  document.querySelectorAll('.fm-sidebar-item[data-view]').forEach(function (b) {
    b.addEventListener('click', function () { switchView(b.dataset.view); });
  });
  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () { switchView(b.dataset.go); });
  });
  document.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () { $(b.dataset.close).classList.remove('on'); });
  });
  document.querySelectorAll('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('on'); });
  });

  /* ================= 主题：沿用 body.dark-mode ================= */
  function applyTheme(dark) {
    document.body.classList.toggle('dark-mode', !!dark);
  }
  function initTheme() {
    var stored = null;
    try { stored = localStorage.getItem('nexus_theme') || localStorage.getItem('theme'); } catch (e) { }
    applyTheme(stored === 'dark');
  }
  initTheme();
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (d && d.__nexusEvt && d.name === 'theme' && d.data) applyTheme(!!d.data.dark);
  });

  /* ================= 拖拽 ================= */
  var dragDepth = 0;
  ['dragenter', 'dragover'].forEach(function (ev) {
    window.addEventListener(ev, function (e) {
      e.preventDefault();
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0) {
        if (ev === 'dragenter') dragDepth++;
        document.body.classList.add('dragging');
      }
    });
  });
  window.addEventListener('dragleave', function () {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) document.body.classList.remove('dragging');
  });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    if (e.dataTransfer) importFromDataTransfer(e.dataTransfer);
  });
  $('dropzone').addEventListener('click', function (e) {
    if (e.target.closest('button')) return;
    $('fileInput').click();
  });

  /* ---------- 导入流水线：五段真实进度 + 错误分类 ---------- */
  var STAGES = [
    { key: 'receive', label: '接收文件', pct: 30 },
    { key: 'unpack', label: '解包展开', pct: 50 },
    { key: 'detect', label: '识别入口与清单', pct: 64 },
    { key: 'check', label: '体积与路径检查', pct: 78 },
    { key: 'preview', label: '生成沙箱预览', pct: 100 }
  ];
  var stageEls = {};
  var lastSource = null;

  function importFail(code, message) {
    var e = new Error(message);
    e.dsCode = code;
    return e;
  }
  function resetStages() {
    stageEls = {};
    var box = $('importStages');
    box.innerHTML = STAGES.map(function (s) {
      return '<div class="stage" data-k="' + s.key + '"><i></i><span class="stage-l">' + s.label +
        '</span><span class="stage-d">等待</span></div>';
    }).join('');
    STAGES.forEach(function (s) { stageEls[s.key] = box.querySelector('[data-k="' + s.key + '"]'); });
    $('progressPanel').classList.add('on');
    $('progressPanel').classList.remove('bad');
    $('progressTitle').textContent = '正在处理应用包';
    setImportProgress(0, '准备中…');
  }
  function stageKeyIndex(key) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === key) return i;
    return 0;
  }
  function stageSet(key, status, detail) {
    var el = stageEls[key];
    if (!el) return;
    el.className = 'stage ' + status;
    if (detail != null) el.querySelector('.stage-d').textContent = detail;
  }
  function stageProgress(key, frac, detail) {
    var i = stageKeyIndex(key);
    var from = i === 0 ? 0 : STAGES[i - 1].pct;
    var to = STAGES[i].pct;
    var f = Math.max(0, Math.min(1, frac || 0));
    setImportProgress(from + (to - from) * f, detail || STAGES[i].label);
  }

  var ERR_META = {
    size: ['体积问题', 'size', '单个文件 ≤ 1 MB，合计 ≤ 6 MB，最多 300 个文件。先压缩图片，或删掉用不到的素材再试。'],
    format: ['格式问题', 'format', '确认包里有 index.html，且是标准 ZIP；RAR / 7z 需要先转成 ZIP。'],
    path: ['路径安全问题', 'path', '包内路径不能包含 ..、盘符或反斜杠，请重新打包。'],
    encoding: ['编码问题', 'encoding', '文本文件请用 UTF-8 保存（VS Code 右下角可以切换编码）。'],
    unsupported: ['浏览器不支持', 'unsupported', '当前浏览器不能解压 ZIP，请改用「选择文件夹」，或换最新版 Chrome / Edge。'],
    unknown: ['导入失败', 'unknown', '可以重试；如果反复失败，把整个文件夹压成 ZIP 再拖进来。']
  };
  function classifyError(e) {
    var m = String((e && e.message) || e || '');
    if (e && e.dsCode && ERR_META[e.dsCode]) return e.dsCode;
    if (/DecompressionStream|浏览器不支持/.test(m)) return 'unsupported';
    if (/路径|盘符/.test(m)) return 'path';
    if (/编码|UTF-8/i.test(m)) return 'encoding';
    if (/超过|上限|MB|文件数|体积/.test(m)) return 'size';
    if (/ZIP|压缩|解压|目录结尾|文件头|格式/.test(m)) return 'format';
    return 'unknown';
  }
  function hideImportError() {
    $('importError').className = 'import-error';
  }
  function showImportError(e) {
    var code = classifyError(e);
    var meta = ERR_META[code];
    $('importError').className = 'import-error on ' + meta[1];
    $('ieTitle').textContent = meta[0];
    $('ieMsg').textContent = String((e && e.message) || e || '导入失败');
    $('ieHint').textContent = meta[2];
    $('progressPanel').classList.add('bad');
    $('progressTitle').textContent = '导入中断';
  }
  function handleImportFail(e) {
    var run = $('importStages').querySelector('.stage.run');
    if (run) {
      run.className = 'stage fail';
      run.querySelector('.stage-d').textContent = '中断';
    }
    showImportError(e);
  }

  function importFromDataTransfer(dt) {
    var items = dt.items;
    if (items && items.length && items[0].webkitGetAsEntry) {
      var roots = [];
      for (var i = 0; i < items.length; i++) {
        var entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
        if (entry) roots.push(entry);
      }
      if (roots.length) {
        lastSource = { kind: 'entries', roots: roots };
        importEntries(roots);
        return;
      }
    }
    var files = dt.files ? Array.from(dt.files) : [];
    if (files.length) ingestFiles(files);
  }

  function importEntries(roots) {
    var token = ++state.importToken;
    resetStages();
    hideImportError();
    stageSet('receive', 'run', '正在读取拖入内容…');
    setImportProgress(2, '正在接收文件…');
    Z.collectEntries(roots).then(function (list) {
      if (token !== state.importToken) return;
      if (!list.length) throw importFail('format', '拖入的文件夹里没有文件');
      if (list.length > LIMITS.files) {
        throw importFail('size', '拖入 ' + list.length + ' 个文件，超过 ' + LIMITS.files + ' 个上限');
      }
      var map = {};
      var done = 0;
      return Promise.all(list.map(function (it) {
        var p = Z.normPath(it.path);
        return Z.readOne(it.file, p).then(function (v) {
          map[p] = v;
          done++;
          if (token === state.importToken) stageProgress('receive', done / list.length, done + ' / ' + list.length + ' 个文件');
        });
      })).then(function () {
        if (token !== state.importToken) return;
        stageSet('receive', 'done', list.length + ' 个文件 · ' + fmtBytes(pkgBytes(map)));
        return importFileMap(map, token);
      });
    }).catch(function (e) {
      if (token === state.importToken) handleImportFail(e);
    });
  }

  $('pickFileBtn').addEventListener('click', function () { $('fileInput').click(); });
  $('pickDirBtn').addEventListener('click', function () { $('dirInput').click(); });
  $('fileInput').addEventListener('change', function (e) {
    var fs = Array.from(e.target.files || []);
    if (fs.length) ingestFiles(fs);
    e.target.value = '';
  });
  $('dirInput').addEventListener('change', function (e) {
    var fs = Array.from(e.target.files || []);
    if (fs.length) ingestFiles(fs);
    e.target.value = '';
  });
  $('reimportBtn').addEventListener('click', resetToDrop);

  function ingestFiles(files) {
    var token = ++state.importToken;
    lastSource = { kind: 'files', files: files };
    resetStages();
    hideImportError();
    if (!files.length) {
      handleImportFail(importFail('format', '没有收到任何文件'));
      return Promise.resolve();
    }
    if (files.length > LIMITS.files) {
      stageSet('receive', 'fail', files.length + ' 个文件');
      showImportError(importFail('size', '一次最多导入 ' + LIMITS.files + ' 个文件，当前 ' + files.length + ' 个'));
      return Promise.resolve();
    }
    stageSet('receive', 'run', '0 / ' + files.length);
    setImportProgress(2, '正在接收文件…');
    var map = {};
    var total = files.length;
    var done = 0;
    return Promise.all(files.map(function (f) {
      var p = Z.normPath(f.webkitRelativePath || f.name);
      return Z.readOne(f, p).then(function (v) {
        map[p] = v;
        done++;
        if (token === state.importToken) {
          stageProgress('receive', done / total, done + ' / ' + total + ' 个文件');
        }
        return v;
      });
    })).then(function () {
      if (token !== state.importToken) return;
      stageSet('receive', 'done', total + ' 个文件 · ' + fmtBytes(pkgBytes(map)));
      return importFileMap(map, token);
    }).catch(function (e) {
      if (token !== state.importToken) return;
      handleImportFail(e);
    });
  }

  function importFileMap(inputMap, token) {
    var keys = Object.keys(inputMap || {});
    return Promise.resolve().then(function () {
      if (!keys.length) throw importFail('format', '包里没有任何文件');
      var zipKey = keys.length === 1 && Z.isZip(keys[0]) ? keys[0] : null;
      if (!zipKey) {
        var zips = keys.filter(function (k) { return Z.isZip(k); });
        var hasPage = keys.some(function (k) { return /\.(html?|json)$/i.test(k); });
        if (zips.length === 1 && !hasPage) zipKey = zips[0];
      }

      if (zipKey) {
        var raw = inputMap[zipKey];
        stageSet('unpack', 'run', '正在解压 ' + Z.basename(zipKey) + '…');
        var onTick = function (d, t) {
          if (token === state.importToken) stageProgress('unpack', d / Math.max(1, t), '解压中 · ' + d + '/' + t);
        };
        var unzip = typeof raw === 'string' ? Z.unzipText(raw, onTick) : Z.unzipBytes(raw, onTick);
        return unzip.then(function (zmap) {
          if (token !== state.importToken) return null;
          stageSet('unpack', 'done', '已解压 ' + Object.keys(zmap).length + ' 个文件');
          return finishImport(zmap, token);
        });
      }

      stageSet('unpack', 'done', '目录导入，无需解压');
      return finishImport(Z.cleanMap(inputMap), token);
    });
  }

  function finishImport(files, token) {
    if (token != null && token !== state.importToken) return;

    /* 第三段：识别入口与清单 */
    stageSet('detect', 'run', '正在识别入口与清单…');
    if (!files || !Object.keys(files).length) throw importFail('format', '包里没有任何可用文件');
    if (!Object.keys(files).some(function (p) { return /\.html?$/i.test(p); })) {
      throw importFail('format', '包里没有 HTML 入口文件（.html / .htm）');
    }
    state.files = files;
    var manifest = null;
    var mfPath = Object.keys(files).find(function (p) { return /^(app|manifest|package)\.json$/i.test(p); });
    var mfError = null;
    if (mfPath) {
      try { manifest = JSON.parse(Z.fileText(files, mfPath)); }
      catch (e) { manifest = null; mfError = 'app.json 解析失败，已按推断处理'; }
    }
    if (manifest) manifest.__inferred = false;
    state.manifest = Object.assign(inferManifest(files), manifest || {});
    state.entry = resolveEntry(files, state.manifest);
    state.manifest.entry = state.entry;
    state.entry = state.entry || Object.keys(files)[0];
    state.pkgKey = null;
    state.validation = null;
    state.iconImage = '';
    state.draftSaved = false;
    stageSet('detect', 'done', state.entry + ' · ' + (manifest ? 'app.json' : '推断清单'));

    /* 第四段：体积、类型、路径检查（失败即中断） */
    stageSet('check', 'run', '正在检查体积、类型与路径…');
    var names = Object.keys(files);
    var size = pkgBytes(files);
    if (names.length > LIMITS.files) throw importFail('size', '文件数 ' + names.length + ' 超过 ' + LIMITS.files + ' 个上限');
    if (size > LIMITS.total) throw importFail('size', '应用包 ' + fmtBytes(size) + '，超过 6 MB 上限');
    var oversized = names.filter(function (p) {
      var v = files[p];
      var n = typeof v === 'string' ? v.length : (v && v.dataUrl ? v.dataUrl.length : (v && v.byteLength) || 0);
      return n > LIMITS.single;
    });
    if (oversized.length) throw importFail('size', '单个资源超过 1 MB：' + oversized[0]);
    var badType = names.filter(function (p) { return !Z.isText(p) && !Z.isBinary(p); });
    if (badType.length) throw importFail('format', '不支持的文件类型：' + badType.slice(0, 3).join('、'));
    var unsafe = names.filter(Z.unsafePath);
    if (unsafe.length) throw importFail('path', '路径不安全：' + unsafe[0]);
    stageSet('check', 'done', fmtBytes(size) + ' / 6 MB · ' + names.length + ' / ' + LIMITS.files + ' 文件');

    /* 第五段：沙箱预览 */
    stageSet('preview', 'run', '正在装载沙箱…');
    return renderPreview().then(function () {
      if (token != null && token !== state.importToken) return;
      stageSet('preview', 'done', '沙箱已加载');
      setImportProgress(100, '导入完成');
      $('progressTitle').textContent = '导入完成';
      setTimeout(function () { $('progressPanel').classList.remove('on'); }, 650);
      renderWorkspace();
      $('workspace').classList.add('on');
      $('dropCard').classList.add('hidden');
      $('pkgPill').textContent = '已载入 · ' + Object.keys(files).length + ' 文件';
      $('readyHint').textContent = '先运行校验；通过后提交审核';
      $('submitBtn').disabled = true;
      resetTimeline(0);
      renderChecksPlaceholder(mfError);
      toast('已载入「' + state.manifest.name + '」', 'ok');
      return saveImportedDraft();
    });
  }

  function inferManifest(files) {
    var html = Object.keys(files).find(function (p) { return /index\.html?$/i.test(p); }) ||
      Object.keys(files).find(function (p) { return /\.html?$/i.test(p); }) || '';
    var text = html ? (Z.fileText(files, html) || '') : '';
    var title = (text.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] ||
      (html ? Z.basename(html).replace(/\.html?$/i, '') : '未命名应用');
    return {
      name: String(title || '').trim().slice(0, 40) || '未命名应用',
      version: '1.0.0',
      entry: html,
      category: '工具',
      desc: '',
      icon: 'fa-cube',
      color: '#4A9BF5'
    };
  }

  function resolveEntry(files, manifest) {
    if (manifest && manifest.entry) {
      var p = Z.normPath(manifest.entry);
      if (files[p]) return p;
      var lower = Object.keys(files).find(function (k) { return k.toLowerCase() === p.toLowerCase(); });
      if (lower) return lower;
    }
    var idx = Object.keys(files).find(function (p) { return /^index\.html?$/i.test(p); });
    if (idx) return idx;
    var pages = Object.keys(files).filter(function (p) { return /\.html?$/i.test(p); })
      .sort(function (a, b) { return a.split('/').length - b.split('/').length; });
    return pages[0] || Object.keys(files)[0] || '';
  }

  /* ================= 草稿（IndexedDB） ================= */
  function saveImportedDraft() {
    var mf = state.manifest;
    var files = state.files;
    var bytes = pkgBytes(files);
    return dbAll().then(function (all) {
      var same = findRecord(all, mf.name);
      var rec = {
        pkgKey: same ? same.pkgKey : uid('app'),
        appId: same ? (same.appId || same.pkgKey) : '',
        name: mf.name,
        version: String(mf.version || '1.0.0'),
        entry: state.entry,
        category: mf.category || '工具',
        desc: mf.desc || '',
        icon: mf.icon || 'fa-cube',
        color: mf.color || '#4A9BF5',
        manifest: mf,
        files: files,
        bytes: bytes,
        status: 'draft',
        reviewNotes: '',
        notes: same ? (same.notes || '') : '',
        versions: (same && same.versions) || [],
        createdAt: same ? (same.createdAt || now()) : now(),
        updatedAt: now(),
        releaseId: uid('rel')
      };
      rec.appId = rec.pkgKey;
      return dbPut(rec).then(function () {
        state.pkgKey = rec.pkgKey;
        state.draftSaved = true;
        $('pkgPill').textContent = '草稿已存 · ' + Object.keys(files).length + ' 文件';
        return rec;
      });
    }).catch(function (e) {
      toast('草稿保存失败：' + (e.message || '未知错误'), 'bad');
    });
  }

  function saveDraftMeta(rec) {
    rec.updatedAt = now();
    return dbPut(rec);
  }

  /* ================= 预览 ================= */
  function renderPreview() {
    return Promise.resolve().then(function () {
      P.render($('previewFrame'), state.files, state.entry, {});
      $('previewUrl').textContent = 'sandbox://' + state.entry;
    });
  }
  $('refreshPreview').addEventListener('click', function () {
    if (!state.files) return;
    renderPreview();
    toast('预览已刷新');
  });

  /* ================= 工作区渲染 ================= */
  function renderWorkspace() {
    var files = state.files, mf = state.manifest;
    if (!files) return;
    $('pkgIcon').innerHTML = state.iconImage ? '<img src="' + esc(state.iconImage) + '" alt="">' : GLYPH;
    $('pkgName').textContent = mf.name || '未命名应用';
    $('pkgSub').textContent = (mf.desc || 'HTML 应用包') + ' · ' + (mf.category || '工具');
    $('metaEntry').textContent = state.entry;
    $('metaVersion').textContent = mf.version || '1.0.0';
    $('metaSize').textContent = Object.keys(files).length + ' 个 · ' + fmtBytes(pkgBytes(files));
    $('metaManifest').textContent = mf.__inferred === false ? 'app.json' : '推断';
    var list = $('fileList');
    list.innerHTML = '';
    Object.keys(files).sort().forEach(function (p) {
      var v = files[p];
      var size = typeof v === 'string' ? v.length : (v.size || 0);
      var row = document.createElement('div');
      row.className = 'file';
      row.innerHTML = '<span class="ext">' + esc(Z.extOf(p) || '?') + '</span>' +
        '<span class="truncate' + (p === state.entry ? ' entry' : '') + '">' + esc(p) + '</span>' +
        '<span class="sz">' + fmtBytes(size) + '</span>';
      list.appendChild(row);
    });
  }

  function setImportProgress(pct, text) {
    $('progressPanel').classList.add('on');
    $('importBar').style.width = Math.max(0, Math.min(100, pct)) + '%';
    $('importPct').textContent = Math.round(pct) + '%';
    $('importStage').textContent = text;
  }

  function resetTimeline(active) {
    document.querySelectorAll('.tl').forEach(function (t, i) {
      t.className = 'tl' + (i === active ? ' on' : '');
    });
  }
  function markTimeline(index, done) {
    var t = document.querySelectorAll('.tl')[index];
    if (!t) return;
    t.classList.add(done ? 'done' : 'on');
  }

  function resetToDrop() {
    state.files = null;
    state.manifest = null;
    state.entry = 'index.html';
    state.pkgKey = null;
    state.validation = null;
    $('workspace').classList.remove('on');
    $('dropCard').classList.remove('hidden');
    $('checks').innerHTML = '';
    $('checkSummary').style.display = 'none';
    $('submitBtn').disabled = true;
    $('pkgPill').textContent = '未载入包';
    $('previewFrame').srcdoc = '';
    $('progressPanel').classList.remove('on');
    $('progressPanel').classList.remove('bad');
    $('importStages').innerHTML = '';
    hideImportError();
    resetTimeline(0);
    switchView('workbench');
  }

  /* 失败后重试：文件来源仍在时直接重跑，否则重新选文件 */
  $('ieRetry').addEventListener('click', function () {
    hideImportError();
    if (!lastSource) { $('fileInput').click(); return; }
    if (lastSource.kind === 'entries') importEntries(lastSource.roots);
    else ingestFiles(lastSource.files);
  });
  $('iePick').addEventListener('click', function () {
    hideImportError();
    $('fileInput').click();
  });

  /* ================= 校验 ================= */
  $('validateBtn').addEventListener('click', runValidation);

  function runValidation() {
    if (!state.files) { toast('先导入一个包', 'bad'); return; }
    var btn = $('validateBtn');
    btn.disabled = true;
    var box = $('checks');
    box.innerHTML = '';
    $('checkSummary').style.display = 'none';
    importStartTs = performance.now();
    setTimeout(function () {
      box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 80);
    var items = buildChecks(state.files, state.manifest, state.entry);
    var results = [];
    var i = 0;
    function next() {
      if (i >= items.length) {
        var rest = Math.max(0, 1500 - (performance.now() - importStartTs));
        setTimeout(function () { finishChecks(results, btn); }, rest);
        return;
      }
      var item = items[i++];
      var el = document.createElement('div');
      el.className = 'check run';
      el.innerHTML = '<span class="check-ico">' + ICON.run + '</span><div class="grow"><div class="check-t">' +
        esc(item.label) + '</div><div class="check-d">' + esc(item.desc || '') + '</div></div>' +
        '<span class="check-tag">' + esc(item.tag || '') + '</span>';
      box.appendChild(el);
      Promise.resolve().then(item.run).then(function (r) {
        var res = r || { level: 'pass', detail: '' };
        results.push({ item: item, res: res });
        var cls = res.level === 'fail' ? 'fail' : res.level === 'warn' ? 'warn' : 'pass';
        el.className = 'check ' + cls;
        el.querySelector('.check-ico').innerHTML = ICON[cls];
        if (res.detail) el.querySelector('.check-d').textContent = res.detail;
        setTimeout(next, 90);
      }).catch(function (e) {
        results.push({ item: item, res: { level: 'fail', detail: e.message || '校验器异常' } });
        el.className = 'check fail';
        el.querySelector('.check-ico').innerHTML = ICON.fail;
        el.querySelector('.check-d').textContent = e.message || '校验器异常';
        setTimeout(next, 90);
      });
    }
    next();
  }

  function finishChecks(results, btn) {
    btn.disabled = false;
    var fails = results.filter(function (r) { return r.res.level === 'fail'; });
    var warns = results.filter(function (r) { return r.res.level === 'warn'; });
    var pass = fails.length === 0;
    state.validation = { pass: pass, at: now(), fails: fails.length, warns: warns.length };
    var sum = $('checkSummary');
    sum.style.display = 'flex';
    sum.className = 'check-summary ' + (pass ? 'ok' : 'bad');
    sum.innerHTML = pass
      ? '<b>校验通过</b><span class="grow">' + (warns.length ? warns.length + ' 项提醒，不影响提交' : '所有硬性检查都通过') + '</span><button class="btn sm primary" id="sumSubmit">去提交</button>'
      : '<b>有 ' + fails.length + ' 项必须修复</b><span class="grow">修复后重新导入，再跑一次校验</span>';
    if (pass) {
      $('submitBtn').disabled = false;
      $('readyHint').textContent = '校验通过 · 可以提交审核';
      var sumSubmit = $('sumSubmit');
      if (sumSubmit) sumSubmit.addEventListener('click', openSubmit);
      markTimeline(1, true);
    } else {
      $('submitBtn').disabled = true;
      $('readyHint').textContent = '校验未通过，先修复标记为红色的项';
    }
  }

  function renderChecksPlaceholder(mfError) {
    var box = $('checks');
    box.innerHTML = '';
    var hint = document.createElement('div');
    hint.className = 'tiny muted';
    hint.style.padding = '4px 2px';
    hint.textContent = mfError || '尚未校验。点击「运行校验」检查结构、安全与运行时冒烟。';
    box.appendChild(hint);
  }

  function buildChecks(files, mf, entry) {
    var names = Object.keys(files);
    var entries = names.filter(function (p) { return /\.html?$/i.test(p); });
    var html = Z.fileText(files, entry) || '';
    var items = [];

    items.push({ label: '包结构与入口', tag: 'structure', run: function () {
      if (!files[entry]) return { level: 'fail', detail: '找不到入口文件 ' + entry };
      if (!entries.length) return { level: 'fail', detail: '包内没有 HTML 文件' };
      return { level: 'pass', detail: '入口 ' + entry + '，共 ' + names.length + ' 个文件' };
    }});

    items.push({ label: '清单信息', tag: 'manifest', run: function () {
      var name = String(mf.name || '').trim();
      if (!name) return { level: 'fail', detail: '应用名称不能为空' };
      if (name.length > 40) return { level: 'fail', detail: '名称超过 40 字' };
      if (!/^\d+(\.\d+){0,2}([.-][\w]+)?$/.test(String(mf.version || '1.0.0'))) {
        return { level: 'warn', detail: '版本号不像语义化版本，建议 1.0.0' };
      }
      return { level: 'pass', detail: name + ' · v' + (mf.version || '1.0.0') };
    }});

    items.push({ label: '体积与文件数', tag: 'limits', run: function () {
      if (names.length > LIMITS.files) return { level: 'fail', detail: '文件数 ' + names.length + ' 超过 ' + LIMITS.files };
      var size = pkgBytes(files);
      if (size > LIMITS.total) return { level: 'fail', detail: '包体积 ' + fmtBytes(size) + ' 超过 6 MB' };
      var big = names.filter(function (p) {
        var v = files[p];
        var s = typeof v === 'string' ? v.length : (v.size || 0);
        return s > LIMITS.single;
      });
      if (big.length) return { level: 'fail', detail: '单资源超过 1 MB：' + big[0] };
      return { level: 'pass', detail: fmtBytes(size) + ' / 6 MB，' + names.length + ' / ' + LIMITS.files + ' 文件' };
    }});

    items.push({ label: '文件类型与路径安全', tag: 'security', run: function () {
      var badType = names.filter(function (p) { return !Z.isText(p) && !Z.isBinary(p); });
      if (badType.length) return { level: 'fail', detail: '不支持的扩展名：' + badType.slice(0, 3).join('、') };
      var unsafe = names.filter(Z.unsafePath);
      if (unsafe.length) return { level: 'fail', detail: '路径不安全：' + unsafe[0] };
      return { level: 'pass', detail: '仅文本与图片/字体，路径已规范化' };
    }});

    items.push({ label: 'HTML 基础结构', tag: 'html', run: function () {
      if (!/<(html|body)[\s>]/i.test(html)) return { level: 'warn', detail: '缺少 <html>/<body>，浏览器会自动补全' };
      if (!/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) return { level: 'warn', detail: '缺少 <title>，商店卡片会退回文件名' };
      return { level: 'pass', detail: '基础标签完整' };
    }});

    items.push({ label: '外部资源与跳转', tag: 'network', run: function () {
      var refs = scanExternal(files);
      if (refs.length) return { level: 'warn', detail: '发现 ' + refs.length + ' 个外链（沙箱 CSP 会拦截）：' + refs.slice(0, 2).join('、') };
      return { level: 'pass', detail: '没有发现外部脚本/样式/图片引用' };
    }});

    items.push({ label: '危险 API 扫描', tag: 'sandbox', run: function () {
      var hits = scanDangerous(files);
      if (hits.length) return { level: 'warn', detail: '发现：' + hits.join('、') + '；沙箱内会被限制' };
      return { level: 'pass', detail: '未发现常见危险调用' };
    }});

    items.push({ label: '沙箱冒烟测试', tag: 'runtime', run: function () { return P.smokeTest(files, entry, 5000); }});

    return items;
  }

  function scanExternal(files) {
    var out = [];
    Object.keys(files).forEach(function (p) {
      if (!Z.isText(p) || /\.(svg|csv|md|txt)$/i.test(p)) return;
      var text = Z.fileText(files, p) || '';
      var re = /(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
      var m;
      while ((m = re.exec(text))) out.push(m[1].slice(0, 48));
      var re2 = /url\(\s*['"]?(https?:\/\/[^)'"]+)/gi;
      while ((m = re2.exec(text))) out.push(m[1].slice(0, 48));
    });
    return out;
  }

  function scanDangerous(files) {
    var hits = [];
    Object.keys(files).forEach(function (p) {
      if (!/\.(html?|js|mjs)$/i.test(p)) return;
      var text = Z.fileText(files, p) || '';
      if (/eval\s*\(|new\s+Function\s*\(/.test(text) && hits.indexOf('eval / new Function') < 0) hits.push('eval / new Function');
      if (/document\.write\s*\(/.test(text) && hits.indexOf('document.write') < 0) hits.push('document.write');
      if (/top\.location|window\.top\.location|parent\.location/.test(text) && hits.indexOf('顶层跳转') < 0) hits.push('顶层跳转');
    });
    return hits;
  }

  /* ================= 提交审核 ================= */
  $('submitBtn').addEventListener('click', openSubmit);

  function openSubmit() {
    if (!state.validation || !state.validation.pass) { toast('先通过校验', 'bad'); return; }
    var mf = state.manifest;
    $('subName').value = mf.name || '';
    $('subVersion').value = mf.version || '1.0.0';
    suggestVersion(mf.name).then(function (v) { $('subVersion').value = v; });
    $('subCategory').value = mf.category || '工具';
    $('subNotes').value = '';
    $('subAgree').checked = false;
    $('submitForm').style.display = '';
    $('uploadState').classList.remove('on');
    $('submitSuccess').style.display = 'none';
    $('submitDoneFoot').style.display = 'none';
    $('submitFoot').style.display = 'flex';
    $('confirmSubmit').disabled = false;
    $('submitModal').classList.add('on');
  }

  function suggestVersion(name) {
    return dbAll().then(function (all) {
      var same = findRecord(all, name);
      if (!same) return state.manifest.version || '1.0.0';
      var m = String(same.version || '1.0.0').match(/(\d+)\.(\d+)\.(\d+)/);
      if (!m) return '1.0.1';
      return m[1] + '.' + m[2] + '.' + (Number(m[3]) + 1);
    }).catch(function () {
      return state.manifest.version || '1.0.0';
    });
  }

  $('doneCreate').addEventListener('click', function () {
    $('submitModal').classList.remove('on');
    resetToDrop();
  });
  $('doneGo').addEventListener('click', function () {
    $('submitModal').classList.remove('on');
    switchView('review');
  });

  $('confirmSubmit').addEventListener('click', function () {
    var name = $('subName').value.trim();
    var version = $('subVersion').value.trim();
    if (!name) { toast('填写应用名称', 'bad'); return; }
    if (!/^\d+(\.\d+){0,2}([.\-][\w]+)?$/.test(version)) { toast('版本号格式不对，建议 1.0.0', 'bad'); return; }
    if (!$('subAgree').checked) { toast('先确认合规声明', 'bad'); return; }

    var category = $('subCategory').value;
    var notes = $('subNotes').value.trim();
    var mf = Object.assign({}, state.manifest, { name: name, version: version, category: category });
    var files = state.files;
    var bytes = pkgBytes(files);

    $('confirmSubmit').disabled = true;
    $('submitForm').style.display = 'none';
    $('uploadState').classList.add('on');
    $('submitFoot').style.display = 'none';

    function prog(pct, label) {
      $('submitBar').style.width = pct + '%';
      $('submitPct').textContent = pct + '%';
      if (label) $('submitStage').textContent = label;
    }
    prog(3, '正在整理包体…');

    var savedRec = null;
    dbAll().then(function (all) {
      var same = findRecord(all, name);
      var pkgKey = state.pkgKey || (same ? same.pkgKey : uid('app'));
      var versions = ((same && same.versions) || []).slice();
      prog(6, '正在上传到云端…');

      var payload = {
        appId: same && same.cloud && same.appId ? same.appId : undefined,
        name: name,
        version: version,
        desc: mf.desc || '',
        publisher: 'Nexus 开发者工坊',
        publisherId: publisherId(),
        category: category,
        entry: state.entry,
        icon: mf.icon || 'fa-cube',
        color: mf.color || '#4A9BF5',
        iconImage: (same && same.iconImage) || state.iconImage || '',
        promo: (same && same.promo) || [],
        notes: notes,
        files: files
      };

      return cloudPublish(payload, function (p) {
        prog(p, p < 92 ? '正在上传到云端…' : '服务器正在登记版本…');
      }).then(function (res) {
        prog(100, '提交完成');
        versions.push({ version: version, at: now(), status: 'pending', notes: notes, releaseId: res.releaseId });
        var rec = {
          pkgKey: pkgKey,
          appId: res.appId,
          cloud: true,
          releaseId: res.releaseId,
          name: name,
          version: version,
          entry: state.entry,
          category: category,
          desc: mf.desc || '',
          icon: mf.icon || 'fa-cube',
          color: mf.color || '#4A9BF5',
          iconImage: (same && same.iconImage) || state.iconImage || '',
          promo: (same && same.promo) || [],
          manifest: mf,
          files: files,
          bytes: bytes,
          status: 'pending',
          reviewNotes: '',
          notes: notes,
          versions: versions,
          createdAt: same ? (same.createdAt || now()) : now(),
          updatedAt: now(),
          submittedAt: now()
        };
        savedRec = rec;
        return dbPut(rec).then(function () { return res; });
      }).catch(function (e) {
        /* 云端失败不伪造「待审」：保留为草稿，避免商店状态与后端不一致 */
        var rec = {
          pkgKey: pkgKey,
          appId: (same && same.appId) || '',
          name: name, version: version, entry: state.entry, category: category,
          desc: mf.desc || '', icon: mf.icon || 'fa-cube', color: mf.color || '#4A9BF5',
          iconImage: (same && same.iconImage) || state.iconImage || '',
          promo: (same && same.promo) || [],
          manifest: mf, files: files, bytes: bytes,
          status: 'draft', reviewNotes: '', notes: notes,
          versions: versions,
          createdAt: same ? (same.createdAt || now()) : now(),
          updatedAt: now()
        };
        savedRec = rec;
        return dbPut(rec).then(function () { throw e; });
      });
    }).then(function (res) {
      $('uploadState').classList.remove('on');
      $('submitSuccess').style.display = '';
      $('submitSuccessText').textContent = '「' + name + ' v' + version + '」已提交到云端，等待审核。应用 ID：' + res.appId;
      state.pkgKey = savedRec.pkgKey;
      state.validation = null;
      $('submitBtn').disabled = true;
      $('readyHint').textContent = '已提交，等待云端审核';
      markTimeline(2, false);
      refreshBadge();
      $('submitDoneFoot').style.display = 'flex';
      CLOUD.at = 0;
      refreshCloud(true);
    }).catch(function (e) {
      $('submitSuccess').style.display = 'none';
      $('submitForm').style.display = '';
      $('submitFoot').style.display = 'flex';
      $('uploadState').classList.remove('on');
      $('confirmSubmit').disabled = false;
      if (savedRec) state.pkgKey = savedRec.pkgKey;
      var why = e && e.status === 400 ? (e.message || '云端校验未通过') : ('云端提交失败：' + (e.message || '网络错误') + '，已保存为草稿');
      toast(why, 'bad');
      refreshBadge();
    });
  });

  /* ================= 我的应用 ================= */
  function statusClass(s) { return s === 'approved' ? 'ok' : s === 'pending' ? 'pend' : s === 'rejected' ? 'bad' : s === 'offline' ? 'off' : ''; }
  function statusText(s) {
    return s === 'approved' ? '已上架' : s === 'pending' ? '待审核' : s === 'rejected' ? '已驳回' : s === 'offline' ? '已下架' : '草稿';
  }
  function emptyState(title, sub) {
    return '<div class="empty" style="grid-column:1/-1"><img class="empty-logo" src="' + LOGO + '" alt="Nexus OS"><b>' +
      esc(title) + '</b><span>' + esc(sub) + '</span></div>';
  }
  function iconHtml(rec, cls) {
    var inner = rec && rec.iconImage ? '<img src="' + esc(rec.iconImage) + '" alt="">' : GLYPH;
    return '<div class="' + cls + '">' + inner + '</div>';
  }

  function renderProjects() {
    dbAll().then(function (list) {
      list = (list || []).slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      var grid = $('projectGrid');
      if (!list.length) {
        grid.innerHTML = emptyState('还没有应用', '回到「创建 / 导入」，拖一个 HTML 或文件夹进来。');
        return;
      }
      grid.innerHTML = list.map(function (p) {
        var count = p.files ? Object.keys(p.files).length : 0;
        return '<div class="item-card">' +
          '<div class="item-top">' + iconHtml(p, 'item-icon') +
          '<div class="grow"><div class="item-name truncate">' + esc(p.name) + '</div><div class="item-desc">v' + esc(p.version) + ' · ' + esc(p.category || '工具') + '</div></div>' +
          '<span class="tag ' + statusClass(p.status) + '">' + statusText(p.status) + '</span></div>' +
          (p.desc ? '<div class="item-summary">' + esc(p.desc) + '</div>' : '') +
          (p.reviewNotes ? '<div class="ver-note">拒绝原因：' + esc(p.reviewNotes) + '</div>' : '') +
          '<div class="item-foot has-actions"><span class="tiny muted item-foot-meta">' + count + ' 个文件 · ' + fmtBytes(p.bytes || 0) + '</span>' +
          '<div class="item-actions">' +
          '<button class="btn sm" data-act="preview" data-id="' + esc(p.pkgKey) + '">预览</button>' +
          '<button class="btn sm ghost" data-act="edit" data-id="' + esc(p.pkgKey) + '">编辑</button>' +
          '<button class="btn sm ghost" data-act="versions" data-id="' + esc(p.pkgKey) + '">版本</button></div></div>' +
          '</div>';
      }).join('');
    });
  }

  function openProject(id) {
    dbGet(id).then(function (p) {
      if (!p || !p.files) { toast('草稿包不存在', 'bad'); return; }
      state.files = p.files;
      state.entry = p.entry;
      state.manifest = p.manifest || inferManifest(p.files);
      state.pkgKey = p.pkgKey;
      state.iconImage = p.iconImage || '';
      state.validation = null;
      state.draftSaved = true;
      $('pkgPill').textContent = '草稿 · ' + Object.keys(p.files).length + ' 文件';
      renderWorkspace();
      renderPreview();
      $('workspace').classList.add('on');
      $('dropCard').classList.add('hidden');
      $('submitBtn').disabled = true;
      $('readyHint').textContent = '草稿已载入，重新校验后可提交新版本';
      renderChecksPlaceholder();
      switchView('workbench');
    });
  }

  function openVersions(id) {
    dbGet(id).then(function (p) {
      if (!p) return;
      state.versionsTarget = id;
      $('versionsTitle').textContent = p.name + ' · 版本记录';
      var vs = (p.versions || []).slice().reverse();
      var box = $('versionsBody');
      if (!vs.length) {
        box.innerHTML = '<div class="empty"><b>还没有版本记录</b><span>提交审核后会在这里留下版本快照。</span></div>';
      } else {
        box.innerHTML = '<div class="ver-list">' + vs.map(function (v) {
          return '<div class="ver-row"><span class="ver">v' + esc(v.version) + '</span>' +
            '<span class="tag ' + statusClass(v.status) + '">' + statusText(v.status) + '</span>' +
            (v.notes ? '<span class="tiny muted truncate grow">' + esc(v.notes) + '</span>' : '<span class="grow"></span>') +
            '<span class="when">' + new Date(v.at).toLocaleString() + '</span></div>' +
            (v.reviewNotes ? '<div class="ver-note">审核意见：' + esc(v.reviewNotes) + '</div>' : '');
        }).join('') + '</div>';
      }
      $('versionsModal').classList.add('on');
    });
  }

  /* ================= 编辑信息 ================= */
  function bumpVersion(v) {
    var m = String(v || '1.0.0').match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) return '1.0.1';
    return m[1] + '.' + m[2] + '.' + (Number(m[3]) + 1);
  }

  function openEdit(id) {
    dbGet(id).then(function (rec) {
      if (!rec) { toast('应用不存在', 'bad'); return; }
      state.editTarget = id;
      state.editRec = rec;
      state.editDraft = {
        desc: rec.desc || '',
        iconImage: rec.iconImage || '',
        promo: (rec.promo || []).slice()
      };
      $('editTitle').textContent = '编辑 · ' + rec.name;
      $('editDesc').value = state.editDraft.desc;
      $('editResubmit').style.display = rec.status === 'pending' ? 'none' : '';
      renderEditIcon();
      renderEditPromo();
      $('editModal').classList.add('on');
    });
  }

  function renderEditIcon() {
    var d = state.editDraft;
    var rec = state.editRec;
    $('editIconPreview').innerHTML = d.iconImage ? '<img src="' + esc(d.iconImage) + '" alt="">' : GLYPH;
    var box = $('editIconPick');
    if (!rec || !rec.files) { box.innerHTML = ''; return; }
    var imgs = Object.keys(rec.files).filter(function (p) {
      return /\.(png|jpe?g|webp|gif|svg)$/i.test(p) && Z.fileDataUrl(rec.files, p);
    }).slice(0, 10);
    if (!imgs.length) {
      box.innerHTML = '<div class="tiny muted" style="margin-top:7px">包内没有图片，可以上传一张。</div>';
      return;
    }
    box.innerHTML = '<div class="tiny muted" style="margin-top:8px;margin-bottom:5px">包内图片（点选作为图标）</div>' +
      '<div class="pkg-imgs-row">' + imgs.map(function (p) {
        var u = Z.fileDataUrl(rec.files, p);
        var on = d.iconImage === u ? ' on' : '';
        return '<button class="pkg-img' + on + '" data-img="' + esc(u) + '" title="' + esc(p) + '"><img src="' + u + '" alt=""></button>';
      }).join('') + '</div>';
  }

  function renderEditPromo() {
    var list = state.editDraft.promo;
    $('editPromoHint').textContent = list.length + ' / 3 张 · 单张 ≤ 1 MB';
    var box = $('editPromoList');
    if (!list.length) {
      box.innerHTML = '<div class="promo-empty">还没有宣传图，添加后会展示在商店详情里</div>';
      return;
    }
    box.innerHTML = list.map(function (u, i) {
      return '<div class="promo-item"><img src="' + u + '" alt=""><button class="promo-del" data-del="' + i + '" title="删除这张">×</button></div>';
    }).join('');
  }

  function readImage(file, cb) {
    if (!/^image\//.test(file.type)) { toast('请选择图片文件', 'bad'); return; }
    if (file.size > LIMITS.single) { toast('图片 ' + fmtBytes(file.size) + '，超过 1 MB 上限', 'bad'); return; }
    var r = new FileReader();
    r.onload = function () { cb(String(r.result)); };
    r.onerror = function () { toast('图片读取失败', 'bad'); };
    r.readAsDataURL(file);
  }

  $('editIconUpload').addEventListener('click', function () { $('editIconInput').click(); });
  $('editPromoUpload').addEventListener('click', function () { $('editPromoInput').click(); });
  $('editIconInput').addEventListener('change', function (e) {
    var f = (e.target.files || [])[0];
    e.target.value = '';
    if (!f || !state.editDraft) return;
    readImage(f, function (u) {
      state.editDraft.iconImage = u;
      renderEditIcon();
    });
  });
  $('editPromoInput').addEventListener('change', function (e) {
    var fs = Array.from(e.target.files || []);
    e.target.value = '';
    if (!fs.length || !state.editDraft) return;
    var room = 3 - state.editDraft.promo.length;
    if (room <= 0) { toast('最多 3 张宣传图', 'bad'); return; }
    var picked = fs.slice(0, room);
    var pending = picked.length;
    picked.forEach(function (f) {
      readImage(f, function (u) {
        state.editDraft.promo.push(u);
        if (--pending === 0) renderEditPromo();
      });
    });
    if (picked.length < fs.length) toast('只添加了前 ' + room + ' 张，宣传图上限 3 张');
  });
  $('editIconPick').addEventListener('click', function (e) {
    var b = e.target.closest('[data-img]');
    if (!b || !state.editDraft) return;
    state.editDraft.iconImage = b.dataset.img;
    renderEditIcon();
  });
  $('editPromoList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]');
    if (!b || !state.editDraft) return;
    state.editDraft.promo.splice(Number(b.dataset.del), 1);
    renderEditPromo();
  });

  function saveEdit(resubmit) {
    var id = state.editTarget;
    if (!id || !state.editDraft) return Promise.reject(new Error('没有选中应用'));
    var d = state.editDraft;
    var desc = $('editDesc').value.trim().slice(0, 120);
    return dbGet(id).then(function (rec) {
      if (!rec) throw new Error('应用不存在');
      rec.desc = desc;
      rec.iconImage = d.iconImage || '';
      rec.promo = d.promo.slice(0, 3);
      rec.manifest = Object.assign({}, rec.manifest || {}, { desc: desc });
      rec.updatedAt = now();
      if (!resubmit) return dbPut(rec).then(function () { return rec; });
      if (rec.status === 'pending') throw new Error('当前版本仍在审核中，等结果出来再提交');
      if (!rec.files) throw new Error('本地没有包体，无法重新提交，请重新导入');

      var version = bumpVersion(rec.version);
      var payload = {
        appId: rec.cloud ? rec.appId : undefined,
        name: rec.name,
        version: version,
        desc: desc,
        publisher: 'Nexus 开发者工坊',
        publisherId: publisherId(),
        category: rec.category || '工具',
        entry: rec.entry,
        icon: rec.icon || 'fa-cube',
        color: rec.color || '#4A9BF5',
        iconImage: rec.iconImage || '',
        promo: rec.promo || [],
        notes: '编辑信息后重新提交',
        files: rec.files
      };
      return cloudPublish(payload).then(function (res) {
        rec.appId = res.appId;
        rec.cloud = true;
        rec.releaseId = res.releaseId;
        rec.version = version;
        rec.status = 'pending';
        rec.reviewNotes = '';
        rec.submittedAt = now();
        rec.versions = (rec.versions || []).slice();
        rec.versions.push({ version: version, at: now(), status: 'pending', notes: '编辑信息后重新提交', releaseId: res.releaseId });
        return dbPut(rec).then(function () { return rec; });
      });
    });
  }

  function afterEditSaved(rec) {
    $('editModal').classList.remove('on');
    state.editTarget = null;
    state.editRec = null;
    state.editDraft = null;
    renderProjects();
    renderMarket();
    if (state.pkgKey === rec.pkgKey) {
      state.iconImage = rec.iconImage || '';
      state.manifest.desc = rec.desc || '';
      state.manifest.version = rec.version;
      renderWorkspace();
    }
  }

  $('editSave').addEventListener('click', function () {
    saveEdit(false).then(function (rec) {
      afterEditSaved(rec);
      toast('已保存应用信息', 'ok');
    }).catch(function (e) { toast(e.message || '保存失败', 'bad'); });
  });
  $('editResubmit').addEventListener('click', function () {
    saveEdit(true).then(function (rec) {
      afterEditSaved(rec);
      toast('已重新提交 v' + rec.version + '，等待审核', 'ok');
    }).catch(function (e) { toast(e.message || '提交失败', 'bad'); });
  });

  /* ================= 审核台 ================= */
  function refreshBadge() {
    dbAll().then(function (all) {
      var n = (all || []).filter(function (r) { return r.status === 'pending'; }).length;
      var b = $('pendingBadge');
      if (b) b.style.display = n ? 'block' : 'none';
    }).catch(function () { });
  }

  function paintReviewNote(title, msg) {
    $('reviewList').innerHTML = '<div class="empty" style="grid-column:1/-1;padding:34px 16px">' +
      '<img class="empty-logo" src="' + LOGO + '" alt="Nexus OS"><b>' + esc(title) + '</b><span>' + esc(msg) + '</span></div>';
  }

  function paintReviewLocal(list) {
    if (!list.length) {
      paintReviewNote('队列是空的', '在「创建 / 导入」里通过校验并提交，应用就会出现在这里。');
      return;
    }
    $('reviewList').innerHTML = list.map(function (p) {
      var isHtml = p.runtime === 'htmlapp' || p.origin === 'devstudio';
      return '<div class="item-card" style="margin-bottom:10px">' +
        '<div class="item-top"><div class="item-icon">' + GLYPH + '</div>' +
        '<div class="grow"><div class="item-name">' + esc(p.name) + ' <span class="tag pend">v' + esc(p.version) + '</span> ' +
        '<span class="tag">' + (isHtml ? 'HTML' : 'CW') + '</span></div>' +
        '<div class="item-desc">' + esc(p.category || '工具') + ' · ' + (p.files || 0) + ' 文件 · 提交于 ' + new Date(p.at || now()).toLocaleString() + '</div></div>' +
        '<button class="btn sm" data-act="preview-pending" data-id="' + esc(p.id) + '">预览</button>' +
        '<button class="btn sm danger" data-act="reject" data-id="' + esc(p.id) + '">拒绝</button>' +
        '<button class="btn sm ok" data-act="approve" data-id="' + esc(p.id) + '">通过</button></div></div>';
    }).join('');
  }

  function paintReviewCloud(items) {
    if (!items.length) {
      paintReviewNote('云端没有待审版本', '通过校验并提交后，版本会先进入云端待审队列。');
      return;
    }
    $('reviewList').innerHTML = items.map(function (it) {
      var m = it.meta || {};
      var icon = m.iconImage ? '<img src="' + esc(m.iconImage) + '" alt="">' : GLYPH;
      return '<div class="item-card" style="margin-bottom:10px">' +
        '<div class="item-top"><div class="item-icon">' + icon + '</div>' +
        '<div class="grow"><div class="item-name">' + esc(m.name || it.appId) + ' <span class="tag pend">v' + esc(m.version || '?') + '</span> ' +
        '<span class="tag ok">云端</span></div>' +
        '<div class="item-desc">' + esc(m.category || '工具') + ' · ' + (it.fileCount || 0) + ' 文件 · ' + fmtBytes(it.bytes || 0) +
        ' · 提交于 ' + new Date(it.at || now()).toLocaleString() + '</div></div>' +
        '<button class="btn sm" data-act="preview-cloud" data-app="' + esc(it.appId) + '" data-rel="' + esc(it.releaseId) +
        '" data-entry="' + esc(m.entry || 'index.html') + '" data-name="' + esc(m.name || '') + '" data-ver="' + esc(m.version || '') + '">预览</button>' +
        '<button class="btn sm danger" data-act="reject-cloud" data-app="' + esc(it.appId) + '" data-rel="' + esc(it.releaseId) +
        '" data-name="' + esc(m.name || '') + '">拒绝</button>' +
        '<button class="btn sm ok" data-act="approve-cloud" data-app="' + esc(it.appId) + '" data-rel="' + esc(it.releaseId) +
        '" data-name="' + esc(m.name || '') + '" data-ver="' + esc(m.version || '') + '">通过</button></div></div>';
    }).join('');
  }

  function renderReview() {
    updateCloudChip();
    if (CLOUD.online === null) refreshCloud(true);
    if (CLOUD.online === true) {
      var token = adminToken();
      if (!token) {
        paintReviewNote('云端模式 · 需要管理令牌', '提交与状态已经走云端。审核需要 STORE_ADMIN 管理令牌（写入 localStorage 的 n26_devstudio_admin）。');
        return;
      }
      paintReviewNote('正在读取云端待审…', 'GET /api/store/v1/pending');
      apiFetch('/api/store/v1/pending', { headers: { 'X-N26-Admin': token } }, 10000).then(function (r) {
        paintReviewCloud(r.items || []);
      }).catch(function (e) {
        paintReviewNote(e.status === 401 ? '管理令牌无效' : '读取云端待审失败', e.status === 401
          ? '检查 localStorage.n26_devstudio_admin 是否与 STORE_ADMIN 一致。'
          : (e.message || '网络错误'));
      });
      return;
    }
    if (CLOUD.online === false) {
      paintReviewNote('云端未连接 · 本地模式', '本地队列仅用于离线兜底，状态不代表服务端审核结果。错误：' + (CLOUD.error || '未知'));
      return;
    }
  }

  function previewPending(id) {
    var pkg = findPending(id);
    if (!pkg) return;
    var after = dbGet(id).then(function (rec) {
      var files = (rec && rec.files) || pkg.sources;
      if (!files) throw new Error('包体不在本机，无法预览');
      $('previewTitle').textContent = (pkg.name || '应用') + ' · v' + (pkg.version || '?');
      P.render($('modalFrame'), files, (rec && rec.entry) || pkg.entry || 'index.html', {});
      $('previewModal').classList.add('on');
    }).catch(function (e) {
      toast(e.message || '预览失败', 'bad');
    });
    return after;
  }

  function findPending(id) {
    return readLS(KEY_PENDING, []).find(function (p) { return p && p.id === id; }) || null;
  }

  function previewCloud(b) {
    var appId = b.dataset.app;
    var releaseId = b.dataset.rel;
    var entry = b.dataset.entry || 'index.html';
    apiFetch('/api/store/v1/preview-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: appId, releaseId: releaseId })
    }, 10000).then(function (r) {
      $('previewTitle').textContent = (b.dataset.name || '应用') + ' · v' + (b.dataset.ver || '?') + ' · 云端待审';
      var frame = $('modalFrame');
      frame.removeAttribute('srcdoc');
      frame.src = API_BASE + '/api/store/v1/raw/' + appId + '/' + releaseId + '/' +
        encodeURIComponent(entry) + '?t=' + encodeURIComponent(r.token);
      $('previewModal').classList.add('on');
    }).catch(function (e) { toast('预览失败：' + (e.message || '网络错误'), 'bad'); });
  }

  function openReject(id, cloud) {
    state.reviewTarget = cloud || id;
    $('rejectReason').value = '';
    $('rejectModal').classList.add('on');
  }

  $('confirmReject').addEventListener('click', function () {
    var reason = $('rejectReason').value.trim();
    if (!reason) { toast('填写拒绝原因', 'bad'); return; }
    var target = state.reviewTarget;
    if (target && target.appId) {
      var token = adminToken();
      if (!token) { toast('缺少管理令牌，无法云端驳回', 'bad'); return; }
      apiFetch('/api/store/v1/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-N26-Admin': token },
        body: JSON.stringify({ appId: target.appId, releaseId: target.releaseId, action: 'reject', reason: reason })
      }, 12000).then(function () {
        $('rejectModal').classList.remove('on');
        CLOUD.at = 0;
        refreshCloud(true);
        renderReview();
        toast('已驳回，原因已写入云端', 'ok');
      }).catch(function (e) { toast('驳回失败：' + (e.message || '网络错误'), 'bad'); });
      return;
    }
    var id = target;
    var pending = readLS(KEY_PENDING, []).filter(function (x) { return x && x.id !== id; });
    if (!persistList(KEY_PENDING, pending)) { toast('写入失败，请重试', 'bad'); return; }
    dbGet(id).then(function (rec) {
      if (!rec) return;
      rec.status = 'rejected';
      rec.reviewNotes = reason;
      var v = (rec.versions || []).filter(function (x) { return x.version === rec.version; })[0];
      if (v) { v.status = 'rejected'; v.reviewNotes = reason; }
      return saveDraftMeta(rec);
    }).catch(function () { });
    $('rejectModal').classList.remove('on');
    refreshBadge();
    renderReview();
    toast('已拒绝，并回写原因', 'ok');
  });

  function openApprove(id, cloud) {
    state.approveTarget = cloud || id;
    if (cloud) {
      $('approveText').textContent = '「' + (cloud.name || '应用') + ' v' + (cloud.version || '?') +
        '」将在云端通过审核，并出现在商店列表；旧版本自动转为历史版本。';
    } else {
      var p = findPending(id);
      $('approveText').textContent = p
        ? '「' + p.name + ' v' + (p.version || '?') + '」将写入 n26SelfPub，并出现在应用市场。'
        : '确认上架？';
    }
    $('approveModal').classList.add('on');
  }

  $('confirmApprove').addEventListener('click', function () {
    var target = state.approveTarget;
    if (target && target.appId) {
      var token = adminToken();
      if (!token) { toast('缺少管理令牌，无法云端通过', 'bad'); return; }
      apiFetch('/api/store/v1/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-N26-Admin': token },
        body: JSON.stringify({ appId: target.appId, releaseId: target.releaseId, action: 'approve' })
      }, 12000).then(function () {
        $('approveModal').classList.remove('on');
        CLOUD.at = 0;
        refreshCloud(true);
        renderReview();
        toast('已通过并上架：' + (target.name || ''), 'ok');
      }).catch(function (e) { toast('通过失败：' + (e.message || '网络错误'), 'bad'); });
      return;
    }

    var id = target;
    var pending = readLS(KEY_PENDING, []);
    var pkg = findPending(id);
    if (!pkg) { toast('待审记录已不存在', 'bad'); return; }
    var pub = readLS(KEY_SELFPUB, []);
    var old = pub.findIndex(function (x) { return x && x.name === pkg.name; });
    if (old >= 0) pub.splice(old, 1);
    pub.push(pkg);
    if (!persistList(KEY_SELFPUB, pub)) { toast('上架写入失败（存储空间不足）', 'bad'); return; }
    var rest = pending.filter(function (x) { return x && x.id !== id; });
    persistList(KEY_PENDING, rest);

    dbGet(id).then(function (rec) {
      if (!rec) return;
      rec.status = 'approved';
      rec.reviewNotes = '';
      rec.approvedAt = now();
      var v = (rec.versions || []).filter(function (x) { return x.version === rec.version; })[0];
      if (v) { v.status = 'approved'; v.at = now(); }
      return saveDraftMeta(rec);
    }).catch(function () { });

    $('approveModal').classList.remove('on');
    refreshBadge();
    renderReview();
    toast('已上架：' + pkg.name + ' v' + (pkg.version || '?'), 'ok');
  });

  /* ================= 市场 ================= */
  function renderMarket() {
    var list = readLS(KEY_SELFPUB, []);
    var grid = $('marketGrid');
    if (!list.length) {
      grid.innerHTML = emptyState('市场还是空的', '先提交一个应用，再到「审核台」过审。');
      return;
    }
    grid.innerHTML = list.map(function (a) {
      var isHtml = a.runtime === 'htmlapp' || a.origin === 'devstudio';
      return '<div class="item-card">' +
        '<div class="item-top">' + iconHtml(a, 'item-icon') +
        '<div class="grow"><div class="item-name truncate">' + esc(a.name) + '</div><div class="item-desc">' + esc(a.desc || '应用') + '</div></div></div>' +
        '<div class="item-foot"><span class="tag ok">v' + esc(a.version) + '</span><span class="tag">' + (isHtml ? 'HTML' : 'CW') + '</span>' +
        '<span class="tiny muted grow">' + esc(a.publisher || '本地开发者') + '</span>' +
        '<button class="btn sm" data-act="run" data-id="' + esc(a.id) + '">运行</button></div></div>';
    }).join('');
  }

  function openRuntime(id) {
    var list = readLS(KEY_SELFPUB, []);
    var a = list.filter(function (x) { return x && x.id === id; })[0];
    if (!a) { toast('找不到已上架记录', 'bad'); return; }
    var isHtml = a.runtime === 'htmlapp' || a.origin === 'devstudio';
    var url = isHtml
      ? 'htmlapp/index.html?id=sp_' + encodeURIComponent(a.id)
      : 'floatapp/index.html?pkg=' + encodeURIComponent(a.id);
    window.open(url, '_blank', 'noopener');
  }

  /* ================= 列表按钮委托 ================= */
  $('projectGrid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'preview') openProject(b.dataset.id);
    if (b.dataset.act === 'edit') openEdit(b.dataset.id);
    if (b.dataset.act === 'versions') openVersions(b.dataset.id);
  });
  $('reviewList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'preview-pending') previewPending(b.dataset.id);
    if (b.dataset.act === 'reject') openReject(b.dataset.id);
    if (b.dataset.act === 'approve') openApprove(b.dataset.id);
    if (b.dataset.act === 'preview-cloud') previewCloud(b);
    if (b.dataset.act === 'reject-cloud') openReject(null, { appId: b.dataset.app, releaseId: b.dataset.rel, name: b.dataset.name });
    if (b.dataset.act === 'approve-cloud') openApprove(null, { appId: b.dataset.app, releaseId: b.dataset.rel, name: b.dataset.name, version: b.dataset.ver });
  });
  $('marketGrid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'run') openRuntime(b.dataset.id);
  });

  /* ================= 示例 ================= */
  $('sampleBtn').addEventListener('click', function () {
    var sample = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>方岛天气</title>' +
      '<style>body{margin:0;font-family:system-ui,sans-serif;background:linear-gradient(160deg,#0f2740,#173a5e 55%,#0b1725);color:#eaf4ff;min-height:100vh;display:grid;place-items:center}' +
      '.card{width:min(420px,86vw);padding:30px 28px;border-radius:24px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(18px);box-shadow:0 24px 60px rgba(0,0,0,.35)}' +
      '.city{font-size:12px;letter-spacing:2px;color:#93b8d8}h1{font-size:58px;margin:8px 0 0;letter-spacing:-2px}sub{font-size:13px;color:#9fc2df}' +
      '.row{display:flex;gap:10px;margin-top:22px;flex-wrap:wrap}.chip{padding:7px 11px;border-radius:999px;background:rgba(255,255,255,.1);font-size:11px}</style>' +
      '</head><body><div class="card"><div class="city">FANG ISLAND · 方岛</div><h1>24°</h1><sub>多云转晴 · 体感 26°</sub>' +
      '<div class="row"><span class="chip">湿度 61%</span><span class="chip">东南风 3 级</span><span class="chip">日落 18:42</span></div></div>' +
      '<script>document.querySelector("h1").addEventListener("click",function(){this.textContent=(20+Math.floor(Math.random()*8))+"°"})<' + '/script>' +
      '</body></html>';
    var token = ++state.importToken;
    lastSource = null;
    resetStages();
    hideImportError();
    stageSet('receive', 'done', '示例包 · 内联');
    stageSet('unpack', 'done', '目录导入，无需解压');
    importFileMap({
      'index.html': sample,
      'app.json': JSON.stringify({ name: '方岛天气', version: '1.0.0', entry: 'index.html', category: '工具', desc: '一个用来演示拖拽与沙箱预览的小应用' })
    }, token).catch(function (e) {
      if (token === state.importToken) handleImportFail(e);
    });
  });

  /* ================= 启动 ================= */
  window.N26DSRefreshReview = function () {
    refreshBadge();
    CLOUD.at = 0;
    refreshCloud(true);
    renderReview();
  };
  refreshBadge();
  renderProjects();
  renderReview();
  renderMarket();
  refreshCloud(true);
})();
