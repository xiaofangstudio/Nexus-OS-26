# API 文档大全（完整版）

> 整理时间：2026年9月1日  
> 数据来源：MDN Web Docs | N聊项目文档 | public-apis (GitHub) | free-api (GitHub) | 各平台官方开发者文档  
> 本目录已包含 public-apis-master/ 和 free-api-master/ 解压文件，可离线查阅

---

## 目录

### 第一部分：N聊 项目 API（内部接口）
- [1. N聊 项目概述](#1-n聊-项目概述)
- [2. MXOS 账户 API](#2-mxos-账户-api)
- [3. N聊 Worker REST API](#3-n聊-worker-rest-api)
- [4. WebSocket API](#4-websocket-api)
- [5. 认证机制](#5-认证机制)
- [6. 数据模型](#6-数据模型)
- [7. 前端状态管理](#7-前端状态管理)
- [8. 前端函数 API](#8-前端函数-api)
- [9. 前端组件与事件](#9-前端组件与事件)
- [10. 项目文件结构](#10-项目文件结构)
- [11. 构建脚本](#11-构建脚本)
- [12. 设计规范](#12-设计规范)

### 第二部分：Web 浏览器 API（伪系统核心能力）
- [13. 文件系统 API](#13-文件系统-api)
- [14. 摄像头与媒体设备 API](#14-摄像头与媒体设备-api)
- [15. 键盘与输入 API](#15-键盘与输入-api)
- [16. 剪贴板与选择 API](#16-剪贴板与选择-api)
- [17. 通知与推送 API](#17-通知与推送-api)
- [18. 系统信息与设备 API](#18-系统信息与设备-api)
- [19. 定位与传感器 API](#19-定位与传感器-api)
- [20. 语音与音频 API](#20-语音与音频-api)
- [21. 图形与渲染 API](#21-图形与渲染-api)
- [22. 窗口与屏幕管理 API](#22-窗口与屏幕管理-api)
- [23. 网络与通信 API](#23-网络与通信-api)
- [24. 存储与数据库 API](#24-存储与数据库-api)
- [25. 安全与认证 API](#25-安全与认证-api)
- [26. 拖拽与手势 API](#26-拖拽与手势-api)
- [27. 其他实用 API](#27-其他实用-api)

### 第三部分：第三方平台 API（常用软件集成）
- [28. 电商平台](#28-电商平台)
- [29. 短视频与直播](#29-短视频与直播)
- [30. 社交平台](#30-社交平台)
- [31. 外卖与生活服务](#31-外卖与生活服务)
- [32. 其他平台](#32-其他平台)

### 第四部分：浏览器安全与 iframe 控制
- [33. iframe 嵌入控制](#33-iframe-嵌入控制)
- [34. 跨域与内容安全策略](#34-跨域与内容安全策略)

### 第五部分：外部数据 API 集合
- [35. 新闻 API（含 CCTV 央视）](#35-新闻-api含-cctv-央视)
- [36. 天气 API](#36-天气-api)
- [37. 电商数据 API](#37-电商数据-api)
- [38. 外卖 & 餐饮数据 API](#38-外卖--餐饮数据-api)
- [39. Office & 文档 API](#39-office--文档-api)
- [40. 地图 API](#40-地图-api)
- [41. 导航 API](#41-导航-api)
- [42. B站 API](#42-b站-api)

### 第六部分：桌面应用框架
- [43. 桌面框架对比](#43-桌面框架对比)

### 第七部分：UI 玻璃效果组件库（Goose Hyper Glass CDN 2.0 调研结果）
- [44. Liquid Glass React](#44-liquid-glass-react)
- [45. Liquid Glass Studio（终极版）](#45-liquid-glass-studio终极版)
- [46. Liquid Glass（React Native 版）](#46-liquid-glassreact-native-版)

### 第八部分：AI Agent 框架（伪系统智能操控）
- [47. Goose — 开源 AI Agent](#47-goose--开源-ai-agent)
- [48. Browser Use — AI 浏览器自动化](#48-browser-use--ai-浏览器自动化)
- [49. MCP（Model Context Protocol）](#49-mcpmodel-context-protocol)
- [50. 其他 AI Agent 框架](#50-其他-ai-agent-框架)
- [51. 伪系统 AI Agent 架构建议](#51-伪系统-ai-agent-架构建议)

### 第九部分：动画效果与 AI 能力扩展（第 66–73 章）
- [66. macOS Genie Effect Web 实现（1:1 还原）](#66-macos-genie-effect-web-实现1-1-还原)
- [67. Liquid DOM — WebGPU 顶级液态玻璃（最新项目）](#67-liquid-dom--webgpu-顶级液态玻璃最新项目)
- [68. 性能开销对比与硬件分级（AI 切换指南）](#68-性能开销对比与硬件分级ai-切换指南)
- [69. 高品质磨砂玻璃（低端设备方案）](#69-高品质磨砂玻璃低端设备方案)
- [70. Web 本地语音识别模型（离线/WASM）](#70-web-本地语音识别模型离linewasm)
- [71. Web 本地 LLM（系统级 AI 核心）](#71-web-本地-llm系统级-ai-核心)
- [72. Web Siri Orb 动画（iOS 风格 AI 球）](#72-web-siri-orb-动画ios-风格-ai-球)
- [73. AI 边框跑马灯动画（iOS 风格流光边框）](#73-ai-边框跑马灯动画ios-风格流光边框)

### 第十部分：音乐 API 大全（第 74–80 章）
- [74. 音乐 API 总览与选型](#74-音乐-api-总览与选型)
- [75. 网易云音乐 API（重点·大厂）](#75-网易云音乐-api重点大厂)
- [76. QQ 音乐 API（腾讯）](#76-qq-音乐-api腾讯)
- [77. 酷狗 / 酷我 / 咪咕 API](#77-酷狗--酷我--咪咕-api)
- [78. 国际音乐 API](#78-国际音乐-api)
- [79. 免费音乐 API 与聚合开源方案](#79-免费音乐-api-与聚合开源方案)
- [80. 伪系统音乐播放器完整集成方案](#80-伪系统音乐播放器完整集成方案)

---

---

# 第一部分：N聊 项目 API（内部接口）

## 1. N聊 项目概述

N聊是一个基于 **MXOS 1.7** 的即时通讯应用，前端为脚本应用，后端为 **Cloudflare Worker**。认证复用 MXOS 账户系统，消息与社交功能由独立 Worker 提供。

- **Worker 基础地址**: `https://nliao.neocn.top`（构建时固定）
- **认证方式**: MXOS 会话令牌 `mxos_session_token`

---

## 2. MXOS 账户 API

N聊不自行处理账户，通过 `window.MXOS.User` 调用宿主提供的接口：

| 接口 | 参数 | 说明 |
|------|------|------|
| `MXOS.User.login(email, password)` | `email`: 邮箱, `password`: 密码 | 用户登录 |
| `MXOS.User.register(email, password)` | `email`: 邮箱, `password`: 密码 | 用户注册 |
| `MXOS.User.getInfo()` | 无 | 获取当前用户信息 |
| `MXOS.User.state` | 无 | 用户状态对象 |

> 会话令牌 `mxos_session_token` 存储在 `localStorage` 中，N聊读取后用于 Worker API 认证。

---

## 3. N聊 Worker REST API

所有请求需携带 `Authorization: Bearer <mxos_session_token>`。

### 3.1 WebSocket 凭证

| 接口 | 方法 | 说明 | 响应 |
|------|------|------|------|
| `/api/ws-ticket` | `POST` | 创建 WebSocket 连接凭证 | `{ ticket: string }` |

### 3.2 好友管理

| 接口 | 方法 | 说明 | 请求体/参数 |
|------|------|------|-------------|
| `/api/friends` | `GET` | 获取好友列表 | - |
| `/api/friends/request` | `GET` | 获取待处理的好友请求 | - |
| `/api/friends/request` | `POST` | 发送好友请求 | `{ targetUserId: string }` |
| `/api/friends/request/{requestId}` | `PUT` | 响应好友请求 | `{ action: "accept" \| "reject" }` |
| `/api/friends/{friendId}` | `DELETE` | 删除好友 | - |

### 3.3 消息

| 接口 | 方法 | 说明 | 参数 |
|------|------|------|------|
| `/api/messages?chatId={id}&offset=0` | `GET` | 获取聊天历史消息 | `chatId`: 聊天ID, `offset`: 偏移量 |

### 3.4 用户搜索

| 接口 | 方法 | 说明 | 参数 |
|------|------|------|------|
| `/api/users/search?q={query}&query={query}` | `GET` | 搜索用户 | `q`/`query`: 昵称、邮箱或用户ID |

---

## 4. WebSocket API

WebSocket 地址通过 `wss://` 协议连接，使用 `ticket` 作为查询参数认证。

| 接口 | 说明 |
|------|------|
| `/api/notifications/ws` | 通知 WebSocket，接收好友请求、请求结果等事件 |
| `/api/ws?chatId={chatId}` | 聊天 WebSocket，接收/发送实时消息 |

### WebSocket 消息格式

**发送消息：**
```json
{
  "type": "message",
  "payload": {
    "content": "消息内容",
    "timestamp": 1724000000000
  }
}
```

**接收消息：**
```json
{
  "type": "message",
  "data": {
    "id": "msg-id",
    "content": "消息内容",
    "senderId": "user-id",
    "sender": { "displayName": "用户名" },
    "timestamp": 1724000000000
  }
}
```

**通知事件类型：**
- `friend_request`: 收到好友请求
- `friend_request_result`: 好友请求被处理

---

## 5. 认证机制

### REST 请求认证
- 请求头: `Authorization: Bearer <mxos_session_token>`

### WebSocket 认证
- 浏览器 WebSocket 不支持添加 Authorization 头
- 令牌使用 Base64URL 编码放入 `Sec-WebSocket-Protocol` 子协议 `nliao-auth.*` 中
- Worker 回应子协议 `nliao-v1`
- 令牌**不放入 URL 查询参数**

### 后端验证
- Worker 后端会再请求 `${AUTH_API_BASE}/api/auth/me` 验证会话
- 防止客户端伪造 senderId 或好友关系

---

## 6. 数据模型

### 用户
```typescript
interface User {
  id: string;
  displayName: string;
  email: string;
  avatar: string;
}
```

### 好友
```typescript
interface Friend {
  id: string;
  displayName: string;
  online: boolean;
}
```

### 消息
```typescript
interface Message {
  id: string;
  content: string;
  senderId: string;
  sender: { displayName: string };
  timestamp: number;
}
```

### 聊天对象
```typescript
interface Chat {
  id: string;
  name: string;
  kind: 'world' | 'friend';
  friendId?: string;
  online: boolean;
}
```

---

## 7. 前端状态管理

应用维护以下核心状态：

| 状态 | 类型 | 说明 |
|------|------|------|
| `user` | `User \| null` | 当前用户 |
| `base` | `string` | Worker 基础地址 |
| `tab` | `'messages' \| 'friends' \| 'world'` | 当前标签页 |
| `chat` | `Chat` | 当前聊天对象 |
| `friends` | `Friend[]` | 好友列表 |
| `requests` | `Request[]` | 好友请求列表 |
| `search` | `User[]` | 搜索结果 |
| `searchQuery` | `string` | 搜索关键词 |
| `searchStatus` | `'idle' \| 'loading' \| 'empty' \| 'error' \| 'success'` | 搜索状态 |
| `messages` | `Map<string, Message[]>` | 消息映射 |
| `chatSocket` | `WebSocket \| null` | 聊天 WebSocket |
| `inboxSocket` | `WebSocket \| null` | 通知 WebSocket |
| `toast` | `string` | 提示消息 |
| `modal` | `string` | 弹窗状态 |
| `authMode` | `'login' \| 'register'` | 认证模式 |
| `loadingMessages` | `boolean` | 消息加载中 |
| `reconnectTimer` | `number \| null` | 重连定时器 |
| `pollTimer` | `number \| null` | 轮询定时器 |

---

## 8. 前端函数 API

### 工具函数

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `esc(value)` | `any` | `string` | HTML 转义 |
| `initials(value)` | `string` | `string` | 获取首字母大写 |
| `formatTime(value)` | `string/number` | `string` | 格式化时间为 HH:mm |
| `token()` | 无 | `string` | 获取 localStorage 中的会话令牌 |
| `activeMessages()` | 无 | `Message[]` | 获取当前聊天的消息 |
| `setMessages(chat, messages)` | `Chat, Message[]` | 无 | 设置聊天消息 |
| `workerReady()` | 无 | `boolean` | 检查 Worker 是否已配置 |
| `getUser()` | 无 | `User \| null` | 获取当前用户信息 |

### UI 函数

| 函数 | 参数 | 说明 |
|------|------|------|
| `toast(message, type='info')` | `string, 'info'\|'warning'\|'error'\|'success'` | 显示提示消息 |
| `showSettings()` | 无 | 显示连接说明弹窗 |

### 网络函数

| 函数 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `ensureWorker()` | 无 | `boolean` | 确保 Worker 已配置 |
| `api(path, options)` | `string, RequestInit` | `Promise<any>` | 发送 REST 请求 |
| `socketUrl(path, ticket)` | `string, string` | `string` | 生成 WebSocket URL |
| `closeSocket(socket)` | `WebSocket` | 无 | 关闭 WebSocket |
| `createSocket(path)` | `string` | `Promise<WebSocket>` | 创建 WebSocket 连接 |

### 业务函数

| 函数 | 参数 | 说明 |
|------|------|------|
| `connectInbox()` | 无 | 连接通知 WebSocket |
| `connectChat()` | 无 | 连接聊天 WebSocket |
| `loadFriends()` | 无 | 加载好友列表 |
| `loadRequests()` | 无 | 加载好友请求 |
| `history(chat)` | `Chat` | 加载聊天历史 |
| `refresh()` | 无 | 刷新好友和请求 |
| `choose(chat, tab)` | `Chat, string` | 切换聊天对象 |
| `send()` | 无 | 发送消息 |
| `auth(form)` | `HTMLFormElement` | 登录/注册 |
| `boot()` | 无 | 应用启动初始化 |
| `searchUsers(data)` | `any` | 解析搜索响应 |

### 渲染函数

| 函数 | 返回值 | 说明 |
|------|--------|------|
| `avatar(person, world)` | `string` | 生成头像 HTML |
| `conversation(chat)` | `string` | 生成会话项 HTML |
| `sidebar()` | `string` | 生成侧边栏 HTML |
| `chatView()` | `string` | 生成聊天视图 HTML |
| `friendsView()` | `string` | 生成好友视图 HTML |
| `settings()` | `string` | 生成设置弹窗 HTML |
| `appView()` | `string` | 生成应用主视图 HTML |
| `authView()` | `string` | 生成认证视图 HTML |
| `render()` | 无 | 渲染主界面 |
| `renderMessages(options)` | 无 | 渲染消息列表 |
| `scrollMessages()` | 无 | 滚动到底部 |
| `isNearBottom(stage)` | `boolean` | 检查是否接近底部 |

### 生命周期函数

| 函数 | 说明 |
|------|------|
| `cleanup()` | 清理资源（定时器、WebSocket、事件监听） |
| `closed(event)` | 窗口关闭事件处理 |

---

## 9. 前端组件与事件

### 事件监听

| 事件 | 目标 | 行为 |
|------|------|------|
| `submit` | `data-form="auth"` | 登录/注册 |
| `submit` | `data-form="send"` | 发送消息 |
| `submit` | `data-form="search"` | 搜索用户 |
| `keydown` | `data-role="composer"` | Enter 发送，Shift+Enter 换行 |
| `click` | `data-action="close-modal"` | 关闭弹窗 |
| `click` | `data-action="settings"` | 显示连接说明 |
| `click` | `data-action="toggle-auth"` | 切换登录/注册模式 |
| `click` | `data-action="tab"` | 切换标签页 |
| `click` | `data-action="select-chat"` | 选择聊天 |
| `click` | `data-action="start-chat"` | 开始聊天 |
| `click` | `data-action="refresh"` | 刷新好友列表 |
| `click` | `data-action="request-friend"` | 发送好友请求 |
| `click` | `data-action="respond-request"` | 响应好友请求 |
| `click` | `data-action="delete-friend"` | 删除好友 |

---

## 10. 项目文件结构

```
N聊/
├── MXOS/
│   ├── assets/          # 字体、图标、样式
│   ├── docs/            # 设计文档
│   ├── scripts/         # 构建、检查、打包脚本
│   ├── src/             # 应用源码模板、样式
│   ├── config.json      # Worker 配置
│   ├── manifest.json    # 应用清单
│   ├── package.json     # 包配置
│   └── app.bin          # 构建后的应用
└── API文档.md            # 本文档
```

---

## 11. 构建脚本

```json
{
  "scripts": {
    "build": "node scripts/build-app.mjs",
    "check": "node scripts/check-app.mjs",
    "package": "powershell -ExecutionPolicy Bypass -File scripts/package.ps1"
  }
}
```

构建配置 (config.json)：
```json
{
  "workerBase": "https://nliao.neocn.top"
}
```

---

## 12. 设计规范

- 字体: MiSans
- 设计令牌: `--space-*`, `--radius-*`, `--primary`, `--accent`
- 响应式: 移动端宽度 ≤720px 时改为上下布局
- `prefers-reduced-motion` 下压缩动画

---

---

# 第二部分：Web 浏览器 API（伪系统核心能力）

> 以下 API 均为浏览器原生内置，无需安装。文档来源：[MDN Web API](https://developer.mozilla.org/en-US/docs/Web/API)
> 伪系统基于 HTML/CSS/JS，这些 API 是实现 OS 功能的基础。

## 13. 文件系统 API

实现伪系统的**文件资源管理器**功能。

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| File System Access API | `window.showOpenFilePicker()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker) | 打开文件选择器，读取本地文件 |
| File System Access API | `window.showSaveFilePicker()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker) | 保存文件到本地 |
| File System Access API | `window.showDirectoryPicker()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) | 选择目录，实现文件浏览器 |
| FileSystemFileHandle | `.getFile()` / `.createWritable()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle) | 文件句柄，读取/写入 |
| FileSystemDirectoryHandle | `.entries()` / `.getFileHandle()` / `.getDirectoryHandle()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryHandle) | 目录句柄，遍历/创建子目录 |
| FileSystemWritableFileStream | `.write()` / `.seek()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemWritableFileStream) | 可写流，随机位置写入 |
| File API | `new File()` / `FileReader` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/File_API) | 文件读取（Blob、ArrayBuffer） |
| OPFS (Origin Private FS) | `navigator.storage.getDirectory()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/getDirectory) | 浏览器私有文件系统，高性能 |
| FileSystemObserver | `new FileSystemObserver()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemObserver) | 监听文件变化（实验性） |

### 使用示例：文件资源管理器
```javascript
// 打开目录
const dirHandle = await window.showDirectoryPicker();
// 遍历文件
for await (const [name, handle] of dirHandle.entries()) {
  const isFile = handle.kind === 'file';
  console.log(`${isFile ? '📄' : '📁'} ${name}`);
}
// 读取文件内容
const file = await fileHandle.getFile();
const text = await file.text();
```

---

## 14. 摄像头与媒体设备 API

实现伪系统的**相机应用、视频通话、屏幕共享**功能。

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| MediaDevices | `navigator.mediaDevices.getUserMedia()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) | 调用摄像头/麦克风 |
| MediaDevices | `navigator.mediaDevices.getDisplayMedia()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) | 屏幕共享/截图 |
| MediaDevices | `navigator.mediaDevices.enumerateDevices()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices) | 枚举所有媒体设备 |
| MediaStreamTrack | `track.getSettings()` / `track.stop()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack) | 控制媒体流轨道 |
| MediaStream Recording | `new MediaRecorder()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API) | 录制音频/视频 |
| ImageCapture | `new ImageCapture(track)` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Image_Capture_API) | 拍照，获取高分辨率帧 |
| Screen Capture API | `getDisplayMedia()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API) | 屏幕捕获 |
| Picture-in-Picture | `requestPictureInPicture()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API) | 画中画 |
| WebRTC | `new RTCPeerConnection()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) | P2P 视频通话 |

### 使用示例：相机
```javascript
// 打开摄像头
const stream = await navigator.mediaDevices.getUserMedia({
  video: { width: 1280, height: 720 },
  audio: false
});
videoElement.srcObject = stream;
// 拍照
const track = stream.getVideoTracks()[0];
const capture = new ImageCapture(track);
const blob = await capture.takePhoto();
```

---

## 15. 键盘与输入 API

实现伪系统的**键盘快捷键、虚拟键盘、输入法**功能。

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| Keyboard API | `navigator.keyboard.getLayoutMap()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Keyboard_API) | 获取物理键盘布局 |
| Keyboard API | `navigator.keyboard.lock()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/lock) | 捕获特定按键（全屏时） |
| KeyboardEvent | `keydown` / `keyup` / `keypress` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent) | 全局键盘事件监听 |
| InputDeviceCapabilities | `new InputDeviceCapabilities()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/InputDeviceCapabilities_API) | 检测输入设备类型（触摸/鼠标） |
| VirtualKeyboard API | `navigator.virtualKeyboard` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API) | 虚拟键盘控制（移动端） |
| Pointer events | `pointerdown` / `pointermove` / `pointerup` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) | 统一指针事件（鼠标/触摸/笔） |
| Touch events | `touchstart` / `touchmove` / `touchend` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events) | 多点触控 |
| Gamepad API | `navigator.getGamepads()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API) | 游戏手柄输入 |
| InputEvent | `beforeinput` / `input` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/InputEvent) | 输入事件（含插入文本） |

### 使用示例：全局快捷键
```javascript
// 注册全局快捷键（如 Win+E 打开文件管理器）
document.addEventListener('keydown', (e) => {
  // Meta = Windows 键 / Command 键
  if (e.metaKey && e.key === 'e') {
    e.preventDefault();
    openFileManager();
  }
});
```

---

## 16. 剪贴板与选择 API

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| Clipboard API | `navigator.clipboard.readText()` / `writeText()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API) | 读写剪贴板文本 |
| Clipboard API | `navigator.clipboard.read()` / `write()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API) | 读写剪贴板（图片等） |
| ClipboardItem | `new ClipboardItem()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem) | 剪贴板数据项 |
| Selection API | `window.getSelection()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Selection_API) | 文本选区操作 |
| Content Index API | `navigator.serviceWorker.index` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Content_Index_API) | 离线内容索引 |

---

## 17. 通知与推送 API

实现伪系统的**系统通知、消息推送、应用角标**功能。

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| Notifications API | `new Notification()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API) | 系统级桌面通知 |
| Notifications API | `Notification.requestPermission()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API) | 请求通知权限 |
| Push API | `registration.pushManager.subscribe()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) | 服务器推送通知 |
| Badging API | `navigator.setAppBadge()` / `navigator.clearAppBadge()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API) | 应用图标角标数字 |
| Service Worker API | `navigator.serviceWorker.register()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) | 后台服务、离线、PWA |
| Background Sync | `registration.sync.register()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) | 后台同步 |
| Background Fetch | `registration.backgroundFetch.fetch()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Background_Fetch_API) | 后台下载 |

---

## 18. 系统信息与设备 API

实现伪系统的**系统设置、设备信息、电源管理**功能。

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| Battery Status API | `navigator.getBattery()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Battery_Status_API) | 电池电量、充电状态 |
| Network Information | `navigator.connection` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API) | 网络类型、网速 |
| Navigator | `navigator.userAgent` / `navigator.platform` / `navigator.language` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Navigator) | 系统信息 |
| Navigator | `navigator.hardwareConcurrency` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Navigator) | CPU 核心数 |
| Navigator | `navigator.deviceMemory` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Device_Memory_API) | 内存大小 |
| Navigator | `navigator.onLine` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Navigator) | 网络在线状态 |
| Screen Orientation | `screen.orientation` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Orientation_API) | 屏幕方向（横屏/竖屏） |
| Page Visibility | `document.visibilityState` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) | 页面可见性（切窗口检测） |
| Wake Lock API | `navigator.wakeLock.request()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) | 防止屏幕休眠 |
| Vibration API | `navigator.vibrate()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API) | 振动反馈 |
| Idle Detection | `new IdleDetector()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Idle_Detection_API) | 检测用户空闲/锁屏 |
| Device Posture | `navigator.devicePosture` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Device_Posture_API) | 设备姿态（折叠屏等） |
| Compute Pressure | `new PressureObserver()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Compute_Pressure_API) | CPU 压力监测 |

---

## 19. 定位与传感器 API

实现伪系统的**地图定位、指南针、体感操作**功能。

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| Geolocation API | `navigator.geolocation.getCurrentPosition()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API) | GPS 定位 |
| Geolocation API | `navigator.geolocation.watchPosition()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API) | 持续追踪位置 |
| Device Orientation | `deviceorientation` 事件 | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events) | 设备方向（指南针） |
| Device Motion | `devicemotion` 事件 | [文档](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent) | 加速度计（摇一摇） |
| Accelerometer | `new Accelerometer()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Accelerometer) | 加速度传感器 |
| Gyroscope | `new Gyroscope()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Gyroscope) | 陀螺仪 |
| Magnetometer | `new Magnetometer()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Magnetometer) | 磁力计（指南针） |
| AmbientLightSensor | `new AmbientLightSensor()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/AmbientLightSensor) | 环境光传感器（自动亮度） |
| GravitySensor | `new GravitySensor()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/GravitySensor) | 重力传感器 |
| LinearAccelerationSensor | `new LinearAccelerationSensor()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/LinearAccelerationSensor) | 线性加速度 |
| Sensor APIs | 所有传感器基类 | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Sensor_APIs) | 传感器 API 总览 |

---

## 20. 语音与音频 API

实现伪系统的**语音助手、语音输入、文字转语音、音频播放器**功能。

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| Web Speech API (TTS) | `speechSynthesis.speak()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) | 文字转语音 |
| Web Speech API (STT) | `new SpeechRecognition()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) | 语音识别（语音输入） |
| Web Audio API | `new AudioContext()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) | 音频处理、混音、效果 |
| Audio Session | `navigator.audioSession` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Audio_Session_API) | 音频会话管理 |
| Media Session | `navigator.mediaSession` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API) | 媒体键控制（播放/暂停） |
| Media Source | `new MediaSource()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API) | 流媒体播放 |
| Web MIDI API | `navigator.requestMIDIAccess()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API) | MIDI 设备控制 |

### 使用示例：语音助手
```javascript
// 语音识别
const recognition = new SpeechRecognition();
recognition.lang = 'zh-CN';
recognition.onresult = (e) => {
  const text = e.results[0][0].transcript;
  console.log('用户说了：', text);
  // 处理指令...
};
recognition.start();

// 语音播报
const utterance = new SpeechSynthesisUtterance('你好，我是系统助手');
utterance.lang = 'zh-CN';
speechSynthesis.speak(utterance);
```

---

## 21. 图形与渲染 API

实现伪系统的**壁纸、动画、3D 效果、画图工具**功能。

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| Canvas API | `getContext('2d')` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) | 2D 绘图（画图工具） |
| WebGL API | `getContext('webgl')` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API) | 3D 渲染 |
| WebGPU API | `navigator.gpu.requestAdapter()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) | 下一代 GPU 加速 |
| Web Animations API | `element.animate()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API) | JS 动画引擎 |
| View Transition API | `document.startViewTransition()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) | 页面切换过渡动画 |
| Resize Observer | `new ResizeObserver()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Resize_Observer_API) | 元素尺寸变化监听 |
| Intersection Observer | `new IntersectionObserver()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) | 元素可见性监听 |
| EyeDropper API | `new EyeDropper()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper_API) | 屏幕取色器 |

---

## 22. 窗口与屏幕管理 API

实现伪系统的**多窗口、全屏、分屏**功能。

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| Fullscreen API | `element.requestFullscreen()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API) | 全屏模式 |
| Window Management API | `navigator.windowManagement` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Window_Management_API) | 多显示器管理 |
| Window Controls Overlay | `navigator.windowControlsOverlay` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Window_Controls_Overlay_API) | 自定义窗口标题栏 |
| Screen API | `window.screen` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Screen) | 屏幕分辨率、色深 |
| CSSOM View | `window.innerWidth` / `scrollTo()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/CSSOM_view_API) | 视口、滚动控制 |
| Popover API | `element.popover` / `showPopover()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API) | 弹出层（开始菜单、通知面板） |
| Document PiP | `documentPictureInPicture.requestWindow()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API) | 文档画中画（迷你窗口） |
| History API | `history.pushState()` / `history.back()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/History_API) | 前进/后退导航 |
| Navigation API | `navigation.navigate()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API) | 单页应用路由 |

---

## 23. 网络与通信 API

实现伪系统的**网络请求、实时通信、后台传输**功能。

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| Fetch API | `fetch()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) | HTTP 请求 |
| XMLHttpRequest | `new XMLHttpRequest()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API) | 传统 AJAX（兼容性好） |
| WebSocket API | `new WebSocket()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) | 双向实时通信 |
| WebTransport API | `new WebTransport()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API) | HTTP/3 传输（低延迟） |
| Server-Sent Events | `new EventSource()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) | 服务器推送消息 |
| Beacon API | `navigator.sendBeacon()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Beacon_API) | 页面卸载时发送数据 |
| Broadcast Channel | `new BroadcastChannel()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API) | 跨标签页通信 |
| Channel Messaging | `new MessageChannel()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Channel_Messaging_API) | 管道通信 |
| Web Workers | `new Worker()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) | 后台线程 |
| Shared Workers | `new SharedWorker()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) | 共享后台线程 |
| WebRTC Data Channel | `RTCDataChannel` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) | P2P 数据传输 |
| Web Bluetooth | `navigator.bluetooth.requestDevice()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API) | 蓝牙设备通信 |
| Web Serial API | `navigator.serial.requestPort()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) | 串口通信 |
| WebUSB API | `navigator.usb.requestDevice()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API) | USB 设备通信 |
| Web NFC API | `new NDEFReader()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_NFC_API) | NFC 读写 |
| WebHID API | `navigator.hid.requestDevice()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API) | 人机接口设备（键盘/鼠标） |
| Web Share API | `navigator.share()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) | 系统分享菜单 |

---

## 24. 存储与数据库 API

实现伪系统的**本地存储、文件数据库、缓存管理**功能。

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| Web Storage API | `localStorage` / `sessionStorage` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API) | 键值对存储 |
| IndexedDB API | `indexedDB.open()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) | 浏览器数据库（大量数据） |
| Cache API | `caches.open()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage) | 离线缓存 |
| Cookie Store API | `cookieStore.get()` / `set()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Cookie_Store_API) | 异步 Cookie 管理 |
| Storage API | `navigator.storage.estimate()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API) | 存储配额查询 |
| Storage Access API | `document.requestStorageAccess()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Storage_Access_API) | 跨域存储访问 |
| Compression Streams | `new CompressionStream()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API) | 数据压缩/解压 |
| Web Locks API | `navigator.locks.request()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) | 跨标签页锁机制 |

---

## 25. 安全与认证 API

实现伪系统的**用户登录、指纹认证、加密、权限管理**功能。

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| Web Authentication | `navigator.credentials.create()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API) | 生物认证（指纹/面容） |
| Credential Management | `navigator.credentials.get()` / `.store()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Credential_Management_API) | 密码/凭据管理 |
| Web Crypto API | `crypto.subtle.encrypt()` / `.digest()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) | 加密、哈希、签名 |
| Permissions API | `navigator.permissions.query()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API) | 权限状态查询 |
| Trusted Types | `trustedTypes.createPolicy()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API) | 防 DOM XSS |
| FedCM API | `navigator.credentials.get({ federated })` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/FedCM_API) | 联合身份认证 |
| Payment Request API | `new PaymentRequest()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Payment_Request_API) | 系统支付（对接支付宝/微信） |
| HTML Sanitizer | `new Sanitizer()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API) | HTML 消毒（防注入） |

---

## 26. 拖拽与手势 API

实现伪系统的**拖拽文件、窗口拖动、手势操作**功能。

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| HTML Drag and Drop | `dragstart` / `drop` 事件 | [文档](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API) | 拖拽文件、窗口 |
| Pointer Lock API | `element.requestPointerLock()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API) | 锁定鼠标（游戏/画图） |
| Force Touch | `webkitForce` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Force_Touch_events) | 压感触摸 |
| Touch events | `touchstart` / `touchmove` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events) | 多点触控手势 |
| Ink API | `navigator.ink` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Ink_API) | 手写笔迹渲染 |

---

## 27. 其他实用 API

| API 名称 | 核心方法 | MDN 文档 | 说明 |
|----------|---------|---------|------|
| Barcode Detection | `new BarcodeDetector()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API) | 扫码（条形码/二维码） |
| Contact Picker | `navigator.contacts.select()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Contact_Picker_API) | 读取通讯录 |
| Prioritized Task Scheduling | `scheduler.postTask()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Prioritized_Task_Scheduling_API) | 任务调度优先级 |
| URL Pattern API | `new URLPattern()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API) | URL 路由匹配 |
| Encoding API | `new TextEncoder()` / `TextDecoder()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Encoding_API) | 文本编码/解码 |
| URL API | `new URL()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/URL_API) | URL 解析 |
| DOM Parser | `new DOMParser()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser) | HTML/XML 解析 |
| Console API | `console.log()` / `.table()` / `.group()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Console_API) | 控制台输出 |
| Performance API | `performance.mark()` / `.measure()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API) | 性能监控 |
| Reporting API | `new ReportingObserver()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Reporting_API) | 错误/问题报告 |
| Remote Playback | `remote.prompt()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Remote_Playback_API) | 投屏到电视等设备 |
| Translator API | `translator.create()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Translator_and_Language_Detector_APIs) | 浏览器内置翻译（实验性） |
| Language Detector | `languageDetector.detect()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Translator_and_Language_Detector_APIs) | 语言检测 |
| Summarizer API | `summarizer.create()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Summarizer_API) | AI 文本摘要（实验性） |
| LanguageModel API | `LanguageModel.create()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/LanguageModel) | 浏览器内置 AI 模型 |
| Prompt API | `prompt.create()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Prompt_API) | 浏览器内置 AI 提示 |
| Local Font Access | `window.queryLocalFonts()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Local_Font_Access_API) | 读取本地字体 |
| FontFace API | `new FontFace()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/FontFace) | 动态加载字体 |
| Launch Handler | `launchQueue.setConsumer()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Launch_Handler_API) | PWA 文件关联启动 |
| WebCodecs API | `new VideoDecoder()` / `AudioDecoder()` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) | 硬件加速编解码 |
| Encrypted Media | `MediaKeySystemAccess` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/Encrypted_Media_Extensions_API) | DRM 加密媒体 |
| User Preferences | `navigator.userPreferences` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/User_Preferences_API) | 用户偏好设置 |
| User-Agent Client Hints | `navigator.userAgentData` | [文档](https://developer.mozilla.org/en-US/docs/Web/API/User-Agent_Client_Hints_API) | 精准设备信息 |

---

---

# 第三部分：第三方平台 API（常用软件集成）

> 以下为各主流平台的官方开放平台地址，用于在伪系统中集成第三方应用。

## 28. 电商平台

| 平台 | 开放平台地址 | 认证方式 | 说明 |
|------|-------------|---------|------|
| 淘宝/天猫 | https://open.taobao.com/ | OAuth | 商品、订单、店铺、物流 |
| 京东 | https://open.jd.com/ | OAuth | 商品、订单、物流、金融 |
| 拼多多 | https://open.pinduoduo.com/ | OAuth | 商品、订单、电子面单 |
| 1688 | https://open.1688.com/ | OAuth | 批发商品、供应链 |
| 有赞 | https://doc.youzanyun.com/ | OAuth | SaaS 电商 |
| WooCommerce | https://woocommerce.github.io/ | apiKey | 开源电商 REST API |
| eBay | https://developer.ebay.com/ | OAuth | 全球电商 |
| Shopee | https://open.shopee.com/ | apiKey | 东南亚电商 |
| Lazada | https://open.lazada.com/ | apiKey | 东南亚电商 |
| Etsy | https://www.etsy.com/developers/ | OAuth | 手工创意商品 |
| Best Buy | https://bestbuyapis.github.io/ | apiKey | 美国电子产品零售 |

---

## 29. 短视频与直播

| 平台 | 开放平台地址 | 认证方式 | 说明 |
|------|-------------|---------|------|
| 抖音 | https://open.douyin.com/ | OAuth | 小程序、视频、直播 |
| 抖音电商 | https://developer.open-douyin.com/ | OAuth | 商品详情、关键词搜索 |
| 快手 | https://open.kuaishou.com/ | OAuth | 视频、直播、电商 |
| B站 | https://member.bilibili.com/ | Cookie | 视频、弹幕、直播 |
| YouTube | https://developers.google.com/youtube | OAuth | 视频上传/管理/搜索 |
| Twitch | https://dev.twitch.tv/docs/api/ | OAuth | 直播、聊天、 Clips |
| TikTok | https://developers.tiktok.com/ | OAuth | 国际版短视频 |

---

## 30. 社交平台

| 平台 | 开放平台地址 | 认证方式 | 说明 |
|------|-------------|---------|------|
| 微信开放平台 | https://open.weixin.qq.com/ | OAuth | 微信登录、支付、分享 |
| 微信公众平台 | https://mp.weixin.qq.com/ | Token | 公众号、小程序 |
| QQ 互联 | https://connect.qq.com/ | OAuth | QQ 登录、分享 |
| 微博 | https://open.weibo.com/ | OAuth | 微博内容、登录 |
| 小红书 | https://open.xiaohongshu.com/ | OAuth | 笔记、商品 |
| 知乎 | https://www.zhihu.com/permissions | OAuth | 内容分发 |
| 腾讯开放平台 | https://open.tencent.com/ | OAuth | QQ空间、腾讯微博、Q+ |
| Discord | https://discord.com/developers/docs | Bot Token | 社区、频道、消息 |
| Telegram | https://core.telegram.org/ | Bot Token | 机器人、频道 |
| X (Twitter) | https://developer.x.com/ | OAuth | 推文、时间线 |
| Facebook | https://developers.facebook.com/ | OAuth | 社交、登录 |
| Reddit | https://www.reddit.com/dev/api | OAuth | 帖子、评论 |

---

## 31. 外卖与生活服务

| 平台 | 开放平台地址 | 认证方式 | 说明 |
|------|-------------|---------|------|
| 美团 | https://developer.meituan.com/ | OAuth | 外卖、到店、配送 |
| 饿了么 | https://open.faas.ele.me/docs | OAuth | 外卖订单 |
| 饿了么零售 | https://open-retail.ele.me/ | OAuth | 零售商品 |
| 滴滴出行 | https://developer.didialift.com/ | OAuth | 网约车、行程 |
| 高德地图 | https://lbs.amap.com/ | Key | 地图、导航、定位 |
| 百度地图 | https://lbsyun.baidu.com/ | AK | 地图、导航、定位 |
| 腾讯位置服务 | https://lbs.qq.com/ | Key | 地图、导航、定位 |
| 顺丰 | https://open.sf-express.com/ | OAuth | 快递、物流 |
| 菜鸟 | https://open.cainiao.com/ | OAuth | 物流追踪 |

---

## 32. 其他平台

| 平台 | 开放平台地址 | 认证方式 | 说明 |
|------|-------------|---------|------|
| 支付宝 | https://open.alipay.com/ | OAuth | 支付、转账、生活缴费 |
| 微信支付 | https://pay.weixin.qq.com/ | API Key | 支付、退款 |
| 银联 | https://open.unionpay.com/ | OAuth | 银行卡支付 |
| 12306 | https://kyfw.12306.cn/ | Cookie | 火车票查询 |
| 航班管家 | https://www.variflight.com/ | apiKey | 航班动态 |
| 和风天气 | https://dev.qweather.com/ | apiKey | 天气数据 |
| 彩云天气 | https://open.caiyunapp.com/ | apiKey | 天气数据 |
| 音乐平台(网易) | https://music.163.com/#/api | Cookie | 音乐播放 |
| QQ音乐 | https://y.qq.com/m/api | Cookie | 音乐播放 |
| Spotify | https://developer.spotify.com/ | OAuth | 音乐播放 |
| OpenAI | https://platform.open.com/ | apiKey | AI 大模型 |
| Claude | https://docs.anthropic.com/ | apiKey | AI 大模型 |
| Google AI | https://ai.google.dev/ | apiKey | Gemini AI |
| Azure | https://learn.microsoft.com/azure/ | OAuth | 云服务 |
| AWS | https://aws.amazon.com/sdk/ | apiKey | 云服务 |
| 阿里云 | https://api.aliyun.com/ | apiKey | 云服务 |
| 腾讯云 | https://cloud.tencent.com/document/api | apiKey | 云服务 |
| 七牛云 | https://developer.qiniu.com/ | apiKey | 对象存储 |
| Cloudflare | https://developers.cloudflare.com/ | apiKey | CDN、Workers、D1 |

---

---

# 第四部分：浏览器安全与 iframe 控制

> 伪系统内嵌第三方应用时需要处理的安全问题。

## 33. iframe 嵌入控制

### 33.1 阻止外部页面嵌入你的伪系统

| HTTP 响应头 | 值 | 说明 |
|------------|-----|------|
| X-Frame-Options | `DENY` | 完全禁止被 iframe 嵌入 |
| X-Frame-Options | `SAMEORIGIN` | 仅允许同源嵌入 |
| Content-Security-Policy | `frame-ancestors 'none'` | 现代替代方案，完全禁止 |
| Content-Security-Policy | `frame-ancestors 'self'` | 仅允许同源 |
| Content-Security-Policy | `frame-ancestors https://trusted.com` | 仅允许指定域名 |

