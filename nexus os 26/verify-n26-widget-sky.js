/* verify-n26-widget-sky.js · 小组件「天空」层守门自检（纯 Node，不启动任何浏览器）
 * ---------------------------------------------------------------------------
 * 覆盖：默认四张布局（网格 col/row + 无碰撞 + 仅空列表铺）、
 *       6 档时段状态机、NOAA 真实日出日落、素材零 404、
 *       时钟尺寸放开、天空层不抢 ::before/::after、主壳挂载契约、全面禁紫。
 *
 * 用法：cd "nexus os 26/nexus os 26" && node verify-n26-widget-sky.js
 * 约束：绝不 require('playwright') / 拉起 Edge（用户上网课期间硬性禁令）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const HTML = path.join(ROOT, 'Nexus OS 26.html');
const P = {
    js: path.join(ROOT, 'ui', 'n26-widget-sky.js'),
    bg: path.join(ROOT, 'ui', 'n26-widget-sky-bg.js'),
    css: path.join(ROOT, 'ui', 'n26-widget-sky.css')
};
const H = fs.readFileSync(HTML, 'utf8');
const JS = fs.readFileSync(P.js, 'utf8');
const BG = fs.readFileSync(P.bg, 'utf8');
const CSS = fs.readFileSync(P.css, 'utf8');

let fail = 0;
function ok(label, cond, extra) {
    console.log((cond ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
    if (!cond) fail++;
}
function codeOnly(s) {
    return s.replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const jCode = codeOnly(JS), cCode = codeOnly(CSS), hCode = codeOnly(H);

console.log('=== 小组件「天空」层守门自检（纯 Node / 零浏览器）===');

/* ---------- ① 文件与语法 ---------- */
console.log('\n[1] 文件与语法');
Object.keys(P).forEach(k => ok('新模块存在：ui/' + path.basename(P[k]), fs.existsSync(P[k])));
[JS, BG].forEach((src, i) => {
    let good = true, err = '';
    try { new vm.Script(src, { filename: ['sky.js', 'sky-bg.js'][i] }); }
    catch (e) { good = false; err = String(e.message).slice(0, 90); }
    ok(['ui/n26-widget-sky.js', 'ui/n26-widget-sky-bg.js'][i] + ' 语法可编译', good, err);
});

/* ---------- ② 在 mock 沙箱里真跑模块逻辑 ---------- */
console.log('\n[2] 模块逻辑（vm 沙箱真跑，无 DOM / 无网络）');
const SIZES = {
    clock: [{ cols: 2, rows: 2 }, { cols: 4, rows: 2 }, { cols: 4, rows: 4 }],
    calendar: [{ cols: 4, rows: 2 }, { cols: 4, rows: 4 }],
    dualtime: [{ cols: 4, rows: 2 }],
    weather: [{ cols: 4, rows: 2 }]
};
function makeSandbox(seed) {
    const store = Object.assign({}, seed || {});
    const win = {};
    const noopObserver = function () { this.observe = function () { }; this.disconnect = function () { }; };
    const doc = {
        getElementById: () => null,          // deskReady() 恒 false → boot 不执行、无隐藏类
        querySelectorAll: () => [],
        addEventListener: () => { },
        hidden: false,
        body: { classList: { add() { }, remove() { } } }
    };
    const ctx = {
        window: win, document: doc, console,
        getComputedStyle: () => ({ display: 'none' }),
        getUserLS: k => store[k],
        setUserLS: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); },
        renderDesktopWidgets: () => { },
        n26WidgetSizes: t => SIZES[t] || [{ cols: 2, rows: 2 }],
        n26Metrics: () => ({ pitch: 92, marginX: 28, marginTop: 28, gap: 16 }),
        n26CellToPx: (m, col, row, cols, rows) => ({
            x: m.marginX + col * m.pitch, y: m.marginTop + row * m.pitch,
            w: cols * m.pitch - 16, h: rows * m.pitch - 16
        }),
        N26_WIDGET_SPECS: { clock: { fixed: true, size: [2, 2] } },
        MutationObserver: noopObserver,
        setTimeout: () => 0, clearTimeout: () => { }, setInterval: () => 0,
        Date, Math, JSON, isFinite
    };
    vm.createContext(ctx);
    vm.runInContext(BG, ctx, { filename: 'sky-bg.js' });
    vm.runInContext(JS, ctx, { filename: 'sky.js' });
    return { ctx, win, store };
}
const S = makeSandbox();
const API = S.win.N26WidgetSky;
ok('window.N26WidgetSky 已暴露', !!API && typeof API.apply === 'function');
ok('默认四张类型正确',
    API && JSON.stringify(API.defaults()) === JSON.stringify(['clock', 'calendar', 'dualtime', 'weather']),
    API ? API.defaults().join(' / ') : '');

