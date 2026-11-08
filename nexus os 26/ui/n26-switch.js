/* ============================================================
   n26-switch.js · 统一开关动效 v4.0（v2.9.93 · 用户钦定四段液态玻璃）
   ------------------------------------------------------------
   用户原话的规格，逐条落成代码：
     ① 白胶囊隐藏 → 变成「比中间白色的大出来 50%」的一大块液态玻璃；
     ② 这块玻璃必须挂真折射（feDisplacementMap 光线扭曲引擎），无磨砂；
     ③ 朝对应方向挪到另一边：前沿先到、后沿晚 100ms 跟上 → 拉伸感；
     ④ 到位后缩回去，重新变成白色胶囊。

   实现要点：
     · 不用 WAAPI 单段 400ms，也不用 transform 缩放假装拉伸。
       把玻璃看成「前沿 L(t) + 后沿 T(t)=L(t-100ms)」两条边，
       每帧由 rAF 直接写 left/width/height —— 这是真的拉伸，不是视觉近似。
     · 玻璃是独立 .n26-sw-blob 覆盖层，静息白胶囊（::after）只被 opacity 隐藏，
       不参与 transform，落位时不会出现二次滑动。
     · 折射贴图固定 48×24 尺寸并在模块加载时预热缓存：
       宿主 n26LgAttach 的 Worker 生成是异步的，不预热就会出现
       「动画演完了贴图才回来」= 看起来永远没有折射。
     · 方向：开 → 右，关 → 左，所有开关一致；关态/开态一视同仁。
     · 业务状态（.on/.active/aria-checked）由原 onclick 负责；
       若业务把状态交给 renderSettingsPanel() 重建（本版已禁止整块重建），
       这里就地补一次翻转，保证「点了一定有反应」。
   ============================================================ */
