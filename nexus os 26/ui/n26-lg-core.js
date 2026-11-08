/* ============================================================
   N26 LG Core · iframe 内的自研液态玻璃折射引擎（v2.9.93）
   ------------------------------------------------------------
   宿主 NEXUS OS 26.html 自带完整引擎（Worker + 大缓存），但 iframe 是
   独立文档：SVG 滤镜按文档隔离，宿主的 url(#n26Lg*) 在 iframe 里根本
   引用不到。之前 apps/_bridge.js / _app.js 也没导出折射 API，于是
   「所有软件内部侧边 Dock 的玻璃都没有折射引擎」——只剩一层普通磨砂。

   本文件是同一套 SDF 位移贴图算法的轻量独立实现：
     Canvas 生成圆角矩形 SDF 内缩位移图 → feImage + feDisplacementMap
     → backdrop-filter: var(--n26-lg-filter)（含折射 / 对比 / 提亮）。
   对外 API 与宿主完全一致：n26LgAttach / n26LgResize / n26LgClear。
   宿主已定义这组 API 时本模块自动让位（零冲突、零重复贴图）。

   ★ 只用 PNG（JPEG 色度抽样会毁掉 R/G 位移通道）；
   ★ 贴图长边压到 ≤240px，按尺寸量化缓存，同一个 Dock 只算一次。
   ============================================================ */
