# FluentOS「为什么丝滑」技术拆解与参数对照

> 取证对象：`D:\20533\Desktop\FluentOS-On-Web`（纯原生 HTML/CSS/JS，无框架、无构建）
> 取证方式：只读源码，统计全部 `*.css` / `*.js` / `index.html`（排除 `node_modules`、`_shots`）
> 对照对象：Nexus OS 26（`Nexus OS 26.html` + `ui/*.css`）
> 所有数值均来自源码，附录给出行号。

---

## 0. 一句话结论

它不是"加了很多动画"，而是**每条动画只做一件事，并且时长/曲线被收成固定的几档**。

真正让它"灵动"的 4 个硬事实：

| # | 事实 | 证据 |
|---|---|---|
| 1 | 全站 334 处 `cubic-bezier` 里，`cubic-bezier(0.16, 1, 0.3, 1)`（easeOutExpo）一个就占了 **146 处** | 见 §1.2 统计表 |
| 2 | 所有 app 的页面切换共用**同一个** `FluentWindow.mount()`，时长是常量 `pageFadeMs: 170` | `js/core/fluent-window.js:56`、`js/apps/settings.js:404` |
| 3 | 一级页签切换**不做横向推拉**，只做 `opacity 170ms` + **6px / 8px 纵向微移** | `css/fluent-window.css:776-794` |
| 4 | Mica 模式下**窗口内零 `backdrop-filter`**，改为"一张全局壁纸快照层 + translate" | `css/mica.css:63-78`、`js/core/state.js:1037-1051` |

---

## 1. 动效体系

### 1.1 时长：四档台阶，不是均匀分布

统计全部 `transition` 声明的时长值（`css/*.css`），做聚类后是清晰的 4 档：

| 档位 | 区间 | 计数（约） | 用途 | 代表选择器 / 值 |
|---|---|---|---|---|
| **微反馈** | 90–180ms | ≈46 处 | hover、按下、指示条、tooltip | `.fw-nav-item { transition: background .16s }`（fluent-window.css:541）<br>`.taskbar-btn { transition: background var(--transition-fast) }` → `0.15s`（main.css:1115）<br>`.taskbar-window-preview { transition: opacity 160ms, transform 160ms }`（main.css:1331） |
| **浮层进出** | 180–260ms | ≈43 处 | 菜单、右键、窗口开合 | `.window.opening { animation: windowOpen .25s cubic-bezier(0.4,0,0.2,1) }`（animations.css:371）<br>`.context-menu { animation: scaleIn .15s }`（animations.css:168）<br>`.start-menu.closing { 0.2s }`（animations.css:285） |
| **结构位移** | 280–460ms | ≈55 处 | 侧栏收起/展开、二级页、窗口最大化 | `--fw-collapse-ms: 420ms`（fluent-window.css:18）<br>`.app-detail-page { 420ms }`（settings.js:1419）<br>`.window.maximizing { transition: all .55s }`（animations.css:396） |
| **景深/页面级** | 500–700ms | ≈23 处 | 登录→桌面解焦、点击涟漪 | `body.desktop-unblur .desktop-wallpaper { transition: filter 680ms }`（main.css:2959）<br>`button-glow-ripple-out 620ms`（fluent-ui.css:553） |

**关键：相邻档之间的比值 ≈ 1.2 × 2 × 1.6**，用户能感知"轻重"。Nexus 主壳的时长是 `0.15s(41) / 0.16s(39) / 0.2s(87) / 0.25s(27) / 0.3s(62) / 0.35s(16)`，相邻只差 20–50ms —— **分不出层级**，所以"闷"。（统计见 §5 第 2 行）

### 1.2 曲线：4 条主曲线 + 1 套 JS 弹簧

全站 334 处 `cubic-bezier`，37 种写法，但**前 5 种占了 82%**：

| 次数 | 值 | 名字 | 用在哪 |
|---|---|---|---|
| **146** | `0.16, 1, 0.3, 1` | easeOutExpo（源码注释原文"近似 easeOutExpo"） | 结构位移、子页进出、壁纸解焦、涟漪 |
| **69** | `0.22, 0.61, 0.36, 1` 与 `0.22, 1, 0.36, 1` | easeOutQuad | 逐行列表入场、次级过渡 |
| **50** | `0.4, 0, 0.2, 1` | Material standard | 窗口开/最大化、菜单开 |
| **21** | `0.4, 0, 1, 1` | Material **decelerate（专用出场）** | 菜单关、窗口关 |
| **9** | `0.34, 1.56, 0.64, 1` | 带超调（overshoot 1.56） | 只给 Dock / 任务栏"弹一下" |

