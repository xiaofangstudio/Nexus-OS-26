/* ============================================================
   Nexus OS 26 · 动效引擎（ui/motion.js）
   硬性要求 #1：全部非线性动画。提供：
     - 缓动函数库（expo/quart/back/spring…）
     - 弹簧求解器 spring()（数值积分，可配置 stiffness/damping/mass）
     - animate()：基于 rAF 的属性补间（自动用缓动，禁 linear）
     - enter()/exit()：元素入场/离场（带 transform-origin 与 will-change 管控）
     - 全局 NexusMotion；尊重 prefers-reduced-motion
   用法：NexusMotion.spring(0,1,{stiffness:180,damping:20},v=>{},()=>{})
   ============================================================ */
(function () {
  'use strict';

  var reduce = false;
  try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* ---------- 缓动函数库（全部非线性） ---------- */
  var Ease = {
    linear: function (t) { return t; }, // 仅供物理积分内部使用，UI 禁用
    outExpo: function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    inOutExpo: function (t) { return t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2; },
    outQuart: function (t) { return 1 - Math.pow(1 - t, 4); },
    inOutQuart: function (t) { return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; },
    outBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    // 由 CSS 令牌名取曲线
    fromToken: function (name) {
      var map = {
        'var(--ease-out-expo)': Ease.outExpo,
        'var(--ease-in-out-expo)': Ease.inOutExpo,
        'var(--ease-out-quart)': Ease.outQuart,
        'var(--ease-in-out-quart)': Ease.inOutQuart,
        'var(--ease-spring)': Ease.outBack,
        'var(--ease-anticipate)': Ease.outBack,
        'var(--ease-smooth)': Ease.inOutCubic
      };
      return map[name] || Ease.outExpo;
    }
  };

  /* ---------- 弹簧求解器 ---------- */
  // opts: { stiffness=170, damping=22, mass=1, velocity=0, precision=0.01 }
  function spring(from, to, opts, onUpdate, onDone) {
    opts = opts || {};
    if (reduce) { if (onUpdate) onUpdate(to); if (onDone) onDone(); return { cancel: function () {} }; }
    var stiffness = opts.stiffness != null ? opts.stiffness : 170;
    var damping = opts.damping != null ? opts.damping : 22;
    var mass = opts.mass != null ? opts.mass : 1;
    var precision = opts.precision != null ? opts.precision : 0.01;
    var x = from, v = opts.velocity || 0, target = to;
    var raf = 0, last = 0, cancelled = false;

    function step(ts) {
      if (cancelled) return;
      if (!last) last = ts;
      var dt = Math.min((ts - last) / 1000, 1 / 30); // 秒，限制大步长防爆炸
      last = ts;
      // 半隐式欧拉积分
      var Fspring = -stiffness * (x - target);
      var Fdamper = -damping * v;
      var a = (Fspring + Fdamper) / mass;
      v += a * dt;
      x += v * dt;
      if (onUpdate) onUpdate(x);
      if (Math.abs(x - target) < precision && Math.abs(v) < precision) {
        if (onUpdate) onUpdate(target);
        if (onDone) onDone();
        return;
      }
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return { cancel: function () { cancelled = true; if (raf) cancelAnimationFrame(raf); } };
  }

  /* ---------- 属性补间（rAF + 缓动，禁 linear） ---------- */
  // animate({ from, to, duration, easing, onUpdate, onDone })
  function animate(o) {
    if (reduce) { if (o.onUpdate) o.onUpdate(o.to); if (o.onDone) o.onDone(); return { cancel: function () {} }; }
    var ease = typeof o.easing === 'function' ? o.easing : Ease.outExpo;
    var dur = o.duration != null ? o.duration : 280;
    var from = o.from, to = o.to, start = 0, raf = 0, cancelled = false;
    function step(ts) {
      if (cancelled) return;
      if (!start) start = ts;
      var p = dur <= 0 ? 1 : Math.min((ts - start) / dur, 1);
      if (o.onUpdate) o.onUpdate(from + (to - from) * ease(p), p);
      if (p >= 1) { if (o.onDone) o.onDone(); return; }
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return { cancel: function () { cancelled = true; if (raf) cancelAnimationFrame(raf); } };
  }

  /* ---------- 数字滚动 / 计数 ---------- */
  function count(el, from, to, dur, fmt) {
    return animate({ from: from, to: to, duration: dur, easing: Ease.outExpo, onUpdate: function (v) { el.textContent = fmt ? fmt(v) : Math.round(v); } });
  }

  /* ---------- 元素入场（弹簧缩放 + 淡入，transform-origin 可控） ---------- */
  function enter(el, opts) {
    opts = opts || {};
    if (!el) return;
    var origin = opts.origin || 'center';
    el.style.transformOrigin = origin;
    el.style.willChange = 'transform, opacity';
    var s = opts.scale != null ? opts.scale : 0.9;
    var o = opts.opacity != null ? opts.opacity : 0;
    if (reduce) { el.style.transform = ''; el.style.opacity = 1; return; }
    spring(s, 1, { stiffness: (opts.stiffness || 220), damping: (opts.damping || 24) }, function (v) {
      el.style.transform = 'scale(' + v.toFixed(4) + ')';
      el.style.opacity = String(1 - (1 - v) * 0); // 由外部控制透明度时忽略
    }, function () { el.style.willChange = ''; el.style.transform = ''; if (opts.done) opts.done(); });
    animate({ from: o, to: 1, duration: opts.duration || 220, easing: Ease.outQuart, onUpdate: function (v) { el.style.opacity = String(v); } });
  }

  /* ---------- 元素离场（弹簧缩小 + 淡出后移除/隐藏） ---------- */
  function exit(el, opts) {
    opts = opts || {};
    if (!el) return;
    var origin = opts.origin || 'center';
    el.style.transformOrigin = origin;
    el.style.willChange = 'transform, opacity';
    var s = opts.scale != null ? opts.scale : 0.92;
    if (reduce) { el.style.opacity = 0; if (opts.done) opts.done(); return; }
    spring(1, s, { stiffness: (opts.stiffness || 200), damping: (opts.damping || 26) }, function (v) {
      el.style.transform = 'scale(' + v.toFixed(4) + ')';
    }, function () { el.style.willChange = ''; el.style.transform = ''; if (opts.done) opts.done(); });
    animate({ from: 1, to: opts.opacity != null ? opts.opacity : 0, duration: opts.duration || 200, easing: Ease.inOutQuart, onUpdate: function (v) { el.style.opacity = String(v); } });
  }

  /* ---------- 震动弹跳（图标/反馈） ---------- */
  function bounce(el, amp) {
    if (!el || reduce) return;
    amp = amp || 1;
    var base = el.style.transform;
    spring(0, 1, { stiffness: 320, damping: 12 }, function (v) {
      var dy = Math.sin(v * Math.PI * 3) * (1 - v) * 10 * amp;
      el.style.transform = 'translateY(' + dy.toFixed(2) + 'px)';
    }, function () { el.style.transform = base; });
  }

  window.NexusMotion = {
    Ease: Ease,
    spring: spring,
    animate: animate,
    count: count,
    enter: enter,
    exit: exit,
    bounce: bounce,
    reduced: reduce
  };
})();