(function () {
    'use strict';

    /* 宿主已经有引擎：什么都不做，避免两套滤镜抢同一个 --n26-lg-filter */
    if (typeof window.n26LgAttach === 'function' &&
        typeof window.n26LgResize === 'function' &&
        typeof window.n26LgClear === 'function') return;

    var SVG_NS = 'http://www.w3.org/2000/svg';
    var cache = Object.create(null);

    function smooth(a, b, t) {
        t = Math.max(0, Math.min(1, (t - a) / (b - a)));
        return t * t * (3 - 2 * t);
    }
    function sdf(x, y, hw, hh, r) {
        var qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r;
        return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
    }
    function quant(v) { return Math.max(12, Math.round(v / 4) * 4); }

    function buildMap(w, h, opts) {
        opts = opts || {};
        var inset = opts.inset != null ? opts.inset : 0.2;
        var thresh = opts.thresh != null ? opts.thresh : -0.15;
        var hw = opts.hw != null ? opts.hw : 0.5 - inset;
        var hh = opts.hh != null ? opts.hh : 0.5 - inset;
        var k = Math.min(1, 240 / Math.max(w, h));
        var mw = Math.max(8, Math.round(w * k)), mh = Math.max(8, Math.round(h * k));
        var key = mw + 'x' + mh + ':' + w + 'x' + h + ':' + hw + ':' + hh + ':' + thresh;
        if (cache[key]) return cache[key];

        var canvas = document.createElement('canvas');
        canvas.width = mw; canvas.height = mh;
        var ctx = canvas.getContext('2d');
        if (!ctx) return null;
        var img = ctx.createImageData(mw, mh);
        var raw = new Float32Array(mw * mh * 2);
        var maxScale = 0;
        for (var y = 0; y < mh; y++) {
            var iy = y / mh - 0.5;
            for (var x = 0; x < mw; x++) {
                var ix = x / mw - 0.5;
                var d = sdf(ix, iy, hw, hh, 0.6);
                var s = smooth(0, 1, smooth(0.8, 0, d - thresh));
                var i = (y * mw + x) * 2;
                raw[i] = ix * s * w;
                raw[i + 1] = iy * s * h;
                var ax = Math.abs(raw[i]), ay = Math.abs(raw[i + 1]);
                if (ax > maxScale) maxScale = ax;
                if (ay > maxScale) maxScale = ay;
            }
        }
        maxScale *= 0.5;
        if (maxScale < 0.0001) maxScale = 0.0001;
        var data = img.data;
        for (var p = 0; p < mw * mh; p++) {
            var j = p * 2, q = p * 4;
            data[q] = Math.round((raw[j] / maxScale + 0.5) * 255);
            data[q + 1] = Math.round((raw[j + 1] / maxScale + 0.5) * 255);
            data[q + 2] = 0;
            data[q + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        var out = { url: canvas.toDataURL('image/png'), scale: maxScale };
        cache[key] = out;
        return out;
    }

    function ensureSvg() {
        var svg = document.getElementById('n26LgSvg');
        if (svg) return svg;
        svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('id', 'n26LgSvg');
        svg.setAttribute('style', 'position:absolute;width:0;height:0');
        svg.setAttribute('aria-hidden', 'true');
        svg.appendChild(document.createElementNS(SVG_NS, 'defs'));
        (document.body || document.documentElement).appendChild(svg);
        return svg;
    }

    function clear(el) {
        if (!el) return;
        var lg = el._n26Lg;
        if (lg && lg.id) {
            var f = document.getElementById(lg.id);
            if (f && f.parentNode) f.parentNode.removeChild(f);
        }
        try {
            el.style.removeProperty('--n26-lg-filter');
            el.classList.remove('n26-liquid-on');
        } catch (e) { }
        el._n26Lg = null;
    }

    function attach(el, id, opts, size) {
        if (!el || !el.isConnected || el._n26Lg) return;
        var lw = el.offsetWidth || 0, lh = el.offsetHeight || 0;
        if (!(lw > 0) || !(lh > 0)) return;
        var w = quant((size && size.w) || lw), h = quant((size && size.h) || lh);
        var map = buildMap(w, h, opts);
        if (!map || !(map.scale > 0)) return;

        var svg = ensureSvg();
        var defs = svg.firstChild;
        var stale = document.getElementById(id);
        if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

        var filter = document.createElementNS(SVG_NS, 'filter');
        filter.setAttribute('id', id);
        filter.setAttribute('filterUnits', 'userSpaceOnUse');
        filter.setAttribute('colorInterpolationFilters', 'sRGB');
        filter.setAttribute('x', '0'); filter.setAttribute('y', '0');
        filter.setAttribute('width', String(w)); filter.setAttribute('height', String(h));

        var feImage = document.createElementNS(SVG_NS, 'feImage');
        feImage.setAttribute('result', id + '_map');
        feImage.setAttribute('width', String(w));
        feImage.setAttribute('height', String(h));
        feImage.setAttribute('preserveAspectRatio', 'none');
        feImage.setAttribute('href', map.url);
        feImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', map.url);

        var feDisp = document.createElementNS(SVG_NS, 'feDisplacementMap');
        feDisp.setAttribute('in', 'SourceGraphic');
        feDisp.setAttribute('in2', id + '_map');
        feDisp.setAttribute('scale', String(Math.round(map.scale * 1000) / 1000));
        feDisp.setAttribute('xChannelSelector', 'R');
        feDisp.setAttribute('yChannelSelector', 'G');

        filter.appendChild(feImage);
        filter.appendChild(feDisp);
        defs.appendChild(filter);

        var noBlur = !!(opts && opts.noBlur);
        el.style.setProperty('--n26-lg-filter',
            'url(#' + id + ')' + (noBlur ? '' : ' blur(0.35px)') +
            ' contrast(1.2) brightness(1.05) saturate(1.45)');
        el.classList.add('n26-liquid-on');
        el._n26Lg = { id: id, w: w, h: h, opts: opts || null, map: map };
    }

    function resize(el, id, opts, size) {
        var lg = el && el._n26Lg;
        if (lg && lg.w === quant((size && size.w) || el.offsetWidth) &&
            lg.h === quant((size && size.h) || el.offsetHeight)) return;
        clear(el);
        attach(el, id, opts, size);
    }

    window.n26LgAttach = attach;
    window.n26LgResize = resize;
    window.n26LgClear = clear;
    window.N26LgCore = { version: '2.9.93', maps: function () { return Object.keys(cache).length; } };
})();