### 33.2 在伪系统中安全嵌入第三方页面

| iframe 属性 | 说明 |
|------------|------|
| `sandbox="allow-scripts allow-same-origin"` | 沙箱隔离，允许脚本但限制其他 |
| `sandbox="allow-forms"` | 允许表单提交 |
| `sandbox="allow-popups"` | 允许弹窗 |
| `sandbox=""` | 最高安全级别，全部禁止 |
| `referrerPolicy="no-referrer"` | 不发送 Referer |
| `allow="camera; microphone"` | 精确授权（按需） |

### 33.3 跨域 iframe 通信

| 方法 | 说明 |
|------|------|
| `postMessage(data, origin)` | 跨域窗口通信 |
| `window.addEventListener('message', handler)` | 接收跨域消息 |
| `event.origin` 验证 | 必须验证来源域名 |

### 33.4 绕过 iframe 限制的方案

很多主流网站（淘宝、拼多多等）设置了 `X-Frame-Options: DENY`，无法直接 iframe 嵌入。替代方案：

| 方案 | 说明 |
|------|------|
| 原生应用壳 | 用 Tauri/Electron 壳包裹，绕过浏览器限制 |
| 代理转发 | 服务端代理请求，去掉 X-Frame-Options 头 |
| 新窗口打开 | 点击图标在新标签页/窗口打开 |
| PWA 安装 | 引导用户安装 PWA 版本 |
| 官方 SDK/API | 用平台开放 API 直接获取数据，自建 UI |

---

## 34. 跨域与内容安全策略

### 34.1 CORS（跨域资源共享）

| HTTP 头 | 说明 |
|---------|------|
| `Access-Control-Allow-Origin` | 允许的源 |
| `Access-Control-Allow-Methods` | 允许的 HTTP 方法 |
| `Access-Control-Allow-Headers` | 允许的请求头 |
| `Access-Control-Allow-Credentials` | 允许携带 Cookie |

### 34.2 CSP（内容安全策略）

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
  frame-src 'self' https://trusted.com;
  worker-src 'self';
```

### 34.3 其他安全头

| 头 | 说明 |
|-----|------|
| `Cross-Origin-Embedder-Policy: require-corp` | 跨域嵌入策略 |
| `Cross-Origin-Opener-Policy: same-origin` | 跨域窗口策略 |
| `Cross-Origin-Resource-Policy: same-origin` | 跨域资源策略 |
| `Strict-Transport-Security: max-age=31536000` | 强制 HTTPS |
| `X-Content-Type-Options: nosniff` | 禁止 MIME 嗅探 |
| `Referrer-Policy: strict-origin-when-cross-origin` | Referer 策略 |

---

---

# 第五部分：外部数据 API 集合

## 35. 新闻 API（含 CCTV 央视）

### 35.1 CCTV 央视新闻

| 名称 | 地址 | 认证 | 说明 |
|------|------|------|------|
| 央视网新闻频道 | https://news.cctv.com/ | 无 | CCTV新闻，可爬虫/RSS获取 |
| 新闻联播 | http://tv.cctv.com/lm/xwlb/ | 无 | 每日内容、视频回看 |
| 央视网RSS | https://news.cctv.com/rss/ | 无 | RSS 订阅源 |
| MediaCrawler | https://github.com/NanmiCoder/MediaCrawler | 无 | 开源新闻爬虫工具 |
| 新闻正文抽取 | https://www.free-api.com/doc/114 | 无 | 传入央视新闻URL提取正文 |
| 时事新闻检索 | https://www.free-api.com/doc/218 | 无 | 含央视等媒体报道 |

### 35.2 国内新闻 API

| 名称 | 编号 | 说明 |
|------|------|------|
| AI新闻简报 | free-api #678 | 国内/国际/体育/科技 |
| 今日头条热点 | free-api #640 | 热点新闻列表 |
| 新闻头条 | free-api #66 | 社会/国内/国际/体育 |
| 网易新闻头条 | free-api #363 | 支持分页 |
| 网易新闻详情 | free-api #364 | 新闻详情 |
| 正能量新闻 | free-api #153 | 每日更新 |

### 35.3 国际新闻 API

| 名称 | 地址 | 免费额度 |
|------|------|----------|
| News API | https://newsapi.org/ | 有 |
| NewsData | https://newsdata.io/docs | 有 |
| Currents | https://currentsapi.services/ | 有 |
| GNews | https://gnews.io/ | 有 |
| New York Times | https://developer.nytimes.com/ | - |
| The Guardian | http://open-platform.theguardian.com/ | - |
| Spaceflight News | https://spaceflightnewsapi.net | 完全免费 |

---

## 36. 天气 API

### 36.1 国内天气 API

| 名称 | 编号 | 说明 |
|------|------|------|
| 天气预报(IP定位) | free-api #670 | 根据IP判断天气 |
| 七日天气接口 | free-api #554 | 未来7天预报 |
| 天气预报(7天) | free-api #181 | 全国天气预报 |
| PM2.5空气质量 | free-api #106 | 每小时更新 |
| 台风路径 | free-api #680 | 台风详情 |

### 36.2 国际天气 API

| 名称 | 地址 | 免费额度 |
|------|------|----------|
| Open-Meteo | https://open-meteo.com/ | 完全免费 |
| OpenWeatherMap | https://openweathermap.org/api | 有 |
| Pirate Weather | https://pirateweather.net/ | 完全免费 |
| WeatherAPI | https://www.weatherapi.com/ | 有 |
| wttr.in | https://wttr.in/:help | 完全免费 |

### 36.3 国内天气平台

| 名称 | 地址 | 说明 |
|------|------|------|
| 彩云天气 | https://open.caiyunapp.com/ | 分钟级降水 |
| 和风天气 | https://dev.qweather.com/ | 位置天气 |
| AQICN | https://aqicn.org/api/ | 全球空气质量 |

---

## 37. 电商数据 API

| 名称 | 编号 | 说明 |
|------|------|------|
| 京东商品价格 | free-api #555 | 京东id获取价格 |
| 淘宝联想词 | free-api #172 | 淘宝联想词 |
| 商品比价 | free-api #156 | 各大商城历史价格 |
| 拼多多商品类目 | free-api #495 | 标准类目列表 |
| 商品条码查询 | free-api #569 | 条形码获取商品 |
| 商品图片搜索 | free-api #507 | 图片搜索商品 |

---

## 38. 外卖 & 餐饮数据 API

| 名称 | 编号 | 说明 |
|------|------|------|
| 寄快递 | free-api #491 | 寄快递接口 |
| 快递查询 | free-api #370 | 实时物流 |
| 菜谱大全 | free-api #137 | 各类菜谱 |
| 食疗大全 | free-api #189 | 食疗菜谱 |
| Spoonacular | https://spoonacular.com/food-api | 食谱、膳食规划 |
| TheMealDB | https://www.themealdb.com/api.php | 膳食食谱 |
| Open Food Facts | https://world.openfoodfacts.org/data | 食品数据库 |

---

## 39. Office & 文档 API

### 39.1 文档转换与 PDF

| 名称 | 地址 | 说明 |
|------|------|------|
| CloudConvert | https://cloudconvert.com/api/v2 | 格式转换 |
| iLovePDF | https://developer.ilovepdf.com/ | PDF操作，免费250次/月 |
| OCR.Space | https://ocr.space/ocrapi | OCR文字识别 |

### 39.2 办公协作

| 名称 | 地址 | 说明 |
|------|------|------|
| Notion | https://developers.notion.com/ | Notion 集成 |
| Microsoft Graph | https://learn.microsoft.com/en-us/graph/ | M365 统一 API |
| Google Docs API | https://developers.google.com/docs | Google 文档 |
| Google Sheets API | https://developers.google.com/sheets/api | Google 表格 |
| OnlyOffice | https://api.onlyoffice.com/ | 开源在线 Office |

---

## 40. 地图 API

| 名称 | 地址 | 说明 |
|------|------|------|
| 百度地图开放平台 | https://lbsyun.baidu.com/ | 地图/定位/检索/导航 |
| 高德开放平台 | https://lbs.amap.com/ | 地图/定位/地理编码 |
| 腾讯位置服务 | https://lbs.qq.com/ | JS API GL |
| 天地图 | https://www.tianditu.gov.cn/ | 国家平台，免费 |
| Google Maps | https://developers.google.com/maps/ | 谷歌地图 |
| Mapbox | https://www.mapbox.com/ | 自定义地图 |
| OpenStreetMap | https://www.openstreetmap.org/ | 免费开源 |
| Leaflet.js | https://leafletjs.com/ | 开源 JS 地图库 |

---

## 41. 导航 API

| 名称 | 地址 | 说明 |
|------|------|------|
| 高德路线规划 | https://lbs.amap.com/api/webservice/guide/api/direction | 驾车/步行/骑行/公交 |
| 高德实时路况 | https://lbs.amap.com/api/webservice/guide/api/traffic | 道路拥堵 |
| Google Directions | https://developers.google.com/maps/documentation/directions/ | 多模式路线 |
| Mapbox Navigation | https://docs.mapbox.com/api/navigation/ | 导航 API & SDK |
| OSRM | https://router.project-osrm.org/ | 开源路由引擎 |
| OpenRouteService | https://openrouteservice.org/ | 免费路线规划 |

---

## 42. B站 API

> 来源：bili-apis-master（已解压到本目录）

哔哩哔哩 API 收集整理项目，包含 WEB/APP/TV 等客户端的野生 API：
- 登录认证、视频信息、弹幕、播放地址、点赞投币
- 用户信息、番剧/影视、直播、动态/评论/专栏
- gRPC 接口定义、Wbi 签名

在线阅读：https://socialsisteryi.github.io/bilibili-API-collect/

---

---

# 第六部分：桌面应用框架

## 43. 桌面框架对比

如果你的伪系统要从纯 Web 升级为桌面应用（可以绕过 iframe 限制），以下框架可选：

| 框架 | 地址 | 安装包大小 | 渲染引擎 | 语言 | 说明 |
|------|------|-----------|---------|------|------|
| Tauri | https://tauri.app/ | 几 MB | 系统 WebView | Rust + JS | 轻量、安全、性能强 |
| Electron | https://www.electronjs.org/ | 100MB+ | 内置 Chromium | Node.js + JS | 生态成熟、开发简单 |
| PWA | https://web.dev/progressive-web-apps/ | 0（浏览器内置） | 浏览器 | JS | 渐进式 Web 应用 |
| Neutralino | https://neutralino.js.org/ | ~2MB | 系统 WebView | C++ + JS | 超轻量替代品 |
| Wails | https://wails.io/ | 几 MB | 系统 WebView | Go + JS | Go 语言后端 |
| NW.js | https://nwjs.io/ | 100MB+ | 内置 Chromium | Node.js + JS | Electron 前身 |

### Tauri vs Electron 关键对比

| 维度 | Tauri | Electron |
|------|-------|---------|
| 安装包 | ~5MB | ~150MB |
| 内存占用 | 低 | 高 |
| 后端语言 | Rust | Node.js |
| 系统集成 | 原生 API、文件系统、通知、托盘 | 同左 |
| 安全性 | 默认安全、权限白名单 | 需手动配置 |
| 跨域/iframe | 可绕过浏览器限制 | 可绕过浏览器限制 |
| 生态 | 成长中 | 成熟丰富 |
| 适合场景 | 轻量、安全敏感 | 大型复杂应用 |

> 如果伪系统需要嵌入淘宝/拼多多等设置了 X-Frame-Options 的网站，Tauri/Electron 壳可以绕过此限制，因为它们不是浏览器环境。

---

---

# 第七部分：UI 玻璃效果组件库（Goose Hyper Glass CDN 2.0 调研结果）

> 用户提到在 GitHub 上看到 "Goose Hyper Glass CDN 2.0"，经全面搜索未找到此确切名称的项目。以下是最接近的三个项目的完整文档，供伪系统 UI 开发参考。

## 44. Liquid Glass React

| 属性 | 值 |
|------|-----|
| GitHub | https://github.com/rdev/liquid-glass-react |
| Stars | 6,015 |
| 语言 | TypeScript |
| 许可证 | MIT |
| npm | `npm install liquid-glass-react` |
| 在线 Demo | https://liquid-glass.maxrovensky.com |
| CDN | `https://cdn.jsdelivr.net/npm/liquid-glass-react/dist/` |

### 44.1 功能特性

- 正确的边缘弯曲和折射
- 多种折射模式
- 可配置的霜化级别
- 支持任意子元素
- 可配置的内边距
- 正确的悬停和点击效果
- 边缘和高光会根据底层光线变化（同 Apple 效果）
- 可配置的色差
- 可配置的弹性（模拟 Apple 的 "liquid" 感）
- 支持 `mouseContainer` 追踪父容器鼠标移动

> ⚠️ Safari 和 Firefox 仅部分支持效果（位移不可见）

### 44.2 安装

```bash
npm install liquid-glass-react
```

### 44.3 基础用法

```tsx
import LiquidGlass from 'liquid-glass-react'

function App() {
  return (
    <LiquidGlass>
      <div className="p-6">
        <h2>Your content here</h2>
        <p>This will have the liquid glass effect</p>
      </div>
    </LiquidGlass>
  )
}
```

### 44.4 按钮示例

```tsx
<LiquidGlass
  displacementScale={64}
  blurAmount={0.1}
  saturation={130}
  aberrationIntensity={2}
  elasticity={0.35}
  cornerRadius={100}
  padding="8px 16px"
  onClick={() => console.log('Button clicked!')}
>
  <span className="text-white font-medium">Click Me</span>
</LiquidGlass>
```

