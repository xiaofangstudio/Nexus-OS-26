# Nexus OS 26 · 对外接口文档

> **这份文档是写给外部开发者的**：你要把自己的应用装进 Nexus、要让自己的伪系统跟 Nexus 对接、或者要把 Nexus 嵌进自己的页面，请看这里。
> 视角固定为「别人怎么调用 Nexus」，不覆盖 Nexus 怎么调用外部服务。

| 项 | 值 |
|---|---|
| 主壳 | `Nexus OS 26.html`（单文件，内联 HTML/CSS/JS） |
| 应用层 | `apps/`（`_app.js`、`_bridge.js`、`_polish.css`）+ `ui/`（`n26-ui.js`、`n26-gestures.js`、`n26-switch.js`） |
| 本地桥 | `nexus-bridge.ps1` / `nexus-bridge.py` / `启动本地桥-Start-Bridge.bat` |
| 云端 | `server/` + `docs/Nexus-Cloud-API.md` + `docs/openapi.json` + `server/API_BACKEND.md` |
| 文档状态 | 按当前源码实测行为编写；**标注为「未实现 / 受限」的能力不要当承诺用** |

本文所有 `文件:行号` 均指本仓库真实位置，可直接跳读核对。

---

## 0. 30 秒能力总览

| 你想做的事 | 能否做到 | 走哪条通道 | 关键限制 |
|---|---|---|---|
| 写一个界面应用，装进 Nexus 当原生应用 | ✅ 已支持 | `apps/<id>.html` + `_bridge.js` + `_app.js`；主壳 `appRegistry` + `IFRAME_APPS` 各加一行 | 需要改主壳源码登记，属于「随系统分发」而不是热插拔安装 |
| 让自己的网页调系统能力（通知、存储、开应用、改标题） | ✅ 已支持 | iframe 内 `window.Nexus.*` → `postMessage` | 必须作为 Nexus 应用被打开（同源 iframe） |
| 跟随宿主深浅色 / FangUI 风格 / 语言 / 玻璃材质 | ✅ 已支持 | `nexus:theme`、`nexus:fuistyle`、`nexus:language`、`nexus:glass` 事件 | 事件只能订阅，不能反向设置（改设置走设置面板或 `osControl`） |
| 给应用加一条 Touch Bar 式工具条 | ✅ 已支持 | `Nexus.call('dockbar', {action, spec})` + `Nexus.on('dockbar')` | 全屏时会被隐藏 |
| 让外部链接直接打开某个应用 | ✅ 已支持 | `Nexus OS 26.html?app=<appId>` | 只在进入桌面后延时 900ms 执行；无 `?tab=`、无 shell 级 `?theme=` |
| 外部页面跨域控制 Nexus（远程开窗/读状态） | ❌ 未实现 | 无嵌入 API、无父页消息协议 | 跨源只能显示，不能控制 |
| 读取本机真实磁盘文件 | ✅ 已支持 | 本地桥 `http://127.0.0.1:8899/api/*` | 只读、只 GET、无鉴权、需 `http://127.0.0.1` 或 https 安全上下文 |
| 写入/删除本机真实文件 | ❌ 未实现 | 桥没有写接口 | 全部写操作返回 403 |
| 截取真实屏幕 | ⚠️ 受限 | `Nexus.call('takeScreenshot')` | 实际是 `html2canvas` 截桌面 DOM，不是系统级截屏；跨源 iframe 会失败 |
| 录屏 | ⚠️ 受限 | `Nexus.call('startRecording')` | 依赖 `getDisplayMedia` 用户授权；iframe 内受 Permissions Policy 限制，失败会退到约 3fps 的系统内录 |
| 发布/更新你的应用包 | ✅ 已支持（需运营开通开发者） | 云端 `/api/v1` | 开发者账号只能由管理员 `POST /admin/developers` 创建 |
| 用 CW Script 写小应用并热装 | ✅ 已支持 | 自发布包 `sp_<id>` → `apps/floatapp` | 沙盒 `allow-scripts` 无同源，**拿不到 `Nexus` 桥** |
| 上传 HTML / zip 应用并热装运行 | ❌ 未实现 | 云端允许上传，客户端不认 | 客户端 `floatapp` 只跑 CW Script；`apps/htmlapp` 未被主壳引用 |

---

## 1. 四条通道

```
┌─────────────────────────────── 外部开发者 ───────────────────────────────┐
│                                                                          │
│ A. 应用侧（你的页面被 Nexus 打开）                                        │
│    apps/<id>.html ── _bridge.js ── postMessage ── 主壳 handlers           │
│                                                                          │
│ B. 宿主侧（你的页面打开 Nexus）                                           │
│    ?app=<id> 深链 / 同源时可直接调主壳全局函数（无正式嵌入 API）           │
│                                                                          │
│ C. 本地能力（真实磁盘）                                                   │
│    http://127.0.0.1:8899  ←  只读 REST，任意本地页面可访问（无鉴权）      │
│                                                                          │
│ D. 云端分发                                                              │
│    https://ai.fanggame.company/api/v1  ←  列表/下载公开，发布需开发者 Token│
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 通道 A：把你的应用装进 Nexus（iframe 应用契约）

### 2.1 注册契约

Nexus 的应用不是运行时扫描目录发现的，而是在主壳里**静态登记**两处：

1. `appRegistry`（`Nexus OS 26.html:29418`）—— 应用的身份与外形；
2. `window.IFRAME_APPS`（`Nexus OS 26.html:29481`）—— 应用的文件地址。

`appRegistry` 单条结构（示例：`Nexus OS 26.html:29419`）：

```js
appRegistry['myapp'] = {
  name: '我的应用',
  icon: 'fa-cube',        // Font Awesome 类名；也支持 N26_APP_ICONS 图片图标
  color: '#60a5fa',
  defaultWidth: 720,
  defaultHeight: 480,
  // 可选：
  category: 'tools',      // getApps 会回传，缺省 'other'
  browserUrl: 'https://…' // 有值时改为开浏览器窗口加载网页，而不是 iframe
};
```

`IFRAME_APPS` 登记（`Nexus OS 26.html:29482`）：

```js
window.IFRAME_APPS['myapp'] = 'apps/myapp.html';
```

放置文件后，主壳在 `renderAppContent(id, appId)`（`Nexus OS 26.html:31260`）里创建：

```html
<iframe class="app-iframe" loading="lazy"
        src="apps/myapp.html?app=…&v=<NEXUS_OS_VERSION>"
        allow="autoplay; fullscreen; clipboard-read; clipboard-write; microphone; camera; geolocation"
        title="myapp"></iframe>
