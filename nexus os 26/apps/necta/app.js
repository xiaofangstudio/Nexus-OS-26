/* ==========================================================================
   Necta · 远程桌面（逻辑层）
   --------------------------------------------------------------------------
   规则来自《远程软件规划-Necta.md》：
     · 不碰云端账号：本机 ID + 临时密码配对，不需要注册
     · 不上传画面：形态 B（共享 Nexus 会话）传的是「窗口状态」不是像素
     · 不做静默控制：被控端必须有人点允许
   本文件负责：本机身份、连接流程、共享会话（BroadcastChannel）、
              会话画面（屏幕捕获 / 桌面镜像）、iOS 磁贴控制中心。
   ========================================================================== */
(function () {
  'use strict';

  var Nexus = window.Nexus || null;

  /* ────────────────────────── 基础工具 ────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function toast(msg, ms) {
    var t = $('ntToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 2400);
  }
  /* ★ v2.9.46 修正：Nexus.getUserLS / setUserLS 是 **Promise**（postMessage 桥），
     第一版当成同步调用，结果读到的全是 Promise 对象 —— ID、密码、最近设备、
     磁贴顺序全都没真正存下来。现在改成「内存里放真值（同步读）+ 异步写回桥 + 启动预读」。 */
  var MEM = {};
  var MEM_KEYS = ['seed', 'myId', 'pass', 'recents', 'volume', 'ccOrder', 'shareCode'];

  function lsGet(k, d) {
    if (Object.prototype.hasOwnProperty.call(MEM, k)) return MEM[k];
    try {
      var raw = localStorage.getItem('necta_' + k);
      if (raw != null) return JSON.parse(raw);
    } catch (e) { }
    return d;
  }
  function lsSet(k, v) {
    MEM[k] = v;
    try { localStorage.setItem('necta_' + k, JSON.stringify(v)); } catch (e) { }
    try {
      if (Nexus && Nexus.setUserLS) Nexus.setUserLS(k, v).catch(function () { });
    } catch (e) { }
  }
  /* 启动预读：把用户级存储灌进内存（桥可用时以桥为准） */
  function preload() {
    if (!Nexus || !Nexus.getUserLS) return Promise.resolve();
    return Promise.all(MEM_KEYS.map(function (k) {
      return Nexus.getUserLS(k).then(function (v) {
        if (v !== null && v !== undefined) MEM[k] = v;
      }).catch(function () { });
    }));
  }
  function pad(n, len) { return String(n).padStart(len, '0'); }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* ────────────────────────── 1. 本机身份 ──────────────────────────
     规划要求：9 位数字，由设备指纹 + 首次启动随机种子生成，重装才变。
     这里用「轻指纹 hash + 持久种子」拼出来，存在用户级存储里。 */
  function deviceSeed() {
    var s = lsGet('seed', null);
    if (!s) {
      s = String(rnd(900000000) + 100000000);
      lsSet('seed', s);
    }
    return s;
  }
  function fingerprint() {
    var raw = [
      navigator.userAgent || '', navigator.language || '',
      screen.width, screen.height, screen.colorDepth,
      navigator.hardwareConcurrency || 0
    ].join('|');
    var h = 2166136261;
    for (var i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }
  function myId() {
    var base = lsGet('myId', null);
    if (base) return base;
    var n = (fingerprint() % 1000000000 + Number(deviceSeed())) % 1000000000;
    var id = pad(n, 9);
    lsSet('myId', id);
    return id;
  }
  function newPass() {
    var p = pad(rnd(900000) + 100000, 6);
    lsSet('pass', p);
    return p;
  }

  function paintIdentity() {
    var idEl = $('ntMyId'), passEl = $('ntMyPass');
    if (idEl) idEl.textContent = myId().replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
    if (passEl) {
      var pv = lsGet('pass', null) || newPass();
      passEl.textContent = String(pv).replace(/\s/g, '').replace(/(\d{3})(\d{3})/, '$1 $2');
    }
  }

  window.ntCopyId = function () {
    var id = myId();
    try {
      var p = navigator.clipboard.writeText(id);
      if (p && p.catch) p.catch(function () { });
      toast('本机 ID 已复制：' + id);
    } catch (e) { toast('复制失败，ID 是 ' + id); }
  };
  window.ntRefreshId = function () {
    lsSet('myId', null);
    paintIdentity();
    toast('ID 已刷新（下次启动用新 ID）');
  };
  window.ntRefreshPass = function () {
    newPass();
    paintIdentity();
    toast('已生成新的临时密码');
  };

  /* ────────────────────────── 2. 最近设备 ────────────────────────── */
  function paintRecents() {
    var box = $('ntRecents');
    if (!box) return;
    var list = lsGet('recents', []) || [];
    if (!list.length) {
      box.innerHTML = '<div class="nt-empty">还没有连接记录<br><span style="font-size:11px;">连过一次就会出现在这里，一键重连</span></div>';
      return;
    }
    box.innerHTML = list.slice(0, 12).map(function (r, i) {
      return '<div class="nt-recent" onclick="ntQuickConnect(' + i + ')">'
        + '<span class="ic"><i class="fas fa-desktop"></i></span>'
        + '<span class="tx"><b>' + esc(r.name || r.id) + '</b>'
        + '<small>' + esc(r.id) + ' · ' + esc(r.when || '') + '</small></span>'
        + '<i class="fas fa-arrow-right" style="font-size:10px;opacity:.4;"></i></div>';
    }).join('');
  }
  function pushRecent(id, name) {
    var list = lsGet('recents', []) || [];
    list = list.filter(function (r) { return r.id !== id; });
    list.unshift({ id: id, name: name || id, when: new Date().toLocaleString('zh-CN', { hour12: false }).slice(5, 16) });
    lsSet('recents', list.slice(0, 12));
    paintRecents();
  }
  window.ntQuickConnect = function (i) {
    var list = lsGet('recents', []) || [];
    var r = list[i];
    if (!r) return;
    $('ntPeerId').value = r.id;
    toast('已填入 ' + r.id + '，输入密码后点连接');
  };

  /* ────────────────────────── 3. 会话状态 ────────────────────────── */
  var S = {
    active: false,
    mode: 'idle',        // 'loopback' | 'share' | 'remote'
    peer: '',
    latency: 0,
    fps: 0,
    codec: '—',
    relay: false,
    startedAt: 0,
    stats: null,
    stream: null,
    offline: false,
    // 控制中心状态（规划 5.4 的磁贴）
    quality: 'clear',    // clear | balance | smooth
    fpsCap: 30,
    display: 1,
    displays: 1,
    volume: 70,
    muted: false,
    voice: false,
    clipboard: true,
    privacy: false,
    recording: false,
    fullscreen: false,
    showCursor: true,
    transferRate: 0
  };

  function showView(which) {
    document.querySelectorAll('.nt-view').forEach(function (v) { v.classList.remove('on'); });
    var el = $('ntHome');
    if (which === 'session') el = $('ntSession');
    if (el) el.classList.add('on');
    S.active = (which === 'session');
  }
  window.ntBackHome = function () { showView('home'); };

  function paintSbar() {
    var who = $('ntSbarWho'), lv = $('ntSbarLv');
    var lat = $('ntSbarLat'), fps = $('ntSbarFps'), codec = $('ntSbarCodec');
    if (who) who.textContent = S.peer || '未连接';
    if (lv) {
      lv.className = 'lv' + (S.offline ? ' bad' : S.relay ? ' relay' : '');
    }
    if (lat) lat.textContent = S.latency ? S.latency : '—';
    if (fps) fps.textContent = S.fps ? S.fps : '—';
    if (codec) codec.textContent = S.codec;
  }

  /* ────────────────────────── 4. 控制中心（iOS 磁贴） ──────────────────────────
     规划 5.3/5.4/5.5：360px / 4 列 / 12px 间距 / 长按 400ms 原地展开 /
     拖动重排并持久化 / 键盘方向键 + 空格 + Enter / 延迟色带 / 断线变灰。 */
  var TILES = [
    { id: 'link', w2: true, title: '连接', icon: 'fa-link', kind: 'status' },
    { id: 'quality', title: '画质', icon: 'fa-image', kind: 'cycle' },
    { id: 'fps', title: '帧率', icon: 'fa-gauge-high', kind: 'cycle' },
    { id: 'display', title: '显示器', icon: 'fa-display', kind: 'cycle' },
    { id: 'volume', w2: true, title: '系统声音', icon: 'fa-volume-high', kind: 'slider' },
    { id: 'voice', title: '语音', icon: 'fa-microphone', kind: 'switch' },
    { id: 'clip', title: '剪贴板', icon: 'fa-clipboard', kind: 'switch' },
    { id: 'files', title: '文件传输', icon: 'fa-file-arrow-up', kind: 'open' },
    { id: 'privacy', title: '隐私屏', icon: 'fa-eye-slash', kind: 'switch' },
    { id: 'rec', title: '录制', icon: 'fa-circle-dot', kind: 'switch' },
    { id: 'full', title: '全屏', icon: 'fa-expand', kind: 'switch' },
    { id: 'more', title: '更多设置', icon: 'fa-gear', kind: 'open' },
    { id: 'disconnect', w2: true, title: '断开连接（长按）', icon: 'fa-power-off', kind: 'danger' }
  ];

  function tileOrder() {
    var saved = lsGet('ccOrder', null);
    if (Array.isArray(saved) && saved.length) {
      var map = {};
      TILES.forEach(function (t) { map[t.id] = t; });
      var out = saved.map(function (id) { return map[id]; }).filter(Boolean);
      TILES.forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); });
      return out;
    }
    return TILES.slice();
  }
  function saveOrder(order) { lsSet('ccOrder', order.map(function (t) { return t.id; })); }

  var QUALITY_LABEL = { clear: '清晰', balance: '平衡', smooth: '流畅' };
  var FPS_STEPS = [60, 30, 15, 5];

  function latencyClass() {
    if (S.relay) return 'relay';
    if (S.latency < 50) return 'good';
    if (S.latency < 120) return 'mid';
    return 'bad';
  }
  function latencyColor() {
    var c = latencyClass();
    return c === 'good' ? '#4ade80' : c === 'mid' ? '#fbbf24' : c === 'relay' ? '#c084fc' : c === 'bad' ? '#ff8a5c' : '#9aa3b2';
  }

  function tileHTML(t, idx) {
    var cls = 'nt-tile' + (t.w2 ? ' w2' : '');
    var inner = '';
    var val = '';
    var isOn = false;
    switch (t.id) {
      case 'link':
        if (S.mode === 'share' || S.mode === 'share-join') {
          // 形态 B 传的是窗口状态、不是像素，没有「延迟」这个量 —— 别假装有
          inner = '<div class="tt"><i class="fas fa-share-nodes"></i> 共享会话 · '
            + (S.mode === 'share' ? '我在共享' : '只读观看') + '</div>'
            + '<div class="tv" style="color:#2ee6d0;font-size:13px;">状态同步<small>（非像素）</small></div>';
          break;
        }
        val = S.relay ? '中继' : 'P2P 直连';
        inner = '<div class="tt"><i class="fas ' + t.icon + '"></i> 连接 · ' + val + '</div>'
          + '<div class="tv" style="color:' + latencyColor() + '">' + (S.latency || '—') + '<small>ms</small></div>'
          + '<div class="latbar">' + [0, 1, 2, 3, 4].map(function (k) {
            var on = S.latency && k < Math.max(1, 5 - Math.floor(S.latency / 45));
            return '<i class="' + (on ? 'on' : '') + '" style="color:' + latencyColor() + '"></i>';
          }).join('') + '</div>';
        break;
      case 'quality':
        val = QUALITY_LABEL[S.quality];
        inner = '<div class="tt"><i class="fas ' + t.icon + '"></i> 画质</div><div class="tv">' + val + '</div>';
        isOn = S.quality !== 'smooth';
        break;
      case 'fps':
        inner = '<div class="tt"><i class="fas ' + t.icon + '"></i> 帧率</div><div class="tv">' + S.fpsCap + '<small>fps</small></div>';
        isOn = S.fpsCap >= 30;
        break;
      case 'display':
        inner = '<div class="tt"><i class="fas ' + t.icon + '"></i> 显示器</div><div class="tv">' + S.display + '/' + S.displays + '</div>';
        isOn = S.displays > 1;
        break;
      case 'volume':
        inner = '<div class="tt"><i class="fas ' + (S.muted ? 'fa-volume-xmark' : t.icon) + '"></i> 系统声音</div>'
          + '<div class="tv">' + (S.muted ? '静音' : S.volume + '<small>%</small>') + '</div>'
          + '<div class="nt-tslider" data-slider="volume"><div class="fill" style="width:' + (S.muted ? 0 : S.volume) + '%"></div>'
          + '<div class="knob" style="left:' + (S.muted ? 0 : S.volume) + '%"></div></div>';
        isOn = !S.muted;
        break;
      case 'voice': inner = '<div class="tt"><i class="fas ' + t.icon + '"></i> 语音</div><div class="sub">' + (S.voice ? '开麦中' : '未开启') + '</div>'; isOn = S.voice; break;
      case 'clip': inner = '<div class="tt"><i class="fas ' + t.icon + '"></i> 剪贴板</div><div class="sub">' + (S.clipboard ? '同步' : '关闭') + '</div>'; isOn = S.clipboard; break;
      case 'files': inner = '<div class="tt"><i class="fas ' + t.icon + '"></i> 文件</div><div class="tv">↑' + (S.transferRate ? S.transferRate.toFixed(1) : '0') + '<small>M/s</small></div>'; break;
      case 'privacy': inner = '<div class="tt"><i class="fas ' + t.icon + '"></i> 隐私屏</div><div class="sub">' + (S.privacy ? '对方已黑屏' : '关闭') + '</div>'; isOn = S.privacy; break;
      case 'rec': inner = '<div class="tt"><i class="fas ' + t.icon + '"></i> 录制</div><div class="sub">' + (S.recording ? '录制中' : '未录制') + '</div>'; isOn = S.recording; break;
      case 'full': inner = '<div class="tt"><i class="fas ' + t.icon + '"></i> 全屏</div><div class="sub">' + (S.fullscreen ? '已全屏' : '窗口') + '</div>'; isOn = S.fullscreen; break;
      case 'more': inner = '<div class="tt"><i class="fas ' + t.icon + '"></i> 更多</div><div class="sub">设置</div>'; break;
      case 'disconnect': inner = '<div class="tt"><i class="fas ' + t.icon + '"></i> 断开连接</div><div class="sub">长按 1 秒生效</div><div class="holdring"></div>'; break;
      default: inner = '<div class="tt">' + esc(t.title) + '</div>';
    }
    var extra = t.kind === 'danger' ? ' danger' : '';
    return '<button class="' + cls + (isOn ? ' on' : '') + extra + '" data-tile="' + t.id + '" tabindex="0" '
      + 'aria-label="' + esc(t.title) + '" title="' + esc(t.title) + '">' + inner + '</button>';
  }

  function paintCC() {
    var grid = $('ntCCGrid');
    if (!grid) return;
    var order = tileOrder();
    grid.innerHTML = order.map(function (t, i) { return tileHTML(t, i); }).join('');
    bindTiles();
    var cc = $('ntCC');
    if (cc) cc.classList.toggle('offline', !!S.offline);
  }

  /* 磁贴交互：短按切换 / 长按 400ms 展开 / 拖动重排 / 滑块直接拖 */
  function bindTiles() {
    var grid = $('ntCCGrid');
    if (!grid) return;
    grid.querySelectorAll('.nt-tile').forEach(function (el) {
      var id = el.dataset.tile;
      var pressTimer = null, holdTimer = null, longFired = false;
      var startX = 0, startY = 0, dragging = false, dragEl = null;

      el.addEventListener('pointerdown', function (e) {
        if (e.target.closest('.nt-tslider')) return;   // 滑块自己处理
        longFired = false;
        startX = e.clientX; startY = e.clientY;
        var tileDef = TILES.filter(function (t) { return t.id === id; })[0] || {};
        if (tileDef.kind === 'danger') {
          el.classList.add('holding');
          holdTimer = setTimeout(function () {
            el.classList.remove('holding');
            ntDisconnect();
          }, 1000);
          el._holdTimer = holdTimer;
          return;
        }
        pressTimer = setTimeout(function () {
          longFired = true;
          expandTile(el, id);              // 长按 400ms：原地放大展开
        }, 400);
        el._pressTimer = pressTimer;

        // 拖动重排（按住移动超过 10px 才算拖）
        el.setPointerCapture && el.setPointerCapture(e.pointerId);
      });

      el.addEventListener('pointermove', function (e) {
        if (e.buttons !== 1) return;
        if (Math.abs(e.clientX - startX) < 10 && Math.abs(e.clientY - startY) < 10) return;
        if (!dragging) {
          dragging = true;
          clearTimeout(pressTimer);
          el.classList.add('dragging');
          el.style.opacity = '0.55';
          el.style.zIndex = '70';
        }
        var over = document.elementFromPoint(e.clientX, e.clientY);
        var target = over && over.closest ? over.closest('.nt-tile') : null;
        if (target && target !== el && target.parentElement === grid) {
          var kids = [...grid.children];
          if (kids.indexOf(target) > kids.indexOf(el)) grid.insertBefore(el, target.nextSibling);
          else grid.insertBefore(el, target);
        }
      });

      el.addEventListener('pointerup', function (e) {
        clearTimeout(pressTimer);
        if (holdTimer) { clearTimeout(holdTimer); el.classList.remove('holding'); }
        if (dragging) {
          dragging = false;
          el.classList.remove('dragging');
          el.style.opacity = '';
          el.style.zIndex = '';
          saveOrder([...grid.querySelectorAll('.nt-tile')].map(function (b) { return { id: b.dataset.tile }; }));
          el._swallowClick = true;   // 拖完别把这次松手当成一次点击
          toast('磁贴顺序已保存');
          return;
        }
      });
      /* ★ 短按统一走 click：键盘触发的 click、辅助技术的 click、以及 .click() 都能生效；
         pointerup 只管拖动收尾。长按已经展开过的那次点击要吞掉。 */
      el.addEventListener('click', function (e) {
        if (el._swallowClick) { el._swallowClick = false; return; }
        if (longFired) { longFired = false; return; }
        tapTile(id, el);
      });
      el.addEventListener('pointercancel', function () {
        clearTimeout(pressTimer);
        if (holdTimer) { clearTimeout(holdTimer); el.classList.remove('holding'); }
        el.style.opacity = '';
      });

      // 键盘：空格切换 / Enter 展开（规划 5.7 可访问性）
      el.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); tapTile(id, el); }
        else if (e.key === 'Enter') { e.preventDefault(); expandTile(el, id); }
      });
    });

    // 音量滑块：直接在磁贴上拖
    grid.querySelectorAll('.nt-tslider').forEach(function (sl) {
      function setFrom(clientX) {
        var r = sl.getBoundingClientRect();
        var pct = Math.max(0, Math.min(100, Math.round((clientX - r.left) / r.width * 100)));
        S.volume = pct;
        S.muted = pct === 0;
        sl.querySelector('.fill').style.width = pct + '%';
        sl.querySelector('.knob').style.left = pct + '%';
        var tv = sl.closest('.nt-tile').querySelector('.tv');
        if (tv) tv.innerHTML = S.muted ? '静音' : pct + '<small>%</small>';
      }
      sl.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        setFrom(e.clientX);
        sl.setPointerCapture && sl.setPointerCapture(e.pointerId);
        var mv = function (ev) { setFrom(ev.clientX); };
        var up = function () {
          sl.removeEventListener('pointermove', mv);
          sl.removeEventListener('pointerup', up);
          lsSet('volume', S.volume);
        };
        sl.addEventListener('pointermove', mv);
        sl.addEventListener('pointerup', up);
      });
    });
  }

  function tapTile(id, el) {
    switch (id) {
      case 'quality':
        S.quality = S.quality === 'clear' ? 'balance' : S.quality === 'balance' ? 'smooth' : 'clear';
        toast('画质：' + QUALITY_LABEL[S.quality]);
        break;
      case 'fps':
        S.fpsCap = FPS_STEPS[(FPS_STEPS.indexOf(S.fpsCap) + 1) % FPS_STEPS.length];
        toast('帧率上限：' + S.fpsCap + ' fps');
        break;
      case 'display':
        if (S.displays < 2) { toast('对方只有 1 个显示器'); return; }
        S.display = S.display % S.displays + 1;
        toast('已切到显示器 ' + S.display);
        break;
      case 'volume':
        S.muted = !S.muted;
        toast(S.muted ? '已静音' : '取消静音');
        break;
      case 'voice': S.voice = !S.voice; toast(S.voice ? '已开麦' : '已关麦'); break;
      case 'clip': S.clipboard = !S.clipboard; toast('剪贴板同步：' + (S.clipboard ? '开' : '关')); break;
      case 'privacy':
        S.privacy = !S.privacy;
        toast(S.privacy ? '隐私屏已开启：对方屏幕变黑' : '隐私屏已关闭');
        break;
      case 'rec':
        S.recording = !S.recording;
        var orb = $('ntOrb');
        if (orb) orb.classList.toggle('rec', S.recording);
        toast(S.recording ? '开始录制（红点常亮）' : '已停止录制');
        break;
      case 'full':
        toggleFullscreen();
        return;
      case 'files':
        toast('文件传输：规划 M2 落地（分块 4MB + 断点续传 + SHA-256 校验）', 3200);
        return;
      case 'more':
        toast('会话设置：画质/帧率/显示器都在磁贴上直接调；更多项在 M2 补齐', 3000);
        return;
      case 'link':
        toast('P2P · ' + (S.relay ? '走中继' : '直连') + ' · ' + (S.latency || '—') + 'ms · ' + S.codec, 3000);
        return;
      default:
        return;
    }
    paintCC();
    paintSbar();
  }

  /* 长按展开：原地放大成详情（规划 5.5「不是弹新窗口」） */
  function expandTile(el, id) {
    var def = TILES.filter(function (t) { return t.id === id; })[0];
    if (!def) return;
    var r = el.getBoundingClientRect();
    var cc = $('ntCC').getBoundingClientRect();
    var detail = '';
    if (id === 'quality') {
      detail = '三档画质：<br>清晰（原始分辨率）· 平衡（75%）· 流畅（50%）<br><span style="opacity:.6">弱网会自动降档</span>';
    } else if (id === 'fps') {
      detail = '帧率档位：60 / 30 / 15 / 5 fps<br><span style="opacity:.6">操作 60，一般 30，省流量 15，只看 5</span>';
    } else if (id === 'display') {
      detail = '显示器切换：共 ' + S.displays + ' 屏，当前 ' + S.display + '<br><span style="opacity:.6">支持「全部拼接」超宽模式</span>';
    } else if (id === 'link') {
      detail = '会话详情<br>协议：' + (S.relay ? '中继转发（密文）' : 'P2P 直连') + '<br>编码：' + S.codec
        + '<br>延迟：' + (S.latency || '—') + ' ms · 帧率：' + S.fps + ' fps';
    } else {
      detail = esc(def.title) + '<br><span style="opacity:.6">长按展开的详情面板（M2 补内容）</span>';
    }
    var box = document.createElement('div');
    box.className = 'nt-tile expanded';
    box.style.left = Math.max(8, r.left - cc.left - 40) + 'px';
    box.style.top = Math.max(8, r.top - cc.top - 40) + 'px';
    box.style.width = '220px';
    box.style.minHeight = '120px';
    box.style.padding = '14px';
    box.style.fontSize = '12px';
    box.style.lineHeight = '1.7';
    box.innerHTML = '<div style="font-size:13px;font-weight:750;margin-bottom:8px;">' + esc(def.title) + '</div>'
      + '<div style="opacity:.85">' + detail + '</div>'
      + '<div style="margin-top:10px;font-size:10.5px;opacity:.5;">点空白处收起</div>';
    $('ntCC').appendChild(box);
    setTimeout(function () {
      var off = function (ev) {
        if (box.contains(ev.target)) return;
        box.remove();
        document.removeEventListener('pointerdown', off, true);
      };
      document.addEventListener('pointerdown', off, true);
    }, 60);
  }

  window.ntCCToggle = function (force) {
    var cc = $('ntCC'), orb = $('ntOrb');
    if (!cc) return;
    var show = force === undefined ? !cc.classList.contains('show') : force;
    if (show) {
      // 从悬浮球位置放大展开：transform-origin 跟着球走（规划 5.6）
      var o = orb ? orb.getBoundingClientRect() : null;
      var c = cc.getBoundingClientRect();
      if (o) {
        var ox = Math.min(100, Math.max(0, ((o.left + o.width / 2 - c.left) / c.width) * 100));
        var oy = Math.min(100, Math.max(0, ((o.top + o.height / 2 - c.top) / c.height) * 100));
        cc.style.transformOrigin = ox + '% ' + oy + '%';
      }
      paintCC();
      cc.classList.add('show');
      positionCC();
    } else {
      cc.classList.remove('show');
    }
  };

  /* 面板贴着球摆，不超出窗口 */
  function positionCC() {
    var cc = $('ntCC'), orb = $('ntOrb');
    if (!cc || !orb) return;
    var stage = $('ntStage').getBoundingClientRect();
    var w = cc.offsetWidth || 360, h = cc.offsetHeight || 420;
    var o = orb.getBoundingClientRect();
    var left = o.right - w - stage.left;
    var top = o.bottom + 10 - stage.top;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    cc.style.left = left + 'px';
    cc.style.top = top + 'px';
    cc.style.right = 'auto';
  }

  /* ────────────────────────── 5. 悬浮球 ──────────────────────────
     可拖动、吸附四边、闲置 3 秒淡到 25%（规划 5.2） */
  (function orbInit() {
    var orb = $('ntOrb');
    if (!orb) return;
    var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0, idleTimer = null;

    function resetIdle() {
      orb.classList.remove('idle');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        if (!dragging && !$('ntCC').classList.contains('show')) orb.classList.add('idle');
      }, 3000);
    }
    orb.addEventListener('pointerenter', resetIdle);
    resetIdle();

    orb.addEventListener('pointerdown', function (e) {
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      var r = orb.getBoundingClientRect();
      var pr = orb.parentElement.getBoundingClientRect();
      ox = r.left - pr.left; oy = r.top - pr.top;
      orb.setPointerCapture && orb.setPointerCapture(e.pointerId);
      orb.classList.remove('idle');
    });
    orb.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var pr = orb.parentElement.getBoundingClientRect();
      var nx = ox + (e.clientX - sx), ny = oy + (e.clientY - sy);
      nx = Math.max(4, Math.min(nx, pr.width - orb.offsetWidth - 4));
      ny = Math.max(4, Math.min(ny, pr.height - orb.offsetHeight - 4));
      orb.style.left = nx + 'px';
      orb.style.top = ny + 'px';
      orb.style.right = 'auto';
    });
    orb.addEventListener('pointerup', function (e) {
      if (!dragging) return;
      dragging = false;
      // 吸附最近的一条边
      var pr = orb.parentElement.getBoundingClientRect();
      var r = orb.getBoundingClientRect();
      var dl = r.left - pr.left, dr = pr.right - r.right, dt = r.top - pr.top, db = pr.bottom - r.bottom;
      var m = Math.min(dl, dr, dt, db);
      if (m === dl) { orb.style.left = '8px'; orb.style.right = 'auto'; }
      else if (m === dr) { orb.style.left = 'auto'; orb.style.right = '8px'; }
      else if (m === dt) { orb.style.top = '8px'; }
      else { orb.style.top = (pr.height - orb.offsetHeight - 8) + 'px'; }
      resetIdle();
      if ($('ntCC').classList.contains('show')) positionCC();
    });
    orb.addEventListener('click', function (e) {
      if (Math.abs(e.clientX - sx) > 4 || Math.abs(e.clientY - sy) > 4) return;  // 拖动不算点击
      window.ntCCToggle();
    });
  })();

  /* ────────────────────────── 6. 会话：屏幕捕获（回环） ────────────────────────── */
  window.ntLoopback = function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      toast('这个浏览器不支持屏幕捕获');
      return;
    }
    navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false }).then(function (stream) {
      startLoopbackSession(stream);
    }).catch(function (err) {
      toast('没有拿到屏幕：' + (err && err.message ? err.message : '用户取消'));
    });
  };

  function startLoopbackSession(stream) {
    S.stream = stream;
    S.mode = 'loopback';
    S.peer = '本机回环（自己看自己）';
    S.codec = '浏览器屏幕捕获';
    S.latency = 0;
    S.displays = 1;
    S.startedAt = Date.now();
    showView('session');
    var stage = $('ntStage');
    var empty = $('ntStageEmpty');
    if (empty) empty.style.display = 'none';
    var v = document.createElement('video');
    v.autoplay = true; v.muted = true; v.playsInline = true;
    v.srcObject = stream;
    v.style.maxWidth = '100%'; v.style.maxHeight = '100%';
    stage.insertBefore(v, stage.firstChild);
    var badge = $('ntModeBadge');
    if (badge) {
      badge.style.display = '';
      badge.innerHTML = '<i class="fas fa-circle" style="font-size:6px;color:#4ade80;"></i> 本机画面 · 真实捕获';
    }
    paintSbar();
    toast('画面已接入。输入注入需要被控端 agent（规划 M1）', 3600);

    // 统计：真实帧率（用 requestVideoFrameCallback 能测到真帧率）
    var stats = { frames: 0, last: performance.now() };
    S.stats = stats;
    var loop = function () {
      if (!S.active || !stream.active) return;
      stats.frames++;
      var now = performance.now();
      if (now - stats.last >= 1000) {
        S.fps = Math.round(stats.frames * 1000 / (now - stats.last));
        stats.frames = 0;
        stats.last = now;
        paintSbar();
        if ($('ntCC').classList.contains('show')) paintCC();
      }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(loop);
      else setTimeout(loop, 1000 / 15);
    };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(loop);
    else setTimeout(loop, 200);
    stream.getVideoTracks()[0].addEventListener('ended', function () {
      toast('屏幕共享已停止');
      ntEndSession();
    });
  }

  /* ────────────────────────── 7. 形态 B：共享 Nexus 会话 ──────────────────────────
     不传像素：把宿主桌面（窗口列表/位置/z/最小化）序列化后走 BroadcastChannel 同步。
     共享端 = 被看的一方；加入端 = 看的人（只读演示 / 协作控制）。 */
  var SHARE_CH = null;
  var shareState = null;
  var shareCodes = {};

  function desktopSnapshot() {
    // 优先问宿主要真实窗口状态
    return new Promise(function (resolve) {
      if (Nexus && Nexus.call) {
        Nexus.call('getDesktopState').then(function (d) {
          resolve(d || { windows: [] });
        }).catch(function () {
          resolve({ windows: [] });
        });
      } else {
        resolve({ windows: [] });
      }
    });
  }

  window.ntStartShare = function () {
    var code = pad(rnd(900000) + 100000, 6);
    lsSet('shareCode', code);
    window.ntMyShareCode = code;
    S.mode = 'share';
    S.peer = '我的 Nexus 桌面（共享中）';
    S.codec = '状态同步（非像素）';
    S.startedAt = Date.now();
    showView('session');
    var badge = $('ntModeBadge');
    if (badge) {
      badge.style.display = '';
      badge.innerHTML = '<i class="fas fa-share-nodes"></i> 正在共享 · 连接码 ' + code;
    }
    $('ntStageEmpty').innerHTML = '<i class="fas fa-share-nodes"></i><div>共享已开启，连接码 <b style="color:var(--nt-accent);letter-spacing:2px;">'
      + code + '</b><br><span style="font-size:11px;">让对方在 Necta 里点「加入别人的共享」输入这个码，<br>或者直接打开链接（已复制到剪贴板）</span></div>';
    $('ntStageEmpty').style.display = '';

    if (SHARE_CH) SHARE_CH.close();
    SHARE_CH = new BroadcastChannel('necta-share-' + code);
    SHARE_CH.onmessage = function (ev) {
      var m = ev.data || {};
      if (m.type === 'hello') {
        desktopSnapshot().then(function (snap) {
          SHARE_CH.postMessage({ type: 'state', snap: snap });
        });
        toast('有人加入了你的共享桌面');
      } else if (m.type === 'focus' && m.appId) {
        if (Nexus && Nexus.openApp) Nexus.openApp(m.appId);
      }
    };
    // 持续推送（每秒一次，状态变了才推）
    var lastJson = '';
    var timer = setInterval(function () {
      if (S.mode !== 'share' || !SHARE_CH) return;
      desktopSnapshot().then(function (snap) {
        var j = JSON.stringify(snap);
        if (j === lastJson) return;
        lastJson = j;
        SHARE_CH.postMessage({ type: 'state', snap: snap });
      });
    }, 1000);
    S._shareTimer = timer;
    paintSbar();
    var link = shareLink(code);
    try {
      var pc = navigator.clipboard.writeText(link);
      if (pc && pc.catch) pc.catch(function () { });   // 无焦点/无权限时不弹未捕获异常
    } catch (e) { }
    toast('共享已开启 · 连接码 ' + code + '（链接已尝试复制）');
  };

  window.ntJoinShare = function () {
    var code = prompt('输入对方的共享连接码（6 位数字）');
    if (!code) return;
    code = String(code).trim();
    if (!/^\d{6}$/.test(code)) { toast('连接码是 6 位数字'); return; }
    joinShare(code);
  };

  function joinShare(code) {
    S.mode = 'share-join';
    S.peer = '共享会话 #' + code;
    S.codec = '状态同步（非像素）';
    S.startedAt = Date.now();
    S.latency = 12;
    showView('session');
    var badge = $('ntModeBadge');
    if (badge) {
      badge.style.display = '';
      badge.innerHTML = '<i class="fas fa-eye"></i> 只读演示 · 点窗口可请求对方聚焦';
    }
    $('ntStageEmpty').style.display = 'none';
    var stage = $('ntStage');
    var mirror = document.createElement('div');
    mirror.className = 'nt-mirror';
    mirror.id = 'ntMirror';
    stage.insertBefore(mirror, stage.firstChild);

    if (SHARE_CH) SHARE_CH.close();
    SHARE_CH = new BroadcastChannel('necta-share-' + code);
    SHARE_CH.onmessage = function (ev) {
      var m = ev.data || {};
      if (m.type === 'state' && m.snap) {
        renderMirror(m.snap);
        S.offline = false;
        S.fps = 15;   // 状态同步是 1s 级刷新，这里给个"心跳帧率"感
        paintSbar();
      }
    };
    SHARE_CH.postMessage({ type: 'hello' });
    paintSbar();
    toast('已加入共享 #' + code + '，等待对方桌面状态…');
    // 5 秒没收到就报"对方不在线"
    setTimeout(function () {
      if (!document.querySelector('#ntMirror .nt-mwin')) {
        S.offline = true;
        paintSbar();
        paintCC();
        toast('没收到对方的桌面状态：确认对方也开着 Necta 的共享', 3600);
      }
    }, 5000);
  }

  window.ntJoinShareCode = function (code) { joinShare(String(code)); };

  /* 分享链接：?join=123456 打开就自动加入（规划 4.1 的第 3 种连接方式） */
  /* 分享链接必须指向**整个系统**（Nexus OS 26.html?app=necta&join=xxx）：
     直接给裸的 apps/necta/index.html，对方打开时没有宿主桥，ID/密码/最近设备全哑火。 */
  function shareLink(code) {
    var href = location.href.split('#')[0].split('?')[0];
    var sys;
    if (/\/apps\/necta\/index\.html$/.test(href)) {
      sys = href.replace(/\/apps\/necta\/index\.html$/, '/Nexus OS 26.html');
    } else if (/\/apps\/necta\//.test(href)) {
      sys = href.replace(/\/apps\/necta\/.*$/, '/Nexus OS 26.html');
    } else {
      sys = href;   // 已经是系统页
    }
    return sys + '?app=necta&join=' + code;
  }
  window.ntShareLink = shareLink;

  function renderMirror(snap) {
    var mirror = $('ntMirror');
    if (!mirror) return;
    var vw = snap.vw || 1440, vh = snap.vh || 900;
    var rect = mirror.getBoundingClientRect();
    var scale = Math.min(rect.width / vw, rect.height / vh);
    var ox = (rect.width - vw * scale) / 2;
    var oy = (rect.height - vh * scale) / 2;
    var wins = (snap.windows || []).slice().sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); });

    // 壁纸底（如果宿主给了）
    if (snap.wallpaper && !/^(data:|blob:)/i.test(snap.wallpaper)) {
      mirror.style.backgroundImage = 'url("' + snap.wallpaper + '")';
      mirror.style.backgroundSize = 'cover';
      mirror.style.backgroundPosition = 'center';
    }

    var seen = {};
    wins.forEach(function (w) {
      if (!w || w.id == null) return;
      seen[w.id] = true;
      var el = mirror.querySelector('[data-win="' + w.id + '"]');
      if (!el) {
        el = document.createElement('div');
        el.className = 'nt-mwin';
        el.dataset.win = w.id;
        el.dataset.appId = w.appId || '';
        el.innerHTML = '<div class="bar"><span class="d"></span><span class="d"></span><span class="d"></span>'
          + '<span style="margin-left:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(w.title || w.appId || '窗口') + '</span></div>'
          + '<div class="body">' + esc(w.appId || '') + '</div>';
        el.addEventListener('click', function () {
          if (S.mode === 'share-join' && SHARE_CH && el.dataset.appId) {
            SHARE_CH.postMessage({ type: 'focus', appId: el.dataset.appId });
            toast('已请求对方聚焦「' + (w.title || w.appId) + '」');
          }
        });
        mirror.appendChild(el);
      }
      el.style.left = (ox + (w.x || 0) * scale) + 'px';
      el.style.top = (oy + (w.y || 0) * scale) + 'px';
      el.style.width = Math.max(60, (w.width || 700) * scale) + 'px';
      el.style.height = Math.max(44, (w.height || 480) * scale) + 'px';
      el.classList.toggle('min', w.state === 'minimized');
    });
    // 清掉对方已关闭的窗口
    mirror.querySelectorAll('.nt-mwin').forEach(function (el) {
      if (!seen[el.dataset.win]) el.remove();
    });
    S.displays = 1;
  }

  /* ────────────────────────── 8. 连接（形态 A） ────────────────────────── */
  window.ntConnect = function () {
    var id = ($('ntPeerId').value || '').replace(/\s/g, '');
    var pass = ($('ntPeerPass').value || '').replace(/\s/g, '');
    if (!/^\d{9}$/.test(id)) { toast('对方 ID 是 9 位数字'); return; }
    if (!/^\d{6}$/.test(pass)) { toast('密码是 6 位数字'); return; }
    if (id === myId()) {
      toast('这是你自己的 ID —— 直接开本机画面自测');
      ntLoopback();
      return;
    }
    // 真连远程需要信令服务器 + 被控端 agent（规划 M1/M2），这里如实说明并给出演示
    toast('正在连接 ' + id + ' …', 1600);
    setTimeout(function () {
      pushRecent(id, '设备 ' + id.slice(0, 3) + '…' + id.slice(-3));
      showView('session');
      S.mode = 'remote';
      S.peer = '设备 ' + id;
      S.codec = '信令未接通';
      S.offline = true;
      paintSbar();
      paintCC();
      $('ntStageEmpty').innerHTML = '<i class="fas fa-satellite-dish"></i>'
        + '<div>已发起连接到 <b>' + esc(id) + '</b><br>'
        + '<span style="font-size:11.5px;">信令服务器（Cloudflare Worker）还没部署，被控端 agent 也还没装上——<br>'
        + '所以这条链路暂时连不通。规划里 M1 就是补这两块。</span><br>'
        + '<span style="font-size:11px;opacity:.7;">现在可以先用「共享我的 Nexus 桌面」体验真实同步</span></div>';
      $('ntStageEmpty').style.display = '';
      toast('链路未接通：需要信令服务器 + 被控端 agent', 4200);
    }, 900);
  };

  /* ────────────────────────── 9. 全屏 / 断开 ────────────────────────── */
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      S.fullscreen = true;
    } else {
      document.exitFullscreen && document.exitFullscreen();
      S.fullscreen = false;
    }
    paintCC();
  }
  function ntDisconnect() {
    if (S.stream) { S.stream.getTracks().forEach(function (t) { t.stop(); }); S.stream = null; }
    if (S._shareTimer) { clearInterval(S._shareTimer); S._shareTimer = null; }
    if (SHARE_CH) { SHARE_CH.close(); SHARE_CH = null; }
    var orb = $('ntOrb');
    if (orb) orb.classList.remove('rec');
    S.active = false; S.mode = 'idle'; S.offline = false; S.recording = false;
    var stage = $('ntStage');
    stage.querySelectorAll('video, .nt-mirror').forEach(function (n) { n.remove(); });
    $('ntStageEmpty').style.display = '';
    $('ntStageEmpty').innerHTML = '<i class="fas fa-satellite-dish"></i><div>等待画面…</div>';
    var badge = $('ntModeBadge');
    if (badge) badge.style.display = 'none';
    window.ntCCToggle(false);
    showView('home');
    toast('会话已结束');
  }
  window.ntEndSession = ntDisconnect;

  document.addEventListener('fullscreenchange', function () {
    S.fullscreen = !!document.fullscreenElement;
    if ($('ntCC').classList.contains('show')) paintCC();
  });

  /* ────────────────────────── 10. 键鼠与生命周期 ────────────────────────── */
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.code === 'Space' || e.key === ' ')) {
      e.preventDefault();
      window.ntCCToggle();
    }
    if (e.key === 'Escape') {
      if ($('ntCC').classList.contains('show')) window.ntCCToggle(false);
    }
    // 方向键在磁贴间移动焦点（规划 5.7）
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) {
      var tiles = [...document.querySelectorAll('#ntCCGrid .nt-tile')];
      var cur = document.activeElement;
      if (!tiles.length || tiles.indexOf(cur) < 0) return;
      e.preventDefault();
      var i = tiles.indexOf(cur);
      var perRow = 4;
      var next = i;
      if (e.key === 'ArrowRight') next = Math.min(tiles.length - 1, i + 1);
      if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
      if (e.key === 'ArrowDown') next = Math.min(tiles.length - 1, i + perRow);
      if (e.key === 'ArrowUp') next = Math.max(0, i - perRow);
      tiles[next].focus();
    }
  });

  window.addEventListener('resize', function () {
    if ($('ntCC').classList.contains('show')) positionCC();
  });

  // 从宿主要上下文（深色模式跟随）
  if (Nexus && Nexus.on) {
    Nexus.on('theme', function (d) {
      document.body.classList.toggle('nt-dark', !!(d && d.dark));
    });
  }

  /* 启动 */
  function boot() {
    preload().then(function () {
      paintIdentity();
      paintRecents();
    });
    var vol = Number(lsGet('volume', 70));
    if (isFinite(vol)) S.volume = vol;
    // 跟随系统深浅色
    try {
      if (Nexus && Nexus.getContext) {
        Nexus.getContext().then(function (c) {
          if (c && c.dark) document.body.classList.add('nt-dark');
        }).catch(function () { });
      }
    } catch (e) { }
    // 被控端状态提示（真 agent 不存在时如实显示）
    var pill = $('ntAgentPill');
    if (pill) {
      pill.innerHTML = '<i class="fas fa-circle nt-dot"></i> 被控端未运行（agent 未安装）';
    }
    paintCC();
    // 分享链接：?join=123456 直接进会话
    try {
      var q = new URLSearchParams(location.search);
      var j = q.get('join');
      if (j && /^\d{6}$/.test(j)) setTimeout(function () { joinShare(j); }, 300);
    } catch (e) { }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