### 44.5 鼠标容器追踪

```tsx
function App() {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={containerRef} className="w-full h-screen bg-image">
      <LiquidGlass
        mouseContainer={containerRef}
        elasticity={0.3}
        style={{ position: 'fixed', top: '50%', left: '50%' }}
      >
        <div className="p-6">
          <h2>Glass responds to mouse anywhere in the container</h2>
        </div>
      </LiquidGlass>
    </div>
  )
}
```

### 44.6 完整 Props 表

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `children` | `React.ReactNode` | - | 玻璃容器内的内容 |
| `displacementScale` | `number` | `70` | 控制位移效果的强度 |
| `blurAmount` | `number` | `0.0625` | 控制模糊/霜化级别 |
| `saturation` | `number` | `140` | 控制玻璃效果的色彩饱和度 |
| `aberrationIntensity` | `number` | `2` | 控制色差强度 |
| `elasticity` | `number` | `0.15` | 控制 "liquid" 弹性手感（0=刚性，越高越弹性） |
| `cornerRadius` | `number` | `999` | 边角圆弧半径（像素） |
| `className` | `string` | `""` | 额外 CSS 类名 |
| `padding` | `string` | - | CSS 内边距值 |
| `style` | `React.CSSProperties` | - | 额外内联样式 |
| `overLight` | `boolean` | `false` | 玻璃是否在浅色背景上 |
| `onClick` | `() => void` | - | 点击处理 |
| `mouseContainer` | `React.RefObject<HTMLElement \| null>` | `null` | 追踪鼠标移动的容器元素 |
| `mode` | `"standard" \| "polar" \| "prominent" \| "shader"` | `"standard"` | 折射模式（`shader` 最精确但不稳定） |
| `globalMousePos` | `{ x: number; y: number }` | - | 全局鼠标位置坐标（手动控制） |
| `mouseOffset` | `{ x: number; y: number }` | - | 鼠标位置偏移（微调定位） |

---

## 45. Liquid Glass Studio（终极版）

| 属性 | 值 |
|------|-----|
| GitHub | https://github.com/iyinchao/liquid-glass-studio |
| Stars | 656 |
| 语言 | TypeScript |
| 许可证 | MIT |
| 在线 Demo | https://liquid-glass-studio.vercel.app/ |
| 国内访问 | https://liquid-glass.iyinchao.cn/ |
| 技术栈 | WebGL2 + WebGPU + GLSL + React + Three.js |

### 45.1 项目概述

**终极 Apple Liquid Glass UI 的 Web 复刻**，使用 WebGL2 和 WebGPU 双后端渲染，是比 Liquid Glass React 更高级的实现方案。

### 45.2 功能特性

**Apple Liquid Glass 效果：**
- 折射（Refraction）
- 色散（Dispersion）
- 菲涅尔反射（Fresnel reflection）
- 超椭圆形状（Superellipse shapes）
- Blob 效果（形状合并/融合）
- 可自定义角度的眩光（Glare）
- 高斯模糊遮罩（Gaussian blur masking）
- 抗锯齿（Anti-aliasing）

**交互控制：**
- 通过直观 UI 进行全面的实时参数调整

**背景选项：**
- 支持图片和视频作为动态背景

**动画支持：**
- 基于弹簧的形状动画，行为可配置

### 45.3 技术亮点

- **WebGL2 / WebGPU 双后端渲染**，高性能图形处理
- **多通道渲染**（Multipass rendering），高质量且高性能的高斯模糊
- **SDF 定义形状**（Signed Distance Field）和平滑合并函数
- **自定义着色器**（Custom shader）实现真实玻璃效果
- **自定义 Leva UI 组件**，直观的参数控制

### 45.4 安装与运行

```bash
# 前置条件：Node.js (最新 LTS 版本) + pnpm
pnpm install
pnpm dev      # 启动开发服务器
pnpm build    # 生产构建
```

### 45.5 TODO 路线图

| 功能 | 状态 |
|------|------|
| 更多眩光控制（硬度/颜色/大小） | ✅ 已完成 |
| 自定义背景 | ✅ 已完成 |
| WebGPU 渲染 | ✅ 已完成 |
| 参数导入/导出 | ✅ 已完成 |
| 渲染步骤视图 | ✅ 已完成 |
| 编辑器模式 | 🔄 开发中 |
| 玻璃文字渲染 | 🔄 开发中 |
| 玻璃预设 | 🔄 开发中 |
| 自发光 | 🔄 开发中 |
| HDR 照明 | 🔄 开发中 |
| 形状内 UI 内容 | 🔄 开发中 |

### 45.6 与 Liquid Glass React 对比

| 维度 | Liquid Glass React | Liquid Glass Studio |
|------|-------------------|---------------------|
| 渲染方式 | CSS + Canvas | WebGL2 + WebGPU |
| 性能 | 中等 | 高（GPU 加速） |
| 效果质量 | 良好 | 极佳（真实折射） |
| 可定制性 | Props 配置 | 实时参数面板 |
| 背景 | 静态 | 图片/视频 |
| 色散/菲涅尔 | 部分 | 完整支持 |
| 形状 | 圆角矩形 | 超椭圆 + Blob 融合 |
| 包大小 | 小 | 较大 |
| 适合场景 | 按钮/卡片等小组件 | 全屏壁纸/系统级 UI |

---

## 46. Liquid Glass（React Native 版）

| 属性 | 值 |
|------|-----|
| GitHub | https://github.com/callstack/liquid-glass |
| Stars | 1,645 |
| 语言 | Objective-C++ |
| 许可证 | MIT |
| npm | `@callstack/liquid-glass` |
| 版本 | 0.8.1 |
| 平台 | iOS（React Native） |

由 Callstack 团队开发的 React Native 版 Liquid Glass，使用原生 Objective-C++ 实现 iOS 玻璃效果。适用于移动端伪系统。

---

---

# 第八部分：AI Agent 框架（伪系统智能操控）

> 伪系统需要 AI Agent 来操控整个系统：安装美化、安装插件、执行任务。

## 47. Goose — 开源 AI Agent

| 属性 | 值 |
|------|-----|
| GitHub | https://github.com/aaif-goose/goose |
| Stars | 47,700+ |
| 语言 | Rust |
| 许可证 | Apache 2.0 |
| 官网 | https://goose-docs.ai |
| 所属 | Linux Foundation AAIF |
| Discord | https://discord.gg/n8R5VaWDAn |
| 平台 | macOS / Linux / Windows |

### 47.1 项目概述

Goose 是一个**通用型 AI Agent**，运行在你的本地机器上。不仅仅是代码——可用于研究、写作、自动化、数据分析或任何需要完成的任务。

提供三种使用方式：
1. **桌面应用**（macOS、Linux、Windows）
2. **CLI 命令行工具**
3. **API**（可嵌入任何系统）

### 47.2 核心能力

| 能力 | 说明 |
|------|------|
| 多模型支持 | 15+ 个提供商：Anthropic、OpenAI、Google、Ollama、OpenRouter、Azure、Bedrock 等 |
| MCP 扩展 | 通过 Model Context Protocol 连接 70+ 个扩展 |
| ACP 登录 | 用现有 Claude/ChatGPT/Gemini 订阅登录 |
| 自定义发行版 | 可构建预配置提供商、扩展和品牌的自定义 Goose |
| 本地运行 | 所有数据在本地处理，隐私安全 |

### 47.3 安装

**桌面应用：** 从 https://goose-docs.ai/docs/getting-started/installation 下载

**CLI 安装：**
```bash
curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | bash
```

### 47.4 Vibe Coding 用法

Goose 适合 Vibe Coding（自然语言编程），可以用它来：
- 让 AI 操控文件系统（读写文件）
- 运行测试、自动化开发流程
- 通过 MCP 扩展连接更多工具
- 嵌入到伪系统中作为内置 AI 助手

### 47.5 文档链接

| 文档 | 地址 |
|------|------|
| 快速开始 | https://goose-docs.ai/docs/quickstart |
| 安装指南 | https://goose-docs.ai/docs/getting-started/installation |
| 教程 | https://goose-docs.ai/docs/category/tutorials |
| 自定义发行版 | https://github.com/aaif-goose/goose/blob/main/CUSTOM_DISTROS.md |
| 故障排除 | https://goose-docs.ai/docs/troubleshooting/diagnostics-and-reporting |

### 47.6 伪系统集成方案

```
伪系统 (HTML/JS) 
  → 调用 Goose API
    → Goose 通过 MCP 连接扩展
      → 读写本地文件、安装主题、安装插件、运行脚本
```

Goose 的 API 模式可以嵌入伪系统后端，让用户通过自然语言命令操控系统：
- "帮我换一个暗色主题"
- "安装一个天气插件"
- "整理我的桌面文件"
- "打开浏览器搜索xxx"

---

## 48. Browser Use — AI 浏览器自动化

| 属性 | 值 |
|------|-----|
| GitHub | https://github.com/browser-use/browser-use |
| 官网 | https://browser-use.com |
| 语言 | Python |
| 许可证 | MIT |
| Cloud | https://cloud.browser-use.com |
| 文档 | https://docs.browser-use.com |

### 48.1 项目概述

Browser Use 让 AI Agent 像人类一样使用 Web 浏览器——打开页面、点击按钮、输入文字、填写表单。你描述任务，它自动完成。

### 48.2 核心能力

| 能力 | 说明 |
|------|------|
| 表单填写 | 自动填写求职申请、注册表单等 |
| 数据提取 | 从网页提取结构化数据并导出 CSV |
| 自定义工具 | 可添加自定义工具扩展 Agent 能力 |
| 多模型 | Claude/GPT/Gemini/ChatBrowserUse |
| 浏览器配置文件 | 复用已登录的 Chrome 配置 |
| CAPTCHA 处理 | 配合 Browser Use Cloud 绕过验证码 |
| 脚本可重运行 | 网站变化后仍可获取实时数据 |
| 1000+ 集成 | Gmail、Slack、Notion 等 |

### 48.3 安装与使用

```bash
uv add browser-use
# 或
pip install browser-use
```

```python
from browser_use import Agent, ChatBrowserUse

async def main():
    agent = Agent(
        task="Find the number of stars of the browser-use repo",
        llm=ChatBrowserUse(model='openai/gpt-5.5'),
    )
    history = await agent.run()

asyncio.run(main())
```

### 48.4 自定义工具

```python
from browser_use import Tools

tools = Tools()

@tools.action(description='Description of what this tool does.')
def custom_tool(param: str) -> str:
    return f"Result: {param}"

agent = Agent(
    task="Your task",
    llm=llm,
    browser=browser,
    tools=tools,
)
```

### 48.5 伪系统中的用途

Browser Use 可以让伪系统的 AI Agent：
- 自动浏览网页、填表、提取数据
- 操控伪系统内嵌的浏览器窗口
- 自动完成在线任务（购物、查询、预订）
- 作为伪系统的"机器人助手"

---

## 49. MCP（Model Context Protocol）

| 属性 | 值 |
|------|-----|
| 官网 | https://modelcontextprotocol.io |
| 规范 | 开放标准 |
| 用途 | AI 模型与外部工具/数据源的标准化接口 |
| 比喻 | AI 时代的 USB-C 协议 |

### 49.1 架构

```
┌──────────────────┐
│   MCP Host        │  (如 Claude Desktop, Goose, 伪系统)
│   ┌──────────┐    │
│   │MCP Client│    │  为每个 Server 创建独立客户端
│   └────┬─────┘    │
│        │          │
│   ┌────┴─────┐    │
│   │MCP Server│    │  真正干活的"插件"，本地或远程
│   └──────────┘   │
└──────────────────┘
```

### 49.2 MCP Server 类型（伪系统可用）

| Server 类型 | 说明 | 伪系统用途 |
|------------|------|-----------|
| Filesystem | 文件系统读写 | 安装主题、插件、管理文件 |
| Database | 数据库操作 | 管理用户数据、应用数据 |
| Browser | 浏览器控制 | 自动浏览网页 |
| Shell | 命令行执行 | 运行系统命令、脚本 |
| Git | 版本控制 | 管理系统更新 |
| Memory | 记忆存储 | AI 记住用户偏好 |
| Fetch | HTTP 请求 | 调用外部 API |
| Search | 搜索引擎 | 网页搜索 |
| Slack/Email | 通讯 | 消息通知 |
| Calendar | 日历 | 日程管理 |
| Custom | 自定义 | 伪系统自定义功能 |

### 49.3 伪系统集成 MCP 方案

```javascript
// 伪系统通过 MCP 连接 Agent 和工具
伪系统 → Goose API → MCP Client → MCP Server (Filesystem)
                                      → MCP Server (Shell)
                                      → MCP Server (Browser)
                                      → MCP Server (Custom Theme Engine)
```

用户可以说：
- "帮我安装一个新主题" → MCP Filesystem Server 写入 CSS 文件
- "截个屏发给我" → MCP Shell Server 执行截图命令
- "搜索一下今天的新闻" → MCP Browser/Fetch Server 调用新闻 API
- "把我的文件整理一下" → MCP Filesystem Server 移动文件

---

## 50. 其他 AI Agent 框架

### 50.1 Agent OS

| 属性 | 值 |
|------|-----|
| 类型 | AI 驱动的智能软件开发系统 |
| 说明 | 将 AI 编码代理从"困惑的实习生"变为"高效开发者" |
| 用途 | 结构化工作流，规划和执行软件开发任务 |

### 50.2 UI-TARS-desktop（字节跳动）

| 属性 | 值 |
|------|-----|
| GitHub | https://github.com/bytedance/UI-TARS-desktop |
| 类型 | 开源多模态 AI Agent |
| 说明 | 字节跳动出品，可"看屏幕、点按钮、填表单" |
| 用途 | GUI 自动化，像人类一样操控桌面 |

### 50.3 Refly.AI

| 属性 | 值 |
|------|-----|
| 类型 | 全球首个 Vibe Workflow 平台 |
| 说明 | 面向非技术创作者的 Agent Skill 搭建神器 |
| 用途 | 可视化构建 AI Agent 工作流 |

### 50.4 Playwright

| 属性 | 值 |
|------|-----|
| GitHub | https://github.com/microsoft/playwright |
| Stars | 70,000+ |
| 类型 | 跨浏览器自动化框架 |
| 用途 | Browser Use 的底层执行引擎，也可单独使用 |
| 语言 | Node.js / Python / Java / .NET |

### 50.5 Puppeteer

| 属性 | 值 |
|------|-----|
| GitHub | https://github.com/puppeteer/puppeteer |
| Stars | 90,000+ |
| 类型 | Chrome DevTools Protocol 自动化 |
| 用途 | 控制 Chrome/Chromium 浏览器 |

---

## 51. 伪系统 AI Agent 架构建议

### 51.1 整体架构

```
┌─────────────────────────────────────────────────┐
│              Nexus OS（伪系统）                    │
│                                                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ 桌面环境  │  │ 文件管理  │  │ 设置面板  │         │
│  │(玻璃效果) │  │(FileSystem)│  │(主题/插件)│        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘         │
│       │             │             │               │
│  ┌────┴─────────────┴─────────────┴─────┐        │
│  │          AI Agent 核心层               │        │
│  │  (Goose API / Browser Use / MCP)      │        │
│  └────┬────────────┬────────────┬──────┘        │
│       │            │            │                │
│  ┌────┴────┐  ┌────┴────┐  ┌───┴─────┐          │
│  │主题引擎  │  │插件管理器│  │浏览器引擎│          │
│  │(CSS/JS) │  │(加载/卸载)│  │(iframe) │         │
│  └─────────┘  └─────────┘  └─────────┘          │
│                                                   │
│  ┌─────────────────────────────────────┐        │
│  │        Web API 层（浏览器原生）         │        │
│  │  File System | Camera | Keyboard |   │        │
│  │  Notification | Storage | WebSocket |  │        │
│  └─────────────────────────────────────┘        │
└─────────────────────────────────────────────────┘
```

### 51.2 推荐技术选型

| 层级 | 推荐方案 | 备选 |
|------|---------|------|
| UI 玻璃效果 | Liquid Glass Studio (WebGL2) | Liquid Glass React |
| AI Agent 后端 | Goose (API 模式) | Browser Use |
| 扩展协议 | MCP (Model Context Protocol) | 自定义插件系统 |
| 浏览器自动化 | Browser Use + Playwright | Puppeteer |
| 桌面壳（可选） | Tauri | Electron |
| 文件系统 | File System Access API | OPFS |
| 通信 | WebSocket + BroadcastChannel | WebTransport |

### 51.3 Vibe Coding 指南（给下一个 AI 的提示）

当用 AI 开发伪系统时，告诉 AI：

1. **UI 层**：使用 Liquid Glass Studio 的 WebGL2/WebGPU 渲染玻璃效果，或用 Liquid Glass React 做小组件
2. **Agent 层**：通过 Goose API 嵌入 AI Agent，用自然语言命令操控系统
3. **插件系统**：基于 MCP 协议设计插件接口，每个插件是一个 MCP Server
4. **主题系统**：用 CSS 变量 + File System Access API，AI Agent 可直接写入主题文件
5. **安全沙箱**：iframe sandbox 隔离第三方应用，postMessage 跨域通信
6. **数据层**：IndexedDB 存储系统数据，localStorage 存储用户偏好
7. **通信层**：WebSocket 实时通信，BroadcastChannel 跨标签页同步

### 51.4 命令示例（AI Agent 可执行的操作）

```javascript
// 用户说："帮我换成暗色主题"
Agent.execute({
  intent: 'change_theme',
  theme: 'dark',
  steps: [
    '读取主题目录',
    '选择 dark.css',
    '写入 CSS 到系统样式表',
    '更新 localStorage 主题偏好'
  ]
})

// 用户说："安装一个天气插件"
Agent.execute({
  intent: 'install_plugin',
  plugin: 'weather',
  steps: [
    '从插件仓库下载 weather.js',
    '验证签名',
    '写入插件目录',
    '注册到插件管理器',
    '在桌面生成图标'
  ]
})

// 用户说："帮我搜一下今天的新闻"
Agent.execute({
  intent: 'search_news',
  steps: [
    '调用新闻 API',
    '获取今日头条',
    '在浏览器窗口打开新闻应用',
    '展示新闻列表'
  ]
})
```

---

---

## 52. Apple Liquid Glass — Three.js 版（ektogamat）

| 属性 | 值 |
|------|-----|
| GitHub | https://github.com/ektogamat/apple-liquid-glass |
| Stars | 157 |
| 语言 | JavaScript / GLSL |
| 许可证 | MIT |
| 在线 Demo | https://appleliquidglass.vercel.app |
| 技术栈 | Three.js + React Three Fiber + WebGL + GLSL |

### 52.1 项目概述

使用 Three.js 和 React Three Fiber 复刻 Apple Liquid Glass 效果。通过 3D 网格（mesh）实现真实的玻璃折射和反射。

### 52.2 技术要点

- 使用 mesh（网格体）实现玻璃效果
- 受 Paul Henschell 的早期工作启发
- 作者计划改用单次绘制调用 + UV 扭曲着色器提升性能

### 52.3 注意事项

> 使用 mesh 实现效果虽然美观，但会导致性能下降。未来将改为基于着色器的 UV 扭曲方案，提升性能。

### 52.4 代码结构

```jsx
// React Three Fiber 实现
import { Canvas } from '@react-three/fiber'
import { GlassMesh } from './GlassMesh'

function App() {
  return (
    <Canvas>
      <GlassMesh />
    </Canvas>
  )
}
```

### 52.5 适用场景

- 需要真实 3D 玻璃折射效果的展示页面
- 不适合性能敏感的列表/卡片场景（mesh 开销大）
- 适合伪系统的桌面壁纸/主屏幕背景

---

## 53. WebGL Apple Liquid Glass — 物理精确版（Oliverrr2424）

| 属性 | 值 |
|------|-----|
| GitHub | https://github.com/Oliverrr2424/webgl-apple-liquid-glass |
| Stars | 118 |
| 语言 | JavaScript |
| 许可证 | MIT |
| 创建时间 | 2026-08-09 |
| 最后更新 | 2026-08-31 |
| GitHub Pages | 已启用 |

### 53.1 项目概述

这是 Apple Liquid Glass 的 **WebGL2 物理精确复刻版**，使用真实的物理光学公式：

- **Squircle SDF 厚度场** — 用超椭圆 SDF 定义玻璃形状
- **Snell 折射定律** — 真实物理折射计算
- **弯月面边缘（Meniscus rim）** — 玻璃边缘的弯月形效果
- **色散（Dispersion）** — 不同波长光线的折射差异
- **可变模糊散射（Variable-blur scattering）** — 动态模糊
- **菲涅尔边缘（Fresnel rim）** — 视角依赖的边缘反射

### 53.2 与其他项目对比

| 维度 | Liquid Glass React | Liquid Glass Studio | ektogamat (Three.js) | Oliverrr2424 (WebGL2) |
|------|-------------------|---------------------|----------------------|----------------------|
| 渲染方式 | SVG filter + CSS | WebGL2 + WebGPU | Three.js mesh | WebGL2 纯着色器 |
| 物理精度 | 低（视觉模拟） | 中（SDF + shader） | 中（mesh 折射） | 高（Snell 定律） |
| 性能 | 高 | 中 | 低（mesh 开销） | 中高 |
| 色散 | 简单偏移 | 支持 | 支持 | 物理精确 |
| 弯月面 | 不支持 | 不支持 | 不支持 | 支持 |
| 菲涅尔 | 简单模拟 | 支持 | 支持 | 物理精确 |
| 适合场景 | 按钮/卡片 | 全屏 UI | 展示页面 | 研究参考 |

### 53.3 核心技术解析

**Snell 折射定律：**
```
n₁ sin(θ₁) = n₂ sin(θ₂)
```
其中 n₁=1.0（空气），n₂=1.5（玻璃），θ 为入射角

**Squircle SDF（超椭圆距离场）：**
```
f(x,y) = |x/a|^n + |y/b|^n - 1
```
通过调整 n 值控制形状从矩形到圆形的过渡

**色散：**
红光（650nm）、绿光（550nm）、蓝光（450nm）各有不同的折射率，产生 RGB 色散

---

## 54. Liquid Glass React — 源码深度解析

> 以下是 `liquid-glass-react` 项目（用户已有 ZIP）的核心源码分析。

### 54.1 项目结构

```
liquid-glass-react/
├── src/
│   ├── index.tsx           # 主组件（612行）
│   ├── shader-utils.ts     # 着色器工具（130行）
│   └── utils.ts            # 位移贴图（base64编码）
├── liquid-glass-example/    # Next.js 示例项目
│   └── src/pages/
│       ├── index.tsx        # 示例首页
│       ├── _app.tsx
│       └── _document.tsx
├── esbuild.config.js        # 构建配置
└── README.md
```

### 54.2 核心架构

```
LiquidGlass (主组件)
  ├── GlassContainer (玻璃容器)
  │   ├── GlassFilter (SVG 滤镜)
  │   │   ├── feImage (位移贴图)
  │   │   ├── feDisplacementMap (R/G/B 三通道位移)
  │   │   ├── feColorMatrix (通道分离)
  │   │   ├── feGaussianBlur (模糊)
  │   │   └── feComposite (边缘遮罩合成)
  │   ├── glass__warp (背景层 — 被滤镜扭曲)
  │   └── children (用户内容 — 保持清晰)
  ├── Border Layer 1 (边框层 1 — screen 混合)
  ├── Border Layer 2 (边框层 2 — overlay 混合)
  └── Hover Effects (悬停高亮效果 × 3)
```

### 54.3 渲染层级（从底到顶）

| 层 | 说明 | CSS |
|----|------|-----|
| 0 | Over Light 背景层 | `mix-blend: overlay; opacity: 0→20%` |
| 1 | Over Light 叠加层 | `mix-blend: overlay; opacity: 0→100%` |
| 2 | 玻璃容器（backdrop-filter） | `filter: url(#glass-filter); backdrop-filter: blur() saturate()` |
| 3 | 边框层 1 | `mix-blend: screen; opacity: 0.2; mask: linear-gradient` |
| 4 | 边框层 2 | `mix-blend: overlay` |
| 5-7 | 悬停效果 × 3 | `mix-blend: overlay; radial-gradient` |

### 54.4 SVG 滤镜详解

```svg
<filter id="glass-filter" colorInterpolationFilters="sRGB">
  <!-- 1. 加载位移贴图 -->
  <feImage href="{displacementMap}" result="DISPLACEMENT_MAP" />

  <!-- 2. 创建边缘遮罩 -->
  <feColorMatrix in="DISPLACEMENT_MAP" type="matrix"
    values="0.3 0.3 0.3 0 0  0.3 0.3 0.3 0 0  0.3 0.3 0.3 0 0  0 0 0 1 0"
    result="EDGE_INTENSITY" />
  <feComponentTransfer result="EDGE_MASK">
    <feFuncA type="discrete" tableValues="0 0.1 1" />
  </feComponentTransfer>

  <!-- 3. R 通道位移 -->
  <feDisplacementMap in="SourceGraphic" scale="{displacementScale}"
    xChannelSelector="R" yChannelSelector="B" result="RED_DISPLACED" />
  <feColorMatrix values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
    in="RED_DISPLACED" result="RED_CHANNEL" />

  <!-- 4. G 通道位移（偏移略不同 → 色差） -->
  <feDisplacementMap scale="{displacementScale - 0.1}" result="GREEN_DISPLACED" />
  <feColorMatrix values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
    in="GREEN_DISPLACED" result="GREEN_CHANNEL" />

  <!-- 5. B 通道位移（偏移更大 → 色差） -->
  <feDisplacementMap scale="{displacementScale - 0.2}" result="BLUE_DISPLACED" />
  <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
    in="BLUE_DISPLACED" result="BLUE_CHANNEL" />

  <!-- 6. 合并 RGB → 色差效果 -->
  <feBlend in="GREEN_CHANNEL" in2="BLUE_CHANNEL" mode="screen" />
  <feBlend in="RED_CHANNEL" in2="GB_COMBINED" mode="screen" />

  <!-- 7. 模糊 + 边缘遮罩 -->
  <feGaussianBlur stdDeviation="0.4" />
  <feComposite in="ABERRATION" in2="EDGE_MASK" operator="in" />
  <feComposite in="EDGE_ABERRATION" in2="CENTER_CLEAN" operator="over" />
</filter>
```

### 54.5 着色器工具（shader-utils.ts）

```typescript
// SDF 函数 — 圆角矩形距离场
function roundedRectSDF(x, y, width, height, radius): number {
  const qx = Math.abs(x) - width + radius
  const qy = Math.abs(y) - height + radius
  return Math.min(Math.max(qx, qy), 0) +
         length(Math.max(qx, 0), Math.max(qy, 0)) - radius
}

// 着色器片段 — 液态玻璃位移
export const fragmentShaders = {
  liquidGlass: (uv: Vec2): Vec2 => {
    const ix = uv.x - 0.5
    const iy = uv.y - 0.5
    // 计算到边缘的距离
    const distanceToEdge = roundedRectSDF(ix, iy, 0.3, 0.2, 0.6)
    // 边缘附近产生位移
    const displacement = smoothStep(0.8, 0, distanceToEdge - 0.15)
    const scaled = smoothStep(0, 1, displacement)
    return texture(ix * scaled + 0.5, iy * scaled + 0.5)
  },
}

// 着色器位移贴图生成器
export class ShaderDisplacementGenerator {
  // 在 Canvas 上逐像素计算位移值
  // R 通道 = X 位移, G/B 通道 = Y 位移
  // 输出为 dataURL 供 SVG feImage 使用
}
```

### 54.6 三种位移贴图模式

