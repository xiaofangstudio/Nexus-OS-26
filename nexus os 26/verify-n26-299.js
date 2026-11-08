/* ==========================================================================
   verify-n26-299.js · v2.9.99 动效与性能专项
   纯 Node 静态 + 度量。不启动任何浏览器。
   把「挑刺报告」里那五条根因变成可回归的硬指标：
     ① 一个物体一条动画   ② 位移与时长配对   ③ 错落 ≥50ms
     ④ 不再有 transition:all   ⑤ 鼠标移动不读布局
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
    if (cond) pass++;
    else { fail++; fails.push(name + (extra ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n--- ' + t + ' ---'); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }

const HTML = read('Nexus OS 26.html');
const SM = read('ui/n26-startmenu.css');

/* ---------- 度量工具 ---------- */
const cssFiles = fs.readdirSync('ui').filter(n => /\.css$/.test(n)).map(n => 'ui/' + n);

function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }
function stripCode(s) { return s.replace(/<code>[\s\S]*?<\/code>/g, ''); }

function allTransitionDecls() {
    const out = [];
    for (const f of ['Nexus OS 26.html', ...cssFiles]) {
        const s = stripComments(stripCode(read(f)));
        const re = /transition:\s*([^;}]+)/g;
        let m;
        while ((m = re.exec(s))) out.push({ f, body: m[1] });
    }
    return out;
}
function durationsOf(body) {
    const list = [];
    const re = /(\d*\.?\d+)(ms|s)\b/g;
    let m;
    while ((m = re.exec(body))) {
        const v = parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1);
        if (v >= 40 && v <= 3000) list.push(v);
    }
    return list;
}

/* ---------------------------------------------------------------- A */
section('A · 版本与戳');
ok('版本号 v2.9.99', /const NEXUS_OS_VERSION = 'v2\.(9\.99|10\.\d+)';/.test(HTML));
ok('changelog 首条 v2.9.99',
    HTML.indexOf('<div class="changelog-version">v2.9.99</div>') > 0 &&
    HTML.indexOf('<div class="changelog-version">v2.9.99</div>') <
    HTML.indexOf('<div class="changelog-version">v2.9.98</div>'));

