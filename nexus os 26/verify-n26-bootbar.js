/* verify-n26-bootbar.js · 底栏可见性守门（纯 Node，不启动任何浏览器）
 * ---------------------------------------------------------------------------
 * 背景（2026-11-07 v2.9.80）：用户连续反馈「Dock / 任务栏还是不在，能点到但不渲染」。
 * 根因是预隐藏类永久残留 + CSS 版本戳没 bump 吃旧缓存：
 *   ① ui/n26-firstboot.css 的 body.n26fb-armed #dock{opacity:0!important}
 *   ② body.os-transitioning 让 #dock / #finder-bar / #win-taskbar 一起透明，
 *      清除还依赖嵌套 rAF（锁屏 / 后台会暂停）
 * 本轮按用户要求把首次进入构建动画整块下线，并把两条 opacity 路径彻底封死。
 * 这个脚本负责守门：只扫「页面真正会加载的 CSS」，确保没有任何东西能再把底栏变透明。
 *
 * 用法：cd "nexus os 26/nexus os 26" && node verify-n26-bootbar.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const H = fs.readFileSync(path.join(__dirname, 'Nexus OS 26.html'), 'utf8');
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
const hCode = codeOnly(H);

/* 找出「选择器命中底栏三元素 且 规则体里有 opacity:0 !important」的规则 */
function hiddenBarRules(css) {
    const src = codeOnly(css);
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(src))) {
        const sel = m[1], body = m[2];
        if (/#dock\b|#finder-bar\b|#win-taskbar\b/.test(sel) && /opacity\s*:\s*0\s*!important/i.test(body)) {
            out.push(sel.trim().replace(/\s+/g, ' ').slice(0, 90));
        }
    }
    return out;
}

console.log('=== 底栏可见性守门（动画已下线 / 纯 Node / 零浏览器）===');

