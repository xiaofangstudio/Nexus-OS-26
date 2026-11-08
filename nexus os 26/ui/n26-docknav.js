/* ============================================================
   N26 DockNav — 液态玻璃 Dock 导航（应用商店同款圆 dock）
   v2.9.65 · 非破坏式增强：保留原有 onclick / addEventListener，
   只叠加「胶囊 → 液态玻璃水滴滑动 → 弹簧回弹」指示器与
   长按拖动（松手吸附最近 tab）。
   用法：容器加 data-n26dock="v"|"h"；本文件自动扫描注册表增强。
   ============================================================ */
(function () {
    'use strict';
    if (window.N26DockNav) return;

    var REDUCED = false;
    try { REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }

    /* 注册表：[容器选择器, 项选择器, active类名, 内容选择器(轻推淡入,可null)] */
    var REGISTRY = [
        ['.as-rail[data-n26dock]', '.as-rail-item', 'active', '.as-main'],
        ['.fm-sidebar[data-n26dock]', '.fm-sidebar-item[onclick]', 'active', '.fm-main'],
        ['.settings-sidebar[data-n26dock]', '.settings-item', 'active', '.settings-panel'],
        ['.ag-side-nav[data-n26dock]', '.ag-side-item', 'active', null],
        ['#side[data-n26dock]', '.nav-item', 'on', '#main'],
        ['#boardChips[data-n26dock]', '.chip', 'on', '#listWrap'],
        ['.bili-tabs[data-n26dock]', '.bili-tab', 'active', '.bili-scroll'],
        ['.n26news-tabs[data-n26dock]', '.n26news-tab', 'on', null],
        ['.album-tabs[data-n26dock]', '.album-tab', 'active', null],
        ['.n26st-tabs[data-n26dock]', '.n26st-tab', 'on', null],
        ['.dfd-tabs[data-n26dock]', '.dfd-tab', 'on', '.dfd-body'],
        ['.n26acct-tabs[data-n26dock]', '.n26acct-tab', 'active', null],
        ['.nex-modal-tabs[data-n26dock]', '.nex-modal-tab', 'active', null],
        ['.tabs[data-n26dock]', '.tab', 'active', null],
        ['#chips[data-n26dock]', '.chip', 'active', null]
    ];

    /* ★ P3 距离-时长：1 格 160ms / 2 格 290ms / 3 格 400ms（用户钦定），
       再远按 STEPN 继续收；位移用标准 ease-in-out（先慢-中快-后慢）。 */
    var STEP1 = 160, STEP2 = 290, STEP3 = 400, STEPN = 96;
    var TRAVEL_EASE_HALF = true; // 位移用标准 ease-in-out（先慢-中快-后慢）
    var FADE_MS = 140;          // 到达后玻璃淡出/收小
    var FADE_DELAY = 250;       // 落位后先让「回弹」完整播完再淡出
    /* 水滴形变：形变上限 1.17、速度 420px/s 吃满；弹簧按参照物 Liquid Glass Web 的
       e^(−5.5t)·cos(10t)（≈500ms 一个明显过冲后收敛，不会来回抖） */
    var DEF_ON = !REDUCED;
    var DEF_MAX = 0.17, DEF_VMAX = 420;
    var SPRING_LAM = 5.5, SPRING_OMG = 10;
    /* ★ P3 玻璃不再凸出 Dock：始终贴在那条轨道上、停在被选中的那一格里，
       上下左右都不越出宿主外框（用户明确否掉「越出侧栏轮廓」的旧设计）。 */
    var OUT = 0;
    var HOLD_MS = 240;          // 长按多久出玻璃（只认「当前选中格」）
    var HOLD_MOVE = 8;          // 按住后移动超过 8px 视为拖拽 → 取消出玻璃
    var GLASS_SEQ = 0;          // 浮层唯一编号（供调试/回归脚本定位）

    function itemsOf(cont, cfg) {
        var list = cont.querySelectorAll(cfg.item);
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            // 只收直接属于本 dock 的项（子 dock 不收）
            var host = el.closest ? el.closest('[data-n26dock]') : null;
            if (host === cont) out.push(el);
        }
        return out;
    }

    function enhance(cont, cfg) {
        if (cont.__n26dng) return;
        cfg = cfg || {};
        cfg.on = cfg.on || 'active';
        var items = itemsOf(cont, cfg);
        if (!items.length) return;
        cont.__n26dng = true;
        cont.classList.add('n26-docknav-host');
        if (getComputedStyle(cont).position === 'static') cont.style.position = 'relative';

        var glass = document.createElement('div');
        glass.className = 'n26-dng';
        glass.setAttribute('aria-hidden', 'true');
        /* v2.9.82：玻璃是脱离轨道的浮层（挂 body + position:fixed），
           否则侧栏的 overflow:hidden / 内边距会把四周外扩整个切掉。 */
        var gid = 'n26dng-' + (++GLASS_SEQ);
        glass.setAttribute('data-n26dng-host', gid);
        cont.setAttribute('data-n26dng-id', gid);
        (document.body || document.documentElement).appendChild(glass);

        var axis = 'v';
        var cur = null;            // 当前激活项
        var traveling = false;     // 玻璃正在匀速滑行 / 淡出
        var dragging = false;      // 指针按住拖动中
        var suppress = false;      // 拖动结束后压掉一次原生幽灵 click
        var skipActivate = false;  // 本次 click 的视觉已由指针流程处理
        var gw = 0, gh = 0;        // 玻璃当前尺寸
        var lastRect = null;       // 玻璃最后一次落点（供淡出与拖动落位复用）
        var travelRaf = 0;         // 位移 rAF 句柄
        var settleToken = 0;       // 动作序号：新的动作会作废旧的形变/弹簧帧

        /* v2.9.82：浮层坐标一律用视口 rect（玻璃挂 body），不再叠加 scrollLeft/Top */
        function rectIn(el) {
            var r = el.getBoundingClientRect();
            return {
                x: r.left, y: r.top,
                w: r.width, h: r.height,
                cx: r.left + r.width / 2,
                cy: r.top + r.height / 2
            };
        }

        function detectAxis() {
            /* v2.9.81：优先吃容器声明（竖排只算 y、横排只算 x），没有再按几何推 */
            var d = cont.getAttribute('data-n26dock');
            if (d === 'v' || d === 'h') { axis = d; return; }
            var it = itemsOf(cont, cfg);
            if (it.length >= 2) {
                var a = rectIn(it[0]), b = rectIn(it[1]);
                axis = Math.abs(b.y - a.y) >= Math.abs(b.x - a.x) ? 'v' : 'h';
            }
        }

        function closestItem(t) {
            if (!t || !t.closest) return null;
            var el = t.closest(cfg.item);
            if (!el || !cont.contains(el)) return null;
            return itemsOf(cont, cfg).indexOf(el) >= 0 ? el : null;
        }

        function sizeTo(w, h) { gw = w; gh = h; glass.style.width = w + 'px'; glass.style.height = h + 'px'; lgSchedule(); }

        /* ★ v3.5：侧栏指示器是第三个合法折射面 —— 接主壳同一套 feDisplacementMap 引擎。
           尺寸按 8×4 量化（贴图按尺寸缓存，几个侧栏共用少数几张图），
           拖动中复用旧图拉伸，落位后 220ms 防抖按新尺寸重建 → 拖动期间不重建、静止零开销。 */
        var lgT = null;
        function lgSync() {
            if (!glass || typeof window.n26LgAttach !== 'function') return;
            if (!gw || !gh) return;
            var q = { w: Math.max(48, Math.round(gw / 8) * 8), h: Math.max(40, Math.round(gh / 4) * 4) };
            var id = 'n26Lg' + gid.replace(/[^0-9]/g, '');
            /* ★ P3：SDF 半宽 0.30 / 半高 0.20（参照 roundedRectSDF(ix,iy,0.3,0.2,0.6)），
               不是 0.5/0.5 的退化场（那会得到一个恒定位移、折射消失）。 */
            var opts = { hw: 0.30, hh: 0.20, thresh: -0.10 };
            try {
                if (window.n26LgResize) window.n26LgResize(glass, id, opts, q);
                else window.n26LgAttach(glass, id, opts, q);
            } catch (e) { }
        }
        function lgSchedule() {
            if (lgT) return;
            lgT = setTimeout(function () { lgT = null; lgSync(); }, 220);
        }

        function placeAt(x, y) { glass.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }

        /* v2.9.91 → P3：玻璃 = 选中格本身，四边钳进 Dock 外框（不再外扩 OUT）。 */
        function floatRect(r) {
            var cr = cont.getBoundingClientRect();
            if (axis === 'v') {
                var h = Math.min(r.h, cr.height), w = Math.min(r.w, cr.width);
                var y = clampNum(r.y, cr.top, cr.top + cr.height - h);
                var x = clampNum(r.x, cr.left, cr.left + cr.width - w);
                return { x: x, y: y, w: w, h: h, cx: x + w / 2, cy: y + h / 2 };
            }
            var w2 = Math.min(r.w, cr.width), h2 = Math.min(r.h, cr.height);
            var x2 = clampNum(r.x, cr.left, cr.left + cr.width - w2);
            var y2 = clampNum(r.y, cr.top, cr.top + cr.height - h2);
            return { x: x2, y: y2, w: w2, h: h2, cx: x2 + w2 / 2, cy: y2 + h2 / 2 };
        }
        function clampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

        /* ── 水滴形变：速度 → 形变量；沿运动方向拉长、垂直方向压扁 ──
           k ∈ [0, .17]；体积近似守恒，垂直方向按 k*0.45 压扁。 */
        function speedK(pxPerMs) {
            if (!DEF_ON) return 0;
            var v = pxPerMs * 1000;                  // px/s
            if (v <= 0) return 0;
            return Math.min(DEF_MAX, DEF_MAX * v / DEF_VMAX);
        }
        function defPair(k, ax) {
            var along = 1 + k, across = 1 - k * 0.45;
            return ax === 'v' ? { x: across, y: along } : { x: along, y: across };
        }
        function setGlassScale(k, ax) {
            if (!glass || !DEF_ON) return;
            var s = defPair(k, ax);
            glass.style.setProperty('scale', s.x + ' ' + s.y);
        }
        function clearGlassScale() {
            if (!glass) return;
            try { glass.style.removeProperty('scale'); } catch (e) { }
        }
        /* ★ P3 水滴回弹（不是钱学森弹道）：位移幅度 d0 封顶 0.055，
           垂直走向按 k*0.45 压扁、沿走向按 (1+k) 拉长 —— 肉眼是「鼓回来」。
           w(t) = 1 − e^(−5t)·cos(9t)：从 0 起、单峰后快速收敛，不来回飞。 */
        function settleGlass(d0, ax) {
            if (!DEF_ON || !d0) { clearGlassScale(); return; }
            var amp = Math.min(Math.abs(d0), 0.055) * (d0 < 0 ? -1 : 1);
            var my = settleToken, t0 = 0;
            function step(now) {
                if (my !== settleToken) return;
                if (!t0) t0 = now;
                var t = (now - t0) / 1000;
                var d = -amp * (1 - Math.exp(-5 * t) * Math.cos(9 * t));
                if ((t > 0.34 && Math.abs(d) < 0.0025) || t > 0.62) { clearGlassScale(); return; }
                setGlassScale(d, ax);
                requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        }
        /* 静止态：玻璃只对位、不可见；选中项由宿自带的灰色胶囊承担 */
        function restTo(item) {
            if (!item) { glass.style.opacity = '0'; cur = null; return; }
            detectAxis();
            var r = floatRect(rectIn(item));
            sizeTo(r.w, r.h);
            placeAt(r.x, r.y);
            glass.style.opacity = '0';
        }

        function hideCaps(on) {
            cont.classList.toggle('n26-docknav-hold', !!on);
        }

        /* 相邻两项的中心间距（真实布局），用于把「一格 = 200ms」换算成实际时长 */
        function stepLen() {
            var it = itemsOf(cont, cfg);
            if (it.length < 2) return 1;
            var a = rectIn(it[0]), b = rectIn(it[1]);
            var d = axis === 'v' ? Math.abs(b.cy - a.cy) : Math.abs(b.cx - a.cx);
            return d || 1;
        }

        function ctr(r) {
            return {
                x: (typeof r.cx === 'number' ? r.cx : r.x + r.w / 2),
                y: (typeof r.cy === 'number' ? r.cy : r.y + r.h / 2)
            };
        }

        /* 距离 → 时长：1 格 160 / 2 格 290 / 3 格 400，之后按 STEPN 递减边际。 */
        function travelMs(fromR, toR) {
            var a = ctr(fromR), b = ctr(toR);
            var d = axis === 'v' ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
            var cells = d / stepLen();
            var ms;
            if (cells <= 1) ms = STEP1 * Math.max(0.35, cells);
            else if (cells <= 2) ms = STEP1 + (cells - 1) * (STEP2 - STEP1);
            else if (cells <= 3) ms = STEP2 + (cells - 2) * (STEP3 - STEP2);
            else ms = STEP3 + (cells - 3) * STEPN;
            return Math.max(70, Math.round(ms));
        }

        /* 到达后淡出 + 收小，然后灰胶囊在目标项出现 */
        function fadeGlass(done, delay) {
            var r = lastRect || { x: 0, y: 0 };
            glass.classList.remove('glow');
            var run = function () {
                var anim = glass.animate([
                    { opacity: 1, transform: 'translate(' + r.x + 'px,' + r.y + 'px) scale(1,1)' },
                    { opacity: 0, transform: 'translate(' + r.x + 'px,' + r.y + 'px) scale(.86,.86)' }
                ], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' });
                anim.onfinish = function () {
                    anim.cancel();
                    glass.style.opacity = '0';
                    glass.classList.remove('travel');
                    glass.style.transform = 'translate(' + r.x + 'px,' + r.y + 'px)';
                    settleToken++;          // 淡出结束：作废还在跑的弹簧帧，彻底归零
                    clearGlassScale();
                    try { glass.style.transformOrigin = ''; } catch (e) { }
                    traveling = false;
                    hideCaps(false);
                    if (done) done();
                };
            };
            if (delay) setTimeout(run, delay); else run();
        }

        /* 滑到目标：时长按 160/290/400 曲线折算；位移用 ease-in-out 帧循环，
           形变量由「这一帧的真实速度」驱动（慢速几乎看不出，快速明显拉长）。
           落位后立刻起弹簧回弹，140ms 之后再缩淡。 */
        function travelTo(fromR, toR, done, size) {
            traveling = true;
            detectAxis();
            var toB = floatRect(toR);
            if (REDUCED || typeof requestAnimationFrame !== 'function') {
                if (size) sizeTo(size.w, size.h); else sizeTo(toB.w, toB.h);
                placeAt(toB.x, toB.y);
                glass.style.opacity = '0';
                glass.classList.remove('travel', 'glow');
                clearGlassScale();
                lastRect = { x: toB.x, y: toB.y, w: toB.w, h: toB.h, cx: toB.cx || toB.x + toB.w / 2, cy: toB.cy || toB.y + toB.h / 2 };
                traveling = false;
                hideCaps(false);
                if (done) done();
                return;
            }
            var my = ++settleToken;
            if (travelRaf) { cancelAnimationFrame(travelRaf); travelRaf = 0; }
            clearGlassScale();
            if (size) sizeTo(size.w, size.h); else sizeTo(toB.w, toB.h);
            glass.style.opacity = '1';
            glass.classList.add('travel');
            glass.classList.remove('glow');
            var ax = axis;
            var dur = travelMs(fromR, toR);
            var fx = fromR.x, fy = fromR.y, tx = toB.x, ty = toB.y;
            /* ★ v2.9.91 水滴「前面先到、后面慢半拍跟上」：缩放原点钉在拖尾边 ——
               沿走向拉长时前沿先探出去，到位回弹时拖尾侧再跟上。
               每次 travel 前按运动方向重设，淡出结束后复原为中心。 */
            var fwd = (ax === 'v' ? ty - fy : tx - fx) >= 0;
            glass.style.transformOrigin = ax === 'v'
                ? (fwd ? '50% 0%' : '50% 100%')
                : (fwd ? '0% 50%' : '100% 50%');
            var t0 = 0, lx = fx, ly = fy, lt = 0, kEnd = 0, kPeak = 0;
            /* 标准 ease-in-out：先慢、中间快、后慢 */
            function ease(p) {
                if (p <= 0) return 0;
                if (p >= 1) return 1;
                return p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            }
            function frame(now) {
                if (my !== settleToken) return;
                if (!t0) { t0 = now; lt = now; }
                var p = Math.min(1, (now - t0) / dur);
                var e = ease(p);
                var x = fx + (tx - fx) * e;
                var y = fy + (ty - fy) * e;
                placeAt(x, y);
                var dt = Math.max(1, now - lt);
                var v = (ax === 'v' ? Math.abs(y - ly) : Math.abs(x - lx)) / dt;
                kEnd = speedK(v);
                if (kEnd > kPeak) kPeak = kEnd;
                setGlassScale(kEnd, ax);
                lx = x; ly = y; lt = now;
                if (p < 1) { travelRaf = requestAnimationFrame(frame); return; }
                travelRaf = 0;
                placeAt(tx, ty);
                lastRect = { x: tx, y: ty, w: toB.w, h: toB.h, cx: toB.x + toB.w / 2, cy: toB.y + toB.h / 2 };
                /* 到达瞬间速度已被 ease-in-out 收到 0，若用「最后一帧速度」回弹会看不见；
                   用水滴在整段位移里达到的形变峰值起弹簧，才有明显的过冲回正。 */
                settleGlass(kPeak || kEnd, ax);
                fadeGlass(done, FADE_DELAY);
            }
            travelRaf = requestAnimationFrame(frame);
        }

        function findActive() {
            var it = itemsOf(cont, cfg);
            for (var i = 0; i < it.length; i++) if (it[i].classList.contains(cfg.on)) return it[i];
            return null;
        }

        /* 点击（capture：先于应用自己的 handler，只叠视觉不抢逻辑）。
           指针按住流程已在 pointerup 处理过视觉，这里只负责键盘/程序化点击。 */
        cont.addEventListener('click', function (e) {
            if (suppress) { suppress = false; e.preventDefault(); e.stopPropagation(); return; }
            if (skipActivate) { skipActivate = false; return; }
            var item = closestItem(e.target);
            if (!item) return;
            var prev = findActive();
            if (!prev || prev === item) return;
            detectAxis();
            var bp = floatRect(rectIn(prev));
            hideCaps(true);
            sizeTo(bp.w, bp.h);
            placeAt(bp.x, bp.y);
            glass.style.opacity = '1';
            glass.classList.add('travel');
            travelTo(bp, rectIn(item), function () { cur = item; restTo(item); }, bp);
        }, true);

        /* ★ P3 长按语义（用户逐条对齐）：
           1) 只有长按「当前已选中那一格」才出玻璃 —— 其它格长按一律不出；
           2) 玻璃一旦出现就钉在该选中格、贴着那条轨道，不跟指针移动，也不越出 Dock；
           3) 松手原地水滴回弹（沿运动轴压扁）后淡出，不吸附、不切项；
           4) 玻璃出现前移动 > 8px 视为普通点击/误触，直接取消。 */
        cont.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || dragging) return;
            var item = closestItem(e.target);
            if (!item) return;
            /* 闸门：必须正好按在「当前选中格」上 */
            if (item !== findActive()) return;
            detectAxis();
            var fr = floatRect(rectIn(item));
            var sx = e.clientX, sy = e.clientY;
            var cancelled = false, shown = false;
            var holdT = setTimeout(function () {
                holdT = null;
                if (cancelled || dragging) return;
                shown = true;
                dragging = true;
                hideCaps(true);
                cont.classList.add('n26-docknav-drag');
                sizeTo(fr.w, fr.h);
                placeAt(fr.x, fr.y);
                glass.style.opacity = '1';
                glass.classList.add('travel', 'glow');
                lastRect = { x: fr.x, y: fr.y, w: fr.w, h: fr.h, cx: fr.cx, cy: fr.cy };
                lgSync();
                settleGlass(-0.045, axis);   // 出现瞬间「鼓一下」，不位移
            }, HOLD_MS);

            function onMove(ev) {
                if (!shown && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > HOLD_MOVE) {
                    cancelled = true;
                    if (holdT) { clearTimeout(holdT); holdT = null; }
                    release();
                }
            }
            function release() {
                window.removeEventListener('pointermove', onMove, true);
                window.removeEventListener('pointerup', up, true);
                window.removeEventListener('pointercancel', up, true);
                if (holdT) { clearTimeout(holdT); holdT = null; }
                if (!shown) return;
                shown = false;
                dragging = false;
                cont.classList.remove('n26-docknav-drag');
                settleGlass(-0.03, axis);
                fadeGlass(function () { cur = item; restTo(item); });
            }
            function up() { release(); }

            window.addEventListener('pointermove', onMove, true);
            window.addEventListener('pointerup', up, true);
            window.addEventListener('pointercancel', up, true);
        }, true);

        /* 滚动 / 尺寸变化时对位（玻璃静止不可见，只更新几何） */
        cont.addEventListener('scroll', function () {
            if (!traveling && !dragging) restTo(cur || findActive());
        }, { passive: true });
        window.addEventListener('resize', function () {
            if (!traveling && !dragging) restTo(cur || findActive());
        });

        /* 应用重渲染 / 自行切换 active 时对齐 */
        var moT = null;
        var mo = new MutationObserver(function () {
            if (moT) return;
            moT = setTimeout(function () {
                moT = null;
                if (traveling || dragging) return;
                var a = findActive();
                if (a && a !== cur) { cur = a; restTo(a); }
                else if (cur && !cont.contains(cur)) { cur = findActive(); restTo(cur); }
                else if (!cur) { cur = findActive(); restTo(cur); }
            }, 90);
        });
        mo.observe(cont, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

        /* 初次对位（等一拍布局），静止态玻璃不可见 */
        cur = findActive();
        requestAnimationFrame(function () { restTo(cur); });
        setTimeout(function () { if (!traveling && !dragging) restTo(cur || findActive()); }, 350);
        setTimeout(function () { if (!traveling && !dragging) restTo(cur || findActive()); }, 900);
    }

    function auto() {
        if (!document.body) return;
        for (var r = 0; r < REGISTRY.length; r++) {
            var conf = REGISTRY[r];
            var els = document.querySelectorAll(conf[0]);
            for (var i = 0; i < els.length; i++) {
                try { enhance(els[i], { item: conf[1], on: conf[2], content: conf[3] || null }); } catch (e) { }
            }
        }
    }

    var moT = null;
    var bodyMO = null;
    function boot() {
        auto();
        try {
            bodyMO = new MutationObserver(function () {
                if (moT) return;
                moT = setTimeout(function () { moT = null; auto(); }, 140);
            });
            bodyMO.observe(document.body, { childList: true, subtree: true });
        } catch (e) { }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    /* v2.9.81 超椭圆兜底：不管 CSS 选择器怎么打架、谁后加载，Dock 渲染完成后
       直接对每个图标节点写内联裁切（品牌 N 豁免——它的轮廓来自透明 PNG）。
       内联 + important 能压过任何普通规则，避免再次退回普通圆角。 */
    function applyDockSquircle() {
        var dock = document.getElementById('dock');
        if (!dock) return;
        var nodes = dock.querySelectorAll('.dock-item img, .dock-item .dock-icon-wrap');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            /* 品牌 N 的底板无背景，裁切无意义；它里面的图形仍按超椭圆裁 */
            if (el.classList.contains('dock-icon-wrap') && el.closest('.dock-plate-n')) continue;
            el.style.setProperty('-webkit-clip-path', 'url(#n26Squircle)', 'important');
            el.style.setProperty('clip-path', 'url(#n26Squircle)', 'important');
            el.style.setProperty('border-radius', '0px', 'important');
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyDockSquircle);
    else applyDockSquircle();
    window.addEventListener('load', applyDockSquircle);
    [200, 600, 1500, 3000].forEach(function (t) { setTimeout(applyDockSquircle, t); });
    try {
        var sqMO = new MutationObserver(function () { applyDockSquircle(); });
        sqMO.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { }

    /* ★ v3.5：玻璃按钮 / 开关的点击形变 —— 与 Dock、侧栏指示器同一套水滴物理。
       按下 90ms 内长到 1.05 / 压到 0.93（垂直按 k*0.45 压扁），松手用
       e^(−5.5t)·cos(10t) 回弹（一个过冲后收敛）。全程单 rAF，落位即取消，
       静止时不跑任何循环；减少动效模式整体不启用。 */
    (function () {
        if (REDUCED) return;
        var pressed = null, raf = 0;
        function paintBtn(el, d) {
            el._n26pd = d;
            el.style.scale = (1 + d).toFixed(4) + ' ' + (1 - d * 0.45).toFixed(4);
        }
        function end(el) {
            if (raf) { cancelAnimationFrame(raf); raf = 0; }
            el.style.scale = '';
            el._n26pd = null;
            el.classList.remove('n26-lg-live');
        }
        function down(el) {
            if (raf) { cancelAnimationFrame(raf); raf = 0; }
            var t0 = performance.now(), d0 = 0.05;
            el.classList.add('n26-lg-live');
            function f(now) {
                var p = Math.min(1, (now - t0) / 90);
                paintBtn(el, d0 * (1 - Math.pow(1 - p, 3)));
                if (p >= 1) { raf = 0; return; }
                raf = requestAnimationFrame(f);
            }
            raf = requestAnimationFrame(f);
        }
        function spring(el) {
            if (raf) { cancelAnimationFrame(raf); raf = 0; }
            var t0 = performance.now();
            var d0 = (typeof el._n26pd === 'number') ? el._n26pd : 0.05;
            el.classList.add('n26-lg-live');
            function f(now) {
                var t = (now - t0) / 1000;
                var d = d0 * Math.exp(-SPRING_LAM * t) * Math.cos(SPRING_OMG * t);
                paintBtn(el, d);
                if ((t > 0.50 && Math.abs(d) < 0.0025) || t > 1.2) { end(el); raf = 0; return; }
                raf = requestAnimationFrame(f);
            }
            raf = requestAnimationFrame(f);
        }
        document.addEventListener('pointerdown', function (e) {
            var el = e.target && e.target.closest ? e.target.closest('.n26-lg-ctrl.n26-liquid-on') : null;
            if (el) { pressed = el; down(el); }
        }, true);
        function release() {
            if (!pressed) return;
            var el = pressed;
            pressed = null;
            spring(el);
        }
        window.addEventListener('pointerup', release, true);
        window.addEventListener('pointercancel', release, true);
        window.addEventListener('blur', release, true);
    })();

    /* 手动增强入口（注册表之外的容器可用） */
    window.N26DockNav = {
        enhance: function (el, cfg) { if (el) enhance(el, cfg); },
        auto: auto,
        squircle: applyDockSquircle
    };
})();
