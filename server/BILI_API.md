# Nexus OS 26 · B站（方哩方哩）后端接口

- Base URL：`https://ai.fanggame.company`
- 代码：`server/src/bili.js`，公共 HTTP 层 `server/src/http.js`
- 部署：Cloudflare Worker（自定义域名 `ai.fanggame.company`，非 `*.workers.dev`）
- 范围：仅后端；本轮不改 `Nexus OS 26.html` 主壳

## 统一约定

成功信封：

```json
{ "ok": true, "code": 0, "data": { } }
```

失败信封：

```json
{ "ok": false, "code": "BILI_412", "error": "人话错误", "upstream": { } }
```

| 项目 | 约定 |
| --- | --- |
| CORS | `Access-Control-Allow-Origin: *`（可用 `ALLOW_ORIGIN` 变量改成逗号分隔白名单并回显 Origin）；`Range` 已加入允许头 |
| 超时 | 普通接口 12s，播放地址 15s；超时返回 504 `BILI_TIMEOUT` |
| 缓存 | feed 300s / search 600s / video 600s / play 300s / related 600s；KV 键前缀 `bili:*`，响应头 `X-Cache: HIT/MISS` |
| 来源标记 | 响应头 `X-Bili-Via: relay / direct / html / kv` |
| 错误码 | `BILI_412` 风控、`BILI_RELAY_LIMIT` 中转限流、`BILI_TIMEOUT` 超时、`BILI_-404` 视频不存在、`BILI_NON_JSON` 上游异常 |
| 密钥 | Worker 不向前端返回任何 Cookie；`BILI_COOKIE` 只存在服务端变量里 |

### 上游架构（重要）

Cloudflare 的所有出口 IP 都被 B站整段 412（实测连 `www.bilibili.com` 的 HTML 都拦）。
因此默认走「Google 翻译代理中转优先，直连兜底」：

```
Worker → api-bilibili-com.translate.goog（Google 出口）→ api.bilibili.com
       ↘ 直连 api.bilibili.com（保留，等 IP 解封后自动生效）
```

- WBI 签名参数会把 Google 强制的 `_x_tr_sl/_x_tr_tl/_x_tr_hl` 一并纳入，避免 `-352`。
- 中转是免费共享配额，高峰会 429；已做 5 次退避重试 + KV 缓存。
- 可通过 `BILI_RELAY` 变量换自己的中转（完整 URL 前缀），或设成 `direct` 只走直连。
- 直连/中转都拿不到时，`video` 与 `search` 会退到网页 `__INITIAL_STATE__` / SSR 卡片解析。

## 接口

### 1. 首页信息流

`GET /api/bili/feed?page=1&ps=20`

- `page`：页码，默认 1
- `ps`：每页条数，1–40，默认 20
- 上游：`/x/web-interface/wbi/index/top/feed/rcmd`，失败自动退 `/x/web-interface/popular`
- `data.source`：`rcmd` 或 `popular`
- 兼容旧名：`GET /api/bili/popular?ps=&pn=`

真实样例（截断）：

```json
{
  "ok": true, "code": 0,
  "data": {
    "page": 1, "ps": 5, "source": "rcmd", "hasMore": true,
    "items": [
      {
        "bvid": "BV142xk6wEuy", "aid": 117534749629062,
        "title": "店里今天到了一个新食材 大章鱼，看看怎么做好吃，厨师长先做2个吃法，试试菜，好吃的话再卖给客人",
        "cover": "https://i1.hdslb.com/bfs/archive/8fe48cee6d84e9cf3add2008b9beb8d4f6d092de.jpg",
        "author": "张森的下班料理", "mid": 472229397,
        "view": 819254, "danmaku": 1380, "duration": 718, "pubdate": 1793869200, "tag": ""
      }
    ]
  }
}
```

（第二次请求返回头 `X-Cache: HIT`，实测命中 KV。）

### 2. 搜索

`GET /api/bili/search?keyword=侯pp&page=1&order=`

- `keyword` 必填（也可用 `q`）
- `order` 可选：`totalrank`/`click`/`pubdate`/`dm`/`stow`
- 说明：搜索 API 现在返回 `data.v_voucher`（Gaia 人机验证），没有 Cookie 拿不到列表；
  已自动退到搜索页 SSR 解析，`data.via = "html"`（缓存命中为 `html-cache`）
- 兜底结果的可选字段为空：`aid=0`、`view=0`、`duration=""`（页面首屏不提供）

真实样例（截断）：

