/* verify-n26-dock.js · Dock 品牌原貌守门自检（纯 Node，不启动任何浏览器）
 * ---------------------------------------------------------------------------
 * 背景：2026-11-07 另一个 Agent 在 v2.9.70 把「刷新后重画 Dock 固定项」接进了启动链，
 *       flat 图标包下 n26IconHTML() 把六张手绘品牌图全刷成蓝底 + 白 FA 字形，
 *       开始/搜索还被换成自制实心底板（其中一块是禁紫违规的蓝紫渐变），Dock 观感垮掉。
 *       恢复后立此脚本：任何人再动 Dock，跑一遍就能看出有没有把品牌原图刷掉。
 *
 * 用法：cd "nexus os 26/nexus os 26" && node verify-n26-dock.js
 * 约束：只做静态契约检查，绝不 require('playwright') / 拉起 Edge（用户上网课期间硬性禁令）。
 */
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, 'Nexus OS 26.html');
const CSS = path.join(__dirname, 'ui', 'n26-shell.css');
const H = fs.readFileSync(HTML, 'utf8');
const C = fs.readFileSync(CSS, 'utf8');

let fail = 0;
function ok(label, cond, extra) {
    console.log((cond ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : ''));
    if (!cond) fail++;
}
/* 剥注释再查「类名 / 色值残留」，否则写说明的注释自己会把自己判违规 */
function codeOnly(s) {
    return s.replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const hCode = codeOnly(H), cCode = codeOnly(C);

console.log('=== Dock 品牌原貌守门自检 ===');

/* ① 当前固定项：4 张 n26-dock-img 品牌图 + 品牌 N 底板图 + 搜索字形底板 */
const dockStart = H.indexOf('<div id="dock"');
const dockEnd = H.indexOf('<!-- Dock Bar');
const dock = dockStart >= 0 && dockEnd > dockStart ? H.slice(dockStart, dockEnd) : '';
const imgs = [...dock.matchAll(/<img class="n26-dock-img" src="([^"]+)"/g)].map(m => m[1]);
ok('Dock 固定项 = 4 张 n26-dock-img + 品牌 N 图 + 搜索字形',
    imgs.length === 4 && /class="[^"]*dock-plate-n/.test(dock) && /dock-plate-search/.test(dock),
    imgs.length + ' 张: ' + imgs.map(s => s.split('/').pop()).join(' / '));

/* 路径是相对主壳所在目录（../Desktop icon/...），不要多拼一层 */
const missing = imgs.filter(p => !fs.existsSync(path.resolve(__dirname, p)));
ok('品牌原图资源全部存在', missing.length === 0, missing.length ? '缺: ' + missing.join(', ') : '');

