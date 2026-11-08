/* ============================================================
   N26 No-Reload · 控件点击「整窗刷新」根治（v2.9.93）
   ------------------------------------------------------------
   用户硬要求：点击任何页面里的任何控件，整个窗口都不许刷新。

   实测根因（不是 location.reload）：
     开关 onclick → setExtraPref() → applyUserSettings()
       → applyUIStyle() → applyExtraSettings() → window.n26ApplyGlass()
       → ① 给所有 iframe 广播 nexus:glass（每个应用窗口整页重算玻璃变量）
          ② n26LgSync() 全量拆建折射贴图（所有玻璃面闪一下）
          ③ 广播 + 重建之后又 renderDesktopIcons() + renderSettingsPanel()
             （整块 innerHTML 重建、滚动位置回弹）
     三件事叠在一起，肉眼就是「整个窗口所有页面全部刷新」。

   本模块不改任何业务逻辑，只做三道守门：
     ① 玻璃签名不变时，控件点击窗口内的 n26ApplyGlass() 直接短路
        —— 不广播、不重建贴图（材质真的变了才放行）。
     ② 开关点击窗口内，整块重建函数（设置面板 / 桌面图标 / 启动台）短路；
        开关状态由 n26-switch.js 就地翻转，视觉零重建。
     ③ Location.prototype.reload 包一层：普通控件点击同一帧里的整页刷新被拦下；
        真正的重启 / 恢复出厂走 n26AllowReboot() 显式授权，行为不变。
     ④ 顺手堵住「没写 type 的 <button> 在 form 里提交导致导航」这条老坑。

   依赖：无。加载顺序必须在 n26-switch.js 之前（捕获监听器先注册）。
   ============================================================ */
