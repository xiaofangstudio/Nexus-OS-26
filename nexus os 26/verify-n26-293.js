/* ============================================================
   verify-n26-293.js · v2.9.93 纯 Node 验收（零浏览器 / 零 Edge）
   ------------------------------------------------------------
   覆盖本轮 5 件事：
     ① 点任何控件都不整窗刷新（玻璃广播短路 / 整块重建短路 / reload 守门）
     ② 开关四段液态玻璃：150% 玻璃块 + 真折射 + 前沿先到后沿晚 100ms + 缩回白胶囊
     ③ 折射引擎全量接通（白名单 / CSS 放行 / iframe 独立引擎）
     ④ 小型开始菜单确定性 WAAPI + 电源按钮一次定位
     ⑤ 版本戳 / 禁紫 / 语法 / 既有守门回归
   动态部分用 vm 假 DOM 逐帧驱动 rAF，直接量每一帧的 left/width/height。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');
const ROOT = __dirname;

let PASS = 0, FAIL = 0;
function ok(name, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + name); }
    else { FAIL++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function section(t) { console.log('\n── ' + t + ' ───────────────────────────────'); }

const HTML = read('Nexus OS 26.html');
const NR = read('ui/n26-no-reload.js');
const SWJS = read('ui/n26-switch.js');
const SWCSS = read('ui/n26-switch.css');
const LGCORE = read('ui/n26-lg-core.js');
const GLASSCSS = read('ui/n26-glass-system.css');
const DOCKCSS = read('ui/n26-docknav.css');

/* ---------------------------------------------------------- */
section('① 防整窗刷新 · 静态');
/* v2.9.96 起戳继续前进（nr3…），这里只锁「挂载且顺序正确」，避免每次 bump 误报 */
ok('no-reload 模块已挂载且在 switch.js 之前',
    /n26-no-reload\.js\?v=nr\d+/.test(HTML) &&
    HTML.indexOf('ui/n26-no-reload.js') < HTML.indexOf('ui/n26-switch.js'));
/* v2.9.94：旧判据（sig === lastGlassSig）会把材质切换与所有参数滑杆
   一起短路，是「参数全部失效」的真凶；现在只看调用来源。 */
ok('防刷新守门：滑杆/材质放行、仅开关点击短路',
    /function glassSig\(\)/.test(NR) &&
    /opts\.light === true/.test(NR) &&
    /__N26_SWITCH_CLICK__/.test(NR) &&
    !/sig === lastGlassSig/.test(NR));
ok('三个整块重建函数都被包住', /REBUILD_FNS = \['renderSettingsPanel', 'renderDesktopIcons', 'renderLaunchpad'\]/.test(NR) &&
    /__N26_SWITCH_CLICK__/.test(NR));
/* v2.9.96：由「click 同一帧内拦截」升级为「默认白名单 + 一次性授权令牌」，
   覆盖主壳里 setTimeout 2~3s 后才执行的延迟 reload。 */
ok('Location.prototype.reload 守门（默认拦截 + 一次性令牌）',
    /Object\.getOwnPropertyDescriptor\(P, 'reload'\)/.test(NR) &&
    /rebootTokens > 0/.test(NR) && /rebootTokens--/.test(NR) &&
    /allowUntil = 0/.test(NR) && /已拦截未授权的整窗刷新/.test(NR));
ok('3 个显式系统重启已授权',
    (HTML.match(/n26AllowReboot\(\)/g) || []).length >= 3,
    String((HTML.match(/n26AllowReboot\(\)/g) || []).length));
ok('无 type 的 button 被改成 type=button', /setAttribute\('type', 'button'\)/.test(NR));
ok('玻璃总账戳 g4 / 开关样式戳 sw11 / 开关脚本戳 sw12',
    /n26-glass-system\.css\?v=g4/.test(HTML) &&
    /n26-switch\.css\?v=sw12/.test(HTML) &&
    /n26-switch\.js\?v=sw12/.test(HTML));
ok('开关 CSS 在玻璃总账之后加载',
    HTML.indexOf('ui/n26-switch.css') > HTML.indexOf('ui/n26-glass-system.css'));