```json
{
  "ok": true, "code": 0,
  "data": {
    "keyword": "侯pp", "page": 1, "via": "html-cache", "numResults": 42,
    "items": [
      {
        "bvid": "BV1D6sf6jET3", "aid": 0,
        "title": "【1-5季】骑H2开学校花竟是前女友",
        "cover": "https://i0.hdslb.com/bfs/archive/cebb4aa22a49b04b5f0efe6dc986dd3acc74e4f1.jpg",
        "author": "嘻哈2640", "mid": 0, "view": 0, "danmaku": 0,
        "duration": "", "pubdate": 0, "tag": ""
      }
    ]
  }
}
```

### 3. 视频详情

`GET /api/bili/video?bvid=BV1BA4K6UEAb`（也支持 `?aid=`）

`data.pages[]` 提供分P：`cid/page/part/duration/width/height`。

真实样例（截断）：

```json
{
  "ok": true, "code": 0,
  "data": {
    "bvid": "BV1BA4K6UEAb", "aid": 117548305614749, "cid": 43275125127,
    "title": "这才是真正的贵州",
    "cover": "https://i2.hdslb.com/bfs/archive/3d5af886354cc0a1d8bb87f198dd16c78def1f2e.jpg",
    "author": { "mid": 301700504, "name": "九司漫画", "face": "https://i2.hdslb.com/bfs/face/7c9ffa88edda3dd30ce3168a6cc7fedd6509b35b.jpg" },
    "desc": "这才是真正的贵州", "duration": 190,
    "stat": { "view": 1132031, "danmaku": 0, "like": 0, "coin": 0, "favorite": 0, "share": 0 },
    "pages": [{ "cid": 43275125127, "page": 1, "part": "", "duration": 190 }],
    "url": "https://www.bilibili.com/video/BV1BA4K6UEAb"
  }
}
```

### 4. 播放地址

`GET /api/bili/play?bvid=BV1BA4K6UEAb&cid=&q=64`

- `cid` 可省略：服务端自动取第一 P
- `q/qn`：请求清晰度，默认 64（720P）；无 Cookie 时上游只给 64/16
- 返回 `accept` 为上游真实可选项，绝不伪造 1080P
- 采用 `platform=html5` 直出单文件 MP4（含音轨），可直接 `<video>` 播放
- `durl[].url` 已按 CDN 可达性排序；`durl[].proxy` 是带全部候选的字节代理地址

真实样例（截断）：

```json
{
  "ok": true, "code": 0,
  "data": {
    "bvid": "BV1BA4K6UEAb", "cid": 43275125127,
    "quality": { "id": 64, "label": "高清 720P" },
    "accept": [{ "id": 64, "label": "高清 720P" }, { "id": 16, "label": "流畅 360P" }],
    "loginRequired": false,
    "durl": [{
      "order": 1, "size": 28561988, "length": 189546, "format": "mp4",
      "url": "https://upos-hz-mirrorakam.akamaized.net/...",
      "backup": ["https://upos-sz-mirrorcosov.bilivideo.com/..."],
      "proxy": "https://ai.fanggame.company/api/bili/stream?url=...&url=..."
    }]
  }
}
```

> 实测：主 CDN `*.bilivideo.com` 在 Cloudflare 出口被腾讯 EdgeOne 回 **567**；
> Akamai 备份线 `*.akamaized.net` 正常，所以播放地址优先给 Akamai，`proxy` 内置自动换线。

### 5. 相关推荐

`GET /api/bili/related?bvid=BV1BA4K6UEAb` → `data.items[]`（实测 40 条）

### 6. 封面/头像代理

`GET /api/bili/img?url=<https://i0.hdslb.com/...>`

- 只允许 `hdslb.com` / `bilibili.com` / `biliimg.com`
- 补 `Referer` 防盗链，`Cache-Control: public, max-age=86400, immutable`
- 实测：`200`、`image/jpeg`、`Content-Length: 284101`

### 7. 视频字节代理（支持 Range）

`GET /api/bili/stream?url=A&url=B&...`

- 只允许 B站视频 CDN 域名（`bilivideo.com/.cn`、`akamaized.net`、`hdslb.com` 等）
- 透传 `Range`，返回 `206` + `Content-Range` + `Accept-Ranges: bytes`
- 自动按顺序尝试多个候选，响应头 `X-Bili-Cdn` 标明实际命中的 CDN

实测：

```
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-2047/28561988
Content-Length: 2048
Accept-Ranges: bytes
X-Bili-Cdn: upos-hz-mirrorakam.akamaized.net
```

### 8. 弹幕（数据源受限）

`GET /api/bili/danmaku?cid=` → `{ cid, count, items:[{ t, m, c, x }] }`

