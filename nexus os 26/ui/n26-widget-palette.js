/* ============================================================================
 * Nexus OS 26 · 小组件动态色（时段 9 档 / 天况 8 类 / 二十四节气 / 双区渐变）
 * ----------------------------------------------------------------------------
 * 只写属性，不碰任何组件的 innerHTML：
 *   ① 时钟类卡（clock / time / dualtime）→ 写 data-wday = h0…h8
 *        h0 00–02 深夜 · h1 03–05 黎明前 · h2 06–08 日出 · h3 09–11 上午
 *        h4 12–14 正午 · h5 15–17 下午 · h6 18–20 黄昏 · h7 21–23 夜晚
 *        h8 雨 / 雪叠加（优先于 h0–h7）
 *   ② 双区时间卡（dualtime）→ 在同一节点再写 data-wdt / data-wdt2
 *        分别取「北京」与「对方城市」当前小时所在的档，CSS 据此给左右两段
 *        文字各自的渐变（左冷右暖），并画中间 1px 分隔线。
 *        小时数优先从已渲染的 <b data-dual="…">HH:MM</b> 文本里读，
 *        读不到再退回本机小时，全部 try/catch。
 *   ③ 天气卡（weather）→ 写 data-wsky：
 *        clear / partly / cloudy / rain / heavyrain / snow / fog / storm
 *      取值优先级：天气状态源（n26WeatherState 函数或对象 / __n26Weather）
 *                → 顶栏天气图标 class → 卡内 .nx-wx-ic 图标 / chip / city 文本
 *   ④ 日历 / 日期卡（calendar / date）→ 写 data-njq（节气名）+ data-njq-season
 *        用「每月两个节气近似日期表」（±1 天误差）取当天所处节气；
 *        当天不是节气日就取「上一个节气」，即当前所处节气。
 *
 * 配色由 n26-widget-palette.css 消费。
 * 调度：综合 60s、天气 5min；MutationObserver（childList+subtree，节流 300ms）
 *       在小组件重建后补一次；页面隐藏时全部暂停，回到前台立即补一次。
 * 稳定性：所有入口 try/catch，异常不外抛。
 * 调试：window.N26WidgetPalette = { timeOfDay, weatherKind, solarTerm, apply }
 * ==========================================================================*/
