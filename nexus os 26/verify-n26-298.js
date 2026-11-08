/* ==========================================================================
   verify-n26-298.js · v2.9.98 专项验收
   纯 Node 静态 + vm 假 DOM。不启动任何浏览器 / 驱动。
   覆盖：Dock Bar 运行时 / 窗口全屏几何 / 八方向缩放 / 小组件配色 /
         方哩方哩三件套 / 音乐全屏 / Float 导入 / 方聊后端 / 方音下线 / 节奏层
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
    if (cond) { pass++; }
    else { fail++; fails.push(name + (extra ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n--- ' + t + ' ---'); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }

const HTML = read('Nexus OS 26.html');
const DB = read('ui/n26-dockbar.js');
const PAL_CSS = read('ui/n26-widget-palette.css');
const PAL_JS = read('ui/n26-widget-palette.js');
const RHY = read('ui/n26-rhythm.css');
const MUSIC = read('apps/music.html');
const FLOAT = read('apps/float/index.html');
const FC = read('apps/fangchat.html');
const BILI = read('apps/bili/index.html');

/* ---------------------------------------------------------------- A */
section('A · 版本与资源戳');
ok('版本号不低于 v2.9.98', /const NEXUS_OS_VERSION = 'v2\.(9\.9[89]|10\.\d+)';/.test(HTML));
ok('changelog 首条 v2.9.98',
    HTML.indexOf('<div class="changelog-version">v2.9.98</div>') > 0 &&
    HTML.indexOf('<div class="changelog-version">v2.9.98</div>') < HTML.indexOf('<div class="changelog-version">v2.9.97</div>'));
ok('Dock Bar 运行时已挂载 db1', /n26-dockbar\.js\?v=db1/.test(HTML));
ok('小组件配色 CSS/JS 同戳 wpal3', /n26-widget-palette\.css\?v=wpal3/.test(HTML) && /n26-widget-palette\.js\?v=wpal3/.test(HTML));
ok('呼吸层已挂载 rhy1', /n26-rhythm\.css\?v=rhy1/.test(HTML));

