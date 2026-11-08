/* ==========================================================================
   Nexus OS 26 · 系统动效批次 1（ui/n26-motion.js）v2.10.11
   --------------------------------------------------------------------------
   这一批全是「加层」而不是「改层」：不碰主壳任何现有逻辑、不改任何已有
   transform / background，只在玻璃表面上追加一个 pointer-events:none 的
   光斑子层，并在全局派发点击火花。所以最坏情况是「没效果」，不会是「坏掉」。

   ① 玻璃呼吸光斑 + 指针高光：Dock / DockBar / 顶栏 / Finder 条 / 侧边 Dock
   ② 全局点击火花（body 级固定层，不动宿主布局）
   ③ Dock 图标点击的径向扩散
   ④ 窗口拖动「离地」阴影
   ⑤ 通知横幅弹簧入场

   性能纪律：高频 pointermove 一律不读布局 —— 坐标只用 clientX/clientY，
   rect 只在 pointerenter / resize 时取一次并缓存；写 DOM 用 rAF 合并。
   ========================================================================== */
(function () {
    'use strict';
    if (window.__n26Motion1) return;
    window.__n26Motion1 = true;

    var reduceMq = null;
    try { reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { }

    function off() {
        if (reduceMq && reduceMq.matches) return true;
        var b = document.body;
        if (!b) return false;
        return b.classList.contains('reduce-motion') || b.classList.contains('n26-lite');
    }

    /* ---------- ① 玻璃光斑 ---------- */
    var SURFACES = ['#dock', '#dockBar', '#finder-bar', '.n26-topbar', '.n26-dng'];
    var recs = [];          /* {el, glow, rect, at} */
    var active = null;
    var px = 0, py = 0, raf = 0;

    function ensure(el) {
        if (!el || el.__n26Glow) return null;
        el.__n26Glow = 1;
        /* 只给静态定位的宿主补 relative；fixed/absolute 的本来就是定位上下文 */
        try {
            if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        } catch (e) { }
        var g = document.createElement('div');
        g.className = 'n26-glow';
        g.setAttribute('aria-hidden', 'true');
        try { el.appendChild(g); } catch (e) { return null; }
        /* 进/出这一块时才量一次尺寸，绝不进 pointermove */
        el.addEventListener('pointerenter', function () { active = rec; markRect(rec); show(rec, true); }, { passive: true });
        el.addEventListener('pointerleave', function () { show(rec, false); if (active === rec) active = null; }, { passive: true });
        var rec = { el: el, glow: g, rect: null, at: 0 };
        recs.push(rec);
        markRect(rec);
        return rec;
    }

    function markRect(rec) {
        try {
            rec.rect = rec.el.getBoundingClientRect();
            rec.at = Date.now();
        } catch (e) { rec.rect = null; }
    }

    function show(rec, on) {
        if (!rec || !rec.glow) return;
        rec.glow.classList.toggle('on', !!on && !off());
    }

    function flush() {
        raf = 0;
        if (!active || !active.rect) return;
        var r = active.rect;
        var x = px - r.left, y = py - r.top;
        /* 越界就不写（比如从固定条上滑出去，rect 还没更新） */
        if (x < -40 || y < -40 || x > r.width + 40 || y > r.height + 40) return;
        var g = active.glow;
        if (!g) return;
        g.style.setProperty('--n26-gx', x.toFixed(1) + 'px');
        g.style.setProperty('--n26-gy', y.toFixed(1) + 'px');
    }

    window.addEventListener('pointermove', function (e) {
        if (!active) return;
        px = e.clientX; py = e.clientY;
        if (raf) return;
        raf = requestAnimationFrame(flush);
    }, { passive: true });

    function scan() {
        for (var i = 0; i < SURFACES.length; i++) {
            var list = document.querySelectorAll(SURFACES[i]);
            for (var k = 0; k < list.length; k++) {
                if (!list[k].__n26Glow) ensure(list[k]);
            }
        }
    }

    /* ---------- ② 全局点击火花 ---------- */
    function spark(x, y, isDock) {
        if (off()) return;
        var s = document.createElement('div');
        s.className = 'n26-spark' + (isDock ? ' dock' : '');
        s.style.left = x + 'px';
        s.style.top = y + 'px';
        document.body.appendChild(s);
        var gone = false;
        function kill() {
            if (gone) return;
            gone = true;
            try { s.remove(); } catch (e) { }
        }
        s.addEventListener('animationend', kill, { once: true });
        setTimeout(kill, 900);   /* 兜底：动画被打断也不留垃圾节点 */
    }

    /* ---------- ④ 窗口拖动「离地」 ---------- */
    var lifted = null;
    function lift(on, el) {
        if (lifted && lifted !== el) { try { lifted.classList.remove('n26-lift'); } catch (e) { } }
        lifted = on ? el : null;
        if (el) { try { el.classList.toggle('n26-lift', !!on); } catch (e) { } }
    }

    function winOf(node) {
        while (node && node !== document.body) {
            if (node.classList && node.classList.contains('window')) return node;
            node = node.parentNode;
        }
        return null;
    }

    document.addEventListener('pointerdown', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;

        /* 火花：所有可交互元素都给一点点回馈，但输入框/文本选区不给 */
        var hit = t.closest('button, .glass-btn, .appstore-card, .launchpad-item, .sm-app, .smt-tile, .dock-item, .settings-row, .n26-dng-item, .fu-switch, .toggle-switch');
        if (hit && !(t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
            spark(e.clientX, e.clientY, !!(hit.closest && hit.closest('#dock, #dockBar')));
        }

        /* 窗口拖动：从标题栏/头部按下就抬起来 */
        var bar = t.closest('.window-titlebar, .window-header, .titlebar');
        if (bar) {
            var w = winOf(bar);
            if (w) lift(true, w);
        }
    }, true);

    window.addEventListener('pointerup', function () { lift(false, lifted); }, { passive: true });
    window.addEventListener('pointercancel', function () { lift(false, lifted); }, { passive: true });

    /* ---------- 启动 / 重建 ---------- */
    function boot() {
        scan();
        /* Dock / DockBar 可能被整块重建，MutationObserver 只用来补挂光斑层。
           ★ 必须防抖：body 的子树变动非常频繁（开窗、列表重画），
             直接在每个 mutation 里 querySelectorAll 五次会把主线程喂饱。 */
        var tmr = 0;
        try {
            var mo = new MutationObserver(function () {
                if (tmr) return;
                tmr = setTimeout(function () { tmr = 0; scan(); }, 400);
            });
            mo.observe(document.body, { childList: true, subtree: true });
            window.__n26MotionMO = mo;
        } catch (e) { }
        window.addEventListener('resize', function () {
            for (var i = 0; i < recs.length; i++) markRect(recs[i]);
        }, { passive: true });
        /* 顶栏/Dock 高度会随设置变化，低频补量一次（250ms 不读布局，只重算缓存） */
        setInterval(function () {
            if (document.hidden) return;
            for (var i = 0; i < recs.length; i++) {
                if (!recs[i].el.isConnected) continue;
                markRect(recs[i]);
            }
        }, 2500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.n26MotionScan = scan;
})();