源码里这条被写成了变量，可直接抄：

```css
/* css/fluent-window.css:16-18 */
--fw-ease: cubic-bezier(0.16, 1, 0.3, 1);   /* 丝滑非线性缓动 (近似 easeOutExpo) */
--fw-collapse-ms: 420ms;
```

**弹簧不是 CSS，是 JS 逐帧积分**（这点最值得抄，因为 `cubic-bezier` 模拟不了真阻尼）：

```js
// js/core/fluent-window.js:74-77（滚动回弹）
const BOUNCE_SPRING   = 0.17;   // 刚度
const BOUNCE_DAMPING  = 0.8;    // 每帧速度衰减
const BOUNCE_REST_OFFSET   = 0.08;  // 静止阈值 px
const BOUNCE_REST_VELOCITY = 0.08;

// js/core/fluent-window.js:256-264（每帧一步）
state.bounceVelocity += (-state.bounceOffset) * BOUNCE_SPRING;
state.bounceVelocity *= BOUNCE_DAMPING;
state.bounceOffset   += state.bounceVelocity;
```

`fluent-ui.js:468` 是同一组常量的复制品（`BOUNCE_SPRING = 0.17`）。也就是**全站只有一套弹簧参数**。

### 1.3 延迟错峰：一条规则 + 一个上限

全站只有 3 处 `animation-delay` 参与错峰，且都写成"索引 × 常数，再封顶"：

```css
/* js/apps/settings.js:1947-1948 */
animation: aboutLogItemEnter 480ms cubic-bezier(0.16, 1, 0.3, 1) both;
animation-delay: min(calc(var(--log-index) * 42ms), 420ms);   /* 单条 42ms，总封顶 420ms */
```

```css
/* js/apps/settings.js:699 / 703（反向错峰，收起时倒着来） */
animation-delay: calc(var(--fingo-stagger-index) * 58ms);
animation-delay: calc((2 - var(--fingo-stagger-index)) * 36ms);
```

**规律可抄**：单条 42–58ms、总延迟必须封顶（`min(...)`），否则 30 项列表要等 1.5s。收起时用 `(N - index)` 反向错峰。

### 1.4 位移 / 缩放 / 只淡入：按"信息量"分工

| 类型 | 用在哪 | 具体值 |
|---|---|---|
| **纯位移** | 文字、列表行、页内容 | `translateY(-6px)` 出 / `translateY(8px)` 入（fluent-window.css:787/793）<br>`translateY(14px)` 日志行（settings.js:2092）<br>`translateX(34px)` 二级页（settings.js:2082） |
| **位移 + 缩放** | 窗口、菜单、面板、Dock | `scale(0.9) → 1` 窗口开（animations.css:323）<br>`translateY(8px) scale(0.98) → 0 / 1` 任务栏预览（main.css:1328）<br>`.taskbar-btn:hover{scale(1.05)} :active{scale(0.95)}`（main.css:1121/1129）<br>`.taskbar-center { transition: all .4s cubic-bezier(0.34,1.56,0.64,1) }`（main.css:1105） |
| **只淡入** | 遮罩、标签、徽标、背景层 | `.fw-nav-label { opacity 252ms, transform 420ms }`（fluent-window.css:615）<br>`.fw-nav-badge { opacity 210ms }`（:646）<br>`window-mica-backdrop { opacity 150ms }`（mica.css:55）<br>`windowFocusEnter { 仅 filter + scale，opacity 不变 }`（animations.css:359-367） |

**最重要的两条克制规则：**

1. **入场位移量 ≤ 8px，缩放 ≤ 0.9**。全站没有一个"整屏从左滑入"。所以不晕。
2. **父子不同步**：侧栏收起时容器宽度跑满 420ms，而里面的文字只跑 `420 × 0.6 = 252ms`（fluent-window.css:615），徽标 `420 × 0.5 = 210ms`（:646）。文字先消失、容器后收完 —— **避免窄框里被挤成一条线**。这是"看起来不乱"的关键细节。

---

## 2. 节奏与层级

### 2.1 页面切换：共用一套函数，170ms 常数

