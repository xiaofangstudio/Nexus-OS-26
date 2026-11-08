/* ============================================================
   Nexus OS 26 · 文件管理 P0 改造（总纲 4.1）
   ------------------------------------------------------------
   本文件只补「主壳 renderFileManager 做不到的部分」：
     ① 右侧详情面板（真实预览 / 元数据 / 操作）
     ② 多选 + 批量条（Ctrl / Shift / Ctrl+A，批量删除/复制/剪切）
     ③ 删除撤销（5 秒窗口，Ctrl+Z）
     ④ 行内重命名（F2）、快捷键、真实导入
     ⑤ 快速访问首屏（继续工作 / 常用文件夹 / 最近修改）
     ⑥ 传输记录（真实操作日志，不画假进度）
   依赖主壳已有的 getUserLS / setUserLS / getNodeByPath /
   fmGoTo / fmRenderGrid / fmItemOpen / isSystemFile 等全局函数；
   不新增任何颜色/圆角令牌。
   ============================================================ */
(function () {
    'use strict';

    var state = {
        sel: [],
        anchor: null,
        filter: 'all',
        detailsOpen: true,
        detailsTouched: false,
        undo: null,
        undoTimer: 0,
        clip: null,
        lastRoute: null
    };

    /* ---------------- 基础工具 ---------------- */
    function readSettings() {
        try { return getUserLS('settings') || {}; } catch (e) { return {}; }
    }
    function writeSettings(o) {
        try { setUserLS('settings', o); } catch (e) { }
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }
    /* ---------------- 应用品牌色（设计语言硬规则：强调色取自应用图标，不用统一蓝） ---------------- */
    function hexToRgb(hex) {
        var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
        return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 74, g: 155, b: 245 };
    }
    function mixRgb(c, target, p) {
        return {
            r: Math.round(c.r + (target.r - c.r) * p),
            g: Math.round(c.g + (target.g - c.g) * p),
            b: Math.round(c.b + (target.b - c.b) * p)
        };
    }
    function rgbCss(c) { return 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')'; }
    var _accentApplied = '';
    function applyAppAccent() {
        var host = document.querySelector('.fm-container');
        if (!host) return;
        var color = '#4A9BF5';
        try {
            if (typeof appRegistry !== 'undefined' && appRegistry.files && appRegistry.files.color) color = appRegistry.files.color;
        } catch (e) { }
        if (_accentApplied === color) return;
        _accentApplied = color;
        var c = hexToRgb(color);
        var dark = mixRgb(c, { r: 0, g: 0, b: 0 }, 0.36);   // 浅色主题里的文字色，保证对比度
        var light = mixRgb(c, { r: 255, g: 255, b: 255 }, 0.34); // 深色主题里的文字色
        host.style.setProperty('--fm-accent', color);
        host.style.setProperty('--fm-accent-rgb', c.r + ',' + c.g + ',' + c.b);
        host.style.setProperty('--fm-accent-strong', rgbCss(dark));
        host.style.setProperty('--fm-accent-soft', rgbCss(light));
    }

    function fmtSize(n) {
        n = Number(n) || 0;
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        if (n < 1073741824) return (n / 1048576).toFixed(2) + ' MB';
        return (n / 1073741824).toFixed(2) + ' GB';
    }
    function relTime(ts) {
        var d = Date.now() - Number(ts || 0);
        if (!ts || d < 0) return '—';
        if (d < 60000) return '刚刚';
        if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
        if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
        if (d < 604800000) return Math.floor(d / 86400000) + ' 天前';
        return new Date(ts).toLocaleDateString('zh-CN');
    }
    function notify(t, m, k) {
        try { if (typeof showNotification === 'function') return showNotification(t, m, k); } catch (e) { }
    }
    function isReadOnlyPath(p) {
        return typeof p === 'string' && p.indexOf('bridge:') === 0;
    }
    function isSpecialPath(p) {
        return !p || p === 'home:' || p === 'cloud:' || p === '__trash__' || isReadOnlyPath(p);
    }
    function currentNode() {
        try { return getNodeByPath(fmCurrentPath); } catch (e) { return null; }
    }
    function nodeIn(fs, path) {
        var parts = String(path || '').split('/').filter(Boolean);
        if (!parts.length) return null;
        var node = fs[parts[0].replace(':', '')];
        for (var i = 1; i < parts.length; i++) {
            if (!node || !node.children || !node.children[parts[i]]) return null;
            node = node.children[parts[i]];
        }
        return node;
    }
    function driveOf(path) {
        return String(path || '').split('/')[0].replace(':', '');
    }
    function activeFilesWin() {
        if (typeof windows === 'undefined' || !Array.isArray(windows)) return null;
        var vis = windows.filter(function (w) { return w.state !== 'minimized'; });
        if (!vis.length) return null;
        var top = vis.slice().sort(function (a, b) { return (b.zIndex || 0) - (a.zIndex || 0); })[0];
        return top && top.appId === 'files' ? top : null;
    }
    function gridEl() { return document.getElementById('fmGrid'); }
    function isTypingTarget(t) {
        if (!t) return false;
        var tag = String(t.tagName || '').toUpperCase();
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
    }

    /* ---------------- 选择模型 ---------------- */
    function names() {
        if (state.sel.length) return state.sel.slice();
        if (typeof fmSelectedItem !== 'undefined' && fmSelectedItem) return [fmSelectedItem];
        return [];
    }
    function syncLegacy() {
        fmSelectedItem = state.sel.length ? state.sel[state.sel.length - 1] : null;
    }
    function paintSelection() {
        var grid = gridEl();
        if (!grid) return;
        var list = state.sel;
        Array.prototype.forEach.call(grid.querySelectorAll('.fm-item'), function (el) {
            el.classList.toggle('selected', list.indexOf(el.dataset.name) >= 0);
        });
    }
    function orderOfNames() {
        var grid = gridEl();
        if (!grid) return state.sel.slice();
        return Array.prototype.map.call(grid.querySelectorAll('.fm-item'), function (el) {
            return el.dataset.name;
        });
    }
    function onItemClick(el, name, ev) {
        var grid = gridEl();
        if (!grid) return;
        var all = orderOfNames();
        if (ev && (ev.ctrlKey || ev.metaKey)) {
            var i = state.sel.indexOf(name);
            if (i >= 0) state.sel.splice(i, 1); else state.sel.push(name);
            state.anchor = name;
        } else if (ev && ev.shiftKey && state.anchor && all.indexOf(state.anchor) >= 0) {
            var a = all.indexOf(state.anchor), b = all.indexOf(name);
            if (a > b) { var t = a; a = b; b = t; }
            state.sel = all.slice(a, b + 1);
        } else {
            state.sel = [name];
            state.anchor = name;
        }
        syncLegacy();
        paintSelection();
        refreshPanels();
    }
    function selectSingle(el, name) {
        state.sel = name ? [name] : [];
        state.anchor = name || null;
        syncLegacy();
        paintSelection();
        refreshPanels();
    }
    function selectAll() {
        var grid = gridEl();
        if (!grid) return;
        state.sel = orderOfNames();
        state.anchor = state.sel[0] || null;
        syncLegacy();
        paintSelection();
        refreshPanels();
    }
    function clearSelection() {
        state.sel = [];
        state.anchor = null;
        syncLegacy();
        paintSelection();
        refreshPanels();
    }

    /* ---------------- 详情面板 ---------------- */
    function isImageNode(name, node) {
        if (!node) return false;
        if (node.isImage) return true;
        if (typeof node.content === 'string' && node.content.indexOf('data:image/') === 0) return true;
        return /\.(png|jpg|jpeg|gif|webp|bmp|svg|ico)$/i.test(name);
    }
    var TEXT_EXT = /\.(txt|md|json|js|css|html|htm|nex|log|cfg|ini|csv|xml|yaml|yml|ts|py|sh|bat)$/i;
    function nodeSize(node) {
        if (!node) return 0;
        if (typeof node.size === 'number') return node.size;
        if (typeof node.content === 'string') return node.content.length;
        if (node.type === 'folder' && node.children) {
            var n = 0;
            Object.keys(node.children).forEach(function (k) {
                var c = node.children[k];
                if (typeof c.size === 'number') n += c.size;
                else if (typeof c.content === 'string') n += c.content.length;
                else n += 512;
            });
            return n;
        }
        return 0;
    }
    function nodeMtime(node) {
        if (!node) return 0;
        var keys = ['modifiedAt', 'mtime', 'updatedAt', 'createdAt', 'created'];
        for (var i = 0; i < keys.length; i++) {
            if (node[keys[i]]) {
                var t = typeof node[keys[i]] === 'number' ? node[keys[i]] : Date.parse(node[keys[i]]);
                if (isFinite(t)) return t;
            }
        }
        return 0;
    }
    function kindOf(name, node) {
        if (!node) return '未知';
        if (node.type === 'folder') return '文件夹';
        if (node.fileType === 'app') return '应用（' + (node.appId || '未知') + '）';
        if (node.fileType === 'word') return 'Word 文档';
        if (node.fileType === 'ppt') return '演示文稿';
        if (node.fileType === 'excel') return 'Excel 表格';
        if (node.fileType === 'text') return '文本文件';
        var ext = name.split('.').length > 1 ? name.split('.').pop().toUpperCase() : '';
        return ext ? ext + ' 文件' : '文件';
    }
    function previewHTML(name, node) {
        if (!node) return '';
        if (node.type === 'folder') {
            var n = Object.keys(node.children || {}).length;
            return '<div class="fm-dp-icon" style="color:#60a5fa;"><i class="fas fa-folder-open"></i><small>' + n + ' 个项目</small></div>';
        }
        if (isImageNode(name, node)) {
            return '<img loading="lazy" decoding="async" src="' + esc(node.content) + '" alt="' + esc(name) + '">';
        }
        if (node.fileType === 'word' || node.fileType === 'ppt' || node.fileType === 'excel') {
            var icon = node.fileType === 'word' ? 'fa-file-word' : node.fileType === 'ppt' ? 'fa-file-powerpoint' : 'fa-file-excel';
            var color = node.fileType === 'word' ? '#2563eb' : node.fileType === 'ppt' ? '#ef4444' : '#16a34a';
            return '<div class="fm-dp-icon" style="color:' + color + ';"><i class="fas ' + icon + '"></i><small>Office 文档 · 预览请打开</small></div>';
        }
        if (node.fileType === 'app') {
            return '<div class="fm-dp-icon" style="color:#60a5fa;"><i class="fas fa-window-restore"></i><small>可执行应用</small></div>';
        }
        if (TEXT_EXT.test(name) && typeof node.content === 'string') {
            return '<pre>' + esc(node.content.slice(0, 700)) + (node.content.length > 700 ? '\n…' : '') + '</pre>';
        }
        return '<div class="fm-dp-icon" style="opacity:.55;"><i class="fas fa-file"></i><small>此类型暂无预览</small></div>';
    }
    function renderDetails(name) {
        var box = document.getElementById('fmDetailsBody');
        if (!box) return;
        if (isSpecialPath(fmCurrentPath)) {
            box.innerHTML = '<div class="fm-dp-empty"><i class="fas fa-circle-info"></i><span>' +
                (fmCurrentPath === 'home:' ? '快速访问不显示详情，打开一个文件夹后再看。'
                    : isReadOnlyPath(fmCurrentPath) ? '真实硬盘为只读浏览，属性请在系统中查看。'
                        : fmCurrentPath === 'cloud:' ? '云盘详情由云盘视图提供。'
                            : '回收站项目请在回收站中操作。') + '</span></div>';
            return;
        }
        if (!name) {
            box.innerHTML = '<div class="fm-dp-empty"><i class="fas fa-arrow-pointer"></i><span>选择一个文件或文件夹<br>查看预览与属性</span></div>';
            return;
        }
        var node = getNodeByPath(fmCurrentPath + '/' + name);
        if (!node) {
            box.innerHTML = '<div class="fm-dp-empty"><i class="fas fa-circle-exclamation"></i><span>项目已不存在，可能已被其他窗口移动或删除。</span></div>';
            return;
        }
        var size = node.type === 'folder' ? Object.keys(node.children || {}).length + ' 项' : fmtSize(nodeSize(node));
        var mt = nodeMtime(node);
        box.innerHTML =
            '<div class="fm-dp-preview">' + previewHTML(name, node) + '</div>' +
            '<div class="fm-dp-name">' + esc(name) + '</div>' +
            '<div class="fm-dp-rows">' +
            '<div class="fm-dp-row"><span>类型</span><b>' + esc(kindOf(name, node)) + '</b></div>' +
            '<div class="fm-dp-row"><span>大小</span><b>' + esc(size) + '</b></div>' +
            '<div class="fm-dp-row"><span>位置</span><b>' + esc(fmCurrentPath) + '</b></div>' +
            '<div class="fm-dp-row"><span>修改时间</span><b>' + esc(mt ? new Date(mt).toLocaleString('zh-CN', { hour12: false }) : '—') + '</b></div>' +
            '</div>' +
            '<div class="fm-dp-actions">' +
            '<button onclick="n26FM.openSelection()"><i class="fas fa-folder-open"></i> 打开</button>' +
            '<button onclick="n26FM.startRename()"><i class="fas fa-pen"></i> 重命名</button>' +
            '<button onclick="n26FM.copyPath()"><i class="fas fa-link"></i> 复制路径</button>' +
            '<button class="danger" onclick="n26FM.deleteSelection()"><i class="fas fa-trash"></i> 删除</button>' +
            '</div>';
    }
    function renderBulk() {
        var bar = document.getElementById('fmBulkBar');
        if (!bar) return;
        var n = names().length;
        bar.classList.toggle('show', n > 0);
        if (!n) { bar.innerHTML = ''; return; }
        var grid = gridEl();
        var total = grid ? grid.querySelectorAll('.fm-item').length : 0;
        bar.innerHTML =
            '<span>已选 <b>' + n + '</b> 项</span>' +
            '<button class="fm-bulk-btn" onclick="n26FM.selectAll()">全选（' + total + '）</button>' +
            '<span class="fm-bulk-spacer"></span>' +
            '<button class="fm-bulk-btn" onclick="n26FM.copySelection()">复制</button>' +
            '<button class="fm-bulk-btn" onclick="n26FM.cutSelection()">剪切</button>' +
            '<button class="fm-bulk-btn" onclick="n26FM.startRename()"' + (n > 1 ? ' disabled title="一次只能重命名一个"' : '') + '>重命名</button>' +
            '<button class="fm-bulk-btn danger" onclick="n26FM.deleteSelection()">删除</button>' +
            '<button class="fm-bulk-btn" onclick="n26FM.clearSelection()">取消</button>';
    }
    function applyDetailsOpen() {
        var panel = document.getElementById('fmDetails');
        if (!panel) return;
        panel.classList.toggle('fm-collapsed', !state.detailsOpen);
        var btn = document.getElementById('fmBtnDetails');
        if (btn) {
            btn.innerHTML = '<i class="fas ' + (state.detailsOpen ? 'fa-sidebar' : 'fa-circle-info') + '"></i>';
            btn.title = state.detailsOpen ? '收起详情面板' : '展开详情面板';
        }
    }
    function toggleDetails() {
        state.detailsOpen = !state.detailsOpen;
        state.detailsTouched = true;
        var s = readSettings();
        s.fmDetailsOpen = state.detailsOpen;
        writeSettings(s);
        applyDetailsOpen();
    }

    /* ---------------- 状态栏 / 提示条 ---------------- */
    function statusText() {
        var n = names().length;
        return n ? '已选 <b>' + n + '</b> 项' : '';
    }
    function renderNotice() {
        var slot = document.getElementById('fmNoticeSlot');
        if (!slot) return;
        slot.innerHTML = '';
        if (isReadOnlyPath(fmCurrentPath)) {
            slot.innerHTML = '<div class="fm-notice readonly"><i class="fas fa-shield-halved"></i>' +
                '<span>真实硬盘以只读方式浏览；写入/删除请到系统里操作。本地桥未启动时点「说明」。</span>' +
                '<button onclick="fmBridgeHelp()">说明</button></div>';
            return;
        }
        if (!navigator.onLine) {
            slot.innerHTML = '<div class="fm-notice"><i class="fas fa-wifi"></i>' +
                '<span>当前离线：本地文件与云盘缓存仍可用，云同步暂停。</span></div>';
        }
    }
    function paintStatusSel() {
        var bar = document.getElementById('fmStatusBar');
        if (!bar) return;
        var n = names().length;
        var el = bar.querySelector('.fm-selcount');
        if (!n) { if (el) el.remove(); return; }
        if (!el) {
            el = document.createElement('span');
            el.className = 'fm-selcount';
            el.style.color = 'var(--fm-accent-strong, #4A9BF5)';
            var last = bar.lastElementChild;
            bar.insertBefore(el, last || null);
        }
        el.innerHTML = '已选 <b>' + n + '</b> 项';
    }
    function refreshPanels() {
        applyAppAccent();
        renderDetails(names()[0] || null);
        renderBulk();
        renderNotice();
        paintStatusSel();
        applyDetailsOpen();
        var fsel = document.getElementById('fmFilter');
        if (fsel && fsel.value !== state.filter) fsel.value = state.filter;
        var homeNav = document.getElementById('fmSidebarHome');
        if (homeNav) homeNav.classList.toggle('active', fmCurrentPath === 'home:');
        var panel = document.getElementById('fmDetails');
        if (panel) {
            var host = document.querySelector('.fm-container');
            var w = host ? host.clientWidth : 0;
            var autoCollapsed = w > 0 && w < 780;
            if (state.narrow !== undefined && state.narrow !== autoCollapsed) {
                // 跨过 780px 断点后交还给自动布局，避免手动状态长期锁死
                state.detailsTouched = false;
            }
            state.narrow = autoCollapsed;
            if (!state.detailsTouched) {
                if (autoCollapsed && state.detailsOpen) {
                    state.detailsOpen = false;
                    panel.classList.add('fm-collapsed');
                } else if (!autoCollapsed && !state.detailsOpen) {
                    state.detailsOpen = true;
                    panel.classList.remove('fm-collapsed');
                }
            }
        }
        // 首页默认收起详情；用户手动展开后尊重手动选择
        if (panel && fmCurrentPath === 'home:' && !state.detailsTouched) panel.classList.add('fm-collapsed');
        applyDetailsOpen();
    }

    /* ---------------- 快速访问首屏 ---------------- */
    function collectModified(limit) {
        var fs = {};
        try { fs = getUserLS('filesystem') || {}; } catch (e) { }
        var out = [];
        var walks = 0;
        function walk(node, path, depth) {
            if (!node || !node.children || depth > 2 || walks > 260) return;
            var keys = Object.keys(node.children);
            for (var i = 0; i < keys.length; i++) {
                walks++;
                if (walks > 260) break;
                var name = keys[i], child = node.children[name];
                if (!child || name.charAt(0) === '.') continue;
                var p = path + '/' + name;
                if (child.type === 'folder') {
                    walk(child, p, depth + 1);
                } else {
                    out.push({ name: name, path: path, full: p, node: child, mtime: nodeMtime(child) });
                }
            }
        }
        Object.keys(fs).forEach(function (d) { walk(fs[d], d + ':', 0); });
        out.sort(function (a, b) { return (b.mtime || 0) - (a.mtime || 0); });
        return out.slice(0, limit || 8);
    }
    function homeHTML() {
        var s = readSettings();
        var recents = (s.fmRecent || []).slice(0, 4);
        var fs = {};
        try { fs = getUserLS('filesystem') || {}; } catch (e) { }
        var recentHtml = '';
        if (recents.length) {
            recentHtml = '<div class="fm-home-recent">' + recents.map(function (r) {
                var node = nodeIn(fs, r.path);
                if (!node) return '';
                return '<div class="fm-home-file" onclick="n26FM.openEntry(\'' + esc(r.path).replace(/'/g, "\\'") + '\')">' +
                    '<div class="fm-hf-icon"><i class="fas ' + (node.type === 'folder' ? 'fa-folder' : 'fa-file-alt') + '" style="color:' + (node.type === 'folder' ? '#60a5fa' : '#9ca3af') + ';"></i></div>' +
                    '<div class="fm-hf-meta"><div class="fm-hf-name">' + esc(r.name) + '</div>' +
                    '<div class="fm-hf-sub">' + esc(r.path) + ' · ' + relTime(r.at) + '</div></div></div>';
            }).join('') + '</div>';
        } else {
            recentHtml = '<div class="fm-home-empty">还没有最近打开的文件。打开一个文件后，这里会出现「继续工作」。</div>';
        }
        var folders = ['C:/文档', 'C:/下载', 'C:/图片', 'C:/音乐', 'C:/视频'];
        var folderHtml = '<div class="fm-home-folders">' + folders.map(function (p) {
            var node = nodeIn(fs, p);
            if (!node) return '';
            var n = Object.keys(node.children || {}).length;
            return '<div class="fm-home-folder" onclick="n26FM.openFolder(\'' + esc(p).replace(/'/g, "\\'") + '\')">' +
                '<i class="fas fa-folder"></i><div><div class="fm-hd-name">' + esc(p.split('/').pop()) + '</div>' +
                '<div class="fm-hd-sub">' + n + ' 项</div></div></div>';
        }).join('') + '</div>';
        var modified = collectModified(8);
        var modHtml = '<div class="fm-home-recent">' + modified.map(function (m) {
            return '<div class="fm-home-file" onclick="n26FM.openFile(\'' + esc(m.path).replace(/'/g, "\\'") + '\',\'' + esc(m.name).replace(/'/g, "\\'") + '\')">' +
                '<div class="fm-hf-icon"><i class="fas fa-file-alt" style="color:#9ca3af;"></i></div>' +
                '<div class="fm-hf-meta"><div class="fm-hf-name">' + esc(m.name) + '</div>' +
                '<div class="fm-hf-sub">' + esc(m.path) + ' · ' + (m.mtime ? relTime(m.mtime) : '—') + '</div></div></div>';
        }).join('') + '</div>';
        return '<div class="fm-home-section"><div class="fm-home-title"><i class="fas fa-clock-rotate-left"></i> 继续工作 <small>最近打开</small></div>' + recentHtml + '</div>' +
            '<div class="fm-home-section"><div class="fm-home-title"><i class="fas fa-folder-open"></i> 常用文件夹</div>' + (folderHtml || '<div class="fm-home-empty">没有找到常用文件夹。</div>') + '</div>' +
            '<div class="fm-home-section"><div class="fm-home-title"><i class="fas fa-wave-square"></i> 最近修改 <small>C 盘前两层</small></div>' + modHtml + '</div>';
    }
    function renderHome(grid) {
        if (!grid) return;
        grid.classList.add('fm-home');
        grid.classList.remove('fm-list');
        grid.innerHTML = homeHTML();
        // 状态栏：最近文件 + 常用文件夹
        try {
            var mods = collectModified(8);
            if (typeof fmUpdateStatus === 'function') fmUpdateStatus(mods.length, 0, '快速访问');
        } catch (e) { }
    }
    function noteRecent(path, name) {
        if (!path || !name) return;
        var full = String(path).replace(/\/+$/, '') + '/' + name;
        var s = readSettings();
        var list = (s.fmRecent || []).filter(function (r) { return r.path !== full; });
        list.unshift({ path: path, name: name, at: Date.now() });
        s.fmRecent = list.slice(0, 12);
        writeSettings(s);
    }
    function openEntry(path) {
        var node = nodeIn(getUserLS('filesystem') || {}, path);
        if (!node || node.type !== 'folder') return;
        if (typeof fmGoTo === 'function') fmGoTo(path);
    }
    function openFile(dirPath, name) {
        if (typeof fmGoTo === 'function') fmGoTo(dirPath);
        setTimeout(function () {
            try {
                var node = getNodeByPath(String(dirPath).replace(/\/+$/, '') + '/' + name);
                if (node) fmItemOpen(name, node.type);
            } catch (e) { }
        }, 80);
    }

    /* ---------------- 打开 / 重命名 / 复制 ---------------- */
    function openSelection() {
        var n = names();
        if (n.length !== 1) return notify('打开', '请先选择一个项目', 'info');
        var node = getNodeByPath(fmCurrentPath + '/' + n[0]);
        if (!node) return notify('打开', '项目不存在', 'error');
        if (typeof fmItemOpen === 'function') fmItemOpen(n[0], node.type);
    }
    /* ---------------- 文件预览（文本 / 图片 / 音视频真实内容） ----------------
       系统里没有独立文本查看器，双击 txt 时过去只弹一句「正在打开」——那是假动作。
       这里用真实内容预览闭环：能读到的就显示，读不到的明确说明原因。 */
    function mediaKindOf(name) {
        if (/\.(mp4|webm|mov|mkv|avi)$/i.test(name)) return 'video';
        if (/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(name)) return 'audio';
        return '';
    }
    function previewFile(name, node) {
        node = node || getNodeByPath(fmCurrentPath + '/' + name);
        if (!node || node.type === 'folder') return false;
        var content = typeof node.content === 'string' ? node.content : '';
        var body = '';
        if (isImageNode(name, node) && content) {
            body = '<div class="fm-pv-stage"><img src="' + esc(content) + '" alt="' + esc(name) + '"></div>';
        } else if (mediaKindOf(name) && content) {
            var mk = mediaKindOf(name);
            body = '<div class="fm-pv-stage">' + (mk === 'video'
                ? '<video src="' + esc(content) + '" controls autoplay playsinline></video>'
                : '<audio src="' + esc(content) + '" controls autoplay></audio>') + '</div>';
        } else if (content && (TEXT_EXT.test(name) || node.fileType === 'text')) {
            body = '<pre class="fm-preview-text">' + esc(content) + '</pre>';
        } else if (node.fileType === 'word' || node.fileType === 'ppt' || node.fileType === 'excel') {
            var ed = node.fileType === 'word' ? 'word-editor' : node.fileType === 'ppt' ? 'ppt-editor' : 'excel-editor';
            body = '<div class="fm-pv-note"><i class="fas fa-file-lines"></i><b>需要 Office 编辑器</b>' +
                '<small>这是 Office 文档，文件管理只做内容预览会失真。</small>' +
                '<button class="fm-empty-btn primary" onclick="n26FM.openInEditor(\'' + esc(ed) + '\')">用编辑器打开</button></div>';
        } else {
            return false;
        }
        var mask = document.getElementById('fmPreviewMask');
        if (mask) mask.remove();
        mask = document.createElement('div');
        mask.id = 'fmPreviewMask';
        mask.className = 'fm-preview-mask';
        mask.innerHTML = '<div class="fm-preview-card" role="dialog" aria-label="文件预览">' +
            '<div class="fm-pv-head"><span title="' + esc(name) + '"><i class="fas ' +
            (isImageNode(name, node) ? 'fa-image' : (mediaKindOf(name) === 'video' ? 'fa-film' : mediaKindOf(name) === 'audio' ? 'fa-music' : 'fa-file-lines')) +
            '"></i> ' + esc(name) + '</span><button class="fm-pv-close" aria-label="关闭预览"><i class="fas fa-xmark"></i></button></div>' +
            '<div class="fm-pv-body">' + body + '</div></div>';
        document.body.appendChild(mask);
        function close() {
            var m = document.getElementById('fmPreviewMask');
            if (m) m.remove();
            document.removeEventListener('keydown', onEsc, true);
        }
        function onEsc(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
        mask.addEventListener('click', function (e) {
            if (e.target === mask || (e.target.closest && e.target.closest('.fm-pv-close'))) close();
        });
        document.addEventListener('keydown', onEsc, true);
        return true;
    }
    function openInEditor(appId) {
        var list = names();
        if (list.length !== 1) list = [fmPreviewName];
        var name = list[0];
        if (!name) return;
        var path = fmCurrentPath.replace(/\/+$/, '') + '/' + name;
        try {
            if (typeof officeEditorOpenFile !== 'undefined') officeEditorOpenFile = { path: path, name: name };
            var existing = windows.find(function (w) { return w.appId === appId; });
            if (existing) closeWindow(existing.id);
            openApp(appId);
            fmPreviewClose();
        } catch (e) {
            notify('打开失败', '无法启动编辑器', 'error');
        }
    }
    var fmPreviewName = '';
    function fmPreviewClose() { var m = document.getElementById('fmPreviewMask'); if (m) m.remove(); }
    function previewCurrent(name, node) {
        fmPreviewName = name || '';
        return previewFile(name, node);
    }
    function copyPath() {
        var n = names();
        if (n.length !== 1) return notify('复制路径', '请先选择一个项目', 'info');
        var full = fmCurrentPath.replace(/\/+$/, '') + '/' + n[0];
        try {
            navigator.clipboard.writeText(full).then(function () {
                notify('已复制路径', full, 'success');
            }, function () {
                notify('复制失败', '浏览器未授予剪贴板权限', 'error');
            });
        } catch (e) {
            notify('复制失败', '浏览器不支持剪贴板 API', 'error');
        }
    }
    function uniqueName(children, name) {
        if (!children[name]) return name;
        var dot = name.lastIndexOf('.');
        var base = dot > 0 ? name.slice(0, dot) : name;
        var ext = dot > 0 ? name.slice(dot) : '';
        var i = 1;
        while (children[base + ' (' + i + ')' + ext]) i++;
        return base + ' (' + i + ')' + ext;
    }
    function startRename() {
        var list = names();
        if (list.length !== 1) return notify('重命名', '一次只能重命名一个项目', 'info');
        if ((!currentUser || currentUser.role === 'guest') && !safeMode) {
            return notify('权限不足', '需要管理员权限', 'error');
        }
        var old = list[0];
        var grid = gridEl();
        if (!grid) return;
        var item = Array.prototype.find.call(grid.querySelectorAll('.fm-item'), function (el) {
            return el.dataset.name === old;
        });
        var nameEl = item && item.querySelector('.fm-item-name');
        if (!nameEl) return notify('重命名', '请在列表或图标视图中操作', 'info');
        nameEl.textContent = '';
        var input = document.createElement('input');
        input.className = 'fm-rename-input';
        input.value = old;
        nameEl.appendChild(input);
        input.focus();
        input.select();
        var done = false;
        function finish(commit) {
            if (done) return;
            done = true;
            var v = (input.value || '').trim();
            if (!commit || !v || v === old) { fmRenderGrid(); return; }
            renameTo(old, v);
        }
        input.onkeydown = function (e) {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { finish(false); }
        };
        input.onblur = function () { finish(true); };
        input.onclick = function (e) { e.stopPropagation(); };
    }
    function renameTo(oldName, newName) {
        var fs = getUserLS('filesystem') || {};
        var node = nodeIn(fs, fmCurrentPath);
        if (!node || !node.children || !node.children[oldName]) return;
        if (node.children[newName]) return notify('重命名失败', '名称已存在', 'error');
        if ((!currentUser || currentUser.role === 'guest') && !safeMode) {
            return notify('权限不足', '需要管理员权限', 'error');
        }
        node.children[newName] = node.children[oldName];
        delete node.children[oldName];
        fs[driveOf(fmCurrentPath)] = nodeIn(fs, driveOf(fmCurrentPath) + ':');
        setUserLS('filesystem', fs);
        state.sel = [newName];
        state.anchor = newName;
        syncLegacy();
        fmRenderGrid();
        logTransfer('rename', 1, oldName + ' → ' + newName);
        notify('重命名', '已重命名为 ' + newName, 'success');
    }

    /* ---------------- 复制 / 剪切 / 粘贴 ---------------- */
    function copySelection(cut) {
        var list = names();
        if (!list.length) return notify('复制', '请先选择项目', 'info');
        if (isReadOnlyPath(fmCurrentPath)) return notify('只读模式', '真实硬盘为只读浏览，不能复制到虚拟盘', 'error');
        state.clip = { mode: cut ? 'cut' : 'copy', names: list.slice(), from: fmCurrentPath };
        if (typeof fmClipboard !== 'undefined') fmClipboard = { mode: state.clip.mode, name: list[0], from: fmCurrentPath };
        notify(cut ? '已剪切' : '已复制', list.length + ' 项，进入目标文件夹后按 Ctrl+V', 'success');
    }
    function pasteClipboard() {
        var clip = state.clip;
        if (!clip || !clip.names || !clip.names.length) return notify('粘贴', '剪贴板为空（先复制或剪切项目）', 'info');
        if (fmCurrentPath === 'home:') return notify('粘贴', '请先进入一个文件夹', 'info');
        if (isReadOnlyPath(fmCurrentPath)) return notify('只读模式', '真实硬盘为只读浏览，不能写入', 'error');
        if (fmCurrentPath === 'cloud:' || fmCurrentPath === '__trash__') return notify('粘贴', '当前视图不支持粘贴', 'info');
        if ((!currentUser || currentUser.role === 'guest') && !safeMode) {
            return notify('权限不足', '需要管理员权限', 'error');
        }
        var fs = getUserLS('filesystem') || {};
        var dst = nodeIn(fs, fmCurrentPath);
        var src = nodeIn(fs, clip.from);
        if (!dst || !dst.children) return notify('粘贴失败', '目标位置不存在', 'error');
        if (!src || !src.children) return notify('粘贴失败', '源位置不存在', 'error');
        var done = 0, skipped = 0;
        clip.names.forEach(function (name) {
            var item = src.children[name];
            if (!item) { skipped++; return; }
            if (clip.mode === 'cut' && clip.from === fmCurrentPath) { skipped++; return; }
            var finalName = uniqueName(dst.children, name);
            dst.children[finalName] = clip.mode === 'cut'
                ? item
                : JSON.parse(JSON.stringify(item));
            if (clip.mode === 'cut') delete src.children[name];
            done++;
        });
        fs[driveOf(fmCurrentPath)] = nodeIn(fs, driveOf(fmCurrentPath) + ':');
        if (clip.mode === 'cut' && clip.from !== fmCurrentPath) {
            fs[driveOf(clip.from)] = nodeIn(fs, driveOf(clip.from) + ':');
        }
        setUserLS('filesystem', fs);
        if (clip.mode === 'cut') state.clip = null;
        state.sel = [];
        syncLegacy();
        fmRenderGrid();
        logTransfer(clip.mode === 'cut' ? 'move' : 'copy', done, clip.from + ' → ' + fmCurrentPath);
        notify(clip.mode === 'cut' ? '已移动' : '已粘贴', done + ' 项' + (skipped ? '，跳过 ' + skipped + ' 项' : ''), 'success');
    }

    /* ---------------- 删除 + 5 秒撤销 ---------------- */
    async function deleteSelection() {
        var list = names();
        if (!list.length) return notify('提示', '请先选择项目', 'info');
        if (isReadOnlyPath(fmCurrentPath)) return notify('只读模式', '真实硬盘为只读浏览，不能删除', 'error');
        if (fmCurrentPath === 'home:' || fmCurrentPath === 'cloud:' || fmCurrentPath === '__trash__') {
            return notify('提示', '当前视图不支持删除', 'info');
        }
        if ((!currentUser || currentUser.role === 'guest') && !safeMode) {
            return notify('权限不足', '需要管理员权限', 'error');
        }
        var allowed = [], blocked = [];
        list.forEach(function (name) {
            if (!safeMode && typeof isSystemFile === 'function' && isSystemFile(fmCurrentPath, name)) blocked.push(name);
            else allowed.push(name);
        });
        if (blocked.length) notify('受保护', '关键系统文件已跳过：' + blocked.join('、'), 'error');
        if (!allowed.length) return;
        var msg = allowed.length === 1
            ? '确定要将「' + allowed[0] + '」移入回收站吗？'
            : '确定要将 ' + allowed.length + ' 个项目移入回收站吗？';
        var ok = true;
        try { ok = await nexusConfirm('删除文件', msg + '\n\n可在 5 秒内撤销（Ctrl+Z）。'); } catch (e) { ok = false; }
        if (!ok) return;
        var fs = getUserLS('filesystem') || {};
        var node = nodeIn(fs, fmCurrentPath);
        if (!node || !node.children) return notify('删除失败', '目标位置不存在', 'error');
        var trash = getUserLS('trash') || [];
        var token = 'd' + Date.now() + Math.random().toString(36).slice(2, 7);
        var at = Date.now();
        var removed = [];
        allowed.forEach(function (name) {
            var item = node.children[name];
            if (!item) return;
            trash.push({
                name: name, type: item.type, content: item.content, children: item.children,
                originalPath: fmCurrentPath, deletedAt: at, uid: token
            });
            delete node.children[name];
            removed.push(name);
        });
        setUserLS('trash', trash);
        fs[driveOf(fmCurrentPath)] = nodeIn(fs, driveOf(fmCurrentPath) + ':');
        setUserLS('filesystem', fs);
        state.sel = [];
        syncLegacy();
        fmRenderGrid();
        logTransfer('delete', removed.length, fmCurrentPath);
        notify('删除', '已移入回收站 ' + removed.length + ' 项 · 5 秒内可撤销', 'success');
        showUndo(removed.length, token);
        if (typeof isSystemFile === 'function' && removed.some(function (n) { return isSystemFile(fmCurrentPath, n); })) {
            try {
                var missing = checkSystemFilesIntegrity();
                setTimeout(function () { triggerBSOD(missing.length > 0 ? missing : SYSTEM_FILES.slice()); }, 600);
            } catch (e) { }
        }
    }
    function showUndo(count, token) {
        dismissUndo();
        state.undo = { token: token, count: count, until: Date.now() + 5000 };
        var el = document.createElement('div');
        el.className = 'fm-undo-toast';
        el.id = 'fmUndoToast';
        el.innerHTML = '<span>已移入回收站 ' + count + ' 项</span><button onclick="n26FM.undoDelete()">撤销</button>';
        document.body.appendChild(el);
        state.undoTimer = setTimeout(function () {
            dismissUndo();
        }, 5000);
    }
    function dismissUndo() {
        if (state.undoTimer) { clearTimeout(state.undoTimer); state.undoTimer = 0; }
        state.undo = null;
        var el = document.getElementById('fmUndoToast');
        if (el) el.remove();
    }
    function undoDelete() {
        if (!state.undo) return notify('撤销', '撤销窗口已结束（删除后 5 秒内可撤销）', 'info');
        var token = state.undo.token;
        var fs = getUserLS('filesystem') || {};
        var trash = getUserLS('trash') || [];
        var keep = [], restored = 0, failed = 0;
        trash.forEach(function (entry) {
            if (entry.uid !== token) { keep.push(entry); return; }
            var parent = nodeIn(fs, entry.originalPath);
            if (!parent || !parent.children) { failed++; keep.push(entry); return; }
            var name = entry.name;
            if (parent.children[name]) name = uniqueName(parent.children, name);
            parent.children[name] = { type: entry.type, content: entry.content, children: entry.children };
            fs[driveOf(entry.originalPath)] = nodeIn(fs, driveOf(entry.originalPath) + ':');
            restored++;
        });
        setUserLS('filesystem', fs);
        setUserLS('trash', keep);
        dismissUndo();
        fmRenderGrid();
        logTransfer('undo', restored, '撤销删除');
        notify('已撤销', restored + ' 项已恢复到原位置' + (failed ? '，' + failed + ' 项自动跳过' : ''), 'success');
    }

    /* ---------------- 导入 ---------------- */
    function pickImport() {
        var inp = document.getElementById('fmImportInput');
        if (inp) inp.click();
        else notify('导入', '导入输入框未就绪，请重新打开文件管理', 'error');
    }
    function fileKind(name, mime) {
        var lower = String(name || '').toLowerCase();
        if (/\.pptx?$/.test(lower)) return 'ppt';
        if (/\.docx?$/.test(lower)) return 'word';
        if (/\.xlsx?$/.test(lower)) return 'excel';
        if (/\.txt$/.test(lower)) return 'text';
        if (/\.(html?|md)$/.test(lower)) return 'html';
        if (/\.(png|jpg|jpeg|gif|webp|bmp|svg|ico)$/.test(lower) || (mime || '').indexOf('image/') === 0) return 'image';
        if (/\.(mp4|webm|mov|ogg)$/.test(lower) || (mime || '').indexOf('video/') === 0) return 'video';
        if (/\.(mp3|wav|m4a|flac)$/.test(lower) || (mime || '').indexOf('audio/') === 0) return 'audio';
        return 'binary';
    }
    function importFiles(fileList, targetDir) {
        var files = Array.prototype.slice.call(fileList || []);
        if (!files.length) return;
        var target = (typeof targetDir === 'string' && targetDir) ? targetDir : fmCurrentPath;
        if (target === 'home:') target = 'C:/文档';
        if (isReadOnlyPath(target)) return notify('只读模式', '真实硬盘为只读浏览，不能导入文件', 'error');
        if (target === 'cloud:' || target === '__trash__' || !target) {
            return notify('导入', '请先进入一个文件夹再导入', 'info');
        }
        if ((!currentUser || currentUser.role === 'guest') && !safeMode) {
            return notify('权限不足', '需要管理员权限', 'error');
        }
        var fs = getUserLS('filesystem') || {};
        var dir = nodeIn(fs, target);
        if (!dir) {
            // 首页导入时若「文档」不存在，先建出来
            var drive = nodeIn(fs, 'C:');
            if (!drive) return notify('导入失败', '目标位置不存在', 'error');
            if (!drive.children) drive.children = {};
            drive.children['文档'] = { type: 'folder', children: {} };
            fs['C'] = drive;
            target = 'C:/文档';
            dir = drive.children['文档'];
            setUserLS('filesystem', fs);
        }
        if (!dir.children) dir.children = {};
        var done = 0, skipped = [], pending = files.length;
        files.forEach(function (file) {
            if (file.size > 8 * 1024 * 1024) {
                skipped.push(file.name + '（超过 8 MB）');
                pending--; finish();
                return;
            }
            var kind = fileKind(file.name, file.type);
            var reader = new FileReader();
            var asText = ['ppt', 'word', 'excel', 'text', 'html'].indexOf(kind) >= 0 && file.type.indexOf('image') < 0
                && /\.(txt|md|html?|json|js|css|csv|xml|yml|yaml|nex|log)$/i.test(file.name);
            reader.onload = function (ev) {
                try {
                    var latest = getUserLS('filesystem') || {};
                    var d = nodeIn(latest, target);
                    if (!d) { skipped.push(file.name + '（目标已变化）'); return; }
                    if (!d.children) d.children = {};
                    var name = uniqueName(d.children, file.name);
                    d.children[name] = {
                        type: 'file', fileType: kind,
                        content: ev.target.result,
                        size: file.size,
                        modifiedAt: Date.now(),
                        importedAt: Date.now()
                    };
                    latest[driveOf(target)] = nodeIn(latest, driveOf(target) + ':');
                    setUserLS('filesystem', latest);
                    done++;
                } catch (e) {
                    skipped.push(file.name + '（存储空间不足）');
                }
            };
            reader.onerror = function () { skipped.push(file.name + '（读取失败）'); };
            reader.onloadend = function () { pending--; finish(); };
            if (asText) reader.readAsText(file);
            else reader.readAsDataURL(file);
        });
        var finished = false;
        function finish() {
            if (pending > 0 || finished) return;
            finished = true;
            fmRenderGrid();
            logTransfer('import', done, target);
            notify('导入完成', '成功 ' + done + ' 个' + (skipped.length ? '，跳过 ' + skipped.length + ' 个：' + skipped.join('；') : ''), done ? 'success' : 'info');
        }
    }

    /* ---------------- 传输记录（真实操作日志） ---------------- */
    function logTransfer(kind, count, label) {
        var s = readSettings();
        var list = s.fmTransfers || [];
        list.unshift({ kind: kind, count: count, label: String(label || ''), at: Date.now() });
        s.fmTransfers = list.slice(0, 24);
        writeSettings(s);
    }
    function showTransfers() {
        var s = readSettings();
        var list = s.fmTransfers || [];
        var kindName = { copy: '复制', move: '移动', delete: '删除', undo: '撤销删除', import: '导入', rename: '重命名' };
        var body = list.length
            ? '<div style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow:auto;">' + list.map(function (r) {
                return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:rgba(127,140,160,.07);font-size:12px;">' +
                    '<b style="flex:none;">' + (kindName[r.kind] || r.kind) + ' · ' + r.count + ' 项</b>' +
                    '<span style="min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.72;">' + esc(r.label) + '</span>' +
                    '<span style="flex:none;opacity:.5;font-size:11px;">' + new Date(r.at).toLocaleString('zh-CN', { hour12: false }) + '</span></div>';
            }).join('') + '</div>'
            : '<div class="fm-empty" style="padding:30px;"><i class="fas fa-arrow-right-arrow-left"></i><b>还没有文件操作记录</b><small>复制、移动、删除、导入会记录在这里</small></div>';
        try {
            if (typeof n26InfoModal === 'function') n26InfoModal('传输记录', body, { icon: 'fa-solid fa-arrow-right-arrow-left' });
            else notify('传输记录', list.length + ' 条记录', 'info');
        } catch (e) { }
    }

    /* ---------------- 过滤 ---------------- */
    function setFilter(v) {
        state.filter = v || 'all';
        if (typeof fmRenderGrid === 'function') fmRenderGrid();
    }
    function filterItems(items) {
        if (state.filter === 'all') return items;
        return items.filter(function (it) {
            if (state.filter === 'folder') return it.type === 'folder';
            if (state.filter === 'doc') return /doc|txt|md|ppt|xls|csv|pdf/i.test(it.fileType || it.ext || '');
            if (state.filter === 'image') return /png|jpg|jpeg|gif|webp|bmp|svg|ico/i.test(it.ext || '');
            if (state.filter === 'media') return /mp4|webm|mov|mp3|wav|flac|ogg/i.test(it.ext || '');
            return true;
        });
    }

    /* ---------------- 键盘 ---------------- */
    function handleKey(e) {
        if (!activeFilesWin()) return;
        var typing = isTypingTarget(e.target);
        var ctrl = e.ctrlKey || e.metaKey;
        if (typing) {
            if (e.key === 'Escape') {
                if (e.target && e.target.id === 'fmSearchInput') {
                    e.target.value = '';
                    if (typeof fmSearch === 'function') fmSearch('');
                }
                e.target.blur();
            }
            return;
        }
        if (e.key === 'Escape') {
            if (state.sel.length) { clearSelection(); e.preventDefault(); }
            else {
                var si = document.getElementById('fmSearchInput');
                if (si && si.value) { si.value = ''; if (typeof fmSearch === 'function') fmSearch(''); e.preventDefault(); }
            }
            return;
        }
        if (ctrl && (e.key === 'f' || e.key === 'F')) {
            var si2 = document.getElementById('fmSearchInput');
            if (si2) { e.preventDefault(); si2.focus(); si2.select(); }
            return;
        }
        if (ctrl && (e.key === 'a' || e.key === 'A')) {
            if (fmCurrentPath === 'home:') return;
            e.preventDefault(); selectAll(); return;
        }
        if (ctrl && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); copySelection(false); return; }
        if (ctrl && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); copySelection(true); return; }
        if (ctrl && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); pasteClipboard(); return; }
        if (ctrl && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undoDelete(); return; }
        if (ctrl && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
            e.preventDefault(); if (typeof fmNewFolder === 'function') fmNewFolder(); return;
        }
        if (ctrl && (e.key === '1')) {
            e.preventDefault();
            if (typeof fmViewMode !== 'undefined' && fmViewMode !== 'list') { fmToggleView(); }
            return;
        }
        if (ctrl && (e.key === '2')) {
            e.preventDefault();
            if (typeof fmViewMode !== 'undefined' && fmViewMode !== 'grid') { fmToggleView(); }
            return;
        }
        if (e.key === ' ') {
            // 总纲 4.1：Space 打开右侧预览，再按一次关闭
            if (document.getElementById('fmPreviewMask')) { e.preventDefault(); fmPreviewClose(); return; }
            var one = names();
            if (one.length === 1) { e.preventDefault(); previewFile(one[0]); }
            return;
        }
        if (e.key === 'Enter') {
            var one2 = names();
            if (one2.length === 1) { e.preventDefault(); openSelection(); }
            return;
        }
        if (e.key === 'F2') { e.preventDefault(); startRename(); return; }
        if (e.key === 'Delete') {
            e.preventDefault();
            if (e.shiftKey) {
                // 永久删除：明确二次确认，不假装走回收站
                if (typeof nexusConfirm === 'function') {
                    var list = names();
                    if (!list.length) return notify('提示', '请先选择项目', 'info');
                    nexusConfirm('永久删除', '将永久删除 ' + list.length + ' 项，不能从回收站恢复。确定继续吗？').then(function (ok) {
                        if (!ok) return;
                        var fs = getUserLS('filesystem') || {};
                        var node = nodeIn(fs, fmCurrentPath);
                        if (!node || !node.children) return;
                        var n = 0;
                        list.forEach(function (nm) {
                            if (!safeMode && typeof isSystemFile === 'function' && isSystemFile(fmCurrentPath, nm)) return;
                            if (node.children[nm]) { delete node.children[nm]; n++; }
                        });
                        fs[driveOf(fmCurrentPath)] = nodeIn(fs, driveOf(fmCurrentPath) + ':');
                        setUserLS('filesystem', fs);
                        state.sel = [];
                        syncLegacy();
                        fmRenderGrid();
                        logTransfer('delete', n, '永久删除');
                        notify('已永久删除', n + ' 项（不可撤销）', 'success');
                    });
                }
            } else {
                deleteSelection();
            }
            return;
        }
        if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); if (typeof fmGoBack === 'function') fmGoBack(); return; }
        if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); if (typeof fmGoForward === 'function') fmGoForward(); return; }
        if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); if (typeof fmGoUp === 'function') fmGoUp(); return; }
        if (e.key === 'Backspace') { e.preventDefault(); if (typeof fmGoUp === 'function') fmGoUp(); return; }
    }

    /* ---------------- 导航钩子 ---------------- */
    function maybeAnimateRoute() {
        var grid = gridEl();
        if (!grid) return;
        if (state.lastRoute === fmCurrentPath) return;
        // 切换目录时旧选中项已不属于当前列表，直接清掉，避免详情面板显示幽灵项目
        state.lastRoute = fmCurrentPath;
        state.sel = [];
        state.anchor = null;
        syncLegacy();
        grid.classList.remove('fm-route-in');
        void grid.offsetWidth;
        grid.classList.add('fm-route-in');
    }

    function openSelectedNames() {
        var list = names();
        if (list.length !== 1) return notify('打开', '请先选择一个项目', 'info');
        var node = getNodeByPath(fmCurrentPath + '/' + list[0]);
        if (node) fmItemOpen(list[0], node.type);
    }

    /* ---------------- 拖放：内部移动 / 外部文件导入 ---------------- */
    var drag = null;

    function normPath(p) { return String(p || '').replace(/:$/, ''); }
    function samePath(a, b) { return normPath(a) === normPath(b); }
    function hasFiles(dt) {
        if (!dt) return false;
        var t = dt.types || [];
        for (var i = 0; i < t.length; i++) if (t[i] === 'Files') return true;
        return false;
    }
    function canDropTo(dest, external) {
        if (!dest || dest === 'home:' || dest === 'cloud:' || dest === '__trash__') return false;
        if (isReadOnlyPath(dest)) return false;
        if (external && ((!currentUser || currentUser.role === 'guest') && !safeMode)) return false;
        return true;
    }
    function dropTargetOf(ev) {
        var el = ev && ev.target;
        var row = el && el.closest && el.closest('.fm-tree-row');
        if (row && row.dataset.path) return { kind: 'tree', path: row.dataset.path, el: row };
        var crumb = el && el.closest && el.closest('.fm-crumb');
        if (crumb && crumb.dataset.path) return { kind: 'crumb', path: crumb.dataset.path, el: crumb };
        var item = el && el.closest && el.closest('.fm-item');
        if (item && item.dataset.type === 'folder' && item.dataset.name) {
            return { kind: 'folder', path: fmCurrentPath + '/' + item.dataset.name, el: item };
        }
        return { kind: 'container', path: fmCurrentPath, el: null };
    }
    function isInvalidMove(dest, payload) {
        if (!payload) return false;
        if (samePath(dest, payload.from)) return true;
        return payload.names.some(function (name) {
            var src = payload.from + '/' + name;
            return samePath(dest, src) || normPath(dest).indexOf(normPath(src) + '/') === 0;
        });
    }
    function clearDropMarks() {
        Array.prototype.forEach.call(document.querySelectorAll('.fm-drop, .fm-container.fm-dragover'), function (el) {
            el.classList.remove('fm-drop');
            el.classList.remove('fm-dragover');
        });
    }
    function beginDrag(name, ev, fromPath) {
        if (!name || !ev) return;
        if (isSpecialPath(fromPath) || isReadOnlyPath(fromPath)) {
            try { ev.preventDefault(); } catch (e) { }
            return;
        }
        var list = names();
        if (list.indexOf(name) < 0) list = [name];
        drag = { names: list.slice(), from: fromPath };
        try {
            ev.dataTransfer.effectAllowed = 'copyMove';
            ev.dataTransfer.setData('text/plain', list.join('\n'));
            ev.dataTransfer.setData('application/x-n26-files', JSON.stringify(drag));
        } catch (e) { }
        var grid = gridEl();
        if (grid) {
            Array.prototype.forEach.call(grid.querySelectorAll('.fm-item'), function (el) {
                if (list.indexOf(el.dataset.name) >= 0) el.classList.add('fm-drag-source');
            });
        }
    }
    function dragOver(ev) {
        if (!ev) return;
        var dt = ev.dataTransfer;
        var external = !drag && hasFiles(dt);
        var target = dropTargetOf(ev);
        var payload = drag;
        if (!canDropTo(target.path, external) || (payload && isInvalidMove(target.path, payload))) {
            try { if (dt) dt.dropEffect = 'none'; } catch (e) { }
            clearDropMarks();
            return;
        }
        ev.preventDefault();
        try { if (dt) dt.dropEffect = external ? 'copy' : 'move'; } catch (e) { }
        clearDropMarks();
        if (target.el) target.el.classList.add('fm-drop');
        else {
            var box = document.querySelector('.fm-container');
            if (box) box.classList.add('fm-dragover');
        }
    }
    function dragLeave(ev) {
        if (!ev) return;
        var rt = ev.relatedTarget;
        if (rt && ev.currentTarget && ev.currentTarget.contains && ev.currentTarget.contains(rt)) return;
        clearDropMarks();
    }
    function dropAt(ev, targetPath) {
        if (!ev) return;
        ev.preventDefault();
        try { ev.stopPropagation(); } catch (e) { }
        var dt = ev.dataTransfer;
        var external = hasFiles(dt);
        var dest = targetPath || dropTargetOf(ev).path;
        var payload = null;
        try {
            var raw = dt && dt.getData ? dt.getData('application/x-n26-files') : '';
            if (raw) payload = JSON.parse(raw);
        } catch (e) { }
        if (!payload) payload = drag;
        clearDropMarks();
        if (!canDropTo(dest, external)) return notify('拖放', '该位置不可写入', 'error');
        if (external) {
            if (isReadOnlyPath(payload && payload.from || '')) return;
            importFiles(dt.files, dest);
            return;
        }
        if (!payload || !payload.names || !payload.names.length) return;
        if (isInvalidMove(dest, payload)) return notify('移动', '不能移动到当前位置或子文件夹', 'info');
        moveItems(payload.names, payload.from, dest);
    }
    function crumbDrop(ev) {
        if (!ev) return;
        var crumb = ev.target.closest && ev.target.closest('.fm-crumb');
        dropAt(ev, crumb && crumb.dataset.path ? crumb.dataset.path : null);
    }
    function endDrag() {
        drag = null;
        clearDropMarks();
        Array.prototype.forEach.call(document.querySelectorAll('.fm-drag-source'), function (el) {
            el.classList.remove('fm-drag-source');
        });
    }
    function moveItems(list, from, to) {
        if (!list || !list.length) return;
        if (samePath(from, to)) return notify('移动', '已在目标位置', 'info');
        if (isSpecialPath(from) || isReadOnlyPath(from) || isSpecialPath(to) || isReadOnlyPath(to)) {
            return notify('移动', '该位置不可写入', 'error');
        }
        if ((!currentUser || currentUser.role === 'guest') && !safeMode) {
            return notify('权限不足', '需要管理员权限', 'error');
        }
        var fs = getUserLS('filesystem') || {};
        var src = nodeIn(fs, from);
        var dst = nodeIn(fs, to);
        if (!src || !src.children) return notify('移动失败', '源位置不存在', 'error');
        if (!dst) return notify('移动失败', '目标文件夹不存在', 'error');
        if (!dst.children) dst.children = {};
        var moved = 0, skipped = 0;
        list.forEach(function (name) {
            var item = src.children[name];
            if (!item) { skipped++; return; }
            if (!safeMode && typeof isSystemFile === 'function' && isSystemFile(from, name)) { skipped++; return; }
            var finalName = uniqueName(dst.children, name);
            dst.children[finalName] = item;
            delete src.children[name];
            moved++;
        });
        if (!moved) return notify('移动', skipped ? '所选项目不可移动' : '没有可移动的项目', 'info');
        fs[driveOf(to)] = nodeIn(fs, driveOf(to) + ':');
        if (driveOf(from) !== driveOf(to)) fs[driveOf(from)] = nodeIn(fs, driveOf(from) + ':');
        setUserLS('filesystem', fs);
        state.sel = [];
        syncLegacy();
        fmRenderGrid();
        logTransfer('move', moved, from + ' → ' + to);
        notify('已移动', moved + ' 项' + (skipped ? '，跳过 ' + skipped + ' 项' : ''), 'success');
    }

    /* ---------------- 目录树（真实文件夹层级：展开 / 跳转 / 拖放） ---------------- */
    var treeState = { open: false, expanded: {} };

    function isFolderNode(n) {
        if (!n) return false;
        if (n.type) return n.type === 'folder' || n.type === 'drive';
        return !!n.children;
    }
    function expandTo(path) {
        if (!path || isSpecialPath(path)) return;
        var parts = String(path).split('/').filter(Boolean);
        if (!parts.length) return;
        var acc = parts.shift();
        treeState.expanded[acc] = true;
        parts.forEach(function (s) { acc += '/' + s; treeState.expanded[acc] = true; });
    }
    function treeBranchToggle(path) {
        if (!path) return;
        treeState.expanded[path] = !treeState.expanded[path];
        renderTree();
    }
    function treeRowHTML(label, node, depth, path) {
        if (!isFolderNode(node)) return '';
        var kids = Object.keys(node.children || {}).filter(function (k) { return isFolderNode(node.children[k]); });
        var open = !!treeState.expanded[path];
        var row = '<div class="fm-tree-row' + (samePath(path, fmCurrentPath) ? ' current' : '') + '"'
            + ' data-path="' + esc(path) + '" style="padding-left:' + (8 + depth * 12) + 'px">'
            + (kids.length
                ? '<button type="button" class="fm-tree-twist' + (open ? ' open' : '') + '" data-path="' + esc(path) + '"><i class="fas fa-chevron-right"></i></button>'
                : '<span class="fm-tree-twist leaf"></span>')
            + '<i class="fas ' + (open ? 'fa-folder-open' : 'fa-folder') + ' fm-tree-ico"></i>'
            + '<span class="fm-tree-name">' + esc(label) + '</span></div>';
        if (!open) return row;
        kids.forEach(function (k) { row += treeRowHTML(k, node.children[k], depth + 1, path + '/' + k); });
        return row;
    }
    function renderTree() {
        var body = document.getElementById('fmTreeBody');
        if (!body) return;
        var fs = getUserLS('filesystem') || {};
        var html = '';
        Object.keys(fs).forEach(function (d) {
            var root = fs[d];
            if (root) html += treeRowHTML(d + ':', root, 0, d + ':');
        });
        body.innerHTML = html || '<div class="fm-tree-empty">还没有可浏览的磁盘</div>';
        var cur = body.querySelector('.fm-tree-row.current');
        if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    }
    function toggleTree(force) {
        var hostEl = document.querySelector('.fm-container');
        if (!hostEl) return;
        var el = hostEl.querySelector('#fmTreePanel');
        if (!el) {
            el = document.createElement('div');
            el.id = 'fmTreePanel';
            el.className = 'fm-tree';
            el.innerHTML = '<div class="fm-tree-head"><span><i class="fas fa-sitemap"></i> 目录树</span>'
                + '<button type="button" class="fm-tree-close" title="关闭目录树"><i class="fas fa-xmark"></i></button></div>'
                + '<div class="fm-tree-body" id="fmTreeBody"></div>';
            el.querySelector('.fm-tree-close').onclick = function () { toggleTree(false); };
            var body = el.querySelector('#fmTreeBody');
            body.onclick = function (ev) {
                var twist = ev.target.closest && ev.target.closest('.fm-tree-twist');
                if (twist && twist.dataset.path) { ev.stopPropagation(); treeBranchToggle(twist.dataset.path); return; }
                var row = ev.target.closest && ev.target.closest('.fm-tree-row');
                var p = row && row.dataset.path;
                if (p && typeof fmGoTo === 'function') { fmGoTo(p); renderTree(); }
            };
            body.ondragover = function (ev) { dragOver(ev); };
            body.ondragleave = function (ev) { dragLeave(ev); };
            body.ondrop = function (ev) {
                var row = ev.target.closest && ev.target.closest('.fm-tree-row');
                dropAt(ev, row && row.dataset.path ? row.dataset.path : null);
            };
            hostEl.appendChild(el);
        }
        treeState.open = typeof force === 'boolean' ? force : !treeState.open;
        var sidebar = hostEl.querySelector('.fm-sidebar');
        if (sidebar) el.style.left = Math.round(sidebar.getBoundingClientRect().width) + 'px';
        el.classList.toggle('open', treeState.open);
        if (treeState.open) {
            expandTo(fmCurrentPath);
            renderTree();
        }
    }

    /* ---------------- 对外接口 ---------------- */
    window.n26FM = {
        onItemClick: onItemClick,
        selectSingle: selectSingle,
        selectAll: selectAll,
        clearSelection: clearSelection,
        names: names,
        hasSelection: function () { return names().length > 0; },
        selectedNames: names,
        refresh: refreshPanels,
        refreshPanels: refreshPanels,
        renderDetails: renderDetails,
        toggleDetails: toggleDetails,
        statusText: statusText,
        noteRecent: noteRecent,
        openEntry: openEntry,
        openFolder: openEntry,
        openFile: openFile,
        openSelection: openSelection,
        copyPath: copyPath,
        startRename: startRename,
        copySelection: function () { copySelection(false); },
        cutSelection: function () { copySelection(true); },
        paste: pasteClipboard,
        deleteSelection: deleteSelection,
        undoDelete: undoDelete,
        pickImport: pickImport,
        importFiles: importFiles,
        setFilter: setFilter,
        filterItems: filterItems,
        getFilter: function () { return state.filter; },
        showTransfers: showTransfers,
        logTransfer: logTransfer,
        renderHome: renderHome,
        maybeAnimateRoute: maybeAnimateRoute,
        homeHTML: homeHTML,
        isSpecialPath: isSpecialPath,
        previewCurrent: previewCurrent,
        previewFile: previewFile,
        closePreview: fmPreviewClose,
        openInEditor: openInEditor,
        beginDrag: beginDrag,
        dragOver: dragOver,
        dragLeave: dragLeave,
        dropAt: dropAt,
        crumbDrop: crumbDrop,
        endDrag: endDrag,
        moveItems: moveItems,
        toggleTree: toggleTree,
        renderTree: renderTree
    };

    /* 详情面板开合按用户上次的选择恢复 */
    try {
        var _s = readSettings();
        if (_s.fmDetailsOpen === false) { state.detailsOpen = false; state.detailsTouched = true; }
    } catch (e) { }

    document.addEventListener('keydown', handleKey, false);
    // 离线状态变化时刷新提示条
    window.addEventListener('online', function () { refreshPanels(); });
    window.addEventListener('offline', function () { refreshPanels(); });
})();