- `t` 出现时间（秒）、`m` 模式、`c` 颜色十进制、`x` 文本
- KV 缓存键 `bili:dm:<cid>`，TTL 900 秒；上限 3000 条
- **现状**：`comment.bilibili.com` 与本机直连可用，但 Cloudflare Worker 出口被 B站风控
  回 `412`（Google 中转同样 412），所以线上该端点目前稳定返回 `502 BILI_DM_UPSTREAM`。
  前端已做真实开关与失败提示，不会伪造弹幕；需要弹幕时用应用内 iframe 模式。
- 若后续换出口 / 拿到可用中转，无需改前端，端点会自动生效。

### 9. 运维接口

- `GET /api/bili/health`：中转地址、WBI 状态、缓存 TTL
- `GET /api/bili/diag`：上游/中转连通性探针（只读，用于排障）
- `GET /api/bili/ranking?rid=0`：排行榜（兼容旧前端）

### 9. B站扫码登录（Cookie 只存在服务端）

纯前端拿不到 B站 Cookie（跨域 + HttpOnly + 风控），登录全部走 Worker：

| 接口 | 说明 |
| --- | --- |
| `GET /api/bili/login/qrcode` | 生成二维码（服务端渲染 SVG） |
| `GET /api/bili/login/poll?token=` | 轮询扫码状态，成功后种会话 |
| `GET /api/bili/login/me?token=` | 校验会话并返回资料 |
| `GET /api/bili/login/logout?token=` | 删除服务端会话 |
| `GET /api/bili/login/diag[?key=]` | 登录链路探针：不带 key 测 generate，带 key 测 poll |

#### 9.1 生成二维码

`GET /api/bili/login/qrcode`

- 上游：`passport.bilibili.com/x/passport-login/web/qrcode/generate`。线上实测 CF 出口访问
  `passport` / `passport.biligame` 都是 412，所以**中转优先**（`passport-bilibili-com.translate.goog`），
  429 时退避重试最多 3 次，再回退两个直连域名
- generate/poll 都带 `_t=<ms>` 打掉 Google 中转的 URL 缓存：复用同一个 URL 会拿到已过期的二维码
- 二维码由 Worker 内 `qrcode-generator` 渲染成 SVG，**不经过任何第三方二维码服务**
- 存储：`bili:login:qr:<token>` 存 `qrcode_key`，TTL 240s；KV 写入额度用尽时自动退回 Cache API
- 响应 `Cache-Control: no-store`

```json
{
  "ok": true, "code": 0,
  "data": {
    "token": "053f...", "url": "https://passport.biligame.com/...",
    "svg": "<svg ...>", "expires_in": 180, "via": "relay"
  }
}
```

#### 9.2 轮询状态

`GET /api/bili/login/poll?token=<24–64 位 hex>`

| `data.status` | 含义 | 上游 code |
| --- | --- | --- |
| `waiting` | 等待扫码 | 86101 |
| `scanned` | 已扫码，等手机确认 | 86090 |
| `expired` | 二维码过期（同时删二维码记录） | 86038 |
| `ok` | 登录成功（同时写会话） | 0 |

`ok` 时 Worker 从 `Set-Cookie` 提取 `SESSDATA / bili_jct / DedeUserID / DedeUserID__ckMd5`；
中转剥离 Set-Cookie 时从 `data.url` 的 query 解析兜底。两处都拿不到就返回 502 `BILI_LOGIN_COOKIE`，不伪造登录。
前端每 4s 轮询一次；连续 5 次网络失败才停止，并在状态栏显示具体错误。

Cookie 经 AES-GCM 加密后写入 `bili:login:sess:<token>`，key = SHA-256(`BILI_LOGIN_SECRET|token`)，TTL 7 天（604800s），
同时删除二维码记录。响应只回资料，不回 Cookie。

> 存储降级：KV 免费额度为 1000 写/天，额度用尽时 `put()` 返回 `KV put() limit exceeded for the day.`。
> 登录相关读写统一走 `lPut/lGet/lDel`：先写 KV，再写 `caches.default`；读取时 KV 未命中则读 Cache。
> Cache 是**按 colo**的，只要用户请求落在同一 PoP 就能完成扫码 → 会话校验（实测可用）；跨地域/跨 PoP 会退化为 anonymous，需要重新扫码。

```json
{
  "ok": true, "code": 0,
  "data": {
    "status": "ok", "ttl": 604800,
    "profile": {
      "mid": 123, "name": "昵称", "face": "https://i0.hdslb.com/...",
      "fans": 12, "following": 34, "level": 5, "sign": "..."
    }
  }
}
```