/* ---------------------------------------------------------- */
section('② 四段液态玻璃开关 · 静态');
ok('四段节拍常量齐全（90 / 260 / 100 / 100）',
    /P1_SWELL = 90/.test(SWJS) && /P2_MOVE = 260/.test(SWJS) &&
    /P2_LAG = 100/.test(SWJS) && /P3_SETTLE = 100/.test(SWJS));
ok('前沿 L(t) 与后沿 L(t-100ms) 分离计算',
    /var lead = x0 \+ \(x1 - x0\) \* ease\(mt\)/.test(SWJS) &&
    /var bt = clamp\(\(t - P1_SWELL - P2_LAG\) \/ P2_MOVE\)/.test(SWJS) &&
    /var span = Math\.abs\(lead - trail\)/.test(SWJS));
ok('每帧直写 left/width/height（真拉伸，不是 transform 假装）',
    /blob\.style\.left =/.test(SWJS) && /blob\.style\.width =/.test(SWJS) && /blob\.style\.height =/.test(SWJS));
ok('150% 玻璃块（0.5 倍增量）', /1 \+ 0\.5 \* g/.test(SWJS));
ok('折射贴图固定尺寸 + 预热缓存',
    /LG_SIZE = \{ w: 48, h: 24 \}/.test(SWJS) && /function warmLg\(\)/.test(SWJS) &&
    /noBlur: true/.test(SWJS));
ok('状态就地修补（业务交给重建时不会点了没反应）',
    /if \(after === before\) \{ setOn\(target, !before\); after = !before; \}/.test(SWJS));
ok('方向由 from/to 决定，没有写死左右', /var x0 = m\.pad \+ \(fromOn \? m\.travel : 0\)/.test(SWJS) &&
    /var x1 = m\.pad \+ \(toOn \? m\.travel : 0\)/.test(SWJS));
