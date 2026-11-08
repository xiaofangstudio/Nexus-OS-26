/* ============================================================
   verify-n26-297.js · v2.9.97 纯 Node 验收（零浏览器 / 零 Edge）
   ------------------------------------------------------------
   本轮用户指认：
     ① 小组件面板有外层底板 / 左右缝 / Dock 盖在上面 / 相册卡紫 /
        尺寸选择难受 / 滚动时卡片突然隐藏
     ② 启动台、AI 小方输入框、长按空格输入框、小组件页等要点空白回桌面；
        关窗动画像飞到屏幕外围
     ③ 方聊 Worker 未连发不出消息 / 缺头像与添加好友 / 最侧栏不统一
     ④ 方哩方哩控制条不隐藏 / 全屏盖桌面 / 弹幕不显示 / 没字幕
     ⑤ 地图降级提示 / 用网页定位统一驱动地图天气
     ⑥ Float IDE 打不开 / Strata 打开文件不是网页选取文件
   动态部分用 vm 假 DOM，不启动任何浏览器。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = __dirname;

let PASS = 0, FAIL = 0;
function ok(name, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function has(p) { return fs.existsSync(path.join(ROOT, p)); }
function section(t) { console.log('\n-- ' + t + ' ------------------------------'); }

const HTML = read('Nexus OS 26.html');
const WPF = read('ui/n26-widget-panel-fix.css');
const GAL = read('ui/n26-widget-gallery.js');
const OVD = read('ui/n26-overlay-dismiss.js');
const GEO = read('ui/n26-geolocation.js');
const GEC = read('ui/n26-geo-client.js');
const CAP = read('ui/n26-caption-bridge.js');
const APPJS = read('apps/_app.js');
const WCSS = read('ui/n26-widgets.css');
const SKY = read('ui/n26-widget-sky.js');
const FC = read('apps/fangchat.html');
const BILI = read('apps/bili/index.html');
const MAP = read('apps/map.html');
const WEATHER = read('apps/weather.html');
const FLOAT = read('apps/float/index.html');
const FLOATBUILD = read('apps/float/.build/inline.mjs');
const STRATA = read('apps/strata/index.html');
const VMHTML = read('apps/vm.html');

/* ============================================================ */
section('A · 版本 / 新模块 / 戳');

ok('版本号不低于 v2.9.97', /const NEXUS_OS_VERSION = 'v2\.(9\.9[0-9]|10\.\d+)';/.test(HTML));
ok('changelog 首条是 v2.9.97',
    HTML.indexOf('<div class="changelog-version">v2.9.97</div>') > 0 &&
    HTML.indexOf('<div class="changelog-version">v2.9.97</div>') <
    HTML.indexOf('<div class="changelog-version">v2.9.96</div>'));
