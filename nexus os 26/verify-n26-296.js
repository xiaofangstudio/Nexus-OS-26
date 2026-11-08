/* ============================================================
   verify-n26-296.js · v2.9.96 纯 Node 验收（零浏览器 / 零 Edge）
   ------------------------------------------------------------
   用户四条硬指认：
     ① 点击任何东西都强制刷新页面（商店下载/进简介、音乐搜索）
     ② 所有图标统一超椭圆，无一例外
     ③ 应用商店可以左右滑 + 其他地方滚轮滑动极其困难
     ④ 系统小细节拉满，真他妈丝滑
   动态部分用 vm 假 DOM 驱动 innerHTML 包装 / reload 白名单 /
   detectKind 判定，不启动任何浏览器。
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
const DOMKEEP = read('ui/n26-dom-keep.js');
const NR = read('ui/n26-no-reload.js');
const GEST = read('ui/n26-gestures.js');
const SHELL = read('ui/n26-shell.css');
const SMOOTH = read('ui/n26-smooth.css');
const SQ = read('ui/n26-icon-squircle.css');
const STORE = read('ui/n26-store.js');
const APPJS = read('apps/_app.js');
const MUSIC = read('apps/music.html');
const WEATHER = read('apps/weather.html');

/* ============================================================ */
section('A1 · 版本 / 资源戳 / 文件落盘');

ok('两个 v2.9.96 新模块落盘',
    has('ui/n26-dom-keep.js') && has('ui/n26-icon-squircle.css'));
/* 版本继续前进，只锁不低于 v2.9.96 */
ok('版本号常量不低于 v2.9.96', /const NEXUS_OS_VERSION = 'v2\.(9\.9[0-9]|10\.\d+)';/.test(HTML));
ok('changelog 首条是 v2.9.96',
    HTML.indexOf('<div class="changelog-version">v2.9.96</div>') > 0 &&
    HTML.indexOf('<div class="changelog-version">v2.9.96</div>') <
    HTML.indexOf('<div class="changelog-version">v2.9.95</div>'));
ok('changelog 覆盖零刷新/滚轮/图标/商城横滑四项',
    /点击任何控件都不再/.test(HTML) && /滚轮滑动不再极其困难/.test(HTML) &&
    /所有图标统一超椭圆/.test(HTML) && /商城横滑与小细节/.test(HTML));
ok('主壳 head 早期挂 dom-keep（早于业务脚本）',
    /<script src="ui\/n26-dom-keep\.js\?v=dk1"><\/script>/.test(HTML) &&
    HTML.indexOf('ui/n26-dom-keep.js') < HTML.indexOf('<body'));
ok('主壳末尾最后加载 icon-squircle.css',
    /<link rel="stylesheet" href="ui\/n26-icon-squircle\.css\?v=sq1">/.test(HTML));
ok('音乐同步挂 dom-keep（不依赖异步注入时序）',
    /<script src="\.\.\/ui\/n26-dom-keep\.js\?v=dk1"><\/script>/.test(MUSIC));
const stamps = [
    ['ui/n26-shell.css?v=256', /ui\/n26-shell\.css\?v=256/.test(HTML)],
    ['ui/n26-store.js?v=2975', /ui\/n26-store\.js\?v=2975/.test(HTML)],
    ['ui/n26-no-reload.js?v=nr3', /ui\/n26-no-reload\.js\?v=nr3/.test(HTML)],
    ['ui/n26-gestures.js?v=20261108c', /ui\/n26-gestures\.js\?v=20261108c/.test(HTML)],
    ['ui/n26-smooth.css?v=sm7', /ui\/n26-smooth\.css\?v=sm7/.test(HTML)],
    ['weather gestures 戳同步', /n26-gestures\.js\?v=20261108c/.test(WEATHER)],
    ['weather _app 戳同步', /_app\.js\?v=2\.9\.9[6-9]/.test(WEATHER)]
];
stamps.forEach(function (x) { ok('戳同步 ' + x[0], x[1]); });
ok('旧戳全部清零（254/2974/nr2/20261108b/sm4/2.9.94）',
    !/n26-shell\.css\?v=254|n26-store\.js\?v=2974|no-reload\.js\?v=nr2|20261108b|smooth\.css\?v=sm4|_app\.js\?v=2\.9\.94/.test(HTML + WEATHER + MUSIC));

