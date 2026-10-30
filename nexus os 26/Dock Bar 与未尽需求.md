# Nexus OS 26 · 明日工作计划（Dock Bar 与未尽需求）

> 本文档记录「今天最后一步」未做完、推迟到明天继续的需求。
> 目标：把 Nexus OS 26 从「能跑的伪系统」推进到「发布级、别人没有的差异化真系统」。
> 作者：小方工作室 · 助手
> 日期：2026-10-25 夜

---

## 一、本轮已交付（今晚补完的「剩下的那么一点点」）

| 应用 | 文件 | 状态 | 说明 |
|------|------|------|------|
| 虚拟机 | `apps/vm.html` | ✅ 已建 | 自包含：开机动画→桌面，内置便签/计算器/画图/文件盒，可拖入本地 `.html` 运行，**全部数据存内存、关闭即焚、与宿主完全隔离** |
| 桌面沙盒 | `apps/sandbox.html` | ✅ 已建 | 嵌套运行层：拖入 URL/HTML 在 `sandbox` 隔离 iframe 运行，关闭即焚，**与虚拟机信息不互通** |
| 开发者工坊 | `apps/devstudio.html` | ✅ 已建 | 模板/代码编辑器+实时预览/导入HTML/发布到本机（存 `userLS.devApps`）/我的作品运行·导出·卸载 |
| 小游戏合集 | `apps/games.html` | ✅ 已建 | 收录小方工作室「工具与小游戏」页 **45 款**游戏，搜索/分类/随机，点击在 iframe 打开对应 section |

> 这四个应用此前已在 `appRegistry` / `IFRAME_APPS` 注册但**文件缺失**（点开会白屏），今晚已补齐。
> 主文件已完成（前几轮）：Dock 四边摆放、锁屏 2.0（高斯模糊上滑/真实电量/通知中心）、截图录屏（真实捕获+存系统盘+File System Access 导出）、资源监视器（真实 API）。

---

## 二、Dock Bar（对标苹果 Touch Bar）—— 主体已落地，剩余见文末待办

### 2.0 今日已完成 ✅

| 项 | 实现位置 | 说明 |
|----|---------|------|
| `#dockBar` 容器 | 主文件 `#dock` 之后 | 位于 Dock 之上的空隙；默认隐藏，`.show` 才出现 |
| 四边 + 四风格 CSS | 主文件 dock CSS 内 | `body.dock-top/left/right` 变体；`html[data-ui=flat/neu/liquid]` 四套皮肤；左右时自动变竖向控制条 |
| 运行时 JS | `showDockBar` / `updateDockBar` / `setDockBarContent` / `hideDockBar` | 按 spec 渲染 `title / tiles / buttons / text` |
| 点击回传 | postMessage `__nexusEvt` | 瓦片/按钮点击 → 应用用 `Nexus.on('dockbar')` 接 `{type,index,id}` |
| 全屏即消失 | `fullscreenchange` + `webkitfullscreenchange` | 进入全屏立刻收起，连它占的区域一起让给应用 |
| 关闭回收 | `closeWindow()` | 拥有者窗口被关时自动收起 |
| 桥 API「dockbar」 | `installAppBridge.handlers` | `show / update / hide` + spec，第一方与第三方同一套 |
| AI 模块存储口径 | LS `ai_config` + `ai_providers` + `ai_active` | 兼容 OOBE 那份，AI 小方照常跟随；`ai_active` 记录当前切换 |
| 桥 API「AI」 | `getAIApis / addAIApi / removeAIApi / setActiveAIApi / aiChat` | **密钥不出宿主**：由宿主代理请求，第三方拿不到 Key |
| 桥 API「系统」 | `sendSystemMessage / osControl` | 发系统通知；开应用 / 改设置 / 电源等操控 |
| 桥异步升级 | message 监听器改 Promise 感知 | 支撑 `aiChat` 等异步能力（同步 handler 行为完全不变） |
| 设置 → 系统 → AI 模块 | `renderSettingsPanel` case 'system' | AI Switch 切换模型 + 增删 API + 一键测连通 |
| 第一方适配① | `apps/screenshot.html` | 录屏时 Dock Bar 显示红色计时 + 「截一张 / 停止」，点击可直接控制录屏 |

