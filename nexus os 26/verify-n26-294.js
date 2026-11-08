/* ============================================================
   verify-n26-294.js · v2.9.94 纯 Node 验收（零浏览器 / 零 Edge）
   ------------------------------------------------------------
   用户本轮六条指认，逐条落成可验证断言：
     ① 「这些参数全部都失效了」     → 守门不再短路滑杆 / 广播发全量 8 参数
     ② 「气泡突然出现又突然消失」   → 侧边玻璃常驻可见
     ③ 「大塑料块子 / 没有折射」     → 0.08 白底 + 0.25px 微模糊折射链
     ④ 「色散不是变成红光」         → 边缘环掩膜裁剪，中心保持基准折射
     ⑤ 「开关液态玻璃要能拖动」     → 拖动阈值 / 靠边判定 / 不重播动效
     ⑥ 「往下滑太快会往回滚」       → 外部位置同步 / 惯性不过冲 / 接管让位
   动态部分用 vm 假 DOM + 虚拟时钟逐帧驱动，不启动任何浏览器。
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
function section(t) { console.log('\n-- ' + t + ' ------------------------------'); }

const HTML = read('Nexus OS 26.html');
const NR = read('ui/n26-no-reload.js');
const APPJS = read('apps/_app.js');
const DOCKCSS = read('ui/n26-docknav.css');
const DOCKJS = read('ui/n26-docknav.js');
const SWJS = read('ui/n26-switch.js');
const SWCSS = read('ui/n26-switch.css');
const GEST = read('ui/n26-gestures.js');
const POLISH = read('apps/_polish.css');

/* ---------------------------------------------------------- */
section('A · 参数全部失效：静态根因');

ok('守门旧判据 sig === lastGlassSig 已彻底移除', !/sig === lastGlassSig/.test(NR));
ok('守门按调用来源裁决：light / force 一律放行',
    /opts\.light === true/.test(NR) && /opts\.force/.test(NR));
ok('守门只在开关点击窗口内短路', /__N26_SWITCH_CLICK__ && Date\.now\(\) < clickUntil/.test(NR));
ok('glassSig 保留但只作自检，不参与裁决', /function glassSig\(\)/.test(NR) && /getSig:/.test(NR));

const payloadMatch = HTML.match(/var payload = \{ material: g\.material, live: true \}/);
ok('宿主广播改为 live:true 全量载荷', !!payloadMatch);
ok('广播遍历 N26_GLASS_DEFAULTS 八参数',
    /Object\.keys\(N26_GLASS_DEFAULTS\)\.forEach\(function \(k\) \{ payload\[k\] = g\[k\]; \}\)/.test(HTML));
ok('广播不再只发 material + blur', !/name: 'glass', data: \{ material: g\.material, blur: px \}/.test(HTML));
ok('_app.js 优先消费 live 全量，不再无条件回读父窗口',
    /g\.live === true && typeof g\.opacity === 'number'/.test(APPJS) &&
    /var live = full \? g : \(readHostGlass\(\) \|\| g\)/.test(APPJS));
ok('_app.js 把 radius / dispersion 写进 CSS 真值链',
    /var radius = _clamp\(g\.radius, 6, 26, 14\)/.test(APPJS) &&
    /var disp = liquid \? _clamp\(g\.dispersion, 0, 20, 0\)/.test(APPJS) &&
    /setProperty\('--n26-ui-radius', radius \+ 'px'\)/.test(APPJS) &&
    /setProperty\('--n26-disp', String\(disp\)\)/.test(APPJS));
