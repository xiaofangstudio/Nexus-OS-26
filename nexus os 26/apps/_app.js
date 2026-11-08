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
      // ★ v2.9.54：共享细节层改用「独立版本戳」，不再跟应用自身的 ?v= 走。
      //   注册表里只有 music/video 带 ?v=，其余 20 个应用都会请求 ?v=1 ——
      //   若沿用应用版本号，改了 _polish.css 后这 20 个应用永远吃缓存旧样式。
      //   ★ 每次修改 _polish.css 必须同步 bump 这个值，否则改动不生效。
      var _v = '2.9.61';
      // ★ v2.9.54：基于「本脚本自身 URL」解析，而不是基于文档 URL。
      //   子目录应用（apps/necta/、apps/floatapp/ 引 ../_app.js）若用相对路径，
      //   会错找成 apps/<子目录>/_polish.css → 404 → 共享层静默失效。
      var _s = document.currentScript || document.querySelector('script[src*="_app.js"]');
      var _base = (_s && _s.src) ? _s.src : location.href;
      l.href = new URL('_polish.css?v=' + encodeURIComponent(_v), _base).href;
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
      l.href = '../vendor/fontawesome/all.min.css';
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

  // ===== v2.9.57：语言 / 玻璃材质 个性化分发 =====
  var _currentLang = (document.documentElement.lang
    || (window.Nexus && Nexus.context && Nexus.context() && Nexus.context().language)
    || 'zh-CN');
  var _langKeyMap = { 'zh-CN': 'zh', 'en-US': 'en', 'ru-RU': 'ru', 'ja-JP': 'ja', 'ko-KR': 'ko', 'zh': 'zh', 'en': 'en', 'ru': 'ru', 'ja': 'ja', 'ko': 'ko' };
  function _langKey(l) { return _langKeyMap[l] || 'zh'; }

  // 翻译：应用自行定义 window.APP_I18N = { zh:{...}, en:{...}, ... }
  // 回退链：当前语言 → 英文（通用语） → 中文（源） → 原 key
  function appT(key) {
    try {
      var d = window.APP_I18N;
      if (d) {
        var lk = _langKey(_currentLang);
        if (d[lk] && d[lk][key] != null) return d[lk][key];
        if (lk !== 'en' && d.en && d.en[key] != null) return d.en[key];
        if (d.zh && d.zh[key] != null) return d.zh[key];
      }
    } catch (e) {}
    return key;
  }

  // 把当前语言套到本 iframe 的 [data-i18n*] 元素（声明式双语）
  function applyAppLanguage() {
    try {
      document.documentElement.setAttribute('data-lang', _currentLang);
      if (!window.APP_I18N) return;
      Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
        var key = el.getAttribute('data-i18n');
        var text = appT(key);
        if (text == null || text === key) return;
        var els = Array.prototype.slice.call(el.childNodes).filter(function (n) { return n.nodeType === 1; });
        if (els.length) {
          Array.prototype.slice.call(el.childNodes).filter(function (n) { return n.nodeType === 3; }).forEach(function (n) { el.removeChild(n); });
          els[0].after(document.createTextNode(' ' + text + ' '));
        } else { el.textContent = text; }
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-placeholder]'), function (el) {
        var key = el.getAttribute('data-i18n-placeholder'); var text = appT(key);
        if (text && text !== key) el.placeholder = text;
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-title]'), function (el) {
        var key = el.getAttribute('data-i18n-title'); var text = appT(key);
        if (text && text !== key) el.title = text;
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-aria]'), function (el) {
        var key = el.getAttribute('data-i18n-aria'); var text = appT(key);
        if (text && text !== key) el.setAttribute('aria-label', text);
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-html]'), function (el) {
        var key = el.getAttribute('data-i18n-html'); var text = appT(key);
        if (text && text !== key) el.innerHTML = text;
      });
    } catch (e) {}
  }

  var _currentGlass = null;

  function _clamp(v, lo, hi, d) {
    v = (typeof v === 'number' && isFinite(v)) ? v : d;
    return Math.max(lo, Math.min(hi, v));
  }
  // 材质系数：与宿主 ui/n26-polish.css 的 body.mat-* 完全一致
  var _MAT_K = {
    liquid: [1, 1, 1],
    mica:   [0.5, 0.86, 1.35],
    frost:  [0.6, 0.78, 1.05],
    solid:  [0, 1, 1.7]
  };

  /* 把玻璃材质真值落到本 iframe（液态/云母/磨砂/固态 + 全部六个参数）。
     来源有二：① nexus:ready 的 settings.glass（完整）；
              ② nexus:glass 广播（宿主只带 material + blur）——
                 缺参时由 hydrateGlass() 走同源桥接回读 settings.glass。
     参数写进 :root，由 _polish.css 的侧栏白名单统一消费。 */
  function applyGlass(g) {
    if (!g || !g.material) return;
    var root = document.documentElement;
    var b = document.body;
    var mat = (g.material === 'frost' || g.material === 'mica' || g.material === 'solid')
      ? g.material : 'liquid';
    var liquid = mat === 'liquid';
    var k = _MAT_K[mat] || _MAT_K.liquid;
    var px = (mat === 'solid') ? 0 : _clamp(g.blur, 0, 40, 26);
    var alpha = _clamp(g.opacity, 20, 90, 55) / 100;
    var sat = _clamp(g.saturation, 100, 200, 148);
    var hi = _clamp(g.highlight, 0, 100, 35) / 100;
    var refr = liquid ? _clamp(g.refraction, 0, 100, 0) : 0;
    var noise = liquid ? _clamp(g.noise, 0, 100, 0) : 0;

    root.setAttribute('data-glass', mat);
    b.classList.remove('mat-liquid', 'mat-frost', 'mat-mica', 'mat-solid');
    b.classList.add('mat-' + mat);

    root.style.setProperty('--glass-blur', px + 'px');
    root.style.setProperty('--n26-blur', px + 'px');
    root.style.setProperty('--n26-glass-alpha', alpha.toFixed(3));
    root.style.setProperty('--n26-glass-sat', sat + '%');
    root.style.setProperty('--n26-glass-hi', hi.toFixed(3));
    // 液态专属：非液态一律撤成 0（用户存值在宿主里保留，切回液态再恢复）
    root.style.setProperty('--n26-refr', String(refr));
    root.style.setProperty('--n26-noise', String(noise));
    root.style.setProperty('--n26-k', String(k[0]));
    root.style.setProperty('--n26-sat-k', String(k[1]));
    root.style.setProperty('--n26-alpha-k', String(k[2]));
    // 非液态不能留空值：Chrome 会把空 var() 当成未定义，整条 backdrop-filter 变 none
    root.style.setProperty('--n26-grain-fn', 'opacity(1)');

    _currentGlass = {
      material: mat, blur: px,
      opacity: Math.round(alpha * 100), saturation: sat, highlight: Math.round(hi * 100),
      refraction: refr, noise: noise
    };
  }

  /* 方案 B 的取值通道：宿主广播只带 material + blur。
     与其回读（settings 落盘值在拖动期间还是旧的），不如直接读
     同源父窗口 :root 上的 CSS 变量——宿主每帧先写变量再广播，
     所以这里拿到的就是「当前生效值」，不用等落盘、也没有一帧延迟。
     跨源 / 独立打开时读不到，返回 null，由 hydrateGlass() 兜底。 */
  function readHostGlass() {
    try {
      var p = window.parent;
      if (!p || p === window || !p.document || !p.document.documentElement) return null;
      var mat = (p.document.body.getAttribute('data-n26-glass') || '').trim();
      if (!mat) return null;
      var cs = p.getComputedStyle(p.document.documentElement);
      var num = function (name, dft) {
        var v = parseFloat(cs.getPropertyValue(name));
        return isFinite(v) ? v : dft;
      };
      return {
        material: mat,
        blur: num('--n26-blur', 18),
        opacity: Math.round(num('--n26-glass-alpha', 0.55) * 100),
        saturation: num('--n26-glass-sat', 148),
        highlight: Math.round(num('--n26-glass-hi', 0.35) * 100),
        refraction: num('--n26-refr', 0),
        noise: num('--n26-noise', 0)
      };
    } catch (e) { return null; }
  }

  /* 读不到父窗口变量时（跨源/独立打开）才走的兜底：同源桥接回读落盘值。
     用 rAF 合并，拖动滑杆时每帧最多一次。 */
  var _glassRAF = 0;
  function hydrateGlass() {
    if (_glassRAF) return;
    var run = function () {
      _glassRAF = 0;
      if (!window.Nexus || !Nexus.getSettings) return;
      Promise.resolve(Nexus.getSettings()).then(function (s) {
        if (s && s.glass) { applyGlass(s.glass); _fire(_glassCbs, _currentGlass); }
      }).catch(function () { /* 桥不可用时保持广播值 */ });
    };
    _glassRAF = (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame(run) : setTimeout(run, 16);
  }

  var _langCbs = [], _glassCbs = [];
  function _fire(arr, v) { Array.prototype.forEach.call(arr, function (cb) { try { cb(v); } catch (e) {} }); }

  // 监听宿主语言切换广播
  window.addEventListener('nexus:language', function (e) {
    var lang = (e.detail && e.detail.lang) || document.documentElement.lang || 'zh-CN';
    _currentLang = lang;
    applyAppLanguage();
    _fire(_langCbs, lang);
  });
  // 监听宿主玻璃材质切换广播
  window.addEventListener('nexus:glass', function (e) {
    var g = (e.detail) || {};
    var live = readHostGlass();
    applyGlass(live || g);
    _fire(_glassCbs, _currentGlass);
    // 广播只有 material + blur；读不到父窗口变量时再回读一次落盘值
    if (!live && typeof g.opacity !== 'number') hydrateGlass();
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
    // v2.9.57：init 上下文里的语言 / 玻璃材质，开场即应用
    if (ctx) {
      if (ctx.language) { _currentLang = ctx.language; applyAppLanguage(); }
      if (ctx.settings && ctx.settings.glass) applyGlass(ctx.settings.glass);
      else if (ctx.glass) applyGlass(ctx.glass);
      else hydrateGlass();
      // 首屏若宿主变量已就绪，用「当前生效值」再覆盖一次（避免先闪落盘旧值）
      var bootLive = readHostGlass();
      if (bootLive) applyGlass(bootLive);
    }
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
    var run = function (ctx) {
      // v2.9.57：应用自身 UI 就绪后再套一次语言（确保 window.APP_I18N 已定义）
      try { if (window.APP_I18N) applyAppLanguage(); } catch (e) {}
      try { fn(ctx); } catch (err) { console.error('[Nexus app] ready cb error', err); }
    };
    if (_readyFired) { run(window.Nexus ? Nexus.context() : null); return; }
    _readyCbs.push(run);
  }
  window.Nexus = window.Nexus || {};
  window.Nexus.ready = ready;
  window.Nexus.whenReady = ready;
  // v2.9.57：暴露语言 / 玻璃材质 API 给应用
  window.Nexus.getLanguage = function () { return _currentLang; };
  window.Nexus.onLanguageChange = function (cb) { if (typeof cb === 'function') _langCbs.push(cb); };
  window.Nexus.applyLanguage = applyAppLanguage;
  window.Nexus.t = appT;
  window.Nexus.getGlass = function () { return _currentGlass; };
  window.Nexus.onGlassChange = function (cb) { if (typeof cb === 'function') _glassCbs.push(cb); };
})();