> 校验：主文件内联脚本 2 段语法 0 错误；`screenshot.html` 0 错误；grep 复核接线全部命中。

### 2.1 定位与形态
- **不在硬件上**，而是放在 **Dock 与浏览器/内容区下方的空隙**（即 Dock 之上的细条区域）。
- **非常驻**：只有「某些特殊场景」或「打开了支持 Dock Bar 的应用」时才出现；平时隐藏。
- **全屏即消失**：用户全屏时，连 Dock Bar 占据的那块区域也不出现（与 Dock 一起让位给应用）。
- 高度约 44–56px，贴合 Dock 所在边的视觉：底部时贴底、顶部时贴顶、左右时贴侧边。

### 2.2 四种 FangUI 风格统一适配
- `flat` / `neu-solid` / `neu-glass` / `liquid` 都必须长对。复用 `_app.js` 的 `data-ui/data-neu` 机制，Dock Bar 自身也消费 `--fu-*` 变量与 `--ease-*`。
- 玻璃质感随风格变化：liquid/neu-glass 用强磨砂，flat 用纯色，neu-solid 用实色微阴影。

### 2.3 系统 API（给第三方应用）
新增宿主桥方法（在 `installAppBridge` 的 `handlers` 里加）：
- `dockbar`：`Nexus.call('dockbar', {action:'show'|'update'|'hide'|'register', payload})`
  - `show(content)` / `update(content)` / `hide()`
  - `register(appId, descriptor)`：声明本应用支持 Dock Bar，并给默认内容
- `getAIApi`：返回 OOBE 设置的用户 AI API（key/base/模型）。**注意：本地优先、不回传云端**。
- `aiSwitch` / `getAIModels`：读取「设置→AI Switch」当前模型，列出可切换模型。
- `addAIApi`：用户在「AI 模块」里添加更多 API（多 key 轮询）。
- `sendSystemMessage(title, body, type)`：应用向系统发通知/状态条消息。
- `osControl(action, payload)`：操控系统功能（开关某开关、电源、打开应用、改设置等）。

### 2.4 第一方软件全适配（清单）
- **视频播放器**：Dock Bar 变**瓦片**（tiles）展示视频封面，可切换集数/章节；播放控制（播放/暂停/进度）也可进 Dock Bar。
- **音乐**：Dock Bar 展示当前专辑封面 + 播放/暂停/上一首/下一首。
- **截图录屏**：录屏中时 Dock Bar 常显红色录制条 + 暂停/停止。
- **资源监视器**：Dock Bar 显示实时 FPS/内存迷你条。
- **计算器/时钟/天气**：按需展示快捷信息。
- **方聊**（若先做）：Dock Bar 显示未读消息数 + 快捷回复。

### 2.5 实施步骤（建议）
1. 主文件加 `#dock-bar` 容器（4 边 CSS，跟随 `body.dock-*`），`showDockBar(html)` / `hideDockBar()` / `setDockBarContent(html)`。
2. 接管全屏逻辑：全屏时一并 `hideDockBar()`。
3. 桥加 `dockbar` / `getAIApi` / `aiSwitch` / `addAIApi` / `sendSystemMessage` / `osControl`。
4. 视频播放器 `apps/video.html` 接入瓦片（读当前视频封面+集数，调 `dockbar`）。
5. 其余第一方按 2.4 逐个接入。
6. 第三方示范：在「开发者工坊」模板里加一个「带 Dock Bar 的应用」模板，演示 `Nexus.call('dockbar', ...)`。

---

## 三、其余重大需求（按优先级）

### 3.1 应用界面大换血（极丰富，像真实应用）
- **所有** iframe 应用与内联应用统一补齐：空态/加载态/错误态、深浅色双套、滚动边界。
- 参考已完成的 `screenshot.html` / `monitor.html` 的卡片化 + 贝塞尔动效语言，统一迁移：
  - 文件管理器、设置、应用商店、天气、音乐、视频、相册、浏览器、终端、方聊……