/* 默认布局：铺 / 不覆盖 / 网格坐标 / 无碰撞 */
let laid = API ? API.ensureDefault() : false;
const arr = S.store.desktopWidgets || [];
ok('空列表时铺下默认布局', laid === true && arr.length === 4, '实际 ' + arr.length + ' 张');
ok('四张都写的是 col/row 网格坐标（不是裸像素）',
    arr.length === 4 && arr.every(w => Number.isInteger(w.col) && Number.isInteger(w.row)));
ok('四张都从主壳白名单取尺寸（2×2 / 4×2 / 4×2 / 4×2）',
    arr.length === 4 && arr.map(w => w.cols + '×' + w.rows).join(' ') === '2×2 4×2 4×2 4×2',
    arr.map(w => w.cols + '×' + w.rows).join(' '));
ok('像素位置由 n26CellToPx 换算（x/y 与 col/row 一致）',
    arr.length === 4 && arr.every(w => w.x === 28 + w.col * 92 && w.y === 28 + w.row * 92));
function overlap(a, b) {
    return a.col < b.col + b.cols && b.col < a.col + a.cols &&
        a.row < b.row + b.rows && b.row < a.row + a.rows;
}
let collide = false;
for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) if (overlap(arr[i], arr[j])) collide = true;
ok('四张互不重叠（不会被 n26NormalizeLayout 挪位）', !collide);
ok('布局形态 = 左列竖排 + 日历贴时钟右侧',
    arr.length === 4 && arr[0].col === 0 && arr[0].row === 0 &&
    arr[1].col === 2 && arr[1].row === 0 &&
    arr[2].col === 0 && arr[2].row > arr[0].row &&
    arr[3].col === 0 && arr[3].row > arr[2].row);
ok('已有布局时绝不覆盖（仅首次/空列表铺）', API.ensureDefault() === false);
const S2 = makeSandbox({ desktopWidgets: [{ id: 9, type: 'note', cols: 2, rows: 2, col: 1, row: 1 }] });
ok('用户自己摆过后不铺默认（换沙箱复验）',
    S2.win.N26WidgetSky.ensureDefault() === false &&
    S2.store.desktopWidgets.length === 1 && S2.store.desktopWidgets[0].type === 'note');

/* ---------- ③ 真实日出日落 + 6 档状态机 ---------- */
console.log('\n[3] 真实日出日落 + 6 档时段');
const summer = API.solarSun(22.5431, 114.0579, new Date(2026, 5, 21, 12));  // 夏至 · 深圳
const winter = API.solarSun(22.5431, 114.0579, new Date(2026, 11, 21, 12)); // 冬至 · 深圳
ok('NOAA 简化公式能算出日出日落', !!summer && !!winter && /^\d{2}:\d{2}$/.test(summer.rise),
    summer ? '夏至 ' + summer.rise + '–' + summer.set : '');
const dayLen = s => {
    const p = s.set.split(':').map(Number), q = s.rise.split(':').map(Number);
    return (p[0] * 60 + p[1]) - (q[0] * 60 + q[1]);
};
ok('白昼随季节真实变化（夏至长于冬至，不是写死钟点）',
    !!summer && !!winter && dayLen(summer) > dayLen(winter) + 60,
    summer && winter ? '夏至 ' + dayLen(summer) + ' 分 / 冬至 ' + dayLen(winter) + ' 分' : '');
