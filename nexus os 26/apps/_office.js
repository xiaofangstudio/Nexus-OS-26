/* ============================================================
   Nexus OS 26 · 办公应用共享工具（apps/_office.js）
   只做无状态的公共能力：存储桥接、弹窗、Toast、图表 SVG、
   文件读取、下载、时间格式化。不接管各应用自己的业务状态。
   ============================================================ */
(window.OF = window.OF || (function () {
  'use strict';

  var OF = {};
  OF.host = !!(window.Nexus && window.Nexus.getUserLS);

  /* ---------- 基础 ---------- */
  OF.uid = function (p) {
    return (p || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  };

  OF.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  OF.clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };

  OF.debounce = function (fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  OF.fmtTime = function (ts) {
    if (!ts) return '—';
    var d = new Date(ts), now = Date.now(), diff = now - ts;
    if (diff < 60e3) return '刚刚';
    if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
    if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    if (d.getFullYear() === new Date(now).getFullYear()) {
      return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  };

  OF.fmtClock = function (ts) {
    var d = new Date(ts || Date.now());
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  };

  OF.download = function (name, content, mime) {
    try {
      var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 600);
      return true;
    } catch (e) {
      OF.toast('导出失败：' + (e && e.message ? e.message : e), 'error');
      return false;
    }
  };

  /* ---------- 存储：优先系统桥，独立预览时退 localStorage ---------- */
  OF.store = function (key) {
    var memory = null;   // 桥不可用且 localStorage 也被禁时的内存兜底
    return {
      key: key,
      read: function () {
        if (OF.host) {
          return Promise.resolve(window.Nexus.getUserLS(key)).then(function (v) {
            return v == null ? null : v;
          }).catch(function () {
            return memory;
          });
        }
        try {
          var raw = localStorage.getItem(key);
          return Promise.resolve(raw ? JSON.parse(raw) : null);
        } catch (e) {
          return Promise.resolve(memory);
        }
      },
      write: function (val) {
        memory = val;
        if (OF.host) {
          return Promise.resolve(window.Nexus.setUserLS(key, val)).then(function () {
            return true;
          }).catch(function (e) {
            OF.toast('保存失败：系统存储不可用（' + (e && e.message ? e.message : '容量不足') + '）', 'error');
            return false;
          });
        }
        try {
          localStorage.setItem(key, JSON.stringify(val));
          return Promise.resolve(true);
        } catch (e) {
          OF.toast('保存失败：本地存储空间不足，内容暂存在当前窗口', 'error');
          return Promise.resolve(false);
        }
      }
    };
  };

  /* ---------- Toast ---------- */
  OF.toast = function (msg, type, ms) {
    var box = document.querySelector('.of-toasts');
    if (!box) {
      box = document.createElement('div');
      box.className = 'of-toasts';
      document.body.appendChild(box);
    }
    var el = document.createElement('div');
    el.className = 'of-toast';
    el.dataset.type = type || 'info';
    var icon = type === 'error' ? 'fa-circle-exclamation'
      : type === 'success' ? 'fa-circle-check' : 'fa-circle-info';
    el.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i><span></span>';
    el.querySelector('span').textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 260);
    }, ms || 2400);
  };

  OF.notify = function (msg, type) {
    if (OF.host && window.Nexus.notify) {
      try { window.Nexus.notify(msg, type || 'info'); } catch (e) { }
    }
    OF.toast(msg, type);
  };

  /* ---------- 模态框 ----------
     OF.dialog({
       title, icon, body(HTML 字符串), okText, cancelText, danger,
       collect: (root) => value  // 点击主按钮时收集
     }).then(value => ...)
  ---------------------------------- */
  OF.dialog = function (opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var mask = document.createElement('div');
      mask.className = 'of-mask';
      mask.innerHTML =
        '<div class="of-dialog" role="dialog" aria-modal="true">' +
        '<h3 class="of-dialog-title"><i class="fa-solid ' + (opt.icon || 'fa-circle-info') + '" aria-hidden="true"></i>' +
        '<span></span></h3>' +
        '<div class="of-dialog-body"></div>' +
        '<div class="of-actions">' +
        (opt.cancelText === false ? '' : '<button class="of-btn wide" data-x="cancel"></button>') +
        '<button class="of-btn primary wide" data-x="ok"></button>' +
        '</div></div>';
      mask.querySelector('.of-dialog-title span').textContent = opt.title || '';
      mask.querySelector('.of-dialog-body').innerHTML = opt.body || '';
      var okBtn = mask.querySelector('[data-x="ok"]');
      var cancelBtn = mask.querySelector('[data-x="cancel"]');
      okBtn.textContent = opt.okText || '确定';
      if (cancelBtn) cancelBtn.textContent = opt.cancelText || '取消';
       if (opt.danger) { okBtn.classList.remove('primary'); okBtn.classList.add('danger'); }

      function close(val) {
        mask.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(val);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); close(null); }
        if (e.key === 'Enter' && (e.target.tagName !== 'TEXTAREA')) {
          e.preventDefault(); e.stopPropagation(); confirm();
        }
      }
      function confirm() {
        var val = opt.collect ? opt.collect(mask) : true;
        if (val === false) return;
        close(val === undefined ? true : val);
      }
      okBtn.addEventListener('click', confirm);
      if (cancelBtn) cancelBtn.addEventListener('click', function () { close(null); });
      mask.addEventListener('mousedown', function (e) { if (e.target === mask) close(null); });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(mask);
      var focus = mask.querySelector('.of-input, .of-textarea');
      if (focus) { focus.focus(); if (focus.select) focus.select(); }
      else okBtn.focus();
    });
  };

  OF.prompt = function (o) {
    o = o || {};
    return OF.dialog({
      title: o.title || '输入',
      icon: o.icon || 'fa-pen',
      okText: o.okText || '确定',
      body: '<div class="of-field"><label>' + OF.esc(o.label || '') + '</label>' +
        (o.multiline
          ? '<textarea class="of-textarea" data-input>' + OF.esc(o.value || '') + '</textarea>'
          : '<input class="of-input" data-input value="' + OF.esc(o.value || '') + '" placeholder="' + OF.esc(o.placeholder || '') + '">') +
        '</div>',
      collect: function (root) {
        var el = root.querySelector('[data-input]');
        return el ? el.value : '';
      }
    });
  };

  OF.confirm = function (o) {
    o = o || {};
    return OF.dialog({
      title: o.title || '确认操作',
      icon: o.icon || 'fa-triangle-exclamation',
      okText: o.okText || '确定',
      danger: o.danger !== false,
      body: '<p>' + OF.esc(o.message || '') + '</p>'
    }).then(function (v) { return v === true; });
  };

  /* ---------- 文件读取 ---------- */
  OF.readImage = function (file, maxW) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) { reject(new Error('不是图片文件')); return; }
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('读取失败')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('图片解码失败')); };
        img.onload = function () {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          var max = maxW || 1400;
          if (w > max) { h = Math.round(h * max / w); w = max; }
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          var type = /^image\/png/.test(file.type) ? 'image/png' : 'image/jpeg';
          resolve({ src: cv.toDataURL(type, .88), w: w, h: h });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  };

  /* ---------- 图表 SVG（Word / Excel / PPT 共用） ----------
     OF.svgChart({type:'bar'|'line'|'pie', labels:[], values:[], w, h, dark})
  ---------------------------------- */
  OF.palette = ['hsl(212 88% 56%)', 'hsl(160 58% 44%)', 'hsl(28 88% 56%)',
    'hsl(268 62% 62%)', 'hsl(340 72% 58%)', 'hsl(186 66% 44%)',
    'hsl(48 84% 52%)', 'hsl(8 72% 56%)'];

  OF.svgChart = function (o) {
    o = o || {};
    var type = o.type || 'bar';
    var labels = (o.labels || []).slice(0, 14);
    var values = (o.values || []).slice(0, 14).map(function (v) {
      var n = parseFloat(v); return isFinite(n) ? n : 0;
    });
    var w = o.w || 560, h = o.h || 300;
    var padL = 44, padR = 18, padT = 30, padB = 34;
    var ink = o.dark ? 'rgb(236 240 248 / .92)' : 'rgb(23 32 48 / .90)';
    var ink2 = o.dark ? 'rgb(236 240 248 / .55)' : 'rgb(51 65 85 / .58)';
    var grid = o.dark ? 'rgba(255,255,255,.12)' : 'rgba(15,23,42,.10)';
    var max = Math.max.apply(null, values.concat([1]));
    var min = Math.min.apply(null, values.concat([0]));
    if (min > 0) min = 0;
    var span = max - min || 1;
    var iw = w - padL - padR, ih = h - padT - padB;
    var n = values.length || 1;
    var parts = [];

    parts.push('<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="图表">');
    if (type === 'pie') {
      var total = values.reduce(function (a, b) { return a + Math.abs(b); }, 0) || 1;
      var cx = w / 2 - 30, cy = h / 2 + 2, r = Math.min(iw, ih) / 2 * .82;
      var ang = -Math.PI / 2;
      values.forEach(function (v, i) {
        var a = Math.abs(v) / total * Math.PI * 2;
        var x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
        var x2 = cx + r * Math.cos(ang + a), y2 = cy + r * Math.sin(ang + a);
        if (a <= .0001) { ang += a; return; }
        var large = a > Math.PI ? 1 : 0;
        parts.push('<path d="M' + cx + ' ' + cy + ' L' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
          ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z" fill="' +
          OF.palette[i % OF.palette.length] + '" stroke="' + (o.dark ? 'rgba(20,24,34,.55)' : 'rgba(255,255,255,.72)') + '" stroke-width="1.2"></path>');
        ang += a;
      });
      var ly = padT + 4;
      values.forEach(function (v, i) {
        parts.push('<rect x="' + (w - padR - 112) + '" y="' + ly + '" width="8" height="8" rx="2" fill="' + OF.palette[i % OF.palette.length] + '"></rect>');
        parts.push('<text x="' + (w - padR - 100) + '" y="' + (ly + 7.5) + '" font-size="9.5" fill="' + ink2 + '">' + OF.esc(labels[i] || ('项 ' + (i + 1))) + '</text>');
        ly += 15;
      });
    } else {
      // 轴线 + 网格
      for (var g = 0; g <= 4; g++) {
        var gy = padT + ih * g / 4;
        var gv = max - span * g / 4;
        parts.push('<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + gy.toFixed(1) + '" stroke="' + grid + '" stroke-width="1"></line>');
        parts.push('<text x="' + (padL - 6) + '" y="' + (gy + 3.2).toFixed(1) + '" font-size="9" fill="' + ink2 + '" text-anchor="end">' + (Math.round(gv * 100) / 100) + '</text>');
      }
      if (type === 'bar') {
        var slot = iw / n;
        var bw = Math.min(34, slot * .62);
        values.forEach(function (v, i) {
          var bh = Math.max(0, (v - min) / span * ih);
          var x = padL + slot * i + (slot - bw) / 2;
          var y = padT + ih - bh;
          parts.push('<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) +
            '" rx="3" fill="' + OF.palette[i % OF.palette.length] + '"></rect>');
          parts.push('<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" font-size="9" text-anchor="middle" fill="' + ink2 + '">' + (Math.round(v * 100) / 100) + '</text>');
        });
      } else {
        var pts = values.map(function (v, i) {
          return [padL + (n === 1 ? iw / 2 : iw * i / (n - 1)), padT + ih - (v - min) / span * ih];
        });
        parts.push('<polyline points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') +
          '" fill="none" stroke="' + OF.palette[0] + '" stroke-width="2.2" stroke-linejoin="round"></polyline>');
        pts.forEach(function (p, i) {
          parts.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.4" fill="' + OF.palette[i % OF.palette.length] + '"></circle>');
        });
      }
      // 标签
      var slot2 = iw / n;
      if (n <= 14) {
        values.forEach(function (v, i) {
          var x = type === 'line' ? (padL + (n === 1 ? iw / 2 : iw * i / (n - 1))) : (padL + slot2 * i + slot2 / 2);
          parts.push('<text x="' + x.toFixed(1) + '" y="' + (h - 12) + '" font-size="9" fill="' + ink2 + '" text-anchor="middle">' + OF.esc(labels[i] || ('项 ' + (i + 1))) + '</text>');
        });
      }
    }
    if (o.title) {
      parts.push('<text x="' + padL + '" y="16" font-size="11.5" font-weight="600" fill="' + ink + '">' + OF.esc(o.title) + '</text>');
    }
    parts.push('</svg>');
    return parts.join('');
  };

  /* ---------- 小工具 ---------- */
  OF.isDark = function () {
    return document.body.classList.contains('dark-mode') ||
      document.documentElement.getAttribute('data-mode') === 'dark';
  };

  OF.onTheme = function (fn) {
    try {
      var mo = new MutationObserver(fn);
      mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-mode'] });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode', 'data-theme'] });
    } catch (e) { }
    window.addEventListener('n26:theme', fn);
  };

  OF.params = function () {
    try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); }
  };

  return OF;
})());
