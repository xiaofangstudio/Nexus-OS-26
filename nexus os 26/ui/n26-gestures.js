/* ============================================================
   Nexus OS 26 · 全局精准触控板手势层（ui/n26-gestures.js）
   v1.0.0 · 无框架 · 单文件 · 自带调试 HUD

   设计原则：
   1) 一切手势走同一个中央总线：app 可 on / intercept / 覆盖
   2) 识别失败一律放行原生行为，绝不吞事件、绝不卡住
   3) 表单输入、文本选择、canvas 应用自己处理的地方不接管
   4) prefers-reduced-motion / body.reduce-motion 下去掉惯性与回弹
   5) 锁屏可见时整层暂停

   事件：scroll scrollend bounce pinch pinchend pinchnone
         swipe3 edge dragstart drag dragend drop
   ============================================================ */
(function () {
    'use strict';
    if (window.N26Gestures) return;

    var VERSION = '1.1.0';
    var CFG_KEY = 'n26Gestures';
    var SELF_SRC = null;
    try { SELF_SRC = document.currentScript && document.currentScript.src; } catch (e) { }

    /* ---------------- 配置 ---------------- */
    var DEFAULTS = {
        enabled: true,
        smoothScroll: true,      // 触控板滚动走自绘平滑
        naturalScroll: true,     // 自然滚动（内容跟随手指；关闭则反向）
        scrollSpeed: 1,          // 滚动速度倍率（设置里的滑块，0.6 ~ 1.6）
        inertia: true,           // 松手后少量惯性
        bounce: true,            // 到边阻力 + bounce 事件
        pinch: true,             // 捏合缩放
        threeFinger: false,      // 默认关：Web 拿不到真实手指数，靠滚轮爆发推断
        edgeSwipe: true,         // 左右边缘返回 / 前进
        tapDrag: true,           // 轻点拖拽（需宿主调用 enableDrag）
        blockPageZoom: true,     // 吞掉 ctrl+wheel 的浏览器整页缩放
        mouseSmooth: false,      // 鼠标滚轮默认走原生
        keyboardFallback: false, // Ctrl+↑/↓/←/→ 键盘兜底
        momentumTau: 360,        // 惯性衰减时间常数（ms）：越大滑得越远
        momentumMax: 3.2,        // 惯性初速度上限（px/ms），防「一碰就飞」
        smoothTime: 16,          // 跟随平滑时间常数（ms）：越小越跟手
        scaleGain: 1,            // 捏合灵敏度
        swipe3Threshold: 150,    // 三指横扫累计位移阈值
        edgeWidth: 26            // 边缘判定宽度 px
    };

    function clone(o) {
        var r = {}, k;
        for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k];
        return r;
    }

    var cfg = clone(DEFAULTS);

    function loadCfg() {
        var raw = null;
        try {
            if (typeof getUserLS === 'function') raw = getUserLS(CFG_KEY);
        } catch (e) { }
        if (!raw) {
            try { raw = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (e2) { raw = null; }
        }
        if (raw && typeof raw === 'object') {
            for (var k in DEFAULTS) {
                if (Object.prototype.hasOwnProperty.call(raw, k) && raw[k] !== undefined) cfg[k] = raw[k];
            }
        }
    }
    function saveCfg() {
        try {
            if (typeof setUserLS === 'function') { setUserLS(CFG_KEY, cfg); return; }
        } catch (e) { }
        try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e2) { }
    }
    loadCfg();

    // 主壳与 iframe 应用同源共享配置：设置里一改，所有已加载应用立即跟进
    try {
        window.addEventListener('storage', function (e) {
            if (e && e.key === CFG_KEY) loadCfg();
        });
    } catch (e) { }

    /* ---------------- 基础工具 ---------------- */
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

    var mq = null;
    try { mq = matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { mq = null; }

    function reduced() {
        if (mq && mq.matches) return true;
        var b = document.body;
        if (!b || !b.classList) return false;
        return b.classList.contains('reduce-motion') || b.classList.contains('n26-a11y-reduce-motion');
    }

    function isEditable(node) {
        if (!node) return false;
        var el = node.nodeType === 3 ? node.parentNode : node;
        if (!el || el.nodeType !== 1 || !el.closest) return false;
        return !!el.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]');
    }
    function isOff(node) {
        if (!node) return false;
        var el = node.nodeType === 3 ? node.parentNode : node;
        if (!el || el.nodeType !== 1 || !el.closest) return false;
        return !!el.closest('[data-n26-gestures="off"]');
    }

    /* ---------------- 中央总线 ---------------- */
    var listeners = {};
    var interceptors = [];

    function on(type, fn) {
        if (typeof fn !== 'function') return function () { };
        (listeners[type] || (listeners[type] = [])).push(fn);
        return function () { off(type, fn); };
    }
    function off(type, fn) {
        var arr = listeners[type];
        if (!arr) return;
        for (var i = arr.length - 1; i >= 0; i--) if (arr[i] === fn) arr.splice(i, 1);
    }
    function emit(type, detail) {
        var arr = listeners[type] || [];
        var count = 0;
        for (var i = 0; i < arr.length; i++) {
            try { arr[i](detail || {}); count++; } catch (e) {
                try { console.warn('[N26Gestures] listener ' + type + ' error', e); } catch (e2) { }
            }
        }
        try {
            window.dispatchEvent(new CustomEvent('n26:' + type, { detail: detail || {} }));
        } catch (e) { }
        hudLog(type, detail);
        if (window !== window.top) crossTalk(type, detail);
        return count;
    }
    function intercept(type, fn) {
        if (typeof fn !== 'function') return function () { };
        var rec = { type: type, fn: fn };
        interceptors.push(rec);
        return function () {
            var i = interceptors.indexOf(rec);
            if (i >= 0) interceptors.splice(i, 1);
        };
    }
    function claimed(type, ctx) {
        for (var i = 0; i < interceptors.length; i++) {
            var it = interceptors[i];
            if (it.type !== type) continue;
            try { if (it.fn(ctx)) return true; } catch (e) { }
        }
        return false;
    }

    /* iframe 应用：把系统级手势回报给宿主（宿主未监听时无副作用） */
    function crossTalk(type, detail) {
        if (type === 'scroll' || type === 'drag') return;    // 高频事件不跨域
        var d = {};
        if (detail) {
            if (detail.side) d.side = detail.side;
            if (detail.direction) d.direction = detail.direction;
            if (detail.target && detail.target.tagName) d.tag = detail.target.tagName;
        }
        try { parent.postMessage({ __nexusGesture: true, type: type, detail: d }, '*'); } catch (e) { }
    }

    /* ---------------- 鼠标 / 触控板判定 ---------------- */
    var lastWheelTs = 0, wheelStreak = 0;

    function detectKind(e) {
        var t = now();
        // 鼠标滚轮是「一格一个离散事件」，触控板是「连续高频事件流」：
        // 只有凑够连续 3 帧才判定为触控板，避免单击滚轮被误平滑。
        if (t - lastWheelTs < 24) wheelStreak++; else wheelStreak = 1;
        lastWheelTs = t;
        if (wheelStreak >= 3) return 'trackpad';
        if (e.deltaMode && e.deltaMode !== 0) return 'mouse';
        var ax = Math.abs(e.deltaX || 0), ay = Math.abs(e.deltaY || 0);
        if (ax > 0.5) return 'trackpad';
        if (ay > 0 && (ay < 1 || Math.abs(ay - Math.round(ay)) > 1e-4)) return 'trackpad';
        if (ay > 0 && ay < 36) return 'trackpad';
        return 'mouse';
    }

    function norm(e, axis) {
        var d = e[axis] || 0;
        if (e.deltaMode === 1) d *= 16;
        else if (e.deltaMode === 2) d *= (axis === 'deltaY' ? window.innerHeight : window.innerWidth);
        return clamp(d, -400, 400);
    }

    /* ---------------- 滚动容器解析 ---------------- */
    var scrollerCache = new WeakMap();

    function isScrollable(el, horizontal) {
        if (!el || el.nodeType !== 1) return false;
        var cs;
        try { cs = getComputedStyle(el); } catch (e) { return false; }
        var ov = horizontal ? cs.overflowX : cs.overflowY;
        if (!(ov === 'auto' || ov === 'scroll' || ov === 'overlay')) {
            // hidden 容器也能程序化滚动（如自定义列表），但不接管，避免破坏原生
            return false;
        }
        if (horizontal) return el.scrollWidth > el.clientWidth + 1;
        return el.scrollHeight > el.clientHeight + 1;
    }

    function findScroller(node, horizontal) {
        var el = node && node.nodeType === 3 ? node.parentNode : node;
        while (el && el.nodeType === 1) {
            if (el.hasAttribute && el.getAttribute('data-n26-wheel') === 'native') return null;
            if (isScrollable(el, horizontal)) return el;
            if (el === document.body || el === document.documentElement) break;
            el = el.parentElement;
        }
        var se = document.scrollingElement || document.documentElement;
        if (isScrollable(se, horizontal)) return se;
        return null;
    }

    function scrollUnderPointer(node) {
        var el = node && node.nodeType === 3 ? node.parentNode : node;
        if (!el || el.nodeType !== 1) return false;
        var c = scrollerCache.get(el), t = now();
        if (c && t - c.t < 400) return c.v;
        var v = !!(findScroller(el, false) || findScroller(el, true));
        scrollerCache.set(el, { t: t, v: v });
        return v;
    }

    /* ---------------- 滚动引擎（平滑 + 惯性 + 边缘阻力） ---------------- */
    var engines = new WeakMap();

    function bounds(el) {
        return {
            maxX: Math.max(0, el.scrollWidth - el.clientWidth),
            maxY: Math.max(0, el.scrollHeight - el.clientHeight)
        };
    }

    // 边缘阻力：越推越硬，最多只让出 96px（macOS 的橡皮筋手感）
    function rubber(v, lo, hi, on) {
        if (v < lo) {
            if (!on) return lo;
            var d = lo - v;
            return lo - Math.min(96, (d * 0.45) / (1 + d / 150));
        }
        if (v > hi) {
            if (!on) return hi;
            var d2 = v - hi;
            return hi + Math.min(96, (d2 * 0.45) / (1 + d2 / 150));
        }
        return v;
    }

    function Engine(el) {
        this.el = el;
        this.cx = el.scrollLeft;
        this.cy = el.scrollTop;
        this.tx = this.cx;
        this.ty = this.cy;
        this.mvx = 0;            // 惯性速度 px/ms
        this.mvy = 0;
        this.momentum = false;
        this.samples = [];
        this.raf = 0;
        this.lastFrame = 0;
        this.ended = true;
        this.flingTimer = 0;
        this.lastBounce = 0;
        this.lastEdge = '';
    }

    // 只把近几次位移换算成速度，供惯性使用；定位永远由 tx/ty 决定
    Engine.prototype.track = function (dx, dy) {
        var t = now();
        var s = this.samples;
        s.push({ t: t, dx: dx, dy: dy });
        while (s.length > 5) s.shift();
        if (s.length < 2) return;
        var span = Math.max(1, t - s[0].t);
        var sx = 0, sy = 0;
        for (var i = 1; i < s.length; i++) { sx += s[i].dx; sy += s[i].dy; }
        var max = +cfg.momentumMax || 3.2;
        this.mvx = clamp(sx / span, -max, max);
        this.mvy = clamp(sy / span, -max, max);
    };

    Engine.prototype.push = function (dx, dy, kind) {
        var b = bounds(this.el);
        var on = cfg.bounce && !reduced();
        this.momentum = false;          // 手指一动就接管，惯性立即让位
        if (b.maxX > 0) this.tx = rubber(this.tx + dx, 0, b.maxX, on);
        else this.tx = this.cx;
        if (b.maxY > 0) this.ty = rubber(this.ty + dy, 0, b.maxY, on);
        else this.ty = this.cy;
        if (kind === 'trackpad') this.track(dx, dy); else this.samples.length = 0;
        this.ended = false;
        this.checkBounce(b);
        this.start();
        var self = this;
        if (this.flingTimer) clearTimeout(this.flingTimer);
        if (cfg.inertia && kind === 'trackpad') {
            this.flingTimer = setTimeout(function () {
                self.flingTimer = 0;
                self.startMomentum();
            }, 90);
        }
    };

    Engine.prototype.checkBounce = function (b) {
        if (!cfg.bounce || reduced()) return;
        var edge = '';
        if (this.ty < -4) edge = 'top';
        else if (this.ty > b.maxY + 4) edge = 'bottom';
        else if (this.tx < -4) edge = 'left';
        else if (this.tx > b.maxX + 4) edge = 'right';
        if (!edge) return;
        var t = now();
        if (edge === this.lastEdge && t - this.lastBounce < 320) return;
        this.lastEdge = edge;
        this.lastBounce = t;
        emit('bounce', { el: this.el, edge: edge });
    };

    Engine.prototype.startMomentum = function () {
        if (!cfg.inertia || reduced() || this.ended) return;
        var b = bounds(this.el);
        if (b.maxX <= 0) this.mvx = 0;
        if (b.maxY <= 0) this.mvy = 0;
        if (Math.abs(this.mvx) < 0.12 && Math.abs(this.mvy) < 0.12) {
            this.mvx = 0; this.mvy = 0;
            this.settle();
            return;
        }
        this.momentum = true;
        this.start();
    };

    // 到边后把越界的目标位收回来，避免下一次推要先「补偿」96px
    Engine.prototype.settle = function () {
        var b = bounds(this.el);
        this.tx = clamp(this.tx, 0, b.maxX);
        this.ty = clamp(this.ty, 0, b.maxY);
        this.ended = false;
        this.start();
    };

    Engine.prototype.start = function () {
        if (this.raf) return;
        this.lastFrame = now();
        var self = this;
        this.raf = requestAnimationFrame(function () { self.step(); });
    };

    Engine.prototype.step = function () {
        this.raf = 0;
        var b = bounds(this.el);
        var t = now();
        var dt = this.lastFrame ? clamp(t - this.lastFrame, 4, 48) : 16;
        this.lastFrame = t;

        if (this.momentum) {
            var tau = Math.max(120, +cfg.momentumTau || 360);
            var decay = Math.exp(-dt / tau);
            this.mvx *= decay;
            this.mvy *= decay;
            var on = cfg.bounce && !reduced();
            if (b.maxX > 0) this.tx = rubber(this.tx + this.mvx * dt, 0, b.maxX, on);
            if (b.maxY > 0) this.ty = rubber(this.ty + this.mvy * dt, 0, b.maxY, on);
            // 撞到硬边就停在这个轴，不再继续顶出去
            if (this.tx <= 0 && this.mvx < 0) this.mvx = 0;
            else if (this.tx >= b.maxX && this.mvx > 0) this.mvx = 0;
            if (this.ty <= 0 && this.mvy < 0) this.mvy = 0;
            else if (this.ty >= b.maxY && this.mvy > 0) this.mvy = 0;
            if (Math.abs(this.mvx) < 0.04 && Math.abs(this.mvy) < 0.04) {
                this.mvx = 0; this.mvy = 0; this.momentum = false;
                this.tx = clamp(this.tx, 0, b.maxX);
                this.ty = clamp(this.ty, 0, b.maxY);
            }
        }

        var smooth = reduced() ? 0 : Math.max(0, +cfg.smoothTime || 0);
        var k = smooth ? (1 - Math.exp(-dt / smooth)) : 1;
        this.cx += (this.tx - this.cx) * k;
        this.cy += (this.ty - this.cy) * k;
        if (Math.abs(this.tx - this.cx) < 0.3) this.cx = this.tx;
        if (Math.abs(this.ty - this.cy) < 0.3) this.cy = this.ty;

        var rx = clamp(this.cx, 0, b.maxX);
        var ry = clamp(this.cy, 0, b.maxY);
        if (Math.abs(rx - this.el.scrollLeft) > 0.4 || Math.abs(ry - this.el.scrollTop) > 0.4) {
            this.el.scrollLeft = rx;
            this.el.scrollTop = ry;
        }

        var moving = Math.abs(this.tx - this.cx) > 0.3 || Math.abs(this.ty - this.cy) > 0.3;
        if (moving) { this.start(); return; }
        this.cx = this.tx; this.cy = this.ty;
        if (!this.ended) {
            this.ended = true;
            emit('scrollend', { el: this.el, x: rx, y: ry });
        }
    };

    function engineFor(el) {
        var e = engines.get(el);
        if (!e || e.el !== el) { e = new Engine(el); engines.set(el, e); }
        return e;
    }

    /* ---------------- 滚动处理 ---------------- */
    function handleScroll(e, node, kind) {
        if (isEditable(node)) return false;
        if (isOff(node)) return false;
        var el = node && node.nodeType === 3 ? node.parentNode : node;
        if (el && el.closest && el.closest('canvas, [data-n26-wheel]')) return false;

        if (kind === 'mouse' && !cfg.mouseSmooth) return false;

        var dx = norm(e, 'deltaX');
        var dy = norm(e, 'deltaY');
        // 设置 → 触控板：方向与速度是真实消费的，不是装饰开关
        if (cfg.naturalScroll === false) { dx = -dx; dy = -dy; }
        var speed = clamp(Number(cfg.scrollSpeed) || 1, 0.5, 2);
        if (speed !== 1) { dx *= speed; dy *= speed; }
        var horizontal = Math.abs(dx) > Math.abs(dy) * 1.15 && Math.abs(dx) > 1;

        var scroller = horizontal ? findScroller(node, true) : findScroller(node, false);
        if (!scroller) return false;    // 无容器：放行原生

        if (claimed('scroll', { el: scroller, dx: dx, dy: dy, kind: kind, source: e })) return false;

        if (cfg.smoothScroll && kind === 'trackpad') {
            e.preventDefault();
            engineFor(scroller).push(dx, dy, kind);
            emit('scroll', { el: scroller, dx: dx, dy: dy, kind: kind });
            return true;
        }
        // 非平滑：仍发事件给应用观察，但不接管
        emit('scroll', { el: scroller, dx: dx, dy: dy, kind: kind, passive: true });
        return false;
    }

    /* ---------------- 捏合缩放 ---------------- */
    var pinchStates = new WeakMap();
    var pinchTimer = 0;
    var pinchEl = null;
    var lastCtrlPinch = 0;

    function resolvePinch(node) {
        var el = node && node.nodeType === 3 ? node.parentNode : node;
        if (!el || el.nodeType !== 1 || !el.closest) return null;
        var hit = el.closest('[data-n26-pinch], img, canvas');
        if (!hit) return null;
        var mode = hit.getAttribute && hit.getAttribute('data-n26-pinch');
        if (mode === 'off') return null;
        if (!mode) {
            if (hit.tagName === 'CANVAS') mode = 'emit';
            else if (hit.closest('.album-viewer') || hit.closest('[data-n26-pinch="emit"]')) mode = 'emit';
            else mode = 'auto';
        }
        return { el: hit, mode: mode };
    }

    function originAt(el, cx, cy) {
        var r = el.getBoundingClientRect();
        var ox = r.width ? ((cx - r.left) / r.width) * 100 : 50;
        var oy = r.height ? ((cy - r.top) / r.height) * 100 : 50;
        return clamp(ox, 0, 100).toFixed(2) + '% ' + clamp(oy, 0, 100).toFixed(2) + '%';
    }

    function applyPinch(res, factor, cx, cy) {
        if (res.mode !== 'auto') return false;
        var el = res.el;
        var st = pinchStates.get(el);
        if (!st) { st = { scale: 1 }; pinchStates.set(el, st); }
        st.scale = clamp(st.scale * factor, 0.5, 6);
        try {
            el.style.transformOrigin = originAt(el, cx, cy);
            el.style.willChange = 'transform';
            if (Math.abs(st.scale - 1) < 0.004) {
                st.scale = 1;
                el.style.transform = '';
                el.style.transformOrigin = '';
                el.style.willChange = '';
            } else {
                el.style.transform = 'scale(' + st.scale.toFixed(4) + ')';
            }
        } catch (e) { return false; }
        return true;
    }

    function handlePinch(e, node) {
        var res = resolvePinch(node);
        if (claimed('pinch', { target: res && res.el, deltaY: e.deltaY, source: e })) return true;
        if (!res) {
            if (cfg.blockPageZoom) e.preventDefault();
            emit('pinchnone', { cx: e.clientX, cy: e.clientY });
            return true;
        }
        e.preventDefault();
        // 单帧增益限幅：宁可慢一点，也不能一次跳一大截
        var factor = clamp(Math.exp(-norm(e, 'deltaY') * 0.0095 * (cfg.scaleGain || 1)), 0.78, 1.28);
        var applied = applyPinch(res, factor, e.clientX, e.clientY);
        emit('pinch', {
            target: res.el, mode: res.mode, factor: factor, applied: applied,
            cx: e.clientX, cy: e.clientY
        });
        pinchEl = res.el;
        var self = pinchEl;
        if (pinchTimer) clearTimeout(pinchTimer);
        pinchTimer = setTimeout(function () {
            pinchTimer = 0;
            var st = pinchStates.get(self);
            emit('pinchend', { target: self, scale: st ? st.scale : 1 });
        }, 200);
        return true;
    }

    function resetPinch(el) {
        if (!el) return;
        var st = pinchStates.get(el);
        if (st) st.scale = 1;
        try {
            el.style.transform = '';
            el.style.transformOrigin = '';
            el.style.willChange = '';
        } catch (e) { }
    }

    /* Safari：原生 gesture 事件（没有 ctrlKey） */
    var gestureRes = null, gestureScale = 1;
    function onGestureStart(e) {
        if (!cfg.pinch || paused()) return;
        if (now() - lastCtrlPinch < 400) return;    // 已由 ctrl+wheel 处理，避免双倍
        var res = resolvePinch(e.target);
        if (!res) return;
        gestureRes = res;
        gestureScale = 1;
        if (e.preventDefault) e.preventDefault();
    }
    function onGestureChange(e) {
        if (!gestureRes || !cfg.pinch || paused()) return;
        if (e.preventDefault) e.preventDefault();
        var s = e.scale || 1;
        var f = gestureScale ? (s / gestureScale) : 1;
        gestureScale = s;
        var applied = applyPinch(gestureRes, f, e.clientX || 0, e.clientY || 0);
        emit('pinch', { target: gestureRes.el, mode: gestureRes.mode, factor: f, applied: applied, cx: e.clientX, cy: e.clientY });
        lastCtrlPinch = now();
    }
    function onGestureEnd() {
        if (!gestureRes) return;
        var res = gestureRes;
        gestureRes = null;
        var st = pinchStates.get(res.el);
        emit('pinchend', { target: res.el, scale: st ? st.scale : 1 });
    }

    /* ---------------- 三指 / 边缘滑动 ---------------- */
    var pointer = { x: -1, y: -1 };
    var burst = null;
    var BURST_GAP = 190;
    var edgeHoldUntil = 0;      // 触发后继续吞掉残余位移
    var edgeUsedAt = 0;
    var swipe3UsedAt = 0;

    function focusedWin() {
        try {
            if (typeof windows === 'undefined' || !windows || !windows.length) return null;
            var best = null;
            for (var i = 0; i < windows.length; i++) {
                var w = windows[i];
                if (!w || w.state === 'minimized') continue;
                if (!best || (w.zIndex || 0) > (best.zIndex || 0)) best = w;
            }
            return best;
        } catch (e) { return null; }
    }

    function defaultEdge(side) {
        var w = focusedWin();
        if (!w) return false;
        try {
            if (w.appId === 'browser' && typeof browserGoBack === 'function') {
                if (side === 'left') browserGoBack(w.id); else browserGoForward(w.id);
                return true;
            }
        } catch (e) { }
        try {
            if (w.appId === 'files' && typeof fmGoBack === 'function') {
                if (side === 'left') fmGoBack(); else fmGoForward();
                return true;
            }
        } catch (e2) { }
        return false;
    }

    function showDesktop() {
        try {
            if (typeof windows === 'undefined' || !windows) return false;
            var vis = [];
            for (var i = 0; i < windows.length; i++) if (windows[i].state !== 'minimized') vis.push(windows[i]);
            if (!vis.length) return false;
            if (typeof minimizeWindow !== 'function') return false;
            for (var j = 0; j < vis.length; j++) { try { minimizeWindow(vis[j].id); } catch (e) { } }
            return true;
        } catch (e2) { return false; }
    }

    function cycleApp(dir) {
        try {
            if (typeof windows === 'undefined' || typeof focusWindow !== 'function') return false;
            var list = [];
            for (var i = 0; i < windows.length; i++) if (windows[i].state !== 'minimized') list.push(windows[i]);
            if (list.length < 2) return false;
            list.sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); });
            var cur = list[list.length - 1];
            var idx = list.indexOf(cur);
            var next = list[(idx + dir + list.length) % list.length];
            focusWindow(next.id);
            return true;
        } catch (e) { return false; }
    }

    function defaultSwipe3(dir) {
        try {
            if (dir === 'up') {
                if (typeof openLaunchpad === 'function') { openLaunchpad(); return true; }
                return false;
            }
            if (dir === 'down') return showDesktop();
            return cycleApp(dir === 'right' ? -1 : 1);
        } catch (e) { return false; }
    }

    // 边缘 = 屏幕边缘，或当前浮动窗口自身的左右内边（窗口没贴屏时也能返回）
    function edgeSides(x) {
        var vw = window.innerWidth;
        var left = x <= cfg.edgeWidth;
        var right = x >= vw - cfg.edgeWidth;
        if (!left && !right) {
            var w = focusedWin();
            if (w) {
                var el = document.getElementById('window-' + w.id);
                if (el) {
                    var r = el.getBoundingClientRect();
                    var pad = Math.min(64, cfg.edgeWidth + 12);
                    if (r.width > 300 && x >= r.left && x <= r.right) {
                        if (x <= r.left + pad) left = true;
                        if (x >= r.right - pad) right = true;
                    }
                }
            }
        }
        return { left: left, right: right };
    }

    function systemGesture(e, node) {
        if (!cfg.threeFinger && !cfg.edgeSwipe) return false;
        var dx = norm(e, 'deltaX');
        var dy = norm(e, 'deltaY');
        var t = now();

        // 手势刚触发：残余位移继续吞掉，画面不再跟着滚
        if (t < edgeHoldUntil) { e.preventDefault(); return true; }

        if (!burst || t - burst.last > BURST_GAP) {
            var sx = (typeof e.clientX === 'number' && e.clientX > 0) ? e.clientX : pointer.x;
            var sy = (typeof e.clientY === 'number' && e.clientY > 0) ? e.clientY : pointer.y;
            burst = {
                start: t, last: t, dx: 0, dy: 0, n: 0,
                x: sx, y: sy, claimed: false, edgeTried: false
            };
        }
        burst.last = t;
        burst.dx += dx;
        burst.dy += dy;
        burst.n++;

        if (burst.claimed) { e.preventDefault(); return true; }

        var ax = Math.abs(burst.dx), ay = Math.abs(burst.dy);

        // 边缘滑动：起点必须在边缘，且横向明显大于纵向
        if (cfg.edgeSwipe && !burst.edgeTried && burst.x >= 0 && burst.n >= 2 && t - burst.start < 700) {
            var zone = edgeSides(burst.x);
            var inL = zone.left;
            var inR = zone.right;
            var horizon = ax > ay * 1.2 && ax > 2;
            if ((inL || inR) && horizon) {
                // 先按住不让页面横滚，凑够距离再判定
                e.preventDefault();
                if (ax >= 40 && t - edgeUsedAt > 900) {
                    // 自然滚动下「手指往右」= deltaX 负值：手指方向 = -deltaX
                    var side = (inL && burst.dx < 0) ? 'left' : ((inR && burst.dx > 0) ? 'right' : '');
                    if (side) {
                        edgeUsedAt = t;
                        edgeHoldUntil = t + 260;
                        burst.claimed = true;
                        if (!emit('edge', { side: side, dx: burst.dx, dy: burst.dy }) && cfg.edgeSwipe) defaultEdge(side);
                        return true;
                    }
                }
                return true;
            }
            burst.edgeTried = true;
        }

        // 三指：只在非滚动区域推断，避免抢列表横滚
        if (cfg.threeFinger && burst.n >= 3) {
            if (scrollUnderPointer(node)) { burst = null; return false; }
            var dt = burst.last - burst.start;
            var dir = '';
            var th = cfg.swipe3Threshold || 150;
            if (t - swipe3UsedAt > 700) {
                // 统一按「手指方向」报方向：right/up 指手指向右/向上拨
                if (dt <= 380 && ax >= th && ax > ay * 1.4) {
                    dir = burst.dx < 0 ? 'right' : 'left';
                } else if (dt <= 320 && ay >= th * 1.6 && ay > ax * 2) {
                    dir = burst.dy > 0 ? 'up' : 'down';
                }
            }
            if (dir) {
                swipe3UsedAt = t;
                burst.claimed = true;
                e.preventDefault();
                if (!emit('swipe3', { direction: dir, dx: burst.dx, dy: burst.dy, dt: dt }) && cfg.threeFinger) defaultSwipe3(dir);
                return true;
            }
        }
        return false;
    }

    /* ---------------- 主 wheel 监听 ---------------- */
    function paused() {
        if (api && api._paused) return true;
        try {
            var l = document.getElementById('lock-screen');
            if (!l) return false;
            var cs = getComputedStyle(l);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
            if (parseFloat(cs.opacity || '1') < 0.02) return false;
            var r = l.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        } catch (e) { return false; }
    }

    function onWheel(e) {
        if (!cfg.enabled) return;
        if (e.__n26g) return;
        e.__n26g = 1;
        if (paused()) return;

        var node = e.target;
        if (isOff(node)) return;

        // 1) 捏合（ctrl + wheel 是 Chromium 触控板捏合的通用编码）
        if (e.ctrlKey && cfg.pinch) {
            if (handlePinch(e, node)) { lastCtrlPinch = now(); return; }
        }

        // 2) 鼠标 / 触控板
        var kind = detectKind(e);

        // 3) 三指 / 边缘（触控板才做）
        if (kind === 'trackpad' && systemGesture(e, node)) return;

        // 4) 滚动
        handleScroll(e, node, kind);
    }

    window.addEventListener('wheel', onWheel, { capture: true, passive: false });

    window.addEventListener('mousemove', function (e) {
        pointer.x = e.clientX; pointer.y = e.clientY;
    }, { capture: true, passive: true });

    window.addEventListener('gesturestart', onGestureStart, { capture: true, passive: false });
    window.addEventListener('gesturechange', onGestureChange, { capture: true, passive: false });
    window.addEventListener('gestureend', onGestureEnd, { capture: true, passive: false });

    /* ---------------- 同源 iframe 接管 ----------------
       wheel 不会从 iframe 冒泡到主壳，所以把同一个手势层注入同源 iframe。
       跨域 iframe 注入必然抛异常，直接放行浏览器原生行为。 */
    function attachFrame(frame) {
        if (!frame || frame.__n26gAttach || !SELF_SRC) return;
        var off = false;
        try { off = !!(frame.closest && frame.closest('[data-n26-gestures="off"]')); } catch (e) { }
        if (off) return;
        frame.__n26gAttach = true;

        function inject() {
            var doc = null;
            try { doc = frame.contentDocument; } catch (e) { return; }
            if (!doc || !doc.head) return;              // 跨域或还没就绪
            try {
                if (doc.getElementById('n26GesturesScript')) return;
                var s = doc.createElement('script');
                s.id = 'n26GesturesScript';
                s.src = SELF_SRC;
                doc.head.appendChild(s);
            } catch (e2) { }
        }
        frame.addEventListener('load', inject);
        inject();
    }

    function scanFrames(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.tagName === 'IFRAME') { attachFrame(root); return; }
        if (!root.querySelector || !root.querySelector('iframe')) return;
        var list = root.querySelectorAll('iframe');
        for (var i = 0; i < list.length; i++) attachFrame(list[i]);
    }

    try {
        scanFrames(document.documentElement);
        var frameMo = new MutationObserver(function (muts) {
            for (var i = 0; i < muts.length; i++) {
                var nodes = muts[i].addedNodes || [];
                for (var j = 0; j < nodes.length; j++) scanFrames(nodes[j]);
            }
        });
        frameMo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { }

    // iframe 里的边缘 / 多指手势回传宿主，由宿主执行真正的导航
    window.addEventListener('message', function (ev) {
        var d = ev && ev.data;
        if (!d || !d.__nexusGesture) return;
        var det = d.detail || {};
        if (d.type === 'edge') {
            if (!emit('edge', { side: det.side, source: 'iframe' })) defaultEdge(det.side);
        } else if (d.type === 'swipe3') {
            if (!emit('swipe3', { direction: det.direction, source: 'iframe' })) defaultSwipe3(det.direction);
        } else if (d.type === 'pinch' || d.type === 'pinchend' || d.type === 'pinchnone') {
            emit(d.type, det);
        }
    }, false);

    /* ---------------- 轻点拖拽 ---------------- */
    function enableDrag(el, opts) {
        if (!el) return null;
        opts = opts || {};
        var o = {
            threshold: opts.threshold != null ? opts.threshold : 4,
            hold: opts.hold || 0,
            handle: opts.handle || null,
            axis: opts.axis || 'both',
            dropSelector: opts.dropSelector || '[data-n26-drop]',
            ghost: opts.ghost !== false,
            onStart: opts.onStart || null,
            onMove: opts.onMove || null,
            onEnd: opts.onEnd || null
        };
        var st = null;
        var alt = null;          // 第二根手指：浏览器把两指报成两个独立 pointer 时使用
        var swallowTimer = 0;

        function swallow(ev) {
            if (!st || !st.active) return;
            ev.preventDefault();
            ev.stopPropagation();
        }
        function clearSwallow() {
            window.removeEventListener('click', swallow, true);
            if (swallowTimer) { clearTimeout(swallowTimer); swallowTimer = 0; }
        }

        /* 精准触控板语义：一根手指按住不动 = 按住，另一根手指轻滑 = 拖动。
           两类浏览器行为都要吃得下：
           1) Windows 精准触控板：按住的那根不动，第二根的滑动由系统合成成 pointermove
              （同一个 pointerId），所以「按下 + 位移」本身就等于两指拖移，不需要长按；
           2) 触摸屏 / 部分合成器：两指各是一个 pointer，第二根手指在这里登记为 alt。 */
        function onDown(e) {
            if (!cfg.tapDrag || !cfg.enabled) return;
            if (e.button !== 0) return;
            if (isEditable(e.target)) return;
            if (o.handle && !(e.target.closest && e.target.closest(o.handle))) return;
            if (isOff(e.target)) return;
            st = {
                x: e.clientX, y: e.clientY, t: now(), active: false,
                id: e.pointerId, dx: 0, dy: 0
            };
            alt = null;
            window.addEventListener('pointermove', onMove, { capture: true, passive: false });
            window.addEventListener('pointerup', onUp, { capture: true });
            window.addEventListener('pointercancel', onCancel, { capture: true });
            window.addEventListener('pointerdown', onAltDown, { capture: true });
        }

        function onAltDown(e) {
            if (!st || e.pointerId === st.id) return;
            alt = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }

        function onMove(e) {
            if (!st) return;
            var second = !!(alt && e.pointerId === alt.id);
            if (e.pointerId !== st.id && !second) return;
            var dx, dy;
            if (second) {
                dx = e.clientX - alt.x;
                dy = e.clientY - alt.y;
            } else {
                dx = e.clientX - st.x;
                dy = e.clientY - st.y;
            }
            if (!st.active) {
                if (Math.abs(dx) < o.threshold && Math.abs(dy) < o.threshold) return;
                if (o.hold && now() - st.t < o.hold) return;
                st.active = true;
                try { el.classList.add('n26g-dragging'); document.body.classList.add('n26g-drag'); } catch (er) { }
                emit('dragstart', { el: el, dx: dx, dy: dy });
                if (o.onStart) { try { o.onStart(dx, dy, e); } catch (er) { } }
            }
            if (e.cancelable) e.preventDefault();
            if (o.axis === 'x') dy = 0;
            if (o.axis === 'y') dx = 0;
            st.dx = dx; st.dy = dy;
            if (o.ghost) el.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
            if (o.onMove) { try { o.onMove(dx, dy, e); } catch (er3) { } }
            emit('drag', { el: el, dx: dx, dy: dy });
        }

        function cleanup() {
            window.removeEventListener('pointermove', onMove, true);
            window.removeEventListener('pointerup', onUp, true);
            window.removeEventListener('pointercancel', onCancel, true);
            window.removeEventListener('pointerdown', onAltDown, true);
        }

        function onCancel(e) {
            if (!st) return;
            if (e && e.pointerId !== st.id && !(alt && e.pointerId === alt.id)) return;
            var was = st.active;
            cleanup();
            st = null;
            alt = null;
            if (!was) return;
            try { el.classList.remove('n26g-dragging'); document.body.classList.remove('n26g-drag'); } catch (e) { }
            if (o.ghost) el.style.transform = '';
            emit('dragend', { el: el, target: null, canceled: true });
        }

        function onUp(e) {
            if (!st) return;
            if (e.pointerId !== st.id && !(alt && e.pointerId === alt.id)) return;
            var was = st.active, dx = st.dx, dy = st.dy;
            cleanup();
            var snapshot = st;
            st = null;
            alt = null;
            if (!was) return;

            var drop = null;
            try {
                var stack = document.elementsFromPoint(e.clientX, e.clientY) || [];
                for (var i = 0; i < stack.length; i++) {
                    var cand = stack[i];
                    if (!cand || cand === el || typeof cand.matches !== 'function') continue;
                    if (cand.matches(o.dropSelector)) { drop = cand; break; }
                }
            } catch (er) { }

            emit('drop', { el: el, target: drop, dx: dx, dy: dy });
            emit('dragend', { el: el, target: drop, dx: dx, dy: dy });
            if (o.onEnd) { try { o.onEnd(dx, dy, drop); } catch (er2) { } }

            if (o.ghost) {
                if (drop) {
                    // 已经成功投放：直接交还给宿主，不做过场动画
                    el.style.transition = 'none';
                    el.style.transform = '';
                    setTimeout(function () { el.style.transition = ''; }, 30);
                } else {
                    el.style.transition = reduced() ? 'none' : 'transform .3s cubic-bezier(.16,1,.3,1)';
                    el.style.transform = '';
                    setTimeout(function () { el.style.transition = ''; }, 320);
                }
            }
            try { el.classList.remove('n26g-dragging'); document.body.classList.remove('n26g-drag'); } catch (e2) { }

            // 拖过之后压掉随后的幽灵 click（250ms 内）
            window.addEventListener('click', swallow, true);
            swallowTimer = setTimeout(clearSwallow, 260);
            if (snapshot) snapshot.active = false;
        }

        el.addEventListener('pointerdown', onDown);

        return {
            destroy: function () {
                el.removeEventListener('pointerdown', onDown);
                cleanup();
                clearSwallow();
            }
        };
    }

    /* ---------------- 调试 HUD ---------------- */
    var hud = null;
    var hudLogs = [];
    var debugOn = false;

    var LABELS = {
        scroll: '双指滚动', scrollend: '滚动结束', bounce: '边缘回弹',
        pinch: '捏合缩放', pinchend: '捏合结束', pinchnone: '捏合未命中',
        swipe3: '三指手势', edge: '边缘滑动',
        dragstart: '开始拖移', drag: '拖移中', dragend: '结束拖移', drop: '放置'
    };

    function summary(type, d) {
        if (!d) return '';
        if (type === 'scroll') return (d.kind === 'mouse' ? '鼠标' : '触控板') + ' Δ ' + Math.round(d.dx || 0) + ',' + Math.round(d.dy || 0);
        if (type === 'bounce') return d.edge + ' 边缘';
        if (type === 'pinch') return '×' + (d.factor ? d.factor.toFixed(3) : '1') + (d.applied ? ' 已应用' : ' 仅事件');
        if (type === 'pinchend') return '×' + (d.scale ? d.scale.toFixed(2) : '1');
        if (type === 'swipe3') return d.direction + ' · ' + Math.round(d.dt || 0) + 'ms';
        if (type === 'edge') return d.side + ' 边缘';
        if (type === 'drag' || type === 'dragend' || type === 'drop' || type === 'dragstart') return Math.round(d.dx || 0) + ',' + Math.round(d.dy || 0);
        return '';
    }

    function hudEnsure() {
        if (hud && hud.isConnected) return hud;
        hud = document.createElement('div');
        hud.id = 'n26gHud';
        hud.setAttribute('data-n26-gestures', 'off');
        hud.innerHTML =
            '<div class="n26g-hud-head"><b>手势识别</b><button type="button" class="n26g-hud-x" title="关闭">×</button></div>' +
            '<div class="n26g-hud-now"><span id="n26gNow">等待手势…</span></div>' +
            '<div class="n26g-hud-toggles"></div>' +
            '<div class="n26g-hud-log" id="n26gLog"></div>' +
            '<div class="n26g-hud-foot">N26Gestures ' + VERSION + ' · 仅调试</div>';
        document.body.appendChild(hud);

        var tog = hud.querySelector('.n26g-hud-toggles');
        var defs = [
            ['inertia', '惯性'],
            ['bounce', '回弹'],
            ['pinch', '捏合'],
            ['threeFinger', '三指'],
            ['edgeSwipe', '边缘'],
            ['mouseSmooth', '鼠标平滑']
        ];
        for (var i = 0; i < defs.length; i++) {
            (function (key, label) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'n26g-hud-tog' + (cfg[key] ? ' on' : '');
                b.textContent = label;
                b.addEventListener('click', function () {
                    var patch = {};
                    patch[key] = !cfg[key];
                    configure(patch);
                    b.classList.toggle('on', !!cfg[key]);
                });
                tog.appendChild(b);
            })(defs[i][0], defs[i][1]);
        }
        hud.querySelector('.n26g-hud-x').addEventListener('click', function () { setDebug(false); });
        style();
        return hud;
    }

    function style() {
        if (document.getElementById('n26gStyle')) return;
        var st = document.createElement('style');
        st.id = 'n26gStyle';
        st.textContent = [
            '#n26gHud{position:fixed;right:14px;bottom:14px;z-index:9999;width:236px;',
            'background:rgba(18,20,28,.86);backdrop-filter:blur(18px) saturate(1.4);',
            '-webkit-backdrop-filter:blur(18px) saturate(1.4);border:1px solid rgba(255,255,255,.14);',
            'border-radius:14px;color:#e8eefc;font:12px/1.5 -apple-system,"Microsoft YaHei",sans-serif;',
            'box-shadow:0 16px 40px rgba(0,0,0,.42);padding:10px 12px 8px;pointer-events:none;user-select:none;}',
            '#n26gHud .n26g-hud-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}',
            '#n26gHud .n26g-hud-head b{font-size:12px;letter-spacing:.4px;color:rgba(255,255,255,.86);}',
            '#n26gHud .n26g-hud-x{pointer-events:auto;width:20px;height:20px;border:0;border-radius:6px;',
            'background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:13px;line-height:1;}',
            '#n26gHud .n26g-hud-now{display:flex;align-items:center;gap:6px;min-height:26px;padding:4px 8px;',
            'border-radius:8px;background:rgba(96,165,250,.16);color:#bfdbfe;font-weight:600;}',
            '#n26gHud .n26g-hud-now.flash{background:rgba(96,165,250,.42);color:#fff;}',
            '#n26gHud .n26g-hud-toggles{display:flex;flex-wrap:wrap;gap:4px;margin:7px 0 6px;}',
            '#n26gHud .n26g-hud-tog{pointer-events:auto;border:1px solid rgba(255,255,255,.14);',
            'background:rgba(255,255,255,.06);color:rgba(255,255,255,.5);border-radius:6px;font-size:11px;',
            'padding:2px 6px;cursor:pointer;}',
            '#n26gHud .n26g-hud-tog.on{background:rgba(34,197,94,.22);border-color:rgba(34,197,94,.5);color:#bbf7d0;}',
            '#n26gHud .n26g-hud-log{max-height:104px;overflow:hidden;font-family:ui-monospace,Consolas,monospace;',
            'font-size:11px;color:rgba(255,255,255,.55);display:flex;flex-direction:column;gap:2px;}',
            '#n26gHud .n26g-hud-log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '#n26gHud .n26g-hud-log b{color:#93c5fd;font-weight:600;}',
            '#n26gHud .n26g-hud-foot{margin-top:6px;font-size:10px;color:rgba(255,255,255,.28);}',
            '.n26g-drag, .n26g-drag *{cursor:grabbing!important;}',
            '.n26g-dragging{opacity:.88;filter:drop-shadow(0 10px 22px rgba(0,0,0,.35));}'
        ].join('');
        (document.head || document.documentElement).appendChild(st);
    }

    function hudLog(type, detail) {
        if (!debugOn) return;
        if (!hud || !hud.isConnected) return;
        var label = LABELS[type];
        if (!label) return;
        var nowEl = hud.querySelector('#n26gNow');
        if (nowEl) {
            nowEl.textContent = label + (summary(type, detail) ? ' · ' + summary(type, detail) : '');
            nowEl.parentNode.classList.add('flash');
            setTimeout(function () { if (nowEl.parentNode) nowEl.parentNode.classList.remove('flash'); }, 160);
        }
        hudLogs.unshift({ t: new Date(), label: label, s: summary(type, detail) });
        if (hudLogs.length > 6) hudLogs.length = 6;
        var box = hud.querySelector('#n26gLog');
        if (!box) return;
        var html = '';
        for (var i = 0; i < hudLogs.length; i++) {
            var it = hudLogs[i];
            var hh = it.t.getHours(), mm = it.t.getMinutes(), ss = it.t.getSeconds();
            html += '<div>' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss +
                ' <b>' + it.label + '</b> ' + (it.s || '') + '</div>';
        }
        box.innerHTML = html;
    }

    function setDebug(flag) {
        debugOn = flag !== false;
        if (debugOn) { hudEnsure(); hud.style.display = ''; }
        else if (hud) hud.style.display = 'none';
        return debugOn;
    }

    /* ---------------- 配置 ---------------- */
    function configure(patch, opts) {
        if (patch && typeof patch === 'object') {
            for (var k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(patch, k)) cfg[k] = patch[k];
            if (!opts || opts.persist !== false) saveCfg();
        }
        if (hud && hud.isConnected) {
            var btns = hud.querySelectorAll('.n26g-hud-tog');
            var keys = ['inertia', 'bounce', 'pinch', 'threeFinger', 'edgeSwipe', 'mouseSmooth'];
            for (var i = 0; i < btns.length && i < keys.length; i++) btns[i].classList.toggle('on', !!cfg[keys[i]]);
        }
        emit('config', clone(cfg));
        return clone(cfg);
    }
    function getConfig() { return clone(cfg); }

    /* ---------------- 公开 API ---------------- */
    var api = window.N26Gestures = {
        version: VERSION,
        config: getConfig,
        configure: configure,
        on: on,
        off: off,
        intercept: intercept,
        emit: emit,
        simulate: function (type, detail) {
            var d = detail || {};
            var handled = emit(type, d);
            if (!handled) {
                if (type === 'swipe3') defaultSwipe3(d.direction);
                else if (type === 'edge') defaultEdge(d.side);
            }
            return handled;
        },
        debug: setDebug,
        enableDrag: enableDrag,
        resetPinch: resetPinch,
        detectKind: detectKind,
        reduced: reduced,
        pause: function () { api._paused = true; },
        resume: function () { api._paused = false; },
        state: function () {
            return {
                version: VERSION, config: clone(cfg), debug: debugOn, paused: paused(),
                pointer: { x: pointer.x, y: pointer.y },
                lastBurst: burst ? { dx: burst.dx, dy: burst.dy, n: burst.n, claimed: burst.claimed } : null,
                reduced: reduced()
            };
        }
    };

    /* 键盘兜底（默认关，设置里可开） */
    document.addEventListener('keydown', function (e) {
        if (!cfg.keyboardFallback || !cfg.enabled) return;
        if (!e.ctrlKey || e.metaKey || e.altKey) return;
        if (isEditable(e.target) || paused()) return;
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            var dir = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down'
                : e.key === 'ArrowLeft' ? 'left' : 'right';
            e.preventDefault();
            emit('swipe3', { direction: dir, keyboard: true });
            defaultSwipe3(dir);
        }
    }, { capture: true });

    /* 减少动效变化时不需要额外处理：所有分支实时读取 reduced() */

    /* 供控制台 / 自动化测试 */
    window.n26GesturesStart = function () { return configure({ enabled: true }); };
    window.n26GesturesStop = function () { return configure({ enabled: false }); };
})();