(function () {
    'use strict';

    var SEL = '.fu-switch, .toggle-switch, .widget-alarm-toggle-btn, .alarm-toggle';

    /* 四段节拍（ms） */
    var P1_SWELL = 90;      // ① 白胶囊隐藏 → 玻璃涨到 150%
    var P2_MOVE = 260;      // ② 前沿走完全程
    var P2_LAG = 100;       //    后沿晚 100ms 跟上（用户钦定）
    var P3_SETTLE = 100;    // ③ 缩回白色胶囊
    var TOTAL = P1_SWELL + P2_MOVE + P2_LAG + P3_SETTLE;

    /* 折射贴图固定尺寸：一次生成、全站复用，动画首帧就有 url(#...) */
    var LG_SIZE = { w: 48, h: 24 };
    var LG_OPTS = { hw: 0.30, hh: 0.20, thresh: -0.10, noBlur: true };
    var lgSeq = 0;

    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
        (document.body && document.body.classList.contains('reduce-motion'));

    /* ---------- 状态读写 ---------- */
    function mode(el) {
        if (!el.__n26SwMode) {
            el.__n26SwMode = (el.hasAttribute('aria-checked') &&
                !el.classList.contains('on') && !el.classList.contains('active')) ? 'aria' : 'class';
        }
        return el.__n26SwMode;
    }
    function isOn(el) {
        if (mode(el) === 'aria') return el.getAttribute('aria-checked') === 'true';
        return el.classList.contains('on') || el.classList.contains('active') ||
            el.getAttribute('aria-checked') === 'true';
    }
    function setOn(el, on) {
        el.classList.toggle('on', on);
        el.classList.toggle('active', on);
        el.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    function upgrade(el) {
        if (!el.hasAttribute('role')) el.setAttribute('role', 'switch');
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
        if (!el.hasAttribute('aria-checked')) el.setAttribute('aria-checked', isOn(el) ? 'true' : 'false');
    }

    /* ---------- 折射引擎 ---------- */
    function lgClear(blob) {
        try { if (window.n26LgClear) window.n26LgClear(blob); } catch (e) { }
    }
    function lgAttach(blob) {
        if (!blob || typeof window.n26LgAttach !== 'function') return false;
        try {
            window.n26LgAttach(blob, 'n26LgSw' + (++lgSeq), LG_OPTS, LG_SIZE);
            return blob.classList.contains('n26-liquid-on');
        } catch (e) { return false; }
    }
    /* 预热：宿主引擎走 Worker，第一次生成是异步的。先用一块离屏元素把
       48×24 这张 SDF 位移图算进缓存，之后每次动画都是同步命中。 */
    function warmLg() {
        if (typeof window.n26LgAttach !== 'function' || !document.body) return;
        var probe = document.createElement('span');
        probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:48px;height:24px;' +
            'visibility:hidden;pointer-events:none;';
        probe.setAttribute('aria-hidden', 'true');
        document.body.appendChild(probe);
        try {
            window.n26LgAttach(probe, 'n26LgSwWarm', LG_OPTS, LG_SIZE);
            lgClear(probe);
        } catch (e) { }
        if (probe.parentNode) probe.parentNode.removeChild(probe);
    }

    /* ---------- 几何 ---------- */
    function metrics(el) {
        var cs = getComputedStyle(el);
        function nv(name, d) {
            var v = parseFloat(cs.getPropertyValue(name));
            return isFinite(v) ? v : d;
        }
        return {
            kw: nv('--fu-sw-kw', 18),
            kh: nv('--fu-sw-kh', 15),
            pad: nv('--fu-sw-pad', 2),
            travel: nv('--fu-sw-travel', 14),
            h: el.offsetHeight || 20
        };
    }
    function clamp(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function ease(t) {
        /* easeInOutCubic：前沿干脆起步、中段最快、末端稳稳停住，不过冲 */
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    /* ---------- 动效 ---------- */
    function stop(el) {
        var s = el.__n26Sw;
        if (!s) return;
        if (s.raf) cancelAnimationFrame(s.raf);
        if (s.blob) {
            lgClear(s.blob);
            if (s.blob.parentNode) s.blob.parentNode.removeChild(s.blob);
        }
        el.classList.remove('n26-sw-busy');
        el.__n26Sw = null;
    }

    function play(el, fromOn, toOn) {
        stop(el);
        upgrade(el);
        if (reduced) return;

        var m = metrics(el);
        var x0 = m.pad + (fromOn ? m.travel : 0);
        var x1 = m.pad + (toOn ? m.travel : 0);

        var blob = document.createElement('span');
        blob.className = 'n26-sw-blob';
        blob.setAttribute('aria-hidden', 'true');
        el.appendChild(blob);

        /* ① 白胶囊隐藏；② 玻璃挂真折射（预热过 → 同步拿到 url(#...)） */
        el.classList.add('n26-sw-busy');
        var hasLg = lgAttach(blob);
        blob.classList.toggle('n26-sw-nolg', !hasLg);

        var seq = (el.__n26SwSeq || 0) + 1;
        el.__n26SwSeq = seq;
        var s = { blob: blob, raf: 0 };
        el.__n26Sw = s;

        var t0 = (window.performance && performance.now) ? performance.now() : Date.now();

        function frame(now) {
            if (!el.__n26Sw || el.__n26Sw !== s || el.__n26SwSeq !== seq) return;
            var t = now - t0;
            if (t >= TOTAL) { stop(el); return; }

            /* P1：白胶囊 → 150% 玻璃块 */
            var grow = clamp(t / P1_SWELL);

            /* P2：前沿 L(t) 走，后沿 T(t) = L(t - 100ms) 跟上 */
            var mt = clamp((t - P1_SWELL) / P2_MOVE);
            var bt = clamp((t - P1_SWELL - P2_LAG) / P2_MOVE);
            var lead = x0 + (x1 - x0) * ease(mt);
            var trail = x0 + (x1 - x0) * ease(bt);
            var span = Math.abs(lead - trail);

            /* P3：缩回白胶囊 */
            var shrink = clamp((t - P1_SWELL - P2_MOVE - P2_LAG) / P3_SETTLE);
            var g = grow * (1 - shrink);

            var kw = m.kw * (1 + 0.5 * g);
            var kh = m.kh * (1 + 0.5 * g);
            var width = span + kw;
            var left = Math.min(lead, trail) - (kw - m.kw) / 2;
            var top = (m.h - kh) / 2;

            blob.style.left = left.toFixed(2) + 'px';
            blob.style.top = top.toFixed(2) + 'px';
            blob.style.width = width.toFixed(2) + 'px';
            blob.style.height = kh.toFixed(2) + 'px';
            blob.style.opacity = String(Math.min(1, grow * 3) * (1 - shrink));

            s.raf = requestAnimationFrame(frame);
        }
        s.raf = requestAnimationFrame(frame);
        /* v2.10.3：看门狗。rAF 被节流（切后台 / 长任务）时 frame 可能停在半路，
           .n26-sw-busy 会一直留着 —— 那会让白点永久不可见（用户会以为开关坏了）。
           TOTAL 之后强制收尾一次。 */
        setTimeout(function () {
            if (el.__n26Sw === s) stop(el);
        }, TOTAL + 160);
    }

    /* ---------- v2.9.94：按住液态玻璃拖动，靠哪边就判定开 / 关 ----------
       用户追加规格：「开关液态玻璃要能拖动：按住玻璃拖到靠哪边就判断
       开启/关闭」。这里不改变普通点击链路 —— 只有位移超过 6px 才进入
       拖动态；没超过就完全当作原来的点击，四段动效逐帧行为不变。
       拖动结束时若目标状态与起始不同，手动触发一次 el.click() 让业务
       handler 真正翻转并落盘；本模块用 __n26SwDragEnd 吃掉这次 click
       的动效，避免「拖完了又播一遍四段动画」。 */
    var DRAG_THRESH = 6;
    function clampN(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    function beginDrag(el, e) {
        var before = isOn(el);
        var m = metrics(el);
        var startX = e.clientX;
        var kw = m.kw * 1.5, kh = m.kh * 1.5;
        var x0 = m.pad + (before ? m.travel : 0);
        var minLeft = -(kw - m.kw) / 2;
        var maxLeft = Math.max(minLeft, el.offsetWidth - kw + (kw - m.kw) / 2);
        var curLeft = x0 - (kw - m.kw) / 2;
        var blob = null, active = false, ended = false;

        function paint() {
            if (!blob) return;
            blob.style.left = curLeft.toFixed(2) + 'px';
            blob.style.top = ((m.h - kh) / 2).toFixed(2) + 'px';
            blob.style.width = kw.toFixed(2) + 'px';
            blob.style.height = kh.toFixed(2) + 'px';
            blob.style.opacity = '1';
        }
        function begin() {
            active = true;
            stop(el);
            upgrade(el);
            blob = document.createElement('span');
            blob.className = 'n26-sw-blob';
            blob.setAttribute('aria-hidden', 'true');
            el.appendChild(blob);
            el.classList.add('n26-sw-busy', 'n26-sw-dragging');
            var hasLg = lgAttach(blob);
            blob.classList.toggle('n26-sw-nolg', !hasLg);
            el.__n26Sw = { blob: blob, raf: 0 };
            paint();
        }
        function settle(toOn) {
            /* 140ms：玻璃吸到目标侧、缩回胶囊大小、淡出；期间折射贴图
               仍是固定 48×24，不重建，不会抖。 */
            var dest = (m.pad + (toOn ? m.travel : 0)) - (kw - m.kw) / 2;
            var from = curLeft;
            var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
            var s = el.__n26Sw;
            function frame(now) {
                if (!s || el.__n26Sw !== s || !blob) { stop(el); return; }
                var p = clampN((now - t0) / 140, 0, 1);
                var q = 1 - Math.pow(1 - p, 3);
                curLeft = from + (dest - from) * q;
                var w = kw + (m.kw - kw) * q;
                var h = kh + (m.kh - kh) * q;
                blob.style.left = curLeft.toFixed(2) + 'px';
                blob.style.top = ((m.h - h) / 2).toFixed(2) + 'px';
                blob.style.width = w.toFixed(2) + 'px';
                blob.style.height = h.toFixed(2) + 'px';
                blob.style.opacity = String(1 - q);
                if (p < 1) { s.raf = requestAnimationFrame(frame); return; }
                el.classList.remove('n26-sw-dragging');
                stop(el);
            }
            s.raf = requestAnimationFrame(frame);
        }
        function onMove(ev) {
            if (ended) return;
            if (!active) {
                if (Math.abs(ev.clientX - startX) < DRAG_THRESH) return;
                begin();
            }
            curLeft = clampN(x0 - (kw - m.kw) / 2 + (ev.clientX - startX), minLeft, maxLeft);
            paint();
            if (ev.cancelable) ev.preventDefault();
        }
        function onUp() {
            if (ended) return;
            ended = true;
            window.removeEventListener('pointermove', onMove, true);
            window.removeEventListener('pointerup', onUp, true);
            window.removeEventListener('pointercancel', onUp, true);
            if (!active) return;                 // 只是普通点击，交给 click 链路
            var toOn = (curLeft + kw / 2) >= (el.offsetWidth / 2);
            /* 拖回原侧：不改状态，不触发业务；只把玻璃收回 */
            if (toOn === before) { settle(toOn); return; }
            el.__n26SwDragEnd = true;
            settle(toOn);
            try { el.click(); } catch (err) { el.__n26SwDragEnd = false; }
        }
        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerup', onUp, true);
        window.addEventListener('pointercancel', onUp, true);
    }

    /* ---------- 点击链路（捕获阶段，setTimeout(0) 等业务 handler 跑完） ---------- */
    function allSwitches() { return document.querySelectorAll(SEL); }
    function indexOf(el) { return Array.prototype.indexOf.call(allSwitches(), el); }
    function resolve(el, idx) {
        if (el && el.isConnected) return el;
        var list = allSwitches();
        if (idx >= 0 && idx < list.length) return list[idx];
        return null;
    }

    document.addEventListener('click', function (e) {
        var src = e.target;
        var el = src && src.closest ? src.closest(SEL) : null;
        if (!el) return;
        /* 拖动结束时手动 click 只为让业务翻转并落盘；玻璃已在吸附，
           不要再播一遍四段动效。业务 handler 照常收得到这次 click。 */
        if (el.__n26SwDragEnd) { el.__n26SwDragEnd = false; return; }
        var before = isOn(el);
        var idx = indexOf(el);
        setTimeout(function () {
            var target = resolve(el, idx);
            if (!target) return;
            upgrade(target);
            var after = isOn(target);
            /* 业务把状态交给整块重建时，重建已被 N26 NoReload 拦下 → 就地翻转 */
            if (after === before) { setOn(target, !before); after = !before; }
            play(target, before, after);
        }, 0);
    }, true);

    document.addEventListener('pointerdown', function (e) {
        var el = e.target && e.target.closest ? e.target.closest(SEL) : null;
        if (!el) return;
        upgrade(el);
        if (e.button === 0 && !reduced) beginDrag(el, e);
    }, true);

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        var el = e.target && e.target.closest ? e.target.closest(SEL) : null;
        if (!el) return;
        e.preventDefault();
        el.click();
    }, true);

    function scan() {
        var nodes = allSwitches();
        for (var i = 0; i < nodes.length; i++) upgrade(nodes[i]);
    }

    function boot() {
        scan();
        warmLg();
        if (window.MutationObserver && document.body) {
            var mo = new MutationObserver(function () {
                clearTimeout(mo.__t);
                mo.__t = setTimeout(scan, 160);
            });
            mo.observe(document.body, { childList: true, subtree: true });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    /* 供自检脚本驱动逐帧坐标（不参与业务） */
    window.N26Switch = {
        version: '5.0-2.9.94',
        phases: { swell: P1_SWELL, move: P2_MOVE, lag: P2_LAG, settle: P3_SETTLE },
        metrics: metrics,
        ease: ease,
        isOn: isOn,
        setOn: setOn,
        dragThreshold: DRAG_THRESH,
        beginDrag: beginDrag
    };
})();