- 每个应用加「信息密度」：侧边栏、状态栏、右键菜单、键盘快捷键提示。

### 3.2 小组件（Widgets）增加
- 桌面可放置：天气、时钟、资源监视迷你卡、待办、日历、音乐控制器、快捷开关。
- 新增 3–5 个新小组件，FangUI 四风格适配，拖拽摆放 + 长按编辑。

### 3.3 天气软件：真实天气 + 真实地址
- 接入真实天气 API（如和风/Open-Meteo，免 key 优先 Open-Meteo）。
- 按当前天气（晴/雨/雪/阴/夜晚）**动态改背景**（渐变/动效粒子）。
- 真实地址：首次询问定位（Geolocation API）或手动选城市；展示城市名、温湿度、风速、预报。

### 3.4 真实 C:/D: 盘访问（文件管理器）
- 首页新增「此电脑」：C 盘 / D 盘入口。
- **首次进入弹权限许可 + 隐私条款**（模态）：说明「仅本地读取、绝不上传」，勾选同意后才开放。
- 用 **File System Access API**（`window.showDirectoryPicker`）真实读写用户磁盘；不支持的环境给明确降级提示。
- 与系统自带「删除随便」的虚拟文件系统区分：真实磁盘删除走 3.5 的安乐程序。

### 3.5 系统删除 · 《三体》安乐程序
- **调用系统的真实删除**（真实 C:/D: 或关键系统文件）时，触发安乐程序：
  1. 屏幕变暗 + 庄严提示音/动效。
  2. 显示几个数字键（如「按 7 确认，其他数字取消」），**只接受指定数字，按其他数字一律拒绝**。
  3. 多次确认（建议 2–3 次不同数字）。
  4. 最后一次弹**免责声明**：「本人自愿删除，后果自负」，需再次按键确认。
  5. 全部通过才执行删除。
- **系统自带虚拟文件的删除仍是「随便删」**（不触发安乐程序），仅有别于「真实/关键删除」。

### 3.6 方聊 FangChat（最重要，需后端）
- 绑定 Nexus OS 账号；全局群聊 + 私聊。
- 加好友：**NEXUS OS 码**（类似好友码），对方申请需**本人同意**。
- 需后端：已存在 `server/` 目录（Cloudflare Workers 脚手架：README / src / wrangler.toml），继续完善：
  - 用户注册/登录（对接 Nexus OS 账号）、好友关系、消息收发（WebSocket 或轮询）、群聊。
  - 前端 `apps/fangliao.html`（已有壳 `renderFangLiaoApp`）接入后端 API。
- 方聊是**差异化王炸**（竞品伪系统都没有），优先保障。

### 3.7 虚拟机/沙盒/开发者工坊/小游戏 打磨
- 虚拟机：增加「把宿主机应用发送到虚拟机」的桥接（进阶）；更好的迷你应用。
- 沙盒：增加「示例外部应用」一键载入。
- 开发者工坊：发布的作品能真正出现在启动台/Dock（需宿主注册动态应用，明日评估）。
- 小游戏：处理 file:// 跨域 iframe 限制（提供「新窗口打开」兜底，已做）。

---

## 四、进度总览

### 已完成
- [x] `apps/vm.html` / `sandbox.html` / `devstudio.html` / `games.html` 创建且 JS 语法校验通过
- [x] 四个应用在 `appRegistry` / `IFRAME_APPS` 已注册、可在启动台打开
- [x] Dock Bar 容器 / 四边 / 四风格 CSS / 运行时 API
- [x] Dock Bar 桥 API + 点击回传 + 全屏消失 + 关闭回收
- [x] AI 模块（多 API 管理）+ AI Switch（切模型）+ 宿主代理 `aiChat`（密钥不外泄）
- [x] 系统 API：`sendSystemMessage` / `osControl`
- [x] 第一方适配示范：截图录屏（录屏倒计时 + 快捷按钮）

