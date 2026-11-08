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

    var TRAVEL_MS = 400;
    var TRAVEL_EASE = 'cubic-bezier(.3,.7,.3,1)';
    var OVER = 0.16;

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

        var tabs = [];
        var panels = [];
        var activeIndex = -1;
        var prevRect = null;
        var skipTravel = false;   // 拖动落位：跳过旅行过场
        var ignoreClick = false;  // 拖动结束后压掉一次幽灵 click

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

        function snap(el, animate) {
            var b = rectOf(el);
            /* v2.9.77：拖动落位时跳过旅行过场，直接钉在松手处（不弹回旧项） */
            if (skipTravel) { skipTravel = false; animate = false; }
            indicator.style.width = b.w + 'px';
            indicator.style.height = b.h + 'px';
            indicator.style.opacity = '1';

            if (!animate || REDUCED || !indicator.animate || !prevRect) {
                indicator.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)';
                prevRect = b;
                return;
            }

            var a = prevRect;
            var kf = [
                {
                    transform: 'translate(' + a.x + 'px,' + a.y + 'px) scale(' +
                        Math.max(a.w / b.w, .5) + ',' + Math.max(a.h / b.h, .5) + ')',
                    offset: 0
                },
                {
                    transform: 'translate(' + (a.x + (b.x - a.x) * .5) + 'px,' +
                        (a.y + (b.y - a.y) * .5) + 'px) scale(1.2,.93)',
                    offset: .42
                },
                {
                    transform: 'translate(' + (b.x + (b.x - a.x) * OVER) + 'px,' +
                        (b.y + (b.y - a.y) * OVER) + 'px) scale(1.05,.97)',
                    offset: .78
                },
                { transform: 'translate(' + b.x + 'px,' + b.y + 'px) scale(1,1)', offset: 1 }
            ];

            indicator.classList.add('travel');
            var anim = indicator.animate(kf, { duration: TRAVEL_MS, easing: TRAVEL_EASE, fill: 'both' });
            anim.onfinish = function () {
                indicator.classList.remove('travel');
                indicator.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)';
                prevRect = b;
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

        function select(id, shouldFocus, silent) {
            var idx = -1;
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === id) { idx = i; break; }
            }
            if (idx < 0 || idx === activeIndex || tabs[idx].getAttribute('aria-disabled') === 'true') return;
            var prev = activeIndex;

            for (var j = 0; j < tabs.length; j++) {
                var on = j === idx;
                tabs[j].classList.toggle('active', on);
                tabs[j].setAttribute('aria-selected', on ? 'true' : 'false');
                tabs[j].tabIndex = on ? 0 : -1;
                panels[j].hidden = !on;
            }

            activeIndex = idx;
            snap(tabs[idx], prev >= 0);
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
        }

        /* 点击：走 select，业务逻辑在 onSelect 里 */
        nav.addEventListener('click', function (e) {
            if (ignoreClick) { ignoreClick = false; e.preventDefault(); e.stopPropagation(); return; }
            var tab = e.target && e.target.closest ? e.target.closest('.n26ui-tab') : null;
            if (!tab || !nav.contains(tab)) return;
            select(tab.id.slice((uid + '-tab-').length), false);
        });

        /* 按住拖动：位移 >4px 接管，胶囊实时跟手；松手停到指针最近的一项，不弹回。
           旧实现只有 click 才会移动胶囊，按住拖动时不跟手，松手才跳过去。 */
        nav.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || e.target === indicator) return;
            var tab0 = e.target && e.target.closest ? e.target.closest('.n26ui-tab') : null;
            if (!tab0) return;
            var sx = e.clientX, sy = e.clientY;
            var moved = false, w = 0, h = 0;
            var seedTab = tabs[activeIndex >= 0 ? activeIndex : 0] || tab0;
            var sr = rectOf(seedTab);
            w = sr.w; h = sr.h;

            function onMove(ev) {
                if (!moved) {
                    if (Math.abs(ev.clientX - sx) <= 4 && Math.abs(ev.clientY - sy) <= 4) return;
                    moved = true;
                    indicator.classList.add('travel');
                    indicator.style.width = w + 'px';
                    indicator.style.height = h + 'px';
                    indicator.style.opacity = '1';
                    try { document.body.style.userSelect = 'none'; } catch (er) { }
                }
                if (ev.cancelable) ev.preventDefault();
                var cr = nav.getBoundingClientRect();
                var px = ev.clientX - cr.left + nav.scrollLeft;
                var py = ev.clientY - cr.top + nav.scrollTop;
                indicator.style.transform = 'translate(' + (px - w / 2) + 'px,' + (py - h / 2) + 'px)';
            }
            function onUp(ev) {
                window.removeEventListener('pointermove', onMove, true);
                window.removeEventListener('pointerup', onUp, true);
                window.removeEventListener('pointercancel', onUp, true);
                try { document.body.style.userSelect = ''; } catch (er) { }
                if (!moved) return;

                indicator.classList.remove('travel');
                ignoreClick = true;
                setTimeout(function () { ignoreClick = false; }, 600);

                /* 找指针最近的可用 tab */
                var cr = nav.getBoundingClientRect();
                var px = ev.clientX - cr.left + nav.scrollLeft;
                var py = ev.clientY - cr.top + nav.scrollTop;
                var best = -1, bd = 1e9;
                for (var i = 0; i < tabs.length; i++) {
                    if (tabs[i].getAttribute('aria-disabled') === 'true') continue;
                    var r = rectOf(tabs[i]);
                    var dd = Math.abs(px - (r.x + r.w / 2)) + Math.abs(py - (r.y + r.h / 2));
                    if (dd < bd) { bd = dd; best = i; }
                }
                if (best < 0) { skipTravel = false; snap(seedTab, false); return; }

                if (best === activeIndex) {
                    skipTravel = true;
                    snap(tabs[best], false);
                    skipTravel = false;
                } else {
                    skipTravel = true;
                    select(list[best].id, false);   // select 内部的 snap 看到 skipTravel → 直接落位
                    skipTravel = false;
                }
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

        /* 尺寸/滚动对位 */
        function reposition() {
            if (activeIndex >= 0) snap(tabs[activeIndex], false);
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
        requestAnimationFrame(function () { if (activeIndex >= 0) snap(tabs[activeIndex], false); });
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