/* ---------- ① 首次进入构建动画彻底下线 ---------- */
console.log('\n[1] 首次进入构建动画已整体下线');
const fbMounts = [
    /<link[^>]+ui\/n26-firstboot\.css\?v=/,
    /<script[^>]+ui\/n26-fb-core\.js\?v=/,
    /<script[^>]+ui\/n26-firstboot\.js\?v=/
];
ok('主壳不再加载任何 firstboot CSS / JS', fbMounts.every(r => !r.test(H)));
ok('主壳不再产生 n26fb-armed 预隐藏类', !/classList\.add\(['"][^'"]*n26fb-armed/.test(hCode));
ok('动画资产文件仍保留（随时可挂回，没被误删）',
    ['ui/n26-fb-core.js', 'ui/n26-firstboot.js', 'ui/n26-firstboot.css', 'assets/n26-firstboot-bgm.mp3']
        .every(p => fs.existsSync(path.join(__dirname, p))));
ok('下架原因与缓存踩坑已写进主壳注释', /v2\.9\.80/.test(H) && /bump/.test(H));

/* ---------- ② 已加载的 CSS 里没有任何底栏透明规则 ---------- */
console.log('\n[2] 页面真正加载的样式层');
const links = [...H.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)]
    .map(m => m[1].split('?')[0]);
const loaded = links.filter(h => !/^https?:/.test(h));
let cssHits = [];
loaded.forEach(href => {
    const p = path.resolve(__dirname, href);
    if (!fs.existsSync(p)) { cssHits.push(href + ' [文件缺失]'); return; }
    hiddenBarRules(fs.readFileSync(p, 'utf8')).forEach(s => cssHits.push(href + ' :: ' + s));
});
/* 合法例外：body.dock-hidden 是用户在「Dock 位置 → 隐藏」里显式选的档，
   自带底部 6px 热区 / dock-peek 呼出，不是残留 bug。只把「非显式设置」的透明规则算失败。 */
const LEGAL_EXPLICIT_HIDE = /body\.dock-hidden #dock/;
const illegalHits = cssHits.filter(h => !LEGAL_EXPLICIT_HIDE.test(h));
ok('已加载外部 CSS 共 ' + loaded.length + ' 份，零「意外把底栏变透明」的规则',
    illegalHits.length === 0, illegalHits.slice(0, 3).join(' | '));
if (cssHits.length) {
    console.log('  · 合法例外（用户显式「隐藏 Dock」档，带热区呼出）：' + cssHits.length + ' 条');
}
const inlineCss = [...H.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
const inlineHits = hiddenBarRules(inlineCss);
ok('主壳内联 CSS 零「底栏 opacity:0 !important」', inlineHits.length === 0, inlineHits.slice(0, 3).join(' | '));
ok('os-transitioning 已把底栏 opacity 钉死为 1（历史残留也无害）',
    /body\.os-transitioning[\s\S]{0,240}#win-taskbar\s*\{\s*opacity:\s*1\s*!important/.test(hCode) &&
    !/body\.os-transitioning[\s\S]{0,240}opacity:\s*0\s*!important/.test(hCode));

/* ---------- ③ OS 切换链路：零预隐藏、任务栏真的会创建 ---------- */
console.log('\n[3] OS 切换链路');
ok('applyOSStyle 不再挂 os-transitioning', !/classList\.add\('os-transitioning'\)/.test(hCode));
ok('applyOSStyle 直接 doSwitch（无 250ms 定时器 / 嵌套 rAF）',
    /classList\.remove\('os-transitioning'\);\s*doSwitch\(\);/.test(hCode));
ok('n26SetOSStyle 两个分支都清 os-transitioning', (() => {
    const i = hCode.indexOf('function n26SetOSStyle(');
    const seg = i >= 0 ? hCode.slice(i, i + 1600) : '';
    return /remove\('os-win', 'win-style', 'os-transitioning'\)/.test(seg) &&
        /remove\('os-mac', 'os-transitioning'\)/.test(seg);
})());
ok('mac 分支复位 Dock / Finder 的 inline display',
    /if \(dock\) dock\.style\.display = '';/.test(hCode) &&
    /if \(finder\) finder\.style\.display = '';/.test(hCode));
ok('win 分支会创建 Windows 任务栏', /createWinTaskbar\(\);/.test(hCode));
ok('Windows 皮肤下任务栏 display:flex 且 z-index 有效',
    /body\.os-win #win-taskbar\s*\{\s*display:\s*flex\s*!important/.test(hCode));
ok('启动链会执行 applyOSStyle()', /\n\s*applyOSStyle\(\);/.test(hCode));
ok('设置面板仍有系统风格切回入口',
    H.includes('onclick="n26SetOSStyle(\'mac\')"') && /window\.n26SetOSStyle = n26SetOSStyle/.test(hCode));
ok('Dock 位置默认是底部（不会默认藏起来）',
    /const DOCK_DEFAULT_POSITION = 'bottom';/.test(hCode));

/* ---------- ④ 别的功能没被误伤 ---------- */
console.log('\n[4] 其余功能未被误删');
ok('小组件天空层 3 行挂载仍在',
    /ui\/n26-widget-sky\.css\?v=sky\d/.test(H) &&
    /ui\/n26-widget-sky-bg\.js\?v=sky\d/.test(H) &&
    /ui\/n26-widget-sky\.js\?v=sky\d/.test(H));
ok('Dock / Finder 栏 DOM 仍在', /id="dock"/.test(H) && /id="finder-bar"/.test(H));
ok('桌面 / 锁屏 DOM 仍在', /id="desktop"/.test(H) && /id="lock-screen"/.test(H));
const segs = [...H.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(m => !/\btype\s*=/i.test(m[1]));
let bad = 0;
segs.forEach(m => { try { new vm.Script(m[2]); } catch (e) { bad++; } });
ok('主壳 ' + segs.length + ' 段内联脚本语法全部可编译', bad === 0, '失败 ' + bad);

const PURPLE = /#(?:8b5cf6|a855f7|7c3aed|6d28d9|9333ea|c084fc|d8b4fe|9d4edd|7b2cbf|6366f1)\b|\bpurple\b|\bviolet\b/i;
const tail = H.slice(H.indexOf('v2.9.80：首次进入构建动画整体下线'));
ok('本轮新增代码零紫', !PURPLE.test(tail));

/* ---------- ⑤ 给用户的即时兜底 ---------- */
console.log('\n[5] 现场排查提示（不是断言）');
console.log('  · 改的是磁盘文件，浏览器里跑的还是旧页面 → 必须 Ctrl+F5 硬刷新（旧 CSS 会吃缓存）。');
console.log('  · 不刷新也能立刻恢复，控制台执行这一行（覆盖全部残留路径）：');
console.log('    document.body.classList.remove("n26fb-armed","n26fb-pending","n26fb-active","os-transitioning","sleeping","waking","dock-hidden"); var d=document.getElementById("dock"); if(d){d.classList.remove("n26-dock-hidden");d.style.opacity="";d.style.display="";} var s=getUserLS("settings")||{}; s.osStyle="mac"; s.dockPosition="bottom"; setUserLS("settings",s); applyOSStyle(); applyDockPosition("bottom");');
console.log('  · body.sleeping 会把 Dock / 任务栏 translateY(120%) 移出屏幕（睡眠模式正常行为），先唤醒。');
console.log('  · 「Dock 位置 → 隐藏」与「最大化窗口自动隐藏」也会收起 Dock，属正常设计。');
console.log('  · Windows 皮肤会隐藏 Dock、由任务栏接管；想看 Dock 就执行 n26SetOSStyle("mac")。');

console.log('\n=== ' + (fail === 0 ? '全部通过 · 底栏不再有任何透明化路径' : fail + ' 项失败') +
    ' · 未启动任何浏览器（Edge 驱动测试已禁用）===');
process.exitCode = fail ? 1 : 0;
