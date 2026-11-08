/* ============================================================
   N26 Caption Bridge · 应用字幕复用系统旁白（v2.9.97）
   ------------------------------------------------------------
   用户要求：「没有字幕之类的，字幕可以直接复用旁白的那个」。
   系统旁白 / 字幕条在 ui/n26-a11y.js（window.N26A11Y.showCaption / speak），
   但它挂在主文档 window，iframe 应用拿不到。

   iframe 侧只需：
       parent.postMessage({ __n26Caption: '这一句字幕' }, '*');   // 只显示
       parent.postMessage({ __n26Speak:   '这一句字幕' }, '*');   // 朗读 + 显示
   样式、字号、深浅色、字幕开关全部沿用系统旁白那一套，不另写一份。
   ============================================================ */
(function () {
    'use strict';
    var lastCaption = '', lastAt = 0;

    function caption(text, speak) {
        text = String(text || '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        var now = Date.now();
        /* 同一句不重复刷屏（视频 timeupdate 一秒能触发好几次） */
        if (text === lastCaption && now - lastAt < 1800) return;
        lastCaption = text; lastAt = now;
        var A = window.N26A11Y;
        if (!A) return;
        try {
            if (speak && typeof A.speak === 'function') A.speak(text);
            else if (typeof A.showCaption === 'function') {
                /* showCaption 受「字幕」开关约束：关掉时尊重用户设置，不强行弹 */
                A.showCaption(text);
            }
        } catch (e) { }
    }

    window.addEventListener('message', function (e) {
        var d = e.data;
        if (!d) return;
        if (d.__n26Speak) caption(d.__n26Speak, true);
        else if (d.__n26Caption) caption(d.__n26Caption, false);
        if (d.__n26GeoSet && window.N26Geo) {
            try { window.N26Geo.set(d.__n26GeoSet); } catch (err) { }
        }
    });

    window.N26CaptionBridge = { version: '2.9.97', caption: caption };
})();