ok('六个新模块全部落盘', [
    'ui/n26-widget-panel-fix.css', 'ui/n26-overlay-dismiss.js',
    'ui/n26-geolocation.js', 'ui/n26-geo-client.js',
    'ui/n26-caption-bridge.js', 'apps/float/.build/inline.mjs'
].every(has));
const stamps = [
    ['geolocation.js?v=geo2', /n26-geolocation\.js\?v=geo2/.test(HTML)],
    ['widget-panel-fix.css?v=wpf2', /n26-widget-panel-fix\.css\?v=wpf2/.test(HTML)],
    ['overlay-dismiss.js?v=od1', /n26-overlay-dismiss\.js\?v=od1/.test(HTML)],
    ['caption-bridge.js?v=cb1', /n26-caption-bridge\.js\?v=cb1/.test(HTML)],
    ['widget-gallery.js?v=gal7', /n26-widget-gallery\.js\?v=gal7/.test(HTML)],
    ['widgets.css?v=20261108mat4', /n26-widgets\.css\?v=20261108mat4/.test(HTML)]
];
stamps.forEach(([n, c]) => ok('戳同步 ' + n, c));
ok('天空层三行戳一致 sky3',
    (HTML.match(/n26-widget-sky[^\s"']*sky3/g) || []).length === 3);
ok('geolocation 在 head 早期（早于业务脚本）',
    HTML.indexOf('ui/n26-geolocation.js') < HTML.indexOf('<body'));
ok('widget-panel-fix.css 最后加载（压过 widgets.css 高特异性）',
    HTML.indexOf('ui/n26-widget-panel-fix.css') > HTML.indexOf('ui/n26-widgets.css'));
ok('_app.js 注入 geo-client 到每个 iframe',
    /n26-geo-client\.js\?v=geo1/.test(APPJS) && /ensureSharedShell/.test(APPJS));
ok('_app.js 引用戳全量 2.9.97',
    !/_app\.js\?v=2\.9\.96/.test(HTML + FC + BILI + MAP + WEATHER));
ok('旧戳无残留（gal6 / sky2 / mat2）',
    !/widget-gallery\.js\?v=gal6|widget-sky[^"']*sky2|widgets\.css\?v=20261108mat2/.test(HTML));

/* ============================================================ */
section('B · ① 小组件面板平铺 / 层级 / 禁紫 / 尺寸 / 滚动');

ok('★ 面板 z-index 抬到 10050', /#widgetPanel\.widget-panel-overlay \{ z-index: 10050 !important/.test(WPF));
ok('★ 面板打开时 Dock 与顶栏下沉', /widget-panel-open #dock/.test(WPF) && /widget-panel-open #finder-bar/.test(WPF));
ok('★ 预览卡外层底板全撤（transparent / 无边框 / 无阴影 / padding 0）',
    /background: transparent !important/.test(WPF) &&
    /border: 0 !important/.test(WPF) &&
    /box-shadow: none !important/.test(WPF) &&
    /padding: 0 !important/.test(WPF));
ok('★ 白色组件卡撑满预览区 = 平铺无缝',
    /\.widget-preview-card \{[\s\S]{0,400}width: 100% !important;[\s\S]{0,200}height: 100% !important/.test(WPF));
ok('★ hover 不再出现白底', /\.widget-panel-card:hover[\s\S]{0,300}background: transparent !important/.test(WPF));
ok('★ 相册卡 tint 按真值链改蓝',
    /\[data-wtype="photos"\] \{[\s\S]{0,300}--w-tint-a: #0ea5e9 !important/.test(WPF));
ok('★ 源规则也去紫（music / photos / countdown 全蓝）',
    !/#5856d6|#b06ee8|#6d6cf5|#4338ca|#6d3f96/.test(WCSS),
    'widgets.css 仍含紫 tint');
ok('vm.html 标签文字去紫', !/#4338ca/.test(VMHTML));
ok('★ 尺寸滚轮有左右圆形按钮 DOM',
    /n26-wheel-prev/.test(GAL) && /n26-wheel-next/.test(GAL) && /n26-wheel-navs/.test(GAL));
ok('圆形按钮样式（50% 圆角 + 34px）',
    /\.n26-wheel-nav \{[\s\S]{0,300}border-radius: 50%/.test(WPF) && /width: 34px/.test(WPF));
ok('★ 左右按钮绑定 step(-1) / step(1)',
    /step\(-1\)/.test(GAL) && /step\(1\)/.test(GAL));
ok('到头自动置灰', /pv\.disabled = activeIdx <= 0/.test(GAL) && /nx\.disabled/.test(GAL));
ok('★ 尺寸卡不再突然隐藏（旧 d>1 opacity:0 已删）',
    !/it\.style\.opacity = d > 1 \? '0' : '1'/.test(GAL) &&
    /it\.style\.opacity = ''/.test(GAL));
ok('★ 懒加载预取放大到 900px', /rootMargin: '900px 0px'/.test(HTML));
ok('全档常驻可见样式', /\.n26-w-item:not\(\.on\) \{ opacity: \.72/.test(WPF));

/* ============================================================ */
section('C · ② 点空白回桌面 / 关窗动画');

ok('★ overlay-dismiss 注册在捕获阶段', /\}, true\);/.test(OVD) && /capture|捕获阶段/.test(OVD));
['#widgetPanel', '#n26AiChatOverlay', '#covi-hud', '#spotlight',
    '#control-center', '#launchpad', '#notification-sidebar'].forEach(function (s) {
        ok('浮层已登记 ' + s, OVD.indexOf("sel: '" + s + "'") >= 0);
    });
ok('空白判据有交互白名单', /INTERACTIVE/.test(OVD) && /\.closest\(INTERACTIVE\)/.test(OVD));
ok('一次点击只关最上层', /只关最上层|return;\s*}/.test(OVD));
ok('★ closeWindow 改为原地缩小淡出',
    /scale\(0\.62\)/.test(HTML) && /transformOrigin = 'center center'/.test(HTML));
ok('★ closeWindow 不再飞向 Dock 图标',
    !/n26MorphOut\(el, toRect, \{ duration: 200 \}/.test(HTML));
ok('minimizeWindow 仍收进 Dock（语义未混）',
    /n26MorphOut\(el, toRect, \{ duration: 320 \}/.test(HTML));

/* ============================================================ */
section('D · ⑤ 统一位置服务 / 地图文案');

['get:', 'ensure:', 'refresh:', 'set:', 'broadcast:'].forEach(function (k) {
    ok('N26Geo 提供 ' + k, GEO.indexOf(k) >= 0);
});
ok('★ 顶层文档只定位一次并广播给 iframe',
    /navigator\.geolocation\.getCurrentPosition/.test(GEO) &&
    /postMessage\(\{ __n26Geo: g \}/.test(GEO));
ok('缓存有 TTL，不再「有缓存永不刷新」', /TTL = 6 \* 60 \* 60 \* 1000/.test(GEO));
ok('响应 iframe 的 __n26GeoReq', /__n26GeoReq/.test(GEO) && /__n26GeoReq/.test(GEC));
ok('geo-client 提供同步 get 与事件', /N26GeoClient/.test(GEC) && /CustomEvent\('n26:geo'/.test(GEC));
ok('★ 地图改读统一位置', /N26GeoClient/.test(MAP) && /n26:geo|__n26GeoReq/.test(MAP));
ok('★ 天气改读统一位置', /N26GeoClient/.test(WEATHER));
ok('天气不再「只问一次」自定位', !/GEO_ASKED_KEY/.test(WEATHER));
ok('★ 天空层不再硬编码深圳', !/22\.5431/.test(SKY) && /N26Geo/.test(SKY));
ok('★ 地图用户可见「降级」文案清零',
    !/已自动降级|已降级|正在降级|降级模式|高德底图不可达|高德检索不可用/.test(MAP));
ok('★ 地图「未配置 AMAP_KEY」提示清零', !/未配置 AMAP_KEY/.test(MAP));
ok('保留 OSM 版权署名（合规）', /© OpenStreetMap contributors/.test(MAP));

/* ============================================================ */
section('E · ③ 方聊');

ok('★ 头像接通主壳账号缓存', /nexus_profile_cache/.test(FC) && /function myAvatar/.test(FC));
ok('★ 离线发送硬拦截已删',
    !/if \(t\.delivery === 'cloud' && S\.cloud\.status !== 'ok'\) \{ toast\([^)]*\); return; \}/.test(FC));
ok('★ 本地待发队列 + 联网补发', /function flushQueue/.test(FC) && /flushQueue\(\)/.test(FC));
ok('消息离线时置 queued', /'queued'/.test(FC));
ok('banner 改成「连接后自动发送 / 本地模式」', /离线，消息将在连接后自动发送|本地模式 · 消息保存在本机/.test(FC));
ok('★ 添加好友入口', /data-act="add-friend"/.test(FC) && /case 'add-friend'/.test(FC));
ok('添加好友写入主壳 friends 表', /n26:friends/.test(FC));
ok('★ 最侧栏接入统一 Dock 玻璃',
    /n26-docknav\.css\?v=2979/.test(FC) && /n26-docknav\.js\?v=dn12/.test(FC) &&
    /fc-rail" data-n26dock="v"/.test(FC));
ok('显式 enhance（REGISTRY 不含 fc-rail）', /N26DockNav\.enhance/.test(FC) && /item: '\.fc-tab'/.test(FC));
ok('选中项底色让位给玻璃', /n26-dng-persistent \.fc-tab\.active/.test(FC));

/* ============================================================ */
section('F · ④ 方哩方哩');

ok('★ 控制条鼠标离开自动隐藏', /\.player\.ui-hidden \.pcontrols/.test(BILI) && /function showUI/.test(BILI));
ok('绑定 pointermove / enter / leave',
    /pointermove/.test(BILI) && /pointerenter/.test(BILI) && /pointerleave/.test(BILI));
ok('★ 全屏改应用内嵌入（position:fixed）', /\.player\.in-window-full/.test(BILI) && /inset: 0/.test(BILI));
ok('★ 不再调用浏览器全屏 API', !/stage\.requestFullscreen\(\)/.test(BILI) && !/document\.exitFullscreen\(\)/.test(BILI));
ok('Esc 退出内嵌全屏', /in-window-full/.test(BILI) && /Escape|Esc/.test(BILI));
ok('★ 弹幕开关布尔判定修正', /!== 'false'/.test(BILI) && /dmOn/.test(BILI));
ok('★ 弹幕有本地兜底（上游不可达也能滚）', /localDm|useLocalDm/.test(BILI) && /本地兜底/.test(BILI));
ok('play / seeked 补一次 dmTick', (BILI.match(/dmTick\(\)/g) || []).length >= 3);
ok('★ 字幕接后端 /api/bili/subtitle', /\/api\/bili\/subtitle/.test(BILI) && /function loadSubtitle/.test(BILI));
ok('★ 字幕复用系统旁白（postMessage）', /__n26Caption/.test(BILI) && /parent\.postMessage/.test(BILI));
ok('主壳字幕桥转发到 N26A11Y', /N26A11Y/.test(CAP) && /showCaption/.test(CAP) && /__n26Caption/.test(CAP));

/* ============================================================ */
section('G · ⑥ Float IDE / Strata');

ok('★ Float 单文件：无 type=module', !/type="module"/.test(FLOAT));
ok('★ Float 单文件：无外部 app.js / crossorigin 资源引用',
    !/src="\.\/assets\/app\.js"/.test(FLOAT) && !/<link[^>]*crossorigin/.test(FLOAT));
ok('★ Float 内联 5 个 worker 为 Blob URL',
    /window\.__N26_FLOAT_WORKERS/.test(FLOAT) &&
    /URL\.createObjectURL\([\s\S]{0,120}new Blob/.test(FLOAT) &&
    (FLOAT.match(/\.worker-[A-Za-z0-9_-]+\.js"/g) || []).length >= 5);
ok('Float Worker 失败有哑 worker 兜底', /__N26_NATIVE_WORKER/.test(FLOAT) && /postMessage: function/.test(FLOAT));
ok('Float 内联 CSS 的 codicon 路径已修正', /url\(\.\/assets\/codicon\.ttf\)/.test(FLOAT));
ok('★ 构建脚本可重现（esbuild → IIFE）',
    /format: 'iife'/.test(FLOATBUILD) && /splitting: false/.test(FLOATBUILD) && /inline\.mjs/.test(FLOATBUILD));
ok('★ Strata 打开文件走浏览器原生 input',
    /N26StrataIO\.pick/.test(STRATA) && /createElement\("input"\)/.test(STRATA) &&
    /\.type="file"/.test(STRATA) && /URL\.createObjectURL/.test(STRATA));
ok('★ Strata 路径透传（不再走 Tauri convertFileSrc）',
    /function HE\(e\)\{return e\}/.test(STRATA));
ok('★ Strata dialog|open / save 已改接原生',
    /async function ea\(e=\{\}\)\{return await window\.N26StrataIO\.pick\(e\)\}/.test(STRATA) &&
    /async function Ks\(e=\{\}\)\{return await window\.N26StrataIO\.save\(e\)\}/.test(STRATA));
ok('Strata 支持目录 / 多选 / accept 过滤',
    /webkitdirectory/.test(STRATA) && /\.multiple/.test(STRATA) && /\.accept/.test(STRATA));

/* ============================================================ */
section('H · 全量卫生（语法 / 禁紫）');

const targets = ['Nexus OS 26.html'];
for (const n of fs.readdirSync(path.join(ROOT, 'ui'))) if (/\.(js|css)$/.test(n)) targets.push('ui/' + n);
for (const n of fs.readdirSync(path.join(ROOT, 'apps'))) if (/\.html$/.test(n)) targets.push('apps/' + n);
for (const n of fs.readdirSync(ROOT)) if (/\.js$/.test(n) && !/^verify-/.test(n)) targets.push(n);
let bad = 0, inline = 0, jsFiles = 0;
const PURPLE = /(#8b5cf6|#a855f7|#7c3aed|#6d28d9|#9333ea|#c084fc|#a78bfa|#7e22ce|#6f6cf0|#5b3ec9|#5856d6|#b06ee8|#6d6cf5|#4338ca|rebeccapurple)/i;
let purpleHits = [];
for (const f of targets) {
    const s = read(f);
    /* 禁紫扫描要看「去掉注释后的源码」—— 禁用色清单本身就写在注释里，
       直接扫会自己命中自己。编译仍然用原始源码。 */
    s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').forEach(function (L, i) { if (PURPLE.test(L)) purpleHits.push(f + ':' + (i + 1)); });
    if (/\.js$/.test(f)) { jsFiles++; try { new vm.Script(s, { filename: f }); } catch (e) { bad++; } continue; }
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m, k = 0;
    while ((m = re.exec(s))) { k++; inline++; try { new vm.Script(m[1], { filename: f + '#' + k }); } catch (e) { bad++; } }
}
ok('全量语法 0 失败（' + targets.length + ' 文件 / ' + jsFiles + ' JS / ' + inline + ' 内联）', bad === 0, 'bad=' + bad);
ok('★ UI 主题真紫 0 命中', purpleHits.length === 0, purpleHits.join(','));
ok('Float 内联产物单独编译通过', (function () {
    try {
        const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
        let m, n = 0;
        while ((m = re.exec(FLOAT))) { n++; new vm.Script(m[1], { filename: 'float#' + n }); }
        return n >= 2;
    } catch (e) { return false; }
})());
ok('Strata 内联脚本语法通过', (function () {
    try {
        const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
        let m, n = 0;
        while ((m = re.exec(STRATA))) { n++; new vm.Script(m[1], { filename: 'strata#' + n }); }
        return n >= 2;
    } catch (e) { return false; }
})());

/* ============================================================ */
section('I · vm 假 DOM 动态断言');

(function () {
    const handlers = [];
    let called = 0;
    const fakeDoc = {
        addEventListener: function (t, fn, cap) { handlers.push({ t: t, fn: fn, cap: cap }); },
        querySelector: function (sel) {
            return sel === '#widgetPanel' ? { classList: { contains: function () { return true; } } } : null;
        }
    };
    const w = {
        closeWidgetPanel: function () { called++; },
        closeN26AiChat: function () { }, coviHudClose: function () { },
        closeSpotlight: function () { }, closeControlCenter: function () { },
        closeLaunchpad: function () { }, toggleNotificationSidebar: function () { },
        dispatchEvent: function () { }, addEventListener: function () { }
    };
    const box = { document: fakeDoc, window: w, console: console, CustomEvent: function () { } };
    vm.createContext(box);
    try { new vm.Script(OVD, { filename: 'ovd' }).runInContext(box); } catch (e) { }
    ok('vm: overlay-dismiss 注册在捕获阶段',
        handlers.some(function (h) { return h.t === 'click' && h.cap === true; }));
    handlers.filter(function (h) { return h.t === 'click'; }).forEach(function (h) {
        h.fn({ button: 0, target: { nodeType: 1, closest: function () { return null; } } });
    });
    ok('vm: 点空白关掉最上层浮层', called === 1, 'called=' + called);
    called = 0;
    handlers.filter(function (h) { return h.t === 'click'; }).forEach(function (h) {
        h.fn({ button: 0, target: { nodeType: 1, closest: function () { return {}; } } });
    });
    ok('vm: 点按钮不会误关浮层', called === 0, 'called=' + called);
})();

(function () {
    const store = {}, posted = [], listeners = {};
    const frames = [{ contentWindow: { postMessage: function (m) { posted.push(m); } } }];
    const w = {
        addEventListener: function (t, f) { (listeners[t] = listeners[t] || []).push(f); },
        dispatchEvent: function () { }
    };
    const box = {
        window: w, document: { readyState: 'complete', querySelectorAll: function () { return frames; }, addEventListener: function () { } },
        localStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; } },
        navigator: {}, CustomEvent: function (n, o) { this.detail = o && o.detail; },
        setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise,
        Date: Date, JSON: JSON, isFinite: isFinite, console: console,
        fetch: function () { return Promise.resolve({ json: function () { return Promise.resolve({ city: '上海' }); } }); }
    };
    vm.createContext(box);
    try { new vm.Script(GEO, { filename: 'geo' }).runInContext(box); } catch (e) { }
    const G = box.window.N26Geo;
    ok('vm: N26Geo 暴露 get/ensure/refresh/set/broadcast',
        !!G && ['get', 'ensure', 'refresh', 'set', 'broadcast'].every(function (k) { return typeof G[k] === 'function'; }));
    if (G) {
        const out = G.set({ lat: 31.23, lon: 121.47, name: '上海' });
        ok('vm: set 广播到所有 iframe', posted.length > 0 && posted[0].__n26Geo.lat === 31.23);
        ok('vm: get 同步返回新位置', G.get().name === '上海' && out.lon === 121.47);
        ok('vm: 写入共享 localStorage', !!store['n26:geo']);
    }
})();

(function () {
    const posted = [], listeners = {};
    const w = { addEventListener: function (t, f) { (listeners[t] = listeners[t] || []).push(f); }, dispatchEvent: function () { } };
    const box = {
        window: w, localStorage: { getItem: function () { return null; }, setItem: function () { } },
        parent: { postMessage: function (m) { posted.push(m); } },
        CustomEvent: function (n, o) { this.detail = o && o.detail; },
        JSON: JSON, isFinite: isFinite, console: console
    };
    vm.createContext(box);
    try { new vm.Script(GEC, { filename: 'gec' }).runInContext(box); } catch (e) { }
    ok('vm: geo-client 主动向宿主索取位置', posted.some(function (m) { return m.__n26GeoReq === 1; }));
    (listeners['message'] || []).forEach(function (f) { f({ data: { __n26Geo: { lat: 1, lon: 2, name: 'X' } } }); });
    ok('vm: 收到广播后 get 立即更新',
        !!box.window.N26GeoClient && box.window.N26GeoClient.get().name === 'X');
})();

console.log('\n============================================');
console.log('  PASS ' + PASS + '   FAIL ' + FAIL);
console.log('  纯 Node 静态 + vm 假 DOM · 未启动任何浏览器');
console.log('============================================');
if (FAIL > 0) process.exitCode = 1;