资料来自公开 `/x/web-interface/card` + `/x/relation/stat`（走中转）；失败时直连带用户 Cookie 的 `/x/web-interface/nav`；
仍失败就返回 `name: ""` 的空资料，并让前端如实提示「资料未取到」，不用假资料填充。

#### 9.3 会话校验 / 退出

- `GET /api/bili/login/me?token=` → `{ status: "ok", profile, at }`；无记录或 token 非法 → `{ status: "anonymous" }`
- `GET /api/bili/login/logout?token=` → 删除 `bili:login:qr:*` 与 `bili:login:sess:*`，返回 `{ ok: true }`
- 以上接口均 `Cache-Control: no-store`，不进入 5 分钟 GET 缓存

> 安全边界：浏览器只持有 `token`（localStorage `bili26.token`），从不接触 Cookie 明文；
> Worker 不把 Cookie 回传给前端。`BILI_LOGIN_SECRET` 建议用 `wrangler secret put` 配置，未配置时使用内置默认串（只做隔离，不是强密钥）。

#### 9.4 链路探针

`GET /api/bili/login/diag`：对 `passport` / `passport.biligame` / Google 中转分别发一次 generate，返回
`{ mode, status, ms, json, body }`，用于判断 412（风控）与 429（中转限流）。

`GET /api/bili/login/diag?key=<qrcode_key>`：改测 poll，返回三路的原始 `body`（`data.code` 为 86101 表示正常未扫码）。
线上实测：Cloudflare 出口对两个 passport 域名均 412，只有 `passport-bilibili-com.translate.goog` 返回 200。

## 前端接入要点

1. 封面/头像统一走 `cover` 字段（已是 https）；若上游偶发防盗链，改用 `/api/bili/img?url=`。
2. 播放直接用 `durl[0].proxy`，不要用 `durl[0].url`——主 CDN 对部分网络会 567。
3. 列表渲染取 `bvid` 作为 key；`aid` 可能为 0（搜索兜底）。
4. 播放/详情默认全部在应用内原生渲染，**任何情况下都不打开外站标签页**。应用内可手动切到 iframe 模式嵌入 B 站网页版（sandbox 禁 popup / top-navigation，链接仍留在应用内），选择写入 `n26.bili.mode`。
5. `X-Bili-Via` 可用于诊断：`relay` 正常、`html` 走了页面兜底、`kv` 命中缓存。

## 已知限制

- 中转是 Google 免费通道，高峰期可能 429；已用重试 + KV 缓存缓解，但不能承诺 100% 可用。
- 无 Cookie 时最高 720P；要 1080P 需在 `wrangler.toml [vars] BILI_COOKIE` 配置 SESSDATA，且该 Cookie 无法经中转使用。
- 搜索首屏最多 ~42 条，翻页能力弱（页面兜底）；要完整翻页需登录 Cookie 直连（当前 IP 被封）。
- 弹幕：`/api/bili/danmaku` 已实现，但 Cloudflare 出口被 B站风控 412，线上暂不可用（见 §8）；直播 / 字幕仍未实现。
- 扫码登录依赖 `passport.bilibili.com`；Cloudflare 出口对 `passport` / `passport.biligame` 均 412，只能走 Google 中转。
  中转有 429 限流，生成二维码/轮询偶尔失败；前端会提示并允许重试，不会用假账号兜底。
- 登录态默认存 KV，7 天自然过期；KV 当日写入额度用尽时自动降级到 Cache API（按 colo，短期可用）。
  跨 PoP 或 Cache 被驱逐后会退化为未登录，需要重新扫码。会话 token 只在生成它的浏览器里有效。

## curl 速查

```bash
curl "https://ai.fanggame.company/api/bili/feed?page=1&ps=5"
curl "https://ai.fanggame.company/api/bili/search?keyword=%E4%BE%AF%E5%92%94%E5%92%94"
curl "https://ai.fanggame.company/api/bili/video?bvid=BV1BA4K6UEAb"
curl "https://ai.fanggame.company/api/bili/play?bvid=BV1BA4K6UEAb"
curl "https://ai.fanggame.company/api/bili/related?bvid=BV1BA4K6UEAb"
curl -r 0-2047 "<play 返回的 proxy>"
curl "https://ai.fanggame.company/api/bili/login/qrcode"
curl "https://ai.fanggame.company/api/bili/login/poll?token=<qrcode 返回的 token>"
curl "https://ai.fanggame.company/api/bili/login/me?token=<token>"
curl "https://ai.fanggame.company/api/bili/login/logout?token=<token>"
curl "https://ai.fanggame.company/api/bili/login/diag"
curl "https://ai.fanggame.company/api/bili/login/diag?key=<qrcode_key>"
```
