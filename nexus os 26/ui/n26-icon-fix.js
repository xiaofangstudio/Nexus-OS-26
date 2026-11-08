/* ==========================================================================
   Nexus OS 26 · 图标包强制开关（v2.10.9）
   --------------------------------------------------------------------------
   用户反馈六次：「手绘图标还是换不回去，我明明开关切换了 n 多遍，还是没有变」。
   查下来是四层问题叠在一起，本模块把四层全堵掉：

     ① 旧开关的 onclick 是**渲染时算好的目标值**（`setIconPack('${s.iconPack === 'n26' ? 'flat':'n26'}')`），
        设置面板不重建 → 点一百次都写同一个值 → 「切了 n 多遍没变」；
     ② iconPack 走 getUserLS → 可能落在 IndexedDB 账户缓存，与 localStorage 那份不同步；
     ③ 各处渲染函数可能在「点击窗口」被 NoReload / DomKeep 拦下或走缓存 → 数据变了、屏幕没变；
     ④ 就算渲染跑了，也只覆盖「当时在 DOM 里」的那几个表面。

   对策（都不改图标设计、不改视觉）：
     · 只认独立键 `n26:icon-pack`（同步、可预测、不会被归一化重写）；
     · 捕获阶段 stopImmediatePropagation 劫持那个开关，点一次就按「当前值取反」强制执行；
     · 先跑各表面重渲染，再做一遍 **DOM 级图标就地替换**（直接换掉屏幕上的元素，
       不依赖任何渲染函数是否被拦/是否有缓存）—— 这是「一定会变」的兜底；
     · 画完数一遍真图 / 扁平图数量，用通知回报；数字为 0 时明确说原因。
   ========================================================================== */
