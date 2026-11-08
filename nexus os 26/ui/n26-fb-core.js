/* ============================================================================
 * Nexus OS 26 · 首次进入构建动画 —— 纯计算节拍状态机（N26FBCore）
 * ----------------------------------------------------------------------------
 * 交接文档《首次进入构建动画-交接.md》第三节的两条死约束，全部在这里钉死：
 *
 *   ① 唯一时间源：stateAt(t) 只接受一个绝对时间 t（秒）。t 在运行时只能来自
 *      bgm.currentTime（音频时钟），降级时来自 performance.now() 偏移。
 *      本文件不创建任何 WAAPI 动画、不写任何 CSS duration、不注册 rAF、不读时钟。
 *      => 不可能出现「一帧内完成」：任意 t 都能独立求出完整画面（可 seek）。
 *   ② 真节点：本文件只输出「几何 + 透明度」，由 n26-firstboot.js 写到真实桌面
 *      DOM 节点上。这里没有自绘假桌面、没有代理图形；辅助线/聚焦框/指针是
 *      「构建过程可视化」，标记 kind='guide'，不冒充桌面内容。
 *
 * 设计基准 1440×900（real-desktop/inventory.json 实测）。窗口「三窗并排」采用
 * 340×280 统一骨架：1440 宽放不下 3 个 700×500，硬放必然重叠（文档 §4.2 判违规）。
 * 骨架节点复用真实 .window / .window-titlebar / .window-content 结构与 CSS，
 * 动画结束即移除，交回桌面时真实窗口仍是 700×500。
 *
 * UMD：浏览器挂 window.N26FBCore；Node 里 require() 直接跑全片自检（不开浏览器）。
 * ==========================================================================*/
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.N26FBCore = api;
})(typeof globalThis !== 'undefined' ? globalThis
    : (typeof window !== 'undefined' ? window : this), function () {
    'use strict';

    /* ---------- 1. 节拍常量（beat-map.json，一字不改） ---------- */
    var PERIOD = 0.4876;      // 拍长
    var PHASE = 0.205;        // 第 0 拍
    var TOTAL = 60.952;       // 音轨总长
    var BEATS = 125;
    function B(n) { return PHASE + PERIOD * n; }
    function beatIndex(t) { return (t - PHASE) / PERIOD; }
    function isDownbeat(n) { return n % 4 === 0; }

    /* ---------- 2. 缓动：与 CSS cubic-bezier 完全一致（解 x(t)=p） ---------- */
    function bezier(x1, y1, x2, y2) {
        function cx(t) { return ((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t * t + 3 * x1 * t; }
        function cy(t) { return ((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t * t + 3 * y1 * t; }
        function dx(t) { return 3 * (1 - 3 * x2 + 3 * x1) * t * t + 2 * (3 * x2 - 6 * x1) * t + 3 * x1; }
        return function (p) {
            if (p <= 0) return 0;
            if (p >= 1) return 1;
            var t = p, i, d, s;
            for (i = 0; i < 8; i++) {
                d = cx(t) - p;
                if (Math.abs(d) < 1e-6) return cy(t);
                s = dx(t);
                if (Math.abs(s) < 1e-6) break;
                t -= d / s;
            }
            var lo = 0, hi = 1;
            t = p;
            for (i = 0; i < 24; i++) {
                d = cx(t) - p;
                if (Math.abs(d) < 1e-6) break;
                if (d > 0) hi = t; else lo = t;
                t = (lo + hi) / 2;
            }
            return cy(t);
        };
    }
    var E_BUILD = bezier(.33, 0, .2, 1);      // 镜头 1–4 构建
    var E_SOFT = bezier(.16, 1, .3, 1);       // 镜头 5/6/8/9 落位
    var E_CAM = bezier(.45, .05, .25, 1);     // 指针
    var E_SPRING = bezier(.34, 1.56, .64, 1); // Dock 图标弹起 / 镜头 10
    var E_LINEAR = function (p) { return p; };

    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function lerp(a, b, p) { return a + (b - a) * p; }
    /* 段内进度：ease 已内嵌，返回 0..1（注意 E_SPRING 可 >1，过冲是设计意图） */
    function span(t, t0, t1, ease) {
        if (t1 <= t0) return t >= t1 ? 1 : 0;
        return (ease || E_LINEAR)(clamp((t - t0) / (t1 - t0), 0, 1));
    }

    /* ---------- 3. 十个镜头（拍号 → 时间码 → 相机） ----------
     * x/y 为视口百分比（相对 1440 / 900），四层视差系数见 LAYER_FACTOR。
     * 相机只写 translate3d + scale，壁纸层系数 0 = 锁死。 */
    var SCENES = [
        { id: 1, b0: 0, b1: 7, ease: E_BUILD, s0: 1.000, s1: 1.035, x0: 0, x1: 0, y0: 0, y1: 0, name: '聚焦框 + 辅助线' },
        { id: 2, b0: 7, b1: 19, ease: E_BUILD, s0: 1.035, s1: 1.055, x0: -0.8, x1: 0.8, y0: 0, y1: 0, name: '三个真实图标逐个生成' },
        { id: 3, b0: 19, b1: 31, ease: E_BUILD, s0: 1.055, s1: 1.020, x0: 0.8, x1: 0, y0: 0, y1: 0, name: '图标展开为窗口骨架' },
        { id: 4, b0: 31, b1: 44, ease: E_BUILD, s0: 1.020, s1: 1.010, x0: 0, x1: 0.6, y0: 0, y1: 0, name: '窗口内容逐层显形' },
        { id: 5, b0: 44, b1: 60, ease: E_SOFT, s0: 1.010, s1: 1.000, x0: 0.6, x1: 0, y0: 0, y1: 0.35, name: 'Dock 空轨探入' },
        { id: 6, b0: 60, b1: 75, ease: E_SOFT, s0: 1.000, s1: 1.005, x0: 0, x1: 0, y0: 0.35, y1: -0.30, name: '顶栏元素依次落位' },
        { id: 7, b0: 75, b1: 92, ease: E_CAM, s0: 1.005, s1: 1.012, x0: 0, x1: 0, y0: -0.30, y1: 0, name: '指针掠过 Dock / 图标弹起' },
        { id: 8, b0: 92, b1: 108, ease: E_SOFT, s0: 1.012, s1: 1.006, x0: -0.7, x1: 0.5, y0: 0, y1: 0, name: '三窗并排 / 图标小组件入场' },
        { id: 9, b0: 108, b1: 117, ease: E_SOFT, s0: 1.006, s1: 1.000, x0: 0.5, x1: 0, y0: 0, y1: 0, name: '三窗按 2 拍间隔缩没' },
        { id: 10, b0: 117, b1: 124, ease: E_SPRING, s0: 1.000, s1: 0.995, x0: 0, x1: 0, y0: 0, y1: 0, name: 'AI 小方引导 / 交回桌面' }
    ];
    SCENES.forEach(function (s) { s.t0 = B(s.b0); s.t1 = s.id === 10 ? TOTAL : B(s.b1); });

    var LAYER_FACTOR = { bg: 0, icons: 0.35, windows: 1.0, dock: 0.72, topbar: 0.28 };

    /* ---------- 4. 默认几何（inventory.json 1440×900 实测） ----------
     * renderer 可把实测 rect 传进来覆盖；本默认值保证纯 Node 自检可独立运行。 */
    function defaultMetrics(over) {
        var M = {
            vw: 1440, vh: 900,
            dock: { x: 509, y: 818, w: 423, h: 72 },
            dockItems: [
                { x: 524, y: 829, w: 50, h: 50 }, { x: 599, y: 829, w: 50, h: 50 },
                { x: 674, y: 829, w: 50, h: 50 }, { x: 749, y: 829, w: 50, h: 50 },
                { x: 805, y: 829, w: 50, h: 50 }, { x: 861, y: 829, w: 50, h: 50 }
            ],
            separators: [
                { x: 586, y: 839, w: 1, h: 30 }, { x: 661, y: 839, w: 1, h: 30 },
                { x: 736, y: 839, w: 1, h: 30 }
            ],
            topbar: {
                left: { x: 0, y: 7, w: 151, h: 19 },
                right: { x: 151, y: 5, w: 244, h: 23 }
            },
            topbarItemCount: 8,
            /* 三窗并排：留开左侧桌面图标区（x<200），彼此 gap 50 */
            windows: [
                { x: 250, y: 210, w: 340, h: 280 },
                { x: 640, y: 210, w: 340, h: 280 },
                { x: 1030, y: 210, w: 340, h: 280 }
            ],
            /* 桌面图标真实位（左上第一列），renderer 用 getBoundingClientRect 覆盖 */
            icons: [
                { x: 20, y: 100, w: 80, h: 88 },
                { x: 20, y: 196, w: 80, h: 88 },
                { x: 20, y: 292, w: 80, h: 88 }
            ],
            widgets: []
        };
        if (over) for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) M[k] = over[k];
        M.s = M.vw / 1440;
        return M;
    }

    /* 元素构造：几何 + 透明度 + 渲染细节 */
    function el(id, kind, layer, g, opacity, extra) {
        var e = {
            id: id, kind: kind, layer: layer,
            x: g.x, y: g.y, w: g.w, h: g.h, opacity: clamp(opacity, 0, 1)
        };
        if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) e[k] = extra[k];
        return e;
    }
    function copyG(g, dx, dy) { return { x: g.x + (dx || 0), y: g.y + (dy || 0), w: g.w, h: g.h }; }

    /* ---------- 5. stateAt(t, M) —— 唯一入口，任意 t 独立可求 ---------- */
    function stateAt(tRaw, M) {
        tRaw = clamp(Number(tRaw) || 0, 0, TOTAL);
        M = M || defaultMetrics();
        if (!M.s) M.s = M.vw / 1440;

        /* 找当前镜头 */
        var sc = SCENES[SCENES.length - 1], si = SCENES.length - 1, i;
        for (i = 0; i < SCENES.length; i++) {
            if (tRaw < SCENES[i].t1 || i === SCENES.length - 1) { sc = SCENES[i]; si = i; break; }
        }
        var sp = span(tRaw, sc.t0, sc.t1, sc.ease);   // 镜头进度（可过冲）
        var scale = lerp(sc.s0, sc.s1, sp);
        var camXpct = lerp(sc.x0, sc.x1, sp);
        var camYpct = lerp(sc.y0, sc.y1, sp);
        var camX = camXpct / 100 * 1440;
        var camY = camYpct / 100 * 900;

        var camera = {
            scale: scale, tx: camX, ty: camY,
            ox: 720, oy: 450,           // 缩放原点（屏幕中心）
            factors: LAYER_FACTOR
        };
        /* 每层实际位移 = 相机位移 × 该层系数。
         * 贴边 UI（顶栏 x=0 / Dock 贴底 / 图标贴左）做「边界钳制」：方向不变、
         * 幅度只减不增，否则镜头 8 的 −0.7% 横移会把顶栏推成负坐标（实测踩到过）。
         * 相机 scale 只作用于「构建区」层（renderer 的 #n26fb-cam），顶栏/Dock 是
         * 固定 UI 不进该层 —— 因此本函数输出的就是最终「布局几何」，自检零歧义。 */
        function shift(layer) {
            var f = LAYER_FACTOR[layer] === undefined ? 1 : LAYER_FACTOR[layer];
            var dx = camX * f, dy = camY * f;
            if (layer === 'topbar') {
                var L = M.topbar.left;
                if (L.x + dx < 0) dx = -L.x;
                if (L.x + L.w + dx > M.vw) dx = M.vw - L.w - L.x;
                if (L.y + dy < 0) dy = -L.y;
            } else if (layer === 'dock') {
                if (M.dock.x + dx < 0) dx = -M.dock.x;
                if (M.dock.x + M.dock.w + dx > M.vw) dx = M.vw - M.dock.w - M.dock.x;
                if (M.dock.y + dy < 0) dy = -M.dock.y;
                if (M.dock.y + M.dock.h + dy > M.vh) dy = M.vh - M.dock.h - M.dock.y;
            } else if (layer === 'icons') {
                var im = M.icons[0] || { x: 0, y: 0, w: 0, h: 0 };
                if (im.x + dx < 0) dx = -im.x;
                if (im.y + dy < 0) dy = -im.y;
            }
            return { dx: dx, dy: dy };
        }
        /* 四层位移一次算好，杜绝「镜头 7 误用镜头 6 顶栏位移」这类串层 bug */
        var shW = shift('windows'), shI = shift('icons');
        var shD = shift('dock'), shT = shift('topbar');

        var E = [];
        var t = tRaw, k, p, g;

        /* ===== 镜头 1：聚焦框落下 + 辅助线自中心向两端生长 ===== */
        var s1 = SCENES[0].t0, s1e = SCENES[0].t1;
        var pFocus = span(t, s1 + 0.1, s1 + 2.4, E_BUILD);      // 约 4.7 拍
        var pLine = span(t, s1 + 0.35, s1e - 0.15, E_BUILD);
        var pGuideOut = span(t, s1e - 0.5, SCENES[1].t0 + 0.4, E_LINEAR); // 构建辅助层淡出
        var leftWin = M.windows[0];
        var focusG = {
            x: lerp(670, leftWin.x, pFocus) + shW.dx,
            y: lerp(410, leftWin.y, pFocus) + shW.dy,
            w: lerp(100, leftWin.w, pFocus), h: lerp(60, leftWin.h, pFocus)
        };
        E.push(el('focus', 'guide', 'windows', focusG,
            Math.min(1, pFocus * 1.6) * (1 - pGuideOut),
            { dash: 1, label: '聚焦框' }));
        /* 辅助线：水平 1 条 + 垂直 1 条，自中心向两端生长；线宽 1px 不算重叠 */
        var halfW = 620 * pLine, halfH = 300 * pLine;
        var lineAlpha = pLine * 0.55 * (1 - pGuideOut);
        E.push(el('guide-h', 'guide', 'windows',
            { x: 720 - halfW + shW.dx, y: 450 + shW.dy, w: halfW * 2, h: 1 },
            lineAlpha, { line: 'h' }));
        E.push(el('guide-v', 'guide', 'windows',
            { x: 720 + shW.dx, y: 450 - halfH + shW.dy, w: 1, h: halfH * 2 },
            lineAlpha, { line: 'v' }));

        /* ===== 镜头 2/3/8：同一组真实桌面图标，全程连续（无硬跳变） =====
         * 起形(4拍) → 随窗口展开渐隐 → 镜头 8 随视差再入场 → 交回桌面全显。
         * 之前用「到点直接 opacity=0」造成一帧内完成，已修。 */
        var s2 = SCENES[1].t0, s3 = SCENES[2].t0, s8 = SCENES[7].t0;
        var iconDur = PERIOD * 4;
        var pDesk = span(t, s8, s8 + PERIOD * 8, E_SOFT);
        for (k = 0; k < 3; k++) {
            var ip = span(t, s2 + k * iconDur, s2 + k * iconDur + iconDur, E_BUILD);
            var wp = span(t, s3 + k * iconDur, s3 + k * iconDur + iconDur, E_BUILD);
            var a = ip * (1 - wp);
            if (t >= s8) a = Math.max(a, pDesk);
            var ig = M.icons[k] || M.icons[0];
            var vis = Math.max(ip, pDesk);
            var rise = (1 - vis) * 22;
            E.push(el('icon-' + k, 'content', 'icons',
                { x: ig.x + shI.dx, y: ig.y + rise + shI.dy, w: ig.w, h: ig.h },
                a, { scale: lerp(0.88, 1, vis), dy: rise, order: k }));
        }

        /* ===== 镜头 3：图标就地向右展开为窗口骨架（每窗 4 拍） ===== */
        var winDur = PERIOD * 4;
        for (k = 0; k < 3; k++) {
            var wStart = s3 + k * winDur;
            var wp = span(t, wStart, wStart + winDur, E_BUILD);
            var wg = M.windows[k];
            var src = M.icons[k] || M.icons[0];
            /* 在「自己的最终槽位」内原地生长（中心固定），不是从图标区平移过去：
             * 三窗若都从左侧图标区出发，途中必然互相穿过并压住图标（实测 26 帧重叠）。
             * 这也正好呼应镜头 1「聚焦框落到未来窗口槽」——槽位本就是预告好的。 */
            var cw = lerp(src.w, wg.w, wp), ch = lerp(2, wg.h, wp);
            var grow = {
                x: wg.x + (wg.w - cw) / 2 + shW.dx,
                y: wg.y + (wg.h - ch) / 2 + shW.dy,
                w: cw, h: ch
            };
            /* 镜头 9：按 2 拍间隔原地缩没，中心收束，不留残影 */
            var cStart = SCENES[8].t0 + k * PERIOD * 2;
            var cp = span(t, cStart, cStart + PERIOD * 2.4, E_SOFT);
            var gone = 1 - cp;
            var cg = {
                x: grow.x + (grow.w * (1 - gone)) / 2,
                y: grow.y + (grow.h * (1 - gone)) / 2,
                w: grow.w * gone, h: grow.h * gone
            };
            E.push(el('window-' + k, 'content', 'windows', cg,
                clamp(wp * 1.25, 0, 1) * gone,
                {
                    titlebarH: lerp(2, 34, wp),
                    gridReveal: span(t, wStart + winDur * 0.55, wStart + winDur, E_LINEAR),
                    itemsReveal: span(t, SCENES[3].t0 + k * PERIOD * 3,
                        SCENES[3].t0 + k * PERIOD * 3 + PERIOD * 4, E_SOFT),
                    order: k
                }));
        }

        /* ===== 镜头 4 的骨架细节：由 itemsReveal / gridReveal 连续推进，见上 ===== */

        /* ===== 镜头 5：Dock 空轨自屏外探入半截，板内零图标 ===== */
        var s5 = SCENES[4].t0;
        var pDock = span(t, s5, s5 + PERIOD * 6, E_SOFT);       // 探入 6 拍 + 静置 10 拍
        var dockY = M.dock.y + (1 - pDock) * 92;                 // 自屏外下方探入
        var dockG = { x: M.dock.x + shD.dx, y: dockY + shD.dy, w: M.dock.w, h: M.dock.h };
        E.push(el('dockPlate', 'container', 'dock', dockG, pDock,
            { radius: 34, emptyRail: 1 }));
        for (k = 0; k < M.separators.length; k++) {
            E.push(el('sep-' + k, 'content', 'dock',
                { x: M.separators[k].x + shD.dx,
                  y: M.separators[k].y + (dockY - M.dock.y) + shD.dy,
                  w: M.separators[k].w, h: M.separators[k].h },
                pDock * 0.5, { parent: 'dockPlate' }));
        }

        /* ===== 镜头 6：顶栏元素依次落位（各自向下 18px 落位） ===== */
        var s6 = SCENES[5].t0;
        var tbDur = PERIOD * 1.8;
        var tbItemAlpha = [], tbItemDy = [];
        for (k = 0; k < M.topbarItemCount; k++) {
            var tp = span(t, s6 + k * (PERIOD * 1.7), s6 + k * (PERIOD * 1.7) + tbDur, E_SOFT);
            tbItemAlpha.push(tp);
            tbItemDy.push((1 - tp) * -18);   // 从上方 -18px 落到 0
        }
        var tbAlpha = span(t, s6, s6 + PERIOD * 2, E_SOFT);
        E.push(el('topbar-left', 'content', 'topbar', copyG(M.topbar.left, shT.dx, shT.dy),
            tbAlpha, { items: tbItemAlpha, itemDy: tbItemDy, half: 'left' }));
        E.push(el('topbar-right', 'content', 'topbar', copyG(M.topbar.right, shT.dx, shT.dy),
            tbAlpha, { items: tbItemAlpha, itemDy: tbItemDy, half: 'right' }));

        /* ===== 镜头 7：指针掠过 Dock，6 图标按序弹起（单次过冲即停） ===== */
        var s7 = SCENES[6].t0, s7e = SCENES[6].t1;
        var pPointer = span(t, s7, s7 + PERIOD * 5, E_CAM);
        var px = lerp(360, 920, pPointer), py = lerp(560, 800, E_CAM(pPointer));
        /* 淡入/淡出各 2 拍且用匀速：E_SOFT 是「快出」曲线，前 100ms 就能冲到
         * 0.55，会被判「一帧内完成」；匀速 100ms 只走 0.1。 */
        var pPtrIn = span(t, s7, s7 + PERIOD * 2, E_LINEAR);
        var pPtrOut = span(t, s7e - PERIOD * 2, s7e, E_LINEAR);
        E.push(el('pointer', 'guide', 'dock', { x: px, y: py, w: 14, h: 14 },
            pPtrIn * (1 - pPtrOut), { label: '演示指针' }));

        var iconPopStart = s7 + PERIOD * 5;
        var dockItemAlpha = [], dockItemScale = [];
        for (k = 0; k < M.dockItems.length; k++) {
            var popStart = iconPopStart + k * PERIOD * 2;
            /* 透明度走平滑曲线（显形 ≥350ms），过冲只给 scale ——
             * 否则弹簧会让 alpha 在 100ms 内冲到 1，判「一帧内完成」。 */
            var pa = span(t, popStart, popStart + PERIOD * 2, E_SOFT);
            var pp = span(t, popStart, popStart + PERIOD * 2, E_SPRING);
            dockItemAlpha.push(pa);
            /* 单次过冲即停：E_SPRING 自带过冲，不再叠加二次回弹 */
            dockItemScale.push(lerp(0.72, 1, pp));
        }
        for (k = 0; k < M.dockItems.length; k++) {
            E.push(el('dockItem-' + k, 'content', 'dock',
                { x: M.dockItems[k].x + shD.dx,
                  y: M.dockItems[k].y + (dockY - M.dock.y) + shD.dy,
                  w: M.dockItems[k].w, h: M.dockItems[k].h },
                dockItemAlpha[k],
                { parent: 'dockPlate', scale: dockItemScale[k], order: k }));
        }

        /* ===== 镜头 8：桌面图标已在「同一组 icon-*」里随视差再入场，
         * 这里只补小组件（几何由 renderer 用真实 rect 灌进 M.widgets）。 ===== */
        for (k = 0; k < M.widgets.length; k++) {
            var wg2 = M.widgets[k];
            E.push(el('widget-' + k, 'content', 'icons',
                { x: wg2.x + shI.dx, y: wg2.y + shI.dy, w: wg2.w, h: wg2.h },
                pDesk, { parent: 'desktop' }));
        }

        /* ===== 镜头 9：三窗原地缩没（已在 window-* 的 gone 中连续实现） ===== */

        /* ===== 镜头 10：AI 小方出现 → 简短引导 → 退场 ===== */
        var s10 = SCENES[9].t0;
        var pCoviIn = span(t, s10 + 0.15, s10 + PERIOD * 3, E_LINEAR);
        var pCoviOut = span(t, s10 + PERIOD * 5, SCENES[9].t1 - 0.2, E_SOFT);
        var coviAlpha = pCoviIn * (1 - pCoviOut);
        var coviScale = lerp(0.88, 1, span(t, s10 + 0.15, s10 + PERIOD * 2, E_SPRING));
        E.push(el('covi', 'content', 'windows',
            { x: 610, y: 350, w: 220, h: 132 }, coviAlpha,
            { text: '你好，我是 AI 小方', scale: coviScale }));

        /* ---------- 收尾 ---------- */
        return {
            t: tRaw,
            scene: sc.id,
            sceneIndex: si,
            sceneProgress: clamp((tRaw - sc.t0) / (sc.t1 - sc.t0), 0, 1),
            beat: beatIndex(tRaw),
            camera: camera,
            elements: E,
            dockItemAlpha: dockItemAlpha,
            dockItemScale: dockItemScale,
            topbarItemAlpha: tbItemAlpha,
            topbarItemDy: tbItemDy
        };
    }

    /* ---------- 6. 自检工具（纯计算，Node 可跑） ---------- */
    /* 参与重叠判定的只有 content 元素；container 与其 parent 子项跳过；
     * guide（辅助线/聚焦框/指针）只查出画，不参与两两重叠（它们本就交叉/接触）。 */
    function visibleContent(state) {
        return state.elements.filter(function (e) {
            return e.kind === 'content' && e.opacity > 0.02 && e.w > 1.5 && e.h > 1.5;
        });
    }
    function overlap(a, b) {
        var ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        var oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        return (ox > 1.5 && oy > 1.5) ? { ox: ox, oy: oy } : null;
    }
    function checkFrame(state, M) {
        M = M || defaultMetrics();
        var vis = visibleContent(state), out = [], ov = [], i, j, o;
        for (i = 0; i < vis.length; i++) {
            var a = vis[i];
            if (a.x < -0.5 || a.y < -0.5 || a.x + a.w > M.vw + 0.5 || a.y + a.h > M.vh + 0.5) {
                out.push({ id: a.id, x: a.x, y: a.y, w: a.w, h: a.h });
            }
            for (j = i + 1; j < vis.length; j++) {
                var b = vis[j];
                if (a.parent === b.id || b.parent === a.id) continue;  // 容器/子项
                o = overlap(a, b);
                if (o) ov.push({ a: a.id, b: b.id, ox: +o.ox.toFixed(2), oy: +o.oy.toFixed(2) });
            }
        }
        /* guide 只查出画 */
        state.elements.forEach(function (e) {
            if (e.kind !== 'guide' || e.opacity <= 0.02) return;
            if (e.x < -0.5 || e.y < -0.5 || e.x + e.w > M.vw + 0.5 || e.y + e.h > M.vh + 0.5) {
                out.push({ id: e.id, guide: true, x: e.x, y: e.y, w: e.w, h: e.h });
            }
        });
        return { overflow: out, overlaps: ov, visible: vis.length };
    }

    return {
        PERIOD: PERIOD, PHASE: PHASE, TOTAL: TOTAL, BEATS: BEATS,
        B: B, beatIndex: beatIndex, isDownbeat: isDownbeat,
        SCENES: SCENES, LAYER_FACTOR: LAYER_FACTOR,
        E_BUILD: E_BUILD, E_SOFT: E_SOFT, E_CAM: E_CAM, E_SPRING: E_SPRING,
        defaultMetrics: defaultMetrics, stateAt: stateAt,
        visibleContent: visibleContent, overlap: overlap, checkFrame: checkFrame,
        clamp: clamp, lerp: lerp, span: span
    };
});
