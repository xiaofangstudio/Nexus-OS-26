/* ============================================================
   verify-n26-295.js · v2.9.95「真他妈丝滑」纯 Node 验收
   ------------------------------------------------------------
   零浏览器 / 零 Edge / 零 Playwright。
   A 静态：版本、戳、选择器真值链、禁紫、语法、1s 定时器审计
   B 动态：vm 假 DOM + 虚拟时钟，逐帧驱动 n26-smooth.js
           （时基合并 / 读写分离 / 分片 / 去重 / 前后台 / 按需合成层）
   C 回归：v2.9.93/94 关键修复不被本轮改动破坏

   ★ 本轮最重要的守门是「选择器真值链」：小组件实际走 N26W2 渲染器
     （DOM 是 .nx-*），天气逐日是 .day-row/.day-hi/.day-lo。写错类名等于
     写死代码，用户 Ctrl+F5 看不到任何变化 —— 必须逐条断言命中真实 DOM。
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
const WEATHER = read('apps/weather.html');
const SMOOTH_JS = read('ui/n26-smooth.js');
const SMOOTH_CSS = read('ui/n26-smooth.css');
const WP_CSS = read('ui/n26-widget-polish.css');
const WX_CSS = read('ui/n26-weather-polish.css');
const GALLERY = read('ui/n26-widget-gallery.js');
const W2 = read('ui/n26-widgets-v2.js');
const W2CSS = read('ui/n26-widgets-v2.css');

/* ============================================================ */
section('A1 · 版本与资源戳');

ok('四个 v2.9.95 新模块全部落盘',
    ['ui/n26-smooth.js', 'ui/n26-smooth.css', 'ui/n26-widget-polish.css',
     'ui/n26-weather-polish.css'].every(has));
/* v2.9.96 起版本继续前进，只锁不低于 v2.9.95 基线 */
ok('版本号常量不低于 v2.9.95', /const NEXUS_OS_VERSION = 'v2\.(9\.9[0-9]|10\.\d+)';/.test(HTML));
/* 后续版本插到最前面，只锁 v2.9.95 仍在且顺序正确 */
ok('changelog 保留 v2.9.95 且顺序正确',
    HTML.indexOf('<div class="changelog-version">v2.9.95</div>') > 0 &&
    HTML.indexOf('<div class="changelog-version">v2.9.95</div>') <
    HTML.indexOf('<div class="changelog-version">v2.9.94</div>'));
ok('changelog 覆盖丝滑/小组件/天气三项',
    /真他妈丝滑/.test(HTML) && /时间 \/ 天气卡片重排/.test(HTML) && /天气应用视觉打磨/.test(HTML));

ok('丝滑引擎在所有业务脚本之前加载（head 第 8 行区）',
    /<title>[^<]*<\/title>\s*<!--[^>]*-->\s*<script src="ui\/n26-smooth\.js\?v=sm2"><\/script>/.test(HTML));
/* v2.9.96 起 CSS 戳继续前进（sm5…），只锁不低于 sm3 */
ok('丝滑 JS / CSS 戳各自同步（JS sm2、CSS ≥sm3）',
    /n26-smooth\.js\?v=sm2/.test(HTML) && /n26-smooth\.css\?v=sm[3-9]/.test(HTML));
ok('widget-polish 戳 wp2', /n26-widget-polish\.css\?v=wp2/.test(HTML));
ok('weather-polish 戳 wx2', /n26-weather-polish\.css\?v=wx2/.test(WEATHER));
/* v2.9.97 起 gallery 戳继续前进，只锁不低于 gal6 */
ok('gallery 戳不低于 gal6', /n26-widget-gallery\.js\?v=gal[6-9]/.test(HTML));
ok('资源戳无旧值残留（sm1 / wp1）',
    !/n26-smooth\.(js|css)\?v=sm1/.test(HTML) &&
    !/n26-widget-polish\.css\?v=wp1/.test(HTML) &&
    !/n26-weather-polish\.css\?v=wp1/.test(WEATHER));
ok('weather-polish 在 </head> 前最后加载',
    WEATHER.indexOf('n26-weather-polish.css') < WEATHER.indexOf('</head>') &&
    WEATHER.indexOf('n26-weather-polish.css') > WEATHER.lastIndexOf('</style>'));

