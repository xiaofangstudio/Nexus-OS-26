/* ===== n26-switch.js · 统一开关的四段动效（v2.9.68） =====
 * 视觉基线在 fangui/core/liquid.css：灰轨(关) / 绿轨(开) / 白色胶囊滑块。
 * 本脚本只做点击后的四段动效：
 *   1) 90ms  白色胶囊胀大
 *   2) 60ms  转液态玻璃（复用 n26-docknav 的 .travel 配方）
 *   3) 260ms 像水滴一样滑到另一端（中段横向拉伸）
 *   4) 260ms 轨道变绿 + 胶囊收回静息态
 * 约定：只读不写业务状态——.on / .active / aria-checked 仍由原有 onclick 逻辑切换，
 *       这里只观察结果并补无障碍属性，绝不改动 toggleSwitch(...) 等调用。
 */
(function () {
    'use strict';

    var SEL = '.fu-switch, .toggle-switch, .widget-alarm-toggle-btn, .alarm-toggle';
    var T = { grow: 40, glass: 30, slide: 150, settle: 110 };
    var EASE = {
        grow: 'cubic-bezier(.2,.9,.3,1)',
        slide: 'cubic-bezier(.34,1.4,.64,1)',
        settle: 'cubic-bezier(.34,1.4,.64,1)'
    };
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    }

    function finish(el, seq) {
        if (el.__fuSeq !== seq) return;
        var k = el.querySelector('.fu-knob');
        el.classList.remove('fu-anim', 'fu-liquid');
        if (k) k.style.transform = '';
        el.__fuAnim = null;
        syncAria(el);
    }

    function play(el) {
        var k = upgrade(el);
        var travel = Math.round(parseFloat(getComputedStyle(el).getPropertyValue('--fu-sw-travel')) || 16);
        var on = isOn(el);
        // 起点：上一次动效若还在飞，从当前真实位置续接；否则从「目标的反面」起步
        var fallback = on ? 0 : travel;
        var fromX = el.classList.contains('fu-anim') ? readX(k, fallback) : fallback;
        var toX = on ? travel : 0;

        stop(el);
        el.__fuSeq = (el.__fuSeq || 0) + 1;
        var seq = el.__fuSeq;

        var s = { list: [], timers: [], active: true };
        el.__fuAnim = s;
        el.classList.add('fu-anim');
        k.style.transform = 'translateX(' + fromX + 'px) scale(1,1)';

        // ① 胀大
        s.list.push(k.animate([
            { transform: 'translateX(' + fromX + 'px) scale(1,1)' },
            { transform: 'translateX(' + fromX + 'px) scale(1.28,1.16)' }
        ], { duration: T.grow, easing: EASE.grow, fill: 'both' }));

        // ② 液态玻璃 + 横向拉长（水滴成形）
        s.timers.push(setTimeout(function () {
            el.classList.add('fu-liquid');
            s.list.push(k.animate([
                { transform: 'translateX(' + fromX + 'px) scale(1.28,1.16)' },
                { transform: 'translateX(' + fromX + 'px) scale(1.44,1.12)' }
            ], { duration: T.glass, easing: 'ease-out', fill: 'both' }));
        }, T.grow));

        // ③ 滑行（中段拉伸，像水滴被甩到另一端）
        s.timers.push(setTimeout(function () {
            s.list.push(k.animate([
                { transform: 'translateX(' + fromX + 'px) scale(1.44,1.12)' },
                { transform: 'translateX(' + ((fromX + toX) / 2) + 'px) scale(1.54,1.10)', offset: 0.45 },
                { transform: 'translateX(' + toX + 'px) scale(1.20,1.06)' }
            ], { duration: T.slide, easing: EASE.slide, fill: 'both' }));
        }, T.grow + T.glass));

        // ④ 玻璃退去（此时轨道已变绿）+ 收成白色胶囊
        s.timers.push(setTimeout(function () {
            el.classList.remove('fu-liquid');
            s.list.push(k.animate([
                { transform: 'translateX(' + toX + 'px) scale(1.20,1.06)' },
                { transform: 'translateX(' + toX + 'px) scale(1,1)' }
            ], { duration: T.settle, easing: EASE.settle, fill: 'both' }));
            s.timers.push(setTimeout(function () { finish(el, seq); }, T.settle));
        }, T.grow + T.glass + T.slide));
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
