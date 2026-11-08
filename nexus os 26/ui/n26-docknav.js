/* ============================================================
   N26 DockNav — 应用内部侧边 Dock 的液态玻璃指示器
   v2.9.92 · 完全重写（用户要求：不再在旧代码上打补丁）

   设计契约（这次不许再破）：
   ① 玻璃是「容器的直接子元素」，position:absolute、left/top=0，
      坐标一律是**容器局部坐标**（几十~几百 px），永远不可能飞出窗口。
   ② 位移与形变写进**同一个 transform**：
      translate3d(x,y,0) scale(sx,sy)
      绝不使用独立的 `scale` / `translate` CSS 属性 —— 旧版把 scale
      写在独立属性上，会连带放大 fixed 浮层的视口级 translate 向量，
      玻璃于是「绕个大弯飞到窗口外再飞回来」（本版根因）。
   ③ 没有任何 transform 过渡；每一帧位置只由 rAF 写，静止即停。
   ④ 一格 ~200ms；沿运动方向拉长、垂直方向压扁、缩放原点钉在拖尾边
      → 前沿先到、后沿慢半拍跟上，到位后一次小回弹。
   ⑤ 按住当前选中格 200ms 后可沿整条 Dock 拖动玻璃，松手吸附最近项并激活。
   ⑥ 凸出：容器对应方向 overflow 为 visible 时才外扩 4px；
      被裁剪的容器自动退回零凸出，绝不硬怼出界。
   ⑦ 悬停高亮、静息灰胶囊、开关按钮形变都不属于「玻璃移动」，沿用旧 CSS/模块。

   用法：容器加 data-n26dock="v"|"h"，自动扫描注册表增强；
        保留原有 onclick / addEventListener，只叠加视觉。
   ============================================================ */