```js
// js/core/fluent-window.js:56
pageFadeMs: 170,   // 页面切换淡出/淡入时长 (ms)

// js/core/fluent-window.js:1084-1105
instance.pageEl.classList.add('fw-page-leave');
const fadeMs = opts.pageFadeMs;
setTimeout(() => {
    renderPage();
    ...
    instance.pageEl.classList.remove('fw-page-leave');
    instance.pageEl.classList.add('fw-page-enter');
    void instance.pageEl.offsetHeight;          // 强制回流，保证 enter 初态真的生效
    requestAnimationFrame(() => {               // 双 rAF：跨过这一帧再解禁
        requestAnimationFrame(() => {
            instance.pageEl.classList.remove('fw-page-enter');
            setTimeout(() => { instance._switching = false; }, fadeMs + 90);
        });
    });
}, fadeMs);
```

配套 CSS（**注意 opacity 和 transform 时长不同**）：

```css
/* css/fluent-window.css:776-794 */
.fw-page {
    transition: opacity var(--fw-fade-ms) ease,
                transform calc(var(--fw-fade-ms) + 80ms) cubic-bezier(0.16, 1, 0.3, 1);
    will-change: opacity, transform;
}
.fw-page.fw-page-leave { opacity: 0; transform: translateY(-6px); }
.fw-page.fw-page-enter { opacity: 0; transform: translateY(8px); }
```

即：**淡 170ms + 移 250ms**，位移比透明度"慢半拍"，收尾不会顿。

**所有 app 共用**：`settings.js:404` 调 `FluentWindow.mount({...})`，Files / Media / App Shop / 设置全部走同一个 `navigate()`。这是"节奏统一"的根因 —— 只有一个转场实现。

### 2.2 方向感：只有二级页有，且是"同向推出"

- **一级页签（左侧导航）**：**无方向感**。出 `translateY(-6px)`、入 `translateY(8px)`，纵向、同向、微幅。切哪个页签都是"下压—回弹"，不产生左右位移。
- **二级页 / 三级页**（如 设置 → 关于 → 更新日志、材质页）：

```js
// js/apps/settings.js:2081-2089
@keyframes aboutChangelogEnter { from { opacity: 0; transform: translateX(34px); } to { opacity: 1; transform: translateX(0); } }
@keyframes aboutChangelogExit  { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(34px); } }
```

入场 `420ms cubic-bezier(0.16,1,0.3,1)`，出场 `260ms cubic-bezier(0.4,0,1,1)`（settings.js:1419/1423、1883/1887）。
**方向和距离都相同（右侧 34px）** —— 前进从右边进、返回往右边退，形成"纸叠"感，而不是"左右镜像推拉"。

### 2.3 层级变化：z 轴只是"开关"，真层级靠三个正交量

窗口聚焦/失焦不做阴影变化，而是：

```css
/* css/animations.css:359-367 */
@keyframes windowFocusEnter { from { filter: saturate(0.78); transform: scale(0.988); }
                              to   { filter: saturate(1);    transform: scale(1); } }
@keyframes windowFocusLeave { from { filter: saturate(1);    transform: scale(1); }
                              to   { filter: saturate(0.78); transform: scale(0.988); } }

/* css/fluent-window.css:145-147 */
body.fluent-v2.material-mica .window.window-inactive .window-mica-backdrop { opacity: 0; }
```

三件套：**`scale` 0.988 + `saturate` 0.78 + 背景层 `opacity` 1→0**，各 180ms，一次成型。
`scale` 只缩 1.2%，肉眼几乎不察觉，但配合去饱和，就能读出"这张在下面"。

**诚实说明**：它的 `z-index` 是乱的（出现 `2147483000`、`100001`、`99999` 等 16 种值）。层级感不是靠 z-index 撑起来的，是靠上面这三件套。z-index 这块**不要抄**。

### 2.4 窗口几何

| 动作 | 时长 | 曲线 |
|---|---|---|
| 打开 | 250ms | `0.4,0,0.2,1`，`scale(0.9)→1` + opacity |
| 关闭 | 250ms | `0.4,0,1,1`，`scale(1)→0.95` |
| 最大化 | 550ms | `0.16,1,0.3,1`（注释："统一使用无超调曲线，避免快速弹性回摆"） |
| 还原 | 440ms | `0.4,0,0.2,1` |
| 最小化到 Dock | 500ms transform + 300ms opacity | transform `0.4,0,0.2,1`，opacity `ease-in` |

（`css/animations.css:370-414`）
**注意**：关机/开窗用不同曲线（进 expo、出 decelerate），**所有"出"都比"进"快或同速，从不更慢**。

---

## 3. 性能手段

### 3.1 最重要的一个：Mica 用"壁纸快照层"替掉所有 backdrop-filter

