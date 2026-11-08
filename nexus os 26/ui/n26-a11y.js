/* ==========================================================================
   n26-a11y.js · 辅助功能中枢（M2）
   · 注册表 {id, default, apply(), revert()}
   · 状态：settings.a11y（单键，带 schema 版本）
   · 输出：body.n26-a11y-* 类 + --a11y-* CSS 变量 + a11y:change 事件
   · 覆盖 A1/A2/A4/A5/A6/A7/A9 + G1
   ========================================================================== */
(function () {
    'use strict';

    var SCHEMA = 2;
    var DEFAULTS = {
        schema: 2,
        // 视觉
        scale: 100,                 // A1 100/110/125/150/175/200
        largeText: false,           // A2
        highContrast: 'off',        // A4 off | black | white
        colorBlind: 'off',          // A5 off | protan | deutan | tritan | achroma
        colorBlindStrength: 70,     // A5 0-100
        colorFilter: 'off',         // 灰度 | 反转
        reduceWhitePoint: 0,        // 0-100，降低白点
        reduceTransparency: false,  // A7
        boldText: false,            // 文字加粗
        magnifier: false,           // 放大镜
        magnifierZoom: 2,           // 1.5 - 4
        magnifierFollow: true,      // 跟随指针 / 固定
        pointerSize: 0,             // 0 标准 / 1 大 / 2 特大
        touchTargets: false,        // 44px 触控目标
        // 听觉
        monoAudio: false,
        captions: false,
        captionSize: 18,            // 14 / 18 / 22
        captionBg: 'dark',          // dark | light | none
        captionBorder: true,
        visualFlash: false,         // 闪屏提醒
        // 语音
        narration: false,           // 旁白
        narrationHover: false,
        narrationNotify: false,
        narrationRate: 1,           // 0.5 - 2
        narrationPitch: 1,          // 0.5 - 2
        narrationVolume: 80,        // 0 - 100
        narrationVoice: '',         // voiceURI
        voiceControl: false,
        // 交互
        keyboardNav: false,
        switchScan: false,
        scanSpeed: 800,             // ms
        stickyKeys: false,
        slowKeys: false,
        slowKeyDelay: 500,          // ms
        mouseKeys: false,
        // 动态
        reduceMotion: false,
        hoverPlayMotion: false,     // 悬停才播放动效预览
        focusRing: false            // A9
    };

    var SCALE_CLASSES = ['100', '110', '125', '150', '175', '200'].map(function (v) {
        return 'n26-a11y-scale-' + v;
    });
    var HC_CLASSES = ['n26-a11y-hc-black', 'n26-a11y-hc-white'];

    var body = document.body;
    var prevTab = 'computer';
    var lastTextScale = 0;
    var textNodes = [];
    var textObserver = null;
    var colorFilterEl = null;
    var colorMatrixEl = null;

    /* ---------------- 状态读写 ---------------- */

    function readSettings() {
        try {
            return getUserLS('settings') || {};
        } catch (e) {
            return {};
        }
    }

    function systemReduceMotion() {
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
    }

    function state() {
        var s = readSettings();
        var stored = s.a11y && typeof s.a11y === 'object';
        var a = stored ? s.a11y : {};
        for (var k in DEFAULTS) {
            if (a[k] === undefined) a[k] = DEFAULTS[k];
        }
        // 首次运行跟随系统「减弱动态效果」偏好；用户显式改过之后以用户设置为准
        if (!stored) a.reduceMotion = systemReduceMotion();
        // 兼容旧「个性化 → 减弱动画」开关：只在没有 a11y 记录时迁移一次
        if (a.reduceMotion === false && s.reduceMotion === true && a.__migrated !== true) {
            a.reduceMotion = true;
        }
        a.schema = SCHEMA;
        return a;
    }

    function save(next) {
        var s = readSettings();
        s.a11y = next;
        // 旧开关镜像，保证设置→个性化里的「减弱动画」状态一致
        s.reduceMotion = !!next.reduceMotion;
        try {
            setUserLS('settings', s);
        } catch (e) { }
        emit('all', next);
    }

    function emit(id, value) {
        try {
            document.dispatchEvent(new CustomEvent('a11y:change', {
                detail: { id: id, value: value, state: state() }
            }));
        } catch (e) { }
    }

    /* ---------------- 色盲滤镜：全局唯一一层 SVG feColorMatrix ---------------- */

    var CB_MATRICES = {
        // 红色弱（protanopia）
        protan: [
            0.567, 0.433, 0.000, 0, 0,
            0.558, 0.442, 0.000, 0, 0,
            0.000, 0.242, 0.758, 0, 0,
            0, 0, 0, 1, 0
        ],
        // 绿色弱（deuteranopia）
        deutan: [
            0.625, 0.375, 0.000, 0, 0,
            0.700, 0.300, 0.000, 0, 0,
            0.000, 0.300, 0.700, 0, 0,
            0, 0, 0, 1, 0
        ],
        // 蓝色弱（tritanopia）
        tritan: [
            0.950, 0.050, 0.000, 0, 0,
            0.000, 0.433, 0.567, 0, 0,
            0.000, 0.475, 0.525, 0, 0,
            0, 0, 0, 1, 0
        ],
        // 全色盲（灰度）
        achroma: [
            0.2126, 0.7152, 0.0722, 0, 0,
            0.2126, 0.7152, 0.0722, 0, 0,
            0.2126, 0.7152, 0.0722, 0, 0,
            0, 0, 0, 1, 0
        ]
    };
    var IDENTITY = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 1, 0
    ];

    function ensureFilterSvg() {
        if (colorMatrixEl) return;
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('id', 'n26-a11y-cb-defs');
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
        var filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', 'n26-a11y-cb-filter');
        filter.setAttribute('x', '0');
        filter.setAttribute('y', '0');
        filter.setAttribute('width', '100%');
        filter.setAttribute('height', '100%');
        filter.setAttribute('color-interpolation-filters', 'sRGB');
        var m = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
        m.setAttribute('type', 'matrix');
        m.setAttribute('values', IDENTITY.join(' '));
        filter.appendChild(m);
        svg.appendChild(filter);
        (document.body || document.documentElement).appendChild(svg);
        colorFilterEl = svg;
        colorMatrixEl = m;
    }

    function blendMatrix(mode, strength) {
        var k = Math.max(0, Math.min(100, strength || 0)) / 100;
        var target = CB_MATRICES[mode] || IDENTITY;
        var out = [];
        for (var i = 0; i < 20; i++) {
            out.push(String(Math.round((IDENTITY[i] * (1 - k) + target[i] * k) * 10000) / 10000));
        }
        return out.join(' ');
    }

    /* ---------------- A2 大字体：只放大文字与控件，不缩放布局容器 ---------------- */

    function hasDirectText(el) {
        if (!el || !el.childNodes) return false;
        for (var i = 0; i < el.childNodes.length; i++) {
            var n = el.childNodes[i];
            if (n.nodeType === 3 && n.nodeValue && n.nodeValue.replace(/\s+/g, '')) return true;
        }
        return false;
    }

    function skipTextNode(el) {
        if (!el || el.nodeType !== 1) return true;
        var tag = el.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG' || tag === 'CANVAS' ||
            tag === 'IMG' || tag === 'VIDEO' || tag === 'AUDIO' || tag === 'BR' ||
            tag === 'I' || tag === 'PATH' || tag === 'G' || tag === 'USE') return true;
        if (el.id === 'n26-a11y-cb-defs') return true;
        if (el.classList && (el.classList.contains('fa') || el.classList.contains('fas') ||
            el.classList.contains('far') || el.classList.contains('fab'))) return true;
        return false;
    }

    function isControl(el) {
        var tag = el.tagName;
        if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
        if (tag === 'INPUT') {
            var type = (el.getAttribute('type') || 'text').toLowerCase();
            return type !== 'range' && type !== 'checkbox' && type !== 'radio' && type !== 'color';
        }
        return false;
    }

    function collectTextNodes(root) {
        var list = [];
        if (!root || !root.querySelectorAll) return list;
        var all = root.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (skipTextNode(el)) continue;
            if (isControl(el) || hasDirectText(el)) list.push(el);
        }
        return list;
    }

    function scaleFactorOfAncestor(el) {
        var p = el.parentElement;
        while (p) {
            if (p.__n26FsOn) return lastTextScale || 1.18;
            p = p.parentElement;
        }
        return 1;
    }

    function applyNodeScale(el, factor) {
        if (!el || el.__n26FsOn) return;
        var cs = window.getComputedStyle(el);
        var base = parseFloat(cs.fontSize);
        if (!base || base <= 0) return;
        var inheritedFactor = scaleFactorOfAncestor(el);
        if (inheritedFactor > 1 && !isControl(el)) base = base / inheritedFactor;
        el.__n26FsPrev = el.style.getPropertyValue('font-size');
        el.__n26FsPrevPrio = el.style.getPropertyPriority('font-size');
        el.__n26FsOn = true;
        // inline !important 才能压过现有样式表里的 font-size !important
        el.style.setProperty('font-size', (base * factor) + 'px', 'important');
        textNodes.push(el);
    }

    function applyTextScale(on) {
        var factor = 1.18;
        if (!on) {
            for (var i = 0; i < textNodes.length; i++) {
                var el = textNodes[i];
                if (!el) continue;
                try {
                    if (el.__n26FsPrev) el.style.setProperty('font-size', el.__n26FsPrev, el.__n26FsPrevPrio || '');
                    else el.style.removeProperty('font-size');
                } catch (e) { }
                el.__n26FsOn = false;
                el.__n26FsPrev = null;
                el.__n26FsPrevPrio = null;
            }
            textNodes = [];
            lastTextScale = 0;
            body.classList.remove('n26-a11y-large-text');
            if (textObserver) { textObserver.disconnect(); textObserver = null; }
            return;
        }
        // 一次读、一次写：先收集所有基准字号，避免父级写入影响子级读数
        var nodes = collectTextNodes(document.body);
        var sizes = [];
        for (var j = 0; j < nodes.length; j++) {
            var cs = window.getComputedStyle(nodes[j]);
            sizes.push(parseFloat(cs.fontSize) || 0);
        }
        for (var k = 0; k < nodes.length; k++) {
            var n = nodes[k];
            if (!n || n.__n26FsOn || !sizes[k]) continue;
            n.__n26FsPrev = n.style.getPropertyValue('font-size');
            n.__n26FsPrevPrio = n.style.getPropertyPriority('font-size');
            n.__n26FsOn = true;
            n.style.setProperty('font-size', (sizes[k] * factor) + 'px', 'important');
            textNodes.push(n);
        }
        lastTextScale = factor;
        body.classList.add('n26-a11y-large-text');
        if (!textObserver && window.MutationObserver) {
            textObserver = new MutationObserver(function () {
                clearTimeout(textObserver.__t);
                textObserver.__t = setTimeout(function () {
                    var added = collectTextNodes(document.body);
                    for (var x = 0; x < added.length; x++) {
                        if (!added[x].__n26FsOn) applyNodeScale(added[x], factor);
                    }
                }, 120);
            });
            textObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    /* ---------------- 注册表：每项一个 apply/revert ---------------- */

    var REG = {
        scale: {
            def: 100,
            apply: function (v) {
                body.classList.remove.apply(body.classList, SCALE_CLASSES);
                var val = parseInt(v, 10);
                if (!val || val < 100) val = 100;
                body.classList.add('n26-a11y-scale-' + val);
                document.documentElement.style.setProperty('--a11y-scale', String(val / 100));
                // 根字号联动（rem / em 体系；也用于验收 getComputedStyle）
                document.documentElement.style.fontSize = (16 * val / 100) + 'px';
            },
            revert: function () {
                body.classList.remove.apply(body.classList, SCALE_CLASSES);
                document.documentElement.style.removeProperty('--a11y-scale');
                document.documentElement.style.removeProperty('font-size');
            }
        },
        largeText: {
            def: false,
            apply: function (v) { applyTextScale(!!v); },
            revert: function () { applyTextScale(false); }
        },
        highContrast: {
            def: 'off',
            apply: function (v) {
                body.classList.remove.apply(body.classList, HC_CLASSES);
                if (v === 'black') body.classList.add('n26-a11y-hc-black');
                else if (v === 'white') body.classList.add('n26-a11y-hc-white');
            },
            revert: function () { body.classList.remove.apply(body.classList, HC_CLASSES); }
        },
        colorBlind: {
            def: 'off',
            apply: function (v, all) {
                var a = all || state();
                a.colorBlind = v;
                applyVisualFilter(a);
                document.documentElement.style.setProperty('--a11y-cb-strength', String(a.colorBlindStrength || 0));
            },
            revert: function () {
                body.classList.remove('n26-a11y-colorblind');
                document.documentElement.style.removeProperty('--a11y-cb-strength');
                var a = state();
                var keep = a.colorFilter !== 'off' || (parseInt(a.reduceWhitePoint, 10) || 0) > 0;
                if (!keep) {
                    body.style.setProperty('--a11y-filter', 'none');
                    body.classList.remove('n26-a11y-filter-on');
                }
            }
        },
        reduceMotion: {
            def: false,
            apply: function (v) {
                body.classList.toggle('n26-a11y-reduce-motion', !!v);
                // 兼容老 CSS 与老开关
                body.classList.toggle('reduce-motion', !!v);
            },
            revert: function () {
                body.classList.remove('n26-a11y-reduce-motion', 'reduce-motion');
            }
        },
        reduceTransparency: {
            def: false,
            apply: function (v) {
                body.classList.toggle('n26-a11y-no-transparency', !!v);
            },
            revert: function () {
                body.classList.remove('n26-a11y-no-transparency');
            }
        },
        focusRing: {
            def: false,
            apply: function (v) {
                body.classList.toggle('n26-a11y-focus-ring', !!v);
            },
            revert: function () {
                body.classList.remove('n26-a11y-focus-ring');
            }
        }
    };

    /* ======================================================================
       视觉扩展：滤镜合成 / 放大镜 / 指针大小
       ====================================================================== */

    function applyVisualFilter(a) {
        a = a || state();
        ensureFilterSvg();
        var parts = [];
        var cb = a.colorBlind;
        var st = parseInt(a.colorBlindStrength, 10) || 0;
        if (cb && cb !== 'off' && st > 0) {
            colorMatrixEl.setAttribute('values', blendMatrix(cb, st));
            parts.push('url(#n26-a11y-cb-filter)');
        }
        if (a.colorFilter === 'gray') parts.push('grayscale(1)');
        else if (a.colorFilter === 'invert') parts.push('invert(1)');
        var wp = Math.max(0, Math.min(100, parseInt(a.reduceWhitePoint, 10) || 0));
        if (wp > 0) parts.push('brightness(' + (1 - wp / 250).toFixed(3) + ')');
        body.style.setProperty('--a11y-filter', parts.length ? parts.join(' ') : 'none');
        body.classList.toggle('n26-a11y-filter-on', parts.length > 0);
        body.classList.toggle('n26-a11y-colorblind', cb !== 'off' && st > 0);
    }

    /* ---- 放大镜：胶囊取景框内渲染内容层的等比克隆（真实 DOM，非截图） ----
       做法：把 #desktop 深拷贝进胶囊裁切框，只对这份克隆施加 transform: scale()，
       真实桌面保持 1:1。镜头中心是缩放不动点，所以「镜心处的像素」与真实层完全对齐；
       镜内点击按 z 反算回真实坐标后在真实元素上触发，命中测试天然一致。
       镜头自身、大指针、字幕、扫描条都在 body 直属层，不会被二次放大。 */
    var lensEl = null;
    var lensWorld = null;
    var lensStage = null;
    var lensX = 0;
    var lensY = 0;
    var lensW = 360;
    var lensH = 200;
    var lensZoom = 2;
    var lensFollow = true;
    var lensDragging = false;   // Alt 拖动期间不触发穿透点击
    var lensObserver = null;
    var lensBodyObserver = null;
    var lensRefreshTimer = null;

    function ensureLens() {
        if (lensEl && lensWorld) return;
        // 取景世界：整屏裁剪成胶囊，内部放内容层克隆
        lensWorld = document.createElement('div');
        lensWorld.id = 'n26-a11y-lens-world';
        lensWorld.setAttribute('aria-hidden', 'true');
        lensStage = document.createElement('div');
        lensStage.id = 'n26-a11y-lens-stage';
        lensStage.setAttribute('aria-hidden', 'true');
        lensStage.setAttribute('inert', '');
        lensWorld.appendChild(lensStage);
        // 胶囊框：边框、内环、标签，始终在最上层且不参与缩放
        lensEl = document.createElement('div');
        lensEl.id = 'n26-a11y-lens';
        lensEl.setAttribute('aria-hidden', 'true');
        lensEl.innerHTML = '<span class="n26-lens-ring"></span><span class="n26-lens-tag">放大镜</span>';
        document.body.appendChild(lensWorld);
        document.body.appendChild(lensEl);
    }

    function lensScale(v) {
        return Math.max(1.5, Math.min(4, parseFloat(v) || 2));
    }

    /* 克隆层以视口为坐标系，镜头中心是缩放不动点；整屏再裁成胶囊 */
    function alignLensStage() {
        if (!lensStage || !lensWorld) return;
        lensStage.style.left = '0px';
        lensStage.style.top = '0px';
        lensStage.style.width = window.innerWidth + 'px';
        lensStage.style.height = window.innerHeight + 'px';
        lensStage.style.transformOrigin = lensX + 'px ' + lensY + 'px';
        lensStage.style.transform = 'scale(' + lensZoom + ')';
        var r = Math.round(lensH / 2);
        lensWorld.style.clipPath = 'inset(' +
            (lensY - lensH / 2) + 'px ' +
            (window.innerWidth - lensX - lensW / 2) + 'px ' +
            (window.innerHeight - lensY - lensH / 2) + 'px ' +
            (lensX - lensW / 2) + 'px round ' + r + 'px)';
    }

    function refreshLensStage() {
        ensureLens();
        var src = document.getElementById('desktop');
        if (!lensStage || !src) return;
        var clone = src.cloneNode(true);
        // 不复制会二次播放/二次请求的节点；画布克隆后本来就是空白，保留占位即可
        Array.prototype.forEach.call(clone.querySelectorAll('iframe, video, audio, object, embed'), function (n) {
            if (n.parentNode) n.parentNode.removeChild(n);
        });
        lensStage.textContent = '';
        // 壁纸垫底：镜头内任何空白处都是不透明的真实壁纸，不会透出未放大的页面
        var bg = document.getElementById('nexus-bg');
        if (bg) {
            var bgl = document.createElement('div');
            var bcs = getComputedStyle(bg);
            bgl.style.position = 'fixed';
            bgl.style.inset = '0';
            bgl.style.zIndex = '-1';
            bgl.style.backgroundImage = bcs.backgroundImage;
            bgl.style.backgroundSize = bcs.backgroundSize;
            bgl.style.backgroundPosition = bcs.backgroundPosition;
            bgl.style.backgroundRepeat = bcs.backgroundRepeat;
            bgl.style.backgroundColor = bcs.backgroundColor;
            bgl.style.filter = bcs.filter;
            bgl.style.transform = bcs.transform;
            bgl.style.transformOrigin = bcs.transformOrigin;
            bgl.style.willChange = 'auto';
            // 动态视频壁纸不克隆，退回当前主题底色，保证镜内始终不透明
            if (!bcs.backgroundImage || bcs.backgroundImage === 'none') {
                bgl.style.backgroundColor = body.classList.contains('dark-mode') ? '#0b0d12' : '#eef1f6';
            }
            lensStage.appendChild(bgl);
        }
        while (clone.firstChild) lensStage.appendChild(clone.firstChild);
        lensStage.dataset.build = String(Date.now());
        alignLensStage();
        // 强制一次重绘：大裁剪层首次合成偶发空白帧
        lensStage.style.opacity = '0.999';
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                if (lensStage) lensStage.style.opacity = '';
            });
        });
    }

    function startLensSync() {
        stopLensSync();
        var src = document.getElementById('desktop');
        if (!src || typeof MutationObserver === 'undefined') return;
        lensObserver = new MutationObserver(function () { scheduleLensRefresh(); });
        lensObserver.observe(src, { childList: true, subtree: true, attributes: true, characterData: true });
        // 主题/主题类切换不会动 #desktop，单独盯 body，必要时重建克隆
        lensBodyObserver = new MutationObserver(function () { scheduleLensRefresh(); });
        lensBodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    }

    function stopLensSync() {
        if (lensObserver) { lensObserver.disconnect(); lensObserver = null; }
        if (lensBodyObserver) { lensBodyObserver.disconnect(); lensBodyObserver = null; }
        if (lensRefreshTimer) { clearTimeout(lensRefreshTimer); lensRefreshTimer = null; }
    }

    function scheduleLensRefresh() {
        if (lensRefreshTimer) return;
        lensRefreshTimer = setTimeout(function () {
            lensRefreshTimer = null;
            if (body.classList.contains('n26-a11y-magnifier')) refreshLensStage();
        }, 320);
    }

    function placeLens(x, y) {
        lensX = Math.max(lensW / 2, Math.min(window.innerWidth - lensW / 2, x));
        lensY = Math.max(lensH / 2, Math.min(window.innerHeight - lensH / 2, y));
        if (lensEl) {
            lensEl.style.left = lensX + 'px';
            lensEl.style.top = lensY + 'px';
        }
        alignLensStage();
    }

    function setMagnifier(on, zoom) {
        ensureLens();
        lensZoom = lensScale(zoom);
        if (on && lensX === 0 && lensY === 0) {
            // 首次开启：出现在指针处，没有指针记录时落在屏幕中心
            lensX = lastMouseX || Math.round(window.innerWidth / 2);
            lensY = lastMouseY || Math.round(window.innerHeight / 2);
        }
        body.classList.toggle('n26-a11y-magnifier', !!on);
        if (lensWorld) lensWorld.classList.toggle('on', !!on);
        if (lensEl) {
            lensEl.classList.toggle('on', !!on);
            var tag = lensEl.querySelector('.n26-lens-tag');
            if (tag) tag.textContent = '放大镜 ' + lensZoom + '×';
        }
        if (on) {
            placeLens(lensX, lensY);
            refreshLensStage();
            startLensSync();
        } else {
            stopLensSync();
            // 关闭后立即清空克隆，避免重复 id 残留在页面里
            if (lensStage) lensStage.textContent = '';
        }
    }

    /* 镜内点击：把屏幕坐标按 z 反算回真实坐标，再在真实元素上派发点击 */
    function lensContainsPoint(x, y) {
        if (!body.classList.contains('n26-a11y-magnifier') || !lensEl) return false;
        var r = lensEl.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    function lensRealPoint(x, y) {
        return { x: lensX + (x - lensX) / lensZoom, y: lensY + (y - lensY) / lensZoom };
    }

    // 捕获阶段拦下镜内原生事件，避免落在「未放大的错元素」上
    document.addEventListener('mousedown', function (e) {
        if (!lensContainsPoint(e.clientX, e.clientY)) return;
        e.preventDefault();
        e.stopPropagation();
    }, true);

    document.addEventListener('click', function (e) {
        if (!lensContainsPoint(e.clientX, e.clientY)) return;
        e.preventDefault();
        e.stopPropagation();
        if (lensDragging) return;   // 拖动收尾的那次 click 不当作穿透点击
        var q = lensRealPoint(e.clientX, e.clientY);
        var el = document.elementFromPoint(q.x, q.y);
        if (!el || (lensEl && lensEl.contains(el))) return;
        try {
            var tag = el.tagName;
            if (el.focus && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || el.getAttribute('contenteditable') === 'true' || el.hasAttribute('tabindex'))) {
                el.focus({ preventScroll: true });
            }
        } catch (err) { }
        if (typeof el.click === 'function') el.click();
        else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: q.x, clientY: q.y, button: 0 }));
    }, true);

    function magnifierZoom(delta) {
        var a = state();
        var next = Math.max(1.5, Math.min(4, (parseFloat(a.magnifierZoom) || 2) + delta));
        next = Math.round(next * 10) / 10;
        set('magnifierZoom', next);
    }

    /* ---- 指针大小：跟随式大指针（真实点击不受影响） ---- */
    var ptrEl = null;

    function ensurePointer() {
        if (ptrEl) return;
        ptrEl = document.createElement('div');
        ptrEl.id = 'n26-a11y-pointer';
        ptrEl.setAttribute('aria-hidden', 'true');
        ptrEl.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M2.5 2.2 L2.5 20.5 L7.6 15.9 L10.8 21.6 L13.6 20.2 L10.5 14.7 L17.8 14.7 Z"/></svg>';
        document.body.appendChild(ptrEl);
    }

    function setPointerSize(size) {
        size = parseInt(size, 10) || 0;
        ensurePointer();
        body.classList.remove('n26-a11y-pointer-1', 'n26-a11y-pointer-2');
        if (size > 0) {
            body.classList.add('n26-a11y-pointer-' + size);
            ptrEl.classList.add('on');
            ptrEl.style.width = ptrEl.style.height = (size === 2 ? 56 : 34) + 'px';
        } else if (ptrEl) {
            ptrEl.classList.remove('on');
        }
    }

    /* ---- 光标跟踪（一个监听器供放大镜 / 大指针 / 鼠标键共用） ---- */
    var mouseKeysOn = false;
    var lastMouseX = 0, lastMouseY = 0;
    document.addEventListener('mousemove', function (e) {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        if (lensEl && lensEl.classList.contains('on') && lensFollow) placeLens(e.clientX, e.clientY);
        if (ptrEl && ptrEl.classList.contains('on') && !mouseKeysOn) {
            ptrEl.style.transform = 'translate(' + (e.clientX - 4) + 'px,' + (e.clientY - 3) + 'px)';
        }
    }, { passive: true });

    // Alt + 拖动：把放大镜固定在任意位置（不跟随指针）
    document.addEventListener('mousedown', function (e) {
        if (!body.classList.contains('n26-a11y-magnifier') || !e.altKey) return;
        e.preventDefault();
        lensFollow = false;
        lensDragging = true;
        set('magnifierFollow', false, { noRender: true });
        placeLens(e.clientX, e.clientY);
        var move = function (ev) { placeLens(ev.clientX, ev.clientY); };
        var up = function () {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            setTimeout(function () { lensDragging = false; }, 0);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    }, true);

    /* ======================================================================
       听觉扩展：字幕 / 闪屏 / 单声道
       ====================================================================== */

    var captionEl = null;

    function ensureCaption() {
        if (captionEl) return;
        captionEl = document.createElement('div');
        captionEl.id = 'n26-a11y-captions';
        captionEl.setAttribute('role', 'status');
        captionEl.setAttribute('aria-live', 'polite');
        document.body.appendChild(captionEl);
    }

    function styleCaption() {
        ensureCaption();
        var a = state();
        captionEl.style.fontSize = (parseInt(a.captionSize, 10) || 18) + 'px';
        captionEl.className = 'n26-cap-bg-' + (a.captionBg || 'dark') + (a.captionBorder ? ' n26-cap-bordered' : '');
    }

    function showCaption(text) {
        var a = state();
        if (!a.captions || !text) return;
        ensureCaption();
        captionEl.textContent = text;
        captionEl.classList.add('show');
        clearTimeout(captionEl.__t);
        captionEl.__t = setTimeout(function () { captionEl.classList.remove('show'); }, 4200);
    }

    var flashEl = null;

    function ensureFlash() {
        if (flashEl) return;
        flashEl = document.createElement('div');
        flashEl.id = 'n26-a11y-flash';
        flashEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(flashEl);
    }

    function flashScreen() {
        if (!state().visualFlash) return;
        ensureFlash();
        flashEl.classList.remove('pulse');
        void flashEl.offsetWidth;
        flashEl.classList.add('pulse');
    }

    var monoCtx = null;
    var monoGain = null;
    var monoRouted = typeof WeakSet === 'function' ? new WeakSet() : null;
    var monoRoutedCount = 0;

    function ensureMono() {
        if (monoCtx) return monoCtx;
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
            monoCtx = new AC();
            monoGain = monoCtx.createGain();
            monoGain.channelCountMode = 'max';
            monoGain.channelInterpretation = 'speakers';
            monoGain.connect(monoCtx.destination);
        } catch (e) {
            monoCtx = null;
        }
        return monoCtx;
    }

    function routeMedia(el) {
        if (!el || !monoCtx) return;
        if (monoRouted && monoRouted.has(el)) return;
        try {
            var src = monoCtx.createMediaElementSource(el);
            src.connect(monoGain);
            if (monoRouted) monoRouted.add(el);
            monoRoutedCount++;
        } catch (e) { }   // 已被其他 AudioContext 占用时忽略
    }

    function applyMono(on) {
        body.classList.toggle('n26-a11y-mono-audio', !!on);
        if (!on) {
            if (monoCtx && monoGain) {
                try {
                    monoGain.channelCount = 2;
                    monoGain.channelCountMode = 'max';
                } catch (e) { }
            }
            return;
        }
        // 只在真正开启时创建 AudioContext，避免无谓占用音频设备
        ensureMono();
        if (!monoCtx) return;
        try { if (monoCtx.state === 'suspended') monoCtx.resume(); } catch (e) { }
        // 可逆：channelCount 1 → 单声道，2 → 恢复立体声（无需刷新）
        try {
            monoGain.channelCount = 1;
            monoGain.channelCountMode = 'explicit';
        } catch (e) { }
        var media = document.querySelectorAll('audio, video');
        for (var i = 0; i < media.length; i++) routeMedia(media[i]);
    }

    // 单声道开启期间，新插入的媒体也自动接入
    if (typeof MutationObserver === 'function') {
        new MutationObserver(function (muts) {
            if (!monoCtx || !body.classList.contains('n26-a11y-mono-audio')) return;
            for (var i = 0; i < muts.length; i++) {
                var nodes = muts[i].addedNodes || [];
                for (var j = 0; j < nodes.length; j++) {
                    var n = nodes[j];
                    if (!n || n.nodeType !== 1) continue;
                    if (n.tagName === 'AUDIO' || n.tagName === 'VIDEO') routeMedia(n);
                    else if (n.querySelectorAll) {
                        var inner = n.querySelectorAll('audio, video');
                        for (var k = 0; k < inner.length; k++) routeMedia(inner[k]);
                    }
                }
            }
        }).observe(document.body, { childList: true, subtree: true });
    }

    /* ======================================================================
       语音扩展：旁白 / 朗读所选 / 语音操控
       ====================================================================== */

    var synth = ('speechSynthesis' in window) ? window.speechSynthesis : null;
    var voiceCache = [];

    function refreshVoices() {
        if (!synth) return voiceCache;
        try { voiceCache = synth.getVoices() || []; } catch (e) { voiceCache = []; }
        return voiceCache;
    }

    if (synth && typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', function () { refreshVoices(); });
    }

    function speak(text, force) {
        if (!synth) return false;
        var a = state();
        if (!force && !a.narration) return false;
        text = String(text || '').replace(/\s+/g, ' ').trim();
        if (!text) return false;
        if (text.length > 220) text = text.slice(0, 220) + '…';
        try {
            synth.cancel();   // 可打断：新的朗读立即替换旧的
            var u = new SpeechSynthesisUtterance(text);
            u.rate = Math.max(0.5, Math.min(2, parseFloat(a.narrationRate) || 1));
            u.pitch = Math.max(0.5, Math.min(2, parseFloat(a.narrationPitch) || 1));
            u.volume = Math.max(0, Math.min(1, (parseInt(a.narrationVolume, 10) || 0) / 100));
            if (a.narrationVoice) {
                refreshVoices();
                for (var i = 0; i < voiceCache.length; i++) {
                    if (voiceCache[i].voiceURI === a.narrationVoice) { u.voice = voiceCache[i]; break; }
                }
            }
            u.lang = (u.voice && u.voice.lang) || 'zh-CN';
            synth.speak(u);
            showCaption(text);
            return true;
        } catch (e) { return false; }
    }

    function describeEl(el) {
        if (!el || el.nodeType !== 1) return '';
        var t = el.getAttribute('aria-label');
        if (t) return t;
        var lb = el.getAttribute('aria-labelledby');
        if (lb) { var l = document.getElementById(lb); if (l) return l.textContent.trim(); }
        if (el.getAttribute('alt')) return el.getAttribute('alt');
        if (el.getAttribute('placeholder')) return el.getAttribute('placeholder');
        if (el.getAttribute('title')) return el.getAttribute('title');
        var txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt) return txt.slice(0, 120);
        var tag = el.tagName.toLowerCase();
        if (tag === 'button') return '按钮';
        if (tag === 'input') return '输入框';
        if (tag === 'a') return '链接';
        return '';
    }

    var narrTimer = null;
    document.addEventListener('focusin', function (e) {
        if (!state().narration) return;
        clearTimeout(narrTimer);
        var el = e.target;
        narrTimer = setTimeout(function () {
            var d = describeEl(el);
            if (d) speak(d);
        }, 200);   // 200ms 防抖，避免焦点快速移动时抢话
    });

    var hoverTimer = null;
    var lastHoverEl = null;
    document.addEventListener('mouseover', function (e) {
        var a = state();
        if (!a.narration || !a.narrationHover) return;
        var el = e.target;
        if (!el || el === lastHoverEl || !el.getAttribute) return;
        lastHoverEl = el;
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(function () {
            var d = describeEl(el);
            if (d) speak(d);
        }, 500);
    }, true);

    function speakSelection() {
        var sel = '';
        try { sel = String(window.getSelection() || ''); } catch (e) { }
        if (sel && sel.trim()) { speak(sel.trim(), true); return true; }
        var el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.value) {
            speak(el.value, true);
            return true;
        }
        announce('没有选中文本');
        return false;
    }

    var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    var recog = null;
    var recogOn = false;

    function voiceSupported() { return !!SR; }

    function moveFocus(dir) {
        var list = focusableList();
        if (!list.length) return;
        var cur = list.indexOf(document.activeElement);
        if (cur < 0) cur = 0;
        var next = list[(cur + dir + list.length) % list.length];
        try { next.focus({ preventScroll: false }); } catch (e) { }
        announce('已聚焦：' + describeEl(next));
    }

    function runVoiceCommand(raw) {
        var t = String(raw || '').replace(/\s+/g, '');
        if (!t) return;
        if (/打开设置|进入设置|打开系统设置/.test(t)) {
            try { if (typeof openApp === 'function') openApp('settings'); announce('已打开设置'); } catch (e) { }
        } else if (/关闭窗口|关闭当前|关掉窗口/.test(t)) {
            var w = document.querySelector('.window.n26-foreground, .window.active, .window');
            if (w) {
                var x = w.querySelector('.window-close, .n26-win-close');
                if (x) x.click();
                else { w.style.display = 'none'; }
                announce('已关闭窗口');
            }
        } else if (/返回|后退|上一级/.test(t)) {
            back();
        } else if (/点击|确认|按下/.test(t)) {
            var el = document.activeElement;
            if (el && el.click) { el.click(); announce('已点击：' + describeEl(el)); }
        } else if (/下一个|下一项/.test(t)) {
            moveFocus(1);
        } else if (/上一个|上一项/.test(t)) {
            moveFocus(-1);
        } else if (/向下滚动|下滑|往下/.test(t)) {
            var sp = document.getElementById('settingsPanel');
            if (sp) sp.scrollTop += 300; else window.scrollBy(0, 300);
        } else if (/向上滚动|上滑|往上/.test(t)) {
            var sp2 = document.getElementById('settingsPanel');
            if (sp2) sp2.scrollTop -= 300; else window.scrollBy(0, -300);
        } else {
            announce('未识别指令：' + t);
        }
    }

    function startVoiceControl() {
        if (!SR || recogOn) return !!SR;
        try {
            recog = new SR();
            recog.lang = 'zh-CN';
            recog.continuous = true;
            recog.interimResults = false;
            recog.onresult = function (ev) {
                var txt = '';
                for (var i = ev.resultIndex; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
                runVoiceCommand(txt);
            };
            recog.onerror = function (ev) {
                var err = ev && ev.error;
                if (err === 'not-allowed' || err === 'service-not-allowed') {
                    stopVoiceControl();
                    var a = state(); a.voiceControl = false; save(a);
                    announce('麦克风未授权，已关闭语音操控');
                    try { if (typeof showNotification === 'function') showNotification('语音操控已关闭', '需要麦克风授权才能使用', 'warning'); } catch (e) { }
                }
            };
            recog.onend = function () {
                if (recogOn && state().voiceControl) { try { recog.start(); } catch (e) { } }
            };
            recog.start();
            recogOn = true;
            return true;
        } catch (e) {
            recogOn = false;
            return false;
        }
    }

    function stopVoiceControl() {
        recogOn = false;
        if (recog) {
            try { recog.onend = null; recog.stop(); } catch (e) { }
            recog = null;
        }
    }

    /* ======================================================================
       交互扩展：键盘导航 / 扫描选择 / 粘滞键 / 慢速键 / 鼠标键
       ====================================================================== */

    function focusableList() {
        var sel = 'a[href],button,input,select,textarea,[tabindex],.settings-item,.desktop-icon,.dock-item,.fu-switch,.a11y-chip';
        var all = document.querySelectorAll(sel);
        var list = [];
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (el.disabled) continue;
            var r = el.getBoundingClientRect();
            var cs = window.getComputedStyle(el);
            if (r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0') list.push(el);
        }
        return list;
    }

    function applyKeyboardNav(on) {
        body.classList.toggle('n26-a11y-keyboard-nav', !!on);
        if (!on) {
            var added = document.querySelectorAll('[data-n26a11y-tab]');
            for (var j = 0; j < added.length; j++) {
                added[j].removeAttribute('tabindex');
                added[j].removeAttribute('data-n26a11y-tab');
                if (added[j].getAttribute('role') === 'button' &&
                    added[j].tagName !== 'BUTTON' && added[j].tagName !== 'A') {
                    added[j].removeAttribute('role');
                }
            }
            return;
        }
        var all = document.querySelectorAll('[onclick],.desktop-icon,.dock-item,.settings-item,.a11y-chip,.fu-switch,button,a[href]');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (!el.hasAttribute('tabindex')) {
                el.setAttribute('tabindex', '0');
                el.setAttribute('data-n26a11y-tab', '1');
            }
            if (!el.getAttribute('role') && el.tagName !== 'BUTTON' && el.tagName !== 'A') el.setAttribute('role', 'button');
        }
    }

    var scanTimer = null;
    var scanList = [];
    var scanIdx = -1;

    function stopScan() {
        if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
        var hits = document.querySelectorAll('.n26-scan-hit');
        for (var i = 0; i < hits.length; i++) hits[i].classList.remove('n26-scan-hit');
        scanIdx = -1;
    }

    function tickScan() {
        if (!state().switchScan) { stopScan(); return; }
        scanList = focusableList();
        if (!scanList.length) { scanTimer = setTimeout(tickScan, 800); return; }
        var old = document.querySelector('.n26-scan-hit');
        if (old) old.classList.remove('n26-scan-hit');
        scanIdx = (scanIdx + 1) % scanList.length;
        var el = scanList[scanIdx];
        try { el.focus({ preventScroll: false }); } catch (e) { }
        el.classList.add('n26-scan-hit');
        var delay = Math.max(300, Math.min(2000, parseInt(state().scanSpeed, 10) || 800));
        scanTimer = setTimeout(tickScan, delay);
    }

    function startScan() {
        stopScan();
        tickScan();
    }

    var sticky = { shift: false, ctrl: false, alt: false, meta: false };
    var stickyHits = 0;
    var stickyHitTimer = null;
    var stickyInd = null;

    function ensureStickyIndicator() {
        if (stickyInd) return;
        stickyInd = document.createElement('div');
        stickyInd.id = 'n26-a11y-sticky';
        stickyInd.setAttribute('role', 'status');
        stickyInd.setAttribute('aria-live', 'polite');
        document.body.appendChild(stickyInd);
    }

    function showSticky(text) {
        ensureStickyIndicator();
        stickyInd.textContent = text;
        stickyInd.classList.add('on');
        clearTimeout(stickyInd.__t);
        stickyInd.__t = setTimeout(function () { stickyInd.classList.remove('on'); }, 1800);
    }

    function clearSticky() {
        sticky.shift = sticky.ctrl = sticky.alt = sticky.meta = false;
    }

    function stickyLabel() {
        var parts = [];
        if (sticky.ctrl) parts.push('Ctrl');
        if (sticky.alt) parts.push('Alt');
        if (sticky.shift) parts.push('Shift');
        if (sticky.meta) parts.push('Meta');
        return parts.join(' + ');
    }

    // 粘滞键命中的 Nexus 组合（浏览器无法把修饰符注入后续按键，只接管这些）
    function stickyCombo(key) {
        if (sticky.ctrl && sticky.alt && sticky.shift && !sticky.meta && (key === 'r' || key === 'R')) { resetAll(); return true; }
        if (sticky.ctrl && sticky.alt && !sticky.shift && !sticky.meta) {
            if (key === 'l' || key === 'L') { set('magnifier', !state().magnifier); return true; }
            if (key === 'r' || key === 'R') { set('narration', !state().narration); return true; }
            if (key === 's' || key === 'S') { speakSelection(); return true; }
        }
        return false;
    }

    var slowTimer = null;
    var slowPending = null;

    function applySlowKey(target, key) {
        if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
            if (target && target.click) target.click();
        } else if (key === 'ArrowDown' || key === 'ArrowUp') {
            var sp = document.getElementById('settingsPanel');
            if (sp) sp.scrollTop += (key === 'ArrowDown' ? 60 : -60);
        } else if (key === 'ArrowRight') { moveFocus(1); }
        else if (key === 'ArrowLeft') { moveFocus(-1); }
    }

    var mkEl = null;
    var mkX = 0;
    var mkY = 0;

    function ensureMouseKeysPointer() {
        if (mkEl) return;
        mkEl = document.createElement('div');
        mkEl.id = 'n26-a11y-mousekeys';
        mkEl.setAttribute('aria-hidden', 'true');
        mkEl.innerHTML = '<span class="n26-mk-dot"></span><span class="n26-mk-ring"></span>';
        document.body.appendChild(mkEl);
        mkX = window.innerWidth / 2;
        mkY = window.innerHeight / 2;
        updateMouseKeysPointer();
    }

    function updateMouseKeysPointer() {
        if (!mkEl) return;
        mkX = Math.max(0, Math.min(window.innerWidth - 2, mkX));
        mkY = Math.max(0, Math.min(window.innerHeight - 2, mkY));
        mkEl.style.transform = 'translate(' + mkX + 'px,' + mkY + 'px)';
    }

    function setMouseKeys(on) {
        mouseKeysOn = !!on;
        body.classList.toggle('n26-a11y-mouse-keys', !!on);
        ensureMouseKeysPointer();
        mkEl.classList.toggle('on', !!on);
        if (on) updateMouseKeysPointer();
    }

    function mouseKeysClick() {
        var el = document.elementFromPoint(mkX, mkY);
        var hit = el;
        if (el && el.closest) {
            hit = el.closest('button,a[href],[role="button"],.fu-switch,.a11y-chip,.desktop-icon,.dock-item,.settings-item,input,select,textarea') || el;
        }
        if (hit && typeof hit.click === 'function') {
            try { hit.click(); } catch (e) { }
            announce('鼠标键：已点击 ' + (describeEl(hit) || hit.tagName.toLowerCase()));
        } else {
            announce('鼠标键：此处没有可点击元素');
        }
        if (mkEl) {
            mkEl.classList.remove('click');
            void mkEl.offsetWidth;
            mkEl.classList.add('click');
        }
    }

    /* ---------------- 新增 REG 项 ---------------- */

    REG.magnifier = {
        def: false,
        apply: function (v, all) {
            lensFollow = !(all && all.magnifierFollow === false);
            setMagnifier(!!v, all && all.magnifierZoom);
        },
        revert: function () { setMagnifier(false); }
    };
    REG.magnifierZoom = {
        def: 2,
        apply: function (v) {
            lensZoom = lensScale(v);
            if (lensEl) {
                var tag = lensEl.querySelector('.n26-lens-tag');
                if (tag) tag.textContent = '放大镜 ' + lensZoom + '×';
            }
            if (body.classList.contains('n26-a11y-magnifier')) alignLensStage();
        },
        revert: function () { }
    };
    REG.magnifierFollow = {
        def: true,
        apply: function (v) { lensFollow = !!v; },
        revert: function () { lensFollow = true; }
    };
    REG.colorFilter = {
        def: 'off',
        apply: function (v) {
            body.classList.toggle('n26-a11y-color-filter', v === 'gray' || v === 'invert');
            var a = state(); a.colorFilter = v; applyVisualFilter(a);
        },
        revert: function () {
            body.classList.remove('n26-a11y-color-filter');
            var a = state();
            if (a.colorBlind === 'off' && (parseInt(a.reduceWhitePoint, 10) || 0) === 0) {
                body.style.setProperty('--a11y-filter', 'none');
                body.classList.remove('n26-a11y-filter-on');
            }
        }
    };
    REG.colorBlindStrength = {
        def: 70,
        apply: function (v, all) {
            var a = all || state();
            a.colorBlindStrength = v;
            if (a.colorBlind !== 'off') applyVisualFilter(a);
        },
        revert: function () { }
    };
    REG.reduceWhitePoint = {
        def: 0,
        apply: function (v) {
            var a = state(); a.reduceWhitePoint = v; applyVisualFilter(a);
        },
        revert: function () { }
    };
    REG.boldText = {
        def: false,
        apply: function (v) { body.classList.toggle('n26-a11y-bold-text', !!v); },
        revert: function () { body.classList.remove('n26-a11y-bold-text'); }
    };
    REG.pointerSize = {
        def: 0,
        apply: function (v) { setPointerSize(v); },
        revert: function () { setPointerSize(0); }
    };
    REG.touchTargets = {
        def: false,
        apply: function (v) { body.classList.toggle('n26-a11y-touch-targets', !!v); },
        revert: function () { body.classList.remove('n26-a11y-touch-targets'); }
    };
    REG.monoAudio = {
        def: false,
        apply: function (v) { applyMono(!!v); },
        revert: function () { applyMono(false); }
    };
    REG.captions = {
        def: false,
        apply: function (v) {
            body.classList.toggle('n26-a11y-captions', !!v);
            styleCaption();
            if (v) showCaption('字幕已开启：通知与旁白会显示在这里');
        },
        revert: function () {
            body.classList.remove('n26-a11y-captions');
            if (captionEl) captionEl.classList.remove('show');
        }
    };
    REG.captionSize = { def: 18, apply: function () { styleCaption(); }, revert: function () { } };
    REG.captionBg = { def: 'dark', apply: function () { styleCaption(); }, revert: function () { } };
    REG.captionBorder = { def: true, apply: function () { styleCaption(); }, revert: function () { } };
    REG.visualFlash = {
        def: false,
        apply: function (v) {
            body.classList.toggle('n26-a11y-visual-flash', !!v);
            if (v) flashScreen();
        },
        revert: function () { body.classList.remove('n26-a11y-visual-flash'); }
    };
    REG.narration = {
        def: false,
        apply: function (v) {
            body.classList.toggle('n26-a11y-narration', !!v);
            if (v) speak('旁白已开启', true);
            else if (synth) { try { synth.cancel(); } catch (e) { } }
        },
        revert: function () {
            body.classList.remove('n26-a11y-narration');
            if (synth) { try { synth.cancel(); } catch (e) { } }
        }
    };
    REG.narrationHover = { def: false, apply: function () { }, revert: function () { } };
    REG.narrationNotify = { def: false, apply: function () { }, revert: function () { } };
    REG.narrationRate = { def: 1, apply: function () { }, revert: function () { } };
    REG.narrationPitch = { def: 1, apply: function () { }, revert: function () { } };
    REG.narrationVolume = { def: 80, apply: function () { }, revert: function () { } };
    REG.narrationVoice = { def: '', apply: function () { }, revert: function () { } };
    REG.voiceControl = {
        def: false,
        apply: function (v) {
            body.classList.toggle('n26-a11y-voice-control', !!v);
            if (v) startVoiceControl(); else stopVoiceControl();
        },
        revert: function () { stopVoiceControl(); body.classList.remove('n26-a11y-voice-control'); }
    };
    REG.keyboardNav = {
        def: false,
        apply: function (v) { applyKeyboardNav(!!v); },
        revert: function () { applyKeyboardNav(false); }
    };
    REG.switchScan = {
        def: false,
        apply: function (v) { if (v) startScan(); else stopScan(); body.classList.toggle('n26-a11y-scan', !!v); },
        revert: function () { stopScan(); body.classList.remove('n26-a11y-scan'); }
    };
    REG.scanSpeed = {
        def: 800,
        apply: function () { if (state().switchScan) startScan(); },
        revert: function () { }
    };
    REG.stickyKeys = {
        def: false,
        apply: function (v) {
            body.classList.toggle('n26-a11y-sticky-keys', !!v);
            clearSticky();
        },
        revert: function () { body.classList.remove('n26-a11y-sticky-keys'); clearSticky(); }
    };
    REG.slowKeys = {
        def: false,
        apply: function (v) { body.classList.toggle('n26-a11y-slow-keys', !!v); },
        revert: function () { body.classList.remove('n26-a11y-slow-keys'); }
    };
    REG.slowKeyDelay = { def: 500, apply: function () { }, revert: function () { } };
    REG.mouseKeys = {
        def: false,
        apply: function (v) { setMouseKeys(!!v); },
        revert: function () { setMouseKeys(false); }
    };
    REG.hoverPlayMotion = {
        def: false,
        apply: function (v) { body.classList.toggle('n26-a11y-hover-play', !!v); },
        revert: function () { body.classList.remove('n26-a11y-hover-play'); }
    };

    function applyAll() {
        var a = state();
        for (var id in REG) {
            try { REG[id].revert(); } catch (e) { }
        }
        for (var id2 in REG) {
            try {
                REG[id2].apply(a[id2], a);
            } catch (e) {
                console.warn('[a11y] apply ' + id2 + ' failed:', e);
            }
        }
        emit('all', a);
    }

    function set(id, value, opts) {
        if (!REG[id]) return;
        var a = state();
        a[id] = value;
        if (id === 'reduceMotion') a.__migrated = true;
        save(a);
        // 单项即时生效（个别项依赖组合值，走 applyAll）
        if (id === 'largeText') {
            REG.largeText.apply(!!value);
        } else if (id === 'colorBlind') {
            REG.colorBlind.apply(value, a);
        } else {
            REG[id].apply(value, a);
        }
        if (!(opts && opts.noRender)) renderPanel();
    }

    function toggle(id) {
        var a = state();
        if (id === 'reduceMotion') {
            // 旧开关可能单独置 true，这里取反要把它也清掉
            var next = !(a.reduceMotion);
            set('reduceMotion', next);
            return;
        }
        set(id, !a[id]);
    }

    function resetAll() {
        var a = {};
        for (var k in DEFAULTS) a[k] = DEFAULTS[k];
        a.schema = SCHEMA;
        a.__migrated = true;
        save(a);
        applyAll();
        renderPanel();
        try {
            sessionStorage.setItem('n26SafeMode', '1');
        } catch (e) { }
        try {
            if (typeof showNotification === 'function') {
                showNotification('辅助功能已复位', '缩放、对比度、滤镜、动效与焦点设置已恢复默认', 'success');
            }
        } catch (e) { }
    }

    /* ---------------- 设置页渲染 ---------------- */

    function esc(v) {
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function chip(id, value, label, active) {
        return '<button type="button" class="a11y-chip' + (active ? ' active' : '') + '" role="radio" aria-checked="' +
            (active ? 'true' : 'false') + '" data-a11y-key="chip:' + id + ':' + value +
            '" onclick="N26A11Y.set(\'' + id + '\',\'' + value + '\')">' + label + '</button>';
    }

    function sw(id, label, on) {
        return '<div class="fu-switch toggle-switch' + (on ? ' active' : '') + '" role="switch" tabindex="0" aria-checked="' +
            (on ? 'true' : 'false') + '" data-a11y-key="sw:' + id +
            '" aria-label="' + esc(label) + '" onclick="N26A11Y.toggle(\'' + id + '\')"></div>';
    }

    function row(label, desc, id, on, badge) {
        return '<div class="settings-row a11y-row">' +
            '<span class="a11y-row-text"><b>' + label + '</b><small>' + desc + '</small></span>' +
            (badge ? '<span class="a11y-badge">' + badge + '</span>' : '') +
            sw(id, label, on) +
            '</div>';
    }

    function choice(label, desc, id, options, value) {
        return '<div class="a11y-item">' +
            '<div class="a11y-item-head"><span><b>' + label + '</b><small>' + desc + '</small></span></div>' +
            '<div class="a11y-choice-grid" role="radiogroup" aria-label="' + esc(label) + '">' +
            options.map(function (o) {
                return chip(id, o[0], o[1], String(value) === String(o[0]));
            }).join('') +
            '</div></div>';
    }

    function slider(id, label, min, max, step, value, unit, disabled) {
        return '<div class="a11y-item a11y-slider-item">' +
            '<div class="a11y-item-head"><span><b>' + label + '</b></span>' +
            '<span class="a11y-value" id="a11yRangeVal-' + id + '">' + value + unit + '</span></div>' +
            '<div class="a11y-slider-row"><input type="range" class="a11y-slider" id="a11yRange-' + id + '" min="' + min +
            '" max="' + max + '" step="' + step + '" value="' + value + '" aria-label="' + esc(label) + '"' +
            (disabled ? ' disabled' : '') + ' oninput="N26A11Y.setRange(\'' + id + '\',this.value)"></div></div>';
    }

    function selectRow(label, desc, id, options, value) {
        return '<div class="a11y-item">' +
            '<div class="a11y-item-head"><span><b>' + label + '</b><small>' + desc + '</small></span></div>' +
            '<select class="a11y-select" id="a11ySel-' + id + '" aria-label="' + esc(label) +
            '" onchange="N26A11Y.set(\'' + id + '\',this.value)">' +
            options.map(function (o) {
                return '<option value="' + esc(o[0]) + '"' + (String(value) === String(o[0]) ? ' selected' : '') + '>' +
                    esc(o[1]) + '</option>';
            }).join('') +
            '</select></div>';
    }

    function actionRow(label, desc, fn, btn) {
        return '<div class="a11y-item a11y-action-item"><div class="a11y-item-head">' +
            '<span><b>' + label + '</b><small>' + desc + '</small></span>' +
            '<button type="button" class="a11y-action" onclick="' + fn + '">' + btn + '</button>' +
            '</div></div>';
    }

    function limited(text) {
        return '<div class="a11y-limited"><i class="fas fa-info-circle" aria-hidden="true"></i><span>' + text + '</span></div>';
    }

    function renderPanel() {
        var a = state();
        var scale = parseInt(a.scale, 10) || 100;
        var cbOff = a.colorBlind === 'off';
        var scaleChips = [100, 110, 125, 150, 175, 200].map(function (v) {
            return chip('scale', v, v + '%', scale === v);
        }).join('');
        var hcChips = [
            chip('highContrast', 'off', '关闭', a.highContrast === 'off'),
            chip('highContrast', 'black', '黑底黄字', a.highContrast === 'black'),
            chip('highContrast', 'white', '白底黑字', a.highContrast === 'white')
        ].join('');
        var cbChips = [
            chip('colorBlind', 'off', '关闭', a.colorBlind === 'off'),
            chip('colorBlind', 'protan', '红绿 · 红色弱', a.colorBlind === 'protan'),
            chip('colorBlind', 'deutan', '红绿 · 绿色弱', a.colorBlind === 'deutan'),
            chip('colorBlind', 'tritan', '蓝黄弱', a.colorBlind === 'tritan'),
            chip('colorBlind', 'achroma', '全色盲', a.colorBlind === 'achroma')
        ].join('');
        var cfChips = [
            chip('colorFilter', 'off', '关闭', a.colorFilter === 'off'),
            chip('colorFilter', 'gray', '灰度', a.colorFilter === 'gray'),
            chip('colorFilter', 'invert', '反转', a.colorFilter === 'invert')
        ].join('');
        var ptrChips = [
            chip('pointerSize', 0, '标准', parseInt(a.pointerSize, 10) === 0),
            chip('pointerSize', 1, '大', parseInt(a.pointerSize, 10) === 1),
            chip('pointerSize', 2, '特大', parseInt(a.pointerSize, 10) === 2)
        ].join('');
        var capBgChips = [
            chip('captionBg', 'dark', '深色', a.captionBg === 'dark'),
            chip('captionBg', 'light', '浅色', a.captionBg === 'light'),
            chip('captionBg', 'none', '无底色', a.captionBg === 'none')
        ].join('');
        var voiceOpts = [['', '系统默认音色']];
        var vlist = refreshVoices();
        for (var vi = 0; vi < vlist.length; vi++) {
            voiceOpts.push([vlist[vi].voiceURI, (vlist[vi].name || vlist[vi].voiceURI) + ' · ' + (vlist[vi].lang || '')]);
        }

        var html = '' +
            '<div class="a11y-page-head">' +
                '<button type="button" class="a11y-back" onclick="N26A11Y.back()" aria-label="返回上一级设置">' +
                    '<i class="fas fa-chevron-left"></i><span>返回</span>' +
                '</button>' +
                '<nav class="a11y-crumbs" aria-label="面包屑"><span>设置</span><i class="fas fa-chevron-right"></i><b>辅助功能</b></nav>' +
                '<span class="a11y-page-hint">即时生效 · 游客可用</span>' +
            '</div>' +
            '<h3>辅助功能</h3>' +
            '<p class="a11y-sub">按 macOS 辅助功能五组分类：视觉 / 听觉 / 语音 / 交互 / 动态。所有开关写入 settings.a11y，加载即生效并持久化。</p>' +

            /* ---------------- 视觉 ---------------- */
            '<div class="settings-section a11y-group" aria-labelledby="a11y-g-visual">' +
                '<h4 id="a11y-g-visual"><i class="fas fa-eye" aria-hidden="true"></i>视觉</h4>' +
                '<div class="a11y-item">' +
                    '<div class="a11y-item-head"><span>界面缩放<small>放大窗口内容与根字号，桌面图标与 Dock 保持原位</small></span>' +
                    '<span class="a11y-value">' + scale + '%</span></div>' +
                    '<div class="a11y-choice-grid" role="radiogroup" aria-label="界面缩放">' + scaleChips + '</div>' +
                '</div>' +
                row('大字体', '正文与控件同步放大，独立于缩放档', 'largeText', !!a.largeText) +
                row('文字加粗', '正文、按钮与标签统一加粗，提升可读性', 'boldText', !!a.boldText) +
                '<div class="a11y-item">' +
                    '<div class="a11y-item-head"><span>高对比度<small>切换令牌集，强制不透明与 1px 描边；不叠滤镜</small></span></div>' +
                    '<div class="a11y-choice-grid" role="radiogroup" aria-label="高对比度">' + hcChips + '</div>' +
                '</div>' +
                '<div class="a11y-item">' +
                    '<div class="a11y-item-head"><span>色彩滤镜<small>整体灰度 / 反转，与色盲校正合成同一层滤镜</small></span></div>' +
                    '<div class="a11y-choice-grid" role="radiogroup" aria-label="色彩滤镜">' + cfChips + '</div>' +
                '</div>' +
                '<div class="a11y-item">' +
                    '<div class="a11y-item-head"><span>色盲校正<small>全局只挂一层 SVG feColorMatrix，可调强度</small></span>' +
                    '<span class="a11y-value">' + (cbOff ? '未启用' : a.colorBlindStrength + '%') + '</span></div>' +
                    '<div class="a11y-choice-grid" role="radiogroup" aria-label="色盲校正">' + cbChips + '</div>' +
                '</div>' +
                slider('colorBlindStrength', '色盲强度', 0, 100, 5, parseInt(a.colorBlindStrength, 10) || 0, '%', cbOff) +
                slider('reduceWhitePoint', '降低白点', 0, 100, 5, parseInt(a.reduceWhitePoint, 10) || 0, '%', false) +
                row('放大镜', '胶囊取景框内放大真实内容层（DOM 克隆，非截图）；镜内点击按倍数反算后命中下方真实元素', 'magnifier', !!a.magnifier, 'Ctrl+Alt+L') +
                slider('magnifierZoom', '放大倍数', 1.5, 4, 0.5, parseFloat(a.magnifierZoom) || 2, '×', false) +
                row('跟随指针', '关闭后放大镜固定，可用 Alt+拖动或方向键移动', 'magnifierFollow', a.magnifierFollow !== false) +
                limited('放大镜开销说明：只对镜头内的内容克隆做 GPU transform，真实桌面保持 1:1；放大期间全屏模糊降到 8px、关闭液态镜面与颗粒。克隆随界面变化按 320ms 节流刷新，视频/iframe 不复制以免二次播放；若设备吃力可降低倍数或关闭跟随。') +
                '<div class="a11y-item">' +
                    '<div class="a11y-item-head"><span>指针大小<small>叠加自绘大指针并隐藏原生光标；点击位置不变</small></span></div>' +
                    '<div class="a11y-choice-grid" role="radiogroup" aria-label="指针大小">' + ptrChips + '</div>' +
                '</div>' +
                row('触控目标 44px', '按钮与可点区域的点击热区不小于 44×44', 'touchTargets', !!a.touchTargets) +
                row('键盘焦点高亮', '所有可聚焦元素显示高对比焦点环', 'focusRing', !!a.focusRing) +
                row('减少透明', '液态玻璃退回不透明底，关闭全部毛玻璃', 'reduceTransparency', !!a.reduceTransparency) +
            '</div>' +

            /* ---------------- 听觉 ---------------- */
            '<div class="settings-section a11y-group" aria-labelledby="a11y-g-hear">' +
                '<h4 id="a11y-g-hear"><i class="fas fa-volume-up" aria-hidden="true"></i>听觉</h4>' +
                row('单声道音频', '页内音视频合并为一个声道输出，左右耳听到相同内容', 'monoAudio', !!a.monoAudio) +
                row('字幕', '通知与旁白文字显示在屏幕底部', 'captions', !!a.captions) +
                slider('captionSize', '字幕字号', 14, 30, 1, parseInt(a.captionSize, 10) || 18, 'px', !a.captions) +
                '<div class="a11y-item">' +
                    '<div class="a11y-item-head"><span>字幕底色<small>深色 / 浅色 / 无底色，深浅色模式下都保持对比</small></span></div>' +
                    '<div class="a11y-choice-grid" role="radiogroup" aria-label="字幕底色">' + capBgChips + '</div>' +
                '</div>' +
                row('字幕边框', '字幕加 1px 描边，复杂壁纸上也能读清', 'captionBorder', !!a.captionBorder) +
                row('闪屏提醒', '通知到达时全屏短促闪烁一次', 'visualFlash', !!a.visualFlash) +
                limited('受浏览器限制：字幕只覆盖本 OS 的通知与旁白文本，无法读取第三方页面音视频的音轨；单声道只作用于页内 &lt;audio&gt;/&lt;video&gt;，不影响系统混音器。') +
            '</div>' +

            /* ---------------- 语音 ---------------- */
            '<div class="settings-section a11y-group" aria-labelledby="a11y-g-speak">' +
                '<h4 id="a11y-g-speak"><i class="fas fa-microphone" aria-hidden="true"></i>语音</h4>' +
                row('旁白', '朗读获得焦点的控件与悬停元素', 'narration', !!a.narration, 'Ctrl+Alt+R') +
                row('悬停朗读', '鼠标停在元素 500ms 后朗读其名称', 'narrationHover', !!a.narrationHover) +
                row('朗读通知', '通知到达时朗读标题与正文', 'narrationNotify', !!a.narrationNotify) +
                slider('narrationRate', '语速', 0.5, 2, 0.1, parseFloat(a.narrationRate) || 1, '×', false) +
                slider('narrationPitch', '音调', 0.5, 2, 0.1, parseFloat(a.narrationPitch) || 1, '×', false) +
                slider('narrationVolume', '音量', 0, 100, 5, parseInt(a.narrationVolume, 10) || 0, '%', false) +
                selectRow('音色', '系统语音列表，随浏览器可用语音变化', 'narrationVoice', voiceOpts, a.narrationVoice || '') +
                actionRow('朗读所选内容', '朗读选中的文本，或当前输入框内容；快捷键 Ctrl+Alt+S', 'N26A11Y.speakSelection()', '朗读') +
                (voiceSupported()
                    ? row('语音操控', '用语音命令「打开设置 / 下一个 / 点击 / 返回」操作本 OS', 'voiceControl', !!a.voiceControl)
                    : '<div class="settings-row a11y-row"><span class="a11y-row-text"><b>语音操控</b>' +
                      '<small>当前浏览器未提供 Web Speech API，无法启用</small></span>' +
                      '<span class="a11y-badge warn">不可用</span>' + swOff() + '</div>') +
                limited('受浏览器限制：语音操控依赖 Web Speech API —— Chrome / Edge 可用，Firefox 不支持，Safari 需手动开启；必须授权麦克风，且只识别本页命令，无法控制系统级或其他应用。') +
            '</div>' +

            /* ---------------- 交互 ---------------- */
            '<div class="settings-section a11y-group" aria-labelledby="a11y-g-inter">' +
                '<h4 id="a11y-g-inter"><i class="fas fa-keyboard" aria-hidden="true"></i>交互</h4>' +
                row('键盘全导航', '所有可点元素进入 Tab 顺序，Enter 确认、Esc 退出', 'keyboardNav', !!a.keyboardNav) +
                row('开关控制（扫描）', '自动遍历可操作元素，Enter / 空格确认当前高亮项', 'switchScan', !!a.switchScan) +
                slider('scanSpeed', '扫描速度', 300, 2000, 50, parseInt(a.scanSpeed, 10) || 800, 'ms', false) +
                row('粘滞键', '依次锁定 Ctrl / Alt / Shift，再按字母触发组合', 'stickyKeys', !!a.stickyKeys) +
                row('慢速键', 'Enter / 空格 / 方向键需持续按住才会触发', 'slowKeys', !!a.slowKeys) +
                slider('slowKeyDelay', '慢速键延迟', 200, 1500, 50, parseInt(a.slowKeyDelay, 10) || 500, 'ms', false) +
                row('鼠标键', '用方向键移动准星，Enter / 空格点击下方元素', 'mouseKeys', !!a.mouseKeys) +
                limited('受浏览器限制：浏览器不允许合成真实修饰键，粘滞键只接管本 OS 组合（Ctrl+Alt+L 放大镜 / Ctrl+Alt+R 旁白 / Ctrl+Alt+S 朗读所选 / Ctrl+Alt+Shift+R 复位），不会转发给浏览器原生快捷键。') +
            '</div>' +

            /* ---------------- 动态 ---------------- */
            '<div class="settings-section a11y-group" aria-labelledby="a11y-g-motion">' +
                '<h4 id="a11y-g-motion"><i class="fas fa-running" aria-hidden="true"></i>动态</h4>' +
                row('减弱动画', '停用位移、缩放、视差与入场动画，保留淡入淡出', 'reduceMotion', !!a.reduceMotion) +
                row('悬停才播放动效', '自动播放的动画默认暂停，鼠标悬停时才播放', 'hoverPlayMotion', !!a.hoverPlayMotion) +
                limited('首次启动读取系统 prefers-reduced-motion；用户手动改过后以本页设置为准。') +
            '</div>' +

            /* ---------------- 应急复位 ---------------- */
            '<div class="settings-section a11y-group a11y-reset-card">' +
                '<h4><i class="fas fa-life-ring" aria-hidden="true"></i>应急复位</h4>' +
                '<div class="a11y-reset-row">' +
                    '<span>任何组合把界面调乱了，一次恢复全部默认值；本次开机同时标记安全模式，不加载改造包。</span>' +
                    '<button type="button" class="a11y-reset-btn" onclick="N26A11Y.resetAll()">' +
                        '<i class="fas fa-rotate-left" aria-hidden="true"></i>立即复位' +
                    '</button>' +
                '</div>' +
                '<div class="a11y-kbd"><kbd>Ctrl</kbd><kbd>Alt</kbd><kbd>Shift</kbd><kbd>R</kbd> 随时复位</div>' +
            '</div>' +
            '';

        // 就地刷新：切换开关后同步重绘（保留滚动位置与键盘焦点）
        var host = document.getElementById('settingsPanel');
        if (host && typeof settingsActiveTab !== 'undefined' && settingsActiveTab === 'accessibility') {
            var scrollTop = host.scrollTop;
            var activeEl = document.activeElement;
            var key = null;
            if (activeEl && host.contains(activeEl)) {
                if (activeEl.id) key = '#' + activeEl.id;
                else key = activeEl.getAttribute('data-a11y-key');
            }
            host.innerHTML = html;
            host.scrollTop = scrollTop;
            if (key) {
                try {
                    var next = key.charAt(0) === '#' ? host.querySelector(key)
                        : host.querySelector('[data-a11y-key="' + key + '"]');
                    if (next && typeof next.focus === 'function') next.focus({ preventScroll: true });
                } catch (e) { }
            }
        }
        return html;
    }

    var RANGE_META = {
        colorBlindStrength: { unit: '%', min: 0, max: 100, int: true },
        reduceWhitePoint: { unit: '%', min: 0, max: 100, int: true },
        magnifierZoom: { unit: '×', min: 1.5, max: 4, int: false },
        captionSize: { unit: 'px', min: 14, max: 30, int: true },
        narrationRate: { unit: '×', min: 0.5, max: 2, int: false },
        narrationPitch: { unit: '×', min: 0.5, max: 2, int: false },
        narrationVolume: { unit: '%', min: 0, max: 100, int: true },
        scanSpeed: { unit: 'ms', min: 300, max: 2000, int: true },
        slowKeyDelay: { unit: 'ms', min: 200, max: 1500, int: true }
    };

    function setRange(id, value) {
        var meta = RANGE_META[id];
        if (!meta) return;
        var num = parseFloat(value);
        if (isNaN(num)) return;
        num = Math.max(meta.min, Math.min(meta.max, num));
        num = meta.int ? Math.round(num) : Math.round(num * 10) / 10;
        var a = state();
        a[id] = num;
        save(a);
        try {
            if (id === 'colorBlindStrength') REG.colorBlind.apply(a.colorBlind, a);
            else if (REG[id]) REG[id].apply(num, a);
        } catch (e) { }
        var valEl = document.getElementById('a11yRangeVal-' + id);
        if (valEl) valEl.textContent = num + meta.unit;
        if (id === 'scanSpeed' && a.switchScan) startScan();
    }

    function setColorStrength(value) { setRange('colorBlindStrength', value); }

    function swOff() {
        return '<div class="fu-switch toggle-switch" role="switch" aria-disabled="true" aria-checked="false"></div>';
    }

    function back() {
        if (typeof window.switchSettingsTab === 'function') {
            window.switchSettingsTab(prevTab || 'computer');
        }
    }

    /* ---------------- 全局快捷键 / 二级页跟踪 / 基础 aria ---------------- */

    function bindKeys() {
        document.addEventListener('keydown', function (e) {
            var st = state();
            var el = e.target;
            var tag = el && el.tagName;
            var inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable);

            // G1 应急复位：Ctrl+Alt+Shift+R（必须最先，避免被其他组合吃掉）
            if (e.ctrlKey && e.altKey && e.shiftKey && (e.key === 'R' || e.key === 'r' || e.code === 'KeyR')) {
                e.preventDefault();
                e.stopPropagation();
                resetAll();
                return;
            }
            // 全局辅助快捷键：Ctrl+Alt+L / R / S
            if (e.ctrlKey && e.altKey && !e.shiftKey && !e.repeat) {
                var k = (e.key || '').toLowerCase();
                if (k === 'l') { e.preventDefault(); e.stopPropagation(); set('magnifier', !st.magnifier); return; }
                if (k === 'r') { e.preventDefault(); e.stopPropagation(); set('narration', !st.narration); return; }
                if (k === 's') { e.preventDefault(); e.stopPropagation(); speakSelection(); return; }
            }

            // 粘滞键：单独按修饰键 → 锁定；随后按字母执行本 OS 组合
            if (st.stickyKeys && !inField) {
                if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.key === 'Shift') sticky.shift = !sticky.shift;
                    else if (e.key === 'Control') sticky.ctrl = !sticky.ctrl;
                    else if (e.key === 'Alt') sticky.alt = !sticky.alt;
                    else sticky.meta = !sticky.meta;
                    showSticky(stickyLabel() ? '粘滞键：' + stickyLabel() + ' 已锁定' : '粘滞键：已清空');
                    return;
                }
                if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && stickyLabel()) {
                    if (stickyCombo(e.key)) {
                        e.preventDefault();
                        e.stopPropagation();
                        clearSticky();
                        showSticky('粘滞键：组合已执行');
                        return;
                    }
                    clearSticky();
                    showSticky('粘滞键：组合未匹配，已清空');
                }
            }

            // Esc：优先退出放大镜 / 扫描 / 鼠标键
            if (e.key === 'Escape' && !inField && !e.ctrlKey && !e.altKey) {
                if (st.magnifier) { e.preventDefault(); e.stopPropagation(); set('magnifier', false); return; }
                if (st.switchScan) { e.preventDefault(); e.stopPropagation(); set('switchScan', false); return; }
                if (st.mouseKeys) { e.preventDefault(); e.stopPropagation(); set('mouseKeys', false); return; }
            }

            // 鼠标键：方向键移动准星，Enter / 空格点击
            if (st.mouseKeys && !inField) {
                var stepM = e.shiftKey ? 2 : 10;
                var handledM = true;
                if (e.key === 'ArrowLeft') mkX -= stepM;
                else if (e.key === 'ArrowRight') mkX += stepM;
                else if (e.key === 'ArrowUp') mkY -= stepM;
                else if (e.key === 'ArrowDown') mkY += stepM;
                else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') mouseKeysClick();
                else handledM = false;
                if (handledM) { e.preventDefault(); e.stopPropagation(); updateMouseKeysPointer(); return; }
            }

            // 放大镜：方向键移动取景框（Shift 微调）
            if (st.magnifier && !inField && !st.mouseKeys) {
                var stepL = e.shiftKey ? 8 : 40;
                var handledL = true;
                if (e.key === 'ArrowLeft') lensX -= stepL;
                else if (e.key === 'ArrowRight') lensX += stepL;
                else if (e.key === 'ArrowUp') lensY -= stepL;
                else if (e.key === 'ArrowDown') lensY += stepL;
                else handledL = false;
                if (handledL) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (lensFollow) { lensFollow = false; set('magnifierFollow', false, { noRender: true }); }
                    placeLens(lensX, lensY);
                    return;
                }
            }

            // 慢速键：Enter / 空格 / 方向键需持续按住才触发
            if (st.slowKeys && !inField &&
                ['Enter', ' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) >= 0) {
                e.preventDefault();
                e.stopPropagation();
                clearTimeout(slowTimer);
                var keyCopy = e.key;
                slowPending = setTimeout(function () {
                    applySlowKey(document.activeElement, keyCopy);
                    announce('慢速键：已触发 ' + keyCopy);
                }, Math.max(200, Math.min(1500, parseInt(st.slowKeyDelay, 10) || 500)));
                announce('慢速键：继续按住…');
                return;
            }

            // 开关控制（扫描）：确认当前高亮项
            if (st.switchScan && !inField && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
                var hit = el && el.classList && el.classList.contains('n26-scan-hit') ? el
                    : document.querySelector('.n26-scan-hit');
                if (hit) {
                    e.preventDefault();
                    e.stopPropagation();
                    try { hit.click(); } catch (x) { }
                    announce('开关控制：已激活 ' + (describeEl(hit) || hit.tagName.toLowerCase()));
                    return;
                }
            }

            // 开关 / 单选胶囊：Enter、Space 激活（div 不会原生触发）
            if (el && el.classList) {
                if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') &&
                    (el.classList.contains('fu-switch') || el.classList.contains('a11y-chip'))) {
                    e.preventDefault();
                    e.stopPropagation();   // 避免长按空格同时唤起 AI 小方
                    el.click();
                    return;
                }
                // 单选组内方向键移动并选中，符合 WAI-ARIA radiogroup
                if (el.classList.contains('a11y-chip') &&
                    (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                    var grid = el.closest('.a11y-choice-grid');
                    if (grid) {
                        var chips = Array.prototype.slice.call(grid.querySelectorAll('.a11y-chip'));
                        var idx = chips.indexOf(el);
                        if (idx >= 0 && chips.length) {
                            var dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
                            var next = chips[(idx + dir + chips.length) % chips.length];
                            e.preventDefault();
                            next.focus({ preventScroll: true });
                            next.click();
                        }
                        return;
                    }
                }
                // 键盘全导航：普通可聚焦元素 Enter 确认
                if (st.keyboardNav && e.key === 'Enter' && !inField &&
                    el.getAttribute && el.getAttribute('tabindex') === '0' &&
                    !/INPUT|TEXTAREA|SELECT|BUTTON|A/.test(tag)) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (el.click) el.click();
                    return;
                }
            }

            // Esc 从辅助功能二级页返回
            if (e.key === 'Escape' && !inField && !e.shiftKey && !e.ctrlKey && !e.altKey) {
                if (typeof settingsActiveTab !== 'undefined' && settingsActiveTab === 'accessibility') {
                    back();
                }
            }
        }, true);

        // 慢速键提前松开 → 取消这次触发
        document.addEventListener('keyup', function () {
            if (!state().slowKeys) return;
            if (slowPending) { clearTimeout(slowTimer); slowPending = null; }
        }, true);
    }

    function wrapTabSwitch() {
        if (typeof window.switchSettingsTab !== 'function' || window.switchSettingsTab.__n26A11yWrap) return;
        var orig = window.switchSettingsTab;
        window.switchSettingsTab = function (id) {
            if (typeof settingsActiveTab !== 'undefined' && settingsActiveTab !== 'accessibility' && id === 'accessibility') {
                prevTab = settingsActiveTab;
            }
            return orig.apply(this, arguments);
        };
        window.switchSettingsTab.__n26A11yWrap = true;
        // 让键盘也能在侧栏移动/激活（A9 / C1 的最小公共部分）
        document.addEventListener('keydown', function (e) {
            var item = e.target && e.target.closest ? e.target.closest('.settings-item') : null;
            if (!item) return;
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                item.click();
            }
        }, true);
        document.addEventListener('focusin', function (e) {
            var item = e.target && e.target.closest ? e.target.closest('.settings-item') : null;
            if (item && !item.hasAttribute('tabindex')) {
                item.setAttribute('tabindex', '0');
                item.setAttribute('role', 'button');
                if (!item.getAttribute('aria-label')) {
                    item.setAttribute('aria-label', item.textContent.trim());
                }
            }
        });
        // 侧栏本身也补一次
        var items = document.querySelectorAll('.settings-item');
        for (var i = 0; i < items.length; i++) {
            items[i].setAttribute('tabindex', '0');
            items[i].setAttribute('role', 'button');
            if (!items[i].getAttribute('aria-label')) {
                items[i].setAttribute('aria-label', items[i].textContent.trim());
            }
        }
    }

    function ensureLive() {
        var live = document.getElementById('n26A11yLive');
        if (live) return live;
        live = document.createElement('div');
        live.id = 'n26A11yLive';
        live.className = 'n26-sr-only';
        live.setAttribute('role', 'status');
        live.setAttribute('aria-live', 'polite');
        live.setAttribute('aria-atomic', 'true');
        document.body.appendChild(live);
        return live;
    }

    function announce(text) {
        var live = ensureLive();
        live.textContent = '';
        setTimeout(function () { live.textContent = text; }, 30);
    }

    document.addEventListener('a11y:change', function (e) {
        if (e.detail && e.detail.id !== 'all') {
            var names = {
                scale: '界面缩放', largeText: '大字体', highContrast: '高对比度', colorBlind: '色盲模式',
                colorBlindStrength: '色盲强度', reduceMotion: '减弱动画', reduceTransparency: '减少透明',
                focusRing: '键盘焦点高亮'
            };
            announce((names[e.detail.id] || e.detail.id) + '已更新');
        }
    });

    // 设置页切换到辅助功能时播报
    document.addEventListener('click', function (e) {
        var item = e.target && e.target.closest ? e.target.closest('.settings-item') : null;
        if (!item) return;
        var label = item.getAttribute('aria-label') || item.textContent.trim();
        if (label.indexOf('辅助功能') >= 0) {
            setTimeout(function () { announce('已进入辅助功能设置'); }, 60);
        }
    }, true);

    /* ---------------- 通知联动：闪屏 / 字幕 / 朗读 ---------------- */

    function wrapNotify() {
        if (typeof window.showNotification !== 'function' || window.showNotification.__n26A11yWrap) return;
        var orig = window.showNotification;
        window.showNotification = function (title, msg, type) {
            var r = orig.apply(this, arguments);
            try {
                var a = state();
                if (a.visualFlash) flashScreen();
                if (a.captions) showCaption((title ? title + '：' : '') + (msg || ''));
                if (a.narration && a.narrationNotify) speak((title || '') + ' ' + (msg || ''), true);
            } catch (e) { }
            return r;
        };
        window.showNotification.__n26A11yWrap = true;
        window.__n26A11yNotifyWrapped = true;
    }

    /* ---------------- 对外 API ---------------- */

    window.N26A11Y = {
        version: 'M3',
        defaults: DEFAULTS,
        state: state,
        applyAll: applyAll,
        set: set,
        toggle: toggle,
        setRange: setRange,
        resetAll: resetAll,
        renderPanel: renderPanel,
        setColorStrength: setColorStrength,
        speak: function (t) { return speak(t, true); },
        speakSelection: speakSelection,
        toggleMagnifier: function () { set('magnifier', !state().magnifier); },
        zoomMagnifier: function (delta) { magnifierZoom(delta); },
        voiceSupported: voiceSupported,
        startVoiceControl: startVoiceControl,
        stopVoiceControl: stopVoiceControl,
        runVoiceCommand: runVoiceCommand,
        flashScreen: flashScreen,
        showCaption: showCaption,
        monoInfo: function () {
            return monoCtx ? {
                state: monoCtx.state,
                channelCount: monoGain.channelCount,
                channelCountMode: monoGain.channelCountMode,
                routed: monoRoutedCount
            } : { state: 'unavailable' };
        },
        back: back,
        on: function (fn) {
            document.addEventListener('a11y:change', function (e) { fn(e.detail); });
        }
    };

    /* ---------------- 启动 ---------------- */

    ensureFilterSvg();
    ensureLive();
    bindKeys();
    wrapTabSwitch();
    wrapNotify();
    if (synth && typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', function () {
            refreshVoices();
            if (typeof settingsActiveTab !== 'undefined' && settingsActiveTab === 'accessibility') renderPanel();
        });
    }

    // 若 applyUserSettings 已经跑过（脚本加载晚于它），补一次；正常启动由主壳调用
    if (window.__N26_A11Y_APPLIED__) applyAll();

})();