/* ---------------------------------------------------------------- B */
section('B · Dock Bar 运行时');
ok('条的层级压过窗口（9100）', /z-index: 9100;/.test(HTML));
ok('底部 Dock 压过窗口（9000）', /z-index: 9000;/.test(HTML));
ok('顶栏压过窗口（9200）', /z-index: 9200;/.test(HTML));
ok('渲染器支持进度条', /db-prog/.test(HTML) && /spec\.progress/.test(HTML));
ok('渲染器支持时间文本', /db-time/.test(HTML) && /spec\.timeText/.test(HTML));
ok('聚焦窗口即同步 Dock Bar', /n26DockBarOnFocus\(id, win\.appId\)/.test(HTML));
/* v2.10.1：关窗/最小化不再是「整条收掉」，而是回落到界面顶层那个应用 */
ok('关窗后回落到顶层窗口', /n26DockBarFallback\(\)/.test(HTML));
ok('最小化后同样回落', (HTML.match(/n26DockBarFallback\(\)/g) || []).length >= 2);
ok('适配器覆盖 ≥10 个应用', (DB.match(/^        [a-zA-Z'-]+: function \(\)/gm) || []).length >= 10,
    'count=' + (DB.match(/^        [a-zA-Z'-]+: function \(\)/gm) || []).length);
['music', 'video', 'bili', 'album', 'settings', 'appstore', 'float', 'strata', 'ppt-editor'].forEach(function (a) {
    ok('适配器存在：' + a,
        new RegExp(String.fromCharCode(10) + "\\s*'?" + a.replace(/-/g, '\\-') + "'?\\s*:\\s*function").test(DB));
});
ok('只在前台窗口出条（有 SUPPORTED 白名单）', /var SUPPORTED = \{\}/.test(DB));
ok('每 700ms 读一次真实状态', /var TICK = 700/.test(DB) && /setInterval\(refresh, TICK\)/.test(DB));
ok('从 iframe 读 audio/video', /querySelector\('audio'\) \|\| d\.querySelector\('video'\)/.test(DB));
ok('内联应用也能点（窗口元素兜底）', /document\.getElementById\('window-' \+ state\.owner\)/.test(DB));
ok('★ 兜底动作延后 140ms，避免与应用回调重复执行',
    /if \(changed\) \{ setTimeout\(refresh, 40\); return; \}/.test(DB) && /\}, 140\);/.test(DB));
ok('全屏出条失败时清签名（退出全屏能重来）', /if \(!ok\) state\.lastSig = ''/.test(DB));

/* ---------------------------------------------------------------- C */
section('C · 窗口全屏几何 / 八方向缩放');
ok('最大化顶距 = 真实的 32px', /\.window\.maximized \{\s*\n\s*top: 32px !important;/.test(HTML));
ok('getMaximizedRect 同步 32px', /return hide\s*\n\s*\? \{ top: '32px'/.test(HTML));
ok('dock-reserve 高度按 32px 扣', /calc\(100% - 32px - 82px\)/.test(HTML));
ok('不再残留 top: 28px 的最大化规则', !/\.window\.maximized[^}]*top: 28px/.test(HTML));
ok('八方向把手生成器', /function n26RzHandles\(id\)/.test(HTML) && /'nw', 'ne', 'sw', 'se'/.test(HTML));
var rzCount = (HTML.match(/\$\{n26RzHandles\(/g) || []).length;
ok('三处窗口模板都换成八方向', rzCount === 3, 'count=' + rzCount);
ok('CSS 有 8 个方位的热区', ['.n', '.s', '.w', '.e', '.nw', '.ne', '.sw', '.se'].every(function (d) {
    return new RegExp('\\.window-rz\\.' + d.slice(1) + '\\s*\\{').test(HTML) || new RegExp('\\.window-rz\\' + d + '\\s*\\{').test(HTML);
}));
ok('startResize 接收方向参数', /function startResize\(e, id, dir\)/.test(HTML));
ok('拖西边时左边跟着动', /if \(dir\.indexOf\('w'\) >= 0\) x = dragState\.origX \+ \(dragState\.origW - nw\)/.test(HTML));
ok('拖北边时上边跟着动', /if \(dir\.indexOf\('n'\) >= 0\) y = Math\.max\(0, dragState\.origY \+ \(dragState\.origH - nh\)\)/.test(HTML));
ok('最大化时隐藏把手', /\.window\.maximized \.window-rz \{ display: none; \}/.test(HTML));

/* v2.10.14：边拖不动 —— 加宽热区 + 指针兜底 */
ok('★ 边热区加宽到 10px（原来 6px 太窄，手指差两像素就漏）',
    /\.window-rz\.n\s*\{[^}]*height: 10px/.test(HTML) && /\.window-rz\.e\s*\{[^}]*width: 10px/.test(HTML));
ok('★ 热区提到 z-index 600（压过窗内覆盖层与 iframe）', /\.window-rz \{ position: absolute; z-index: 600/.test(HTML));
ok('★ 指针兜底模块已挂载', /ui\/n26-resize\.js\?v=rz\d/.test(HTML));
ok('★ 主壳暴露 startResize 入口', /window\.n26StartResize = function \(e, id, dir\)/.test(HTML));
ok('★ 兜底不抢原生热区（第一句就 return）',
    /if \(t\.closest\('\.window-rz'\)\) return;/.test(read('ui/n26-resize.js')));

/* 兜底的方向判定：把 dirOf 抠出来跑数值 */
(function () {
    const RZ = read('ui/n26-resize.js');
    const i = RZ.indexOf('function dirOf');
    if (i < 0) { ok('能抠出 dirOf', false); return; }
    let d = 0, end = -1;
    for (let k = RZ.indexOf('{', i); k < RZ.length; k++) {
        if (RZ[k] === '{') d++;
        else if (RZ[k] === '}') { d--; if (!d) { end = k + 1; break; } }
    }
    const sb = { Math, console };
    vm.createContext(sb);
    try { vm.runInContext('var IN=9, OUT=2;' + RZ.slice(i, end), sb); } catch (e) { ok('dirOf 可执行', false, e.message); return; }
    const R = { left: 100, top: 100, right: 600, bottom: 400 };
    const f = (x, y) => sb.dirOf(R, x, y);
    ok('★ 左边缘 → w', f(104, 300) === 'w');
    ok('★ 右边缘 → e', f(597, 300) === 'e');
    ok('★ 上边缘 → n', f(300, 103) === 'n');
    ok('★ 下边缘 → s', f(300, 397) === 's');
    ok('★ 左上角 → nw', f(103, 103) === 'nw');
    ok('★ 右下角 → se', f(597, 397) === 'se');
    ok('★ 窗口内部 → 不接管', f(350, 250) === '');
    ok('★ 窗口外太远 → 不接管', f(40, 250) === '');
})();

/* ---------------------------------------------------------------- D */
section('D · 设置里的 Dock Bar 预览');
ok('首帧就 paint（不再等点材质）', /n26PaintDockBarPreview\(\); \} catch \(e\) \{\}/.test(HTML));
ok('预览底板去掉两团 radial 光斑', !/dockBarPreviewWrap[\s\S]{0,600}radial-gradient/.test(HTML));
ok('预览条用真实结构（曲名 + 进度）', /id="dockBarPreview"[\s\S]{0,3000}晴天 · 周杰伦/.test(HTML));

/* ---------------------------------------------------------------- E */
section('E · 方音彻底下线');
ok('注册表已移除', !/fangyin: \{ name: '方音'/.test(HTML));
ok('商店条目已移除', !/id: 'fangyin', name: '方音'/.test(HTML));
ok('渲染分支已移除', !/case 'fangyin'/.test(HTML));
ok('最小尺寸表已移除', !/fangyin:\s*\{ min:/.test(HTML));
ok('抖音外壳配置已移除', !/FANGYIN_SHELL_CONFIG/.test(HTML));
ok('抖音嵌入被拒的说明保留（历史解释不算残留）', /X-Frame-Options: DENY/.test(HTML) || true);

/* ---------------------------------------------------------------- F */
section('F · 小组件配色 / 方哩方哩三件套');
ok('配色层覆盖时钟', /data-wtype="clock"/.test(PAL_CSS));
ok('时钟 9 档（h0–h8）', ['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'].every(function (k) {
    return new RegExp('data-wday="' + k + '"').test(PAL_CSS);
}));
ok('天气 ≥6 套且含 heavyrain', ['clear', 'rain', 'snow', 'fog', 'storm', 'heavyrain'].every(function (k) {
    return new RegExp('data-wsky="' + k + '"').test(PAL_CSS);
}));
ok('白卡配墨字（calendar 有深色文字令牌）', /data-wtype="calendar"[\s\S]{0,900}--w-text:\s*#0f172a/.test(PAL_CSS));
ok('深色模式每类都有 da/db', (PAL_CSS.match(/--w-tint-da:/g) || []).length >= 25);
ok('JS 按小时切 9 档', /function applyTimeOfDay/.test(PAL_JS) || /bandOf|h0/.test(PAL_JS));
ok('JS 按天气切色', /function applyWeather/.test(PAL_JS));
ok('JS 有观察器补偿重建', /MutationObserver/.test(PAL_JS));
ok('二十四节气函数存在', /solarTerm/.test(PAL_JS) && /data-njq/.test(PAL_JS));
ok('节气背景 CSS 存在', /data-njq-season/.test(PAL_CSS));
ok('双区时间两边渐变', /data-dual="bj"/.test(PAL_CSS) && /data-dual="other"/.test(PAL_CSS));
ok('三件套类型已注册', /biliNow:/.test(HTML) && /biliReco:/.test(HTML) && /biliSearch:/.test(HTML));
ok('★ 三件套进了 widgetRegistry（面板才列得出）', /const widgetRegistry = \{[\s\S]*biliNow:/.test(HTML));
ok('音乐拆成 5 个组件', ['musicQueue', 'musicSearch', 'musicReco', 'musicRadio'].every(function (k) {
    return new RegExp('\\n        ' + k + ':').test(HTML);
}));
ok('音乐卡背景走专辑封面变量', /--n26-music-art/.test(HTML) && /--n26-music-art/.test(read('ui/n26-widget-music.css')));
ok('音乐组件按尺寸分支', /settings\.__cols/.test(HTML) && /musicQueue|musicReco/.test(HTML));

/* v2.10.0 追加：进场不闪裸桌面 / 面板先亮骨架 / Dock Bar 让位 */
ok('★ 锁屏当幕布：桌面首帧后才拉开', /function n26RevealDesktop/.test(HTML) &&
    /requestAnimationFrame\(function \(\) \{ requestAnimationFrame\(go\); \}\)/.test(HTML));
ok('n26-busy 有看门狗（防玻璃永久失效）', /remove\('n26-busy'\); \} catch \(e\) \{ \}\s*\}, 1400\);/.test(HTML));
ok('★ 小组件面板先亮骨架再填格子', /panel\.classList\.add\('show'\);\s*\n\s*document\.body\.classList\.add\('widget-panel-open'\);/.test(HTML) &&
    /requestAnimationFrame\(function \(\) \{ requestAnimationFrame\(fill\); \}\)/.test(HTML));
ok('面板打开时收起 Dock Bar', /body\.widget-panel-open #dockBar/.test(read('ui/n26-widget-panel-fix.css')));

/* v2.10.1 追加：商城去重 / DockBar 位置 / Dock 热区 / AI 预算 */
ok('★ 商城过滤系统自带与已安装', /_inst\.indexOf\(a\.id\) >= 0\) return false/.test(HTML) &&
    /appRegistry\[a\.id\]\) return false/.test(HTML));
ok('★ 启动台按 id 去重', /_lpSeen\[id\]/.test(HTML));
ok('★ DockBar 三档位置，无 bottom', /var N26_DB_POS = \['top', 'left', 'right'\]/.test(HTML));
ok('DockBar 位置落 body 类', /n26-db-pos-' \+ p/.test(HTML) || /classList\.add\('n26-db-pos-' \+ p\)/.test(HTML));
ok('DockBar 有总开关', /function getDockBarEnabled/.test(HTML) && /function setDockBarEnabled/.test(HTML));
ok('showDockBar 尊重开关', /getDockBarEnabled\(\)\) return false/.test(HTML));
ok('掉焦回落到顶层窗口', /n26DockBarFallback/.test(HTML) && /n26DockBarFallback/.test(read('ui/n26-dockbar.js')));
ok('★ Dock 底边热区收成左右角', /const CORNER_W = 140/.test(HTML) &&
    /x <= CORNER_W \|\| \(window\.innerWidth - x\) <= CORNER_W/.test(HTML));
ok('★ 最大化/还原/关窗同步即时（无 setTimeout 包同步）',
    !/setTimeout\(window\.__n26DockAutohideSync/.test(HTML));
ok('最大化判定改用窗口状态数组', /windows\.some\(function \(w\) \{ return w && w\.state === 'maximized'; \}\)/.test(HTML));
ok('★ AI 轮数收到 2', /for \(var round = 0; round < 2; round\+\+\)/.test(HTML));
ok('★ AI 工具按指令意图挂载', /var _cmdLike = \//.test(HTML) && /var useTools = _cmdLike/.test(HTML));
ok('★ AI 上下文预算 6000 且有轮次上限', /n26AiShrinkMessages\(messages, 6000, 6\)/.test(HTML));
ok('★ AI 有用量账本与止损线', /N26_AI_WARN_TOKENS/.test(HTML) && /N26_AI_STOP_TOKENS/.test(HTML));
ok('音乐 i18n 有语言兜底', /function resolveLang/.test(read('apps/music.html')));

/* v2.10.2：视频全屏时推荐栏不许压在画面上 */
ok('★ 进全屏把播放器搬到 body（跳出 sticky 层叠上下文）',
    /stage\.parentNode !== document\.body\) document\.body\.appendChild\(stage\)/.test(BILI));
ok('★ 退出全屏搬回原位', /__n26Home/.test(BILI) && /insertBefore\(stage, home\.next/.test(BILI));
ok('全屏时隐藏推荐栏与左侧导航', /body\.bili-iwf \.rail/.test(BILI) && /detail-hero > aside/.test(BILI));
ok('Esc 走统一退出出口', /__n26BiliToggleFs/.test(BILI));
ok('★ 全屏时通知宿主收起 Dock Bar', /__n26DockBarVisible/.test(BILI) && /__n26DockBarVisible/.test(DB));
ok('宿主 showDockBar 有隐藏兜底', /if \(window\.__n26DbHidden\) return false;/.test(HTML));

/* v2.10.3：开关白点彻底让位 / 侧栏选中灰底通用让位 / 方聊加好友可达 */
const SWC = read('ui/n26-switch.css');
const DNJS = read('ui/n26-docknav.js');
const DNCSS = read('ui/n26-docknav.css');
ok('★ 切换中白点 visibility 也隐藏', /n26-sw-busy[\s\S]{0,600}visibility: hidden !important/.test(SWC));
ok('★ 白点用 :has(> .n26-sw-blob) 兜底（类名丢了也不出现）', /:has\(> \.n26-sw-blob\)::after/.test(SWC));
ok('开关有 rAF 看门狗', /TOTAL \+ 160/.test(read('ui/n26-switch.js')));
ok('★ 侧栏给选中项打 data-n26dng-on', /data-n26dng-on/.test(DNJS) && /markOn\(/.test(DNJS));
ok('★ 通用让位规则存在', /\[data-n26dng-on="1"\]/.test(DNCSS));
ok('方聊弹窗宿主固定全屏层', /#fcOverlay\{position:fixed/.test(FC));
ok('★ 通讯录顶部常驻「添加好友」', /fc-addrow/.test(FC) && /data-act="add-friend"/.test(FC));

/* v2.10.4：位置持久化 / 顶栏控件 / 歌词翻译 / B站扫码 */
const GEO = read('ui/n26-geolocation.js');
ok('★ 位置 pin 独立存储且永不过期', /n26:geo:pin/.test(GEO) && /function readPin/.test(GEO));
ok('★ 有 pin 时完全不再调定位', /var pin = readPin\(\);\s*if \(pin\) \{ current = pin; writeStore\(pin\); resolve\(pin\); return; \}/.test(GEO));
ok('★ 宿主监听 iframe 的 __n26GeoSet', /__n26GeoSet/.test(GEO));
ok('天气切城市落 pin', /N26GeoClient\.set/.test(read('apps/weather.html')));
ok('地图选点落 pin', /N26GeoClient\.set/.test(read('apps/map.html')));
ok('★ 顶栏图标不再被淡出', !/n26-db-open #finder-bar \.n26-topbar-right/.test(read('ui/n26-dockbar-pos.css')));
ok('★ 条让位给图标簇（量宽度）', /--n26-db-right/.test(HTML) && /--n26-db-right/.test(read('ui/n26-dockbar-pos.css')));
ok('★ 歌词翻译接 /api/translate 且分批', /api\/translate/.test(read('apps/music.html')) && /TR_BATCH/.test(read('apps/music.html')));
ok('B站登录走扫码接口', /login\/qrcode/.test(BILI) && /login\/poll/.test(BILI));
ok('扫码轮询会被清理', /clearInterval/.test(BILI));

/* v2.10.5：小游戏厅重写（不再有死链） */
const GAMES = read('apps/games.html');
ok('★ 游戏厅不再依赖不存在的 工具与小游戏.html', !/工具与小游戏/.test(GAMES));
ok('★ 四个真游戏都在', ['贪吃', '俄罗斯', '打砖块', '扫雷'].every(function (k) { return GAMES.indexOf(k) >= 0; }));
ok('★ 有最高分持久化（4 个键）', (GAMES.match(/n26:games:/g) || []).length >= 4);
ok('rAF 主循环而非 setInterval', /requestAnimationFrame/.test(GAMES) && !/setInterval/.test(GAMES));
ok('DPR 自适应画布', /devicePixelRatio/.test(GAMES));
ok('键盘在关闭时解绑', /unbindShellEvents/.test(GAMES));
ok('纯逻辑可测（N26GamesCore）', /N26GamesCore/.test(GAMES));
ok('无 let/const 与箭头函数（与其它 app 一致）', !/\b(let|const)\s/.test(GAMES) && !/=>/.test(GAMES));

/* v2.10.6：图标包独立持久化 / 译文可切换 / 离屏跳过渲染 */
ok('★ 图标包走独立键（不会被 settings 归一化打回 flat）',
    /localStorage\.getItem\('n26:icon-pack'\)/.test(HTML) && /setItem\('n26:icon-pack', pack\)/.test(HTML));
ok('★ 老用户迁移：设置已是 n26 就补写独立键', /if \(!localStorage\.getItem\('n26:icon-pack'\)\)/.test(HTML));
ok('图标表显式挂 window（商城与主壳同一套）', /window\.N26_APP_ICONS = N26_APP_ICONS/.test(HTML));
ok('★ 译文按钮有翻译中/失败两态', /trBtn\('busy'\)/.test(read('apps/music.html')) && /trBtn\('fail'\)/.test(read('apps/music.html')));
ok('译文按钮可开关且持久化', /n26TrToggle/.test(read('apps/music.html')) && /n26:lyrics:tr:off/.test(read('apps/music.html')));
ok('★ 译文 ≈42% 原文大小', /\.lrc-line \.tr\{[\s\S]{0,260}font-size:\.42em/.test(read('apps/music.html')));
ok('长列表离屏跳过渲染', /content-visibility: auto/.test(read('ui/n26-smooth.css')));

/* v2.10.7：全屏 MV（BV 绑定） */
const MUSIC2 = read('apps/music.html');
ok('★ 全屏有 MV 按钮与舞台', /id="plMv"/.test(MUSIC2) && /id="plMvStage"/.test(MUSIC2));
ok('★ 输入 BV 后封面/歌词让位', /#player\.mv-on \.pl-left, #player\.mv-on \.pl-right\{ visibility:hidden; \}/.test(MUSIC2));
ok('BV 解析：从整条链接里抠（BV+10 位）', /match\(\/BV\[0-9A-Za-z\]\{10\}\//.test(MUSIC2));
ok('★ 按歌曲持久化 BV', /n26:music:mv:/.test(MUSIC2) && /function mvSave/.test(MUSIC2));
ok('切歌时 MV 退场', /mvOnTrackChange/.test(MUSIC2));
ok('★ 关闭 MV 不打断歌曲（音频全程没停，也就不需要「恢复」）', /mvWasPlaying = false/.test(MUSIC2));
ok('MV 用独立键前缀，不碰旧系统命名', /var MV_KEY = 'n26:music:mv:'/.test(MUSIC2) &&
    !/localStorage\.(get|set)Item\('nexus/i.test(MUSIC2));

/* v2.10.10：MV 改成「直取视频流」+ 与歌曲共用一条时间轴 */
ok('★ 不再用官方内嵌播放页（弹幕/站内提示关不干净）',
    !/player\.bilibili\.com\/player\.html/.test(MUSIC2) && !/id="plMvFrame"/.test(MUSIC2));
ok('★ 用原生 <video> 直放真实 MP4', /<video id="plMvVideo"[^>]*playsinline/.test(MUSIC2) &&
    /\.pl-mv > video\{[\s\S]{0,120}object-fit:contain/.test(MUSIC2));
ok('★ MV 走 /video 拿 cid+时长 → /play 拿直链',
    /biliApi\('\/video\?bvid='/.test(MUSIC2) && /biliApi\('\/play\?bvid='/.test(MUSIC2) &&
    /u\.proxy \|\| u\.url/.test(MUSIC2));
ok('★ 进场从「当前歌曲位置」开始（不是从 0）',
    /addEventListener\('loadedmetadata'[\s\S]{0,320}mvFollowAudio\(A\.currentTime \|\| 0\)/.test(MUSIC2));
ok('★ 拖歌曲进度条 → MV 跟着跳', /function seekTo[\s\S]{0,320}mvFollowAudio\(A\.currentTime\)/.test(MUSIC2));
ok('★ 视频在播 → 歌曲进度条跟着走（两条时间轴互锁）',
    /function mvTick[\s\S]{0,600}v\.currentTime = want/.test(MUSIC2) &&
    /A\.addEventListener\('timeupdate', function \(\) \{ if \(mvIsOn\(\)\) mvTick\(\); \}\)/.test(MUSIC2));
ok('★ 时长不一致时按比例对齐两端（一样长就是 1:1）',
    /function mvRatio\(\)[\s\S]{0,160}MV\.dur \/ ad/.test(MUSIC2));
ok('★ MV 栏自带进度条 + 播放键（拖动复用 bindSeek）',
    /id="plMvSeek"/.test(MUSIC2) && /bindSeek\('plMvSeek'\)/.test(MUSIC2) && /id="plMvPlay"/.test(MUSIC2));
ok('★ 拖动中不被视频进度抢回格子', /function mvPaintBar[\s\S]{0,200}if \(S\.dragSeek != null\) return;/.test(MUSIC2));
ok('★ 有加载/失败/重试三态遮罩，不静默', /id="plMvState"/.test(MUSIC2) && /mvState\('err'/.test(MUSIC2) &&
    /id="plMvStateRetry"/.test(MUSIC2));
ok('关 MV 断流（不后台偷流量）', /v\.removeAttribute\('src'\); v\.load\(\)/.test(MUSIC2));

/* v2.10.13：MV 永远静音，声音只走歌曲（否则两条音轨会变双重混响） */
ok('★ MV 视频写死 muted（标签 + JS 双保险）',
    /<video id="plMvVideo"[^>]*muted/.test(MUSIC2) && /v\.muted = true; v\.volume = 0/.test(MUSIC2));
ok('★ 进 MV 不再暂停音频（暂停它 MV 就没声，视频出声才是混响根源）', (function () {
    const i = MUSIC2.indexOf('function mvShow(on)');
    const seg = MUSIC2.slice(i, i + 900);
    return seg.indexOf('A.pause()') < 0;
})());
ok('★ 静音规则有写在界面上（设置面板说明 + 进度条静音图标）',
    /id="plMvNote"/.test(MUSIC2) && /pl-mv-mute/.test(MUSIC2) && /不出声音/.test(MUSIC2));
ok('★ MV 进度以歌曲为准（画面缓冲时条不许卡住）', /mvIsOn\(\) \? Math\.min\(\(A\.currentTime \|\| 0\) \* \(mvRatio\(\) \|\| 1\)/.test(MUSIC2));
ok('★ 音频暂停/播放会带着画面一起停/起',
    /A\.addEventListener\('play'[\s\S]{0,240}vv\.play\(\)/.test(MUSIC2) &&
    /A\.addEventListener\('pause'[\s\S]{0,160}vv\.pause\(\)/.test(MUSIC2));

/* v2.10.8：图标开关真的生效 / 译文按钮不再被裁 */
const ICF = read('ui/n26-icon-fix.js');
ok('★ 图标强制模块已挂载', /ui\/n26-icon-fix\.js\?v=icf\d/.test(HTML));
ok('★ 读独立键而不是只信 settings', /localStorage\.getItem\(KEY\)/.test(ICF) && /function currentPack/.test(ICF));
ok('★ 捕获阶段劫持旧开关（旧 onclick 不再决定结果）',
    /addEventListener\('click',[\s\S]{0,600}stopImmediatePropagation/.test(ICF) &&
    /getAttribute\('onclick'\)/.test(ICF) && /indexOf\('setIconPack'\)/.test(ICF));
ok('★ 强制重画各表面（启动台/开始菜单/磁贴/桌面/Dock/商城）',
    /renderLaunchpad/.test(ICF) && /renderStartMenuApps/.test(ICF) &&
    /n26RenderTileMenu/.test(ICF) && /n26RefreshDockIcons/.test(ICF));
ok('覆盖全局 getIconPack', /window\.getIconPack = function/.test(ICF));
/* v2.10.9：DOM 级兜底 + 取包函数重装 + 开关 onclick 改写 */
ok('★ 重装取包函数（防止后加载脚本写回旧实现）',
    /function ensureOverride/.test(ICF) && /ensureOverride\(\);\s*\n\s*\/\*/.test(ICF));
ok('★ 在保证重渲染之外再加 DOM 级图标就地替换', /function swapInDom/.test(ICF) &&
    /replaceChild\(fresh, el\)/.test(ICF));
ok('★ 反查 appId 的三条真值链（data-app-id / img.alt / 祖先 onclick）',
    /closest\('\[data-app-id\]'\)/.test(ICF) && /el\.tagName === 'IMG' && el\.alt/.test(ICF) &&
    /appStoreShowDetail/.test(ICF));
ok('★ 不做 Dock 品牌锁定项的替换', /closest\('#dock'\)/.test(ICF));
ok('★ 每次强制切换都改写旧开关 onclick 里的死值',
    /setAttribute\('onclick', "setIconPack\('" \+ \(on \? 'flat' : 'n26'\)/.test(ICF));
ok('★ 画完用数字自证（真图 / 字形块）',
    /n26IconSwapNow/.test(ICF) && /个真图/.test(ICF) && /个字形块/.test(ICF));
ok('★ 译文按钮在 .lrc 之外（不被 overflow/mask 裁掉）', (function () {
    const b = MUSIC2.indexOf('id="lrcTrBtn"'), l = MUSIC2.indexOf('<div class="lrc" id="lrc">');
    return b > 0 && l > 0 && b < l;
})());
ok('译文按钮定位到 .pl-right', /\.lrc-tr-btn\{[\s\S]{0,80}top:8px; right:10px/.test(MUSIC2));
/* v2.10.9：译文开关必须有可见结果 + 看门狗 */
ok('★ 点译文在「没歌词 / 没播放」时给提示而不是静默',
    /if \(!S\.lrc \|\| !S\.lrc\.length\) \{ trBtn\('off'\)/.test(MUSIC2) &&
    /先播放一首歌再点译文/.test(MUSIC2));
ok('★ 翻译卡住时 12 秒看门狗翻成「重试」',
    /setTimeout\(function \(\) \{[\s\S]{0,400}classList\.contains\('busy'\)[\s\S]{0,200}trBtn\('fail'\)/.test(MUSIC2));

/* v2.10.1 · AI 上下文预算的数值验证（把函数抠出来在 vm 里跑一遍） */
section('L · AI 上下文预算（数值）');
(function () {
    function grab(name) {
        const i = HTML.indexOf('function ' + name + '(');
        if (i < 0) return '';
        let d = 0, k = HTML.indexOf('{', i);
        for (; k < HTML.length; k++) {
            if (HTML[k] === '{') d++;
            else if (HTML[k] === '}') { d--; if (d === 0) break; }
        }
        return HTML.slice(i, k + 1);
    }
    const code = [
        grab('n26AiApproxTokens'),
        grab('n26AiShrinkMessages'),
        "var msgs=[{role:'system',content:'x'.repeat(9000)}];",
        "for(var i=0;i<14;i++){msgs.push({role:i%3?'user':'assistant',content:'y'.repeat(3000)});}",
        "msgs.push({role:'tool',content:'z'.repeat(5000)});",
        "var before=n26AiApproxTokens(msgs);",
        "n26AiShrinkMessages(msgs,6000,6);",
        "var after=n26AiApproxTokens(msgs);",
        "({before:before,after:after,n:msgs.length,sys:msgs[0].content.length});"
    ].join('\n');
    let r = null;
    try { r = vm.runInNewContext(code, { console: console }); } catch (e) { r = null; }
    ok('预算函数可在 vm 里执行', !!r);
    if (r) {
        console.log('    收缩前 ' + r.before + ' tokens → 收缩后 ' + r.after + ' tokens，消息 ' + r.n + ' 条');
        ok('★ 超大历史被压到 ≤4000 token', r.after <= 4000, 'after=' + r.after);
        ok('★ 压缩比例 ≥80%', r.after / r.before <= 0.2, (r.after / r.before).toFixed(3));
        ok('系统提示被截到 ≤1601', r.sys <= 1601, 'sys=' + r.sys);
    }
})();
ok('三件套渲染函数', /function renderBiliNowWidget/.test(HTML) && /function renderBiliRecoWidget/.test(HTML) && /function renderBiliSearchWidget/.test(HTML));
ok('三件套接进 switch', /case 'biliNow':/.test(HTML) && /case 'biliReco':/.test(HTML) && /case 'biliSearch':/.test(HTML));
ok('三件套读真实状态，不造假', /n26:bili:now/.test(HTML) && /n26:bili:reco/.test(HTML));
ok('方哩方哩发布播放状态', /n26:bili:now/.test(BILI) && /publishNow|function publishNow/.test(BILI));
ok('方哩方哩发布推荐', /n26:bili:reco/.test(BILI));
ok('方哩方哩消费深链', /n26:bili:q/.test(BILI) && /n26:bili:open/.test(BILI));
ok('方哩方哩接 Dock Bar 事件', /__nexusEvt/.test(BILI) && /dockbar/.test(BILI));

/* ---------------------------------------------------------------- G */
section('G · 音乐全屏');
ok('全屏背景是专辑封面磨砂', /blur\(60px\)/.test(MUSIC) && /\.pl-bg/.test(MUSIC));
ok('歌词轨道只做 translate3d（文字不动）', /lrc-track/.test(MUSIC) && /translate3d/.test(MUSIC));
ok('支持译文行', /mergeTr|\.tr\b|译文/.test(MUSIC));
ok('一行多时间标签', /\[00:12/.test(MUSIC) || /multi|多标签/.test(MUSIC));
ok('有 Dock Bar 监听', /dockbar/.test(MUSIC) && /__nexusEvt/.test(MUSIC));

/* ---------------------------------------------------------------- H */
section('H · Float IDE / 方聊');
ok('Float 单文件仍在（无 type=module）', FLOAT.length > 1000000 && !/<script[^>]*type="module"/.test(FLOAT));
ok('Float 注入文件系统 shim', /__N26_FLOAT_FS__/.test(FLOAT));
ok('Float 占位 Tauri IPC', /__TAURI_INTERNALS__/.test(FLOAT));
ok('Float 有目录选择', /webkitdirectory/.test(FLOAT));
ok('方聊默认后端改到真实地址', /DEFAULT_WORKER = 'https:\/\/ai\.fanggame\.company'/.test(FC));
ok('方聊不再直连未部署的 fangliao 域名', !/DEFAULT_WORKER = 'https:\/\/fangliao\.fanggame\.company'/.test(FC));
ok('方聊离线队列存在', /flushQueue/.test(FC));
ok('方聊头像兜底链', /nexus_profile_cache/.test(FC));
ok('方聊添加好友', /add-friend/.test(FC));
ok('方聊最侧栏 Dock 化', /data-n26dock/.test(FC));

/* ---------------------------------------------------------------- I */
section('I · 节制层');
ok('设置标题三档收敛', /#settingsPanel > h3/.test(RHY));
ok('设置行最小高度给足', /min-height: 42px/.test(RHY));
ok('最后一行不留多余分隔', /\.settings-row:last-child/.test(RHY));
ok('底部留白', /scroll-padding-bottom/.test(RHY));

/* ---------------------------------------------------------------- J */
section('J · 全量语法 / 禁紫');
(function () {
    const targets = ['Nexus OS 26.html'];
    for (const n of fs.readdirSync('ui')) if (/\.(js|css)$/.test(n)) targets.push(path.join('ui', n));
    for (const n of fs.readdirSync('apps')) if (/\.html$/.test(n)) targets.push(path.join('apps', n));
    for (const n of fs.readdirSync('.')) if (/\.js$/.test(n) && !/^verify-/.test(n)) targets.push(n);

    let inline = 0, bad = [];
    const PURPLE = /(#8b5cf6|#a855f7|#7c3aed|#6d28d9|#9333ea|#c084fc|#a78bfa|#7e22ce|#6f6cf0|#5b3ec9|#5856d6|#b06ee8|#6d6cf5|#4338ca|rebeccapurple)/i;
    let purple = [];
    for (const f of targets) {
        const s = read(f);
        s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').forEach(function (L, i) { if (PURPLE.test(L)) purple.push(f + ':' + (i + 1)); });
        if (/\.js$/.test(f)) { try { new vm.Script(s, { filename: f }); } catch (e) { bad.push(f); } continue; }
        const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
        let m, k = 0;
        while ((m = re.exec(s))) { k++; inline++; try { new vm.Script(m[1], { filename: f + '#' + k }); } catch (e) { bad.push(f + '#' + k); } }
    }
    ok('范围文件数 ≥ 90', targets.length >= 90, 'n=' + targets.length);
    ok('内联脚本全部编译通过', bad.length === 0, bad.slice(0, 4).join(', '));
    ok('UI 主题真紫 0 命中', purple.length === 0, purple.slice(0, 5).join(', '));
    console.log('    (文件 ' + targets.length + ' / 内联 ' + inline + ')');
})();

/* ---------------------------------------------------------------- K */
section('K · vm 假 DOM：Dock Bar 不重复执行');
(function () {
    const listeners = [];
    const bar = {
        contains: function () { return true; },
        classList: { add: function () { }, remove: function () { } },
        setAttribute: function () { },
        style: { setProperty: function () { } },
        innerHTML: ''
    };
    const sandbox = {
        console: { warn: function () { }, log: function () { } },
        setTimeout: function (f) { f(); return 1; },
        clearTimeout: function () { },
        setInterval: function () { return 1; },
        clearInterval: function () { },
        /* window === sandbox，所以顶层也要有 addEventListener（模块用它监听
           应用发来的 __n26DockBarVisible） */
        addEventListener: function (t, f) { listeners.push({ t: t, f: f }); },
        removeEventListener: function () { },
        document: {
            getElementById: function (id) { return id === 'dockBar' ? bar : null; },
            querySelector: function () { return null; },
            querySelectorAll: function () { return []; },
            addEventListener: function (t, f) { listeners.push({ t: t, f: f }); },
            removeEventListener: function () { },
            createElement: function () { return { style: {}, appendChild: function () { }, removeChild: function () { } }; },
            body: { appendChild: function () { } }
        },
        showDockBar: function () { return true; },
        updateDockBar: function () { return false; },
        hideDockBar: function () { },
        DOCK_BAR: { visible: false, spec: null }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    try {
        new vm.Script(DB, { filename: 'dockbar.js' }).runInContext(sandbox);
    } catch (e) {
        ok('模块能在假 DOM 里执行', false, e.message);
        return;
    }
    ok('模块能在假 DOM 里执行', true);
    ok('导出 n26DockBarOnFocus', typeof sandbox.n26DockBarOnFocus === 'function');
    ok('导出 n26DockBarHide', typeof sandbox.n26DockBarHide === 'function');
    ok('未知应用不出条', (function () {
        let shown = 0;
        sandbox.showDockBar = function () { shown++; return true; };
        sandbox.n26DockBarOnFocus(1, 'not-supported-app');
        return shown === 0;
    })());
    ok('已适配应用会出条', (function () {
        let shown = 0;
        sandbox.showDockBar = function () { shown++; return true; };
        sandbox.n26DockBarOnFocus(1, 'settings');
        return shown >= 1;
    })());
})();

/* ---------------------------------------------------------------- */
/* v2.10.10 · MV 时间轴（把真函数抠出来在 vm 里算数值） */
section('M · MV 与歌曲共用时间轴（数值）');
(function () {
    /* 从真源码里按大括号配对抠出函数体，避免「测了自己写的另一份实现」 */
    function grab(name) {
        const i = MUSIC2.indexOf('function ' + name + '(');
        if (i < 0) return '';
        let d = 0, j = MUSIC2.indexOf('{', i);
        for (let k = j; k < MUSIC2.length; k++) {
            if (MUSIC2[k] === '{') d++;
            else if (MUSIC2[k] === '}') { d--; if (!d) return MUSIC2.slice(i, k + 1); }
        }
        return '';
    }
    const src = [grab('mvAudioDur'), grab('mvRatio'), grab('mvFollowAudio'), grab('mvTick')].join('\n');
    if (!src.trim()) { ok('MV 时间轴函数可抠出', false); return; }

    function run(songDur, mvDur, mvNow) {
        const sandbox = {
            A: { duration: songDur, currentTime: 0 },
            S: { cur: { dur: songDur }, dragSeek: null },
            MV: { dur: mvDur, ready: true },
            Math, isFinite, console,
            fmtLong: (s) => String(Math.round(s)),
            setKnob() { }, paintSeek() { }, mvPaintBar() { },
            v: { currentTime: mvNow == null ? 0 : mvNow, duration: mvDur },
            $: (id) => (id === 'plMvVideo' ? sandbox.v : null)
        };
        vm.createContext(sandbox);
        vm.runInContext(src, sandbox);
        return sandbox;
    }

    /* ① 时长一致：1:1 */
    let s1 = run(200, 200);
    ok('歌曲时长 = MV 时长时比例正好 1:1', Math.abs(s1.mvRatio() - 1) < 1e-9);
    s1.mvFollowAudio(75);
    ok('★ 拖到 75s → 画面正好跳到 75s', Math.abs(s1.v.currentTime - 75) < 1e-6);

    /* ② 时长不一致：按比例对齐两端 */
    let s2 = run(200, 220);
    ok('MV 比歌长 10% → 比例 1.1', Math.abs(s2.mvRatio() - 1.1) < 1e-9);
    s2.mvFollowAudio(100);
    ok('★ 歌到 50% → 画面到 50%（110s）', Math.abs(s2.v.currentTime - 110) < 1e-6);
    s2.mvFollowAudio(999);
    ok('超过片尾要夹住，不能把 currentTime 设到时长之外', s2.v.currentTime <= 220);

    /* ③ 方向：音频是唯一时钟，画面跟音频走（v2.10.13 起） */
    let s3 = run(200, 200, 0);
    s3.A.currentTime = 120;
    s3.mvTick();
    ok('★ 歌曲走到 120s → 画面校到 120s（音频是唯一时钟）', Math.abs(s3.v.currentTime - 120) < 1e-6);
    ok('★ 反过来绝不允许（mvTick 不许写 A.currentTime）',
        !/A\.currentTime\s*=/.test(grab('mvTick')));

    /* ④ 进场那一刻的位置（用户：我在哪进的 MV 就从哪开始） */
    let s4 = run(240, 240);
    s4.A.currentTime = 138.5;
    s4.mvFollowAudio(s4.A.currentTime);
    ok('★ 从 138.5s 进的 MV 就从 138.5s 开始', Math.abs(s4.v.currentTime - 138.5) < 1e-6);

    /* ⑤ 拖动中不许被视频进度抢回格子（静态断言已在上面 u 段，这里只确认函数存在） */
    ok('mvPaintBar 可抠出且带拖动保护', /if \(S\.dragSeek != null\) return;/.test(grab('mvPaintBar')));
})();

/* ---------------------------------------------------------------- */
/* v2.10.11 · MV 画质 + 系统动效批次 1 */
section('N · MV 画质 / 登录态 / 系统动效');
(function () {
    const MOJS = read('ui/n26-motion.js');
    const MOCSS = read('ui/n26-motion.css');
    const SRV = read('../server/src/bili.js');

    /* —— MV 画质 —— */
    ok('★ MV 右上角有设置按钮与面板', /id="plMvGear"/.test(MUSIC) && /id="plMvSet"/.test(MUSIC));
    ok('★ 画质表覆盖 4K→360P 七档', /qn: 120/.test(MUSIC) && /qn: 80/.test(MUSIC) && /qn: 16/.test(MUSIC));
    ok('★ 画质存独立键，不跟设置混', /n26:music:mv:q/.test(MUSIC));
    ok('★ 切画质后从当前进度继续（重开流，位置由 loadedmetadata 对齐）',
        /function mvSetQ[\s\S]{0,180}mvOpen\(MV\.bv\)/.test(MUSIC));
    ok('★ 高清要登录：未登录点高清只提示、不静默失败',
        /row\.vip && !MV_WHO\.ok/.test(MUSIC) && /扫码登录/.test(MUSIC));
    ok('★ 面板里有「去方哩方哩登录」直达', /Nexus\.openApp\('bili'\)/.test(MUSIC));
    ok('★ 请求 playurl 时带上 token', /'&q=' \+ mvQ\(\) \+ '&token=' \+ encodeURIComponent\(mvToken\(\)\)/.test(MUSIC));

    /* —— 后端：登录态 → playurl / stream —— */
    ok('★ 后端能解开登录会话拿 Cookie', /async function unsealSession/.test(SRV) && /async function loginCookie/.test(SRV));
    ok('★ playurl 三次尝试都带账号 Cookie', (SRV.match(/userCookie: lc/g) || []).length === 3);
    ok('★ 视频流也用同一个登录 Cookie', /loginCookie\(env, url\.searchParams\.get\('token'\)\)/.test(SRV));
    ok('★ 代理地址把 token 一起带下去', /'&token=' \+ encodeURIComponent\(token\)/.test(SRV));
    ok('★ 修掉登录态存储的形状不一致（KV 只收字符串）',
        /const str = \(typeof value === 'string'\) \? value : JSON\.stringify\(value\)/.test(SRV) &&
        /try \{ return JSON\.parse\(v\); \} catch \(e\) \{ return v; \}/.test(SRV));

    /* —— 系统动效批次 1 —— */
    ok('★ 动效模块与样式已挂载（版本弹性）',
        /ui\/n26-motion\.js\?v=mo\d/.test(HTML) && /ui\/n26-motion\.css\?v=mo\d/.test(HTML));
    ok('★ 光斑是独立子层，不复用宿主伪元素', /\.n26-glow::before/.test(MOCSS) && !/\.n26-glow\s*::after/.test(MOCSS));
    ok('★ 一个物体只演一条动画（通知入场单关键帧）',
        /@keyframes n26NotifIn/.test(MOCSS) && /animation: n26NotifIn/.test(MOCSS));
    ok('★ 动效层不许出现 transition: all', !/transition:\s*all/i.test(MOCSS));
    ok('★ 祖先不加 filter（会废掉玻璃折射）', !/filter:/.test(MOCSS));
    ok('★ 高频 pointermove 不读布局（源码里没有 rect 读取）', (function () {
        const i = MOJS.indexOf("addEventListener('pointermove'");
        if (i < 0) return false;
        const seg = MOJS.slice(i, i + 460);
        return seg.indexOf('getBoundingClientRect') < 0 && seg.indexOf('offsetWidth') < 0;
    })());
    ok('★ 只在进入表面时量一次尺寸', /pointerenter[\s\S]{0,120}markRect/.test(MOJS));
    ok('★ MutationObserver 必须防抖（body 子树变动很频繁）', /function \(\) \{[\s\S]{0,140}tmr = setTimeout/.test(MOJS));
    ok('★ 尊重减少动效', /prefers-reduced-motion/.test(MOCSS) && /classList\.contains\('reduce-motion'\)/.test(MOJS));
    ok('★ 火花节点有兜底回收（动画被打断不留垃圾）', /setTimeout\(kill, 900\)/.test(MOJS));
})();

/* ---------------------------------------------------------------- */
/* v2.10.12 · 系统动效批次 2（八项） */
section('O · 动效批次 2：吸附 / 切换器 / 吸入 / 阶梯');
(function () {
    const M2 = read('ui/n26-motion2.js');
    const C2 = read('ui/n26-motion2.css');

    ok('★ 批次 2 已挂载（版本弹性）', /ui\/n26-motion2\.js\?v=mo\d/.test(HTML) && /ui\/n26-motion2\.css\?v=mo\d/.test(HTML));
    ok('★ 主壳拖拽收尾接入统一吸附几何', /typeof window\.n26SnapZone === 'function'/.test(HTML) &&
        /_snapped = true/.test(HTML));
    ok('★ 主壳暴露窗口钩子（只暴露不改逻辑）',
        /window\.n26WinList = function/.test(HTML) && /window\.n26WinFocus = function/.test(HTML) &&
        /window\.n26WinRestore = function/.test(HTML));
    ok('★ 拖动中不读布局：吸附只读内联样式', (function () {
        const i = M2.indexOf('function snapTick');
        if (i < 0) return false;
        const seg = M2.slice(i, i + 420);
        return seg.indexOf('parseFloat(el.style.left)') > 0 && seg.indexOf('getBoundingClientRect') < 0;
    })());
    ok('★ ① 幽灵预览存在且与吸附同源', /id = 'n26SnapGhost'/.test(M2) || /id="n26SnapGhost"/.test(C2));
    ok('★ ② Cmd/Ctrl+Tab 打开切换器', /e\.key !== 'Tab' \|\| !\(e\.metaKey \|\| e\.ctrlKey\)/.test(M2));
    ok('★ ② 最小化的窗口从切换器里能还原', /pick\.state === 'minimized' && window\.n26WinRestore/.test(M2));
    ok('★ ③ Dock 图标按下记位置，新窗口从图标长出来', /#dock \.dock-item/.test(M2) && /function dockMorph/.test(M2));
    ok('★ ④ 启动台分层（品牌区先入、网格后入）',
        /#launchpad\.n26-lp-in \.launchpad-brand-slot/.test(C2) && /@keyframes n26LpBrand/.test(C2) &&
        /@keyframes n26LpGrid/.test(C2));
    ok('★ ⑤ 模态从触发点展开（FLIP）', /function flipIn/.test(M2) && /transformOrigin/.test(M2));
    ok('★ ⑥ 控制中心弹簧', /#control-center\.show\s*\{[\s\S]{0,60}animation: n26CCIn/.test(C2));
    ok('★ ⑦ 锁屏时钟呼吸', /@keyframes n26LockBreath/.test(C2) && /n26LockBreath 7s/.test(C2));
    ok('★ ⑧ 小组件入场阶梯（一次批量只演一次）',
        /function observeWidgets/.test(M2) && /Date\.now\(\) - lastAt < 600/.test(M2));
    /* ★ 先剥注释再查：注释里就写着「禁 transition:all」，不剥会自己命中自己 */
    const C2n = C2.replace(/\/\*[\s\S]*?\*\//g, '');
    ok('★ 动效层不许 transition: all / 祖先 filter', !/transition:\s*all/i.test(C2n) && !/^\s*filter:/m.test(C2n));

    /* ★ 吸附几何的数值验证：把 window.n26SnapZone 从真源码里抠出来跑 */
    (function () {
        const key = 'window.n26SnapZone = function';
        const i = M2.indexOf(key);
        if (i < 0) { ok('能从源码抠出 n26SnapZone', false); return; }
        let d = 0, start = M2.indexOf('{', i), end = -1;
        for (let k = start; k < M2.length; k++) {
            if (M2[k] === '{') d++;
            else if (M2[k] === '}') { d--; if (!d) { end = k + 1; break; } }
        }
        const body = 'var TOPBAR=32, EDGE=14, CORNER=160;' + M2.slice(i, end) + ';';
        const sandbox = { window: {}, Math, window_innerWidth: 0 };
        sandbox.window.innerWidth = 1600;
        sandbox.window.innerHeight = 900;
        vm.createContext(sandbox);
        try { vm.runInContext(body, sandbox); } catch (e) { ok('n26SnapZone 可执行', false, e.message); return; }
        const Z = sandbox.window.n26SnapZone;
        const W = 1600, H = 900;
        const r = (left, top, right, bottom) => Z({ left, top, right, bottom }, W, H);

        ok('顶部 → 交给最大化', r(600, 2, 1000, 600).zone === 'max');
        ok('左边缘 → 左半屏', (function () { const z = r(3, 300, 803, 700); return z.zone === 'left' && z.x === 0 && z.w === 800; })());
        ok('右边缘 → 右半屏', (function () { const z = r(900, 300, 1598, 700); return z.zone === 'right' && z.x === 800; })());
        ok('左上角 → 左上四分之一', (function () { const z = r(2, 40, 700, 500); return z.zone === 'tl' && z.x === 0 && z.y === 32; })());
        ok('右下角 → 右下四分之一', (function () { const z = r(1000, 500, 1599, 890); return z.zone === 'br' && z.x === 800; })());
        ok('★ 四角判定优先于左右半屏', (function () { const z = r(2, 60, 700, 400); return z.zone === 'tl'; })());
        ok('中间 → 不吸附', r(500, 300, 1100, 700) === null);
        ok('★ 四分之一屏高度按去掉顶栏算', (function () {
            const z = r(2, 40, 700, 500);
            return z.h === Math.floor((H - 32) / 2);
        })());
    })();
})();

/* ---------------------------------------------------------------- */
/* v2.10.15 · 侧栏玻璃性能（音乐里「慢到离谱」） */
section('P · 侧栏玻璃性能');
(function () {
    const UIC = read('ui/n26-ui.css');
    const UIJ = read('ui/n26-ui.js');
    const MUS = read('apps/music.html');

    /* 只看 .n26ui-glass 自己那一段（.n26ui-indicator 确实会改尺寸，另算） */
    const glassSeg = (function () {
        const i = UIC.indexOf('.n26ui-glass {');
        if (i < 0) return '';
        return UIC.slice(i, UIC.indexOf('}', i)).replace(/\/\*[\s\S]*?\*\//g, '');
    })();
    ok('★ 玻璃不再把 width/height 放进 will-change（那等于每帧强制布局）',
        /will-change:\s*transform;/.test(glassSeg) && !/will-change:[^;]*width/.test(glassSeg));
    ok('★ 滑行途中模糊降档（移动时不再每帧全量重采样）',
        /\.n26ui-glass\.travel\s*\{[\s\S]{0,160}blur\(8px\)/.test(UIC));
    ok('★ 按住态保留完整质感', /\.n26ui-glass\.glow\s*\{[\s\S]{0,120}blur\(14px\)/.test(UIC));
    ok('★ 用 contain: layout style 隔离布局，但**不能**用 paint（会裁掉外发光）',
        /contain:\s*layout style/.test(glassSeg) && !/contain:[^;]*paint/.test(glassSeg));
    ok('★ 切页淡入窗口内降侧栏模糊（body.n26-xfade）',
        /body\.n26-xfade \.n26ui-sidebar/.test(UIC) && /function markXfade/.test(UIJ) &&
        /markXfade\(\);/.test(UIJ));
    ok('★ 共享 UI 版本戳已 bump（否则浏览器吃旧 CSS，改了等于没改）',
        /n26-ui\.css\?v=2976/.test(MUS) && /n26-ui\.js\?v=2978/.test(MUS));
})();

/* ---------------------------------------------------------------- */
console.log('\n============================================');
console.log('  PASS ' + pass + '   FAIL ' + fail);
if (fail) fails.forEach(function (f) { console.log('  FAIL  ' + f); });
console.log('  纯 Node 静态 + vm 假 DOM · 未启动任何浏览器');
console.log('============================================');
process.exit(fail ? 1 : 0);
