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

    /* ★ v2.9.90 距离-时长曲线（替换原来「一格 400ms 匀速」）：
       1 格 160ms / 2 格 290ms / 3 格 400ms，再远按同一条曲线继续收；
       每一格的边际耗时递减（160 → 130 → 110 → 96…），距离越长单位距离越省时间。 */
    var STEP1 = 160, STEP2 = 290, STEP3 = 400, STEPN = 96;
    var TRAVEL_EASE_HALF = true; // 位移用标准 ease-in-out（先慢-中快-后慢）
    var FADE_MS = 140;          // 到达后玻璃淡出/收小
    var FADE_DELAY = 250;       // 落位后先让「回弹」完整播完再淡出
    /* 水滴形变：形变上限 1.17、速度 420px/s 吃满；弹簧按参照物 Liquid Glass Web 的
       e^(−5.5t)·cos(10t)（≈500ms 一个明显过冲后收敛，不会来回抖） */
    var DEF_ON = !REDUCED;
    var DEF_MAX = 0.17, DEF_VMAX = 420;
    var SPRING_LAM = 5.5, SPRING_OMG = 10;
    var OUT = 5;                // v2.9.82：玻璃浮层越出侧栏外框的单边像素（4–6px）
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
            var opts = { inset: 0.10, thresh: -0.10 };
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

        /* v2.9.82 浮层凸出：垂直于走向的那条边以「整条 Dock 外框」为基准，
           两侧各外扩 OUT（视觉上真的越出侧栏轮廓）；沿走向仍以项为基准。
           竖排：宽 = 侧栏外框宽 + 2*OUT；横排：高 = 标签条外框高 + 2*OUT。 */
        function floatRect(r) {
            var cr = cont.getBoundingClientRect();
            if (axis === 'v') {
                var w = cr.width + OUT * 2, h = r.h + OUT * 2;
                return { x: cr.left - OUT, y: r.y - OUT, w: w, h: h, cx: cr.left - OUT + w / 2, cy: r.y - OUT + h / 2 };
            }
            var w2 = r.w + OUT * 2, h2 = cr.height + OUT * 2;
            return { x: r.x - OUT, y: cr.top - OUT, w: w2, h: h2, cx: r.x - OUT + w2 / 2, cy: cr.top - OUT + h2 / 2 };
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
        /* 停下的回弹：d(t)=d0·e^(−λt)·cos(ωt)。
           穿越零点后变成反向形变（过冲），再回正；|d|<0.0025 且 t>0.42s 收敛。 */
        function settleGlass(d0, ax) {
            if (!DEF_ON || !d0) { clearGlassScale(); return; }
            var my = settleToken, t0 = 0;
            function step(now) {
                if (my !== settleToken) return;
                if (!t0) t0 = now;
                var t = (now - t0) / 1000;
                var d = d0 * Math.exp(-SPRING_LAM * t) * Math.cos(SPRING_OMG * t);
                if ((t > 0.50 && Math.abs(d) < 0.0025) || t > 1.2) { clearGlassScale(); return; }
                setGlassScale(d, ax);
                requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        }
        /* 轨道范围 = 首项起点 → 末项终点（两端各再放宽 OUT，使玻璃能与首/末项严丝合缝） */
        function trackBounds() {
            var it = itemsOf(cont, cfg);
            if (!it.length) return { start: 0, end: 0 };
            var a = rectIn(it[0]), b = rectIn(it[it.length - 1]);
            if (axis === 'v') {
                return { start: Math.min(a.y, b.y) - OUT, end: Math.max(a.y + a.h, b.y + b.h) + OUT };
            }
            return { start: Math.min(a.x, b.x) - OUT, end: Math.max(a.x + a.w, b.x + b.w) + OUT };
        }
        /* 轴锁定落位：along 只取走向分量；cross 是垂直走向的固定边（左上角），全程不动 */
        function placeLocked(along, cross, w, h) {
            var tb = trackBounds();
            if (axis === 'v') {
                var y = clampNum(along - h / 2, tb.start, Math.max(tb.start, tb.end - h));
                placeAt(cross, y);
                return { x: cross, y: y };
            }
            var x = clampNum(along - w / 2, tb.start, Math.max(tb.start, tb.end - w));
            placeAt(x, cross);
            return { x: x, y: cross };
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

        /* 相邻两项的中心间距（真实布局），用于把「一格 = 400ms」换算成实际时长 */
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

        /* 距离 → 时长：1 格 160 / 2 格 290 / 3 格 400，之后边际递减。
           曲线本身（先慢-中快-后慢）由位移帧里的 easeInOut 承担。 */
        function travelMs(fromR, toR) {
            var a = ctr(fromR), b = ctr(toR);
            var d = axis === 'v' ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
            var cells = d / stepLen();
            var ms;
            if (cells <= 1) ms = STEP1 * Math.max(0.25, cells);
            else if (cells <= 2) ms = STEP1 + (cells - 1) * 130;
            else if (cells <= 3) ms = STEP2 + (cells - 2) * 110;
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

        /* v2.9.82 按下语义：
           1) 玻璃是浮层（body + fixed + 超高 z-index），压过 Dock 与窗口，不再被轨道裁切；
           2) 按下瞬间玻璃以侧栏外框为基准四周外扩 OUT（真的越出侧栏轮廓）并发光，灰胶囊立即让位；
           3) 跟手是轴锁定的：竖排只吃指针 y、横排只吃 x，另一分量全程固定，
              且沿走向被钳在轨道两端之间；
           4) 松手后沿走向匀速（linear，一格 400ms）滑到最近项，到位缩淡，
              灰胶囊在目标项重新出现。 */
        cont.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || dragging) return;
            var item = closestItem(e.target);
            if (!item) return;
            e.preventDefault();
            dragging = true;
            detectAxis();
            cont.classList.add('n26-docknav-drag');
            hideCaps(true);
            var fr = floatRect(rectIn(item));
            sizeTo(fr.w, fr.h);
            /* 垂直于走向的那条边按「按下项」钉死，拖动时不参与运算 */
            var lockX = fr.x, lockY = fr.y;
            var along = axis === 'v' ? e.clientY : e.clientX;
            /* 按下即接管：玻璃中心 = 指针沿轴坐标 + 抓取偏移。
               偏移 = 项中心 − 落点，夹在 ±半格内 —— 既不跳半屏，也不再出现旧版那种
               「先停在项中心，一动就瞬移」的台阶。之后 1:1 跟手，松手才落位。 */
            var step = stepLen();
            var ic = axis === 'v' ? fr.cy : fr.cx;
            var grabOff = clampNum(ic - along, -step / 2, step / 2);
            var pos = placeLocked(along + grabOff, axis === 'v' ? lockX : lockY, gw, gh);
            glass.style.opacity = '1';
            glass.classList.add('travel', 'glow');
            lastRect = { x: pos.x, y: pos.y, w: gw, h: gh, cx: pos.x + gw / 2, cy: pos.y + gh / 2 };
            cont.style.touchAction = 'none';
            try { document.body.style.userSelect = 'none'; } catch (er) { }

            var sx = e.clientX, sy = e.clientY, moved = false;
            /* 跟手形变：记录上一帧指针位置/时间，用真实速度驱动水滴拉伸 */
            settleToken++;
            clearGlassScale();
            var dragToken = settleToken;
            var lastPx = axis === 'v' ? e.clientY : e.clientX;
            var lastPt = performance.now();

            function onMove(ev) {
                if (!dragging) return;
                if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) moved = true;
                if (ev.cancelable) ev.preventDefault();
                /* 只取走向分量：竖排只认 y，横排只认 x；另一分量全程钉死 */
                var p = axis === 'v'
                    ? placeLocked(ev.clientY + grabOff, lockX, gw, gh)
                    : placeLocked(ev.clientX + grabOff, lockY, gw, gh);
                lastRect = { x: p.x, y: p.y, w: gw, h: gh, cx: p.x + gw / 2, cy: p.y + gh / 2 };
                var now = performance.now();
                var cur = axis === 'v' ? ev.clientY : ev.clientX;
                var v = Math.abs(cur - lastPx) / Math.max(1, now - lastPt);
                lastPx = cur; lastPt = now;
                if (dragToken === settleToken) setGlassScale(speedK(v), axis);
            }

            function cleanup() {
                window.removeEventListener('pointermove', onMove, true);
                window.removeEventListener('pointerup', onUp, true);
                window.removeEventListener('pointercancel', onUp, true);
                cont.classList.remove('n26-docknav-drag');
                cont.style.touchAction = '';
                try { document.body.style.userSelect = ''; } catch (er) { }
            }

            function onUp(ev) {
                cleanup();
                dragging = false;
                var it = itemsOf(cont, cfg);
                if (!moved) {
                    /* 点击：从原激活项匀速滑到按下的项；点的是当前项则直接淡出 */
                    var prev = findActive();
                    if (prev && prev !== item) {
                        var bp = floatRect(rectIn(prev));
                        sizeTo(bp.w, bp.h);
                        placeAt(bp.x, bp.y);
                        glass.style.opacity = '1';
                        travelTo(bp, rectIn(item), function () { cur = item; restTo(cur); }, bp);
                    } else {
                        settleToken++;
                        clearGlassScale();
                        fadeGlass(function () { cur = item; restTo(cur); });
                    }
                    /* 受控触发一次应用逻辑，压掉随后可能出现的原生 click */
                    skipActivate = true;
                    item.click();
                    skipActivate = false;
                    suppress = true;
                    setTimeout(function () { suppress = false; }, 900);
                    return;
                }

                /* 落位：只按走向分量找最近的项（另一分量不参与） */
                var reach = axis === 'v' ? lastRect.cy : lastRect.cx;
                var best = null, bd = 1e9;
                for (var i = 0; i < it.length; i++) {
                    var rr = rectIn(it[i]);
                    var dd = axis === 'v' ? Math.abs(reach - rr.cy) : Math.abs(reach - rr.cx);
                    if (dd < bd) { bd = dd; best = it[i]; }
                }
                if (!best) { fadeGlass(function () { restTo(cur || findActive()); }); return; }

                /* 先让应用切到目标项（此时灰胶囊被 hold 隐藏），再匀速滑过去 */
                skipActivate = true;
                best.click();
                skipActivate = false;
                suppress = true;
                setTimeout(function () { suppress = false; }, 900);
                travelTo(lastRect, rectIn(best), function () { cur = best; restTo(best); }, lastRect);
            }

            window.addEventListener('pointermove', onMove, true);
            window.addEventListener('pointerup', onUp, true);
            window.addEventListener('pointercancel', onUp, true);
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

    /* ════════════════════════════════════════════════════════════════
       N26 Liquid Motion v1（v2.9.90）：有内容的玻璃面也随运动形变。
       · 形变写在元素独立的 `scale` 属性上，不覆盖 transform / 不改布局，
         所以 #dock 的 translateX(-50%)、桌面文件卡片的 translate 都保持；
       · 直接子项用 CSS 反补（--n26-def-cx/cy）抵消压缩 → 内容不会被压扁；
       · 只有「真的在动」的时间窗内跑 rAF，静止即全部清零 = 零开销；
       · prefers-reduced-motion 直接不启动 = 纯位移不形变。
       ════════════════════════════════════════════════════════════════ */
    (function () {
        /* 硬边界（v3.4）：物理/形变只允许 Dock 底板 + 左右两个胶囊 + 应用侧栏指示器。
           启动台 / 聚焦搜索 / 开始菜单 / 桌面文件区 / 通知栏 / 设置面板等全部退回普通磨砂或实底。 */
        var SEL = '#dock, #dockBar, #n26LeftDock, #n26RightDock';
        var KMAX = 0.17, VMAX = 420, LAM = 5.5, OMG = 10;
        var RED = false;
        try { RED = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
        if (RED) return;

        var st = [];
        var raf = 0, lastT = 0, wakeUntil = 0;

        function sync() {
            var els = document.querySelectorAll(SEL), next = [];
            for (var i = 0; i < els.length; i++) {
                var old = null;
                for (var j = 0; j < st.length; j++) if (st[j].el === els[i]) { old = st[j]; break; }
                next.push(old || { el: els[i], g: null, vx: 0, vy: 0, mode: 'still', k: 0, ax: 'h', d0: 0, t0: 0, sx: 1, sy: 1 });
            }
            st = next;
        }

        function paint(s, along, across, ax) {
            var sx = ax === 'v' ? across : along;
            var sy = ax === 'v' ? along : across;
            if (sx < 0.01 || sy < 0.01) return;
            s.sx = sx; s.sy = sy;          // 记下自己写进去的形变，量基准时反除
            s.el.style.setProperty('scale', sx + ' ' + sy);
            s.el.style.setProperty('--n26-def-cx', String(1 / sx));
            s.el.style.setProperty('--n26-def-cy', String(1 / sy));
            s.el.classList.add('n26-def-on');
        }
        function clear(s) {
            s.el.classList.remove('n26-def-on');
            s.el.style.removeProperty('scale');
            s.el.style.removeProperty('--n26-def-cx');
            s.el.style.removeProperty('--n26-def-cy');
            s.mode = 'still'; s.k = 0; s.vx = 0; s.vy = 0; s.d0 = 0; s.g = null; s.sx = 1; s.sy = 1;
        }

        function wake(ms) {
            var now = performance.now();
            wakeUntil = Math.max(wakeUntil, now + (ms || 240));
            if (!raf) { lastT = 0; raf = requestAnimationFrame(loop); }
        }

        function loop(now) {
            raf = 0;
            var restart = !lastT;
            var dt = restart ? 16 : Math.max(1, now - lastT);
            lastT = now;
            var busy = false;
            for (var i = 0; i < st.length; i++) {
                var s = st[i], el = s.el;
                if (!el || !el.isConnected) { s.g = null; continue; }
                /* Dock 悬停放大期间不参与形变：放大是「慢慢撑宽」不是「运动」，
                   而且它的判定区 zone() 读的是底板实时 rect，若此时叠我们的 scale
                   会改变进出判定阈值（等于给放大链路引入外部反馈）。滑入/滑出时照常形变。 */
                if (el.id === 'dock' && el.classList.contains('dock-magnifying')) {
                    if (s.mode !== 'still') clear(s);
                    else { s.g = null; }
                    continue;
                }
                if (s.mode === 'spring') {
                    var t = (now - s.t0) / 1000;
                    var d = s.d0 * Math.exp(-LAM * t) * Math.cos(OMG * t);
                    if ((t > 0.50 && Math.abs(d) < 0.0025) || t > 1.2) clear(s);
                    else { paint(s, 1 + d, 1 - d * 0.45, s.ax); busy = true; }
                    continue;
                }
                /* ★ 关键：量「不含自身形变」的基准几何。
                   rect 会被我们自己写进去的 scale 放大，若直接拿 rect 算速度，
                   就会形成「读 rect → 写 scale → rect 又变 → 再写 scale」的自激振荡。
                   做法：中心点不受中心缩放影响；宽高除以自己刚写入的 sx/sy 还原。 */
                var r = el.getBoundingClientRect();
                var sx0 = s.sx || 1, sy0 = s.sy || 1;
                var w0 = r.width / sx0, h0 = r.height / sy0;
                if (w0 < 8 || h0 < 8) { s.g = null; continue; }
                var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                var g = { l: cx - w0 / 2, rr: cx + w0 / 2, t: cy - h0 / 2, b: cy + h0 / 2, cx: cx, cy: cy };
                if (restart || !s.g) { s.g = g; continue; }
                /* 0.35px 死区：亚像素噪声不算运动（量化后再求速度） */
                var dl = g.l - s.g.l, dr = g.rr - s.g.rr, dtt = g.t - s.g.t, db = g.b - s.g.b;
                var vl = (Math.abs(dl) < 0.35 ? 0 : dl) / dt;
                var vr = (Math.abs(dr) < 0.35 ? 0 : dr) / dt;
                var vt = (Math.abs(dtt) < 0.35 ? 0 : dtt) / dt;
                var vb = (Math.abs(db) < 0.35 ? 0 : db) / dt;
                s.vx = s.vx * 0.7 + Math.max(Math.abs(vl), Math.abs(vr)) * 0.3;
                s.vy = s.vy * 0.7 + Math.max(Math.abs(vt), Math.abs(vb)) * 0.3;
                s.g = g;
                var kx = Math.min(KMAX, s.vx * 1000 / VMAX * KMAX);
                var ky = Math.min(KMAX, s.vy * 1000 / VMAX * KMAX);
                var k = Math.max(kx, ky);
                /* 速度门槛 60px/s：慢速几乎看不出；单帧限速 0.02 防跳变 */
                if (k > 0.012) {
                    s.ax = kx >= ky ? 'h' : 'v';
                    /* 上升限速 0.02/帧（不让数值一帧跳到底），下降立即跟随（不迟滞） */
                    s.k = (k > s.k) ? Math.min(k, s.k + 0.02) : k;
                    paint(s, 1 + s.k, 1 - s.k * 0.45, s.ax);
                    s.mode = 'live';
                    busy = true;
                } else if (s.mode === 'live') {
                    s.mode = 'spring'; s.d0 = s.k; s.t0 = now; s.k = 0;
                    busy = true;
                }
            }
            if (busy || now < wakeUntil) raf = requestAnimationFrame(loop);
            else lastT = 0;
        }

        /* 会改变玻璃位置/尺寸的事件：指针、滚动、窗口尺寸、过渡/动画开始，
           以及 class 变化（Dock 收起、Spotlight 打开、桌面文件卡片滑出）。 */
        window.addEventListener('pointermove', function () { wake(280); }, { passive: true });
        window.addEventListener('pointerdown', function () { wake(360); }, { passive: true });
        window.addEventListener('resize', function () { wake(500); }, { passive: true });
        document.addEventListener('scroll', function () { wake(280); }, true);
        ['transitionrun', 'transitionstart', 'animationstart'].forEach(function (n) {
            document.addEventListener(n, function () { wake(560); }, true);
        });

        var mo = null;
        function bind() {
            sync();
            if (typeof MutationObserver === 'undefined') return;
            if (mo) mo.disconnect();
            mo = new MutationObserver(function () { wake(560); });
            for (var i = 0; i < st.length; i++) {
                try { mo.observe(st[i].el, { attributes: true, attributeFilter: ['class'] }); } catch (e) { }
            }
            if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
        else bind();
        window.addEventListener('load', bind);
        [400, 1200, 3000].forEach(function (t) { setTimeout(bind, t); });
        window.N26LiquidMotion = { wake: wake, sync: bind };
    })();

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
