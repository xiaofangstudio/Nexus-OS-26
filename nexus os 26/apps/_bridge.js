/* ============================================================
   Nexus OS 26 · 应用 iframe 通信桥（iframe 端）
   每个拆分为独立 iframe 的应用在 <head> 里 <script src="_bridge.js"></script>，
   之后即可通过 window.Nexus.* 调用宿主机（系统壳）能力。
   通信走 postMessage + Promise，所有调用均返回 Promise。
   ============================================================ */
(function () {
  'use strict';

  var seq = 0;
  var pending = {};
  var ctx = null; // 宿主机下发的上下文（windowId/user/settings/dark/osStyle...）

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || typeof d !== 'object') return;

    // 1) 宿主机回包
    if (d.__nexusRes != null && pending[d.__nexusRes]) {
      var p = pending[d.__nexusRes];
      delete pending[d.__nexusRes];
      if (d.ok) p.resolve(d.data);
      else p.reject(new Error(d.error || 'bridge error'));
      return;
    }
    // 2) 宿主机下发上下文
    if (d.__nexusInit) {
      ctx = d;
      window.dispatchEvent(new CustomEvent('nexus:ready', { detail: ctx }));
      return;
    }
    // 3) 宿主机主动推送事件（如主题切换）
    if (d.__nexusEvt) {
      window.dispatchEvent(new CustomEvent('nexus:' + d.name, { detail: d.data }));
    }
  });

  function call(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      var msg = { __nexusReq: id, method: method, args: args };
      if (ctx) msg.windowId = ctx.windowId;
      parent.postMessage(msg, '*');
    });
  }

  var Nexus = {
    call: call,
    /* —— 系统应用清单 —— */
    getApps: function () { return call('getApps'); },
    /* —— 存储（按用户） —— */
    getUserLS: function (k) { return call('getUserLS', k); },
    setUserLS: function (k, v) { return call('setUserLS', k, v); },
    /* —— 存储（全局） —— */
    getLS: function (k) { return call('getLS', k); },
    setLS: function (k, v) { return call('setLS', k, v); },
    /* —— 上下文 / 用户 —— */
    getUser: function () { return call('getUser'); },
    getSettings: function () { return call('getSettings'); },
    getContext: function () { return call('getContext'); },
    context: function () { return ctx; },
    /* —— 系统能力 —— */
    notify: function (title, msg, type) { return call('notify', title, msg, type || 'info'); },
    openApp: function (appId) { return call('openApp', appId); },
    closeWindow: function () { return call('closeWindow'); },
    minimizeWindow: function () { return call('minimizeWindow'); },
    setWindowTitle: function (t) { return call('setWindowTitle', t); },
    openUrl: function (url) { return call('openUrl', url); },
    /* —— 事件（主题/语言切换等） —— */
    on: function (name, cb) {
      window.addEventListener('nexus:' + name, function (ev) { cb(ev.detail); });
    }
  };

  window.Nexus = Nexus;
})();
