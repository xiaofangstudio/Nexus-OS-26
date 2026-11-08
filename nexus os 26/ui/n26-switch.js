/* ===== n26-switch.js · 统一开关动效（v3.7 / P3）=====
 * 视觉基线在 fangui/core/liquid.css：灰轨(关) / 绿轨(开) / 白色胶囊旋钮。
 * 本脚本只做点击后的一段 400ms 动效，不改业务状态（.on/.active/aria-checked 仍由原 onclick 切换）：
 *   0 → 400ms：白色胶囊切成液态玻璃（真折射，无 blur），沿轨道滑到对面并精确落位；
 *              先慢 → 中段最快 → 后慢，末端严格 1:1 停住，不允许弹道过冲或抖动。
 *   落位后（400ms）玻璃收回白色胶囊。全程单段 WAAPI，无四段拼接、无 overshoot 曲线。
 */
(function () {
    'use strict';

    var SEL = '.fu-switch, .toggle-switch, .widget-alarm-toggle-btn, .alarm-toggle';
    /* ★ P3：整段 400ms，先慢-中快-后慢，末端严格落位、无弹道过冲 */
    var DUR = 400;
    var EASE = 'cubic-bezier(.42,0,.24,1)';
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var lgSeq = 0;

    /* 旋钮液态玻璃：接主壳同一套 feDisplacementMap 引擎（noBlur —— 不做磨砂，磨砂只由滑块控制） */
    function attachLg(k) {
        if (!k || typeof window.n26LgAttach !== 'function') return;
        k.classList.add('n26-sw-knob');
        if (!k.__swId) k.__swId = ++lgSeq;
        var r = k.getBoundingClientRect();
        var w = Math.max(12, Math.round(r.width)), h = Math.max(12, Math.round(r.height));
        try {
            window.n26LgAttach(k, 'n26LgSw' + k.__swId, { hw: 0.30, hh: 0.20, thresh: -0.10, noBlur: true }, { w: w, h: h });
        } catch (e) { }
    }
    function detachLg(k) {
        if (!k) return;
        try { if (window.n26LgClear) window.n26LgClear(k); } catch (e) { }
    }

    /* 状态来源判定：有 .on/.active 语义的（旧组件）以类名为准；只有 aria-checked 的（如 FangUI 演示）以 aria 为准。
       不能两者混读，否则 aria 一旦为 true 会把关掉的开关重新锁成 true。 */
    function isOn(el) {
        if (el.__fuMode === 'aria') return el.getAttribute('aria-checked') === 'true';
        return el.classList.contains('on') || el.classList.contains('active');
    }

    function syncAria(el) {
        var v = isOn(el) ? 'true' : 'false';
        if (el.getAttribute('aria-checked') !== v) el.setAttribute('aria-checked', v);
    }

    /* 懒升级：补 role/tabindex + 真实滑块节点（静息态仍由 ::after 呈现，视觉零变化） */
    function upgrade(el) {
        if (!el.__fuMode) {
            el.__fuMode = (el.hasAttribute('aria-checked') &&
                !el.classList.contains('on') && !el.classList.contains('active')) ? 'aria' : 'class';
        }
        if (!el.hasAttribute('role')) el.setAttribute('role', 'switch');
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
        var k = el.querySelector('.fu-knob');
        if (!k) {
            k = document.createElement('span');
            k.className = 'fu-knob';
            el.appendChild(k);
        }
        syncAria(el);
        if (!el.__fuAriaWatch && window.MutationObserver) {
            el.__fuAriaWatch = new MutationObserver(function () { syncAria(el); });
            el.__fuAriaWatch.observe(el, { attributes: true, attributeFilter: ['class', 'aria-checked'] });
        }
        return k;
    }

    function readX(k, fallback) {
        var t = getComputedStyle(k).transform;
        if (!t || t === 'none') return fallback;
        try {
            return new DOMMatrixReadOnly(t).m41;
        } catch (e) {
            return fallback;
        }
    }

    function stop(el) {
        var s = el.__fuAnim;
        if (!s) return;
        (s.list || []).forEach(function (a) { try { a.cancel(); } catch (e) { } });
        (s.timers || []).forEach(function (t) { clearTimeout(t); });
        el.__fuAnim = null;
        el.classList.remove('fu-liquid');
        detachLg(el.querySelector('.fu-knob'));
    }

    function finish(el, seq) {
        if (el.__fuSeq !== seq) return;
        var k = el.querySelector('.fu-knob');
        el.classList.remove('fu-anim', 'fu-liquid');
        if (k) k.style.transform = '';
        detachLg(k);
        el.__fuAnim = null;
        syncAria(el);
    }

    function play(el) {
        var k = upgrade(el);
        var travel = Math.round(parseFloat(getComputedStyle(el).getPropertyValue('--fu-sw-travel')) || 16);
        var on = isOn(el);
        var fallback = on ? 0 : travel;
        var fromX = el.classList.contains('fu-anim') ? readX(k, fallback) : fallback;
        var toX = on ? travel : 0;

        stop(el);
        el.__fuSeq = (el.__fuSeq || 0) + 1;
        var seq = el.__fuSeq;

        var s = { list: [], timers: [], active: true };
        el.__fuAnim = s;
        el.classList.add('fu-anim', 'fu-liquid');
        k.style.transform = 'translateX(' + fromX + 'px) scale(1,1)';
        /* 液态玻璃（真折射）接入：不做 blur，磨砂只由设置滑块控制 */
        attachLg(k);

        /* 400ms 单段：先慢 → 中段最快 → 后慢落位；沿运动轴微拉伸、垂直轴微压扁，末端精确 1:1 停在目标位 */
        var mid = fromX + (toX - fromX) * 0.58;
        s.list.push(k.animate([
            { transform: 'translateX(' + fromX + 'px) scale(1,1)', offset: 0 },
            { transform: 'translateX(' + (fromX + (toX - fromX) * 0.12) + 'px) scale(1.10,0.95)', offset: 0.22 },
            { transform: 'translateX(' + mid + 'px) scale(1.16,0.92)', offset: 0.56 },
            { transform: 'translateX(' + (fromX + (toX - fromX) * 0.94) + 'px) scale(1.05,0.98)', offset: 0.88 },
            { transform: 'translateX(' + toX + 'px) scale(1,1)', offset: 1 }
        ], { duration: DUR, easing: EASE, fill: 'both' }));

        /* 玻璃保留到落位那一帧（DUR）：滚到位时仍是折射玻璃，随后收成白色胶囊 */
        s.timers.push(setTimeout(function () {
            el.classList.remove('fu-liquid');
            detachLg(k);
        }, DUR));
        s.timers.push(setTimeout(function () { finish(el, seq); }, DUR + 12));
    }

    /* 捕获阶段挂钩，用 setTimeout(0) 错开：等原有 onclick 改完状态再读，业务逻辑零侵入 */
    document.addEventListener('click', function (e) {
        var el = e.target && e.target.closest ? e.target.closest(SEL) : null;
        if (!el) return;
        setTimeout(function () {
            upgrade(el);
            if (!reduced) play(el);
        }, 0);
    }, true);

    document.addEventListener('pointerdown', function (e) {
        var el = e.target && e.target.closest ? e.target.closest(SEL) : null;
        if (el) upgrade(el);
    }, true);

    /* 键盘可达：Enter / Space 等价点击（走原生 click，原 handler 照常触发） */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        var el = e.target && e.target.closest ? e.target.closest(SEL) : null;
        if (!el) return;
        e.preventDefault();
        el.click();
    }, true);

    function scan() {
        var nodes = document.querySelectorAll(SEL);
        for (var i = 0; i < nodes.length; i++) upgrade(nodes[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scan);
    } else {
        scan();
    }

    /* 组件/小组件是动态重渲染的：增删后补升级（防抖，只查开关节点） */
    if (window.MutationObserver && document.body) {
        var mo = new MutationObserver(function () {
            clearTimeout(mo.__t);
            mo.__t = setTimeout(scan, 160);
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }
})();
