/* ===== n26-scrollkeep.js · 面板滚动位置保持（v2.9.83） =====
 * 症状：设置面板（以及其他「点一下就整块重建 innerHTML」的面板）每点一次
 *       开关 / 按钮，滚动位置就被丢回最顶部。
 * 根因：renderXXX() 用 innerHTML 整块替换内容 → 元素 scrollTop 归零。
 * 修法：hook Element.prototype 的 innerHTML setter——
 *       命中「已知滚动面板」选择器时，替换前记录 scrollTop，替换后立刻恢复
 *       （同步一次 + rAF 双保险，防止首帧布局把值冲掉）。
 *
 * 范围说明：本脚本只在主壳文档生效；iframe 应用内的面板若也要防跳顶，
 * 需把同款 hook 加进 apps/_app.js（各 iframe 是独立文档，hook 不跨文档）。
 *
 * 扩展：window.n26ScrollKeep.add('.selector') 可随时登记更多面板；
 *       或直接在元素上写 data-scrollkeep 属性，零改代码即可生效。
 */
(function () {
    'use strict';

    var SEL = [
        '.settings-panel',            /* 设置窗口右栏（用户点名的跳顶） */
        '.notification-sidebar-list', /* 通知中心列表 */
        '[data-scrollkeep]'           /* 通用标记：任何想保滚动的容器 */
    ];
    var _desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (!_desc || !_desc.set) return;

    function keepFor(el) {
        for (var i = 0; i < SEL.length; i++) {
            try { if (el.matches(SEL[i])) return true; } catch (e) { }
        }
        return false;
    }

    try {
        Object.defineProperty(Element.prototype, 'innerHTML', {
            configurable: true,
            enumerable: _desc.enumerable,
            get: _desc.get,
            set: function (v) {
                var st = null;
                try {
                    if (this.nodeType === 1 && this.scrollTop > 0 && keepFor(this)) st = this.scrollTop;
                } catch (e) { }
                _desc.set.call(this, v);
                if (st != null) {
                    var el = this;
                    var restore = function () {
                        try { if (el.isConnected) el.scrollTop = st; } catch (e) { }
                    };
                    restore();
                    requestAnimationFrame(restore);
                }
            }
        });
    } catch (e) {
        /* 环境不允许重定义（罕见）→ 静默降级，主壳 renderSettingsPanel 的首尾插桩仍然兜底 */
        return;
    }

    window.n26ScrollKeep = {
        add: function (sel) { if (SEL.indexOf(sel) < 0) SEL.push(sel); },
        list: function () { return SEL.slice(); }
    };
})();
