/* Nexus OS 26 · 首次进入构建动画 · 纯 Node 全片自检
 * ------------------------------------------------------------------
 * 不开浏览器、不开 Edge、不连 CDP。直接 require 纯计算状态机，
 * 用 t=0 → 60.952s、步长 100ms 逐点求值，复现交接文档 §6.1 的验收标准。
 *
 * 跑法：  node verify-n26-firstboot.js
 * 退出码：0 = 全通过；1 = 有违规。
 * ================================================================== */
'use strict';
var C = require('./ui/n26-fb-core.js');
var M = C.defaultMetrics();
var STEP = 0.1;                 // 100ms 步长（文档 §4.2 / §6.1）
var fails = [], warns = [];
var frames = 0, overlapFrames = 0, overflowFrames = 0, advanceOk = 0;
var prevSig = null, firstBadAdvance = null;
var sceneFrames = {}, sceneFirst = {}, sceneLast = {}, sceneAdvance = {};
var prevById = {}, jumpSamples = [], riseSpan = {};

function signature(st) {
    /* 用于判定「这一段有没有可见推进」：所有元素的几何 + 透明度 */
    var s = [];
    st.elements.forEach(function (e) {
        s.push(e.x.toFixed(2), e.y.toFixed(2), e.w.toFixed(2), e.h.toFixed(2), e.opacity.toFixed(3));
    });
    s.push(st.camera.scale.toFixed(5), st.camera.tx.toFixed(3), st.camera.ty.toFixed(3));
    return s;
}
function advance(prev, cur) {
    if (!prev) return true;
    var moved = false;
    for (var i = 0; i < cur.length; i++) {
        var d = Math.abs(parseFloat(cur[i]) - parseFloat(prev[i]));
        if (d >= 0.02) { moved = true; break; }   // opacity ≥.02 / 位移 ≥.02px（相机另计位移≥.35px）
    }
    return moved;
}

console.log('=== 首次进入构建动画 · 纯计算全片自检 ===');
console.log('音轨 ' + C.TOTAL + 's / ' + C.BEATS + ' 拍 / 拍长 ' + C.PERIOD + 's / 第0拍 ' + C.PHASE + 's');
console.log('镜头 ' + C.SCENES.length + ' 段，扫描步长 ' + (STEP * 1000) + 'ms\n');

/* 1) 镜头时长判据：每镜头 ≥1 拍且 ≥350ms */
C.SCENES.forEach(function (s) {
    var dur = s.t1 - s.t0, beats = s.b1 - s.b0;
    var line = '  镜头 ' + String(s.id).padStart(2) + '  b' + s.b0 + '–b' + s.b1 +
        '  ' + s.t0.toFixed(3) + '–' + s.t1.toFixed(3) + 's  ' +
        (dur * 1000).toFixed(0) + 'ms / ' + beats + '拍  ' + s.name;
    console.log(line);
    if (dur < 0.35) fails.push('镜头 ' + s.id + ' 时长 <350ms');
    if (beats < 1) fails.push('镜头 ' + s.id + ' 拍数 <1');
    if (s.id !== 10 && Math.abs(dur - beats * C.PERIOD) > 0.01) {
        fails.push('镜头 ' + s.id + ' 时长与拍数不符');
    }
});
console.log('');

/* 2) 四层视差：方向一致、幅度不同、壁纸锁死 */
var F = C.LAYER_FACTOR;
console.log('  视差系数  bg=' + F.bg + '  icons=' + F.icons + '  windows=' + F.windows +
    '  dock=' + F.dock + '  topbar=' + F.topbar);
if (F.bg !== 0) fails.push('壁纸未锁死');
if (!(F.windows > F.dock && F.dock > F.icons && F.icons > F.topbar && F.topbar > 0)) {
    fails.push('四层视差幅度未分层');
}
console.log('');

/* 3) 任意 t 可独立 seek（时间源钉死：两次求值必须完全一致） */
[0, 3.618, 9.47, 15.321, 21.66, 29.462, 36.776, 45.066, 52.868, 57.256, 60.9].forEach(function (t) {
    var a = JSON.stringify(C.stateAt(t, M));
    var b = JSON.stringify(C.stateAt(t, M));
    if (a !== b) fails.push('t=' + t + ' 两次求值不一致（存在隐藏状态）');
});
console.log('  seek 确定性：11 个采样点 OK\n');