```

注意 `allow` 清单（`Nexus OS 26.html:31286`）**没有 `display-capture`**，这直接决定了 iframe 里的录屏能力（见 §8）。

> **边界**：这套登记要改 `Nexus OS 26.html` 本身，因此适用于「随系统一起分发的应用」，不是第三方热插拔安装。想让用户在线装应用，走云端 + 自发布包（§6），但那条路只能跑 CW Script。

### 2.2 启动时序

```
主壳 createWindow
   └─ iframe load
        └─ 主壳 postMessage {__nexusInit:true, windowId, user, settings, dark, osStyle, language, glass}
             └─ _bridge.js 收到 → 派发 DOM 事件 nexus:ready
                  └─ _app.js Nexus.ready(fn) 触发（幂等）
                       └─ 你的应用代码开始渲染
```

- 初始化下发位置：`Nexus OS 26.html:31325`；
- 桥接收位置：`apps/_bridge.js:27`；
- `Nexus.ready` 幂等实现：`apps/_app.js:347`；
- 兜底：宿主 2.5 秒内没下发上下文（单独打开页面 / 被拦 / 宿主崩了），`_app.js` 会用一份离线默认上下文渲染（`apps/_app.js:332`），不会白屏。

### 2.3 postMessage 协议

**方向：主壳 ⇄ iframe**（`postMessage` 的 `targetOrigin` 目前一律是 `'*'`）。

| 消息类型 | 方向 | 字段 | 说明 | 源码 |
|---|---|---|---|---|
| 初始化 | 宿主 → iframe | `__nexusInit:true`、`windowId`、`user:{name,role,avatar}`、`settings`、`dark`、`osStyle`、`language`、`glass` | iframe `load` 后立即下发 | `Nexus OS 26.html:31325` |
| 请求 | iframe → 宿主 | `__nexusReq:<id>`、`method`、`args:[]`、`windowId?` | `windowId` 由桥自动带上 | `apps/_bridge.js:43` |
| 响应 | 宿主 → iframe | `__nexusRes:<id>`、`ok`、`data`、`error` | 同步与 `Promise` 处理器都支持 | `Nexus OS 26.html:29857` |
| 事件推送 | 宿主 → iframe | `__nexusEvt:true`、`name`、`data` | 转成 DOM 事件 `nexus:<name>` | `apps/_bridge.js:33` |
| 手势回传（半成品） | iframe → 宿主 | `__nexusGesture:true`、`type`、`detail` | 只有宿主加载了 `ui/n26-gestures.js` 才会被消费，当前主壳没加载 | `ui/n26-gestures.js:157` |
| 后台音频/视频移交（私有） | iframe → 宿主 | `__nexusBgAudio` / `__nexusMusicCmd` / `__nexusBgVideo` / `__nexusVideoCmd` | 内置音乐/视频应用专用，不是公开契约 | `Nexus OS 26.html:29850` |

**最小协议示例（不引 `_bridge.js`，手写请求）**：

```js
const id = 1;
parent.postMessage({ __nexusReq: id, method: 'getUser', args: [] }, '*');
window.addEventListener('message', (e) => {
  if (e.data && e.data.__nexusRes === id) console.log(e.data.ok, e.data.data);
});
```

> 正常开发**不要手写**，直接用 `apps/_bridge.js`，它帮你管自增 id、Promise 和错误。

### 2.4 `window.Nexus`：应用侧公开 API

`window.Nexus` **在应用 iframe 内**由 `apps/_bridge.js` 与 `apps/_app.js` 挂载，是下面这套桥 API。主壳自身也有一个同名全局，但只有 `frost` / `unfrost` 两个毛玻璃工具（`Nexus OS 26.html:52361`），**没有**这套桥 API，两边的 `window.Nexus` 不是同一个东西。

#### 2.4.1 桥接方法（`apps/_bridge.js:49`）

| 方法 | 参数 | 返回值 | 备注 |
|---|---|---|---|
| `Nexus.call(method, ...args)` | 宿主处理器名 + 任意参数 | `Promise<any>` | 通用逃生口，可调 §2.6 里任何处理器 |
| `Nexus.getApps()` | — | `Promise<Array>` | `{id,name,icon,iconImage,category,installed}` |
| `Nexus.getUserLS(key)` | string | `Promise<any>` | 按用户隔离；敏感 key 返回 `null` |
| `Nexus.setUserLS(key, value)` | string, any | `Promise<boolean>` | 敏感 key 返回 `false`，不写 |
| `Nexus.getLS(key)` | string | `Promise<any>` | 全局（跨用户） |
| `Nexus.setLS(key, value)` | string, any | `Promise<boolean>` | 同上 |
| `Nexus.getUser()` | — | `Promise<{name,role,avatar}>` | |
| `Nexus.getSettings()` | — | `Promise<object>` | 已过滤敏感字段 |
| `Nexus.getContext()` | — | `Promise<object>` | `{windowId,user,settings,dark,osStyle}`，settings 已过滤 |
| `Nexus.context()` | — | `object \| null` | **同步**，返回 init 原文（含未过滤 settings） |
| `Nexus.notify(title, msg, type)` | string, string, `'info'\|'success'\|'warning'\|'error'` | `Promise<boolean>` | 注入到宿主通知中心 |
| `Nexus.openApp(appId)` | string | `Promise<boolean>` | 已打开时是「切换」语义，见 §3.3 |
| `Nexus.closeWindow()` | — | `Promise<boolean>` | 关当前窗口 |
| `Nexus.minimizeWindow()` | — | `Promise<boolean>` | 最小化当前窗口 |
| `Nexus.setWindowTitle(title)` | string | `Promise<boolean>` | |
| `Nexus.openUrl(url)` | string | `Promise<boolean>` | `window.open(url,'_blank')`，非用户手势下可能被弹窗拦截 |
| `Nexus.on(name, cb)` | string, function | `undefined` | `cb(detail)` **直接拿到 payload**；无退订返回，长期页面建议直接 `addEventListener('nexus:*')` |

#### 2.4.2 `_app.js` 追加（`apps/_app.js:357` 起）

| 方法 | 说明 |
|---|---|
| `Nexus.ready(fn)` / `Nexus.whenReady(fn)` | 上下文就绪后执行，幂等；`fn(ctx)` |
| `Nexus.getLanguage()` | 当前语言，如 `zh-CN` / `en-US` |
| `Nexus.onLanguageChange(cb)` | 语言切换回调 |
| `Nexus.applyLanguage()` | 把 `APP_I18N` 应用到 `[data-i18n*]` 元素 |
| `Nexus.t(key)` | 按 `APP_I18N` 取词，回退链：当前语言 → en → zh → 原 key |
| `Nexus.getGlass()` | 当前生效玻璃参数对象 |
| `Nexus.onGlassChange(cb)` | 玻璃参数变化回调 |

> `_app.js` 还负责自动注入 FangUI CSS、`_polish.css`、Font Awesome，并把宿主主题落实到 `body.dark-mode` / `html[data-mode]`。

### 2.5 宿主 → 应用事件一览

| 事件名 | payload | 触发点 | 源码 |
|---|---|---|---|
| `nexus:ready` | 初始化上下文 | iframe 收到 `__nexusInit` | `apps/_bridge.js:29` |
| `nexus:theme` | `{ dark:boolean, perf:boolean }` | 深浅色 / 性能模式切换 | `Nexus OS 26.html:29882` |
| `nexus:fuistyle` | `{ style:'flat'\|'neu-solid'\|'neu-glass'\|'liquid' }` | FangUI 风格切换 | `Nexus OS 26.html:28498` |
| `nexus:language` | `{ lang:'zh-CN'\|'en-US'\|'ru-RU'\|'ja-JP'\|'ko-KR' }` | 语言切换 | `Nexus OS 26.html:29892` |
| `nexus:glass` | `{ material, blur }`（宿主只广播这两个） | 玻璃材质/模糊变化 | `Nexus OS 26.html:40835` |
| `nexus:dockbar` | `{ type:'tile'\|'button', index:number, id?:string }` | 用户点了 Dock Bar | `Nexus OS 26.html:30341` |
| `nexus:recordings` | `{}` | 录屏结束、文件已落盘 | `Nexus OS 26.html:30009` |

示例（事件订阅 + 主题跟随）：

```js
// 推荐：可直接拿到退订能力
const off = (() => {
  const h = (e) => document.body.classList.toggle('dark-mode', !!e.detail.dark);
  window.addEventListener('nexus:theme', h);
  return () => window.removeEventListener('nexus:theme', h);
})();
```

### 2.6 宿主处理器目录（`Nexus.call` 可直达）

全部在 `Nexus OS 26.html:29595` 起的 `handlers` 对象里。

| 方法 | 参数 | 返回 | 能力 | 状态 |
|---|---|---|---|---|
| `getApps` | — | `[{id,name,icon,iconImage,category,installed}]` | 应用清单 | ✅ |
| `getUserLS` | `key` | any / `null` | 用户级存储读 | ✅（敏感 key 屏蔽） |
| `setUserLS` | `key, value` | boolean | 用户级存储写 | ✅（敏感 key 拒绝） |
| `getLS` / `setLS` | `key[, value]` | any / boolean | 全局存储 | ✅（敏感 key 屏蔽） |
| `getUser` | — | `{name,role,avatar}` | 当前用户 | ✅ |
| `getSettings` | — | object | 已过滤壁纸与 data URL | ✅ |
| `getContext` | — | object | 窗口上下文 + 过滤后设置 | ✅ |
| `getDesktopState` | — | `{windows[],vw,vh,dark,wallpaper,user}` | 桌面快照（窗口几何/标题/层级），不含窗口内容 | ✅ |
| `notify` | `title, body, type` | true | 系统通知 | ✅（有 XSS 风险，见 §8） |
| `openApp` | `appId` | true | 打开应用 | ✅ |
| `closeWindow` | —（用请求里的 `windowId`） | true | 关自己 | ✅ |
| `minimizeWindow` | —（同上） | true | 最小化自己 | ✅ |
| `setWindowTitle` | `title` | true | 改窗口标题 | ✅ |
| `openUrl` | `url` | true | 新标签打开 | ✅ |
| `getWallpaper` | — | url 或 `''` | 当前壁纸；用户上传的 `data:`/`blob:` 一律返回空 | ✅ |
| `setAccentColor` | `color` | true | 改系统主题色 | ✅ |
| `osAction` | `'reboot'\|'shutdown'\|'sleep'` | true | 电源动作 | ✅ |
| `osControl` | `action, params` | 见下 | `openApp` / `closeWindow` / `toggleStartMenu` / `getSetting` / `setSetting` / `power` | ✅ |
| `dockbar` | `{action:'show'\|'update'\|'hide', spec}` | boolean | Touch Bar | ✅ |
| `getProcesses` | — | `[窗口信息]` | 真实打开窗口列表 | ✅ |
| `takeScreenshot` | `'full'\|'selection'\|'toolbar'` | true | DOM 截图 | ⚠️ 受限 |
| `startRecording` / `stopRecording` / `getRecordingState` | — | boolean / `{recording,paused,elapsed}` | 录屏 | ⚠️ 受限 |
| `getAIApis` | — | `[{id,name,url,model,hasKey,active}]` | 列出 AI 配置（不含密钥） | ✅ |
| `setActiveAIApi` | `id` | boolean | 切换当前 AI | ✅ |
| `addAIApi` | `{name,url,model,key}` | item | 新增 AI 配置 | ✅ |
| `removeAIApi` | `id` | boolean | 删除（`oobe_default` 不可删） | ✅ |
| `aiChat` | `messages[], {maxTokens,temperature}` | `Promise<{text,raw}>` | **宿主代理调用 AI，密钥不出宿主** | ✅ |
| `sendSystemMessage` | `title, body, type` | true | 系统消息（等同 notify） | ✅ |

`osControl` 细分（`Nexus OS 26.html:29794`）：

```js
Nexus.call('osControl', 'openApp', { appId: 'files' });
Nexus.call('osControl', 'getSetting', { key: 'fanguiStyle' });
Nexus.call('osControl', 'setSetting', { key: 'fanguiStyle', value: 'flat' });
Nexus.call('osControl', 'power', { action: 'sleep' });
```

> `setSetting` 会直接写 `settings` 并触发 `applyUserSettings()`，**不经过敏感字段过滤**，属于高权限写操作；`getSetting` 同样直接读原始 `settings`（含壁纸 data URL），**不走** `getSettings` 的过滤。另注意：`osControl` 的电源动作名是 `restart`，`osAction` 的对应名才是 `reboot`。

### 2.7 CSS / DOM 契约（跟随宿主外观）

`_app.js` 会把这些状态落到你的 iframe：

| 位置 | 值 | 含义 |
|---|---|---|
| `body.dark-mode` | 有/无 | 深色模式 |
| `body.perf-mode` | 有/无 | 性能模式 |
| `body.mat-liquid` / `mat-frost` / `mat-mica` / `mat-solid` | 类名 | 玻璃材质 |
| `html[data-mode]` | `light` / `dark` | FangUI 模式 |
| `html[data-ui]` | `flat` / `neu` / `liquid` | FangUI 风格 |
| `html[data-neu]` | `solid` / `glass` | 新拟态子风格 |
| `html[data-glass]` | 材质名 | 玻璃材质 |
| `html[data-lang]` | `zh-CN` 等 | 当前语言 |

可用 CSS 变量（由 `_app.js:204` 写入 `:root`）：`--glass-blur`、`--n26-blur`、`--n26-glass-alpha`、`--n26-glass-sat`、`--n26-glass-hi`、`--n26-refr`、`--n26-noise`、`--n26-k`、`--n26-sat-k`、`--n26-alpha-k`。

多语言约定（`apps/_app.js:117`）：

```js
window.APP_I18N = {
  zh: { 'hello': '你好' },
  en: { 'hello': 'Hello' }
};
```

```html
<span data-i18n="hello"></span>
<input data-i18n-placeholder="search">
<button data-i18n-title="tip"></button>
```

### 2.8 可直接复制的应用骨架

来自官方模板 `apps/_template.html`（已精简）：

```html
<!DOCTYPE html>
<html lang="zh-CN" data-ui="liquid" data-mode="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>我的应用</title>
  <link rel="stylesheet" href="../ui/tokens.css">
  <link rel="stylesheet" href="../ui/glass.css">
