/* ============================================================
   N26 Smooth · 全局「真他妈丝滑」引擎（v2.9.95）
   ------------------------------------------------------------
   零侵入：不改任何业务函数，只在页面最早期接管四件会掉帧的事。

   ① 统一 1s 时基：主壳里 5+ 个 setInterval(fn, 1000)（锁屏时间、
      桌面时钟、双区时间、系统监视、时间预览）原本各自唤醒、互相错开
      几毫秒，每秒制造 5 次「样式计算 → 布局 → 绘制」。现在合并成
      一个真实定时器 + 同一 rAF 帧内顺序执行，浏览器每秒只重算一次。
   ② 读写分离：read() 全部先跑、write() 后跑，杜绝强制同步布局
      （layout thrashing）。
   ③ 长任务分片：enqueue()/chunk() 每帧最多 2 项、预算 6ms，
      小组件选择器 19 张预览卡不再同帧炸掉主线程。
   ④ 按需合成层：只对真实交互卡片（.desktop-widget-card /
      .widget-panel-card / 可选 [data-n26-lift]）在按住瞬间提升，
      松手即撤，避免常驻 will-change 吃满 GPU 内存。

   页面隐藏时装饰任务暂停，回到前台立刻补一次（锁屏回来时钟不旧）。
   逃生口：window.__N26_NO_TICK_MERGE__ = true 可关掉 ①。

   ★ 1s 定时器已逐处审计（主壳共 8 个，全是时钟类，合并安全）：
     updateLockTime / tick(系统运行时间·代码冷却) / paint(时间预览) /
     updateWidgetTime / updateDesktopWidgetClocks / updateSleepOverlayClock /
     wcUpdateTime，另有「音乐进度推算」「屏幕使用时间」等 1s 轮询，
     都是「读一次状态、写一次 DOM」，进同一 write 帧反而更省一次布局。
   ============================================================ */
