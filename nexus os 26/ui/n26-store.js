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

    /* v2.9.69：分类/搜索视图直接露出筛选结果
       Apple 化首页的 Today 大卡 / 编辑精选 / 热门榜单固定占满首屏，旧逻辑切分类
       只重画底部的「全部应用」网格，首屏完全不动 → 看起来就是「点了没反应」。
       这里把首页大卡标记为 .n26-as-hero，切到分类或搜索时整块隐藏，
       让筛选后的网格出现在首屏。 */
    try {
        if (!document.getElementById('n26StoreCatViewStyle')) {
            var _catCss = document.createElement('style');
            _catCss.id = 'n26StoreCatViewStyle';
            _catCss.textContent = '.as-main.n26-as-cat-view > .n26-as-hero{display:none !important;}';
            (document.head || document.documentElement).appendChild(_catCss);
        }
    } catch (e) { }

    /* MXOS 合作栏目：来源角标 / 接口状态条 / 刷新按钮（沿用商城卡片视觉语言） */
    try {
        if (!document.getElementById('n26MxStyle')) {
            var _mxCss = document.createElement('style');
            _mxCss.id = 'n26MxStyle';
            _mxCss.textContent = [
                '.as-mx-badge{display:inline-flex;align-items:center;gap:4px;align-self:flex-start;margin:0 0 6px;padding:2px 8px;',
                'border-radius:999px;background:rgba(13,148,136,.12);border:1px solid rgba(13,148,136,.18);color:#0f766e;',
                'font-size:9.5px;font-weight:700;line-height:1.6;letter-spacing:.2px;}',
                'body.dark-mode .as-mx-badge{background:rgba(45,212,191,.14);border-color:rgba(45,212,191,.25);color:#7dd3c8;}',
                '.as-mx-badge-detail{margin:0 0 0 8px;font-size:10px;vertical-align:1px;}',
                '.as-mx-note{grid-column:1 / -1;display:flex;align-items:center;gap:8px;margin-bottom:2px;padding:7px 12px;',
                'border-radius:11px;background:rgba(13,148,136,.06);border:1px solid rgba(13,148,136,.14);',
                'font-size:11px;font-weight:600;color:rgba(15,118,110,.82);}',
                'body.dark-mode .as-mx-note{background:rgba(45,212,191,.07);border-color:rgba(45,212,191,.18);color:rgba(125,211,200,.85);}',
                '.as-mx-note .as-mx-refresh{margin-left:auto;display:inline-flex;align-items:center;gap:5px;padding:4px 10px;',
                'border-radius:8px;border:1px solid rgba(13,148,136,.22);background:rgba(255,255,255,.55);color:inherit;',
                'font-family:inherit;font-size:10.5px;font-weight:700;cursor:pointer;}',
                'body.dark-mode .as-mx-note .as-mx-refresh{background:rgba(255,255,255,.08);border-color:rgba(45,212,191,.24);}',
                '.as-mx-note .as-mx-refresh:disabled{opacity:.55;cursor:default;}',
                /* 76px Dock：所有短名强制单行，行高/字号统一，过长省略 */
                '.as-rail-item > span{display:block;max-width:100%;white-space:nowrap;word-break:keep-all;',
                'overflow:hidden;text-overflow:ellipsis;font-size:10px;line-height:1.15;letter-spacing:-.1px;}',
                /* MXOS 图标：品牌色超椭圆 + 首字母垫底，图加载成功再盖上去，避免空块 */
                '.n26-mx-icon > img{position:relative;z-index:1;}',
                '.n26-mx-icon-fb{position:absolute;inset:0;z-index:0;display:grid;place-items:center;color:#fff;',
                'font-weight:800;letter-spacing:.4px;text-shadow:0 1px 3px rgba(0,0,0,.28);}',
                '.store-app-icon.drawn.n26-mx-icon{background:linear-gradient(150deg,hsl(var(--mx-hue,180) 64% 58%),',
                'hsl(calc(var(--mx-hue,180) + 26) 60% 44%));}',
                '.n26-mx-icon-err > img{display:none;}',
                /* MXOS 沙盒应用窗口：关掉毛玻璃，否则 Chromium 把跨进程 iframe 栅格化成模糊图 */
                'html body .window.n26-mx-window.n26-mx-window{backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}',
                '.n26-mx-mount-err{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;',
                'justify-content:center;gap:10px;text-align:center;padding:26px;color:rgba(22,32,46,.66);font-size:13px;line-height:1.7;}',
                '.n26-mx-mount-err b{color:#16202e;font-size:15px;}',
                'body.dark-mode .n26-mx-mount-err{color:rgba(226,232,240,.66);}',
                'body.dark-mode .n26-mx-mount-err b{color:#e2e8f0;}',
                '.n26-mx-mount-err button{margin-top:4px;padding:7px 16px;font-size:12px;border-radius:10px;cursor:pointer;',
                'background:rgba(13,148,136,.14);border:1px solid rgba(13,148,136,.32);color:inherit;font-family:inherit;}'
            ].join('');
            (document.head || document.documentElement).appendChild(_mxCss);
        }
    } catch (e) { }

    var AS_CAT = '全部';
    var AS_Q = '';

    var GROUPS = [
        { g: '发现', items: [
            { n: '为你推荐', i: 'fa-star', c: '全部' },
            { n: '已安装', i: 'fa-hard-drive', c: '__installed' },
            { n: '可更新', i: 'fa-arrows-rotate', c: '__updates' }
        ] },
        /* MXOS 合作渠道：独立入口，数据实时来自 MXOS 官方商店接口 */
        { g: '合作', items: [
            { n: 'MXOS', i: 'fa-cube', c: '__mxos' }
        ] },
        { g: '分类', items: [
            { n: '娱乐', i: 'fa-face-smile', c: '娱乐' },
            { n: '生产力', i: 'fa-briefcase', c: '生产力' },
            { n: '效率', i: 'fa-bolt', c: '效率' },
            { n: 'AI 工具', i: 'fa-wand-magic-sparkles', c: 'AI 工具' },
            { n: '游戏', i: 'fa-gamepad', c: '游戏' },
            { n: '创作', i: 'fa-palette', c: '创作' },
            { n: '设计', i: 'fa-pen-ruler', c: '设计' },
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
        '效率': ['办公', '工具', '系统'],
        'AI 工具': ['工具', '开发', '系统'],
        '创作': ['创作', '开发'],
        '设计': ['设计', '创作', '开发'],
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
        // v2.9.74：底板颜色以图标品牌色表为准（n26TileColor），渐变交给 CSS 的 ::before 层，
        // 这样超椭圆裁切只作用在底板上，投影留在不裁切的外层元素上。
        var col = (typeof n26TileColor === 'function') ? n26TileColor(a.id, a.color) : (a.color || '#4A9BF5');
        var ic = a.icon || 'fa-cube';
        return '<div class="' + cls + '" style="--app-color:' + col + ';--app-color-2:' + shade(col) +
            ';font-size:' + (size || 18) + 'px"><i class="fas ' + esc(ic) + '"></i></div>';
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

    /* ==================== MXOS 合作栏目（真实接口） ====================
       API 线索：docs/MX商店API文档.md（MXOS v0.3）。文档里写死的
       http://api.store.mxos.zlromi.com/api/v1 已无 DNS；实测同源
       https://store.mxos.zlromi.com/api/v1 可用（CORS: *）。
       公开接口无需鉴权；EdgeOne 缓存命中的响应不带 CORS 头，
       因此所有请求都带时间戳强制回源（实测回源响应带 ACAO: *）。
       安装 = 真实下载 .mx（ZIP）→ 校验 X-Content-SHA256 → 解包
       manifest.json + app.bin → 存 IndexedDB → 注册 mx_ 应用，
       由 apps/mxapp/index.html 用 sandbox iframe 运行。全程不造数据。 */
    var MXOS_BASE = 'https://store.mxos.zlromi.com/api/v1';
    var MXOS_TIMEOUT = 12000;
    var MX_CAT_NAME = {
        education: '教育', ai: 'AI 工具', media: '影音娱乐', music: '影音娱乐',
        tools: '工具', productivity: '效率', game: '游戏', games: '游戏',
        design: '设计', development: '开发', system: '系统', office: '办公',
        social: '社交', news: '资讯', security: '安全'
    };
    var _mx = { state: 'idle', error: '', items: [], ts: 0 };

    function mxCatName(c) {
        c = String(c || '').trim();
        return MX_CAT_NAME[c.toLowerCase()] || c || 'MXOS';
    }
    function mxJson(path) {
        var ctl = new AbortController();
        var timer = setTimeout(function () { ctl.abort(); }, MXOS_TIMEOUT);
        var url = MXOS_BASE + path + (path.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now();
        return fetch(url, { signal: ctl.signal, headers: { 'Accept': 'application/json' } }).then(function (r) {
            clearTimeout(timer);
            if (!r.ok) throw new Error('接口返回 HTTP ' + r.status);
            return r.json();
        }, function (e) {
            clearTimeout(timer);
            throw new Error(e && e.name === 'AbortError' ? '请求超时（' + (MXOS_TIMEOUT / 1000) + ' 秒）'
                : ('网络不可达：' + ((e && e.message) || 'fetch 失败')));
        });
    }
    function mxMerge(it, detail) {
        var app = (detail && detail.app) || {};
        var lv = (detail && detail.latest_version) || {};
        var n = Number(it.download_count || app.download_count || 0) || 0;
        var cat = app.category || it.category || '';
        return {
            id: 'mx_' + it.id,
            mxId: String(it.id),
            source: 'mxos',
            mx: true,
            name: app.name || it.name || '未命名 MXOS 应用',
            developer: app.developer || it.developer || 'MXOS',
            rawCategory: cat,
            category: mxCatName(cat),
            desc: app.description || it.subtitle || ('MXOS 特色应用 · ' + (app.developer || it.developer || 'MXOS')),
            longDesc: app.description || it.subtitle ||
                ('MXOS 应用商店上架应用，由 ' + (app.developer || it.developer || 'MXOS 开发者') + ' 发布。'),
            version: lv.version || it.latest_version || '0.1.0',
            versionId: lv.id || null,
            released: lv.published_at || it.published_at || '',
            bytes: lv.size || it.size || 0,
            downloads: n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n),
            publisher: app.developer || it.developer || 'MXOS',
            icon: 'fa-cube',
            color: '#0d9488',
            permissions: []
        };
    }
    function mxLoad(force) {
        if (_mx.state === 'loading') return;
        if (!force && _mx.state === 'ok' && (Date.now() - _mx.ts) < 120000) return;
        _mx.state = 'loading'; _mx.error = '';
        renderGrid();
        mxJson('/apps?page=1&page_size=100&sort=hot').then(function (j) {
            var items = (j && j.items) || [];
            return Promise.all(items.map(function (it) {
                return mxJson('/apps/' + encodeURIComponent(it.id)).then(function (d) {
                    return mxMerge(it, d);
                }, function () {
                    return mxMerge(it, null);   // 单个详情失败不拖垮整个列表
                });
            }));
        }).then(function (list) {
            _mx.items = list;
            _mx.state = 'ok';
            _mx.error = '';
            _mx.ts = Date.now();
            renderGrid();
        }, function (e) {
            _mx.state = 'error';
            _mx.error = (e && e.message) || 'MXOS 接口不可达';
            _mx.items = [];
            renderGrid();
        });
    }
    window.n26MxReload = function (btn) {
        if (btn) { btn.disabled = true; }
        mxLoad(true);
    };

    /* 已安装的 MXOS 应用元数据（只有真实装过的才在这里；用于启动时注册应用） */
    function mxInstalledMeta() {
        try { return getUserLS('n26MxInstalled') || []; } catch (e) { return []; }
    }
    function mxMetaEntry(m) {
        return {
            id: m.id, mxId: m.mxId, source: 'mxos', mx: true,
            name: m.name, developer: m.developer || 'MXOS',
            category: m.category || 'MXOS',
            desc: m.desc || ('MXOS 应用 · ' + (m.developer || 'MXOS')),
            longDesc: m.desc || ('MXOS 应用商店上架应用，由 ' + (m.developer || 'MXOS') + ' 发布。'),
            version: m.version || '0.1.0', downloads: '—',
            bytes: m.bytes || 0, publisher: m.developer || 'MXOS',
            icon: 'fa-cube', color: '#0d9488', installedMeta: true
        };
    }
    function mxStoreEntry(appId) {
        if (!appId || String(appId).indexOf('mx_') !== 0) return null;
        for (var i = 0; i < _mx.items.length; i++) {
            if (_mx.items[i].id === appId) return _mx.items[i];
        }
        var m = mxInstalledMeta().filter(function (x) { return x.id === appId; })[0];
        return m ? mxMetaEntry(m) : null;
    }
    window.n26MxStoreEntry = mxStoreEntry;

    function mxHue(a) {
        var s = String((a && (a.mxId || a.name)) || 'mx');
        var h = 0;
        for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
        return h;
    }
    function mxIcon(a, size) {
        var sz = size || 56;
        var initial = (String((a && a.name) || '').trim().charAt(0) || 'M').toUpperCase();
        return '<div class="store-app-icon drawn n26-mx-icon" style="width:' + sz + 'px;height:' + sz + 'px;--mx-hue:' + mxHue(a) + '">' +
            '<span class="n26-mx-icon-fb" aria-hidden="true" style="font-size:' + Math.round(sz * 0.42) + 'px">' + esc(initial) + '</span>' +
            '<img loading="eager" decoding="async" src="' + MXOS_BASE + '/apps/' + encodeURIComponent(a.mxId) +
            '/icon" alt="' + esc(a.name) + '" onload="this.parentNode.classList.add(\'n26-mx-icon-ok\')" onerror="n26MxIconError(this)"></div>';
    }
    function n26MxIconHTML(a, size) { return mxIcon(a, size); }
    window.n26MxIconHTML = n26MxIconHTML;
    window.n26MxIconError = function (img) {
        var p = img && img.parentNode;
        if (!p) return;
        p.classList.add('n26-mx-icon-err');
        if (img.parentNode) img.parentNode.removeChild(img);
    };

    function mxCard(a, i) {
        var isInst = installed().indexOf(a.id) >= 0;
        var d = dlState(a.id);
        var lv = localVerOf(a);
        var ver = verOf(a);
        var hasUpd = isInst && lv && String(ver) !== String(lv);
        var txt = d ? '安装中 ' + Math.floor(d.progress || 0) + '%' : (hasUpd ? '更新' : (isInst ? '打开' : '下载'));
        var cls = d ? 'installing' : (hasUpd ? 'update' : (isInst ? 'installed' : ''));
        var fn = d ? '' : (hasUpd ? 'appStoreUpdate' : 'appStoreDownload');
        return '<div class="appstore-card n26-stagger" style="animation-delay:' + Math.min(i * 0.035, 0.7) + 's" ' +
            'onclick="appStoreShowDetail(\'' + esc(a.id) + '\')">' +
            '<div class="as-mx-badge"><i class="fas fa-cube"></i> 来自 MXOS</div>' +
            '<div class="as-top"><div class="appstore-card-icon-wrap">' + mxIcon(a, 56) + '</div>' +
            '<button class="appstore-download-btn ' + cls + '" ' +
            (fn ? 'onclick="event.stopPropagation();' + fn + '(\'' + esc(a.id) + '\')"' : 'disabled') + '>' + esc(txt) + '</button></div>' +
            '<div class="appstore-card-name">' + esc(a.name) + '</div>' +
            '<div class="appstore-card-desc">' + esc(a.desc) + '</div>' +
            '<div class="appstore-card-foot">' +
            '<span class="appstore-card-cat">' + esc(a.category) + '</span>' +
            '<span class="appstore-card-ver">v' + esc(ver) + '</span>' +
            '<span class="appstore-card-dl"><i class="fas fa-download"></i>' + esc(a.downloads || '—') + '</span>' +
            '</div></div>';
    }

    function paintMxSrv() {
        var el = document.getElementById('asSrvState');
        if (!el) return;
        var state = _mx.state === 'ok' ? 'ok' : (_mx.state === 'error' ? 'error' : 'loading');
        var text = _mx.state === 'ok' ? ('MXOS 已连接 · ' + _mx.items.length + ' 个应用')
            : (_mx.state === 'error' ? 'MXOS 连接失败' : '正在连接 MXOS…');
        el.className = 'as-srv is-' + state;
        el.innerHTML = '<i class="fas fa-circle"></i><span>' + esc(text) + '</span>' +
            (state === 'error' ? '<button class="as-srv-btn" onclick="n26MxReload(this)" title="重试 MXOS 接口">重试</button>' : '');
        if (state === 'error') el.title = _mx.error;
    }

    function renderMxGrid(grid) {
        var q = AS_Q.trim().toLowerCase();
        var list = _mx.items.slice();
        if (q) {
            list = list.filter(function (a) {
                return (a.name + ' ' + a.desc + ' ' + a.developer + ' ' + a.category).toLowerCase().indexOf(q) >= 0;
            });
        }
        var note = '<div class="as-mx-note"><i class="fas fa-handshake"></i>' +
            '<span>合作渠道 · 数据实时来自 MXOS 应用商店</span>' +
            '<button class="as-mx-refresh" onclick="n26MxReload(this)"><i class="fas fa-rotate-right"></i> 刷新</button></div>';
        if (_mx.state === 'loading' && !_mx.items.length) {
            grid.innerHTML = note + '<div class="appstore-empty appstore-empty-state">' +
                '<i class="fas fa-spinner fa-spin"></i><b>正在连接 MXOS 应用商店…</b>' +
                '<span>实时拉取 MXOS 特色应用列表，不做本地假数据兜底。</span></div>';
            paintMxSrv();
            return;
        }
        if (_mx.state === 'error') {
            grid.innerHTML = note + '<div class="appstore-empty appstore-empty-state">' +
                '<i class="fas fa-triangle-exclamation"></i><b>MXOS 接口连接失败</b>' +
                '<span>' + esc(_mx.error) + '</span>' +
                '<button class="glass-btn" onclick="n26MxReload(this)" style="margin-top:12px">重试</button></div>';
            paintMxSrv();
            return;
        }
        if (!_mx.items.length) {
            grid.innerHTML = note + '<div class="appstore-empty appstore-empty-state">' +
                '<i class="fas fa-box-open"></i><b>MXOS 暂时没有上架应用</b>' +
                '<span>接口可用，但对方商店当前没有已发布的应用。</span></div>';
            paintMxSrv();
            return;
        }
        if (!list.length) {
            grid.innerHTML = note + '<div class="appstore-empty">没有找到「' + esc(AS_Q) + '」<br>' +
                '<small>换个关键词，或清空搜索看 MXOS 全部应用。</small></div>';
            paintMxSrv();
            return;
        }
        grid.innerHTML = note + list.map(mxCard).join('');
        paintMxSrv();
    }

    /* ---------- .mx（ZIP）解包 + 真实安装 ---------- */
    var _mxDbPromise = null;
    function mxDb() {
        if (_mxDbPromise) return _mxDbPromise;
        _mxDbPromise = new Promise(function (res, rej) {
            if (!window.indexedDB) { rej(new Error('当前浏览器不支持 IndexedDB，无法保存 MXOS 应用包')); return; }
            var r = indexedDB.open('n26mx', 1);
            r.onupgradeneeded = function () {
                if (!r.result.objectStoreNames.contains('pkgs')) r.result.createObjectStore('pkgs', { keyPath: 'id' });
            };
            r.onsuccess = function () { res(r.result); };
            r.onerror = function () { rej(r.error || new Error('IndexedDB 打开失败')); };
            r.onblocked = function () { rej(new Error('IndexedDB 被其他窗口占用，请关闭其他 Nexus 窗口后重试')); };
        });
        return _mxDbPromise;
    }
    function mxDbPut(rec) {
        return mxDb().then(function (db) {
            return new Promise(function (res, rej) {
                var tx = db.transaction('pkgs', 'readwrite');
                tx.objectStore('pkgs').put(rec);
                tx.oncomplete = function () { res(); };
                tx.onerror = function () { rej(tx.error || new Error('写入应用包失败')); };
            });
        });
    }
    function mxDbDel(id) {
        return mxDb().then(function (db) {
            return new Promise(function (res, rej) {
                var tx = db.transaction('pkgs', 'readwrite');
                tx.objectStore('pkgs').delete(id);
                tx.oncomplete = function () { res(); };
                tx.onerror = function () { rej(tx.error); };
            });
        });
    }
    function mxDbGet(id) {
        return mxDb().then(function (db) {
            return new Promise(function (res, rej) {
                var tx = db.transaction('pkgs', 'readonly');
                var g = tx.objectStore('pkgs').get(id);
                g.onsuccess = function () { res(g.result || null); };
                g.onerror = function () { rej(g.error); };
            });
        });
    }

    /* 宿主窗口调用：把本机真实包塞进已建好的 sandbox iframe（单层，避免嵌套栅格化模糊） */
    function mxMountError(content, msg) {
        content.innerHTML = '<div class="n26-mx-mount-err"><b>MXOS 应用没加载出来</b>' +
            '<div>' + esc(msg) + '</div>' +
            '<button type="button">去应用商城重新安装</button></div>';
        var btn = content.querySelector('.n26-mx-mount-err button');
        if (btn) btn.onclick = function () { try { openApp('appstore'); } catch (e) { } };
    }
    /* ================= MXOS 宿主桥（sandbox iframe ⇄ Nexus 宿主） =================
       协议：子 → 父 {__n26mx:1,id,method,params}；父 → 子 {__n26mx:1,id,ok,result|error}
       - 只按 event.source 对应的已注册 iframe 取 appId，请求体里的任何 appId 一律不认
       - 能力白名单：系统/主题/语言/用户显示名/通知/打开内置应用/本应用命名空间存储
       - 子侧 shim 同时挂到 window.MXOS 和 window.parent.MXOS（保持 sandbox 不降级）
       ================================================================= */
    var MX_BRIDGE_VERSION = 1;
    var _mxBridge = { reg: new Map(), methods: {}, stat: { ok: 0, err: 0, rejected: 0 } };

    function mxBridgeTheme() {
        try { return document.body.classList.contains('dark-mode') ? 'dark' : 'light'; } catch (e) { return 'light'; }
    }
    function mxBridgeLang() {
        var l = (document.documentElement.getAttribute('lang') || '').trim();
        return l || (navigator.language || 'zh-CN');
    }
    function mxBridgeUser() {
        try {
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.name) {
                return { displayName: String(currentUser.name), isGuest: !!(currentUser.isGuest || currentUser.role === 'guest') };
            }
        } catch (e) { }
        return { displayName: '访客', isGuest: true };
    }
    function mxBridgeAppMeta(appId) {
        var a = null;
        try { a = mxStoreEntry(appId); } catch (e) { }
        return {
            id: appId,
            name: (a && a.name) || '',
            version: (a && a.version) || '',
            publisher: (a && a.publisher) || '',
            installed: true
        };
    }
    function mxBridgeStoreKey(appId, key) { return 'n26MxStore:' + appId + ':' + key; }
    function mxBridgeKeyOK(k) { return typeof k === 'string' && /^[A-Za-z0-9_.\-]{1,64}$/.test(k); }
    function mxBridgeStr(v, max) {
        if (v === null || v === undefined) return '';
        var s = String(v);
        return s.length > max ? s.slice(0, max) : s;
    }
    function mxBridgeLog(ev) {
        try {
            console.debug('[MXOS 宿主桥]', ev.method, ev.ok ? 'ok' : (ev.error && ev.error.code), ev.ms + 'ms');
        } catch (e) { }
    }

    _mxBridge.methods['host.info'] = function (ctx) {
        var m = mxBridgeAppMeta(ctx.appId);
        return {
            host: 'Nexus OS 26',
            hostVersion: (typeof NEXUS_OS_VERSION !== 'undefined' ? NEXUS_OS_VERSION : ''),
            bridge: MX_BRIDGE_VERSION,
            app: { id: m.id, name: m.name, version: m.version },
            theme: mxBridgeTheme(),
            language: mxBridgeLang(),
            timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
            user: mxBridgeUser(),
            time: Date.now()
        };
    };
    _mxBridge.methods['theme.get'] = function () { return { mode: mxBridgeTheme(), lang: mxBridgeLang() }; };
    _mxBridge.methods['locale.get'] = function () {
        return { language: mxBridgeLang(), timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''), now: Date.now() };
    };
    _mxBridge.methods['user.get'] = function () { return mxBridgeUser(); };
    _mxBridge.methods['notify.show'] = function (ctx, p) {
        p = p || {};
        var title = mxBridgeStr(p.title, 80).trim() || '通知';
        var body = mxBridgeStr(p.body !== undefined ? p.body : p.message, 500).trim();
        var type = ['info', 'success', 'warning', 'error'].indexOf(String(p.type)) >= 0 ? String(p.type) : 'info';
        if (typeof showNotification !== 'function') {
            var e = new Error('宿主通知能力不可用'); e.code = 'E_UNAVAILABLE'; throw e;
        }
        showNotification(title, body, type);
        return { shown: true };
    };
    _mxBridge.methods['app.open'] = function (ctx, p) {
        var id = String((p && p.appId) || '');
        if (!id || id.indexOf('mx_') === 0) {
            var e = new Error('只能打开宿主内置应用'); e.code = 'E_NOT_ALLOWED'; throw e;
        }
        var info = (typeof appRegistry !== 'undefined' && appRegistry) ? appRegistry[id] : null;
        if (!info || typeof openApp !== 'function') {
            var e2 = new Error('没有这个内置应用：' + id); e2.code = 'E_NOT_FOUND'; throw e2;
        }
        openApp(id);
        return { opened: id, name: (info.name || id) };
    };
    _mxBridge.methods['storage.get'] = function (ctx, p) {
        var key = (p && p.key);
        if (!mxBridgeKeyOK(key)) { var e = new Error('非法存储键'); e.code = 'E_BAD_KEY'; throw e; }
        var v = null;
        try { v = localStorage.getItem(mxBridgeStoreKey(ctx.appId, key)); } catch (err) { }
        return { key: key, value: v };
    };
    _mxBridge.methods['storage.set'] = function (ctx, p) {
        var key = (p && p.key);
        if (!mxBridgeKeyOK(key)) { var e = new Error('非法存储键'); e.code = 'E_BAD_KEY'; throw e; }
        var raw;
        try { raw = JSON.stringify((p && p.value)); } catch (err) {
            var e2 = new Error('值无法序列化'); e2.code = 'E_BAD_PARAMS'; throw e2;
        }
        if (raw.length > 32768) { var e3 = new Error('单个值超过 32KB'); e3.code = 'E_TOO_LARGE'; throw e3; }
        localStorage.setItem(mxBridgeStoreKey(ctx.appId, key), raw);
        return { key: key, bytes: raw.length };
    };
    _mxBridge.methods['storage.remove'] = function (ctx, p) {
        var key = (p && p.key);
        if (!mxBridgeKeyOK(key)) { var e = new Error('非法存储键'); e.code = 'E_BAD_KEY'; throw e; }
        localStorage.removeItem(mxBridgeStoreKey(ctx.appId, key));
        return { key: key, removed: true };
    };
    _mxBridge.methods['storage.keys'] = function (ctx) {
        var pre = mxBridgeStoreKey(ctx.appId, '');
        var keys = [];
        try {
            for (var i = 0; i < localStorage.length && keys.length < 200; i++) {
                var k = localStorage.key(i);
                if (k && k.indexOf(pre) === 0) keys.push(k.slice(pre.length));
            }
        } catch (e) { }
        return { keys: keys };
    };

    function mxBridgeReply(ctx, id, ok, payload) {
        var msg = { __n26mx: 1, id: id, ok: !!ok };
        if (ok) msg.result = payload;
        else msg.error = payload;
        /* 回复必须用当前导航后的 WindowProxy；srcdoc 会换 inner window，attach 时抓的引用可能已失效 */
        var target = (ctx.ifr && ctx.ifr.contentWindow) || ctx.win;
        try { target.postMessage(msg, '*'); } catch (e) { }
    }
    window.addEventListener('message', function (ev) {
        var d = ev.data;
        if (!d || typeof d !== 'object' || d.__n26mx !== 1) return;
        var ctx = _mxBridge.reg.get(ev.source);
        /* 来源不是本商城注册过的应用窗口 → 丢弃，不回包（防伪造来源探测宿主） */
        if (!ctx || !ctx.ifr || !ctx.ifr.isConnected || ctx.ifr.contentWindow !== ev.source) {
            _mxBridge.stat.rejected++;
            return;
        }
        var id = d.id;
        if (id === undefined || id === null) return;
        var now = Date.now();
        if (now - ctx.t0 > 2000) { ctx.t0 = now; ctx.count = 0; }
        if (++ctx.count > 30) {
            mxBridgeReply(ctx, id, false, { code: 'E_RATE_LIMIT', message: '请求太频繁，请稍后再试' });
            return;
        }
        var method = String(d.method || '');
        var fn = _mxBridge.methods[method];
        var t0 = performance.now();
        if (!fn) {
            _mxBridge.stat.err++;
            mxBridgeReply(ctx, id, false, { code: 'E_UNKNOWN_METHOD', message: '宿主未开放该方法：' + method });
            return;
        }
        var result;
        try {
            result = fn(ctx, d.params || {});
        } catch (e) {
            _mxBridge.stat.err++;
            mxBridgeReply(ctx, id, false, { code: (e && e.code) || 'E_INTERNAL', message: (e && e.message) || '宿主处理失败' });
            return;
        }
        _mxBridge.stat.ok++;
        mxBridgeReply(ctx, id, true, result);
        mxBridgeLog({ method: method, ok: true, ms: Math.round(performance.now() - t0) });
    });

    window.n26MxBridgeAttach = function (ifr, appId) {
        var win = null;
        try { win = ifr.contentWindow; } catch (e) { }
        if (!win) return;
        /* 顺手清理已卸载窗口的注册，避免 WindowProxy 常驻 */
        _mxBridge.reg.forEach(function (v, k) { if (!v.ifr || !v.ifr.isConnected) _mxBridge.reg.delete(k); });
        _mxBridge.reg.set(win, { appId: appId, ifr: ifr, win: win, t0: 0, count: 0 });
    };
    window.n26MxBridgeInfo = {
        version: MX_BRIDGE_VERSION,
        methods: Object.keys(_mxBridge.methods),
        stat: function () { return { registered: _mxBridge.reg.size, ok: _mxBridge.stat.ok, err: _mxBridge.stat.err, rejected: _mxBridge.stat.rejected }; }
    };

    /* 子侧 shim：注入到应用 HTML 的 <head> 最前；只走 postMessage，不碰同级 DOM */
    function __n26MxShim(appId) {
        var REAL = window.parent;
        var seq = 0;
        var pending = {};
        var TIMEOUT = 8000;
        function call(method, params) {
            return new Promise(function (resolve, reject) {
                var id = 'mx' + (++seq) + '_' + Math.random().toString(36).slice(2, 8);
                var timer = setTimeout(function () {
                    delete pending[id];
                    var err = new Error('宿主响应超时：' + method); err.code = 'E_TIMEOUT'; reject(err);
                }, TIMEOUT);
                pending[id] = { resolve: resolve, reject: reject, timer: timer };
                try {
                    REAL.postMessage({ __n26mx: 1, id: id, method: method, params: params || {} }, '*');
                } catch (e) {
                    clearTimeout(timer); delete pending[id]; reject(e);
                }
            });
        }
        try {
            /* 监听必须挂在本窗口（宿主回包发给子窗口，不会落在 parent 上） */
            window.addEventListener('message', function (e) {
                var d = e.data;
                if (!d || typeof d !== 'object' || d.__n26mx !== 1 || !d.id) return;
                var p = pending[d.id];
                if (!p) return;
                delete pending[d.id];
                clearTimeout(p.timer);
                if (d.ok) { p.resolve(d.result); return; }
                var err = new Error((d.error && d.error.message) || 'MXOS 宿主拒绝请求');
                err.code = (d.error && d.error.code) || 'E_HOST';
                p.reject(err);
            });
        } catch (e) { }
        function notify(payload) {
            var p = payload || {};
            call('notify.show', { title: p.title, body: p.body !== undefined ? p.body : p.message, type: p.type }).catch(function () { });
            return true;   /* 与 MXOS 现网包一致：同步返回真值，异步补发 */
        }
        var API = {
            version: '1.0',
            appId: appId,
            request: call,
            notify: notify,
            getInfo: function () { return call('host.info'); },
            getTheme: function () { return call('theme.get'); },
            getLocale: function () { return call('locale.get'); },
            getUser: function () { return call('user.get'); },
            openApp: function (id) { return call('app.open', { appId: id }); },
            Notification: { show: function (p) { return call('notify.show', p || {}); } },
            storage: {
                get: function (key) { return call('storage.get', { key: key }); },
                set: function (key, value) { return call('storage.set', { key: key, value: value }); },
                remove: function (key) { return call('storage.remove', { key: key }); },
                keys: function () { return call('storage.keys'); }
            }
        };
        window.MXOS = API;
        /* 兼容老包写法 window.parent.MXOS：先抓真实 parent 再替换，避免丢消息通道 */
        try {
            Object.defineProperty(window, 'parent', {
                configurable: true,
                value: {
                    MXOS: API,
                    postMessage: function (msg, target) { return REAL.postMessage(msg, target || '*'); },
                    addEventListener: function (t, fn, o) { return REAL.addEventListener(t, fn, o); },
                    removeEventListener: function (t, fn, o) { return REAL.removeEventListener(t, fn, o); },
                    closed: false
                }
            });
        } catch (e) { }
    }
    function mxBridgeInject(html, appId) {
        var tag = '<scr' + 'ipt>(' + __n26MxShim.toString() + ')(' + JSON.stringify(appId) + ');</scr' + 'ipt>';
        if (typeof html !== 'string') return html;
        if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, function (m) { return m + tag; });
        if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, function (m) { return m + tag; });
        return tag + html;
    }

    window.n26MxMountFrame = function (ifr, appId, content) {
        /* .app-iframe 默认 opacity:0，等 n26-in 淡入；srcdoc 的 load 早于其它应用，
           必须自己挂 load 后加类，否则窗口里只剩透明层（能看见后面的商城） */
        ifr.addEventListener('load', function () { ifr.classList.add('n26-in'); });
        window.n26MxBridgeAttach(ifr, appId);
        mxDbGet(appId).then(function (rec) {
            if (!rec || !rec.html) throw new Error('本机没有这个应用包（可能已被卸载），请重新下载。');
            ifr.srcdoc = mxBridgeInject(rec.html, appId);
        }, function (e) {
            throw new Error((e && e.message) || '读取本机应用包失败');
        }).catch(function (e) {
            mxMountError(content, (e && e.message) || '读取本机应用包失败');
        });
    };
    function mxSha256(buf) {
        if (!(window.crypto && crypto.subtle)) return Promise.resolve('');
        return crypto.subtle.digest('SHA-256', buf).then(function (d) {
            return Array.prototype.map.call(new Uint8Array(d), function (b) {
                return ('0' + b.toString(16)).slice(-2);
            }).join('');
        });
    }
    function mxUnzip(buf, wanted) {
        var u8 = new Uint8Array(buf);
        var eocd = -1;
        for (var i = u8.length - 22; i >= 0 && i >= u8.length - 70000; i--) {
            if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('不是有效的 .mx 安装包（ZIP 目录缺失）');
        var u16 = function (o) { return u8[o] | (u8[o + 1] << 8); };
        var u32 = function (o) { return ((u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0); };
        var count = u16(eocd + 10), off = u32(eocd + 16), p = off, out = {};
        var td = new TextDecoder('utf-8');
        for (var k = 0; k < count; k++) {
            if (!(u8[p] === 0x50 && u8[p + 1] === 0x4b && u8[p + 2] === 0x01 && u8[p + 3] === 0x02)) {
                throw new Error('安装包目录损坏（第 ' + (k + 1) + ' 项）');
            }
            var method = u16(p + 10), csize = u32(p + 20);
            var nlen = u16(p + 28), elen = u16(p + 30), cmlen = u16(p + 32);
            var lho = u32(p + 42);
            var name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
            if (wanted.indexOf(name) >= 0) {
                if (!(u8[lho] === 0x50 && u8[lho + 1] === 0x4b && u8[lho + 2] === 0x03 && u8[lho + 3] === 0x04)) {
                    throw new Error('安装包局部头损坏：' + name);
                }
                var doff = lho + 30 + u16(lho + 26) + u16(lho + 28);
                out[name] = { method: method, data: u8.subarray(doff, doff + csize) };
            }
            p += 46 + nlen + elen + cmlen;
        }
        return out;
    }
    function mxEntryText(entry) {
        if (!entry) return Promise.resolve('');
        if (entry.method === 0) return Promise.resolve(new TextDecoder('utf-8').decode(entry.data));
        if (entry.method !== 8) return Promise.reject(new Error('不支持的压缩方式：' + entry.method));
        if (typeof DecompressionStream !== 'function') {
            return Promise.reject(new Error('当前浏览器不支持 .mx 解压（DecompressionStream 缺失），请升级浏览器'));
        }
        var stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream).arrayBuffer().then(function (ab) {
            return new TextDecoder('utf-8').decode(new Uint8Array(ab));
        });
    }
    function mxDetailOpen(id) {
        var p = document.getElementById('appStoreDetailPanel');
        return p && p.classList.contains('show') && (typeof appStoreDetailId !== 'undefined') && appStoreDetailId === id;
    }

    function n26MxInstall(appId, force) {
        var a = mxStoreEntry(appId);
        if (!a) { showNotification('安装失败', '找不到该 MXOS 应用', 'error'); return; }
        if (installed().indexOf(appId) >= 0 && !force) { openApp(appId); return; }
        if (appStoreDownloads[appId]) return;
        var st = { progress: 4, phase: '准备下载' };
        appStoreDownloads[appId] = st;
        renderGrid();
        var man = {}, rec = null;
        mxJson('/apps/' + encodeURIComponent(a.mxId)).then(function (detail) {
            var lv = (detail && detail.latest_version) || {};
            if (!lv.id) throw new Error('MXOS 未提供可下载版本（latest_version 缺失）');
            st.progress = 14; st.phase = '下载 v' + (lv.version || ''); renderGrid();
            var url = MXOS_BASE + '/download/' + encodeURIComponent(lv.id) + '?_t=' + Date.now();
            return fetch(url, { headers: { 'Accept': 'application/octet-stream' } }).then(function (r) {
                if (!r.ok) throw new Error('下载失败：HTTP ' + r.status);
                var want = (r.headers.get('X-Content-SHA256') || '').toLowerCase();
                return r.arrayBuffer().then(function (buf) {
                    if (!buf.byteLength) throw new Error('下载内容为空');
                    st.progress = 40; st.phase = '校验 SHA-256'; renderGrid();
                    return mxSha256(buf).then(function (got) {
                        if (want && got && want !== got) throw new Error('包校验失败（SHA-256 不一致），已中止安装');
                        st.progress = 56; st.phase = '解包 .mx'; renderGrid();
                        var files = mxUnzip(buf, ['manifest.json', 'app.bin']);
                        if (!files['app.bin']) throw new Error('.mx 包缺少 app.bin');
                        return Promise.all([mxEntryText(files['manifest.json']), mxEntryText(files['app.bin'])])
                            .then(function (txts) {
                                try { man = JSON.parse(txts[0] || '{}'); } catch (e) { throw new Error('manifest.json 不是合法 JSON'); }
                                var html = txts[1] || '';
                                if (!/^\s*<(!doctype|html)/i.test(html.slice(0, 300)) && !/<html[\s>]/i.test(html.slice(0, 3000))) {
                                    throw new Error('包内 app.bin 不是可运行的 HTML 应用');
                                }
                                var detailApp = (detail && detail.app) || {};
                                rec = {
                                    id: a.id, mxId: String(a.mxId),
                                    name: man.name || detailApp.name || a.name,
                                    desc: man.description || detailApp.description || a.desc,
                                    developer: man.author || detailApp.developer || a.developer,
                                    category: mxCatName(man.category || detailApp.category || a.rawCategory),
                                    version: lv.version || man.version || a.version,
                                    bytes: buf.byteLength,
                                    winW: (man.window && man.window.width) || 0,
                                    winH: (man.window && man.window.height) || 0,
                                    installedAt: Date.now()
                                };
                                st.progress = 78; st.phase = '写入本机应用库'; renderGrid();
                                return mxDbPut({ id: rec.id, mxId: rec.mxId, html: html, manifest: man, installedAt: rec.installedAt });
                            });
                    });
                });
            });
        }).then(function () {
            if (!rec) throw new Error('安装记录生成失败');
            var meta = mxInstalledMeta();
            var oi = meta.findIndex(function (x) { return x.id === rec.id; });
            if (oi >= 0) meta.splice(oi, 1);
            meta.push(rec);
            setUserLS('n26MxInstalled', meta);
            st.progress = 92; st.phase = '注册应用与启动台'; renderGrid();
            if (typeof n26StoreMarkInstalled === 'function') n26StoreMarkInstalled(rec.id, rec.version);
            mxRegister();
            delete appStoreDownloads[appId];
            showNotification(force ? '更新完成' : '安装完成',
                rec.name + ' v' + rec.version + ' 已从 MXOS 装到本机，可在启动台打开', 'success');
            try { playSound('notify'); } catch (e) { }
            renderGrid();
            if (mxDetailOpen(appId)) appStoreShowDetail(appId);
        }, function (e) {
            delete appStoreDownloads[appId];
            showNotification('安装失败', a.name + '：' + ((e && e.message) || '未知错误'), 'error');
            renderGrid();
            if (mxDetailOpen(appId)) appStoreShowDetail(appId);
        });
    }
    window.n26MxInstall = n26MxInstall;

    /* 启动时把已安装的 MXOS 应用挂进注册表：Dock / 启动台 / 搜索自动认 */
    function mxRegister() {
        mxInstalledMeta().forEach(function (m) {
            try {
                var w = Math.min(Math.max(Number(m.winW) || 980, 760), 1180);
                var h = Math.min(Math.max(Number(m.winH) || 680, 560), 800);
                appRegistry[m.id] = {
                    name: m.name, icon: 'fa-cube', color: '#0d9488',
                    defaultWidth: w, defaultHeight: h
                };
            } catch (e) { }
        });
    }
    window.n26SyncMxApps = mxRegister;
    mxRegister();

    /* 已安装视图：让 MXOS 应用也能在「已安装」里被管理（仍不进「全部」网格） */
    try {
        var _mxBaseInstalled = window.n26StoreInstalledApps;
        if (typeof _mxBaseInstalled === 'function') {
            window.n26StoreInstalledApps = function () {
                var list = _mxBaseInstalled() || [];
                var inst = installed();
                mxInstalledMeta().forEach(function (m) {
                    if (inst.indexOf(m.id) >= 0 && !list.some(function (x) { return x.id === m.id; })) {
                        list.push(mxMetaEntry(m));
                    }
                });
                return list;
            };
        }
    } catch (e) { }

    /* 卸载 MXOS 应用：走原有确认流程，额外清掉 IndexedDB 包与元数据 */
    try {
        var _mxBaseUninstall = window.n26StoreUninstall;
        if (typeof _mxBaseUninstall === 'function') {
            window.n26StoreUninstall = function (appId, closeDetail) {
                if (!/^mx_/.test(String(appId))) return _mxBaseUninstall(appId, closeDetail);
                var app = appRegistry[appId];
                if (!app) return;
                return nexusConfirm('卸载应用', '确定要卸载 ' + app.name + ' 吗？\n\nMXOS 应用包会从本机删除。').then(function (ok) {
                    if (!ok) return;
                    var list = getUserLS('installedApps') || [];
                    var i = list.indexOf(appId);
                    if (i >= 0) { list.splice(i, 1); setUserLS('installedApps', list); }
                    try { n26SetInstalledVersion(appId, null); } catch (e) { }
                    var meta = mxInstalledMeta().filter(function (x) { return x.id !== appId; });
                    setUserLS('n26MxInstalled', meta);
                    mxDbDel(appId).then(null, function () { });
                    try { delete appRegistry[appId]; if (window.IFRAME_APPS) delete window.IFRAME_APPS[appId]; } catch (e) { }
                    if (closeDetail) appStoreCloseDetail();
                    showNotification('卸载完成', app.name + ' 已卸载', 'success');
                    renderGrid();
                });
            };
        }
    } catch (e) { }

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
            '    <aside class="as-rail" id="asRail" data-n26dock="v">' + rail + '</aside>' +
            '    <div class="as-main">' +
            '      <div class="n26-as-alltitle" id="n26AsAllTitle">' + esc(AS_CAT === '__installed' ? '已安装的应用' : (AS_CAT === '__updates' ? '可更新的应用' : '全部应用')) + '</div>' +
            '      <div class="appstore-toolbar">' +
            '        <div class="as-crumb" id="asCrumb">' +
            (AS_CAT === '全部' ? '全部应用' : '<span class="as-crumb-back" onclick="appStoreSetCategory(\'全部\')">全部应用</span> › ' + esc(catName(AS_CAT))) +
            '</div>' +
            '        <div class="as-toolbar-right">' +
            '          <div class="as-srv" id="asSrvState"></div>' +
            '          <div class="appstore-search"><i class="fas fa-search"></i>' +
            '            <input type="text" placeholder="搜索应用" value="' + esc(AS_Q) +
            '" oninput="appStoreSetQuery(this.value)"></div>' +
            '        </div>' +
            '      </div>' +
            '      <div class="n26-as-today n26-as-hero" id="n26AsToday">' +
            '        <div class="n26-as-today-glow"></div>' +
            '        <div class="n26-as-today-l">' +
            '          <div class="n26-as-eyebrow">Today · 今日精选</div>' +
            '          <div class="n26-as-today-t">' + esc(today.title) + '</div>' +
            '          <div class="n26-as-today-d">' + esc(today.desc) + '</div>' +
            '          <div class="n26-as-today-btn" onclick="appStoreOpenApp(\'' + esc(today.appId) + '\')">立即查看</div>' +
            '        </div>' +
            ico(todayApp, 'n26-as-today-art', 46) +
            '      </div>' +
            '      <div class="n26-as-section n26-as-hero"><h3>编辑精选</h3><span>小方工作室挑选</span></div>' +
            '      <div class="n26-as-picks n26-as-hero">' + picksHtml + '</div>' +
            '      <div class="n26-as-section n26-as-hero"><h3>热门榜单</h3><span>大家都在装</span></div>' +
            '      <div class="n26-as-rank n26-as-hero">' + rankHtml + '</div>' +
            '      <div class="n26-as-divider n26-as-hero"></div>' +
            '      <div class="appstore-list"><div class="appstore-grid" id="appStoreGrid"></div></div>' +
            '    </div>' +
            '  </div>' +
            '  <div class="appstore-detail-overlay" id="appStoreDetailOverlay" onclick="appStoreCloseDetail()"></div>' +
            '  <div class="appstore-detail-panel" id="appStoreDetailPanel"></div>' +
            '</div>';

        try { appStoreBannerStop(); } catch (e) { }
        applyCatView();
        renderGrid();
        if (AS_CAT === '__mxos') mxLoad();
        try { n26SyncSelfPubApps(); } catch (e) { }
        try { appStoreRefreshReviewDot(); } catch (e) { }
    }

    /* 分类/搜索视图：隐藏首页大卡（.n26-as-hero），让筛选结果出现在首屏 */
    function applyCatView() {
        var grid = document.getElementById('appStoreGrid');
        var main = grid && grid.closest('.as-main');
        if (!main) return;
        main.classList.toggle('n26-as-cat-view', AS_CAT !== '全部' || !!AS_Q.trim());
    }

    /* ---------------- 全部应用网格（保留 .appstore-card 全套旧类名） ---------------- */
    function catName(c) {
        if (c === '__installed') return '已安装';
        if (c === '__updates') return '可更新';
        if (c === '__mxos') return 'MXOS';
        return c;
    }
    function srvInfo() {
        try {
            if (typeof n26StoreSrvState === 'function') {
                var st = n26StoreSrvState();
                return { state: st.state || 'idle', text: st.text || '未连接' };
            }
        } catch (e) { }
        return { state: 'idle', text: '未连接' };
    }
    /* 云端状态徽标：已连接 / 未连接 / 离线模式 / 连接失败（失败给重试） */
    function paintSrv() {
        var el = document.getElementById('asSrvState');
        if (!el) return;
        var st = srvInfo();
        el.className = 'as-srv is-' + st.state;
        el.innerHTML = '<i class="fas fa-circle"></i><span>' + esc(st.text) + '</span>' +
            (st.state === 'error' ? '<button class="as-srv-btn" onclick="n26StoreManualRefresh(this)" title="重试连接云端">重试</button>' : '');
    }
    function verOf(a) {
        try { if (typeof n26StoreVersion === 'function') return n26StoreVersion(a); } catch (e) { }
        return String(a.version || '1.0.0');
    }
    function localVerOf(a) {
        try { if (typeof n26InstalledVersions === 'function') return n26InstalledVersions()[a.id] || ''; } catch (e) { }
        return '';
    }
    function ratingOf(a) {
        try { if (typeof n26StoreRating === 'function') return n26StoreRating(a.id); } catch (e) { }
        return null;
    }

    function cardHTML(a, i) {
        var isInst = installed().indexOf(a.id) >= 0;
        var d = dlState(a.id);
        var lv = localVerOf(a);
        var ver = verOf(a);
        var hasUpd = isInst && lv && String(ver) !== String(lv) && !a.system;
        var rating = ratingOf(a);
        var txt = d ? '安装中 ' + Math.floor(d.progress || 0) + '%' : (hasUpd ? '更新' : (isInst ? '打开' : '下载'));
        var cls = d ? 'installing' : (hasUpd ? 'update' : (isInst ? 'installed' : ''));
        var fn = d ? '' : (hasUpd ? 'appStoreUpdate' : 'appStoreDownload');
        return '<div class="appstore-card n26-stagger" style="animation-delay:' + Math.min(i * 0.035, 0.7) + 's" ' +
            'onclick="appStoreShowDetail(\'' + esc(a.id) + '\')">' +
            '<div class="as-top"><div class="appstore-card-icon-wrap">' +
            (typeof n26StoreIcon === 'function' ? n26StoreIcon(a, 56) : ico(a, 'n26-as-pick-ic', 20)) +
            '</div><button class="appstore-download-btn ' + cls + '" ' +
            (fn ? 'onclick="event.stopPropagation();' + fn + '(\'' + esc(a.id) + '\')"' : 'disabled') + '>' + esc(txt) + '</button></div>' +
            '<div class="appstore-card-name">' + esc(a.name) +
            (hasUpd ? '<span class="as-card-upd">可更新</span>' : '') + '</div>' +
            '<div class="appstore-card-desc">' + esc(a.desc || '开发者未提供介绍。') + '</div>' +
            '<div class="appstore-card-foot"><span class="appstore-card-cat">' + esc(a.category || '未分类') + '</span>' +
            (rating ? '<span class="appstore-card-star" title="本机评分"><i class="fas fa-star"></i>' + esc(rating.avg) + '</span>' : '') +
            '<span class="appstore-card-ver">v' + esc(ver) + '</span>' +
            '<span class="appstore-card-dl"><i class="fas fa-download"></i>' + esc(a.downloads || '—') + '</span></div>' +
            '</div>';
    }

    function renderGrid() {
        var grid = document.getElementById('appStoreGrid');
        if (!grid) return;
        if (AS_CAT === '__mxos') { renderMxGrid(grid); return; }
        var apps;
        if (AS_CAT === '__installed') {
            apps = (typeof n26StoreInstalledApps === 'function') ? n26StoreInstalledApps() : [];
        } else if (AS_CAT === '__updates') {
            apps = (typeof n26StoreUpdateCandidates === 'function') ? n26StoreUpdateCandidates() : [];
        } else {
            var source = (typeof n26StoreAllApps === 'function') ? n26StoreAllApps() : allApps();
            apps = source.filter(function (a) { return matchCat(a, AS_CAT); });
            if (AS_Q.trim()) {
                var q = AS_Q.toLowerCase();
                apps = apps.filter(function (a) {
                    return String(a.name || '').toLowerCase().indexOf(q) >= 0 ||
                        String(a.desc || '').toLowerCase().indexOf(q) >= 0 ||
                        String(a.id || '').toLowerCase().indexOf(q) >= 0;
                });
            }
        }
        if (!apps.length) {
            var st = srvInfo();
            var empty;
            if (AS_CAT === '__installed') {
                empty = '还没有安装任何应用<br><small>在「为你推荐」里挑一个，点「下载」即可安装。</small>';
            } else if (AS_CAT === '__updates') {
                empty = '没有可更新的应用<br><small>只有商店版本高于本机记录的版本时，才会出现在这里。</small>';
            } else if (AS_Q.trim()) {
                empty = '没有找到「' + esc(AS_Q) + '」<br><small>换个关键词，或清空搜索看全部应用。</small>';
            } else if (st.state === 'error' || st.state === 'offline') {
                empty = '云端市场暂时不可用（' + esc(st.text) + '）<br><small>当前只显示内置与已缓存的应用。' +
                    (st.state === 'error' ? '点右上角「重试」重新连接。' : '关闭离线模式后再试。') + '</small>';
            } else {
                empty = '这个分类暂时没有应用<br><small>换一个分类，或回到「为你推荐」。</small>';
            }
            grid.innerHTML = '<div class="appstore-empty">' + empty + '</div>';
            paintSrv();
            return;
        }
        grid.innerHTML = apps.map(cardHTML).join('');
        paintSrv();
    }

    function setCategory(c) {
        AS_CAT = c; AS_Q = '';
        try { appStoreCategory = c; appStoreQuery = ''; } catch (e) { }
        document.querySelectorAll('.as-rail-item').forEach(function (el) {
            el.classList.toggle('active', el.dataset.cat === c);
        });
        // 窄栏可滚动：切分类后把选中项滚进可视区，避免当前分类停在屏幕外
        var actItem = document.querySelector('.as-rail-item.active');
        if (actItem && actItem.scrollIntoView) {
            try { actItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { }
        }
        var crumb = document.getElementById('asCrumb');
        if (crumb) crumb.innerHTML = c === '全部' ? '全部应用'
            : '<span class="as-crumb-back" onclick="appStoreSetCategory(\'全部\')">全部应用</span> › ' + esc(catName(c));
        var all = document.getElementById('n26AsAllTitle');
        if (all) all.textContent = c === '__installed' ? '已安装的应用'
            : (c === '__updates' ? '可更新的应用'
                : (c === '__mxos' ? 'MXOS 特色应用' : (c === '全部' ? '全部应用' : catName(c))));
        showGrid();
        var main = document.getElementById('appStoreGrid');
        main = main && main.closest('.as-main');
        if (main) main.scrollTop = 0;
        renderGrid();
        if (c === '__mxos') mxLoad();
    }
    function setQuery(q) {
        AS_Q = q;
        try { appStoreQuery = q; } catch (e) { }
        applyCatView();
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
        applyCatView();
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