const dayset = API.skyData();
ok('无网络时降级到 solar 日出日落（不写死 06:00/18:30）',
    dayset.source === 'solar' && dayset.sunrise !== '06:00',
    dayset.source + ' ' + dayset.sunrise + '–' + dayset.sunset);

const PHASES = ['night', 'sunrise', 'morning', 'noon', 'golden', 'sunset'];
const seen = new Set();
const seq = [];
let bad = [];
for (let m = 0; m < 1440; m++) {
    const t = new Date(2026, 10, 7, Math.floor(m / 60), m % 60).getTime();
    const ph = API.phase(t);
    if (PHASES.indexOf(ph) < 0) bad.push(m + ':' + ph);
    seen.add(ph);
    if (seq[seq.length - 1] !== ph) seq.push(ph);
}
/* 从 0:00 起：夜晚在首尾各占一段（跨午夜），中间五档顺序推进，共 7 段 */
const EXPECT = ['night', 'sunrise', 'morning', 'noon', 'golden', 'sunset', 'night'];
ok('全天 1440 分钟每档都合法（无 undefined / 空档）', bad.length === 0, bad.slice(0, 3).join(','));
ok('6 档全部出现', PHASES.every(p => seen.has(p)), [...seen].join(' / '));
ok('时段严格单向推进、无来回跳档（夜晚跨午夜首尾各一段）',
    JSON.stringify(seq) === JSON.stringify(EXPECT), seq.join(' → '));
ok('黄金时分窗口随白昼伸缩且夹在 40–90 分',
    (() => {
        const w = API.sunWindow();
        return w.golden >= 40 && w.golden <= 90 && w.b > w.a && w.noon > w.a && w.noon < w.b;
    })());

/* ---------- ④ 素材零 404 ---------- */
console.log('\n[4] 天气素材映射零 404');
const BGDIR = path.resolve(ROOT, '..', '天气素材', '天气', 'OPPO天气', '天气背景');
ok('素材目录存在', fs.existsSync(BGDIR), BGDIR);
const table = S.win.N26_SKY_BG || {}, fb = S.win.N26_SKY_FALLBACK || {};
const allFiles = new Set();
Object.keys(table).forEach(c => PHASES.forEach(p => { if (table[c][p]) allFiles.add(table[c][p]); }));
PHASES.forEach(p => { if (fb[p]) allFiles.add(fb[p]); });
const missing = [...allFiles].filter(f => !fs.existsSync(path.join(BGDIR, f)));
ok('映射表覆盖 ' + Object.keys(table).length + ' 种天气 × 6 时段，共 ' + allFiles.size + ' 张图',
    Object.keys(table).length >= 10 && PHASES.every(p => !!fb[p]));
ok('所有被引用的素材文件真实存在（零 404）', missing.length === 0, missing.slice(0, 4).join(', '));
ok('每种缺档都有 sunny 兜底', PHASES.every(p => !!fb[p]));
ok('素材路径与主壳 HTML 相对位置一致', (S.win.N26_SKY_BG_BASE || '').startsWith('../天气素材/'));