ok('白胶囊动效期隐藏 + 高特异性放行折射',
    /n26-sw-busy::after/.test(SWCSS) && /n26-sw-blob\.n26-liquid-on/.test(SWCSS) &&
    /:is\(#n26a #n26b #n26c,/.test(SWCSS));
ok('hover 发光 / 按下更亮', /:hover/.test(SWCSS) && /:active/.test(SWCSS) &&
    /0 0 26px rgba\(150, 210, 255, 0\.92\)/.test(SWCSS));
ok('不在祖先上用 filter（会废掉子玻璃 backdrop-filter）', !/filter: drop-shadow/.test(SWCSS));

/* ---------------------------------------------------------- */
section('③ 折射引擎全量接通');
ok('.n26-sw-blob 已登记折射白名单',
    /const N26_LG_WHITELIST =[^\n]*\.n26-sw-blob/.test(HTML));
ok('玻璃总账 2.12 常驻放行（不再只限 travel/glow）',
    /\.n26-dng\.n26-liquid-on,/.test(GLASSCSS) && /\.n26-sw-blob\.n26-liquid-on/.test(GLASSCSS));
ok('侧边玻璃 hover/按下发光已写进总账与 docknav.css',
    /n26-docknav-host:hover > \.n26-dng/.test(GLASSCSS) &&
    /n26-docknav-host:hover > \.n26-dng/.test(DOCKCSS));
ok('iframe 独立折射引擎存在且 feDisplacementMap 同源',
    /feDisplacementMap/.test(LGCORE) && /xChannelSelector/.test(LGCORE) &&
    /toDataURL\('image\/png'\)/.test(LGCORE));
ok('宿主已有引擎时独立模块主动让位',
    /if \(typeof window\.n26LgAttach === 'function' &&[\s\S]{0,180}return;/.test(LGCORE));
for (const f of ['apps/agent.html', 'apps/games.html', 'apps/devstudio.html', 'apps/alarm.html']) {
    const s = read(f);
    ok(f + ' 已挂独立折射引擎 + 开关资源',
        /n26-lg-core\.js\?v=lg1/.test(s) && /n26-switch\.js\?v=sw12/.test(s) && /n26-switch\.css\?v=sw12/.test(s));
}

/* ---------------------------------------------------------- */
section('④ 小开始菜单 / 电源按钮');
ok('外框走确定性 WAAPI（不再依赖 CSSAnimation 重放）',
    /function n26SmAnimate\(menu, dir\)/.test(HTML) && /menu\.animate\(frames/.test(HTML));
ok('开 / 关两条路径都演', /n26SmAnimate\(menu, 'in'\)/.test(HTML) &&
    (HTML.match(/n26SmAnimate\(menu, 'out'\)/g) || []).length === 2);
ok('WAAPI 起止 transform 显式算出，不用 var() 拼 keyframes',
    /const from = \{ opacity: 0, transform: base \+/.test(HTML));
ok('电源按钮只定位一次', !/setTimeout\(placePowerBtn, 240\)/.test(HTML));
ok('测量在动画开始前完成', /const menuRect = menu\.getBoundingClientRect\(\);\s*\/\/ 动画未开始 = 最终矩形/.test(HTML) &&
    HTML.lastIndexOf('n26SmAnimate(menu, \'in\')') > HTML.indexOf('动画未开始 = 最终矩形'));

/* ---------------------------------------------------------- */
section('⑤ 版本 / 禁紫 / 语法');
const verConst = (HTML.match(/const NEXUS_OS_VERSION = '(v\d+\.\d+\.\d+)'/) || [])[1];
const verLog = (HTML.match(/changelog-version">(v\d+\.\d+\.\d+)</) || [])[1];
ok('版本号 == 更新日志第一条（' + verConst + '）', verConst === verLog, verLog);
ok('版本戳一致：主壳 / agent / games / devstudio 都是 2979',
    (HTML.match(/n26-docknav\.css\?v=2979/g) || []).length === 1 &&
    ['apps/agent.html', 'apps/games.html', 'apps/devstudio.html'].every(f => /n26-docknav\.css\?v=2979/.test(read(f))));
const hexes = (NR + SWJS + SWCSS + LGCORE + GLASSCSS + DOCKCSS).match(/#[0-9a-fA-F]{6}\b/g) || [];
const purple = hexes.filter(h => {
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    return b > 130 && r > 80 && r < 190 && g < r * 0.8 && b > g * 1.35;
});
ok('新增/改动文件零紫色', purple.length === 0, purple.join(','));
for (const f of ['ui/n26-no-reload.js', 'ui/n26-switch.js', 'ui/n26-lg-core.js']) {
    let good = true;
    try { cp.execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); }
    catch (e) { good = false; }
    ok('语法 ' + f, good);
}
const inline = HTML.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi) || [];
let badBlocks = 0;
inline.forEach(b => {
    const body = b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try { new vm.Script(body); } catch (e) { badBlocks++; }
});
ok('主壳 ' + inline.length + ' 段内联脚本语法全通过', badBlocks === 0, String(badBlocks));

/* ---------------------------------------------------------- */
/* 动态：vm 假 DOM                                              */
/* ---------------------------------------------------------- */
function makeEl(tag, cls) {
    const attrs = {};
    const set = new Set((cls || '').split(/\s+/).filter(Boolean));
    const el = {
        tagName: String(tag).toUpperCase(),
        isConnected: true,
        parentNode: null,
        children: [],
        offsetWidth: 48,
        offsetHeight: 24,
        __vars: {},
        _anims: [],
        style: {
            setProperty(k, v) { this[k] = v; },
            removeProperty(k) { delete this[k]; },
            getPropertyValue(k) { return this[k] || ''; }
        },
        classList: {
            add() { for (const a of arguments) set.add(a); },
            remove() { for (const a of arguments) set.delete(a); },
            contains(c) { return set.has(c); },
            toggle(c, f) { const on = (f === undefined) ? !set.has(c) : !!f; on ? set.add(c) : set.delete(c); return on; }
        },
        setAttribute(k, v) { attrs[k] = String(v); if (k === 'id') registry.set(v, el); },
        setAttributeNS(ns, k, v) { this.setAttribute(k, v); },
        getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
        hasAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k); },
        removeAttribute(k) { delete attrs[k]; },
        appendChild(c) { c.parentNode = el; el.children.push(c); c.isConnected = el.isConnected; return c; },
        removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentNode = null; c.isConnected = false; return c; },
        closest(sel) {
            const toks = (sel.match(/\.[A-Za-z0-9_-]+/g) || []).map(s => s.slice(1));
            let cur = el;
            while (cur) {
                if (toks.some(t => cur.classList.contains(t))) return cur;
                cur = cur.parentNode;
            }
            return null;
        },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        getBoundingClientRect() { return { left: 0, top: 0, right: 48, bottom: 24, width: 48, height: 24 }; },
        animate() { const a = { cancel() { }, play() { } }; el._anims.push(a); return a; },
        getAnimations() { return el._anims; },
        addEventListener() { },
        click() { }
    };
    Object.defineProperty(el, 'className', {
        get() { return Array.from(set).join(' '); },
        set(v) { set.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => set.add(c)); }
    });
    Object.defineProperty(el, 'firstChild', { get() { return el.children[0] || null; } });
    return el;
}

const registry = new Map();

function makeSandbox(opts) {
    opts = opts || {};
    let now = 0;
    const timers = [];
    const raf = [];
    const listeners = {};
    let rafId = 0;
    const body = makeEl('body');
    const root = makeEl('html');
    const sandbox = {
        console: console,
        /* 虚拟时钟：Date.now() 也必须跟 __tick 走，否则保护窗口永远不结束 */
        Date: { now() { return now; } },
        Math: Math, JSON: JSON, Object: Object, Array: Array,
        String: String, Number: Number, Boolean: Boolean, Error: Error,
        parseFloat: parseFloat, parseInt: parseInt, isFinite: isFinite,
        setTimeout(fn, ms) { const t = { fn: fn, at: now + (ms || 0), dead: false }; timers.push(t); return t; },
        clearTimeout(t) { if (t) t.dead = true; },
        requestAnimationFrame(fn) { const r = { id: ++rafId, fn: fn, dead: false }; raf.push(r); return r.id; },
        cancelAnimationFrame(id) { const r = raf.find(x => x.id === id); if (r) r.dead = true; },
        performance: { now() { return now; } },
        matchMedia() { return { matches: false }; },
        getComputedStyle(el) { return { getPropertyValue(k) { return el.__vars[k] || ''; } }; },
        MutationObserver: function (fn) { this.observe = function () { }; this.__t = null; },
        document: {
            readyState: 'complete',
            body: body,
            documentElement: root,
            addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
            querySelectorAll() { return opts.switches || []; },
            querySelector() { return null; },
            getElementById(id) { return registry.get(id) || null; },
            createElement(tag) {
                if (tag === 'canvas') {
                    return {
                        width: 0, height: 0,
                        getContext() {
                            return {
                                createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
                                putImageData() { }
                            };
                        },
                        toDataURL() { return 'data:image/png;base64,iVBORw0KGgo='; }
                    };
                }
                return makeEl(tag);
            },
            createElementNS(ns, tag) { return makeEl(tag); }
        },
        __tick(ms) {
            now += ms;
            for (let pass = 0; pass < 8; pass++) {
                let ran = false;
                for (const t of timers) {
                    if (!t.dead && t.at <= now) { t.dead = true; t.fn(); ran = true; }
                }
                if (!ran) break;
            }
        },
        __frame(t) {
            now = t;
            const q = raf.splice(0);
            for (const r of q) if (!r.dead) r.fn(t);
        },
        __fire(type, ev) { (listeners[type] || []).forEach(fn => fn(ev)); },
        __listeners: listeners,
        __body: body,
        __root: root
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    return sandbox;
}

/* ---------- 动态 1：no-reload 守门 ---------- */
section('动态 A · 防整窗刷新');
(function () {
    const sw = makeEl('div', 'fu-switch toggle-switch');
    const s = makeSandbox({ switches: [sw] });
    s.renderSettingsPanel = function () { s.__panel = (s.__panel || 0) + 1; };
    s.renderDesktopIcons = function () { s.__icons = (s.__icons || 0) + 1; };
    s.renderLaunchpad = function () { s.__launch = (s.__launch || 0) + 1; };
    s.n26ApplyGlass = function () { s.__glass = (s.__glass || 0) + 1; };
    function Loc() { }
    Loc.prototype.reload = function () { s.__reload = (s.__reload || 0) + 1; };
    s.Location = Loc;
    try { vm.runInContext(NR, s, { filename: 'n26-no-reload.js' }); } catch (e) {
        ok('no-reload 可执行', false, e.message); return;
    }
    ok('no-reload 可执行', true);
    s.__tick(0);   // 让 install() 完成

    ok('三个重建函数已包装',
        !!(s.renderSettingsPanel.__n26NoReloadWrapped && s.renderDesktopIcons.__n26NoReloadWrapped && s.renderLaunchpad.__n26NoReloadWrapped));
    ok('玻璃函数已包装', !!s.n26ApplyGlass.__n26NoReloadWrapped);

    /* 首次（非点击）调用照常 */
    s.n26ApplyGlass();
    ok('非点击时玻璃广播照常执行', s.__glass === 1, String(s.__glass));

    /* 模拟一次开关点击 */
    s.__fire('pointerdown', { target: sw });
    s.__fire('click', { target: sw });
    s.renderSettingsPanel();
    s.renderDesktopIcons();
    s.renderLaunchpad();
    s.n26ApplyGlass();
    ok('开关点击时整块重建被拦下', !s.__panel && !s.__icons && !s.__launch,
        JSON.stringify({ p: s.__panel, i: s.__icons, l: s.__launch }));
    ok('玻璃真值未变时广播/贴图重建被短路', s.__glass === 1, String(s.__glass));

    /* reload 守门：同一帧内普通控件触发 → 拦；显式授权 → 放行 */
    s.__fire('pointerdown', { target: sw });
    s.__fire('click', { target: sw });
    s.location = new Loc();
    s.location.reload();
    ok('普通控件同帧 reload 被拦下', !s.__reload, String(s.__reload));
    s.n26AllowReboot();
    s.location.reload();
    ok('显式系统重启放行', s.__reload === 1, String(s.__reload));

    /* 保护窗口过后恢复正常 */
    s.__tick(1200);
    s.renderSettingsPanel();
    s.n26ApplyGlass();
    ok('窗口过后重建恢复', s.__panel === 1, String(s.__panel));
    ok('窗口过后玻璃广播恢复', s.__glass === 2, String(s.__glass));
})();

/* ---------- 动态 2：四段动画逐帧量坐标 ---------- */
section('动态 B · 开关四段逐帧坐标');
function runSwitch(before, businessToggle) {
    const sw = makeEl('div', 'fu-switch toggle-switch' + (before ? ' on' : ''));
    sw.__vars = {
        '--fu-sw-kw': '18px', '--fu-sw-kh': '15px',
        '--fu-sw-pad': '2px', '--fu-sw-travel': '14px'
    };
    sw.offsetHeight = 20;
    const s = makeSandbox({ switches: [sw] });
    s.n26LgAttach = function (el, id, opts, size) {
        s.__lg = (s.__lg || 0) + 1;
        s.__lgSize = size;
        el.classList.add('n26-liquid-on');
        el._n26Lg = { id: id, w: size.w, h: size.h };
    };
    s.n26LgClear = function (el) { el.classList.remove('n26-liquid-on'); el._n26Lg = null; };
    try { vm.runInContext(SWJS, s, { filename: 'n26-switch.js' }); } catch (e) {
        return { error: e.message };
    }
    s.__tick(0);

    /* 时序必须和真实浏览器一致：
       捕获阶段（switch.js 读 before）→ 业务 onclick（同步翻状态）→ setTimeout(0) 动画 */
    s.__fire('pointerdown', { target: sw });
    s.__fire('click', { target: sw });
    if (businessToggle) {
        sw.classList.toggle('on', !before);
        sw.setAttribute('aria-checked', before ? 'false' : 'true');
    }
    s.__tick(0);

    const blob = sw.children.find(c => c.classList.contains('n26-sw-blob'));
    const frames = [];
    const times = [0, 45, 90, 130, 190, 220, 350, 440, 500, 549, 551];
    for (const t of times) {
        s.__frame(t);
        if (blob) frames.push({
            t: t,
            left: parseFloat(blob.style.left) || 0,
            width: parseFloat(blob.style.width) || 0,
            height: parseFloat(blob.style.height) || 0,
            opacity: parseFloat(blob.style.opacity),
            lg: blob.classList.contains('n26-liquid-on')
        });
    }
    return {
        s: s, sw: sw, blob: blob, frames: frames,
        lg: s.__lg || 0, lgSize: s.__lgSize,
        on: sw.classList.contains('on'),
        busy: sw.classList.contains('n26-sw-busy')
    };
}

(function () {
    const a = runSwitch(false, false);
    ok('开关脚本可执行', !a.error, a.error);
    if (a.error) return;
    ok('业务不翻状态时被就地修补（点开 → on）', a.on === true);
    ok('生成了独立玻璃块', !!a.blob);
    ok('玻璃块全程挂真折射（动画末帧前仍 n26-liquid-on）', a.frames.slice(0, 9).every(x => x.lg === true));
    ok('折射贴图用预热固定尺寸 48×24', a.lgSize && a.lgSize.w === 48 && a.lgSize.h === 24);
    ok('预热 + 动画各挂一次（无反复拆建）', a.lg === 2, String(a.lg));

    const f = t => a.frames.find(x => x.t === t);
    ok('P1 白胶囊 → 150% 玻璃（18→27 / 15→22.5）',
        Math.abs(f(90).width - 27) < 0.6 && Math.abs(f(90).height - 22.5) < 0.6,
        JSON.stringify(f(90)));
    ok('P2 前沿先到、后沿晚 100ms → 中段真拉伸',
        f(130).width > 27 && f(190).width > 28 && f(220).width > 31 && f(350).width < f(220).width,
        JSON.stringify([f(130).width, f(190).width, f(220).width, f(350).width]));
    ok('P2 朝「开」方向前进（右移）', f(350).left > f(90).left,
        JSON.stringify([f(90).left, f(350).left]));
    ok('P3 末端缩回白色胶囊尺寸', f(500).width < 27 && f(500).height < 22.5 && f(500).opacity < 1,
        JSON.stringify(f(500)));
    ok('动画收尾摘掉玻璃块与折射', !a.busy && a.sw.children.every(c => !c.classList.contains('n26-sw-blob')));

    const b = runSwitch(true, true);
    const bf = t => b.frames.find(x => x.t === t);
    ok('关闭方向相反（左移）', bf(350).left < bf(90).left,
        JSON.stringify([bf(90).left, bf(350).left]));
    ok('关闭时状态落到 off', b.on === false);
})();

/* ---------- 动态 3：iframe 独立折射引擎 ---------- */
section('动态 C · iframe 独立折射引擎');
(function () {
    const s = makeSandbox();
    const probe = makeEl('div', 'n26-dng');
    probe.offsetWidth = 64; probe.offsetHeight = 40;
    try { vm.runInContext(LGCORE, s, { filename: 'n26-lg-core.js' }); } catch (e) {
        ok('独立引擎可执行', false, e.message); return;
    }
    ok('独立引擎可执行', true);
    ok('导出 n26LgAttach / Resize / Clear',
        typeof s.n26LgAttach === 'function' && typeof s.n26LgResize === 'function' && typeof s.n26LgClear === 'function');
    s.n26LgAttach(probe, 'n26LgTest', { noBlur: true }, { w: 64, h: 40 });
    const filter = probe.style.getPropertyValue('--n26-lg-filter') || '';
    ok('注入 url(#...) 折射串且无 blur()', /url\(#n26LgTest\)/.test(filter) && !/blur\(/.test(filter), filter);
    ok('标记 n26-liquid-on', probe.classList.contains('n26-liquid-on'));
    s.n26LgClear(probe);
    ok('摘除后无残留', !probe.classList.contains('n26-liquid-on') && !probe.style.getPropertyValue('--n26-lg-filter'));

    /* 宿主已有引擎时让位 */
    const s2 = makeSandbox();
    const sentinel = function () { };
    s2.n26LgAttach = sentinel; s2.n26LgResize = sentinel; s2.n26LgClear = sentinel;
    vm.runInContext(LGCORE, s2, { filename: 'n26-lg-core.js' });
    ok('宿主已有引擎时不覆盖', s2.n26LgAttach === sentinel);
})();

/* ---------------------------------------------------------- */
section('结果');
console.log('\nPASS ' + PASS + '   FAIL ' + FAIL);
process.exit(FAIL ? 1 : 0);