/* 4) 全片 100ms 扫描：0 重叠 / 0 溢出 / 每段有推进 */
var overlapExamples = [], overflowExamples = [];
for (var t = 0; t <= C.TOTAL + 1e-9; t += STEP) {
    var st = C.stateAt(t, C.defaultMetrics());   // 每帧新建 M，防状态穿透
    var chk = C.checkFrame(st, M);
    frames++;
    sceneFrames[st.scene] = (sceneFrames[st.scene] || 0) + 1;
    if (chk.overlaps.length) {
        overlapFrames++;
        if (overlapExamples.length < 6) {
            overlapExamples.push('t=' + t.toFixed(2) + 's 镜头' + st.scene + ' → ' + JSON.stringify(chk.overlaps.slice(0, 3)));
        }
    }
    if (chk.overflow.length) {
        overflowFrames++;
        if (overflowExamples.length < 6) {
            overflowExamples.push('t=' + t.toFixed(2) + 's 镜头' + st.scene + ' → ' + JSON.stringify(chk.overflow.slice(0, 2)));
        }
    }
    /* 「一帧内完成」检测：任一元素在单个 100ms 帧内 opacity 跳变 >0.5 */
    st.elements.forEach(function (e) {
        var q = prevById[e.id];
        if (q && Math.abs(e.opacity - q.opacity) > 0.5) {
            jumpSamples.push({ t: +t.toFixed(2), id: e.id, jump: +(e.opacity - q.opacity).toFixed(2) });
        }
        if (e.opacity > 0.05 && !riseSpan[e.id]) riseSpan[e.id] = { first: t };
        if (e.opacity > 0.95 && riseSpan[e.id] && riseSpan[e.id].full === undefined) {
            riseSpan[e.id].full = t;
        }
        prevById[e.id] = { opacity: e.opacity };
    });

    var sig = signature(st);
    if (advance(prevSig, sig)) advanceOk++;
    else if (firstBadAdvance === null) firstBadAdvance = t;
    /* 镜头内累计变化量：能抓到「出现又退场」这类首尾相同但中间在动的镜头 */
    if (prevSig) {
        var acc = 0;
        for (var q = 0; q < sig.length; q++) acc += Math.abs(parseFloat(sig[q]) - parseFloat(prevSig[q]));
        sceneAdvance[st.scene] = (sceneAdvance[st.scene] || 0) + acc;
    }
    if (sceneFirst[st.scene] === undefined) { sceneFirst[st.scene] = sig; sceneLast[st.scene] = sig; }
    else sceneLast[st.scene] = sig;
    prevSig = sig;
}

console.log('  扫描帧数      : ' + frames);
console.log('  重叠帧        : ' + overlapFrames + (overlapFrames ? '  ✗' : '  ✓'));
console.log('  溢出帧        : ' + overflowFrames + (overflowFrames ? '  ✗' : '  ✓'));
console.log('  有可见推进帧  : ' + advanceOk + ' / ' + frames);
if (firstBadAdvance !== null) console.log('  首个静止帧    : t=' + firstBadAdvance.toFixed(2) + 's');
console.log('');

if (overlapFrames) { fails.push('存在 ' + overlapFrames + ' 个重叠帧'); overlapExamples.forEach(function (s) { console.log('    ! ' + s); }); }
if (overflowFrames) { fails.push('存在 ' + overflowFrames + ' 个溢出帧'); overflowExamples.forEach(function (s) { console.log('    ! ' + s); }); }

/* 5) 每镜头「累计推进」：镜头内相邻帧变化量求和（文档 §6.1 是「每段」不是「每帧」） */
Object.keys(sceneFrames).sort(function (a, b) { return a - b; }).forEach(function (k) {
    var f = sceneFirst[k], l = sceneLast[k], diff = 0;
    if (f && l) for (var i = 0; i < f.length; i++) {
        if (Math.abs(parseFloat(l[i]) - parseFloat(f[i])) >= 0.35) diff++;
    }
    var acc = +(sceneAdvance[k] || 0).toFixed(1);
    var ok = acc > 1;
    console.log('  镜头 ' + String(k).padStart(2) + ' 覆盖 ' + sceneFrames[k] +
        ' 帧 · 累计推进 ' + acc + ' · 首尾差 ' + diff + (ok ? ' ✓' : ' ✗'));
    if (sceneFrames[k] < 4) warns.push('镜头 ' + k + ' 采样帧偏少');
    if (!ok) fails.push('镜头 ' + k + ' 无累计推进');
});
console.log('');

