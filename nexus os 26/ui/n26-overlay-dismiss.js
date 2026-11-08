/* ============================================================
   N26 Overlay Dismiss · 点空白就回到桌面（v2.9.97）
   ------------------------------------------------------------
   用户硬要求：启动台、AI 小方输入框、长按空格唤起的输入框、
   小组件页面等等一系列桌面浮层，都应该「点空白位置就能回到桌面」。

   现状是 4 种手写模式散落在主壳十几个独立监听里，且：
     · 小组件面板只在 e.target === panel（遮罩本身）时关，点面板内部空白无效；
     · 启动台只认 #launchpad / .launchpad-grid，点 padding、pager 无效；
     · 控制中心、Spotlight 完全没有外部点击关闭；
     · covi HUD 的舞台是 pointer-events:none，压根没有可点遮罩。

   本模块用「捕获阶段 + 空白判据」统一分发：捕获阶段先于 onclick 目标处理器，
   所以「点按钮打开浮层」不会被同一帧的关闭逻辑立刻吃掉。
   ============================================================ */
(function () {
    'use strict';

    /* 落在这些容器/控件上的点击不算空白；其余一律视为「点到了空白」 */
    var INTERACTIVE = [
        'button', 'a', 'input', 'textarea', 'select', 'option', 'label',
        '[contenteditable]', '[onclick]', '[data-act]',
        '[role="button"]', '[role="menuitem"]', '[role="switch"]', '[tabindex]',
        '.window', '.app-iframe', '.dock-item', '#dock', '#finder-bar', '#topBar',
        '.launchpad-item', '.launchpad-search', '.launchpad-pager', '.launchpad-brand-slot',
        '.widget-panel-card', '.widget-panel-sidebar', '.widget-panel-header',
        '.widget-panel-sizerail', '.n26-wheel', '.n26-w-item',
        '#n26AiChat', '#covi-hud', '#covi-reply',
        '#control-center', '#spotlight', '#notification-sidebar',
        '#startMenu', '#smTileMenu', '#appleMenu'
    ].join(',');

    /* 按优先级排列，一次点击只关最上面那一层 */
    var LAYERS = [
        { sel: '#widgetPanel', close: 'closeWidgetPanel' },
        { sel: '#n26AiChatOverlay', close: 'closeN26AiChat', shown: shownByDisplay },
        { sel: '#covi-hud', close: 'coviHudClose' },
        { sel: '#spotlight', close: 'closeSpotlight' },
        { sel: '#control-center', close: 'closeControlCenter' },
        { sel: '#launchpad', close: 'closeLaunchpad' },
        { sel: '#notification-sidebar', close: 'toggleNotificationSidebar' }
    ];

    function hasShow(el) { return el.classList.contains('show'); }
    function shownByDisplay(el) { return el.style.display !== 'none' && el.style.display !== ''; }
    function isBlank(t) {
        if (!t || t.nodeType !== 1 || typeof t.closest !== 'function') return true;
        return !t.closest(INTERACTIVE);
    }
    function isOpen(layer, el) {
        if (layer.shown) return layer.shown(el);
        return hasShow(el);
    }

    document.addEventListener('click', function (e) {
        if (e.button !== undefined && e.button !== 0) return;   // 右键 / 中键不关
        if (!isBlank(e.target)) return;
        for (var i = 0; i < LAYERS.length; i++) {
            var L = LAYERS[i];
            var el = document.querySelector(L.sel);
            if (!el || !isOpen(L, el)) continue;
            var fn = window[L.close];
            if (typeof fn === 'function') {
                try { fn(); } catch (err) { }
            }
            return;                                              // 只关最上层
        }
    }, true);

    /* Esc 兜底：covi HUD / 控制中心 / Spotlight 原先只有部分有 Esc */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        for (var i = 0; i < LAYERS.length; i++) {
            var L = LAYERS[i];
            if (L.sel === '#widgetPanel' || L.sel === '#n26AiChatOverlay') continue; // 主壳已处理
            var el = document.querySelector(L.sel);
            if (!el || !isOpen(L, el)) continue;
            var fn = window[L.close];
            if (typeof fn === 'function') { try { fn(); } catch (err) { } }
            return;
        }
    }, true);

    window.N26OverlayDismiss = { version: '2.9.97', layers: LAYERS.map(function (x) { return x.sel; }) };
})();
