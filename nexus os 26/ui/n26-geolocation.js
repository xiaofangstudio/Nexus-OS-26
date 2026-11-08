/* ============================================================
   N26 Geo · 全系统统一位置服务（v2.9.97）
   ------------------------------------------------------------
   用户要求：「网页不是可以获取用户位置信息吗？就直接用这个用户位置信息
   去搞地图和天气以及其他一堆要用到位置信息的软件。」

   旧状：主壳 n26EnsureGeo() 只服务顶栏天气兜底；地图/天气各自重复调
   navigator.geolocation（iframe 里权限策略还会直接挡掉）；三处默认城市
   还不一致（主壳北京、天空层深圳）。本模块把定位收敛到顶层文档一次，
   结果广播给所有 iframe + 写共享 localStorage，消费方只读不算。
   ============================================================ */
(function () {
    'use strict';

    var KEY = 'n26:geo';
    var LEGACY_KEY = 'n26:n26_geo';
    /* ★ v2.10.4：用户「亲手选过」的位置单独存，永不过期、永不覆写。
       用户原话：「地图里头选择过一遍、天气软件里头选择过一遍，就不需要再二次让用户选择了」。
       以前只有 n26:geo 一份，6 小时 TTL 一到就重新 getCurrentPosition —— 既可能再弹权限，
       又会把用户选的深圳改回定位城市。 */
    var PIN_KEY = 'n26:geo:pin';
    var TTL = 6 * 60 * 60 * 1000;          // 只对「自动定位」生效
    var DEFAULT = { lat: 39.9042, lon: 116.4074, name: '北京', source: 'default', ts: 0 };
    var current = null;

    function safeParse(raw) { try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
    function readPin() {
        var p = null;
        try { p = safeParse(localStorage.getItem(PIN_KEY)); } catch (e) { }
        return (p && isFinite(p.lat) && isFinite(p.lon)) ? p : null;
    }
    function writePin(g) {
        try {
            localStorage.setItem(PIN_KEY, JSON.stringify({
                lat: +g.lat, lon: +g.lon, name: g.name || '自定义位置',
                source: 'manual', ts: Date.now(), pinned: true
            }));
        } catch (e) { }
    }
    function readStore() {
        var g = null;
        try { g = safeParse(localStorage.getItem(KEY)); } catch (e) { }
        if (!g) { try { g = safeParse(localStorage.getItem(LEGACY_KEY)); } catch (e) { } }
        return (g && isFinite(g.lat) && isFinite(g.lon)) ? g : null;
    }
    function writeStore(g) {
        try { localStorage.setItem(KEY, JSON.stringify(g)); } catch (e) { }
        try { localStorage.setItem(LEGACY_KEY, JSON.stringify(g)); } catch (e) { }  // 兼容旧顶栏
    }
    function broadcast(g) {
        current = g;
        writeStore(g);
        try {
            var frames = document.querySelectorAll('iframe');
            for (var i = 0; i < frames.length; i++) {
                try { frames[i].contentWindow.postMessage({ __n26Geo: g }, '*'); } catch (e) { }
            }
        } catch (e) { }
        try { window.dispatchEvent(new CustomEvent('n26:geo', { detail: g })); } catch (e) { }
    }

    function reverseName(lat, lon) {
        return new Promise(function (resolve) {
            var done = false;
            var guard = setTimeout(function () { if (!done) { done = true; resolve('我的位置'); } }, 4500);
            try {
                fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat +
                    '&longitude=' + lon + '&localityLanguage=zh')
                    .then(function (r) { return r.json(); })
                    .then(function (j) {
                        if (done) return;
                        done = true; clearTimeout(guard);
                        resolve(j.city || j.locality || j.principalSubdivision || '我的位置');
                    })
                    .catch(function () { if (!done) { done = true; clearTimeout(guard); resolve('我的位置'); } });
            } catch (e) { if (!done) { done = true; clearTimeout(guard); resolve('我的位置'); } }
        });
    }

    function finish(pos) {
        var lat = +Number(pos.lat).toFixed(4), lon = +Number(pos.lon).toFixed(4);
        return reverseName(lat, lon).then(function (name) {
            var g = {
                lat: lat, lon: lon, name: name || '我的位置',
                accuracy: pos.accuracy || 0, source: 'geolocation', ts: Date.now()
            };
            broadcast(g);
            return g;
        });
    }

    function locate(force) {
        return new Promise(function (resolve) {
            /* ★ 用户亲手钉过的位置优先级最高：直接返回，绝不再调定位、
               也不再二次询问。想改就再选一次城市（会覆写 pin）。 */
            var pin = readPin();
            if (pin) { current = pin; writeStore(pin); resolve(pin); return; }
            var cached = current || readStore();
            if (cached) current = cached;
            if (!force && cached && cached.lat && cached.lon && cached.ts &&
                (Date.now() - cached.ts) < TTL) { resolve(cached); return; }
            if (!navigator.geolocation) { resolve(cached || DEFAULT); return; }
            var settled = false;
            var guard = setTimeout(function () {
                if (!settled) { settled = true; resolve(cached || DEFAULT); }
            }, 7000);
            try {
                navigator.geolocation.getCurrentPosition(function (p) {
                    if (settled) return;
                    settled = true; clearTimeout(guard);
                    finish({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy })
                        .then(resolve);
                }, function () {
                    if (!settled) { settled = true; clearTimeout(guard); resolve(cached || DEFAULT); }
                }, { timeout: 6000, maximumAge: 600000, enableHighAccuracy: false });
            } catch (e) {
                if (!settled) { settled = true; clearTimeout(guard); resolve(cached || DEFAULT); }
            }
        });
    }

    window.N26Geo = {
        version: '2.10.4',
        /* 同步读：应用初始化时立即可用（pin > 缓存 > 默认） */
        get: function () { return readPin() || current || readStore() || DEFAULT; },
        /* 异步确保：拿真实定位（带 TTL；有 pin 就完全不定位） */
        ensure: function () { return locate(false); },
        /* 强制刷新（有 pin 时仍然返回 pin —— 用户选过就别再自作主张） */
        refresh: function () { return locate(true); },
        /* 用户手动选城市 / 其它模块注入坐标 → 视为「用户选择」，写 pin */
        set: function (g) {
            if (!g || !isFinite(g.lat) || !isFinite(g.lon)) return null;
            var out = {
                lat: +g.lat, lon: +g.lon, name: g.name || '自定义位置',
                source: g.source || 'manual', ts: Date.now(), accuracy: g.accuracy || 0,
                pinned: true
            };
            writePin(out);
            broadcast(out);
            return out;
        },
        /* 只清位置偏好（回到自动定位） */
        clearPin: function () {
            try { localStorage.removeItem(PIN_KEY); } catch (e) { }
            current = null;
            try { broadcast(readStore() || DEFAULT); } catch (e) { }
            return true;
        },
        pinOf: function () { return readPin(); },
        broadcast: broadcast
    };

    /* iframe 主动来要位置（geo-client.js 注入后会在加载时请求一次） */
    window.addEventListener('message', function (e) {
        var d = e.data;
        if (!d) return;
        /* ★ 应用里「用户选了城市」→ geo-client 会发这个：落 pin + 广播给所有应用。
           以前宿主**根本没监听**这个消息，所以地图/天气各选一遍等于白选。 */
        if (d.__n26GeoSet && isFinite(d.__n26GeoSet.lat) && isFinite(d.__n26GeoSet.lon)) {
            window.N26Geo.set(d.__n26GeoSet);
            return;
        }
        if (!d.__n26GeoReq) return;
        if (current) {
            try { e.source.postMessage({ __n26Geo: current }, '*'); } catch (err) { }
        } else {
            locate(false).then(function (g) {
                try { e.source.postMessage({ __n26Geo: g }, '*'); } catch (err) { }
            });
        }
    });

    /* 顶层文档自己先跑一次；失败静默用缓存/默认，不弹任何「降级」提示 */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { locate(false); });
    } else {
        locate(false);
    }
})();