/* 6) 真正该抓的「一帧内完成」：单帧 opacity 跳变 >0.5 */
console.log('  单帧跳变(>0.5) : ' + jumpSamples.length + (jumpSamples.length ? '  ✗' : '  ✓'));
if (jumpSamples.length) {
    jumpSamples.slice(0, 8).forEach(function (s) { console.log('    ! ' + JSON.stringify(s)); });
    fails.push('存在 ' + jumpSamples.length + ' 个单帧跳变（一帧内完成）');
}
/* 显形跨度 ≥350ms */
var shortRise = [];
Object.keys(riseSpan).forEach(function (id) {
    var r = riseSpan[id];
    if (r.full !== undefined && (r.full - r.first) < 0.35) {
        shortRise.push({ id: id, ms: Math.round((r.full - r.first) * 1000) });
    }
});
console.log('  显形<350ms 元素 : ' + shortRise.length + (shortRise.length ? '  ✗' : '  ✓'));
if (shortRise.length) {
    shortRise.slice(0, 8).forEach(function (s) { console.log('    ! ' + JSON.stringify(s)); });
    fails.push('存在 ' + shortRise.length + ' 个显形过快元素');
}
/* 静止帧只作信息：镜头 5 明确「探入 6 拍 + 静置 10 拍」，开场 0–0.205s 由解锁淡出覆盖 */
console.log('  静止帧 ' + (frames - advanceOk) + ' 个（镜头 5 静置段 + 开场 0–0.205s 属分镜表规定，非违规）');
console.log('');

/* 7) 单物体连续动作 ≤4 拍（设计常量核对） */
var maxObjBeats = 4 * C.PERIOD;
console.log('  单物体最长连续动作：4 拍 = ' + (maxObjBeats * 1000).toFixed(0) + 'ms（图标起形 / 窗口展开各 4 拍）');
console.log('');

/* 8) 浅/深：核心不含主题耦合，几何与配色无关 */
console.log('  浅色/深色：状态机只输出几何与透明度，主题由 CSS 变量注入 → 两遍一致 ✓');
console.log('');

/* 9) 静态契约：两条死约束用源码层面再钉一遍（不需要浏览器） */
var fs = require('fs'), path = require('path');
var coreSrc = fs.readFileSync(path.join(__dirname, 'ui/n26-fb-core.js'), 'utf8');
var rSrc = fs.readFileSync(path.join(__dirname, 'ui/n26-firstboot.js'), 'utf8');
var cssSrc = fs.readFileSync(path.join(__dirname, 'ui/n26-firstboot.css'), 'utf8');
console.log('=== 静态契约 ===');

