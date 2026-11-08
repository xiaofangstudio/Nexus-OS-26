/* Nexus OS 26 · 小组件选择器 v5（FluentOS 两级流程）
 * Level 1：组件列表（每个组件只出现一次，默认尺寸真实预览）
 * Level 2：选中后进入尺寸滚轮（水平滚动/拖拽/滚轮连续过全部尺寸，中间放大预览）
 * 选定即放置：放置后选择页自动退场，FLIP 飞入桌面槽位
 */
(function () {
    'use strict';
    var W = null;            // 当前详情态
    var activeIdx = 0;
    var drag = null;
    var placing = false;     // 放置中：跳过列表重建，避免详情页闪回
    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }

    function sizesOf(id) {
        try { return n26WidgetSizes(id) || []; } catch (e) { return []; }
    }
    function specOf(id) {
        try { return n26WidgetSpec(id); } catch (e) { return null; }
    }
    function dims(s) { return s.cols + '×' + s.rows; }
    function density(s) {
        var cells = s.cols * s.rows;
        if (s.rows === 1) return '横向长条 · 单行横排';
        if (cells <= 4) return '只放最关键的 1 个数据点';
        if (cells <= 9) return '3–5 条关键信息';
        if (cells <= 12) return '列表 / 图表 / 多区块';
        return '完整信息与常用操作';
    }
    function grid() { return document.getElementById('widgetPanelGrid'); }

    /* ---------- Level 1 ---------- */
    function level1() {
        W = null; activeIdx = 0;
        var panel = document.querySelector('#widgetPanel .widget-panel');
        if (panel) panel.classList.remove('n26-detail');
        var wheel = document.getElementById('n26SizeWheel');
        if (wheel) wheel.remove();
        var g = grid();
        if (!g) return;
        var rail = document.getElementById('widgetPanelSizeRail');
        if (rail) rail.style.display = 'none';
        g.style.display = '';
        [].forEach.call(g.querySelectorAll('.widget-panel-card'), function (card) {
            var id = card.dataset.widgetId;
            if (!id) return;
            card.style.display = '';
            var list = sizesOf(id);
            var sp = specOf(id);
            var d = (sp && sp.fixed) ? list[0] : list[0];
            if (!d) return;
            card._size = { cols: d.cols, rows: d.rows };
            var sizesRow = card.querySelector('.widget-panel-card-sizes');
            if (sizesRow) sizesRow.style.setProperty('display', 'none', 'important');
            var inner = card.querySelector('.widget-panel-card-preview-inner');
            if (inner) {
                inner.dataset.rendered = '';
                try { renderWidgetPreviewInto(inner, id, card._size); } catch (e) { }
            }
            var nm = card.querySelector('.widget-panel-card-name');
            if (nm) nm.textContent = nm.dataset.name || nm.textContent;
        });
    }

    /* ---------- Level 2：尺寸滚轮 ---------- */
    function enterDetail(id, backRect) {
        var g = grid();
        if (!g) return;
        var list = sizesOf(id);
        if (!list.length) return;
        var info = (typeof WIDGET_TYPES !== 'undefined' && WIDGET_TYPES[id]) || {};
        var reg = (typeof widgetRegistry !== 'undefined' && widgetRegistry[id]) || {};
        W = { id: id, list: list, back: backRect };
        activeIdx = 0;
        g.style.display = 'none';
        var rail = document.getElementById('widgetPanelSizeRail');
        if (rail) rail.style.display = 'none';

        var host = document.querySelector('#widgetPanel .widget-panel') || g.parentNode;
        host.classList.add('n26-detail');
        var wrap = document.createElement('div');
        wrap.id = 'n26SizeWheel';
        wrap.className = 'n26-wheel';
        wrap.innerHTML =
            '<div class="n26-wheel-head">' +
                '<button type="button" class="n26-wheel-back" aria-label="返回组件列表"><i class="fas fa-chevron-left"></i><span>组件</span></button>' +
                '<span class="n26-wheel-title"><i class="fas ' + (info.icon || reg.icon || 'fa-table-cells-large') + '"></i>' + (reg.name || info.title || id) + '</span>' +
                '<span class="n26-wheel-count">' + list.length + ' 种尺寸</span>' +
                '<button type="button" class="n26-wheel-close" aria-label="关闭"><i class="fas fa-xmark"></i></button>' +
            '</div>' +
            '<div class="n26-wheel-track" tabindex="0" role="listbox" aria-label="尺寸滚轮"></div>' +
            '<div class="n26-wheel-foot">' +
                '<div class="n26-wheel-meta"><b class="n26-wheel-dim"></b><span class="n26-wheel-dens"></span></div>' +
                '<span class="n26-wheel-hint">滚轮 / 拖动浏览 · 点中间尺寸即放到桌面</span>' +
                '<button type="button" class="n26-wheel-place">放到桌面</button>' +
            '</div>';
        host.appendChild(wrap);
        var track = wrap.querySelector('.n26-wheel-track');

        list.forEach(function (s, i) {
            var it = document.createElement('div');
            it.className = 'n26-w-item';
            it.dataset.i = i;
            it.innerHTML = '<div class="n26-w-stage"><div class="widget-panel-card-preview-inner"></div></div>' +
                '<span class="n26-w-dim">' + dims(s) + '</span>';
            track.appendChild(it);
        });
        bindWheel(track);
        bindDetailButtons(wrap, track);
        layoutTrack(track, 0, true);
        updateActive();
    }

    function layoutTrack(track, idx, jump) {
        var items = track.querySelectorAll('.n26-w-item');
        if (!items.length) return;
        var item = items[idx];
        if (!item) return;
        var target = item.offsetLeft - (track.clientWidth - item.offsetWidth) / 2;
        if (jump) {
            var prev = track.style.scrollBehavior;
            track.style.scrollBehavior = 'auto';
            track.scrollLeft = Math.max(0, target);
            track.style.scrollBehavior = prev || '';
        } else {
            track.scrollTo({ left: Math.max(0, target), behavior: reduce ? 'auto' : 'smooth' });
        }
    }

    // 舞台最大框：中间大预览 580×300，两侧缩略 300×236；窄屏/矮屏降一档（与 CSS 断点一致）
    function stageMax(on) {
        var narrow = false;
        try { narrow = window.matchMedia('(max-width:1350px), (max-height:780px)').matches; } catch (e) { }
        if (on) return narrow ? { w: 340, h: 210 } : { w: 580, h: 300 };
        return narrow ? { w: 240, h: 196 } : { w: 300, h: 236 };
    }

    // 按当前尺寸的真实比例贴合：在最大框内等比缩放，框体紧包内容，不再出现大片空白内框
    function fitStage(item, on) {
        var stage = item.querySelector('.n26-w-stage');
        var inner = item.querySelector('.widget-panel-card-preview-inner');
        if (!stage || !inner) return;
        var nw = parseFloat(inner.style.width) || 0;
        var nh = parseFloat(inner.style.height) || 0;
        if (!(nw > 4 && nh > 4)) return;
        var max = stageMax(on);
        var k = Math.min(max.w / nw, max.h / nh);
        if (!(k > .2)) return;
        var w = Math.round(nw * k);
        var h = Math.round(nh * k);
        stage.style.width = w + 'px';
        stage.style.height = h + 'px';
        var card = inner.querySelector('.desktop-widget-card');
        if (card) {
            // 取整后再算一次，保证卡片始终略小于框体、不会被 overflow:hidden 切掉边
            card.style.transform = 'scale(' + Math.min(w / nw, h / nh) + ')';
        }
    }

    function renderStage(item, id, size) {
        var inner = item.querySelector('.widget-panel-card-preview-inner');
        if (!inner) return;
        inner.dataset.rendered = '';
        try { renderWidgetPreviewInto(inner, id, size); } catch (e) { }
        fitStage(item, item.classList.contains('on'));
    }

    function updateActive() {
        if (!W) return;
        var track = document.querySelector('#n26SizeWheel .n26-wheel-track');
        if (!track) return;
        var items = track.querySelectorAll('.n26-w-item');
        [].forEach.call(items, function (it, i) {
            var on = i === activeIdx;
            it.classList.toggle('on', on);
            // 只留中间 + 相邻两档；更远的整卡淡出，避免在容器边缘露出被切一角的卡片
            var d = Math.abs(i - activeIdx);
            it.style.opacity = d > 1 ? '0' : '1';
            it.style.pointerEvents = d > 1 ? 'none' : '';
            if (on) {
                renderStage(it, W.id, W.list[i]);
                it.style.zIndex = '3';
            } else {
                it.style.zIndex = '1';
                if (!it.dataset.thumb) {
                    renderStage(it, W.id, W.list[i]);
                    it.dataset.thumb = '1';
                } else {
                    // 中↔侧切换：框体按目标档位重新贴合（宽度/高度走 240ms 过渡）
                    fitStage(it, false);
                }
            }
        });
        var dimEl = document.querySelector('#n26SizeWheel .n26-wheel-dim');
        var denEl = document.querySelector('#n26SizeWheel .n26-wheel-dens');
        var s = W.list[activeIdx];
        if (dimEl) dimEl.textContent = dims(s);
        if (denEl) denEl.textContent = density(s);
        layoutTrack(track, activeIdx, false);
        // 宽度/框体动画落定后重新居中，否则相邻缩略会被滚轮视口切掉一角
        clearTimeout(updateActive._t);
        updateActive._t = setTimeout(function () {
            if (!W) return;
            var tr = document.querySelector('#n26SizeWheel .n26-wheel-track');
            if (!tr) return;
            layoutTrack(tr, activeIdx, false);
        }, 280);
    }

    function step(d) {
        if (!W) return;
        var next = Math.max(0, Math.min(W.list.length - 1, activeIdx + d));
        if (next === activeIdx) return;
        activeIdx = next;
        updateActive();
    }

    function bindWheel(track) {
        track.addEventListener('wheel', function (e) {
            if (!W) return;
            if (Math.abs(e.deltaY) < 1 && Math.abs(e.deltaX) < 1) return;
            e.preventDefault();
            step(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1);
        }, { passive: false });

        track.addEventListener('pointerdown', function (e) {
            if (!W || e.pointerType === 'mouse' && e.button !== 0) return;
            drag = { x: e.clientX, sl: track.scrollLeft, moved: false, y: e.clientY };
            try { track.setPointerCapture(e.pointerId); } catch (e2) { }
        });
        track.addEventListener('pointermove', function (e) {
            if (!drag) return;
            var dx = e.clientX - drag.x;
            if (Math.abs(dx) > 4) drag.moved = true;
            track.scrollLeft = drag.sl - dx;
        });
        track.addEventListener('pointerup', function (e) {
            if (!drag) return;
            var moved = drag.moved;
            drag = null;
            var items = track.querySelectorAll('.n26-w-item');
            // 宽度随选中态变化，按「离视口中心最近」吸附，而不是按固定步长
            var center = track.scrollLeft + track.clientWidth / 2;
            var idx = 0, best = 1e9;
            [].forEach.call(items, function (it, i) {
                var c = it.offsetLeft + it.offsetWidth / 2;
                var d = Math.abs(c - center);
                if (d < best) { best = d; idx = i; }
            });
            idx = Math.max(0, Math.min(W.list.length - 1, idx));
            activeIdx = idx;
            updateActive();
            if (!moved) {
                var it = e.target.closest('.n26-w-item');
                if (it) {
                    var i2 = Number(it.dataset.i);
                    if (i2 === activeIdx) placeActive();
                    else { activeIdx = i2; updateActive(); }
                }
            }
        });
        track.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
            else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); placeActive(); }
        });
    }

    function bindDetailButtons(wrap, track) {
        wrap.querySelector('.n26-wheel-back').addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            level1();
        });
        wrap.querySelector('.n26-wheel-place').addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            placeActive();
        });
        var close = wrap.querySelector('.n26-wheel-close');
        if (close) close.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            W = null;
            try { closeWidgetPanel(); } catch (e2) { }
        });
    }

    /* ---------- 放置：FLIP 飞入 + 自动退场 ---------- */
    function placeActive() {
        if (!W) return;
        var id = W.id;
        var size = W.list[activeIdx];
        var track = document.querySelector('#n26SizeWheel .n26-wheel-track');
        var item = track && track.querySelectorAll('.n26-w-item')[activeIdx];
        var stageCard = item && item.querySelector('.desktop-widget-card');
        var stage = item && item.querySelector('.n26-w-stage');
        var src = (stageCard || stage) ? (stageCard || stage).getBoundingClientRect() : null;

        placing = true;
        try { addDesktopWidgetAtSize(id, size); } catch (e) { }
        try { closeWidgetPanel(); } catch (e) { }
        var w = W; W = null;
        setTimeout(function () { placing = false; }, 420);
        // 面板淡出结束后清掉二级结构，下次打开回到一级列表
        setTimeout(function () {
            var wp = document.querySelector('#widgetPanel .widget-panel');
            if (wp) wp.classList.remove('n26-detail');
            var wl = document.getElementById('n26SizeWheel');
            if (wl) wl.remove();
        }, 300);

        setTimeout(function () {
            var target = [].slice.call(document.querySelectorAll('#desktopWidgets .desktop-widget-card'))
                .filter(function (el) { return (el.dataset.type || el.dataset.wtype) === id; })[0];
            if (!target || !src) return;
            var tr = target.getBoundingClientRect();
            if (tr.width < 1) return;
            var info = (typeof WIDGET_TYPES !== 'undefined' && WIDGET_TYPES[id]) || {};
            var ghost = document.createElement('div');
            ghost.className = 'n26-flip-ghost';
            ghost.style.cssText = [
                'position:fixed', 'left:' + src.left + 'px', 'top:' + src.top + 'px',
                'width:' + src.width + 'px', 'height:' + src.height + 'px',
                'z-index:2147483000', 'pointer-events:none', 'border-radius:18px',
                'overflow:hidden',
                'box-shadow:0 24px 60px rgba(15,23,42,.30)',
                'transition:left 280ms cubic-bezier(.22,.9,.24,1),top 280ms cubic-bezier(.22,.9,.24,1),width 280ms cubic-bezier(.22,.9,.24,1),height 280ms cubic-bezier(.22,.9,.24,1),border-radius 280ms cubic-bezier(.22,.9,.24,1),opacity 140ms linear 120ms'
            ].join(';');
            if (stageCard) {
                var clone = stageCard.cloneNode(true);
                clone.style.transform = 'none';
                clone.style.position = 'absolute';
                clone.style.left = '0'; clone.style.top = '0';
                clone.style.width = '100%'; clone.style.height = '100%';
                clone.style.margin = '0';
                clone.style.borderRadius = '18px';
                ghost.appendChild(clone);
            } else {
                ghost.style.background = info.color || '#8fb4ff';
            }
            document.body.appendChild(ghost);
            target.style.visibility = 'hidden';
            // 强制一次回流，确保 transition 从画廊位置开始而不是直接跳到终点
            ghost.getBoundingClientRect();
            setTimeout(function () {
                ghost.style.left = tr.left + 'px';
                ghost.style.top = tr.top + 'px';
                ghost.style.width = tr.width + 'px';
                ghost.style.height = tr.height + 'px';
            }, 30);
            setTimeout(function () {
                ghost.style.opacity = '0';
                target.style.visibility = '';
                target.classList.add('n26-drop-in');
                setTimeout(function () {
                    if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
                    target.classList.remove('n26-drop-in');
                }, 260);
            }, 300);
        }, 0);
        try { playSound && playSound('click'); } catch (e) { }
        return w;
    }

    // 用指定尺寸添加（若无该尺寸入口则退回 addWidgetFromPanel）
    function addDesktopWidgetAtSize(id, size) {
        if (typeof addWidgetFromPanel === 'function') {
            try { addWidgetFromPanel(id, size); return; } catch (e) { }
        }
        if (typeof addDesktopWidget === 'function') addDesktopWidget(id);
    }

    /* ---------- 交互绑定 ---------- */
    function bindGrid() {
        var g = grid();
        if (!g || g.dataset.v5) return;
        g.dataset.v5 = '1';

        // 一级点击：拦截原有「直接添加」，改为进入尺寸滚轮
        g.addEventListener('click', function (e) {
            var card = e.target.closest('.widget-panel-card');
            if (!card || !card.dataset.widgetId) return;
            if (card.dataset.available !== '1') return;   // 未安装：交给原逻辑提示
            e.preventDefault();
            e.stopPropagation();
            var r = card.querySelector('.widget-panel-card-preview');
            enterDetail(card.dataset.widgetId, r ? r.getBoundingClientRect() : null);
        }, true);

        // 悬停视差（4–6px）
        var raf = 0;
        g.addEventListener('pointermove', function (e) {
            if (reduce || (e.pointerType === 'touch')) return;
            var card = e.target.closest('.widget-panel-card');
            if (!card) return;
            var pv = card.querySelector('.widget-panel-card-preview');
            if (!pv) return;
            var r = pv.getBoundingClientRect();
            var dx = (e.clientX - (r.left + r.width / 2)) / (r.width || 1);
            var dy = (e.clientY - (r.top + r.height / 2)) / (r.height || 1);
            dx = Math.max(-1, Math.min(1, dx * 2)); dy = Math.max(-1, Math.min(1, dy * 2));
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(function () {
                pv.style.setProperty('--gy', (dx * 5).toFixed(2) + 'deg');
                pv.style.setProperty('--gx', (-dy * 4).toFixed(2) + 'deg');
                pv.style.setProperty('--gt', '-5px');
            });
        });
        g.addEventListener('pointerout', function (e) {
            var card = e.target.closest('.widget-panel-card');
            if (!card) return;
            if (card.contains(e.relatedTarget)) return;
            var pv = card.querySelector('.widget-panel-card-preview');
            if (pv) { pv.style.setProperty('--gx', '0deg'); pv.style.setProperty('--gy', '0deg'); pv.style.setProperty('--gt', '0px'); }
        });

        // 滚轮直滚列表
        g.addEventListener('wheel', function (e) {
            if (e.ctrlKey || !g.scrollHeight) return;
            var can = g.scrollHeight > g.clientHeight + 2;
            if (!can) return;
            var top = g.scrollTop <= 0, bot = g.scrollTop + g.clientHeight >= g.scrollHeight - 1;
            if ((e.deltaY < 0 && top) || (e.deltaY > 0 && bot)) return;
            g.scrollTop += e.deltaY;
            e.preventDefault();
        }, { passive: false });
    }

    function hook() {
        bindGrid();
        // 每次面板重建后回到一级
        if (typeof window.renderWidgetPanelGrid === 'function' && !window.renderWidgetPanelGrid.__v5) {
            var orig = window.renderWidgetPanelGrid;
            var wrapped = function () {
                var r = orig.apply(this, arguments);
                if (!placing) { try { level1(); bindGrid(); } catch (e) { } }
                return r;
            };
            wrapped.__v5 = true;
            window.renderWidgetPanelGrid = wrapped;
        }
        if (typeof window.openWidgetPanel === 'function' && !window.openWidgetPanel.__v5) {
            var origOpen = window.openWidgetPanel;
            var wrappedOpen = function () {
                var r = origOpen.apply(this, arguments);
                try { level1(); bindGrid(); } catch (e) { }
                return r;
            };
            wrappedOpen.__v5 = true;
            window.openWidgetPanel = wrappedOpen;
        }
    }

    // 天气共享状态：同一标签页内 app 写入不会触发 storage 事件，轻量轮询保证与顶栏同源
    function watchWeather() {
        var last = '';
        var tick = function () {
            var st = null;
            try { st = getLS('n26_weather_state_v1'); } catch (e) { }
            var sig = st ? ((st.updatedAt || '') + '|' + (st.temp && st.temp.c) + '|' + (st.city && st.city.name)) : '';
            if (sig === last) return;
            last = sig;
            if (!sig) return;
            var has = !!document.querySelector('#desktopWidgets .desktop-widget-card[data-type="weather"],' +
                '#desktopWidgets .desktop-widget-card[data-wtype="weather"]');
            if (has && typeof renderDesktopWidgets === 'function') {
                try { renderDesktopWidgets(); } catch (e) { }
            }
        };
        setInterval(tick, 10000);
        tick();
    }

    // 图片加载失败兜底：换成字形，不留空白或灰块
    function bindImageFallback() {
        document.addEventListener('error', function (e) {
            var img = e.target;
            if (!img || img.tagName !== 'IMG' || img.dataset.n26Fb) return;
            img.dataset.n26Fb = '1';
            var i = document.createElement('i');
            i.className = 'fas fa-image n26-img-fallback';
            var w = img.getAttribute('width'), h = img.getAttribute('height');
            if (w) i.style.width = w + 'px';
            if (h) i.style.height = h + 'px';
            if (img.parentNode) img.parentNode.replaceChild(i, img);
        }, true);
    }

    window.n26GalleryLevel1 = level1;
    watchWeather();
    bindImageFallback();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);
    else hook();
    window.addEventListener('load', hook);
})();
