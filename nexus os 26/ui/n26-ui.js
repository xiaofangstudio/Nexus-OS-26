/* ============================================================
   N26 UI · 侧边栏 / Tab 壳（ui/n26-ui.js）
   ------------------------------------------------------------
   用法：
     N26UI.createShell(document.getElementById('app'), {
       sidebar: [
         { id:'home',     icon:'fa-house', label:'首页', content:'<div>…</div>' },
         { id:'settings', icon:'fa-gear',  label:'设置', render:function(){ return node; } }
       ],
       defaultId: 'home',
       onSelect: function(id){}
     });

   生成物：
     .n26ui-shell > .n26ui-sidebar(role=tablist) + .n26ui-content
     侧栏每一项 = <button role="tab">（图标 + 文字），胶囊由 .n26ui-indicator 承担。

   依赖：无框架、无外部资源；样式在 ui/n26-ui.css。
   动画数值与 ui/n26-docknav.css 对齐：
     滑行 400ms / cubic-bezier(.3,.7,.3,1) / 过冲 0.16；
     内容轻推 420ms；图标弹跳 400ms spring。
   ============================================================ */
(function () {
    'use strict';
    if (window.N26UI) return;

    var seq = 0;
    var REDUCED = false;
    try { REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }

    var TRAVEL_MS = 400;     // 一个相邻 tab 距离的匀速滑行时长
    var FADE_MS = 180;       // 到达后玻璃淡出/收小
    var OUT = 5;             // v2.9.82：玻璃浮层越出侧栏外框的单边像素（4–6px）

    function toEl(target) {
        if (!target) return null;
        if (typeof target === 'string') return document.querySelector(target);
        if (target.nodeType === 1) return target;
        return null;
    }

    function iconHTML(icon) {
        var cls = String(icon || 'fa-circle');
        // 允许 'fa-house' 与 'fa-solid fa-house' 两种写法
        if (cls.indexOf(' ') === -1) cls = 'fa-solid ' + cls;
        return '<i class="' + cls.replace(/"/g, '') + '" aria-hidden="true"></i>';
    }

    function makePanel(uid, id, item) {
        var panel = document.createElement('div');
        panel.className = 'n26ui-panel';
        panel.id = uid + '-panel-' + id;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', uid + '-tab-' + id);
        panel.setAttribute('tabindex', '0');
        panel.hidden = true;

        if (typeof item.render === 'function') {
            var node = item.render();
            if (node && node.nodeType === 1) panel.appendChild(node);
            else if (node && node.nodeType === 11) panel.appendChild(node);
            else if (typeof node === 'string') panel.innerHTML = node;
        } else if (typeof item.content === 'string') {
            panel.innerHTML = item.content;
        }
        return panel;
    }

    function createShell(mountEl, opts) {
        var mount = toEl(mountEl);
        if (!mount) throw new Error('[N26UI] createShell: mount 元素不存在');
        opts = opts || {};

        var list = (opts.sidebar || []).slice();
        if (!list.length) throw new Error('[N26UI] createShell: sidebar 至少要有一项');

        var uid = 'n26ui-' + (++seq);
        var used = {};
        list.forEach(function (it, i) {
            it.id = String(it.id || ('tab' + i));
            if (used[it.id]) it.id = it.id + '-' + i;
            used[it.id] = true;
        });

        var shell = document.createElement('div');
        shell.className = 'n26ui-shell';
        if (opts.collapsed) shell.classList.add('n26ui-collapsed');
        if (opts.theme) shell.setAttribute('data-theme', opts.theme);

        var nav = document.createElement('nav');
        nav.className = 'n26ui-sidebar';
        nav.setAttribute('role', 'tablist');
        nav.setAttribute('aria-orientation', 'vertical');
        nav.setAttribute('aria-label', opts.ariaLabel || '应用导航');

        var content = document.createElement('section');
        content.className = 'n26ui-content';

        var indicator = document.createElement('span');
        indicator.className = 'n26ui-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        nav.appendChild(indicator);

        /* v2.9.79：灰色胶囊（indicator）负责静止态；玻璃（glass）只在按下/滑行时出现 */
        var glass = document.createElement('span');
        glass.className = 'n26ui-glass';
        glass.setAttribute('aria-hidden', 'true');
        /* v2.9.82：玻璃挂到 frame body 上做浮层（fixed），脱离侧栏的 overflow 裁切 */
        (document.body || document.documentElement).appendChild(glass);

        var tabs = [];
        var panels = [];
        var activeIndex = -1;
        var prevRect = null;
        var busy = false;         // 玻璃正在滑行 / 淡出
        var dragging = false;     // 指针按住拖动中
        var lastR = null;         // 玻璃最后一次落点
        var ignoreClick = false;  // 指针流程已处理，吞掉随后一次原生 click

        list.forEach(function (item) {
            var tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'n26ui-tab';
            tab.id = uid + '-tab-' + item.id;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', 'false');
            tab.setAttribute('aria-controls', uid + '-panel-' + item.id);
            tab.tabIndex = -1;
            if (item.disabled) tab.setAttribute('aria-disabled', 'true');
            tab.innerHTML = iconHTML(item.icon) +
                '<span class="n26ui-tab-label">' + escapeText(item.label || item.id) + '</span>';

            var panel = makePanel(uid, item.id, item);
            panels.push(panel);
            tabs.push(tab);
            nav.appendChild(tab);
        });

        shell.appendChild(nav);
        shell.appendChild(content);
        panels.forEach(function (p) { content.appendChild(p); });

        mount.innerHTML = '';
        mount.appendChild(shell);

        /* 灰胶囊用 nav 局部坐标（它绝对定位在 nav 里） */
        function rectOf(el) {
            var cr = nav.getBoundingClientRect();
            var r = el.getBoundingClientRect();
            return {
                x: r.left - cr.left + nav.scrollLeft,
                y: r.top - cr.top + nav.scrollTop,
                w: r.width,
                h: r.height
            };
        }
        /* v2.9.82：玻璃浮层用视口坐标（它挂在 body 上、position:fixed） */
        function vrect(el) {
            var r = el.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height };
        }

        /* v2.9.82 浮层凸出：横向以「整条侧栏外框」为基准两侧各外扩 OUT，
           纵向以 tab 本体为基准上下各外扩 OUT —— 视觉上真的越出侧栏轮廓。 */
        function floatOf(r) {
            var cr = nav.getBoundingClientRect();
            var w = cr.width + OUT * 2;
            return { x: cr.left - OUT, y: r.y - OUT, w: w, h: r.h + OUT * 2 };
        }
        function clampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
        /* 轨道范围（nav 局部坐标）：首个 tab 顶边 → 末个 tab 底边，两端各放宽 OUT */
        function trackY() {
            if (!tabs.length) return { start: 0, end: 0 };
            var a = rectOf(tabs[0]), b = rectOf(tabs[tabs.length - 1]);
            return { start: Math.min(a.y, b.y) - OUT, end: Math.max(a.y + a.h, b.y + b.h) + OUT };
        }

        /* 静止态：灰色胶囊落位可见，玻璃保持隐藏 */
        function restAt(el) {
            if (!el) { indicator.style.opacity = '0'; return; }
            var b = rectOf(el);
            indicator.style.width = b.w + 'px';
            indicator.style.height = b.h + 'px';
            indicator.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)';
            indicator.style.opacity = '1';
            prevRect = b;
        }

        function holdCaps(on) { nav.classList.toggle('n26ui-hold', !!on); }

        function stepLen() {
            if (tabs.length < 2) return 1;
            var a = rectOf(tabs[0]), b = rectOf(tabs[1]);
            return Math.abs(b.y - a.y) || Math.abs(b.x - a.x) || 1;
        }

        function travelMs(fromR, toR) {
            if (!fromR || !toR) return TRAVEL_MS;
            var d = Math.abs(toR.y - fromR.y) || Math.abs(toR.x - fromR.x);
            return Math.max(160, Math.round(TRAVEL_MS * (d / stepLen())));
        }

        function fadeGlass(r, done) {
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
                if (done) done();
            };
        }

        /* 匀速（linear）滑到目标：一格 ≈ 400ms，按真实间距比例折算；到达后淡出收小。
           目标尺寸一律取浮层尺寸（侧栏外框 + OUT）。 */
        function slide(fromR, toEl, done) {
            busy = true;
            var toB = floatOf(vrect(toEl));
            if (REDUCED || !glass.animate) {
                glass.style.opacity = '0';
                glass.classList.remove('travel', 'glow');
                busy = false;
                holdCaps(false);
                if (done) done();
                return;
            }
            glass.style.width = toB.w + 'px';
            glass.style.height = toB.h + 'px';
            glass.style.opacity = '1';
            glass.classList.add('travel');
            var from = fromR || toB;
            var anim = glass.animate([
                { transform: 'translate(' + from.x + 'px,' + from.y + 'px)' },
                { transform: 'translate(' + toB.x + 'px,' + toB.y + 'px)' }
            ], { duration: travelMs(from, toB), easing: 'linear', fill: 'forwards' });
            anim.onfinish = function () {
                anim.cancel();
                glass.style.transform = 'translate(' + toB.x + 'px,' + toB.y + 'px)';
                fadeGlass(toB, function () {
                    busy = false;
                    holdCaps(false);
                    if (done) done();
                });
            };
        }

        function popIcon(tab) {
            var ic = tab.querySelector('i');
            if (!ic) return;
            ic.classList.remove('n26ui-icon-pop');
            void ic.offsetWidth;
            ic.classList.add('n26ui-icon-pop');
            setTimeout(function () { ic.classList.remove('n26ui-icon-pop'); }, 460);
        }

        function nudge(panel, delta) {
            if (!delta) return;
            var cls = delta > 0 ? 'n26ui-nudge-down' : 'n26ui-nudge-up';
            panel.classList.remove('n26ui-nudge-up', 'n26ui-nudge-down');
            void panel.offsetWidth;
            panel.classList.add(cls);
            setTimeout(function () { panel.classList.remove(cls); }, 480);
        }

        /* 业务层：只切 active / 面板 / 回调，不碰视觉 */
        function applyActive(idx, shouldFocus, silent) {
            if (idx < 0 || idx === activeIndex) return -1;
            if (tabs[idx].getAttribute('aria-disabled') === 'true') return -1;
            var prev = activeIndex;

            for (var j = 0; j < tabs.length; j++) {
                var on = j === idx;
                tabs[j].classList.toggle('active', on);
                tabs[j].setAttribute('aria-selected', on ? 'true' : 'false');
                tabs[j].tabIndex = on ? 0 : -1;
                panels[j].hidden = !on;
            }

            activeIndex = idx;
            if (prev >= 0) {
                popIcon(tabs[idx]);
                nudge(panels[idx], idx - prev);
            }
            if (shouldFocus) tabs[idx].focus();

            if (!silent) {
                try {
                    if (typeof opts.onSelect === 'function') opts.onSelect(list[idx].id, list[idx]);
                } catch (err) { console.error('[N26UI] onSelect error', err); }
            }
            return prev;
        }

        /* 键盘 / 程序化选中：灰胶囊先让位，玻璃匀速滑过去，到达后淡出、灰胶囊落位 */
        function select(id, shouldFocus, silent) {
            var idx = -1;
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === id) { idx = i; break; }
            }
            if (idx < 0) return;
            var prev = applyActive(idx, shouldFocus, silent);
            if (prev < 0) { restAt(tabs[idx]); return; }
            holdCaps(true);
            slide(floatOf(vrect(tabs[prev])), tabs[idx], function () { restAt(tabs[idx]); });
        }

        /* 点击：走 select，业务逻辑在 onSelect 里 */
        nav.addEventListener('click', function (e) {
            if (ignoreClick) { ignoreClick = false; e.preventDefault(); e.stopPropagation(); return; }
            var tab = e.target && e.target.closest ? e.target.closest('.n26ui-tab') : null;
            if (!tab || !nav.contains(tab)) return;
            select(tab.id.slice((uid + '-tab-').length), false);
        });

        /* v2.9.81：按下即凸出（略大于 tab 本体）、玻璃置顶、灰胶囊立即让位；
           跟手轴锁定——侧栏是竖排，只算指针 y，横向分量全程钉死，且钳在轨道内；
           松手沿 y 匀速（linear）滑到最近 tab → 缩淡 → 灰胶囊落位。 */
        nav.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || dragging) return;
            var tab0 = e.target && e.target.closest ? e.target.closest('.n26ui-tab') : null;
            if (!tab0 || !nav.contains(tab0)) return;
            e.preventDefault();
            dragging = true;
            holdCaps(true);
            var b0 = floatOf(vrect(tab0));
            var lockX = b0.x;   /* 垂直于走向的边，全程不动 */
            /* 跟手用 nav 局部坐标算（窗口入场动画时 iframe 平移不会带偏），写回时再换算视口 */
            var cr0 = nav.getBoundingClientRect();
            var py0 = e.clientY - cr0.top + nav.scrollTop;
            var ty = trackY();
            var y0 = clampNum(py0 - b0.h / 2, ty.start, Math.max(ty.start, ty.end - b0.h));
            glass.style.width = b0.w + 'px';
            glass.style.height = b0.h + 'px';
            glass.style.transform = 'translate(' + lockX + 'px,' + (cr0.top + y0) + 'px)';
            glass.style.opacity = '1';
            glass.classList.add('travel', 'glow');
            lastR = { x: lockX, y: cr0.top + y0, w: b0.w, h: b0.h };
            try { document.body.style.userSelect = 'none'; } catch (er) { }

            var sx = e.clientX, sy = e.clientY, moved = false;

            function onMove(ev) {
                if (!dragging) return;
                if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) moved = true;
                if (ev.cancelable) ev.preventDefault();
                var cr = nav.getBoundingClientRect();
                var lx = cr.left - OUT;   /* 横向边以侧栏外框为基准，随窗口移动同步 */
                var py2 = ev.clientY - cr.top + nav.scrollTop;
                var t2 = trackY();
                /* 指针没沿走向移动（误差 <1px）时沿用按下时的位置，保证纯横向拖动位移严格为 0 */
                var y = Math.abs(py2 - py0) < 1
                    ? y0
                    : clampNum(py2 - b0.h / 2, t2.start, Math.max(t2.start, t2.end - b0.h));
                /* 只吃 y：鼠标横向移动时玻璃一像素都不动 */
                glass.style.transform = 'translate(' + lx + 'px,' + (cr.top + y) + 'px)';
                lastR = { x: lx, y: cr.top + y, w: b0.w, h: b0.h };
            }

            function cleanup() {
                window.removeEventListener('pointermove', onMove, true);
                window.removeEventListener('pointerup', onUp, true);
                window.removeEventListener('pointercancel', onUp, true);
                try { document.body.style.userSelect = ''; } catch (er) { }
            }

            function finish(targetIdx, fromR) {
                var prev = applyActive(targetIdx, false);
                ignoreClick = true;
                setTimeout(function () { ignoreClick = false; }, 800);
                if (prev < 0) {
                    fadeGlass(fromR, function () {
                        holdCaps(false);
                        restAt(tabs[targetIdx]);
                    });
                    return;
                }
                slide(fromR, tabs[targetIdx], function () { restAt(tabs[targetIdx]); });
            }

            function onUp(ev) {
                cleanup();
                dragging = false;
                if (!moved) {
                    var idx0 = tabs.indexOf(tab0);
                    var bp = floatOf(vrect(tabs[activeIndex >= 0 ? activeIndex : idx0]));
                    glass.style.width = bp.w + 'px';
                    glass.style.height = bp.h + 'px';
                    glass.style.transform = 'translate(' + bp.x + 'px,' + bp.y + 'px)';
                    finish(idx0, bp);
                    return;
                }
                /* 落位只按走向（y）找最近的 tab，横向分量不参与 */
                var gcy = lastR.y + lastR.h / 2;
                var best = -1, bd = 1e9;
                for (var i = 0; i < tabs.length; i++) {
                    if (tabs[i].getAttribute('aria-disabled') === 'true') continue;
                    var r = rectOf(tabs[i]);
                    var dd = Math.abs(gcy - (r.y + r.h / 2));
                    if (dd < bd) { bd = dd; best = i; }
                }
                if (best < 0) {
                    fadeGlass(lastR, function () { holdCaps(false); restAt(tabs[activeIndex]); });
                    return;
                }
                finish(best, lastR);
            }

            window.addEventListener('pointermove', onMove, true);
            window.addEventListener('pointerup', onUp, true);
            window.addEventListener('pointercancel', onUp, true);
        }, true);

        /* 键盘：上下 / 左右 / Home / End，roving tabindex */
        nav.addEventListener('keydown', function (e) {
            var tab = e.target && e.target.closest ? e.target.closest('.n26ui-tab') : null;
            if (!tab || !nav.contains(tab)) return;
            var idx = tabs.indexOf(tab);
            var key = e.key;
            var next = -1;
            if (key === 'ArrowDown' || key === 'ArrowRight') next = (idx + 1) % tabs.length;
            else if (key === 'ArrowUp' || key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
            else if (key === 'Home') next = 0;
            else if (key === 'End') next = tabs.length - 1;
            if (next < 0) return;
            e.preventDefault();
            var guard = 0;
            while (tabs[next].getAttribute('aria-disabled') === 'true' && guard++ < tabs.length) {
                next = (next + 1) % tabs.length;
            }
            select(list[next].id, true);
        });

        /* 尺寸/滚动对位（静止态只更新灰胶囊几何，玻璃保持隐藏） */
        function reposition() {
            if (busy || dragging) return;
            if (activeIndex >= 0) restAt(tabs[activeIndex]);
        }
        nav.addEventListener('scroll', reposition, { passive: true });
        window.addEventListener('resize', reposition);
        var ro = null;
        if (window.ResizeObserver) {
            ro = new ResizeObserver(reposition);
            ro.observe(nav);
            tabs.forEach(function (t) { ro.observe(t); });
        }
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () { setTimeout(reposition, 0); });
        }

        /* 初始选中 */
        var initial = opts.defaultId || list[0].id;
        select(initial, false, true);
        requestAnimationFrame(function () { if (activeIndex >= 0 && !busy) restAt(tabs[activeIndex]); });
        setTimeout(reposition, 350);

        /* 挂到 window，供 n26-switch.js 等既有脚本扫描动态内容 */
        try {
            window.dispatchEvent(new CustomEvent('n26ui:mounted', { detail: { shell: shell } }));
        } catch (e) { }

        return {
            el: shell,
            nav: nav,
            content: content,
            select: function (id) { select(id, false); },
            getActive: function () { return activeIndex >= 0 ? list[activeIndex].id : null; },
            setCollapsed: function (v) { shell.classList.toggle('n26ui-collapsed', !!v); setTimeout(reposition, 0); },
            isCollapsed: function () { return shell.classList.contains('n26ui-collapsed'); },
            destroy: function () {
                window.removeEventListener('resize', reposition);
                if (ro) ro.disconnect();
                shell.remove();
            }
        };
    }

    function escapeText(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    window.N26UI = {
        version: '1.0.0',
        createShell: createShell
    };
})();
