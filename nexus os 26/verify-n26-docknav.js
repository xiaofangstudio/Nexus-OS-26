/* ============================================================
   verify-n26-docknav.js — v2.9.92 侧边 Dock 液态玻璃重写验收
   纯 Node + vm 假 DOM，不启动任何浏览器（用户禁令）。
   真的把 ui/n26-docknav.js 跑起来：点击 / rAF 逐帧 / 长按拖动 /
   折射挂接，量每一帧的 transform 坐标，断言永远不飞出容器。
   ============================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = __dirname;
const JS = fs.readFileSync(path.join(ROOT, 'ui/n26-docknav.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'ui/n26-docknav.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'Nexus OS 26.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n[' + t + ']'); }

/* ---------------- 静态契约 ---------------- */
section('静态契约');
ok('CSS 已改为容器内 absolute', /\.n26-docknav-host > \.n26-dng\s*\{[^}]*position:\s*absolute/.test(CSS));
ok('CSS 不再有 fixed 浮层定义', !/position:\s*fixed;\s*left:\s*0;\s*top:\s*0;\s*z-index:\s*2147483000/.test(CSS));
ok('CSS 不 transition transform', !/transition:[^;]*transform[^;]*;/.test(CSS.replace(/transition:[^;]*opacity[^;]*;/g, '')));
ok('JS 把玻璃插进容器内部', /cont\.insertBefore\(glass,\s*cont\.firstChild\)/.test(JS));
ok('JS 不再挂 body', !/document\.body\s*\|\|\s*document\.documentElement\)\.appendChild\(glass\)/.test(JS));
ok('JS 不用独立 scale 属性写玻璃', !/glass\.style\.(setProperty\('scale'|scale\s*=)/.test(JS));
ok('位移与形变写同一个 transform', /translate3d\([\s\S]{0,120}scale\(/.test(JS));
ok('Liquid Motion 残留清零', !/N26LiquidMotion|Liquid Motion v1/.test(JS));
ok('一格 200ms 常量存在', /var STEP_MS = 200/.test(JS));
/* 禁紫：不写字面色值，直接按 RGB 判定「蓝紫/品红」色相，避免脚本自身被全项目扫描误报 */
const hexes = (JS + CSS).match(/#[0-9a-fA-F]{6}\b/g) || [];
const purpleHex = hexes.filter(function (hx) {
    const r = parseInt(hx.slice(1, 3), 16), g = parseInt(hx.slice(3, 5), 16), b = parseInt(hx.slice(5, 7), 16);
    return b > 130 && r > 80 && r < 190 && g < r * 0.8 && b > g * 1.35;
});
ok('禁止紫色（色相判定，重写文件无紫）', purpleHex.length === 0, purpleHex.join(','));

/* ---------------- 假 DOM ---------------- */
function matches(n, sel) {
    if (!n || !sel) return false;
    const s = sel.trim();
    if (s === '[data-n26dock]') return n._attrs['data-n26dock'] !== undefined;
    const m = s.match(/^\.([\w-]+)(?:\[([\w-]+)\])?$/);
    if (m) {
        if (!n._cls.has(m[1])) return false;
        if (m[2]) return n._attrs[m[2]] !== undefined || m[2] in n;
        return true;
    }
    if (s[0] === '#') return n._attrs.id === s.slice(1);
    if (s.includes('[data-n26dock]') && s.includes('.')) {
        const c = s.match(/^\.([\w-]+)/);
        return !!c && n._cls.has(c[1]) && n._attrs['data-n26dock'] !== undefined;
    }
    return false;
}
function mkEl(tag) {
    const el = {
        tagName: String(tag).toUpperCase(), children: [], parentNode: null,
        _cls: new Set(), _attrs: {}, _lis: {}, _clicked: 0,
        style: (function () { const o = {}; o.setProperty = function (k, v) { o[k] = v; }; o.removeProperty = function (k) { delete o[k]; }; return o; })(),
        clientLeft: 0, clientTop: 0, clientWidth: 0, clientHeight: 0,
        scrollLeft: 0, scrollTop: 0, offsetWidth: 0, offsetHeight: 0,
        rect: { left: 0, top: 0, width: 0, height: 0 },
        isConnected: true
    };
    el.classList = {
        add: function () { for (const c of arguments) el._cls.add(c); },
        remove: function () { for (const c of arguments) el._cls.delete(c); },
        contains: function (c) { return el._cls.has(c); },
        toggle: function (c, on) { if (on === undefined) on = !el._cls.has(c); on ? el._cls.add(c) : el._cls.delete(c); return on; }
    };
    el.setAttribute = function (k, v) { el._attrs[k] = v; };
    el.getAttribute = function (k) { return el._attrs[k]; };
    el.removeAttribute = function (k) { delete el._attrs[k]; };
    el.appendChild = function (c) { c.parentNode = el; el.children.push(c); return c; };
    el.insertBefore = function (c, ref) {
        c.parentNode = el;
        const i = ref ? el.children.indexOf(ref) : -1;
        if (i >= 0) el.children.splice(i, 0, c); else el.children.unshift(c);
        return c;
    };
    Object.defineProperty(el, 'firstChild', { get: function () { return el.children[0] || null; } });
    /* v2.9.98：真实 DOM 的 offsetWidth/offsetHeight 会反映 style 尺寸。
       假 DOM 原来恒为 0，导致新代码「按布局尺寸挂折射」全部早退、测不出东西。
       这里补上同样的语义：有显式值用显式值，否则从 style.width/height 解析。 */
    let _ow = 0, _oh = 0;
    Object.defineProperty(el, 'offsetWidth', {
        get: function () { if (_ow) return _ow; const v = parseFloat(el.style.width); return isFinite(v) ? v : 0; },
        set: function (v) { _ow = v; }, configurable: true
    });
    Object.defineProperty(el, 'offsetHeight', {
        get: function () { if (_oh) return _oh; const v = parseFloat(el.style.height); return isFinite(v) ? v : 0; },
        set: function (v) { _oh = v; }, configurable: true
    });
    Object.defineProperty(el, 'className', {
        get: function () { return Array.from(el._cls).join(' '); },
        set: function (v) { el._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
    });
    el.contains = function (n) { if (n === el) return true; return el.children.some(function (c) { return c.contains ? c.contains(n) : c === n; }); };
    el.closest = function (sel) { let n = el; while (n) { if (matches(n, sel)) return n; n = n.parentNode; } return null; };
    el.querySelectorAll = function (sel) { return el._all ? el._all(sel) : []; };
    el.getBoundingClientRect = function () { return Object.assign({}, el.rect, { right: el.rect.left + el.rect.width, bottom: el.rect.top + el.rect.height }); };
    el.getClientRects = function () { return [el.rect]; };
    el.addEventListener = function (t, f) { (el._lis[t] = el._lis[t] || []).push(f); };
    el.removeEventListener = function (t, f) { const a = el._lis[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); };
    el.click = function () { el._clicked++; fire(el, 'click', { target: el, stopPropagation: function () { }, preventDefault: function () { } }); };
    el.animate = function () { return { cancel: function () { }, play: function () { } }; };
    el.getAnimations = function () { return []; };
    return el;
}
function fire(el, type, evt) {
    const a = (el._lis && el._lis[type]) || [];
    for (const f of a.slice()) { try { f(evt); } catch (e) { console.log('    [handler throw] ' + e.message); } }
    if (el.parentNode && evt && evt.__bubble !== false) fire(el.parentNode, type, evt);
}

function harness() {
    let now = 0, tid = 0, rid = 0;
    const timers = [], rafs = [], winL = [];
    const lgCalls = [];
    const body = mkEl('body');
    const html = mkEl('html');

    /* 竖排侧栏：视口 (100,200)，宽 220，高 500；4 个项，格距 60 */
    const cont = mkEl('div');
    cont._cls.add('fm-sidebar');
    cont._attrs['data-n26dock'] = 'v';
    cont.rect = { left: 100, top: 200, width: 220, height: 500 };
    cont.clientWidth = 220; cont.clientHeight = 500;
    const items = [];
    for (let i = 0; i < 4; i++) {
        const it = mkEl('div');
        it._cls.add('fm-sidebar-item');
        it._attrs.onclick = '1';
        it.rect = { left: 108, top: 208 + i * 60, width: 204, height: 44 };
        it.offsetWidth = 204; it.offsetHeight = 44;
        cont.appendChild(it);
        items.push(it);
    }
    items[0]._cls.add('active');
    cont._all = function (sel) { return sel === '.fm-sidebar-item[onclick]' ? items.slice() : []; };
    body.appendChild(cont);

    const doc = {
        readyState: 'complete', body: body, documentElement: html,
        createElement: mkEl,
        querySelectorAll: function (sel) {
            if (sel === '.fm-sidebar[data-n26dock]') return [cont];
            if (sel === '.n26-dng') return cont.children.filter(function (c) { return c._cls.has('n26-dng'); });
            if (sel === '.n26-lg-ctrl') return [];
            return [];
        },
        addEventListener: function () { },
        getElementById: function () { return null; }
    };
    const win = {
        matchMedia: function () { return { matches: false }; },
        n26LgAttach: function (el, id, opts, size) { lgCalls.push({ kind: 'attach', id: id, size: size }); },
        n26LgResize: function (el, id, opts, size) { lgCalls.push({ kind: 'resize', id: id, size: size }); }
    };
    const sandbox = {
        console: console, Math: Math, Date: Date, String: String, Number: Number, Object: Object,
        Array: Array, WeakMap: WeakMap, isFinite: isFinite, parseFloat: parseFloat, JSON: JSON,
        document: doc, window: win,
        matchMedia: win.matchMedia,
        n26LgAttach: win.n26LgAttach,
        n26LgResize: win.n26LgResize,
        addEventListener: function (t, f) { winL.push({ t: t, f: f }); },
        removeEventListener: function (t, f) {
            const i = winL.findIndex(function (x) { return x.t === t && x.f === f; });
            if (i >= 0) winL.splice(i, 1);
        },
        getComputedStyle: function () { return { position: 'relative', overflowX: 'visible', overflowY: 'visible', scale: 'none' }; },
        performance: { now: function () { return now; } },
        requestAnimationFrame: function (cb) { rafs.push({ id: ++rid, cb: cb }); return rid; },
        cancelAnimationFrame: function (id) { const i = rafs.findIndex(function (r) { return r.id === id; }); if (i >= 0) rafs.splice(i, 1); },
        setTimeout: function (cb, ms) { const id = ++tid; timers.push({ id: id, due: now + (ms || 0), cb: cb, dead: false }); return id; },
        clearTimeout: function (id) { const t = timers.find(function (x) { return x.id === id; }); if (t) t.dead = true; },
        setInterval: function () { return 0; }, clearInterval: function () { },
        MutationObserver: function () { this.observe = function () { }; this.disconnect = function () { }; },
        ResizeObserver: function () { this.observe = function () { }; },
        Element: function () { }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInNewContext(JS, sandbox, { filename: 'n26-docknav.js' });

    function step(dt) {
        now += dt;
        const due = timers.filter(function (t) { return !t.dead && t.due <= now; });
        for (const t of due) { t.dead = true; try { t.cb(); } catch (e) { console.log('    [timer throw] ' + e.message); } }
        const q = rafs.splice(0, rafs.length);
        for (const r of q) { try { r.cb(now); } catch (e) { console.log('    [raf throw] ' + e.message); } }
    }
    function advance(ms, onframe) {
        const n = Math.ceil(ms / 8);
        for (let i = 0; i < n; i++) { step(8); if (onframe) onframe(); }
    }
    function fireWin(t, evt) {
        for (const w of winL.slice()) {
            if (w.t !== t) continue;
            try { w.f(evt); } catch (e) { console.log('    [win handler throw] ' + e.message); }
        }
    }
    return { cont: cont, items: items, doc: doc, sandbox: sandbox, lgCalls: lgCalls,
        step: step, advance: advance, now: function () { return now; }, fire: fire, fireWin: fireWin };
}

/* ---------------- 动态：点击滑行 ---------------- */
section('动态 · 点击滑行（逐帧量坐标）');
const h = harness();
h.advance(40);                       // 先让首帧 rAF 落位，再断言静止态
const glass = h.cont.children[0];
ok('玻璃是容器的第一个子元素（不是 body 浮层）', !!glass && glass._cls.has('n26-dng') && glass.parentNode === h.cont);
ok('静止态玻璃常驻可见（不再气泡闪现）', glass && glass.style.opacity === '1');
const frames = [];
h.items[1].click();
/* 模拟应用自己的 click 处理（真浏览器里 capture 先跑、应用 handler 后跑）把 active 挪到新项 */
h.items.forEach(function (it) { it._cls.delete('active'); });
h.items[1]._cls.add('active');
h.advance(900, function () { frames.push(glass.style.transform || ''); });
const parsed = frames.map(function (s) {
    const m = String(s).match(/translate3d\((-?[\d.]+)px,(-?[\d.]+)px,0\)\s*scale\(([\d.]+),([\d.]+)\)/);
    return m ? { x: +m[1], y: +m[2], sx: +m[3], sy: +m[4] } : null;
}).filter(Boolean);
ok('每一帧都写出了合法的单 transform', parsed.length > 10 && parsed.length === frames.filter(function (s) { return /translate3d/.test(s); }).length,
    'parsed=' + parsed.length + '/' + frames.length);
const xs = parsed.map(function (p) { return p.x; }), ys = parsed.map(function (p) { return p.y; });
const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
ok('X 全程留在容器内（含 4px 凸出）', minX >= -6 && maxX <= 228, 'minX=' + minX + ' maxX=' + maxX);
ok('Y 全程留在容器内', minY >= -6 && maxY <= 500, 'minY=' + minY + ' maxY=' + maxY);
ok('没有视口级大坐标（不再飞出窗口）', Math.max.apply(null, xs.map(Math.abs)) < 300 && Math.max.apply(null, ys.map(Math.abs)) < 600);
ok('玻璃尺寸不超过容器', parseFloat(glass.style.width) <= 230 && parseFloat(glass.style.height) <= 60,
    glass.style.width + ' x ' + glass.style.height);
ok('确实发生了沿 y 的位移', maxY - minY > 40, 'Δy=' + (maxY - minY).toFixed(1));
ok('存在水滴形变（沿走向拉长 / 垂直压扁）', parsed.some(function (p) { return p.sy > 1.001 || p.sx < 0.999; }));
ok('终点落在目标格（局部 y=68 减 4px 凸出 = 64）', Math.abs(glass.style.transform.match(/translate3d\([^,]+,(-?[\d.]+)px/)[1] - 64) < 1.5,
    glass.style.transform);
ok('折射引擎按量化尺寸挂接', h.lgCalls.some(function (c) { return c.size && c.size.w % 8 === 0 && c.size.h % 4 === 0; }),
    JSON.stringify(h.lgCalls.map(function (c) { return c.size; })));
ok('折射挂接没有反复重建（≤3 次）', h.lgCalls.length <= 3, 'calls=' + h.lgCalls.length);

/* ---------------- 动态：长按拖动 ---------------- */
section('动态 · 长按拖动 + 松手吸附');
const h3 = harness();
const g3 = h3.cont.children[0];
h3.advance(40);
const pd = (h3.cont._lis.pointerdown || [])[0];
ok('容器挂上了 pointerdown', typeof pd === 'function');
pd({ button: 0, clientX: 200, clientY: 230, target: h3.items[0] });
h3.advance(210);
ok('长按后玻璃可见', g3.style.opacity === '1');
h3.fireWin('pointermove', { clientX: 200, clientY: 410 });
const ty = +String(g3.style.transform).match(/translate3d\([^,]+,(-?[\d.]+)px/)[1];
ok('拖动时玻璃跟着指针走到下半段', ty > 120, 'y=' + ty);
h3.fireWin('pointerup', { clientX: 200, clientY: 410 });
h3.advance(500);
ok('松手吸附后派发了目标项 click（应用会切换）', h3.items.slice(1).some(function (it) { return it._clicked > 0; }),
    h3.items.map(function (it) { return it._clicked; }).join(','));
const finalY = +String(g3.style.transform).match(/translate3d\([^,]+,(-?[\d.]+)px/)[1];
ok('吸附终点仍在容器内', finalY >= -6 && finalY <= 500, 'y=' + finalY);
ok('拖动期间坐标始终局部（无窗口外大数）', Math.abs(finalY) < 600);

/* ---------------- 主壳契约 ---------------- */
section('主壳 · 抖动 / 新应用 / 开始菜单');
ok('_n26LgApply 用布局尺寸', /const lw = el\.offsetWidth \|\| 0, lh = el\.offsetHeight \|\| 0/.test(HTML));
ok('n26LgSync 用 offsetWidth 比对', /Math\.abs\(lw - el\._n26Lg\.w\) > 4/.test(HTML));
ok('旧的 n26LgUnscaled 已移除', !/n26LgUnscaled/.test(HTML));
ok('ResizeObserver 监听布局尺寸', /window\._n26LgRO = new ResizeObserver/.test(HTML));
ok('Dock 子节点监听仍是 subtree', /observe\(dock, \{ childList: true, subtree: true \}\)/.test(HTML));
/* v2.9.93：小型开始菜单改确定性 WAAPI（内联 animation:none 是刻意压制 CSS，
   让 WAAPI 独占 transform），并删掉 240ms 二次定位电源按钮。 */
ok('开始菜单用确定性 WAAPI 开合', /function n26SmAnimate\(menu, dir\)/.test(HTML) &&
    /n26SmAnimate\(menu, 'in'\)/.test(HTML) && /n26SmAnimate\(menu, 'out'\)/.test(HTML));
ok('电源按钮只按最终矩形定位一次', !/setTimeout\(placePowerBtn, 240\)/.test(HTML) &&
    /menu\.getBoundingClientRect\(\);\s*\/\/ 动画未开始 = 最终矩形/.test(HTML));
ok('CSS 戳 2979 / JS 戳 dn12', /n26-docknav\.css\?v=2979/.test(HTML) && /n26-docknav\.js\?v=dn12/.test(HTML));
for (const f of ['apps/games.html', 'apps/agent.html', 'apps/devstudio.html']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok(f + ' 戳同步', /n26-docknav\.css\?v=2979/.test(s) && /n26-docknav\.js\?v=dn12/.test(s));
}

/* ---------------- 结果 ---------------- */
console.log('\n============================================');
console.log('  PASS ' + pass + '   FAIL ' + fail);
console.log('============================================');
process.exit(fail ? 1 : 0);