这是它拖动窗口不卡的真正原因。窗口本身**不透明、零模糊**，模糊发生在**一张独立的、被 translate 的壁纸层**上：

```css
/* css/mica.css:35-43 —— 宿主窗口：强制不透明 + 强制关掉 backdrop-filter */
body.fluent-v2.material-mica:not(.blur-disabled) .window {
    background: var(--mica-fallback) !important;
    backdrop-filter: none !important;
}

/* css/mica.css:63-87 —— 壁纸快照层：整屏壁纸，模糊一次，按窗口位置平移 */
body.fluent-v2.material-mica:not(.blur-disabled) .window-mica-backdrop::before {
    left: calc(-1 * var(--mica-window-x, 0px));   /* 跟着窗口走 */
    top:  calc(-1 * var(--mica-window-y, 0px));
    width: 100vw; height: 100vh;
    background-image: var(--fluent-wallpaper-url, none);
    filter: blur(52px) saturate(0.92);
    transform: scale(1.08);   /* 放大 8%，盖住 blur 造成的透明边缘 */
}
```

代价对比：
- 传统做法 = **N 个窗口 × 各自的 backdrop-filter 全屏采样**
- 它的做法 = **1 个壁纸层（模糊 52px 一次） + N 个 `translate3d`**
- 窗口聚焦切换只改 **opacity 150ms**（mica.css:55），不重算模糊

**换来的是**：拖动时只有 `left/top` 的 translate，没有 backdrop 重采样。

### 3.2 模糊只允许 2 档，其它档全部"由基准值算出来"

```js
// js/core/state.js:1035-1053
const blur = Math.max(10, Math.min(70, Number(this.settings.blurIntensity ?? 40)));
const materialBlur = blur;                                  // 窗口档 = 基准
const lightBlur    = Math.max(8,  Math.round(materialBlur * 0.5));   // 副面板 = 0.5×
const smallBlur    = Math.max(6,  Math.round(materialBlur * 0.35));  // 小控件 = 0.35×

document.body.style.setProperty('--v2-blur', `${materialBlur}px`);
document.body.style.setProperty('--v2-blur-light', `${lightBlur}px`);
document.body.style.setProperty('--blur-lg', `${materialBlur}px`);   // 复用旧 token
document.body.style.setProperty('--blur-md', `${lightBlur}px`);
document.body.style.setProperty('--blur-sm', `${smallBlur}px`);
document.body.style.setProperty('--fluent-material-blur', `${materialBlur}px`);
document.body.style.setProperty('--fluent-material-blur-light', `${lightBlur}px`);
```

即用户只调 **一个滑块**，其余全按 $\{1,\ 0.5,\ 0.35\}$ 派生。默认 `40px → 20px → 14px`。
**不是"每个组件各写死一个模糊值"** —— 这直接限制了 GPU 要处理的模糊半径种类。

### 3.3 明确禁止对窗口加 `will-change`

```css
/* css/main.css:2261-2265 —— 原文 */
transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
/* 不使用 will-change/translateZ 强制分层:backdrop-filter 本身已强制分层,
   多余的持久合成层会让 Chromium 在页面静止时走 render surface 缓存路径,
   在非整数 DPR 下于模糊层边缘产生黑线。 */
```

全站 `will-change` 只有 35 处，且集中在真正逐帧变化的元素（`transform` 9 处、`opacity, transform` 3 处、`opacity, filter, transform` 3 处）。**没有一处加在 `.window` 上。**

这正好解释一类"卡"：图层加太多 → 合成层爆炸 → 静止反而更贵。

### 3.4 滚动：统一接管 + 只 translate + hover 锁

```js
// js/core/fluent-window.js:67-77
const HIDE_DELAY = 950;          // 滚动条隐藏延迟
const HOVER_LOCK_DELAY = 180;    // 滚动期间锁住 hover 态
const MIN_THUMB = 30;
this._globalScrollUseTranslate = 'translate' in document.documentElement.style;
```

- 全站滚动条自绘，**只在滚动时出现**，950ms 后隐藏。
- 优先用 `translate` 移动内容（`_globalScrollUseTranslate`），而不是逐帧写 `scrollTop`。
- 滚动中给行加 `fluent-scroll-hover-locked` 180ms（mica.css:131-138 配合），**防止"指针没动但行从底下划过"时闪一下 hover 色**。这是很细但很有效的一招。

### 3.5 它没做的（别以为有）