| 模式 | 说明 | 文件来源 |
|------|------|---------|
| `standard` | 标准位移贴图（JPEG base64） | `utils.ts → displacementMap` |
| `polar` | 极坐标位移贴图（JPEG base64） | `utils.ts → polarDisplacementMap` |
| `prominent` | 突出位移贴图（PNG base64） | `utils.ts → prominentDisplacementMap` |
| `shader` | 运行时着色器生成 | `shader-utils.ts → ShaderDisplacementGenerator` |

### 54.7 弹性变形系统

```typescript
// 鼠标位置 → 方向缩放
function calculateDirectionalScale(): string {
  const deltaX = globalMousePos.x - pillCenterX
  const deltaY = globalMousePos.y - pillCenterY
  // 激活区域：元素边缘外 200px
  const activationZone = 200
  const fadeInFactor = 1 - edgeDistance / activationZone
  // 方向归一化
  const normalizedX = deltaX / centerDistance
  const normalizedY = deltaY / centerDistance
  // 弹性拉伸（弹性系数 × 淡入因子）
  const stretchIntensity = Math.min(centerDistance / 300, 1) * elasticity * fadeInFactor
  // X 方向拉伸时 Y 方向压缩（体积守恒）
  const scaleX = 1 + Math.abs(normalizedX) * stretchIntensity * 0.3
                 - Math.abs(normalizedY) * stretchIntensity * 0.15
  const scaleY = 1 + Math.abs(normalizedY) * stretchIntensity * 0.3
                 - Math.abs(normalizedX) * stretchIntensity * 0.15
  return `scaleX(${scaleX}) scaleY(${scaleY})`
}
```

### 54.8 边框渐变系统

```typescript
// 边框颜色随鼠标位置动态变化
background: `linear-gradient(
  ${135 + mouseOffset.x * 1.2}deg,                           // 角度跟随鼠标X
  rgba(255,255,255,0.0) 0%,
  rgba(255,255,255,${0.12 + Math.abs(mouseOffset.x) * 0.008})  // 亮度跟随鼠标X
  ${Math.max(10, 33 + mouseOffset.y * 0.3)}%,                 // 位置跟随鼠标Y
  rgba(255,255,255,${0.4 + Math.abs(mouseOffset.x) * 0.012})
  ${Math.min(90, 66 + mouseOffset.y * 0.4)}%,
  rgba(255,255,255,0.0) 100%
)`
```

---

## 55. CSS 纯实现液态玻璃方案

> 不依赖任何库，纯 CSS + SVG 实现液态玻璃效果。

### 55.1 核心CSS

```css
.liquid-glass {
  /* 玻璃背景 */
  background: rgba(255, 255, 255, 0.12);
  /* 模糊 + 饱和度提升 */
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  /* 半透明边框 */
  border: 1px solid rgba(255, 255, 255, 0.25);
  /* 圆角 */
  border-radius: 24px;
  /* 多层阴影（外阴影 + 内高光） */
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.18),         /* 外阴影 */
    inset 0 1px 0 rgba(255, 255, 255, 0.15);  /* 内高光 */
}

/* 顶部高光线 */
.liquid-glass::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg,
    transparent,
    rgba(255, 255, 255, 0.4),
    transparent);
}
```

### 55.2 SVG 折射滤镜

```svg
<svg style="position:absolute;">
  <defs>
    <filter id="glass-refraction">
      <!-- 位移贴图（base64 或生成的图片） -->
      <feImage href="displacement-map.jpg" result="MAP" />
      <!-- 对源图像应用位移 -->
      <feDisplacementMap in="SourceGraphic" in2="MAP"
        scale="70" xChannelSelector="R" yChannelSelector="B" />
    </filter>
  </defs>
</svg>
```

### 55.3 Spring 动画

```css
:root {
  /* 弹簧曲线（overshoot） */
  --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  /* 平滑曲线 */
  --smooth: cubic-bezier(0.4, 0, 0.2, 1);
}

/* Dock 图标悬停弹跳 */
.dock-item {
  transition: transform 0.25s var(--spring);
}
.dock-item:hover {
  transform: translateY(-12px) scale(1.3);
}

/* 开关滑块弹性 */
.switch-knob {
  transition: transform 0.3s var(--spring);
}
.switch.on .switch-knob {
  transform: translateX(20px);
}

/* 分段控件滑块 */
.segment-thumb {
  transition: left 0.3s var(--spring), width 0.3s var(--spring);
}
```

### 55.4 优缺点

| 优点 | 缺点 |
|------|------|
| 零依赖，纯 CSS | 无真实折射 |
| 性能极佳 | Safari/Firefox 部分支持 |
| 容易定制 | 色差效果有限 |
| 适合移动端 | 无法实现真实弯月面 |

---

## 56. 完整方案对比与选型建议

### 56.1 六种方案总览

| # | 方案 | 渲染 | Stars | 真实折射 | 动画 | 性能 | 复杂度 | CDN |
|---|------|------|-------|---------|------|------|--------|-----|
| 1 | **CSS backdrop-filter** | CSS | - | 否 | CSS transition | 极高 | 极低 | 无需 |
| 2 | **Liquid Glass React** | SVG + CSS | 6K | 模拟 | 弹性变形 | 高 | 低 | jsdelivr |
| 3 | **Liquid Glass Studio** | WebGL2 + WebGPU | 656 | 是 | Spring 动画 | 中 | 中 | 需构建 |
| 4 | **ektogamat Three.js** | Three.js mesh | 157 | 是（3D） | Three.js 动画 | 低 | 高 | 需构建 |
| 5 | **Oliverrr2424 WebGL2** | WebGL2 着色器 | 118 | 物理 | 自定义 | 中高 | 高 | 需构建 |
| 6 | **@callstack/liquid-glass** | 原生 iOS | 1.6K | 是 | iOS 原生 | 高 | 中 | npm |

### 56.2 伪系统选型建议

| 场景 | 推荐方案 | 原因 |
|------|---------|------|
| Dock 底部导航栏 | 方案 1（CSS） | 性能好，交互流畅 |
| 设置面板开关/滑块 | 方案 1（CSS） | 简单可靠 |
| 全屏壁纸玻璃 | 方案 3（Studio） | 真实折射，效果震撼 |
| 按钮/卡片 | 方案 2（React） | 有弹性变形和色差 |
| 展示页面 | 方案 4（Three.js） | 3D 效果最佳 |
| 研究参考 | 方案 5（WebGL2） | 物理最精确 |
| 移动端 | 方案 6（RN） | iOS 原生性能 |

### 56.3 混合方案推荐

```
伪系统 UI 层级：
┌──────────────────────────────────────────┐
│ 全屏壁纸层（方案3: Liquid Glass Studio）   │ ← 真实折射背景
├──────────────────────────────────────────┤
│ Dock 导航栏（方案1: CSS backdrop-filter）  │ ← 高性能交互
├──────────────────────────────────────────┤
│ 设置面板（方案1: CSS + SVG 滤镜）           │ ← 开关/滑块
├──────────────────────────────────────────┤
│ 按钮/卡片（方案2: Liquid Glass React）     │ ← 弹性变形
├──────────────────────────────────────────┤
│ 应用窗口（iframe + 方案1 CSS 玻璃边框）    │ ← 第三方应用
└──────────────────────────────────────────┘
```

---

## 57. Apple 官方 Liquid Glass 设计资源

| 资源 | 地址 |
|------|------|
| Apple 设计资源 | https://developer.apple.com/design/resources/ |
| Liquid Glass 设计画廊 | https://developer.apple.com/cn/design/new-design-gallery/ |
| WWDC 2025 Liquid Glass | https://developer.apple.com/wwdc/ |
| Human Interface Guidelines | https://developer.apple.com/design/human-interface-guidelines/ |

### 57.1 Apple 官方 Liquid Glass 特性

- **半透明材质** — 反射 + 折射 + 动态变形
- **统一设计语言** — 跨 iOS/macOS/iPadOS/visionOS/watchOS/tvOS
- **动态响应** — 内容在玻璃下方移动时玻璃会实时折射
- **光线自适应** — 边缘高光根据背景光线变化
- **弹性交互** — 触摸时玻璃会弹性变形

### 57.2 核心效果清单（需在 Web 上复刻）

| 效果 | Apple 原生 | CSS 方案 | SVG 方案 | WebGL 方案 |
|------|------------|---------|---------|-----------|
| 背景模糊 | CoreImage | backdrop-filter | feGaussianBlur | shader blur |
| 边缘折射 | Metal | 不支持 | feDisplacementMap | Snell 折射 |
| 色散 | Metal | 不支持 | RGB 通道偏移 | 物理色散 |
| 菲涅尔 | Metal | border gradient | 不支持 | Fresnel 公式 |
| 弯月面 | Metal | 不支持 | 不支持 | SDF 厚度 |
| 弹性变形 | UIKit Spring | cubic-bezier | 不支持 | 顶点位移 |
| 鼠标追踪 | UIKit | transform | 不支持 | uniform 传入 |
| 边框光 | CALayer | ::before + gradient | 不支持 | shader |

---

## 58. Liquid Glass（shuding 原始纯 JS 版）— 1.1k Stars

> **仓库地址**：https://github.com/shuding/liquid-glass
> **作者**：Shu Ding（Vercel 前工程师，也是 React Server Components 的贡献者）
> **Stars**：1.1k+ | **语言**：纯 JavaScript | **依赖**：零依赖
> **Demo**：https://v0.dev/chat/dynamic-frame-layout-1VUCCecq7Uy

### 58.1 项目概述

这是**全球首个基于 Web 的液态玻璃开源实现**（早于 liquid-glass-react），由 Vercel 前工程师 Shu Ding 创建。它使用纯 JavaScript + SVG 滤镜实现苹果的 Liquid Glass 效果，**零依赖、零构建**，直接粘贴到浏览器控制台即可运行。

### 58.2 核心特性

- **纯 SVG feDisplacementMap 折射** — 使用 Canvas 动态生成位移贴图
- **roundedRectSDF 着色器** — 基于有符号距离场计算边缘折射
- **smoothStep 平滑过渡** — 确保折射效果在边缘平滑衰减
- **可拖拽** — 玻璃元素可在视口内自由拖拽
- **鼠标追踪** — 着色器可响应鼠标位置
- **视口约束** — 自动限制在浏览器视口范围内

### 58.3 核心源码（liquid-glass.js）

```javascript
// 核心着色器函数 — 边缘折射计算
function smoothStep(a, b, t) {
  t = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function roundedRectSDF(x, y, width, height, radius) {
  const qx = Math.abs(x) - width + radius;
  const qy = Math.abs(y) - height + radius;
  return Math.min(Math.max(qx, qy), 0) +
    length(Math.max(qx, 0), Math.max(qy, 0)) - radius;
}

// 着色器片段 — 液态玻璃折射
const fragment = (uv, mouse) => {
  const ix = uv.x - 0.5;
  const iy = uv.y - 0.5;
  const distanceToEdge = roundedRectSDF(ix, iy, 0.3, 0.2, 0.6);
  const displacement = smoothStep(0.8, 0, distanceToEdge - 0.15);
  const scaled = smoothStep(0, 1, displacement);
  return texture(ix * scaled + 0.5, iy * scaled + 0.5);
};

// 位移贴图生成：遍历每个像素，计算折射偏移
updateShader() {
  const w = this.width * this.canvasDPI;
  const h = this.height * this.canvasDPI;
  const data = new Uint8ClampedArray(w * h * 4);
  let maxScale = 0;
  const rawValues = [];
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % w;
    const y = Math.floor(i / 4 / w);
    const pos = this.fragment({ x: x / w, y: y / h }, mouseProxy);
    const dx = pos.x * w - x;
    const dy = pos.y * h - y;
    maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
    rawValues.push(dx, dy);
  }
  // 归一化并写入 Canvas → toDataURL → SVG feImage
  // ...
  this.feImage.setAttributeNS(
    'http://www.w3.org/1999/xlink', 'href',
    this.canvas.toDataURL()
  );
  this.feDisplacementMap.setAttribute(
    'scale', (maxScale / this.canvasDPI).toString()
  );
}
```

### 58.4 使用方式

**方式一：控制台粘贴（最简单）**

将 `liquid-glass.js` 的完整内容粘贴到任意网站的浏览器控制台，即可在页面上生成一个可拖拽的液态玻璃元素。

**方式二：HTML 引入**

```html
<script src="liquid-glass.js"></script>
```

### 58.5 关联项目

- **shuding/svg-shaders**：https://github.com/shuding/svg-shaders — SVG 着色器库，liquid-glass 的折射算法来源
- **liquid-diamond.js**：同仓库内的变体效果

### 58.6 优缺点

| 优点 | 缺点 |
|------|------|
| 零依赖，控制台即用 | 无 React/Vue 组件封装 |
| SDF 边缘折射效果准确 | 不含色散/色差效果 |
| 可拖拽 + 鼠标追踪 | 动画仅有拖拽，无弹性变形 |
| 代码极简，适合学习 | 功能较少，无按钮/Dock 等 UI 组件 |

---

## 59. Liquid Glass macOS 效果（lucasromerodb）— 纯 HTML+CSS+SVG 含动画

> **仓库地址**：https://github.com/lucasromerodb/liquid-glass-effect-macos
> **作者**：Luke（lucasromerodb）
> **语言**：HTML 70.9% + CSS 29.1% | **依赖**：零依赖
> **Demo**：https://codesandbox.io/p/sandbox/nn5q2y
> **灵感来源**：Apple WWDC 2025 Liquid Effect

### 59.1 项目概述

这是用**纯 HTML + CSS + SVG 滤镜**实现的 macOS 风格液态玻璃效果。包含菜单（Menu）、Dock 导航栏、按钮三种组件，**带有弹性动画**，是纯 CSS 方案中效果最好的之一。

### 59.2 核心特性

- **SVG feTurbulence + feSpecularLighting** — 噪声纹理 + 镜面光照
- **feDisplacementMap 折射** — 基于噪声的位移映射
- **cubic-bezier 弹性动画** — `cubic-bezier(0.175, 0.885, 0.32, 2.2)` 模拟弹簧回弹
- **多层渲染** — effect 层（折射）+ tint 层（着色）+ shine 层（高光）+ text 层
- **Hover 变形动画** — 鼠标悬停时玻璃会弹性膨胀
- **背景滚动动画** — `@keyframes moveBackground` 营造动态感

### 59.3 SVG 滤镜详解

```html
<svg style="display: none">
  <filter id="glass-distortion" x="0%" y="0%"
          width="100%" height="100%"
          filterUnits="objectBoundingBox">
    <!-- 1. 生成噪声纹理 -->
    <feTurbulence type="fractalNoise"
                  baseFrequency="0.001 0.005"
                  numOctaves="1" seed="17"
                  result="turbulence" />

    <!-- 2. 通道映射：只保留 R 通道的偏移 -->
    <feComponentTransfer in="turbulence" result="mapped">
      <feFuncR type="gamma" amplitude="1"
              exponent="10" offset="0.5" />
      <feFuncG type="gamma" amplitude="0"
              exponent="1" offset="0" />
      <feFuncB type="gamma" amplitude="0"
              exponent="1" offset="0.5" />
    </feComponentTransfer>

    <!-- 3. 模糊噪声图，使折射更柔和 -->
    <feGaussianBlur in="turbulence"
                   stdDeviation="3"
                   result="softMap" />

    <!-- 4. 镜面光照（产生高光和阴影） -->
    <feSpecularLighting in="softMap"
                        surfaceScale="5"
                        specularConstant="1"
                        specularExponent="100"
                        lighting-color="white"
                        result="specLight">
      <fePointLight x="-200" y="-200" z="300" />
    </feSpecularLighting>

    <!-- 5. 合成光照效果 -->
    <feComposite in="specLight"
                operator="arithmetic"
                k1="0" k2="1" k3="1" k4="0"
                result="litImage" />

    <!-- 6. 位移折射 -->
    <feDisplacementMap in="SourceGraphic"
                       in2="softMap"
                       scale="200"
                       xChannelSelector="R"
                       yChannelSelector="G" />
  </filter>
</svg>
```

### 59.4 CSS 四层结构

```css
/* 第 0 层：折射效果层 */
.liquidGlass-effect {
  position: absolute;
  z-index: 0;
  inset: 0;
  backdrop-filter: blur(5px);
  filter: url(#glass-distortion);
  overflow: hidden;
  isolation: isolate;
}

/* 第 1 层：着色层 */
.liquidGlass-tint {
  z-index: 1;
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.25);
}

/* 第 2 层：高光层（内阴影模拟边缘反光） */
.liquidGlass-shine {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  box-shadow: inset 2px 2px 1px 0 rgba(255, 255, 255, 0.5),
    inset -1px -1px 1px 1px rgba(255, 255, 255, 0.5);
}

/* 第 3 层：文字内容层 */
.liquidGlass-text {
  z-index: 3;
  font-size: 2rem;
  color: black;
}

/* 弹性动画曲线 — 模拟苹果的弹簧效果 */
.liquidGlass-wrapper {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 2.2);
}

/* Hover 时弹性膨胀 */
.menu:hover { padding: 0.6rem; border-radius: 1.8rem; }
.dock:hover { padding: 0.8rem; border-radius: 2.5rem; }
.button:hover { padding: 1.8rem 2.8rem; }

/* Dock 图标弹性回弹 */
.dock img {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 2.2);
}
.dock img:hover { transform: scale(0.95); }

/* 背景无限滚动动画 */
@keyframes moveBackground {
  from { background-position: 0% 0%; }
  to { background-position: 0% -1500%; }
}
```

### 59.5 包含的组件

| 组件 | 说明 | 动画 |
|------|------|------|
| Menu 菜单 | 多选项下拉菜单，hover 时膨胀 | 弹性 padding + border-radius 变化 |
| Dock 导航栏 | macOS 风格 Dock，含多个应用图标 | 图标 hover 缩小回弹 |
| Button 按钮 | 带图标的圆角按钮 | hover 时弹性膨胀 + 图标缩放 |

### 59.6 优缺点

| 优点 | 缺点 |
|------|------|
| 纯 HTML+CSS+SVG，零 JS 依赖 | 折射效果不如 WebGL 精确 |
| 有弹性动画（cubic-bezier 弹簧） | 全局折射而非仅边缘折射 |
| 包含 Menu/Dock/Button 组件 | Safari/Firefox 部分滤镜不生效 |
| 代码量少，易于理解和修改 | 噪声纹理可能导致"拉丝"感 |

---

## 60. GLSL Playground — 纯 GLSL/WebGL 单文件版（Siri 动画 + 液态玻璃）

> **仓库地址**：https://github.com/aaaa-zhen/glsl-playground
> **作者**：aaaa-zhen（与 Claude AI 协作开发）
> **Stars**：66+ | **语言**：纯 HTML（100%）| **依赖**：零依赖
> **在线预览**：https://aaaa-zhen.github.io/glsl-playground/
> **License**：MIT

### 60.1 项目概述

这是一组 **WebGL / GLSL 着色器实验**，包含三个高质量单文件 HTML Demo：

1. **Siri Wave** — 苹果 Siri 声波动画
2. **Liquid Glass** — 液态玻璃材质渲染
3. **Metaball → Search** — 从屏幕边缘拖出液滴唤起搜索框

每个 Demo 都是**单文件 HTML、零依赖**，浏览器直接打开即可运行，源码即教程。

### 60.2 Demo 1：Siri Wave（Siri 声波动画）

| 特性 | 说明 |
|------|------|
| 声波形态 | 光谱色散 + Lorentzian 发光线 |
| 流体融合 | metaball + smin 平滑融合 |
| 动画 | 欠阻尼弹簧动画 `1 − e^(−lt)·cos(wt)` |
| 交互 | 点击切换形态 |

### 60.3 Demo 2：Liquid Glass（液态玻璃材质）

| 特性 | 说明 |
|------|------|
| 透镜折射 | 位移场折射 |
| 色差 | 多光谱采样做色散 |
| backdrop 模糊 | 两 pass 高斯模糊 |
| 黑顶镜面 | 顶部暗化模拟镜面反射 |
| 赤道亮线 | 距离场驱动的边缘渗光 |
| 交互 | 上传截图 → 玻璃实时折射它；全部参数可调 |

### 60.4 Demo 3：Metaball → Search（液滴搜索）

这是三个 Demo 中**最还原苹果效果**的：

| 特性 | 说明 |
|------|------|
| 拖拽唤起 | 从顶部黑边往下拖，松手凝聚成黑玻璃搜索框 |
| 流体融合 | 梯度感知 smooth-min（液滴渗出时起液颈） |
| SDF 驱动折射 | 距离场控制玻璃折射强度 |
| 连续形变 | CPU 弹簧驱动「圆 → 胶囊」连续形变 |
| supercircle SDF | 圆/胶囊/圆角矩形是同一原语的连续插值 |

### 60.5 核心技术

**渲染管线：**
- 纯 fragment shader 绘制，单个大三角形全屏覆盖（无 mesh、无 draw call 开销）
- 透镜位移场折射 + 两 pass 高斯模糊
- 圆盘多抽样 + mip 联合模糊、距离场驱动的边缘渗光

**形状与融合：**
- metaball SDF + smooth-min 流体融合
- 梯度感知 smooth-min：平滑半径随两表面梯度夹角缩放
- supercircle (squircle) SDF：圆/胶囊/圆角矩形是同一原语的连续插值

**光与动效：**
- 多光谱采样做色散
- `1/(d+t)` 发光线 + Lorentzian 衰减
- 欠阻尼弹簧 `1 − e^(−lt)·cos(wt)` 做自然回弹

### 60.6 优缺点

| 优点 | 缺点 |
|------|------|
| 零依赖单文件，即开即用 | Stars 较少，社区小 |
| GLSL 着色器效果最接近苹果原生 | 需要 WebGL 知识才能修改 |
| 含 Siri 动画（其他项目没有） | 不是组件库，需自行封装 |
| Metaball 流体融合效果惊艳 | Metaball 性能开销较大 |
| 参数可调，适合探索和调试 | 仅 Chromium 内核效果最佳 |

---

## 61. Liquefy UI — React + WebGL 完整组件库（含 Jelly Spring 弹簧动画）

> **仓库地址**：https://github.com/liquefy-ui/liquefy-ui
> **官网**：https://liquefy-ui.com/
> **作者**：yu5ag
> **Stars**：新项目（持续更新中）| **语言**：TypeScript
> **License**：MIT
> **npm 包**：`@liquefy-ui/react`、`@liquefy-ui/core`、`@liquefy-ui/icons`、`@liquefy-ui/mcp`

### 61.1 项目概述

Liquefy UI 是一个**TypeScript UI 组件库**，通过 WebGL 光学、物理弹簧和可访问的 React 原语实现高度透明的液态玻璃效果。包含 **33 个组件 + 44 个图标**，是目前最完整的液态玻璃 React 组件库。

### 61.2 核心特性

- **真实 WebGL 边缘折射** — WebGL 着色器烘焙圆角矩形透镜位移贴图，通过 SVG `feDisplacementMap` 应用到 backdrop-filter，含 RGB 通道色散
- **Jelly 弹簧物理** — scale、skew、tilt 运行在欠阻尼弹簧上；指针速度注入弹簧，快速移动时表面会摇摆
- **单一 WebGL 上下文** — 浏览器限制活跃 WebGL 上下文约 16 个，所有组件共享一个隐藏 GL Canvas
- **SDF 边缘光着色器** — 渲染 SDF 形状的边缘光，含 RGB 色散、虹彩、指针光晕、按下涟漪、移动光泽
- **CSS 降级回退** — WebGL 不可用时自动回退到透明 CSS 材质
- **完整可访问性** — 基于 `@base-ui/react`，提供焦点陷阱、滚动锁定、Escape 处理、roving tabindex

### 61.3 组件清单（33 个组件）

| 类别 | 组件 |
|------|------|
| 输入 | LiquidButton, LiquidIconButton, LiquidCheckbox, LiquidRadioGroup, LiquidSwitch, LiquidSlider, LiquidTextField, LiquidTextArea, LiquidSelect, LiquidSegmented, LiquidRating |
| 数据展示 | LiquidAvatar, LiquidBadge, LiquidChip, LiquidTooltip, LiquidTable, LiquidList, LiquidDivider |
| 反馈 | LiquidAlert, LiquidProgress, LiquidSpinner, LiquidSkeleton, LiquidToastProvider, LiquidDialog |
| 表面 | LiquidSurface, GlassCard, LiquidAccordion |
| 导航 | LiquidTabs, LiquidBreadcrumbs, LiquidPagination, LiquidMenu, LiquidDrawer, **GlassDock** |
| 基础 | LiquefyProvider, useLiquefyConfig, useLiquidGlass, useLiquidStyles |

### 61.4 安装与使用

```bash
pnpm add @liquefy-ui/react @liquefy-ui/core @liquefy-ui/icons
```

```tsx
import { LiquefyProvider, LiquidButton } from '@liquefy-ui/react'
import { SparklesIcon } from '@liquefy-ui/icons'
import '@liquefy-ui/react/styles.css'

export function App() {
  return (
    <LiquefyProvider theme="system" tint="#8f8f8f">
      <LiquidButton iconBefore={<SparklesIcon />}>
        Create magic
      </LiquidButton>
    </LiquefyProvider>
  )
}
```

### 61.5 AI Agent 工具集成（亮点）

Liquefy UI 为 AI 编程助手提供了完善的工具链：

| 工具 | 用途 |
|------|------|
| MCP Server | `claude mcp add liquefy-ui -- npx -y @liquefy-ui/mcp` — 8 个工具从真实导出回答组件问题 |
| `llms.txt` | `/llms.txt` 和 `/llms-full.txt`，从源码生成 |
| 组件文档 | 每个组件一页 Markdown，如 `/llms/liquid-button.md` |
| shadcn Registry | `npx shadcn@latest add @liquefy-ui/liquid-button` — 无需 components.json |

### 61.6 Jelly Spring 动画详解

```typescript
// 欠阻尼弹簧公式
// x(t) = 1 - e^(-λt) * cos(ωt)
// λ = 阻尼系数, ω = 角频率

// 指针速度注入弹簧：
// 快速移动 → 弹簧获得更多能量 → 表面摇摆
// 按下/释放 → 产生多次可见过冲

// 着色器同步：u_wobble 接收相同的能量值
// → 边缘 wiggle 与变形同步
```

### 61.7 styles 属性系统

Liquefy UI 提供了强大的 `styles` prop 系统，超越普通 `style`：

```tsx
<LiquidButton
  styles={{
    color: 'accent',            // 颜色词解析为 var(--lq-accent)
    p: 3,                       // 间距键计数 --lq-space 单位
    w: { base: '100%', md: 240 }, // 响应式，按断点
    boxShadow: '$shadow',       // $token → var(--lq-token)
    _hover: { bg: '$glass-soft' },
    _dark: { opacity: 0.92 },
    '&:has(svg)': { gap: 2 },
  }}
>
  Create magic
</LiquidButton>
```

### 61.8 优缺点

| 优点 | 缺点 |
|------|------|
| 33 个完整组件，即开即用 | 新项目，Stars 少 |
| WebGL 真实折射 + Jelly 弹簧 | 需 pnpm 管理器 |
| 支持 Next.js RSC + Tailwind v4 | WebKit/Gecko 回退为 CSS 模糊 |
| MCP Server + llms.txt 支持 AI | 学习曲线稍陡 |
| shadcn Registry 可直接拷贝源码 | 包体积较大 |

---

## 62. 更多 GitHub 液态玻璃项目汇总

以下是在 GitHub 上搜索到的更多液态玻璃相关项目，按类型分类：

### 62.1 Web 端（HTML/CSS/JS）