(function () {
    'use strict';
    if (window.N26Smooth) return;

    var now = function () {
        return (window.performance && performance.now) ? performance.now() : Date.now();
    };
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(function () { fn(now()); }, 16); };
    var caf = window.cancelAnimationFrame || clearTimeout;
    var reduced = false;
    try { reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { }

    var stat = { merged: 0, ticks: 0, chunks: 0, writes: 0, reads: 0 };

    /* ---------- ② 读写分离：同帧先读后写 ---------- */
    var readQ = [], writeQ = [], flushRaf = 0;
    function flush() {
        flushRaf = 0;
        var rs = readQ.splice(0, readQ.length);
        var ws = writeQ.splice(0, writeQ.length);
        for (var i = 0; i < rs.length; i++) { try { rs[i](); } catch (e) { } }
        for (var j = 0; j < ws.length; j++) { try { ws[j](); } catch (e) { } }
        stat.reads += rs.length; stat.writes += ws.length;
    }
    function schedule() { if (!flushRaf) flushRaf = raf(flush); }
    function read(fn) { if (typeof fn === 'function') { readQ.push(fn); schedule(); } }
    function write(fn) { if (typeof fn === 'function') { writeQ.push(fn); schedule(); } }

    /* ---------- ③ 长任务分片 ---------- */
    var PER_FRAME = 2, BUDGET_MS = 6;
    var jobs = [], jobKeys = Object.create(null), jobRaf = 0;
    function pump() {
        if (jobRaf) return;
        jobRaf = raf(function () {
            jobRaf = 0;
            var t0 = now(), n = 0;
            while (jobs.length && n < PER_FRAME && (now() - t0) < BUDGET_MS) {
                var job = jobs.shift();
                delete jobKeys[job.key];
                try { job.fn(); } catch (e) { }
                n++; stat.chunks++;
            }
            if (jobs.length) pump();
        });
    }
    /* key 去重：主壳懒加载器与 gallery 的 level1 会请求同一张卡，只渲染一次 */
    function enqueue(key, fn) {
        if (typeof fn !== 'function') return;
        key = String(key);
        if (jobKeys[key]) return;
        jobKeys[key] = 1;
        jobs.push({ key: key, fn: fn });
        pump();
    }
    function chunk(items, fn, keyPrefix) {
        for (var i = 0; i < items.length; i++) {
            (function (it, idx) { enqueue((keyPrefix || 'job') + ':' + idx, function () { fn(it, idx); }); })(items[i], i);
        }
    }
    function drop(keyPrefix) {
        for (var i = jobs.length - 1; i >= 0; i--) {
            if (jobs[i].key.indexOf(keyPrefix) === 0) { delete jobKeys[jobs[i].key]; jobs.splice(i, 1); }
        }
    }

    /* ---------- ① 统一 1s 时基（hook setInterval / clearInterval） ---------- */
    var origSetInterval = window.setInterval;
    var origClearInterval = window.clearInterval;
    /* 用纯对象存订阅，避免 Map / iterator 在老引擎与 vm 假 DOM 里的兼容差异 */
    var subs = Object.create(null);
    var bus = {
        set: function (k, v) { subs[k] = v; },
        has: function (k) { return Object.prototype.hasOwnProperty.call(subs, k); },
        del: function (k) { delete subs[k]; },
        list: function () { return Object.keys(subs).map(function (k) { return subs[k]; }); },
        size: function () { return Object.keys(subs).length; }
    };
    var fakeSeq = 0x4e320000;
    var sharedTicker = 0;
    var hiddenPending = false;

    function isHidden() {
        try { return !!(document && document.hidden); } catch (e) { return false; }
    }
    function runSharedTick() {
        if (isHidden()) { hiddenPending = true; return; }
        hiddenPending = false;
        var list = bus.list();
        /* 所有时钟回调塞进同一个 write 帧 → 一次样式计算、一次布局、一次绘制 */
        write(function () {
            for (var i = 0; i < list.length; i++) { try { list[i](); } catch (e) { } }
            stat.ticks++;
        });
    }
    function ensureShared() {
        if (sharedTicker) return;
        sharedTicker = origSetInterval.call(window, runSharedTick, 1000);
    }
    function stopShared() {
        if (!sharedTicker || bus.size() > 0) return;
        origClearInterval.call(window, sharedTicker);
        sharedTicker = 0;
    }
    function mergedSetInterval(fn, ms) {
        /* 只合并「约 1 秒」的纯函数定时器；带额外参数的、非时钟的一律原样放行 */
        if (typeof fn === 'function' && arguments.length <= 2 &&
            typeof ms === 'number' && ms >= 900 && ms <= 1100 &&
            !window.__N26_NO_TICK_MERGE__) {
            var id = ++fakeSeq;
            bus.set(id, fn);
            stat.merged++;
            ensureShared();
            return id;
        }
        return origSetInterval.apply(window, arguments);
    }
    function mergedClearInterval(id) {
        if (bus.has(id)) { bus.del(id); stopShared(); return undefined; }
        return origClearInterval.call(window, id);
    }
    try {
        window.setInterval = mergedSetInterval;
        window.clearInterval = mergedClearInterval;
    } catch (e) { /* 只读环境：其余能力照常 */ }

    /* 前台恢复：立刻补一拍，避免锁屏回来时钟停在旧值 */
    try {
        document.addEventListener('visibilitychange', function () {
            if (!isHidden() && hiddenPending) runSharedTick();
        });
    } catch (e) { }

    /* ---------- ④ 按需合成层 ----------
       真实节点没挂 data-n26-lift，必须按实际类名抓，否则整套机制空转。 */
    var LIFT_SEL = '[data-n26-lift], .desktop-widget-card, .widget-panel-card';
    var lifted = [];
    function clearLift() {
        for (var i = 0; i < lifted.length; i++) { try { lifted[i].style.willChange = ''; } catch (e) { } }
        lifted = [];
    }
    try {
        document.addEventListener('pointerdown', function (e) {
            var el = e.target && e.target.closest ? e.target.closest(LIFT_SEL) : null;
            if (!el || reduced) return;
            try { el.style.willChange = 'transform'; lifted.push(el); } catch (err) { }
        }, true);
        window.addEventListener('pointerup', function () { write(clearLift); }, true);
        window.addEventListener('pointercancel', function () { write(clearLift); }, true);
    } catch (e) { }

    /* ---------- 统一缓动令牌（CSS 里也可直接写，这里保证 JS 动画同源） ---------- */
    try {
        var de = document.documentElement;
        de.style.setProperty('--n26-ease-out', 'cubic-bezier(0.16, 1, 0.3, 1)');
        de.style.setProperty('--n26-ease-in-out', 'cubic-bezier(0.4, 0, 0.2, 1)');
        de.style.setProperty('--n26-ease-spring', 'cubic-bezier(0.34, 1.4, 0.64, 1)');
    } catch (e) { }

    window.N26Smooth = {
        version: '1.0-2.9.95',
        read: read, write: write,
        enqueue: enqueue, chunk: chunk, drop: drop,
        tick: function (fn) { /* 订阅统一时基，供新代码使用 */
            var id = ++fakeSeq; bus.set(id, fn); stat.merged++; ensureShared(); return id;
        },
        untick: mergedClearInterval,
        stats: function () {
            return { merged: stat.merged, ticks: stat.ticks, chunks: stat.chunks,
                writes: stat.writes, reads: stat.reads, subscribers: bus.size(),
                pending: jobs.length, shared: !!sharedTicker };
        },
        /* 自检专用：虚拟时钟驱动一拍 */
        _runTick: runSharedTick
    };
})();
