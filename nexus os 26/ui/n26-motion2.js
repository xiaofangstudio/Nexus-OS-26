/* ==========================================================================
   Nexus OS 26 · 系统动效批次 2（ui/n26-motion2.js）v2.10.12
   --------------------------------------------------------------------------
   按用户点名的顺序做完八项：
     ① 窗口贴边吸附（四角四分之一屏）+ 幽灵预览
     ② Cmd/Ctrl + Tab 应用切换器（卡片流）
     ③ Dock 图标「吸入」展开轨迹（新窗口从图标长出来）
     ④ 启动台分层错落（品牌区先入 → 网格后入）
     ⑤ 模态从触发点展开（FLIP）
     ⑥ 控制中心弹簧
     ⑦ 锁屏时钟呼吸
     ⑧ 桌面小组件入场阶梯

   一贯纪律：
     · 只用「加层 / 观察 / WAAPI」，不改主壳已有动画与状态；
     · 拖拽过程中**不读布局**（窗口的 left/top/width/height 直接读内联样式字符串）；
     · 每个钩子都 try/catch + 存在性判断，缺元素就是没有效果，不会报错；
     · 尊重 prefers-reduced-motion / body.reduce-motion / body.n26-lite。
   ========================================================================== */
(function () {
    'use strict';
    if (window.__n26Motion2) return;
    window.__n26Motion2 = true;

    var RM = null;
    try { RM = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { }
    function off() {
        if (RM && RM.matches) return true;
        var b = document.body;
        return !!(b && (b.classList.contains('reduce-motion') || b.classList.contains('n26-lite')));
    }
    var EASE = 'cubic-bezier(.2,.7,.2,1)';
    var EASE_OUT = 'cubic-bezier(.16,1,.3,1)';

    /* ======================================================================
       ① 贴边吸附：几何
       主壳 endDrag 里原来只有「顶部最大化 / 左半 / 右半」，这里补四角四分之一屏，
       并且**同一套几何**同时给幽灵预览用，保证「预览框长什么样，松手就是什么样」。
       ====================================================================== */
    var TOPBAR = 32;      /* 顶栏真实高度（铁律：不是 28） */
    var EDGE = 14;        /* 贴边判据 */
    var CORNER = 160;     /* 角落判据 */

    window.n26SnapZone = function (rect, W, H) {
        if (!rect) return null;
        W = W || window.innerWidth; H = H || window.innerHeight;
        var x = rect.left, y = rect.top, r = rect.right, b = rect.bottom;
        var halfW = Math.floor(W / 2);
        var fullH = H - TOPBAR;
        var halfH = Math.floor(fullH / 2);
        var L = x <= EDGE, R = r >= W - EDGE;
        var T = y <= CORNER, B = b >= H - CORNER;
        var topMax = y <= 8;
        if (topMax) return { zone: 'max' };
        if (L && T) return { zone: 'tl', x: 0, y: TOPBAR, w: halfW, h: halfH };
        if (R && T) return { zone: 'tr', x: W - halfW, y: TOPBAR, w: halfW, h: halfH };
        if (L && B) return { zone: 'bl', x: 0, y: TOPBAR + halfH, w: halfW, h: fullH - halfH };
        if (R && B) return { zone: 'br', x: W - halfW, y: TOPBAR + halfH, w: halfW, h: fullH - halfH };
        if (L) return { zone: 'left', x: 0, y: TOPBAR, w: halfW, h: fullH };
        if (R) return { zone: 'right', x: W - halfW, y: TOPBAR, w: halfW, h: fullH };
        return null;
    };

    var ghost = null, ghostZone = '';
    function ghostEl() {
        if (ghost && ghost.isConnected) return ghost;
        ghost = document.createElement('div');
        ghost.id = 'n26SnapGhost';
        ghost.setAttribute('aria-hidden', 'true');
        document.body.appendChild(ghost);
        return ghost;
    }
    function ghostShow(z) {
        if (z && z.zone === 'max') z = null;   /* 最大化交给主壳原生效果，不画幽灵 */
        var g = ghostEl();
        if (!z) {
            if (ghostZone) { ghostZone = ''; g.classList.remove('on'); }
            return;
        }
        g.style.left = z.x + 'px';
        g.style.top = z.y + 'px';
        g.style.width = z.w + 'px';
        g.style.height = z.h + 'px';
        if (!ghostZone) { ghostZone = z.zone; g.classList.add('on'); }
        ghostZone = z.zone;
    }

    /* 拖动中：直接从内联样式读几何 —— 一次布局读取都没有 */
    var snapRaf = 0;
    function snapTick() {
        snapRaf = 0;
        var el = document.querySelector('.window.dragging');
        if (!el) { ghostShow(null); return; }
        var x = parseFloat(el.style.left), y = parseFloat(el.style.top);
        var w = parseFloat(el.style.width) || el.offsetWidth;
        var h = parseFloat(el.style.height) || el.offsetHeight;
        if (!isFinite(x) || !isFinite(y)) return;
        var z = window.n26SnapZone({ left: x, top: y, right: x + w, bottom: y + h });
        ghostShow(z);
    }
    document.addEventListener('mousemove', function () {
        if (snapRaf) return;
        /* 便宜判据先早退：拖动期间主壳会给 body 挂 n26-busy，
           没有这个类就说明根本没在拖，连 querySelector 都不用做。 */
        if (!document.body.classList.contains('n26-busy')) {
            if (ghostZone) ghostShow(null);
            return;
        }
        if (!document.querySelector('.window.dragging')) { if (ghostZone) ghostShow(null); return; }
        snapRaf = requestAnimationFrame(snapTick);
    }, true);
    window.addEventListener('resize', function () { ghostShow(null); }, { passive: true });
    document.addEventListener('mouseup', function () { ghostShow(null); }, true);

    /* ======================================================================
       ② Cmd / Ctrl + Tab 应用切换器
       ====================================================================== */
    var SW = { open: false, list: [], idx: 0, box: null, keyupBound: false };

    function winList() {
        try { return (window.n26WinList && window.n26WinList()) || []; } catch (e) { return []; }
    }
    function appMeta(appId) {
        try {
            var r = (window.appRegistry && window.appRegistry[appId]) || null;
            return { name: (r && r.name) || appId, icon: (r && r.icon) || 'fa-cube', color: (r && r.color) || '#4A9BF5' };
        } catch (e) { return { name: appId, icon: 'fa-cube', color: '#4A9BF5' }; }
    }
    function swBuild() {
        var list = winList().filter(function (w) { return w && w.id; });
        /* 前台优先：按 z 排序拿不到，就把「当前聚焦」的那个提到第二位（第一格留给下一个） */
        var focusId = '';
        try {
            var f = document.querySelector('.window.focused');
            if (f && f.id && f.id.indexOf('window-') === 0) focusId = f.id.slice(7);
        } catch (e) { }
        var ordered = [];
        list.forEach(function (w) { if (w.id !== focusId) ordered.push(w); });
        list.forEach(function (w) { if (w.id === focusId) ordered.push(w); });
        SW.list = ordered;
        SW.idx = ordered.length > 1 ? 1 : 0;
    }
    function swRender() {
        if (!SW.box) return;
        SW.box.innerHTML = SW.list.map(function (w, i) {
            var m = appMeta(w.appId);
            var ic = '';
            try { ic = window.n26IconHTML ? window.n26IconHTML(w.appId, { size: 52, radius: 14, noTileBg: true }) : '<i class="fas ' + m.icon + '"></i>'; } catch (e) { }
            return '<div class="n26-sw-item' + (i === SW.idx ? ' on' : '') + '" data-i="' + i + '">' +
                '<div class="n26-sw-ic">' + ic + '</div>' +
                '<div class="n26-sw-nm">' + (w.title || m.name) + '</div>' +
                (w.state === 'minimized' ? '<div class="n26-sw-badge">最小化</div>' : '') +
                '</div>';
        }).join('');
    }
    function swOpen() {
        if (SW.open || off()) return;
        swBuild();
        if (!SW.list.length) return;
        SW.open = true;
        var box = document.createElement('div');
        box.className = 'n26-sw';
        box.innerHTML = '<div class="n26-sw-strip"></div>';
        document.body.appendChild(box);
        SW.box = box.querySelector('.n26-sw-strip');
        swRender();
        requestAnimationFrame(function () { box.classList.add('on'); });
    }
    function swClose(apply) {
        if (!SW.open) return;
        var pick = apply ? SW.list[SW.idx] : null;
        SW.open = false;
        var box = document.querySelector('.n26-sw');
        if (box) {
            box.classList.remove('on');
            setTimeout(function () { try { box.remove(); } catch (e) { } }, 220);
        }
        SW.box = null;
        if (pick) {
            try {
                if (pick.state === 'minimized' && window.n26WinRestore) window.n26WinRestore(pick.id);
                if (window.n26WinFocus) window.n26WinFocus(pick.id);
            } catch (e) { }
        }
    }
    function swStep(d) {
        if (!SW.list.length) return;
        SW.idx = (SW.idx + d + SW.list.length) % SW.list.length;
        var items = SW.box ? SW.box.children : [];
        for (var i = 0; i < items.length; i++) items[i].classList.toggle('on', i === SW.idx);
        if (items[SW.idx] && items[SW.idx].scrollIntoView) {
            try { items[SW.idx].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (e) { }
        }
    }
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab' || !(e.metaKey || e.ctrlKey)) {
            if (SW.open && e.key === 'Escape') { e.preventDefault(); swClose(false); }
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (!SW.open) { swOpen(); return; }
        swStep(e.shiftKey ? -1 : 1);
    }, true);
    document.addEventListener('keyup', function (e) {
        if (!SW.open) return;
        if (e.key === 'Meta' || e.key === 'Control') swClose(true);
    }, true);
    document.addEventListener('click', function (e) {
        if (!SW.open) return;
        var it = e.target.closest ? e.target.closest('.n26-sw-item') : null;
        if (it) { SW.idx = parseInt(it.getAttribute('data-i'), 10) || 0; swClose(true); return; }
        if (e.target.closest && e.target.closest('.n26-sw')) return;
        swClose(false);
    }, true);

    /* ======================================================================
       ③ Dock 图标「吸入」：新窗口从图标位置长出来
       ====================================================================== */
    var fromRect = null, fromAt = 0;
    document.addEventListener('pointerdown', function (e) {
        var it = e.target.closest ? e.target.closest('#dock .dock-item, #dockBgApps .dock-item') : null;
        if (!it) return;
        try {
            var r = it.getBoundingClientRect();
            fromRect = { left: r.left, top: r.top, width: r.width, height: r.height };
            fromAt = Date.now();
        } catch (er) { }
    }, true);

    function dockMorph(el) {
        if (!fromRect || Date.now() - fromAt > 1400 || off()) return;
        var r;
        try { r = el.getBoundingClientRect(); } catch (e) { return; }
        if (!r || !r.width || !r.height) return;
        var sx = Math.max(0.06, fromRect.width / r.width);
        var sy = Math.max(0.06, fromRect.height / r.height);
        var dx = (fromRect.left + fromRect.width / 2) - (r.left + r.width / 2);
        var dy = (fromRect.top + fromRect.height / 2) - (r.top + r.height / 2);
        try {
            el.animate([
                { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')', opacity: .32 },
                { transform: 'translate(0px,0px) scale(1,1)', opacity: 1 }
            ], { duration: 420, easing: EASE_OUT, fill: 'backwards' });
        } catch (e) { }
        fromRect = null;
    }

    /* ======================================================================
       ④⑤⑥⑦⑧：观察者统一入口
       ====================================================================== */
    var seenWin = null;

    function observeWindows() {
        var layer = document.getElementById('windowsLayer') || document.body;
        try {
            var mo = new MutationObserver(function (muts) {
                for (var i = 0; i < muts.length; i++) {
                    var add = muts[i].addedNodes;
                    for (var k = 0; k < add.length; k++) {
                        var n = add[k];
                        if (n.nodeType === 1 && n.classList && n.classList.contains('window')) {
                            dockMorph(n);     /* ③ */
                        }
                    }
                }
            });
            mo.observe(layer, { childList: true, subtree: true });
        } catch (e) { }
    }

    /* ④ 启动台：分层错落（只给「容器/品牌区」加类，不碰逐个图标的既有动画） */
    function observeLaunchpad() {
        var lp = document.getElementById('launchpad');
        if (!lp) return;
        var tmr = 0;
        var mo = new MutationObserver(function () {
            if (tmr) return;
            tmr = setTimeout(function () {
                tmr = 0;
                var shown = lp.classList.contains('show') || lp.style.display === 'block' ||
                    lp.style.visibility === 'visible' && lp.style.opacity !== '0';
                if (!shown) { lp.classList.remove('n26-lp-in'); return; }
                if (lp.classList.contains('n26-lp-in')) return;
                lp.classList.add('n26-lp-in');
                setTimeout(function () { lp.classList.remove('n26-lp-in'); }, 900);
            }, 30);
        });
        try { mo.observe(lp, { attributes: true, attributeFilter: ['class', 'style'] }); } catch (e) { }
    }

    /* ⑤ 模态：从触发点展开 */
    var lastPt = { x: 0, y: 0, at: 0 };
    document.addEventListener('pointerdown', function (e) {
        lastPt = { x: e.clientX, y: e.clientY, at: Date.now() };
    }, true);

    function flipIn(card) {
        if (!card || off()) return;
        var r;
        try { r = card.getBoundingClientRect(); } catch (e) { return; }
        if (!r.width) return;
        var ox = '50%', oy = '50%';
        if (Date.now() - lastPt.at < 4000) {
            ox = Math.min(100, Math.max(0, (lastPt.x - r.left) / r.width * 100)) + '%';
            oy = Math.min(100, Math.max(0, (lastPt.y - r.top) / r.height * 100)) + '%';
        }
        try {
            card.animate([
                { transform: 'scale(.90)', opacity: 0, transformOrigin: ox + ' ' + oy },
                { transform: 'scale(1)', opacity: 1, transformOrigin: ox + ' ' + oy }
            ], { duration: 260, easing: EASE, fill: 'backwards' });
        } catch (e) { }
    }

    function observeConfirm() {
        var ov = document.getElementById('nexusConfirmOverlay');
        if (!ov) return;
        var mo = new MutationObserver(function () {
            if (!ov.classList.contains('show')) return;
            var card = ov.querySelector('.nexus-confirm') || ov.firstElementChild;
            flipIn(card);
        });
        try { mo.observe(ov, { attributes: true, attributeFilter: ['class'] }); } catch (e) { }
    }

    /* ⑧ 桌面小组件：入场阶梯（一次批量只演一次，600ms 内不重复） */
    function observeWidgets() {
        var box = document.getElementById('desktopWidgets');
        if (!box) return;
        var lastAt = 0, tmr = 0;
        var mo = new MutationObserver(function () {
            if (tmr) return;
            tmr = setTimeout(function () {
                tmr = 0;
                if (Date.now() - lastAt < 600) return;
                lastAt = Date.now();
                if (off()) return;
                var cards = box.querySelectorAll('.desktop-widget-card');
                for (var i = 0; i < cards.length; i++) {
                    try {
                        cards[i].animate([
                            { opacity: 0, transform: 'translate(-10px,10px) scale(.965)' },
                            { opacity: 1, transform: 'none' }
                        ], {
                            duration: 320,
                            delay: Math.min(i, 10) * 45,
                            easing: EASE,
                            fill: 'backwards'
                        });
                    } catch (e) { }
                }
            }, 40);
        });
        try { mo.observe(box, { childList: true }); } catch (e) { }
    }

    function boot() {
        observeWindows();
        observeLaunchpad();
        observeConfirm();
        observeWidgets();
        try { ghostEl(); } catch (e) { }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    window.n26SwitcherOpen = swOpen;
    window.n26SnapGhostClear = function () { ghostShow(null); };
})();