(function () {
    'use strict';

    var SW_SEL = '.fu-switch, .toggle-switch, .widget-alarm-toggle-btn, .alarm-toggle';
    var CTRL_SEL = 'button, [role="switch"], .fu-switch, .toggle-switch, ' +
        '.widget-alarm-toggle-btn, .alarm-toggle, .n26-lg-ctrl, .glass-btn, ' +
        '.style-option, .dock-item, input, select, label, [onclick]';
    var CLICK_WINDOW = 900;      // 控件点击后的保护窗口（ms）

    var clickUntil = 0;          // 保护窗口截止
    var inClick = false;         // 是否正处于 click 事件派发这一帧
    var allowUntil = 0;          // 显式重启授权截止（兼容旧的时间窗）
    var rebootTokens = 0;        // ★ v2.9.96：一次性授权令牌，覆盖延迟 reload
    var lastGlassSig = null;

    /* ---------- ③ 整页 reload 守门 ---------- */
    try {
        var P = window.Location && window.Location.prototype;
        var desc = P && Object.getOwnPropertyDescriptor(P, 'reload');
        if (P && desc && desc.configurable !== false && desc.writable !== false && !P.__n26NoReload) {
            var origReload = P.reload;
            Object.defineProperty(P, 'reload', {
                configurable: true, writable: true, enumerable: desc.enumerable,
                value: function () {
                    /* ★ v2.9.96：默认拦截一切「未授权」整页刷新。
                       旧判据只在 inClick（click 派发那一帧）拦截，主壳里
                       7 处 setTimeout(2~3s) 后的 reload 全在窗口外，
                       用户点的下载 / 搜索 / 重启反馈照样整页白闪。
                       现在改成白名单：只有 n26AllowReboot() 发过令牌
                       （或旧时间窗内）的显式系统动作才能刷新。 */
                    if (rebootTokens > 0) {
                        rebootTokens--;
                        /* 令牌消费后同步关掉兼容时间窗，否则同一次授权
                           之后 2.5s 内的任何意外 reload 都会被无限放行。 */
                        allowUntil = 0;
                        return origReload.apply(this, arguments);
                    }
                    if (Date.now() < allowUntil) return origReload.apply(this, arguments);
                    try { console.warn('[N26 NoReload] 已拦截未授权的整窗刷新'); } catch (e) { }
                    return undefined;
                }
            });
            P.__n26NoReload = true;
        }
    } catch (e) { /* 不支持改写就跳过，其余守门照常生效 */ }

    /* 真正的系统动作自己授权：C.softReboot / exitPEMode / factoryResetNoConfirm /
       修复完成重启 / 恢复出厂 / 重装系统 / PE 重启 / PE reset。
       令牌是一次性的、不过期，专门覆盖 setTimeout 2~3s 后才执行的 reload。 */
    window.n26AllowReboot = function (ms) {
        rebootTokens = Math.max(rebootTokens, 1);
        allowUntil = Date.now() + (ms || 2500);
    };

    /* ---------- ① 玻璃广播 / 折射重建短路 ---------- */
    function glassSig() {
        try {
            var de = document.documentElement, b = document.body;
            if (!de || !b) return '';
            return [
                b.className,
                b.getAttribute('data-n26-glass') || '',
                b.getAttribute('data-n26-liquid') || '',
                de.style.getPropertyValue('--glass-blur'),
                de.style.getPropertyValue('--n26-blur'),
                de.style.getPropertyValue('--n26-refr'),
                de.style.getPropertyValue('--n26-disp'),
                de.style.getPropertyValue('--n26-lg-blur'),
                de.style.getPropertyValue('--n26-glass-alpha'),
                de.style.getPropertyValue('--n26-ui-radius')
            ].join('|');
        } catch (e) { return ''; }
    }

    /* ★ v2.9.94 P0：修掉 v2.9.93 的致命缺陷。
       旧判据拿 glassSig()（= 当前「已生效」的 CSS 变量快照）跟
       lastGlassSig（= 上次应用「之后」写下的同一份快照）比较，二者必然相等；
       而任何控件 pointerdown 都会开 900ms 保护窗 → 窗口内
       n26ApplyGlass() 100% 被短路，于是材质切换、6 条参数滑杆全部失效
       （用户反馈「这些参数全部都失效了」）。

       新判据只看「调用来源」，不拿结果快照当意图：
         · opts.light === true   → 参数滑杆拖动，一律放行
         · opts.force === true   → 材质/复位等显式调用，一律放行
         · 其余只在「开关点击」窗口内短路；开关状态由 n26-switch.js
           就地翻转，本就不需要广播 + 全量拆建贴图。
       glassSig()/lastGlassSig 保留，仅作自检与诊断，不参与裁决。 */
    function wrapGlass() {
        var orig = window.n26ApplyGlass;
        if (typeof orig !== 'function' || orig.__n26NoReloadWrapped) return false;
        var wrapped = function () {
            var opts = arguments[0];
            var force = !!(opts && opts.force);
            var light = !!(opts && opts.light === true);
            if (!force && !light && window.__N26_SWITCH_CLICK__ && Date.now() < clickUntil) {
                return undefined;                       // 不广播、不 n26LgSync、不变量重写
            }
            var out = orig.apply(this, arguments);
            lastGlassSig = glassSig();
            return out;
        };
        wrapped.__n26NoReloadWrapped = true;
        window.n26ApplyGlass = wrapped;
        return true;
    }

    /* ---------- ② 整块重建短路 ---------- */
    var REBUILD_FNS = ['renderSettingsPanel', 'renderDesktopIcons', 'renderLaunchpad'];
    function wrapRebuild(name) {
        var orig = window[name];
        if (typeof orig !== 'function' || orig.__n26NoReloadWrapped) return false;
        var wrapped = function () {
            /* 只对「开关点击」短路：其它控件（换壁纸 / 切主题 / 搜索）仍按原逻辑重建，
               否则面板选中态会失真。 */
            if (window.__N26_SWITCH_CLICK__) return undefined;
            return orig.apply(this, arguments);
        };
        wrapped.__n26NoReloadWrapped = true;
        window[name] = wrapped;
        return true;
    }

    function install() {
        /* 必须四个都包上才算完成；只包到一部分就停会留下漏网的重渲染入口 */
        var all = true;
        if (!wrapGlass() && !(window.n26ApplyGlass && window.n26ApplyGlass.__n26NoReloadWrapped)) all = false;
        REBUILD_FNS.forEach(function (n) {
            if (!wrapRebuild(n) && !(window[n] && window[n].__n26NoReloadWrapped)) all = false;
        });
        return all;
    }

    var tries = 0;
    (function boot() {
        if (install()) return;
        if (++tries < 40) setTimeout(boot, 50);
    })();

    /* ---------- 事件层：标记点击窗口 ---------- */
    function isCtrl(t) {
        return !!(t && t.closest && t.closest(CTRL_SEL));
    }
    function isSwitch(t) {
        return !!(t && t.closest && t.closest(SW_SEL));
    }

    document.addEventListener('pointerdown', function (e) {
        if (isCtrl(e.target)) clickUntil = Date.now() + CLICK_WINDOW;
        /* 没写 type 的 button 落在 form 里会触发表单提交 → 整页导航 */
        var t = e.target;
        if (t && t.tagName === 'BUTTON' && !t.getAttribute('type')) {
            try { t.setAttribute('type', 'button'); } catch (err) { }
        }
    }, true);

    document.addEventListener('click', function (e) {
        var t = e.target;
        if (!isCtrl(t)) return;
        clickUntil = Date.now() + CLICK_WINDOW;
        inClick = true;
        if (isSwitch(t)) window.__N26_SWITCH_CLICK__ = true;
        /* setTimeout(0) 一定晚于本次 click 的全部同步处理器 */
        setTimeout(function () { inClick = false; }, 0);
        /* 有些业务把 renderSettingsPanel() 放进短延时里，多留 520ms 挡住这类
           「延迟整块重建」；开关状态已由 n26-switch.js 就地翻转，无需重建。 */
        if (window.__N26_SWITCH_CLICK__) {
            clearTimeout(window.__N26_SW_CLICK_T__);
            window.__N26_SW_CLICK_T__ = setTimeout(function () {
                window.__N26_SWITCH_CLICK__ = false;
            }, 520);
        }
    }, true);

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        if (isCtrl(e.target)) clickUntil = Date.now() + CLICK_WINDOW;
    }, true);

    /* 自检接口（verify-n26-293.js 用；不参与业务逻辑） */
    window.N26NoReload = {
        version: '2.9.96',
        glassSig: glassSig,
        getSig: function () { return lastGlassSig; },
        isProtected: function () { return Date.now() < clickUntil; },
        allowReboot: window.n26AllowReboot
    };
})();
