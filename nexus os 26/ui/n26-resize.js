/* ==========================================================================
   Nexus OS 26 · 八方向缩放的「指针兜底」 （ui/n26-resize.js）v2.10.14
   --------------------------------------------------------------------------
   用户实测：窗口只有在四个角能拖，四条边拖不动。

   窗内本来就有 8 个 .window-rz 热区，但热区是靠 DOM 命中测试吃饭的 ——
   窗口里一旦有 iframe、滚动区、玻璃覆盖层，或者用户手指差两三像素没压到
   那条窄边，事件就被别的东西吃了，表现就是「边根本没反应」。

   这里加一层与热区无关的兜底：
     指针按下的位置只要落在窗口**视觉边缘**的一圈带子里（内 9px / 外 2px），
     就直接算出方向（n/s/w/e 或斜角）并调用主壳的 startResize。
   它不改变任何既有逻辑：原生热区接住了就完全不插手（第一句就 return）。

   为什么能兜住 iframe：热区 z-index 600 在 iframe 之上，正常情况热区先接住；
   万一某处覆盖层更狠，这里在**捕获阶段**先看坐标，坐标对了就自己起手。
   ========================================================================== */
(function () {
    'use strict';
    if (window.__n26RzFallback) return;
    window.__n26RzFallback = true;

    var IN = 9;     /* 边内可点厚度 */
    var OUT = 2;    /* 允许稍微压在窗口外沿一点点 */

    function dirOf(r, x, y) {
        var dx0 = x - r.left, dx1 = r.right - x;
        var dy0 = y - r.top, dy1 = r.bottom - y;
        if (dx0 < -OUT || dy0 < -OUT || dx1 < -OUT || dy1 < -OUT) return '';
        var v = '', h = '';
        if (dy0 <= IN) v = 'n'; else if (dy1 <= IN) v = 's';
        if (dx0 <= IN) h = 'w'; else if (dx1 <= IN) h = 'e';
        /* 角：两条边同时命中 → 斜角 */
        return v + h;
    }

    document.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        if (e.pointerType === 'touch' && e.isPrimary === false) return;
        var t = e.target;
        if (!t || !t.closest) return;
        /* 原生热区已经接住 → 绝不重复起手 */
        if (t.closest('.window-rz')) return;
        if (t.closest('.window-controls')) return;
        if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
        var win = t.closest('.window');
        if (!win) return;
        if (win.classList.contains('maximized') || win.classList.contains('dragging')) return;
        var m = /^window-(\d+)$/.exec(win.id || '');
        if (!m) return;
        var r;
        try { r = win.getBoundingClientRect(); } catch (er) { return; }
        if (!r || !r.width || !r.height) return;
        var dir = dirOf(r, e.clientX, e.clientY);
        if (!dir) return;
        if (typeof window.n26StartResize !== 'function') return;
        e.preventDefault();
        e.stopPropagation();
        window.n26StartResize(e, Number(m[1]), dir);
    }, true);
})();
