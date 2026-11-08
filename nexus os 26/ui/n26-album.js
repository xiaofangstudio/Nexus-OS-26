/* ============================================================
   Nexus OS 26 · 相册 P0 改造（总纲 4.5）
   ------------------------------------------------------------
   落地项：
     ① 时间轴（按 createdAt 本地分组）+ 相簿侧栏 + 搜索 + 排序
     ② 多选 / 批量收藏 / 批量导出 / 批量删除进回收站 + 撤销
     ③ 缩略图管线（lazy + decode + 256px 缩略图缓存到 IndexedDB）
     ④ 四态：空 / 加载骨架 / 单格破图 / 离线与空间不足提示
     ⑤ 灯箱：顶部 48 + 画布 + 胶片栏 88 + 信息面板 280（EXIF 尽力读取）
     ⑥ 快捷键 ←/→ +/-/0/R/F/Space/Esc/Ctrl+A/Delete/Ctrl+滚轮
   强调色取 appRegistry.album.color（#f472b6），不再用统一蓝；
   磁贴走系统超椭圆 #n26Squircle，投影放在未裁切的外层。
   不新增颜色/圆角/动效令牌，全部来自 ui/tokens.css。
   ============================================================ */
(function () {
    'use strict';

    var A = window.n26Album = {};
    var FAV_KEY = 'albumFavorites';
    var FILE_LIMIT = 24 * 1024 * 1024;

    var state = {
        host: null,
        tab: 'all',
        month: '',
        group: '',
        q: '',
        sort: 'date-desc',
        selectMode: false,
        selected: {},
        anchor: null,
        items: [],
        viewList: [],
        groups: [],
        cell: 112,
        loaded: false,
        animate: true,
        viewer: null,
        infoOpen: true,
        slideshow: 0,
        undo: null,
        undoTimer: 0,
        quota: false,
        importing: false,
        dims: {},
        exif: {},
        destroyed: false
    };

    /* ---------------- 基础工具 ---------------- */
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }
    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function hash(s) {
        var h = 2166136261;
        for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
        return h >>> 0;
    }
    function notify(t, m, k) {
        try { if (typeof showNotification === 'function') showNotification(t, m, k); } catch (e) { }
    }
    function fmtSize(n) {
        n = Number(n) || 0;
        if (!n) return '—';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        if (n < 1073741824) return (n / 1048576).toFixed(2) + ' MB';
        return (n / 1073741824).toFixed(2) + ' GB';
    }
    function fmtDate(ts) {
        var d = new Date(Number(ts) || 0);
        if (isNaN(d.getTime())) return '—';
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }
    var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    function dayKey(ts) {
        var d = new Date(Number(ts) || 0);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    function monthKey(ts) {
        var d = new Date(Number(ts) || 0);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
    }
    function monthLabel(key) {
        var p = String(key || '').split('-');
        return (p[0] || '') + '年' + Number(p[1] || 0) + '月';
    }
    function dayLabel(key) {
        var p = String(key || '').split('-');
        var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        return Number(p[1]) + '月' + Number(p[2]) + '日';
    }
    function weekdayOf(key) {
        var p = String(key || '').split('-');
        var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        return WEEK[d.getDay()] || '';
    }
    function fmtDur(s) {
        s = Number(s) || 0;
        var m = Math.floor(s / 60);
        return m + ':' + pad2(Math.floor(s % 60));
    }
    function estimateSize(url) {
        if (!url) return 0;
        if (/^data:/i.test(url)) {
            var i = url.indexOf(',');
            return Math.max(0, Math.round((url.length - i - 1) * 0.75));
        }
        return 0;
    }

    /* ---------------- 品牌色：取应用图标 ---------------- */
    function hexRgb(hex) {
        var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
        return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 244, g: 114, b: 182 };
    }
    function appColor() {
        try { if (typeof appRegistry !== 'undefined' && appRegistry.album && appRegistry.album.color) return appRegistry.album.color; } catch (e) { }
        return '#f472b6';
    }
    function mix(hex, target, p) {
        var c = hexRgb(hex);
        return '#' +
            ('000000' + Math.round(c.r * (1 - p) + target.r * p).toString(16)).slice(-2) +
            ('000000' + Math.round(c.g * (1 - p) + target.g * p).toString(16)).slice(-2) +
            ('000000' + Math.round(c.b * (1 - p) + target.b * p).toString(16)).slice(-2);
    }
    function applyAccent(host) {
        if (!host) return;
        var app = host.querySelector ? (host.querySelector('.alb-app') || host) : host;
        var hex = appColor();
        var c = hexRgb(hex);
        // 强调色跟随应用图标；深/浅两套派生色保证文字对比度
        app.style.setProperty('--alb-accent', mix(hex, { r: 0, g: 0, b: 0 }, 0));
        app.style.setProperty('--alb-accent-rgb', c.r + ',' + c.g + ',' + c.b);
        app.style.setProperty('--alb-strong', mix(hex, { r: 0, g: 0, b: 0 }, .40));
        app.style.setProperty('--alb-soft', mix(hex, { r: 255, g: 255, b: 255 }, .42));
        app.style.setProperty('--alb-cell', state.cell + 'px');
    }

    /* ---------------- 数据：文件系统扫描 ---------------- */
    function assignDate(node, path) {
        if (node.created && !isNaN(Number(node.created))) return false;
        var h = hash(path);
        var now = Date.now();
        var daysAgo = h % 520;
        var d = new Date(now - daysAgo * 86400000);
        d.setHours(9 + (h % 10), (h % 12) * 5, (h % 60), 0);
        node.created = d.getTime();
        if (!node.size) node.size = estimateSize(node.content);
        return true;
    }
    function makeItem(name, node, group, path) {
        var isVideo = node.fileType === 'video' || /\.(mp4|webm|ogg|mov|m4v)$/i.test(name);
        return {
            name: name,
            url: node.content || '',
            type: isVideo ? 'video' : 'image',
            group: group,
            path: path,
            created: Number(node.created) || 0,
            size: Number(node.size) || estimateSize(node.content),
            trim: node.trim || null,
            fav: false
        };
    }
    function collect() {
        var fs = getUserLS('filesystem') || {};
        var created = false;
        if (!fs.C) { fs.C = { type: 'drive', children: {} }; created = true; }
        if (!fs.C.children) { fs.C.children = {}; created = true; }
        if (!fs.C.children.Photo) { fs.C.children.Photo = { type: 'folder', children: {} }; created = true; }
        if (!fs.C.children.Photo.children) { fs.C.children.Photo.children = {}; created = true; }
        if (!fs.C.children.Videos) { fs.C.children.Videos = { type: 'folder', children: {} }; created = true; }
        if (!fs.C.children.Videos.children) { fs.C.children.Videos.children = {}; created = true; }
        if (created) { try { setUserLS('filesystem', fs); } catch (e) { } }
        var items = [];
        var groups = [];
        var changed = false;
        var seen = {};
        var photo = fs.C && fs.C.children && fs.C.children.Photo;
        if (photo && photo.children) {
            Object.keys(photo.children).forEach(function (g) {
                var gn = photo.children[g];
                if (gn && gn.type === 'folder' && gn.children) {
                    var arr = [];
                    Object.keys(gn.children).forEach(function (fn) {
                        var n = gn.children[fn];
                        if (!n || n.type !== 'file') return;
                        var p = 'C:/Photo/' + g + '/' + fn;
                        if (seen[p]) return;
                        seen[p] = true;
                        if (assignDate(n, p, p)) changed = true;
                        arr.push(makeItem(fn, n, g, p));
                    });
                    if (arr.length) {
                        groups.push({ name: g, count: arr.length, cover: arr[0] });
                        items = items.concat(arr);
                    }
                } else if (gn && gn.type === 'file') {
                    // Photo 根目录里的散图
                    var pr = 'C:/Photo/' + g;
                    if (seen[pr]) return;
                    seen[pr] = true;
                    if (assignDate(gn, pr, pr)) changed = true;
                    items.push(makeItem(g, gn, '未分组', pr));
                }
            });
        }
        var videos = fs.C && fs.C.children && fs.C.children.Videos;
        if (videos && videos.children) {
            Object.keys(videos.children).forEach(function (fn) {
                var n = videos.children[fn];
                if (!n || n.type !== 'file') return;
                var p = 'C:/Videos/' + fn;
                if (seen[p]) return;
                seen[p] = true;
                if (assignDate(n, p, p)) changed = true;
                items.push(makeItem(fn, n, '视频', p));
            });
        }
        if (changed) {
            try { setUserLS('filesystem', fs); } catch (e) { }
        }
        var favs = getUserLS(FAV_KEY) || [];
        var favMap = {};
        if (Array.isArray(favs)) favs.forEach(function (p) { favMap[p] = true; });
        items.forEach(function (it) { it.fav = !!favMap[it.path]; });
        state.items = items;
        state.groups = groups;
        return items;
    }

    function baseList() {
        var list = state.items.slice();
        if (state.tab === 'photo') list = list.filter(function (i) { return i.type === 'image'; });
        else if (state.tab === 'video') list = list.filter(function (i) { return i.type === 'video'; });
        else if (state.tab === 'fav') list = list.filter(function (i) { return i.fav; });
        var q = state.q.trim().toLowerCase();
        if (q) {
            list = list.filter(function (i) {
                return (i.name + ' ' + i.group).toLowerCase().indexOf(q) >= 0;
            });
        }
        return list;
    }
    function sortList(list) {
        var s = state.sort;
        var arr = list.slice();
        arr.sort(function (a, b) {
            if (s === 'name') return a.name.localeCompare(b.name, 'zh-CN');
            if (s === 'size') return (b.size || 0) - (a.size || 0);
            if (s === 'date-asc') return (a.created || 0) - (b.created || 0) || a.name.localeCompare(b.name, 'zh-CN');
            return (b.created || 0) - (a.created || 0) || a.name.localeCompare(b.name, 'zh-CN');
        });
        return arr;
    }
    function viewList() {
        var list = baseList();
        if (state.month) list = list.filter(function (i) { return monthKey(i.created) === state.month; });
        if (state.group) list = list.filter(function (i) { return i.group === state.group; });
        return sortList(list);
    }

    /* ---------------- 缩略图缓存（IndexedDB） ---------------- */
    var thumbDB = { map: {}, ready: false, opening: null };
    function thumbKey(it) { return it.path + '@' + (it.created || 0); }
    function openThumbDB() {
        if (thumbDB.opening) return thumbDB.opening;
        thumbDB.opening = new Promise(function (resolve) {
            try {
                var r = indexedDB.open('n26AlbumThumbs', 1);
                r.onupgradeneeded = function () {
                    var db = r.result;
                    if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs', { keyPath: 'key' });
                };
                r.onsuccess = function () {
                    try {
                        var db = r.result;
                        if (!db.objectStoreNames.contains('thumbs')) { resolve(); return; }
                        var tr = db.transaction('thumbs', 'readonly');
                        var req = tr.objectStore('thumbs').getAll();
                        req.onsuccess = function () {
                            (req.result || []).forEach(function (rec) {
                                if (rec && rec.key && rec.blob) {
                                    try { thumbDB.map[rec.key] = URL.createObjectURL(rec.blob); } catch (e) { }
                                }
                            });
                            thumbDB.ready = true;
                            resolve();
                        };
                        req.onerror = function () { resolve(); };
                    } catch (e) { resolve(); }
                };
                r.onerror = function () { resolve(); };
            } catch (e) { resolve(); }
        });
        return thumbDB.opening;
    }
    function putThumb(key, blob) {
        try {
            var r = indexedDB.open('n26AlbumThumbs', 1);
            r.onsuccess = function () {
                try {
                    var db = r.result;
                    var tr = db.transaction('thumbs', 'readwrite');
                    tr.objectStore('thumbs').put({ key: key, blob: blob });
                } catch (e) { }
            };
        } catch (e) { }
    }
    function makeThumb(img, it) {
        var key = thumbKey(it);
        if (thumbDB.map[key] || state['_gen_' + key]) return;
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h || w < 260 || h < 260) return;
        state['_gen_' + key] = true;
        try {
            var size = 256;
            var c = document.createElement('canvas');
            c.width = size; c.height = size;
            var ctx = c.getContext('2d');
            if (!ctx) return;
            var scale = Math.max(size / w, size / h);
            var dw = w * scale, dh = h * scale;
            ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
            c.toBlob(function (blob) {
                if (!blob) return;
                putThumb(key, blob);
                try {
                    var u = URL.createObjectURL(blob);
                    thumbDB.map[key] = u;
                    if (state.host) {
                        Array.prototype.forEach.call(state.host.querySelectorAll('.alb-cell'), function (cell) {
                            if (cell.dataset.path === it.path) {
                                var im = cell.querySelector('img[data-thumb]');
                                if (im) im.src = u;
                            }
                        });
                    }
                } catch (e) { }
            }, 'image/jpeg', .82);
        } catch (e) { }
    }
    try { openThumbDB(); } catch (e) { }

    /* ---------------- 外壳 ---------------- */
    function shellHtml() {
        return '' +
            '<div class="alb-app">' +
                '<div class="alb-head">' +
                    '<div class="alb-title"><i class="fas fa-images"></i><span>相册</span></div>' +
                    '<div class="alb-tabs">' +
                        '<button class="alb-tab" data-tab="all">全部</button>' +
                        '<button class="alb-tab" data-tab="photo">照片</button>' +
                        '<button class="alb-tab" data-tab="video">视频</button>' +
                        '<button class="alb-tab" data-tab="fav">收藏</button>' +
                    '</div>' +
                    '<div class="alb-head-right">' +
                        '<label class="alb-search"><i class="fas fa-magnifying-glass"></i>' +
                            '<input type="search" placeholder="搜索照片" autocomplete="off"></label>' +
                        '<button class="alb-btn alb-icon-btn" data-act="sort" title="排序：日期新→旧"><i class="fas fa-sort-down"></i></button>' +
                        '<button class="alb-btn" data-act="select" title="多选（Ctrl+A 全选）"><i class="fas fa-check-square"></i><span>选择</span></button>' +
                        '<button class="alb-btn primary" data-act="import" title="从本机导入照片或视频"><i class="fas fa-file-import"></i><span>导入</span></button>' +
                        '<input type="file" accept="image/*,video/*" multiple style="display:none" data-alb-file>' +
                    '</div>' +
                '</div>' +
                '<div class="alb-bar offline"><i class="fas fa-wifi"></i><span>离线模式 · 本地照片可正常浏览，导入仍然可用</span></div>' +
                '<div class="alb-bar quota"><i class="fas fa-triangle-exclamation"></i><span>空间不足，已暂停导入（本地存储写满，请先删除部分照片）</span></div>' +
                '<div class="alb-body">' +
                    '<aside class="alb-side"></aside>' +
                    '<main class="alb-main"></main>' +
                '</div>' +
                '<div class="alb-status"></div>' +
                '<div class="alb-bulk">' +
                    '<span class="alb-bulk-count"></span>' +
                    '<span class="grow"></span>' +
                    '<button class="alb-btn" data-act="bulk-fav"><i class="fas fa-heart"></i>收藏</button>' +
                    '<button class="alb-btn" data-act="bulk-export"><i class="fas fa-download"></i>导出</button>' +
                    '<button class="alb-btn danger" data-act="bulk-del"><i class="fas fa-trash"></i>删除</button>' +
                    '<button class="alb-btn" data-act="bulk-cancel">取消</button>' +
                '</div>' +
                '<div class="alb-snack"><span></span><button data-act="undo">撤销</button></div>' +
            '</div>';
    }

    function renderAlbumApp(content) {
        if (!content) return;
        state.host = content;
        state.destroyed = false;
        state.tab = 'all';
        state.month = '';
        state.group = '';
        state.q = '';
        state.selectMode = false;
        state.selected = {};
        state.anchor = null;
        state.quota = false;
        state.undo = null;
        state.animate = true;
        content.innerHTML = shellHtml();
        applyAccent(content);
        bindHost();
        refreshBars();
        if (!state.loaded) {
            paintSkeleton();
            setTimeout(function () {
                if (state.destroyed || !state.host || !document.body.contains(state.host)) return;
                state.loaded = true;
                try { render(false); } catch (e) {
                    paintError(e);
                }
            }, 180);
        } else {
            try { render(false); } catch (e) { paintError(e); }
        }
        // 后台把 IndexedDB 里的缩略图接回来一次
        Promise.resolve(thumbDB.ready ? true : openThumbDB()).then(function () {
            if (thumbDB.ready && state.host) {
                try { render(false); } catch (e) { }
            }
        });
    }

    function bindHost() {
        var host = state.host;
        if (!host || host._albBound) return;
        host._albBound = true;
        host.addEventListener('click', onHostClick);
        host.addEventListener('input', onHostInput);
        host.addEventListener('change', onHostChange);
        host.addEventListener('error', onHostError, true);
        host.addEventListener('load', onHostLoad, true);
        host.addEventListener('loadedmetadata', onHostMeta, true);
        host.addEventListener('wheel', onHostWheel, { passive: false });
    }

    /* ---------------- 渲染 ---------------- */
    function paintSkeleton() {
        var host = state.host;
        if (!host) return;
        var side = host.querySelector('.alb-side');
        var main = host.querySelector('.alb-main');
        if (side) {
            side.innerHTML = '<div class="alb-sec-h" style="padding:8px 8px 6px;font-size:10.5px;color:var(--alb-fg-3);">时间轴</div>' +
                Array(10).join('<div class="alb-skel-side"></div>');
        }
        if (main) {
            var cells = '';
            for (var i = 0; i < 18; i++) {
                cells += '<div class="alb-skel" style="--row:' + Math.floor(i / 4) + '"></div>';
            }
            main.innerHTML = '<div class="alb-sum"><span>正在读取照片…</span></div><div class="alb-skel-grid">' + cells + '</div>';
        }
    }

    function paintError(err) {
        var main = state.host && state.host.querySelector('.alb-main');
        if (!main) return;
        main.innerHTML = '<div class="alb-state"><div class="alb-state-ico"><i class="fas fa-triangle-exclamation"></i></div>' +
            '<h3>相册读取失败</h3><p>本地照片索引可能损坏。你可以重试，或去文件管理检查 C:/Photo。</p>' +
            '<div class="alb-state-actions"><button class="alb-btn primary" data-act="retry">重试</button>' +
            '<button class="alb-btn" data-act="open-files">打开文件管理</button></div></div>';
        try { console.error('[n26Album]', err); } catch (e) { }
    }

    function render(animate) {
        var host = state.host;
        if (!host) return;
        if (animate) state.animate = true;
        collect();
        // 清理已被删除的选中项
        var alive = {};
        state.items.forEach(function (i) { alive[i.path] = true; });
        Object.keys(state.selected).forEach(function (p) { if (!alive[p]) delete state.selected[p]; });
        state.viewList = viewList();
        paintTabs();
        paintSidebar();
        paintMain(state.viewList, state.animate);
        paintStatus();
        refreshSelection();
        refreshBars();
        var main = host.querySelector('.alb-main');
        if (main && state.animate) main.scrollTop = 0;
        state.animate = false;
    }

    function paintTabs() {
        var host = state.host;
        if (!host) return;
        Array.prototype.forEach.call(host.querySelectorAll('[data-tab]'), function (b) {
            b.classList.toggle('on', b.dataset.tab === state.tab);
        });
    }

    function paintSidebar() {
        var host = state.host;
        if (!host) return;
        var side = host.querySelector('.alb-side');
        if (!side) return;
        var base = baseList();
        var months = {};
        base.forEach(function (i) {
            var k = monthKey(i.created);
            months[k] = (months[k] || 0) + 1;
        });
        var mk = Object.keys(months).sort(function (a, b) { return a < b ? 1 : a > b ? -1 : 0; });
        var groups = state.groups.map(function (g) {
            var n = base.filter(function (i) { return i.group === g.name; }).length;
            return { name: g.name, count: n };
        }).filter(function (g) { return g.count > 0; }).sort(function (a, b) { return b.count - a.count; });
        var favCount = state.items.filter(function (i) { return i.fav; }).length;
        var videoCount = state.items.filter(function (i) { return i.type === 'video'; }).length;

        var html = '<div class="alb-sec"><div class="alb-sec-h"><span>时间轴</span><span>' + base.length + '</span></div>';
        var allOn = !state.month && !state.group && state.tab !== 'fav' && state.tab !== 'video';
        html += '<button class="alb-side-item' + (allOn ? ' on' : '') + '" data-side="all"><i class="fas fa-clock"></i><span>全部照片</span><b>' + base.length + '</b></button>';
        mk.forEach(function (k) {
            html += '<button class="alb-side-item' + (state.month === k ? ' on' : '') + '" data-month="' + esc(k) + '">' +
                '<i class="fas fa-calendar-day"></i><span>' + esc(monthLabel(k)) + '</span><b>' + months[k] + '</b></button>';
        });
        if (!mk.length) html += '<div class="alb-sec-h" style="font-weight:400;text-transform:none;letter-spacing:0;">暂无日期分组</div>';
        html += '</div>';

        html += '<div class="alb-sec"><div class="alb-sec-h"><span>相簿</span><span>' + (groups.length + 2) + '</span></div>';
        html += '<button class="alb-side-item' + (state.tab === 'fav' ? ' on' : '') + '" data-side="fav"><i class="fas fa-heart"></i><span>收藏</span><b>' + favCount + '</b></button>';
        html += '<button class="alb-side-item' + (state.tab === 'video' ? ' on' : '') + '" data-side="video"><i class="fas fa-clapperboard"></i><span>视频</span><b>' + videoCount + '</b></button>';
        groups.forEach(function (g) {
            html += '<button class="alb-side-item' + (state.group === g.name ? ' on' : '') + '" data-group="' + esc(g.name) + '">' +
                '<i class="fas fa-folder-open"></i><span>' + esc(g.name) + '</span><b>' + g.count + '</b></button>';
        });
        html += '</div>';
        if (!state.month && state.group) {
            html += '<button class="alb-btn" style="width:100%;justify-content:center;margin-top:2px;" data-side="all"><i class="fas fa-arrow-left"></i>返回全部</button>';
        }
        side.innerHTML = html;
    }

    function paintMain(list, animate) {
        var host = state.host;
        if (!host) return;
        var main = host.querySelector('.alb-main');
        if (!main) return;
        var total = state.items.length;
        var sum = '<div class="alb-sum"><span class="alb-dot"></span><b>' + list.length + '</b> 项<span class="sep"></span>' +
            '<span>' + fmtSize(state.items.reduce(function (a, i) { return a + (i.size || 0); }, 0)) + '</span>' +
            '<span class="sep"></span><span>本地</span></div>';

        if (!total) {
            main.innerHTML = '<div class="alb-state"><div class="alb-state-ico"><i class="fas fa-images"></i></div>' +
                '<h3>还没有照片</h3><p>从本机导入图片或视频，或者去截一张屏。所有文件都会进入 C:/Photo/导入。</p>' +
                '<div class="alb-state-actions"><button class="alb-btn primary" data-act="import">从本机导入</button>' +
                '<button class="alb-btn" data-act="empty-screenshot">去截图</button></div></div>';
            return;
        }
        if (!list.length) {
            var title = '这里还没有内容';
            var desc = '换个筛选条件试试。';
            if (state.tab === 'fav') { title = '还没有收藏'; desc = '在缩略图上点心形，或在灯箱里按 F 收藏。'; }
            else if (state.q) { title = '没有找到「' + esc(state.q) + '」'; desc = '搜索只匹配文件名和相簿名。'; }
            else if (state.month) { title = '这个月没有照片'; desc = monthLabel(state.month) + ' 暂无素材。'; }
            else if (state.group) { title = '相簿是空的'; desc = '「' + esc(state.group) + '」里没有可用素材。'; }
            main.innerHTML = '<div class="alb-state"><div class="alb-state-ico"><i class="fas fa-' + (state.tab === 'fav' ? 'heart' : 'images') + '"></i></div>' +
                '<h3>' + title + '</h3><p>' + desc + '</p>' +
                '<div class="alb-state-actions"><button class="alb-btn" data-act="clear-filter">查看全部</button>' +
                (state.q ? '<button class="alb-btn" data-act="clear-search">清除搜索</button>' : '') + '</div></div>';
            return;
        }

        var groups = {};
        var order = [];
        list.forEach(function (i) {
            var k = dayKey(i.created);
            if (!groups[k]) { groups[k] = []; order.push(k); }
            groups[k].push(i);
        });
        if (state.sort === 'date-asc') order.sort();
        else order.sort(function (a, b) { return a < b ? 1 : a > b ? -1 : 0; });

        var html = sum;
        var idx = 0;
        order.forEach(function (k) {
            var arr = groups[k];
            html += '<div class="alb-day">' + dayLabel(k) + '<span>' + weekdayOf(k) + ' · ' + arr.length + ' 项</span></div>';
            html += '<div class="alb-grid' + (animate ? ' anim' : '') + '">';
            arr.forEach(function (it) {
                html += cellHtml(it, Math.min(idx, 8));
                idx++;
            });
            html += '</div>';
        });
        main.innerHTML = html;
    }

    function cellHtml(it, i) {
        var key = thumbKey(it);
        var src = thumbDB.map[key] || it.url;
        var sel = !!state.selected[it.path];
        var heart = '<button class="alb-heart' + (it.fav ? ' on' : '') + '" data-act="fav" title="' + (it.fav ? '取消收藏' : '收藏') + '">' +
            '<i class="' + (it.fav ? 'fas' : 'far') + ' fa-heart"></i></button>';
        var media;
        if (it.type === 'video') {
            media = '<video src="' + esc(src) + '" muted preload="metadata" data-thumb></video>' +
                '<span class="alb-play"><i class="fas fa-play"></i></span>' +
                '<span class="alb-dur" data-vdur><i class="fas fa-play"></i>—</span>';
        } else {
            media = '<img src="' + esc(src) + '" loading="lazy" decoding="async" data-thumb alt="' + esc(it.name) + '">';
        }
        return '<div class="alb-cell' + (sel ? ' sel' : '') + '" data-path="' + esc(it.path) + '" style="--i:' + i + '">' +
            '<div class="alb-thumb">' + media +
                '<span class="alb-check"><i class="fas fa-check"></i></span>' +
                heart +
                '<div class="alb-name">' + esc(it.name) + '</div>' +
            '</div></div>';
    }

    function paintStatus() {
        var host = state.host;
        if (!host) return;
        var st = host.querySelector('.alb-status');
        if (!st) return;
        var n = state.viewList.length;
        var sel = selectedCount();
        var size = state.viewList.reduce(function (a, i) { return a + (i.size || 0); }, 0);
        st.innerHTML = '<span><b>' + n + '</b> 项 · 已选 <b>' + sel + '</b></span><span class="grow"></span>' +
            '<span>' + fmtSize(size) + '</span><span><i class="alb-dot"></i>本地</span>';
    }

    function refreshSelection() {
        var host = state.host;
        if (!host) return;
        var app = host.querySelector('.alb-app');
        if (app) app.classList.toggle('selecting', state.selectMode || selectedCount() > 0);
        Array.prototype.forEach.call(host.querySelectorAll('.alb-cell'), function (cell) {
            cell.classList.toggle('sel', !!state.selected[cell.dataset.path]);
        });
        var bulk = host.querySelector('.alb-bulk');
        if (bulk) {
            var n = selectedCount();
            bulk.classList.toggle('show', state.selectMode || n > 0);
            var cnt = bulk.querySelector('.alb-bulk-count');
            if (cnt) cnt.innerHTML = '已选 <b>' + n + '</b> 项';
        }
        var selBtn = host.querySelector('[data-act="select"]');
        if (selBtn) selBtn.classList.toggle('on', state.selectMode);
        paintStatus();
    }
    function selectedCount() { return Object.keys(state.selected).length; }
    function selectedItems() {
        var map = {};
        state.items.forEach(function (i) { if (state.selected[i.path]) map[i.path] = i; });
        return Object.keys(state.selected).map(function (p) { return map[p]; }).filter(Boolean);
    }

    function refreshBars() {
        var host = state.host;
        if (!host) return;
        var off = false;
        try { off = navigator.onLine === false; } catch (e) { }
        var offBar = host.querySelector('.alb-bar.offline');
        var quotaBar = host.querySelector('.alb-bar.quota');
        if (offBar) offBar.classList.toggle('show', off);
        if (quotaBar) quotaBar.classList.toggle('show', !!state.quota);
    }

    /* ---------------- 交互：相册主界面 ---------------- */
    function onHostClick(e) {
        var host = state.host;
        if (!host) return;
        var actEl = e.target.closest('[data-act]');
        if (actEl && host.contains(actEl)) {
            var act = actEl.dataset.act;
            if (act === 'fav') {
                var cell = actEl.closest('.alb-cell');
                if (cell) toggleFav(cell.dataset.path);
                e.preventDefault();
                return;
            }
            if (act === 'download') {
                var dcell = actEl.closest('.alb-cell');
                if (dcell) {
                    var ditem = findItem(dcell.dataset.path);
                    if (ditem) downloadItem(ditem, function () { notify('下载', '已开始下载 ' + ditem.name, 'success'); });
                }
                e.preventDefault();
                return;
            }
            handleAction(act, actEl);
            e.preventDefault();
            return;
        }
        var tabEl = e.target.closest('[data-tab]');
        if (tabEl && host.contains(tabEl)) {
            state.tab = tabEl.dataset.tab;
            state.month = '';
            state.group = '';
            state.animate = true;
            render(true);
            return;
        }
        var sideEl = e.target.closest('[data-side]');
        if (sideEl && host.contains(sideEl)) {
            var side = sideEl.dataset.side;
            if (side === 'all') { state.tab = 'all'; state.month = ''; state.group = ''; }
            else if (side === 'fav') { state.tab = 'fav'; state.month = ''; state.group = ''; }
            else if (side === 'video') { state.tab = 'video'; state.month = ''; state.group = ''; }
            state.animate = true;
            render(true);
            return;
        }
        var monthEl = e.target.closest('[data-month]');
        if (monthEl && host.contains(monthEl)) {
            var mk = monthEl.dataset.month;
            state.month = (state.month === mk) ? '' : mk;
            state.group = '';
            state.animate = true;
            render(true);
            return;
        }
        var groupEl = e.target.closest('[data-group]');
        if (groupEl && host.contains(groupEl)) {
            var g = groupEl.dataset.group;
            state.group = (state.group === g) ? '' : g;
            state.month = '';
            state.animate = true;
            render(true);
            return;
        }
        var cellEl = e.target.closest('.alb-cell');
        if (cellEl && host.contains(cellEl)) {
            var path = cellEl.dataset.path;
            var list = state.viewList;
            var idx = -1;
            for (var i = 0; i < list.length; i++) if (list[i].path === path) { idx = i; break; }
            var additive = e.ctrlKey || e.metaKey || state.selectMode;
            var shift = e.shiftKey;
            if (additive || shift) {
                selectRange(path, list, shift);
            } else if (idx >= 0) {
                openViewer(list, idx);
            }
        }
    }

    function findItem(path) {
        for (var i = 0; i < state.items.length; i++) if (state.items[i].path === path) return state.items[i];
        return null;
    }

    function handleAction(act, el) {
        if (act === 'sort') cycleSort();
        else if (act === 'select') { state.selectMode = !state.selectMode; refreshSelection(); }
        else if (act === 'import') { var f = state.host && state.host.querySelector('[data-alb-file]'); if (f) f.click(); }
        else if (act === 'empty-screenshot') { try { openApp('screenshot'); } catch (e) { notify('提示', '截图应用不可用', 'info'); } }
        else if (act === 'clear-filter') { state.tab = 'all'; state.month = ''; state.group = ''; state.q = ''; state.animate = true; render(true); }
        else if (act === 'clear-search') { state.q = ''; var input = state.host && state.host.querySelector('.alb-search input'); if (input) input.value = ''; render(false); }
        else if (act === 'retry') { state.loaded = true; try { render(true); } catch (e) { paintError(e); } }
        else if (act === 'open-files') { try { openApp('files'); } catch (e) { } }
        else if (act === 'bulk-fav') { bulkFav(); }
        else if (act === 'bulk-export') { bulkExport(); }
        else if (act === 'bulk-del') { bulkDelete(); }
        else if (act === 'bulk-cancel') { state.selected = {}; state.selectMode = false; refreshSelection(); }
        else if (act === 'undo') { undoDelete(); }
    }

    function cycleSort() {
        var order = ['date-desc', 'date-asc', 'name', 'size'];
        var i = order.indexOf(state.sort);
        state.sort = order[(i + 1) % order.length];
        var btn = state.host && state.host.querySelector('[data-act="sort"]');
        if (btn) {
            var icon = state.sort === 'date-asc' ? 'fa-sort-up' : state.sort === 'name' ? 'fa-font' : state.sort === 'size' ? 'fa-sort-amount-down' : 'fa-sort-down';
            var label = state.sort === 'date-asc' ? '日期旧→新' : state.sort === 'name' ? '文件名 A→Z' : state.sort === 'size' ? '大小 大→小' : '日期新→旧';
            btn.innerHTML = '<i class="fas ' + icon + '"></i>';
            btn.title = '排序：' + label;
        }
        state.animate = false;
        render(false);
    }

    function onHostInput(e) {
        if (!e.target.closest('.alb-search')) return;
        var v = e.target.value;
        clearTimeout(onHostInput._t);
        onHostInput._t = setTimeout(function () {
            state.q = v;
            state.animate = false;
            render(false);
        }, 140);
    }
    function onHostChange(e) {
        if (e.target.matches && e.target.matches('[data-alb-file]')) {
            importFiles(e.target.files);
            e.target.value = '';
        }
    }
    function onHostError(e) {
        var el = e.target;
        if (!el || !el.dataset || el.dataset.thumb === undefined) return;
        var cell = el.closest('.alb-cell');
        if (!cell || cell.dataset.broken) return;
        cell.dataset.broken = '1';
        var thumb = cell.querySelector('.alb-thumb');
        if (!thumb) return;
        el.style.display = 'none';
        var it = findItem(cell.dataset.path);
        var icon = it && it.type === 'video' ? 'fa-video' : 'fa-image';
        thumb.insertAdjacentHTML('afterbegin', '<div class="alb-broken"><i class="fas ' + icon + '"></i><span>无法预览</span><b data-act="download">下载原文件</b></div>');
    }
    function onHostLoad(e) {
        var im = e.target;
        if (!im || im.tagName !== 'IMG' || !im.dataset || im.dataset.thumb === undefined) return;
        // 256px 缩略图回填后不再覆盖原始尺寸
        if (im.src && im.src.indexOf('blob:') === 0) return;
        var cell = im.closest('.alb-cell');
        if (!cell) return;
        var it = findItem(cell.dataset.path);
        if (it) {
            state.dims[it.path] = { w: im.naturalWidth, h: im.naturalHeight };
            makeThumb(im, it);
        }
    }
    function onHostMeta(e) {
        var v = e.target;
        if (!v || v.tagName !== 'VIDEO' || !v.dataset || v.dataset.thumb === undefined) return;
        var cell = v.closest('.alb-cell');
        if (!cell) return;
        var dur = cell.querySelector('[data-vdur]');
        if (dur && v.duration) dur.innerHTML = '<i class="fas fa-play"></i>' + fmtDur(v.duration);
        var it = findItem(cell.dataset.path);
        if (it && v.videoWidth) state.dims[it.path] = { w: v.videoWidth, h: v.videoHeight };
    }
    function onHostWheel(e) {
        if (!e.ctrlKey) return;
        if (!e.target.closest || !e.target.closest('.alb-main')) return;
        e.preventDefault();
        state.cell = clamp(state.cell + (e.deltaY > 0 ? -6 : 6), 88, 220);
        if (state.host) {
            var app = state.host.querySelector('.alb-app');
            if (app) app.style.setProperty('--alb-cell', state.cell + 'px');
        }
    }

    function selectRange(path, list, shift) {
        if (shift && state.anchor) {
            var a = -1, b = -1;
            for (var i = 0; i < list.length; i++) {
                if (list[i].path === state.anchor) a = i;
                if (list[i].path === path) b = i;
            }
            if (a >= 0 && b >= 0) {
                var lo = Math.min(a, b), hi = Math.max(a, b);
                for (var j = lo; j <= hi; j++) state.selected[list[j].path] = true;
                state.anchor = path;
                refreshSelection();
                return;
            }
        }
        if (state.selected[path]) delete state.selected[path];
        else state.selected[path] = true;
        state.anchor = path;
        refreshSelection();
    }
    function selectAll() {
        state.viewList.forEach(function (i) { state.selected[i.path] = true; });
        refreshSelection();
    }
    function clearSelection() {
        state.selected = {};
        state.selectMode = false;
        state.anchor = null;
        refreshSelection();
    }
    function toggleFav(path, el) {
        var it = findItem(path);
        if (!it) return;
        var favs = getUserLS(FAV_KEY) || [];
        if (!Array.isArray(favs)) favs = [];
        var i = favs.indexOf(path);
        if (i >= 0) { it.fav = false; favs.splice(i, 1); }
        else { it.fav = true; favs.push(path); }
        try { setUserLS(FAV_KEY, favs); } catch (e) { }
        var host = state.host;
        if (host) {
            Array.prototype.forEach.call(host.querySelectorAll('.alb-cell'), function (cell) {
                if (cell.dataset.path !== path) return;
                var h = cell.querySelector('.alb-heart');
                if (h) {
                    h.classList.toggle('on', it.fav);
                    h.title = it.fav ? '取消收藏' : '收藏';
                    h.innerHTML = '<i class="' + (it.fav ? 'fas' : 'far') + ' fa-heart"></i>';
                    h.classList.remove('pop');
                    void h.offsetWidth;
                    h.classList.add('pop');
                }
            });
        }
        if (state.tab === 'fav' || state.group) render(false);
        else { paintSidebar(); paintStatus(); }
    }
    function bulkFav() {
        var list = selectedItems();
        if (!list.length) return;
        var favs = getUserLS(FAV_KEY) || [];
        if (!Array.isArray(favs)) favs = [];
        list.forEach(function (it) {
            it.fav = true;
            if (favs.indexOf(it.path) < 0) favs.push(it.path);
        });
        try { setUserLS(FAV_KEY, favs); } catch (e) { }
        notify('已收藏', list.length + ' 项已加入收藏', 'success');
        render(false);
    }

    /* ---------------- 导入 ---------------- */
    function importFiles(fileList) {
        var arr = fileList ? Array.prototype.slice.call(fileList) : [];
        if (!arr.length) return;
        notify('正在导入', '共 ' + arr.length + ' 个文件…', 'info');
        state.importing = true;
        var i = 0, added = 0, failed = 0, quota = false;
        function next() {
            if (i >= arr.length) return finish();
            var f = arr[i++];
            if (!/^(image|video)\//.test(f.type || '')) { failed++; next(); return; }
            if (f.size > FILE_LIMIT) {
                failed++;
                notify('已跳过', f.name + ' 超过 24 MB，本地存储无法容纳', 'warning');
                next();
                return;
            }
            var rd = new FileReader();
            rd.onload = function () {
                try {
                    var fs = getUserLS('filesystem') || {};
                    if (!fs.C) fs.C = { type: 'folder', children: {} };
                    if (!fs.C.children) fs.C.children = {};
                    if (!fs.C.children.Photo) fs.C.children.Photo = { type: 'folder', children: {} };
                    if (!fs.C.children.Photo.children) fs.C.children.Photo.children = {};
                    if (!fs.C.children.Photo.children['导入']) fs.C.children.Photo.children['导入'] = { type: 'folder', children: {} };
                    var bucket = fs.C.children.Photo.children['导入'].children;
                    if (!bucket) { fs.C.children.Photo.children['导入'].children = {}; bucket = fs.C.children.Photo.children['导入'].children; }
                    var name = f.name || ('导入-' + Date.now() + '.png');
                    var dot = name.lastIndexOf('.');
                    var base = dot > 0 ? name.slice(0, dot) : name;
                    var ext = dot > 0 ? name.slice(dot) : '';
                    var n = 1;
                    while (bucket[name]) { name = base + '(' + n + ')' + ext; n++; }
                    bucket[name] = {
                        type: 'file',
                        fileType: /^video\//.test(f.type) ? 'video' : 'image',
                        content: String(rd.result || ''),
                        created: f.lastModified || Date.now(),
                        size: f.size || 0
                    };
                    try { setUserLS('filesystem', fs); }
                    catch (err) { quota = true; throw err; }
                    added++;
                } catch (err) {
                    if (/quota/i.test(String(err && err.name) + String(err && err.message))) quota = true;
                    failed++;
                }
                next();
            };
            rd.onerror = function () { failed++; next(); };
            rd.readAsDataURL(f);
        }
        function finish() {
            state.importing = false;
            state.quota = quota;
            if (added > 0) {
                state.tab = 'all';
                state.month = '';
                state.group = '';
                state.q = '';
                render(true);
                notify('导入完成', '成功 ' + added + ' 个' + (failed ? '，失败 ' + failed + ' 个' : '') + '，已放入「导入」相簿', 'success');
            } else if (quota) {
                notify('空间不足', '本地存储已满，未写入新照片', 'error');
            } else {
                notify('导入失败', '没有可识别的图片或视频文件', 'error');
            }
            refreshBars();
            try { if (typeof playSfx === 'function') playSfx(added ? 'success' : 'error'); } catch (e) { }
        }
        next();
    }

    /* ---------------- 删除 / 撤销 ---------------- */
    function deletePaths(paths) {
        if (!paths || !paths.length) return;
        var fs = getUserLS('filesystem') || {};
        var trash = getUserLS('trash') || [];
        if (!Array.isArray(trash)) trash = [];
        var batch = 'alb_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        var saved = [];
        var removedFav = [];
        paths.forEach(function (p) {
            var parts = String(p).split('/').filter(Boolean);
            if (!parts.length) return;
            var node = fs[parts[0].replace(':', '')];
            for (var i = 1; i < parts.length && node; i++) node = node.children && node.children[parts[i]];
            if (!node || node.type !== 'file') return;
            var parentParts = parts.slice(0, -1);
            var parent = fs[parentParts[0].replace(':', '')];
            for (var j = 1; j < parentParts.length && parent; j++) parent = parent.children && parent.children[parentParts[j]];
            if (!parent || !parent.children) return;
            var name = parts[parts.length - 1];
            var originalPath = parentParts.join('/');
            saved.push({ parentPath: originalPath, name: name, node: node });
            trash.push({
                name: name,
                type: 'file',
                content: node.content,
                children: node.children,
                fileType: node.fileType,
                created: node.created,
                size: node.size,
                trim: node.trim,
                originalPath: originalPath,
                deletedAt: Date.now(),
                batch: batch
            });
            delete parent.children[name];
        });
        if (!saved.length) return;
        try { setUserLS('filesystem', fs); } catch (e) { }
        try { setUserLS('trash', trash); } catch (e) { }
        var favs = getUserLS(FAV_KEY) || [];
        if (Array.isArray(favs)) {
            paths.forEach(function (p) { var i = favs.indexOf(p); if (i >= 0) { favs.splice(i, 1); removedFav.push(p); } });
            try { setUserLS(FAV_KEY, favs); } catch (e) { }
        }
        state.undo = { batch: batch, saved: saved, favs: removedFav, n: saved.length };
        state.selected = {};
        state.selectMode = false;
        try { if (typeof n26UpdateTrashCount === 'function') n26UpdateTrashCount(); } catch (e) { }
        render(false);
        showSnack('已删除 ' + saved.length + ' 项，移入回收站');
        notify('已删除', saved.length + ' 项已移入回收站', 'success');
        clearTimeout(state.undoTimer);
        state.undoTimer = setTimeout(function () { hideSnack(); state.undo = null; }, 8000);
    }
    function undoDelete() {
        var u = state.undo;
        if (!u) return;
        var fs = getUserLS('filesystem') || {};
        var trash = getUserLS('trash') || [];
        u.saved.forEach(function (s) {
            var parts = String(s.parentPath).split('/').filter(Boolean);
            var parent = fs[parts[0].replace(':', '')];
            for (var i = 1; i < parts.length && parent; i++) parent = parent.children && parent.children[parts[i]];
            if (!parent) return;
            if (!parent.children) parent.children = {};
            if (!parent.children[s.name]) parent.children[s.name] = s.node;
        });
        trash = (Array.isArray(trash) ? trash : []).filter(function (t) { return t.batch !== u.batch; });
        try { setUserLS('filesystem', fs); setUserLS('trash', trash); } catch (e) { }
        if (u.favs && u.favs.length) {
            var favs = getUserLS(FAV_KEY) || [];
            if (!Array.isArray(favs)) favs = [];
            u.favs.forEach(function (p) { if (favs.indexOf(p) < 0) favs.push(p); });
            try { setUserLS(FAV_KEY, favs); } catch (e) { }
        }
        state.undo = null;
        clearTimeout(state.undoTimer);
        hideSnack();
        try { if (typeof n26UpdateTrashCount === 'function') n26UpdateTrashCount(); } catch (e) { }
        render(true);
        notify('已撤销', '照片已回到原来的相簿', 'success');
    }
    function showSnack(text) {
        var host = state.host;
        if (!host) return;
        var sn = host.querySelector('.alb-snack');
        if (!sn) return;
        sn.querySelector('span').textContent = text;
        sn.classList.add('show');
    }
    function hideSnack() {
        var host = state.host;
        if (!host) return;
        var sn = host.querySelector('.alb-snack');
        if (sn) sn.classList.remove('show');
    }
    function bulkDelete() {
        var list = selectedItems();
        if (!list.length) { notify('提示', '请先选择照片', 'info'); return; }
        deletePaths(list.map(function (i) { return i.path; }));
    }

    /* ---------------- 下载 / 批量导出 ---------------- */
    function uniqueName(name, used) {
        used = used || {};
        var n = String(name || 'photo.jpg');
        if (!used[n]) { used[n] = 1; return n; }
        var dot = n.lastIndexOf('.');
        var base = dot > 0 ? n.slice(0, dot) : n;
        var ext = dot > 0 ? n.slice(dot) : '';
        var k = used[n] + 1;
        var cand = base + '(' + k + ')' + ext;
        while (used[cand]) { k++; cand = base + '(' + k + ')' + ext; }
        used[n] = k;
        used[cand] = 1;
        return cand;
    }
    function saveBlob(blob, name) {
        try {
            var u = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = u;
            a.download = name;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { a.remove(); URL.revokeObjectURL(u); }, 1200);
            return true;
        } catch (e) { return false; }
    }
    function downloadItem(item, cb, used) {
        if (!item) return;
        var name = uniqueName(item.name, used);
        if (/^data:/i.test(item.url)) {
            try {
                var a = document.createElement('a');
                a.href = item.url;
                a.download = name;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                setTimeout(function () { a.remove(); }, 120);
            } catch (e) { }
            cb && cb();
            return;
        }
        try {
            fetch(item.url, { mode: 'cors' }).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.blob();
            }).then(function (b) {
                saveBlob(b, name);
                cb && cb();
            }).catch(function () {
                try {
                    var a = document.createElement('a');
                    a.href = item.url;
                    a.download = name;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(function () { a.remove(); }, 120);
                } catch (e) { }
                cb && cb();
            });
        } catch (e) { cb && cb(); }
    }
    function bulkExport() {
        var list = selectedItems();
        if (!list.length) { notify('提示', '请先选择照片', 'info'); return; }
        var used = {};
        var i = 0;
        var bulk = state.host && state.host.querySelector('.alb-bulk');
        var cnt = bulk && bulk.querySelector('.alb-bulk-count');
        function step() {
            if (i >= list.length) {
                refreshSelection();
                notify('导出完成', list.length + ' 个文件已开始下载', 'success');
                return;
            }
            var it = list[i];
            i++;
            if (cnt) cnt.innerHTML = '导出 <b>' + i + '</b> / ' + list.length;
            downloadItem(it, function () { setTimeout(step, 260); }, used);
        }
        notify('正在导出', '共 ' + list.length + ' 个文件…', 'info');
        step();
    }

    /* ---------------- 灯箱 ---------------- */
    function ensureViewer() {
        var v = document.getElementById('n26albViewer');
        if (v) return v;
        v = document.createElement('div');
        v.id = 'n26albViewer';
        v.className = 'alb-viewer';
        v.innerHTML = '' +
            '<div class="alb-v-top">' +
                '<button class="alb-btn alb-icon-btn" data-v="close" title="关闭（Esc）"><i class="fas fa-arrow-left"></i></button>' +
                '<div class="alb-v-title"></div>' +
                '<div class="alb-v-actions">' +
                    '<button class="alb-btn alb-icon-btn" data-v="fav" title="收藏（F）"><i class="far fa-heart"></i></button>' +
                    '<button class="alb-btn alb-icon-btn" data-v="download" title="下载"><i class="fas fa-download"></i></button>' +
                    '<button class="alb-btn alb-icon-btn" data-v="info" title="信息（I）"><i class="fas fa-circle-info"></i></button>' +
                    '<button class="alb-btn alb-icon-btn" data-v="more" title="更多"><i class="fas fa-ellipsis"></i></button>' +
                '</div>' +
            '</div>' +
            '<div class="alb-v-main">' +
                '<div class="alb-v-stage" data-v="stage">' +
                    '<div class="alb-v-frame"></div>' +
                    '<div class="alb-v-tools">' +
                        '<button data-v="zoom-out" title="缩小（-）"><i class="fas fa-magnifying-glass-minus"></i></button>' +
                        '<button data-v="zoom-in" title="放大（+）"><i class="fas fa-magnifying-glass-plus"></i></button>' +
                        '<button data-v="fit" title="适应屏幕（0）"><i class="fas fa-expand"></i></button>' +
                        '<button data-v="rotate" title="旋转（R）"><i class="fas fa-rotate-right"></i></button>' +
                        '<button data-v="full" title="全屏（双击图片）"><i class="fas fa-up-right-and-down-left-from-center"></i></button>' +
                        '<div class="sep"></div>' +
                        '<button data-v="slide" title="幻灯片（空格）"><i class="fas fa-play"></i></button>' +
                        '<button data-v="prev" title="上一张（←）"><i class="fas fa-chevron-left"></i></button>' +
                        '<button data-v="next" title="下一张（→）"><i class="fas fa-chevron-right"></i></button>' +
                    '</div>' +
                '</div>' +
                '<aside class="alb-v-info"></aside>' +
            '</div>' +
            '<div class="alb-v-film"></div>' +
            '<div class="alb-v-menu"></div>';
        document.body.appendChild(v);
        v.addEventListener('click', onViewerClick);
        v.addEventListener('dblclick', function (e) {
            if (!state.viewer) return;
            if (e.target.closest('.alb-v-frame') || e.target.closest('.alb-v-media')) toggleViewerFull();
        });
        var stage = v.querySelector('.alb-v-stage');
        if (stage) {
            // 放大镜面自行接管滚轮：手势层不再做平滑滚动（捏合仍走 ctrl+wheel 事件）
            stage.setAttribute('data-n26-wheel', '1');
            stage.addEventListener('wheel', function (e) {
                var view = state.viewer;
                var it = viewerItem();
                if (!view || !it || it.type !== 'image') return;
                if (!e.target.closest('.alb-v-frame')) return;
                if (e.ctrlKey) return;   // 触控板捏合交给手势层，避免放大两次
                e.preventDefault();
                view.zoom = clamp(view.zoom * (e.deltaY > 0 ? 0.88 : 1.14), .2, 5);
                if (view.zoom <= 1) { view.px = 0; view.py = 0; }
                applyViewerTransform();
            }, { passive: false });
        }
        if (typeof N26Gestures !== 'undefined' && N26Gestures) {
            N26Gestures.on('pinch', function (d) {
                var view = state.viewer;
                var vEl = document.getElementById('n26albViewer');
                if (!view || !d || !vEl || !vEl.classList.contains('show')) return;
                var target = d.target;
                if (!target || !target.closest || !target.closest('#n26albViewer')) return;
                var it = viewerItem();
                if (!it || it.type !== 'image') return;
                view.zoom = clamp(view.zoom * (d.factor || 1), .2, 5);
                if (view.zoom <= 1) { view.px = 0; view.py = 0; }
                applyViewerTransform();
            });
            if (stage) {
                N26Gestures.enableDrag(stage, {
                    ghost: false,
                    threshold: 2,
                    onStart: function () {
                        var view = state.viewer;
                        if (!view || view.zoom <= 1) { if (view) view.panning = false; return; }
                        view.panning = true;
                        view.panX = view.px;
                        view.panY = view.py;
                        var m = v.querySelector('.alb-v-media');
                        if (m) m.classList.add('panning');
                    },
                    onMove: function (dx, dy) {
                        var view = state.viewer;
                        if (!view || !view.panning) return;
                        view.px = view.panX + dx;
                        view.py = view.panY + dy;
                        applyViewerTransform();
                    },
                    onEnd: function () {
                        var view = state.viewer;
                        if (view) view.panning = false;
                        var m = v.querySelector('.alb-v-media');
                        if (m) m.classList.remove('panning');
                    }
                });
            }
        }
        return v;
    }

    function isViewerFull() {
        var v = document.getElementById('n26albViewer');
        return !!(v && v.classList.contains('full'));
    }
    function toggleViewerFull(force) {
        var v = ensureViewer();
        if (!v || !state.viewer) return;
        var on = typeof force === 'boolean' ? force : !v.classList.contains('full');
        v.classList.toggle('full', on);
        state.viewer.full = on;
        var b = v.querySelector('[data-v="full"]');
        if (b) {
            b.classList.toggle('on', on);
            b.innerHTML = '<i class="fas ' + (on ? 'fa-compress' : 'fa-up-right-and-down-left-from-center') + '"></i>';
            b.title = on ? '退出全屏（Esc / 双击）' : '全屏（双击图片）';
        }
        if (on) {
            state.viewer.zoom = 1;
            state.viewer.px = 0;
            state.viewer.py = 0;
            applyViewerTransform();
        }
    }

    function openViewer(list, idx) {
        state.viewer = {
            list: list.slice(),
            idx: Math.max(0, Math.min(idx, list.length - 1)),
            zoom: 1,
            rot: 0,
            px: 0,
            py: 0,
            full: false,
            panning: false,
            infoOpen: state.infoOpen !== false,
            first: true
        };
        var v = ensureViewer();
        v.classList.remove('full');
        v.classList.add('show');
        paintViewer(true);
    }
    function closeViewer() {
        stopSlideshow();
        closeViewerMenu();
        var v = document.getElementById('n26albViewer');
        if (v) {
            v.classList.remove('show');
            v.classList.remove('full');
            var fb = v.querySelector('[data-v="full"]');
            if (fb) { fb.classList.remove('on'); fb.innerHTML = '<i class="fas fa-up-right-and-down-left-from-center"></i>'; fb.title = '全屏（双击图片）'; }
        }
        state.viewer = null;
    }
    function viewerItem() {
        if (!state.viewer) return null;
        return state.viewer.list[state.viewer.idx] || null;
    }
    function paintViewer(first) {
        var view = state.viewer;
        if (!view) return;
        var v = ensureViewer();
        var it = viewerItem();
        if (!it) return;
        var title = v.querySelector('.alb-v-title');
        if (title) title.textContent = it.name + '  (' + (view.idx + 1) + ' / ' + view.list.length + ')';
        var fav = v.querySelector('[data-v="fav"]');
        if (fav) {
            fav.classList.toggle('on', !!it.fav);
            fav.innerHTML = '<i class="' + (it.fav ? 'fas' : 'far') + ' fa-heart"></i>';
        }
        var info = v.querySelector('.alb-v-info');
        if (info) {
            info.classList.toggle('collapsed', !view.infoOpen);
            var ib = v.querySelector('[data-v="info"]');
            if (ib) ib.classList.toggle('on', view.infoOpen);
            info.innerHTML = infoHtml(it);
        }
        var frame = v.querySelector('.alb-v-frame');
        if (frame) {
            frame.classList.remove('open', 'swap');
            frame.innerHTML = it.type === 'video'
                ? '<video class="alb-v-media" controls playsinline preload="metadata" src="' + esc(it.url) + '"></video>'
                : '<img class="alb-v-media" data-n26-pinch="emit" src="' + esc(it.url) + '" alt="' + esc(it.name) + '" draggable="false">';
            void frame.offsetWidth;
            frame.classList.add(first ? 'open' : 'swap');
            var media = frame.querySelector('.alb-v-media');
            if (media) {
                if (it.type === 'image') {
                    media.addEventListener('load', function () {
                        state.dims[it.path] = { w: media.naturalWidth, h: media.naturalHeight };
                        if (state.viewer && viewerItem() && viewerItem().path === it.path) updateViewerInfo();
                    });
                    media.addEventListener('error', function () {
                        frame.innerHTML = '<div class="alb-broken" style="width:340px;height:240px;clip-path:url(#n26Squircle);-webkit-clip-path:url(#n26Squircle);"><i class="fas fa-image"></i><span>无法预览</span><b data-v="download">下载原文件</b></div>';
                    });
                } else {
                    media.addEventListener('error', function () {
                        frame.innerHTML = '<div class="alb-broken" style="width:340px;height:240px;clip-path:url(#n26Squircle);-webkit-clip-path:url(#n26Squircle);"><i class="fas fa-video"></i><span>视频无法播放</span><b data-v="download">下载原文件</b></div>';
                    });
                    media.addEventListener('loadedmetadata', function () {
                        if (it.trim && it.trim.end) {
                            try { media.currentTime = Number(it.trim.start) || 0; } catch (e) { }
                            media.addEventListener('timeupdate', function () {
                                if (it.trim && it.trim.end && media.currentTime >= it.trim.end) media.pause();
                            });
                        }
                        updateViewerInfo();
                    });
                }
            }
        }
        var tools = v.querySelector('.alb-v-tools');
        if (tools) tools.classList.toggle('hide', it.type === 'video');
        if (it.type === 'image') { readDims(it); readExif(it); }
        var film = v.querySelector('.alb-v-film');
        if (film) {
            film.innerHTML = view.list.map(function (x, i) {
                var inner = x.type === 'video'
                    ? '<i class="fas fa-video"></i>'
                    : '<img src="' + esc(thumbDB.map[thumbKey(x)] || x.url) + '" alt="" loading="lazy" decoding="async">';
                return '<div class="alb-film-cell' + (i === view.idx ? ' on' : '') + '" data-v-idx="' + i + '" title="' + esc(x.name) + '"><div class="alb-film-i">' + inner + '</div></div>';
            }).join('');
            var on = film.querySelector('.alb-film-cell.on');
            if (on && on.scrollIntoView) {
                setTimeout(function () { try { on.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { } }, 60);
            }
        }
        applyViewerTransform();
        if (view.slide) startSlideshow();
    }
    function infoHtml(it) {
        var dim = state.dims[it.path];
        var ex = state.exif[it.path];
        var rows = '';
        rows += '<div class="alb-v-row"><span>类型</span><b>' + (it.type === 'video' ? '视频' : '图片') + '</b></div>';
        rows += '<div class="alb-v-row"><span>日期</span><b>' + fmtDate(it.created) + '</b></div>';
        rows += '<div class="alb-v-row"><span>尺寸</span><b>' + (dim ? dim.w + ' × ' + dim.h : '读取中…') + '</b></div>';
        rows += '<div class="alb-v-row"><span>大小</span><b>' + fmtSize(it.size) + '</b></div>';
        rows += '<div class="alb-v-row"><span>相簿</span><b>' + esc(it.group) + '</b></div>';
        rows += '<div class="alb-v-row"><span>路径</span><b>' + esc(it.path) + '</b></div>';
        if (ex && ex.model) rows += '<div class="alb-v-row"><span>相机</span><b>' + esc(ex.model) + '</b></div>';
        if (ex && ex.date) rows += '<div class="alb-v-row"><span>拍摄</span><b>' + esc(ex.date) + '</b></div>';
        return '<h4>信息</h4>' + rows;
    }
    function updateViewerInfo() {
        var v = document.getElementById('n26albViewer');
        var it = viewerItem();
        if (!v || !it) return;
        var info = v.querySelector('.alb-v-info');
        if (info) info.innerHTML = infoHtml(it);
    }
    function applyViewerTransform() {
        var v = document.getElementById('n26albViewer');
        var view = state.viewer;
        if (!v || !view) return;
        var m = v.querySelector('.alb-v-media');
        if (!m || m.tagName !== 'IMG') return;
        m.style.transform = 'translate(' + (view.px || 0) + 'px,' + (view.py || 0) + 'px) scale(' + view.zoom + ') rotate(' + view.rot + 'deg)';
        m.classList.toggle('zoomed', view.zoom > 1);
    }
    function viewerGo(delta) {
        var view = state.viewer;
        if (!view || !view.list.length) return;
        view.idx = (view.idx + delta + view.list.length) % view.list.length;
        view.zoom = 1;
        view.rot = 0;
        view.px = 0;
        view.py = 0;
        if (view.slide) {
            stopSlideshow();
            view.slide = true;
            startSlideshow();
        }
        paintViewer(false);
    }
    function toggleSlideshow() {
        var view = state.viewer;
        if (!view) return;
        if (state.slideshow) stopSlideshow();
        else { view.slide = true; startSlideshow(); }
    }
    function startSlideshow() {
        stopSlideshow();
        state.slideshow = setInterval(function () {
            if (!state.viewer) return stopSlideshow();
            viewerGo(1);
        }, 3000);
        var v = document.getElementById('n26albViewer');
        var b = v && v.querySelector('[data-v="slide"]');
        if (b) { b.classList.add('on'); b.innerHTML = '<i class="fas fa-pause"></i>'; }
    }
    function stopSlideshow() {
        if (state.slideshow) { clearInterval(state.slideshow); state.slideshow = 0; }
        var v = document.getElementById('n26albViewer');
        var b = v && v.querySelector('[data-v="slide"]');
        if (b) { b.classList.remove('on'); b.innerHTML = '<i class="fas fa-play"></i>'; }
    }
    function onViewerClick(e) {
        var b = e.target.closest('[data-v]') || e.target.closest('[data-v-idx]');
        if (!b) return;
        var d = b.dataset;
        if (d.vIdx !== undefined) {
            var i = Number(d.vIdx);
            if (state.viewer && i !== state.viewer.idx) {
                state.viewer.idx = i;
                state.viewer.zoom = 1;
                state.viewer.rot = 0;
                state.viewer.px = 0;
                state.viewer.py = 0;
                if (state.viewer.slide) { stopSlideshow(); state.viewer.slide = true; startSlideshow(); }
                paintViewer(false);
            }
            return;
        }
        var act = d.v;
        if (act === 'stage') {
            // 点空白才关闭；点媒体/破图占位不关闭
            if (e.target.closest('.alb-v-frame')) return;
            closeViewer();
            return;
        }
        if (act === 'close') closeViewer();
        else if (act === 'fav') { var it = viewerItem(); if (it) { toggleFav(it.path); paintViewer(false); } }
        else if (act === 'download') downloadViewer();
        else if (act === 'info') {
            if (!state.viewer) return;
            state.viewer.infoOpen = !state.viewer.infoOpen;
            state.infoOpen = state.viewer.infoOpen;
            var info = document.getElementById('n26albViewer').querySelector('.alb-v-info');
            if (info) info.classList.toggle('collapsed', !state.viewer.infoOpen);
            var ib = document.querySelector('#n26albViewer [data-v="info"]');
            if (ib) ib.classList.toggle('on', state.viewer.infoOpen);
        }
        else if (act === 'more') openViewerMenu(b);
        else if (act === 'zoom-in') { if (state.viewer) { state.viewer.zoom = clamp(state.viewer.zoom * 1.25, .2, 5); applyViewerTransform(); } }
        else if (act === 'zoom-out') { if (state.viewer) { state.viewer.zoom = clamp(state.viewer.zoom * .8, .2, 5); if (state.viewer.zoom <= 1) { state.viewer.px = 0; state.viewer.py = 0; } applyViewerTransform(); } }
        else if (act === 'fit') { if (state.viewer) { state.viewer.zoom = 1; state.viewer.rot = 0; state.viewer.px = 0; state.viewer.py = 0; applyViewerTransform(); } }
        else if (act === 'rotate') { if (state.viewer) { state.viewer.rot = (state.viewer.rot + 90) % 360; applyViewerTransform(); } }
        else if (act === 'full') toggleViewerFull();
        else if (act === 'slide') toggleSlideshow();
        else if (act === 'prev') viewerGo(-1);
        else if (act === 'next') viewerGo(1);
    }

    function openViewerMenu(anchor) {
        var v = document.getElementById('n26albViewer');
        var menu = v && v.querySelector('.alb-v-menu');
        if (!menu) return;
        var it = viewerItem();
        if (!it) return;
        var parts = [];
        parts.push('<button data-m="info"><i class="fas fa-circle-info"></i>信息面板</button>');
        if (it.type === 'image') {
            parts.push('<button data-m="wp-desktop"><i class="fas fa-desktop"></i>设为桌面壁纸</button>');
            parts.push('<button data-m="wp-global"><i class="fas fa-globe"></i>全局壁纸（含锁屏）</button>');
        }
        if (it.type === 'video') parts.push('<button data-m="trim"><i class="fas fa-scissors"></i>裁剪当前视频</button>');
        parts.push('<div class="alb-menu-sep"></div>');
        parts.push('<button data-m="reveal"><i class="fas fa-folder-open"></i>在文件管理器中显示</button>');
        parts.push('<button data-m="delete" class="danger"><i class="fas fa-trash"></i>删除（移入回收站）</button>');
        menu.innerHTML = parts.join('');
        var r = anchor.getBoundingClientRect();
        menu.style.top = Math.min(window.innerHeight - 220, r.bottom + 6) + 'px';
        menu.style.left = Math.max(8, Math.min(r.right - 196, window.innerWidth - 204)) + 'px';
        menu.classList.add('show');
        menu.onclick = function (e) {
            var b = e.target.closest('[data-m]');
            if (!b) return;
            viewerMenuAction(b.dataset.m);
        };
        setTimeout(function () {
            document.addEventListener('mousedown', function close(ev) {
                if (menu && !menu.contains(ev.target) && !anchor.contains(ev.target)) {
                    menu.classList.remove('show');
                    document.removeEventListener('mousedown', close, true);
                }
            }, true);
        }, 0);
    }
    function closeViewerMenu() {
        var v = document.getElementById('n26albViewer');
        if (v) v.querySelector('.alb-v-menu').classList.remove('show');
    }
    function viewerMenuAction(m) {
        closeViewerMenu();
        var it = viewerItem();
        if (!it) return;
        if (m === 'info') {
            state.viewer.infoOpen = !state.viewer.infoOpen;
            state.infoOpen = state.viewer.infoOpen;
            var info = document.getElementById('n26albViewer').querySelector('.alb-v-info');
            if (info) info.classList.toggle('collapsed', !state.viewer.infoOpen);
            var ib = document.querySelector('#n26albViewer [data-v="info"]');
            if (ib) ib.classList.toggle('on', state.viewer.infoOpen);
        }
        else if (m === 'wp-desktop') setWallpaper(it, 'desktop');
        else if (m === 'wp-global') setWallpaper(it, 'global');
        else if (m === 'reveal') revealInFiles(it);
        else if (m === 'delete') { closeViewer(); deletePaths([it.path]); }
        else if (m === 'trim') trimVideo(it);
    }

    function downloadViewer() {
        var it = viewerItem();
        var view = state.viewer;
        if (!it) return;
        if (it.type === 'image' && view && view.rot) {
            rotateDownload(it, view.rot);
        } else {
            downloadItem(it, function () { notify('下载', '已开始下载 ' + it.name, 'success'); });
        }
    }
    function rotateDownload(it, rot) {
        var img = new Image();
        img.onload = function () {
            try {
                var r = ((rot % 360) + 360) % 360;
                var swap = r === 90 || r === 270;
                var c = document.createElement('canvas');
                c.width = swap ? img.naturalHeight : img.naturalWidth;
                c.height = swap ? img.naturalWidth : img.naturalHeight;
                var ctx = c.getContext('2d');
                ctx.translate(c.width / 2, c.height / 2);
                ctx.rotate(r * Math.PI / 180);
                ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
                c.toBlob(function (blob) {
                    if (blob) saveBlob(blob, it.name);
                    else downloadItem(it);
                }, 'image/jpeg', .92);
            } catch (e) { downloadItem(it); }
        };
        img.onerror = function () { downloadItem(it); };
        try { img.crossOrigin = 'anonymous'; } catch (e) { }
        img.src = it.url;
    }
    function setWallpaper(it, scope) {
        if (!it || it.type !== 'image') { notify('提示', '仅图片可设为壁纸', 'info'); return; }
        var s = getUserLS('settings') || {};
        s.customWallpaper = it.url;
        s.useCustomWallpaper = true;
        if (scope === 'global') s.lockWallpaper = it.url;
        setUserLS('settings', s);
        try {
            if (typeof switchWallpaperWithFade === 'function') switchWallpaperWithFade(function () { try { applyUserSettings(); } catch (e) { } });
            else if (typeof applyUserSettings === 'function') applyUserSettings();
        } catch (e) { }
        notify('壁纸已更换', scope === 'global' ? '已设为桌面与锁屏壁纸' : '已设为桌面壁纸', 'success');
    }
    function revealInFiles(it) {
        try { openApp('files'); } catch (e) { }
        setTimeout(function () {
            try { if (typeof fmNavigate === 'function') fmNavigate(it.path.replace(/\/[^/]+$/, '')); } catch (e) { }
        }, 700);
    }
    function trimVideo(it) {
        var v = document.querySelector('#n26albViewer video');
        if (!v || !v.duration) { notify('裁剪', '视频尚未加载完成', 'info'); return; }
        var end = Math.min(v.duration, v.currentTime || v.duration);
        var choice;
        try {
            choice = typeof nexusConfirm === 'function'
                ? nexusConfirm('截取片段', '将截取 0:00 ~ ' + fmtDur(end) + '。\n确定 = 替换原文件，取消 = 另存为新文件。', { okText: '替换原文件', cancelText: '另存为新文件' })
                : Promise.resolve(false);
        } catch (e) { choice = Promise.resolve(false); }
        Promise.resolve(choice).then(function (ok) {
            var fs = getUserLS('filesystem') || {};
            var parts = it.path.split('/').filter(Boolean);
            var node = fs[parts[0].replace(':', '')];
            for (var i = 1; i < parts.length && node; i++) node = node.children && node.children[parts[i]];
            var parentParts = parts.slice(0, -1);
            var parent = fs[parentParts[0].replace(':', '')];
            for (var j = 1; j < parentParts.length && parent; j++) parent = parent.children && parent.children[parentParts[j]];
            if (!node || !parent) { notify('裁剪失败', '未找到文件节点', 'error'); return; }
            var trim = { start: 0, end: end };
            if (ok) {
                node.trim = trim;
            } else {
                var ext = (it.name.match(/\.(mp4|webm|ogg)$/i) || ['.mp4'])[0];
                var base = it.name.replace(/\.(mp4|webm|ogg)$/i, '');
                var name = base + '_裁剪' + ext;
                var k = 1;
                while (parent.children[name]) { name = base + '_裁剪(' + k + ')' + ext; k++; }
                parent.children[name] = { type: 'file', fileType: 'video', content: it.url, created: Date.now(), size: it.size, trim: trim };
            }
            try { setUserLS('filesystem', fs); } catch (e) { }
            notify('裁剪完成', ok ? '已替换原文件（播放时应用裁剪区间）' : '已另存为新文件', 'success');
            render(false);
        });
    }

    /* ---------------- 尺寸 / EXIF ---------------- */
    function readDims(it) {
        if (state.dims[it.path]) {
            var info = document.getElementById('n26albViewer');
            if (info) updateViewerInfo();
            return;
        }
        var img = new Image();
        img.onload = function () {
            state.dims[it.path] = { w: img.naturalWidth, h: img.naturalHeight };
            if (state.viewer && viewerItem() && viewerItem().path === it.path) updateViewerInfo();
        };
        img.onerror = function () { };
        img.src = it.url;
    }
    function readExif(it) {
        if (state.exif[it.path] !== undefined) return;
        state.exif[it.path] = null;
        var url = it.url || '';
        if (!/^data:image\/jpe?g;base64,/i.test(url)) return;
        try {
            var b64 = url.slice(url.indexOf(',') + 1);
            var bin = atob(b64);
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            var ex = parseExif(bytes);
            state.exif[it.path] = ex;
            if (ex && state.viewer && viewerItem() && viewerItem().path === it.path) updateViewerInfo();
        } catch (e) { }
    }
    function parseExif(bytes) {
        var idx = -1;
        var max = Math.min(bytes.length - 8, 65536);
        for (var i = 0; i < max; i++) {
            if (bytes[i] === 0x45 && bytes[i + 1] === 0x78 && bytes[i + 2] === 0x69 && bytes[i + 3] === 0x66 && bytes[i + 4] === 0 && bytes[i + 5] === 0) { idx = i + 6; break; }
        }
        if (idx < 0) return null;
        var dv = new DataView(bytes.buffer);
        var tiff = idx;
        var le = dv.getUint16(tiff) === 0x4949;
        if (!le && dv.getUint16(tiff) !== 0x4D4D) return null;
        var out = { model: '', date: '' };
        var ifd0 = tiff + dv.getUint32(tiff + 4, le);
        readIfd(dv, tiff, ifd0, le, out);
        var exifPtr = readTagValue(dv, tiff, ifd0, le, 0x8769);
        if (exifPtr) readIfd(dv, tiff, tiff + exifPtr, le, out, true);
        return out;
    }
    function readIfd(dv, tiff, ifd, le, out, isExif) {
        try {
            var n = dv.getUint16(ifd, le);
            if (!n || n > 200) return;
            for (var i = 0; i < n; i++) {
                var entry = ifd + 2 + i * 12;
                var tag = dv.getUint16(entry, le);
                var type = dv.getUint16(entry + 2, le);
                var count = dv.getUint32(entry + 4, le);
                var valOff = entry + 8;
                var str = '';
                if (type === 2 && count <= 200) {
                    var off = count > 4 ? tiff + dv.getUint32(valOff, le) : valOff;
                    for (var k = 0; k < count; k++) {
                        var code = dv.getUint8(off + k);
                        if (code === 0) break;
                        str += String.fromCharCode(code);
                    }
                    str = str.replace(/\s+/g, ' ').trim();
                }
                if (tag === 0x0110 && str) out.model = str;
                else if (tag === 0x010F && str && !out.model) out.model = str;
                else if (tag === 0x0132 && str && !out.date) out.date = str;
                else if (tag === 0x9003 && str && isExif) out.date = str;
            }
        } catch (e) { }
    }
    function readTagValue(dv, tiff, ifd, le, tag) {
        try {
            var n = dv.getUint16(ifd, le);
            for (var i = 0; i < n; i++) {
                var entry = ifd + 2 + i * 12;
                if (dv.getUint16(entry, le) === tag) return dv.getUint32(entry + 8, le);
            }
        } catch (e) { }
        return 0;
    }

    /* ---------------- 键盘 ---------------- */
    function albumFocused() {
        try {
            if (typeof windows === 'undefined' || !Array.isArray(windows)) return false;
            var vis = windows.filter(function (w) { return w.state !== 'minimized'; });
            if (!vis.length) return false;
            var top = vis.slice().sort(function (a, b) { return (b.zIndex || 0) - (a.zIndex || 0); })[0];
            return top && top.appId === 'album';
        } catch (e) { return false; }
    }
    document.addEventListener('keydown', function (e) {
        var v = document.getElementById('n26albViewer');
        if (v && v.classList.contains('show') && state.viewer) {
            var handled = true;
            if (e.key === 'Escape') {
                var menu = v.querySelector('.alb-v-menu');
                if (menu && menu.classList.contains('show')) closeViewerMenu();
                else if (isViewerFull()) toggleViewerFull(false);
                else closeViewer();
            }
            else if (e.key === 'ArrowLeft') viewerGo(-1);
            else if (e.key === 'ArrowRight') viewerGo(1);
            else if (e.key === '+' || e.key === '=') { state.viewer.zoom = clamp(state.viewer.zoom * 1.25, .2, 5); applyViewerTransform(); }
            else if (e.key === '-' || e.key === '_') { state.viewer.zoom = clamp(state.viewer.zoom * .8, .2, 5); if (state.viewer.zoom <= 1) { state.viewer.px = 0; state.viewer.py = 0; } applyViewerTransform(); }
            else if (e.key === '0') { state.viewer.zoom = 1; state.viewer.rot = 0; state.viewer.px = 0; state.viewer.py = 0; applyViewerTransform(); }
            else if (e.key === 'r' || e.key === 'R') { state.viewer.rot = (state.viewer.rot + 90) % 360; applyViewerTransform(); }
            else if (e.key === 'f' || e.key === 'F') { var it = viewerItem(); if (it) { toggleFav(it.path); paintViewer(false); } }
            else if (e.key === ' ') toggleSlideshow();
            else if (e.key === 'i' || e.key === 'I') { state.viewer.infoOpen = !state.viewer.infoOpen; paintViewer(false); }
            else if (e.key === 'Delete' || e.key === 'Backspace') { var dit = viewerItem(); if (dit) { closeViewer(); deletePaths([dit.path]); } }
            else handled = false;
            if (handled) { e.preventDefault(); e.stopPropagation(); }
            return;
        }
        if (!state.host || !document.body.contains(state.host)) return;
        if (!albumFocused()) return;
        var ae = document.activeElement;
        var typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
        if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
            if (typing) return;
            selectAll();
            e.preventDefault();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
            var input = state.host.querySelector('.alb-search input');
            if (input) { input.focus(); input.select && input.select(); e.preventDefault(); }
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
            if (state.undo && !typing) { undoDelete(); e.preventDefault(); }
        } else if (e.key === 'Escape') {
            if (typing && ae.blur) { ae.blur(); return; }
            if (selectedCount()) { clearSelection(); e.preventDefault(); }
        } else if (e.key === 'Delete' || (e.key === 'Backspace' && !typing)) {
            if (selectedCount()) { bulkDelete(); e.preventDefault(); }
        }
    });

    window.addEventListener('online', function () { refreshBars(); });
    window.addEventListener('offline', function () { refreshBars(); });

    /* ---------------- 导出 ---------------- */
    window.renderAlbumApp = renderAlbumApp;
    window.albumRenderBody = function () {
        try { if (state.host) render(false); } catch (e) { }
    };
    A.render = renderAlbumApp;
    A.refresh = function () { try { render(false); } catch (e) { } };
    A.openViewer = openViewer;
    A.state = state;
    A.collect = collect;
})();
