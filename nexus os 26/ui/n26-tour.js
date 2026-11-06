/* ============================================================
   Nexus OS 26 · v2.9.62 · 精准触控板首次引导
   - 首次进入桌面由小方弹出引导卡，纯文字 + 小互动
   - 全部文案跟随系统语言（zh/en/ja/ko/ru），切换语言即时重绘
   - Web 端手势映射：pointer 轻点(不按下不拖动) / wheel 双指滑动 /
     ctrl+wheel 与 gesturechange 双指捏合 / deltaX 横向多指滑动
   - 不依赖任何外部库；完成标记写 getUserLS/setUserLS
   ============================================================ */
(function () {
    'use strict';

    /* ---------------- 多语言文案 ---------------- */
    var D = {
        zh: {
            badge: '精准触控板 · 首次引导', skip: '跳过引导', skip_step: '跳过这步',
            next: '开始', done_btn: '进入系统', again: '再看一遍',
            welcome_t: '先认识一下「精准触控板」',
            welcome_b: '在 Nexus OS 26 里，光标跟着手指走。<b>不用按住，也不用拖动</b>。花一分钟，我带你过一遍这几个手势。',
            tap_t: '轻轻滑过去，再轻点一下',
            tap_b: '看到中间这个圆钮了吗？把光标移过去 —— 在触控板上<b>滑动</b>就好，不用摁住。然后<b>轻轻点一下</b>，不用按到底。',
            tap_ok: '就是这样！很轻，对吧。', tap_drag: '不用按住拖动～ 只要轻轻点一下就好。',
            tap_ghost: '滑动光标过来 · 轻点一下',
            wheel_t: '两根手指，轻轻一滑',
            wheel_b: '左边这排图标会自己滚到一个后停住。用<b>两根手指在触控板上滑动</b>，让右边滚出和左边一样的图标，再轻轻点一下。',
            wheel_ok: '找到了！手指比眼睛还准。', wheel_miss: '还差一点，再滑一下～',
            wheel_lock: '目标 · 已锁定', wheel_live: '你来滚',
            pinch_t: '双指张开，再捏合',
            pinch_b: '把两根手指张开、再捏合，中间这块就会变大变小。<b>把它放大到虚线框那么大</b>就过关。用鼠标滚轮也可以。',
            pinch_ok: '漂亮，缩放就是这个手感。', pinch_cube: '双指',
            swipe_t: '再来一个多指手势',
            swipe_b: '两根手指<b>横向</b>轻轻一扫，圆点就会跟着走。扫到轨道尽头，触控板就全学会了。',
            swipe_ok: '很好，你已经会用触控板了。',
            done_t: '就这些，够用了',
            done_b: '以后所有窗口、桌面和网页，都用这一套手势。<b>轻、短、不用力</b>。随时可以在系统设置里重新播放这段引导。',
            done_hint: 'Nexus OS 26 · 让每一处想象都照亮未知的远方'
        },
        en: {
            badge: 'Precision Trackpad · First Run', skip: 'Skip', skip_step: 'Skip this step',
            next: 'Start', done_btn: 'Enter system', again: 'Play again',
            welcome_t: 'Meet your precision trackpad',
            welcome_b: 'In Nexus OS 26, the pointer follows your fingers. <b>No pressing, no dragging</b>. Give me a minute to walk you through a few gestures.',
            tap_t: 'Glide over, then tap lightly',
            tap_b: 'See the round button in the middle? Move the pointer onto it — just <b>glide</b> on the trackpad, do not press down. Then <b>tap lightly</b>, no need to push all the way.',
            tap_ok: 'Exactly like that. Nice and light.', tap_drag: 'No need to hold and drag — just a light tap.',
            tap_ghost: 'Glide the pointer here · tap once',
            wheel_t: 'Two fingers, one gentle swipe',
            wheel_b: 'The reel on the left spins to a random icon and locks. <b>Slide two fingers</b> to scroll the right reel until it matches, then tap lightly.',
            wheel_ok: 'Got it! Your fingers know the way.', wheel_miss: 'Almost — give it one more swipe.',
            wheel_lock: 'Target · locked', wheel_live: 'Your turn',
            pinch_t: 'Spread two fingers, then pinch',
            pinch_b: 'Spread and pinch two fingers to resize the square. <b>Make it as large as the dashed outline.</b> A mouse wheel works too.',
            pinch_ok: 'Beautiful. That is the whole feel of pinch.', pinch_cube: 'Pinch',
            swipe_t: 'One more multi-finger gesture',
            swipe_b: '<b>Swipe two fingers sideways</b> and the dot follows. Reach the end of the track and you are done.',
            swipe_ok: 'Perfect — you have got the trackpad now.',
            done_t: 'That is all you need',
            done_b: 'Every window, the desktop and every web page use these same gestures. <b>Light, short, effortless.</b> You can replay this guide any time in system settings.',
            done_hint: 'Nexus OS 26 · Let every imagination light up the unknown'
        },
        ja: {
            badge: '高精度トラックパッド · 初回ガイド', skip: 'スキップ', skip_step: 'このステップをスキップ',
            next: 'はじめる', done_btn: 'システムへ', again: 'もう一度',
            welcome_t: '高精度トラックパッドに慣れよう',
            welcome_b: 'Nexus OS 26 ではポインターが指に追従します。<b>押す必要も、ドラッグする必要もありません</b>。一分だけ、いくつかのジェスチャーを一緒に試しましょう。',
            tap_t: 'そっと滑らせて、軽くタップ',
            tap_b: '中央の丸いボタンが見えますか？ポインターを<b>滑らせる</b>だけでOK、押し込まないでください。それから<b>軽く一度タップ</b>。',
            tap_ok: 'そう、それです。とても軽いですね。', tap_drag: '押してドラッグは不要です。軽くタップするだけ。',
            tap_ghost: 'ポインターをここへ · 軽くタップ',
            wheel_t: '二本指で、そっと一滑り',
            wheel_b: '左のリールはランダムなアイコンで止まります。<b>二本指でスライド</b>して右を同じアイコンに合わせ、軽くタップしてください。',
            wheel_ok: '見つけた！指の方が正確ですね。', wheel_miss: 'もう少し、あと一滑り。',
            wheel_lock: '目標 · 固定', wheel_live: '操作してください',
            pinch_t: '二本指を開いて、つまむ',
            pinch_b: '二本指を開いたりつまんだりすると四角が拡大縮小します。<b>点線の枠と同じ大きさ</b>にしてみましょう。マウスホイールでも構いません。',
            pinch_ok: 'きれいです。ピンチの感覚はこれだけです。', pinch_cube: 'ピンチ',
            swipe_t: 'もう一つ、多指ジェスチャー',
            swipe_b: '<b>二本指を横に</b>そっと滑らせると丸が動きます。端まで来たら完了です。',
            swipe_ok: 'いいですね、もうトラックパッドは使いこなせています。',
            done_t: '覚えるのはこれだけ',
            done_b: 'ウィンドウもデスクトップもウェブも、すべて同じジェスチャーです。<b>軽く、短く、力を入れずに</b>。このガイドは設定からいつでも再生できます。',
            done_hint: 'Nexus OS 26 · すべての想像が未知の遠くを照らす'
        },
        ko: {
            badge: '정밀 트랙패드 · 첫 실행 가이드', skip: '건너뛰기', skip_step: '이 단계 건너뛰기',
            next: '시작', done_btn: '시스템으로', again: '다시 보기',
            welcome_t: '정밀 트랙패드와 만나기',
            welcome_b: 'Nexus OS 26 에서는 포인터가 손가락을 따라옵니다. <b>누를 필요도, 끌 필요도 없습니다</b>. 1분만 몇 가지 제스처를 함께 해봐요.',
            tap_t: '살짝 미끄러뜨리고, 가볍게 탭',
            tap_b: '가운데 둥근 버튼이 보이나요? 포인터를 <b>미끄러뜨려</b> 올리세요. 누르지 마세요. 그리고 <b>가볍게 한 번 탭</b>합니다.',
            tap_ok: '바로 그 느낌이에요. 아주 가볍죠.', tap_drag: '눌러서 끌 필요 없어요. 가볍게 탭만 하세요.',
            tap_ghost: '포인터를 여기로 · 한 번 탭',
            wheel_t: '두 손가락으로 살짝 밀기',
            wheel_b: '왼쪽 릴은 무작위 아이콘에서 멈춥니다. <b>두 손가락을 밀어</b> 오른쪽 릴을 같은 아이콘에 맞추고 가볍게 탭하세요.',
            wheel_ok: '찾았어요! 손가락이 더 정확하네요.', wheel_miss: '조금만 더, 한 번 더 밀어보세요.',
            wheel_lock: '목표 · 고정', wheel_live: '직접 굴리기',
            pinch_t: '두 손가락을 벌리고 오므리기',
            pinch_b: '두 손가락을 벌리거나 오므리면 사각형이 커지고 작아집니다. <b>점선 크기만큼 키워보세요.</b> 마우스 휠도 됩니다.',
            pinch_ok: '훌륭해요. 핀치 감각은 이게 전부입니다.', pinch_cube: '핀치',
            swipe_t: '마지막 멀티 제스처',
            swipe_b: '<b>두 손가락을 옆으로</b> 살짝 밀면 점이 따라옵니다. 트랙 끝에 닿으면 완료예요.',
            swipe_ok: '좋아요, 이제 트랙패드는 익숙해졌어요.',
            done_t: '이걸로 충분해요',
            done_b: '모든 창, 데스크톱, 웹 페이지가 같은 제스처를 씁니다. <b>가볍게, 짧게, 힘 들이지 않고</b>. 설정에서 언제든 이 가이드를 다시 볼 수 있어요.',
            done_hint: 'Nexus OS 26 · 모든 상상이 미지의 먼 곳을 비춥니다'
        },
        ru: {
            badge: 'Точный трекпад · первый запуск', skip: 'Пропустить', skip_step: 'Пропустить шаг',
            next: 'Начать', done_btn: 'В систему', again: 'Повторить',
            welcome_t: 'Знакомимся с точным трекпадом',
            welcome_b: 'В Nexus OS 26 курсор следует за пальцами. <b>Не нужно нажимать и не нужно перетаскивать</b>. Уделите минуту — покажу несколько жестов.',
            tap_t: 'Скользните и легко коснитесь',
            tap_b: 'Видите круглую кнопку в центре? Просто <b>проведите</b> по трекпаду, не нажимая. Затем <b>слегка коснитесь</b> — без усилия.',
            tap_ok: 'Вот именно! Очень легко, правда?', tap_drag: 'Не надо зажимать и тянуть — просто лёгкое касание.',
            tap_ghost: 'Наведите курсор · коснитесь один раз',
            wheel_t: 'Два пальца, одно лёгкое движение',
            wheel_b: 'Левая колонка сама прокрутится до случайного значка и остановится. <b>Проведите двумя пальцами</b>, чтобы правая совпала, и слегка коснитесь.',
            wheel_ok: 'Нашли! Пальцы точнее глаз.', wheel_miss: 'Чуть-чуть осталось, проведите ещё раз.',
            wheel_lock: 'Цель · зафиксирована', wheel_live: 'Ваша очередь',
            pinch_t: 'Разведите пальцы и сведите',
            pinch_b: 'Разводя и сводя два пальца, меняйте размер квадрата. <b>Увеличьте его до пунктирной рамки.</b> Подойдёт и колесо мыши.',
            pinch_ok: 'Отлично, вот и весь смысл пинча.', pinch_cube: 'Пинч',
            swipe_t: 'Ещё один жест несколькими пальцами',
            swipe_b: '<b>Проведите двумя пальцами вбок</b> — точка последует за вами. Дойдите до края, и трекпад освоен.',
            swipe_ok: 'Отлично, трекпад теперь ваш.',
            done_t: 'Это всё, что нужно',
            done_b: 'Все окна, рабочий стол и веб-страницы используют эти же жесты. <b>Легко, коротко, без усилия.</b> Повторить можно в любой момент в настройках.',
            done_hint: 'Nexus OS 26 · Пусть каждое воображение освещает неизведанное'
        }
    };

    function dictKey() {
        try {
            var l = (typeof getCurrentLanguage === 'function') ? getCurrentLanguage() : 'zh-CN';
            if (typeof langDictKey === 'function') return langDictKey(l);
            return String(l).split('-')[0];
        } catch (e) { return 'zh'; }
    }
    function T(k) {
        var d = D[dictKey()] || D.zh;
        return d[k] !== undefined ? d[k] : (D.zh[k] !== undefined ? D.zh[k] : k);
    }
    var ICONS = ['fa-sun', 'fa-moon', 'fa-star', 'fa-cloud', 'fa-bolt', 'fa-heart', 'fa-leaf', 'fa-music', 'fa-rocket', 'fa-gem'];
    var STEPS = ['welcome', 'tap', 'wheel', 'pinch', 'swipe', 'done'];
    var DONE_KEY = 'n26TourDone';

    var layer = null, card = null, stage = null, titleEl = null, textEl = null,
        nudgeEl = null, btn = null, dotsEl = null, badgeEl = null, skipEl = null;
    var idx = 0, active = false, ctrl = null, token = 0, passed = false;

    function done() {
        try { return !!getUserLS(DONE_KEY); } catch (e) { return false; }
    }
    function markDone() {
        try { if (typeof setUserLS === 'function') setUserLS(DONE_KEY, 1); } catch (e) { }
    }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function bind(el, type, fn, opts) {
        var o = { signal: ctrl.signal };
        if (opts) for (var k in opts) o[k] = opts[k];
        el.addEventListener(type, fn, o);
    }
    function nudge(msg, warn) {
        if (!nudgeEl) return;
        nudgeEl.textContent = msg || '';
        nudgeEl.className = 'n26-tour-nudge on' + (warn ? ' warn' : '');
    }
    function clearNudge() { if (nudgeEl) { nudgeEl.className = 'n26-tour-nudge'; nudgeEl.textContent = ''; } }

    function build() {
        layer = document.createElement('div');
        layer.id = 'n26TourLayer';
        layer.hidden = true;
        layer.innerHTML =
            '<div class="n26-tour-card" role="dialog" aria-modal="true" aria-labelledby="n26TourTitle">' +
            '  <div class="n26-tour-head">' +
            '    <img class="n26-tour-ava" src="图片/小方.jpg" alt="">' +
            '    <div class="n26-tour-who"><b>小方</b><span id="n26TourBadge"></span></div>' +
            '    <button class="n26-tour-skip" id="n26TourSkip" type="button"></button>' +
            '  </div>' +
            '  <div class="n26-tour-dots" id="n26TourDots"></div>' +
            '  <div class="n26-tour-title" id="n26TourTitle"></div>' +
            '  <div class="n26-tour-text" id="n26TourText"></div>' +
            '  <div class="n26-tour-stage" id="n26TourStage"></div>' +
            '  <div class="n26-tour-nudge" id="n26TourNudge"></div>' +
            '  <div class="n26-tour-foot"><button class="n26-tour-primary" id="n26TourPrimary" type="button"></button></div>' +
            '</div>';
        document.body.appendChild(layer);
        card = layer.querySelector('.n26-tour-card');
        var ava = layer.querySelector('.n26-tour-ava');
        ava.addEventListener('error', function () { ava.style.display = 'none'; });
        stage = layer.querySelector('#n26TourStage');
        titleEl = layer.querySelector('#n26TourTitle');
        textEl = layer.querySelector('#n26TourText');
        nudgeEl = layer.querySelector('#n26TourNudge');
        btn = layer.querySelector('#n26TourPrimary');
        dotsEl = layer.querySelector('#n26TourDots');
        badgeEl = layer.querySelector('#n26TourBadge');
        skipEl = layer.querySelector('#n26TourSkip');
        skipEl.addEventListener('click', function () { finish(); });
        btn.addEventListener('click', function () {
            var k = STEPS[idx];
            if (k === 'welcome') { go(1); return; }
            if (k === 'done') { finish(); return; }
            go(idx + 1);          // 「跳过这步」也必须能继续，绝不让用户卡住
        });
        layer.addEventListener('click', function (e) { if (e.target === layer) finish(); });
    }

    function paintDots() {
        dotsEl.innerHTML = STEPS.map(function (_, i) {
            return '<i class="' + (i === idx ? 'on' : (i < idx ? 'past' : '')) + '"></i>';
        }).join('');
    }

    /* 轻点检测：短按 + 无位移才算 tap；按住拖动 / 长按都不算 */
    function trackTap(el, onTap, onDrag) {
        var down = null;
        bind(el, 'pointerdown', function (e) {
            down = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false };
        });
        bind(el, 'pointermove', function (e) {
            if (down && Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 10) down.moved = true;
        });
        bind(el, 'pointerup', function (e) {
            if (!down) return;
            var d = down; down = null;
            if (d.moved || Date.now() - d.t > 700) { if (onDrag) onDrag(); return; }
            onTap(e);
        });
        bind(el, 'pointercancel', function () { down = null; });
        bind(el, 'dragstart', function (e) { e.preventDefault(); });
    }

    function succeed(msgKey) {
        if (passed || !active) return;
        passed = true;
        nudge(T(msgKey));
        var my = token;
        setTimeout(function () { if (active && my === token) go(idx + 1); }, 900);
    }

    /* ---------------- 各手势舞台 ---------------- */
    function setupTap() {
        var knob = document.createElement('div');
        knob.className = 'n26-tour-knob';
        knob.setAttribute('role', 'button');
        knob.setAttribute('aria-label', 'tap target');
        var ghost = document.createElement('div');
        ghost.className = 'n26-tour-ghost';
        ghost.textContent = T('tap_ghost');
        stage.appendChild(knob); stage.appendChild(ghost);
        bind(knob, 'pointerenter', function () { knob.classList.add('hot'); });
        bind(knob, 'pointerleave', function () { knob.classList.remove('hot'); });
        trackTap(knob, function () {
            knob.classList.add('hot'); knob.classList.add('on');
            succeed('tap_ok');
        }, function () { nudge(T('tap_drag'), true); });
    }

    function makeReel(tagText, locked) {
        var r = document.createElement('div');
        r.className = 'n26-tour-reel' + (locked ? ' locked' : '');
        var cells = [];
        for (var i = 0; i < 3; i++) {
            var c = document.createElement('div');
            c.className = 'n26-tour-reel-cell' + (i === 1 ? ' cur' : '');
            r.appendChild(c); cells.push(c);
        }
        var tag = document.createElement('div');
        tag.className = 'n26-tour-reel-tag'; tag.textContent = tagText;
        r.appendChild(tag);
        return { el: r, cells: cells };
    }
    function paintReel(o, n) {
        var L = ICONS.length;
        [n - 1, n, n + 1].forEach(function (v, i) {
            var k = ((v % L) + L) % L;
            o.cells[i].innerHTML = '<i class="fas ' + ICONS[k] + '"></i>';
        });
    }
    function setupWheel() {
        var target = Math.floor(Math.random() * ICONS.length);
        var cur = (target + 3 + Math.floor(Math.random() * 4)) % ICONS.length;
        var wrap = document.createElement('div');
        wrap.className = 'n26-tour-reels';
        var left = makeReel(T('wheel_lock'), true);
        var vs = document.createElement('div'); vs.className = 'n26-tour-reel-vs'; vs.textContent = '=';
        var right = makeReel(T('wheel_live'), false);
        wrap.appendChild(left.el); wrap.appendChild(vs); wrap.appendChild(right.el);
        stage.appendChild(wrap);
        paintReel(left, target); paintReel(right, cur);
        stage.dataset.tourTarget = ICONS[target];
        stage.dataset.tourLive = ICONS[cur];

        // 左侧「随机滚到一个，然后固定不能滚了」
        var my = token, spin = 0;
        left.el.classList.remove('locked');
        var spinTimer = setInterval(function () {
            if (!active || my !== token) { clearInterval(spinTimer); return; }
            spin++;
            paintReel(left, (target + 7 - spin) % ICONS.length);
            if (spin >= 7) {
                clearInterval(spinTimer);
                paintReel(left, target);
                left.el.classList.add('locked');
            }
        }, 85);

        var acc = 0;
        bind(stage, 'wheel', function (e) {
            e.preventDefault();
            acc += e.deltaY;
            if (Math.abs(acc) < 26) return;
            /* 轻滑一格就是一格：一次事件最多推进一格，避免大 delta 跳过目标图标 */
            var step = acc > 0 ? 1 : -1;
            acc = 0;
            cur = ((cur + step) % ICONS.length + ICONS.length) % ICONS.length;
            paintReel(right, cur);
            stage.dataset.tourLive = ICONS[cur];
        }, { passive: false });
        trackTap(right.el, function () {
            if (cur === target) succeed('wheel_ok');
            else nudge(T('wheel_miss'), true);
        }, function () { nudge(T('tap_drag'), true); });
    }

    function setupPinch() {
        var ring = document.createElement('div'); ring.className = 'n26-tour-target';
        var cube = document.createElement('div'); cube.className = 'n26-tour-cube'; cube.textContent = T('pinch_cube');
        stage.appendChild(ring); stage.appendChild(cube);
        var scale = 1, hold = null;
        function apply() {
            cube.style.transform = 'scale(' + scale.toFixed(3) + ')';
            if (scale >= 1.58 || scale <= 0.72) {
                if (!hold) hold = setTimeout(function () { succeed('pinch_ok'); }, 340);
            } else if (hold) { clearTimeout(hold); hold = null; }
        }
        bind(stage, 'wheel', function (e) {
            e.preventDefault();
            // ctrl+wheel = 触控板双指捏合；普通滚轮给鼠标用户兜底
            var k = e.ctrlKey ? 0.007 : 0.0035;
            scale = clamp(scale - e.deltaY * k, 0.55, 2.1);
            apply();
        }, { passive: false });
        bind(stage, 'gesturechange', function (e) {
            if (e.preventDefault) e.preventDefault();
            scale = clamp(scale * (e.scale || 1), 0.55, 2.1);
            apply();
        }, { passive: false });
        bind(stage, 'gesturestart', function (e) { if (e.preventDefault) e.preventDefault(); }, { passive: false });
    }

    function setupSwipe() {
        var track = document.createElement('div'); track.className = 'n26-tour-track';
        track.innerHTML = '<i class="fas fa-angles-left"></i><div class="n26-tour-dot" id="n26TourDot"></div><i class="fas fa-angles-right"></i>';
        stage.appendChild(track);
        var dot = track.querySelector('#n26TourDot');
        var dx = 0;
        bind(stage, 'wheel', function (e) {
            e.preventDefault();
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            dx = clamp(dx + e.deltaX, -88, 88);
            dot.style.transform = 'translateX(' + dx.toFixed(1) + 'px)';
            if (Math.abs(dx) >= 84) succeed('swipe_ok');
        }, { passive: false });
        // 触屏 / 无横向滚轮的设备：拖动也不算数（本步只教横向扫），给个兜底点击
        trackTap(dot, function () { nudge(T('swipe_ok')); succeed('swipe_ok'); }, null);
    }

    function setupStage(k) {
        if (ctrl) ctrl.abort();
        ctrl = new AbortController();
        token++;
        stage.replaceChildren();
        passed = false;
        clearNudge();
        if (k === 'tap') setupTap();
        else if (k === 'wheel') setupWheel();
        else if (k === 'pinch') setupPinch();
        else if (k === 'swipe') setupSwipe();
        else if (k === 'done') {
            var tip = document.createElement('div');
            tip.className = 'n26-tour-ghost';
            tip.style.cssText = 'position:static;font-size:12px;line-height:1.7;text-align:center;padding:0 24px;';
            tip.textContent = T('done_hint');
            stage.appendChild(tip);
        } else {
            var g = document.createElement('div');
            g.className = 'n26-tour-ghost';
            g.textContent = 'Nexus OS 26';
            stage.appendChild(g);
        }
    }

    /* 文案重绘与舞台重置必须分开：换语言只换字，不能把用户正在做的手势清掉 */
    function renderTexts() {
        if (!layer) return;
        var k = STEPS[idx];
        badgeEl.textContent = T('badge');
        skipEl.textContent = T('skip');
        titleEl.textContent = T(k + '_t');
        textEl.innerHTML = T(k + '_b');
        btn.textContent = k === 'welcome' ? T('next') : (k === 'done' ? T('done_btn') : T('skip_step'));
        btn.classList.toggle('ghost', k !== 'welcome' && k !== 'done');
        paintDots();
    }
    function render() { renderTexts(); setupStage(STEPS[idx]); }
    function go(n) {
        if (!active) return;
        idx = clamp(n, 0, STEPS.length - 1);
        render();
    }
    function start(force) {
        if (done() && !force) return;
        if (!layer) build();
        active = true; idx = 0;
        layer.hidden = false;
        lastLang = dictKey();
        render();
        startLangWatch();
    }
    function finish() {
        active = false;
        if (langTimer) { clearInterval(langTimer); langTimer = null; }
        if (ctrl) { ctrl.abort(); ctrl = null; }
        markDone();
        if (layer) layer.hidden = true;
    }

    /* ---------------- 挂到系统生命周期 ---------------- */
    function maybeStart() {
        if (done() || active) return;
        var t = setTimeout(function () {
            if (!done() && !active) {
                try { start(); } catch (e) { }
            }
        }, 1200);
        window.__n26TourTimer = t;
    }
    if (typeof window.enterDesktop === 'function') {
        var _enter = window.enterDesktop;
        window.enterDesktop = function () {
            var r = _enter.apply(this, arguments);
            try { maybeStart(); } catch (e) { }
            return r;
        };
    }
    var lastLang = dictKey();
    var langTimer = null;
    function startLangWatch() {
        if (langTimer) return;
        langTimer = setInterval(function () {
            if (!active) return;
            var l = dictKey();
            if (l !== lastLang) { lastLang = l; try { renderTexts(); } catch (e) { } }
        }, 220);
    }
    if (typeof window.setLanguage === 'function') {
        var _setLang = window.setLanguage;
        window.setLanguage = function () {
            var r;
            try { r = _setLang.apply(this, arguments); }
            finally {
                try { if (active) { lastLang = dictKey(); renderTexts(); } } catch (e) { }
            }
            return r;
        };
    }
    // 跨标签页 / 其它入口改语言时也能跟上
    window.addEventListener('storage', function (e) {
        if (active && e && /language/i.test(e.key || '')) {
            lastLang = dictKey(); try { renderTexts(); } catch (err) { }
        }
    });
    // 供设置面板 / 控制台 / 自动化测试重播
    window.n26TourStart = function (force) { start(force !== false); };
    window.n26TourReset = function () { try { setUserLS(DONE_KEY, 0); } catch (e) { } };
    window.n26TourState = function () {
        return { active: active, step: STEPS[idx], idx: idx, lang: dictKey(),
                 done: done(), hidden: layer ? layer.hidden : null, built: !!layer };
    };
    /* 小组件结构增强：日期卡原本把「11月6日」整串塞进 130px，
       38px 字号必然折行且和星期压在一起。改成「大日号 + 月份/星期侧栏」，
       保留原 .widget-date-* 类名，面板预览走同一份渲染。 */
    if (typeof window.renderDateWidget === 'function') {
        window.renderDateWidget = function () {
            var now = new Date();
            var md = (now.getMonth() + 1) + '月';
            var day = now.getDate();
            var wk = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()];
            var zodiac = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
            var li = ((now.getFullYear() - 2020) % 12 + 12) % 12;
            return '<div class="widget-date n26-date-v2">' +
                '<div class="n26-date-day">' + day + '</div>' +
                '<div class="n26-date-side"><div class="widget-date-md">' + md + '</div>' +
                '<div class="widget-date-weekday">' + wk + '</div></div>' +
                '<div class="widget-date-lunar">' + zodiac[li] + '年</div></div>';
        };
    }
})();