</head>
<body>
  <div id="app"></div>

  <script src="../ui/motion.js"></script>
  <script src="_bridge.js"></script>
  <script src="_app.js"></script>

  <script>
  (function () {
    'use strict';
    const app = document.getElementById('app');

    Nexus.ready(function (ctx) {
      // ctx = { windowId, user:{name,role,avatar}, settings, dark, osStyle, language, glass }
      app.innerHTML = '<button id="hi">发通知</button>';

      document.getElementById('hi').onclick = async () => {
        await Nexus.notify('我的应用', '来自第三方应用的通知', 'success');
      };

      // 存储：一定走 Nexus，按用户隔离
      Nexus.getUserLS('myapp_counter').then(v => console.log('计数', v || 0));
      Nexus.setUserLS('myapp_counter', 1);
    });
  })();
  </script>
</body>
</html>
```

登记两行即可被 `openApp('myapp')` 打开：

```js
appRegistry['myapp'] = { name: '我的应用', icon: 'fa-cube', color: '#60a5fa', defaultWidth: 720, defaultHeight: 480 };
window.IFRAME_APPS['myapp'] = 'apps/myapp.html';
```

### 2.9 Dock Bar 示例

```js
// 推送一条工具条（只有当前窗口能更新/隐藏）
await Nexus.call('dockbar', {
  action: 'show',
  spec: {
    title: '我的应用',
    tiles: [
      { id: 'a', label: '项目 A', icon: 'fa-folder', active: true },
      { id: 'b', label: '项目 B', icon: 'fa-folder' }
    ],
    buttons: [
      { id: 'run', label: '运行', icon: 'fa-play', accent: true },
      { id: 'rec', label: '录制', icon: 'fa-circle', rec: true }
    ],
    text: '就绪'
  }
});