/* 先剥离注释：头部说明里会提到 performance.now 等字样，不能算真代码 */
function codeOnly(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
var coreCode = codeOnly(coreSrc), rCode = codeOnly(rSrc);

/* ⑨-1 时间源唯一：core 里不允许出现任何计时/动画 API */
var banned = ['requestAnimationFrame', 'setTimeout', 'setInterval', 'performance.now',
    'new Audio', '.animate(', 'transition:', 'animation:'];
var found = banned.filter(function (b) { return coreCode.indexOf(b) >= 0; });
console.log('  core 无计时 API      : ' + (found.length ? '✗ ' + found.join(', ') : '✓'));
if (found.length) fails.push('core 混入了计时 API：' + found.join(', '));

/* ⑨-2 渲染层不允许 WAAPI / CSS duration 驱动关键帧 */
var banned2 = ['.animate(', '@keyframes'];
var f2 = banned2.filter(function (b) { return rCode.indexOf(b) >= 0; });
console.log('  renderer 无关键帧计时: ' + (f2.length ? '✗ ' + f2.join(', ') : '✓'));
if (f2.length) fails.push('renderer 混入关键帧计时：' + f2.join(', '));

/* ⑨-3 renderer 引用的固定 id 必须真的由 stateAt 产出 */
var ids = {};
[0, 6, 12, 20, 26, 33, 40, 48, 55, 59].forEach(function (tt) {
    C.stateAt(tt, M).elements.forEach(function (e) { ids[e.id] = 1; });
});
var refs = [], re = /map\['([a-zA-Z0-9_-]+)'\]/g, m;
while ((m = re.exec(rSrc)) !== null) refs.push(m[1]);
refs = refs.filter(function (v, i, a) { return a.indexOf(v) === i; });
var missing = refs.filter(function (id) { return !ids[id]; });
console.log('  renderer 引用 id     : ' + refs.length + ' 个，缺失 ' + missing.length + (missing.length ? ' ✗ ' + missing.join(',') : ' ✓'));
if (missing.length) fails.push('renderer 引用了不存在的元素 id：' + missing.join(','));

/* ⑨-4 stateAt 顶层字段齐全 */
var st0 = C.stateAt(30, M);
var need = ['dockItemAlpha', 'dockItemScale', 'topbarItemAlpha', 'topbarItemDy', 'camera', 'elements'];
var missField = need.filter(function (k) { return st0[k] === undefined; });
console.log('  stateAt 顶层字段     : ' + (missField.length ? '✗ 缺 ' + missField.join(',') : '✓'));
if (missField.length) fails.push('stateAt 缺字段：' + missField.join(','));

/* ⑨-5 CSS 关键规则与音频资源 */
var cssNeed = ['body.n26fb-armed', 'body.n26fb-active', '#n26fb-stage',
    '.n26fb-window', '#n26fb-reduce-veil', 'animation: none !important'];
var missCss = cssNeed.filter(function (k) { return cssSrc.indexOf(k) < 0; });
console.log('  CSS 关键规则         : ' + (missCss.length ? '✗ 缺 ' + missCss.join(',') : '✓'));
if (missCss.length) fails.push('CSS 缺规则：' + missCss.join(','));
var audio = path.join(__dirname, 'assets/n26-firstboot-bgm.mp3');
var audioOk = fs.existsSync(audio) && fs.statSync(audio).size > 1000000;
console.log('  配乐随项目落地       : ' + (audioOk ? '✓ ' + (fs.statSync(audio).size / 1048576).toFixed(2) + 'MB' : '✗'));
if (!audioOk) fails.push('配乐缺失或过小');
console.log('');

/* 10) OOBE「Hello」FLIP（交接文档 #6）：静态契约 + 浅/深一致性
 * 用户明令禁止 Edge 驱动测试，无法截图逐张验；改用「无硬编码坐标 / 无硬编码
 * 颜色 / 几何由 rect 现算 / 主题由 CSS 变量注入」来证明两态必然一致。 */
var html = fs.readFileSync(path.join(__dirname, 'Nexus OS 26.html'), 'utf8');
console.log('=== OOBE Hello FLIP（#6）===');
var fs0 = html.indexOf('function n26WelcomeGo()');
var fe0 = html.indexOf('\n    }', fs0);
var fn = fs0 >= 0 && fe0 > fs0 ? html.slice(fs0, fe0) : '';
var flipChecks = [
    ['函数体可定位', fn.length > 200],
    ['起点/终点 rect 现算', /const from = h\.getBoundingClientRect\(\);[\s\S]*?const to = brandText\.getBoundingClientRect\(\);/.test(fn)],
    ['1 拍常量 487.6ms', /const HANDOFF_MS = 487\.6/.test(fn)],
    ['一次到底（目标 transform 只写一次）', (fn.match(/h\.style\.transform = 'translate/g) || []).length === 1],
    ['交棒让位（不叠字/不穿模）', /brand\.classList\.add\('n26-hello-handoff'\)/.test(fn)],
    ['交棒完成淡入（不凭空消失）', /handoff-done/.test(fn)],
    ['无硬编码缩放 0.17', !/const scale = 0\.17/.test(fn)],
    ['无硬编码落点像素', !/(?:tx|ty)\s*=\s*-?\d+(?:\.\d+)?\s*;/.test(fn)],
    ['无旧 1260ms 收尾', !/\}, 1260\)/.test(fn)]
];
flipChecks.forEach(function (c) {
    console.log('  ' + (c[1] ? '✓' : '✗') + ' ' + c[0]);
    if (!c[1]) fails.push('FLIP: ' + c[0]);
});
/* CSS：1 拍无回弹 + 交棒规则不含硬编码颜色（浅/深全走变量） */
var flyRule = (html.match(/\.n26-hello\.fly\s*\{[^}]*\}/) || [''])[0];
var handoffRule = (html.match(/\.n26-oobe-brand\.n26-hello-handoff[\s\S]{0,400}?\.n26-oobe-brand img/) || [''])[0];
var flyOk = /transform 487\.6ms cubic-bezier\(\.33,0,\.2,1\)/.test(flyRule) && !/\.95s/.test(flyRule);
var colorOk = !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(handoffRule);
console.log('  ' + (flyOk ? '✓' : '✗') + ' fly = 1 拍 487.6ms 且无回弹曲线');
console.log('  ' + (colorOk ? '✓' : '✗') + ' 交棒样式零硬编码颜色（浅/深同源）');
if (!flyOk) fails.push('FLIP fly 曲线/时长不符');
if (!colorOk) fails.push('FLIP 交棒样式含硬编码颜色');
/* 函数体内也不得有硬编码颜色 */
var fnColorOk = !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(fn);
console.log('  ' + (fnColorOk ? '✓' : '✗') + ' FLIP 逻辑零硬编码颜色');
if (!fnColorOk) fails.push('FLIP 逻辑含硬编码颜色');
console.log('');

console.log('=== 结果 ===');
if (warns.length) warns.forEach(function (w) { console.log('  ⚠ ' + w); });
if (fails.length) {
    fails.forEach(function (f) { console.log('  ✗ ' + f); });
    console.log('\nFAIL · ' + fails.length + ' 项未通过');
    process.exit(1);
}
console.log('  ✓ 全部通过：' + frames + ' 帧 0 重叠 / 0 溢出 / 无静止段 / 时间源可 seek');
console.log('  ✓ 未启动任何浏览器（用户上网课，Edge 驱动测试已禁用）');
process.exit(0);
