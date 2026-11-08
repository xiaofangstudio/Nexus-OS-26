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

    var TRAVEL_STEP_MS = 400;   // 一个相邻项距离的匀速滑行时长
    var FADE_MS = 180;          // 到达后玻璃淡出/收小
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

        function sizeTo(w, h) { gw = w; gh = h; glass.style.width = w + 'px'; glass.style.height = h + 'px'; }

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

        function travelMs(fromR, toR) {
            var a = ctr(fromR), b = ctr(toR);
            var d = axis === 'v' ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
            return Math.max(160, Math.round(TRAVEL_STEP_MS * (d / stepLen())));
        }

        /* 到达后淡出 + 收小，然后灰胶囊在目标项出现 */
        function fadeGlass(done) {
            var r = lastRect || { x: 0, y: 0 };
            glass.classList.remove('glow');
            var anim = glass.animate([
                { opacity: 1, transform: 'translate(' + r.x + 'px,' + r.y + 'px) scale(1,1)' },
                { opacity: 0, transform: 'translate(' + r.x + 'px,' + r.y + 'px) scale(.86,.86)' }
            ], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' });
            anim.onfinish = function () {
                anim.cancel();
                glass.style.opacity = '0';
                glass.classList.remove('travel');
                glass.style.transform = 'translate(' + r.x + 'px,' + r.y + 'px)';
                traveling = false;
                hideCaps(false);
                if (done) done();
            };
        }

        /* 匀速（linear）滑到目标，时长按「一格 400ms」的真实间距比例折算。
           尺寸一律取浮层尺寸（侧栏外框 + OUT），落点按浮层矩形对齐到目标项。 */
        function travelTo(fromR, toR, done, size) {
            traveling = true;
            detectAxis();
            var toB = floatRect(toR);
            if (REDUCED || !glass.animate) {
                if (size) sizeTo(size.w, size.h); else sizeTo(toB.w, toB.h);
                placeAt(toB.x, toB.y);
                glass.style.opacity = '0';
                glass.classList.remove('travel', 'glow');
                lastRect = { x: toB.x, y: toB.y, w: toB.w, h: toB.h, cx: toB.cx || toB.x + toB.w / 2, cy: toB.cy || toB.y + toB.h / 2 };
                traveling = false;
                hideCaps(false);
                if (done) done();
                return;
            }
            if (size) sizeTo(size.w, size.h); else sizeTo(toB.w, toB.h);
            glass.style.opacity = '1';
            glass.classList.add('travel');
            glass.classList.remove('glow');
            var anim = glass.animate([
                { transform: 'translate(' + fromR.x + 'px,' + fromR.y + 'px)' },
                { transform: 'translate(' + toB.x + 'px,' + toB.y + 'px)' }
            ], { duration: travelMs(fromR, toR), easing: 'linear', fill: 'forwards' });
            anim.onfinish = function () {
                anim.cancel();
                placeAt(toB.x, toB.y);
                lastRect = { x: toB.x, y: toB.y, w: toB.w, h: toB.h, cx: toB.x + toB.w / 2, cy: toB.y + toB.h / 2 };
                fadeGlass(done);
            };
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
            var pos = placeLocked(along, axis === 'v' ? lockX : lockY, gw, gh);
            glass.style.opacity = '1';
            glass.classList.add('travel', 'glow');
            lastRect = { x: pos.x, y: pos.y, w: gw, h: gh, cx: pos.x + gw / 2, cy: pos.y + gh / 2 };
            cont.style.touchAction = 'none';
            try { document.body.style.userSelect = 'none'; } catch (er) { }

            var sx = e.clientX, sy = e.clientY, moved = false;

            function onMove(ev) {
                if (!dragging) return;
                if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) moved = true;
                if (ev.cancelable) ev.preventDefault();
                /* 只取走向分量：竖排只认 y，横排只认 x */
                var p = axis === 'v'
                    ? placeLocked(ev.clientY, lockX, gw, gh)
                    : placeLocked(ev.clientX, lockY, gw, gh);
                lastRect = { x: p.x, y: p.y, w: gw, h: gh, cx: p.x + gw / 2, cy: p.y + gh / 2 };
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

    /* 手动增强入口（注册表之外的容器可用） */
    window.N26DockNav = {
        enhance: function (el, cfg) { if (el) enhance(el, cfg); },
        auto: auto,
        squircle: applyDockSquircle
    };
})();
