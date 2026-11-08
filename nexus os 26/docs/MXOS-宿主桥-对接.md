# MXOS 宿主桥对接说明（Nexus OS 26 ⇄ MXOS 应用包）

> 面向 MXOS 作者：应用包在 Nexus 商城里以 sandbox `srcdoc` iframe 运行，宿主通过 postMessage 暴露一组低风险能力。
> 版本：bridge v1（`window.MXOS.version = '1.0'`）。
> 实现位置：`ui/n26-store.js`（宿主侧白名单 + 子侧 shim 注入）。

## 1. 调用方式

应用包**不需要**自己写 postMessage，宿主会在 `<head>` 最前注入 shim：

```js
// 两种写法都可用（老包 window.parent.MXOS 也已被 shim 兼容）
const api = window.MXOS || window.parent.MXOS;

api.notify({ title: '方码', body: '保存成功', type: 'success' }); // 同步返回 true
await api.Notification.show({ title: '完成', body: '…' });        // Promise
const info = await api.getInfo();                                  // 真实宿主信息
```

`api.request(method, params)` 是通用入口，返回 Promise；失败时 reject 的 Error 带 `code`。

## 2. 方法清单（bridge v1）

| method | 入参 | 返回（result） |
|---|---|---|
| `host.info` | — | `{ host, hostVersion, bridge, app:{id,name,version}, theme, language, timezone, user:{displayName,isGuest}, time }` |
| `theme.get` | — | `{ mode:'light'|'dark', lang }` |
| `locale.get` | — | `{ language, timezone, now }` |
| `user.get` | — | `{ displayName, isGuest }` |
| `notify.show` | `{ title, body, type }` | `{ shown:true }`（type: info/success/warning/error） |
| `app.open` | `{ appId }` | `{ opened, name }`（仅宿主内置应用，禁止 `mx_` 应用） |
| `storage.get` | `{ key }` | `{ key, value }`（value 为字符串或 null） |
| `storage.set` | `{ key, value }` | `{ key, bytes }`（key 限 `[A-Za-z0-9_.-]` 1–64 字符，单值 ≤ 32KB） |
| `storage.remove` | `{ key }` | `{ key, removed:true }` |
| `storage.keys` | — | `{ keys:[...] }`（最多 200 个） |

高阶封装：`getInfo()`、`getTheme()`、`getLocale()`、`getUser()`、`openApp(id)`、
`notify(payload)`、`Notification.show(payload)`、`storage.get/set/remove/keys`。

## 3. 协议（如需自己实现）

子 → 父：

```js
parent.postMessage({ __n26mx: 1, id: 'req-1', method: 'host.info', params: {} }, '*');
```

父 → 子：

```js
{ __n26mx: 1, id: 'req-1', ok: true, result: {...} }
{ __n26mx: 1, id: 'req-1', ok: false, error: { code: 'E_UNKNOWN_METHOD', message: '…' } }
```

`id` 由调用方生成，用于应答配对；shim 8 秒未收到应答会清理挂起项并以 `E_TIMEOUT` 拒绝。

## 4. 安全边界（宿主侧强制）

- **来源校验**：只认已注册商城窗口（`event.source === iframe.contentWindow`），未注册来源的消息直接丢弃且不回包。
- appId 只从注册表取，**不读请求体里的身份字段**；存储键前缀为 `n26MxStore:<appId>:`，应用无法读写其它应用数据。
- 能力白名单：不开文件系统、命令执行、任意网络、跨应用数据；`app.open` 只允许宿主内置应用。
- 限流：单窗口 2 秒内最多 30 次请求，超出返回 `E_RATE_LIMIT`。
- 异常在宿主内捕获后转成 `{ ok:false, error }`，不会冒泡；子侧不暴露同步异常。
- sandbox 保持 `allow-scripts allow-forms allow-popups allow-modals allow-downloads`，**不含** `allow-same-origin` 与 `allow-top-navigation`；`window.parent.MXOS` 由 shim 用 `defineProperty` 提供，父窗口仍为不透明源隔离。

## 5. 错误码

`E_UNKNOWN_METHOD`、`E_BAD_PARAMS`、`E_BAD_KEY`、`E_TOO_LARGE`、`E_NOT_ALLOWED`、`E_NOT_FOUND`、`E_RATE_LIMIT`、`E_UNAVAILABLE`、`E_INTERNAL`、`E_TIMEOUT`（子侧超时）。

## 6. 已验证

方码 v1.0.0 实机：`host.info` 返回 `hostVersion=v2.9.67 / theme=light / language=zh-CN / timezone=Asia/Shanghai / user=访客`；
`notify` 触发宿主通知；`fs.write` 被拒 `E_UNKNOWN_METHOD`；非法存储键被拒 `E_BAD_KEY`；未注册 iframe 伪造请求无应答（`rejected+1`）。