ok('_app.js 补上 --n26-lg-blur（与宿主同一映射）',
    /setProperty\('--n26-lg-blur'/.test(APPJS));
ok('readHostGlass 也补 radius / dispersion',
    /radius: num\('--n26-ui-radius', 14\)/.test(APPJS) &&
    /dispersion: num\('--n26-disp', 0\)/.test(APPJS));
ok('_currentGlass 带回 radius / dispersion',
    /radius: radius, refraction: refr, dispersion: disp, noise: noise/.test(APPJS));
ok('iframe 侧栏白名单确实消费 alpha / blur / sat / hi',
    /--n26-glass-alpha/.test(POLISH) && /--n26-blur/.test(POLISH) &&
    /--n26-glass-sat/.test(POLISH) && /--n26-glass-hi/.test(POLISH));

/* ---------------------------------------------------------- */
section('B · 防刷新守门：vm 假 DOM 动态裁决');

(function () {
    let clock = 10000;
    const timers = [];
    const listeners = {};
    const styleStore = {};
    const de = {
        style: {
            getPropertyValue: k => styleStore[k] || '',
            setProperty: (k, v) => { styleStore[k] = v; }
        }
    };
    const body = {
        className: 'mat-liquid',
        classList: { remove() {}, add() {} },
        getAttribute: () => 'liquid',
        setAttribute() {}
    };
    let applyCount = 0;
    const sandbox = {
        console: { warn() {} },
        Date: { now: () => clock },
        setTimeout: (fn, ms) => { timers.push({ fn, at: clock + (ms || 0) }); return timers.length; },
        clearTimeout: () => {},
        document: {
            documentElement: de,
            body: body,
            addEventListener: (t, fn) => { (listeners[t] || (listeners[t] = [])).push(fn); }
        },
        window: null
    };
    sandbox.window = sandbox;
    sandbox.Location = function () {};
    sandbox.Location.prototype.reload = function () {};
    sandbox.n26ApplyGlass = function () { applyCount++; styleStore['--n26-blur'] = String(applyCount) + 'px'; };
    vm.createContext(sandbox);
    vm.runInContext(NR, sandbox, { filename: 'n26-no-reload.js' });

    function fire(type, target) {
        (listeners[type] || []).forEach(fn => fn({ target, preventDefault() {}, key: '' }));
    }
    const ctrl = { closest: sel => sel.indexOf('button') >= 0 ? {} : null };

    ok('守门已包住 n26ApplyGlass',
        typeof sandbox.n26ApplyGlass === 'function' && !!sandbox.n26ApplyGlass.__n26NoReloadWrapped);

    /* 控件 pointerdown 打开 900ms 保护窗口 */
    fire('pointerdown', ctrl);
    ok('控件点击后处于保护窗口', sandbox.N26NoReload.isProtected());

    /* 滑杆拖动：light:true 必须放行 —— 这正是旧版被短路的场景 */
    sandbox.n26ApplyGlass({ light: true });
    ok('滑杆拖动 light:true 不被短路（参数能生效）', applyCount === 1, 'count=' + applyCount);

    /* 连续多帧拖动都要放行，不能只放第一次 */
    for (let i = 0; i < 5; i++) sandbox.n26ApplyGlass({ light: true });
    ok('连续 5 帧滑杆拖动全部放行', applyCount === 6, 'count=' + applyCount);

    /* force:true 显式调用放行 */
    sandbox.n26ApplyGlass({ force: true });
    ok('force:true 显式调用放行', applyCount === 7, 'count=' + applyCount);

    /* 开关点击窗口内：普通 n26ApplyGlass 才短路 */
    sandbox.__N26_SWITCH_CLICK__ = true;
    sandbox.n26ApplyGlass();
    ok('开关点击窗口内普通调用被短路（仍不整窗刷新）', applyCount === 7, 'count=' + applyCount);

    /* 开关窗口内滑杆仍然放行 */
    sandbox.n26ApplyGlass({ light: true });
    ok('开关窗口内滑杆依旧放行', applyCount === 8, 'count=' + applyCount);

    sandbox.__N26_SWITCH_CLICK__ = false;
    sandbox.n26ApplyGlass();
    ok('开关窗口结束后材质切换恢复生效', applyCount === 9, 'count=' + applyCount);
})();

/* ---------------------------------------------------------- */
section('C · 侧边 Dock 玻璃：常驻 / 参照物参数 / 圆角');

ok('CSS 默认 opacity 改为 1（常驻）', /\.n26-docknav-host > \.n26-dng \{[\s\S]*?opacity: 1;/.test(DOCKCSS));
ok('rest() 不再把玻璃藏掉', /function rest\(item\)[\s\S]*?glass\.style\.opacity = '1'/.test(DOCKJS));
ok('fade() 不再把玻璃藏掉', /function fade\(done\)[\s\S]*?glass\.style\.opacity = '1'/.test(DOCKJS));
ok('JS 不再有静态 opacity=0 的淡出写入',
    !/glass\.style\.opacity = '0';[\s\S]{0,120}hideCaps\(false\)/.test(DOCKJS));
ok('常驻类让选中项灰底让位（避免双层塑料）',
    /n26-dng-persistent/.test(DOCKJS) &&
    /n26-docknav-host\.n26-dng-persistent[\s\S]*?background: transparent !important/.test(DOCKCSS));
ok('底色对齐参照物 0.08 白', /background: rgba\(255, 255, 255, 0\.08\)/.test(DOCKCSS));
ok('删掉白色斜向渐变（塑料块根因）',
    !/\.n26-dng\.travel \{\s*background: linear-gradient/.test(DOCKCSS) &&
    !/linear-gradient\(160deg, rgba\(255, 255, 255, 0\.2/.test(DOCKCSS));
ok('阴影按参照物：0 4px 8px 外阴影 + 底部内阴影',
    /0 4px 8px rgba\(0, 0, 0, 0\.25\)/.test(DOCKCSS) &&
    /inset 0 -10px 25px rgba\(0, 0, 0, 0\.15\)/.test(DOCKCSS));
ok('折射 fallback 是 0.25px 微模糊，不再是 blur(14px)',
    /blur\(0\.25px\) contrast\(1\.2\) brightness\(1\.05\) saturate\(1\.1\)/.test(DOCKCSS) &&
    !/backdrop-filter: var\(--n26-lg-filter, blur\(14px\)/.test(DOCKCSS));
ok('选中圆角跟随 radius 参数', /clamp\(10px, var\(--n26-ui-radius, 14px\), 22px\)/.test(DOCKCSS));
ok('transform 仍不参与过渡（不绕大弯）',
    !/transition:[^;]*transform[^;]*;/.test(DOCKCSS.replace(/transition:[^;]*opacity[^;]*;/g, '')));

/* ---------------------------------------------------------- */
section('D · 色散只在外围一圈');

const dispBlock = HTML.slice(HTML.indexOf('if (useDisp) {'), HTML.indexOf('svg.firstChild.appendChild(filter);'));
ok('从位移贴图派生边缘环掩膜（|R-0.5| + |G-0.5|）',
    /n26lgEPos/.test(dispBlock) && /n26lgENeg/.test(dispBlock) && /n26lgESum/.test(dispBlock));
ok('掩膜搬进 alpha 供 feComposite 使用', /n26lgEdgeA/.test(dispBlock) && /feFuncA/.test(dispBlock));
ok('色散结果被 in 裁到边缘', /operator', 'in'\)/.test(dispBlock) && /n26lgDispEdge/.test(dispBlock));
ok('中心区域保留无色散基准折射', /operator', 'out'\)/.test(dispBlock) && /n26lgInner/.test(dispBlock));
ok('最终把边缘色散与中心基准相加', /n26lgInner'\)/.test(dispBlock) && /k3', '1'/.test(dispBlock));
ok('不再把整幅 RGB 拆分结果直接当滤镜输出', /result', 'n26lgAll'/.test(dispBlock));
ok('色散节点只在 dispersion > 0 时建立', /const useDisp = dAmt > 0 && s0 > 0\.5/.test(HTML));

/* ---------------------------------------------------------- */
section('E · 开关：白胶囊隐藏 + 玻璃可拖动');

ok('白胶囊动效期隐藏（苹果同款）', /n26-sw-busy::after/.test(SWCSS) && /opacity: 0 !important/.test(SWCSS));
ok('玻璃底色对齐参照物 0.08 白', /background: rgba\(255, 255, 255, 0\.08\)/.test(SWCSS));
ok('拖动阈值 6px，不影响普通点击', /var DRAG_THRESH = 6/.test(SWJS));
ok('pointerdown 启动拖动候选', /if \(e\.button === 0 && !reduced\) beginDrag\(el, e\)/.test(SWJS));
ok('拖动时玻璃块 150% 且挂真折射',
    /var kw = m\.kw \* 1\.5, kh = m\.kh \* 1\.5/.test(SWJS) && /lgAttach\(blob\)/.test(SWJS));
ok('松手靠哪边判定开关', /var toOn = \(curLeft \+ kw \/ 2\) >= \(el\.offsetWidth \/ 2\)/.test(SWJS));
ok('拖回原侧不改状态（不触发业务）', /if \(toOn === before\) \{ settle\(toOn\); return; \}/.test(SWJS));
ok('跨侧才触发一次业务 click 以落盘', /el\.__n26SwDragEnd = true/.test(SWJS) && /try \{ el\.click\(\); \}/.test(SWJS));
ok('拖动结束吃掉这次 click 的动效（不重播四段）',
    /if \(el\.__n26SwDragEnd\) \{ el\.__n26SwDragEnd = false; return; \}/.test(SWJS));
ok('拖动期间禁手势 / 禁选中 / grabbing', /touch-action: none/.test(SWCSS) && /cursor: grabbing/.test(SWCSS));
ok('四段动效常量未被破坏',
    /P1_SWELL = 90/.test(SWJS) && /P2_MOVE = 260/.test(SWJS) &&
    /P2_LAG = 100/.test(SWJS) && /P3_SETTLE = 100/.test(SWJS));

/* ---------------------------------------------------------- */
section('F · 滚动回弹：vm 逐帧驱动 Engine');

(function () {
    /* 只截取 Engine 定义块，在受控沙箱里提供它依赖的纯函数 */
    const a = GEST.indexOf('function Engine(el)');
    const b = GEST.indexOf('function engineFor(el)');
    if (a < 0 || b < 0) { ok('能提取 Engine 代码块', false); return; }
    const code = GEST.slice(a, b);

    let clock = 0;
    const rafQ = [];
    const cfg = { bounce: true, inertia: true, momentumMax: 3.2, momentumTau: 360, smoothTime: 0 };
    const sandbox = {
        console,
        cfg,
        Math,
        Date: { now: () => clock },
        now: () => clock,
        clamp: (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v),
        rubber: (v, lo, hi, on) => on ? v : (v < lo ? lo : (v > hi ? hi : v)),
        bounds: () => ({ maxX: 0, maxY: 1000 }),
        reduced: () => false,
        emit: () => {},
        requestAnimationFrame: fn => { rafQ.push(fn); return rafQ.length; },
        setTimeout: () => 0,
        clearTimeout: () => {}
    };
    vm.createContext(sandbox);
    vm.runInContext(code + '\nthis.__Engine = Engine;', sandbox, { filename: 'Engine.js' });

    function tick(frames) {
        for (let i = 0; i < frames; i++) {
            clock += 16;
            const q = rafQ.splice(0, rafQ.length);
            q.forEach(fn => fn(clock));
        }
    }
    const el = { scrollLeft: 0, scrollTop: 0 };
    const eng = new sandbox.__Engine(el);
    ok('Engine 可在假 DOM 中实例化', !!eng && typeof eng.push === 'function');

    /* 快速连续下滑：位置只增不减 */
    const seen = [];
    for (let i = 0; i < 8; i++) {
        eng.push(0, 90, 'trackpad');
        tick(2);
        seen.push(el.scrollTop);
    }
    const monotonic = seen.every((v, i) => i === 0 || v >= seen[i - 1] - 0.01);
    ok('连续快速下滑位置单调不回退', monotonic, JSON.stringify(seen.map(v => Math.round(v))));

    /* 惯性阶段不越界、不橡皮筋回弹 */
    eng.push(0, 400, 'trackpad');
    tick(40);
    ok('惯性到底不冲出 maxY', el.scrollTop <= 1000.01, 'scrollTop=' + el.scrollTop);
    const atBottom = el.scrollTop;
    eng.push(0, 400, 'trackpad');
    tick(40);
    ok('到底后继续下滑不会往回滚', el.scrollTop >= atBottom - 0.01,
        Math.round(atBottom) + ' -> ' + Math.round(el.scrollTop));

    /* 外部把滚动位置改掉（面板重建 / 滚动条 / 程序 scrollTop=） */
    const before = el.scrollTop;
    el.scrollTop = 620;
    eng.push(0, 60, 'trackpad');
    tick(3);
    ok('外部改位后不被拉回旧的 tx/ty', el.scrollTop >= 620 - 0.01,
        'before=' + Math.round(before) + ' after=' + Math.round(el.scrollTop));

    /* 帧间外部接管：step 安静让位，不写回 */
    eng.lastWrittenY = el.scrollTop;
    el.scrollTop = 120;
    const y = el.scrollTop;
    eng.step();
    ok('帧间外部接管时 step 不反向写回', el.scrollTop === y && eng.ended === true,
        'scrollTop=' + el.scrollTop);

    ok('惯性阶段不再使用 rubber() 过冲',
        !/this\.ty = rubber\(this\.ty \+ this\.mvy \* dt/.test(code));
    ok('push 前有外部位置同步', /var realX = this\.el\.scrollLeft, realY = this\.el\.scrollTop/.test(code));
})();

/* ---------------------------------------------------------- */
section('H · 壁纸 / 开窗动画 / 菜单间距 / 图标底板');

const STORE = read('ui/n26-store.js');
ok('弥散壁纸路径已从主壳全部摘除', !/\.\.\/Wallpaper\/抽象风格\/n26-aurora-mist\.png/.test(HTML));
ok('弥散壁纸文件已移出资源目录',
    !fs.existsSync(path.join(ROOT, '..', 'Wallpaper', '抽象风格', 'n26-aurora-mist.png')));
ok('抽象风格轮换首项换成实图',
    /abstract: \[\s*'\.\.\/Wallpaper\/抽象风格\/1785840648804_edit_1238598309040738\.png'/.test(HTML));
ok('OOBE 安装背景 / 预览窗 / 关于本机卡片同步换图',
    (HTML.match(/1785840648804_edit_1238598309040738\.png/g) || []).length >= 4);
ok('新窗口首次出现时补挂 opening',
    /el\.classList\.add\('opening'\);/.test(HTML) &&
    /setTimeout\(function \(\) \{ el\.classList\.remove\('opening'\); \}, 340\)/.test(HTML));
ok('开窗动画只对新增节点生效，点击/聚焦不加缩放',
    /if \(el\._n26In\) return/.test(HTML) && /点击 \/ 聚焦依旧不加任何缩放动画/.test(HTML));
ok('reduce-motion / perf-mode 下不播开窗动画',
    /classList\.contains\('reduce-motion'\) \|\|[\s\S]{0,90}classList\.contains\('perf-mode'\)/.test(HTML));
ok('小型开始菜单与 Dock 间距抬到 100px', /#startMenu \{[\s\S]{0,260}?bottom: 100px;/.test(HTML));
ok('n26IconHTML 支持 noTileBg',
    /!opts\.noTileBg && N26_TILE_BG\[appId\]/.test(HTML));
ok('启动台 + Dock 共 4 个调用点显式去底',
    (HTML.match(/noTileBg: true/g) || []).length === 4,
    String((HTML.match(/noTileBg: true/g) || []).length));
ok('桌面图标 / 开始菜单未被动到（保持品牌底板）',
    !/size: 34, radius: 9, noTileBg/.test(HTML) && !/size: 52, radius: 14, noTileBg/.test(HTML));
ok('商城小图标在自绘包下改用真图',
    /_pack === 'n26' && _src/.test(STORE) && /n26-store-real/.test(STORE));
ok('商城真图节点 CSS 摘掉彩色底板',
    /html body \.n26-store-real\{background:transparent !important/.test(STORE));
ok('无真图的应用仍保留 FA 彩色底', /<i class="fas ' \+ esc\(ic\)/.test(STORE));
/* v2.9.96 起商城戳继续前进（2975…），只锁不低于本轮基线 */
ok('n26-store.js 戳不低于 2974', /n26-store\.js\?v=297[4-9]/.test(HTML));

/* ---------------------------------------------------------- */
section('G · 版本戳 / 禁紫 / 语法');

/* v2.9.95 起版本号继续前进，这里只锁「不低于本轮基线」，避免每次 bump 都误报 */
ok('版本号不低于 v2.9.94', /const NEXUS_OS_VERSION = 'v2\.(9\.9[0-9]|10\.\d+)';/.test(HTML));
/* 后续版本会不断插到最前面，只锁 v2.9.94 仍在且顺序正确 */
ok('changelog 保留 v2.9.94 且顺序正确',
    HTML.indexOf('changelog-version">v2.9.94') > 0 &&
    HTML.indexOf('changelog-version">v2.9.94') < HTML.indexOf('changelog-version">v2.9.93'));
const stamps = [
    ['n26-docknav.css?v=2979', /n26-docknav\.css\?v=2979/.test(HTML)],
    ['n26-docknav.js?v=dn12', /n26-docknav\.js\?v=dn12/.test(HTML)],
    ['n26-no-reload.js?v=nr*', /n26-no-reload\.js\?v=nr\d+/.test(HTML)],
    ['n26-switch.js?v=sw12', /n26-switch\.js\?v=sw12/.test(HTML)],
    ['n26-switch.css?v=sw12', /n26-switch\.css\?v=sw12/.test(HTML)],
    ['n26-gestures.js?v=20261108*', /n26-gestures\.js\?v=20261108[b-z]/.test(HTML)],
    ['_app.js?v=2.9.9*', /_app\.js\?v=2\.9\.9[4-9]/.test(read('apps/agent.html'))]
];
stamps.forEach(([n, c]) => ok('资源戳 ' + n, c));
for (const f of ['apps/agent.html', 'apps/games.html', 'apps/devstudio.html']) {
    const s = read(f);
    ok(f + ' 戳同步',
        /n26-docknav\.css\?v=2979/.test(s) && /n26-docknav\.js\?v=dn12/.test(s) &&
        /n26-switch\.js\?v=sw12/.test(s));
}
ok('_app.js 引用戳全量同步（无遗留 2.9.57 / 2.9.67）',
    !/_app\.js\?v=2\.9\.(57|67)/.test(HTML) &&
    !/_app\.js\?v=2\.9\.(57|67)/.test(read('apps/games.html')));

const changedSources = [NR, APPJS, DOCKCSS, DOCKJS, SWJS, SWCSS, GEST];
/* 只拦真正的紫色值；不要拿 1xx/2xx 泛匹配，
   否则 rgba(190,225,255) 这类淡蓝会被误判（v2.9.94 首跑踩过）。 */
ok('本轮改动源码零紫（键名除外）',
    changedSources.every(s => !/purple|#8b5cf6|#a855f7|#7c3aed|#6d28d9|#9d4edd|rgba\(\s*139\s*,\s*92\s*,\s*246|rgba\(\s*168\s*,\s*85\s*,\s*247/i.test(s)));
for (const f of ['ui/n26-no-reload.js', 'ui/n26-docknav.js', 'ui/n26-switch.js',
                 'apps/_app.js', 'ui/n26-gestures.js']) {
    let good = true;
    try { new vm.Script(read(f), { filename: f }); } catch (e) { good = false; }
    ok(f + ' 语法可编译', good);
}

console.log('\n============================================');
console.log('  PASS ' + PASS + '   FAIL ' + FAIL);
console.log('  纯 Node 静态 + vm 假 DOM 逐帧 · 未启动任何浏览器');
console.log('============================================');
process.exit(FAIL ? 1 : 0);
