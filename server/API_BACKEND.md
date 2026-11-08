# Nexus OS 26 · 后端接口（v3.2 批次）

基址：`https://ai.fanggame.company`（主 Worker `nexus-os-ai`）
方聊基址：`https://nliao.fanggame.company`（Worker `nexus-nliao`）
最后实测：2026-11-07，主 Worker 版本 `025aa5df-69ef-4cc6-9b32-a25c38a5b8b0`

统一信封：
- 成功 `{ "ok": true, "code": 0, "data": { ... } }`（B站/新闻/天气/地图）
- 失败 `{ "ok": false, "code": "XXX", "error": "人话错误" }`
- 音乐沿用旧结构 `{ ok, src, tracks }` / `{ ok, playable, play }`，兼容既有前端

---

## 1. 音乐（网易云，免 key）

| 端点 | 说明 |
|---|---|
| `GET /api/music/search?keyword=&q=&limit=&src=` | `keyword` 与 `q` 等价；`src=auto|netease|itunes|deezer` |
| `GET /api/music/url?src=netease&id=&br=320` | 返回 `{ok:true, playable:true, play:"/api/music/stream?u=…"}`；不可播 `{ok:false, playable:false, reason:"vip"}`（HTTP 200） |
| `GET /api/music/lrc?src=netease&id=` | `{ok:true, lrc, via}` |
| `GET /api/music/cover?u=<b64url>` / `?id=<pic_id>` | 封面代理，域名白名单 |
| `GET /api/music/stream?u=<b64url>` | 音频字节代理，透传 `Range`（**206 已验证**） |
| `GET /api/music/health` | 各源健康度 |

实测样例：

```bash
curl "https://ai.fanggame.company/api/music/search?keyword=周杰伦&src=netease&limit=3"
# 200；首条：{"id":"509781655","name":"想你就写信 (Live)","artist":"周杰伦/李硕/张鑫",
#            "album":"中国新歌声第二季 第13期","cover":"https://p4.music.126.net/…jpg","via":"vkeys"}

curl "https://ai.fanggame.company/api/music/url?src=netease&id=210049"
# 200 {"ok":true,"playable":true,"play":"/api/music/stream?u=aHR0…","type":"mp3","via":"meting"}

curl -H "Range: bytes=0-1023" "https://ai.fanggame.company/api/music/stream?u=aHR0…"
# 206  Content-Type: audio/mpeg  Content-Range: bytes 0-1023/481115
```

取数与降级链（全部免 key，服务端完成）：
1. 官方 `music.163.com`（境内可用；Cloudflare 出口搜索常 `-462`）
2. **VKeys** `api.vkeys.cn/v2/music/netease`（当前搜索主链路，返回网易云曲库 + 封面）
3. **Meting** `api.injahow.cn/meting`（播放地址 302 直链 + 歌词）
4. GD Studio（当前 CF 出口 520，仅作最后兜底）

缓存：搜索 10 min、播放地址 10 min、歌词 24 h、封面 7 天。
不可播放的曲目：`/url` 返回 `ok:false, playable:false, reason:"vip"`，前端置灰，不伪造音频。

---

## 2. 天气（和风 QWeather，**需配置 key**）

配置（key 只进 Worker secret，前端永不可见）：

```bash
cd "D:\20533\deskbox\files\小方规划\小游戏\nexus os 26\server"
wrangler secret put QWEATHER_KEY     # 粘贴和风 key
# 若和风给你分配了专属 API Host（新版控制台），在 wrangler.toml 改 QWEATHER_BASE
wrangler deploy
```

| 端点 | 参数 |
|---|---|
| `GET /api/weather/now` | `lat=&lon=` 或 `location=<lon,lat>` 或 LocationID |
| `GET /api/weather/hourly` | 同上 + `hours=24|72` |
| `GET /api/weather/daily` | 同上 + `days=3|7` |
| `GET /api/weather/city?q=北京` | 城市名 → LocationID/经纬度 |
| `GET /api/weather/health` | `{configured:true/false}` |

归一化字段：
- now：`obsTime,temp,feelsLike,text,icon,iconUrl,windDir,windScale,humidity,precip,pressure,vis`
- hourly：`time,temp,text,icon,pop,precip,humidity`
- daily：`date,tempMax,tempMin,textDay,textNight,iconDayUrl,sunrise,sunset,precip,uvIndex`

缓存：now 10 min、hourly/daily 30 min、city 7 天。

未配置时实测（当前状态）：

```json
HTTP 503
{"ok":false,"code":"WEATHER_NO_KEY",
 "error":"天气服务未配置：请执行 wrangler secret put QWEATHER_KEY 后重新部署"}
```