| 手法 | 实测 | 结论 |
|---|---|---|
| `content-visibility` | **0 处** | 没用 |
| 虚拟列表 | **0 处**（无 recycle/renderRange/windowSize 逻辑） | 没用 |
| 骨架屏 | 仅 `weather.js`（`renderSkeleton()` × 5 处） | 只天气有 |
| 图片懒加载 | 仅 5 处 `loading="lazy"`（photos ×2、settings 头像 ×2、index 壁纸 ×6 预览） | 极少 |
| 预加载下一屏 | 无路由预取；只有 `index.html:7` 一张 logo `rel="preload"` | 基本没有 |

**结论：它"丝滑"不靠懒加载/虚拟列表，靠的是"每帧只改合成属性 + 全局只有 2 档模糊"。**
Nexus 想抄的话，优先级是 3.1 > 3.2 > 3.3，而不是去加骨架屏。

---

## 4. 视觉舒适度：为什么"不乱"

### 4.1 字号阶梯（统计 `css/*.css` 全部 `font-size` 声明）

| 次数 | 字号 | 角色 |
|---|---|---|
| 83 | **12px** | 辅助说明、时间戳、标签 |
| 65 | **13px** | 次要正文、列表副标题 |
| 63 | **14px** | **正文基准**（`body { font-size: 14px }`，main.css:78） |
| 43 | 11px | 徽标、角标 |
| 18 | 15px | 单行强调 |
| 16 | 16px | 分区标题 |
| 8 | 18px / 8 | 20–24px：页标题 |
| 7 | 24px | 大标题 |

**结论：只有 6 个常用字号（11/12/13/14/15/16），且 12/13/14 三档承担 74% 的信息量。**
行高：`1.45 / 1.5 / 1.55` 用于正文（10+7+6 处），`1.05 / 1.15 / 1.2` 用于标题。
字重：`600`(70) 为主，`700`(25)、`650`(18)，`400` 只有 8 处 —— **它用"600 代替 400"来做强调，不用字号跳级**。

### 4.2 间距：4px 基数，14 个值只落在 4 的倍数上

`padding` / `gap` 统计（前 10）：

| 值 | 次数 | 值 | 次数 |
|---|---|---|---|
| 8px | 80 | 6px | 36 |
| 12px | 67 | 16px | 31 |
| 10px | 59 | 14px | 20 |
| 4px | 36 | 20px | 10 |

绝大多数是 **4 的倍数（4/8/12/16/20/28）**，`6/10/14` 是"半格"。没有 13px、17px、23px 这类随手值。

**内容留白是写死的**：

```css
/* css/fluent-window.css:714-717 */
.fw-page { padding: 28px 32px; }
/* css/fluent-window.css:164-176 */
.fw-sidebar { width: 220px; padding: 18px 10px 12px; }
/* css/fluent-window.css:522-541 */
.fw-nav-item { height: 40px; gap: 12px; padding: 0 10px; border-radius: 8px; }
.fw-nav { gap: 9px; }
```

窗口 16px 圆角、内容留 32px、导航项 40px 高 —— **三个数固定，所有 app 一样**，所以并排看不会"每家一套"。

### 4.3 圆角：4 档 + 一个"异形"

| 值 | 次数 | 用途 |
|---|---|---|
| 8px | 39 | 控件、导航项 |
| 999px | 34 | 胶囊（指示条、徽标、滚动条） |
| 16px | 17 | 窗口 / 内容卡 |
| 20px | 16 | 大浮层（通知、模态） |
| 12px | 15 | 中卡片 |

外加一个很关键的**异形内容卡**（左上 + 右下圆角，其余是直角）：

```css
/* css/fluent-window.css:676-677 */
border-radius: var(--fw-card-radius) 0 var(--fw-card-radius) 0;
```

它让"内容区"看起来是**从窗口里长出来的一张纸**，而不是又一个圆角矩形叠上去。**这一条极省视觉噪声，强烈建议抄。**

### 4.4 阴影：4 档，全部极低不透明度

```css
/* css/main.css:15-18 */
--shadow-sm: 0 2px 8px  rgba(0,0,0,.10);
--shadow-md: 0 4px 16px rgba(0,0,0,.12);
--shadow-lg: 0 8px 24px rgba(0,0,0,.15);
--shadow-xl: 0 12px 48px rgba(0,0,0,.18);   /* 窗口专用，最深也只有 18% */
```

