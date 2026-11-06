/* ============================================================
   Nexus OS 26 · v2.9.62 · 应用商城 Apple App Store 化
   - 左侧语义分类 Dock（发现 / 分类 / 更多），右侧 Today 大卡、
     编辑精选、热门榜单、全部应用
   - 保留所有旧接口：#appStoreGrid / .appstore-card / .as-rail-item /
     #asReviewItem / #asPluginItem / n26StoreHideMain / 详情页 / 下载
   - 不复用 FluentOS 任何代码或数值
   ============================================================ */
(function () {
    'use strict';

    var AS_CAT = '全部';
    var AS_Q = '';

    var GROUPS = [
        { g: '发现', items: [{ n: '为你推荐', i: 'fa-sparkles', c: '全部' }] },
        { g: '分类', items: [
            { n: '娱乐', i: 'fa-face-smile', c: '娱乐' },
            { n: '生产力', i: 'fa-briefcase', c: '生产力' },
            { n: 'AI 工具', i: 'fa-wand-magic-sparkles', c: 'AI 工具' },
            { n: '游戏', i: 'fa-gamepad', c: '游戏' },
            { n: '创作', i: 'fa-palette', c: '创作' },
            { n: '学习', i: 'fa-graduation-cap', c: '学习' }
        ] },
        { g: '更多', items: [
            { n: '资讯', i: 'fa-newspaper', c: '资讯' },
            { n: '社交', i: 'fa-comments', c: '社交' },
            { n: '安全', i: 'fa-shield-halved', c: '安全' },
            { n: '系统', i: 'fa-gear', c: '系统' },
            { n: '办公', i: 'fa-briefcase', c: '办公' },
            { n: '开发', i: 'fa-code', c: '开发' },
            { n: '自发布', i: 'fa-paper-plane', c: '自发布' }
        ] }
    ];

    /* 语义分类 → 原始数据里的 category 集合；AI 工具额外做关键词识别 */
    var CAT_MAP = {
        '全部': null,
        '娱乐': ['娱乐', '游戏'],
        '生产力': ['办公', '工具', '系统'],
        'AI 工具': ['工具', '开发', '系统'],
        '创作': ['创作', '开发'],
        '学习': ['学习'],
        '游戏': ['游戏'],
        '资讯': ['资讯'],
        '社交': ['社交'],
        '安全': ['安全'],
        '系统': ['系统'],
        '办公': ['办公'],
        '开发': ['开发'],
        '自发布': ['自发布', '工具']
    };
    var AI_RE = /ai|智能|助手|agent|covi|小方|gpt|大模型|chat/i;

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function allApps() {
        var a = [];
        try { a = a.concat(typeof STORE_APPS !== 'undefined' ? STORE_APPS : []); } catch (e) { }
        try { if (typeof n26SelfPubApps === 'function') a = a.concat(n26SelfPubApps() || []); } catch (e) { }
        try { if (typeof n26CloudAppEntries === 'function') a = a.concat(n26CloudAppEntries() || []); } catch (e) { }
        return a;
    }
    function matchCat(a, cat) {
        var set = CAT_MAP[cat];
        if (cat === 'AI 工具') {
            var hay = (a.id || '') + ' ' + (a.name || '') + ' ' + (a.desc || '');
            return (set && set.indexOf(a.category) >= 0 && AI_RE.test(hay)) || AI_RE.test(a.name || '') || /^(agent|covi|ai)/i.test(a.id || '');
        }
        if (!set) return true;
        if (set.indexOf(a.category) >= 0) return true;
        if (cat === '自发布') return a.id && String(a.id).indexOf('sp_') === 0;
        return false;
    }
    function dlNum(s) {
        var m = String(s || '').match(/([\d.]+)/);
        if (!m) return 0;
        var v = parseFloat(m[1]) || 0;
        if (/亿/.test(s)) v *= 100000000;
        else if (/万/.test(s)) v *= 10000;
        return v;
    }
    function ico(a, cls, size) {
        var col = a.color || '#4A9BF5';
        var ic = a.icon || 'fa-cube';
        return '<div class="' + cls + '" style="background:linear-gradient(158deg,' +
            col + ',' + shade(col) + ');font-size:' + (size || 18) + 'px"><i class="fas ' + esc(ic) + '"></i></div>';
    }
    function shade(hex) {
        var c = String(hex || '#4A9BF5').replace('#', '');
        if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
        var n = parseInt(c.slice(0, 6), 16);
        if (isNaN(n)) return '#2b5f9e';
        var r = ((n >> 16) & 255) * 0.72 | 0, g = ((n >> 8) & 255) * 0.72 | 0, b = (n & 255) * 0.72 | 0;
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    function installed() {
        try { return getUserLS('installedApps') || []; } catch (e) { return []; }
    }
    function dlState(id) {
        try { return appStoreDownloads[id]; } catch (e) { return null; }
    }
    function btnText(a) {
        if (installed().indexOf(a.id) >= 0) return '打开';
        var d = dlState(a.id);
        return d ? '安装中 ' + Math.floor(d.progress) + '%' : '下载';
    }

    /* ---------------- 主结构 ---------------- */
    function renderMain(content) {
        var apps = allApps();
        var today = (typeof STORE_BANNERS !== 'undefined' && STORE_BANNERS[0]) ||
            { title: '今天，从这里开始', desc: '挑一个顺手的应用，把桌面变成你的样子。', appId: (apps[0] || {}).id, color: '#4A9BF5', icon: 'fa-sparkles' };
        var todayApp = apps.filter(function (a) { return a.id === today.appId; })[0] || apps[0] || { color: '#4A9BF5', icon: 'fa-sparkles' };
        var picks = ['编辑精选', '本周新作', '值得一试'];
        var pickApps = [];
        ['duolingo', 'studio', 'focus'].forEach(function (id) {
            var f = apps.filter(function (a) { return a.id === id; })[0];
            if (f) pickApps.push(f);
        });
        apps.slice(0, 8).forEach(function (a) { if (pickApps.length < 3 && pickApps.indexOf(a) < 0) pickApps.push(a); });
        var rank = apps.slice().sort(function (x, y) { return dlNum(y.downloads) - dlNum(x.downloads); }).slice(0, 5);

        var rail = '';
        GROUPS.forEach(function (grp, gi) {
            rail += '<div class="as-rail-group">' + esc(grp.g) + '</div>';
            grp.items.forEach(function (it) {
                rail += '<div class="as-rail-item' + (it.c === AS_CAT ? ' active' : '') + '" data-cat="' + esc(it.c) +
                    '" onclick="appStoreSetCategory(\'' + esc(it.c) + '\')" title="' + esc(it.n) + '">' +
                    '<i class="fas ' + esc(it.i) + '"></i><span>' + esc(it.n) + '</span></div>';
            });
            if (gi < GROUPS.length - 1) rail += '<div class="as-rail-sep"></div>';
        });
        rail += '<div class="as-rail-sep"></div>' +
            '<div class="as-rail-item" id="asReviewItem" onclick="appStoreOpenReview()" title="审核台">' +
            '<i class="fas fa-stamp"></i><span>审核台</span>' +
            '<i class="fas fa-circle n26-review-dot" id="asReviewDot" style="display:none;font-size:5px;color:#f87171;margin-left:auto;"></i></div>' +
            '<div class="as-rail-item" id="asPluginItem" onclick="appStoreOpenPlugins()" title="插件市场">' +
            '<i class="fas fa-plug"></i><span>插件市场</span></div>';

        var picksHtml = pickApps.slice(0, 3).map(function (a, i) {
            return '<div class="n26-as-pick" onclick="appStoreShowDetail(\'' + esc(a.id) + '\')">' +
                '<div class="n26-as-pick-tag">' + esc(picks[i] || '精选') + '</div>' +
                '<div class="n26-as-pick-name">' + esc(a.name) + '</div>' +
                '<div class="n26-as-pick-desc">' + esc(a.desc) + '</div>' +
                ico(a, 'n26-as-pick-ic', 20) + '</div>';
        }).join('');

        var rankHtml = rank.map(function (a, i) {
            return '<div class="n26-as-rank-row" onclick="appStoreShowDetail(\'' + esc(a.id) + '\')">' +
                '<div class="n26-as-rank-no">' + (i + 1) + '</div>' +
                ico(a, 'n26-as-rank-ic', 18) +
                '<div class="n26-as-rank-info"><div class="n26-as-rank-name">' + esc(a.name) +
                '</div><div class="n26-as-rank-sub">' + esc(a.category) + ' · ' + esc(a.downloads || '—') + '</div></div>' +
                '<button class="n26-as-rank-btn" onclick="event.stopPropagation();appStoreDownload(\'' + esc(a.id) + '\')">' +
                esc(btnText(a)) + '</button></div>';
        }).join('');

        content.innerHTML =
            '<div class="appstore-container">' +
            '  <div class="as-shell">' +
            '    <aside class="as-rail" id="asRail">' + rail + '</aside>' +
            '    <div class="as-main">' +
            '      <div class="n26-as-today" id="n26AsToday">' +
            '        <div class="n26-as-today-glow"></div>' +
            '        <div class="n26-as-today-l">' +
            '          <div class="n26-as-eyebrow">Today · 今日精选</div>' +
            '          <div class="n26-as-today-t">' + esc(today.title) + '</div>' +
            '          <div class="n26-as-today-d">' + esc(today.desc) + '</div>' +
            '          <div class="n26-as-today-btn" onclick="appStoreOpenApp(\'' + esc(today.appId) + '\')">立即查看</div>' +
            '        </div>' +
            ico(todayApp, 'n26-as-today-art', 46) +
            '      </div>' +
            '      <div class="n26-as-section"><h3>编辑精选</h3><span>小方工作室挑选</span></div>' +
            '      <div class="n26-as-picks">' + picksHtml + '</div>' +
            '      <div class="n26-as-section"><h3>热门榜单</h3><span>大家都在装</span></div>' +
            '      <div class="n26-as-rank">' + rankHtml + '</div>' +
            '      <div class="n26-as-divider"></div>' +
            '      <div class="n26-as-alltitle" id="n26AsAllTitle">全部应用</div>' +
            '      <div class="appstore-toolbar">' +
            '        <div class="as-crumb" id="asCrumb">' + esc(AS_CAT === '全部' ? '全部应用' : AS_CAT) + '</div>' +
            '        <div class="appstore-search"><i class="fas fa-search"></i>' +
            '          <input type="text" placeholder="搜索应用" value="' + esc(AS_Q) +
            '" oninput="appStoreSetQuery(this.value)"></div>' +
            '      </div>' +
            '      <div class="appstore-list"><div class="appstore-grid" id="appStoreGrid"></div></div>' +
            '    </div>' +
            '  </div>' +
            '  <div class="appstore-detail-overlay" id="appStoreDetailOverlay" onclick="appStoreCloseDetail()"></div>' +
            '  <div class="appstore-detail-panel" id="appStoreDetailPanel"></div>' +
            '</div>';

        try { appStoreBannerStop(); } catch (e) { }
        renderGrid();
        try { n26SyncSelfPubApps(); } catch (e) { }
        try { appStoreRefreshReviewDot(); } catch (e) { }
    }

    /* ---------------- 全部应用网格（保留 .appstore-card 全套旧类名） ---------------- */
    function renderGrid() {
        var grid = document.getElementById('appStoreGrid');
        if (!grid) return;
        var apps = allApps().filter(function (a) { return matchCat(a, AS_CAT); });
        if (AS_Q.trim()) {
            var q = AS_Q.toLowerCase();
            apps = apps.filter(function (a) {
                return String(a.name || '').toLowerCase().indexOf(q) >= 0 || String(a.desc || '').toLowerCase().indexOf(q) >= 0;
            });
        }
        if (!apps.length) { grid.innerHTML = '<div class="appstore-empty">未找到匹配的应用</div>'; return; }
        grid.innerHTML = apps.map(function (a, i) {
            var isInst = installed().indexOf(a.id) >= 0;
            var d = dlState(a.id);
            var txt = isInst ? '打开' : (d ? '安装中 ' + Math.floor(d.progress) + '%' : '下载');
            var cls = isInst ? 'installed' : (d ? 'installing' : '');
            return '<div class="appstore-card n26-stagger" style="animation-delay:' + Math.min(i * 0.035, 0.7) + 's" ' +
                'onclick="appStoreShowDetail(\'' + esc(a.id) + '\')">' +
                '<div class="as-top"><div class="appstore-card-icon-wrap">' +
                (typeof n26StoreIcon === 'function' ? n26StoreIcon(a, 56) : ico(a, 'n26-as-pick-ic', 20)) +
                '</div><button class="appstore-download-btn ' + cls + '" onclick="event.stopPropagation();appStoreDownload(\'' +
                esc(a.id) + '\')">' + esc(txt) + '</button></div>' +
                '<div class="appstore-card-name">' + esc(a.name) + '</div>' +
                '<div class="appstore-card-desc">' + esc(a.desc) + '</div>' +
                '<div class="appstore-card-foot"><span class="appstore-card-cat">' + esc(a.category) + '</span>' +
                '<span class="appstore-card-dl"><i class="fas fa-download"></i>' + esc(a.downloads || '—') + '</span></div>' +
                '</div>';
        }).join('');
    }

    function setCategory(c) {
        AS_CAT = c; AS_Q = '';
        try { appStoreCategory = c; appStoreQuery = ''; } catch (e) { }
        document.querySelectorAll('.as-rail-item').forEach(function (el) {
            el.classList.toggle('active', el.dataset.cat === c);
        });
        var crumb = document.getElementById('asCrumb');
        if (crumb) crumb.textContent = c === '全部' ? '全部应用' : c;
        var all = document.getElementById('n26AsAllTitle');
        if (all) all.textContent = c === '全部' ? '全部应用' : c;
        showGrid();
        renderGrid();
    }
    function setQuery(q) {
        AS_Q = q;
        try { appStoreQuery = q; } catch (e) { }
        renderGrid();
    }
    /* 从审核台 / 插件市场回来：恢复主内容，隐藏临时面板 */
    function showGrid() {
        var grid = document.getElementById('appStoreGrid');
        var main = grid && grid.closest('.as-main');
        if (!main) return;
        Array.prototype.forEach.call(main.children, function (el) {
            if (el.id === 'asReviewHost' || el.id === 'asPluginHost' || el.id === 'asCloudHost') el.style.display = 'none';
            else el.style.display = '';
        });
        document.querySelectorAll('.as-rail-item').forEach(function (el) { el.classList.remove('active'); });
        var first = document.querySelector('.as-rail-item[data-cat="' + AS_CAT + '"]');
        if (first) first.classList.add('active');
    }

    /* Apple 式大卡需要更大的画布：默认窗口放大，榜单不再被切成半行 */
    try {
        if (typeof appRegistry !== 'undefined' && appRegistry.appstore) {
            appRegistry.appstore.defaultWidth = Math.max(appRegistry.appstore.defaultWidth || 0, 940);
            appRegistry.appstore.defaultHeight = Math.max(appRegistry.appstore.defaultHeight || 0, 680);
        }
    } catch (e) { }

    /* 覆盖全局函数声明；旧的 const/let 状态保持原样，不碰 */
    window.appStoreRenderMain = renderMain;
    window.appStoreRenderGrid = renderGrid;
    window.appStoreSetCategory = setCategory;
    window.appStoreSetQuery = setQuery;
    if (typeof window.appStoreBackToGrid !== 'function') {
        window.appStoreBackToGrid = function () { AS_CAT = '全部'; showGrid(); renderGrid(); };
    }
    window.n26AsStoreState = function () { return { cat: AS_CAT, q: AS_Q }; };
})();