Key 无效/超限映射：`WEATHER_KEY_INVALID` / `WEATHER_QUOTA` / `WEATHER_NO_DATA`（均为明确错误码）。

---

## 3. 地图（高德 AMap，**需配置 key**）

```bash
wrangler secret put AMAP_KEY
wrangler deploy
```

| 端点 | 参数 |
|---|---|
| `GET /api/map/geocode?address=&city=` | 地址 → 经纬度 |
| `GET /api/map/regeo?lat=&lon=` | 逆地理 + 周边 POI（前 10） |
| `GET /api/map/poi?keyword=&city=&page=&size=` | 关键字 POI 搜索（size ≤ 25） |
| `GET /api/map/health` | `{configured,rate}` |

缓存：geocode/regeo 24 h、poi 6 h。限流：每实例每 IP 60 次/分钟（超限 `429 MAP_RATE_LIMIT` + `Retry-After`）。

未配置时实测：

```json
HTTP 503
{"ok":false,"code":"MAP_NO_KEY",
 "error":"地图服务未配置：请执行 wrangler secret put AMAP_KEY 后重新部署"}
```

---

## 4. 新闻（RSS 聚合，免 key）

| 端点 | 说明 |
|---|---|
| `GET /api/news/feed?source=all&limit=30&fresh=1` | 多源合并、按时间倒序、标题去重 |
| `GET /api/news/sources` | 源清单 |

源（实测 4/5 可用）：IT之家、少数派、爱范儿、中国新闻网；36氪 `feed-newsflash` 从 CF 出口返回 HTML → 标记 `failed`（不伪造）。

条目结构：`{id,title,link,summary,cover,source,sourceName,published,time}`
缓存 10 min/源。响应头 `X-News-Sources-Ok` / `X-News-Sources-Failed`。

实测样例：

```json
HTTP 200  2.47s
{"ok":true,"code":0,"data":{
  "source":"all","total":3,
  "sources":[{"id":"ithome","count":60},{"id":"sspai","count":10},{"id":"ifanr","count":20},{"id":"chinanews","count":30}],
  "failed":[{"id":"36kr","error":"解析到 0 条（上游可能返回了 HTML 或已停更）"}],
  "items":[{"title":"《GTA 6》游戏预载倒计时，消息称 XBOX 版下载量比 PS5 版多约 15GB",
            "link":"https://www.ithome.com/1/023/678.htm","source":"ithome",
            "summary":"IT之家 11 月 7 日消息…","published":"2026-11-07T05:51:00.000Z"}]}}
```

---

## 5. 方聊（N 聊）· 账号桥

### 5.1 主 Worker 新增 `/api/auth/me`

```bash
curl -H "Authorization: Bearer <Nexus 账号 token>" https://ai.fanggame.company/api/auth/me
# 200 {"ok":true,"user":{"id":"auth295014","displayName":"auth295014",
#        "avatar":"","email":"","uid":"0000002","accountName":"auth295014"}}
# 无 token / 过期 → 401 {"ok":false,"code":"NO_TOKEN" | "BAD_TOKEN"}
```

### 5.2 方聊 Worker 改动（`server/nliao`）

- `AUTH_API_BASE = https://ai.fanggame.company`：Bearer token 交给 `/api/auth/me` 校验。
- 新增 `POST /api/messages`：REST 发消息（并广播到 Durable Object）。
- 字段双向兼容：`chatId|chat`、`content|text`、`senderId|from`、`timestamp|ts`。

实测：

```json
POST https://nliao.fanggame.company/api/messages
Body {"chat":"world","text":"hello from Nexus REST"}
→ 200 {"ok":true,"chatId":"world","message":{"id":"f47dac83-…","senderId":"fl198604",
        "content":"hello from Nexus REST","timestamp":1794031319154,
        "from":"fl198604","text":"hello from Nexus REST","ts":1794031319154,
        "sender":{"displayName":"fl198604"}}}

GET /api/messages?chatId=world  → 200，同上 message 在 messages[] 中
```

---

## 6. 仍需你配置 / 决策

| 项 | 状态 | 需要做什么 |
|---|---|---|
| 和风天气 key | 未配置 | `wrangler secret put QWEATHER_KEY` |
| 高德 key | 未配置 | `wrangler secret put AMAP_KEY` |
| 音乐版权 | 匿名链路可用，VIP 曲目如实置灰 | 若要全曲库/1080P 级体验需服务端会员 Cookie（有版权与封号风险，需你拍板） |
| 36氪新闻源 | 从 CF 出口不可用 | 可选：换 RSSHub / 自有源，或保持 4 源 |
| 前端接线 | 未改 `Nexus OS 26.html` | 本轮仅后端；天气前端切 Worker 建议等 key 配好再做 |