/* ============================================================ */
section('A2 · 卡顿根因：分片 / 去重 / 降频');

ok('gallery.level1 不再同步逐张渲染（走 enqueue）',
    /N26Smooth\.enqueue\('wp:' \+ j\.id/.test(GALLERY) &&
    /if \(window\.N26Smooth\) \{[\s\S]{0,400}?jobs\.forEach\(function \(j\) \{ window\.N26Smooth\.enqueue/.test(GALLERY));
ok('gallery 保留了未加载引擎时的降级', /jobs\.forEach\(paintPreview\)/.test(GALLERY));
ok('gallery 重开面板时清旧任务 drop(wp:)', /N26Smooth\.drop\('wp:'\)/.test(GALLERY));
ok('主壳懒加载器改走 enqueue', /N26Smooth\.enqueue\('wp:' \+ id/.test(HTML));
ok('★ 宿主侧不再 drop（避免与 gallery 竞态互删任务）',
    !/if \(window\.N26Smooth\) \{ try \{ window\.N26Smooth\.drop\('wp:'\)/.test(HTML));
ok('key 用 widgetId 去重，两处同前缀',
    /enqueue\('wp:' \+ id/.test(HTML) && /enqueue\('wp:' \+ j\.id/.test(GALLERY));
ok('分片预算 6ms / 每帧 2 项', /PER_FRAME = 2/.test(SMOOTH_JS) && /BUDGET_MS = 6/.test(SMOOTH_JS));
ok('预览卡按 data-rendered 去重，不重复渲染',
    /dataset\.rendered === '1'/.test(GALLERY) && /dataset\.rendered === '1'/.test(HTML));
ok('折射兜底 2s → 6s', /setInterval\(n26LgRefresh, 6000\)/.test(HTML));
ok('面板补扫 2.5s → 5s', /setInterval\(sweep, 5000\)/.test(HTML));
ok('预览卡撤掉 backdrop-filter / 动画 / 多重阴影',
    /\.widget-preview-card\s*\{[^}]*backdrop-filter:\s*none\s*!important/s.test(SMOOTH_CSS) &&
    /\.widget-preview-card\s*\{[^}]*animation:\s*none\s*!important/s.test(SMOOTH_CSS) &&
    /\.widget-preview-card\s*\{[^}]*contain:\s*layout paint style/s.test(SMOOTH_CSS));
ok('★ 面板卡只用 contain: layout style（不能用 paint 裁掉浮层）',
    /\.widget-panel-card\s*\{[^}]*contain:\s*layout style;/s.test(SMOOTH_CSS) &&
    !/\.widget-panel-card\s*\{[^}]*contain:\s*layout paint style/s.test(SMOOTH_CSS));
ok('★ 按需合成层抓真实类名，不再空转',
    /LIFT_SEL = '\[data-n26-lift\], \.desktop-widget-card, \.widget-panel-card'/.test(SMOOTH_JS) &&
    /closest\(LIFT_SEL\)/.test(SMOOTH_JS) &&
    /\.desktop-widget-card:active/.test(SMOOTH_CSS));
ok('★ 拖动 / 缩放小组件强制 transition:none（不发粘）',
    /\.desktop-widget-card\.dragging,\s*html body \.desktop-widget-card\.widget-resizing\s*\{[^}]*transition:\s*none\s*!important/s.test(SMOOTH_CSS));
ok('★ 面板卡不改 transform（不污染 gallery 的 FLIP 矩形测量）',
    !/\.widget-panel-card:active\s*\{[^}]*transform:/s.test(SMOOTH_CSS));
ok('reduced-motion 一帧到位', /prefers-reduced-motion/.test(SMOOTH_CSS) && /prefers-reduced-motion/.test(WX_CSS));

/* ============================================================ */
section('A3 · 选择器真值链（★ 防「假美化」）');

const realW2 = ['nx-hero', 'nx-colon', 'nx-wx-temp', 'nx-wx-temp-sm', 'nx-wx-city',
                'nx-wx-chip', 'nx-wx-kv', 'nx-wx-cell', 'nx-wx-hour', 'nx-wx-day',
                'nx-clk-sec', 'nx-clk-kv', 'nx-clk-day', 'nx-sub', 'nx-hd-sub'];
realW2.forEach(function (cls) {
    ok('widgets-v2.js 真实存在 .' + cls, W2.indexOf('class="' + cls) >= 0 ||
        W2.indexOf(cls + '"') >= 0 || W2.indexOf(cls + ' ') >= 0);
});
['nx-wx-temp', 'nx-colon', 'nx-wx-kv b', 'nx-clk-sec b', 'nx-wx-temp-sm', 'nx-wx-chip'].forEach(function (sel) {
    ok('widget-polish 命中真实选择器 ' + sel, WP_CSS.indexOf(sel) >= 0);
});
ok('widget-polish 同时保留 fallback 旧 DOM 类名',
    /widget-clock-date/.test(WP_CSS) && /widget-weather-temp/.test(WP_CSS));
ok('★ 时钟槽位锁住 v2 的 .nx-colon 与旧 DOM 的 .colon',
    /\.widget-clock-time \.nx-colon/.test(WP_CSS) && /\.widget-clock-time \.colon/.test(WP_CSS));
ok('★ 不再把深玻璃上的时间/温度改成深色墨字',
    !/rgba\(16,\s*28,\s*44/.test(WP_CSS) && !/--n26-wp-ink/.test(WP_CSS));
ok('★ 颜色交给 --w-text-* 变量，widget-polish 一行 color 都不写',
    !/^\s*color\s*:/m.test(WP_CSS));
ok('深色模式只加强柔光，不改字色',
    /body\.dark-mode:not\(\.style-skeuomorphic\)/.test(WP_CSS) &&
    /text-shadow:[^;]*!important/.test(WP_CSS));
ok('拟物风格被排除（保留琥珀字特色）',
    /:not\(\.style-skeuomorphic\)/.test(WP_CSS));
ok('数字统一 tabular-nums + 2ch 固定槽位',
    /tabular-nums lining-nums/.test(WP_CSS) && /min-width:\s*2ch/.test(WP_CSS));

['wx-card', 'card-head h2', 'card-note', 'hero-temp', 'tempNum', 'hero-cond',
 'hero-range b', 'hero-icon::before', 'chip', 'hour-bg', 'h-temp', 'h-time',
 'h-pop', 'tb-btn', 'city-btn'].forEach(function (sel) {
    ok('weather.html 真实存在 ' + sel, WEATHER.indexOf(sel) >= 0);
});
ok('weather-polish 已删死选择器 .d-day / .d-temp',
    !/\.d-day\b/.test(WX_CSS) && !/\.d-temp\b/.test(WX_CSS));
ok('weather-polish 改用真实逐日类名',
    /\.day-name/.test(WX_CSS) && /\.day-lo/.test(WX_CSS) &&
    /\.day-hi/.test(WX_CSS) && /\.day-extra/.test(WX_CSS));
['day-name', 'day-lo', 'day-hi', 'day-extra', 'day-row'].forEach(function (cls) {
    ok('weather.html 真实存在 .' + cls, WEATHER.indexOf(cls) >= 0);
});
ok('天气温度 9°→10° 不推挤度符号', /#tempNum\s*\{[^}]*min-width:\s*2ch/s.test(WX_CSS));
ok('当前时段用已有 --wx-accent-line / soft 变量',
    /var\(--wx-accent-line\)/.test(WX_CSS) && /var\(--wx-accent-soft\)/.test(WX_CSS) &&
    /--wx-accent-line:/.test(WEATHER) && /--wx-accent-soft:/.test(WEATHER));
ok('★ 不覆盖祖先 filter（发光铁律：filter 会新建 backdrop root）',
    !/filter:\s*blur\([^)]*\)\s*!important/.test(WX_CSS) &&
    /绝不覆盖 filter/.test(WX_CSS));
ok('天气动效只碰 transform / box-shadow / background',
    /transition:[^;]*transform/s.test(WX_CSS) && !/transition:[^;]*\bwidth\b/s.test(WX_CSS));
ok('wx-card 不引入二次 backdrop-filter', !/backdrop-filter:\s*blur/.test(WX_CSS));

/* ============================================================ */
section('A4 · 1s 定时器审计 / 语法 / 禁紫');

const tickCalls = (HTML.match(/setInterval\([^,]+,\s*1000\)/g) || []);
ok('主壳约 1s 定时器已逐处审计（≥8 个时钟类）', tickCalls.length >= 8,
    'found ' + tickCalls.length);
ok('合并区间严格限定 900–1100ms', /ms >= 900 && ms <= 1100/.test(SMOOTH_JS));
ok('带额外参数 / 非函数 / 非时钟一律原样放行',
    /arguments\.length <= 2/.test(SMOOTH_JS) && /typeof fn === 'function'/.test(SMOOTH_JS) &&
    /origSetInterval\.apply\(window, arguments\)/.test(SMOOTH_JS));
ok('提供逃生口 __N26_NO_TICK_MERGE__', /__N26_NO_TICK_MERGE__/.test(SMOOTH_JS));
ok('visibilitychange 回前台补一拍', /visibilitychange/.test(SMOOTH_JS) && /hiddenPending/.test(SMOOTH_JS));
ok('统一缓动令牌 JS 与 CSS 同源',
    ['--n26-ease-out', '--n26-ease-in-out', '--n26-ease-spring'].every(function (v) {
        return SMOOTH_JS.indexOf(v) >= 0 && SMOOTH_CSS.indexOf(v) >= 0;
    }));

['ui/n26-smooth.js', 'ui/n26-widget-gallery.js'].forEach(function (f) {
    let good = true, err = '';
    try { new vm.Script(read(f), { filename: f }); } catch (e) { good = false; err = e.message; }
    ok(f + ' 语法可编译', good, err);
});
let inlineOK = true, inlineN = 0, inlineErr = '';
const reScript = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = reScript.exec(HTML))) {
    const body = m[1].trim();
    if (!body || /^\/\*[\s\S]*\*\/$/.test(body)) continue;
    inlineN++;
    try { new vm.Script(body, { filename: 'inline#' + inlineN }); }
    catch (e) { inlineOK = false; inlineErr += '#' + inlineN + ':' + e.message + ' '; }
}
ok('主壳 ' + inlineN + ' 段内联脚本语法 0 失败', inlineOK, inlineErr);

const changed = [SMOOTH_JS, SMOOTH_CSS, WP_CSS, WX_CSS, GALLERY];
ok('本轮改动源码零紫（键名除外）',
    changed.every(s => !/purple|#8b5cf6|#a855f7|#7c3aed|#6d28d9|#9d4edd|rgba\(\s*139\s*,\s*92\s*,\s*246|rgba\(\s*168\s*,\s*85\s*,\s*247/i.test(s)));

/* ============================================================ */
section('B · vm 假 DOM + 虚拟时钟（n26-smooth.js 逐帧）');

/* ---- 假 DOM 脚手架 ---- */
let clock = 0;
let timerSeq = 0, rafSeq = 0;
const timers = Object.create(null);
const rafQ = [];
const docEvents = Object.create(null);
const winEvents = Object.create(null);
const rootStyle = { vars: Object.create(null), setProperty(k, v) { this.vars[k] = v; } };
const fakeEl = { style: { willChange: '' }, closest: null };

function origSetInterval(fn, ms) {
    const id = ++timerSeq;
    timers[id] = { fn: fn, ms: ms, next: clock + ms };
    return id;
}
function origClearInterval(id) { delete timers[id]; }
function reqRAF(fn) { const id = ++rafSeq; rafQ.push({ id: id, fn: fn }); return id; }
function cancelRAF(id) { for (let i = rafQ.length - 1; i >= 0; i--) if (rafQ[i].id === id) rafQ.splice(i, 1); }
function flushFrames(n) {
    for (let i = 0; i < (n || 1); i++) {
        const batch = rafQ.splice(0, rafQ.length);
        clock += 16;
        batch.forEach(function (r) { r.fn(clock); });
    }
}
function advance(ms) {
    clock += ms;
    Object.keys(timers).forEach(function (id) {
        const t = timers[id];
        while (t && t.next <= clock && timers[id]) {
            t.next += t.ms;
            try { t.fn(); } catch (e) { }
        }
    });
    flushFrames(4);
}

const sandbox = {
    console: console,
    performance: { now: function () { return clock; } },
    Date: Date,
    setTimeout: function () { return 0; },
    clearTimeout: function () { },
    setInterval: origSetInterval,
    clearInterval: origClearInterval,
    requestAnimationFrame: reqRAF,
    cancelAnimationFrame: cancelRAF,
    matchMedia: function () { return { matches: false }; },
    addEventListener: function (n, fn) { (winEvents[n] = winEvents[n] || []).push(fn); },
    document: {
        hidden: false,
        documentElement: { style: rootStyle },
        addEventListener: function (n, fn) { (docEvents[n] = docEvents[n] || []).push(fn); }
    }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
let bootOK = true, bootErr = '';
try { vm.runInContext(SMOOTH_JS, sandbox, { filename: 'ui/n26-smooth.js' }); }
catch (e) { bootOK = false; bootErr = e.message; }
ok('丝滑引擎在假 DOM 中无异常启动', bootOK, bootErr);
ok('暴露 window.N26Smooth 且版本正确',
    !!sandbox.N26Smooth && sandbox.N26Smooth.version === '1.0-2.9.95');
ok('三个缓动令牌已写入 documentElement.style',
    rootStyle.vars['--n26-ease-out'] === 'cubic-bezier(0.16, 1, 0.3, 1)' &&
    !!rootStyle.vars['--n26-ease-in-out'] && !!rootStyle.vars['--n26-ease-spring']);

/* ---- ① 统一 1s 时基 ---- */
ok('window.setInterval 已被接管', sandbox.setInterval !== origSetInterval);
const hits = [0, 0, 0, 0, 0, 0, 0, 0];
const subs = [];
for (let i = 0; i < 8; i++) {
    (function (k) {
        subs.push(sandbox.setInterval(function () { hits[k]++; }, 1000));
    })(i);
}
ok('8 个 1s 订阅只创建 1 个真实定时器', Object.keys(timers).length === 1,
    'timers=' + Object.keys(timers).length);
advance(1000);
ok('一拍内 8 个时钟回调全部执行', hits.every(function (h) { return h === 1; }),
    hits.join(','));
advance(1000);
ok('第二拍继续按 1s 触发', hits.every(function (h) { return h === 2; }));

const beforeOther = Object.keys(timers).length;
const slowId = sandbox.setInterval(function () { }, 5000);
const fastId = sandbox.setInterval(function () { }, 200);
const argId = sandbox.setInterval(function () { }, 1000, 'extra');
ok('非 1s 定时器与带参定时器一律原样放行',
    Object.keys(timers).length === beforeOther + 3);
ok('放行分支返回的是真实定时器 id',
    [slowId, fastId, argId].every(id => timers[id]));
sandbox.clearInterval(slowId); sandbox.clearInterval(fastId); sandbox.clearInterval(argId);

sandbox.__N26_NO_TICK_MERGE__ = true;
const escapeId = sandbox.setInterval(function () { }, 1000);
ok('逃生口生效：关闭合并后走真实定时器', !!timers[escapeId]);
sandbox.clearInterval(escapeId);
sandbox.__N26_NO_TICK_MERGE__ = false;

/* ---- ② 读写分离 ---- */
const order = [];
sandbox.N26Smooth.write(function () { order.push('W1'); });
sandbox.N26Smooth.read(function () { order.push('R1'); });
sandbox.N26Smooth.write(function () { order.push('W2'); });
sandbox.N26Smooth.read(function () { order.push('R2'); });
flushFrames(1);
ok('同帧先读后写，杜绝 layout thrashing',
    order.join(',') === 'R1,R2,W1,W2', order.join(','));

/* ---- ③ 长任务分片 / 去重 / drop ---- */
const painted = [];
for (let i = 0; i < 19; i++) {
    (function (k) { sandbox.N26Smooth.enqueue('wp:w' + k, function () { painted.push(k); }); })(i);
}
ok('19 个任务全部入队', sandbox.N26Smooth.stats().pending === 19);
flushFrames(1);
const afterOne = painted.length;
ok('★ 单帧最多执行 2 项（不再同帧炸主线程）', afterOne === 2, 'painted=' + afterOne);
flushFrames(12);
ok('分帧后 19 项全部完成', painted.length === 19 && sandbox.N26Smooth.stats().pending === 0,
    'painted=' + painted.length);
let dup = 0;
sandbox.N26Smooth.enqueue('wp:same', function () { dup++; });
sandbox.N26Smooth.enqueue('wp:same', function () { dup++; });
flushFrames(2);
ok('同 key 只渲染一次（与懒加载器去重）', dup === 1, 'dup=' + dup);
let kept = 0, dropped = 0;
sandbox.N26Smooth.enqueue('wp:gone', function () { dropped++; });
sandbox.N26Smooth.enqueue('other:keep', function () { kept++; });
sandbox.N26Smooth.drop('wp:');
flushFrames(2);
ok('drop(wp:) 只清指定前缀，不误伤其它任务', dropped === 0 && kept === 1);

/* ---- ④ 页面隐藏暂停 / 回前台补拍 ---- */
hits.fill(0);
sandbox.document.hidden = true;
advance(1000);
ok('页面隐藏时装饰 tick 暂停', hits.every(function (h) { return h === 0; }), hits.join(','));
sandbox.document.hidden = false;
(docEvents['visibilitychange'] || []).forEach(function (fn) { fn(); });
flushFrames(2);
ok('回前台立刻补一拍（锁屏回来时钟不旧）', hits.every(function (h) { return h === 1; }),
    hits.join(','));

/* ---- ⑤ 按需合成层 ---- */
fakeEl.closest = function () { return fakeEl; };
fakeEl.style.willChange = '';
(docEvents['pointerdown'] || []).forEach(function (fn) {
    fn({ target: { closest: function () { return fakeEl; } } });
});
ok('pointerdown 瞬间提升合成层', fakeEl.style.willChange === 'transform');
(winEvents['pointerup'] || []).forEach(function (fn) { fn(); });
flushFrames(1);
ok('松手立即撤掉 will-change（不常驻吃 GPU）', fakeEl.style.willChange === '');

/* ---- ⑥ clearInterval 与统计 ---- */
subs.forEach(function (s) { sandbox.clearInterval(s); });
ok('全部订阅清除后共享定时器被回收', Object.keys(timers).length === 0);
const st = sandbox.N26Smooth.stats();
ok('stats() 字段完整且 merged 计数正确',
    st.merged >= 8 && typeof st.ticks === 'number' && typeof st.chunks === 'number' &&
    typeof st.pending === 'number' && st.shared === false);

/* ============================================================ */
section('C · v2.9.93/94 关键回归（本轮未破坏）');

ok('防刷新守门仍按来源裁决，参数滑杆不被短路',
    /opts\.light === true/.test(read('ui/n26-no-reload.js')) &&
    !/sig === lastGlassSig/.test(read('ui/n26-no-reload.js')));
ok('玻璃广播仍发全量 8 参数', /live: true/.test(HTML) && /N26_GLASS_DEFAULTS/.test(HTML));
ok('侧边 Dock 玻璃仍常驻', /n26-dng-persistent/.test(read('ui/n26-docknav.js')));
ok('开关拖动判定仍在', /beginDrag\(/.test(read('ui/n26-switch.js')));
ok('滚动惯性仍用 clamp 不过冲', /clamp\(/.test(read('ui/n26-gestures.js')));
ok('新窗口仍挂 opening', /classList\.add\('opening'\)/.test(HTML));
/* changelog 里保留历史说明文字是合理的，只查真实资源引用路径与文件本身 */
ok('弥散壁纸没有回流（真实资源引用为 0）',
    !/\.\.\/Wallpaper\/抽象风格\/n26-aurora-mist\.png/.test(HTML) &&
    !fs.existsSync(path.join(ROOT, '..', 'Wallpaper', '抽象风格', 'n26-aurora-mist.png')));
ok('小开始菜单距离保持 100px', /#startMenu[^}]*bottom:\s*100px/s.test(HTML) || /bottom:\s*100px/.test(HTML));
ok('显式重启仍需授权', /n26AllowReboot\(\)/.test(HTML));
ok('首屏构建动画仍下线（无 armed 预隐藏挂载）',
    !/<script[^>]*n26-firstboot\.js/.test(HTML));

console.log('\n============================================');
console.log('  PASS ' + PASS + '   FAIL ' + FAIL);
console.log('  纯 Node 静态 + vm 假 DOM 虚拟时钟逐帧 · 未启动任何浏览器');
console.log('============================================');
process.exit(FAIL ? 1 : 0);