Nexus.on('dockbar', (e) => {
  // e = { type:'tile'|'button', index, id }
  console.log(e.type, e.index, e.id);
});
```

`spec` 字段定义在 `Nexus OS 26.html:30178`；全屏时 `show` 返回 `false`（`Nexus OS 26.html:30212`）。`update` / `hide` 会校验 owner（非 owner 返回 `false`，但 owner 为空时任何窗口都能改），且 owner 由请求里的 `windowId` 决定，可伪造（见 §8.4）。

### 2.10 应用侧安全边界（务必读）

桥的安全层在 `Nexus OS 26.html:29559`：

```js
N26_BRIDGE_SECRET_KEYS = {
  ai_config, ai_providers, ai_active,
  accounts, accountSession, nexus_accounts, n26_account
};
N26_BRIDGE_SECRET_FIELDS = {
  customWallpaper, lockscreenCustomWallpaper, lockWallpaperCustom,
  wallpaperData, customLockWallpaper
};
```

- 上述 key 通过 `getUserLS` / `getLS` 读会得到 `null`，写会得到 `false`；
- `settings` 里的壁纸类字段和大 `data:` URL 会被剔除，只留 `customWallpaperType:'custom-image'`；
- 但**没有任何来源校验**：主壳的消息监听（`Nexus OS 26.html:29847`）不检查 `e.origin`，也不验证消息是否来自某个 `app-iframe`；
- `windowId` 由 iframe 自己填（`apps/_bridge.js:44`），主壳直接信任它执行 `closeWindow` / `minimizeWindow`；
- 因此：**应用之间没有强隔离**，恶意 iframe（或嵌入了不可信第三方网页的应用）可以伪造 `windowId` 关别人的窗口、读别人的公开存储。文档如实标注，不粉饰。

---

## 3. 通道 B：宿主侧（外部页面 / 伪系统驱动 Nexus）

### 3.1 先说结论

- **没有**跨源远程控制 API；
- 主壳**没有**监听父页面指令的协议（全文件无 `window.parent` / `window.top` 逻辑）；
- 主壳的 `window.Nexus` 只有 `frost` / `unfrost`（`Nexus OS 26.html:52361`），不是应用侧那套桥 API；
- 唯一正式的外部唤起手段是 URL 深链 `?app=`。

所以「别家的伪系统想远程控制 Nexus」目前只能做到「打开某个应用」，做不到「远程开窗、读窗口状态、注入数据」。

### 3.2 同源嵌入时可直接调用的主壳全局函数

主壳脚本是经典脚本，下列顶层函数实际挂在 `window` 上（**非正式承诺 API，升级可能变**）：

| 函数 | 签名 | 行为 | 源码 |
|---|---|---|---|
| `openApp` | `openApp(appId)` | 打开/切换应用 | `Nexus OS 26.html:30345` |
| `closeWindow` | `closeWindow(id)` | 关窗口 | `Nexus OS 26.html:31496` |
| `minimizeWindow` | `minimizeWindow(id)` | 最小化 | `Nexus OS 26.html:31696` |
| `toggleMaximize` | `toggleMaximize(id)` | 最大化/还原 | `Nexus OS 26.html:31836` |
| `showNotification` | `showNotification(title, body, type)` | 系统通知 | `Nexus OS 26.html:33314` |
| `setAccentColor` | `setAccentColor(color)` | 主题色 | `Nexus OS 26.html:41898` |
| `setFanguiStyle` | `setFanguiStyle(style)` | 切换 FangUI 风格 | `Nexus OS 26.html:28489` |
| `getCurrentLanguage` | `getCurrentLanguage()` | 当前语言 | `Nexus OS 26.html:42188` |
| `n26ToggleFullscreen` | — | 全屏切换 | `Nexus OS 26.html:30113` |
| `window.Nexus.frost` / `unfrost` | `(selectorOrEl)` | 给面板加/去毛玻璃类 | `Nexus OS 26.html:52361` |
| `window.N26Frost.applyAll` | — | 给全部预设面板加毛玻璃 | `Nexus OS 26.html:52353` |

只能在**同源**下使用（`iframe.contentWindow.openApp(...)`，或把 Nexus 页与你的页放在同一 origin）。跨源时浏览器直接拒绝属性访问。

> 如果要在生产环境依赖这些函数，请先与维护方确认；本文只记录它们当前真实存在。

### 3.3 深链与外部唤起

| URL 形式 | 行为 | 源码 | 状态 |
|---|---|---|---|
| `Nexus OS 26.html?app=<appId>` | 进入桌面后延时 900ms `openApp(appId)` | `Nexus OS 26.html:27556` | ✅ |
| `…?app=necta&join=<连接码>` | 连接码透传给 `apps/necta/index.html` | `Nexus OS 26.html:31278` | ✅ |
| `…?diskUpdated=true` | 安装器/PE 回写磁盘列表后刷新并清参数 | `Nexus OS 26.html:59147` | ✅（系统内部用） |
| `apps/floatapp/index.html?pkg=<包id>` | 受限框架按包 id 启动 CW 应用 | `apps/floatapp/index.html:167` | ✅（内部） |
| `…?theme=dark` | **主壳不读**；只有部分单页应用自己读 | 见下 | ⚠️ 非 shell 能力 |
| `…?tab=<id>` | **未实现**，没有任何代码读取 | — | ❌ |

`openApp` 的真实语义（`Nexus OS 26.html:30432`）：

```js
const existing = windows.find(w => w.appId === appId);
if (existing) {
  if (existing.state === 'minimized') {
    restoreWindow(existing.id);
  } else {
    const topWin = windows.slice().sort((a, b) => b.zIndex - a.zIndex)
      .find(w => w.state !== 'minimized');
    if (topWin && topWin.id === existing.id) minimizeWindow(existing.id);
    else focusWindow(existing.id);
  }
  return;              // ← 没有返回值
}
```

- 已打开且是焦点窗口 → **会被最小化**（切换语义）；
- 已打开但在后台 → 聚焦；
- 新开窗口才有 id 返回，且只有 `browserUrl` 分支返回 id（`Nexus OS 26.html:30428`）；
- `ide` / `nexw` / `devstudio` 会重定向到 `float`，`sandbox` 重定向到 `vm`（`Nexus OS 26.html:30348`）；
- 安全模式与禅模式下会被拦截并提示（`Nexus OS 26.html:30365`）。

各应用自己的 `?theme=` 参数（只影响该应用，不影响系统）：

| 应用 | 参数 | 源码 |
|---|---|---|
| calculator | `?theme=dark\|light` | `apps/calculator.html:15` |
| image | `?theme=` | `apps/image.html:10` |
| map | `?theme=` | `apps/map.html:1074` |
| music | `?theme=` / `?player=1` | `apps/music.html:2211` |
| quicknote | `?theme=` | `apps/quicknote.html:1700` |
| video | `?theme=` | `apps/video.html:2684` |
| weather | `?theme=` | `apps/weather.html:3494` |
| bili | `?theme=` | `apps/bili.html:1862` |

### 3.4 嵌入建议

- 同源嵌入：可以显示 + 调 §3.2 全局函数，但**没有事件回调**（主题/窗口变化不会通知你的页面），只能轮询；
- 跨源嵌入：可以显示，不能控制；
- **不要把 Nexus 嵌进不可信页面**：主壳接受任意来源的 `__nexusReq`（见 §2.10），嵌入方可以读设置、读用户存储、开关窗口、触发关机。

---

## 4. UI 组件与手势总线

### 4.1 N26UI（侧栏 / Tab 壳）

源码 `ui/n26-ui.js:315`，样式需自行引入 `ui/n26-ui.css`。

```js
N26UI.createShell(document.getElementById('app'), {
  sidebar: [
    { id: 'home', icon: 'fa-house', label: '首页', content: '<div>内容</div>' },
    { id: 'set',  icon: 'fa-gear',  label: '设置', render: () => document.createElement('div') }
  ],
  defaultId: 'home',
  onSelect: (id) => console.log(id)
});
```

返回对象（`ui/n26-ui.js:291`）：

| 成员 | 类型 | 说明 |
|---|---|---|
| `el` | HTMLElement | 根节点 `.n26ui-shell` |
| `nav` / `content` | HTMLElement | 侧栏 / 内容容器 |
| `select(id)` | function | 切换选中项 |
| `getActive()` | function | 当前 id |
| `setCollapsed(bool)` / `isCollapsed()` | function | 折叠态 |
| `destroy()` | function | 卸载并移除节点 |

挂载完成会派发 `n26ui:mounted`（`ui/n26-ui.js:287`）。传空 `sidebar` 或缺挂载点会抛错（`ui/n26-ui.js:71`）。

### 4.2 N26Gestures（手势总线）

源码 `ui/n26-gestures.js:1148`，`window.N26Gestures`。

| 成员 | 说明 |
|---|---|
| `version` | 模块版本 |
| `config()` | 返回当前配置副本 |
| `configure(patch)` | 改配置，`{persist:true}` 写入用户存储 |
| `on(type, fn)` | 订阅，**返回退订函数** |
| `off(type, fn)` | 退订 |
| `intercept(type, fn)` | 拦截系统默认动作，`fn` 返回 `true` 表示已消费 |
| `emit(type, detail)` | 手动派发，返回监听器数量 |
| `simulate(type, detail)` | 无监听时执行默认动作 |
| `debug(bool)` / `state()` | 调试日志 / 内部状态快照 |
| `enableDrag(el, opts)` | 拖动增强，返回 `{destroy()}` |
| `resetPinch()` | 清多指状态 |
| `detectKind(e)` | 判定 `trackpad` / `mouse` |
| `reduced()` | 是否减弱动效 |
| `pause()` / `resume()` | 暂停/恢复 |
| `window.n26GesturesStart()` / `Stop()` | 开关（`ui/n26-gestures.js:1199`） |

事件与载荷：

| 事件 | 载荷 |
|---|---|
| `scroll` / `scrollend` | `{el,x,y}`（`scroll` 高频，不跨 iframe） |
| `bounce` | `{el,edge}` |
| `pinch` | `{target,mode,factor,applied,cx,cy}` |
| `pinchend` | `{target,scale}` |
| `pinchnone` | `{}` |
| `swipe3` | `{direction,dx,dy,dt}` 或 `{direction,source:'iframe'}` |
| `edge` | `{side,dx,dy}` 或 `{side,source:'iframe'}` |
| `dragstart` / `drag` / `dragend` / `drop` | `{el,target,dx,dy,canceled}` |

`enableDrag` 选项（`ui/n26-gestures.js:841`）：`threshold`、`hold`、`handle`、`axis`、`dropSelector`、`ghost`、`onStart`、`onMove`、`onEnd`。

**重要限制**：

1. 主壳**没有引入** `ui/n26-gestures.js`（全文件搜不到该脚本引用），只有 `bili` / `image` / `quicknote` / `weather` 等应用自行引入；
2. 因此 iframe 应用里 `parent.postMessage({__nexusGesture})` 的回传（`ui/n26-gestures.js:157`）**当前没有宿主消费者**，手势导航不会生效；
3. 模块的 `scanFrames` 会向同源 iframe 注入脚本（`ui/n26-gestures.js:791`），跨域 iframe 注入失败，属预期；
4. 结论：`N26Gestures` 目前是「应用内可用的独立手势库」，不是已接通的系统级手势服务。**未接入**（状态：半成品）。

### 4.3 n26-switch.js

纯样式增强（把 `input[type=checkbox]` 渲染成开关），**不暴露任何 JS API**，不构成对外接口。

---

## 5. 通道 C：本地桥 REST（读取真实磁盘）

### 5.1 定位

`nexus-bridge.ps1` / `nexus-bridge.py` 在 `127.0.0.1:8899` 提供**只读** HTTP 接口，让网页版 Nexus 浏览本机真实磁盘。

启动：双击 `启动本地桥-Start-Bridge.bat`（内部执行 `powershell -File nexus-bridge.ps1 8899`）。

边界：

- 只监听回环地址 `127.0.0.1`（`nexus-bridge.ps1:31`）；
- **只支持 GET/OPTIONS**，其它方法一律 `403 only GET is supported`（`nexus-bridge.ps1:150`）；
- 无 Token、无鉴权；CORS 是 `*`（`nexus-bridge.ps1:86`），**本机任意网页都能读**；
- 建议用 `http://127.0.0.1` 或 https 打开 Nexus；`file://` 下 IndexedDB / File System Access 会失效，访问本机桥也容易被浏览器拦（`Nexus OS 26.html:26517`、`60462`）；
- 跳过以 `.` / `$` 开头的文件项（`nexus-bridge.ps1:179`）。

