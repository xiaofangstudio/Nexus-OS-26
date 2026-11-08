/* Nexus OS · 开发者工坊 · 沙箱预览拼装
   把 HTML 包（文本 + 图片/字体）内联成一个 srcdoc 文档，运行在
   sandbox="allow-scripts allow-forms allow-modals"（无 allow-same-origin）的 iframe 里。
   CSP 默认切断网络与嵌套框架。 */
(function () {
  'use strict';

  var CSP = [
    "default-src 'none'",
    "img-src data: blob:",
    "style-src 'unsafe-inline' data:",
    "script-src 'unsafe-inline' data: blob:",
    "font-src data:",
    "media-src data: blob:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "object-src 'none'"
  ].join('; ') + ';';

  var SANDBOX = 'allow-scripts allow-forms allow-modals';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function normPath(p) {
    var s = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
    var parts = [];
    s.split('/').forEach(function (seg) {
      if (!seg || seg === '.') return;
      if (seg === '..') parts.pop(); else parts.push(seg);
    });
    return parts.join('/');
  }
  function dirname(p) {
    var i = String(p).lastIndexOf('/');
    return i >= 0 ? String(p).slice(0, i + 1) : '';
  }
  function extOf(p) { var m = String(p).match(/\.([a-z0-9]+)$/i); return m ? m[1].toLowerCase() : ''; }
  function isText(p) { return /\.(html?|css|js|mjs|json|md|txt|svg|csv|cw|webmanifest)$/i.test(p); }
  function isBinary(p) { return /\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|woff2?|ttf|otf)$/i.test(p); }

  function fileText(files, p) {
    var v = files && files[p];
    return typeof v === 'string' ? v : (v && v.text) || null;
  }
  function fileDataUrl(files, p) {
    var v = files && files[p];
    return v && typeof v === 'object' ? v.dataUrl : null;
  }
  function attr(tag, name) {
    var m = String(tag).match(new RegExp(name + '\\s*=\\s*["\']([^"\']*)["\']', 'i'));
    return m ? m[1] : null;
  }
  function resolveRef(baseDir, href) {
    if (!href || /^#|^data:|^https?:|^\/\//i.test(href)) return null;
    return normPath(baseDir + href.split('?')[0].split('#')[0]);
  }
  function inlineCssUrls(css, baseDir, files) {
    return String(css).replace(/url\(([^)]+)\)/gi, function (m, raw) {
      var href = raw.trim().replace(/^['"]|['"]$/g, '');
      if (/^data:|^https?:|^\/\//i.test(href)) return m;
      var p = resolveRef(baseDir, href);
      var u = p && fileDataUrl(files, p);
      return u ? 'url("' + u + '")' : m;
    });
  }

  /* 把依赖内联进入口 HTML；probe=true 时注入运行状态上报脚本（用于冒烟测试）。 */
  function buildDoc(files, entry, options) {
    options = options || {};
    var html = fileText(files, entry);
    if (html == null) throw new Error('入口文件不是文本：' + entry);
    var entryDir = dirname(entry);

    /* <link rel="stylesheet"> → <style> */
    html = html.replace(/<link\b[^>]*>/gi, function (tag) {
      if (!/stylesheet/i.test(tag)) return tag;
      var href = attr(tag, 'href');
      if (!href) return '';
      var p = resolveRef(entryDir, href);
      var css = p && fileText(files, p);
      if (css == null) return tag;
      css = inlineCssUrls(css, dirname(p), files);
      return '<style data-inlined="' + esc(href) + '">\n' + css + '\n</style>';
    });

    /* <script src> → 内联脚本 */
    html = html.replace(/<script\b([^>]*)>\s*<\/script>/gi, function (tag, attrs) {
      var src = attr(attrs, 'src');
      if (!src) return tag;
      var p = resolveRef(entryDir, src);
      var js = p && fileText(files, p);
      if (js == null) return tag;
      var typeM = attrs.match(/type\s*=\s*["']([^"']+)["']/i);
      var type = typeM ? ' type="' + typeM[1] + '"' : '';
      return '<script' + type + ' data-inlined="' + esc(src) + '">\n' +
        js.replace(/<\/script/gi, '<\\/script') + '\n<' + '/script>';
    });

    /* <img src> → data URL */
    html = html.replace(/<img\b[^>]*>/gi, function (tag) {
      var src = attr(tag, 'src');
      if (!src || /^data:|^https?:|^\/\//i.test(src)) return tag;
      var p = resolveRef(entryDir, src);
      var u = p && fileDataUrl(files, p);
      return u ? tag.replace(src, u) : tag;
    });

    /* <style> 内的 url() → data URL */
    html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, function (block) {
      return block.replace(/url\(([^)]+)\)/gi, function (m, raw) {
        var href = raw.trim().replace(/^['"]|['"]$/g, '');
        if (/^data:|^https?:|^\/\//i.test(href)) return m;
        var p = resolveRef(entryDir, href);
        var u = p && fileDataUrl(files, p);
        return u ? 'url("' + u + '")' : m;
      });
    });

    var head = '<meta http-equiv="Content-Security-Policy" content="' + esc(CSP) + '">';
    if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, function (m) { return m + head; });
    else html = head + html;

    if (options.probe) {
      var probe = '<script>(function(){try{' +
        'window.addEventListener("error",function(e){parent.postMessage({__n26:"err",m:(e&&e.message)||"script error",line:(e&&e.lineno)||0},"*")});' +
        'window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;parent.postMessage({__n26:"err",m:String((r&&r.message)||r||"promise rejection"),line:0},"*")});' +
        'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",function(){parent.postMessage({__n26:"ready"},"*")})}else{parent.postMessage({__n26:"ready"},"*")}' +
        '}catch(e){}})();<' + '/script>';
      if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, probe + '</body>');
      else html += probe;
    }
    return html;
  }

  function render(iframe, files, entry, options) {
    iframe.setAttribute('sandbox', SANDBOX);
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.srcdoc = buildDoc(files, entry, options || {});
    return iframe;
  }

  /* 运行时冒烟：在隐藏 iframe 里跑 5 秒，捕获错误 / unhandledrejection。 */
  function smokeTest(files, entry, timeoutMs) {
    return new Promise(function (resolve) {
      var iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', SANDBOX);
      iframe.setAttribute('referrerpolicy', 'no-referrer');
      iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:960px;height:640px;opacity:0;pointer-events:none';
      var done = false;
      var timer = setTimeout(function () {
        finish({ level: 'warn', detail: '5 秒内没有收到运行信号（可能是纯静态页）' });
      }, timeoutMs || 5000);

      function onMsg(e) {
        if (e.source !== iframe.contentWindow) return;
        var d = e.data || {};
        if (d.__n26 === 'err') finish({ level: 'fail', detail: '运行时错误：' + String(d.m).slice(0, 90) });
        if (d.__n26 === 'ready') setTimeout(function () {
          finish({ level: 'pass', detail: '沙箱内已加载，未捕获脚本错误' });
        }, 400);
      }
      function finish(res) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        iframe.remove();
        resolve(res);
      }
      window.addEventListener('message', onMsg);
      try {
        iframe.srcdoc = buildDoc(files, entry, { probe: true });
        document.body.appendChild(iframe);
      } catch (e) {
        finish({ level: 'fail', detail: e.message || '预览拼装失败' });
      }
    });
  }

  window.N26DSPreview = {
    CSP: CSP,
    SANDBOX: SANDBOX,
    buildDoc: buildDoc,
    render: render,
    smokeTest: smokeTest,
    esc: esc,
    isText: isText,
    isBinary: isBinary,
    extOf: extOf,
    normPath: normPath
  };
})();