**窗口阴影永远用 `xl`，小控件永远用 `sm`，不混用**（`.fw-card` 用 `0 2px 8px rgba(0,0,0,.06)`，比 sm 更轻）。
深色模式统一升到 `.30 / .35 / .40 / .45` —— **只调透明度，不改扩散半径**。

### 4.5 颜色：核心 token 只有 ~20 个

`:root` 里颜色类 token 共 20 个：`--bg-primary/secondary/tertiary`、`--text-primary/secondary/tertiary`、`--accent / -hover / -rgb / -soft`、`--border-color`、`--shadow-*4`。
`.dark-mode` 只覆盖其中 12 个，其余不动。
（全站 113 个不同 hex 是**含各 app 内部渐变**的数量，不是界面用色数。）

**"不乱"的三条可执行原因**：
1. **单一容器形状**：左 220px 侧栏 + 异形内容卡，所有 app 同构。
2. **每行只允许一个强调**：激活态 = 一条 3px×16px 的竖条（`.fw-nav-item.active::before`，fluent-window.css:562-573）+ `inset 0 0 0 1px` 发丝边，**不再加阴影、不再变色块**。
3. **留白固定**：`28/32px` 内容边距，横向永不压缩到 16px 以下。

---

## 5. 对照表（能落地的）

| # | 项 | FluentOS 做法（数值 + 出处） | Nexus 现在是什么 | 建议值 |
|---|---|---|---|---|
| 1 | **主曲线** | `--fw-ease: cubic-bezier(0.16,1,0.3,1)`，全站 146/334 处（fluent-window.css:17） | `--ease-out-expo` 已是 `0.16,1,0.3,1`（tokens.css:10），`var(--ease-*)` 用了 138 处 | **保留曲线，提高占比**：把主壳 78 处裸 `cubic-bezier` 收敛到 `var(--ease-out-expo)` |
| 2 | **时长档位** | 四档：`90–180 / 180–260 / 280–460 / 500–700`，相邻档差 ≥ 1.2× | 主壳 462 处 `transition:`，时长集中在 `0.15/0.16/0.2/0.25/0.3`，相邻只差 20–50ms；`var(--dur-*)` 在主壳 **0 次**（全项目仅 41 次，4 个文件） | **合并成 5 档**：`90 / 160 / 420 / 680`；把主壳的 0.25s、0.35s 全部归入 420 档 |
| 3 | **页面切换** | `pageFadeMs: 170` + `opacity 170ms / transform 250ms`，`translateY(-6/+8px)`（fluent-window.js:56、fluent-window.css:779） | 主壳无统一页面转场，各 app 各写 | **新建一个 `n26PageSwitch()`**，参数 `170ms / 250ms / ±8px`，所有 app 只调它 |
| 4 | **二级页方向** | `translateX(34px)`，入 `420ms easeOutExpo`，出 `260ms ease-in`（settings.js:2081-2089） | 个性化二级页刚做（220–260ms 滑入） | 把二级页**统一到 420/260 + 34px**，与 FluentOS 同构 |
| 5 | **错峰** | `min(index * 42ms, 420ms)`（settings.js:1948） | 未见统一规则 | **42ms × index，封顶 420ms**；收起时用 `(N-index)` |
| 6 | **悬停** | `160ms` 只改 `background`/`color`；`scale(1.05)` 仅 Dock（main.css:1115-1129） | 主壳 0.2s 混用 5 种 | 悬停统一 **160ms**，只动 `background`/`box-shadow`，不动 `transform`（除 Dock） |
| 7 | **窗口开合** | 进 `250ms 0.4,0,0.2,1` `scale(0.9)→1`；出 `250ms 0.4,0,1,1` `→0.95`（animations.css:371/391） | 待核 | 进 `250ms scale(.92)`、出 `200ms scale(.96)`，**出必须比进快** |
| 8 | **失焦层级** | `scale(0.988) + saturate(0.78)`，180ms（animations.css:359-367） | 无 | 加 `.n26-window-inactive{ scale(.988); saturate(.78) }`，180ms |
| 9 | **侧栏收起** | 容器 420ms，文字 `×0.6`(252ms)，徽标 `×0.5`(210ms)（fluent-window.css:615/646） | 侧栏是 `width`/`transform` 硬切 | **父子不同步**：宽度 420ms，文字 252ms，图标 210ms |
| 10 | **模糊档位** | 只 2 档：窗口 `40px`、副面板 `0.5×`（20px）、小控件 `0.35×`（14px）（state.js:1035-1053） | 单变量 `--n26-blur` 0–40，默认 18px（n26-material.css 多处 `calc(... * 0.35/0.6/0.92/1.7/2.15)`），**派生系数有 6 种** | **收敛到 3 档**：`1× / 0.5× / 0.35×`，删掉 0.92/1.7/2.15 这类散值 |
| 11 | **模糊数量** | Mica 模式：窗口内 **0 个** `backdrop-filter`，改用 1 张壁纸快照层（mica.css:35-87） | `n26-perf.css:6-9` 实测：**118 个元素带 backdrop-filter，覆盖 572% 个屏幕**，拖动 **19.8 fps** | **抄 11 的方法**：壁纸快照层 `blur(52px) + scale(1.08) + translate`，窗口 `backdrop-filter:none` |
| 12 | **`will-change`** | 窗口**禁用**，理由是防非整数 DPR 黑线（main.css:2263-2265） | 待核 | 移除窗口级 `will-change`；只给真正逐帧滚动的容器 |
| 13 | **内容留白** | `.fw-page{padding:28px 32px}`，侧栏 220/60，导航项 40px 高 / 9px 间距（fluent-window.css:715/12-13/530） | `--sp-4:16px` 为主 | 主内容 **28px 32px**，列表项 **40px 高 + 8px 间距** |
| 14 | **圆角** | 窗口 `16`、卡片 `12–16`、控件 `8`、胶囊 `999` | `--r-sm:10 / md:14 / lg:20 / xl:28`（tokens.css:50-51） | **整体降一档**：窗口 16、卡片 12、控件 8；`20/28` 只留给全屏浮层 |
| 15 | **阴影** | 4 档，最深 `0 12px 48px rgba(0,0,0,.18)`（main.css:15-18） | 4 档 `--sh-card/pop/window/dock`，window 档 `0 16px 48px .16`（tokens.css:65-68） | 已接近，**只需保证"窗口只用 window 档"**，别混用 |
| 16 | **字号** | 6 档：`11/12/13/14/15/16`，正文 14；字重以 **600 代 400** | `--fs-11…--fs-34` 共 10 档 | **砍掉 22/28/34 的常规使用**，标题最多 24；正文 14 / 次要 13 / 辅助 12 |
| 17 | **z-index** | 乱（最高 `2147483000`）——**不要抄** | 有 10 档 token（tokens.css:87-89） | **保持现有 token**，禁止裸写 z-index |