### 5.2 端点

| 方法 | 路径 | 参数 | 成功响应 | 失败 |
|---|---|---|---|---|
| GET | `/api/ping` | — | `{ok:true, bridge:'nexus-bridge-ps', version:1}` | — |
| GET | `/api/roots` | — | `{roots:[{name,path,ok}]}` | — |
| GET | `/api/ls` | `path` | `{path, entries:[{name,isDir,size,mtime}]}` | `400 missing path` / `404 not a directory` / `403 permission denied` |
| GET | `/api/read` | `path` | `{path, text, encoding}` | `404` / `413 file too large for text view` / `415 binary file, use /api/file` |
| GET | `/api/file` | `path` | 原始字节，带 MIME | `404` / `413 file too large` |
| OPTIONS | 任意 | — | `200` 空体 | — |
| 其它方法 | 任意 | — | — | `403` |

限制：文本最大 4 MB（`nexus-bridge.ps1:27`），原始文件最大 64 MB（`nexus-bridge.ps1:28`）。文本依次尝试 UTF-8 / UTF-16 / GB18030（`nexus-bridge.ps1:198`）。

### 5.3 示例

```bash
curl "http://127.0.0.1:8899/api/ping"
curl "http://127.0.0.1:8899/api/roots"
curl "http://127.0.0.1:8899/api/ls?path=C%3A%5C"
curl "http://127.0.0.1:8899/api/read?path=C%3A%5CWindows%5Cwin.ini"
curl -o out.png "http://127.0.0.1:8899/api/file?path=C%3A%5Cpic.png"
```

