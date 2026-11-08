/* ==========================================================================
   Nexus OS 26 · 小组件内容层 v2
   —— 每个尺寸重新排版，不做等比缩放
   —— 只读真实数据：Date / weather shared state / widgetTodos / schedule(用户数据)
      / performance.memory / storage.estimate / navigator.connection / getBattery()
   —— 空态一律可见占位，不填演示值
   依赖（调用期才求值，全部做 typeof 守卫）：getUserLS / setUserLS / appRegistry /
   n26WeatherState / n26WallpaperPool / n26NetInfo / n26SystemReadReal /
   widgetSystemState / n26BatteryState / widgetSleepState / widgetFocusState /
   widgetStopwatch / n26MsFmt / n26FmtTZ / n26TZOffsetLabel / N26_TZ_PRESETS
   ========================================================================== */
(function () {
    'use strict';

    /* ---------------- 基础工具 ---------------- */
    function cols(s) { var c = Number(s && s.__cols); return c > 0 ? c : 2; }
    function rows(s) { var r = Number(s && s.__rows); return r > 0 ? r : 2; }
    /* 档位：bar(6×1/4×1) / s(2×2,3×2) / m2(4×2,6×2) / m3(4×3) / l(4×4) */
    function tier(s) {
        var c = cols(s), r = rows(s);
        if (r === 1) return 'bar';
        if (r === 2) return c >= 3 ? 'm2' : 's';
        if (r === 3) return c >= 4 ? 'm3' : 'm2';
        if (r >= 4) return 'l';
        return 'm2';
    }
    function E(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function I(name, cls) { return '<i class="fas ' + name + (cls ? ' ' + cls : '') + '"></i>'; }
    function cut(v, n) {
        var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
        return s.length > n ? s.slice(0, n - 1) + '…' : s;
    }
    function wrap(type, t, inner, extra) {
        return '<div class="nx nx-' + type + ' nx-t-' + t + '"' + (extra || '') + '>' + inner + '</div>';
    }
    function hd(ico, title, sub) {
        return '<div class="nx-hd">' + I(ico) + '<span>' + title + '</span>'
            + (sub ? '<span class="nx-hd-sub">' + sub + '</span>' : '') + '</div>';
    }
    function bar(pct, cls, attr) {
        var p = Math.max(0, Math.min(100, Number(pct) || 0));
        return '<div class="nx-bar' + (cls ? ' ' + cls : '') + '"><span class="nx-fill"' + (attr || '')
            + ' style="width:' + p + '%"></span></div>';
    }
    function empty(ico, title, sub, t) {
        return '<div class="nx-empty">' + I(ico) + '<b>' + title + '</b>'
            + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    }
    function todos() {
        try {
            if (typeof getWidgetTodos === 'function') return getWidgetTodos() || [];
            return getUserLS('widgetTodos') || [];
        } catch (e) { return []; }
    }
    function wState() {
        try {
            if (typeof n26WeatherState === 'function') { var st = n26WeatherState(); if (st) return st; }
            var raw = localStorage.getItem('nexus_n26_weather_state_v1');
            if (raw) return JSON.parse(raw);
        } catch (e) { }
        return null;
    }
    var WD = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    var WD1 = ['日', '一', '二', '三', '四', '五', '六'];
    function pad(n) { return String(n).padStart(2, '0'); }
    function isoWeek(d) {
        var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        var day = t.getUTCDay() || 7;
        t.setUTCDate(t.getUTCDate() + 4 - day);
        var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
        return Math.ceil((((t - y0) / 86400000) + 1) / 7);
    }

    /* ======================================================================
       ① 时钟
       ====================================================================== */
    var N26W2 = {};

    N26W2.clock = function (s) {
        var t = tier(s), now = new Date();
        var hh = pad(now.getHours()), mm = pad(now.getMinutes()), ss = pad(now.getSeconds());
        var md = (now.getMonth() + 1) + '月' + now.getDate() + '日';
        var wd = WD[now.getDay()];
        var pct = Math.round(((now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400) * 100);
        var wk = isoWeek(now);
        var time = '<span class="widget-clock-time nx-hero"><span class="hh">' + hh + '</span>'
            + '<span class="nx-colon">:</span><span class="mm">' + mm + '</span></span>';

        if (t === 'bar') {
            return wrap('clock', t,
                time
                + '<span class="nx-sub nx-clk-bar-date">' + md + ' · ' + wd + '</span>'
                + '<span class="nx-bar nx-clk-mini"><span class="nx-fill" style="width:' + pct + '%"></span></span>'
                + '<span class="nx-sub nx-clk-pct" data-clk-p>' + pct + '%</span>');
        }
        if (t === 's') {
            return wrap('clock', t,
                '<div class="nx-center">' + time
                + '<div class="nx-sub nx-clk-date">' + md + ' · ' + wd + '</div></div>');
        }
        if (t === 'm2') {
            return wrap('clock', t,
                '<div class="nx-clk-split">'
                + '<div class="nx-clk-left">' + time + '<div class="nx-sub">' + md + ' ' + wd + '</div></div>'
                + '<div class="nx-clk-right">'
                + '<div class="nx-clk-kv"><b data-clk-p>' + pct + '%</b><span>今日已过</span></div>'
                + bar(pct)
                + '<div class="nx-sub">第 ' + wk + ' 周 · ' + ss + ' 秒</div>'
                + '</div></div>');
        }
        if (t === 'm3') {
            var greet = now.getHours() < 6 ? '夜深了' : now.getHours() < 11 ? '早上好' : now.getHours() < 14 ? '中午好' : now.getHours() < 18 ? '下午好' : '晚上好';
            return wrap('clock', t,
                '<div class="nx-hd">' + I('fa-clock') + '<span>' + greet + '</span>'
                + '<span class="nx-hd-sub">第 ' + wk + ' 周</span></div>'
                + '<div class="nx-clk-mid">' + time
                + '<span class="nx-clk-sec">' + I('fa-arrow-right') + '<b data-clk-s>' + ss + '</b> 秒</span></div>'
                + '<div class="nx-sub">' + now.getFullYear() + '年 ' + md + ' · ' + wd + '</div>'
                + '<div class="nx-clk-kv"><b data-clk-p>' + pct + '%</b><span>今日已过</span></div>'
                + bar(pct));
        }
        /* l：一周七天条 */
        var yStart = new Date(now.getFullYear(), 0, 1);
        var yEnd = new Date(now.getFullYear() + 1, 0, 1);
        var ypct = Math.round((now - yStart) / (yEnd - yStart) * 100);
        var todayIdx = (now.getDay() + 6) % 7; // 周一=0
        var strip = '';
        for (var i = 0; i < 7; i++) {
            var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIdx + i);
            strip += '<div class="nx-clk-day' + (i === todayIdx ? ' on' : '') + '">'
                + '<span>周' + WD1[d.getDay()] + '</span><b>' + d.getDate() + '</b></div>';
        }
        return wrap('clock', t,
            '<div class="nx-clk-l">' + time
            + '<span class="nx-clk-sec">' + I('fa-arrow-right') + '<b data-clk-s>' + ss + '</b> 秒</span></div>'
            + '<div class="nx-sub">' + now.getFullYear() + '年 ' + md + ' · ' + wd + ' · 第 ' + wk + ' 周</div>'
            + '<div class="nx-clk-kv"><b data-clk-p>' + pct + '%</b><span>今日已过</span></div>'
            + bar(pct)
            + '<div class="nx-clk-days">' + strip + '</div>'
            + '<div class="nx-clk-tl"><div class="nx-clk-tl-hd"><span>今天的时间线</span><span data-clk-p2>' + pct + '%</span></div>'
            + '<div class="nx-clk-tl-track"><span data-clk-marker style="left:' + pct + '%"></span></div>'
            + '<div class="nx-clk-tl-ax"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div></div>'
            + '<div class="nx-clk-foot"><span class="nx-wx-chip">' + I('fa-hourglass-half') + '距明天 ' + (23 - now.getHours()) + ' 小时 ' + (59 - now.getMinutes()) + ' 分</span>'
            + '<span class="nx-wx-chip">' + I('fa-calendar') + '本周还剩 ' + (7 - ((now.getDay() + 6) % 7) - 1) + ' 天</span></div>'
            + '<div class="nx-clk-yr"><span class="nx-sub">' + now.getFullYear() + ' 年已过 ' + ypct + '%</span>'
            + bar(ypct, 'nx-clk-yr-bar') + '</div>');
    };

    /* ======================================================================
       ② 天气（真实共享状态）
       ====================================================================== */
    function wxIcon(code, kind, day) {
        var k = String(kind || '');
        if (k === 'rain') return 'fa-cloud-rain';
        if (k === 'snow') return 'fa-snowflake';
        if (k === 'storm') return 'fa-cloud-bolt';
        if (k === 'cloudy') return 'fa-cloud';
        if (k === 'fog') return 'fa-smog';
        if (k === 'partly') return day === false ? 'fa-cloud-moon' : 'fa-cloud-sun';
        if (k === 'clear') return day === false ? 'fa-moon' : 'fa-sun';
        var n = parseInt(code, 10);
        if (!isFinite(n)) return day === false ? 'fa-cloud-moon' : 'fa-cloud-sun';
        if (n === 900) return 'fa-temperature-high';
        if (n === 901) return 'fa-temperature-low';
        if (n >= 302 && n <= 304) return 'fa-cloud-bolt';
        if (n >= 300 && n <= 399) return (n >= 306 && n <= 318) ? 'fa-cloud-showers-heavy' : 'fa-cloud-rain';
        if (n >= 400 && n <= 499) return 'fa-snowflake';
        if (n >= 503 && n <= 508) return 'fa-wind';
        if (n >= 500 && n <= 515) return 'fa-smog';
        if (n === 104) return 'fa-cloud';
        if (n >= 150 && n <= 153) return 'fa-cloud-moon';
        if (n === 100) return day === false ? 'fa-moon' : 'fa-sun';
        if (n >= 101 && n <= 103) return day === false ? 'fa-cloud-moon' : 'fa-cloud-sun';
        return 'fa-cloud';
    }
    function wxTemp(o, f) {
        var v = Number(o && (f ? o.f : o.c));
        return isFinite(v) ? Math.round(v) : null;
    }
    N26W2.weather = function (s) {
        var t = tier(s);
        var st = wState();
        var ok = !!(st && st.temp && isFinite(Number(st.temp.c)));
        if (!ok) {
            if (t === 'bar') {
                return wrap('weather', t, I('fa-cloud-sun', 'nx-wx-ic')
                    + '<span class="nx-wx-city">天气</span>'
                    + '<span class="nx-sub">暂无实况 · 打开天气获取</span>');
            }
            return wrap('weather', t,
                '<div class="nx-hd">' + I('fa-cloud-sun') + '<span>天气</span></div>'
                + empty('fa-cloud-sun', '暂无实况', '联网后自动更新'));
        }
        var f = String(st.unit || 'c').toLowerCase() === 'f';
        var temp = wxTemp(st.temp, f), hi = wxTemp(st.high, f), lo = wxTemp(st.low, f);
        var wind = st.wind || {};
        var city = (st.city && st.city.name) || '天气';
        var text = (st.condition && st.condition.text) || '—';
        var ico = wxIcon(st.condition && st.condition.code, st.condition && st.condition.kind, true);
        var windTxt = ((wind.dir || '') + (wind.scale ? ' ' + wind.scale + '级' : '')).trim() || '—';
        var hum = st.humidity != null && isFinite(Number(st.humidity)) ? Math.round(Number(st.humidity)) + '%' : '—';
        var popVal = null;
        (Array.isArray(st.hourly) ? st.hourly : []).slice(0, 6).forEach(function (h) {
            if (h && h.pop != null && isFinite(Number(h.pop))) popVal = Math.round(Number(h.pop));
        });
        var air = st.air && isFinite(Number(st.air.aqi)) ? (st.air.category || '') + ' ' + st.air.aqi : null;
        var sun = (st.sunrise && st.sunset) ? st.sunrise + ' / ' + st.sunset : '—';

        if (t === 'bar') {
            return wrap('weather', t, I(ico, 'nx-wx-ic')
                + '<span class="nx-wx-city">' + E(city) + '</span>'
                + '<b class="nx-wx-temp-sm">' + (temp != null ? temp + '°' : '--') + '</b>'
                + '<span class="nx-sub">' + E(text) + '</span>'
                + '<span class="nx-wx-chip">' + I('fa-arrow-up') + (hi != null ? hi + '°' : '—') + '</span>'
                + '<span class="nx-wx-chip">' + I('fa-arrow-down') + (lo != null ? lo + '°' : '—') + '</span>'
                + '<span class="nx-wx-chip">' + I('fa-droplet') + hum + '</span>'
                + '<span class="nx-wx-push"></span>'
                + '<span class="nx-wx-chip">' + I('fa-umbrella') + '降水 ' + (popVal != null ? popVal + '%' : '—') + '</span>'
                + '<span class="nx-wx-chip nx-wx-wind">' + I('fa-wind') + E(windTxt) + '</span>'
                + '<span class="nx-wx-chip">' + I('fa-leaf') + '空气 ' + (air || '—') + '</span>');
        }
        if (t === 's') {
            return wrap('weather', t,
                '<div class="nx-wx-top"><span class="nx-wx-city">' + E(city) + '</span>' + I(ico, 'nx-wx-ic') + '</div>'
                + '<div class="nx-wx-temp">' + (temp != null ? temp + '°' : '--') + '</div>'
                + '<div class="nx-sub">' + E(text) + ' · ' + (hi != null ? hi : '—') + '° / ' + (lo != null ? lo : '—') + '°</div>');
        }
        if (t === 'm2') {
            return wrap('weather', t,
                '<div class="nx-wx-m2">'
                + '<div class="nx-wx-left">' + I(ico, 'nx-wx-ic') + '<b class="nx-wx-temp">' + (temp != null ? temp + '°' : '--') + '</b>'
                + '<span class="nx-sub">' + E(city) + ' · ' + E(text) + '</span></div>'
                + '<div class="nx-wx-right">'
                + '<div class="nx-wx-kv"><span>最高 / 最低</span><b>' + (hi != null ? hi : '—') + '° / ' + (lo != null ? lo : '—') + '°</b></div>'
                + '<div class="nx-wx-kv"><span>湿度</span><b>' + hum + '</b></div>'
                + '<div class="nx-wx-kv"><span>风</span><b>' + E(windTxt) + '</b></div>'
                + '<div class="nx-wx-kv"><span>降水概率</span><b>' + (popVal != null ? popVal + '%' : '—') + '</b></div>'
                + '</div></div>');
        }
        /* 逐时（真实 hourly；没有就明确空态） */
        function hoursBlock(n) {
            var hourly = Array.isArray(st.hourly) ? st.hourly.slice(0, n) : [];
            if (!hourly.length) return '<div class="nx-sub nx-wx-nofc">逐时预报暂无</div>';
            return hourly.map(function (h) {
                var hm = /(\d{1,2}):\d{2}/.exec(String(h.time || h.fxTime || ''));
                var label = hm ? pad(+hm[1]) + ':00' : '—';
                var hv = wxTemp(h.temp, f);
                var hc = h.condition && h.condition.kind;
                return '<div class="nx-wx-hour">' + I(wxIcon(h.code, hc, true))
                    + '<b>' + (hv != null ? hv + '°' : '—') + '</b>'
                    + '<span>' + label + '</span></div>';
            }).join('');
        }
        function cell(label, val) {
            return '<div class="nx-wx-cell"><span>' + label + '</span><b>' + val + '</b></div>';
        }
        var metrics = '<div class="nx-wx-grid">'
            + cell('风速', (st.wind && st.wind.speedKmh != null) ? st.wind.speedKmh + ' km/h' : '—')
            + cell('降水概率', popVal != null ? popVal + '%' : '—')
            + cell('空气质量', air || '—')
            + cell('日出 / 日落', sun)
            + '</div>';
        /* 逐日（真实 daily；没有就明确空态） */
        function daysBlock(n) {
            var daily = Array.isArray(st.daily) ? st.daily.slice(0, n) : [];
            if (!daily.length) return '<div class="nx-sub nx-wx-nofc">逐日预报暂无</div>';
            return daily.map(function (d, i) {
                var dt = new Date(String(d.date || d.fxDate || '') + 'T00:00:00');
                var name = i === 0 ? '今天' : (i === 1 ? '明天' : (isNaN(dt.getTime()) ? '第' + (i + 1) + '天' : '周' + WD1[dt.getDay()]));
                var dh = wxTemp(d.high, f), dl = wxTemp(d.low, f);
                return '<div class="nx-wx-day"><span>' + name + '</span>'
                    + I(wxIcon(d.code, d.condition && d.condition.kind, true))
                    + '<b>' + (dh != null ? dh : '—') + '°</b><small>' + (dl != null ? dl : '—') + '°</small></div>';
            }).join('');
        }
        if (t === 'm3') {
            return wrap('weather', t,
                hd(ico, E(city), E(text))
                + '<div class="nx-wx-m3-top"><b class="nx-wx-temp">' + (temp != null ? temp + '°' : '--') + '</b>'
                + '<span class="nx-wx-chips"><span>' + I('fa-arrow-up') + (hi != null ? hi + '°' : '—') + '</span>'
                + '<span>' + I('fa-arrow-down') + (lo != null ? lo + '°' : '—') + '</span>'
                + '<span>' + I('fa-droplet') + hum + '</span>'
                + '<span>' + I('fa-wind') + E(windTxt) + '</span></span></div>'
                + '<div class="nx-wx-hours">' + hoursBlock(6) + '</div>'
                + metrics
                + '<div class="nx-wx-days">' + daysBlock(2) + '</div>');
        }
        return wrap('weather', t,
            hd(ico, E(city), E(text))
            + '<div class="nx-wx-m3-top"><b class="nx-wx-temp">' + (temp != null ? temp + '°' : '--') + '</b>'
            + '<span class="nx-wx-chips"><span>' + I('fa-arrow-up') + (hi != null ? hi + '°' : '—') + '</span>'
            + '<span>' + I('fa-arrow-down') + (lo != null ? lo + '°' : '—') + '</span>'
            + '<span>' + I('fa-droplet') + hum + '</span>'
            + '<span>' + I('fa-wind') + E(windTxt) + '</span></span></div>'
            + '<div class="nx-wx-hours">' + hoursBlock(6) + '</div>'
            + metrics
            + '<div class="nx-wx-days">' + daysBlock(3) + '</div>');
    };

    /* ======================================================================
       ③ 日历
       ====================================================================== */
    N26W2.calendar = function (s) {
        var t = tier(s), today = new Date();
        var y = Number(s && s.year), m = Number(s && s.month);
        if (!isFinite(y) || y < 1970) y = today.getFullYear();
        if (!isFinite(m) || m < 0 || m > 11) m = today.getMonth();
        var monthName = (m + 1) + '月';

        var tdAll = todos();
        var undoneAll = tdAll.filter(function (x) { return !x.done; });
        if (t === 'bar') {
            var dim = new Date(y, m + 1, 0).getDate();
            return wrap('calendar', t,
                '<span class="nx-cal-bar-y">' + y + '年' + monthName + '</span>'
                + '<b class="nx-cal-bar-d">' + today.getDate() + '</b>'
                + '<span class="nx-sub">' + WD[today.getDay()] + '</span>'
                + '<span class="nx-wx-chip">' + I('fa-calendar') + '第 ' + isoWeek(today) + ' 周</span>'
                + '<span class="nx-wx-push"></span>'
                + '<span class="nx-wx-chip">' + I('fa-list-check') + '今日待办 ' + undoneAll.length + ' 项</span>'
                + '<span class="nx-wx-chip">' + I('fa-hourglass-half') + '距月底 ' + (dim - today.getDate()) + ' 天</span>');
        }
        if (t === 's') {
            return wrap('calendar', t,
                '<div class="nx-cal-s">'
                + '<div class="nx-sub">' + y + ' · ' + monthName + '</div>'
                + '<b class="nx-cal-s-d">' + today.getDate() + '</b>'
                + '<div class="nx-sub">' + WD[today.getDay()] + '</div></div>');
        }

        /* 本周 7 天条（m2） */
        function weekStrip() {
            var base = (today.getDay() + 6) % 7;
            var out = '';
            for (var i = 0; i < 7; i++) {
                var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - base + i);
                var on = d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
                out += '<div class="nx-cal-wd' + (on ? ' on' : '') + '"><span>' + WD1[d.getDay()] + '</span><b>' + d.getDate() + '</b></div>';
            }
            return out;
        }
        var tdAll = todos();
        var undoneAll = tdAll.filter(function (x) { return !x.done; });
        function agenda(n, caps) {
            if (!undoneAll.length) {
                return '<div class="nx-cal-emp">' + I('fa-check') + '<span>今天没有待办</span></div>';
            }
            return undoneAll.slice(0, n).map(function (x) {
                return '<div class="nx-li nx-cal-ai">' + I('fa-circle', 'nx-dot')
                    + '<span class="nx-sub">' + E(cut(x.text, caps)) + '</span></div>';
            }).join('');
        }
        if (t === 'm2') {
            return wrap('calendar', t,
                hd('fa-calendar', y + '年' + monthName, '第 ' + isoWeek(today) + ' 周')
                + '<div class="nx-cal-week">' + weekStrip() + '</div>'
                + '<div class="nx-cal-m2f"><div class="nx-cal-ag-h">今日安排 <span class="nx-sub">'
                + undoneAll.length + ' 项</span></div>' + agenda(2, 22) + '</div>');
        }

        /* 整月网格（m3 / l） */
        var first = new Date(y, m, 1).getDay();
        var days = new Date(y, m + 1, 0).getDate();
        var prev = new Date(y, m, 0).getDate();
        var cells = '';
        for (var p = first - 1; p >= 0; p--) cells += '<div class="nx-cal-cell other">' + (prev - p) + '</div>';
        for (var d2 = 1; d2 <= days; d2++) {
            var isToday = y === today.getFullYear() && m === today.getMonth() && d2 === today.getDate();
            cells += '<div class="nx-cal-cell' + (isToday ? ' on' : '') + '">' + d2 + '</div>';
        }
        var rest = 42 - (first + days);
        var nxMonth = 1;
        for (var q = 0; q < rest; q++) cells += '<div class="nx-cal-cell other">' + (nxMonth++) + '</div>';
        var head = '<div class="nx-cal-hd">'
            + '<button class="nx-cal-nav" onclick="event.stopPropagation();calendarWidgetPrev()" title="上个月">' + I('fa-chevron-left') + '</button>'
            + '<span>' + y + '年' + monthName + '</span>'
            + '<button class="nx-cal-nav" onclick="event.stopPropagation();calendarWidgetNext()" title="下个月">' + I('fa-chevron-right') + '</button>'
            + '</div>';
        var wdRow = '<div class="nx-cal-wdr">' + WD1.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>';
        var grid = '<div class="nx-cal-grid">' + cells + '</div>';
        var monthPct = Math.round(today.getDate() / days * 100);
        var monthFoot = '<div class="nx-cal-foot"><span class="nx-sub">本月已过</span>'
            + bar(monthPct) + '<b>' + today.getDate() + '/' + days + '</b></div>';
        if (t === 'm3') {
            return wrap('calendar', t, head + wdRow + grid + monthFoot);
        }

        /* l：网格 + 今日安排（真实待办）+ 本月/本年剩余 */
        var daysLeft = days - today.getDate();
        var yearLeft = Math.round((new Date(y + 1, 0, 1) - today) / 86400000);
        var chips = '<div class="nx-cal-chips">'
            + '<span>距月底 <b>' + daysLeft + '</b> 天</span>'
            + '<span>今年剩 <b>' + yearLeft + '</b> 天</span>'
            + '<span>第 <b>' + isoWeek(today) + '</b> 周</span></div>';
        return wrap('calendar', t,
            head + wdRow + grid
            + '<div class="nx-cal-ag"><div class="nx-cal-ag-h">今日安排 <span class="nx-sub">'
            + undoneAll.length + ' 项</span></div>' + agenda(3, 30) + '</div>'
            + chips
            + monthFoot);
    };

    /* ======================================================================
       ④ 系统信息（真实设备数据）
       ====================================================================== */
    /* ---------------- 存储占用：旧更新器只认旧 DOM，这里自读并回填 ---------------- */
    function sysPaintDisk(d, bytes) {
        document.querySelectorAll('.desktop-widget-card[data-type="system"] [data-k="disk-pct"]').forEach(function (el) {
            el.textContent = d <= 0 ? '<1%' : d + '%';
        });
        document.querySelectorAll('.desktop-widget-card[data-type="system"] [data-k="disk-bytes"]').forEach(function (el) {
            el.textContent = bytes || (d <= 0 ? '<1%' : d + '%');
        });
        document.querySelectorAll('.desktop-widget-card[data-type="system"] [data-k="disk-bar"]').forEach(function (el) {
            el.style.width = Math.min(100, Math.max(0, d)) + '%';
        });
    }
    function sysEstimate() {
        try {
            if (!navigator.storage || !navigator.storage.estimate) return;
            navigator.storage.estimate().then(function (est) {
                if (!est || !est.quota) return;
                var d = Math.round((est.usage || 0) / est.quota * 100);
                var bytes = null;
                try {
                    if (typeof n26SysBytes === 'function') bytes = n26SysBytes(est.usage) + ' / ' + n26SysBytes(est.quota);
                } catch (e) { }
                try {
                    if (typeof widgetSystemState !== 'undefined' && widgetSystemState) {
                        widgetSystemState.disk = d;
                        if (bytes) widgetSystemState.diskBytes = bytes;
                    }
                } catch (e) { }
                sysPaintDisk(d, bytes);
            }).catch(function () { });
        } catch (e) { }
    }

    N26W2.system = function (s) {
        var t = tier(s);
        try { if (typeof n26SystemReadReal === 'function') n26SystemReadReal(); } catch (e) { }
        var st = (typeof widgetSystemState !== 'undefined') ? widgetSystemState : { cores: 0, mem: null, disk: null };
        var mem = (st && typeof st.mem === 'number' && isFinite(st.mem)) ? st.mem : null;
        var disk = (st && typeof st.disk === 'number' && isFinite(st.disk)) ? st.disk : null;
        var diskBytes = (st && st.diskBytes) ? st.diskBytes : null;
        var cores = (st && st.cores) ? st.cores + ' 核' : '—';
        var memTxt = mem == null ? '不可读' : (mem <= 0 ? '<1%' : Math.round(mem) + '%');
        var diskTxt = disk == null ? '—' : (disk <= 0 ? '<1%' : Math.round(disk) + '%');
        var scr = '';
        try { scr = screen.width + '×' + screen.height; } catch (e) { }
        var dpr = (typeof devicePixelRatio !== 'undefined') ? devicePixelRatio : 1;
        var plat = '';
        try { plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''; } catch (e) { }
        var tz = '';
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { }
        if (disk == null || diskBytes == null) sysEstimate();

        if (t === 'bar') {
            return wrap('system', t,
                '<span class="nx-wx-chip">' + I('fa-microchip') + cores + '</span>'
                + '<span class="nx-wx-chip">' + I('fa-memory') + '内存 ' + memTxt + '</span>'
                + '<span class="nx-wx-chip">' + I('fa-hdd') + '存储 <span data-k="disk-pct">' + diskTxt + '</span></span>'
                + '<span class="nx-wx-chip nx-sys-scr">' + I('fa-display') + scr + '</span>');
        }
        if (t === 's') {
            return wrap('system', t,
                '<div class="nx-sys-hero"><b>' + memTxt + '</b><span>内存占用</span></div>'
                + bar(mem == null ? 0 : mem)
                + '<div class="nx-sub">' + cores + ' · 存储 <span data-k="disk-pct">' + diskTxt + '</span></div>');
        }
        if (t === 'm2') {
            return wrap('system', t,
                '<div class="nx-sys-cols">'
                + '<div class="nx-sys-col">' + I('fa-microchip') + '<b>' + cores + '</b><span>核心</span></div>'
                + '<div class="nx-sys-col">' + I('fa-memory') + '<b>' + memTxt + '</b><span>内存</span>'
                + bar(mem == null ? 0 : mem) + '</div>'
                + '<div class="nx-sys-col">' + I('fa-hdd') + '<b data-k="disk-pct">' + diskTxt + '</b><span>存储</span>'
                + bar(disk == null ? 0 : disk, '', ' data-k="disk-bar"') + '</div></div>');
        }
        function row(ico, label, val, pct, key) {
            return '<div class="nx-sys-row">' + I(ico)
                + '<span class="nx-sys-lb">' + label + '</span>'
                + '<b class="nx-sys-vl"' + (key ? ' data-k="' + key + '"' : '') + '>' + val + '</b>'
                + (pct != null ? bar(pct, 'nx-sys-bar', key ? ' data-k="disk-bar"' : '') : '') + '</div>';
        }
        if (t === 'm3') {
            return wrap('system', t,
                hd('fa-microchip', '系统', '实时')
                + row('fa-microchip', '核心', cores, null)
                + row('fa-memory', '内存', memTxt, mem)
                + row('fa-hdd', '存储', diskTxt, disk, 'disk-pct')
                + row('fa-display', '屏幕', scr + ' @' + dpr + 'x', null));
        }
        return wrap('system', t,
            hd('fa-microchip', '系统信息', '实时读取')
            + row('fa-microchip', '处理器核心', cores, null)
            + row('fa-memory', 'JS 堆内存', memTxt, mem)
            + row('fa-hdd', '浏览器存储', diskBytes ? diskBytes : diskTxt, disk, 'disk-bytes')
            + row('fa-display', '屏幕', scr + ' @' + dpr + 'x', null)
            + row('fa-laptop', '平台', E(plat || '—'), null)
            + row('fa-globe', '时区', E(tz || '—'), null));
    };

    /* ======================================================================
       ⑤ 小游戏（只列真实存在的 2048 / 小游戏合集）
       ====================================================================== */
    function best2048() {
        try {
            var v = getUserLS('game2048_best');
            var n = Number(v);
            return isFinite(n) && n > 0 ? Math.round(n) : null;
        } catch (e) { return null; }
    }
    N26W2.minigame = function (s) {
        var t = tier(s);
        var best = best2048();
        var bestTxt = best == null ? '暂无记录' : '最高 ' + best;
        var tile2048 = '<button class="nx-tile nx-mg-tile" onclick="event.stopPropagation();openApp(\'game2048\')">'
            + I('fa-th', 'nx-mg-ic') + '<b>2048</b><span>' + bestTxt + '</span></button>';
        var tileGames = '<button class="nx-tile nx-mg-tile" onclick="event.stopPropagation();openApp(\'games\')">'
            + I('fa-gamepad', 'nx-mg-ic') + '<b>小游戏合集</b><span>更多玩法</span></button>';

        if (t === 'bar') {
            return wrap('minigame', t,
                '<button class="nx-mg-bar-btn" onclick="event.stopPropagation();openApp(\'game2048\')">' + I('fa-th')
                + '2048 <span class="nx-sub">' + bestTxt + '</span></button>'
                + '<span class="nx-mg-div"></span>'
                + '<button class="nx-mg-bar-btn" onclick="event.stopPropagation();openApp(\'games\')">' + I('fa-gamepad')
                + '小游戏合集</button>'
                + '<span class="nx-wx-push"></span>'
                + '<span class="nx-wx-chip">' + I('fa-trophy') + '2048 最高 ' + (best == null ? '—' : best) + '</span>'
                + '<span class="nx-sub">本地记录</span>');
        }
        if (t === 's') {
            return wrap('minigame', t, tile2048);
        }
        if (t === 'm2') {
            return wrap('minigame', t, '<div class="nx-mg-2">' + tile2048 + tileGames + '</div>');
        }
        if (t === 'm3') {
            return wrap('minigame', t,
                hd('fa-gamepad', '快速开始', bestTxt)
                + '<div class="nx-mg-2 nx-mg-big">' + tile2048 + tileGames + '</div>'
                + '<div class="nx-sub">4×4 数字合并 · 浏览器本地存档</div>');
        }
        return wrap('minigame', t,
            hd('fa-gamepad', '游戏中心', bestTxt)
            + '<div class="nx-mg-2 nx-mg-big">' + tile2048 + tileGames + '</div>'
            + '<div class="nx-mg-best">' + I('fa-trophy')
            + '<b>' + (best == null ? '—' : best) + '</b>'
            + '<span>' + (best == null ? '还没有 2048 记录' : '2048 历史最高分') + '</span></div>'
            + '<div class="nx-mg-tips">'
            + '<div>' + I('fa-keyboard') + '<span>方向键 / 滑动合并相同数字</span></div>'
            + '<div>' + I('fa-floppy-disk') + '<span>最高分只存本机，不上传</span></div>'
            + '<div>' + I('fa-arrow-pointer') + '<span>点击磁贴直接打开应用</span></div></div>'
            + '<div class="nx-sub">最高分来自 game2048_best，本地持久化</div>');
    };

    /* ======================================================================
       ⑥ 双区时间
       ====================================================================== */
    N26W2.dualtime = function (s) {
        var t = tier(s);
        var presets = (typeof N26_TZ_PRESETS !== 'undefined') ? N26_TZ_PRESETS : [];
        var sel = (s && s.tz) || (typeof n26WGet === 'function' ? n26WGet('dualtimeTZ', 'America/New_York') : 'America/New_York');
        var p = presets.filter(function (x) { return x.tz === sel; })[0] || presets[7] || { tz: 'America/New_York', label: '纽约', en: 'New York' };
        var now = new Date();
        var bj = (typeof n26FmtTZ === 'function') ? n26FmtTZ(now, 'Asia/Shanghai') : pad(now.getHours()) + ':' + pad(now.getMinutes());
        var ot = (typeof n26FmtTZ === 'function') ? n26FmtTZ(now, p.tz) : bj;
        var bjDate = pad(now.getMonth() + 1) + '/' + pad(now.getDate());
        var off = (typeof n26TZOffsetLabel === 'function') ? n26TZOffsetLabel(p.tz) : '';
        var otDate = '', otWd = '';
        try {
            otDate = new Intl.DateTimeFormat('zh-CN', { timeZone: p.tz, month: '2-digit', day: '2-digit' }).format(now);
            otWd = new Intl.DateTimeFormat('zh-CN', { timeZone: p.tz, weekday: 'short' }).format(now);
        } catch (e) { }
        var oh = Number(String(ot).split(':')[0]);
        var bjOh = now.getHours();
        var otDay = oh >= 6 && oh < 18, bjDay = bjOh >= 6 && bjOh < 18;
        var mOff = /([+-])(\d+)/.exec(off || '');
        var diff = mOff ? Math.abs(8 - ((mOff[1] === '-' ? -1 : 1) * Number(mOff[2]))) : null;
        var diffTxt = diff != null ? '时差 ' + diff + ' 小时' : '时差 —';
        var foot = '<div class="nx-dual-foot">'
            + '<span class="nx-dual-chip">' + I('fa-clock-rotate-left') + diffTxt + '</span>'
            + '<span class="nx-dual-chip">' + I(bjDay ? 'fa-sun' : 'fa-moon') + '北京' + (bjDay ? '白天' : '夜间') + '</span>'
            + '<span class="nx-dual-chip">' + I(otDay ? 'fa-sun' : 'fa-moon') + E(p.label) + (otDay ? '白天' : '夜间') + '</span></div>';

        var rootAttr = ' onmousedown="event.stopPropagation()"';
        if (t === 'bar') {
            return wrap('dualtime', t,
                '<span class="nx-dual-bar-city">北京</span><b class="nx-dual-bar-t" data-dual="bj">' + bj + '</b>'
                + '<span class="nx-mg-div"></span>'
                + '<span class="nx-dual-bar-city">' + E(p.label) + '</span><b class="nx-dual-bar-t nx-accent" data-dual="other">' + ot + '</b>'
                + '<span class="nx-sub">' + E(off) + '</span>'
                + '<span class="nx-wx-push"></span>'
                + '<span class="nx-wx-chip">' + I('fa-clock-rotate-left') + diffTxt + '</span>'
                + '<span class="nx-wx-chip">' + I(bjDay ? 'fa-sun' : 'fa-moon') + E(p.label) + (otDay ? '白天' : '夜间') + '</span>', rootAttr);
        }
        if (t === 's') {
            return wrap('dualtime', t,
                '<div class="nx-dual-s">'
                + '<div class="nx-dual-s-row"><span>北京</span><b data-dual="bj">' + bj + '</b></div>'
                + '<div class="nx-dual-s-row nx-dual-pick" onclick="n26DualTimeSwitch(event,' + now.getTime() + ')" title="点击切换城市">'
                + '<span>' + E(p.label) + '</span><b data-dual="other">' + ot + '</b></div></div>', rootAttr);
        }
        if (t === 'm2') {
            return wrap('dualtime', t,
                '<div class="nx-dual-2">'
                + '<div class="nx-dual-col"><span>北京 · UTC+8</span><b data-dual="bj">' + bj + '</b><small>' + bjDate + ' ' + WD[now.getDay()] + '</small></div>'
                + '<div class="nx-dual-col nx-dual-pick" onclick="n26DualTimeSwitch(event,' + now.getTime() + ')" title="点击切换城市">'
                + '<span>' + E(p.label) + ' · ' + E(off) + '</span><b data-dual="other">' + ot + '</b><small>' + E(otDate) + ' ' + E(otWd) + '</small></div></div>'
                + foot, rootAttr);
        }
        if (t === 'm3' || t === 'l') {
            return wrap('dualtime', t,
                hd('fa-earth-asia', '世界时钟', '北京 · ' + E(p.label))
                + '<div class="nx-dual-r"><span>北京</span><b data-dual="bj">' + bj + '</b><small>' + bjDate + ' ' + WD[now.getDay()] + '</small></div>'
                + '<div class="nx-dual-r nx-dual-pick" onclick="n26DualTimeSwitch(event,' + now.getTime() + ')" title="点击切换城市">'
                + '<span>' + E(p.label) + '</span><b data-dual="other">' + ot + '</b><small>' + E(otDate) + ' ' + E(otWd) + ' · ' + E(off) + '</small></div>'
                + foot, rootAttr);
        }
        /* 6×2 */
        return wrap('dualtime', t,
            '<div class="nx-dual-2">'
            + '<div class="nx-dual-col"><span>北京 · UTC+8</span><b data-dual="bj">' + bj + '</b>'
            + '<small>' + bjDate + ' · ' + WD[now.getDay()] + '</small></div>'
            + '<div class="nx-dual-col nx-dual-pick" onclick="n26DualTimeSwitch(event,' + now.getTime() + ')" title="点击切换城市">'
            + '<span>' + E(p.label) + ' · ' + E(off) + '</span><b data-dual="other">' + ot + '</b>'
            + '<small>' + E(otDate) + ' · ' + E(otWd) + '</small></div></div>'
            + foot, rootAttr);
    };

    /* ======================================================================
       ⑦ 快捷启动
       ====================================================================== */
    N26W2.quicklaunch = function (s) {
        var t = tier(s);
        var reg = (typeof appRegistry !== 'undefined') ? appRegistry : {};
        var ids = (s && s.apps) || (typeof n26WGet === 'function' ? n26WGet('quickApps', ['browser', 'music', 'terminal', 'settings', 'calculator', 'album']) : []);
        if (!Array.isArray(ids) || !ids.length) ids = ['browser', 'music', 'terminal', 'settings', 'calculator', 'album'];
        var ALIAS = { photos: 'album' };
        ids = ids.map(function (id) { return ALIAS[id] || id; });
        var max = t === 's' ? 4 : (t === 'bar' ? 6 : 6);
        ids = ids.slice(0, max);
        var btns = ids.map(function (id) {
            var r = reg[id] || {};
            var name = r.name || id;
            var ico = r.icon || 'fa-cube';
            return '<button class="nx-ql-btn" onclick="n26QuickLaunch(event,\'' + E(id) + '\')" title="' + E(name) + '">'
                + I(ico, 'nx-ql-ic') + '<span class="nx-ql-nm">' + E(name) + '</span></button>';
        }).join('');
        var edit = '<button class="nx-ql-btn nx-ql-edit" onclick="n26QuickLaunchEdit(event)" title="编辑快捷应用">'
            + I('fa-pen', 'nx-ql-ic') + '<span class="nx-ql-nm">编辑</span></button>';

        if (t === 'bar') {
            var SHORT = { browser: '浏览器', music: '音乐', terminal: '终端', settings: '设置', calculator: '计算器', album: '相册', photos: '相册', games: '小游戏', editor: '编辑器', mail: '邮件', notes: '备忘录' };
            var barBtns = ids.slice(0, 6).map(function (id) {
                var r = reg[id] || {};
                var name = r.name || id;
                var show = SHORT[id] || name;
                return '<button class="nx-ql-btn" onclick="n26QuickLaunch(event,\'' + E(id) + '\')" title="' + E(name) + '">'
                    + I(r.icon || 'fa-cube', 'nx-ql-ic') + '<span class="nx-ql-nm">' + E(show) + '</span></button>';
            }).join('');
            return wrap('quicklaunch', t,
                I('fa-bolt', 'nx-accent nx-ql-lead')
                + '<div class="nx-ql-bar">' + barBtns + edit + '</div>');
        }
        if (t === 's') {
            return wrap('quicklaunch', t, '<div class="nx-ql-grid nx-ql-g2">' + btns + '</div>');
        }
        if (t === 'm2') {
            return wrap('quicklaunch', t,
                hd('fa-bolt', '快捷启动', ids.length + ' 个') + '<div class="nx-ql-grid nx-ql-g3">' + btns + '</div>');
        }
        if (t === 'm3') {
            return wrap('quicklaunch', t,
                hd('fa-bolt', '快捷启动', ids.length + ' 个应用')
                + '<div class="nx-ql-grid nx-ql-g4">' + btns + edit + '</div>');
        }
        return wrap('quicklaunch', t,
            hd('fa-bolt', '快捷启动', ids.length + ' 个应用')
            + '<div class="nx-ql-grid nx-ql-g4 nx-ql-big">' + btns + edit + '</div>'
            + '<button class="nx-ql-foot" onclick="n26QuickLaunchEdit(event)">' + I('fa-pen') + '管理快捷方式</button>');
    };

    /* ======================================================================
       ⑧ 作息计划（只读用户真实数据；无数据明确空态）
       ====================================================================== */
    N26W2.schedule = function (s) {
        var t = tier(s);
        var raw = (typeof n26WGet === 'function') ? n26WGet('schedule', null) : null;
        var list = (Array.isArray(raw) && raw.length) ? raw : [];
        if (!list.length) {
            if (t === 'bar') {
                return wrap('schedule', t, I('fa-list-check', 'nx-accent')
                    + '<span class="nx-sub">今日作息 · 还没有安排</span>');
            }
            return wrap('schedule', t,
                '<div class="nx-hd">' + I('fa-list-check') + '<span>今日作息</span></div>'
                + empty('fa-list-check', '还没有安排', '暂无作息数据'));
        }
        var now = new Date();
        var cur = now.getHours() * 60 + now.getMinutes();
        var toMin = function (x) { var a = String(x.t || '0:0').split(':'); return (+a[0]) * 60 + (+a[1]); };
        var next = -1;
        for (var i = 0; i < list.length; i++) { if (toMin(list[i]) > cur) { next = i; break; } }
        var past = list.filter(function (x) { return toMin(x) <= cur; }).length;
        var pct = Math.round(past / list.length * 100);
        if (t === 'bar') {
            return wrap('schedule', t, I('fa-list-check', 'nx-accent')
                + '<span>' + (next >= 0 ? '下一项 ' + E(list[next].t) + ' · ' + E(list[next].n) : '今日已结束') + '</span>'
                + '<span class="nx-bar nx-sch-mini"><span class="nx-fill" style="width:' + pct + '%"></span></span>'
                + '<span class="nx-sub">' + past + '/' + list.length + '</span>');
        }
        var shown = t === 's' ? list.slice(0, 2) : (t === 'm2' ? list.slice(0, 3) : (t === 'm3' ? list.slice(0, 5) : list.slice(0, 7)));
        var rows = shown.map(function (x) {
            var idx = list.indexOf(x);
            var done = x.done ? ' done' : '';
            var isNext = idx === next ? ' next' : '';
            return '<div class="nx-li nx-sch-li' + done + isNext + '" onclick="n26ScheduleToggle(event,' + idx + ')">'
                + I(x.i || 'fa-circle', 'nx-sch-ic')
                + '<span class="nx-sch-t">' + E(x.t) + '</span>'
                + '<span class="nx-sch-n">' + E(cut(x.n, t === 's' ? 10 : 16)) + '</span>'
                + '<span class="nx-sch-ck">' + I('fa-check') + '</span></div>';
        }).join('');
        return wrap('schedule', t,
            hd('fa-list-check', '今日作息', (next >= 0 ? '下一项 ' + list[next].t : '已结束'))
            + bar(pct)
            + '<div class="nx-list">' + rows + '</div>'
            + '<div class="nx-sch-foot"><span>已完成 ' + past + ' / ' + list.length + '</span>'
            + '<span>' + (next >= 0 ? '下一项 ' + E(list[next].t) + ' · ' + E(cut(list[next].n, 12)) : '今天的安排已结束') + '</span></div>');
    };

    /* ======================================================================
       ⑨ 秒表
       ====================================================================== */
    function swState() {
        return (typeof widgetStopwatch !== 'undefined') ? widgetStopwatch : { mode: 'up', running: false, base: 0, startedAt: 0, target: 300000, laps: [] };
    }
    function fmtMs(ms) {
        if (typeof n26MsFmt === 'function') return n26MsFmt(ms);
        return String(Math.floor(ms / 1000));
    }
    N26W2.stopwatch = function (s) {
        var t = tier(s), st = swState();
        var ms = st.running ? (st.base + (Date.now() - st.startedAt)) : st.base;
        var show = st.mode === 'up' ? fmtMs(ms) : fmtMs(Math.max(0, st.target - ms));
        var runBtn = '<button class="nx-btn nx-btn-accent" onclick="n26SwToggle(event)">' + (st.running ? I('fa-pause') : I('fa-play'))
            + '<span>' + (st.running ? '暂停' : '开始') + '</span></button>';
        var laps = Array.isArray(st.laps) ? st.laps : [];
        var lapHtml = laps.slice(-3).reverse().map(function (l, n) {
            return '<div class="nx-li"><span class="nx-sub">#' + (laps.length - n) + '</span><b class="nx-sw-lap">' + fmtMs(l) + '</b></div>';
        }).join('');
        var timeEl = '<b class="nx-sw-time" id="wSwTime">' + show + '</b>';

        if (t === 'bar') {
            return wrap('stopwatch', t,
                '<span class="nx-sub">' + (st.mode === 'up' ? '正计时' : '倒计时') + '</span>'
                + timeEl
                + runBtn
                + '<button class="nx-btn" onclick="n26SwLap(event)">计次</button>'
                + '<button class="nx-btn" onclick="n26SwReset(event)">重置</button>');
        }
        if (t === 's') {
            return wrap('stopwatch', t,
                '<div class="nx-sw-top"><span class="nx-sub">' + (st.mode === 'up' ? '正计时' : '倒计时') + '</span>' + I('fa-stopwatch') + '</div>'
                + timeEl
                + '<div class="nx-sw-btns">' + runBtn
                + '<button class="nx-btn" onclick="n26SwReset(event)">' + I('fa-redo') + '</button></div>');
        }
        if (t === 'm2') {
            return wrap('stopwatch', t,
                '<div class="nx-sw-hd2"><span class="nx-sub">' + (st.mode === 'up' ? '正计时' : '倒计时') + '</span>' + timeEl + '</div>'
                + '<div class="nx-sw-btns">' + runBtn
                + '<button class="nx-btn" onclick="n26SwLap(event)">计次</button>'
                + '<button class="nx-btn" onclick="n26SwReset(event)">重置</button>'
                + '<button class="nx-btn" onclick="n26SwMode(event)" title="切换模式">' + I('fa-arrows-rotate') + '</button></div>'
                + '<div class="nx-sub">模式 ' + (st.mode === 'up' ? '正计时' : '倒计时') + ' · 计次 ' + laps.length + ' 次</div>');
        }
        return wrap('stopwatch', t,
            hd('fa-stopwatch', st.mode === 'up' ? '正计时' : '倒计时', laps.length ? laps.length + ' 次计次' : '')
            + timeEl
            + '<div class="nx-sw-btns">' + runBtn
            + '<button class="nx-btn" onclick="n26SwLap(event)">计次</button>'
            + '<button class="nx-btn" onclick="n26SwReset(event)">重置</button>'
            + '<button class="nx-btn" onclick="n26SwMode(event)">' + (st.mode === 'up' ? '倒计时' : '正计时') + '</button></div>'
            + '<div class="nx-list nx-sw-laps">' + (lapHtml
                || '<div class="nx-sw-emp">' + I('fa-flag-checkered') + '<span>计次记录会显示在这里</span></div>') + '</div>'
            + '<div class="nx-sw-foot"><span>模式 ' + (st.mode === 'up' ? '正计时' : '倒计时') + '</span>'
            + '<span>计次 ' + laps.length + '</span><span>目标 ' + fmtMs(st.target) + '</span></div>');
    };

    /* ======================================================================
       ⑩ 壁纸推荐
       ====================================================================== */
    function wpPool() {
        try { if (typeof n26WallpaperPool === 'function') return n26WallpaperPool() || []; } catch (e) { }
        try {
            return N26_WALLPAPERS.abstract.concat(N26_WALLPAPERS.island, N26_WALLPAPERS.minecraft, N26_WALLPAPERS.cleanlight);
        } catch (e) { return []; }
    }
    N26W2.wallpaperpick = function (s) {
        var t = tier(s), pool = wpPool();
        if (!pool.length) {
            return wrap('wallpaperpick', t, empty('fa-image', '暂无壁纸', '壁纸库为空'));
        }
        var n = t === 's' ? 4 : (t === 'm2' ? 4 : (t === 'm3' ? 6 : (t === 'l' ? 9 : 5)));
        var cur = '';
        try {
            /* 旧的 n26WallpaperPick 把 URL 当索引传给 setWallpaper(idx)，等于点了没反应；
               这里改为写自定义静态壁纸字段，并按该字段回显当前选中项 */
            var st = (typeof getUserLS === 'function' ? getUserLS('settings') : null) || {};
            cur = (st.useCustomWallpaper && st.customWallpaper) ? st.customWallpaper : '';
        } catch (e) { }
        var cells = '';
        for (var i = 0; i < n && i < pool.length; i++) {
            var on = cur && cur === pool[i];
            cells += '<button class="nx-wp-i' + (on ? ' nx-wp-on' : '') + '" onclick="N26W2.wpPick(event,' + i + ')" '
                + 'title="' + (on ? '当前壁纸' : '应用这张壁纸') + '">'
                + '<span class="nx-wp-ph">' + I('fa-image') + '</span>'
                + '<span class="nx-wp-img" style="background-image:url(\'' + pool[i] + '\')"></span>'
                + I('fa-check', 'nx-wp-ck') + '</button>';
        }
        if (t === 'bar') return wrap('wallpaperpick', t,
            I('fa-image', 'nx-accent') + '<span class="nx-sub">壁纸 · 点击更换</span>'
            + '<div class="nx-wp-bar">' + cells + '</div>');
        return wrap('wallpaperpick', t,
            hd('fa-image', '壁纸', '点击更换') + '<div class="nx-wp-g nx-wp-g' + n + '">' + cells + '</div>');
    };

    N26W2.wpPick = function (e, i) {
        if (e) e.stopPropagation();
        var src = wpPool()[i];
        if (!src) return;
        try {
            var s = (typeof getUserLS === 'function' ? getUserLS('settings') : null) || {};
            s.useCustomWallpaper = true;
            s.customWallpaper = src;
            s.useDynamicWallpaper = false;
            if (typeof setUserLS === 'function') setUserLS('settings', s);
            if (typeof applyUserSettings === 'function') applyUserSettings();
            if (typeof showNotification === 'function') showNotification('壁纸', '已更换桌面壁纸', 'success');
        } catch (err) { /* 失败保持原壁纸 */ }
    };

    /* ======================================================================
       ⑪ 倒计时
       ====================================================================== */
    N26W2.countdown = function (s) {
        var t = tier(s);
        var target = (typeof n26WGet === 'function') ? n26WGet('countdownTarget', '') : '';
        var days = null, targetTxt = '', wd = '';
        if (target) {
            var d = new Date(target + 'T00:00:00');
            if (!isNaN(d.getTime())) {
                days = Math.ceil((d - new Date()) / 86400000);
                targetTxt = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
                wd = WD[d.getDay()];
            }
        }
        if (days === null) {
            if (t === 'bar') {
                return wrap('countdown', t, I('fa-hourglass-half', 'nx-accent')
                    + '<span class="nx-sub">倒计时 · 未设置目标日期</span>'
                    + '<button class="nx-btn" onclick="n26CountdownSet(event)">设置</button>');
            }
            return wrap('countdown', t,
                hd('fa-hourglass-half', '倒计时', '未设置')
                + empty('fa-hourglass-half', '未设置日期', '点一下选择目标日')
                + '<button class="nx-btn nx-btn-accent nx-cd-set" onclick="n26CountdownSet(event)">选择日期</button>');
        }
        var label = days > 0 ? '天后' : (days === 0 ? '就是今天' : '天前');
        var num = Math.abs(days);
        var weeks = Math.ceil(Math.abs(days) / 7);
        var todayTxt = (new Date().getMonth() + 1) + ' 月 ' + new Date().getDate() + ' 日 ' + WD[new Date().getDay()];
        if (t === 'bar') {
            return wrap('countdown', t, I('fa-hourglass-half', 'nx-accent')
                + '<b class="nx-cd-bar-n">' + num + '</b><span class="nx-sub">' + label + '</span>'
                + '<span class="nx-wx-chip">' + I('fa-calendar') + targetTxt + '</span>'
                + '<button class="nx-btn" onclick="n26CountdownSet(event)">修改</button>');
        }
        if (t === 's') {
            return wrap('countdown', t,
                '<div class="nx-cd-l">' + I('fa-hourglass-half', 'nx-accent') + '<span>距离目标</span></div>'
                + '<div class="nx-cd-hero"><b>' + num + '</b><span>' + label + '</span></div>'
                + '<div class="nx-sub">' + targetTxt + '</div>');
        }
        if (t === 'm2') {
            return wrap('countdown', t,
                '<div class="nx-cd-hero"><b>' + num + '</b><span>' + label + '</span></div>'
                + '<div class="nx-cd-side">'
                + '<div class="nx-wx-kv"><span>目标日期</span><b>' + targetTxt + '</b></div>'
                + '<div class="nx-wx-kv"><span>星期</span><b>' + wd + '</b></div>'
                + '<button class="nx-btn" onclick="n26CountdownSet(event)">修改日期</button></div>');
        }
        if (t === 'm3') {
            return wrap('countdown', t,
                hd('fa-hourglass-half', '倒计时', targetTxt)
                + '<div class="nx-cd-hero nx-cd-m3b"><b>' + num + '</b><span>' + label + '</span></div>'
                + '<div class="nx-cd-kv"><div class="nx-wx-kv"><span>目标日期</span><b>' + targetTxt + '</b></div>'
                + '<div class="nx-wx-kv"><span>星期</span><b>' + wd + '</b></div>'
                + '<div class="nx-wx-kv"><span>还有</span><b>' + weeks + ' 周</b></div></div>'
                + '<div class="nx-sub">今天 ' + todayTxt + '</div>'
                + '<button class="nx-btn nx-btn-accent" onclick="n26CountdownSet(event)">' + I('fa-pen') + ' 修改目标日期</button>');
        }
        return wrap('countdown', t,
            hd('fa-hourglass-half', '倒计时', targetTxt)
            + '<div class="nx-cd-hero nx-cd-big"><b>' + num + '</b><span>' + label + '</span></div>'
            + '<div class="nx-cd-kv"><div class="nx-wx-kv"><span>目标日期</span><b>' + targetTxt + '</b></div>'
            + '<div class="nx-wx-kv"><span>星期</span><b>' + wd + '</b></div>'
            + '<div class="nx-wx-kv"><span>还有</span><b>' + weeks + ' 周</b></div></div>'
            + '<div class="nx-sub">今天 ' + todayTxt + '</div>'
            + '<button class="nx-btn nx-btn-accent" onclick="n26CountdownSet(event)">' + I('fa-pen') + ' 修改目标日期</button>');
    };

    /* ======================================================================
       ⑫ 剪贴板
       ====================================================================== */
    function cbItems() {
        try { var v = n26WGet('clipboard', []); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    N26W2.clipboard = function (s) {
        var t = tier(s), items = cbItems();
        var clr = '<button class="nx-icon-btn" onclick="n26ClipboardClear(event)" title="清空剪贴板">' + I('fa-trash') + '</button>';
        if (!items.length) {
            if (t === 'bar') return wrap('clipboard', t, I('fa-clipboard', 'nx-accent')
                + '<span class="nx-sub">剪贴板 · 暂无记录</span>' + clr);
            return wrap('clipboard', t,
                '<div class="nx-hd">' + I('fa-clipboard') + '<span>剪贴板</span><span class="nx-hd-sub">0 条</span>' + clr + '</div>'
                + empty('fa-clipboard', '暂无记录', '复制文字后自动出现'));
        }
        if (t === 'bar') {
            return wrap('clipboard', t, I('fa-clipboard', 'nx-accent')
                + '<span class="nx-sub">' + items.length + ' 条记录 · 最新：' + E(cut(items[0], 26)) + '</span>' + clr);
        }
        var n = t === 's' ? 0 : (t === 'm2' ? 2 : (t === 'm3' ? 4 : 6));
        var caps = t === 'm2' ? 30 : (t === 'm3' ? 42 : 52);
        if (t === 's') {
            return wrap('clipboard', t,
                '<div class="nx-cb-s"><b>' + items.length + '</b><span>条记录</span>'
                + '<small class="nx-sub">最近：' + E(cut(items[0], 16)) + '</small></div>');
        }
        var rows = items.slice(0, n).map(function (txt, i) {
            return '<button class="nx-cb-i" onclick="n26ClipboardCopy(event,' + i + ')" title="点击复制">'
                + I('fa-clipboard', 'nx-cb-ic') + '<span>' + E(cut(txt, caps + (t === 'l' ? 12 : 0))) + '</span></button>';
        }).join('');
        return wrap('clipboard', t,
            '<div class="nx-hd">' + I('fa-clipboard') + '<span>剪贴板</span><span class="nx-hd-sub">' + items.length + ' 条</span>' + clr + '</div>'
            + '<div class="nx-list nx-cb-list">' + rows + '</div>');
    };

    /* ======================================================================
       ⑬ 电池
       ====================================================================== */
    N26W2.battery = function (s) {
        var t = tier(s);
        try { if (typeof n26BatteryStart === 'function') n26BatteryStart(); } catch (e) { }
        var st = (typeof n26BatteryState !== 'undefined') ? n26BatteryState : { ok: false };
        if (!st || !st.ok) {
            if (t === 'bar') return wrap('battery', t, I('fa-battery-empty', 'nx-accent')
                + '<span class="nx-sub">电池 · 浏览器未开放电池信息</span>');
            return wrap('battery', t,
                '<div class="nx-hd">' + I('fa-battery-empty') + '<span>电池</span><span class="nx-hd-sub">不可用</span></div>'
                + empty('fa-battery-empty', '电池信息不可用', '浏览器未开放 Battery API'));
        }
        var pct = st.pct;
        var ico = st.charging ? 'fa-bolt' : (pct >= 80 ? 'fa-battery-full' : pct >= 50 ? 'fa-battery-three-quarters' : pct >= 25 ? 'fa-battery-half' : 'fa-battery-quarter');
        var status = st.charging ? '充电中' : '使用电池';
        var remain = st.secs ? '预计剩余 ' + (Math.round(st.secs / 60 * 10) / 10) + ' 小时' : '剩余时间未知';
        var pctEl = '<b class="w-bat-n nx-bat-n">' + pct + '<small>%</small></b>';
        var barEl = '<div class="nx-bar w-bat-bar"><span class="nx-fill w-bat-fill' + (pct <= 20 ? ' low' : '')
            + '" style="width:' + pct + '%"></span></div>';

        if (t === 'bar') {
            return wrap('battery', t, I(ico, 'nx-accent') + pctEl + barEl
                + '<span class="nx-sub">' + status + ' · ' + remain + '</span>');
        }
        if (t === 's') {
            return wrap('battery', t,
                '<div class="nx-bat-hero">' + pctEl + '<span>' + I(ico) + status + '</span></div>'
                + barEl + '<div class="nx-sub">' + remain + '</div>');
        }
        if (t === 'm2') {
            return wrap('battery', t,
                '<div class="nx-bat-m2">' + pctEl
                + '<div class="nx-bat-side">' + barEl
                + '<div class="nx-wx-kv"><span>状态</span><b>' + I(ico) + ' ' + status + '</b></div>'
                + '<div class="nx-sub">' + remain + '</div></div></div>');
        }
        if (t === 'm3') {
            return wrap('battery', t,
                hd(ico, '电池', status)
                + '<div class="nx-bat-hero"><b class="w-bat-n nx-bat-n">' + pct + '<small>%</small></b>'
                + '<span>' + I(ico) + ' ' + status + '</span></div>'
                + barEl
                + '<div class="nx-bat-kv"><div class="nx-wx-kv"><span>预计剩余</span><b>' + (st.secs ? remain.replace('预计剩余 ', '') : '未知') + '</b></div>'
                + '<div class="nx-wx-kv"><span>电量水平</span><b>' + pct + '%</b></div></div>');
        }
        return wrap('battery', t,
            hd(ico, '电池', status)
            + '<div class="nx-bat-hero nx-bat-lg">' + pctEl + '<span>' + remain + '</span></div>'
            + barEl
            + '<div class="nx-bat-kv"><div class="nx-wx-kv"><span>状态</span><b>' + I(ico) + ' ' + status + '</b></div>'
            + '<div class="nx-wx-kv"><span>电量水平</span><b>' + pct + '%</b></div>'
            + '<div class="nx-wx-kv"><span>预计剩余</span><b>' + (st.secs ? remain.replace('预计剩余 ', '') : '未知') + '</b></div></div>'
            + '<div class="nx-sub">数据来自 navigator.getBattery()</div>');
    };

    /* ======================================================================
       ⑭ 网络
       ====================================================================== */
    N26W2.network = function (s) {
        var t = tier(s);
        var n = (typeof n26NetInfo === 'function') ? n26NetInfo() : { online: navigator.onLine !== false, type: '', down: null, rtt: null };
        var on = !!n.online;
        var bars = on ? (n.type === '4G' ? 4 : n.type === '3G' ? 3 : n.type === '2G' ? 2 : (n.type ? 1 : 3)) : 0;
        var barHtml = [1, 2, 3, 4].map(function (k) {
            return '<span class="w-net-bar nx-net-bar' + (k <= bars ? ' on' : '') + '" style="height:' + (6 + k * 3) + 'px"></span>';
        }).join('');
        var typeTxt = on ? (n.type || '已连接') : '离线';
        var meta1 = on ? (n.type ? n.type + ' 连接' : '已连接') : '离线';
        var meta2 = on ? (n.down !== null ? '下行 ' + n.down + ' Mbps' : '速率未知') : '无网络连接';
        var rtt = (n.rtt != null && on) ? n.rtt + ' ms' : '—';
        var ico = on ? 'fa-wifi' : 'fa-wifi';

        if (t === 'bar') {
            return wrap('network', t, I(ico, 'nx-accent')
                + '<b class="nx-net-b">' + typeTxt + '</b>'
                + '<div class="nx-net-bars">' + barHtml + '</div>'
                + '<span class="nx-wx-chip w-net-m"><span>' + meta1 + '</span></span>'
                + '<span class="nx-wx-chip"><span>' + meta2 + '</span></span>'
                + '<span class="nx-wx-chip">RTT ' + rtt + '</span>');
        }
        if (t === 's') {
            return wrap('network', t,
                '<div class="nx-net-s">' + I(ico, 'nx-net-ic' + (on ? '' : ' off'))
                + '<b>' + typeTxt + '</b>'
                + '<div class="nx-net-bars nx-net-bars-s">' + barHtml + '</div>'
                + '<span class="nx-sub">' + meta2 + '</span></div>');
        }
        if (t === 'm2') {
            return wrap('network', t,
                '<div class="nx-net-m2"><div class="nx-net-left">' + I(ico, 'nx-net-ic' + (on ? '' : ' off'))
                + '<b>' + typeTxt + '</b><div class="nx-net-bars">' + barHtml + '</div></div>'
                + '<div class="nx-net-right"><div class="nx-wx-kv"><span>状态</span><b class="w-net-m"><span>' + meta1 + '</span></b></div>'
                + '<div class="nx-wx-kv"><span>速率</span><b><span>' + meta2 + '</span></b></div>'
                + '<div class="nx-wx-kv"><span>延迟</span><b>' + rtt + '</b></div></div></div>');
        }
        return wrap('network', t,
            hd(ico, '网络', typeTxt)
            + '<div class="nx-net-big">' + I(ico, 'nx-net-ic' + (on ? '' : ' off')) + '<b>' + meta1 + '</b>'
            + '<div class="nx-net-bars">' + barHtml + '</div></div>'
            + '<div class="nx-wx-kv"><span>下行速率</span><b>' + (on ? (n.down !== null ? n.down + ' Mbps' : '速率未知') : '—') + '</b></div>'
            + '<div class="nx-wx-kv"><span>延迟 RTT</span><b>' + rtt + '</b></div>'
            + '<div class="nx-wx-kv"><span>连接类型</span><b>' + (n.type || '浏览器未提供') + '</b></div>'
            + '<div class="nx-sub">数据来自 navigator.connection</div>');
    };

    /* ======================================================================
       ⑮ 相册（真实读取 C:/Photo 与 C:/Videos 里的本机图片，不再借用壁纸库）
       ====================================================================== */
    var phCur = -1;

    function phList() {
        try {
            var A = window.n26Album;
            if (!A || typeof A.collect !== 'function') return [];
            var arr = A.collect() || [];
            return arr.filter(function (it) { return it && it.type === 'image' && it.url; })
                .sort(function (a, b) { return (Number(b.created) || 0) - (Number(a.created) || 0); });
        } catch (e) { return []; }
    }
    function phDate(ms) {
        var d = new Date(Number(ms) || 0);
        if (isNaN(d.getTime()) || !ms) return '未记录日期';
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function phSize(b) {
        b = Number(b) || 0;
        if (!b) return '大小未知';
        return b >= 1048576 ? (Math.round(b / 1048576 * 10) / 10) + ' MB' : Math.round(b / 1024) + ' KB';
    }

    N26W2.photos = function (s) {
        var t = tier(s), pool = phList();
        if (!pool.length) {
            var cta = '<button class="nx-btn nx-btn-accent" onclick="event.stopPropagation();openApp(\'album\')">打开相册</button>';
            if (t === 'bar') {
                return wrap('photos', t, I('fa-image', 'nx-accent')
                    + '<span class="nx-sub">相册 · 还没有照片</span>' + cta);
            }
            return wrap('photos', t,
                hd('fa-image', '相册', '0 张')
                + empty('fa-image', '相册里还没有照片', '在相册应用里导入图片后会显示在这里')
                + cta);
        }
        var idx = Math.abs(Number(s && s.idx) || 0) % pool.length;
        phCur = idx;
        var it = pool[idx];
        var cnt = '<span class="nx-sub nx-ph-cnt">' + (idx + 1) + ' / ' + pool.length + '</span>';
        var prev = '<button class="nx-icon-btn" onclick="N26W2.phStep(event,-1)" title="上一张">' + I('fa-chevron-left') + '</button>';
        var next = '<button class="nx-icon-btn" onclick="N26W2.phStep(event,1)" title="下一张">' + I('fa-chevron-right') + '</button>';
        if (t === 'bar') {
            return wrap('photos', t,
                '<div class="nx-ph-thumb" style="background-image:url(\'' + it.url + '\')"></div>'
                + '<span class="nx-ph-nm">' + E(cut(it.name, 14)) + '</span>' + cnt + prev + next);
        }
        if (t === 's') {
            return wrap('photos', t,
                '<div class="nx-ph-s" style="background-image:url(\'' + it.url + '\')">'
                + '<div class="nx-ph-cap">' + cnt + '<span class="nx-ph-nav">' + prev + next + '</span></div></div>');
        }
        if (t === 'm2') {
            return wrap('photos', t,
                '<div class="nx-ph-m2"><div class="nx-ph-img" style="background-image:url(\'' + it.url + '\')"></div>'
                + '<div class="nx-ph-side"><b class="nx-ph-nm">' + E(cut(it.name, 16)) + '</b>'
                + '<span class="nx-sub nx-ph-dt">' + phDate(it.created) + '</span>'
                + cnt
                + '<div class="nx-ph-btns">' + prev + next + '</div></div></div>');
        }
        if (t === 'm3') {
            return wrap('photos', t,
                '<div class="nx-ph-img nx-ph-img3" style="background-image:url(\'' + it.url + '\')"></div>'
                + '<div class="nx-ph-row"><b class="nx-ph-nm">' + E(cut(it.name, 18)) + '</b>' + cnt
                + '<span class="nx-ph-nav">' + prev + next + '</span></div>'
                + '<div class="nx-ph-meta"><span class="nx-sub">' + phDate(it.created) + ' · ' + it.group + '</span></div>');
        }
        return wrap('photos', t,
            '<div class="nx-ph-img nx-ph-img-l" style="background-image:url(\'' + it.url + '\')"></div>'
            + '<div class="nx-ph-row"><b class="nx-ph-nm">' + E(cut(it.name, 20)) + '</b>' + cnt
            + '<span class="nx-ph-nav">' + prev + next + '</span></div>'
            + '<div class="nx-ph-meta"><div class="nx-wx-kv"><span>分组</span><b>' + it.group + '</b></div>'
            + '<div class="nx-wx-kv"><span>日期</span><b>' + phDate(it.created) + '</b></div>'
            + '<div class="nx-wx-kv"><span>大小</span><b>' + phSize(it.size) + '</b></div></div>'
            + '<div class="nx-sub">数据来自本机相册（C:/Photo）</div>');
    };

    N26W2.phStep = function (e, d) {
        if (e) e.stopPropagation();
        var pool = phList();
        if (!pool.length) return;
        var base = phCur < 0 ? 0 : phCur;
        phCur = ((base + d) % pool.length + pool.length) % pool.length;
        var it = pool[phCur];
        var card = (e && e.target && e.target.closest) ? e.target.closest('.desktop-widget-card') : null;
        if (card) {
            var imgs = card.querySelectorAll('.nx-ph-img, .nx-ph-s, .nx-ph-thumb');
            for (var k = 0; k < imgs.length; k++) imgs[k].style.backgroundImage = 'url(\'' + it.url + '\')';
            var c = card.querySelector('.nx-ph-cnt');
            if (c) c.textContent = (phCur + 1) + ' / ' + pool.length;
            var nm = card.querySelector('.nx-ph-nm');
            if (nm) nm.textContent = it.name;
            var dt = card.querySelector('.nx-ph-dt');
            if (dt) dt.textContent = phDate(it.created);
        }
        try {
            var ws = getUserLS('desktopWidgets') || [];
            var w = Array.isArray(ws) ? ws.filter(function (x) { return x && x.type === 'photos'; })[0] : null;
            if (w) {
                w.settings = w.settings || {};
                w.settings.idx = phCur;
                setUserLS('desktopWidgets', ws);
            }
        } catch (err) { }
    };

    /* ======================================================================
       ⑯ 音量（写真实 soundVolume，UI 音效立即生效）
       ====================================================================== */
    N26W2.volume = function (s) {
        var t = tier(s);
        var st = {};
        try { st = getUserLS('settings') || {}; } catch (e) { }
        var vol = Number(st.soundVolume);
        if (!isFinite(vol)) { try { vol = Number(n26WGet('volume', 50)); } catch (e) { vol = 50; } }
        vol = Math.max(0, Math.min(100, Math.round(vol)));
        var ico = vol === 0 ? 'fa-volume-xmark' : (vol < 40 ? 'fa-volume-low' : 'fa-volume-high');
        var slider = '<input class="nx-vol-range" type="range" min="0" max="100" value="' + vol + '" '
            + 'oninput="n26W2Volume(this.value)" onmousedown="event.stopPropagation()" aria-label="音效音量">';
        var pctEl = '<b class="nx-vol-pct">' + vol + '%</b>';

        if (t === 'bar') {
            return wrap('volume', t, I(ico, 'nx-accent') + pctEl + slider
                + '<button class="nx-btn" onclick="n26W2Volume(0)">静音</button>');
        }
        if (t === 's') {
            return wrap('volume', t,
                '<div class="nx-vol-hd">' + I(ico, 'nx-accent') + '<span class="nx-sub">音效音量</span>' + pctEl + '</div>'
                + slider
                + '<div class="nx-vol-presets"><button class="nx-btn" onclick="n26W2Volume(0)">静音</button>'
                + '<button class="nx-btn" onclick="n26W2Volume(100)">最大</button></div>');
        }
        if (t === 'm2') {
            return wrap('volume', t,
                '<div class="nx-vol-hd">' + I(ico, 'nx-accent') + '<span class="nx-sub">音效音量</span>' + pctEl + '</div>'
                + slider
                + '<div class="nx-vol-presets"><button class="nx-btn" onclick="n26W2Volume(0)">静音</button>'
                + '<button class="nx-btn" onclick="n26W2Volume(50)">50%</button>'
                + '<button class="nx-btn" onclick="n26W2Volume(100)">100%</button></div>');
        }
        return wrap('volume', t,
            hd(ico, '音效音量', vol === 0 ? '已静音' : '桌面提示音')
            + '<div class="nx-vol-big">' + pctEl + '</div>'
            + slider
            + '<div class="nx-vol-presets"><button class="nx-btn" onclick="n26W2Volume(0)">静音</button>'
            + '<button class="nx-btn" onclick="n26W2Volume(30)">30%</button>'
            + '<button class="nx-btn" onclick="n26W2Volume(65)">65%</button>'
            + '<button class="nx-btn" onclick="n26W2Volume(100)">100%</button></div>'
            + '<div class="nx-sub">写入设置中的 soundVolume · 影响系统提示音</div>');
    };

    /* ======================================================================
       ⑰ 睡眠
       ====================================================================== */
    N26W2.sleep = function (s) {
        var t = tier(s);
        var st = (typeof widgetSleepState !== 'undefined') ? widgetSleepState : { remaining: 1800, running: false };
        var rem = Number(st.remaining);
        if (!isFinite(rem)) rem = 1800;
        var txt = (typeof formatSleepTime === 'function') ? formatSleepTime(rem) : pad(Math.floor(rem / 60)) + ':' + pad(rem % 60);
        var timeEl = '<b class="nx-sl-time" id="widgetSleepTime">' + txt + '</b>';
        var label = st.running ? '助眠中' : '已暂停';
        var run = '<button class="nx-btn nx-btn-accent" onclick="widgetSleepToggle(event)">'
            + (st.running ? I('fa-pause') : I('fa-play')) + '<span>' + (st.running ? '暂停' : '开始') + '</span></button>';
        var reset = '<button class="nx-btn" onclick="widgetSleepReset(event)">' + I('fa-redo') + '</button>';

        if (t === 'bar') {
            return wrap('sleep', t, I('fa-moon', 'nx-accent') + timeEl
                + '<span class="nx-sub">' + label + '</span>' + run + reset
                + '<button class="nx-btn" onclick="event.stopPropagation();openApp(\'ambient\')">白噪音</button>');
        }
        if (t === 's') {
            return wrap('sleep', t,
                '<div class="nx-sl-hero">' + I('fa-moon', 'nx-sl-moon') + timeEl + '<span class="nx-sub">' + label + '</span></div>'
                + '<div class="nx-sl-btns">' + run + reset + '</div>');
        }
        if (t === 'm2') {
            return wrap('sleep', t,
                '<div class="nx-sl-hd">' + I('fa-moon', 'nx-accent') + '<span>睡眠模式</span><span class="nx-hd-sub">' + label + '</span></div>'
                + timeEl
                + '<div class="nx-sl-btns">' + run + reset
                + '<button class="nx-btn" onclick="event.stopPropagation();openApp(\'ambient\')">' + I('fa-volume-high') + ' 白噪音</button></div>');
        }
        return wrap('sleep', t,
            '<div class="nx-sl-hd">' + I('fa-moon', 'nx-accent') + '<span>睡眠模式</span><span class="nx-hd-sub">' + label + '</span></div>'
            + '<div class="nx-sl-hero nx-sl-hero-l">' + I('fa-moon', 'nx-sl-moon') + timeEl + '</div>'
            + '<div class="nx-sl-btns">' + run + reset
            + '<button class="nx-btn" onclick="event.stopPropagation();openApp(\'ambient\')">' + I('fa-volume-high') + ' 白噪音</button></div>'
            + '<div class="nx-sub">倒计时从 30:00 开始 · 结束后提醒</div>');
    };

    /* ======================================================================
       ⑱ 专注
       ====================================================================== */
    N26W2.focus = function (s) {
        var t = tier(s);
        var st = (typeof widgetFocusState !== 'undefined') ? widgetFocusState : { remaining: 1500, total: 1500, running: false };
        var rem = Number(st.remaining), total = Number(st.total) || 1500;
        var txt = (typeof formatFocusTime === 'function') ? formatFocusTime(rem) : pad(Math.floor(rem / 60)) + ':' + pad(rem % 60);
        var pct = Math.max(0, Math.min(1, rem / total));
        var R = 24, C = 2 * Math.PI * R;
        var ring = '<div class="nx-fo-ring"><svg viewBox="0 0 56 56" aria-hidden="true">'
            + '<circle cx="28" cy="28" r="24" fill="none" stroke="var(--w-hair)" stroke-width="3"/>'
            + '<circle id="widgetFocusRing" cx="28" cy="28" r="24" fill="none" stroke="var(--w-accent)" stroke-width="3" '
            + 'stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - pct)) + '" stroke-linecap="round"/>'
            + '</svg><b id="widgetFocusTime">' + txt + '</b></div>';
        var label = st.running ? '专注中' : '准备专注';
        var run = '<button class="nx-btn nx-btn-accent" onclick="widgetFocusToggle(event)">'
            + (st.running ? I('fa-pause') : I('fa-play')) + '<span>' + (st.running ? '暂停' : '开始') + '</span></button>';
        var reset = '<button class="nx-btn" onclick="widgetFocusReset(event)">' + I('fa-redo') + '</button>';

        if (t === 'bar') {
            return wrap('focus', t, I('fa-spa', 'nx-accent') + ring
                + '<span class="nx-sub">' + label + '</span>' + run + reset);
        }
        if (t === 's') {
            return wrap('focus', t, ring + '<span class="nx-sub">' + label + '</span>'
                + '<div class="nx-fo-btns">' + run + reset + '</div>');
        }
        if (t === 'm2') {
            return wrap('focus', t,
                '<div class="nx-fo-m2">' + ring
                + '<div class="nx-fo-side"><div class="nx-wx-kv"><span>状态</span><b>' + label + '</b></div>'
                + '<div class="nx-wx-kv"><span>总时长</span><b>' + Math.round(total / 60) + ' 分钟</b></div>'
                + '<div class="nx-fo-btns">' + run + reset + '</div></div></div>');
        }
        return wrap('focus', t,
            hd('fa-spa', '专注时刻', label)
            + '<div class="nx-fo-l">' + ring + '</div>'
            + '<div class="nx-wx-kv"><span>本轮时长</span><b>' + Math.round(total / 60) + ' 分钟</b></div>'
            + '<div class="nx-fo-btns">' + run + reset + '</div>');
    };

    /* ======================================================================
       ⑲ 待办
       ====================================================================== */
    N26W2.todo = function (s) {
        var t = tier(s);
        var list = todos();
        var done = list.filter(function (x) { return x.done; }).length;
        var pct = list.length ? Math.round(done / list.length * 100) : 0;
        var add = '<button class="nx-icon-btn" onclick="openWidgetTodoModal()" title="添加待办">' + I('fa-plus') + '</button>';

        if (!list.length) {
            if (t === 'bar') {
                return wrap('todo', t, I('fa-list-check', 'nx-accent')
                    + '<span class="nx-sub">待办 · 今天还很清爽</span>' + add);
            }
            return wrap('todo', t,
                '<div class="nx-hd">' + I('fa-list-check') + '<span>待办</span><span class="nx-hd-sub">0/0</span>' + add + '</div>'
                + empty('fa-list-check', '今天还很清爽', '点右上角 + 记一件小事'));
        }
        if (t === 'bar') {
            return wrap('todo', t, I('fa-list-check', 'nx-accent')
                + '<b class="nx-td-bar-n">' + (list.length - done) + '</b><span class="nx-sub">项待完成</span>'
                + '<span class="nx-bar nx-td-mini"><span class="nx-fill" style="width:' + pct + '%"></span></span>'
                + '<span class="nx-sub">' + done + '/' + list.length + '</span>' + add);
        }
        if (t === 's') {
            var first = list.filter(function (x) { return !x.done; })[0] || list[0];
            return wrap('todo', t,
                '<div class="nx-td-s"><b>' + (list.length - done) + '</b><span>项待完成</span>'
                + '<small class="nx-sub">' + E(cut(first.text, 14)) + '</small></div>'
                + '<div class="nx-td-s-foot">' + bar(pct) + '<span class="nx-sub">' + done + '/' + list.length + '</span></div>');
        }
        var max = t === 'm2' ? 2 : (t === 'm3' ? 4 : 6);
        var caps = t === 'm2' ? 24 : (t === 'm3' ? 30 : 38);
        var rows = list.slice(0, max).map(function (x) {
            return '<div class="nx-li nx-td-row' + (x.done ? ' done' : '') + '">'
                + '<button class="widget-todo-check nx-td-ck' + (x.done ? ' done' : '') + '" onclick="toggleWidgetTodo(\'' + E(x.id) + '\',event)" title="切换完成"></button>'
                + '<span class="nx-td-tx">' + E(cut(x.text, caps + (t === 'l' ? 10 : 0))) + '</span>'
                + '<button class="nx-td-del" onclick="deleteWidgetTodo(\'' + E(x.id) + '\',event)" title="删除">' + I('fa-xmark') + '</button></div>';
        }).join('');
        return wrap('todo', t,
            '<div class="nx-hd">' + I('fa-list-check') + '<span>待办</span>'
            + '<span class="nx-hd-sub widget-todo-count">' + done + '/' + list.length + '</span>' + add + '</div>'
            + '<div class="nx-td-prog">' + bar(pct) + '</div>'
            + '<div class="nx-list nx-td-list">' + rows + '</div>');
    };

    /* ---------------- 导出的实时更新辅助 ---------------- */
    N26W2.setVolume = function (v) {
        v = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
        try { if (typeof setSoundVolume === 'function') setSoundVolume(v); } catch (e) { }
        try { if (typeof n26WSet === 'function') n26WSet('volume', v); } catch (e) { }
        document.querySelectorAll('.desktop-widget-card[data-type="volume"]').forEach(function (card) {
            var pct = card.querySelector('.nx-vol-pct');
            if (pct) pct.textContent = v + '%';
            card.querySelectorAll('.nx-vol-range').forEach(function (r) { if (+r.value !== v) r.value = v; });
        });
        try { if (typeof playSound === 'function') playSound('volume'); } catch (e) { }
    };
    window.n26W2Volume = N26W2.setVolume;

    /* 每秒补时钟秒数与当日进度（旧更新函数只改 HH:MM） */
    setInterval(function () {
        try {
            var now = new Date();
            var pct = Math.round(((now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400) * 100);
            document.querySelectorAll('.desktop-widget-card[data-type="clock"] [data-clk-s]').forEach(function (el) {
                var v = pad(now.getSeconds());
                if (el.textContent !== v) el.textContent = v;
            });
            document.querySelectorAll('.desktop-widget-card[data-type="clock"] [data-clk-p]').forEach(function (el) {
                var v = pct + '%';
                if (el.textContent !== v) el.textContent = v;
            });
            document.querySelectorAll('.desktop-widget-card[data-type="clock"] [data-clk-p2]').forEach(function (el) {
                var v = pct + '%';
                if (el.textContent !== v) el.textContent = v;
            });
            document.querySelectorAll('.desktop-widget-card[data-type="clock"] [data-clk-marker]').forEach(function (el) {
                el.style.left = pct + '%';
            });
            document.querySelectorAll('.desktop-widget-card[data-type="clock"] .nx-clk-mini > span').forEach(function (el) {
                el.style.width = pct + '%';
            });
        } catch (e) { }
    }, 1000);

    window.N26W2 = N26W2;
})();