(function () {
    'use strict';

    var CLOCK_TYPES = { clock: 1, time: 1, dualtime: 1 };
    var CAL_TYPES = { calendar: 1, date: 1 };
    var SEL_CARD = '.desktop-widget-card[data-wtype]';
    var TIME_MS = 60000;      /* 时段：每分钟 */
    var SKY_MS = 300000;      /* 天气：每五分钟 */
    var MO_DELAY = 300;       /* DOM 变动节流 */

    var timeTimer = null;
    var skyTimer = null;
    var observer = null;
    var moTimer = null;
    var booted = false;
    var skyKind = null;       /* 最近一次解析到的天况，供时段判断雨雪叠加 */

    /* ---------- 小工具 ---------- */
    function qsa(sel, root) {
        try {
            return (root || document).querySelectorAll(sel);
        } catch (e) {
            return [];
        }
    }

    function cards() {
        return qsa(SEL_CARD);
    }

    function setAttr(el, name, val) {
        try {
            if (el && el.getAttribute(name) !== val) el.setAttribute(name, val);
        } catch (e) { }
    }

    function str(v) {
        try {
            return (v == null) ? '' : String(v);
        } catch (e) {
            return '';
        }
    }

    /* ---------- ① 时段 9 档 ---------- */
    function hourOfDay() {
        try {
            return new Date().getHours();
        } catch (e) {
            return 12;
        }
    }

    /* 小时 → 档位。0–2 → h0，每 3 小时一档，21–23 → h7 */
    function bandOf(h) {
        var n = Number(h);
        if (!isFinite(n) || n < 0) n = 12;
        n = n % 24;
        if (n < 3) return 'h0';
        if (n < 6) return 'h1';
        if (n < 9) return 'h2';
        if (n < 12) return 'h3';
        if (n < 15) return 'h4';
        if (n < 18) return 'h5';
        if (n < 21) return 'h6';
        return 'h7';
    }

    /* 雨 / 雪时整卡走中性灰蓝 h8 */
    function isWetSky(k) {
        return k === 'rain' || k === 'heavyrain' || k === 'snow';
    }

    function timeOfDayNow() {
        try {
            var v = bandOf(hourOfDay());
            if (isWetSky(skyKind)) return 'h8';
            return v;
        } catch (e) {
            return 'h3';
        }
    }

    /* HH:MM 文本 → 小时；读不到返回 null */
    function hourFromText(t) {
        try {
            var m = /(\d{1,2})\s*[:：]\s*\d{2}/.exec(str(t));
            if (!m) return null;
            var h = parseInt(m[1], 10);
            return (h >= 0 && h <= 23) ? h : null;
        } catch (e) {
            return null;
        }
    }

    /* 双区：左右各自取档，写 data-wdt / data-wdt2（CSS 负责渐变） */
    function paintDual(el) {
        try {
            var lEl = el.querySelector('[data-dual="bj"]');
            var rEl = el.querySelector('[data-dual="other"]');
            var hl = lEl ? hourFromText(lEl.textContent) : null;
            var hr = rEl ? hourFromText(rEl.textContent) : null;
            if (hl == null) hl = hourOfDay();
            if (hr == null) hr = hl;
            setAttr(el, 'data-wdt', bandOf(hl));
            setAttr(el, 'data-wdt2', bandOf(hr));
        } catch (e) { }
    }

    function applyTimeOfDay() {
        try {
            var v = timeOfDayNow();
            var list = cards();
            for (var i = 0; i < list.length; i++) {
                var el = list[i];
                var t = str(el.getAttribute('data-wtype'));
                if (CLOCK_TYPES[t] === 1) {
                    setAttr(el, 'data-wday', v);
                    if (t === 'dualtime') paintDual(el);
                }
            }
            API.timeOfDay = v;
        } catch (e) { }
    }

    /* ---------- ② 天况文本 → 8 类 ---------- */
    /* 顺序即优先级：雷 → 大雪/大雨 → 雪 → 雨 → 雾霾沙尘 → 大风 → 阴 → 多云 → 晴
       注意「雨夹雪」先撞雪（雪优先）；「晴间多云」先撞多云，读作 partly。 */
    function weatherClass(raw) {
        try {
            var v = str(raw).toLowerCase();
            if (!v) return null;
            /* 雷阵雨 / 雷暴 */
            if (/storm|thunder|lightning|bolt|tstorm|雷/.test(v)) return 'storm';
            /* 大雪 / 暴雪 */
            if (/heavy\s*snow|blizzard|大雪|暴雪/.test(v)) return 'snow';
            /* 大雨 / 暴雨 */
            if (/heavy\s*rain|downpour|torrential|大雨|暴雨|强降雨/.test(v)) return 'heavyrain';
            if (/snow|sleet|flake|雪/.test(v)) return 'snow';
            if (/drizzle|shower|light\s*rain|小雨|中雨|阵雨|rain|雨/.test(v)) return 'rain';
            if (/fog|haze|mist|smog|dust|sand|雾|霾|沙尘|浮尘|扬沙/.test(v)) return 'fog';
            if (/wind|gale|大风|狂风/.test(v)) return 'cloudy';
            if (/overcast|阴/.test(v)) return 'cloudy';
            if (/partly|cloud|多云|少云|云/.test(v)) return 'partly';
            if (/clear|sunny|sun|moon|晴/.test(v)) return 'clear';
            return null;
        } catch (e) {
            return null;
        }
    }

    /* 天气状态源：n26WeatherState 可能是函数（主壳）也可能是对象（旧版） */
    function weatherStates() {
        var out = [];
        try {
            var f = window.n26WeatherState;
            if (typeof f === 'function') {
                var r = null;
                try { r = f(); } catch (e) { r = null; }
                if (r && typeof r === 'object') out.push(r);
            } else if (f && typeof f === 'object') {
                out.push(f);
            }
        } catch (e) { }
        try {
            var g = window.__n26Weather;
            if (g && typeof g === 'object') out.push(g);
        } catch (e) { }
        return out;
    }

    function kindFromState(o) {
        if (!o || typeof o !== 'object') return null;
        var c = o.condition || o.cond || null;
        var list = [];
        if (c && typeof c === 'object') {
            list.push(c.kind, c.text, c.code);
        } else {
            list.push(c);
        }
        list.push(o.text, o.weather, o.cond, o.icon, o.iconClass);
        for (var i = 0; i < list.length; i++) {
            var k = weatherClass(list[i]);
            if (k) return k;
        }
        return null;
    }

    /* 顶栏图标：#n26TopbarWeatherIcon 的 class（fa-sun / fa-cloud / fa-cloud-rain …） */
    function kindFromTopbar() {
        try {
            var el = document.getElementById('n26TopbarWeatherIcon');
            if (!el) return null;
            return weatherClass(el.className);
        } catch (e) {
            return null;
        }
    }

    /* 卡片自身：图标 class 最准，其次 chip / city 文本 */
    function kindFromCard(el) {
        try {
            if (!el) return null;
            var ic = el.querySelector('.nx-wx-ic, .nx-wx-ii');
            if (ic) {
                var k = weatherClass(ic.className);
                if (k) return k;
            }
            var nodes = el.querySelectorAll('.nx-wx-chip, .nx-wx-city, .nx-wx-cond');
            for (var i = 0; i < nodes.length; i++) {
                var k2 = weatherClass(nodes[i].textContent);
                if (k2) return k2;
            }
        } catch (e) { }
        return null;
    }

    function resolveKind(weatherCards) {
        var i, states, k;
        try {
            states = weatherStates();
            for (i = 0; i < states.length; i++) {
                k = kindFromState(states[i]);
                if (k) return k;
            }
        } catch (e) { }
        k = kindFromTopbar();
        if (k) return k;
        try {
            for (i = 0; i < weatherCards.length; i++) {
                k = kindFromCard(weatherCards[i]);
                if (k) return k;
            }
        } catch (e) { }
        return null;
    }

    function applyWeather() {
        try {
            var list = qsa('.desktop-widget-card[data-wtype="weather"]');
            var kind = resolveKind(list);
            /* 拿不到天况就保持上一次，别把卡刷回默认色 */
            if (!kind) return skyKind;
            skyKind = kind;
            for (var i = 0; i < list.length; i++) {
                setAttr(list[i], 'data-wsky', kind);
            }
            API.weatherKind = kind;
            return kind;
        } catch (e) {
            return skyKind;
        }
    }

    /* ---------- ③ 二十四节气 ---------- */
    /* 每月两个节气的近似日期（±1 天误差，够用且无需天文算法）。
       顺序按公历 1 月 → 12 月；季节：立春–谷雨春 / 立夏–大暑夏 /
       立秋–霜降秋 / 立冬–大寒冬。 */
    var TERMS = [
        ['小寒', 1, 5, 'winter'], ['大寒', 1, 20, 'winter'],
        ['立春', 2, 4, 'spring'], ['雨水', 2, 19, 'spring'],
        ['惊蛰', 3, 5, 'spring'], ['春分', 3, 20, 'spring'],
        ['清明', 4, 4, 'spring'], ['谷雨', 4, 20, 'spring'],
        ['立夏', 5, 5, 'summer'], ['小满', 5, 21, 'summer'],
        ['芒种', 6, 5, 'summer'], ['夏至', 6, 21, 'summer'],
        ['小暑', 7, 7, 'summer'], ['大暑', 7, 22, 'summer'],
        ['立秋', 8, 7, 'autumn'], ['处暑', 8, 23, 'autumn'],
        ['白露', 9, 7, 'autumn'], ['秋分', 9, 22, 'autumn'],
        ['寒露', 10, 8, 'autumn'], ['霜降', 10, 23, 'autumn'],
        ['立冬', 11, 7, 'winter'], ['小雪', 11, 22, 'winter'],
        ['大雪', 12, 7, 'winter'], ['冬至', 12, 22, 'winter']
    ];

    /* 返回 { name, season, today }
       · 取「日期 ≤ 今天」里最晚的那个节气 → 当前所处节气
       · today 为真表示今天正好是节气交节日 */
    function solarTerm(date) {
        try {
            var d = (date instanceof Date) ? date : new Date();
            var day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            var best = null;
            for (var y = d.getFullYear() - 1; y <= d.getFullYear() + 1; y++) {
                for (var i = 0; i < TERMS.length; i++) {
                    var t = TERMS[i];
                    var ts = new Date(y, t[1] - 1, t[2]).getTime();
                    if (ts <= day0 && (!best || ts > best.ts)) {
                        best = { name: t[0], season: t[3], ts: ts, today: ts === day0 };
                    }
                }
            }
            if (!best) return { name: '立春', season: 'spring', today: false };
            return { name: best.name, season: best.season, today: best.today };
        } catch (e) {
            return { name: '立春', season: 'spring', today: false };
        }
    }

    function applySolarTerm() {
        try {
            var term = solarTerm(new Date());
            var list = qsa('.desktop-widget-card[data-wtype="calendar"], .desktop-widget-card[data-wtype="date"]');
            for (var i = 0; i < list.length; i++) {
                setAttr(list[i], 'data-njq', term.name);
                setAttr(list[i], 'data-njq-season', term.season);
            }
            API.term = term;
        } catch (e) { }
    }

    /* ---------- ④ 调度 ---------- */
    function tick() {
        applyWeather();
        applyTimeOfDay();
        applySolarTerm();
    }

    function applyAll() {
        tick();
    }

    function stopTimers() {
        try {
            if (timeTimer) { clearInterval(timeTimer); timeTimer = null; }
            if (skyTimer) { clearInterval(skyTimer); skyTimer = null; }
        } catch (e) { }
    }

    function startTimers() {
        try {
            stopTimers();
            /* 每分钟补一次：时段、双区、节气都可能跨点 */
            timeTimer = setInterval(tick, TIME_MS);
            /* 天气源变化慢，但保留独立节拍，避免每分钟都去打状态源 */
            skyTimer = setInterval(applyWeather, SKY_MS);
        } catch (e) { }
    }

    /* 300ms 节流：一次小组件重建会连发几十条 mutation，只补跑一次 */
    function schedule() {
        try {
            if (moTimer) return;
            moTimer = setTimeout(function () {
                moTimer = null;
                applyAll();
            }, MO_DELAY);
        } catch (e) { }
    }

    function startObserver() {
        try {
            if (observer || !window.MutationObserver || !document.body) return;
            observer = new MutationObserver(function () { schedule(); });
            observer.observe(document.body, { childList: true, subtree: true });
        } catch (e) {
            observer = null;
        }
    }

    function stopObserver() {
        try {
            if (observer) { observer.disconnect(); observer = null; }
            if (moTimer) { clearTimeout(moTimer); moTimer = null; }
        } catch (e) { }
    }

    function onVisibility() {
        try {
            if (document.hidden) {
                stopTimers();
                stopObserver();
            } else {
                applyAll();
                startTimers();
                startObserver();
            }
        } catch (e) { }
    }

    /* ---------- ⑤ 对外调试口 ---------- */
    var API = {
        timeOfDay: null,
        weatherKind: null,
        term: null,                      /* 当前节气 { name, season, today } */
        bandOf: function (h) { return bandOf(h); },
        solarTerm: function (d) { return solarTerm(d); },
        apply: function () {
            applyAll();
            return {
                timeOfDay: API.timeOfDay,
                weatherKind: API.weatherKind,
                term: API.term
            };
        }
    };
    try { window.N26WidgetPalette = API; } catch (e) { }

    /* ---------- ⑥ 启动 ---------- */
    function boot() {
        if (booted) return;
        booted = true;
        try {
            applyAll();
            startTimers();
            startObserver();
        } catch (e) { }
    }

    try {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', boot, false);
        } else {
            boot();
        }
        /* 天气应用广播新状态时立刻补一次，不必等 5 分钟轮询 */
        window.addEventListener('message', function (ev) {
            try {
                var d = ev && ev.data;
                if (d && d.type === 'n26:weather-state') schedule();
            } catch (e) { }
        }, false);
        window.addEventListener('load', function () { schedule(); }, false);
        document.addEventListener('visibilitychange', onVisibility, false);
    } catch (e) { }
})();