| 项目 | 地址 | 说明 |
|------|------|------|
| Liquid Glass for the Web | https://github.com/topics/liquid-glass | GitHub Topic 汇总页 |
| Copy-paste Liquid Glass shader with SVG | GitHub 搜索可找到 | 可直接复制粘贴的 SVG 着色器版 |
| liquidGL – Ultra-light glassmorphism | GitHub 搜索可找到 | 超轻量玻璃拟态库 |
| Apple-style liquid glass (single HTML) | GitHub 搜索可找到 | 零依赖单文件 HTML + WebGL 折射 + CSS 玻璃 |
| Liquid Glass WebGL optics lab | GitHub 搜索可找到 | 独立 WebGL/GLSL 光学实验室，可用于视频和图像 |

### 62.2 React/前端框架版

| 项目 | 地址 | 说明 |
|------|------|------|
| Liquid Glass UI (React + WebGL) | GitHub 搜索 "liquid glass react webgl" | React 组件 + SVG 滤镜 + WebGL，含果冻弹簧 |
| Liquid-glass React Cover Flow | GitHub 搜索 "liquid glass coverflow" | 3D 封面流组件，带反射和运动调校 |
| Framer Liquid Glass | GitHub 搜索 "liquid glass framer" | 三个 Framer 代码组件：折射液态玻璃 + WebGL chrome 着色器 |
| Liquid Glass procedural WebGL (Framer) | GitHub 搜索 | Framer 高级程序化 WebGL 组件，动态折射表面 |

### 62.3 原生移动端

| 项目 | 地址 | 说明 |
|------|------|------|
| @callstack/liquid-glass | https://github.com/callstack/liquid-glass | React Native 版，调用原生 iOS GlassEffect API |
| Liquid Glass Compose (Android) | GitHub 搜索 "liquid glass compose" | Jetpack Compose 玻璃拟态库，AGSL 着色器 |
| Liquid Glass Android (AGSL) | GitHub 搜索 "liquid glass android agsl" | Android 原生 AGSL 边缘折射 + 凝胶按压 |
| Liquid Glass Flutter | GitHub 搜索 "liquid glass flutter" | Flutter UI Kit，iOS 26 设计语言，真实着色器模糊 |
| Liquid Glass Compose Multiplatform | GitHub 搜索 | Compose Multiplatform 液态玻璃效果 |
| KMP Liquid Glass | GitHub 搜索 "kotlin liquid glass" | Kotlin Multiplatform，GPU 加速渲染 |

### 62.4 SwiftUI/iOS 原生

| 项目 | 地址 | 说明 |
|------|------|------|
| iOS 26 Liquid Glass Swift Reference | GitHub 搜索 "ios 26 liquid glass swift" | Swift/SwiftUI 终极参考文档 |
| LiquidGlass Button (SwiftUI) | GitHub 搜索 "liquidglass button swiftui" | 美丽玻璃拟态按钮组件 |
| SwiftUI Liquid Glass drag | GitHub 搜索 "swiftui liquid glass drag" | 拖拽手势 + 液态玻璃合并视图 |
| SwiftUI elastic stretchy | GitHub 搜索 "swiftui elastic liquid glass" | 弹性拉伸动画，拖拽时视图如液态玻璃 |
| iOS 26 Liquid Glass Showcase | GitHub 搜索 "swiftui liquid glass showcase" | 完整演示，含交互示例、形变动画、代码 |
| Liquid Glass backport (iOS 13-18) | GitHub 搜索 "liquid glass backport" | 向后移植到 iOS 13-18，原生 API 对等 |
| Liquid Glass Übersicht | GitHub 搜索 "liquid glass ubersicht" | Übersicht 桌面小部件渲染器，共享 WebGL 上下文 |

### 62.5 其他创意项目

| 项目 | 地址 | 说明 |
|------|------|------|
| Google.com LiquidGlass tribute | GitHub 搜索 "google liquid glass tribute" | 用苹果 iOS 26 液态玻璃重新设计 Google 首页，纯 HTML+CSS |
| Spotify Liquid Glass theme | GitHub 搜索 "spotify liquid glass" | Spotify 主题，动态色彩 + 液态玻璃 + 动画 |
| Convx (Android Music) | GitHub 搜索 "convx liquid glass" | YouTube Music 流媒体播放器，iOS 风格液态玻璃界面 |
| Liquid Glass After Effects | GitHub 搜索 "liquid glass after effects" | GPU 加速 AE 特效，macOS Metal + Windows CUDA |
| Electron Liquid Glass bindings | GitHub 搜索 "electron liquid glass" | Electron 绑定苹果液态玻璃 |
| Liquid Glass video platform | GitHub 搜索 "liquid glass video nextjs" | Next.js 16 视频聚合平台，液态玻璃设计语言 |

---

## 63. Liquid Glass 动画系统详解

苹果 Liquid Glass 的核心不仅是静态的玻璃材质，更重要的是**动态交互和动画**。以下是实现液态玻璃动画的完整方案。

### 63.1 三种动画方案对比

| 方案 | 实现 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|---------|
| CSS cubic-bezier | `transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 2.2)` | 简单、高性能、无需 JS | 无法精确控制弹簧物理 | Hover/Click 变形 |
| JS 欠阻尼弹簧 | `x(t) = 1 - e^(-λt) * cos(ωt)` | 物理精确、自然回弹 | 需 JS 每帧计算 | 拖拽、形变、连续动画 |
| GLSL 着色器动画 | uniform 传入时间/鼠标 → 顶点/片段位移 | GPU 加速、效果最佳 | 需 WebGL 知识 | 折射、色散、涟漪 |

### 63.2 CSS 弹簧动画曲线

苹果在 iOS 中使用的弹簧动画可以通过 CSS `cubic-bezier` 近似模拟：

```css
/* 苹果默认弹簧 — 中等弹性 */
transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 2.2);

/* 苹果强弹簧 — 明显过冲（类似 iOS 控制中心） */
transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);

/* 苹果弱弹簧 — 轻微回弹（类似 Dock） */
transition: all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);

/* 苹果弹性回弹 — 多次振荡 */
transition: all 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

### 63.3 JavaScript 欠阻尼弹簧动画

```javascript
class UnderdampedSpring {
  constructor(damping = 0.3, frequency = 1.5) {
    this.damping = damping;    // λ — 阻尼系数（越大回弹越快衰减）
    this.frequency = frequency; // ω — 角频率（越大振荡越快）
    this.startValue = 0;
    this.targetValue = 0;
    this.startTime = 0;
  }

  // 设置目标值，触发弹簧动画
  setTarget(target) {
    this.startValue = this.getCurrentValue();
    this.targetValue = target;
    this.startTime = performance.now();
  }

  // 获取当前弹簧值
  getCurrentValue() {
    const t = (performance.now() - this.startTime) / 1000;
    if (t <= 0) return this.startValue;
    
    // 欠阻尼弹簧公式: x(t) = target - (target - start) * e^(-λt) * cos(ωt)
    const decay = Math.exp(-this.damping * t);
    const oscillation = Math.cos(this.frequency * t);
    return this.targetValue - 
      (this.targetValue - this.startValue) * decay * oscillation;
  }

  // 指针速度注入（苹果效果的关键）
  injectVelocity(velocity) {
    // 速度越大 → 弹簧获得更多能量 → 摇摆幅度越大
    this.frequency += Math.abs(velocity) * 0.01;
  }
}

// 使用示例
const spring = new UnderdampedSpring(0.3, 1.5);
spring.setTarget(1.0); // 从 0 弹到 1

function animate() {
  const value = spring.getCurrentValue();
  element.style.transform = `scale(${value})`;
  if (Math.abs(value - 1.0) > 0.001) {
    requestAnimationFrame(animate);
  }
}
animate();
```

### 63.4 GLSL 着色器动画（折射 + 涟漪）

```glsl
// 顶点着色器 — 顶点位移
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_wobble; // 从 JS 弹簧传入的能量值

