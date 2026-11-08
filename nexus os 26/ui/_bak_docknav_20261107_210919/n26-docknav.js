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
        ['.wincal-tabs[data-n26dock]', '.wincal-tab', 'active', null],
        ['.n26acct-tabs[data-n26dock]', '.n26acct-tab', 'active', null],
        ['.nex-modal-tabs[data-n26dock]', '.nex-modal-tab', 'active', null],
        ['.tabs[data-n26dock]', '.tab', 'active', null],
        ['#chips[data-n26dock]', '.chip', 'active', null]
    ];

    var HOLD_MS = 280;          // 长按进入拖动
    var TRAVEL_MS = 400;        // 水滴滑行总时长

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
        cont.appendChild(glass);

        var axis = 'v';
        var cur = null;            // 当前激活项
        var traveling = false;
        var dragging = false;
        var suppress = false;      // 拖动结束后压掉原生幽灵 click
        var skipActivate = false;  // 拖动已手动落位：随后的 click 只跑应用逻辑，不播旅行
        var gw = 0, gh = 0;        // 玻璃当前尺寸

        function rectIn(el) {
            var cr = cont.getBoundingClientRect(), r = el.getBoundingClientRect();
            return {
                x: r.left - cr.left + cont.scrollLeft,
                y: r.top - cr.top + cont.scrollTop,
                w: r.width, h: r.height,
                cx: r.left - cr.left + cont.scrollLeft + r.width / 2,
                cy: r.top - cr.top + cont.scrollTop + r.height / 2
            };
        }

        function detectAxis() {
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

        function snapTo(item) {
            if (!item) { glass.style.opacity = '0'; cur = null; return; }
            glass.style.opacity = '1';
            var r = rectIn(item);
            sizeTo(r.w, r.h);
            placeAt(r.x, r.y);
        }

        function findActive() {
            var it = itemsOf(cont, cfg);
            for (var i = 0; i < it.length; i++) if (it[i].classList.contains(cfg.on)) return it[i];
            return null;
        }

        /* 胶囊 → 液态玻璃水滴滑过去 → 弹簧回弹停稳 → 缩回胶囊 */
        function travel(fromItem, toItem) {
            if (!toItem) return;
            var b = rectIn(toItem);
            detectAxis();
            if (REDUCED || !glass.animate || fromItem === toItem) { snapTo(toItem); return; }
            var a = fromItem ? rectIn(fromItem) : { x: b.x, y: b.y, w: b.w, h: b.h };
            glass.style.opacity = '1';
            sizeTo(b.w, b.h);
            var vertical = axis === 'v';
            var dx = b.x - a.x, dy = b.y - a.y;
            var over = 0.16;                                        // 弹簧过冲
            var ox = vertical ? 0 : dx * over, oy = vertical ? dy * over : 0;
            // 中段拉长 + 略压扁（水滴）；末段缩回
            var kf = [
                { transform: 'translate(' + a.x + 'px,' + a.y + 'px) scale(' + Math.max(a.w / b.w, 0.5) + ',' + Math.max(a.h / b.h, 0.5) + ')', offset: 0 },
                { transform: 'translate(' + (a.x + dx * 0.5) + 'px,' + (a.y + dy * 0.5) + 'px) scale(' + (vertical ? 1.2 : 1.12) + ',' + (vertical ? 0.93 : 0.88) + ')', offset: 0.42 },
                { transform: 'translate(' + (b.x + ox) + 'px,' + (b.y + oy) + 'px) scale(' + (vertical ? 1.05 : 1.04) + ',' + (vertical ? 0.97 : 0.95) + ')', offset: 0.78 },
                { transform: 'translate(' + b.x + 'px,' + b.y + 'px) scale(1,1)', offset: 1 }
            ];
            glass.classList.add('travel');
            traveling = true;
            var anim = glass.animate(kf, { duration: TRAVEL_MS, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
            anim.onfinish = function () {
                glass.classList.remove('travel');
                glass.style.transform = kf[kf.length - 1].transform;
                traveling = false;
            };
        }

        function popIcon(item) {
            var ic = item.querySelector('i') || item;
            ic.classList.remove('n26-icon-pop');
            void ic.offsetWidth;
            ic.classList.add('n26-icon-pop');
            setTimeout(function () { ic.classList.remove('n26-icon-pop'); }, 460);
        }

        function nudge(dir) {
            if (!cfg.content || !dir) return;
            var el = null;
            try { el = document.querySelector(cfg.content); } catch (e) { }
            if (!el || el === cont || !el.classList) return;
            var cls = axis === 'v' ? (dir > 0 ? 'n26-nudge-down' : 'n26-nudge-up')
                : (dir > 0 ? 'n26-nudge-right' : 'n26-nudge-left');
            el.classList.remove('n26-nudge-left', 'n26-nudge-right', 'n26-nudge-up', 'n26-nudge-down');
            void el.offsetWidth;
            el.classList.add(cls);
            setTimeout(function () { el.classList.remove(cls); }, 480);
        }

        function manageActive(item) {
            var it = itemsOf(cont, cfg);
            for (var i = 0; i < it.length; i++) it[i].classList.toggle(cfg.on, it[i] === item);
        }

        function activate(item) {
            if (!item) return;
            var prev = cur || findActive();
            var it = itemsOf(cont, cfg);
            var dir = it.indexOf(item) - (prev ? it.indexOf(prev) : it.indexOf(item));
            if (prev === item) { snapTo(item); return; }
            travel(prev, item);
            manageActive(item);
            popIcon(item);
            cur = item;
            if (dir) nudge(dir);
        }

        /* 点击（capture：先于应用自己的 handler，只叠视觉不抢逻辑） */
        cont.addEventListener('click', function (e) {
            if (suppress) { suppress = false; e.preventDefault(); e.stopPropagation(); return; }
            if (skipActivate) { skipActivate = false; return; }
            var item = closestItem(e.target);
            if (item) activate(item);
        }, true);

        /* 按住拖动：位移超过 4px 立刻接管，玻璃实时跟手（不再等 280ms 长按）。
           松手直接停在指针最近的一项，没有回弹、也没有补一段旅行。 */
        cont.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || dragging) return;
            if (!closestItem(e.target)) return;
            var sx = e.clientX, sy = e.clientY;
            var started = false;
            var timer = setTimeout(function () { if (!started) { started = true; startDrag(null); } }, HOLD_MS);
            function cleanup() {
                clearTimeout(timer);
                window.removeEventListener('pointermove', onEarlyMove, true);
                window.removeEventListener('pointerup', onEarlyUp, true);
                window.removeEventListener('pointercancel', onEarlyUp, true);
            }
            function onEarlyMove(ev) {
                if (started) return;
                if (Math.abs(ev.clientX - sx) > 4 || Math.abs(ev.clientY - sy) > 4) {
                    started = true;
                    startDrag(ev);   // startDrag 内部先 cleanup，再把玻璃贴到这次指针位置
                }
            }
            function onEarlyUp() { cleanup(); }
            window.addEventListener('pointermove', onEarlyMove, true);
            window.addEventListener('pointerup', onEarlyUp, true);
            window.addEventListener('pointercancel', onEarlyUp, true);

            function startDrag(ev0) {
                cleanup();
                dragging = true;
                cont.classList.add('n26-docknav-drag');
                /* 玻璃还没量过尺寸时，用当前项/首个项先撑起一个形状，保证跟手第一帧就可见 */
                if (!gw || !gh) {
                    var seed = cur || findActive() || itemsOf(cont, cfg)[0];
                    if (seed) {
                        var sr = rectIn(seed);
                        gw = Math.round(sr.w); gh = Math.round(sr.h);
                        sizeTo(gw, gh);
                    }
                }
                glass.classList.add('travel');
                glass.style.opacity = '1';
                cont.style.touchAction = 'none';
                try { document.body.style.userSelect = 'none'; } catch (er) { }
                var lastX = sx, lastY = sy;

                function pos(ev) {
                    var cr = cont.getBoundingClientRect();
                    return { x: ev.clientX - cr.left + cont.scrollLeft, y: ev.clientY - cr.top + cont.scrollTop };
                }
                function onDragMove(ev) {
                    if (!dragging) return;
                    if (ev.cancelable) ev.preventDefault();
                    var p = pos(ev);
                    var vx = ev.clientX - lastX, vy = ev.clientY - lastY;
                    lastX = ev.clientX; lastY = ev.clientY;
                    var d = axis === 'v' ? vy : vx;
                    var stretch = Math.min(Math.abs(d) * 0.05, 0.28);       // 顺移动方向拉长
                    var squash = 1 - stretch * 0.4;
                    var sc = axis === 'v' ? 'scale(' + squash + ',' + (1 + stretch) + ')'
                        : 'scale(' + (1 + stretch) + ',' + squash + ')';
                    glass.style.transform = 'translate(' + (p.x - gw / 2) + 'px,' + (p.y - gh / 2) + 'px) ' + sc;
                }
                function onDragEnd(ev) {
                    dragging = false;
                    window.removeEventListener('pointermove', onDragMove, true);
                    window.removeEventListener('pointerup', onDragEnd, true);
                    window.removeEventListener('pointercancel', onDragEnd, true);
                    cont.classList.remove('n26-docknav-drag');
                    cont.style.touchAction = '';
                    try { document.body.style.userSelect = ''; } catch (er) { }
                    glass.classList.remove('travel');

                    var before = cur;
                    var p = pos(ev);
                    var it = itemsOf(cont, cfg);
                    var best = null, bd = 1e9;
                    for (var i = 0; i < it.length; i++) {
                        var r = rectIn(it[i]);
                        var dd = Math.abs(p.x - r.cx) + Math.abs(p.y - r.cy);
                        if (dd < bd) { bd = dd; best = it[i]; }
                    }
                    if (!best) { snapTo(before || findActive()); return; }

                    /* 直接落位：换 active、把玻璃钉在松手处的项上（无过场、不弹回） */
                    manageActive(best);
                    cur = best;
                    var br = rectIn(best);
                    sizeTo(br.w, br.h);
                    snapTo(best);
                    /* 只为触发应用自己的逻辑补一次受控 click；
                       skipActivate 让 click 的视觉层不再播旅行，避免先跳回旧项再滑过去。 */
                    if (best !== before) {
                        skipActivate = true;
                        setTimeout(function () { skipActivate = false; }, 600);
                        setTimeout(function () { best.click(); }, 0);
                    }
                }
                window.addEventListener('pointermove', onDragMove, true);
                window.addEventListener('pointerup', onDragEnd, true);
                window.addEventListener('pointercancel', onDragEnd, true);
                if (ev0) onDragMove(ev0);
            }
        }, true);

        /* 滚动 / 尺寸变化时对位 */
        cont.addEventListener('scroll', function () {
            if (!traveling && !dragging) snapTo(cur || findActive());
        }, { passive: true });
        window.addEventListener('resize', function () {
            if (!traveling && !dragging) snapTo(cur || findActive());
        });

        /* 应用重渲染 / 自行切换 active 时对齐 */
        var moT = null;
        var mo = new MutationObserver(function () {
            if (moT) return;
            moT = setTimeout(function () {
                moT = null;
                var a = findActive();
                if (a && a !== cur) { cur = a; if (!traveling && !dragging) snapTo(a); }
                else if (cur && !cont.contains(cur)) { cur = findActive(); snapTo(cur); }
                else if (!cur) { cur = findActive(); snapTo(cur); }
            }, 90);
        });
        mo.observe(cont, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

        /* 初次对位（等一拍布局） */
        cur = findActive();
        requestAnimationFrame(function () { snapTo(cur); });
        setTimeout(function () { if (!traveling && !dragging) snapTo(cur || findActive()); }, 350);
        setTimeout(function () { if (!traveling && !dragging) snapTo(cur || findActive()); }, 900);
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

    /* 手动增强入口（注册表之外的容器可用） */
    window.N26DockNav = {
        enhance: function (el, cfg) { if (el) enhance(el, cfg); },
        auto: auto
    };
})();