---

## 6. 先改这三处（按性价比排序）

### ① 把"118 个 backdrop-filter / 572% 屏幕"降到个位数 —— 抄 §3.1

你们的 `n26-perf.css` 已经测出病灶（`19.8 fps`、535% 是"不可见还在算"）。FluentOS 的答案不是"把不可见的藏起来"，而是**从根上不产生 N 个模糊**：
窗口本体不透明 → 一张壁纸快照层 `blur(52px)` + `scale(1.08)` + `translate(--mica-x/y)` → 聚焦只改 `opacity 150ms`。
落点：`ui/n26-material.css` 的 liquid 分支，加一层 `.n26-wallpaper-snapshot`；窗口层 `backdrop-filter: none`。

### ② 时长从"均匀 6 档"改成"台阶 4 档" —— 抄 §1.1

只动 `ui/tokens.css`：`--dur-instant:90 --dur-fast:160 --dur-base:260 --dur-slow:420 --dur-slower:680`，然后把主壳 462 处 `transition` 里的 `0.25s / 0.35s / 0.3s` 全部替换成 `var(--dur-slow)`。
**判据**：相邻档比值 ≥ 1.6，用户才分得出"这是微反馈 / 这是结构变化"。

### ③ 给所有 app 一个统一页面转场 —— 抄 §2.1

新建 `n26PageSwitch(el, render)`，内部严格按 FluentOS 的三步：`加 leave → 170ms 后 render → 双 rAF 加 enter → 170+90ms 解禁`，CSS 用 `opacity 170ms / transform 250ms / translateY(-6 → +8px)`。
主壳内嵌 app 与 `apps/*.html` 都只调它，不再各写一套淡入。

---

## 附录：证据索引