/* ---------- ⑤ 主壳契约 ---------- */
console.log('\n[5] 主壳契约与样式层');
const mounts = [
    /<link rel="stylesheet" href="ui\/n26-widget-sky\.css\?v=sky\d">/,
    /<script src="ui\/n26-widget-sky-bg\.js\?v=sky\d"><\/script>/,
    /<script src="ui\/n26-widget-sky\.js\?v=sky\d"><\/script>/
];
ok('主壳只挂 3 行（CSS + 映射 + 逻辑）', mounts.every(r => r.test(H)));
const stamps = [...H.matchAll(/n26-widget-sky[^"']*\?v=(sky\d)/g)].map(m => m[1]);
ok('三行版本戳一致', stamps.length === 3 && new Set(stamps).size === 1, stamps.join(','));
ok('加载顺序：映射表在逻辑之前',
    H.indexOf('n26-widget-sky-bg.js') < H.indexOf('n26-widget-sky.js'));
ok('时钟尺寸运行时放开三档（时间可变大）',
    /N26_WIDGET_SPECS\.clock\s*=\s*\{\s*sizes:\s*\[\[2,\s*2\],\s*\[4,\s*2\],\s*\[4,\s*4\]\]/.test(jCode) &&
    jCode.indexOf('N26_WIDGET_SPECS.clock') < jCode.indexOf('ensureDefault();\n        apply();'));
ok('仅空列表铺的守卫存在', /Array\.isArray\(cur\)\s*&&\s*cur\.length\)\s*return false/.test(jCode));
ok('天空层限定在 #desktopWidgets（不污染 OOBE 预览）',
    /getElementById\('desktopWidgets'\)/.test(jCode) && /layerRoot\.querySelectorAll/.test(jCode));
/* 只匹配「卡片自身」的伪元素（属性选择器 / 类名可串联，但不许跨 > 或后代空格），
   否则会把 .n26-sky-layer::after 误判成卡片的 ::after */
ok('背景层用真实子 div，不新建卡片伪元素 content 层',
    !/\.desktop-widget-card(?:\[[^\]]*\]|\.[\w-]+)*::(?:before|after)\s*\{[^}]*content\s*:/.test(cCode));
ok('CSS 消费 --sky-bg / --sky-tint',
    /var\(--sky-bg\)/.test(cCode) && /var\(--sky-tint\)/.test(cCode));
ok('天气卡头部信息已多 → 隐藏时段角标，避免拥挤',
    /data-wtype="weather"[^\n{]*\.n26-sky-tag\s*\{\s*display:\s*none/.test(cCode));
ok('日出日落详情只在 M/L 档显示',
    /\.n26-sky-sun\s*\{\s*display:\s*none/.test(cCode) &&
    /wsize-m[^\n]*\.n26-sky-sun/.test(cCode) && /wsize-l[^\n]*\.n26-sky-sun/.test(cCode));
ok('有 reduced-motion 降级', /prefers-reduced-motion:\s*reduce/.test(cCode));

/* ---------- ⑥ 全面禁紫 ---------- */
console.log('\n[6] 全面禁紫');
const PURPLE = /#(?:8b5cf6|a855f7|7c3aed|6d28d9|9333ea|c084fc|d8b4fe|9d4edd|7b2cbf|6366f1|800080|4b0082)\b|\bpurple\b|\bviolet\b|\bmagenta\b/i;
[['sky.js', jCode], ['sky-bg.js', codeOnly(BG)], ['sky.css', cCode]].forEach(([n, s]) => {
    const hit = s.match(PURPLE);
    ok(n + ' 无紫色值 / 紫英文词', !hit, hit ? hit[0] : '');
});
ok('挂载区注释也不引入紫', !PURPLE.test(H.slice(H.indexOf('n26-widget-sky.css'))));

/* ---------- ⑦ 主壳内联脚本语法未被挂载破坏 ---------- */
console.log('\n[7] 主壳内联脚本语法');
const inline = [...H.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(m => !/\btype\s*=\s*["'](?!text\/javascript|module|application\/ecmascript)/i.test(m[1]));
let syntaxErr = [];
inline.forEach((m, i) => {
    try { new vm.Script(m[2], { filename: 'inline#' + i }); }
    catch (e) { syntaxErr.push('#' + i + ' ' + String(e.message).slice(0, 70)); }
});
ok('全部 ' + inline.length + ' 段内联脚本语法可编译', syntaxErr.length === 0, syntaxErr.slice(0, 3).join(' | '));

console.log('\n=== ' + (fail === 0 ? '全部通过' : fail + ' 项失败') +
    ' · 未启动任何浏览器（Edge 驱动测试已禁用）===');
process.exitCode = fail ? 1 : 0;