```js
const res = await fetch('http://127.0.0.1:8899/api/ls?path=' + encodeURIComponent('C:\\'));
const data = await res.json();
console.log(data.entries.filter(e => e.isDir));
```

### 5.4 写操作

**没有写接口**。`POST` / `PUT` / `DELETE` 全部 403。Nexus 自身只提供「读真实磁盘」；应用若要写真实磁盘，只能走浏览器的 File System Access API 并请用户手动授权（该能力不属于 Nexus 接口，也不保证在所有环境可用）。

---

## 6. 通道 D：云端 API v1

一句话：**这是应用商店的开放 API**（开发者上传/发版、客户端拉列表/检查更新/下载），完整规范见 [`docs/Nexus-Cloud-API.md`](../docs/Nexus-Cloud-API.md)，机器可读定义见 [`docs/openapi.json`](../docs/openapi.json)。

Base URL：`https://ai.fanggame.company/api/v1`

### 6.1 外部应用接进来需要这几步

1. **拿开发者身份**：开发者账号目前**只能由平台管理员创建**（`POST /admin/developers`，需 `X-N26-Admin`，`docs/Nexus-Cloud-API.md:626`）。外部开发者需要联系运营开通，拿到 `n26_...` Token。
2. **创建应用**：`POST /dev/apps`（scope `app:write`）→ 得到 `appId`。
3. **上传版本包**：`POST /dev/apps/{appId}/releases`（multipart，`file` 或 `files` + `manifest`，`docs/Nexus-Cloud-API.md:544`）。
4. **提交审核**：`POST /dev/releases/{releaseId}/submit`；审核接口在 `/admin/reviews/*`。
5. **客户端接入**（公开，无需 Token）：
   - 列表：`GET /apps`、`GET /search`、`GET /rankings`、`GET /categories`
   - 详情：`GET /apps/{appId}`、`GET /apps/{appId}/versions`
   - 更新：`GET /apps/{appId}/updates?version=&channel=`
   - 下载：`GET /download/{releaseId}`（支持 `Range` 断点续传）

