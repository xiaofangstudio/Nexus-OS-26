/* ============================================================
   N26 DomKeep · 控件点击零刷新感（v2.9.96）
   ------------------------------------------------------------
   用户反馈「点击任何东西都会强制刷新页面」：应用商城点下载 / 进简介、
   音乐点搜索都会整页白闪一下、滚到最上面、输入框失焦。

   ★ 真凶不是 location.reload()，而是业务里到处都是
     `grid.innerHTML = apps.map(...).join('')` / `el.innerHTML = h`：
     整块 DOM 被销毁重建，浏览器重新解析 + 重新栅格化 + 滚动位置归零
     + 焦点元素消失。肉眼就是「刷新」。v2.9.93 的 NoReload 只短路了
     renderSettingsPanel / renderDesktopIcons / renderLaunchpad 三个函数，
     商店 renderGrid、音乐 renderSearch 这些全在守门外。

   本模块做两件事，零业务侵入：
     ① 包装 Element.prototype.innerHTML 的 setter：替换前后自动保留
        目标容器与可滚动祖先的 scrollTop/scrollLeft、焦点元素、
        输入框 value 与选区。所有已有业务代码一行都不用改。
     ② 暴露 patch(box, html)：按直接子节点做 outerHTML 级 diff，
        只替换真正变了的节点。商店点下载只换 1 张卡、音乐点搜索
        搜索框 DOM 纹丝不动 —— 这才是「零刷新感」，不只是位置保持。

   ★ iframe 是独立 realm，Element.prototype 互不相通：本模块由
     apps/_app.js 按自身 src 推导路径自动注入到每个应用文档，
     主壳则在 head 里直接加载。同一个文件，唯一真值源。
   ============================================================ */
