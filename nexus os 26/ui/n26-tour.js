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
            welcome_b: '在 Nexus OS 26 里，光标跟着手指走。两指滑动滚页、双指捏合缩放；<b>一根手指按住不动，另一根手指轻滑，就能拖动</b>。花一分钟，我带你过一遍。',
            tap_t: '轻轻滑过去，再轻点一下',
            tap_b: '看到中间这个圆钮了吗？把光标移过去 —— 在触控板上<b>滑动</b>就好，不用摁住。然后<b>轻轻点一下</b>，不用按到底。',
            tap_ok: '就是这样！很轻，对吧。', tap_drag: '这一步先轻点一下，一指按住、另一指轻滑在下一步学。',
            tap_ghost: '滑动光标过来 · 轻点一下',
            drag_t: '一根手指按住，另一根手指轻滑',
            drag_b: '把<b>第一根手指按在触控板上不动</b>（这根手指才算「按住」），再用<b>第二根手指在卡片上轻轻滑动</b>，把卡片带进右边的虚线框，最后两根手指一起抬起。',
            drag_ok: '对了：一指按住，另一指轻滑。',
            drag_miss: '再往右带一点，滑进虚线框里。',
            drag_hold: '按住的那根手指别松开，另一根手指轻轻滑一下。',
            drag_alt: '如果你的设备只给浏览器上报一根手指，就按住卡片后用同一根手指轻滑，效果一样。',
            drag_card: '卡片',
            drag_slot: '放这里',
            wheel_t: '两根手指，轻轻一滑',
            wheel_b: '左边这列字母会自己滚到一个后停住。用<b>两根手指在触控板上滑动</b>，让右边滚出和左边一样的字母，再轻轻点一下。',
            wheel_ok: '找到了！手指比眼睛还准。', wheel_miss: '还差一点，再滑一下～',
            wheel_lock: '目标 · 已锁定', wheel_live: '你来滚',
            pinch_t: '双指张开，再捏合',
            pinch_b: '把两根手指张开、再捏合，中间这块就会变大变小。<b>把它放大到虚线框那么大</b>就过关。用鼠标滚轮也可以。',
            pinch_ok: '漂亮，缩放就是这个手感。', pinch_cube: '双指',
            swipe_t: '再来一个多指手势',
            swipe_b: '两根手指横放在触控板左边，<b>往右拨，圆点就往右走</b>；往左拨就往左走。扫到任意一端就过关。没有横向双指滚动的话，直接用鼠标把圆点拖到尽头也一样。',
            swipe_ok: '很好，你已经会用触控板了。',
            done_t: '就这些，够用了',
            done_b: '以后所有窗口、桌面和网页，都用这一套：双指滚动、捏合缩放、<b>一指按住不动、另一指轻滑拖动</b>。<b>轻、短，该按住的那根手指就别松开</b>。随时可以在系统设置里重新播放这段引导。',
            done_hint: 'Nexus OS 26 · 让每一处想象都照亮未知的远方'
        },
        en: {
            badge: 'Precision Trackpad · First Run', skip: 'Skip', skip_step: 'Skip this step',
            next: 'Start', done_btn: 'Enter system', again: 'Play again',
            welcome_t: 'Meet your precision trackpad',
            welcome_b: 'In Nexus OS 26, the pointer follows your fingers. Two fingers scroll, pinch zooms; <b>one finger holds still while a second finger glides to drag</b>. Give me a minute to walk you through it.',
            tap_t: 'Glide over, then tap lightly',
            tap_b: 'See the round button in the middle? Move the pointer onto it — just <b>glide</b> on the trackpad, do not press down. Then <b>tap lightly</b>, no need to push all the way.',
            tap_ok: 'Exactly like that. Nice and light.', tap_drag: 'This step is just a tap — holding with one finger and gliding with the other comes next.',
            tap_ghost: 'Glide the pointer here · tap once',
            drag_t: 'One finger holds, the other glides',
            drag_b: '<b>Rest your first finger on the trackpad and keep it still</b> — that finger is what counts as holding. Then <b>glide a second finger</b> and carry the card into the dashed box, then lift both.',
            drag_ok: 'That is it: one holds, the other glides.',
            drag_miss: 'Carry it a little further right, inside the dashed box.',
            drag_hold: 'Keep the holding finger down and glide the other one.',
            drag_alt: 'If your device reports only one finger to the browser, hold the card and glide with that same finger — the result is the same.',
            drag_card: 'Card',
            drag_slot: 'Drop here',
            wheel_t: 'Two fingers, one gentle swipe',
            wheel_b: 'The reel on the left spins to a random letter and locks. <b>Slide two fingers</b> to scroll the right reel until it matches, then tap lightly.',
            wheel_ok: 'Got it! Your fingers know the way.', wheel_miss: 'Almost — give it one more swipe.',
            wheel_lock: 'Target · locked', wheel_live: 'Your turn',
            pinch_t: 'Spread two fingers, then pinch',
            pinch_b: 'Spread and pinch two fingers to resize the square. <b>Make it as large as the dashed outline.</b> A mouse wheel works too.',
            pinch_ok: 'Beautiful. That is the whole feel of pinch.', pinch_cube: 'Pinch',
            swipe_t: 'One more multi-finger gesture',
            swipe_b: 'Lay two fingers on the left of the trackpad and <b>push right — the dot moves right</b>; push left and it moves left. Reach either end to pass. No horizontal two-finger scroll? Just drag the dot to the end with the mouse.',
            swipe_ok: 'Perfect — you have got the trackpad now.',
            done_t: 'That is all you need',
            done_b: 'Every window, the desktop and every web page share one set: two-finger scroll, pinch zoom, and <b>one finger holding while the other glides to drag</b>. <b>Light and short — but never lift the holding finger.</b> You can replay this guide any time in system settings.',
            done_hint: 'Nexus OS 26 · Let every imagination light up the unknown'
        },
        ja: {
            badge: '高精度トラックパッド · 初回ガイド', skip: 'スキップ', skip_step: 'このステップをスキップ',
            next: 'はじめる', done_btn: 'システムへ', again: 'もう一度',
            welcome_t: '高精度トラックパッドに慣れよう',
            welcome_b: 'Nexus OS 26 ではポインターが指に追従します。二本指でスクロール、ピンチで拡大縮小、<b>一本指で押さえたまま、もう一本の指で滑らせてドラッグ</b>できます。一分だけ一緒に試しましょう。',
            tap_t: 'そっと滑らせて、軽くタップ',
            tap_b: '中央の丸いボタンが見えますか？ポインターを<b>滑らせる</b>だけでOK、押し込まないでください。それから<b>軽く一度タップ</b>。',
            tap_ok: 'そう、それです。とても軽いですね。', tap_drag: 'ここでは軽くタップだけ。一本で押さえ、もう一本で滑らせる操作は次のステップです。',
            tap_ghost: 'ポインターをここへ · 軽くタップ',
            drag_t: '一本指で押さえ、もう一本で滑らせる',
            drag_b: '<b>一本目の指をトラックパッドに置いたまま動かさない</b>（これが「押さえる」指）。<b>二本目の指でカードを軽く滑らせ</b>、右の点線枠へ運んでから二本とも離します。',
            drag_ok: 'そう、一本で押さえてもう一本で滑らせる。',
            drag_miss: 'もう少し右へ、点線枠の中へ滑らせてください。',
            drag_hold: '押さえている指は離さず、もう一本の指を軽く滑らせます。',
            drag_alt: 'ブラウザに一本指しか伝わらない端末では、カードを押さえたまま同じ指で滑らせても結果は同じです。',
            drag_card: 'カード',
            drag_slot: 'ここに置く',
            wheel_t: '二本指で、そっと一滑り',
            wheel_b: '左のリールはランダムな文字で止まります。<b>二本指でスライド</b>して右を同じ文字に合わせ、軽くタップしてください。',
            wheel_ok: '見つけた！指の方が正確ですね。', wheel_miss: 'もう少し、あと一滑り。',
            wheel_lock: '目標 · 固定', wheel_live: '操作してください',
            pinch_t: '二本指を開いて、つまむ',
            pinch_b: '二本指を開いたりつまんだりすると四角が拡大縮小します。<b>点線の枠と同じ大きさ</b>にしてみましょう。マウスホイールでも構いません。',
            pinch_ok: 'きれいです。ピンチの感覚はこれだけです。', pinch_cube: 'ピンチ',
            swipe_t: 'もう一つ、多指ジェスチャー',
            swipe_b: '二本指をトラックパッドの左側に横に置き、<b>右へ払うと丸は右へ</b>、左へ払うと左へ動きます。どちらかの端まで届けば完了です。横スクロールが無い環境では、丸をマウスで端までドラッグしても構いません。',
            swipe_ok: 'いいですね、もうトラックパッドは使いこなせています。',
            done_t: '覚えるのはこれだけ',
            done_b: 'ウィンドウもデスクトップもウェブも、すべて同じ操作です。二本指スクロール、ピンチ拡大、<b>一本で押さえてもう一本で滑らせるドラッグ</b>。<b>軽く短く、ただし押さえる指は離さない</b>。このガイドは設定からいつでも再生できます。',
            done_hint: 'Nexus OS 26 · すべての想像が未知の遠くを照らす'
        },
        ko: {
            badge: '정밀 트랙패드 · 첫 실행 가이드', skip: '건너뛰기', skip_step: '이 단계 건너뛰기',
            next: '시작', done_btn: '시스템으로', again: '다시 보기',
            welcome_t: '정밀 트랙패드와 만나기',
            welcome_b: 'Nexus OS 26 에서는 포인터가 손가락을 따라옵니다. 두 손가락으로 스크롤, 핀치로 확대/축소, <b>한 손가락은 누르고 다른 손가락을 미끄러뜨려 끌기</b>도 됩니다. 1분만 함께 해봐요.',
            tap_t: '살짝 미끄러뜨리고, 가볍게 탭',
            tap_b: '가운데 둥근 버튼이 보이나요? 포인터를 <b>미끄러뜨려</b> 올리세요. 누르지 마세요. 그리고 <b>가볍게 한 번 탭</b>합니다.',
            tap_ok: '바로 그 느낌이에요. 아주 가볍죠.', tap_drag: '이 단계에서는 가볍게 탭만 하세요. 하나는 누르고 다른 손가락을 미끄러뜨리는 동작은 다음 단계예요.',
            tap_ghost: '포인터를 여기로 · 한 번 탭',
            drag_t: '한 손가락은 누르고, 다른 손가락은 미끄러뜨리기',
            drag_b: '<b>첫 번째 손가락을 트랙패드에 대고 움직이지 마세요</b> — 이 손가락이 "누르는" 손가락입니다. 이어서 <b>두 번째 손가락으로 카드를 살짝 밀어</b> 오른쪽 점선 상자에 넣고, 두 손가락을 함께 떼세요.',
            drag_ok: '바로 그거예요: 하나는 누르고, 하나는 미끄러뜨리기.',
            drag_miss: '조금 더 오른쪽으로, 점선 상자 안까지 밀어주세요.',
            drag_hold: '누르는 손가락은 떼지 말고, 다른 손가락을 살짝 미끄러뜨리세요.',
            drag_alt: '브라우저에 한 손가락만 전달되는 기기에서는 카드를 누른 채 같은 손가락으로 미끄러뜨려도 결과는 같습니다.',
            drag_card: '카드',
            drag_slot: '여기에 놓기',
            wheel_t: '두 손가락으로 살짝 밀기',
            wheel_b: '왼쪽 릴은 무작위 글자에서 멈춥니다. <b>두 손가락을 밀어</b> 오른쪽 릴을 같은 글자에 맞추고 가볍게 탭하세요.',
            wheel_ok: '찾았어요! 손가락이 더 정확하네요.', wheel_miss: '조금만 더, 한 번 더 밀어보세요.',
            wheel_lock: '목표 · 고정', wheel_live: '직접 굴리기',
            pinch_t: '두 손가락을 벌리고 오므리기',
            pinch_b: '두 손가락을 벌리거나 오므리면 사각형이 커지고 작아집니다. <b>점선 크기만큼 키워보세요.</b> 마우스 휠도 됩니다.',
            pinch_ok: '훌륭해요. 핀치 감각은 이게 전부입니다.', pinch_cube: '핀치',
            swipe_t: '마지막 멀티 제스처',
            swipe_b: '두 손가락을 트랙패드 왼쪽에 나란히 두고 <b>오른쪽으로 밀면 점이 오른쪽으로</b>, 왼쪽으로 밀면 왼쪽으로 갑니다. 어느 쪽 끝에 닿으면 완료예요. 가로 스크롤이 없는 환경에서는 점을 마우스로 끝까지 끌어도 됩니다.',
            swipe_ok: '좋아요, 이제 트랙패드는 익숙해졌어요.',
            done_t: '이걸로 충분해요',
            done_b: '모든 창, 데스크톱, 웹 페이지가 같은 조작을 씁니다. 두 손가락 스크롤, 핀치 확대, <b>한 손가락은 누르고 다른 손가락으로 미끄러뜨리는 끌기</b>. <b>가볍고 짧게, 누르는 손가락은 놓지 말고</b>. 설정에서 언제든 이 가이드를 다시 볼 수 있어요.',
            done_hint: 'Nexus OS 26 · 모든 상상이 미지의 먼 곳을 비춥니다'
        },
        ru: {
            badge: 'Точный трекпад · первый запуск', skip: 'Пропустить', skip_step: 'Пропустить шаг',
            next: 'Начать', done_btn: 'В систему', again: 'Повторить',
            welcome_t: 'Знакомимся с точным трекпадом',
            welcome_b: 'В Nexus OS 26 курсор следует за пальцами. Два пальца прокручивают, пинч масштабирует, <b>один палец держит на месте, а второй ведёт — это перетаскивание</b>. Уделите минуту — покажу всё.',
            tap_t: 'Скользните и легко коснитесь',
            tap_b: 'Видите круглую кнопку в центре? Просто <b>проведите</b> по трекпаду, не нажимая. Затем <b>слегка коснитесь</b> — без усилия.',
            tap_ok: 'Вот именно! Очень легко, правда?', tap_drag: 'Здесь достаточно лёгкого касания; удержание одним пальцем и скольжение вторым — на следующем шаге.',
            tap_ghost: 'Наведите курсор · коснитесь один раз',
            drag_t: 'Один палец держит, второй ведёт',
            drag_b: '<b>Положите первый палец на трекпад и не двигайте им</b> — именно он «держит». Затем <b>вторым пальцем легко проведите карточку</b> в пунктирную рамку справа и отпустите оба пальца.',
            drag_ok: 'Вот так: один держит, второй ведёт.',
            drag_miss: 'Ещё немного правее — внутрь пунктирной рамки.',
            drag_hold: 'Не отпускайте удерживающий палец — ведите вторым.',
            drag_alt: 'Если браузер получает только один палец, удерживайте карточку и ведите тем же пальцем — результат тот же.',
            drag_card: 'Карточка',
            drag_slot: 'Сюда',
            wheel_t: 'Два пальца, одно лёгкое движение',
            wheel_b: 'Левая колонка сама прокрутится до случайной буквы и остановится. <b>Проведите двумя пальцами</b>, чтобы правая совпала, и слегка коснитесь.',
            wheel_ok: 'Нашли! Пальцы точнее глаз.', wheel_miss: 'Чуть-чуть осталось, проведите ещё раз.',
            wheel_lock: 'Цель · зафиксирована', wheel_live: 'Ваша очередь',
            pinch_t: 'Разведите пальцы и сведите',
            pinch_b: 'Разводя и сводя два пальца, меняйте размер квадрата. <b>Увеличьте его до пунктирной рамки.</b> Подойдёт и колесо мыши.',
            pinch_ok: 'Отлично, вот и весь смысл пинча.', pinch_cube: 'Пинч',
            swipe_t: 'Ещё один жест несколькими пальцами',
            swipe_b: 'Положите два пальца слева на трекпаде: <b>толчок вправо — точка идёт вправо</b>, влево — влево. Дойдите до любого края. Без горизонтальной прокрутки можно просто перетащить точку мышью до края.',
            swipe_ok: 'Отлично, трекпад теперь ваш.',
            done_t: 'Это всё, что нужно',
            done_b: 'Все окна, рабочий стол и веб-страницы используют один набор: прокрутка двумя пальцами, пинч-масштаб и <b>перетаскивание — один палец держит, второй ведёт</b>. <b>Легко и коротко, но удерживающий палец не отпускайте.</b> Повторить можно в любой момент в настройках.',
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
    /* 浮层只放文字：滚轮里的"图标"改成纯文字字元（A~J），不引任何图标字体 */
    var ICONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    var STEPS = ['welcome', 'tap', 'drag', 'wheel', 'pinch', 'swipe', 'done'];
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
        // 引导层里的手势由本模块自己演示，不让全局手势层再接管一遍
        layer.setAttribute('data-n26-gestures', 'off');
        layer.innerHTML =
            '<div class="n26-tour-card" role="region" aria-labelledby="n26TourTitle">' +
            '  <div class="n26-tour-head">' +
            // 浮层只放文字：不放任何头像 / 机器人形象
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
            return '<span class="' + (i === idx ? 'on' : (i < idx ? 'past' : '')) + '"></span>';
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

    /* 拖动：精准触控板语义 —— 第一根手指按住不动，第二根手指轻滑。
       浏览器里两条路径都要吃下：
       ① Windows 精准触控板：按住的那指不动，第二指的滑动被系统合成为 pointermove
          （同一个 pointerId），所以「按住 + 位移」本身就是两指拖移，不需要长按；
       ② 触摸屏 / 两指分别是独立 pointer：第二根手指登记为 alt，由它的位移驱动拖拽。
       判定只看「按住 + 有位移」，不要求同一点持续按压，也不要求先按住多久。 */
    function setupDrag() {
        var wrap = document.createElement('div');
        wrap.className = 'n26-tour-drag';
        var tile = document.createElement('div');
        tile.className = 'n26-tour-drag-tile';
        tile.textContent = T('drag_card');
        var slot = document.createElement('div');
        slot.className = 'n26-tour-drag-slot';
        slot.innerHTML = '<span>' + T('drag_slot') + '</span>';
        wrap.appendChild(tile); wrap.appendChild(slot);
        stage.appendChild(wrap);

        var down = null, alt = null, moved = false;

        function reset() {
            down = null; alt = null;
            window.removeEventListener('pointermove', onWinMove, true);
            window.removeEventListener('pointerup', onWinUp, true);
            window.removeEventListener('pointercancel', onWinCancel, true);
            window.removeEventListener('pointerdown', onAltDown, true);
            tile.style.transition = '';
            tile.style.transform = '';
            tile.classList.remove('grabbing');
            slot.classList.remove('is-over');
        }

        function onAltDown(e) {
            if (!down || e.pointerId === down.id) return;
            alt = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }

        function onWinMove(e) {
            if (!down) return;
            var second = !!(alt && e.pointerId === alt.id);
            if (e.pointerId !== down.id && !second) return;
            var dx, dy;
            if (second) { dx = e.clientX - alt.x; dy = e.clientY - alt.y; }
            else { dx = e.clientX - down.x; dy = e.clientY - down.y; }
            if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return;
            moved = true;
            if (e.cancelable) e.preventDefault();
            tile.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
            // 卡片中心进入投放区时整块高亮，松手判定用同一套几何
            var tr = tile.getBoundingClientRect(), sr = slot.getBoundingClientRect();
            var cx = tr.left + tr.width / 2, cy = tr.top + tr.height / 2;
            var over = cx >= sr.left && cx <= sr.right && cy >= sr.top && cy <= sr.bottom;
            if (over !== slot.classList.contains('is-over')) slot.classList.toggle('is-over', over);
        }

        function onWinUp(e) {
            if (!down) return;
            if (e.pointerId !== down.id && !(alt && e.pointerId === alt.id)) return;
            if (!moved) {
                reset();
                nudge(T('drag_hold'), true);
                return;
            }
            var tr = tile.getBoundingClientRect(), sr = slot.getBoundingClientRect();
            var cx = tr.left + tr.width / 2, cy = tr.top + tr.height / 2;
            var inside = cx >= sr.left && cx <= sr.right && cy >= sr.top && cy <= sr.bottom;
            reset();
            if (inside) succeed('drag_ok');
            else nudge(T('drag_miss'), true);
        }

        function onWinCancel(e) {
            if (!down) return;
            if (e && e.pointerId !== down.id && !(alt && e.pointerId === alt.id)) return;
            reset();
        }

        bind(tile, 'pointerdown', function (e) {
            down = { id: e.pointerId, x: e.clientX, y: e.clientY };
            alt = null; moved = false;
            tile.style.transition = 'none';
            tile.classList.add('grabbing');
            try { tile.setPointerCapture(e.pointerId); } catch (er) { }
            window.addEventListener('pointermove', onWinMove, true);
            window.addEventListener('pointerup', onWinUp, true);
            window.addEventListener('pointercancel', onWinCancel, true);
            // 第二根手指落下时登记，之后它的滑动也能驱动拖拽
            window.addEventListener('pointerdown', onAltDown, true);
            e.preventDefault();
        });
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
            o.cells[i].textContent = ICONS[k];
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
        track.innerHTML = '<div class="n26-tour-dot" id="n26TourDot"></div>';
        stage.appendChild(track);
        var dot = track.querySelector('#n26TourDot');
        var dx = 0;
        function place(v) {
            dx = clamp(v, -88, 88);
            dot.style.transform = 'translateX(' + dx.toFixed(1) + 'px)';
            if (Math.abs(dx) >= 84) succeed('swipe_ok');
        }
        bind(stage, 'wheel', function (e) {
            e.preventDefault();
            if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            // 自然滚动下手指往右 = deltaX 负值，圆点要跟着手指走，所以取反
            place(dx - e.deltaX);
        }, { passive: false });
        // 没有横向双指滚动的设备：真的把圆点拖到任意一端才算过（不是点一下就算过）
        var drag = null;
        bind(dot, 'pointerdown', function (e) {
            drag = { id: e.pointerId, x: e.clientX, base: dx };
            try { dot.setPointerCapture(e.pointerId); } catch (er) { }
            e.preventDefault();
        });
        bind(dot, 'pointermove', function (e) {
            if (!drag || e.pointerId !== drag.id) return;
            place(drag.base + (e.clientX - drag.x));
        });
        bind(dot, 'pointerup', function (e) {
            if (!drag || e.pointerId !== drag.id) return;
            drag = null;
        });
        bind(dot, 'pointercancel', function () { drag = null; });
    }

    function setupStage(k) {
        if (ctrl) ctrl.abort();
        ctrl = new AbortController();
        token++;
        stage.replaceChildren();
        stage.hidden = false;
        passed = false;
        clearNudge();
        if (k === 'tap') setupTap();
        else if (k === 'drag') setupDrag();
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
            // 欢迎页只放文字：不留空白展示框
            stage.hidden = true;
        }
    }

    /* 文案重绘与舞台重置必须分开：换语言只换字，不能把用户正在做的手势清掉 */
    function renderTexts() {
        if (!layer) return;
        var k = STEPS[idx];
        badgeEl.textContent = T('badge');
        skipEl.textContent = T('skip');
        titleEl.textContent = T(k + '_t');
        textEl.innerHTML = T(k + '_b') +
            (k === 'drag' ? '<div class="n26-tour-alt">' + T('drag_alt') + '</div>' : '');
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