| 文件 | 行 | 内容 |
|---|---|---|
| `css/main.css` | 15-18, 21-24, 32-35 | `--shadow-*`、`--radius-*`、`--transition-*`（`0.15/0.2/0.3s ease-out`、spring `0.5s (0.175,0.885,0.32,1.275)`） |
| `css/main.css` | 78 | `body{font-size:14px}` 正文基准 |
| `css/main.css` | 1103-1130 | `taskbar-center` 弹簧 0.4s；`.taskbar-btn:hover{scale(1.05)}` / `:active{scale(.95)}` |
| `css/main.css` | 1196-1219 | Dock 指示条 `transition: opacity/transform/bottom var(--transition-fast)` |
| `css/main.css` | 1313-1338 | 任务栏窗口预览：`160ms`、`translateY(8px) scale(.98)` |
| `css/main.css` | 2251-2266 | 窗口 `radius-xl` + `shadow-xl` + **禁用 will-change 的注释** |
| `css/main.css` | 2944-2961 | 登录→桌面：`blur(35px) brightness(.65) scale(1.1)` → `680ms easeOutExpo` |
| `css/animations.css` | 123-418 | 全站动画类：菜单/窗口/反馈的时长与曲线总表 |
| `css/fluent-window.css` | 11-31 | `--fw-expanded-w:220 / collapsed-w:60 / fade-ms:170 / ease / collapse:420 / radius:16` |
| `css/fluent-window.css` | 42-50 | 宿主窗 `blur(var(--fluent-material-blur,40px)) saturate(160%)` |
| `css/fluent-window.css` | 164-213 | 侧栏宽 220↔60，`width/padding` 420ms |
| `css/fluent-window.css` | 522-573 | 导航项 40px / 8px 圆角 / 160ms / 激活竖条 3×16px |
| `css/fluent-window.css` | 607-651 | 标签 `opacity ×0.6`、徽标 `×0.5`（父子不同步） |
| `css/fluent-window.css` | 676-677 | 异形卡 `radius 16 0 16 0` |
| `css/fluent-window.css` | 714-720 | `.fw-page{padding:28px 32px}` |
| `css/fluent-window.css` | 776-794 | 页面切换 CSS（170/250ms、±6/8px） |
| `css/mica.css` | 35-97, 145-147, 175-184 | Mica：窗口零 backdrop、壁纸快照层、聚焦靠 opacity、`prefers-reduced-transparency` |
| `css/fluent-ui.css` | 481-599 | `fluent-scale-in/out` 0.2s；按钮高光 128px/`blur(7px)`/`140ms`/涟漪 `620ms` |
| `css/fluent-ui.css` | 607-620 | `--v2-blur:40 / --v2-blur-light:20` |
| `js/core/fluent-window.js` | 51-58 | 侧栏 220/176–320/60、`collapseAtWidth:720`、`pageFadeMs:170` |
| `js/core/fluent-window.js` | 67-77 | 滚动：`HIDE_DELAY 950`、`HOVER_LOCK 180`、`BOUNCE_SPRING .17`、`DAMPING .8` |
| `js/core/fluent-window.js` | 256-264 | 弹簧逐帧积分 |
| `js/core/fluent-window.js` | 1075-1106 | `navigate()` 常量 170 + 双 rAF + `+90ms` 解禁 |
| `js/core/state.js` | 1033-1055 | 模糊三档派生 `1 / 0.5 / 0.35` |
| `js/core/state.js` | 1157-1200 | 按钮光斑跟随指针；涟漪 `max(w,h)×2.25` |
| `js/apps/settings.js` | 404-443 | 所有设置页走同一个 `FluentWindow.mount` |
| `js/apps/settings.js` | 699-703, 1947-1948 | 错峰 `58ms/36ms` 反向、`min(index×42ms,420ms)` |
| `js/apps/settings.js` | 2081-2094 | 二级页 `translateX(34px)` 关键帧 |
| `js/apps/settings.js` | 1419-1425, 1882-1893 | 二级页 入 420 / 出 260 |

### Nexus 侧对照数据来源

| 文件 | 结论 |
|---|---|
| `ui/tokens.css:10-23, 50-51, 60-68` | 曲线/时长/圆角/字号/阴影 token 已定义 |
| `Nexus OS 26.html` | `transition:` 462 处、裸 `cubic-bezier` 78 处、`@keyframes` 215 处、`var(--dur-*)` **0 处** |
| `ui/*.css`（除 `.bak`） | `var(--ease-*)` 138 处、`var(--dur-*)` 41 处（仅 `glass/n26-files/n26-album/devstudio` 4 个文件）、裸时长 208 处 |
| `ui/n26-perf.css:6-13` | 实测：118 个 backdrop-filter / 572% 屏覆盖 / 拖动 19.8 fps |
| `ui/n26-material.css:41-155` | 模糊派生出现 `0.35 / 0.6 / 0.92 / 1.3 / 1.7 / 2.15` 六种系数 |
