/* ============================================================================
 * Nexus OS 26 · 首次进入构建动画 · DOM 渲染层（N26FB）
 * ----------------------------------------------------------------------------
 * 依赖：ui/n26-fb-core.js（纯计算状态机，必须先加载）。
 *
 * 本文件的职责只有「把 stateAt(t) 的几何写到真实桌面节点上」，不含任何计时。
 *   t = bgm.currentTime（唯一主时钟）；音频失败/被拦截 → performance.now() 偏移。
 *   每帧 rAF 只做一次求值 + 一次 DOM 写入；没有 WAAPI、没有 CSS duration、
 *   没有 setTimeout 驱动的关键帧 —— 这是「不会一帧内完成」的根本保证。
 *
 * 真节点（绝不演假桌面）：
 *   #dock / .dock-item / .dock-separator / #finder-bar 两段及其子项 /
 *   #desktopIcons .desktop-icon / .desktop-widget 全部直接用主壳原有 DOM；
 *   窗口骨架复用真实 .window / .window-titlebar / .window-content 结构与 CSS，
 *   动画结束即移除，交回桌面后真实窗口仍按 700×500 由 openApp() 创建。
 *   聚焦框 / 辅助线 / 指针 / Covi 是「构建过程可视化」，放在独立舞台层。
 *
 * 主壳零侵入：不改 enterDesktop()，模块自己监听桌面首次可见来启动。
 * 对外：window.N26FB = { shouldPlay, play, skip, replay, isPlaying }
 * ==========================================================================*/