```js
// 公开拉列表，不需要任何 Token
const r = await fetch('https://ai.fanggame.company/api/v1/apps?category=tools&page=1&page_size=20');
const { items } = await r.json();
```

```bash
# 开发者上传（示例）
curl -X POST "https://ai.fanggame.company/api/v1/dev/apps/com.example.app/releases" \
  -H "Authorization: Bearer n26_xxx" \
  -F "file=@app.zip" \
  -F "channel=stable" \
  -F "release_notes=首个版本"
```

### 6.2 与客户端的关系

- CORS：v1 响应在 Worker 入口统一加头，默认 `Access-Control-Allow-Origin: *`（`server/src/index.js`），浏览器可直接调用；
- 主壳商店当前仍走旧接口 `/api/store/*`（`Nexus OS 26.html:49979`），v1 是并行的新契约；
- **重要不匹配**：v1 允许上传 `.html` 单文件与 `.zip`（`docs/Nexus-Cloud-API.md:550`），但客户端安装后统一写进 `n26SelfPub` 并交给 `apps/floatapp`（`Nexus OS 26.html:50508`、`49947`），而 `floatapp` **只执行 CW Script**（`apps/floatapp/index.html:106`）。因此 HTML/zip 包能上传、能过审、能下载，**但当前客户端跑不起来**。

---

## 7. 状态总表

| 能力 | 状态 | 依据 |
|---|---|---|
| iframe 应用 `Nexus.*` 全量调用 | ✅ 已支持 | `apps/_bridge.js:49`、`Nexus OS 26.html:29595` |
| 主题 / 风格 / 语言 / 玻璃事件订阅 | ✅ 已支持 | `29882` / `28498` / `29892` / `40835` |
| Dock Bar | ✅ 已支持 | `30178`、`30340` |
| 桌面快照 `getDesktopState` | ✅ 已支持 | `29621` |
| AI 宿主代理 `aiChat` | ✅ 已支持 | `29761` |
| `?app=` 唤应用 | ✅ 已支持 | `27556` |
| 本地桥只读文件接口 | ✅ 已支持 | `nexus-bridge.ps1:159` |
| 云端 v1 列表/更新/下载 | ✅ 已支持 | `docs/Nexus-Cloud-API.md:263` |
| 同源嵌入驱动全局函数 | ⚠️ 可用但非承诺 | §3.2 |
| 截图 | ⚠️ 仅 DOM，跨源失败 | `57390` |
| 录屏 | ⚠️ 需授权，iframe 内受限 | `30028`、`31286` |
| 手势总线跨 iframe 导航 | ⚠️ 半成品，宿主未接入 | `ui/n26-gestures.js:157` |
| 自发布 CW 应用使用 `Nexus` 桥 | ⚠️ 沙盒无同源，拿不到 | `apps/floatapp/index.html:142` |
| shell 级 `?theme=` | ❌ 未实现 | 无读取代码 |
| `?tab=` 深链 | ❌ 未实现 | 无读取代码 |
| 跨源远程控制 / 嵌入 API | ❌ 未实现 | 无父页协议 |
| 本地桥写文件 | ❌ 未实现 | `nexus-bridge.ps1:150` |
| HTML/zip 云端包在客户端运行 | ❌ 未实现 | `apps/floatapp/index.html:106` |
| `apps/htmlapp` | ❌ 未被主壳引用 | 全文件无 `htmlapp` 引用 |

---

## 8. 已知缺陷与半成品（如实标注，本轮未改源码）

### 8.1 通知内容未转义 → 宿主域 XSS

`showNotification` 把 `title` / `body` 直接拼进 `innerHTML`（`Nexus OS 26.html:33324`）：

```js
notif.innerHTML = `
  <div class="notification-title">… ${title}</div>
  <div class="notification-body">${body}</div>`;
```

应用只要 `Nexus.notify('x', '<img src=x onerror=alert(1)>')`，脚本就在**主壳 origin** 执行。第三方应用可借此绕过全部沙箱边界。

### 8.2 初始化载荷绕过壁纸过滤

