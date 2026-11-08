/* N26 浏览器 P0 补件 —— 总纲 4.2
   落地：标签搜索、会话恢复、最近关闭、无痕、下载管理（真实字节）、阅读模式、
   三类错误页、离线提示、状态栏、快捷键，以及取自应用图标的蓝紫强调色。
   所有数据都来自真实操作与 localStorage；跨域受限的地方直接说明原因。 */
(function () {
    'use strict';

    var ACCENT = { hex: '#6366f1', rgb: '99,102,241', strong: '#4f46e5', soft: '#a5b4fc' };
    var overlay = { tabsearch: null, menu: null, reader: null };
    var sessionRestored = false;
    var persistTimer = null;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }
    function notify(title, msg, type) {
        try { showNotification(title, msg, type || 'info'); } catch (e) { }
    }
    function stateOf(winId) {
        try { return (typeof browserWindows !== 'undefined') ? browserWindows[winId] : null; } catch (e) { return null; }
    }
    function tabOf(winId) {
        var st = stateOf(winId);
        return st ? st.tabs.find(function (t) { return t.id === st.activeTab; }) : null;
    }
    function openBrowserWinIds() {
        var out = [];
        try {
            if (typeof browserWindows !== 'undefined') {
                Object.keys(browserWindows).forEach(function (k) {
                    var id = Number(k);
                    var w = windows.find(function (x) { return x.id === id; });
                    if (w) out.push(id);
                });
            }
        } catch (e) { }
        return out;
    }
    function focusedWinId() {
        var el = document.querySelector('.window.focused');
        if (!el || !el.id || el.id.indexOf('window-') !== 0) return null;
        var id = Number(el.id.slice(7));
        try {
            var w = windows.find(function (x) { return x.id === id; });
            return (w && w.appId === 'browser') ? id : null;
        } catch (e) { return null; }
    }
    function hostOf(url) {
        try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return String(url || '').slice(0, 30); }
    }

    /* ---------------- 状态栏 ---------------- */
    function refreshStatus(winId, text, loading) {
        var el = document.getElementById('browserStatus-' + winId);
        if (!el) return;
        var st = stateOf(winId);
        var count = st ? st.tabs.length : 0;
        var left = el.querySelector('.bm-status-left');
        var right = el.querySelector('.bm-status-right');
        if (right) right.textContent = count + ' 个标签';
        if (!left) return;
        if (text) {
            left.innerHTML = (loading
                ? '<i class="fas fa-circle-notch bm-spin"></i> '
                : '<i class="fas fa-check" style="opacity:.45"></i> ') + esc(text);
            el.classList.toggle('loading', !!loading);
        }
    }
    function setAccent() {
        document.querySelectorAll('.browser-container').forEach(function (c) {
            c.style.setProperty('--bm-accent', ACCENT.hex);
            c.style.setProperty('--bm-accent-rgb', ACCENT.rgb);
            c.style.setProperty('--bm-accent-strong', ACCENT.strong);
            c.style.setProperty('--bm-accent-soft', ACCENT.soft);
        });
    }

    /* ---------------- 无痕 ---------------- */
    function newPrivateTab(winId) {
        var st = stateOf(winId);
        if (!st) return;
        var id = ++st.tabIdCounter;
        st.tabs.push({ id: id, title: '无痕标签', url: '', private: true });
        st.activeTab = id;
        try { switchBrowserTab(id, winId); } catch (e) { }
    }

    /* ---------------- 最近关闭 ---------------- */
    function recordClosed(tab) {
        if (!tab || !tab.url) return;
        if (tab.private) return; // 无痕标签不能被「最近关闭」记住
        try {
            var list = getUserLS('browserClosed') || [];
            list.unshift({
                title: tab.title || tab.url,
                url: tab.url,
                hist: Array.isArray(tab.hist) ? tab.hist.slice() : [tab.url],
                histIdx: typeof tab.histIdx === 'number' ? tab.histIdx : 0,
                at: Date.now()
            });
            if (list.length > 5) list.length = 5;
            setUserLS('browserClosed', list);
        } catch (e) { }
    }
    function restoreClosed(winId, idx) {
        var list = getUserLS('browserClosed') || [];
        var item = list[idx];
        if (!item) return;
        list.splice(idx, 1);
        setUserLS('browserClosed', list);
        var st = stateOf(winId);
        if (!st) return;
        var id = ++st.tabIdCounter;
        st.tabs.push({
            id: id,
            title: item.title || item.url,
            url: item.url,
            hist: Array.isArray(item.hist) && item.hist.length ? item.hist.slice() : [item.url],
            histIdx: item.histIdx || 0
        });
        st.activeTab = id;
        try { switchBrowserTab(id, winId); } catch (e) { }
        closeTabSearch();
    }

    /* ---------------- 会话恢复 ---------------- */
    function persistSession() {
        var ids = openBrowserWinIds();
        if (!ids.length) return;
        var winId = ids[0];
        var st = stateOf(winId);
        if (!st) return;
        var tabs = [];
        var activeIndex = 0;
        st.tabs.forEach(function (t) {
            if (t.private) return;
            if (st.tabs.indexOf(t) === st.tabs.findIndex(function (x) { return x.id === st.activeTab; })) activeIndex = tabs.length;
            tabs.push({
                title: t.title || '',
                url: t.url || '',
                hist: Array.isArray(t.hist) ? t.hist.slice(-20) : [],
                histIdx: typeof t.histIdx === 'number' ? Math.min(t.histIdx, 19) : 0
            });
        });
        if (!tabs.length || !tabs.some(function (t) { return t.url; })) return;
        try {
            setUserLS('browserSession', { tabs: tabs.slice(0, 12), activeIndex: activeIndex, savedAt: Date.now() });
        } catch (e) { }
    }
    function maybeRestoreSession(st, winId) {
        if (sessionRestored) return;
        sessionRestored = true;
        try {
            if (getUserLS('browserRestoreSession') === false) return;
            var saved = getUserLS('browserSession');
            if (!saved || !Array.isArray(saved.tabs) || !saved.tabs.length) return;
            if (Date.now() - (saved.savedAt || 0) > 7 * 24 * 3600 * 1000) return;
            var restored = saved.tabs.filter(function (t) { return t.url; }).map(function (t, i) {
                var hist = Array.isArray(t.hist) && t.hist.length ? t.hist : [t.url];
                return {
                    id: i + 1,
                    title: t.title || hostOf(t.url),
                    url: t.url,
                    hist: hist,
                    histIdx: typeof t.histIdx === 'number' ? Math.min(t.histIdx, hist.length - 1) : hist.length - 1
                };
            });
            if (!restored.length) return;
            st.tabs = restored;
            st.tabIdCounter = restored.length;
            var idx = Math.min(Math.max(saved.activeIndex || 0, 0), restored.length - 1);
            st.activeTab = restored[idx].id;
        } catch (e) { }
    }

    /* ---------------- 侧栏：历史 / 书签 / 下载 ---------------- */
    function sideKey(winId) { return 'browserSideTab-' + winId; }
    function toggleSide(winId, key) {
        var side = document.getElementById('browserSide-' + winId);
        if (!side) return;
        var open = side.classList.contains('open') && (!key || window._n26bmSideKey === key);
        if (open) {
            side.classList.remove('open');
            side.setAttribute('aria-hidden', 'true');
            return;
        }
        window._n26bmSideKey = key || window._n26bmSideKey || 'history';
        renderSide(winId);
        side.classList.add('open');
        side.setAttribute('aria-hidden', 'false');
    }
    function renderSide(winId) {
        var side = document.getElementById('browserSide-' + winId);
        if (!side) return;
        var key = window._n26bmSideKey || 'history';
        var tabs = [
            { k: 'history', label: '历史' },
            { k: 'bookmarks', label: '书签' },
            { k: 'downloads', label: '下载' }
        ];
        var bodyHtml = '';
        if (key === 'history') {
            var hist = getUserLS('browser_history') || [];
            bodyHtml = hist.length ? hist.slice(0, 40).map(function (h, i) {
                return sideRow(winId, 'history', i, 'fa-clock-rotate-left', h.title || h.url, h.url);
            }).join('') : '<div class="bm-side-empty">还没有浏览记录。<br>访问任意网页后会出现在这里。</div>';
        } else if (key === 'bookmarks') {
            var bm = getUserLS('bookmarks') || [];
            bodyHtml = bm.length ? bm.map(function (b, i) {
                return sideRow(winId, 'bookmark', i, 'fa-star', b.title || b.url, b.url);
            }).join('') : '<div class="bm-side-empty">还没有书签。<br>在地址栏点星标即可收藏当前页面。</div>';
        } else {
            var dl = getUserLS('browserDownloads') || [];
            bodyHtml = dl.length ? dl.map(function (d, i) {
                var status = d.status === 'ok' ? '<span class="bm-dl-status ok">已完成</span>'
                    : d.status === 'fail' ? '<span class="bm-dl-status fail">失败</span>'
                        : '<span class="bm-dl-status run">下载中</span>';
                return '<div class="bm-side-row" title="' + esc(d.reason || d.path || d.url) + '">' +
                    '<i class="fas fa-file-arrow-down"></i>' +
                    '<div class="bm-side-main" onclick="n26BM.openDownload(' + i + ')">' +
                    '<div class="bm-side-t">' + esc(d.name) + '</div>' +
                    '<div class="bm-side-u">' + esc(d.sizeText || '') + ' · ' + new Date(d.at).toLocaleString('zh-CN', { hour12: false }) + '</div>' +
                    '</div>' + status +
                    '<button class="bm-side-del" title="从记录中移除" onclick="event.stopPropagation();n26BM.removeDownload(' + i + ')"><i class="fas fa-xmark"></i></button>' +
                    '</div>';
            }).join('') : '<div class="bm-side-empty">还没有下载记录。<br>点地址栏右边的下载按钮会尝试抓取当前页面，跨域站点会明确提示失败原因。</div>';
        }
        side.innerHTML =
            '<div class="bm-side-head"><span class="bm-side-title">侧栏</span>' +
            '<button class="bm-side-close" onclick="n26BM.toggleSide(' + winId + ')" aria-label="关闭侧栏"><i class="fas fa-xmark"></i></button></div>' +
            '<div class="bm-side-tabs">' + tabs.map(function (t) {
                return '<button class="bm-side-tab' + (t.k === key ? ' active' : '') + '" onclick="n26BM.setSideTab(' + winId + ',\'' + t.k + '\')">' + t.label + '</button>';
            }).join('') + '</div>' +
            '<div class="bm-side-body">' + bodyHtml + '</div>';
    }
    function sideRow(winId, kind, i, icon, title, url) {
        return '<div class="bm-side-row">' +
            '<i class="fas ' + icon + '"></i>' +
            '<div class="bm-side-main" onclick="n26BM.openSideItem(' + winId + ',\'' + kind + '\',' + i + ')">' +
            '<div class="bm-side-t">' + esc(title) + '</div>' +
            '<div class="bm-side-u">' + esc(url) + '</div></div>' +
            '<button class="bm-side-del" title="移除" onclick="event.stopPropagation();n26BM.removeSide(\'' + kind + '\',' + i + ',' + winId + ')"><i class="fas fa-xmark"></i></button>' +
            '</div>';
    }
    function openSideItem(winId, kind, i) {
        var store = kind === 'history' ? 'browser_history' : kind === 'bookmark' ? 'bookmarks' : 'browserDownloads';
        var item = (getUserLS(store) || [])[i];
        if (!item) return;
        if (item.url) openSideUrl(winId, item.url);
    }
    function setSideTab(winId, key) {
        window._n26bmSideKey = key;
        renderSide(winId);
    }
    function openSideUrl(winId, url) {
        try { navigateBrowser(winId, url); } catch (e) { }
    }
    function removeSide(kind, i, winId) {
        var key = kind === 'history' ? 'browser_history' : kind === 'bookmark' ? 'bookmarks' : 'browserDownloads';
        try {
            var list = getUserLS(key) || [];
            list.splice(i, 1);
            setUserLS(key, list);
        } catch (e) { }
        if (kind === 'bookmark') { try { updateBookmarkStar(winId); } catch (e) { } }
        renderSide(winId);
    }

    /* ---------------- 下载：真实抓取字节写入虚拟磁盘 ---------------- */
    function extFromType(type, url) {
        var mt = String(type || '').toLowerCase();
        if (mt.indexOf('text/html') >= 0) return '.html';
        if (mt.indexOf('text/plain') >= 0) return '.txt';
        if (mt.indexOf('application/json') >= 0) return '.json';
        if (mt.indexOf('image/png') >= 0) return '.png';
        if (mt.indexOf('image/jpeg') >= 0) return '.jpg';
        if (mt.indexOf('image/svg') >= 0) return '.svg';
        if (mt.indexOf('application/pdf') >= 0) return '.pdf';
        var m = /\.([a-z0-9]{2,5})(?:$|\?)/i.exec(url || '');
        return m ? '.' + m[1].toLowerCase() : '.bin';
    }
    function baseName(url) {
        try {
            var u = new URL(url);
            var last = decodeURIComponent((u.pathname.split('/').pop() || '').trim());
            return last || ('页面-' + u.hostname);
        } catch (e) { return '下载-' + Date.now(); }
    }
    function uniqueName(dir, name) {
        if (!dir.children[name]) return name;
        var dot = name.lastIndexOf('.');
        var stem = dot > 0 ? name.slice(0, dot) : name;
        var ext = dot > 0 ? name.slice(dot) : '';
        var i = 2;
        while (dir.children[stem + ' (' + i + ')' + ext]) i++;
        return stem + ' (' + i + ')' + ext;
    }
    function ensureDownloadDir() {
        // 虚拟磁盘是懒创建的：用户没开过文件管理时 filesystem 还不存在，
        // 这里主动跑一次主壳的初始化，否则下载会误判成 CORS 失败。
        var fs;
        try {
            fs = (typeof ensureFileSystem === 'function') ? ensureFileSystem() : getUserLS('filesystem');
        } catch (e) { fs = getUserLS('filesystem'); }
        fs = fs || {};
        if (!fs.C) return null;
        if (!fs.C.children['下载']) fs.C.children['下载'] = { type: 'folder', children: {}, createdAt: Date.now() };
        var dir = fs.C.children['下载'];
        if (!dir.children) dir.children = {};
        return { fs: fs, dir: dir };
    }
    function saveDownloadEntry(entry) {
        try {
            var list = getUserLS('browserDownloads') || [];
            list.unshift(entry);
            if (list.length > 50) list.length = 50;
            setUserLS('browserDownloads', list);
        } catch (e) { }
    }
    async function downloadCurrent(winId) {
        var tab = tabOf(winId);
        if (!tab || !tab.url) { notify('无法下载', '当前是起始页，没有可下载的内容。', 'info'); return; }
        if (!/^https?:\/\//i.test(tab.url)) { notify('无法下载', '这个地址不是网页地址，无法抓取。', 'info'); return; }
        if (!navigator.onLine) { notify('无法下载', '当前离线，下载请求不会发出。', 'warning'); return; }
        var name = uniqueName((ensureDownloadDir() || { dir: { children: {} } }).dir, baseName(tab.url));
        var entry = { name: name, url: tab.url, at: Date.now(), status: 'run', size: 0, sizeText: '正在抓取…' };
        saveDownloadEntry(entry);
        window._n26bmSideKey = 'downloads';
        if (document.getElementById('browserSide-' + winId)) {
            var side = document.getElementById('browserSide-' + winId);
            if (side.classList.contains('open')) renderSide(winId);
        }
        refreshStatus(winId, '正在下载 · ' + name, true);
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, 20000);
        try {
            var resp = await fetch(tab.url, { signal: ctrl.signal, mode: 'cors', credentials: 'omit' });
            clearTimeout(timer);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var blob = await resp.blob();
            if (!blob || blob.size === 0) throw new Error('EMPTY');
            if (blob.size > 4 * 1024 * 1024) throw new Error('TOO_BIG');
            var dataUrl = await new Promise(function (resolve, reject) {
                var fr = new FileReader();
                fr.onload = function () { resolve(String(fr.result || '')); };
                fr.onerror = function () { reject(new Error('READ_FAIL')); };
                fr.readAsDataURL(blob);
            });
            var packed = ensureDownloadDir();
            if (!packed) throw new Error('NO_FS');
            // 目录页这类没有文件名的地址，按响应类型补扩展名，否则落到磁盘后无法预览
            var ext = extFromType(blob.type, tab.url);
            var finalName = name;
            if (!/\.([a-z0-9]{2,5})$/i.test(finalName)) {
                finalName = uniqueName(packed.dir, name + ext);
            } else {
                finalName = uniqueName(packed.dir, name);
            }
            var fType = /^image\//.test(blob.type) ? 'image' : (/^text\//.test(blob.type) || /html|json/.test(blob.type) ? 'text' : 'file');
            packed.dir.children[finalName] = {
                type: 'file', fileType: fType, content: dataUrl, size: blob.size, modifiedAt: Date.now()
            };
            setUserLS('filesystem', packed.fs);
            updateLatestDownload({ name: finalName, status: 'ok', size: blob.size, sizeText: fmtBytes(blob.size), path: 'C:/下载/' + finalName });
            refreshStatus(winId, '下载完成 · ' + finalName, false);
            notify('下载完成', finalName + ' 已保存到「下载」文件夹。', 'success');
        } catch (e) {
            clearTimeout(timer);
            var reason = e && e.message === 'TOO_BIG' ? '文件超过 4MB，虚拟磁盘的本地存储模型放不下，未写入。'
                : e && e.message === 'NO_FS' ? '虚拟磁盘尚未初始化，没有可写入的 C 盘。'
                    : e && e.message === 'EMPTY' ? '服务器返回了空内容，没有可保存的文件。'
                        : e && /aborted|AbortError|Timeout/i.test(String(e)) ? '请求超时（20 秒），站点没有响应。'
                            : '该站点禁止跨域抓取（CORS）或网络不可达，浏览器拿不到文件内容。';
            updateLatestDownload({ status: 'fail', sizeText: '失败', reason: reason });
            refreshStatus(winId, '下载失败', false);
            notify('下载失败', name + '：' + reason, 'warning');
        }
        var side2 = document.getElementById('browserSide-' + winId);
        if (side2 && side2.classList.contains('open')) renderSide(winId);
    }
    function updateLatestDownload(patch) {
        try {
            var list = getUserLS('browserDownloads') || [];
            if (list[0]) {
                Object.keys(patch).forEach(function (k) { list[0][k] = patch[k]; });
                setUserLS('browserDownloads', list);
            }
        } catch (e) { }
    }
    function fmtBytes(n) {
        n = Number(n) || 0;
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1048576).toFixed(1) + ' MB';
    }
    function openDownload(i) {
        var d = (getUserLS('browserDownloads') || [])[i];
        if (!d) return;
        if (d.status !== 'ok' || !d.path) { notify('无法打开', d.reason || '这个下载没有成功写入磁盘。', 'info'); return; }
        try {
            openApp('files');
            setTimeout(function () {
                var win = windows.find(function (w) { return w.appId === 'files' && w.state !== 'minimized'; });
                if (win) {
                    if (typeof fmNavigate === 'function') fmNavigate(d.path.replace(/\/[^/]+$/, ''));
                }
            }, 700);
        } catch (e) { }
    }
    function removeDownload(i) {
        try {
            var list = getUserLS('browserDownloads') || [];
            list.splice(i, 1);
            setUserLS('browserDownloads', list);
        } catch (e) { }
        var id = focusedWinId() || openBrowserWinIds()[0];
        if (id) renderSide(id);
    }

    /* ---------------- 标签搜索 ---------------- */
    function closeTabSearch() {
        if (overlay.tabsearch) { overlay.tabsearch.remove(); overlay.tabsearch = null; }
    }
    function openTabSearch(winId) {
        closeTabSearch();
        var mask = document.createElement('div');
        mask.className = 'bm-ts-mask';
        mask.addEventListener('mousedown', function (e) { if (e.target === mask) closeTabSearch(); });
        var st = stateOf(winId);
        var rows = st ? st.tabs.map(function (t) {
            return { id: t.id, title: t.title || hostOf(t.url) || '新标签页', url: t.url || '起始页' };
        }) : [];
        mask.innerHTML = '<div class="bm-ts-card"><input class="bm-ts-input" placeholder="搜索标签页（按 Enter 切换）"><div class="bm-ts-list"></div></div>';
        document.body.appendChild(mask);
        overlay.tabsearch = mask;
        var input = mask.querySelector('.bm-ts-input');
        var list = mask.querySelector('.bm-ts-list');
        function paint(q) {
            q = String(q || '').trim().toLowerCase();
            var hit = rows.filter(function (r) { return !q || (r.title + ' ' + r.url).toLowerCase().indexOf(q) >= 0; });
            if (!hit.length) { list.innerHTML = '<div class="bm-ts-empty">没有匹配的标签。</div>'; return; }
            list.innerHTML = hit.map(function (r, i) {
                return '<div class="bm-ts-row' + (i === 0 ? ' active' : '') + '" data-id="' + r.id + '">' +
                    '<i class="fas fa-window-restore"></i><div><div class="bm-ts-t">' + esc(r.title) + '</div>' +
                    '<div class="bm-ts-u">' + esc(r.url) + '</div></div></div>';
            }).join('');
            list.querySelectorAll('.bm-ts-row').forEach(function (row) {
                row.onclick = function () {
                    var id = Number(row.dataset.id);
                    closeTabSearch();
                    try { switchBrowserTab(id, winId); } catch (e) { }
                };
            });
        }
        paint('');
        input.oninput = function () { paint(input.value); };
        input.onkeydown = function (e) {
            if (e.key === 'Escape') { closeTabSearch(); }
            else if (e.key === 'Enter') {
                var first = list.querySelector('.bm-ts-row');
                if (first) first.click();
            }
        };
        setTimeout(function () { input.focus(); }, 60);
    }

    /* ---------------- 菜单 ---------------- */
    function closeMenu() { if (overlay.menu) { overlay.menu.remove(); overlay.menu = null; } }
    function openMenu(winId, btn) {
        closeMenu();
        var pop = document.createElement('div');
        pop.className = 'bm-menu-pop';
        pop.innerHTML =
            menuItem('fa-plus', '新建标签页', 'Ctrl+T', 'n26BM.menuAction(' + winId + ',\'new\')') +
            menuItem('fa-user-secret', '新建无痕标签', '', 'n26BM.menuAction(' + winId + ',\'private\')') +
            menuItem('fa-clock-rotate-left', '恢复关闭的标签', 'Ctrl+Shift+T', 'n26BM.menuAction(' + winId + ',\'reopen\')') +
            '<div class="bm-menu-sep"></div>' +
            menuItem('fa-clock', '历史记录', 'Ctrl+H', 'n26BM.menuAction(' + winId + ',\'history\')') +
            menuItem('fa-file-arrow-down', '下载记录', 'Ctrl+J', 'n26BM.menuAction(' + winId + ',\'downloads\')') +
            menuItem('fa-star', '全部书签', '', 'n26BM.menuAction(' + winId + ',\'bookmarks\')') +
            menuItem('fa-magnifying-glass', '查找页内', 'Ctrl+F', 'n26BM.openFind(' + winId + ')') +
            menuItem('fa-book-open', '阅读模式', '', 'n26BM.menuAction(' + winId + ',\'reader\')') +
            menuItem('fa-arrow-up-right-from-square', '在系统浏览器打开当前页', '', 'n26BM.menuAction(' + winId + ',\'external\')') +
            '<div class="bm-menu-sep"></div>' +
            menuItem('fa-rotate', '恢复上次会话：' + (getUserLS('browserRestoreSession') === false ? '关' : '开'), '', 'n26BM.menuAction(' + winId + ',\'restore-toggle\')');
        document.body.appendChild(pop);
        overlay.menu = pop;
        var r = btn.getBoundingClientRect();
        pop.style.top = (r.bottom + 6) + 'px';
        pop.style.left = Math.max(8, Math.min(r.right - 190, window.innerWidth - 200)) + 'px';
        setTimeout(function () {
            document.addEventListener('mousedown', function close(e) {
                if (overlay.menu && !overlay.menu.contains(e.target)) {
                    closeMenu();
                    document.removeEventListener('mousedown', close, true);
                }
            }, true);
        }, 0);
    }
    function menuItem(icon, label, key, action) {
        return '<button class="bm-menu-item" onclick="' + action + ';n26BM.closeMenu()">' +
            '<i class="fas ' + icon + '"></i><span>' + label + '</span>' + (key ? '<small>' + key + '</small>' : '') + '</button>';
    }
    function menuAction(winId, action) {
        if (action === 'new') { try { addBrowserTab(winId); } catch (e) { } }
        else if (action === 'private') newPrivateTab(winId);
        else if (action === 'reopen') restoreClosed(winId, 0);
        else if (action === 'history') { window._n26bmSideKey = 'history'; openSide(winId); }
        else if (action === 'downloads') { window._n26bmSideKey = 'downloads'; openSide(winId); }
        else if (action === 'bookmarks') {
            try { browserOpenBookmarks(winId); } catch (e) { window._n26bmSideKey = 'bookmarks'; openSide(winId); }
        }
        else if (action === 'reader') toggleReader(winId);
        else if (action === 'external') externalOpen(winId);
        else if (action === 'restore-toggle') {
            var on = getUserLS('browserRestoreSession') !== false;
            setUserLS('browserRestoreSession', !on);
            notify('会话恢复', !on ? '下次打开浏览器会恢复本次标签。' : '已关闭；下次打开浏览器不会再恢复上次标签。', 'info');
        }
    }
    function openSide(winId) {
        var side = document.getElementById('browserSide-' + winId);
        if (!side) return;
        renderSide(winId);
        side.classList.add('open');
        side.setAttribute('aria-hidden', 'false');
    }

    /* ---------------- 阅读模式 ---------------- */
    function closeReader() { if (overlay.reader) { overlay.reader.remove(); overlay.reader = null; } }
    function toggleReader(winId) {
        if (overlay.reader) { closeReader(); return; }
        var iframe = document.getElementById('browserIframe-' + winId);
        var title = '';
        var text = '';
        if (iframe) {
            try {
                var doc = iframe.contentDocument || (iframe.contentWindow ? iframe.contentWindow.document : null);
                if (!doc || !doc.body) throw new Error('NO_DOC');
                title = doc.title || hostOf(tabOf(winId) && tabOf(winId).url);
                text = doc.body.innerText || '';
            } catch (e) {
                notify('阅读模式不可用', '该站点禁止跨域读取内容，浏览器拿不到正文。请直接在原页面阅读。', 'info');
                return;
            }
        } else {
            var nt = document.getElementById('browserNewTab-' + winId) || document.getElementById('browserIframeContainer-' + winId);
            if (nt) { text = nt.innerText || ''; title = 'Nexus 起始页'; }
        }
        text = String(text || '').replace(/\n{3,}/g, '\n\n').trim();
        if (!text) {
            notify('阅读模式不可用', '当前页面没有可提取的正文（可能是空白页、纯图形页或被拦截的页面）。', 'info');
            return;
        }
        if (text.length > 60000) text = text.slice(0, 60000) + '\n\n…（内容过长，已截断展示）';
        var mask = document.createElement('div');
        mask.className = 'bm-reader-mask';
        mask.innerHTML = '<div class="bm-reader-card">' +
            '<div class="bm-reader-head"><span>' + esc(title) + '</span>' +
            '<div class="bm-reader-tools"><button title="缩小字号" onclick="n26BM.readerFont(-1)">A-</button>' +
            '<button title="放大字号" onclick="n26BM.readerFont(1)">A+</button>' +
            '<button title="关闭" onclick="n26BM.closeReader()"><i class="fas fa-xmark"></i></button></div></div>' +
            '<div class="bm-reader-body">' + esc(text) + '</div></div>';
        document.body.appendChild(mask);
        overlay.reader = mask;
        mask.addEventListener('mousedown', function (e) { if (e.target === mask) closeReader(); });
    }
    function readerFont(delta) {
        var body = document.querySelector('.bm-reader-body');
        if (!body) return;
        var cur = parseInt(body.style.fontSize || '14', 10) || 14;
        body.style.fontSize = Math.max(11, Math.min(20, cur + delta)) + 'px';
    }

    /* ---------------- 错误页：三类，各有可执行动作 ---------------- */
    function classify(url) {
        if (!navigator.onLine) return 'offline';
        if (!/^https?:\/\//i.test(String(url || ''))) return 'invalid';
        return 'xfo';
    }
    function errCard(kind, url, winId) {
        var host = hostOf(url);
        var cfg = {
            offline: { cls: 'bm-err-offline', icon: 'fa-wifi', title: '当前离线', desc: '网络请求不会发出。已加载的页面仍然可以查看。' },
            invalid: { cls: 'bm-err-invalid', icon: 'fa-link-slash', title: '地址无效', desc: '只支持 http/https 地址；其他协议无法在浏览器内打开。' },
            xfo: { cls: 'bm-err-xfo', icon: 'fa-shield-halved', title: '该站点禁止被嵌入', desc: '对方设置了 X-Frame-Options / CSP，或根本不允许被 iframe 打开。' },
            net: { cls: 'bm-err-net', icon: 'fa-plug-circle-xmark', title: '无法连接到站点', desc: '域名不可达或连接超时，请检查地址拼写和网络。' },
            cert: { cls: 'bm-err-cert', icon: 'fa-certificate', title: 'HTTPS 证书有问题', desc: '该站点的证书可能已过期、域名不匹配，或不被信任（也可能是 HTTPS 被中间设备拦截）。为安全起见，浏览器没有继续加载。' }
        }[kind];
        var actions = '';
        if (kind === 'offline') {
            actions = '<button class="bm-error-btn primary" onclick="n26BM.retry(' + winId + ')">重新加载</button>' +
                '<button class="bm-error-btn" onclick="browserGoHome(' + winId + ')">回到起始页</button>';
        } else if (kind === 'invalid') {
            actions = '<button class="bm-error-btn primary" onclick="n26BM.searchFor(' + winId + ',\'' + esc(url).replace(/'/g, '') + '\')">用搜索打开</button>' +
                '<button class="bm-error-btn" onclick="browserGoHome(' + winId + ')">回到起始页</button>';
        } else if (kind === 'net') {
            actions = '<button class="bm-error-btn primary" onclick="n26BM.retry(' + winId + ')">重试</button>' +
                '<button class="bm-error-btn" onclick="browserGoHome(' + winId + ')">回到起始页</button>';
        } else if (kind === 'cert') {
            actions = '<button class="bm-error-btn primary" onclick="n26BM.insecure(' + winId + ')">改用 HTTP（不安全）</button>' +
                '<button class="bm-error-btn" onclick="n26BM.retry(' + winId + ')">重试</button>' +
                '<button class="bm-error-btn" onclick="window.open(\'' + esc(url).replace(/'/g, '') + '\',\'_blank\',\'noopener\')">在系统浏览器打开</button>' +
                '<button class="bm-error-btn" onclick="browserGoHome(' + winId + ')">回到起始页</button>';
        } else {
            actions = '<button class="bm-error-btn primary" onclick="window.open(\'' + esc(url).replace(/'/g, '') + '\',\'_blank\',\'noopener\')">在系统浏览器打开</button>' +
                '<button class="bm-error-btn" onclick="n26BM.copyUrl(' + winId + ')">复制地址</button>' +
                '<button class="bm-error-btn" onclick="browserGoHome(' + winId + ')">回到起始页</button>';
        }
        return '<div class="bm-error ' + cfg.cls + '"><div class="bm-error-card">' +
            '<div class="bm-error-icon"><i class="fas ' + cfg.icon + '"></i></div>' +
            '<h4>' + cfg.title + '</h4>' +
            '<p>' + cfg.desc + '<br>' + esc(host) + '</p>' +
            '<div class="bm-error-actions">' + actions + '</div></div></div>';
    }
    function showBrowserError(winId, url, container) {
        container = container || document.getElementById('browserIframeContainer-' + winId);
        if (!container) return;
        var kind = classify(url);
        container.innerHTML = '<div class="browser-load-bar" id="browserLoadBar-' + winId + '" style="width:0%"></div>' + errCard(kind, url, winId);
        refreshStatus(winId, kind === 'offline' ? '加载失败 · 离线' : '加载失败', false);
        if (kind === 'xfo') {
            // 能发 no-cors 探测到就是「可达但禁止嵌入」；探测失败再把错误升级成网络不可达
            var ctrl = new AbortController();
            var t = setTimeout(function () { ctrl.abort(); }, 6000);
            fetch(url, { mode: 'no-cors', signal: ctrl.signal }).then(function () {
                clearTimeout(t);
            }).catch(function () {
                clearTimeout(t);
                if (kind === 'xfo') {
                    var c = document.getElementById('browserIframeContainer-' + winId);
                    if (!c || !c.querySelector('.bm-err-xfo')) return;
                    // HTTPS 失败但同域 HTTP 可达：更像证书/加密连接问题
                    probeHttpAlternative(url, function (httpOk) {
                        var cc = document.getElementById('browserIframeContainer-' + winId);
                        if (!cc || !cc.querySelector('.bm-err-xfo')) return;
                        cc.innerHTML = '<div class="browser-load-bar" id="browserLoadBar-' + winId + '" style="width:0%"></div>' +
                            errCard(httpOk ? 'cert' : 'net', url, winId);
                    });
                }
            });
        }
    }
    function retry(winId) {
        try { browserRefresh(winId); } catch (e) { }
    }
    function insecure(winId) {
        var t = tabOf(winId);
        if (!t || !t.url) return;
        var alt = String(t.url).replace(/^https:/i, 'http:');
        var addr = document.getElementById('browserAddr-' + winId);
        if (addr) addr.value = alt;
        try { loadBrowserUrl(winId); } catch (e) { }
        notify('已改用 HTTP', '本次连接不加密，请勿在该页面输入密码等敏感信息。', 'warning');
    }
    function searchFor(winId, addr) {
        try { searchNewTab(winId, addr); } catch (e) { }
    }
    function copyUrl(winId) {
        var t = tabOf(winId);
        if (!t || !t.url) return;
        try {
            navigator.clipboard.writeText(t.url);
            notify('已复制', '地址已复制到剪贴板。', 'success');
        } catch (e) { notify('复制失败', '浏览器没有剪贴板权限。', 'warning'); }
    }
    function externalOpen(winId) {
        var t = tabOf(winId);
        if (!t || !t.url) { notify('无法打开', '当前是起始页，没有可打开的地址。', 'info'); return; }
        var w = window.open(t.url, '_blank', 'noopener');
        if (!w) notify('被拦截', '系统拦截了弹出窗口，请允许弹窗后重试。', 'warning');
    }

    /* 跨域站点无法从父页面读取 contentDocument（浏览器安全模型），
       唯一可用的真实信号是「能不能连上」。连不上就换成网络错误卡；
       能连上但对方拒绝嵌入（XFO）的情况无法探测，交给菜单里的「外部打开」兜底。 */
    function probeReachable(winId, url, container) {
        if (!/^https?:/i.test(url)) return;
        var cross = true;
        try { cross = new URL(url).origin !== location.origin; } catch (e) { return; }
        if (!cross) return; // 同源由主壳的空白页检测负责
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, 8000);
        fetch(url, { mode: 'no-cors', signal: ctrl.signal, cache: 'no-store' }).then(function () {
            clearTimeout(timer);
        }).catch(function () {
            clearTimeout(timer);
            if (!navigator.onLine) return;
            var tab = tabOf(winId);
            if (!tab || tab.url !== url) return;           // 用户已经切走
            if (!container || !container.querySelector('iframe')) return; // 已有错误卡
            container.innerHTML = '<div class="browser-load-bar" id="browserLoadBar-' + winId + '" style="width:0%"></div>' + errCard('net', url, winId);
            refreshStatus(winId, '无法连接到站点', false);
        });
    }

    /* ---------------- 首屏快讯（默认收起） ---------------- */
    function toggleNews(btn) {
        var card = btn.closest('.bm-news');
        if (!card) return;
        card.classList.toggle('open');
    }

    /* ---------------- 离线提示 ---------------- */
    function refreshOfflineBanners() {
        document.querySelectorAll('.bm-offline-bar').forEach(function (el) {
            el.style.display = navigator.onLine ? 'none' : 'flex';
            el.style.alignItems = 'center';
            el.style.gap = '6px';
        });
    }

    /* ---------------- 快捷键 ---------------- */
    function isTyping(t) {
        if (!t) return false;
        var tag = (t.tagName || '').toUpperCase();
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
    }
    function onKeydown(e) {
        // 先让浮层吃掉 Esc
        if (e.key === 'Escape') {
            if (overlay.reader) { e.preventDefault(); closeReader(); return; }
            if (overlay.tabsearch) { e.preventDefault(); closeTabSearch(); return; }
            if (overlay.menu) { e.preventDefault(); closeMenu(); return; }
            if (overlay.ctx) { e.preventDefault(); closeCtx(); return; }
        }
        var winId = focusedWinId();
        if (!winId) return;
        if (e.key === 'Escape') {
            var findEl = document.getElementById('window-content-' + winId);
            if (findEl && findEl.querySelector('.bm-find')) { e.preventDefault(); closeFind(winId); return; }
        }
        var mod = e.ctrlKey || e.metaKey;
        var key = e.key;
        var typing = isTyping(e.target);
        if (mod && !e.shiftKey && key.toLowerCase() === 'f') {
            e.preventDefault(); openFind(winId); return;
        }
        if (mod && !e.shiftKey && key.toLowerCase() === 't') {
            e.preventDefault(); addBrowserTab(winId); return;
        }
        if (mod && !e.shiftKey && key.toLowerCase() === 'w') {
            e.preventDefault();
            var st = stateOf(winId);
            if (st && st.tabs.length > 1) closeBrowserTab(st.activeTab, winId);
            else {
                try {
                    var w = windows.find(function (x) { return x.id === winId; });
                    if (w) closeWindow(winId);
                } catch (err) { }
            }
            return;
        }
        if (mod && e.shiftKey && key.toLowerCase() === 't') {
            e.preventDefault(); restoreClosed(winId, 0); return;
        }
        if (mod && key.toLowerCase() === 'l') {
            e.preventDefault();
            var addr = document.getElementById('browserAddr-' + winId);
            if (addr) { addr.focus(); addr.select(); }
            return;
        }
        if (mod && key.toLowerCase() === 'd') {
            e.preventDefault(); toggleBookmark(winId); return;
        }
        if (mod && key.toLowerCase() === 'j') {
            e.preventDefault(); window._n26bmSideKey = 'downloads'; openSide(winId); return;
        }
        if (mod && key.toLowerCase() === 'h') {
            e.preventDefault(); window._n26bmSideKey = 'history'; openSide(winId); return;
        }
        if (mod && e.shiftKey && key.toLowerCase() === 'a') {
            e.preventDefault(); openTabSearch(winId); return;
        }
        if (mod && e.shiftKey && key.toLowerCase() === 'r') {
            e.preventDefault(); browserRefresh(winId); return;
        }
        if (e.altKey && key === 'ArrowLeft') { e.preventDefault(); browserGoBack(winId); return; }
        if (e.altKey && key === 'ArrowRight') { e.preventDefault(); browserGoForward(winId); return; }
        if (!typing) {
            if (key === 'F5') { e.preventDefault(); browserRefresh(winId); return; }
            if (key === 'F6') { e.preventDefault(); document.getElementById('browserAddr-' + winId)?.focus(); return; }
        }
        if (!typing && (key === 'PageDown' || key === 'PageUp') && document.getElementById('browserIframe-' + winId)) {
            // 交给 iframe 自己处理；这里不抢
        }
    }

    /* ---------------- 安装：包装主壳函数 ---------------- */
    function install() {
        if (typeof ensureBrowserWindow !== 'function') return;

        var origEnsure = window.ensureBrowserWindow;
        if (!origEnsure.__n26bm) {
            var wrappedEnsure = function (winId) {
                var st = origEnsure.apply(this, arguments);
                if (st && !st.__n26bmRestored) {
                    st.__n26bmRestored = true;
                    if (typeof maybeRestoreSession === 'function') maybeRestoreSession(st, winId);
                    setAccent();
                }
                return st;
            };
            wrappedEnsure.__n26bm = true;
            window.ensureBrowserWindow = wrappedEnsure;
        }

        var origShow = window.showBrowserError;
        if (origShow && !origShow.__n26bm) {
            var baseShow = origShow.__orig || origShow;
            var wrappedShow = function (winId, url, container) {
                return baseShow.apply(this, arguments);
            };
            wrappedShow.__n26bm = true;
            wrappedShow.__orig = baseShow;
            window.showBrowserError = wrappedShow;
        }

        var origAttach = window.attachIframeErrorHandler;
        if (origAttach && !origAttach.__n26bm) {
            var baseAttach = origAttach.__orig || origAttach;
            var wrappedAttach = function (winId, url) {
                refreshStatus(winId, '加载中 · ' + hostOf(url), true);
                var r = baseAttach.apply(this, arguments);
                var iframe = document.getElementById('browserIframe-' + winId);
                if (iframe) {
                    iframe.addEventListener('load', function () {
                        var bar = document.getElementById('browserLoadBar-' + winId);
                        if (bar) bar.style.width = '100%';
                        setTimeout(function () {
                            if (bar) bar.style.width = '0%';
                        }, 300);
                        refreshStatus(winId, '已加载 · ' + hostOf(url), false);
                        probeReachable(winId, url, document.getElementById('browserIframeContainer-' + winId));
                    });
                }
                return r;
            };
            wrappedAttach.__n26bm = true;
            wrappedAttach.__orig = baseAttach;
            window.attachIframeErrorHandler = wrappedAttach;
        }

        // 地址栏里出现明确不支持的协议（ftp:/file:/javascript: 等）时，
        // 主壳会把它当成搜索词送进必应；这里先拦成「地址无效」错误页，免得静默跳到搜索。
        var origLoad = window.loadBrowserUrl;
        if (origLoad && !origLoad.__n26bm) {
            var wrappedLoad = function (winId) {
                var addr = document.getElementById('browserAddr-' + winId);
                var raw = addr ? String(addr.value || '').trim() : '';
                if (!navigator.onLine && /^https?:\/\//i.test(raw)) {
                    var tab = tabOf(winId);
                    if (tab) { tab.url = raw; tab.title = raw; }
                    showBrowserError(winId, raw, null);
                    refreshStatus(winId, '加载失败 · 离线', false);
                    return;
                }
                if (raw && /^(ftp|file|mailto|javascript|data|blob|chrome|edge|about|nex|res|view-source):/i.test(raw)) {
                    var tb = tabOf(winId);
                    if (tb) { tb.url = raw; tb.title = raw; }
                    showBrowserError(winId, raw, null);
                    refreshStatus(winId, '地址无效', false);
                    return;
                }
                return origLoad.apply(this, arguments);
            };
            wrappedLoad.__n26bm = true;
            window.loadBrowserUrl = wrappedLoad;
        }

        var origClose = window.closeBrowserTab;
        if (origClose && !origClose.__n26bm) {
            var wrappedClose = function (id, winId) {
                var st = stateOf(winId);
                var tab = st ? st.tabs.find(function (t) { return t.id === id; }) : null;
                if (st && st.tabs.length > 1) recordClosed(tab);
                var r = origClose.apply(this, arguments);
                refreshStatus(winId, null, false);
                paintBookmarkBar(winId);
                return r;
            };
            wrappedClose.__n26bm = true;
            window.closeBrowserTab = wrappedClose;
        }

        ['addBrowserTab', 'switchBrowserTab'].forEach(function (name) {
            var orig = window[name];
            if (!orig || orig.__n26bm) return;
            var wrapped = function (a, b) {
                var r = orig.apply(this, arguments);
                var winId = name === 'addBrowserTab' ? a : b;
                refreshStatus(winId, null, false);
                paintBookmarkBar(winId);
                bindAddrSuggest(winId);
                if (name === 'addBrowserTab') {
                    setTimeout(function () {
                        var input = document.getElementById('browserSearchInput-' + winId);
                        if (input) input.focus();
                    }, 200);
                }
                return r;
            };
            wrapped.__n26bm = true;
            window[name] = wrapped;
        });

        // renderBrowser(content, winId)：每次重建 UI 后补书签栏与地址补全
        var origRender = window.renderBrowser;
        if (origRender && !origRender.__n26bmExtra) {
            var wrappedRender = function (content, winId) {
                var r = origRender.apply(this, arguments);
                var id = arguments.length > 1 ? arguments[1] : 0;
                paintBookmarkBar(id);
                bindAddrSuggest(id);
                return r;
            };
            wrappedRender.__n26bmExtra = true;
            window.renderBrowser = wrappedRender;
        }

        // 导航入口也补一次标题同步（不依赖 iframe 错误处理函数的暴露方式）
        ['navigateBrowser', 'loadBrowserUrl'].forEach(function (name) {
            var origNav = window[name];
            if (!origNav || origNav.__n26bmNav) return;
            var wrappedNav = function (winId) {
                var r = origNav.apply(this, arguments);
                [700, 1400, 2400, 3800].forEach(function (ms) {
                    setTimeout(function () { syncTabTitle(winId); }, ms);
                });
                return r;
            };
            wrappedNav.__n26bmNav = true;
            window[name] = wrappedNav;
        });

        // 同源页面的真实标题同步到标签/书签栏
        var origAttach = window.attachIframeErrorHandler;
        if (origAttach && !origAttach.__n26bm) {
            var wrappedAttach = function (winId, url) {
                var r = origAttach.apply(this, arguments);
                var f = document.getElementById('browserIframe-' + winId);
                if (f && !f.__n26bmTitle) {
                    f.__n26bmTitle = true;
                    f.addEventListener('load', function () {
                        setTimeout(function () { syncTabTitle(winId); }, 60);
                    });
                }
                setTimeout(function () { syncTabTitle(winId); }, 160);
                return r;
            };
            wrappedAttach.__n26bm = true;
            window.attachIframeErrorHandler = wrappedAttach;
        }

        // 书签栏高亮跟随页面切换
        var origToggleBm = window.toggleBookmark;
        if (origToggleBm && !origToggleBm.__n26bm) {
            var wrappedToggleBm = function (winId) {
                var r = origToggleBm.apply(this, arguments);
                paintBookmarkBar(winId);
                return r;
            };
            wrappedToggleBm.__n26bm = true;
            window.toggleBookmark = wrappedToggleBm;
        }

        // 浏览器区域右键：标签 / 书签 / 内容三种菜单
        document.addEventListener('contextmenu', function (e) {
            var container = e.target && e.target.closest ? e.target.closest('.browser-container') : null;
            if (!container) return;
            if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
            var winEl = container.closest('.window');
            if (!winEl) return;
            var winId = Number(String(winEl.id || '').replace('window-', ''));
            if (!winId) return;
            e.preventDefault();
            var tabEl = e.target.closest('.browser-tab');
            var bmEl = e.target.closest('.bm-bm-item');
            if (tabEl) { openCtx(winId, e.clientX, e.clientY, 'tab', Number(tabEl.dataset.tabId)); return; }
            if (bmEl) { openCtx(winId, e.clientX, e.clientY, 'bookmark', Number(bmEl.dataset.bmIdx)); return; }
            if (e.target.closest('.browser-iframe-container, .browser-newtab-wrapper, .browser-newtab')) {
                openCtx(winId, e.clientX, e.clientY, 'content');
            }
        });

        window.addEventListener('online', refreshOfflineBanners);
        window.addEventListener('offline', refreshOfflineBanners);
        refreshOfflineBanners();

        document.addEventListener('keydown', onKeydown, true);
        if (persistTimer) clearInterval(persistTimer);
        persistTimer = setInterval(persistSession, 1800);
        window.addEventListener('pagehide', persistSession);
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') persistSession(); });
    }

    /* ---------------- 书签栏（常驻，像真浏览器） ---------------- */
    function paintBookmarkBar(winId) {
        var winEl = document.getElementById('window-content-' + winId);
        if (!winEl) return;
        var container = winEl.querySelector('.browser-container');
        if (!container) return;
        var bar = container.querySelector('.bm-bmbar');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'bm-bmbar';
            var addr = container.querySelector('.browser-addressbar');
            var tabs = container.querySelector('.browser-tabs');
            if (addr && addr.parentNode) addr.parentNode.insertBefore(bar, addr.nextSibling);
            else if (tabs && tabs.parentNode) tabs.parentNode.insertBefore(bar, tabs.nextSibling);
            else return;
        }
        var bms = getUserLS('bookmarks') || [];
        var tab = tabOf(winId);
        var activeUrl = tab && tab.url;
        var html = '';
        if (!bms.length) {
            html = '<span class="bm-bm-hint"><i class="fas fa-star" aria-hidden="true"></i>' +
                '书签栏：打开网页后点地址栏右侧的星标收藏</span>';
        } else {
            html = bms.map(function (b, i) {
                return '<button class="bm-bm-item' + (b.url === activeUrl ? ' active' : '') + '"' +
                    ' data-bm-idx="' + i + '" title="' + esc(b.url) + '"' +
                    ' onclick="n26BM.openBm(' + winId + ',' + i + ')">' +
                    '<i class="fas fa-star" aria-hidden="true"></i><span>' + esc(b.title || hostOf(b.url)) + '</span></button>';
            }).join('');
        }
        html += '<button class="bm-bm-add" title="收藏 / 取消收藏当前页（Ctrl+D）" onclick="n26BM.bookmarkCurrent(' + winId + ')">' +
            '<i class="fas fa-plus" aria-hidden="true"></i><span>收藏</span></button>' +
            '<button class="bm-bm-manage" title="管理全部书签" aria-label="管理全部书签" onclick="n26BM.manageBookmarks(' + winId + ')">' +
            '<i class="fas fa-ellipsis-vertical" aria-hidden="true"></i></button>';
        bar.innerHTML = html;
    }

    // 同源页面加载后把真实 <title> 同步到标签与书签，而不是一直显示 URL
    function syncTabTitle(winId) {
        var f = document.getElementById('browserIframe-' + winId);
        if (!f) return;
        var title = '';
        try {
            var d = f.contentDocument;
            if (d && d.title) title = String(d.title).trim();
        } catch (e) { return; }
        if (!title) return;
        var tab = tabOf(winId);
        if (!tab || !tab.url) return;
        if (tab.url !== f.src) return;
        if (tab.title !== title) {
            tab.title = title;
            try { renderBrowserTabs(winId); } catch (e) { }
            paintBookmarkBar(winId);
        }
    }

    /* ---------------- 地址栏：历史 + 书签补全 ---------------- */
    function addrMatches(q) {
        var out = [];
        var hist = getUserLS('browser_history') || [];
        var bms = getUserLS('bookmarks') || [];
        var ql = String(q || '').trim().toLowerCase();
        function hit(t) { return !ql || String(t || '').toLowerCase().indexOf(ql) >= 0; }
        if (ql) {
            var isUrl = /^https?:\/\//i.test(q) || (/^[\w-]+(\.[\w-]+)+/.test(q) && q.indexOf(' ') === -1);
            if (isUrl) {
                var full = /^https?:\/\//i.test(q) ? q : 'https://' + q;
                out.push({ icon: 'fa-globe', title: full, sub: '直接访问', url: full });
            }
            out.push({ icon: 'fa-magnifying-glass', title: '搜索“' + q + '”', sub: '必应搜索', url: 'https://www.bing.com/search?q=' + encodeURIComponent(q) });
            hist.forEach(function (h) {
                if (h && hit(h.title) || (h && hit(h.url))) out.push({ icon: 'fa-clock-rotate-left', title: h.title || hostOf(h.url), sub: h.url, url: h.url });
            });
            bms.forEach(function (b) {
                if (hit(b.title) || hit(b.url)) out.push({ icon: 'fa-star', title: b.title || hostOf(b.url), sub: b.url, url: b.url });
            });
        } else {
            hist.slice(0, 6).forEach(function (h) {
                out.push({ icon: 'fa-clock-rotate-left', title: h.title || hostOf(h.url), sub: h.url, url: h.url });
            });
            bms.slice(0, 4).forEach(function (b) {
                out.push({ icon: 'fa-star', title: b.title || hostOf(b.url), sub: b.url, url: b.url });
            });
        }
        var seen = {};
        return out.filter(function (r) {
            if (!r.url || seen[r.url]) return false;
            seen[r.url] = true;
            return true;
        }).slice(0, 9);
    }

    function bindAddrSuggest(winId) {
        var input = document.getElementById('browserAddr-' + winId);
        if (!input || input.__n26bmAddr) return;
        var bar = input.closest ? input.closest('.browser-addressbar') : null;
        if (!bar) return;
        input.__n26bmAddr = true;
        input.setAttribute('autocomplete', 'off');
        var pop = document.createElement('div');
        pop.className = 'bm-addr-pop';
        pop.id = 'bmAddrPop-' + winId;
        bar.appendChild(pop);
        var rows = [];
        var cur = -1;
        function close() { pop.classList.remove('show'); cur = -1; }
        function choose(i) {
            var r = rows[i];
            if (!r || !r.url) return;
            input.value = r.url;
            close();
            try { loadBrowserUrl(winId); } catch (e) { }
        }
        function active(i) {
            var els = pop.querySelectorAll('.bm-addr-row');
            for (var k = 0; k < els.length; k++) els[k].classList.toggle('active', k === i);
        }
        function paint() {
            rows = addrMatches(input.value.trim());
            if (!rows.length) { close(); return; }
            pop.innerHTML = rows.map(function (r, i) {
                return '<div class="bm-addr-row" data-i="' + i + '">' +
                    '<i class="fas ' + r.icon + '" aria-hidden="true"></i>' +
                    '<span class="bm-addr-t">' + esc(r.title) + '</span>' +
                    '<small class="bm-addr-s">' + esc(r.sub) + '</small></div>';
            }).join('');
            for (var i = 0; i < pop.children.length; i++) {
                (function (idx) {
                    pop.children[idx].addEventListener('mousedown', function (e) {
                        e.preventDefault(); e.stopPropagation(); choose(idx);
                    });
                })(i);
            }
            cur = -1;
            pop.classList.add('show');
        }
        input.addEventListener('focus', paint);
        input.addEventListener('input', paint);
        input.addEventListener('blur', function () { setTimeout(close, 120); });
        input.addEventListener('keydown', function (e) {
            if (!pop.classList.contains('show')) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault(); e.stopImmediatePropagation();
                cur = e.key === 'ArrowDown' ? Math.min(cur + 1, rows.length - 1) : Math.max(cur - 1, 0);
                active(cur);
                if (rows[cur]) input.value = rows[cur].url;
            } else if (e.key === 'Enter') {
                if (rows.length) {
                    e.preventDefault(); e.stopImmediatePropagation();
                    choose(cur >= 0 ? cur : 0);
                }
            } else if (e.key === 'Escape') {
                e.stopImmediatePropagation(); close();
            }
        }, true);
    }

    /* ---------------- 页内查找 ---------------- */
    function closeFind(winId) {
        var winEl = document.getElementById('window-content-' + winId);
        var bar = winEl && winEl.querySelector('.bm-find');
        if (bar) bar.remove();
        clearFindHighlights(winId);
    }
    function findDoc(winId) {
        var iframe = document.getElementById('browserIframe-' + winId);
        if (!iframe) return null;
        try { return iframe.contentDocument || null; } catch (e) { return null; }
    }
    function clearFindHighlights(winId) {
        var d = findDoc(winId);
        if (!d) return;
        var marks = d.querySelectorAll('mark.n26-find-hit');
        for (var i = marks.length - 1; i >= 0; i--) {
            var m = marks[i], p = m.parentNode;
            if (p) {
                p.replaceChild(d.createTextNode(m.textContent), m);
                p.normalize();
            }
        }
        var st = d.getElementById('n26-find-style');
        if (st) st.remove();
    }
    function paintFindHits(winId, q) {
        var d = findDoc(winId);
        if (!d || !d.body || !q) return { total: 0, marks: [] };
        clearFindHighlights(winId);
        var style = d.createElement('style');
        style.id = 'n26-find-style';
        style.textContent = 'mark.n26-find-hit{background:#fde047!important;color:#111!important;border-radius:2px;padding:0 1px;box-shadow:0 0 0 1px rgba(0,0,0,.08)}' +
            'mark.n26-find-hit.current{background:#fb923c!important;box-shadow:0 0 0 2px rgba(251,146,60,.55)}';
        (d.head || d.body).appendChild(style);
        var needle = String(q).toLowerCase();
        var nodes = [];
        var walker = d.createTreeWalker(d.body, 4 /* SHOW_TEXT */, {
            acceptNode: function (n) {
                if (!n.nodeValue || !n.nodeValue.trim()) return 2; // REJECT
                var p = n.parentElement;
                if (p && /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT)$/.test(p.tagName)) return 2;
                return 1; // ACCEPT
            }
        });
        var node;
        while ((node = walker.nextNode())) nodes.push(node);
        var marks = [];
        nodes.forEach(function (node) {
            var text = node.nodeValue || '';
            var low = text.toLowerCase();
            var starts = [], from = 0, at;
            while ((at = low.indexOf(needle, from)) >= 0) {
                starts.push(at);
                from = at + needle.length;
            }
            if (!starts.length) return;
            var frag = d.createDocumentFragment();
            var last = 0;
            starts.forEach(function (st) {
                if (st > last) frag.appendChild(d.createTextNode(text.slice(last, st)));
                var mark = d.createElement('mark');
                mark.className = 'n26-find-hit';
                mark.textContent = text.slice(st, st + needle.length);
                frag.appendChild(mark);
                marks.push(mark);
                last = st + needle.length;
            });
            if (last < text.length) frag.appendChild(d.createTextNode(text.slice(last)));
            node.parentNode.replaceChild(frag, node);
        });
        return { total: marks.length, marks: marks };
    }

    function openFind(winId) {
        var winEl = document.getElementById('window-content-' + winId);
        if (!winEl) return;
        var body = winEl.querySelector('.browser-body');
        if (!body) return;
        var old = body.querySelector('.bm-find');
        if (old) { var oi = old.querySelector('input'); if (oi) oi.focus(); return; }
        var iframe = document.getElementById('browserIframe-' + winId);
        var same = false;
        if (iframe) {
            try { same = !!iframe.contentDocument; } catch (e) { same = false; }
        }
        var bar = document.createElement('div');
        bar.className = 'bm-find';
        bar.innerHTML = '<i class="fas fa-magnifying-glass" aria-hidden="true"></i>' +
            '<input type="search" placeholder="在页面中查找" aria-label="页内查找" autocomplete="off" spellcheck="false">' +
            '<span class="bm-find-count" aria-live="polite">' + (iframe ? (same ? '输入关键字' : '跨源页面') : '起始页无内容') + '</span>' +
            '<button class="bm-find-btn prev" title="上一个 (Shift+Enter)" aria-label="上一个"><i class="fas fa-chevron-up" aria-hidden="true"></i></button>' +
            '<button class="bm-find-btn next" title="下一个 (Enter)" aria-label="下一个"><i class="fas fa-chevron-down" aria-hidden="true"></i></button>' +
            '<button class="bm-find-btn close" title="关闭 (Esc)" aria-label="关闭查找"><i class="fas fa-xmark" aria-hidden="true"></i></button>';
        body.appendChild(bar);
        var input = bar.querySelector('input');
        var count = bar.querySelector('.bm-find-count');
        if (!iframe || !same) {
            input.disabled = true;
            count.innerHTML = iframe
                ? '跨源页面不允许读取正文，页内查找不可用 <button class="bm-find-reader" type="button">阅读模式</button>'
                : '起始页没有可查找的正文';
            var reader = bar.querySelector('.bm-find-reader');
            if (reader) reader.addEventListener('click', function () { closeFind(winId); toggleReader(winId); });
            bar.querySelector('.close').addEventListener('click', function () { closeFind(winId); });
            return;
        }
        var timer = 0;
        var cursor = -1;
        var lastQuery = '';
        function focusHit(marks, idx) {
            for (var i = 0; i < marks.length; i++) marks[i].classList.toggle('current', i === idx);
            var cur = marks[idx];
            if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
        function run(back) {
            var q = String(input.value || '');
            if (!q) {
                clearFindHighlights(winId);
                cursor = -1; lastQuery = '';
                count.textContent = '输入关键字';
                return;
            }
            var marks;
            var same = (q === lastQuery && cursor >= 0);
            if (same) {
                var d = findDoc(winId);
                marks = d ? Array.prototype.slice.call(d.querySelectorAll('mark.n26-find-hit')) : [];
            } else {
                var res = paintFindHits(winId, q);
                marks = res.marks;
                cursor = 0;
                lastQuery = q;
            }
            if (!marks.length) { count.textContent = '没有匹配'; cursor = -1; return; }
            if (back) cursor = (cursor - 1 + marks.length) % marks.length;
            else if (same) cursor = (cursor + 1) % marks.length;
            focusHit(marks, cursor);
            count.textContent = '第 ' + (cursor + 1) + ' / ' + marks.length + ' 处';
        }
        input.addEventListener('input', function () {
            cursor = -1;
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () { run(false); }, 180);
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); run(e.shiftKey); }
            else if (e.key === 'Escape') { e.preventDefault(); closeFind(winId); }
        });
        bar.querySelector('.next').addEventListener('click', function () { run(false); });
        bar.querySelector('.prev').addEventListener('click', function () { run(true); });
        bar.querySelector('.close').addEventListener('click', function () { closeFind(winId); });
        setTimeout(function () { input.focus(); }, 60);
    }

    /* ---------------- 右键菜单 ---------------- */
    function copyText(text, okMsg) {
        try {
            navigator.clipboard.writeText(text);
            notify('已复制', okMsg || '内容已复制到剪贴板。', 'success');
        } catch (e) { notify('复制失败', '浏览器没有剪贴板权限。', 'warning'); }
    }
    function closeOtherTabs(winId, tabId) {
        var st = stateOf(winId);
        if (!st) return;
        var keep = st.tabs.filter(function (t) { return t.id === tabId; })[0];
        if (!keep) return;
        st.tabs.forEach(function (t) { if (t.id !== tabId) recordClosed(t); });
        st.tabs = [keep];
        st.activeTab = tabId;
        try { switchBrowserTab(tabId, winId); } catch (e) { }
        try { renderBrowserTabs(winId); } catch (e) { }
        paintBookmarkBar(winId);
    }
    function ctxItem(icon, label, fn) {
        var b = document.createElement('button');
        b.className = 'bm-menu-item';
        b.innerHTML = '<i class="fas ' + icon + '" aria-hidden="true"></i><span>' + label + '</span>';
        b.addEventListener('click', function () { closeCtx(); fn(); });
        return b;
    }
    function openCtx(winId, x, y, kind, data) {
        closeCtx();
        var pop = document.createElement('div');
        pop.className = 'bm-menu-pop bm-ctx';
        var tab = tabOf(winId);
        var url = tab && tab.url;
        if (kind === 'tab') {
            pop.appendChild(ctxItem('fa-xmark', '关闭标签', function () {
                var st = stateOf(winId);
                if (st && st.tabs.length > 1) closeBrowserTab(data, winId);
                else notify('无法关闭', '至少保留一个标签。', 'info');
            }));
            pop.appendChild(ctxItem('fa-clone', '关闭其它标签', function () { closeOtherTabs(winId, data); }));
            pop.appendChild(ctxItem('fa-copy', '复制标签地址', function () {
                var st = stateOf(winId);
                var t = st && st.tabs.filter(function (x) { return x.id === data; })[0];
                if (t && t.url) copyText(t.url, '标签地址已复制。');
            }));
            pop.appendChild(ctxItem('fa-rotate', '重新加载标签', function () {
                var st = stateOf(winId);
                if (st) { st.activeTab = data; switchBrowserTab(data, winId); browserRefresh(winId); }
            }));
        } else if (kind === 'bookmark') {
            pop.appendChild(ctxItem('fa-arrow-up-right-from-square', '打开书签', function () { openBookmark(winId, data); }));
            pop.appendChild(ctxItem('fa-copy', '复制书签地址', function () {
                var b = (getUserLS('bookmarks') || [])[data];
                if (b) copyText(b.url, '书签地址已复制。');
            }));
            pop.appendChild(ctxItem('fa-trash-can', '删除书签', function () {
                var bms = getUserLS('bookmarks') || [];
                bms.splice(data, 1);
                setUserLS('bookmarks', bms);
                paintBookmarkBar(winId);
                try { updateBookmarkStar(winId); } catch (e) { }
                notify('书签', '已删除该书签。', 'info');
            }));
        } else {
            pop.appendChild(ctxItem('fa-arrow-left', '后退', function () { browserGoBack(winId); }));
            pop.appendChild(ctxItem('fa-arrow-right', '前进', function () { browserGoForward(winId); }));
            pop.appendChild(ctxItem('fa-rotate', '刷新', function () { browserRefresh(winId); }));
            pop.appendChild(ctxItem('fa-copy', '复制当前地址', function () {
                if (url) copyText(url, '地址已复制。');
                else notify('没有地址', '当前是起始页。', 'info');
            }));
            pop.appendChild(ctxItem('fa-star', '收藏 / 取消收藏', function () { toggleBookmark(winId); }));
            pop.appendChild(ctxItem('fa-magnifying-glass', '查找页内', function () { openFind(winId); }));
            pop.appendChild(ctxItem('fa-book-open', '阅读模式', function () { toggleReader(winId); }));
            pop.appendChild(ctxItem('fa-arrow-up-right-from-square', '在系统浏览器打开', function () { externalOpen(winId); }));
        }
        document.body.appendChild(pop);
        overlay.ctx = pop;
        var w = pop.offsetWidth, h = pop.offsetHeight;
        pop.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
        pop.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
        setTimeout(function () {
            document.addEventListener('mousedown', function close(e) {
                if (overlay.ctx && !overlay.ctx.contains(e.target)) {
                    closeCtx();
                    document.removeEventListener('mousedown', close, true);
                }
            }, true);
        }, 0);
    }
    function closeCtx() { if (overlay.ctx) { overlay.ctx.remove(); overlay.ctx = null; } }

    /* ---------------- 证书错误：https 证书异常时给出专用错误页 ---------------- */
    function probeHttpAlternative(url, cb) {
        var alt;
        try {
            var u = new URL(url);
            if (u.protocol !== 'https:') { cb(false); return; }
            u.protocol = 'http:';
            alt = u.href;
        } catch (e) { cb(false); return; }
        var ctrl = new AbortController();
        var t = setTimeout(function () { ctrl.abort(); }, 6000);
        fetch(alt, { mode: 'no-cors', signal: ctrl.signal, cache: 'no-store' }).then(function () {
            clearTimeout(t); cb(true, alt);
        }).catch(function () {
            clearTimeout(t); cb(false);
        });
    }

    window.n26BM = {
        openTabSearch: openTabSearch,
        openFind: openFind,
        closeFind: closeFind,
        openCtx: openCtx,
        closeCtx: closeCtx,
        insecure: insecure,
        paintBookmarkBar: paintBookmarkBar,
        bookmarkCurrent: function (winId) { toggleBookmark(winId); paintBookmarkBar(winId); },
        manageBookmarks: function (winId) { browserOpenBookmarks(winId); },
        openBm: function (winId, i) { openBookmark(winId, i); },
        openBookmarkCtx: function (winId, i, e) { if (e) { e.preventDefault(); e.stopPropagation(); } openCtx(winId, e ? e.clientX : 0, e ? e.clientY : 0, 'bookmark', i); },
        closeTabSearch: closeTabSearch,
        openMenu: openMenu,
        closeMenu: closeMenu,
        menuAction: menuAction,
        toggleSide: toggleSide,
        setSideTab: setSideTab,
        renderSide: renderSide,
        openSideUrl: openSideUrl,
        openSideItem: openSideItem,
        removeSide: removeSide,
        downloadCurrent: downloadCurrent,
        openDownload: openDownload,
        removeDownload: removeDownload,
        toggleReader: toggleReader,
        closeReader: closeReader,
        readerFont: readerFont,
        restoreClosed: restoreClosed,
        retry: retry,
        searchFor: searchFor,
        copyUrl: copyUrl,
        toggleNews: toggleNews,
        persistSession: persistSession
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
})();