### 待办（下次继续）
- [ ] **第一方适配剩余**：视频播放器（瓦片封面+切换，用户点名要的）/ 音乐（播放控制）/ 资源监视器（迷你指标条）
- [ ] 开发者工坊新增「带 Dock Bar 的第三方应用」模板，示范 `Nexus.call('dockbar', …)` + `aiChat`
- [ ] 应用界面大换血（空态/加载/错误态 + 深浅色双套 + 滚动边界，全部应用统一）
- [ ] 小组件增加 3–5 个（天气/时钟/资源/待办/音乐控制器）
- [ ] 天气：真实天气 API + 背景随天气变 + 真实地址
- [ ] 文件资源管理器：真实 C:/D: 盘（File System Access API）+ 首次权限许可 + 隐私条款
- [ ] 《三体》安乐程序删除确认（多次数字按键 + 免责声明；系统自带虚拟文件仍可随便删）
- [ ] 方聊 FangChat 后端（server/ Cloudflare Workers）+ 前端接入（差异化王炸）

## 五、API 接入清单（源自 ../API文档大全.md，2026-10-26 盘点）

### 已接 ✅
| API | 来源章节 | 接到哪 |
|-----|---------|--------|
| AI Chat（OpenAI 兼容 /chat/completions） | 用户 OOBE 配置 + AI 模块 | 桥 `aiChat`（宿主代理，密钥不出系统）+ 设置 AI 模块 UI |
| 通知 API | 浏览器原生 | 桥 `sendSystemMessage` → 系统通知中心 |
| 系统 API（第二部分 13–27 章） | 浏览器原生 | 已用：文件系统/剪贴板/通知/存储/全屏/媒体设备（截图录屏、监视器）；桥 `osControl` 操控层 |

### 待接（按价值排序，均已在文档中定位章节）
| API | 章节 | 接到哪 | 说明 |
|-----|------|--------|------|
| **天气 API** | §36 | 天气应用大改 | Open-Meteo 完全免费无 key（国际）+ 和风/彩云（国内，需 key）；配合 IP 定位 free-api #670；**背景随天气变 + 真实地址**（原计划 3.3） |
| **B站 API** | §42 + bili-apis-master/ | B站应用/方影升级 | 本地已有 321 个文件的完整 proto/md 文档，搜索/视频流/直播/弹幕均可接 |
| **音乐 API** | §74–80 | 音乐应用升级 | 网易云/QQ音乐/酷狗 + §80 有"伪系统音乐播放器完整集成方案"现成方案；**版权敏感，建议你来定接哪家** |
| **新闻 API**（含 CCTV 央视） | §35 | 新增"新闻"应用或桌面小组件 | 免费源多 |
| **地图/导航 API** | §40/41 | 新增"地图"应用 | 高德/百度需 key；OpenStreetMap 免费 |
| **外卖/电商/Office** | §37/38/39 | 低优先 | 多为第三方 free-api，稳定性一般 |
| **N聊 API（方聊后端！）** | §1–12 | 方聊 FangChat | **MXOS 账户 API + N聊 Worker REST + WebSocket + 好友/消息/认证全套规范已在文档里**——这就是方聊后端的实现蓝本，Cloudflare Workers 按 §3 建 |
| **AI Agent 架构** | §51 | AI 小方 Agent 化 | 架构图 + 选型（MCP/插件管理器）已给出，配 harness 与审批流 |

### 分工建议（等你拍板）
- **我来接**：天气（Open-Meteo 无 key 先跑通）、新闻、地图（OSM）、B站、N聊后端、AI Agent harness
- **建议你来定/你来搞**：音乐 API（版权与音源选型）、国内天气源 key（和风/彩云，需注册）、电商/外卖类（数据源稳定性你把关）

---

> 设计铁律（沿用）：一切动画非线性（`--ease-*`）；玻璃克制+强磨砂；不露馅（空/错/深浅色）；存储走 `Nexus.getUserLS/setUserLS`；第一方/第三方风格统一四套。