`getSettings` 走 `n26BridgeFilterSettings`（剔除 `customWallpaper` 等，`Nexus OS 26.html:29648`），但 iframe 初始化时下发的是**原始 settings**（`Nexus OS 26.html:31327` `settings: st`），同时 `_app.js` 的 `Nexus.context()` 也原样返回。结果是：用户上传的壁纸 `data:` URL 仍会进入每个 iframe，与 §2.10 的过滤意图矛盾。

### 8.3 商店管理员 Token 可被应用读取

`N26_BRIDGE_SECRET_KEYS` 没有包含 `n26StoreAdmin`（`Nexus OS 26.html:29559`），而它正是商店管理口令（`Nexus OS 26.html:49924`）。任意 iframe 一句 `Nexus.getUserLS('n26StoreAdmin')` 即可拿到。

### 8.4 postMessage 无来源校验、windowId 可伪造

主壳监听器（`Nexus OS 26.html:29847`）不看 `e.origin`，不看 `e.source` 是否为 `app-iframe`，直接执行 `handlers[method]`；`closeWindow` / `minimizeWindow` / `dockbar` 都使用请求自带的 `windowId`。任意子 frame、任意嵌入方都能操作窗口。`targetOrigin` 也一律 `'*'`（`apps/_bridge.js:45`）。

### 8.5 手势回传链路断在宿主

`ui/n26-gestures.js` 会把 iframe 手势 `postMessage` 给父窗口（第 157 行），但主壳没有引入该模块（`Nexus OS 26.html` 无 `n26-gestures.js` 引用），`__nexusGesture` 没有消费者。应用内 `N26Gestures.on()` 可用，系统级手势导航不生效。

### 8.6 截图不是系统截图

`takeScreenshot` → `captureScreenshot` 用 `html2canvas` 截 `#desktop`（`Nexus OS 26.html:57390`），参数含 `allowTaint:true`（`57402`）：

- 只能截 Nexus 自己的 DOM，截不到浏览器外部 / 其它应用；
- 跨源 iframe 会污染画布，`toDataURL` 抛 `SecurityError`，表现为「截图失败」；
- 不是操作系统级截图权限。

### 8.7 iframe 内录屏受限

`startScreenRecording` 先试 `getDisplayMedia`（`Nexus OS 26.html:30028`），但应用 iframe 的 `allow` 属性没有 `display-capture`（`31286`），且调用通常缺少用户手势，浏览器会拒绝；随后回退到 `nexusRecordSelf()`：`html2canvas` 抽帧 + `captureStream(3)`，约 3fps（`29980`），且同样受跨源画布污染影响。

### 8.8 云端 HTML/zip 包跑不起来

见 §6.2。`apps/htmlapp/index.html` 是 HTML 包的沙盒壳（`allow-scripts allow-forms allow-modals`，无同源），但主壳从未引用它；所有自发布/云端应用一律走 `floatapp`（`Nexus OS 26.html:49947`）。

### 8.9 若干小问题

| 问题 | 位置 | 影响 |
|---|---|---|
| `openApp` 新开窗口不返回 id（除 `browserUrl` 分支） | `30428` / `30445` | 调用方无法拿到新窗口 id |
| 已打开且在焦点时 `openApp` 会最小化 | `30437` | 与「打开」直觉相反 |
| `Nexus.on` 不返回退订函数 | `apps/_bridge.js:72` | 长生命周期页面会累积监听器 |
| `osControl setSetting` 不过滤敏感字段 | `29802` | 高权限写，任意 key |
| `osControl getSetting` 返回原始 `settings` | `29801` | 可绕过 `getSettings` 的壁纸过滤 |
| `getApps` 的 `category` 大多数应用未定义，落 `'other'` | `29608` | 分类展示会集中到 other |

---

## 9. 附录：速查

### 9.1 应用侧十行接入

```html
<script src="_bridge.js"></script>
<script src="_app.js"></script>
<script>
Nexus.ready(async (ctx) => {
  document.body.textContent = `你好，${ctx.user.name}`;
  await Nexus.notify('我的应用', '启动成功', 'success');
});
</script>
```

### 9.2 常用调用

```js
// 存储
await Nexus.setUserLS('pref', { theme: 'auto' });
const pref = await Nexus.getUserLS('pref');

// 窗口
await Nexus.setWindowTitle('我的应用 · 编辑中');
await Nexus.minimizeWindow();

// 打开系统应用
await Nexus.openApp('files');

// 读取桌面窗口（Necta 形态 B）
const state = await Nexus.call('getDesktopState');
console.log(state.windows.map(w => [w.appId, w.title, w.state]));

// AI（密钥不出宿主）
const r = await Nexus.call('aiChat', [{ role: 'user', content: '写一句欢迎语' }], { temperature: 0.5 });
console.log(r.text);

// 主题色
await Nexus.call('setAccentColor', '#4A9BF5');
```

### 9.3 文件与行号索引

| 内容 | 位置 |
|---|---|
| 应用注册表 `appRegistry` | `Nexus OS 26.html:29418` |
| iframe 应用表 `IFRAME_APPS` | `Nexus OS 26.html:29481` |
| 应用容器渲染 + 初始化下发 | `Nexus OS 26.html:31260`–`31332` |
| 宿主消息监听 + 回包 | `Nexus OS 26.html:29847`–`29874` |
| 桥安全层（敏感 key / 字段） | `Nexus OS 26.html:29553`–`29593` |
| 31 个宿主处理器 | `Nexus OS 26.html:29595`–`29846` |
| 主题 / 语言广播 | `Nexus OS 26.html:29877`–`29895` |
| Dock Bar 规范与渲染 | `Nexus OS 26.html:30154`–`30343` |
| `openApp` | `Nexus OS 26.html:30345` |
| 深链 `?app=` | `Nexus OS 26.html:27556` |
| 截图 | `Nexus OS 26.html:57376`–`57450` |
| 录屏 | `Nexus OS 26.html:29963`–`30049` |
| 本地桥端点 | `nexus-bridge.ps1:159`–`220` |
| 云端 v1 规范 | `docs/Nexus-Cloud-API.md` |
| 应用桥接 | `apps/_bridge.js:14`–`77` |
| 应用运行时 | `apps/_app.js:86`–`365` |
| UI 壳 | `ui/n26-ui.js:69`–`318` |
| 手势总线 | `ui/n26-gestures.js:1148`–`1200` |