(function () {
    'use strict';
    if (window.__n26IconFix) return;
    window.__n26IconFix = true;

    var KEY = 'n26:icon-pack';

    function readKey() {
        try {
            var v = localStorage.getItem(KEY);
            return (v === 'n26' || v === 'flat') ? v : '';
        } catch (e) { return ''; }
    }
    function writeKey(p) {
        try { localStorage.setItem(KEY, p); } catch (e) { }
    }
    /* 当前生效值：独立键 > 设置 > 默认扁平 */
    function currentPack() {
        var k = readKey();
        if (k) return k;
        try {
            if (typeof window.getUserLS === 'function') {
                var s = window.getUserLS('settings') || {};
                if (s.iconPack === 'n26') return 'n26';
                if (s.iconPack === 'flat') return 'flat';
            }
        } catch (e) { }
        return window.N26_ICON_PACK === 'n26' ? 'n26' : 'flat';
    }

    /* 把当前值同步回设置（尽力而为；失败也不影响图标本身） */
    function syncSettings(p) {
        try {
            if (typeof window.setUserLS === 'function') {
                var s = window.getUserLS('settings') || {};
                s.iconPack = p;
                window.setUserLS('settings', s);
            }
        } catch (e) { }
        window.N26_ICON_PACK = p;
    }

    /* 覆盖全局取包函数（图标渲染只认这个值）。
       ★ 每次强制切换前都重装一遍：万一有别的脚本后加载又把它写回旧实现，
         这里能当场抢回来。 */
    function ensureOverride() {
        try {
            window.getIconPack = function () { return currentPack(); };
        } catch (e) { }
    }
    ensureOverride();

    /* ---------- 各表面重渲染（数据层） ---------- */
    function clearCaches() {
        try { var tm = document.getElementById('smtGrid'); if (tm) tm._n26Key = ''; } catch (e) { }
    }

    function rerender() {
        clearCaches();
        try { if (typeof window.renderLaunchpad === 'function') window.renderLaunchpad(); } catch (e) { }
        try { if (typeof window.renderStartMenuApps === 'function') window.renderStartMenuApps(); } catch (e) { }
        try { if (typeof window.n26RenderTileMenu === 'function') window.n26RenderTileMenu(); } catch (e) { }
        try { if (typeof window.renderDesktopIcons === 'function') window.renderDesktopIcons(); } catch (e) { }
        try { if (typeof window.n26RefreshDockIcons === 'function') window.n26RefreshDockIcons(); } catch (e) { }
        try {
            var host = document.querySelector('.appstore-container');
            var wrap = host ? (host.closest('.window-content') || host.parentNode) : null;
            if (!host) wrap = document.getElementById('appStoreGrid');
            var keep = host ? host.scrollTop : 0;
            if (wrap && typeof window.appStoreRenderMain === 'function') window.appStoreRenderMain(wrap);
            var now = document.querySelector('.appstore-container');
            if (now && keep) now.scrollTop = keep;
        } catch (e) { }
    }

    /* ---------- DOM 级图标就地替换（视觉层 · 一定生效的兜底） ---------- */

    /* 从元素往上找 appId：data-app-id → img.alt → 祖先 onclick 里的 openApp / appStoreShowDetail */
    function appIdOf(el) {
        try {
            var p = el.closest ? el.closest('[data-app-id]') : null;
            if (p && p.dataset && p.dataset.appId) return p.dataset.appId;
            if (el.tagName === 'IMG' && el.alt) return el.alt;
            var n = el, hops = 0;
            while (n && hops < 5) {
                var oc = (n.getAttribute && n.getAttribute('onclick')) || '';
                if (oc) {
                    var m = oc.match(/openApp\('([^']+)'/) || oc.match(/appStoreShowDetail\('([^']+)'/) ||
                        oc.match(/n26OpenApp\('([^']+)'/);
                    if (m) return m[1];
                }
                n = n.parentElement; hops++;
            }
            var da = el.getAttribute && (el.getAttribute('data-app') || el.getAttribute('data-id'));
            if (da) return da;
        } catch (e) { }
        return '';
    }

    /* 就地替换只做「图标本身就是独立方块」的四个表面：
       启动台 / 开始菜单 / 磁贴菜单 / 桌面。商城卡片的小图标由 CSS 控尺寸、
       重渲染链路已经可靠（用户看到的正是「商城被打回 FA」= 那条路确实在跑），
       就地替换反而有改坏排版的风险，所以商城只数不换。 */
    var SWAP_SURFACES = '#launchpadGrid, #startMenuGrid, #smtGrid, #desktopIcons';
    var COUNT_SURFACES = SWAP_SURFACES + ', .appstore-container, .as-rail, .store-detail';

    function swapInDom() {
        if (typeof window.n26IconHTML !== 'function') return 0;
        var nodes = [];
        try {
            var scope = document.querySelectorAll(SWAP_SURFACES + ' [data-n26-icon]');
            for (var i = 0; i < scope.length; i++) {
                /* Dock 5 个固定项是品牌原图锁定，绝不参与替换 */
                if (scope[i].closest('#dock') || scope[i].closest('.dock-item')) continue;
                nodes.push(scope[i]);
            }
        } catch (e) { return 0; }
        var done = 0;
        for (var k = 0; k < nodes.length; k++) {
            var el = nodes[k];
            try {
                if (!el.parentNode) continue;
                var id = appIdOf(el);
                if (!id) continue;
                /* 尺寸 / 圆角按屏幕上真实的量（只在这一刻读一次，不在滚动路径上） */
                var w = el.offsetWidth || parseInt(el.style.width, 10) || 48;
                var br = 0;
                try { br = Math.round(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0); } catch (e2) { }
                if (!br) br = Math.round(w * 0.22);
                var inLaunchpad = !!(el.closest('#launchpadGrid'));
                var html = window.n26IconHTML(id, {
                    size: w, radius: br,
                    noTileBg: inLaunchpad,
                    /* 已有 FA 图标的应用（扁平包）要沿用同一个字形 */
                    fa: (function (n2) {
                        var i2 = n2.querySelector && n2.querySelector('i.fas, i.fa-solid, i.fa-regular, i');
                        if (!i2) return '';
                        var cl = i2.className || '';
                        var m2 = cl.match(/fa-[a-z0-9-]+/g);
                        return m2 ? m2.join(' ') : '';
                    })(el)
                });
                if (!html) continue;
                var box = document.createElement('span');
                box.innerHTML = html;
                var fresh = box.firstElementChild;
                if (!fresh) continue;
                /* 换上去之后保证「显示层」不受旧类拖累 */
                el.parentNode.replaceChild(fresh, el);
                done++;
            } catch (e3) { }
        }
        return done;
    }

    function countDrawn() {
        var imgs = 0, flats = 0;
        try {
            var scope = document.querySelectorAll(COUNT_SURFACES);
            for (var i = 0; i < scope.length; i++) {
                imgs += scope[i].querySelectorAll('img.n26-app-img').length;
                flats += scope[i].querySelectorAll('.app-icon-flat, .n26-app-fallback').length;
            }        } catch (e) { }
        return { imgs: imgs, flats: flats };
    }

    /* 让设置里那个开关的亮灭跟着真实值走（否则会出现「开关是灰的、图标却是自绘」） */
    function syncSwitch() {
        try {
            var list = document.querySelectorAll('.fu-switch[onclick*="setIconPack"], .toggle-switch[onclick*="setIconPack"]');
            for (var i = 0; i < list.length; i++) {
                var on = currentPack() === 'n26';
                list[i].classList.toggle('active', on);
                list[i].classList.toggle('on', on);
                list[i].setAttribute('aria-checked', on ? 'true' : 'false');
                /* 旧 onclick 里那个目标值是渲染时算死的，这里就地改成正确的反值 */
                list[i].setAttribute('onclick', "setIconPack('" + (on ? 'flat' : 'n26') + "')");
            }
        } catch (e) { }
    }

    function repaint() {
        ensureOverride();
        rerender();
        swapInDom();
        syncSwitch();
    }

    function toast(msg, kind) {
        try {
            if (typeof window.showNotification === 'function') {
                window.showNotification('图标', msg, kind || 'success');
                return;
            }
        } catch (e) { }
        try { console.log('[N26 icons] ' + msg); } catch (e) { }
    }

    window.n26ForceIconPack = function (p) {
        p = (p === 'n26') ? 'n26' : 'flat';
        writeKey(p);
        syncSettings(p);
        repaint();
        /* 两帧后再数：一帧给刚重建的 DOM，一帧给懒加载图标落地 */
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var c = countDrawn();
                if (p === 'n26') {
                    if (c.imgs > 0) toast('已切到自绘图标：' + c.imgs + ' 个真图' + (c.flats ? '，' + c.flats + ' 个走字形回退' : ''));
                    else toast('已切到自绘，但一个真图也没画出来 —— 说明这台机器上没有自绘图（仍是字形）', 'warning');
                } else {
                    toast('已切到扁平图标：' + c.flats + ' 个字形块' + (c.imgs ? '，' + c.imgs + ' 个仍用真图' : ''));
                }
            });
        });
        return p;
    };
    /* 只读状态：方便用户在控制台自检 `n26IconPackNow()` */
    window.n26IconPackNow = currentPack;
    window.n26IconSwapNow = function () { repaint(); return countDrawn(); };

    /* 劫持设置里那个开关：捕获阶段先下手，避免旧 onclick 写同一个值 */
    document.addEventListener('click', function (e) {
        var t = e.target;
        var el = (t && t.closest) ? t.closest('.fu-switch, .toggle-switch') : null;
        if (!el) return;
        var oc = el.getAttribute('onclick') || '';
        if (oc.indexOf('setIconPack') < 0) return;
        e.preventDefault();
        /* 必须 stopImmediatePropagation：不然后面那个 onclick 还会写回旧值 */
        e.stopImmediatePropagation();
        window.n26ForceIconPack(currentPack() === 'n26' ? 'flat' : 'n26');
    }, true);

    /* 启动迁移：老用户设置里已是自绘、但独立键还没写过 */
    try {
        if (!readKey()) {
            var s0 = (typeof window.getUserLS === 'function') ? (window.getUserLS('settings') || {}) : {};
            if (s0.iconPack === 'n26') writeKey('n26');
        }
    } catch (e) { }
    /* 首屏按真实值同步一次开关，避免「开关灰着、图标却是自绘」 */
    setTimeout(syncSwitch, 900);
})();