(function () {
    'use strict';
    var C = window.N26FBCore;
    if (!C) { try { console.warn('[N26FB] n26-fb-core.js 未加载，构建动画跳过'); } catch (e) { } return; }

    var KEY = 'n26FirstBootDone';
    var AUDIO = 'assets/n26-firstboot-bgm.mp3';
    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }

    /* ---------- 只播一次（跟 n26-tour 一样走账号作用域存储） ---------- */
    function done() {
        try {
            if (typeof getUserLS === 'function') return !!getUserLS(KEY);
            return !!localStorage.getItem('n26fb_done');
        } catch (e) { return false; }
    }
    function mark() {
        try {
            if (typeof setUserLS === 'function') setUserLS(KEY, 1);
            else localStorage.setItem('n26fb_done', '1');
        } catch (e) { }
    }
    function clearMark() {
        try {
            if (typeof setUserLS === 'function') setUserLS(KEY, 0);
            localStorage.removeItem('n26fb_done');
        } catch (e) { }
    }

    var playing = false, raf = 0, bgm = null;
    var startPerf = 0, audioOk = false, soundOn = true, soundBlocked = false;
    var stage = null, cam = null, hud = null, tcEl = null, scEl = null, sndEl = null;
    var sk = {};                 // 舞台层节点
    var M = null;
    var bound = [];              // {id, el, base}
    var dockNode = null, tlNode = null, trNode = null;
    var dockItemNodes = [], sepNodes = [], tbItemNodes = [], widgetNodes = [];
    var mo = null, hudLast = -1;
    /* 只清本模块写过的属性；不碰 transform / transform-origin，
     * Dock 的 translateX(-50%) 与任何其他会话设置的样式都原样保留。 */
    var CLEAR_PROPS = ['translate', 'scale', 'opacity', 'visibility'];

    function rectOf(n) {
        var r = n.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    function ok(g) { return g && g.w > 1 && g.h > 1; }
    function rmProps(n) { CLEAR_PROPS.forEach(function (p) { try { n.style.removeProperty(p); } catch (e) { } }); }

    /* ---------- 量真实节点，覆盖设计基准几何 ---------- */
    function collect() {
        var V = { vw: window.innerWidth || 1440, vh: window.innerHeight || 900 };
        var D = C.defaultMetrics(V);

        dockNode = document.getElementById('dock');
        tlNode = document.querySelector('#finder-bar .n26-topbar-left');
        trNode = document.querySelector('#finder-bar .n26-topbar-right');

        var rd = dockNode ? rectOf(dockNode) : null;
        if (ok(rd)) D.dock = rd;
        var items = dockNode ? Array.prototype.slice.call(dockNode.querySelectorAll('.dock-item')) : [];
        dockItemNodes = items;
        var ri = items.map(rectOf).filter(ok);
        if (ri.length) D.dockItems = ri;

        var seps = dockNode ? Array.prototype.slice.call(dockNode.querySelectorAll('.dock-separator')) : [];
        sepNodes = seps.filter(function (n) { return ok(rectOf(n)); });
        var rs = sepNodes.map(rectOf);
        if (rs.length) D.separators = rs;

        var rl = tlNode ? rectOf(tlNode) : null, rr = trNode ? rectOf(trNode) : null;
        if (ok(rl)) D.topbar.left = rl;
        if (ok(rr)) D.topbar.right = rr;
        var tbKids = [];
        if (tlNode) tbKids = tbKids.concat(Array.prototype.slice.call(tlNode.children));
        if (trNode) tbKids = tbKids.concat(Array.prototype.slice.call(trNode.children));
        tbItemNodes = tbKids;
        D.topbarItemCount = tbKids.length || 8;

        var icons = Array.prototype.slice.call(document.querySelectorAll('#desktopIcons .desktop-icon'));
        var iconRects = icons.map(rectOf).filter(ok).slice(0, 3);
        /* 真实图标不足 3 个时用默认补齐（core 需要 3 个槽位做自检） */
        D.icons = [0, 1, 2].map(function (i) { return iconRects[i] || C.defaultMetrics().icons[i]; });
        boundIcons = icons.slice(0, 3);

        widgetNodes = Array.prototype.slice.call(document.querySelectorAll('.desktop-widget'));
        D.widgets = widgetNodes.map(rectOf).filter(ok);

        /* 三窗槽位按当前视口现算：留开左侧桌面图标区、彼此留 50px 间隙，
         * 保证任何分辨率下「三窗并排」都不重叠、不出画。 */
        var gap = 50;
        var leftPad = Math.max(200, V.vw * 0.14);
        var avail = V.vw - leftPad - 30;
        var ww = Math.max(180, Math.min(340, (avail - 2 * gap) / 3));
        var total = ww * 3 + gap * 2;
        var x0 = leftPad + (avail - total) / 2;
        var wh = Math.max(150, Math.min(280, V.vh * 0.36));
        var y0 = Math.max(90, (V.vh - wh) / 2 - 60);
        D.windows = [0, 1, 2].map(function (i) {
            return { x: x0 + i * (ww + gap), y: y0, w: ww, h: wh };
        });
        return D;
    }
    var boundIcons = [];

    /* ---------- 舞台层：只放构建辅助元素（不是桌面替身） ---------- */
    function buildStage() {
        stage = document.createElement('div');
        stage.id = 'n26fb-stage';
        cam = document.createElement('div');
        cam.id = 'n26fb-cam';
        stage.appendChild(cam);

        sk.focus = document.createElement('div'); sk.focus.className = 'n26fb-focus';
        sk.lineH = document.createElement('div'); sk.lineH.className = 'n26fb-line h';
        sk.lineV = document.createElement('div'); sk.lineV.className = 'n26fb-line v';
        cam.appendChild(sk.focus); cam.appendChild(sk.lineH); cam.appendChild(sk.lineV);

        var titles = ['开始', '文件管理', '浏览器'];
        function reps(html, n) { return Array.apply(null, Array(n)).map(function () { return html; }).join(''); }
        var ITEM = '<i class="n26fb-sk-item"></i>';
        sk.windows = titles.map(function (title) {
            var w = document.createElement('div');
            w.className = 'n26fb-window window glass';
            w.innerHTML =
                '<div class="window-titlebar">' +
                '<div class="window-controls">' +
                '<span class="window-btn close"></span><span class="window-btn minimize"></span>' +
                '<span class="window-btn maximize"></span></div>' +
                '<div class="window-title">' + title + '</div></div>' +
                '<div class="window-content">' +
                '<div class="n26fb-side">' + reps(ITEM, 5) + '</div>' +
                '<div class="n26fb-main"><div class="n26fb-toolbar">' +
                reps(ITEM, 4) + '</div>' +
                '<div class="n26fb-grid">' + reps(ITEM, 12) + '</div>' +
                '</div></div>';
            cam.appendChild(w);
            return w;
        });

        sk.pointer = document.createElement('div'); sk.pointer.className = 'n26fb-pointer';
        stage.appendChild(sk.pointer);

        sk.covi = document.createElement('div'); sk.covi.className = 'n26fb-covi';
        sk.covi.innerHTML = '<div class="n26fb-covi-ic"><i class="fas fa-sparkles"></i></div>' +
            '<div class="n26fb-covi-t">你好，我是 AI 小方</div>' +
            '<div class="n26fb-covi-s">系统已就绪，开始探索吧</div>';
        stage.appendChild(sk.covi);

        hud = document.createElement('div'); hud.className = 'n26fb-hud';
        hud.innerHTML = '<span class="n26fb-tc" id="n26fbTc">00:00.00 · b0</span>' +
            '<span class="n26fb-sc" id="n26fbSc">镜头 1</span>' +
            '<button type="button" class="n26fb-snd" id="n26fbSnd">声音 开</button>' +
            '<button type="button" id="n26fbSkip">跳过</button>';
        stage.appendChild(hud);
        document.body.appendChild(stage);

        tcEl = document.getElementById('n26fbTc');
        scEl = document.getElementById('n26fbSc');
        sndEl = document.getElementById('n26fbSnd');
        /* 最后 append = 盖在最上层：开场 0–0.205s 的解锁淡入（交接文档 #3） */
        sk.veil = document.createElement('div'); sk.veil.className = 'n26fb-veil';
        stage.appendChild(sk.veil);

        document.getElementById('n26fbSkip').addEventListener('click', function (e) {
            e.stopPropagation(); skip();
        });
        sndEl.addEventListener('click', function (e) {
            e.stopPropagation(); toggleSound();
        });
    }

    /* ---------- 音频：唯一主时钟，失败静默降级 ---------- */
    function updateSnd() {
        if (!sndEl) return;
        var label = !soundOn ? '声音 关' : (soundBlocked ? '声音 待开启' : '声音 开');
        sndEl.textContent = label;
        sndEl.classList.toggle('off', !soundOn);
    }
    function alignAudio() {
        if (!bgm) return;
        try { bgm.currentTime = Math.max(0, (performance.now() - startPerf) / 1000); } catch (e) { }
    }
    function startAudio() {
        try {
            bgm = new Audio(AUDIO);
            bgm.preload = 'auto';
            bgm.volume = 0.85;
            bgm.muted = !soundOn;
            var pr = bgm.play();
            if (pr && pr.then) {
                pr.then(function () {
                    audioOk = true; soundBlocked = false;
                    if (!playing) { try { bgm.pause(); } catch (e) { } return; }
                    alignAudio();           // 起播延迟按已流逝时间对齐一次
                    updateSnd();
                }, function () {
                    audioOk = false; soundBlocked = true; updateSnd();
                });
            } else { audioOk = true; alignAudio(); }
        } catch (e) { audioOk = false; soundBlocked = true; updateSnd(); }
    }
    function toggleSound() {
        soundOn = !soundOn;
        if (bgm) bgm.muted = !soundOn;
        if (soundOn && soundBlocked) {           // 被自动播放策略拦截 → 借这次手势重试
            try {
                var pr = bgm.play();
                if (pr && pr.then) pr.then(function () {
                    audioOk = true; soundBlocked = false; alignAudio(); updateSnd();
                }, function () { updateSnd(); });
            } catch (e) { }
        }
        updateSnd();
    }
    function clock() {
        /* 音频一旦可用就只信它；否则用同一个起点的内部时钟，节拍表一字不改 */
        if (audioOk && bgm && !bgm.paused && !bgm.ended) return bgm.currentTime;
        return (performance.now() - startPerf) / 1000;
    }

    /* ---------- 每帧渲染：几何 → 真实节点 ---------- */
    function placeAbs(node, e) {
        if (!node) return;
        node.style.left = e.x.toFixed(1) + 'px';
        node.style.top = e.y.toFixed(1) + 'px';
        node.style.width = Math.max(0, e.w).toFixed(1) + 'px';
        node.style.height = Math.max(0, e.h).toFixed(1) + 'px';
        node.style.opacity = e.opacity.toFixed(3);
        node.style.visibility = e.opacity > 0.01 ? 'visible' : 'hidden';
    }
    function placeRel(node, e, base) {
        if (!node || !base) return;
        var dx = e.x - base.x, dy = e.y - base.y;
        var sx = base.w ? e.w / base.w : 1, sy = base.h ? e.h / base.h : 1;
        /* 用独立 transform 属性，不覆盖主壳的 transform: translateX(-50%) */
        node.style.translate = dx.toFixed(1) + 'px ' + dy.toFixed(1) + 'px';
        node.style.scale = sx.toFixed(4) + ' ' + sy.toFixed(4);
        node.style.opacity = e.opacity.toFixed(3);
        node.style.visibility = e.opacity > 0.01 ? 'visible' : 'hidden';
    }
    function render(st) {
        var map = {}, i;
        for (i = 0; i < st.elements.length; i++) map[st.elements[i].id] = st.elements[i];

        /* 相机推进只作用于构建区；顶栏/Dock 是固定 UI，不进相机层 */
        cam.style.transform = 'scale(' + st.camera.scale.toFixed(5) + ')';

        /* 解锁淡入：0 → 第 0 拍(PHASE=0.205s) 线性褪去，纯由 t 驱动。
         * 补齐交接文档 #3「开场只有壁纸、空场」，且不是 CSS duration。 */
        if (sk.veil) sk.veil.style.opacity = C.clamp(1 - st.t / C.PHASE, 0, 1).toFixed(3);

        /* 真实节点：几何以「相对原 rect 的位移」写入，父级位移不重复叠加 */
        for (i = 0; i < bound.length; i++) {
            var b = bound[i], e = map[b.id];
            if (e) placeRel(b.el, e, b.base);
        }
        /* Dock 子项：位置完全跟随父级 Dock，只写透明度与弹起 scale */
        for (i = 0; i < dockItemNodes.length; i++) {
            var a = st.dockItemAlpha[i] === undefined ? 1 : st.dockItemAlpha[i];
            dockItemNodes[i].style.opacity = a.toFixed(3);
            dockItemNodes[i].style.visibility = a > 0.01 ? 'visible' : 'hidden';
            dockItemNodes[i].style.scale = String((st.dockItemScale[i] || 1).toFixed(4));
        }
        for (i = 0; i < sepNodes.length; i++) {
            var se = map['sep-' + i];
            sepNodes[i].style.opacity = se ? se.opacity.toFixed(3) : '1';
        }
        /* 顶栏子项：逐个向下 18px 落位 */
        for (i = 0; i < tbItemNodes.length; i++) {
            var ta = st.topbarItemAlpha[i] === undefined ? 1 : st.topbarItemAlpha[i];
            var td = st.topbarItemDy[i] || 0;
            tbItemNodes[i].style.opacity = ta.toFixed(3);
            tbItemNodes[i].style.translate = '0 ' + td.toFixed(1) + 'px';
        }

        /* 舞台层：构建辅助 + 窗口骨架 */
        var ef = map['focus'], eh = map['guide-h'], ev = map['guide-v'];
        if (ef) placeAbs(sk.focus, ef);
        if (eh) placeAbs(sk.lineH, eh);
        if (ev) placeAbs(sk.lineV, ev);
        var ep = map['pointer']; if (ep) placeAbs(sk.pointer, ep);
        var ec = map['covi'];
        if (ec) { placeAbs(sk.covi, ec); sk.covi.style.scale = String((ec.scale || 1).toFixed(4)); }

        for (i = 0; i < sk.windows.length; i++) {
            var ew = map['window-' + i], w = sk.windows[i];
            if (!ew) continue;
            placeAbs(w, ew);
            w.style.setProperty('--n26fb-tbh', ew.titlebarH.toFixed(1) + 'px');
            w.style.setProperty('--n26fb-grid-r', ew.gridReveal.toFixed(3));
            /* 骨架项逐个落位：进度由同一状态机求出，绝不用 CSS 计时 */
            var its = w.querySelectorAll('.n26fb-sk-item');
            for (var j = 0; j < its.length; j++) {
                /* 按总数归一化错峰：最后一项也能在 itemsReveal=1 时到位，
                 * 不会出现「后面几项永远不显形」。进度仍由同一状态机给出。 */
                var v = C.clamp((ew.itemsReveal - (j / its.length) * 0.6) / 0.4, 0, 1);
                its[j].style.opacity = v.toFixed(3);
                its[j].style.translate = '0 ' + ((1 - v) * 9).toFixed(1) + 'px';
            }
        }

        /* HUD 节流到 100ms，避免每帧改文本 */
        if (st.t - hudLast >= 0.1 || st.t < hudLast) {
            hudLast = st.t;
            if (tcEl) tcEl.textContent = fmtT(st.t) + ' · b' + Math.floor(st.beat);
            if (scEl) scEl.textContent = '镜头 ' + st.scene + '/10';
        }
    }
    function fmtT(t) {
        var m = Math.floor(t / 60), s = t - m * 60;
        return String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0');
    }

    function tick() {
        if (!playing) return;
        raf = requestAnimationFrame(tick);
        var t = clock();
        var st = C.stateAt(t, M);
        render(st);
        if (t >= C.TOTAL) finish();
    }

    /* ---------- 收尾：一帧到终态，无二次动画、无残留 ---------- */
    function cleanup() {
        playing = false;
        if (armTimer) { clearTimeout(armTimer); armTimer = 0; }
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        if (bgm) { try { bgm.pause(); } catch (e) { } }
        bgm = null; audioOk = false;

        var i;
        for (i = 0; i < bound.length; i++) rmProps(bound[i].el);
        for (i = 0; i < dockItemNodes.length; i++) rmProps(dockItemNodes[i]);
        for (i = 0; i < sepNodes.length; i++) rmProps(sepNodes[i]);
        for (i = 0; i < tbItemNodes.length; i++) rmProps(tbItemNodes[i]);
        for (i = 0; i < widgetNodes.length; i++) rmProps(widgetNodes[i]);
        if (stage) { try { stage.remove(); } catch (e) { } }
        stage = null; cam = null; hud = null; sk = {};
        bound = []; M = null; hudLast = -1;

        /* 不把 .entering / .dock-enter / .finder-enter 留在节点上；
         * Dock 的 transform: translateX(-50%) 全程没被碰过，保持原样。 */
        ['entering', 'dock-enter', 'finder-enter'].forEach(function (cls, k) {
            var n = [document.getElementById('desktop'), document.getElementById('dock'),
                document.getElementById('finder-bar')][k];
            if (n) n.classList.remove(cls);
        });
        document.body.classList.remove('n26fb-active', 'n26fb-armed', 'n26-busy');
        requestAnimationFrame(function () { document.body.classList.remove('n26-busy'); });
        unbindSkip();
    }
    function finish() { mark(); cleanup(); }
    function skip() { if (!playing) return; mark(); cleanup(); }

    /* ★ 2026-11-07 事故修复：n26fb-armed 带 opacity:0 !important，
     * 一旦动画因任何原因没启动成功，Dock 就会「存在、能点、却完全不渲染」。
     * 以前 armed 只在 start() 里移除，启动失败就永久残留 —— 用户实测踩到。
     * release() 可在任何时刻无条件把可见性还回去；超时 / 重试耗尽自动调用。 */
    function release() {
        if (armTimer) { clearTimeout(armTimer); armTimer = 0; }
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = 0; }
        if (mo) { try { mo.disconnect(); } catch (e) { } mo = null; }
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (playing) { try { cleanup(); } catch (e) { } }
        playing = false;
        document.body.classList.remove('n26fb-armed', 'n26fb-pending', 'n26fb-active', 'n26-busy');
        var ids = ['dock', 'finder-bar'];
        for (var i = 0; i < ids.length; i++) {
            var n = document.getElementById(ids[i]);
            if (n) { n.style.removeProperty('opacity'); n.style.removeProperty('visibility'); }
        }
        try { unbindSkip(); } catch (e) { }
    }

    /* ---------- 跳过交互：点击任意处 / Esc / 失焦 ---------- */
    function onKey(e) { if (e.key === 'Escape') skip(); }
    function onClick(e) {
        if (e.target && e.target.closest && e.target.closest('.n26fb-hud')) return;
        skip();
    }
    function onBlur() { skip(); }
    function bindSkip() {
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('blur', onBlur);
    }
    function unbindSkip() {
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('blur', onBlur);
    }

    /* ---------- reduced-motion：0 个动画对象，只做 300ms 交叉淡入 ---------- */
    function startReduced() {
        mark();
        if (armTimer) { clearTimeout(armTimer); armTimer = 0; }
        document.body.classList.remove('n26fb-armed', 'n26fb-pending');
        var veil = document.createElement('div');
        veil.id = 'n26fb-reduce-veil';
        document.body.appendChild(veil);
        requestAnimationFrame(function () { veil.classList.add('out'); });
        setTimeout(function () {
            try { veil.remove(); } catch (e) { }
            document.body.classList.remove('n26-busy');
        }, 340);
    }

    /* ---------- 启动 ---------- */
    function start() {
        if (playing || done()) return;
        if (reduce) { startReduced(); return; }
        playing = true;
        if (armTimer) { clearTimeout(armTimer); armTimer = 0; }
        startPerf = performance.now();
        M = collect();

        /* 先建舞台并绑定，再同一同步块里写第 0 帧，最后才摘 armed：
         * 这样「预隐藏 → 构建第 0 帧」之间没有一帧完整桌面闪现。 */
        buildStage();
        bound = [];
        if (dockNode) bound.push({ id: 'dockPlate', el: dockNode, base: M.dock });
        if (tlNode) bound.push({ id: 'topbar-left', el: tlNode, base: M.topbar.left });
        if (trNode) bound.push({ id: 'topbar-right', el: trNode, base: M.topbar.right });
        for (var i = 0; i < boundIcons.length; i++) {
            bound.push({ id: 'icon-' + i, el: boundIcons[i], base: M.icons[i] });
        }
        for (i = 0; i < widgetNodes.length; i++) {
            bound.push({ id: 'widget-' + i, el: widgetNodes[i], base: M.widgets[i] || { x: 0, y: 0, w: 1, h: 1 } });
        }
        document.body.classList.remove('n26fb-armed', 'n26fb-pending');
        document.body.classList.add('n26fb-active', 'n26-busy');
        render(C.stateAt(0, M));          // 同步定格第 0 帧
        startAudio();
        bindSkip();
        raf = requestAnimationFrame(tick);
    }

    /* 自启动：不碰 enterDesktop()，监听桌面首次可见；模块晚于 enterDesktop
     * 执行时 maybeStart() 立即补一次，不会漏播。 */
    var retries = 0, retryTimer = 0, armTimer = 0;
    function shouldPlay() { return !done(); }
    function maybeStart() {
        if (playing) return;
        /* ★ 2026-11-07 Dock 消失事故：预隐藏是在脚本执行时按 __guest__ 作用域
         * 判断的，登录恢复后 getUserLS 才读得到 n26FirstBootDone。此时若直接
         * return，body 上的 n26fb-armed / n26fb-pending 没人摘，
         * #dock 就被 opacity:0 !important 永久压住（存在、能点、但不渲染）。
         * 已看过 → 立即 release()，把可见性还回去。 */
        if (done()) { release(); return; }
        var d = document.getElementById('desktop');
        var lock = document.getElementById('lock-screen');
        var inst = document.getElementById('install-screen');
        /* 不能只看 inline style：#desktop 的 display 常由 CSS 控制，
         * inline 为空会被误判成「桌面还没可见」，重试 6s 后放弃 → armed 永久残留。 */
        var dcs = d ? getComputedStyle(d) : null;
        var deskVisible = !!dcs && dcs.display !== 'none' && dcs.visibility !== 'hidden';
        var lockGone = !lock || getComputedStyle(lock).display === 'none';
        /* OOBE 收尾有两条路径：display:none，或先 opacity 淡出再置 none ——
         * 两种都算「安装界面已退场」，别让动画卡在淡出过渡里。 */
        var instGone = !inst || getComputedStyle(inst).display === 'none' ||
            getComputedStyle(inst).opacity === '0';
        if (!(deskVisible && lockGone && instGone)) {
            /* 有限重试（6s）：覆盖 3 秒开机窗口、淡出过渡等异步路径；
             * MutationObserver 仍在主监听，重试只是补充，绝不无限轮询。 */
            if (retryTimer) return;
            /* 6s 还没等到桌面可见 → 撤销预隐藏，绝不把 Dock 锁成透明 */
            if (retries > 60) { release(); return; }
            retries++;
            retryTimer = setTimeout(function () { retryTimer = 0; maybeStart(); }, 100);
            return;
        }
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = 0; }
        if (mo) { mo.disconnect(); mo = null; }
        requestAnimationFrame(function () { requestAnimationFrame(start); });
    }

    /* armed 只在「确实准备播放」时挂，并附 n26fb-pending 守卫：
     * CSS 的 opacity:0 只在两个类同时存在时生效；7s 后 pending 必被摘掉，
     * 即使 start() 彻底没跑，Dock 也一定自动恢复可见（双保险）。 */
    if (shouldPlay()) {
        document.body.classList.add('n26fb-armed', 'n26fb-pending');
        armTimer = setTimeout(function () {
            armTimer = 0;
            if (!playing) release();   // done 与否都算：预隐藏绝不能残留
        }, 7000);
    }
    try {
        mo = new MutationObserver(maybeStart);
        ['desktop', 'install-screen', 'lock-screen'].forEach(function (id) {
            var n = document.getElementById(id);
            if (n) mo.observe(n, { attributes: true, attributeFilter: ['style', 'class'] });
        });
    } catch (e) { }
    maybeStart();
    /* MutationObserver 只看「变化」；enterDesktop() 若早于本模块执行完，
     * 这里在下一帧补一次同步检查，避免动画永远不启动。 */
    requestAnimationFrame(function () {
        if (!playing) maybeStart();   // done 时 maybeStart 内部会 release()
    });

    window.N26FB = {
        shouldPlay: shouldPlay,
        play: function () { if (shouldPlay()) start(); },
        skip: skip,
        release: release,
        replay: function () { if (playing) skip(); clearMark(); start(); },
        isPlaying: function () { return playing; },
        /* 供验收/调试：不进节拍状态机，只返回当前帧状态 */
        _stateAt: function (t) { return C.stateAt(t, M || C.defaultMetrics()); }
    };
})();
