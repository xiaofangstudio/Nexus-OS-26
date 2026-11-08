/* ==========================================================================
   Nexus OS 26 · Dock Bar 运行时（v2.9.98）
   --------------------------------------------------------------------------
   设计原则（对标 Touch Bar，但落成「有内容的系统条」而不是空壳）：
   1) 只要前台窗口是「已适配应用」，Dock Bar 必须出现 —— 不再依赖应用主动推 spec。
      主壳内置适配器先给一条可用默认条，应用再用 Nexus.call('dockbar', ...) 覆盖。
   2) 状态实时：每 700ms 从拥有者 iframe 里读一次真实播放/页码状态（同源可读），
      这样音乐进度、方哩方哩进度、PPT 页码不需要应用配合也能动。
   3) 点击一律先按公开 API 回传 nexus:dockbar 事件给应用；
      应用没接时由本地兜底动作执行（播放/暂停、翻页、切分类）。
   4) 全屏 / 最小化 / 窗口失焦 → 收起，绝不压在别的应用上。
   ========================================================================== */
(function () {
    'use strict';
    if (window.__N26_DOCKBAR_RT__) return;
    window.__N26_DOCKBAR_RT__ = true;

    var TICK = 700;
    var state = { owner: null, appId: null, timer: 0, lastSig: '' };

    function $(sel, root) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }
    function within(sel, root) { try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; } }

    function ownerFrame() {
        if (state.owner == null) return null;
        var win = document.getElementById('window-' + state.owner);
        if (!win) return null;
        return win.querySelector('iframe.app-iframe') || null;
    }
    function ownerDoc() {
        var fr = ownerFrame();
        if (fr) {
            try { return fr.contentDocument || null; } catch (e) { }
        }
        /* 设置 / 应用商城这类应用是主壳内联渲染的，没有 iframe。
           此时把窗口元素本身当作根，瓦片点击才能在窗口里找到同名分类。 */
        if (state.owner != null) return document.getElementById('window-' + state.owner);
        return null;
    }
    function media() {
        var d = ownerDoc();
        if (!d) return null;
        var m = d.querySelector('audio') || d.querySelector('video');
        return m || null;
    }
    function fmt(t) {
        t = Math.max(0, Math.floor(t || 0));
        var m = Math.floor(t / 60), s = t % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    /* ---------- 内置适配器：没有应用配合也要有一条能用的条 ---------- */
    var ADAPTERS = {
        music: function () {
            var m = media();
            var d = ownerDoc();
            var name = '', sub = '';
            if (d) {
                var n = $('.bar-name', d), s = $('.bar-sub', d);
                name = n ? (n.textContent || '').trim() : '';
                sub = s ? (s.textContent || '').trim() : '';
            }
            var playing = !!(m && !m.paused);
            var p = (m && isFinite(m.duration) && m.duration > 0) ? (m.currentTime / m.duration) : 0;
            return {
                title: '音乐',
                buttons: [
                    { id: 'prev', icon: 'fa-backward-step' },
                    { id: 'toggle', icon: playing ? 'fa-pause' : 'fa-play', accent: true },
                    { id: 'next', icon: 'fa-forward-step' },
                    { id: 'shuffle', icon: 'fa-shuffle' }
                ],
                text: name ? (name + (sub ? ' · ' + sub : '')) : '未在播放',
                progress: p,
                timeText: m ? (fmt(m.currentTime) + ' / ' + fmt(m.duration)) : ''
            };
        },
        video: function () {
            var m = media();
            var playing = !!(m && !m.paused);
            var p = (m && isFinite(m.duration) && m.duration > 0) ? (m.currentTime / m.duration) : 0;
            return {
                title: '视频',
                buttons: [
                    { id: 'back10', icon: 'fa-rotate-left', label: '10' },
                    { id: 'toggle', icon: playing ? 'fa-pause' : 'fa-play', accent: true },
                    { id: 'fwd10', icon: 'fa-rotate-right', label: '10' },
                    { id: 'mute', icon: (m && m.muted) ? 'fa-volume-xmark' : 'fa-volume-high' }
                ],
                text: m ? (fmt(m.currentTime) + ' / ' + fmt(m.duration)) : '',
                progress: p
            };
        },
        bili: function () {
            var m = media();
            var playing = !!(m && !m.paused);
            var p = (m && isFinite(m.duration) && m.duration > 0) ? (m.currentTime / m.duration) : 0;
            var rate = m ? (m.playbackRate || 1) : 1;
            return {
                title: '方哩方哩',
                buttons: [
                    { id: 'back10', icon: 'fa-rotate-left' },
                    { id: 'toggle', icon: playing ? 'fa-pause' : 'fa-play', accent: true },
                    { id: 'fwd10', icon: 'fa-rotate-right' },
                    { id: 'rate', icon: 'fa-gauge-high', label: rate + 'x' },
                    { id: 'dm', icon: 'fa-comment-dots' }
                ],
                text: m ? (fmt(m.currentTime) + ' / ' + fmt(m.duration)) : '',
                progress: p
            };
        },
        album: function () {
            var d = ownerDoc();
            var info = '';
            if (d) {
                var t = $('.album-title, .alb-title, #viewerCounter, .album-counter', d);
                if (t) info = (t.textContent || '').trim();
            }
            return {
                title: '照片',
                buttons: [
                    { id: 'prev', icon: 'fa-chevron-left' },
                    { id: 'play', icon: 'fa-play', accent: true },
                    { id: 'next', icon: 'fa-chevron-right' },
                    { id: 'favorite', icon: 'fa-heart' },
                    { id: 'info', icon: 'fa-circle-info' }
                ],
                text: info || '左右切换照片'
            };
        },
        settings: function () {
            return {
                title: '设置',
                tiles: [
                    { id: 'general', label: '通用', icon: 'fa-sliders' },
                    { id: 'appearance', label: '外观', icon: 'fa-palette' },
                    { id: 'network', label: '网络', icon: 'fa-wifi' },
                    { id: 'account', label: '账户', icon: 'fa-user' }
                ]
            };
        },
        appstore: function () {
            return {
                title: '应用商城',
                tiles: [
                    { id: 'featured', label: '精选', icon: 'fa-star' },
                    { id: 'game', label: '游戏', icon: 'fa-gamepad' },
                    { id: 'productivity', label: '效率', icon: 'fa-bolt' },
                    { id: 'media', label: '影音', icon: 'fa-play' },
                    { id: 'utility', label: '工具', icon: 'fa-screwdriver-wrench' }
                ]
            };
        },
        float: function () {
            return {
                title: 'Float IDE',
                buttons: [
                    { id: 'command', icon: 'fa-terminal', label: '命令' },
                    { id: 'save', icon: 'fa-floppy-disk' },
                    { id: 'run', icon: 'fa-play', accent: true },
                    { id: 'format', icon: 'fa-wand-magic-sparkles' }
                ],
                text: '自动补全 · 命令面板'
            };
        },
        strata: function () {
            return {
                title: 'Strata',
                buttons: [
                    { id: 'fit', icon: 'fa-expand', label: '适应' },
                    { id: 'zoom100', icon: 'fa-magnifying-glass', label: '100%' },
                    { id: 'format', icon: 'fa-file-export', label: '格式' },
                    { id: 'export', icon: 'fa-download', accent: true }
                ]
            };
        },
        'ppt-editor': function () {
            var d = ownerDoc();
            var cur = '';
            if (d) {
                var n = $('.ppt-page-no, #slideCounter, .slide-counter', d);
                if (n) cur = (n.textContent || '').trim();
            }
            return {
                title: '演示文稿',
                buttons: [
                    { id: 'prev', icon: 'fa-chevron-left' },
                    { id: 'next', icon: 'fa-chevron-right' },
                    { id: 'play', icon: 'fa-play', accent: true, label: '放映' }
                ],
                text: cur || '翻页 · 放映'
            };
        },
        'word-editor': function () {
            return {
                title: '文稿',
                buttons: [
                    { id: 'save', icon: 'fa-floppy-disk' },
                    { id: 'bold', icon: 'fa-bold' },
                    { id: 'italic', icon: 'fa-italic' },
                    { id: 'print', icon: 'fa-print' }
                ]
            };
        },
        'excel-editor': function () {
            return {
                title: '表格',
                buttons: [
                    { id: 'save', icon: 'fa-floppy-disk' },
                    { id: 'sum', icon: 'fa-sigma' },
                    { id: 'chart', icon: 'fa-chart-column' },
                    { id: 'print', icon: 'fa-print' }
                ]
            };
        },
        fangliao: function () {
            return {
                title: '方聊',
                buttons: [
                    { id: 'newchat', icon: 'fa-pen-to-square', label: '新聊天' },
                    { id: 'contacts', icon: 'fa-address-book' },
                    { id: 'call', icon: 'fa-phone' }
                ]
            };
        },
        screenshot: function () {
            return {
                title: '截图',
                buttons: [
                    { id: 'region', icon: 'fa-crop-simple', label: '区域' },
                    { id: 'full', icon: 'fa-desktop', label: '全屏' },
                    { id: 'window', icon: 'fa-window-restore', label: '窗口' }
                ]
            };
        }
    };

    /* 已适配应用清单：只有这些应用在前台时才出条（其余应用保持桌面干净） */
    var SUPPORTED = {};
    Object.keys(ADAPTERS).forEach(function (k) { SUPPORTED[k] = 1; });

    function sigOf(spec) {
        if (!spec) return '';
        return JSON.stringify([spec.title, spec.text, spec.progress, spec.timeText,
            (spec.buttons || []).map(function (b) { return b.id + ':' + b.icon; }),
            (spec.tiles || []).map(function (t) { return t.id; })]);
    }

    function render(spec) {
        if (!spec) return false;
        /* 应用内全屏（视频）期间整条让开：不渲染、不 show、也不缓存签名 */
        if (window.__n26DbHidden) { state.lastSig = ''; return false; }
        var sig = sigOf(spec);
        if (sig === state.lastSig) return true;
        state.lastSig = sig;
        try {
            if (typeof window.updateDockBar === 'function' && !window.__n26DbHidden) {
                // 内容变了用 update；没显示时 update 会返回 false，下面再 show 一次
                if (window.updateDockBar(spec)) return true;
            }
        } catch (e) { }
        var ok = false;
        try { ok = !!window.showDockBar(spec, state.owner); } catch (e) { ok = false; }
        /* 浏览器全屏 / 条被挡住时 show 会返回 false。这时必须把签名清掉，
           否则退出全屏后签名相同 → 永远不再尝试，条就彻底消失了。 */
        if (!ok) state.lastSig = '';
        return ok;
    }

    function refresh() {
        if (state.owner == null) return;
        var fn = ADAPTERS[state.appId];
        if (!fn) return;
        var spec = null;
        try { spec = fn(); } catch (e) { spec = null; }
        if (!spec) return;
        // 应用自己推过 spec（比如 PPT 的页缩略图）→ 让应用接管，避免互相覆盖
        try {
            if (window.DOCK_BAR && window.DOCK_BAR.visible && window.DOCK_BAR.spec &&
                window.DOCK_BAR.spec.__appPushed) return;
        } catch (e) { }
        render(spec);
        var el = document.getElementById('dockBar');
        if (el && spec.progress != null) {
            el.style.setProperty('--db-progress', String(Math.max(0, Math.min(1, spec.progress))));
        }
    }

    function startTimer() {
        if (state.timer) return;
        state.timer = setInterval(refresh, TICK);
    }
    function stopTimer() {
        if (state.timer) { clearInterval(state.timer); state.timer = 0; }
    }

    /* ---------- 对外：窗口聚焦时由主壳调用 ---------- */
    window.n26DockBarOnFocus = function (winId, appId) {
        if (winId == null) return;
        var changed = (state.owner !== winId) || (state.appId !== appId);
        state.owner = winId;
        state.appId = appId;
        if (changed) state.lastSig = '';
        if (!SUPPORTED[appId]) { window.n26DockBarHide(); return; }
        /* 注意：这里不要重置 __n26DbHidden —— 视频全屏期间点一下窗口会触发 focus，
           重置了就会在画面里冒出一条。只在应用主动发 true 时解除。 */
        refresh();
        startTimer();
    };

    window.n26DockBarHide = function () {
        stopTimer();
        state.owner = null;
        state.appId = null;
        state.lastSig = '';
        window.__n26DbHidden = false;
        try { if (typeof window.hideDockBar === 'function') window.hideDockBar(); } catch (e) { }
    };

    window.n26DockBarBlur = function (winId) {
        if (state.owner != null && state.owner === winId) window.n26DockBarHide();
    };

    /* v2.10.1 · 关窗 / 最小化后不直接收条，而是回落到「界面顶层那个应用」。
       用户原话：「Dock Bar 应该始终显示在界面顶层的那个应用」。
       关掉音乐窗口时若设置窗口还在，条应该换成设置的内容，而不是整条消失。 */
    window.n26DockBarFallback = function () {
        var best = null, bz = -Infinity;
        try {
            if (typeof windows !== 'undefined' && Array.isArray(windows)) {
                windows.forEach(function (w) {
                    if (!w || w.state === 'minimized') return;
                    var z = Number(w.zIndex) || 0;
                    var el = document.getElementById('window-' + w.id);
                    if (el && el.style.display === 'none') return;
                    if (z > bz) { bz = z; best = w; }
                });
            }
        } catch (e) { best = null; }
        if (!best) { window.n26DockBarHide(); return; }
        window.n26DockBarOnFocus(best.id, best.appId);
    };

    /* ---------- 点击：先回传给应用，再由本地兜底 ---------- */
    function actLocal(kind, id) {
        var m = media();
        var d = ownerDoc();
        if (!m && !d) return;
        if (kind === 'button') {
            if (id === 'toggle') { try { if (m.paused) m.play(); else m.pause(); } catch (e) { } return; }
            if (id === 'back10') { try { m.currentTime = Math.max(0, m.currentTime - 10); } catch (e) { } return; }
            if (id === 'fwd10') { try { m.currentTime = Math.min(m.duration || 1e9, m.currentTime + 10); } catch (e) { } return; }
            if (id === 'mute') { try { m.muted = !m.muted; } catch (e) { } return; }
            if (id === 'rate') {
                try {
                    var seq = [1, 1.25, 1.5, 2, 0.75];
                    var i = seq.indexOf(m.playbackRate);
                    m.playbackRate = seq[(i + 1) % seq.length];
                } catch (e) { }
                return;
            }
            if (id === 'prev' || id === 'next') {
                // 应用没接事件时，退化为「前后 30s」而不是什么都不做
                try {
                    m.currentTime = Math.max(0, Math.min(m.duration || 1e9,
                        m.currentTime + (id === 'next' ? 30 : -30)));
                } catch (e) { }
                return;
            }
        }
        if (kind === 'tile') {
            // 商城 / 设置：在应用文档里按文案或 data-cat 找同名分类并点击
            var labels = { featured: '精选', game: '游戏', productivity: '效率', media: '影音', utility: '工具', general: '通用', appearance: '外观', network: '网络', account: '账户' };
            var want = labels[id];
            if (!want) return;
            var cands = within('button, a, li, .tab, .cat, .store-tab', d);
            for (var i = 0; i < cands.length; i++) {
                var txt = (cands[i].textContent || '').trim();
                if (txt === want || txt.indexOf(want) === 0) { try { cands[i].click(); } catch (e) { } return; }
            }
        }
    }

    document.addEventListener('click', function (e) {
        var bar = document.getElementById('dockBar');
        if (!bar || !bar.contains(e.target)) return;
        var tile = e.target.closest ? e.target.closest('.db-tile') : null;
        var btn = e.target.closest ? e.target.closest('.db-btn') : null;
        if (!tile && !btn) return;
        var spec = (window.DOCK_BAR && window.DOCK_BAR.spec) || null;
        var kind = tile ? 'tile' : 'button';
        var idx = parseInt((tile || btn).getAttribute('data-idx'), 10) || 0;
        var item = (kind === 'tile' ? (spec && spec.tiles) : (spec && spec.buttons) || [])[idx] || {};
        /* ★ 关键：公开 API 已经把这次点击回传给应用了，应用若自己处理了，
           本地兜底绝不能再做一遍 —— 否则「播放/暂停」会被连点两次，等于没点。
           做法：先记下点击瞬间的真实媒体状态，140ms 后看它有没有被应用改过；
           没改过才说明应用没接这个事件，这时才执行本地兜底。 */
        var m0 = media();
        var snap = m0 ? { paused: m0.paused, t: m0.currentTime, muted: m0.muted, rate: m0.playbackRate } : null;
        setTimeout(function () {
            var m1 = media();
            if (snap && m1) {
                var changed =
                    (item.id === 'toggle' && m1.paused !== snap.paused) ||
                    (item.id === 'back10' && Math.abs(m1.currentTime - snap.t) > 0.4) ||
                    (item.id === 'fwd10' && Math.abs(m1.currentTime - snap.t) > 0.4) ||
                    (item.id === 'prev' && Math.abs(m1.currentTime - snap.t) > 0.4) ||
                    (item.id === 'next' && Math.abs(m1.currentTime - snap.t) > 0.4) ||
                    (item.id === 'mute' && m1.muted !== snap.muted) ||
                    (item.id === 'rate' && m1.playbackRate !== snap.rate);
                if (changed) { setTimeout(refresh, 40); return; }
            }
            actLocal(kind, item.id);
            // 本地动作之后回读一次，让图标/进度马上翻转
            setTimeout(refresh, 60);
            setTimeout(refresh, 420);
        }, 140);
    }, true);

    /* ---------- 应用内全屏：让条让开 ----------
       方哩方哩（以及后续的视频类应用）进入「应用内全屏」时会发
       { __n26DockBarVisible:false } —— 视频画面里不该有任何系统条。
       退出全屏再发 true 恢复。 */
    window.addEventListener('message', function (e) {
        var d = e && e.data;
        if (!d || typeof d !== 'object' || !('__n26DockBarVisible' in d)) return;
        window.__n26DbHidden = (d.__n26DockBarVisible === false);
        if (window.__n26DbHidden) {
            try { if (typeof window.hideDockBar === 'function') window.hideDockBar(); } catch (er) { }
            stopTimer();
        } else {
            refresh();
            if (state.owner != null) startTimer();
        }
    }, false);

    /* ---------- 与应用主动推送的和解 ----------
       应用通过 Nexus.call('dockbar', {action:'show', spec}) 推来的内容带 __appPushed 标记，
       聚焦时不再被内置适配器覆盖；应用 hide 之后恢复内置条。 */
    var _origShow = window.showDockBar;
    if (typeof _origShow === 'function') {
        window.showDockBar = function (spec, ownerWinId) {
            if (spec && spec.__appPushed) { stopTimer(); }
            return _origShow.apply(this, arguments);
        };
    }
})();
