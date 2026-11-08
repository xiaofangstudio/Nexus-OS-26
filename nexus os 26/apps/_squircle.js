/* Nexus OS 26 · 应用侧超椭圆裁切源（apps/_squircle.js）
   ------------------------------------------------------------
   与主壳 Nexus OS 26.html 里的 #n26Squircle 完全同源：
   同一段 |x|^5+|y|^5=1 路径、clipPathUnits="objectBoundingBox"、
   同样外扩 1.024（避免抗锯齿削掉顶边）。
   之所以不在 iframe 里直接 url(#n26Squircle)：iframe 拿不到主文档的 SVG 定义。
   本文件把同一份定义注入当前文档，保证应用图标与 Dock/桌面图标是同一套超椭圆。

   用法：
     <script src="_squircle.js"></script>
     html.n26-squircle-ready .my-icon {
       border-radius: 0;
       -webkit-clip-path: url(#n26Squircle);
       clip-path: url(#n26Squircle);
     }
   注入失败时不会加 ready 类，应用保留原 border-radius 兜底，不会出现空白图标。 */
(function () {
  var ID = 'n26Squircle';
  var D = 'M1 0.5 L0.9996 0.668 L0.9983 0.7214 L0.9961 0.7601 L0.9931 0.7912 L0.9892 0.8175 L0.9844 0.8405 L0.9787 0.8608 L0.972 0.8789 L0.9644 0.8952 L0.9558 0.91 L0.9461 0.9233 L0.9353 0.9353 L0.9233 0.9461 L0.91 0.9558 L0.8952 0.9644 L0.8789 0.972 L0.8608 0.9787 L0.8405 0.9844 L0.8175 0.9892 L0.7912 0.9931 L0.7601 0.9961 L0.7214 0.9983 L0.668 0.9996 L0.5 1 L0.332 0.9996 L0.2786 0.9983 L0.2399 0.9961 L0.2088 0.9931 L0.1825 0.9892 L0.1595 0.9844 L0.1392 0.9787 L0.1211 0.972 L0.1048 0.9644 L0.09 0.9558 L0.0767 0.9461 L0.0647 0.9353 L0.0539 0.9233 L0.0442 0.91 L0.0356 0.8952 L0.028 0.8789 L0.0213 0.8608 L0.0156 0.8405 L0.0108 0.8175 L0.0069 0.7912 L0.0039 0.7601 L0.0017 0.7214 L0.0004 0.668 L0 0.5 L0.0004 0.332 L0.0017 0.2786 L0.0039 0.2399 L0.0069 0.2088 L0.0108 0.1825 L0.0156 0.1595 L0.0213 0.1392 L0.028 0.1211 L0.0356 0.1048 L0.0442 0.09 L0.0539 0.0767 L0.0647 0.0647 L0.0767 0.0539 L0.09 0.0442 L0.1048 0.0356 L0.1211 0.028 L0.1392 0.0213 L0.1595 0.0156 L0.1825 0.0108 L0.2088 0.0069 L0.2399 0.0039 L0.2786 0.0017 L0.332 0.0004 L0.5 0 L0.668 0.0004 L0.7214 0.0017 L0.7601 0.0039 L0.7912 0.0069 L0.8175 0.0108 L0.8405 0.0156 L0.8608 0.0213 L0.8789 0.028 L0.8952 0.0356 L0.91 0.0442 L0.9233 0.0539 L0.9353 0.0647 L0.9461 0.0767 L0.9558 0.09 L0.9644 0.1048 L0.972 0.1211 L0.9787 0.1392 L0.9844 0.1595 L0.9892 0.1825 L0.9931 0.2088 L0.9961 0.2399 L0.9983 0.2786 L0.9996 0.332 L1 0.5 Z';

  if (document.getElementById(ID)) {
    document.documentElement.classList.add('n26-squircle-ready');
    return;
  }

  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('id', 'n26SquircleDefs');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';

  var defs = document.createElementNS(NS, 'defs');
  var cp = document.createElementNS(NS, 'clipPath');
  cp.setAttribute('id', ID);
  cp.setAttribute('clipPathUnits', 'objectBoundingBox');

  var path = document.createElementNS(NS, 'path');
  path.setAttribute('transform', 'translate(-0.012 -0.012) scale(1.024)');
  path.setAttribute('d', D);

  cp.appendChild(path);
  defs.appendChild(cp);
  svg.appendChild(defs);
  (document.body || document.documentElement).appendChild(svg);

  document.documentElement.classList.add('n26-squircle-ready');
})();