(function () {
    'use strict';
    if (window.N26DomKeep) return;

    var EP = window.Element && window.Element.prototype;
    var desc = EP && Object.getOwnPropertyDescriptor(EP, 'innerHTML');
    var hooked = false;

    /* ---------- 稳定标识：焦点元素重建后要能找回来 ---------- */
    function ident(el, root) {
        if (!el || el.nodeType !== 1) return null;
        if (el.id) return '#' + el.id;
        if (el.getAttribute && el.getAttribute('data-n26-keep'))
            return '@' + el.getAttribute('data-n26-keep');
        var parts = [], cur = el;
        while (cur && cur !== root && cur.nodeType === 1 && cur.parentNode) {
            var p = cur.parentNode, idx = 0, sib = cur;
            while ((sib = sib.previousElementSibling)) idx++;
            parts.unshift(idx);
            cur = p;
            if (parts.length > 12) break;
        }
        return '/' + parts.join('/');
    }
    function lookup(root, key) {
        if (!key) return null;
        try {
            if (key.charAt(0) === '#') {
                var byId = document.getElementById(key.slice(1));
                return (byId && (byId === root || root.contains(byId))) ? byId : null;
            }
            if (key.charAt(0) === '@') return root.querySelector('[data-n26-keep="' + key.slice(1) + '"]');
        } catch (e) { }
        var parts = key.slice(1).split('/'), cur = root;
        for (var i = 0; i < parts.length; i++) {
            if (!cur || !cur.children) return null;
            cur = cur.children[+parts[i]];
        }
        return cur || null;
    }
    /* ---------- 滚动位置快照（只取 3 层，O(1)） ---------- */
    function snapScroll(root) {
        var out = [], el = root, n = 0;
        while (el && el.nodeType === 1 && n < 4) {
            try { out.push({ el: el, x: el.scrollLeft, y: el.scrollTop }); } catch (e) { }
            el = el.parentElement; n++;
        }
        return out;
    }
    function restoreScroll(list) {
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            if (!s.el || !s.el.isConnected) continue;
            try {
                /* 内容变短时浏览器会自己夹紧，别把旧值硬顶回去造成跳变 */
                if (Math.abs(s.el.scrollTop - s.y) > 1) s.el.scrollTop = s.y;
                if (Math.abs(s.el.scrollLeft - s.x) > 1) s.el.scrollLeft = s.x;
            } catch (e) { }
        }
    }
    function snapFocus(root) {
        try {
            var ae = document.activeElement;
            if (!ae || ae === document.body || ae === document.documentElement) return null;
            if (ae !== root && !root.contains(ae)) return null;
            var f = { key: ident(ae, root), tag: ae.tagName, value: null, s: null, e: null };
            if ('value' in ae) f.value = ae.value;
            try { f.s = ae.selectionStart; f.e = ae.selectionEnd; } catch (err) { }
            return f;
        } catch (e) { return null; }
    }
    function restoreFocus(root, f) {
        if (!f) return;
        var el = lookup(root, f.key) || (f.tag ? root.querySelector(f.tag.toLowerCase()) : null);
        if (!el) return;
        try {
            if (f.value != null && 'value' in el && el.value !== f.value) el.value = f.value;
            if (f.s != null && el.setSelectionRange) el.setSelectionRange(f.s, f.e == null ? f.s : f.e);
            el.focus({ preventScroll: true });
        } catch (e) { }
    }

    /* ---------- ① innerHTML setter 包装 ---------- */
    if (desc && desc.get && desc.set && desc.configurable !== false) {
        var origSet = desc.set, origGet = desc.get, reentrant = false;
        try {
            Object.defineProperty(EP, 'innerHTML', {
                configurable: true, enumerable: desc.enumerable,
                get: origGet,
                set: function (html) {
                    if (reentrant || this.nodeType !== 1 || typeof html !== 'string') {
                        origSet.call(this, html); return;
                    }
                    /* 空容器首次填充、以及纯文本小替换：无状态可保，直接走原路径 */
                    var hasKids = !!(this.firstChild);
                    if (!hasKids) { origSet.call(this, html); return; }
                    var sc = snapScroll(this), fc = snapFocus(this);
                    reentrant = true;
                    try { origSet.call(this, html); } finally { reentrant = false; }
                    restoreScroll(sc);
                    restoreFocus(this, fc);
                }
            });
            hooked = true;
        } catch (e) { /* 只读原型：patch() 仍可用 */ }
    }

    /* ---------- ② 子节点级 diff：只换真正变了的节点 ---------- */
    function same(a, b) {
        if (!a || !b) return false;
        if (a.nodeType !== b.nodeType) return false;
        try {
            return a.nodeType === 1 ? (a.outerHTML === b.outerHTML) : (a.nodeValue === b.nodeValue);
        } catch (e) { return false; }
    }
    function patch(box, html) {
        if (!box || typeof html !== 'string') return false;
        var tmp = document.createElement('div');
        reentrantSafeSet(tmp, html);
        var next = Array.prototype.slice.call(tmp.childNodes);
        var cur = Array.prototype.slice.call(box.childNodes);
        var n = Math.max(next.length, cur.length), changed = 0;
        for (var i = 0; i < n; i++) {
            var a = cur[i], b = next[i];
            if (!a) { box.appendChild(b.cloneNode(true)); changed++; continue; }
            if (!b) { box.removeChild(a); changed++; continue; }
            if (same(a, b)) continue;
            box.replaceChild(b.cloneNode(true), a);
            changed++;
        }
        return changed;
    }
    /* patch 内部不能走被包装的 setter，否则会做无意义的快照 */
    function reentrantSafeSet(el, html) {
        if (hooked) { origSet.call(el, html); }
        else { el.innerHTML = html; }
    }

    window.N26DomKeep = {
        version: '1.0-2.9.96',
        hooked: hooked,
        patch: patch,
        /* 供业务手动声明「这一块即使重建也不要动焦点/滚动」 */
        keep: function (fn) { if (typeof fn === 'function') fn(); }
    };
})();