/* ---------------------------------------------------------------- B */
section('B · ① 一个物体一条动画');
ok('小开始菜单只剩 1 条 transition（且只是 visibility）', (function () {
    const s = stripComments(SM);
    const blocks = s.match(/#smTileMenu(\s|\{|,)[\s\S]*?\}/g) || [];
    const decls = [];
    blocks.forEach(function (b) {
        const m = b.match(/transition:\s*([^;}]+)/);
        if (m) decls.push(m[1].trim());
    });
    return decls.length === 1 && /^visibility\b/.test(decls[0]);
})(), '见 ui/n26-startmenu.css #smTileMenu');
ok('入场是一条 300ms 关键帧', /@keyframes smtMenuIn[\s\S]{0,200}transform: scale\(1\)/.test(SM) &&
    /#smTileMenu\.show \{\s*animation: smtMenuIn 300ms/.test(SM));
ok('退场有自己的关键帧', /@keyframes smtMenuOut/.test(SM) && /animation: smtMenuOut 180ms/.test(SM));
ok('旧的 4 条过渡已不存在', !/transition:\s*opacity 0\.34s[\s\S]{0,200}filter/.test(SM));
ok('控制中心不再给子项单独播动画', !/\.cc-item\s*\{[^}]*animation: n26PanelItemIn/.test(HTML));
ok('控制中心不再逐条 nth-child delay', !/#control-center\.show \.cc-item:nth-child\(\d\)\s*\{\s*animation-delay/.test(HTML));
ok('控制中心只有面板一条动画', /#control-center\.show[\s\S]{0,120}animation: n26PanelIn \.30s/.test(HTML));
ok('消息中心同理', !/notification-item:nth-child\(\d\)\s*\{\s*animation-delay/.test(HTML));

/* ---------------------------------------------------------------- C */
section('C · ② 位移与时长配对');
ok('磁贴位移收到 10px 以内', /@keyframes smtTileIn[\s\S]{0,160}translate: -10px 10px/.test(SM));
ok('磁贴时长 300ms（不是 520ms）', /animation: smtTileIn 300ms/.test(SM));
ok('不再使用 expo-out 尾巴', !/smtTileIn 0\.52s cubic-bezier\(0\.16, 1, 0\.3, 1\)/.test(SM));

/* ---------------------------------------------------------------- D */
section('D · ③ 错落节奏');
ok('一级台阶 ≥ 50ms', /min\(var\(--smt-i, 0\), (\d+)\) \* (5[0-9]|6[0-9]|7[0-9]|80)ms/.test(SM),
    (SM.match(/animation-delay: calc\(min[^)]*\)[^;]*/) || [''])[0]);
ok('有封顶，总时长可控', /min\(var\(--smt-i, 0\), \d+\)/.test(SM));
ok('不再是 26ms', !/\* 26ms/.test(SM));

/* ---------------------------------------------------------------- E */
section('E · ④ transition: all 清零');
(function () {
    let n = 0;
    for (const f of ['Nexus OS 26.html', ...cssFiles]) {
        const s = stripComments(stripCode(read(f)));
        n += (s.match(/transition:\s*all\b/g) || []).length;
    }
    ok('真实 CSS 里 transition:all = 0', n === 0, 'count=' + n);
})();
(function () {
    const decls = allTransitionDecls();
    const withAll = decls.filter(d => /\ball\b/.test(d.body)).length;
    ok('transition 声明里没有 all', withAll === 0, 'count=' + withAll);
    const bad = decls.filter(d => /transition:[^;]*\b(width|height|padding|margin|font-size)\b/.test(d.body));
    ok('没有把尺寸类属性放进 transition', bad.length === 0, bad.slice(0, 3).map(b => b.f).join(','));
})();

/* ---------------------------------------------------------------- F */
section('F · ⑤ 鼠标移动不读布局');
ok('桌面卡片热区有快路径早退', /if \(!shown && e\.clientX > SHELF_EDGE\) return;/.test(HTML));
ok('rect 有缓存', /if \(rect && t - rectAt < 250\) return rect;/.test(HTML));
ok('mousemove 走 rAF 合并', /raf = requestAnimationFrame\(function \(\) \{\s*raf = 0;/.test(HTML));
ok('resize 后让 rect 失效', /addEventListener\('resize', function \(\) \{ rect = null; \}/.test(HTML));
ok('开窗动画不再动 filter', !/@keyframes windowOpenGlass[\s\S]{0,200}filter: blur/.test(HTML));
ok('开窗仍是纯合成属性', /@keyframes windowOpenGlass[\s\S]{0,200}transform: scale\(1\)/.test(HTML));

/* ---------------------------------------------------------------- G */
section('G · 时基与曲线（度量）');
(function () {
    const decls = allTransitionDecls();
    let durs = [];
    decls.forEach(d => { durs = durs.concat(durationsOf(d.body)); });
    durs.sort((a, b) => a - b);
    const med = durs.length ? durs[Math.floor(durs.length / 2)] : 0;
    console.log('    时长样本 ' + durs.length + ' 条，中位 ' + med + 'ms');
    ok('时长中位 ≥ 240ms（原来 200ms 太脆）', med >= 240, 'median=' + med);
    const p90 = durs.length ? durs[Math.floor(durs.length * 0.9)] : 0;
    ok('P90 ≤ 420ms（没有离谱的长动画）', p90 <= 420, 'p90=' + p90);
})();
(function () {
    /* 曲线：本次改写的表面类过渡应统一到 cubic-bezier(.2,.7,.2,1) */
    const n = (HTML + cssFiles.map(read).join('')).match(/cubic-bezier\(\.2, \.7, \.2, 1\)/g);
    ok('统一曲线已在用（≥100 处）', (n || []).length >= 100, 'count=' + (n || []).length);
})();

/* ---------------------------------------------------------------- H */
section('H · 阴影层数（不新增多层堆叠）');
(function () {
    let total = 0, multi = 0, maxL = 0;
    for (const f of ['Nexus OS 26.html', ...cssFiles]) {
        const s = stripComments(stripCode(read(f)));
        const re = /box-shadow:\s*([^;}]+)/g;
        let m;
        while ((m = re.exec(s))) {
            const body = m[1].replace(/var\([^)]*\)/g, 'VAR');
            const n = body.split(/,(?![^(]*\))/).filter(x => x.trim()).length;
            total++; maxL = Math.max(maxL, n);
            if (n > 2) multi++;
        }
    }
    const pct = multi / Math.max(1, total) * 100;
    console.log('    阴影声明 ' + total + ' 条，多层(>2) ' + pct.toFixed(1) + '%，最多 ' + maxL + ' 层');
    ok('多层阴影占比 ≤ 20%', pct <= 20, pct.toFixed(1) + '%');
})();

/* ---------------------------------------------------------------- I */
section('I · 全量语法 / 禁紫');
(function () {
    const targets = ['Nexus OS 26.html'];
    for (const n of fs.readdirSync('ui')) if (/\.(js|css)$/.test(n)) targets.push(path.join('ui', n));
    for (const n of fs.readdirSync('apps')) if (/\.html$/.test(n)) targets.push(path.join('apps', n));
    for (const n of fs.readdirSync('.')) if (/\.js$/.test(n) && !/^verify-/.test(n)) targets.push(n);

    let inline = 0;
    const bad = [];
    const PURPLE = /(#8b5cf6|#a855f7|#7c3aed|#6d28d9|#9333ea|#c084fc|#a78bfa|#7e22ce|#6f6cf0|#5b3ec9|#5856d6|#b06ee8|#6d6cf5|#4338ca|rebeccapurple)/i;
    const purple = [];
    for (const f of targets) {
        const s = read(f);
        /* 只对「禁紫扫描」剥注释；编译必须用原始源码（剥注释会破坏含 * / 的字符串与正则） */
        s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').forEach(function (L, i) { if (PURPLE.test(L)) purple.push(f + ':' + (i + 1)); });
        if (/\.js$/.test(f)) { try { new vm.Script(s, { filename: f }); } catch (e) { bad.push(f); } continue; }
        const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
        let m, k = 0;
        while ((m = re.exec(s))) { k++; inline++; try { new vm.Script(m[1], { filename: f + '#' + k }); } catch (e) { bad.push(f + '#' + k); } }
    }
    ok('内联脚本全部编译通过', bad.length === 0, bad.slice(0, 4).join(', '));
    ok('UI 主题真紫 0 命中', purple.length === 0, purple.slice(0, 4).join(', '));
    console.log('    文件 ' + targets.length + ' / 内联 ' + inline);
})();

/* ---------------------------------------------------------------- J */
section('J · 节拍一致性（同一动作只用一条曲线）');
ok('磁贴入场曲线与面板同族', /cubic-bezier\(\.22, \.61, \.36, 1\)/.test(SM) &&
    /cubic-bezier\(\.2, \.7, \.2, 1\)/.test(SM));
ok('磁贴入场只有一个时长（错落靠 delay，不靠第二条时长）', (function () {
    const raw = (SM.match(/#smTileMenu\.show \.smt-tile \{[\s\S]*?\}/) || [''])[0];
    const blk = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/animation-delay\s*:[^;]*;/g, '');
    const ds = (blk.match(/\d+ms/g) || []);
    return new Set(ds).size === 1;
})());

/* ---------------------------------------------------------------- */
console.log('\n============================================');
console.log('  PASS ' + pass + '   FAIL ' + fail);
if (fail) fails.forEach(f => console.log('  FAIL  ' + f));
console.log('  纯 Node 静态 + 度量 · 未启动任何浏览器');
console.log('============================================');
process.exit(fail ? 1 : 0);
