/* ============================================================
   N26 Geo Client · iframe 侧位置消费者（v2.9.97）
   ------------------------------------------------------------
   由 apps/_app.js 注入每个 iframe 文档。iframe 内不要再自己调
   navigator.geolocation（权限策略会把它挡掉且既不回成功也不回失败）。
   统一从顶层文档广播拿位置；应用只需：
       window.N26GeoClient.get()      → {lat, lon, name, source, ts}
       window.addEventListener('n26:geo', e => e.detail)
   ============================================================ */
(function () {
    'use strict';
    if (window.N26GeoClient) return;
    var KEY = 'n26:geo';
    var state = null;

    function apply(g) {
        if (!g || !isFinite(g.lat) || !isFinite(g.lon)) return;
        state = g;
        window.N26GeoState = g;
        try { localStorage.setItem(KEY, JSON.stringify(g)); } catch (e) { }
        try { window.dispatchEvent(new CustomEvent('n26:geo', { detail: g })); } catch (e) { }
    }

    /* 先同步读一次，保证应用初始化时就有值（哪怕定位还没回来） */
    try {
        var raw = localStorage.getItem(KEY) || localStorage.getItem('n26:n26_geo');
        var cached = raw ? JSON.parse(raw) : null;
        if (cached && isFinite(cached.lat) && isFinite(cached.lon)) {
            state = cached; window.N26GeoState = cached;
        }
    } catch (e) { }

    window.addEventListener('message', function (e) {
        if (e.data && e.data.__n26Geo) apply(e.data.__n26Geo);
    });
    window.addEventListener('storage', function (e) {
        if (e.key !== KEY && e.key !== 'n26:n26_geo') return;
        try { var g = JSON.parse(e.newValue); if (g) apply(g); } catch (err) { }
    });

    window.N26GeoClient = {
        version: '2.9.97',
        get: function () {
            return state || window.N26GeoState || { lat: 39.9042, lon: 116.4074, name: '北京', source: 'default' };
        },
        set: function (g) {
            apply(g);
            try { parent.postMessage({ __n26GeoSet: g }, '*'); } catch (e) { }
        }
    };

    /* 主动向宿主索取一次（宿主的 N26Geo 会回广播） */
    try { parent.postMessage({ __n26GeoReq: 1 }, '*'); } catch (e) { }
})();
