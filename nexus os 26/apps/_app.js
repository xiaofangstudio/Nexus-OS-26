/* ============================================================
   Nexus OS 26 · iframe 应用共享运行时（apps/_app.js）v2 —— FangUI 底座
   每个拆分应用 <script src="_bridge.js"></script> 之后接
   <script src="_app.js"></script>。职责：
     1) 自动注入 FangUI 令牌与三风格 CSS（tokens/flat/neu/liquid）到本 iframe，
        应用直接可用 fu-* 组件类名与 --fu-* 变量（换风格零改 HTML）；
     2) 把宿主 dark/perf 模式落到本 iframe <body>，并映射为 FangUI 的
        <html data-mode="light|dark"> 与 <html data-ui="liquid|neu|flat">；
     3) 监听宿主主题广播（nexus:theme），实时跟随深浅色与性能模式；
     4) 提供 Nexus.ready(fn)：上下文就绪后启动应用（幂等）。
   注：不自动注入 fangui.js（其 boot 会用自身 localStorage 覆盖 data-mode，
   与宿主驱动冲突）。需要主题色 API / 折射 / 动效时按模板手动引入：
   ../fangui/fangui.js · ../fangui/motion/fangui-motion.js · ../fangui/liquid/refract.js
   ============================================================ */
(function () {
  'use strict';

  var FANGUI_BASE = '../fangui/';
  var FANGUI_CSS = ['core/tokens.css', 'core/flat.css', 'core/neu.css', 'core/liquid.css'];
  var _fanguiInjected = false;
  var _lastUi = 'liquid';

  /* 通用细节层（_polish.css）：滚动条 / 选区 / 焦点 / 按压回弹 / 光标。
     放在最前面同步注入，和样式表解析几乎同时，不会闪一下再变。 */
  (function ensurePolish() {
    try {
      if (document.querySelector('link[href*="_polish.css"]')) return;
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      // ★ 带版本戳：否则浏览器会一直用缓存里的旧 _polish.css（本轮加全局连续圆角时踩到）
      var _v = '1';
      try { _v = new URLSearchParams(location.search).get('v') || '1'; } catch (e) { }
      l.href = '_polish.css?v=' + encodeURIComponent(_v);
      (document.head || document.documentElement).appendChild(l);
    } catch (e) { /* 静默：样式缺失不该挡住应用启动 */ }
  })();

  /* 图标字体补全：
     iframe 是独立文档，宿主 <head> 里那份 Font Awesome 传不进来。
     之前只靠各应用自己 <link>，结果 16 个应用写了 <i class="fas ...">
     却从没引过图标库 —— 界面上那些「按钮里空空一块」就是这个原因。
     这里统一补一次；已经自己引过的应用会自动跳过，不重复加载。 */
  (function ensureIconFont() {
    try {
      if (document.querySelector('link[href*="font-awesome"]')) return;
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
      l.crossOrigin = 'anonymous';
      (document.head || document.documentElement).appendChild(l);
    } catch (e) { /* 离线就退回无图标，不影响功能 */ }
  })();

  function ensureFangUI() {
    if (_fanguiInjected) return;
    _fanguiInjected = true;
    try {
      FANGUI_CSS.forEach(function (href) {
        if (document.querySelector('link[href*="' + href + '"]')) return;
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = FANGUI_BASE + href;
        document.head.appendChild(l);
      });
    } catch (e) { /* 静默 */ }
  }

  // FangUI 风格值（flat / neu-solid / neu-glass / liquid）→ <html data-ui data-neu>
  function applyUi(root, style) {
    var ui = style, neu = null;
    if (style === 'neu-solid') { ui = 'neu'; neu = 'solid'; }
    else if (style === 'neu-glass') { ui = 'neu'; neu = 'glass'; }
    else if (style !== 'flat' && style !== 'liquid') { ui = 'liquid'; }
    root.setAttribute('data-ui', ui);
    if (neu) root.setAttribute('data-neu', neu);
    else root.removeAttribute('data-neu');
  }

  function applyTheme(data) {
    if (!data) return;
    if (data.dark) document.body.classList.add('dark-mode');
    else document.body.classList.remove('dark-mode');
    if (data.perf) document.body.classList.add('perf-mode');
    else document.body.classList.remove('perf-mode');
    // FangUI：模式与风格落到 <html>
    var root = document.documentElement;
    root.setAttribute('data-mode', data.dark ? 'dark' : 'light');
    if (data.settings && data.settings.fanguiStyle) _lastUi = data.settings.fanguiStyle;
    applyUi(root, _lastUi);
    ensureFangUI();
  }

  // 监听宿主主题广播
  window.addEventListener('nexus:theme', function (e) { applyTheme(e.detail); });

  // 监听宿主 FangUI 风格切换广播（setFanguiStyle 实时推送）
  window.addEventListener('nexus:fuistyle', function (e) {
    var st = (e.detail && e.detail.style) || 'liquid';
    _lastUi = st;
    applyUi(document.documentElement, st);
  });

  // 若脚本加载晚于 nexus:ready（context 已就绪），直接应用一次
  if (window.Nexus && Nexus.context()) applyTheme(Nexus.context());

  var _readyFired = false;
  var _readyCbs = [];
  // 应用体统一进场动效：上下文就绪后柔和渐显上移（贝塞尔），perf 模式自动禁用
  function injectEnterAnim() {
    try {
      var css = document.createElement('style');
      css.textContent =
        'body.n26-app-in{animation:n26AppIn .4s cubic-bezier(.16,1,.3,1) both}' +
        '@keyframes n26AppIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}' +
        'body.perf-mode.n26-app-in,body.perf-mode.n26-app-in *{animation:none!important}';
      document.head.appendChild(css);
      document.body.classList.add('n26-app-in');
    } catch (e) { /* 静默 */ }
  }
  function fireReady(ctx) {
    if (_readyFired) { return; }
    _readyFired = true;
    applyTheme(ctx);
    injectEnterAnim();
    _readyCbs.forEach(function (cb) { try { cb(ctx); } catch (err) { console.error('[Nexus app] ready cb error', err); } });
    _readyCbs = [];
  }

  if (window.Nexus && Nexus.context()) {
    fireReady(Nexus.context());
  } else {
    window.addEventListener('nexus:ready', function (e) { fireReady(e.detail); });
    /* 兜底：宿主没在 2.5 秒内下发上下文（单独打开本页 / 桥接被拦 / 宿主崩了），
       也不能留一片白。用一份默认上下文把自己渲染出来，主题随后到达再覆盖。
       fireReady 是幂等的，真上下文晚到不会被渲染第二次。 */
    setTimeout(function () {
      if (_readyFired) return;
      try {
        console.warn('[Nexus app] 未收到宿主上下文，使用默认上下文离线渲染');
        fireReady({
          windowId: null,
          user: { name: '本地用户', role: 'guest' },
          settings: {},
          dark: false,
          offline: true
        });
      } catch (e) { /* 静默 */ }
    }, 2500);
  }

  function ready(fn) {
    if (_readyFired) { fn(window.Nexus ? Nexus.context() : null); return; }
    _readyCbs.push(fn);
  }
  window.Nexus = window.Nexus || {};
  window.Nexus.ready = ready;
  window.Nexus.whenReady = ready;
})();