/* ② 违规残留：蓝紫禁紫色值，代码里必须为零（dock-plate 已是正常结构，不再判违规） */
ok('禁紫违规色值零残留（代码层）', !/#2c40d8/i.test(hCode) && !/#2c40d8/i.test(cCode));

/* ③ 重画范围：只查后台程序区，绝不碰固定项。
 *    窗口必须截到下一个函数为止，否则会把后面 bounceDockIcon 的 '#dock .dock-item' 算进来。 */
const fnAt = H.indexOf('function n26RefreshDockIcons');
const nextFn = H.indexOf('\n    function ', fnAt + 10);
const fnBody = fnAt >= 0 ? H.slice(fnAt, nextFn > fnAt ? nextFn : fnAt + 1200) : '';
ok('n26RefreshDockIcons 只查 #dockBgApps',
    fnBody.includes("querySelectorAll('#dockBgApps .dock-item')") &&
    !fnBody.includes("querySelectorAll('#dock .dock-item')"));
ok('启动链不再声称「刷新后重画 Dock 固定项」',
    !/Dock 固定项也要按持久化的图标包重画/.test(H));

/* ④ 原貌骨架没被误伤：底板 / 分隔 / 倒影 / 放大 / 超椭圆 */
ok('34px 胶囊底板 + 自研液态玻璃仍在',
    /#dock \{[\s\S]{0,700}?border-radius: 34px/.test(H) && H.includes('#dock.n26-liquid-on'));
ok('4 条 dock-separator 仍在', (dock.match(/class="dock-separator/g) || []).length === 4);
ok('macOS 式镜面倒影仍在',
    /\.dock-item img, \.dock-item > i \{[\s\S]{0,200}?-webkit-box-reflect/.test(H));
ok('悬停放大手感仍在', C.includes('--dock-mag') && H.includes('initDockMagnification'));
ok('超椭圆裁切源 #n26Squircle 仍在', H.includes('n26Squircle'));

/* ⑤ 共享层戳：改了 ui/n26-shell.css 不 bump 等于没改 */
const stamp = H.match(/n26-shell\.css\?v=(\d+)/);
ok('n26-shell.css 版本戳已 bump', !!stamp && Number(stamp[1]) >= 251, stamp ? 'v=' + stamp[1] : '未找到');

/* ⑤b 系统风格：已固定为 macOS · Dock（不再提供切换），遗留 osStyle 必须被清理 */
ok('系统风格固定 macOS · Dock（遗留切换已清理）',
    H.includes('function n26PurgeLegacyOSStyle') && !H.includes("n26SetOSStyle('mac')"));

/* ⑥ v2.9.80：首次进入构建动画已按用户要求整体下线，启动链零 firstboot 资源。
   预隐藏 CSS 曾因版本戳未 bump 一直吃旧缓存，让 #dock 永久 opacity:0 —— 别再挂回去。 */
ok('首次进入构建动画挂载已彻底移除',
    !/ui\/n26-firstboot\.css\?v=/.test(hCode) &&
    !/ui\/n26-fb-core\.js\?v=/.test(hCode) &&
    !/ui\/n26-firstboot\.js\?v=/.test(hCode));
ok('OS 切换过渡类不再隐藏底栏（opacity 钉死为 1）',
    /body\.os-transitioning\s+#dock[\s\S]{0,220}opacity:\s*1\s*!important/.test(hCode) &&
    !/body\.os-transitioning[\s\S]{0,220}#dock[\s\S]{0,60}opacity:\s*0\s*!important/.test(hCode));
ok('applyOSStyle 不再挂 os-transitioning 预隐藏类',
    !/classList\.add\('os-transitioning'\)/.test(hCode));

/* ⑦ 内联脚本语法 */
const segs = [...H.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(m => !/\btype\s*=/i.test(m[1]));
let bad = 0;
segs.forEach(m => {
    try { new Function(m[2]); }
    catch (e) { bad++; console.log('    语法失败: ' + e.message.slice(0, 100)); }
});
ok('主壳内联脚本语法', bad === 0, segs.length + ' 段，失败 ' + bad);

/* ⑧ v2.9.81 超椭圆回归 —— 逐个遍历 #dock 里的每个图标节点。
   失败模式：clip-path: url(#n26Squircle) 与 border-radius 同时作用时，最终轮廓取
   两者的交集，圆角会把超椭圆重新切回普通圆角（Dock 图标变圆角的真正原因）。
   断言：除品牌 N（无底板、轮廓由透明 PNG 自带，设计豁免）外，每个图标节点都必须
   有 url(#n26Squircle) 裁切源，且半径被 border-radius: 0 !important 规则压掉。 */
const squircleRule = /clip-path:\s*url\(#n26Squircle\)/;
const zeroRules = [...C.matchAll(/([^{}]+)\{([^}]*border-radius:\s*0\s*!important[^}]*)\}/g)]
    .map(m => m[1]);
const clipRuleFor = sel => {
    const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^{}]*\\{[^}]*clip-path:\\s*url\\(#n26Squircle\\)');
    return re.test(C);
};

const dockNodes = [];
for (const m of dock.matchAll(/<div class="([^"]*dock-icon-wrap[^"]*)"[^>]*>/g)) {
    const cls = m[1];
    dockNodes.push({
        label: cls.includes('dock-plate-n') ? '品牌 N 底板' : (cls.includes('dock-plate-search') ? '聚焦搜索底板' : '图标底板'),
        kind: cls.includes('dock-plate-n') ? 'brand-wrap' : (cls.includes('dock-plate-search') ? 'plate' : 'wrap'),
        exempt: cls.includes('dock-plate-n')
    });
}
const imgCount = (dock.match(/<img class="n26-dock-img"/g) || []).length;
for (let i = 0; i < imgCount; i++) dockNodes.push({ label: 'n26-dock-img #' + (i + 1), kind: 'img', exempt: false });
if (/dock-plate-n[^>]*><img/.test(dock)) dockNodes.push({ label: '品牌 N 图形', kind: 'brand-img', exempt: false });

let nodeBad = 0;
dockNodes.forEach(n => {
    let clipOk, radiusOk = true;
    if (n.kind === 'brand-wrap') {
        clipOk = /#dock .dock-item > .dock-icon-wrap\.dock-plate-n[\s\S]{0,160}clip-path:\s*none/.test(C);
    } else if (n.kind === 'img') {
        clipOk = clipRuleFor('.n26-dock-img');
        radiusOk = zeroRules.some(s => s.includes('.n26-dock-img'));
    } else if (n.kind === 'brand-img') {
        clipOk = /#dock .dock-item > .dock-icon-wrap\.dock-plate-n > img[\s\S]{0,260}clip-path:\s*url\(#n26Squircle\)/.test(C);
    } else {
        clipOk = clipRuleFor('#dock .dock-item > .dock-icon-wrap.dock-plate');
        radiusOk = zeroRules.some(s => s.includes('.dock-icon-wrap')) * 1 > 0;
    }
    if (!(clipOk && radiusOk)) nodeBad++;
    console.log('    · ' + n.label + ' → clip:' + (n.kind === 'brand-wrap' ? 'none(无底板)' : (clipOk ? 'url(#n26Squircle)' : '缺失'))
        + ' · radius:' + (radiusOk ? '0' : '未归零'));
});
ok('Dock 每个图标节点均由超椭圆决定轮廓（' + dockNodes.length + ' 个节点）',
    dockNodes.length >= 6 && nodeBad === 0, nodeBad ? nodeBad + ' 个节点不合格' : '');
ok('超椭圆与半径取自同一份 ui/n26-shell.css', squircleRule.test(C) && zeroRules.length > 0);

console.log('\n=== 结果 ===');
console.log(fail === 0
    ? '  ✓ 全部通过 · Dock 品牌原貌完好 · 未启动任何浏览器'
    : '  ✗ 失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
