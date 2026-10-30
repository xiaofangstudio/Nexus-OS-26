# Nexus OS 26 · AI 小方后端（Cloudflare Worker）

> **BYOK（Bring Your Own Key）**：用户填自己的 Key，Worker 只做 CORS 转发。
> **服务器不持有任何人的 Key，站长不承担任何调用费用。**
>
> 线上地址：`https://ai.fanggame.company` ｜ Worker 名：`nexus-os-ai` ｜ 版本：`2.0.0-byok`

---

## 一、为什么还需要这个后端？

各家 AI 官方接口（DeepSeek / OpenAI / 通义…）**不给浏览器跨域**，网页直接 `fetch` 会被 CORS 拦掉。
所以需要一层代理补 `Access-Control-Allow-Origin`。这层代理**只转发**，不存 key、不记日志、不计费。

```
用户浏览器 ──(自己的 Key)──> Worker(仅补 CORS 转发) ──> AI 官方接口
                │
                └─ Key 只存在用户本机 localStorage，随请求头带上，用完即弃
```

---

## 二、接口

| 接口 | 说明 |
| --- | --- |
| `POST /api/chat` | OpenAI 兼容转发。**必须带用户自己的 Key** |
| `GET /api/health` | 返回 `mode:"byok"`、`ownerKey:false`、支持的供应商列表（无任何密钥） |
| `GET /api/models` | 供应商 id / 名称 / 默认模型 |
| `ALL /api/mx/*` | MX 应用商店反向代理：`/api/mx/apps` → `{MX_STORE_BASE}/apps`，补 CORS、绕 http 混合内容 |

### 鉴权（二选一）

```
Authorization: Bearer sk-用户自己的key
X-AI-Key: sk-用户自己的key
```

### 请求体

```json
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "messages": [{ "role": "user", "content": "把壁纸换成深色" }],
  "tools": [{ "type": "function", "function": { "name": "setWallpaper", "parameters": { } } }],
  "max_tokens": 512,
  "stream": false
}
```

- `provider` 可选：`deepseek` `openai` `qwen` `moonshot` `zhipu` `siliconflow` `groq` `ollama`
- 也可传 `baseUrl` 用自己的中转/自建（仅 https，禁止内网地址；本机 Ollama 例外）

### 响应

```json
{ "ok": true, "provider": "deepseek", "content": "好的", "tool_calls": null,
  "finish_reason": "stop", "usage": { } }
```

错误码：`NO_KEY`(401 没填 key) / `BAD_KEY`(401 key 失效) / `UPSTREAM_ERROR` / `BAD_TARGET` / `UPSTREAM_FETCH`

---

## 三、部署 / 修改

```bash
cd "D:/20533/deskbox/files/小方规划/小游戏/nexus os 26/server"
wrangler deploy                  # 部署（无需任何 secret）
wrangler dev --port 8787         # 本地联调
```

**不需要配置 `AI_API_KEY`**——以前配过的已删除，`wrangler secret list` 现在是空的。
如需改供应商列表，直接编辑 `src/index.js` 顶部的 `PROVIDERS`。

---

## 四、前端怎么接

设置 → AI 小方 里让用户填三项：

| 字段 | 说明 |
| --- | --- |
| 服务地址 | `https://ai.fanggame.company`（默认，可改） |
| 供应商 | 下拉选 deepseek/openai/qwen/…（对应 `provider`） |
| 我的 API Key | 用户自己的 key，**只存 localStorage**，请求时放 `Authorization` 头 |

前端调用示例：

```js
const res = await fetch(cfg.endpoint + '/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key },
  body: JSON.stringify({ provider: cfg.provider, messages, tools }),
});
const data = await res.json();
// data.content 文本；data.tool_calls 交给前端本地执行（开应用/改设置/截图…）
```

安全提示（界面上要写）：Key 存本机 localStorage，别在公用电脑上填；泄露请去对应平台吊销。

---

## 五、当前状态

- ✅ `https://ai.fanggame.company` 已上线（自定义域名，证书自动）
- ✅ `mode: byok`、`ownerKey: false`、8 个供应商可用
- ✅ 无 key → 401 明确提示；带用户 key → 真实回复；`tools` 透传正常
- ✅ MX 商店代理在线（对方隧道已恢复，但商店暂空 `items: []`）
- ⚠️ `*.workers.dev` 在本机网络被 DNS 污染，已停用，只用自定义域名

---

## 三、B站 API 反向代理（2026-10-26 新增）

| 接口 | 说明 |
| --- | --- |
| `ALL /api/bili/*` | `https://api.bilibili.com/*` 反向代理：补 CORS + Referer/UA（绕 -412 风控）。可选请求头 `X-Bili-Cookie` 透传用户自己的 B站 Cookie（搜索等需登录态接口用），服务器不存。 |

示例：`GET /api/bili/x/web-interface/popular?ps=20` → B站热门视频。
无需 wbi 签名的公开接口（popular / ranking / view / player-info 等）可直接用；搜索类接口建议带 `X-Bili-Cookie`。

## 四、方聊（N聊）后端

见 `nliao/` 子目录（独立 Worker，含 D1 + Durable Object），README 与部署步骤在同目录。