(function () {
    'use strict';
    if (window.N26DockNav) return;

    var REDUCED = false;
    try { REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }

    /* 注册表：[容器选择器, 项选择器, active类名] */
    var REGISTRY = [
        ['.as-rail[data-n26dock]', '.as-rail-item', 'active'],
        ['.fm-sidebar[data-n26dock]', '.fm-sidebar-item[onclick]', 'active'],
        ['.settings-sidebar[data-n26dock]', '.settings-item', 'active'],
        ['.ag-side-nav[data-n26dock]', '.ag-side-item', 'active'],
        ['#side[data-n26dock]', '.nav-item', 'on'],
        ['#boardChips[data-n26dock]', '.chip', 'on'],
        ['.bili-tabs[data-n26dock]', '.bili-tab', 'active'],
        ['.n26news-tabs[data-n26dock]', '.n26news-tab', 'on'],
        ['.album-tabs[data-n26dock]', '.album-tab', 'active'],
        ['.n26st-tabs[data-n26dock]', '.n26st-tab', 'on'],
        ['.dfd-tabs[data-n26dock]', '.dfd-tab', 'on'],
        ['.n26acct-tabs[data-n26dock]', '.n26acct-tab', 'active'],
        ['.nex-modal-tabs[data-n26dock]', '.nex-modal-tab', 'active'],
        ['.tabs[data-n26dock]', '.tab', 'active'],
        ['#chips[data-n26dock]', '.chip', 'active']
    ];

    var STEP_MS = 200;          // 穿过一个 tab ≈ 200ms
    var MAX_MS = 240;           // 长距离封顶：>320ms 主观就是「慢半拍」
    var HOLD_MS = 200;          // 长按多久出玻璃
    var HOLD_CANCEL = 8;        // 出玻璃前移动超过 8px 视为普通点击
    var OUT = 4;                // 允许时垂直走向的单边外扩像素
    var FADE_MS = 120;          // 到位后收运动态的时长（只收 class，不藏玻璃）
    var SNAP_MS = 110;          // 松手吸附
    var DEF_MAX = 0.13, DEF_VMAX = 520;
    var GLASS_SEQ = 0;
    var LG_OPTS = { hw: 0.30, hh: 0.20, thresh: -0.10 };

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    /* cubic-bezier(.22,.61,.36,1) 的 JS 实现：CSS 与 JS 用同一条曲线，
       二分 8 次足够（误差 < 0.001），比 ease-in-out 更「起步就走」。 */
    function bez(t, p1, p2) {
        var u = 1 - t;
        return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
    }
    function ease(p) {
        if (p <= 0) return 0;
        if (p >= 1) return 1;
        var lo = 0, hi = 1, t = p, i, v;
        for (i = 0; i < 8; i++) {
            v = bez(t, 0.22, 0.36);
            if (v < p) lo = t; else hi = t;
            t = (lo + hi) / 2;
        }
        return bez(t, 0.61, 1);
    }

    function itemsOf(cont, cfg) {
        var list = cont.querySelectorAll(cfg.item), out = [];
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            var host = el.closest ? el.closest('[data-n26dock]') : null;
            if (host === cont) out.push(el);   // 子 dock 的项不收
        }
        return out;
    }

    function enhance(cont, cfg) {
        if (cont.__n26dng) return;
        cfg = cfg || {};
        cfg.on = cfg.on || 'active';
        if (!itemsOf(cont, cfg).length) return;
        cont.__n26dng = true;
        /* v2.9.94：玻璃常驻 → 选中项自己的灰胶囊底色必须让位，否则两层叠一起 */
        cont.classList.add('n26-docknav-host', 'n26-dng-persistent');
        if (getComputedStyle(cont).position === 'static') cont.style.position = 'relative';

        /* 玻璃放进容器内部，垫在内容下面 —— 从根上杜绝「视口级坐标」 */
        var glass = document.createElement('div');
        glass.className = 'n26-dng';
        glass.setAttribute('aria-hidden', 'true');
        var gid = 'n26dng-' + (++GLASS_SEQ);
        glass.setAttribute('data-n26dng-host', gid);
        cont.setAttribute('data-n26dng-id', gid);
        cont.insertBefore(glass, cont.firstChild);

        var axis = 'v';
        var cur = null;             // 当前激活项
        /* v2.10.3：把「当前选中项」显式打上 data-n26dng-on。
           原来靠一长串类名白名单让灰底让位（.as-rail-item.active / .fm-sidebar-item.active …），
           每加一个新应用就要补一条；现在只要模块认出的选中项一律让位，
           玻璃就是唯一的高亮，不会再出现「灰胶囊 + 玻璃」双层塑料感。 */
        var markOnLast = null;
        function markOn(item) {
            if (markOnLast && markOnLast !== item && markOnLast.removeAttribute) {
                markOnLast.removeAttribute('data-n26dng-on');
            }
            if (item && item.setAttribute) item.setAttribute('data-n26dng-on', '1');
            markOnLast = item;
        }
        var geo = null;             // 当前玻璃 {x,y,w,h}（局部坐标）
        var boxes = null;           // 一次批量读的结果：[{el,x,y,w,h}]（w/h 是布局尺寸）
        var ox0 = 0, oy0 = 0;       // 容器局部坐标原点（client 坐标 → 局部）
        var ovX = 'visible', ovY = 'visible';
        var raf = 0, token = 0, fadeT = 0, alignT = 0, liveT = 0;
        var busy = false, dragging = false;
        var skipActivate = false, suppress = false;
        var lgQ = null, lgT = 0, lastTf = '', lastOrg = '', lastW = 0, lastH = 0;
        var warmed = Object.create(null);

        /* ★ 唯一的读入口：一次拿齐容器原点 + 所有项的局部矩形。
           w/h 一律取布局尺寸 offsetWidth/offsetHeight —— getBoundingClientRect 会
           把 transform / 悬停放大算进去，贴图尺寸随之漂移，折射就会被反复重建。 */
        function measure() {
            var it = itemsOf(cont, cfg), n = it.length;
            var c = cont.getBoundingClientRect();
            ox0 = c.left + cont.clientLeft - cont.scrollLeft;
            oy0 = c.top + cont.clientTop - cont.scrollTop;
            var cs = getComputedStyle(cont);
            ovX = cs.overflowX; ovY = cs.overflowY;
            var out = new Array(n);
            for (var i = 0; i < n; i++) {
                var el = it[i], r = el.getBoundingClientRect();
                out[i] = {
                    el: el,
                    x: r.left - ox0,
                    y: r.top - oy0,
                    w: el.offsetWidth || r.width,
                    h: el.offsetHeight || r.height
                };
            }
            boxes = out;
            return out;
        }
        function boxOfItem(el) {
            var b = boxes;
            if (b) for (var i = 0; i < b.length; i++) if (b[i].el === el) return b[i];
            b = measure();
            for (var j = 0; j < b.length; j++) if (b[j].el === el) return b[j];
            return null;
        }
        function toLocal(clientX, clientY) {
            return { x: clientX - ox0, y: clientY - oy0 };
        }

        function closestItem(t) {
            if (!t || !t.closest) return null;
            var el = t.closest(cfg.item);
            if (!el || !cont.contains(el)) return null;
            return itemsOf(cont, cfg).indexOf(el) >= 0 ? el : null;
        }
        function findActive() {
            var it = itemsOf(cont, cfg);
            for (var i = 0; i < it.length; i++) if (it[i].classList.contains(cfg.on)) return it[i];
            return null;
        }

        function detectAxis() {
            var d = cont.getAttribute('data-n26dock');
            if (d === 'v' || d === 'h') { axis = d; return; }
            var b = boxes || measure();
            if (b.length >= 2) {
                axis = Math.abs(b[1].y - b[0].y) >= Math.abs(b[1].x - b[0].x) ? 'v' : 'h';
            }
        }

        /* 玻璃盒：垂直走向以整条 Dock 为基准，允许时两侧各外扩 OUT；
           沿走向以选中项为基准。容器会裁剪时自动不凸出。 */
        function boxOf(item) {
            var r = boxOfItem(item);
            if (!r) return { x: 0, y: 0, w: 1, h: 1 };
            var o = (axis === 'v' ? ovX : ovY) === 'visible' ? OUT : 0;
            if (axis === 'v') {
                return { x: -o, y: r.y - o, w: cont.clientWidth + o * 2, h: r.h + o * 2 };
            }
            return { x: r.x - o, y: -o, w: r.w + o * 2, h: cont.clientHeight + o * 2 };
        }

        function stepLen() {
            var b = boxes || measure();
            if (b.length < 2) return 1;
            var d = axis === 'v' ? Math.abs(b[1].y - b[0].y) : Math.abs(b[1].x - b[0].x);
            return d || 1;
        }
        function track() {
            var b = boxes || measure();
            if (!b.length) return { start: 0, end: 0 };
            var a = b[0], z = b[b.length - 1];
            if (axis === 'v') return { start: Math.min(a.y, z.y), end: Math.max(a.y + a.h, z.y + z.h) };
            return { start: Math.min(a.x, z.x), end: Math.max(a.x + a.w, z.x + z.w) };
        }
        function nearest() {
            var b = boxes || measure();
            if (!b.length || !geo) return null;
            var g = axis === 'v' ? geo.y + geo.h / 2 : geo.x + geo.w / 2;
            var best = null, bd = 1e9;
            for (var i = 0; i < b.length; i++) {
                var c = axis === 'v' ? b[i].y + b[i].h / 2 : b[i].x + b[i].w / 2;
                var d = Math.abs(c - g);
                if (d < bd) { bd = d; best = b[i].el; }
            }
            return best;
        }
        function travelMs(a, b) {
            var d = axis === 'v' ? Math.abs(b.y - a.y) : Math.abs(b.x - a.x);
            var cells = d / stepLen();
            return clamp(Math.round(STEP_MS * Math.pow(Math.max(0.25, cells), 0.75)), 80, MAX_MS);
        }

        function speedK(pxPerMs) {
            if (REDUCED) return 0;
            var v = pxPerMs * 1000;
            return v <= 0 ? 0 : Math.min(DEF_MAX, DEF_MAX * v / DEF_VMAX);
        }
        /* 唯一的写入口：位移 + 形变同一个 transform，绝不用独立 scale 属性。
           值没变就不写，避免每帧重复触发样式重算。 */
        function paint(k, dir) {
            if (!geo) return;
            var along = 1 + k, across = 1 - k * 0.45;
            var sx = axis === 'v' ? across : along;
            var sy = axis === 'v' ? along : across;
            var org = '50% 50%';
            if (dir) {
                org = axis === 'v'
                    ? (dir > 0 ? '50% 0%' : '50% 100%')
                    : (dir > 0 ? '0% 50%' : '100% 50%');
            }
            var tf = 'translate3d(' + geo.x.toFixed(2) + 'px,' + geo.y.toFixed(2) + 'px,0) scale(' +
                sx.toFixed(4) + ',' + sy.toFixed(4) + ')';
            if (tf === lastTf && org === lastOrg) return;
            if (org !== lastOrg) { glass.style.transformOrigin = org; lastOrg = org; }
            if (tf !== lastTf) { glass.style.transform = tf; lastTf = tf; }
        }
        function place(b) {
            geo = { x: b.x, y: b.y, w: b.w, h: b.h };
            if (b.w !== lastW) { glass.style.width = b.w + 'px'; lastW = b.w; }
            if (b.h !== lastH) { glass.style.height = b.h + 'px'; lastH = b.h; }
            paint(0, 0);
            lgSchedule();
        }

        function qSize(w, h) {
            return {
                w: Math.max(48, Math.round(w / 8) * 8),
                h: Math.max(40, Math.round(h / 4) * 4)
            };
        }
        /* 折射贴图与主壳同一套引擎：量化尺寸相等就绝不重建（重建 = 一次滤镜重挂，
           表现就是「玻璃闪一下 / 抖一下」）。 */
        function lgSync() {
            if (!glass || typeof window.n26LgAttach !== 'function' || !geo) return;
            var q = qSize(geo.w, geo.h);
            if (lgQ && lgQ.w === q.w && lgQ.h === q.h) return;
            /* 快路径没命中，再用布局尺寸确认一次；绝不用 rect（带 scale 会漂移） */
            var lw = glass.offsetWidth || 0, lh = glass.offsetHeight || 0;
            if (!(lw > 0) || !(lh > 0)) return;
            q = qSize(lw, lh);
            if (lgQ && lgQ.w === q.w && lgQ.h === q.h) return;
            lgQ = q;
            var id = 'n26Lg' + gid.replace(/[^0-9]/g, '');
            try {
                if (window.n26LgResize) window.n26LgResize(glass, id, LG_OPTS, q);
                else window.n26LgAttach(glass, id, LG_OPTS, q);
            } catch (e) { }
        }
        /* rAF 合并：一帧最多挂一次贴图；原先的 200ms 防抖正是「玻璃迟到」的主因 */
        function lgSchedule() {
            if (lgT) return;
            lgT = requestAnimationFrame(function () { lgT = 0; lgSync(); });
        }
        /* ★ 预热：用一个固定尺寸的离屏探针先触发一次贴图生成，结果进引擎缓存。
           真实玻璃随后挂载时命中缓存 → 同步注入，首帧就有折射，不再「等玻璃」。 */
        function warmLg(w, h) {
            if (!(w > 0) || !(h > 0) || typeof window.n26LgAttach !== 'function') return;
            var q = qSize(w, h), key = q.w + 'x' + q.h;
            if (warmed[key]) return;
            warmed[key] = 1;
            var probe = document.createElement('div');
            probe.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;' +
                'pointer-events:none;width:' + q.w + 'px;height:' + q.h + 'px;';
            (document.body || document.documentElement).appendChild(probe);
            try { window.n26LgAttach(probe, 'n26LgWarm' + (++GLASS_SEQ), LG_OPTS, q); } catch (e) { }
            setTimeout(function () {
                try { if (window.n26LgClear) window.n26LgClear(probe); } catch (e) { }
                if (probe.parentNode) probe.parentNode.removeChild(probe);
            }, 2500);
        }
        /* will-change 临时挂：只在真的动的时候存在，静止 200ms 后摘掉 */
        function setLive(on) {
            if (liveT) { clearTimeout(liveT); liveT = 0; }
            if (on) { glass.classList.add('n26-dng-live'); return; }
            liveT = setTimeout(function () {
                liveT = 0;
                glass.classList.remove('n26-dng-live');
            }, 200);
        }

        function hideCaps(on) { cont.classList.toggle('n26-docknav-hold', !!on); }
        function cancel() {
            token++;
            if (raf) { cancelAnimationFrame(raf); raf = 0; }
            if (fadeT) { clearTimeout(fadeT); fadeT = 0; }
        }
        /* ★ v2.9.94：玻璃改为「常驻选中指示器」。
           旧版 rest() 里 opacity=0、startTravel() 里 opacity=1、fade() 又 0，
           于是肉眼就是用户说的「气泡突然出现，然后又突然消失」。
           现在玻璃从头到尾都停在选中项上；切换只是移动它，不再闪现。
           选中项的灰胶囊底色由 CSS 的 .n26-dng-persistent 统一让位，
           避免玻璃和灰底叠成两层。 */
        function applyRest(item) {
            detectAxis();
            cur = item;
            markOn(item);
            place(boxOf(item));
            glass.style.opacity = '1';
            glass.classList.remove('travel', 'glow');
            setLive(false);
            hideCaps(false);
        }
        function rest(item) {
            if (!item) { glass.style.opacity = '0'; setLive(false); return; }
            measure();
            applyRest(item);
        }
        /* 只收掉运动态的光效，绝不把玻璃藏掉；box-shadow 由 CSS 柔和收回 */
        function fade(done) {
            glass.classList.remove('glow');
            glass.style.opacity = '1';
            if (fadeT) clearTimeout(fadeT);
            fadeT = setTimeout(function () {
                fadeT = 0;
                glass.classList.remove('travel');
                hideCaps(false);
                setLive(false);
                if (done) done();
            }, FADE_MS);
        }
        /* 到位回弹：一次过冲后收敛，不来回抖；总时长压到 ~0.24s */
        function spring(amp, dir, done) {
            if (REDUCED || !amp) { paint(0, 0); if (done) done(); return; }
            var my = ++token, t0 = 0, a = Math.min(amp, 0.055);
            function step(now) {
                if (my !== token) return;
                if (!t0) t0 = now;
                var t = (now - t0) / 1000;
                var d = a * (1 - Math.exp(-6 * t) * Math.cos(11 * t));
                if ((t > 0.14 && Math.abs(d - a) < 0.002) || t > 0.24) {
                    paint(0, 0);
                    if (done) done();
                    return;
                }
                paint(d, dir);
                raf = requestAnimationFrame(step);
            }
            raf = requestAnimationFrame(step);
        }
        /* 通用滑行：只改 x/y，尺寸取目标；速度驱动形变 */
        function glide(a, b, dur, done) {
            var my = ++token;
            var dx = b.x - a.x, dy = b.y - a.y;
            var dir = axis === 'v' ? (dy >= 0 ? 1 : -1) : (dx >= 0 ? 1 : -1);
            geo = { x: a.x, y: a.y, w: b.w, h: b.h };
            if (b.w !== lastW) { glass.style.width = b.w + 'px'; lastW = b.w; }
            if (b.h !== lastH) { glass.style.height = b.h + 'px'; lastH = b.h; }
            var t0 = 0, last = 0, lx = a.x, ly = a.y, peak = 0;
            function frame(now) {
                if (my !== token) return;
                if (!t0) { t0 = now; last = now; }
                var p = Math.min(1, (now - t0) / dur), e = ease(p);
                geo.x = a.x + dx * e;
                geo.y = a.y + dy * e;
                var dt = Math.max(1, now - last);
                var v = (axis === 'v' ? Math.abs(geo.y - ly) : Math.abs(geo.x - lx)) / dt;
                var k = speedK(v);
                if (k > peak) peak = k;
                paint(k, dir);
                lx = geo.x; ly = geo.y; last = now;
                if (p < 1) { raf = requestAnimationFrame(frame); return; }
                raf = 0;
                geo.x = b.x; geo.y = b.y;
                paint(0, dir);
                spring(peak, dir, done);
            }
            raf = requestAnimationFrame(frame);
        }
        /* 到位收尾：应用自己改过 active 就跟随它，否则停在滑过去的那一格 */
        function settle(item) {
            busy = false;
            measure();
            var a = findActive();
            if (a && a !== item) applyRest(a);
            else { cur = item; applyRest(item); }
        }
        /* 点击切换：从旧的选中项直线滑到新项，到位淡出，灰胶囊接管 */
        function startTravel(prev, item) {
            cancel();
            busy = true;
            measure();
            detectAxis();
            var a = boxOf(prev), b = boxOf(item);
            place({ x: a.x, y: a.y, w: b.w, h: b.h });
            glass.style.opacity = '1';
            glass.classList.add('travel');
            glass.classList.remove('glow');
            setLive(true);
            hideCaps(true);
            glide(a, b, travelMs(a, b), function () {
                fade(function () { settle(item); });
            });
        }

        cont.addEventListener('click', function (e) {
            if (suppress) { suppress = false; e.preventDefault(); e.stopPropagation(); return; }
            if (skipActivate) { skipActivate = false; return; }
            var item = closestItem(e.target);
            if (!item) return;
            var prev = findActive();
            if (!prev || prev === item) return;
            startTravel(prev, item);
        }, true);

        /* 长按当前选中格 → 出玻璃 → 沿整条 Dock 拖动 → 松手吸附最近项 */
        cont.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || dragging) return;
            var item = closestItem(e.target);
            if (!item || item !== findActive()) return;
            measure();
            detectAxis();
            var b = boxOf(item);
            var sx = e.clientX, sy = e.clientY;
            var shown = false, cancelled = false, holdT = 0;
            var lx = sx, ly = sy, lt = 0;

            holdT = setTimeout(function () {
                holdT = 0;
                if (cancelled || dragging) return;
                cancel();
                shown = true; dragging = true; busy = true;
                place(b);
                glass.style.opacity = '1';
                glass.classList.add('travel', 'glow');
                setLive(true);
                cont.classList.add('n26-docknav-drag');
                hideCaps(true);
                lt = 0; lx = sx; ly = sy;
                lgSync();
            }, HOLD_MS);

            function onMove(ev) {
                if (!shown) {
                    if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > HOLD_CANCEL) {
                        cancelled = true;
                        if (holdT) { clearTimeout(holdT); holdT = 0; }
                        release();
                    }
                    return;
                }
                var p = toLocal(ev.clientX, ev.clientY);
                var t = track();
                if (axis === 'v') {
                    var cy = clamp(p.y, t.start + geo.h / 2, t.end - geo.h / 2);
                    geo.y = cy - geo.h / 2;
                } else {
                    var cx = clamp(p.x, t.start + geo.w / 2, t.end - geo.w / 2);
                    geo.x = cx - geo.w / 2;
                }
                var now = performance.now();
                if (!lt) lt = now;
                var dt = Math.max(1, now - lt);
                var v = (axis === 'v' ? Math.abs(ev.clientY - ly) : Math.abs(ev.clientX - lx)) / dt;
                var dir = (axis === 'v' ? ev.clientY - ly : ev.clientX - lx) >= 0 ? 1 : -1;
                paint(speedK(v), dir);
                lx = ev.clientX; ly = ev.clientY; lt = now;
            }
            function release() {
                window.removeEventListener('pointermove', onMove, true);
                window.removeEventListener('pointerup', up, true);
                window.removeEventListener('pointercancel', up, true);
                if (holdT) { clearTimeout(holdT); holdT = 0; }
                if (!shown) return;
                shown = false; dragging = false;
                cont.classList.remove('n26-docknav-drag');
                var target = nearest() || item;
                if (target !== item) {
                    /* 应用立即切换；skipActivate 压掉 docknav 自己的重复视觉 */
                    skipActivate = true;
                    try { target.click(); } catch (err) { }
                }
                measure();          /* 切换后布局可能变了，重新批量读一次再写 */
                var dest = boxOf(target);
                var from = { x: geo.x, y: geo.y, w: geo.w, h: geo.h };
                cancel();
                glide(from, dest, SNAP_MS, function () {
                    fade(function () { settle(target); });
                });
            }
            function up() { release(); }

            window.addEventListener('pointermove', onMove, true);
            window.addEventListener('pointerup', up, true);
            window.addEventListener('pointercancel', up, true);
        }, true);

        /* ★ 静止态对齐：一帧最多一次；读全在 measure() 里，写全在 place()/paint() 里。
           ResizeObserver 补上「容器被晚渲染/字体回流改尺寸」这种没有任何事件的场景，
           旧版靠 350ms / 900ms 两次 setTimeout 兜底，所以会「有时候来得特别慢」。 */
        function align() {
            if (busy || dragging) return;
            measure();
            var a = findActive();
            if (!a) { rest(null); return; }
            if (a !== cur) applyRest(a);
            else place(boxOf(a));
        }
        function scheduleAlign() {
            if (alignT) return;
            alignT = requestAnimationFrame(function () { alignT = 0; align(); });
        }
        cont.addEventListener('scroll', scheduleAlign, { passive: true });
        window.addEventListener('resize', scheduleAlign);

        var lastSig = '';
        function activeSig() {
            var it = itemsOf(cont, cfg), s = it.length + '|';
            for (var i = 0; i < it.length; i++) s += it[i].classList.contains(cfg.on) ? '1' : '0';
            return s;
        }
        lastSig = activeSig();
        /* ★ 自激回路断点：自己给 cont / glass 加减 class 也会触发这个观察器，
           旧版因此每帧 align → place → 重建贴图。这里只在「结构变了或选中态变了」
           时才调度，且用 rAF 合并（一帧最多一次）。 */
        new MutationObserver(function (recs) {
            var struct = false;
            for (var i = 0; i < recs.length; i++) if (recs[i].type === 'childList') { struct = true; break; }
            if (!struct) {
                var s = activeSig();
                if (s === lastSig) return;
                lastSig = s;
            } else {
                lastSig = activeSig();
            }
            scheduleAlign();
        }).observe(cont, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

        try {
            if (typeof ResizeObserver === 'function') {
                new ResizeObserver(function () { scheduleAlign(); }).observe(cont);
            }
        } catch (e) { }

        /* 首帧：先把 CSS 落定（防止样式后到导致第一帧是无样式的方块），
           再用固定尺寸探针预热折射贴图 —— 真实玻璃挂上时直接命中缓存。 */
        void glass.offsetWidth;
        cur = findActive();
        markOn(cur);
        if (cur && cont.offsetWidth > 0) {
            measure();
            detectAxis();
            var b0 = boxOf(cur);
            warmLg(b0.w, b0.h);
        }
        requestAnimationFrame(function () { rest(cur); });
    }

    function auto() {
        if (!document.body) return;
        for (var r = 0; r < REGISTRY.length; r++) {
            var conf = REGISTRY[r];
            var els = document.querySelectorAll(conf[0]);
            for (var i = 0; i < els.length; i++) {
                try { enhance(els[i], { item: conf[1], on: conf[2] }); } catch (e) { }
            }
        }
    }
    function boot() {
        auto();
        try {
            var t = 0;
            new MutationObserver(function () {
                if (t) return;
                t = setTimeout(function () { t = 0; auto(); }, 140);
            }).observe(document.body, { childList: true, subtree: true });
        } catch (e) { }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    /* v2.9.81 超椭圆兜底：与玻璃移动无关，保留（品牌 N 豁免） */
    function applyDockSquircle() {
        var dock = document.getElementById('dock');
        if (!dock) return;
        var nodes = dock.querySelectorAll('.dock-item img, .dock-item .dock-icon-wrap');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
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

    /* 玻璃按钮 / 开关的按压形变（v3.5 遗留，作用于 .n26-lg-ctrl，
       与侧栏玻璃指示器是两套东西；独立 scale 在这里安全，因为按钮没有视口级 translate） */
    (function () {
        if (REDUCED) return;
        var pressed = null, raf = 0, LAM = 5.5, OMG = 10;
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
                var d = d0 * Math.exp(-LAM * t) * Math.cos(OMG * t);
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
            var el = pressed; pressed = null;
            spring(el);
        }
        window.addEventListener('pointerup', release, true);
        window.addEventListener('pointercancel', release, true);
        window.addEventListener('blur', release, true);
    })();

    window.N26DockNav = {
        enhance: function (el, cfg) { if (el) enhance(el, cfg); },
        auto: auto,
        squircle: applyDockSquircle
    };
})();