/* ============================================================ */
section('A2 · ① 点击任何东西都零刷新感');

ok('dom-keep 包装 Element.prototype.innerHTML setter',
    /Object\.getOwnPropertyDescriptor\(EP, 'innerHTML'\)/.test(DOMKEEP) &&
    /Object\.defineProperty\(EP, 'innerHTML'/.test(DOMKEEP));
ok('保持滚动位置 / 焦点 / 输入值 / 选区',
    /snapScroll/.test(DOMKEEP) && /restoreScroll/.test(DOMKEEP) &&
    /snapFocus/.test(DOMKEEP) && /restoreFocus/.test(DOMKEEP) &&
    /selectionStart/.test(DOMKEEP) && /preventScroll: true/.test(DOMKEEP));
ok('暴露 patch() 做子节点级 diff', /function patch\(box, html\)/.test(DOMKEEP) &&
    /replaceChild/.test(DOMKEEP) && /cloneNode\(true\)/.test(DOMKEEP));
ok('patch 内部绕开被包装的 setter（避免无意义快照）',
    /reentrantSafeSet/.test(DOMKEEP) && /origSet\.call\(el, html\)/.test(DOMKEEP));
ok('iframe 独立 realm 由 _app.js 自动注入 dom-keep',
    /n26-dom-keep\.js\?v=dk1/.test(APPJS) && /document\.currentScript/.test(APPJS) &&
    /new URL\('\.\.\/ui\/n26-dom-keep/.test(APPJS));
ok('注入路径从脚本自身 URL 推导（子目录应用不 404）',
    /var _base = \(_s && _s\.src\) \? _s\.src : location\.href/.test(APPJS));
ok('store.renderGrid 走 patch 而非整块 innerHTML',
    /N26DomKeep\.patch\(grid, apps\.map\(cardHTML\)\.join\(''\)\)/.test(STORE));
ok('音乐 8 处页面渲染全部走 patch',
    (MUSIC.match(/N26DomKeep\.patch\(el, h\)/g) || []).length === 8 &&
    !/^\s*el\.innerHTML = h;/m.test(MUSIC));
ok('音乐搜索框由 restoreFocus 继续兜底', /function restoreFocus\(\)/.test(MUSIC));

ok('NoReload 改为默认拦截未授权 reload',
    /rebootTokens/.test(NR) && /已拦截未授权的整窗刷新/.test(NR) &&
    !/if \(inClick && now >= allowUntil\)/.test(NR));
ok('一次性令牌不过期，覆盖 setTimeout 2~3s 后的 reload',
    /rebootTokens = Math\.max\(rebootTokens, 1\)/.test(NR) &&
    /rebootTokens--/.test(NR));
/* changelog 里会出现 <code>location.reload()</code> 这种说明文字，
   只统计真正的代码行，别把文档算成未授权调用。 */
const codeReloadLines = HTML.split('\n').filter(function (l) {
    return l.indexOf('location.reload()') >= 0 &&
        !/^\s*(\/\/|\*)/.test(l) && !/<code>|<li|changelog/.test(l);
});
ok('主壳 ' + codeReloadLines.length + ' 处代码 reload 全部有授权（逐行核前 5 行）',
    (function () {
        const L = HTML.split('\n');
        for (let i = 0; i < L.length; i++) {
            const line = L[i];
            if (line.indexOf('location.reload()') < 0) continue;
            if (/^\s*(\/\/|\*)/.test(line) || /<code>|<li|changelog/.test(line)) continue;
            if (!/n26AllowReboot/.test(L.slice(Math.max(0, i - 5), i).join('\n'))) return false;
        }
        return codeReloadLines.length >= 9;
    })());
ok('C.softReboot / exitPEMode / factoryReset 授权仍保留',
    (HTML.match(/window\.n26AllowReboot\(\)/g) || []).length >= 9);

/* ============================================================ */
section('A3 · ③ 滚轮跟手 / 商城横滑');

ok('★ 鼠标滚轮整数大格一律判 mouse（不再误判触控板）',
    /ay0 >= 40 && Math\.abs\(ay0 - Math\.round\(ay0\)\) < 1e-4/.test(GEST) &&
    /return 'mouse';/.test(GEST));
ok('★ 行/页 deltaMode 直接判 mouse', /e\.deltaMode && e\.deltaMode !== 0/.test(GEST));
ok('★ 触控板判定门槛 3→5 且限小位移',
    /wheelStreak >= 5 && ay0 < 48 && ax0 < 48/.test(GEST));
ok('★ 横向滚轮交回浏览器原生（商城精选卡/截图条）',
    /if \(horizontal\) \{[\s\S]{0,300}?passive: true[\s\S]{0,120}?return false;/s.test(GEST) &&
    /横向滚动区一律放行原生/.test(GEST));
ok('★ 纯垂直大格滚轮不参与边缘/三指手势',
    /Math\.abs\(dx\) < 0\.5 && Math\.abs\(dy\) >= 40\) return false/.test(GEST));
ok('★ 商城左栏撤掉 smooth 与 overscroll contain',
    /\.as-rail \{ scrollbar-width: thin; overscroll-behavior: auto; scroll-behavior: auto; \}/.test(SHELL));
ok('★ 小组件面板不再 contain 滚动链',
    /overscroll-behavior: auto;/.test(SMOOTH) &&
    !/\.widget-panel-grid,[\s\S]{0,160}?overscroll-behavior: contain/s.test(SMOOTH));
ok('商城精选卡 scroll-snap + 横向隔离',
    /\.appstore-featured-scroll\s*\{[^}]*scroll-snap-type: x proximity/s.test(SMOOTH) &&
    /overscroll-behavior-x: contain/.test(SMOOTH));
ok('详情页截图条同步横滑隔离', /\.appstore-detail-screenshots\s*\{[^}]*scroll-snap-type/s.test(SMOOTH));
ok('商城卡片 contain 隔离 + hover 微抬',
    /\.appstore-card\s*\{[^}]*contain: layout style/s.test(SMOOTH) &&
    /\.appstore-card:hover \{ transform: translateY\(-2px\)/.test(SMOOTH));
ok('reduced-motion 覆盖商城新规则',
    /html body \.appstore-card,[\s\S]{0,80}?html body \.appstore-featured-scroll \{/.test(SMOOTH));

/* ============================================================ */
section('A4 · ② 所有图标统一超椭圆（无一例外）');

ok('★ 用 polygon 而非 url(#n26Squircle)，零跨文档依赖',
    /--n26-squircle-clip: polygon\(/.test(SQ) && !/url\(#n26Squircle\)/.test(SQ));
const poly = /--n26-squircle-clip: polygon\(([\s\S]*?)\);/.exec(SQ);
ok('97 点超椭圆曲线（与 |x|^5+|y|^5=1 同源）',
    !!poly && (poly[1].match(/%/g) || []).length === 194,
    poly ? String((poly[1].match(/%/g) || []).length) : 'no polygon');
ok('外扩 1.024 落在坐标上（101.20% / -1.20%）',
    /101\.20% 50\.00%/.test(SQ) && /-1\.20% 50\.00%/.test(SQ));
ok('border-radius 归零，避免交集退化成普通圆角',
    /border-radius: 0 !important/.test(SQ) && /corner-shape: squircle/.test(SQ));
ok('★ 统一图标生成器四条分支全部打 data-n26-icon',
    (HTML.match(/data-n26-icon="1"/g) || []).length >= 4);
ok('★ 商城 ico() 两条分支全部打 data-n26-icon',
    (STORE.match(/data-n26-icon="1"/g) || []).length >= 3);
ok('选择器以 data-n26-icon 为主 + 历史类名兜底',
    /\[data-n26-icon\]/.test(SQ) && /n26-app-img/.test(SQ) &&
    /n26-store-real/.test(SQ) && /appstore-detail-icon/.test(SQ) &&
    /launchpad-icon/.test(SQ) && /ag-logo img/.test(SQ));
ok('★ 不误伤外层容器（Dock hover 放大不能被裁）',
    !/\.dock-icon-wrap,/.test(SQ) && !/\.win-taskbar-icon-wrap,/.test(SQ));
ok('_app.js 给所有 iframe 注入同一份超椭圆 CSS',
    /n26-icon-squircle\.css\?v=sq1/.test(APPJS) &&
    /new URL\('\.\.\/ui\/n26-icon-squircle/.test(APPJS));
const appRefs = (function () {
    let n = 0;
    function walk(d) {
        for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
            const rel = path.join(d, e.name);
            if (e.isDirectory()) { if (!/^\.|\.build|_shots|brand|weather-shots/.test(e.name)) walk(rel); }
            else if (e.name.endsWith('.html') && !/\.bak|backup/.test(e.name)) {
                if (/_app\.js/.test(read(rel))) n++;
            }
        }
    }
    walk('apps'); return n;
})();
ok('共享运行时覆盖 ' + appRefs + ' 个 iframe 应用文档（≥30）', appRefs >= 30);

/* ============================================================ */
section('A5 · 语法 / 禁紫 / 定时器回归');

['ui/n26-dom-keep.js', 'ui/n26-no-reload.js', 'ui/n26-gestures.js',
 'ui/n26-store.js', 'apps/_app.js'].forEach(function (f) {
    let good = true, err = '';
    try { new vm.Script(read(f), { filename: f }); } catch (e) { good = false; err = e.message; }
    ok(f + ' 语法可编译', good, err);
});
let inlineOK = true, inlineN = 0, inlineErr = '';
const reScript = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = reScript.exec(HTML))) {
    const body = m[1].trim();
    if (!body) continue;
    inlineN++;
    try { new vm.Script(body, { filename: 'inline#' + inlineN }); }
    catch (e) { inlineOK = false; inlineErr += '#' + inlineN + ':' + e.message + ' '; }
}
ok('主壳 ' + inlineN + ' 段内联脚本语法 0 失败', inlineOK, inlineErr);
const changed = [DOMKEEP, NR, GEST, SHELL, SMOOTH, SQ, STORE, APPJS];
ok('本轮改动源码零紫（键名除外）',
    changed.every(s => !/purple|#8b5cf6|#a855f7|#7c3aed|#6d28d9|#9d4edd|rgba\(\s*139\s*,\s*92\s*,\s*246|rgba\(\s*168\s*,\s*85\s*,\s*247/i.test(s)));
ok('v2.9.95 丝滑引擎仍挂载且时基合并未被破坏',
    /n26-smooth\.js\?v=sm2/.test(HTML) && /ms >= 900 && ms <= 1100/.test(read('ui/n26-smooth.js')));
ok('v2.9.94 参数守门 / 玻璃广播仍生效',
    /opts\.light === true/.test(NR) && /live: true/.test(HTML) &&
    !/sig === lastGlassSig/.test(NR));

/* ============================================================ */
section('B · vm 假 DOM 动态驱动');

/* ---------- B1 dom-keep：innerHTML 保持 + patch ---------- */
function makeEl(tag, outer) {
    return {
        nodeType: 1, tagName: (tag || 'DIV').toUpperCase(), _outer: outer || '',
        scrollTop: 0, scrollLeft: 0, scrollHeight: 900, clientHeight: 300,
        parentNode: null, parentElement: null, childNodes: [], children: [],
        style: {}, id: '', attrs: {},
        get isConnected() { return true; },
        get outerHTML() { return this._outer; },
        get firstChild() { return this.childNodes[0] || null; },
        contains: function (n) { return n === this || this.childNodes.indexOf(n) >= 0; },
        appendChild: function (n) { n.parentNode = this; n.parentElement = this; this.childNodes.push(n); this.children.push(n); return n; },
        removeChild: function (n) { const i = this.childNodes.indexOf(n); if (i >= 0) { this.childNodes.splice(i, 1); this.children.splice(i, 1); n.parentNode = null; } return n; },
        replaceChild: function (b, a) { const i = this.childNodes.indexOf(a); if (i >= 0) { this.childNodes[i] = b; this.children[i] = b; b.parentNode = this; b.parentElement = this; a.parentNode = null; } return a; },
        cloneNode: function () { const c = makeEl(this.tagName, this._outer); c.attrs = Object.assign({}, this.attrs); return c; },
        querySelector: function () { return null; },
        focus: function () { sandbox.document.activeElement = this; },
        setSelectionRange: function (s, e) { this._sel = [s, e]; },
        getAttribute: function (k) { return this.attrs[k] || null; },
        matches: function () { return false; }
    };
}
function parseInto(el, html) {
    const parts = String(html).match(/<div[^>]*>[\s\S]*?<\/div>/g) || [];
    el.childNodes.length = 0; el.children.length = 0;
    parts.forEach(function (p) { el.appendChild(makeEl('DIV', p)); });
}
function FakeEl() { }
Object.defineProperty(FakeEl.prototype, 'innerHTML', {
    configurable: true, enumerable: true,
    get: function () { return this._html || ''; },
    /* 模拟浏览器：整块替换后 scrollTop 归零、子节点全换 */
    set: function (v) { this._html = v; this.scrollTop = 0; this.scrollLeft = 0; parseInto(this, v); }
});
const root = makeEl('DIV');
Object.setPrototypeOf(root, FakeEl.prototype);
/* 假 DOM 不做真实树遍历，contains 恒真即可覆盖 snapFocus 的归属判断 */
root.contains = function () { return true; };
root.scrollTop = 240; root.scrollLeft = 12;
const input = makeEl('INPUT');
input.id = 'searchInput'; input.tagName = 'INPUT'; input.value = '周杰伦';
input.selectionStart = 2; input.selectionEnd = 2;
root.appendChild(input);
const sandbox = {
    console: console, Date: Date, Object: Object, Array: Array, String: String,
    Math: Math, JSON: JSON, RegExp: RegExp, Error: Error,
    setTimeout: function () { return 0; }, clearTimeout: function () { },
    Location: function () { },
    Element: FakeEl,
    document: {
        activeElement: input,
        body: makeEl('BODY'), documentElement: makeEl('HTML'),
        createElement: function (tag) {
            const e = makeEl(tag);
            Object.setPrototypeOf(e, FakeEl.prototype);
            return e;
        },
        getElementById: function (id) { return id === 'searchInput' ? input : null; }
    }
};
sandbox.window = sandbox;
sandbox.document.body.contains = function () { return true; };
vm.createContext(sandbox);
let boot = true, bootErr = '';
try { vm.runInContext(DOMKEEP, sandbox, { filename: 'ui/n26-dom-keep.js' }); }
catch (e) { boot = false; bootErr = e.message; }
ok('dom-keep 在假 DOM 中无异常启动', boot, bootErr);
ok('Element.prototype.innerHTML 已被包装', !!sandbox.N26DomKeep && sandbox.N26DomKeep.hooked === true);

root.innerHTML = '<div id="a">A</div>';
ok('★ 整块重建后滚动位置被保住（不再跳顶）',
    root.scrollTop === 240 && root.scrollLeft === 12,
    'top=' + root.scrollTop + ' left=' + root.scrollLeft);
const newInput = makeEl('INPUT');
newInput.id = 'searchInput'; newInput.tagName = 'INPUT'; newInput.value = 'x';
parseInto(root, '<div id="a">A</div>');
root.appendChild(newInput);
sandbox.document.getElementById = function (id) { return id === 'searchInput' ? newInput : null; };
/* 模拟：用户正在旧搜索框里输入「周杰伦」，重建后新框是空的 */
sandbox.document.activeElement = input;
root.scrollTop = 88;
root.innerHTML = '<div id="a">A2</div>';
ok('输入框焦点 / 值 / 选区在重建后恢复',
    sandbox.document.activeElement === newInput && newInput.value === '周杰伦' &&
    newInput._sel && newInput._sel[0] === 2,
    'val=' + newInput.value + ' focused=' + (sandbox.document.activeElement === newInput));
ok('恢复后滚动位置仍是重建前的值', root.scrollTop === 88, 'top=' + root.scrollTop);

const box = makeEl('DIV');
Object.setPrototypeOf(box, FakeEl.prototype);
parseInto(box, '<div>A</div><div>B</div>');
const firstRef = box.childNodes[0], secondRef = box.childNodes[1];
const patchChanged = sandbox.N26DomKeep.patch(box, '<div>A</div><div>B2</div>');
ok('★ patch 只替换变化的节点（点下载只换 1 张卡）',
    patchChanged === 1 && box.childNodes[0] === firstRef && box.childNodes[1] !== secondRef,
    'changed=' + patchChanged);
ok('patch 后内容正确', /B2/.test(box.childNodes[1].outerHTML));

/* ---------- B2 NoReload：默认拦截 + 一次性令牌 ---------- */
let reloadHits = 0;
function Loc() { }
Loc.prototype.reload = function () { reloadHits++; };
const nrSandbox = {
    console: console, Date: Date, Object: Object, Math: Math,
    setTimeout: function () { return 0; }, clearTimeout: function () { },
    Location: Loc,
    document: { addEventListener: function () { }, documentElement: { style: { getPropertyValue: function () { return ''; } } }, body: { className: '', getAttribute: function () { return ''; } } },
    n26ApplyGlass: function () { },
    renderSettingsPanel: function () { }, renderDesktopIcons: function () { }, renderLaunchpad: function () { }
};
nrSandbox.window = nrSandbox;
vm.createContext(nrSandbox);
try { vm.runInContext(NR, nrSandbox, { filename: 'ui/n26-no-reload.js' }); } catch (e) { }
const loc = new Loc();
loc.reload();
ok('★ 未授权 reload 被拦截', reloadHits === 0, 'hits=' + reloadHits);
nrSandbox.n26AllowReboot();
loc.reload();
ok('★ 显式系统动作授权后放行一次', reloadHits === 1, 'hits=' + reloadHits);
loc.reload();
ok('★ 令牌一次性，第二次仍被拦', reloadHits === 1, 'hits=' + reloadHits);

/* ---------- B3 detectKind：鼠标滚轮绝不误判 ---------- */
const kindSrc = /function detectKind\(e\) \{[\s\S]*?\n    \}/.exec(GEST);
let kindFn = null, kindErr = '';
const ctx = { _t: 0, lastWheelTs: 0, wheelStreak: 0 };
ctx.now = function () { return ctx._t; };
try {
    if (!kindSrc) throw new Error('detectKind 源码提取失败');
    vm.createContext(ctx);
    vm.runInContext(kindSrc[0], ctx);
    kindFn = ctx.detectKind;
} catch (e) { kindErr = e.message; }
ok('detectKind 可在隔离沙箱中调用', !!kindFn, kindErr);
if (kindFn) {
    let allMouse = true;
    for (let i = 0; i < 8; i++) {
        ctx._t += 8;                       // 8ms 间隔 = 快速连滚
        const k = ctx.detectKind({ deltaMode: 0, deltaX: 0, deltaY: 100 });
        if (k !== 'mouse') allMouse = false;
    }
    ok('★ 快速连滚 8 下鼠标全判 mouse（旧版第 3 下就变 trackpad）', allMouse);
    let pad = false;
    for (let i = 0; i < 6; i++) {
        ctx._t += 8;
        const k = ctx.detectKind({ deltaMode: 0, deltaX: 0.4, deltaY: 3.3 });
        if (k === 'trackpad') pad = true;
    }
    ok('真触控板小位移连续流仍判 trackpad（精准手势不丢）', pad);
    ok('行模式滚轮判 mouse', ctx.detectKind({ deltaMode: 1, deltaX: 0, deltaY: 3 }) === 'mouse');
}

console.log('\n============================================');
console.log('  PASS ' + PASS + '   FAIL ' + FAIL);
console.log('  纯 Node 静态 + vm 假 DOM · 未启动任何浏览器');
console.log('============================================');
process.exit(FAIL ? 1 : 0);