void main() {
  vec3 pos = position;
  
  // 鼠标接近时玻璃弯曲
  vec2 toMouse = u_mouse - pos.xy;
  float distToMouse = length(toMouse);
  float bendFactor = smoothstep(0.5, 0.0, distToMouse);
  pos.z += bendFactor * 0.1 * u_wobble;
  
  // 边缘 wiggle（与弹簧同步）
  float edgeWiggle = sin(u_time * 3.0 + pos.x * 10.0) * 0.005 * u_wobble;
  pos.x += edgeWiggle;
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

// 片段着色器 — 折射 + 色散 + 涟漪
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_wobble;
uniform sampler2D u_backdrop;

void main() {
  vec2 uv = vUv;
  
  // 透镜折射位移
  vec2 center = vec2(0.5);
  vec2 toCenter = center - uv;
  float dist = length(toCenter);
  float lensFactor = smoothstep(0.5, 0.3, dist);
  vec2 displacement = normalize(toCenter) * lensFactor * 0.02;
  
  // RGB 色散（红绿蓝三通道偏移量不同）
  float aberration = 0.003 * u_wobble;
  float r = texture2D(u_backdrop, uv + displacement + vec2(aberration, 0)).r;
  float g = texture2D(u_backdrop, uv + displacement).g;
  float b = texture2D(u_backdrop, uv + displacement - vec2(aberration, 0)).b;
  
  // 按下涟漪
  float ripple = sin(dist * 30.0 - u_time * 10.0) * 
                 smoothstep(0.3, 0.0, dist) * u_wobble * 0.1;
  
  // 边缘高光（菲涅尔效应）
  float fresnel = pow(1.0 - dist * 2.0, 3.0);
  
  vec3 color = vec3(r, g, b);
  color += fresnel * 0.3; // 边缘高光
  color += ripple;       // 涟漪
  
  gl_FragColor = vec4(color, 0.9);
}
```

### 63.5 苹果 Liquid Glass 动画效果清单

| 动画效果 | 苹果原生实现 | Web 复刻方案 | 触发条件 |
|---------|------------|------------|---------|
| 玻璃显隐过渡 | 逐渐改变光线折射和透射 | opacity + filter transition | 显示/隐藏 |
| 悬停膨胀 | UIKit Spring 动画 | cubic-bezier 弹簧 | mouseenter |
| 按下凹陷 | UIKit Spring + 触觉反馈 | transform: scale(0.95) | mousedown |
| 拖拽变形 | UIPanGesture + 弹性变形 | JS 弹簧 + transform | drag |
| 鼠标追踪变形 | UIKit 焦点追踪 | transform: scale(x,y) | mousemove |
| 内容流动 | CoreAnimation | backdrop-filter + 滚动 | scroll |
| 切换状态 | 玻璃从磨砂→透明 | blur 0 → blur 24px | active |
| Dock 放大 | magnification filter | transform: scale(1+x) | mouseover |
| 涟漪扩散 | CAAnimation | canvas/SVG ripple | click |
| 边缘渗光 | CALayer 光照 | shader fresnel | 始终 |

---

## 64. 更新后的完整方案对比表（12 种方案）

| # | 方案 | 渲染技术 | Stars | 真实折射 | 动画 | 性能 | 复杂度 | 依赖 | 组件数 |
|---|------|---------|-------|---------|------|------|--------|------|--------|
| 1 | **CSS backdrop-filter** | CSS | - | 否 | CSS transition | 极高 | 极低 | 无 | 自行实现 |
| 2 | **Liquid Glass React** (rdev) | SVG + CSS | 6K+ | 模拟 | 弹性变形 | 高 | 低 | npm | 1 组件 |
| 3 | **Liquid Glass Studio** | WebGL2 + WebGPU | 656 | 是 | Spring 动画 | 中 | 中 | 需构建 | 1 组件 |
| 4 | **ektogamat Three.js** | Three.js mesh | 157 | 是（3D） | Three.js 动画 | 低 | 高 | 需构建 | 1 组件 |
| 5 | **Oliverrr2424 WebGL2** | WebGL2 着色器 | 118 | 物理 | 自定义 | 中高 | 高 | 需构建 | 1 组件 |
| 6 | **@callstack/liquid-glass** | 原生 iOS | 1.6K | 是 | iOS 原生 | 高 | 中 | npm | 1 组件 |
| 7 | **shuding/liquid-glass** | SVG + Canvas + JS | 1.1K | SDF 折射 | 拖拽 | 高 | 极低 | 无 | 1 组件 |
| 8 | **lucasromerodb macOS** | HTML + CSS + SVG | - | 噪声折射 | cubic-bezier 弹簧 | 高 | 低 | 无 | 3 组件 |
| 9 | **aaaa-zhen GLSL** | 纯 GLSL/WebGL | 66 | 物理 | 欠阻尼弹簧 | 中 | 高 | 无 | 3 Demo |
| 10 | **Liquefy UI** | React + WebGL | 新 | 是 | Jelly 弹簧 | 中 | 中 | pnpm | 33 组件 |
| 11 | **liquid-glass-compose** (Android) | AGSL 着色器 | - | 是 | Android 动画 | 高 | 中 | Gradle | 多组件 |
| 12 | **Framer Liquid Glass** | WebGL + Framer | - | 是 | Framer Motion | 中 | 中 | Framer | 3 组件 |

### 64.1 按需求选型

| 需求场景 | 推荐方案 | 理由 |
|---------|---------|------|
| 伪系统 Dock 导航栏 | 方案 8 (lucasromerodb) | 纯 CSS+SVG，有 Dock 组件和弹性动画，零依赖 |
| 伪系统控制中心 | 方案 10 (Liquefy UI) | 33 个组件含 Switch/Slider/Dialog，WebGL 折射 + 弹簧 |
| 伪系统按钮/菜单 | 方案 2 (Liquid Glass React) | 成熟稳定，6K Stars，弹性变形 + 色散 |
| 伪系统搜索框 | 方案 9 (GLSL Playground) | Metaball 拖拽唤起搜索，最还原苹果效果 |
| 快速原型/演示 | 方案 7 (shuding) | 控制台粘贴即用，零依赖 |
| 最高视觉效果 | 方案 3 (Studio) 或 9 (GLSL) | WebGL 物理折射 + 色散 + 弹簧 |
| 移动端伪系统 | 方案 6 (@callstack) | React Native 原生 iOS GlassEffect |
| 纯 CSS 无 JS | 方案 1 (CSS) 或 8 (lucasromerodb) | 零依赖，最高性能 |

---

## 65. 伪系统液态玻璃最终选型建议

### 65.1 推荐混合方案

对于伪系统，建议采用**分层混合方案**：

```
┌─────────────────────────────────────────────────┐
│              伪系统液态玻璃架构                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  底层：CSS backdrop-filter 基础毛玻璃               │
│  ↑ 所有玻璃元素的基础效果，保证性能                   │
│                                                 │
│  中层：SVG feDisplacementMap 边缘折射               │
│  ↑ 按钮菜单等关键元素，增加折射质感                   │
│  ↑ 参考 lucasromerodb 的 SVG 滤镜                  │
│                                                 │
│  顶层：WebGL/GLSL 着色器（可选）                    │
│  ↑ Dock/搜索框/控制中心等视觉焦点                    │
│  ↑ 参考 GLSL Playground 的 Metaball 搜索           │
│                                                 │
│  动画层：JS 欠阻尼弹簧 + CSS cubic-bezier           │
│  ↑ 所有交互元素统一使用弹簧动画                      │
│  ↑ cubic-bezier(0.175, 0.885, 0.32, 2.2)         │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 65.2 具体实施步骤

1. **基础毛玻璃层** — 所有面板/卡片使用 CSS `backdrop-filter: blur(24px) saturate(180%)`
2. **边缘折射** — 关键交互元素（按钮、Dock）使用 SVG `feDisplacementMap`
3. **弹性动画** — 统一使用 `cubic-bezier(0.175, 0.885, 0.32, 2.2)` 过渡
4. **鼠标追踪** — JS 监听 mousemove，计算方向性缩放（参考 Liquid Glass React 源码）
5. **搜索框特效** — 参考 GLSL Playground 的 Metaball → Search，实现拖拽唤起
6. **控制中心** — 参考 Liquefy UI 的 LiquidSwitch / LiquidSlider 组件
7. **Siri 动画** — 参考 GLSL Playground 的 siri-wave.html，实现声波动画

### 65.3 性能优化建议

- WebGL 上下文限制约 16 个 → 共享单个 GL Canvas（参考 Liquefy UI）
- SVG 滤镜在 Safari/Firefox 部分不支持 → CSS 降级回退
- backdrop-filter 性能开销大 → 仅对可见区域应用
- 弹簧动画使用 `requestAnimationFrame` → 避免布局抖动
- 大面积玻璃使用 CSS 方案 → 小面积重点元素使用 WebGL

### 65.4 Vibe Coding 提示（给下一个 AI 的指令）

```
你是伪系统的前端开发者。需要实现苹果 Liquid Glass 液态玻璃效果。

技术要求：
1. 基础层：CSS backdrop-filter: blur(24px) saturate(180%) + rgba 背景
2. 折射层：SVG feDisplacementMap（参考 lucasromerodb/liquid-glass-effect-macos 的滤镜）
3. 动画层：CSS cubic-bezier(0.175, 0.885, 0.32, 2.2) 弹簧曲线
4. 鼠标追踪：JS 计算方向性 scale（参考 liquid-glass-react 的 calculateDirectionalScale）
5. 搜索框：GLSL Metaball 形变（参考 aaaa-zhen/glsl-playground）
6. 性能：WebGL 上下文共享，CSS 降级回退

参考项目：
- liquid-glass-react (rdev) — React 弹性变形 + 色散
- liquid-glass-effect-macos (lucasromerodb) — 纯 CSS+SVG 含动画
- glsl-playground (aaaa-zhen) — 纯 GLSL Siri 动画 + Metaball 搜索
- liquefy-ui — 33 个 React 组件 + WebGL + Jelly 弹簧
```

---

## 附注

- **浏览器 API** 均为原生内置，无需安装，但需注意浏览器兼容性（Chrome 支持最好）
- **系统级权限**（摄像头、定位等）需用户授权，首次调用会弹出权限请求
- **第三方平台 API** 大部分需要注册开发者账号并审核
- **iframe 嵌入** 很多主流网站禁止被 iframe 嵌入，需用桌面壳或 API 方案绕过
- **安全策略** CSP 和 X-Frame-Options 是保护伪系统自身不被嵌入的安全措施
- 本目录已包含以下解压文件可离线查阅：
  - `public-apis-master/` - 国际免费 API 大全（1400+个）
  - `free-api-master/` - 中文免费 API 合集（600+个）
  - `bili-apis-master/` - B站 API 收集整理
  - `liquid-glass-react-master/` - 液态玻璃 React UI 组件库（含完整源码：index.tsx / shader-utils.ts / utils.ts）
- 本文档还收录了以下 GitHub 项目的完整分析（可通过地址在线访问或克隆）：
  - `shuding/liquid-glass` - 原始纯 JS 版（1.1k Stars，控制台即用）
  - `lucasromerodb/liquid-glass-effect-macos` - 纯 HTML+CSS+SVG 含动画版（Menu/Dock/Button）
  - `aaaa-zhen/glsl-playground` - 纯 GLSL/WebGL 单文件版（Siri 动画 + Metaball 搜索）
  - `liquefy-ui/liquefy-ui` - React + WebGL 完整组件库（33 组件 + Jelly 弹簧 + MCP Server）
  - `liquid-glass-studio/` - WebGL2 + WebGPU 终极版
- 液态玻璃共收录 **12 种方案**，涵盖 CSS / SVG / Canvas / WebGL / WebGPU / GLSL / Three.js / AGSL 多种渲染技术
- 所有方案均包含动画效果（CSS cubic-bezier 弹簧 / JS 欠阻尼弹簧 / GLSL 着色器动画）

---

*N聊项目文档原生成时间: 2026-08-18*  
*完整版整合时间: 2026-09-01*  
*液态玻璃扩展更新: 2026-09-02（新增 8 个项目 + 动画系统详解 + 12 方案对比）*

---

### 第九部分：动画效果与 AI 能力扩展（第 66–73 章）

- [66. macOS Genie Effect Web 实现（1:1 还原）](#66-macos-genie-effect-web-实现1-1-还原)
- [67. Liquid DOM — WebGPU 顶级液态玻璃（最新项目）](#67-liquid-dom--webgpu-顶级液态玻璃最新项目)
- [68. 性能开销对比与硬件分级（AI 切换指南）](#68-性能开销对比与硬件分级ai-切换指南)
- [69. 高品质磨砂玻璃（低端设备方案）](#69-高品质磨砂玻璃低端设备方案)
- [70. Web 本地语音识别模型（离线/WASM）](#70-web-本地语音识别模型离linewasm)
- [71. Web 本地 LLM（系统级 AI 核心）](#71-web-本地-llm系统级-ai-核心)
- [72. Web Siri Orb 动画（iOS 风格 AI 球）](#72-web-siri-orb-动画ios-风格-ai-球)
- [73. AI 边框跑马灯动画（iOS 风格流光边框）](#73-ai-边框跑马灯动画ios-风格流光边框)

---

## 66. macOS Genie Effect Web 实现（1:1 还原）

### 66.1 算法原理

苹果 Genie Effect（精灵效果/神奇缩放）通过以下步骤实现窗口最小化动画：

1. **窗口快照**：动画开始前截取窗口当前画面到离屏 Canvas
2. **网格切片**：将窗口垂直分割为 40 个切片（`SLICE_COUNT=40`）
3. **底部剪切**：底部切片先收缩宽度，顶部切片保持不变
4. **曲线路径**：窗口沿曲线流向 Dock 图标位置
5. **整体缩放**：到达目标位置时整体缩小至 Dock 图标大小
6. **弹性回弹**：到达目标位置后产生微小弹跳指示器

核心数学公式：

```javascript
// 欠阻尼弹簧缓动函数（用于弹性回弹）
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// 三次贝塞尔缓动（用于主动画曲线）
// cubic-bezier(0.175, 0.885, 0.32, 2.2) — Apple 标准弹簧曲线
function cubicBezier(t, p1x, p1y, p2x, p2y) {
  // 简化版：使用参数方程近似
  const u = 1 - t;
  return 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t;
}
```

### 66.2 完整源码（genie-effect-demo.html）

> 源码文件位置：`genie-effect-demo.html`（与本文档同目录）
> 文件大小：约 633 行 HTML + CSS + JS

**关键参数说明（可修改）**：

| 参数 | 默认值 | 作用 | 修改建议 |
|------|--------|------|---------|
| `GENIE_DURATION` | `0.7` | 动画时长（秒） | 调小→更快；调大→更慢更丝滑 |
| `FPS` | `60` | 帧率 | 保持 60；高端设备可设 120 |
| `SLICE_COUNT` | `40` | 网格切片数 | 调大→更精细但更耗性能；调小→更快但粗糙 |
| `slideEnd` | `0.5` | 剪切阶段占比 | 调大→变形更明显；调小→更快收缩 |
| `translateStart` | `0.4` | 位移开始时间 | 调大→延迟位移；调小→更早开始移动 |
| `widthScale` | `1 - shearAmount * 0.85` | 切片宽度缩放 | `0.85` 控制最大收缩程度 |

**核心动画函数（Genie 模式）**：

```javascript
function animateGenie(snapshot) {
  const { canvas: srcCanvas, x: startX, y: startY, w, h } = snapshot;
  const dockRect = dockTarget.getBoundingClientRect();
  const targetX = dockRect.left + dockRect.width / 2;
  const targetY = dockRect.top + dockRect.height / 2;
  
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';
  win.style.opacity = '0';
  
  const frameCount = GENIE_DURATION * FPS; // 0.7秒 × 60帧 = 42帧
  const slideEnd = 0.5;      // 剪切阶段占50%动画时间
  const translateStart = 0.4; // 位移阶段从40%开始
  
  function renderFrame(frame) {
    const fraction = frame / (frameCount - 1);
    const slideProgress = Math.max(0, Math.min(1, fraction / slideEnd));
    const translateProgress = Math.max(0, Math.min(1, 
      (fraction - translateStart) / (1 - translateStart)));
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 逐切片绘制
    for (let i = 0; i < SLICE_COUNT; i++) {
      const sliceFraction = i / (SLICE_COUNT - 1); // 0=底部, 1=顶部
      const srcY = sliceFraction * h;
      const sliceH = h / SLICE_COUNT;
      
      // 底部切片收缩更多（Genie 核心特征）
      const shearAmount = (1 - sliceFraction) * slideProgress;
      const widthScale = 1 - shearAmount * 0.85;
      const newWidth = w * widthScale;
      
      // 水平位移：底部向 Dock 目标移动更多
      const originalCenterX = startX + w / 2;
      const horizShift = (targetX - originalCenterX) * shearAmount;
      const sliceCenterX = originalCenterX + horizShift;
      
      // 垂直位移与整体缩放
      const verticalShift = (targetY - (startY + h / 2)) * translateProgress;
      const overallScale = 1 - translateProgress * 0.9;
      const finalY = startY + srcY * (1 - translateProgress * 0.3) 
                     + verticalShift * sliceFraction;
      
      // 绘制变形后的切片
      ctx.drawImage(srcCanvas, 
        0, srcY, w, sliceH,           // 源区域
        sliceCenterX - newWidth/2,     // 目标 X
        finalY,                        // 目标 Y
        newWidth,                      // 目标宽
        sliceH * overallScale          // 目标高
      );
    }
  }
  
  // 动画循环
  let currentFrame = 0;
  function step() {
    if (currentFrame >= frameCount) {
      canvas.style.display = 'none';
      isAnimating = false;
      isMinimized = true;
      // 显示 Dock 弹跳指示器
      bounceIndicator.style.display = 'block';
      setTimeout(() => bounceIndicator.style.display = 'none', 2000);
      return;
    }
    renderFrame(currentFrame);
    currentFrame++;
    requestAnimationFrame(step);
  }
  step();
}
```

### 66.3 三种动画模式对比

| 模式 | 特征 | 适用场景 | 性能开销 |
|------|------|---------|---------|
| **Genie**（精灵） | 底部先收缩，沿曲线吸入 Dock | 窗口最小化（1:1 还原 macOS） | 中高（30-50% GPU） |
| **Scale**（缩放） | 整体等比缩小至 Dock | 轻量设备 / 快速最小化 | 低（10-20% GPU） |
| **Squish**（挤压） | 垂直压缩后吸入 | 替代方案 / 旧设备 | 低（10-15% GPU） |

### 66.4 如何修改

1. **调整动画时长**：修改 `GENIE_DURATION` 常量
2. **调整切片精度**：修改 `SLICE_COUNT`（低端设备建议 20，高端 60）
3. **修改 Dock 目标位置**：修改 `dockTarget` 的 DOM 引用
4. **添加窗口恢复动画**：从 Dock 点击时反向播放动画（`fraction` 从 1→0）
5. **调整弹性曲线**：在 `renderFrame` 中对 `slideProgress` 应用 `easeOutBack()`

### 66.5 Vibe Coding 提示

```
你是伪系统的前端开发者。需要实现 macOS Genie Effect 窗口最小化动画。

技术要求：
1. 使用 Canvas 2D + drawImage 网格切片变形
2. 窗口快照：动画前用 html2canvas 或 DOM 镜像截取窗口画面
3. 40 个垂直切片，底部先收缩（shearAmount 与 sliceFraction 成反比）
4. 弹簧缓动：cubic-bezier(0.175, 0.885, 0.32, 2.2)
5. 动画时长 0.7s × 60fps = 42帧
6. 三种模式：Genie（精灵）/ Scale（缩放）/ Squish（挤压）

参考文件：genie-effect-demo.html（完整源码在同目录）
```

---

## 67. Liquid DOM — WebGPU 顶级液态玻璃（最新项目）

### 67.1 项目概览

| 字段 | 详情 |
|------|------|
| **仓库名** | AndrewPrifer/liquid-dom |
| **GitHub** | https://github.com/AndrewPrifer/liquid-dom |
| **Stars** | 2,474（截至 2026-09-01） |
| **创建时间** | 2026-04-18 |
| **最近更新** | 2026-08-26（非常活跃） |
| **语言** | TypeScript |
| **许可证** | 未指定（查看仓库确认） |
| **Demo** | https://liquid-dom-showcase.vercel.app |
| **渲染技术** | **WebGPU**（非 WebGL） |

### 67.2 核心特性（8 项物理级渲染）

1. **自研 SDF 渲染引擎**：基于有符号距离场（Signed Distance Field），逐帧逐像素在 GPU 上模拟光线穿过真实玻璃的物理行为
2. **Shape Morphing（形状形变）**：两块玻璃之间可平滑过渡，中间状态的折射和反射也是物理正确的
3. **动态折射**：玻璃后面的内容真的会被"拉弯"，弯曲程度取决于玻璃厚度轮廓
4. **自适应高光**：高光合成时保留背景色，不是简单叠白色光斑
5. **色散（Chromatic Aberration）**：玻璃斜角处出现彩虹般色散
6. **自适应着色（Adaptive Tint）**：玻璃色调随背后内容明暗实时调整
7. **自适应模糊核**：小半径 17 tap，大半径自动切换 5 tap（2px 模糊时 5 tap 比 17 tap 快 3 倍）
8. **厚度轮廓（Thickness Profile）**：可修改玻璃高度剖面（底部厚、顶部薄），做出侧边栏折射主内容区颜色效果

### 67.3 包结构（Monorepo，5 个包）

| 包名 | 用途 | 适用场景 |
|------|------|---------|
| `@liquid-dom/core` | 命令式 DOM 场景图 + WebGPU 渲染器 + 玻璃核心 + 布局类 | 直接控制场景图或构建适配器 |
| `@liquid-dom/react` | React 19 绑定，`LiquidCanvas` 组件拥有 canvas | 声明式描述玻璃 UI（推荐） |
| `@liquid-dom/three` | 在 Three.js WebGPU 渲染器上叠加液态玻璃层 | 已有 Three WebGPU 场景 |
| `@liquid-dom/r3f` | React Three Fiber 桥接 | R3F + Three WebGPU 用户 |
| `@liquid-dom/layout` | 渲染器无关的布局引擎（SwiftUI 风格） | 无需渲染器依赖的布局 |

### 67.4 安装与使用

**前置条件**：
- Chrome 113+（需 WebGPU 支持）
- Node.js 18+
- 开启 Chrome 实验开关：`chrome://flags/#canvas-draw-element` → `Enabled` → 重启浏览器

> 不开此开关：React 组件能渲染，但 HTML-in-Canvas 部分不显示（纯玻璃效果不受影响，但缺少"HTML 内容也被折射"的功能）。

```bash
# React 项目（推荐）
pnpm add @liquid-dom/react react react-dom

# 已有 Three.js WebGPU 项目
pnpm add @liquid-dom/three @liquid-dom/core three

# React Three Fiber 用户
pnpm add @liquid-dom/r3f @liquid-dom/react @react-three/fiber react react-dom three
```

> **注意**：Three.js 集成必须使用 WebGPU 渲染器（`WebGPURenderer`），不是 `WebGLRenderer`。如果项目还在用 WebGL，需先迁移。

**基本用法（React）**：

```jsx
import { LiquidCanvas, Glass } from '@liquid-dom/react'

function App() {
  return (
    <LiquidCanvas>
      {/* 所有放入 LiquidCanvas 的内容都会被当作玻璃渲染 */}
      <Glass 
        blurRadius={24}           // 模糊半径
        cornerRadius={20}         // 圆角
        tint="adaptive"           // 自适应着色
        thicknessProfile="convex" // 厚度轮廓
      >
        <div className="p-6">
          <h2>窗口标题</h2>
          <p>这块区域会被当作液态玻璃渲染</p>
        </div>
      </Glass>
    </LiquidCanvas>
  )
}
```

### 67.5 性能特征

- **120 FPS**：自适应模糊核是浏览器中跑 120 FPS 的核心原因
- **GPU 要求**：需 WebGPU 兼容 GPU（集成显卡可用，独立显卡更佳）
- **内存**：约 200-500MB（取决于玻璃面积和数量）
- **降级方案**：不支持 WebGPU 的浏览器需降级到 WebGL 或 CSS 方案

### 67.6 仓库内关键技术文档

| 文档 | 内容 |
|------|------|
| `ADAPTIVE_BLUR_PERF.md` | 5/9/13/17 tap 四种核在不同半径下的 GPU 开销对比 |
| `ADAPTIVE_TINT.md` | 自适应着色完整参考实现（防抖 ~300ms，指数缓动 ~500ms） |

---

## 68. 性能开销对比与硬件分级（AI 切换指南）

### 68.1 完整性能对比表（16 种方案）

| # | 方案 | 渲染技术 | GPU 占用 | CPU 占用 | 内存 | 最低配置 | 推荐场景 | 动画质量 |
|---|------|---------|---------|---------|------|---------|---------|---------|
| 1 | **CSS backdrop-filter 基础毛玻璃** | CSS | 低（5-15%） | 低（<5%） | <20MB | 任意设备 | 全局背景/面板 | 无动画 |
| 2 | **CSS + cubic-bezier 弹簧毛玻璃** | CSS | 低（10-20%） | 低（<8%） | <30MB | 集成显卡 | 按钮/卡片交互 | 弹簧动画 |
| 3 | **高品质磨砂玻璃（CSS 增强）** | CSS + SVG | 低中（15-25%） | 低（<10%） | <50MB | 集成显卡 | 低端设备主力效果 | 微动画 |
| 4 | **SVG feDisplacementMap 边缘折射** | SVG | 中（20-30%） | 中（10-15%） | 50-100MB | 中端集成显卡 | 按钮/菜单关键元素 | 静态折射 |
| 5 | **SVG + CSS 动画（lucasromerodb）** | SVG + CSS | 中（25-35%） | 中（10-20%） | 50-100MB | 中端集成显卡 | Dock/菜单含动画 | CSS 弹簧动画 |
| 6 | **Canvas 2D 网格变形** | Canvas 2D | 中（20-30%） | 中高（15-25%） | 50-150MB | 中端集成显卡 | Genie 窗口动画 | 帧动画 |
| 7 | **shuding/liquid-glass（纯 JS）** | Canvas + SVG | 中（25-35%） | 中（10-20%） | 50-100MB | 中端集成显卡 | 快速原型/控制台 | SDF 折射 |
| 8 | **Liquid Glass React（WebGL）** | WebGL | 高（40-60%） | 低（<15%） | 100-200MB | 中端独立显卡 | 桌面端应用主力 | 弹性变形+色散 |
| 9 | **GLSL Playground（纯着色器）** | WebGL/GLSL | 高（40-55%） | 低（<10%） | 100-200MB | 中端独立显卡 | Siri 声波/Metaball | GLSL 动画 |
| 10 | **Liquefy UI（React+WebGL）** | WebGL | 高（40-60%） | 中（10-20%） | 100-200MB | 中端独立显卡 | 完整组件库(33组件) | Jelly 弹簧 |
| 11 | **Liquid Glass Studio（WebGL2）** | WebGL2 | 高（45-65%） | 中（10-20%） | 150-300MB | 中高端独立显卡 | 多效果切换 | 多模式 |
| 12 | **Three.js 液态玻璃（ektogamat）** | Three.js/WebGL | 高（50-65%） | 中（15-25%） | 150-300MB | 高端独立显卡 | 3D 场景中的玻璃 | 着色器动画 |
| 13 | **WebGL Apple Liquid Glass（Oliverrr）** | WebGL | 高（50-70%） | 中（15-25%） | 200-400MB | 高端独立显卡 | 物理精确折射 | 物理模拟 |
| 14 | **Liquid Glass Studio（WebGPU）** | WebGPU | 极高（60-80%） | 低（<10%） | 200-500MB | 高端独立显卡 | 视觉焦点/Dock | 物理级动画 |
| 15 | **Liquid DOM（WebGPU SDF）** | WebGPU | 极高（60-80%） | 低（<10%） | 200-500MB | 高端独立显卡 | 顶级渲染(120fps) | 物理级全特效 |
| 16 | **AGSL（Android 12+ 原生）** | AGSL | 中（30-40%） | 低（<10%） | <50MB | Android 12+ | Android 伪系统 | 原生动画 |

### 68.2 硬件分级（4 级）

| 等级 | 硬件特征 | 推荐方案 | 性能预期 | 玻璃效果质量 |
|------|---------|---------|---------|------------|
| **L1 极低配** | 集成显卡 + 4GB RAM + 无 GPU 加速 | 方案 1（CSS 基础毛玻璃） | 60fps 稳定 | 最基础模糊+透明 |
| **L2 低配** | 集成显卡 + 8GB RAM + 基础 GPU | 方案 2/3（CSS 增强 + 微动画） | 60fps 稳定 | 模糊+饱和度+弹簧动画 |
| **L3 中配** | 中端独立显卡 + 16GB RAM + WebGL | 方案 4-8（SVG/WebGL 折射） | 60fps | 折射+色散+弹性变形 |
| **L4 高配** | 高端独立显卡 + 32GB RAM + WebGPU | 方案 14-15（WebGPU 物理渲染） | 120fps | 物理级全特效(自适应着色) |

### 68.3 AI 自动切换逻辑（伪系统设置面板用）

```javascript
// 伪系统液态玻璃性能检测与自动切换
class GlassPerformanceManager {
  constructor() {
    this.tier = 'L1';       // 默认最低
    this.currentMode = 'css-basic';
  }

  // 检测硬件能力
  async detectHardware() {
    // 1. 检测 WebGPU 支持
    const hasWebGPU = !!navigator.gpu;
    
    // 2. 检测 WebGL 支持
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const hasWebGL = !!gl;
    
    // 3. 检测 GPU 信息
    let gpuTier = 0;
    if (hasWebGL) {
      const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) : '';
      // 简单判断：包含 RTX/RX/Apple = 高端；Intel HD/UHD = 低端
      if (/RTX 4[0-9]|RX 7[0-9]|Apple M[2-9]/i.test(renderer)) gpuTier = 4;
      else if (/RTX|Radeon RX|Apple M/i.test(renderer)) gpuTier = 3;
      else if (/Intel.*Iris|AMD Radeon/i.test(renderer)) gpuTier = 2;
      else gpuTier = 1;
    }
    
    // 4. 检测内存
    const memory = navigator.deviceMemory || 4; // GB
    
    // 5. 综合分级
    if (hasWebGPU && gpuTier >= 3 && memory >= 16) this.tier = 'L4';
    else if (hasWebGL && gpuTier >= 2 && memory >= 8) this.tier = 'L3';
    else if (hasWebGL && gpuTier >= 1 && memory >= 8) this.tier = 'L2';
    else this.tier = 'L1';
    
    return this.tier;
  }

  // 根据分级选择玻璃方案
  getRecommendedGlass() {
    const tierMap = {
      'L1': { mode: 'css-basic',  name: '基础毛玻璃',  cssClass: 'glass-tier-1' },
      'L2': { mode: 'css-enhanced', name: '增强磨砂玻璃', cssClass: 'glass-tier-2' },
      'L3': { mode: 'webgl',     name: 'WebGL 液态玻璃', cssClass: 'glass-tier-3' },
      'L4': { mode: 'webgpu',    name: 'WebGPU 物理玻璃', cssClass: 'glass-tier-4' },
    };
    return tierMap[this.tier];
  }

  // 用户手动切换（设置面板）
  setManualOverride(tier) {
    this.tier = tier;
    this.applyGlassMode();
  }

  // 应用玻璃模式
  applyGlassMode() {
    document.body.setAttribute('data-glass-tier', this.tier);
    document.body.className = document.body.className
      .replace(/glass-tier-\w+/g, '') + ' glass-tier-' + this.tier;
    
    // 加载对应渲染器
    switch(this.tier) {
      case 'L4':
        this.loadWebGPURenderer();
        break;
      case 'L3':
        this.loadWebGLRenderer();
        break;
      case 'L2':
      case 'L1':
      default:
        // CSS 方案无需额外加载
        break;
    }
  }
}
```

### 68.4 CSS 分级样式（全局可用）

```css
/* L1: 基础毛玻璃（极低配） */
[data-glass-tier="L1"] .glass {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

/* L2: 增强磨砂玻璃（低配） */
[data-glass-tier="L2"] .glass {
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15),
              inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 2.2);
}

/* L3: WebGL 液态玻璃（中配） */
[data-glass-tier="L3"] .glass {
  /* WebGL canvas 会覆盖此区域，CSS 仅作降级 */
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 24px;
}

/* L4: WebGPU 物理玻璃（高配） */
[data-glass-tier="L4"] .glass {
  /* WebGPU canvas 完全接管渲染，CSS 仅设定区域 */
  position: relative;
  border-radius: 24px;
}
```

---

## 69. 高品质磨砂玻璃（低端设备方案）

### 69.1 方案定位

此方案是**伪系统的最低端玻璃效果**，专为 L1/L2 级别设备设计。虽然是最低端，但仍然追求**高品质视觉**，而非简陋的半透明矩形。

### 69.2 核心特性

1. **多层模糊叠加**：`backdrop-filter` + 伪元素模糊，双倍模糊深度
2. **饱和度增强**：`saturate(180%)` 让颜色更鲜艳
3. **内发光边框**：`inset box-shadow` 模拟玻璃边缘高光
4. **噪点纹理**：SVG noise filter 增加磨砂质感
5. **弹簧动画**：`cubic-bezier(0.175, 0.885, 0.32, 2.2)` Apple 弹簧曲线
6. **GPU 加速**：`transform: translateZ(0)` + `will-change` 确保流畅

### 69.3 完整源码

```html
<!-- 高品质磨砂玻璃组件（低端设备方案） -->
<style>
/* 噪点纹理（SVG inline，无需外部文件） */
.noise-texture {
  position: absolute;
  inset: 0;
  opacity: 0.03;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
}

/* 磨砂玻璃主体 */
.frost-glass {
  position: relative;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(24px) saturate(180%) brightness(1.05);
  -webkit-backdrop-filter: blur(24px) saturate(180%) brightness(1.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.18),          /* 外阴影 */
    inset 0 1px 0 rgba(255, 255, 255, 0.15),  /* 顶部内高光 */
    inset 0 -1px 0 rgba(0, 0, 0, 0.08);      /* 底部内阴影 */
  overflow: hidden;
  /* GPU 加速 */
  transform: translateZ(0);
  will-change: transform, backdrop-filter;
  /* 弹簧动画 */
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 2.2);
}

/* 悬停效果：增强发光 */
.frost-glass:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 
    0 12px 40px rgba(0, 0, 0, 0.22),
    0 0 30px rgba(255, 255, 255, 0.08),      /* 柔光晕 */
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    inset 0 -1px 0 rgba(0, 0, 0, 0.08);
  transform: translateY(-2px) translateZ(0);
}

/* 顶部高光条（模拟玻璃反光） */
.frost-glass::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 50%;
  background: linear-gradient(180deg, 
    rgba(255, 255, 255, 0.08) 0%, 
    transparent 100%);
  pointer-events: none;
  border-radius: 20px 20px 0 0;
}

/* 内容容器（确保内容在噪点上方） */
.frost-glass > .content {
  position: relative;
  z-index: 1;
  padding: 20px 24px;
  color: white;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
</style>

<!-- 使用示例 -->
<div class="frost-glass">
  <div class="noise-texture"></div>
  <div class="content">
    <h3>高品质磨砂玻璃</h3>
    <p>专为低端设备设计，性能开销极低</p>
  </div>
</div>
```

### 69.4 性能数据

| 指标 | 数值 | 说明 |
|------|------|------|
| GPU 占用 | 5-15% | 仅 backdrop-filter 合成 |
| CPU 占用 | <5% | 无 JS 计算 |
| 内存 | <30MB | 仅 CSS 合成层 |
| 帧率 | 60fps 稳定 | 集成显卡亦可 |
| 动画延迟 | 0.4s | cubic-bezier 弹簧 |

### 69.5 与高端方案的区别

| 特性 | 高品质磨砂玻璃（L1/L2） | Liquid DOM WebGPU（L4） |
|------|-------------------------|--------------------------|
| 边缘折射 | 无（仅模糊） | 物理级光线折射 |
| 色散 | 无 | 彩虹色散 |
| 形变 | 无 | Shape Morphing |
| 自适应着色 | 无 | 背景亮度自适应 |
| 动画 | CSS 弹簧 | 物理模拟 120fps |
| GPU 需求 | 集成显卡 | 高端独立显卡 |
| 内存 | <30MB | 200-500MB |

---

## 70. Web 本地语音识别模型（离线/WASM）

> 伪系统需要系统级 AI 语音助手，语音识别必须本地运行（隐私+离线能力）。以下收录 5 种方案，从轻量到重量级排列。

### 70.1 五方案对比总表

| 特性 | Vosk-Browser | Whisper.cpp WASM | Sherpa-ONNX Web | Transformers.js | Web Speech API |
|------|-------------|-----------------|----------------|----------------|----------------|
| **底层** | Kaldi WASM | Whisper C++ WASM | ONNX Runtime WASM | ONNX Runtime WASM/WebGPU | 浏览器原生 |
| **npm 包** | `vosk-browser` | 无（需编译） | 无（需编译） | `@huggingface/transformers` | 无需安装 |
| **中文支持** | 有 | 有（98种语言） | 有（Paraformer等） | 有（Whisper多语言） | 有（zh-CN） |
| **完全离线** | 是 | 是 | 是 | 是 | 需 `processLocally` |
| **WebGPU加速** | 否 | 否 | 否 | 是 | 否 |
| **实时流式** | 是 | 否 | 是 | 否 | 是 |
| **模型大小** | 42MB | 74-466MB | 几十-几百MB | 40-250MB | 浏览器管理 |
| **内存占用** | ~300MB | ~200-500MB | ~200-500MB | ~200-500MB | 极低 |
| **维护状态** | 低（2022停更） | 高 | 高 | 高 | 标准演进中 |

---

### 70.2 Vosk-Browser（轻量流式）

- **GitHub**: https://github.com/ccoreilly/vosk-browser
- **npm**: `vosk-browser` (v0.0.8)
- **许可证**: Apache-2.0
- **底层**: Vosk API → Kaldi → WebAssembly

**安装**：
```bash
npm i vosk-browser
```

**CDN**：
```html
<script src="https://cdn.jsdelivr.net/npm/vosk-browser@0.0.5/dist/vosk.js"></script>
```

**模型大小**：
| 模型 | 大小 | 中文支持 |
|------|------|---------|
| `vosk-model-small-cn-0.22` | 42MB | 是（WER 23.54%） |
| `vosk-model-cn-0.22` | 1.3GB | 是（WER 13.98%），不适合浏览器 |

**API 使用**：
```javascript
async function initVosk() {
  // 1. 加载模型（Web Worker 中运行）
  const model = await Vosk.createModel('model.tar.gz');
  
  // 2. 创建识别器
  const recognizer = new model.KaldiRecognizer();
  
  // 3. 监听结果
  recognizer.on("result", (msg) => {
    console.log('最终结果:', msg.result.text);
  });
  recognizer.on("partialresult", (msg) => {
    console.log('部分结果:', msg.result.partial);
  });
  
  // 4. 麦克风音频流
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { sampleRate: 16000, channelCount: 1,
             echoCancellation: true, noiseSuppression: true }
  });
  const ctx = new AudioContext();
  const node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (e) => recognizer.acceptWaveform(e.inputBuffer);
  ctx.createMediaStreamSource(stream).connect(node);
}
```

**关键 API**：
- `Vosk.createModel(url)` — 加载模型（Worker 中）
- `new model.KaldiRecognizer()` — 创建识别器
- `recognizer.acceptWaveform(buffer)` — 传入音频
- `recognizer.setWords(true)` — 词级时间戳
- `model.terminate()` — 终止 Worker

---

### 70.3 Whisper.cpp WASM（高精度批量）

- **GitHub**: https://github.com/ggml-org/whisper.cpp
- **示例**: `examples/whisper.wasm/`
- **在线 Demo**: https://ggml.ai/whisper.cpp/
- **许可证**: MIT
- **底层**: OpenAI Whisper → C/C++ → Emscripten → WASM

**构建（无 npm 包，需从源码编译）**：
```bash
# 安装 Emscripten SDK
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest

# 构建
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp && mkdir build-em && cd build-em
emcmake cmake .. && make -j
```

**模型大小**（仅支持到 small，更大模型浏览器性能不佳）：
| 模型 | 大小 | 推荐 |
|------|------|------|
| `tiny` | 74MB | 最佳性能 |
| `base` | 142MB | 推荐 |
| `small` | 466MB | 上限 |

**API 使用**：
```javascript
// 加载 WASM 模块
const Module = await createWhisperModule({ locateFile: p => `./${p}` });

// 加载模型到 WASM 内存
const resp = await fetch('ggml-tiny.bin');
const buf = new Uint8Array(await resp.arrayBuffer());
const ptr = Module._malloc(buf.length);
Module.HEAPU8.set(buf, ptr);
const ctx = Module._whisper_init_from_buffer(ptr, buf.length);

// 转录音频
const pcm = audioBufferToPCM16(audioBuffer); // 16kHz 单声道
Module._whisper_full(ctx, 0, pcm.ptr, pcm.length, params);

// 读取结果
const segs = Module._whisper_full_n_segments(ctx);
let text = '';
for (let i = 0; i < segs; i++) {
  text += Module.UTF8ToString(Module._whisper_full_get_segment_text(ctx, i));
}
```

**特点**：
- 完全本地推理，WASM SIMD 加速
- tiny/base 达 2-3x 实时速度（60秒音频约 20-30秒处理）
- 最大音频 120 秒
- 仅 Greedy 采样（不支持 Beam Search）
- 非流式（批量处理）

---

### 70.4 Sherpa-ONNX Web（流式 + 全栈）

- **GitHub**: https://github.com/k2-fsa/sherpa-onnx
- **WASM 目录**: `wasm/`（含 asr/kws/vad-asr/tts/speaker-diarization）
- **许可证**: Apache-2.0
- **底层**: ONNX Runtime + next-gen Kaldi
- **维护**: 非常活跃（2026年8月仍更新）

**构建**：
```bash
git clone https://github.com/k2-fsa/sherpa-onnx && cd sherpa-onnx
./build-wasm-simd-web.sh     # 完整 Web ASR
./build-wasm-simd-asr.sh     # 仅 ASR
./build-wasm-simd-vad-asr.sh # VAD + ASR 组合
```

**支持的中文模型**：
- Zipformer（流式+非流式）
- Paraformer（阿里达摩院，中文效果优秀）
- Whisper（ONNX 格式）
- SenseVoice（阿里达摩院最新）

**API 使用（以 Paraformer 为例）**：
```javascript
const Module = await createSherpaOnnxModule({ locateFile: p => `./${p}` });

// 配置模型
const recognizer = Module.createRecognizer({
  modelType: 'paraformer',
  paraformer: { model: './model.onnx', tokens: './tokens.txt' },
  decodingMethod: 'greedy_search',
  numThreads: 1,  // WASM 中禁用 pthread
  featConfig: { sampleRate: 16000, featureDim: 80 },
});

// 流式识别（麦克风）
async function startStreaming() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { sampleRate: 16000, channelCount: 1 }
  });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const source = ctx.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(ctx, 'audio-processor');
  
  worklet.port.onmessage = (e) => {
    const s = recognizer.createStream();
    s.acceptWaveform(16000, e.data);
    while (recognizer.isReady(s)) recognizer.decode(s);
    const result = recognizer.getResult(s);
    if (result.text) console.log('识别:', result.text);
  };
  source.connect(worklet);
  worklet.connect(ctx.destination);
}
```

**特点**：
- 完全离线 + WASM SIMD 优化
- 流式实时识别
- 全栈能力：ASR + TTS + VAD + 说话人识别 + 关键词检测
- 多种 SOTA 模型支持

---

### 70.5 Transformers.js（Whisper-Web，支持 WebGPU）

- **Transformers.js GitHub**: https://github.com/huggingface/transformers.js
- **Whisper-Web GitHub**: https://github.com/xenova/whisper-web
- **npm**: `@huggingface/transformers` (v4.2.0)
- **在线 Demo**: https://huggingface.co/spaces/Xenova/whisper-web
- **许可证**: Apache-2.0
- **底层**: ONNX Runtime (WASM + WebGPU)

**安装**：
```bash
npm i @huggingface/transformers
```

**CDN**：
```html
<script type="module">
  import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
</script>
```

**模型大小（量化后）**：
| 模型 | 量化 | 大小 | 中文 |
|------|------|------|------|
| `Xenova/whisper-tiny` | q8 | ~40MB | 是 |
| `Xenova/whisper-base` | q8 | ~75MB | 是 |
| `Xenova/whisper-small` | q8 | ~250MB | 是 |

**API 使用 — WASM 模式（默认）**：
```javascript
import { pipeline } from '@huggingface/transformers';

const transcriber = await pipeline(
  'automatic-speech-recognition',
  'Xenova/whisper-base',
  { dtype: 'q8' }  // WASM 默认 q8 量化
);

const result = await transcriber(audioData, {
  language: 'chinese',
  task: 'transcribe',
  chunk_length_s: 30,
  stride_length_s: 5,
});
console.log(result.text);
```

**API 使用 — WebGPU 加速模式**：
```javascript
const transcriber = await pipeline(
  'automatic-speech-recognition',
  'onnx-community/whisper-tiny',
  { device: 'webgpu', dtype: 'fp16' }  // WebGPU 推荐 fp16
);
```

---

### 70.6 Web Speech API（浏览器原生）

- **文档**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
- **无需安装**：浏览器原生 API
- **支持浏览器**: Chrome/Edge/Opera（良好）；Safari（部分）；Firefox（不支持）

**在线模式（默认）**：
```javascript
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SR();

recognition.continuous = true;
recognition.lang = 'zh-CN';
recognition.interimResults = true;

recognition.onresult = (event) => {
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const transcript = event.results[i][0].transcript;
    if (event.results[i].isFinal) {
      console.log('最终:', transcript);
    } else {
      console.log('中间:', transcript);
    }
  }
};

recognition.start();
```

**离线模式（新功能 `processLocally`）**：
```javascript
const recognition = new SR();
recognition.lang = 'zh-CN';
recognition.processLocally = true;  // 关键：启用设备端处理

// 检查语言包可用性
await SR.available({ langs: ['zh-CN'], processLocally: true });
// 返回: 'unavailable' | 'available' | 'downloadable'

// 下载语言包
await SR.install({ langs: ['zh-CN'], processLocally: true });

recognition.start();  // 完全离线识别
```

---

### 70.7 伪系统选型建议

| 场景 | 推荐方案 | 原因 |
|------|---------|------|
| **实时语音助手（流式）** | Sherpa-ONNX（Paraformer） | 流式+中文效果优秀+全栈能力 |
| **轻量离线（低端设备）** | Vosk-Browser（42MB 模型） | 模型小+流式+内存占用低 |
| **最高精度（有GPU）** | Transformers.js + WebGPU | Whisper 精度最高+GPU加速 |
| **零安装快速实现** | Web Speech API | 原生API+代码最少 |
| **语音翻译** | Whisper.cpp WASM / Transformers.js | Whisper 原生翻译功能 |

---

## 71. Web 本地 LLM（系统级 AI 核心）

> 伪系统的系统级 AI 需要本地 LLM 进行基本操作（指令解析、文本生成、代码理解）。以下收录 4 种纯浏览器端 LLM 推理方案。

### 71.1 四方案对比总表

| 特性 | WebLLM | Transformers.js | wllama | MediaPipe LLM |
|------|--------|----------------|--------|---------------|
| **技术** | WebGPU | ONNX Runtime (WASM/WebGPU) | llama.cpp WASM + WebGPU | WebGPU (LiteRT) |
| **GPU 需求** | 必须 | 可选(WASM模式无需) | 可选(WASM模式无需) | 必须 |
| **API 兼容** | OpenAI API | Python transformers | OpenAI API | Google MediaPipe |
| **模型格式** | MLC | ONNX | GGUF | .task/.litertlm |
| **模型范围** | Llama/Phi/Gemma/Qwen | 数百种 HF 模型 | 任意 GGUF | Gemma/Phi 系列 |
| **最大模型** | 8B (q4f32) | 取决于模型 | 2GB/分片 | 27B (Gemma 3) |
| **流式输出** | 是 | 是 | 是 | 是 |
| **多模态** | 有限 | 是(CLIP/Whisper) | 是(V3,图像+音频) | 是(Gemma-3n) |
| **工具调用** | WIP | 否 | 是(V3) | 否 |
| **LoRA** | 否 | 否 | 否 | 是 |
| **npm 包** | `@mlc-ai/web-llm` | `@huggingface/transformers` | `@wllama/wllama` | `@mediapipe/tasks-genai` |
| **许可证** | Apache-2.0 | Apache-2.0 | MIT | Google |

---

### 71.2 WebLLM（最高性能，WebGPU 加速）

- **GitHub**: https://github.com/mlc-ai/web-llm
- **npm**: `@mlc-ai/web-llm` (v0.2.84)
- **在线体验**: https://chat.webllm.ai/
- **文档**: https://webllm.mlc.ai/docs/
- **许可证**: Apache-2.0
- **技术基础**: WebGPU 硬件加速

**安装**：
```bash
npm install @mlc-ai/web-llm
```

**CDN**：
```javascript
import * as webllm from "https://esm.run/@mlc-ai/web-llm";
```

**支持的模型**：
| 模型家族 | 参数量 | 量化 |
|---------|-------|------|
| Llama 3.1 | 8B | q4f32_1 |
| Qwen2 (通义千问) | 0.5B/1.5B/7B | q4f16 |
| Phi 3.5 | 3.8B | q4f16 |
| Gemma-2B | 2B | q4f16 |
| Mistral-7B | 7B | q4f16 |

**API 使用 — 基本对话**：
```javascript
import { CreateMLCEngine } from "@mlc-ai/web-llm";

const engine = await CreateMLCEngine(
  "Llama-3.1-8B-Instruct-q4f32_1-MLC",
  { initProgressCallback: (p) => console.log(p.progress) }
);

const reply = await engine.chat.completions.create({
  messages: [
    { role: "system", content: "你是伪系统的 AI 助手。" },
    { role: "user", content: "帮我打开设置" }
  ]
});
console.log(reply.choices[0].message.content);
```

**流式输出**：
```javascript
const chunks = await engine.chat.completions.create({
  messages,
  stream: true,
  temperature: 1,
});
for await (const chunk of chunks) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
```

**Web Worker 模式（不阻塞 UI）**：
```javascript
// worker.ts
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);

// main.ts
import { CreateWebWorkerMLCEngine } from "@mlc-ai/web-llm";
const engine = await CreateWebWorkerMLCEngine(
  new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
  "Qwen2-1.5B-Instruct-q4f16_1-MLC"
);
```

**硬件要求**：
| 要求 | 说明 |
|------|------|
| 浏览器 | Chrome 113+（WebGPU） |
| VRAM | 小模型(1B) ~700MB；8B 模型 ~5GB+ |
| RAM | 建议 8GB+（小模型），16GB+（7B/8B） |

---

### 71.3 Transformers.js（最广模型支持，WASM/WebGPU 双模式）

- **GitHub**: https://github.com/huggingface/transformers.js
- **npm**: `@huggingface/transformers` (v4.2.0)
- **文档**: https://huggingface.co/docs/transformers.js
- **许可证**: Apache-2.0
- **技术基础**: ONNX Runtime (WASM + WebGPU)

**安装**：
```bash
npm i @huggingface/transformers
```

**文本生成（LLM）**：
```javascript
import { pipeline } from '@huggingface/transformers';

// WASM 模式（无需 GPU）
const generator = await pipeline('text-generation', 
  'Xenova/Qwen1.5-0.5B-Chat', { dtype: 'q8' });

const output = await generator([
  { role: 'system', content: '你是伪系统的 AI 助手' },
  { role: 'user', content: '解释什么是液态玻璃' }
], { max_new_tokens: 100, do_sample: false });
```

**WebGPU 加速**：
```javascript
const generator = await pipeline('text-generation', 
  'onnx-community/Qwen1.5-0.5B-Chat',
  { device: 'webgpu', dtype: 'fp16' });
```

**配置**：
```javascript
import { env } from '@huggingface/transformers';
env.localModelPath = '/models/';     // 本地模型路径
env.allowRemoteModels = false;        // 禁用远程
env.backends.onnx.wasm.wasmPaths = '/wasm/'; // WASM 路径
```

**特点**：
- 与 Python transformers API 一致
- 支持数百种模型架构
- WASM 模式无需 GPU（适合低端设备）
- 多模态：NLP + 视觉 + 音频 + 多模态

---

### 71.4 wllama（任意 GGUF 模型，WASM 无需 GPU）

- **GitHub**: https://github.com/ngxson/wllama
- **npm**: `@wllama/wllama` (v3.6.1)
- **在线 Demo**: https://huggingface.co/spaces/ngxson/wllama
- **文档**: https://github.ngxson.com/wllama/docs/
- **许可证**: MIT
- **技术基础**: llama.cpp WebAssembly + WebGPU（V3）

**安装**：
```bash
npm i @wllama/wllama
```

**API 使用**：
```javascript
import { Wllama } from '@wllama/wllama';

const wllama = new Wllama({ default: './esm/wasm/wllama.wasm' });

// 从 Hugging Face 加载 GGUF 模型
await wllama.loadModelFromHF(
  { repo: 'ggml-org/models', file: 'tinyllamas/stories260K.gguf' },
  { progressCallback: ({ loaded, total }) => 
    console.log(`${Math.round(loaded/total*100)}%`) }
);

// OpenAI 兼容对话
const response = await wllama.createChatCompletion({
  messages: [{ role: 'user', content: '打开系统设置' }],
  max_tokens: 50,
  temperature: 0.5,
});
console.log(response.choices[0].message.content);
```

**WebGPU 加速**：
```javascript
await wllama.loadModel(files, { n_gpu_layers: 4 }); // 4层卸载到 GPU
```

**特点**：
- 纯 WASM 可在 CPU 运行（无 GPU 需求）
- 支持任意 GGUF 模型
- V3 支持 WebGPU + 多模态 + 工具调用
- Worker 中运行，不阻塞 UI
- 模型分片并行下载

---

### 71.5 MediaPipe LLM Inference（Google 官方，支持 LoRA）

- **文档**: https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference
- **Web JS 指南**: https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/web_js
- **npm**: `@mediapipe/tasks-genai`
- **在线 Demo**: https://mediapipe-studio.webapps.google.com/studio/demo/llm_inference
- **技术基础**: WebGPU (LiteRT 推理引擎)

**安装**：
```bash
npm install @mediapipe/tasks-genai
```

**CDN**：
```html
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/genai_bundle.cjs"></script>
```

**API 使用**：
```javascript
const genai = await FilesetResolver.forGenAiTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@latest/wasm"
);

const llm = await LlmInference.createFromOptions(genai, {
  baseOptions: { modelAssetPath: '/assets/gemma-3n-E4B-it-int4-Web.litertlm' },
  maxTokens: 1000, topK: 40, temperature: 0.8,
});

// 流式生成
llm.generateResponse("打开系统设置", (partial, done) => {
  document.getElementById('output').textContent += partial;
});

// 多模态（Gemma-3n）
const llm = await LlmInference.createFromOptions(genai, {
  baseOptions: { modelAssetPath: '/assets/gemma-3n-E4B-it-int4-Web.litertlm' },
  maxNumImages: 5,     // 启用视觉
  supportAudio: true,  // 启用音频
});

const response = await llm.generateResponse([
  '<start_of_turn>user\n描述这张图',
  { imageSource: '/assets/screenshot.png' },
  '<end_of_turn>\n<start_of_turn>model\n'
]);
```

**支持的模型**：
| 模型 | 参数量 | 特点 |
|------|-------|------|
| Gemma-3 1B | 1B | 轻量 |
| Gemma-3n E2B/E4B | 2B/4B | 多模态 |
| Gemma 3 4B/12B/27B | 多种 | 大模型 |
| Gemma 4 E2B/E4B | 2B/4B | 最新 |

**特点**：
- Google 官方优化和量化（int4）
- 唯一支持 LoRA 动态加载
- 多模态（图像+音频+文本）
- 跨平台（Web/Android/iOS）

---

### 71.6 伪系统选型建议

| 场景 | 推荐方案 | 原因 |
|------|---------|------|
| **最高性能 + OpenAI 兼容** | WebLLM | WebGPU 加速，Llama 3.1 8B |
| **最广模型 + WASM 无需 GPU** | Transformers.js | 数百种模型，低端可用 |
| **任意 GGUF + 纯 CPU 运行** | wllama | 无 GPU 需求，GGUF 生态 |
| **Google 生态 + LoRA** | MediaPipe LLM | Gemma 优化 + LoRA 支持 |
| **低端设备（无 GPU）** | wllama (WASM) 或 Transformers.js (q4) | CPU 可运行小模型 |
| **高端设备（有 GPU）** | WebLLM 或 MediaPipe | GPU 加速，可跑 7B+ |

---

## 72. Web Siri Orb 动画（iOS 风格 AI 球）

> iOS 26/27 的 Siri AI 球是一个 3D 动态发光球体，具有流动彩色光带、形态变形和柔和光晕效果。以下收录两种 Web 实现方案。

### 72.1 方案一：ShaderGradient（Three.js + React，3D 真实球体）

- **GitHub**: https://github.com/ruucm/shadergradient
- **在线定制**: https://www.shadergradient.co/customize
- **原理**: 基于 Three.js + @react-three/fiber，使用 GLSL Shader 在 3D 球体网格上渲染动态渐变，通过顶点着色器 noise 扰动实现 morph 效果

**安装**：
```bash
npm i @shadergradient/react @react-three/fiber three three-stdlib camera-controls
npm i -D @types/three
```

**使用（球体形态 = Siri Orb）**：
```jsx
import { ShaderGradientCanvas, ShaderGradient } from '@shadergradient/react'

function SiriOrb() {
  return (
    <ShaderGradientCanvas
      style={{ position: 'absolute', inset: 0 }}
      pixelDensity={1.5}
      fov={45}
    >
      <ShaderGradient
        control='props'
        type='sphere'           {/* 球体网格 */}
        animate='on'            {/* 开启动画 */}
        uSpeed={0.4}           {/* 动画速度 */}
        uStrength={4}          {/* morph 扭曲强度 */}
        uFrequency={5.5}       {/* 噪声频率 */}
        color1='#52ff89'       {/* 多色渐变 */}
        color2='#dbba95'
        color3='#d0bce1'
        lightType='3d'
        cDistance={32}
        cPolarAngle={125}
      />
    </ShaderGradientCanvas>
  )
}
```

**可调参数**：

| 参数 | 作用 | 范围 | Siri Orb 推荐值 |
|------|------|------|----------------|
| `type` | 网格类型 | plane/sphere/waterPlane | `sphere` |
| `animate` | 动画开关 | on/off | `on` |
| `uSpeed` | 动画速度 | 0-2 | 0.4 |
| `uStrength` | 变形强度 | 0-10 | 4 |
| `uFrequency` | 噪声频率 | 0-10 | 5.5 |
| `color1/2/3` | 渐变三色 | hex | 依系统主题 |

**也可用 URL 参数加载预设**：
```jsx
<ShaderGradient
  control='query'
  urlString='https://www.shadergradient.co/customize?animate=on&cDistance=3.6&cPolarAngle=90&color1=%2352ff89&color2=%23dbba95&color3=%23d0bce1&lightType=3d&type=sphere&uFrequency=5.5&uSpeed=0.4&uStrength=4'
/>
```

---

### 72.2 方案二：纯 CSS Siri Orb（无依赖，轻量级）

- **原理**: 使用 `conic-gradient` 旋转产生流动彩色光带 + `radial-gradient` 控制球体形状 + `filter: blur()` 模糊产生发光晕染 + `mix-blend-mode` 混合色彩
- **无依赖**: 纯 CSS，无需任何库
- **动画核心**: `@property` 注册可动画的 `<angle>` 自定义属性

**完整源码**：
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Siri Orb CSS</title>
<style>
  /* 注册可动画的 CSS 自定义属性 */
  @property --angle {
    syntax: '<angle>';
    inherits: false;
    initial-value: 0deg;
  }
  @property --angle2 {
    syntax: '<angle>';
    inherits: false;
    initial-value: 180deg;
  }

  body {
    margin: 0;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #000;
  }

  /* 外层容器：球体形状 + 模糊发光 */
  .siri-orb {
    position: relative;
    width: 200px;
    height: 200px;
    border-radius: 50%;
    overflow: hidden;
    filter: blur(30px);  /* 关键：大模糊产生 Siri 标志性柔光 */
  }

  /* 第一层流动渐变（顺时针旋转） */
  .siri-orb::before {
    content: '';
    position: absolute;
    inset: -50%;
    background: conic-gradient(
      from var(--angle),
      #ff6b6b, #feca57, #48dbfb,
      #5f27cd, #ff9ff3, #ff6b6b
    );
    animation: spin 4s linear infinite;
  }

  /* 第二层流动渐变（逆时针旋转，叠加混合） */
  .siri-orb::after {
    content: '';
    position: absolute;
    inset: -50%;
    background: conic-gradient(
      from var(--angle2),
      #00d2ff, #3a7bd5, #a18cd1,
      #fbc2eb, #ff6a88, #00d2ff
    );
    mix-blend-mode: screen;  /* 混合模式叠加 */
    animation: spin-reverse 6s linear infinite;
  }

  /* 内层球体高光（径向渐变） */
  .orb-core {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(
      circle at 35% 35%,
      rgba(255,255,255,0.6) 0%,
      rgba(255,255,255,0.1) 30%,
      transparent 60%
    );
    z-index: 2;
    filter: blur(5px);
  }

  /* 外层光晕 */
  .orb-glow {
    position: absolute;
    inset: -40px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgba(100, 200, 255, 0.15) 0%,
      transparent 70%
    );
    z-index: -1;
    animation: pulse 3s ease-in-out infinite alternate;
  }

  @keyframes spin {
    to { --angle: 360deg; }
  }
  @keyframes spin-reverse {
    to { --angle2: -180deg; }
  }
  @keyframes pulse {
    from { opacity: 0.5; transform: scale(1); }
    to   { opacity: 1;   transform: scale(1.1); }
  }
</style>
</head>
<body>
  <div class="siri-orb">
    <div class="orb-core"></div>
  </div>
  <div class="orb-glow"></div>
</body>
</html>
```

**如何修改**：

| 要改什么 | 改哪里 | 说明 |
|---------|--------|------|
| 球体大小 | `.siri-orb` 的 `width/height` | 默认 200px |
| 柔光强度 | `.siri-orb` 的 `filter: blur()` | 调大→更模糊；调小→更锐利 |
| 渐变颜色 | `conic-gradient` 的色值 | 依系统主题色 |
| 旋转速度 | `animation` 的 duration | 4s 和 6s |
| 旋转方向 | `@keyframes spin` 的 `to` 值 | `360deg`→顺时针；`-360deg`→逆时针 |
| 高光位置 | `.orb-core` 的 `radial-gradient at` | `35% 35%` = 左上偏 |
| 光晕大小 | `.orb-glow` 的 `inset` | `-40px`→更大光晕 |

---

### 72.3 两方案对比

| 维度 | ShaderGradient | 纯 CSS |
|------|---------------|--------|
| 3D 球体 | 是（真实 3D mesh） | 否（2D 模拟） |
| Morph 变形 | 是（noise 扰动） | 否（仅旋转） |
| 依赖 | Three.js + R3F | 无 |
| GPU 占用 | 高（40-60%） | 低（5-15%） |
| 帧率 | 60fps | 60fps |
| 适用设备 | 中高端 | 全部设备 |
| 定制度 | 极高（GLSL 可改） | 中（CSS 参数） |

### 72.4 伪系统建议

- **高端设备（L3/L4）**：使用 ShaderGradient，真实 3D 球体 + noise morph
- **低端设备（L1/L2）**：使用纯 CSS 方案，无依赖 + 极低性能开销
- **AI 切换**：设置面板中根据 `GlassPerformanceManager.tier` 自动选择

---

## 73. AI 边框跑马灯动画（iOS 风格流光边框）

> iOS AI 功能中，当 AI 正在处理时会显示流光渐变边框。以下收录 5 种实现技术，从全边框渐变到单光点跑马灯。

### 73.1 五方案对比

| 技术 | 原理 | 视觉效果 | 复杂度 | 适用场景 |
|------|------|---------|--------|---------|
| **conic-gradient + mask** | 角向渐变旋转 + mask 镂空 | 全边框渐变流光 | 中 | AI 处理中状态 |
| **伪元素 flow 动画** | width/height keyframes | 单光点跑马灯 | 低 | AI 唤醒中状态 |
| **clip-path 跟随** | border 逐边裁剪 | 边框光带跟随 | 低 | 无三角瑕疵需求 |
| **3px 精细流光** | 优化关键帧+拐角停顿 | 精细跑马灯 | 中 | 精确控制 |
| **渐变虚线** | linear-gradient + position | 虚线流动 | 低 | 次要装饰 |

---

### 73.2 技术一：conic-gradient + mask（全边框渐变流光）

- **来源**: chokcoco/iCSS (GitHub Stars: 18k+)
- **GitHub**: https://github.com/chokcoco/iCSS/issues/92
- **CodePen**: https://codepen.io/Chokcoco/pen/dypaobm

```css
@property --angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 199deg;
}

.ai-border-gradient {
  position: relative;
  width: 300px;
  height: 200px;
  background: #1a1a2e;
  border-radius: 12px;
  overflow: hidden;
  /* mask 镂空中心，只保留边框 */
  mask:
    linear-gradient(#000, #000 3px, transparent 3px, 
      transparent calc(100% - 3px), #000 calc(100% - 3px), #000),
    linear-gradient(90deg, #000, #000 3px, transparent 3px, 
      transparent, transparent calc(100% - 3px), 
      #000 calc(100% - 3px), #000);
  mask-composite: intersect;
  -webkit-mask-composite: source-in;

  &::before {
    content: '';
    position: absolute;
    left: -50%; top: -50%;
    width: 200%; height: 200%;
    background: conic-gradient(
      from var(--angle),
      transparent,
      #fc0 0%,
      #ff5722 15%,
      transparent 30%
    );
    animation: angleChange 2.4s infinite ease-in-out;
  }
}

@keyframes angleChange {
  0%   { --angle: 199deg; }
  100% { --angle: 559deg; }  /* 旋转 360 度 */
}
```

**多色完整版（4 色旋转边框）**：
```css
.ai-border-multicolor {
  position: relative;
  width: 300px;
  height: 240px;
  background: #ddd;
  overflow: hidden;
  border-radius: 12px;
  mask:
    linear-gradient(#000, #000 3px, transparent 3px, 
      transparent calc(100% - 3px), #000 calc(100% - 3px), #000),
    linear-gradient(90deg, #000, #000 3px, transparent 3px, 
      transparent, transparent calc(100% - 3px), 
      #000 calc(100% - 3px), #000);

  &::after {
    content: '';
    position: absolute;
    left: -50%; top: -50%;
    width: 200%; height: 200%;
    background: conic-gradient(
      #399953, #399953 25%,
      #fbb300 25%, #fbb300 50%,
      #d53e33 50%, #d53e33 75%,
      #377af5 75%, #377af5
    );
    animation: rotate 4s linear infinite;
  }
}

@keyframes rotate {
  100% { transform: rotate(1turn); }
}
```

---

### 73.3 技术二：伪元素 flow 动画（单光点跑马灯）

- **来源**: JYeontu（掘金）
- **URL**: https://juejin.cn/post/7510127414331097098
- **CodePen**: https://codepen.io/yongtaozheng/pen/wBaMXPR
- **GitHub**: https://github.com/yongtaozheng/video-code/tree/master/流光边框

```html
<style>
.ai-marquee-container {
  position: relative;
  width: 300px;
  height: 200px;
}

.ai-marquee-box {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  z-index: 2;
  background-color: rgba(12, 30, 50, 0.8);
}

/* 流光光点 */
.ai-marquee-container::before {
  content: "";
  position: absolute;
  z-index: 1;
  top: -10px;
  left: -10px;
  width: 20px;
  height: 20px;
  border-radius: 10px;
  /* 蓝紫渐变 */
  background: linear-gradient(135deg,
    rgba(0, 245, 255, 0.6) 0%,
    rgba(0, 132, 255, 0.5) 50%,
    rgba(110, 0, 255, 0.6) 100%);
  /* 多层发光阴影 */
  box-shadow:
    0 0 10px rgba(0, 119, 182, 0.8),
    0 0 25px rgba(0, 150, 199, 0.6),
    0 0 40px rgba(0, 245, 255, 0.4),
    inset 0 0 8px rgba(0, 119, 182, 0.5);
  animation: flow 3s linear infinite, glow 3s linear infinite alternate;
  pointer-events: none;
}

/* 流动动画：沿四边循环 */
@keyframes flow {
  0%   { width: 20px; height: 20px; top: -10px; left: -10px; }
  20%  { left: -10px; top: -10px; 
         width: calc(100% + 20px); height: 20px; }
  40%  { left: calc(100% - 10px); top: -10px; 
         width: 20px; height: calc(100% + 20px); }
  60%  { top: calc(100% - 10px); left: -10px; 
         width: calc(100% + 20px); height: 20px; }
  80%  { top: -10px; left: -10px; 
         width: 20px; height: calc(100% + 20px); }
  100% { left: -10px; top: -10px; width: 20px; height: 20px; }
}

/* 呼吸发光 */
@keyframes glow {
  from {
    box-shadow:
      0 0 15px rgba(0, 119, 182, 0.7),
      0 0 30px rgba(0, 150, 199, 0.5),
      inset 0 0 10px rgba(0, 119, 182, 0.4);
  }
  to {
    box-shadow:
      0 0 40px rgba(0, 119, 182, 0.9),
      0 0 80px rgba(0, 150, 199, 0.7),
      inset 0 0 20px rgba(0, 119, 182, 0.6);
  }
}
</style>

<div class="ai-marquee-container">
  <div class="ai-marquee-box">AI 正在思考...</div>
</div>
```

**如何修改**：

| 要改什么 | 改哪里 | 说明 |
|---------|--------|------|
| 光点颜色 | `background: linear-gradient` | 依系统主题 |
| 流动速度 | `animation: flow 3s` | 调小→更快 |
| 光点大小 | `width/height: 20px` | 调大→更粗 |
| 发光颜色 | `box-shadow` 的 rgba | 与光点同色系 |
| 发光强度 | `box-shadow` 的 px 值 | 调大→更亮 |

---

### 73.4 技术三：3px 精细流光（拐角停顿优化版）

- **来源**: 茄汁面（掘金）
- **URL**: https://juejin.cn/post/7582156410319388682
- **改进**: 每个拐角增加 5% 停顿时长，拉伸时仅变化单一维度

```css
.ai-fine-marquee::before {
  content: "";
  position: absolute;
  z-index: 1;
  top: 0; left: 0;
  width: 3px; height: 3px;
  border-radius: 2px;
  background: linear-gradient(135deg,
    rgba(0,245,255,0.6) 0%, 
    rgba(0,132,255,0.5) 50%, 
    rgba(110,0,255,0.6) 100%);
  box-shadow: 
    0 0 10px rgba(0,119,182,0.8), 
    0 0 25px rgba(0,150,199,0.6),
    0 0 40px rgba(0,245,255,0.4), 
    inset 0 0 8px rgba(0,119,182,0.5);
  animation: flow 6s linear infinite, glow 3s linear infinite alternate;
}

@keyframes flow {
  0%  { width:3px; height:3px; top:0; left:0; }
  15% { left:0; top:0; width:100%; height:3px; }                    /* 上边 */
  20% { left:calc(100% - 3px); top:0; width:3px; height:3px; }       /* 右上角停顿 */
  40% { left:calc(100% - 3px); top:0; width:3px; height:100%; }      /* 右边 */
  45% { left:calc(100% - 3px); top:calc(100% - 3px); width:3px; height:3px; } /* 右下角 */
  65% { left:0; top:calc(100% - 3px); width:100%; height:3px; }     /* 下边 */
  70% { left:0; top:calc(100% - 3px); width:3px; height:3px; }       /* 左下角停顿 */
  85% { left:0; top:0; width:3px; height:100%; }                    /* 左边 */
  100%{ left:0; top:0; width:3px; height:3px; }
}
```

---

### 73.5 技术四：clip-path 边框跟随

- **来源**: chokcoco/iCSS
- **CodePen**: https://codepen.io/Chokcoco/pen/bGNJGWX
- **优点**: 无小三角瑕疵，支持 `border-radius`

```css
.ai-clip-border {
  position: relative;
  
  &::before {
    content: "";
    position: absolute;
    inset: 0;
    border: 2px solid gold;
    border-radius: 12px;
    animation: clippath 3s infinite linear;
  }
}

@keyframes clippath {
  0%, 100% { clip-path: inset(0 0 95% 0); }   /* 上边 */
  25%      { clip-path: inset(0 95% 0 0); }   /* 右边 */
  50%      { clip-path: inset(95% 0 0 0); }   /* 下边 */
  75%      { clip-path: inset(0 0 0 95%); }   /* 左边 */
}
```

---

### 73.6 技术五：渐变虚线流动

- **来源**: chokcoco/iCSS
- **CodePen**: https://codepen.io/Chokcoco/pen/NWRevaJ

```css
.ai-dashed-border {
  background:
    linear-gradient(90deg, #333 50%, transparent 0) repeat-x,
    linear-gradient(90deg, #333 50%, transparent 0) repeat-x,
    linear-gradient(0deg, #333 50%, transparent 0) repeat-y,
    linear-gradient(0deg, #333 50%, transparent 0) repeat-y;
  background-size: 4px 1px, 4px 1px, 1px 4px, 1px 4px;
  background-position: 0 0, 0 100%, 0 0, 100% 0;
  animation: linearGradientMove .3s infinite linear;
}

@keyframes linearGradientMove {
  100% { 
    background-position: 4px 0, -4px 100%, 0 -4px, 100% 4px; 
  }
}
```

---

### 73.7 伪系统 AI 状态指示器建议

```css
/* AI 状态：空闲（无边框动画） */
.ai-status-idle { border: 1px solid rgba(255,255,255,0.1); }

/* AI 状态：唤醒中（单光点跑马灯 — 技术二） */
.ai-status-listening { /* 应用 .ai-marquee-container 样式 */ }

/* AI 状态：处理中（全边框渐变流光 — 技术一） */
.ai-status-processing { /* 应用 .ai-border-gradient 样式 */ }

/* AI 状态：完成（脉冲渐隐） */
.ai-status-done { 
  border: 2px solid rgba(0, 255, 100, 0.5);
  animation: fadeOut 1s ease-out forwards;
}

@keyframes fadeOut {
  to { border-color: transparent; opacity: 0.8; }
}
```

---

## 附注补充（第九部分）

- **Genie 动画**源码文件：`genie-effect-demo.html`（与本文档同目录），633 行完整实现
- **液态玻璃性能分级**：共 16 种方案分为 4 级硬件分级（L1-L4），支持 AI 自动检测和手动切换
- **Liquid DOM** 是目前最新的 WebGPU 液态玻璃项目（2026年4月创建，2.4k Stars），物理级渲染 120 FPS
- **高品质磨砂玻璃**专为低端设备设计，GPU 占用仅 5-15%，60fps 稳定
- **Web 语音识别**收录 5 种方案：Vosk（42MB 轻量流式）、Whisper.cpp WASM（高精度）、Sherpa-ONNX（流式全栈）、Transformers.js（WebGPU 加速）、Web Speech API（原生零安装）
- **Web 本地 LLM** 收录 4 种方案：WebLLM（WebGPU 最高性能）、Transformers.js（数百模型 WASM/WebGPU）、wllama（任意 GGUF 纯 CPU）、MediaPipe LLM（Google 官方 + LoRA）
- **Siri Orb** 收录 2 种方案：ShaderGradient（Three.js 3D 真实球体）和纯 CSS（无依赖轻量级）
- **AI 跑马灯**收录 5 种技术：conic-gradient+mask（全边框渐变）、伪元素 flow（单光点跑马灯）、3px 精细流光（拐角优化）、clip-path（无瑕疵跟随）、渐变虚线（装饰流动）
- 所有方案均提供完整源码或 API 调用示例
- AI 状态指示器建议：空闲(无边框) → 唤醒中(单光点跑马灯) → 处理中(全边框渐变流光) → 完成(脉冲渐隐)

---

*第九部分新增时间: 2026-09-02（第 66-73 章：Genie 动画 + Liquid DOM + 性能分级 + 磨砂玻璃 + 语音识别 + Web LLM + Siri Orb + AI 跑马灯）*

---

---

# 第十部分：音乐 API 大全（伪系统音乐播放器）

> 整理时间：2026年9月5日
> 数据来源：各平台官方开发者文档 | GitHub 社区项目 | free-api / public-apis 汇总
> 适用场景：Nexus OS 伪系统的「音乐播放器」应用（`music` 应用 id）
> 重点提示：**网易云官方没有面向第三方的通用 Web API**，实际可用方案以社区封装项目（NeteaseCloudMusicApi 及其衍生版）为主，需自建代理解决 CORS。

## 74. 音乐 API 总览与选型

### 74.1 平台对比总表

| 平台 | 类型 | 认证方式 | 浏览器直调 (CORS) | 搜索 | 播放 | 歌词 | 伪系统适用性 |
|------|------|---------|------------------|------|------|------|-------------|
| 网易云音乐 | 国内大厂 | Cookie / 社区代理 | ❌ 需代理 | ✅ | ✅ | ✅ | **A（首选）** |
| QQ音乐 | 国内大厂 | Cookie / 社区代理 | ❌ 需代理 | ✅ | ✅ | ✅ | **A** |
| 酷狗音乐 | 国内大厂 | 半公开接口 | ❌ 需代理 | ✅ | ✅ | ✅ | B |
| 酷我音乐 | 国内大厂 | 半公开接口 | ❌ 需代理 | ✅ | ✅ | ✅ | B |
| 咪咕音乐 | 国内大厂 | 半公开接口 | ❌ 需代理 | ✅ | ✅ | ❌ | B |
| Deezer | 国际 | 公开端点免 Key | ✅ API 支持 | ✅ | ✅ 30s 预览 | ❌ | **A（免费兜底）** |
| iTunes Search | 国际 | 免 Key | ⚠️ 实测可直调 | ✅ | ⚠️ 仅预览 | ❌ | **A（免费兜底）** |
| Spotify | 国际 | OAuth 2.0 | ❌ 需代理 | ✅ | ✅ 需 Premium | ❌ | C |
| Apple Music | 国际 | JWT / MusicKit | ❌ 需生态配置 | ✅ | ✅ 需订阅 | ❌ | C |
| YouTube | 国际 | API Key | ❌ 需代理 | ✅ | ✅ iframe | ❌ | B（视频兼用） |
| Jamendo | 国际 | client_id | ⚠️ 建议代理 | ✅ | ✅ 流媒体 | ❌ | B+ |
| Last.fm | 国际 | API Key | ⚠️ JSONP/代理 | ✅ | ❌ | ❌ | C（元数据） |
| MusicBrainz | 国际 | 免 Key | ⚠️ 建议代理 | ✅ 元数据 | ❌ | ❌ | C（元数据） |
| AudioDB | 国际 | 免费 Key | ⚠️ 建议代理 | ✅ 元数据 | ❌ | ❌ | C（元数据） |
| Genius | 国际 | Access Token | ⚠️ 建议代理 | ✅ | ❌ | ✅ 受限 | C（歌词） |

评分标准：A = 直接可集成；B = 可用但需代理或额外开发；C = 仅补充元数据/歌词，不作主音乐源。

### 74.2 伪系统推荐方案

```
第一梯队（主播放源）：自建 NeteaseCloudMusicApi 代理 → 网易云曲库（最全，200+ 接口）
第二梯队（聚合备选）：Meting-API（Hono，可部署 Cloudflare Workers）或 Listen1 的接口适配逻辑
第三梯队（免费兜底）：Deezer 公开端点 + iTunes Search（无需任何 Key，浏览器可直接调用）
歌词补充：网易云 /lyric 接口；国际曲目用 Genius
```

---

## 75. 网易云音乐 API（重点·大厂）

### 75.1 官方开放平台现状

| 项目 | 说明 |
|------|------|
| 开放平台地址 | https://developer.music.163.com/st/developer |
| 定位 | 面向硬件厂商（音箱/电视/手表）、应用合作方、游戏联运、活动接入 |
| 是否有通用 Web API | **否**——官方没有面向第三方开发者的公开接口文档 |
| 结论 | 伪系统不能直接使用官方平台，需依赖社区方案或自建代理 |

### 75.2 社区主力：Binaryify/NeteaseCloudMusicApi

| 项目 | 详情 |
|------|------|
| GitHub | https://github.com/Binaryify/NeteaseCloudMusicApi |
| Star | 曾超 3 万 |
| 状态 | **已归档**（2024年2月28日最后提交，README 声明「保护版权，此仓库不再维护」） |
| 接口数量 | 200+ 接口（登录、搜索、歌单、播放、歌词、评论、电台、用户等） |
| 原理 | 伪造请求头 + weapi 加密参数，调用网易云官方接口 |

**推荐使用活跃衍生版**：

| 衍生项目 | 说明 |
|----------|------|
| NeteaseCloudMusicApiEnhanced | https://github.com/neteasecloudmusicapienhanced/api-enhanced，文档 https://music163.xuanmou.com.cn/docs/ |
| ZainCheung/netease-cloud-api | https://github.com/ZainCheung/netease-cloud-api，带演示站 |
| ivelly 镜像 | https://gitlab.com/Binaryify/NeteaseCloudMusicApi，文档 https://neteasecloudmusicapi.ivelly.com/docs/ |
| 原始文档站 | https://binaryify.github.io/NeteaseCloudMusicApi/ |

### 75.3 常用接口清单（核心 24 个）

> 以下路径以自建代理服务为基准（默认端口 3000），方法以 POST 为主。

| # | 接口 | 方法 | 路径 | 关键参数 | 说明 |
|---|------|------|------|---------|------|
| 1 | 搜索歌曲 | POST | `/cloudsearch` | `keywords` `type` `limit` `offset` | 完整搜索（推荐） |
| 2 | 搜索歌曲 | POST | `/search` | `keywords` `type` `limit` | 基础搜索 |
| 3 | 搜索建议 | GET | `/search/suggest` | `keywords` | 输入框联想 |
| 4 | 热门搜索 | POST | `/search/hot` | - | 热搜词列表 |
| 5 | 默认搜索词 | GET | `/search/default` | - | 默认关键词 |
| 6 | 歌曲详情 | POST | `/song/detail` | `ids` | 歌名/歌手/时长/专辑 |
| 7 | 播放地址 | POST | `/song/url` | `id` `br` | 获取播放链接（br=128/320/999） |
| 8 | 歌词 | POST | `/lyric` | `id` | LRC 歌词 |
| 9 | 逐字歌词 | POST | `/lyric/new` | `id` | 逐字卡拉OK歌词 |
| 10 | 歌单详情 | POST | `/playlist/detail` | `id` | 歌单 + 歌曲列表 |
| 11 | 歌单分类 | POST | `/playlist/catlist` | - | 全部歌单分类 |
| 12 | 精品歌单 | POST | `/top/playlist/highquality` | `cat` `limit` | 精品歌单 |
| 13 | 推荐歌单 | POST | `/recommend/resource` | - | 首页推荐歌单 |
| 14 | 每日推荐 | POST | `/recommend/songs` | - | 每日推荐（需登录） |
| 15 | 排行榜 | POST | `/toplist/detail` | - | 全部榜单（飙升/热歌/新歌…） |
| 16 | 榜单摘要 | POST | `/toplist` | - | 榜单列表 |
| 17 | 歌手详情 | POST | `/artist/detail` | `id` | 歌手信息 |
| 18 | 歌手歌曲 | POST | `/artist/songs` | `id` `limit` `offset` | 歌手全部歌曲 |
| 19 | 专辑内容 | POST | `/album` | `id` | 专辑歌曲 |
| 20 | 相似歌曲 | POST | `/simi/song` | `id` | 相似推荐 |
| 21 | 歌曲评论 | POST | `/comment/music` | `id` `limit` | 歌曲评论 |
| 22 | 热门评论 | POST | `/comment/music/hot` | `id` `limit` | 热评（B站式评论区可复用） |
| 23 | 二维码登录 | POST+GET | `/login/qr/key` `/login/qr/check` | `key` | 扫码登录 |
| 24 | 用户歌单 | POST | `/user/playlist` | `uid` | 用户收藏歌单（需登录） |

### 75.4 部署方式

| 方式 | 命令 / 说明 |
|------|------------|
| 本地 Node.js | `git clone` → `npm install` → `npm start`（默认端口 3000） |
| npx 直跑 | `npx NeteaseCloudMusicApi` |
| Docker | 官方镜像直接运行，适合服务器 |
| Vercel | 项目内置 Vercel 部署配置 |
| Cloudflare Worker | 适合做 CORS 转发代理（见 75.5） |
| 腾讯云 Serverless | 文档提供 Serverless 部署指引 |

### 75.5 CORS 与代理方案

**关键问题**：网易云官方接口不返回 `Access-Control-Allow-Origin` 头，浏览器伪系统前端**不能直接请求** `music.163.com` 接口，必须自建代理。

推荐架构：

```
Nexus OS 前端 → Cloudflare Worker（加 CORS 头）→ NeteaseCloudMusicApi → 网易云官方
```

Cloudflare Worker 转发代理示例：

```javascript
// Cloudflare Worker 代理：转发到本地/远端 NeteaseCloudMusicApi 并加 CORS 头
export default {
  async fetch(request) {
    const url = new URL(request.url);
    // 将 /music-api 前缀替换为 NeteaseCloudMusicApi 实际地址
    const target = 'https://你的代理地址.example' + url.pathname.replace(/^\/music-api/, '') + url.search;

    const init = {
      method: request.method,
      headers: request.headers,
      body: request.method === 'POST' ? await request.text() : undefined,
    };
    const res = await fetch(target, init);

    const newRes = new Response(res.body, res);
    newRes.headers.set('Access-Control-Allow-Origin', '*');
    newRes.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newRes.headers.set('Access-Control-Allow-Headers', '*');
    return newRes;
  },
};
```

### 75.6 播放地址获取难点

| 难点 | 说明 | 应对 |
|------|------|------|
| VIP 限制 | VIP 歌曲拿不到完整播放地址 | 前端降级提示试听/换源 |
| 防盗链 | 播放地址依赖 Referer / Cookie | 由代理层统一携带 |
| 登录态 | 部分能力需登录 | 代理层保存 Cookie，前端不接触凭证 |
| 时效性 | 播放地址会过期 | 每次播放前重新请求 |
| 风控 | 高频请求触发风控 | 代理层限速 + 缓存 |

### 75.7 前端集成代码示例

```javascript
// Nexus OS 音乐播放器核心逻辑
const API_BASE = 'https://你的代理.example/music-api'; // 自建代理地址

async function searchMusic(keyword) {
  const res = await fetch(`${API_BASE}/cloudsearch?keywords=${encodeURIComponent(keyword)}&limit=30`);
  const data = await res.json();
  return data.result.songs; // [{id, name, ar:[{name}], al:{name, picUrl}, dt}]
}

async function playSong(id) {
  // 并行获取：播放地址 + 歌词
  const [urlRes, lyricRes] = await Promise.all([
    fetch(`${API_BASE}/song/url?id=${id}&br=320000`).then(r => r.json()),
    fetch(`${API_BASE}/lyric?id=${id}`).then(r => r.json()),
  ]);

  const audio = document.getElementById('nexus-audio');
  audio.src = urlRes.data[0].url;
  audio.play();

  // 歌词解析：lyricRes.lrc.lyric 为 LRC 格式文本，可按时间轴渲染
  parseLrc(lyricRes.lrc?.lyric || '');
}

async function loadToplist() {
  const res = await fetch(`${API_BASE}/toplist/detail`).then(r => r.json());
  // res.list[0].tracks 为榜单歌曲数组，直接渲染列表
  return res.list;
}
```

---

## 76. QQ 音乐 API（腾讯）

### 76.1 官方开放平台

| 项目 | 说明 |
|------|------|
| 地址 | https://developer.y.qq.com/ |
| 定位 | 商业合作接入（登录授权、OpenAPI、QPlay 协议），面向合作方 |
| 结论 | 不适合伪系统快速集成，仅作了解 |

### 76.2 网页版接口（社区实践）

| 接口 | 地址 | 说明 |
|------|------|------|
| 搜索 | `https://c.y.qq.com/soso/fcgi-bin/client_search_cp.fcg?query={关键词}&n={数量}` | 返回 JSONP/JSON |
| 聚合请求 | `https://u.y.qq.com/cgi-bin/musicu.fcg` | 新版统一入口，`data` 参数控制 |
| 专辑信息 | `https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg` | 专辑歌曲列表 |
| 播放地址 | `https://ws.stream.qqmusic.qq.com/{purl}?` | 由接口返回的 `purl` 拼接 |

### 76.3 社区项目

| 项目 | 地址 | 说明 |
|------|------|------|
| Rain120/qq-music-api | https://github.com/Rain120/qq-music-api | Koa2 封装，原项目停维护，社区 fork 持续更新 |
| sansenjian/qq-music-api | https://github.com/sansenjian/qq-music-api | 持续维护的 fork |
| qqmusic-api-python | https://pypi.org/project/qqmusic-api-python/ | Python 版，456+ Star，2026-08 仍发版 |

**注意**：QQ 音乐网页接口对 Cookie / Referer / 签名较敏感，建议走聚合封装（如 Meting-API）而不是自行维护。

---

## 77. 酷狗 / 酷我 / 咪咕 API

### 77.1 酷狗音乐

| 接口 | 地址 | 说明 |
|------|------|------|
| 搜索 | `http://wwwapi.kugou.com/yy/index.php` | 返回 hash / album_id |
| 播放链接 | `http://www.kugou.com/yy/index.php?r=play/getdata&hash={hash}&album_id={album_id}&mid={mid}` | 需拼接签名 |
| 歌词 | `https://wwwapi.kugou.com/yy/index.php` | 歌词接口（含签名逻辑） |

社区项目：MakcRe/KuGouMusicApi（https://github.com/3241676890/KuGouMusicApi）、ecitlm/Kugou-api（https://github.com/ecitlm/Kugou-api）。

### 77.2 酷我音乐

| 接口 | 地址 | 说明 |
|------|------|------|
| 搜索 | `https://search.kuwo.cn/r.s?all={关键词}&ft=music&itemset=web_2013&client=kt&pn={页}&rn={数量}&rformat=json&encoding=utf8` | 返回 rid |
| 播放链接 | `https://www.kuwo.cn/url?format=mp3&rid={rid}&response=playurl` | 获取 mp3 地址 |
| 歌词 | `https://www.kuwo.cn/openapi/v1/www/lyric/getlyric?musicId={id}` | 需 Secret+Cookie |

社区项目：KuwoMusicApi（Node.js，歌曲信息/歌词/MV）。

### 77.3 咪咕音乐

| 接口 | 地址 | 说明 |
|------|------|------|
| 搜索 | `https://c.musicapp.migu.cn/v1.0/content/search_all.do?text={关键词}` | 聚合搜索 |

社区项目：

| 项目 | 地址 | 亮点 |
|------|------|------|
| jsososo/MiguMusicApi | https://github.com/jsososo/MiguMusicApi | Express + Axios，npm 可装 |
| Domdkw/migu-api-enhanced | https://github.com/Domdkw/migu-api-enhanced | Hono 框架，**支持 Cloudflare Workers / Vercel / Deno**，内置缓存 |

---

## 78. 国际音乐 API

### 78.1 对比总表

| 平台 | 认证 | 免费额度 | 浏览器直调 | 核心能力 | 伪系统用途 |
|------|------|---------|-----------|---------|-----------|
| iTunes Search | 免 Key | 约 20 次/分钟/IP | ⚠️ 实测可直调 | 搜索/元数据/30s 预览 | 免费兜底搜索 + 封面 |
| Deezer | 公开免 Key | 无明确配额 | ✅ | 搜索/榜单/曲目/30s 预览 | 免费兜底播放 |
| Spotify | OAuth | 需 Premium 账户 | ❌ | 搜索/推荐/播放控制 | 仅演示 |
| Apple Music | JWT/MusicKit | 需 Apple 生态 | ❌ | 目录/播放 | 仅演示 |
| YouTube | API Key | 10,000 单位/天 | ❌ | 搜索（播放走 iframe） | 视频音乐一体 |
| Jamendo | client_id | 免费流媒体 | ⚠️ | 搜索/流媒体播放 | CC 音乐源 |
| Last.fm | API Key | 免费 tier | ⚠️ | 搜索/艺人/相似歌曲 | 推荐算法补充 |
| MusicBrainz | 免 Key | 非商用免费 | ⚠️ | 艺术家/专辑/录音元数据 | 元数据补全 |
| AudioDB | 免费 Key | 免费层 | ⚠️ | 艺人传记/封面 | 艺人详情页 |
| Genius | Token | 约 100 次/月 | ⚠️ | 歌曲搜索/歌词（受限） | 歌词补充 |

### 78.2 iTunes Search API（完全免费，推荐兜底）

- 官方文档：https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
- 无需 API Key，无需登录

```javascript
// 搜索音乐
const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent('周杰伦')}&media=music&limit=20`);
const data = await res.json();
// data.results[0] => { trackName, artistName, collectionName, previewUrl, artworkUrl100, trackTimeMillis }

// 详情查询
const detail = await fetch(`https://itunes.apple.com/lookup?id=${trackId}`).then(r => r.json());
```

- 返回字段：`previewUrl`（30 秒试听）、`artworkUrl100`（封面，可改尺寸）、`trackViewUrl`（跳转链接）
- 限制：约 20 次/分钟/IP，超出返回 429

### 78.3 Deezer API（公开端点免 Key，CORS 支持）

- 官方文档：https://developers.deezer.com/api
- 搜索/曲目/榜单等公开端点无需 Key，用户数据才需要 OAuth

```javascript
// 搜索
const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent('周杰伦')}`);
const data = await res.json();
// data.data[0] => { id, title, artist:{name}, album:{title, cover_medium}, preview, duration }

// 全球榜单
const chart = await fetch('https://api.deezer.com/chart').then(r => r.json());
// chart.tracks.data / chart.albums.data / chart.artists.data

// 曲目详情（含 30s 预览地址）
const track = await fetch('https://api.deezer.com/track/3135556').then(r => r.json());
```

- `preview` 字段为 30 秒试听 MP3；注意预览音频 CDN 可能有 CORS 问题，必要时走代理

### 78.4 Spotify / Apple Music / YouTube

| 平台 | 认证流程 | 关键点 |
|------|---------|--------|
| Spotify | https://developer.spotify.com/documentation/web-api | Client Credentials / PKCE；**需 Premium 账户**；限流；不推荐浏览器直调，走后端代理 |
| Apple Music | https://developer.apple.com/musickit/ | JWT 开发者 Token（ES256）；`<script src="https://js-cdn.music.apple.com/musickit/v1/musickit.js">`；播放需 Apple Music 订阅 |
| YouTube | https://developers.google.com/youtube/v3 | API Key 即可；默认 10,000 配额单位/天（搜索约 100 单位/次）；**播放用 iframe**：`<iframe src="https://www.youtube.com/embed/{videoId}"></iframe>` |

### 78.5 元数据 / 歌词补充

| 平台 | 地址 | 用法 |
|------|------|------|
| Last.fm | https://www.last.fm/api | `artist.search` `track.getSimilar` `chart.getTopTracks`，免费 tier 约 5 req/s |
| MusicBrainz | https://musicbrainz.org/doc/MusicBrainz_API | `GET https://musicbrainz.org/ws/2/recording?query=...`，免 Key，建议代理 |
| AudioDB | https://www.theaudiodb.com/free_music_api | `GET https://www.theaudiodb.com/api/v1/json/2/search.php?s={艺人}`，免费 Key |
| Genius | https://genius.com/api-clients | 歌词/歌曲元数据，免费 tier 约 100 次/月，歌词授权受限 |

---

## 79. 免费音乐 API 与聚合开源方案

### 79.1 免费即用接口（免 Key，适合快速演示）

| 接口 | 地址 | 说明 |
|------|------|------|
| 音乐聚合搜索 | `https://jkyapi.top/API/yyjhss.php?msg={关键词}` | 聚合网易云/QQ/酷我/咪咕/千千，返回歌曲名/专辑/歌手/MP3/图片/歌词 |
| 网易云随机歌曲 | `https://api.uomg.com/api/rand.music?format=json` | 随机歌曲，返回名称/链接/封面 |
| 音乐搜索 | `https://api.apiopen.top/searchMusic?name={歌曲名}` | 免费搜索 |
| 音乐排行榜 | `https://api.apiopen.top/musicRankings` | 排行榜 |
| 音频素材 | `https://api.apiopen.top/audio` | 音乐/音效素材 |

> 来源：free-api.com 收录（#638 音乐聚合搜索、#302 随机歌曲 等）。稳定性以实测为准，仅建议用于 Demo 或兜底。

### 79.2 Listen1（多平台聚合方案参考）

| 项目 | 说明 |
|------|------|
| 简介 | 开源音乐聚合播放工具，「One for all free music in China」 |
| 支持平台 | 网易云 / QQ / 酷狗 / 酷我 / bilibili / 咪咕 / 千千 |
| 桌面版 | https://github.com/listen1/listen1_desktop（11.4k Star，v2.33.0，2025-06） |
| Chrome 扩展 | https://github.com/listen1/listen1_chrome_extension |
| 在线版 | https://listen1.github.io/listen1/ |

用途：参考其**多平台接口适配逻辑**，不建议直接搬运其播放器 UI。

### 79.3 自建聚合代理（推荐）

| 项目 | 技术栈 | 支持平台 | 亮点 |
|------|--------|---------|------|
| Meting-API | Hono.js | 网易云/QQ/酷狗/酷我/百度 | **可部署 Cloudflare Workers**，解决 CORS |
| Meting-Fixed | PHP | 网易云/QQ/酷狗/酷我 | 服务器端方案 |
| amlx-music-api | Go | 网易云/QQ/酷狗 | 单二进制部署 |
| multiPlatformMusicApi | Node.js | 网易云 84+/QQ 69+ 接口 | 接口数量多 |

---

## 80. 伪系统音乐播放器完整集成方案

### 80.1 推荐架构

```
┌─────────────────────────────────────────────────────────┐
│  Nexus OS 前端（music 应用）                              │
│  搜索框 → 榜单 → 歌单 → 歌曲列表 → 播放器（<audio>）        │
│  Media Session API 控制媒体键（播放/暂停/下一首）            │
└──────────────────────────┬──────────────────────────────┘
                           │ fetch（浏览器直调）
┌──────────────────────────▼──────────────────────────────┐
│  Cloudflare Worker 代理（CORS 头 + 限速 + 缓存）            │
│  方案 A：转发 NeteaseCloudMusicApi（网易云主曲库）           │
│  方案 B：Meting-API（多平台聚合）                           │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│  网易云 / QQ / 酷狗 / 酷我 / 咪咕 官方接口                  │
│  免费兜底：Deezer + iTunes Search（无 Key 直调）            │
└─────────────────────────────────────────────────────────┘
```

### 80.2 完整播放器核心代码

```javascript
// ===== Nexus OS 音乐播放器（可嵌入 music 应用窗口）=====
const API = 'https://你的代理.example/music-api'; // 自建代理

const player = {
  queue: [],       // 播放队列
  current: 0,      // 当前索引
  audio: document.getElementById('nexus-audio') || new Audio(),

  async init() {
    // 注册媒体键控制（锁屏/耳机键可用）
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => this.audio.play());
      navigator.mediaSession.setActionHandler('pause', () => this.audio.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    }
    // 加载默认榜单
    this.queue = await this.getToplist();
    this.renderQueue();
  },

  async search(kw) {
    const r = await fetch(`${API}/cloudsearch?keywords=${encodeURIComponent(kw)}&limit=30`).then(r => r.json());
    this.queue = r.result.songs.map(s => ({
      id: s.id, title: s.name,
      artist: s.ar.map(a => a.name).join(' / '),
      album: s.al.name, cover: s.al.picUrl,
    }));
    this.renderQueue();
  },

  async play(index) {
    this.current = index;
    const song = this.queue[index];
    const r = await fetch(`${API}/song/url?id=${song.id}&br=320000`).then(r => r.json());
    this.audio.src = r.data[0].url;
    this.audio.play();

    // 更新媒体会话锁屏信息
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title, artist: song.artist, album: song.album,
        artwork: [{ src: song.cover, sizes: '512x512' }],
      });
    }
    // 歌词
    const lrc = await fetch(`${API}/lyric?id=${song.id}`).then(r => r.json());
    this.renderLrc(lrc.lrc?.lyric || '');
  },

  next() { this.play((this.current + 1) % this.queue.length); },
  prev() { this.play((this.current - 1 + this.queue.length) % this.queue.length); },
  // renderQueue / renderLrc：渲染歌曲列表与逐行歌词（LRC 时间轴解析）...
};
```

### 80.3 集成检查清单

- [ ] 部署 NeteaseCloudMusicApi（本地 npm start 或 Vercel / 服务器 Docker）
- [ ] 配置 Cloudflare Worker 转发 + CORS 头
- [ ] 前端接入搜索 / 榜单 / 歌单 / 播放 / 歌词五个核心流程
- [ ] 接入 Media Session API（媒体键 + 锁屏信息）
- [ ] 免费兜底：Deezer / iTunes Search（API Key 不可用时自动降级）
- [ ] 处理 VIP 歌曲降级提示（拿不到播放地址时显示「试听受限」）
- [ ] 播放器 UI 复用现有液态玻璃风格（见第七部分）

---

*第十部分新增时间: 2026-09-05（第 74-80 章：音乐 API 总览 + 网易云重点 + QQ/酷狗/酷我/咪咕 + 国际平台 + 免费聚合 + 完整集成方案）*


