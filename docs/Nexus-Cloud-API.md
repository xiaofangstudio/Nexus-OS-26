# Nexus Cloud API v1

> 版本：1.0（2026-11-07）
> 服务地址：`https://ai.fanggame.company/api/v1`
> 机器可读描述：[openapi.json](./openapi.json)（可直接粘贴到 Swagger Editor / Swagger UI）
> 兼容承诺：旧的 `/api/store/*`、`/api/acc/*` 行为保持不变，新能力全部挂在 `/api/v1/*`。

---

## 0. 概览

Nexus Cloud API 是 Nexus OS 应用商店的开放后端，以合作方 MxOS 商店 API（v0.3）为**功能基准**，在其之上补齐
「开发者账号 → 应用 → 版本 → 审核 → 资源分发 → 遥测」的完整链路。

| 项 | 约定 |
|---|---|
| Base URL | `https://ai.fanggame.company/api/v1` |
| 传输 | 仅 HTTPS（`*.workers.dev` 在大陆会超时，一律使用自定义域） |
| 编码 | 请求/响应 `application/json; charset=utf-8`，上传为 `multipart/form-data` |
| 时间 | ISO-8601 UTC，如 `2026-11-07T10:00:00Z` |
| ID | `appId` 由开发者在 manifest 中定义（全局唯一、永不变）；`releaseId = appId@version` |
| 分页 | `page`（从 1 开始）/ `page_size`（默认 20，上限 100） |
| 成功响应 | 直接返回资源本身，无 `ok` 包裹（区别于旧接口） |
| 失败响应 | `{ "error": { "code": "...", "message": "...", "details": {...} } }` |
| 幂等 | 上传同一 `appId@version` 返回 `409 VERSION_EXISTS`，绝不覆盖 |

---

## 1. MxOS 对照表

### 1.1 能力对照

| 能力 | MxOS v0.3 有 | 我们照搬 | 我们额外加 | 为什么 |
|---|---|---|---|---|
| 公开应用列表 | ✅ `GET /apps`（category/sort/page） | ✅ 参数与语义完全兼容 | `q` 关键词、`channel`、`minOs` 过滤；返回 `releaseId`、`sha256`、`iconUrl` | 客户端需要直接拼出下载地址与缓存键，少一次往返 |
| 应用详情 | ✅ `GET /apps/{id}` | ✅ 字段名 `app` / `latest_version` 保留 | 增加 `screenshots`、`i18n`、`permissions`、`rating`、`developer` 结构化对象 | 详情页要能直接渲染多语言与权限提示 |
| 版本历史 | ✅ `GET /apps/{id}/versions` | ✅ | 增加 `channel`、`status`、`sha256`、`size`、`release_notes`、`force_update` | 客户端要做增量更新与回滚提示 |
| 图标 | ✅ `GET /apps/{id}/icon` | ✅ | `ETag` + `immutable` 长缓存 + 可选 `?size=` | 列表页图标请求量最大，必须有强缓存 |
| 搜索 | ✅ `GET /search?q=` | ✅ 响应结构 `query/hits/estimated_total` 保留 | 支持 `category`、`limit`、按相关度排序（名称 > 标签 > 描述） | MxOS 只有朴素匹配，Nexus 需要可用的检索体验 |
| 榜单 | ✅ `GET /rankings?type=hot\|new` | ✅ | 增加 `weekly`（7 日下载增量）与 `rating`（评分） | 商店首页需要不止「总量」一个维度 |
| 下载 | ✅ `GET /download/{version_id}` | ✅ `X-Content-SHA256` 保留 | `Range`、`ETag`、`Content-Range`、`immutable`、`CSP: sandbox` | 大包断点续传；HTML 应用需要在隔离上下文里跑 |
| 更新检查 | ❌ | — | `GET /apps/{appId}/updates?version=&channel=` | MxOS 让客户端自己拉全量版本列表，浪费流量 |
| 上传包 | ✅ `POST /admin/packages`（仅 .mx） | ✅ `.mx`（zip）照收 | 额外接受 **单文件 HTML** 与 **目录（多文件）**；manifest 字段扩展 | Nexus 应用形态比 MxOS 更杂，不能强制所有人打 zip |
| 上架/下架 | ✅ `PUT /admin/apps/{id}/publish` | ✅ 保留等价语义 | 语义拆分为 `submit → approve/reject → publish/takedown` | MxOS 是「上传即上线」，Nexus 必须有审核环节 |
| 应用管理列表 | ✅ `GET /admin/apps` | ✅ | 增加 `X-N26-Admin` 之外还支持开发者 Token 只看自己的应用 | 开发者要自助管理，不能人人都拿管理员令牌 |
| 应用编辑 | ✅ `PUT /admin/apps/{id}` | ✅ | 白名单字段 + `PATCH` 语义 + 变更审计 | 防止越权改写他人应用 |
| 审计日志 | ✅ `GET /admin/audit-logs` | ✅ | 增加 `actor`、`action`、`target`、`reason`、`ip` 结构化字段；仅管理员可读 | 合规与追责 |
| 审核队列 | ❌（无审核） | — | `GET /admin/reviews`、`approve`、`reject(必填 reason)` | 开放上传必须有闸门 |
| 拒绝原因回传 | ❌ | — | `GET /dev/releases/{releaseId}` 内含 `review.reason` | 开发者需要知道为什么被拒 |
| 开发者账号 | ❌（只有共享管理 Token） | — | Developer（个人/组织）+ 多 Token + scope | 「一个共享 Token 打天下」无法追责、无法限权 |
| Token 管理 | ❌ | — | 创建 / 列出 / 吊销，Token 只存 SHA-256 | 泄漏可即时止损 |
| 遥测 | ❌ | — | 下载 / 安装 / 启动事件 + 下载计数 | 榜单、留存、灰度决策的数据源 |
| 评分评论 | ❌ | — | `POST/GET /apps/{appId}/ratings` | 商店需要社会证明 |
| Webhook | ❌ | — | 审核通过 / 拒绝 / 下架事件回调，HMAC 签名 | 开发者可接 CI，自动化发布流水线 |
| 包格式 | `.mx`（zip：manifest.json + app.bin + assets/svg.png） | ✅ `.mx` 兼容 | `manifest.json` 字段超集；三种包形态；SHA-256 校验 | 兼容存量生态，同时支撑新形态 |

### 1.2 兼容性约定

1. **`.mx` 包仍可直接上传**：根目录 `manifest.json` + 入口文件；MxOS 的 `app.bin` 视为 `entry` 的默认值。
2. **字段命名**：MxOS 的 `snake_case`（`download_count`、`latest_version`、`release_notes`）在公开列表/详情中保留；
   新增字段统一 `camelCase`（`releaseId`、`minOsVersion`）。二者同现时以 `snake_case` 为准（兼容老客户端）。
3. **管理令牌**：老的 `Authorization: Bearer <管理Token>` 在 `/api/v1` 下**不再接受**；管理员一律用
   `X-N26-Admin`，开发者用个人 Token。共享 Token 模型在新接口中被废止。

---

## 2. 认证模型

### 2.1 层级

```text
管理员（运营方）
  └─ X-N26-Admin: <STORE_ADMIN>          → /api/v1/admin/*

开发者账号 Developer（个人 / 组织）
  ├─ Token A  scopes: app:read, app:write, release:publish
  ├─ Token B  scopes: review:read, telemetry:write        （CI / 只读监控）
  └─ Token C  scopes: *（全部）
        → /api/v1/dev/*
```

- 一个开发者（个人或组织）可持有**多个 Token**，每个 Token 独立 scope、独立吊销、独立 `lastUsedAt`。
- 应用归属于开发者；应用的所有写操作只能由其所属开发者执行。
- 管理员是**独立身份**，不走开发者 Token，也不能用开发者 Token 提权。

### 2.2 Scope

| Scope | 允许的操作 |
|---|---|
| `app:read` | 读取自己名下应用（含草稿、被拒版本、审核备注） |
| `app:write` | 创建应用、修改元数据、维护 Webhook |
| `release:publish` | 上传安装包、提交审核、撤回提交 |
| `review:read` | 读取审核状态与拒绝原因（只读，适合 CI 轮询） |
| `telemetry:write` | 上报安装 / 启动 / 下载事件 |
| `*` | 上述全部（仅限组织的主 Token，创建时显式指定） |

> 公开接口（列表/详情/搜索/榜单/下载/评分读取）**不需要任何 Token**。
> 评分写入不需要 Token（面向终端用户），但受 IP 限流。

### 2.3 Token 形式与存储

```text
n26_<32 位小写 hex>          例：n26_9f3c1a7e5b2d4c6f8a0e1b3d5c7f9a2b
```

- 服务端**只存** `sha256(token)` → 记录（`devId`、`scopes`、`name`、`createdAt`、`revokedAt`）。
- 校验：请求头 `Authorization: Bearer <token>`，允许退化使用 `X-N26-Token: <token>`。
- 响应中永不回显完整 Token；列表接口只返回 `prefix`（前 8 位 + `…`）。
- 吊销：`DELETE /dev/tokens/{tokenId}`，立即生效（每次请求都查 KV）。

### 2.4 请求示例

```bash
# 开发者
curl -H "Authorization: Bearer n26_xxx" https://ai.fanggame.company/api/v1/dev/apps

# 管理员
curl -H "X-N26-Admin: $STORE_ADMIN" https://ai.fanggame.company/api/v1/admin/reviews
```

### 2.5 与终端用户账号的边界

| 身份 | 归属 | 键前缀 | 本 API 是否处理 |
|---|---|---|---|
| 终端用户（Nexus 登录/注册） | `/api/acc/*`（另一条线） | `acc:`、`uid:`、`hid:` | ❌ 不实现、不改写；如确需展示归属，**只读** |
| 开发者（个人/组织） | 本 API | `n26:dev:*`、`n26:tok:*` | ✅ 全部 |
| 管理员（运营） | 本 API | 无持久身份，靠 `X-N26-Admin` | ✅ 全部 |

- 开发者 Token（`n26_...`）与终端用户 Token **完全独立**，不共用签名、不共用存储、不可互换。
- `/api/v1` 不会写入任何 `acc:` / `uid:` / `hid:` 键；开发者资料自存于 `n26:` 前缀。
- 旧 `store:*` 键**只读兼容**：`/api/v1` 从不写 `store:*`；迁移通过
  `POST /api/v1/admin/migrate/legacy-store` 显式触发（默认 `dryRun=true`），把旧包复制到 `n26:` 新键后
  才在 v1 视图中可见，旧接口不受影响。

### 2.6 鉴权错误

| 场景 | HTTP | code |
|---|---|---|
| 未带 Token | 401 | `UNAUTHORIZED` |
| Token 不存在 | 401 | `UNAUTHORIZED` |
| Token 已吊销 | 401 | `TOKEN_REVOKED` |
| Scope 不足 | 403 | `SCOPE_REQUIRED` |
| 访问他人资源 | 403 | `FORBIDDEN` |
| 管理员未配置 | 503 | `ADMIN_LOCKED` |
| 管理员令牌错误 | 401 | `ADMIN_UNAUTHORIZED` |

---

## 3. 资源模型

### 3.1 Developer

| 字段 | 类型 | 说明 |
|---|---|---|
| `devId` | string | `dev_` + 12 hex，不可变 |
| `type` | `personal` \| `org` | 个人 / 组织 |
| `name` | string | 展示名（商店里显示为「开发者」） |
| `email` | string? | 联系邮箱 |
| `status` | `active` \| `suspended` | 封禁后其所有 Token 不可用 |
| `appLimit` | number | 应用数上限（默认 50） |
| `webhookUrl` | string? | 事件回调地址（https） |
| `webhookSecret` | string? | HMAC 密钥（只在创建时返回一次） |
| `createdAt` / `updatedAt` | string | ISO-8601 |

### 3.2 App

| 字段 | 类型 | 说明 |
|---|---|---|
| `appId` | string | manifest `id`，`^[a-z0-9][a-z0-9._-]{2,63}$`，全局唯一且**永不变** |
| `name` | string | 1–60 字 |
| `subtitle` | string? | 一句话介绍，≤80 字 |
| `description` | string? | 详情，≤4000 字 |
| `developerName` | string | 展示用开发者名（默认取 Developer.name） |
| `category` | string | 见 3.7 |
| `tags` | string[] | ≤8 个，每个 ≤16 字 |
| `status` | `draft` \| `published` \| `unpublished` | 见状态机 |
| `latestVersion` | string? | 已上架的最新 stable 版本 |
| `latestChannel` | `stable` \| `beta` | 最近一次上架的通道 |
| `downloadCount` | number | 累计下载 |
| `rating` | `{ avg, count, dist:[1★..5★] }` | 聚合评分 |
| `createdAt` / `updatedAt` / `publishedAt` | string | ISO-8601 |

### 3.3 Release

| 字段 | 类型 | 说明 |
|---|---|---|
| `releaseId` | string | `appId@version`，全局唯一 |
| `appId` / `version` | string | 拆分后的两段 |
| `channel` | `stable` \| `beta` | 默认 stable |
| `status` | `draft` \| `pending` \| `published` \| `rejected` \| `archived` | 见状态机 |
| `format` | `html` \| `zip` \| `dir` | 包形态 |
| `entry` | string | 入口文件相对路径 |
| `size` | number | 字节数（≤ 64 MB） |
| `sha256` | string | 安装包完整 SHA-256（hex） |
| `fileCount` | number | 包内文件数（≤ 800） |
| `manifest` | object | 校验后的 manifest 快照 |
| `releaseNotes` | string? | 更新说明，≤1000 字 |
| `forceUpdate` | boolean | 客户端是否强制更新 |
| `review` | object? | `{ status, reason, reviewer, reviewedAt }` |
| `uploadedAt` / `submittedAt` / `publishedAt` | string | ISO-8601 |

### 3.4 Asset

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `icon` \| `screenshot` | 资源类型 |
| `url` | string | `/api/v1/apps/{appId}/icon` 或 `/screenshots/{index}` |
| `mime` | string | `image/png` / `image/jpeg` / `image/webp` / `image/svg+xml` |
| `bytes` | number | 大小（图标 ≤ 512 KB，截图 ≤ 2 MB） |
| `sha256` | string | 内容摘要（同时作为 `ETag`） |

### 3.5 Review

| 字段 | 类型 | 说明 |
|---|---|---|
| `releaseId` | string | 被审对象 |
| `status` | `pending` \| `approved` \| `rejected` | |
| `reason` | string? | 拒绝**必填**（`REJECT_REASON_REQUIRED`） |
| `reviewer` | string | 管理员操作者标识 |
| `submittedAt` / `reviewedAt` | string | |

### 3.6 Rating / Download

| 资源 | 字段 |
|---|---|
| Rating | `ratingId`、`appId`、`stars`(1–5)、`comment`(≤500)、`author`(≤32)、`createdAt` |
| Rating 聚合 | `avg`、`count`、`dist` |
| Download | `releaseId`、`appId`、`count`、`lastAt`（下载计数为近似值，KV 最终一致） |

### 3.7 Category

固定枚举（同时作为 `GET /categories` 的返回）：

`tools` · `games` · `media` · `productivity` · `social` · `education` · `system` · `demo` · `other`

### 3.8 状态机

```text
App:      draft ──(首个版本发布)──▶ published ──(takedown)──▶ unpublished
                                        ▲                        │
                                        └──(restore + 重新发布)────┘

Release:  draft ──submit──▶ pending ──approve──▶ published ──(同通道出新版)──▶ archived
                    │            │
                    │            └──reject──▶ rejected ──(重新上传新版本)──▶ draft
                    └──withdraw──▶ draft
```

规则：

- 同一 `appId` 的同一 `version` **只能存在一次**（任何状态）；重复上传 `409 VERSION_EXISTS`。
- 发布某版本后，同通道更旧的 `published` 版本自动转 `archived`（仍可下载，历史不消失）。
- `unpublished` 应用的公开详情返回 `404 APP_NOT_FOUND`（除非带开发者 Token 且是本人应用）。
- 下架（takedown）不删除数据，只隐藏；恢复需要管理员显式 `restore`。

---

## 4. 端点清单

> 统一前缀 `/api/v1`。除特别说明外，响应均为 JSON。
> 「权限」列为 `—`（公开）/ scope / `admin`。

### 4.1 公开

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/health` | — | 服务健康与能力声明 |
| GET | `/apps` | — | 应用列表（category/sort/q/channel/page） |
| GET | `/apps/{appId}` | — | 应用详情（含最新版本） |
| GET | `/apps/{appId}/versions` | — | 版本历史（仅 published / archived） |
| GET | `/apps/{appId}/icon` | — | 图标二进制（ETag / 长缓存） |
| GET | `/apps/{appId}/screenshots/{index}` | — | 截图二进制（ETag / 长缓存） |
| GET | `/apps/{appId}/updates` | — | 更新检查（`version`、`channel`） |
| GET | `/apps/{appId}/ratings` | — | 评分聚合 + 最近评论 |
| POST | `/apps/{appId}/ratings` | —（IP 限流） | 提交评分 |
| GET | `/search` | — | 搜索（`q`、`category`、`limit`） |
| GET | `/rankings` | — | 榜单（`hot` / `new` / `weekly` / `rating`） |
| GET | `/categories` | — | 分类列表 |
| GET | `/download/{releaseId}` | — | 下载安装包（支持 `Range`） |
| POST | `/telemetry/download` | —（IP 限流） | 下载计数上报 |
| POST | `/telemetry/install` | telemetry:write 或 —（限流） | 安装事件 |
| POST | `/telemetry/launch` | telemetry:write 或 —（限流） | 启动事件 |

#### 4.1.1 `GET /apps`

查询参数：

| 参数 | 说明 |
|---|---|
| `category` | 分类过滤，非法值 → `400 INVALID_CATEGORY` |
| `sort` | `hot`（默认，下载量）/ `new`（上架时间）/ `rating` |
| `q` | 可选关键词，等价于 `/search` 的过滤版本 |
| `channel` | `stable`（默认）/ `beta`：决定 `latest_version` 取自哪个通道 |
| `page` / `page_size` | 分页；`page_size` ≤ 100 |

响应 `200`：

```json
{
  "items": [
    {
      "id": "com.nexus.fangma",
      "name": "方码",
      "subtitle": "本地代码片段管理器",
      "developer": "MX 项目组",
      "developerId": "dev_9f3c1a7e5b2d",
      "category": "tools",
      "tags": ["效率", "代码"],
      "download_count": 128,
      "latest_version": "1.3.0",
      "latest_version_id": "com.nexus.fangma@1.3.0",
      "releaseId": "com.nexus.fangma@1.3.0",
      "size": 1048576,
      "sha256": "e4a4c0...",
      "iconUrl": "/api/v1/apps/com.nexus.fangma/icon",
      "rating": { "avg": 4.6, "count": 12 },
      "published_at": "2026-10-24T10:00:00Z"
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 37
}
```

错误：`INVALID_CATEGORY`(400)、`INVALID_PAGE`(400)。

#### 4.1.2 `GET /apps/{appId}`

```json
{
  "app": {
    "id": "com.nexus.fangma",
    "name": "方码",
    "developer": "MX 项目组",
    "category": "tools",
    "description": "...",
    "tags": ["效率"],
    "status": "published",
    "rating": { "avg": 4.6, "count": 12, "dist": [0,0,1,3,8] },
    "screenshots": [
      "/api/v1/apps/com.nexus.fangma/screenshots/0"
    ]
  },
  "latest_version": {
    "version": "1.3.0",
    "releaseId": "com.nexus.fangma@1.3.0",
    "size": 1048576,
    "sha256": "e4a4c0...",
    "force_update": false,
    "channel": "stable",
    "published_at": "2026-10-24T10:00:00Z",
    "release_notes": "修复了导入崩溃"
  },
  "permissions": ["storage", "network"],
  "minOsVersion": "26.0",
  "i18n": { "zh-CN": { "name": "方码" }, "en": { "name": "FangCode" } }
}
```

错误：`APP_NOT_FOUND`(404)。

#### 4.1.3 `GET /apps/{appId}/versions`

```json
{
  "appId": "com.nexus.fangma",
  "items": [
    {
      "version": "1.3.0",
      "releaseId": "com.nexus.fangma@1.3.0",
      "channel": "stable",
      "status": "published",
      "size": 1048576,
      "sha256": "e4a4c0...",
      "release_notes": "修复了导入崩溃",
      "force_update": false,
      "published_at": "2026-10-24T10:00:00Z"
    },
    {
      "version": "1.2.0",
      "releaseId": "com.nexus.fangma@1.2.0",
      "channel": "stable",
      "status": "archived",
      "size": 1040000,
      "sha256": "ab12...",
      "published_at": "2026-10-10T10:00:00Z"
    }
  ]
}
```

#### 4.1.4 `GET /apps/{appId}/icon`

`200 image/png`，响应头：

```text
ETag: "6a1f..."
Cache-Control: public, max-age=31536000, immutable
Content-Type: image/png
```

支持 `If-None-Match` → `304`。图标缺失时返回内置占位 SVG（`200 image/svg+xml`）。

#### 4.1.5 `GET /apps/{appId}/screenshots/{index}`

同图标；`index` 越界 → `404 ASSET_NOT_FOUND`。

#### 4.1.6 `GET /apps/{appId}/updates?version=1.2.0&channel=stable`

```json
{
  "appId": "com.nexus.fangma",
  "currentVersion": "1.2.0",
  "latestVersion": "1.3.0",
  "updateAvailable": true,
  "mandatory": false,
  "release": {
    "releaseId": "com.nexus.fangma@1.3.0",
    "size": 1048576,
    "sha256": "e4a4c0...",
    "release_notes": "修复了导入崩溃",
    "downloadUrl": "/api/v1/download/com.nexus.fangma%401.3.0"
  }
}
```

`version` 非法 → `400 INVALID_VERSION`；比较采用 semver，忽略构建元数据 `+build`。

#### 4.1.7 `GET /search?q=方码&category=tools&limit=10`

```json
{
  "query": "方码",
  "hits": [
    { "id": "com.nexus.fangma", "name": "方码", "score": 0.92, "matched": "name" }
  ],
  "estimated_total": 1
}
```

空 `q` → `400 QUERY_REQUIRED`。评分只做简单加权：名称命中 1.0、标签 0.7、描述 0.4，再乘以 `1/(1+rank)` 收敛。

#### 4.1.8 `GET /rankings?type=hot&page=1&page_size=20`

```json
{
  "type": "hot",
  "period": "all",
  "items": [ { "id": "...", "name": "...", "download_count": 128, "latest_version": "1.3.0" } ],
  "page": 1,
  "page_size": 20
}
```

`type` ∈ `hot` / `new` / `weekly` / `rating`。`weekly` 取 7 日增量（无数据时退化到 `hot` 并置 `degraded: true`）。

#### 4.1.9 `GET /download/{releaseId}`

`releaseId` 需 URL 编码（`@` → `%40`，直接写 `@` 也接受）。

响应头：

```text
Content-Type: application/zip            (html 单文件为 text/html)
Content-Length: 1048576
Content-Disposition: attachment; filename="com.nexus.fangma-1.3.0.zip"
Content-Range: bytes 0-1048575/1048576  （仅 206 时）
Accept-Ranges: bytes
X-Content-SHA256: e4a4c0...
ETag: "e4a4c0..."
Cache-Control: public, max-age=31536000, immutable
Content-Security-Policy: sandbox
```

- 只有 `published` / `archived` 可下载；`draft` / `pending` / `rejected` → `404 RELEASE_NOT_FOUND`。
- `Range` 不合法 → `416 RANGE_NOT_SATISFIABLE`（带 `Content-Range: bytes */<size>`）。
- 下载同时按 best-effort 累加计数（失败不影响响应）。

#### 4.1.10 评分

`POST /apps/{appId}/ratings`

```json
{ "stars": 5, "comment": "很好用", "author": "小方用户" }
```

```json
{ "ok": true, "rating": { "avg": 4.6, "count": 13, "dist": [0,0,1,3,9] } }
```

`GET /apps/{appId}/ratings?limit=20`

```json
{
  "appId": "com.nexus.fangma",
  "summary": { "avg": 4.6, "count": 13, "dist": [0,0,1,3,9] },
  "items": [ { "ratingId": "rt_...", "stars": 5, "comment": "很好用", "author": "小方用户", "createdAt": "2026-11-07T10:00:00Z" } ]
}
```

错误：`INVALID_RATING`(400)、`RATE_LIMITED`(429)。

### 4.2 开发者

| 方法 | 路径 | scope | 说明 |
|---|---|---|---|
| GET | `/dev/me` | app:read | 当前开发者与 Token 信息 |
| PATCH | `/dev/me` | app:write | 修改展示名 / Webhook |
| POST | `/dev/apps` | app:write | 创建应用（不含包） |
| GET | `/dev/apps` | app:read | 我的应用（含草稿） |
| GET | `/dev/apps/{appId}` | app:read | 应用详情（含全部版本与审核备注） |
| PATCH | `/dev/apps/{appId}` | app:write | 修改元数据 |
| POST | `/dev/apps/{appId}/releases` | release:publish | 上传包（multipart） |
| GET | `/dev/apps/{appId}/releases` | app:read | 版本列表（含 draft/pending/rejected） |
| GET | `/dev/releases/{releaseId}` | review:read | 单版本详情（含拒绝原因） |
| POST | `/dev/releases/{releaseId}/submit` | release:publish | 提交审核 |
| POST | `/dev/releases/{releaseId}/withdraw` | release:publish | 撤回提交 |
| POST | `/dev/tokens` | app:write | 新建 Token |
| GET | `/dev/tokens` | app:read | Token 列表（不含明文） |
| DELETE | `/dev/tokens/{tokenId}` | app:write | 吊销 Token |

#### 4.2.1 `POST /dev/apps`

```json
{
  "appId": "com.nexus.fangma",
  "name": "方码",
  "subtitle": "本地代码片段管理器",
  "category": "tools",
  "tags": ["效率"],
  "description": "……"
}
```

`201`：

```json
{ "app": { "id": "com.nexus.fangma", "name": "方码", "status": "draft", "developer": "MX 项目组", "createdAt": "2026-11-07T10:00:00Z" } }
```

错误：`INVALID_APP_ID`(400)、`APP_EXISTS`(409)、`QUOTA_EXCEEDED`(429)。

#### 4.2.2 `POST /dev/apps/{appId}/releases`（multipart）

表单字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `file` | 二选一 | 单个文件：`.zip` / `.mx`（zip）或 `.html` / `.htm`（单文件 HTML） |
| `files` | 二选一 | 目录上传：多个同名 `files` 分片，`filename` 即相对路径 |
| `manifest` | 条件必填 | `manifest.json` 的 JSON 字符串；zip 包内已含时可不传（传了以**包内**为准） |
| `version` | 否 | 覆盖 manifest 的 version（仅当 manifest 缺 version 时生效） |
| `channel` | 否 | `stable`（默认）/ `beta` |
| `release_notes` | 否 | ≤1000 字 |
| `force_update` | 否 | `"true"` / `"false"` |

`201`：

```json
{
  "release": {
    "releaseId": "com.nexus.fangma@1.3.0",
    "appId": "com.nexus.fangma",
    "version": "1.3.0",
    "channel": "stable",
    "status": "draft",
    "format": "zip",
    "entry": "index.html",
    "size": 1048576,
    "sha256": "e4a4c0...",
    "fileCount": 7,
    "uploadedAt": "2026-11-07T10:00:00Z"
  },
  "manifest": { "id": "com.nexus.fangma", "name": "方码", "version": "1.3.0", "entry": "index.html" },
  "warnings": []
}
```

错误：`PACKAGE_TOO_LARGE`(413)、`TOO_MANY_FILES`(413)、`BAD_ZIP`(400)、`MANIFEST_MISSING`(400)、
`INVALID_MANIFEST`(400)、`UNSAFE_PATH`(400)、`ENTRY_MISSING`(400)、`ICON_MISSING`(400)、
`UNSUPPORTED_TYPE`(415)、`VERSION_EXISTS`(409)、`APP_NOT_FOUND`(404)、`APP_ID_MISMATCH`(400)、
`APP_TAKEDOWN`(403)。

#### 4.2.3 `POST /dev/releases/{releaseId}/submit`

```json
{ "release_notes": "修复了导入崩溃" }
```

```json
{ "releaseId": "com.nexus.fangma@1.3.0", "status": "pending", "submittedAt": "2026-11-07T10:00:00Z" }
```

错误：`RELEASE_NOT_REVIEWABLE`(409)（非 draft）、`VERSION_CONFLICT`(409)。

#### 4.2.4 `POST /dev/releases/{releaseId}/withdraw`

```json
{ "status": "draft", "releaseId": "com.nexus.fangma@1.3.0" }
```

错误：`RELEASE_NOT_REVIEWABLE`(409)（非 pending）。

#### 4.2.5 `POST /dev/tokens`

```json
{ "name": "CI 发布", "scopes": ["release:publish", "review:read"] }
```

```json
{
  "tokenId": "tk_...",
  "token": "n26_9f3c...",
  "scopes": ["release:publish", "review:read"],
  "note": "完整 Token 只返回这一次，请立即保存"
}
```

错误：`INVALID_SCOPE`(400)、`TOKEN_LIMIT`(429)。

### 4.3 审核 / 管理（`X-N26-Admin`）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/admin/developers` | 创建开发者（可同时签发首个 Token） |
| GET | `/admin/developers` | 开发者列表 |
| GET | `/admin/reviews` | 待审队列（`status=pending&page=`） |
| POST | `/admin/reviews/{releaseId}/approve` | 通过（可带 `release_notes` 覆盖） |
| POST | `/admin/reviews/{releaseId}/reject` | 拒绝（`reason` **必填**） |
| POST | `/admin/apps/{appId}/takedown` | 下架（`reason` 必填） |
| POST | `/admin/apps/{appId}/restore` | 恢复上架 |
| GET | `/admin/audit-logs` | 审计日志（`limit`、`action`、`actor`） |
| GET | `/admin/stats` | 概览（应用数 / 待审 / 下载量 / 开发者数） |
| POST | `/admin/migrate/legacy-store` | 把旧 `store:*` 包迁移为 v1 应用（`dryRun` 默认 true） |

#### 4.3.1 `POST /admin/developers`

```json
{ "type": "org", "name": "MX 项目组", "email": "dev@example.com", "scopes": ["*"] }
```

`201`：

```json
{
  "developer": { "devId": "dev_9f3c1a7e5b2d", "type": "org", "name": "MX 项目组", "status": "active" },
  "token": { "tokenId": "tk_...", "token": "n26_...", "scopes": ["*"], "name": "admin-issued" }
}
```

#### 4.3.2 `POST /admin/reviews/{releaseId}/reject`

```json
{ "reason": "入口文件引用了外网 CDN，违反离线可用要求" }
```

```json
{ "releaseId": "com.nexus.fangma@1.3.0", "status": "rejected", "reason": "入口文件引用了外网 CDN，违反离线可用要求" }
```

错误：`REJECT_REASON_REQUIRED`(400)、`REVIEW_CONFLICT`(409)（已审过）。

#### 4.3.3 `POST /admin/apps/{appId}/takedown`

```json
{ "reason": "版权投诉" }
```

```json
{ "appId": "com.nexus.fangma", "status": "unpublished", "reason": "版权投诉" }
```

#### 4.3.4 `GET /admin/audit-logs?limit=50&action=review.reject`

```json
{
  "items": [
    {
      "auditId": "au_...",
      "at": "2026-11-07T10:00:00Z",
      "actor": { "type": "admin", "id": "admin" },
      "action": "review.reject",
      "target": "com.nexus.fangma@1.3.0",
      "reason": "入口文件引用了外网 CDN",
      "ip": "1.2.3.4"
    }
  ],
  "total": 128
}
```

### 4.4 遥测

`POST /telemetry/download`、`/telemetry/install`、`/telemetry/launch`

```json
{ "releaseId": "com.nexus.fangma@1.3.0", "appId": "com.nexus.fangma", "clientId": "anon-xxxx", "osVersion": "26.0" }
```

```json
{ "ok": true, "counted": true }
```

- 匿名可用，但受 IP 限流（60 次/分钟）。
- 带 `telemetry:write` Token 时写入开发者维度统计（`devStats`）。

---

## 5. 包规范

### 5.1 三种形态

| format | 上传方式 | 说明 |
|---|---|---|
| `zip` | `file` = `.zip` / `.mx` | 根目录必须有 `manifest.json`；也接受 MxOS 的 `app.bin` 入口 |
| `html` | `file` = 单个 `.html` / `.htm` | 必须随表单传 `manifest`（JSON 字符串），`entry` 自动等于该文件名 |
| `dir` | `files` 多个分片 | 每个分片 `filename` 为相对路径；必须传 `manifest`；服务端使用 store 模式打包为 zip |

### 5.2 zip 目录结构（推荐）

```text
com.nexus.fangma-1.3.0.mx
├─ manifest.json          # 必填
├─ index.html             # 入口（manifest.entry 指向它）
├─ assets/
│  ├─ icon.png            # 图标（manifest.icon 指向它）
│  ├─ shot-1.png          # 截图（manifest.screenshots）
│  └─ app.js
```

MxOS 旧包（`manifest.json` + `app.bin` + `assets/svg.png`）同样可上传：`entry` 缺省为 `app.bin`，
`icon` 缺省为 `assets/svg.png`。

### 5.3 `manifest.json`

| 字段 | 必填 | 类型 | 约束 |
|---|---|---|---|
| `id` | ✅ | string | `^[a-z0-9][a-z0-9._-]{2,63}$`，全局唯一，永不变 |
| `name` | ✅ | string | 1–60 字 |
| `version` | ✅ | string | semver `MAJOR.MINOR.PATCH[-pre][+build]` |
| `entry` | ✅ | string | 包内相对路径，必须存在；zip 缺省时回退 `app.bin` / `index.html` |
| `icon` | 建议 | string | 包内相对路径；缺省 `assets/svg.png`、`icon.png`；都没有则用内置占位 |
| `category` | 否 | string | 默认 `other`，非法值回落 `other` |
| `permissions` | 否 | string[] | ≤16 项，每项 `^[a-z][a-z0-9:._-]{1,31}$` |
| `minOsVersion` | 否 | string | 形如 `26.0` |
| `screenshots` | 否 | string[] | ≤8 个包内路径，每张 ≤2 MB |
| `i18n` | 否 | object | `{ "zh-CN": { "name": "...", "description": "..." }, ... }`，语言键 ≤12 个 |
| `author` | 否 | string | 展示名；缺省取开发者名 |
| `description` | 否 | string | ≤4000 字 |
| `subtitle` | 否 | string | ≤80 字 |
| `tags` | 否 | string[] | ≤8 个，每个 ≤16 字 |

未知字段原样保留在 `manifest` 快照里（前向兼容），但不会影响校验。

### 5.4 限制

| 项 | 上限 | 超出错误 |
|---|---|---|
| 包体积（上传字节） | 64 MB | `PACKAGE_TOO_LARGE` (413) |
| 解压后总体积 | 256 MB | `PACKAGE_TOO_LARGE` |
| 文件数 | 800 | `TOO_MANY_FILES` (413) |
| 单文件解压后 | 64 MB | `PACKAGE_TOO_LARGE` |
| 压缩比（>100× 且 >1 MB） | 拒绝 | `BAD_ZIP`（zip bomb 防护） |
| `manifest.json` | 64 KB | `INVALID_MANIFEST` |
| 图标 | 512 KB | `ICON_TOO_LARGE` |
| 单张截图 | 2 MB | `SCREENSHOT_TOO_LARGE` |
| 路径长度 | 200 字符 | `UNSAFE_PATH` |

**允许的扩展名**（其余一律拒绝 `UNSUPPORTED_TYPE`）：

```text
.html .htm .js .mjs .css .json .png .jpg .jpeg .webp .gif .svg .woff .woff2 .ttf .otf
.wasm .txt .md .csv .map .ico .mp3 .ogg .wav .mp4 .webm
```

**路径安全**（任一命中 → `UNSAFE_PATH`）：

- 绝对路径（以 `/` 开头）、盘符（`C:`）、反斜杠 `\`
- 含 `..` 段、`.` 段、空段（`a//b`）
- 含控制字符（`\u0000`–`\u001f`）
- 与 `manifest.json` 重名以外的保留名（`__MACOSX/`、`.DS_Store` 直接丢弃而非报错）

### 5.5 SHA-256

- 上传时对**原始上传字节**（zip / html）计算；`dir` 形态对**服务端重打包后的 zip** 计算。
- 下载响应头 `X-Content-SHA256` 与 `ETag` 均为该值。
- 客户端安装前必须校验；不匹配 → 拒绝安装。

---

## 6. 版本策略

| 规则 | 说明 |
|---|---|
| `appId` 稳定 | 来自 manifest `id`，创建后不可修改；应用改名不影响 `appId` |
| `releaseId` | 严格等于 `${appId}@${version}`；URL 中 `@` 需编码为 `%40`（裸 `@` 也接受） |
| semver 校验 | `^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$`；非法 → `INVALID_VERSION` |
| 版本不可变 | 同一 `appId@version` 已存在（任意状态）→ `409 VERSION_EXISTS`，不覆盖、不合并 |
| 通道 | `stable` / `beta`；`channel` 随版本固定，同一版本不能换通道 |
| 最新版 | 每个通道各自维护「最新 published」；`latest_version` 默认取 stable |
| 旧版本 | 同通道出新版后旧 `published` → `archived`，**永久保留可下载**；不做自动删除 |
| 强制更新 | `force_update` 由开发者在上传时声明；更新检查原样回传 `mandatory` |
| 预发布 | `1.3.0-beta.2` 只能发到 `beta` 通道；发到 `stable` → `400 INVALID_CHANNEL` |
| 回滚 | 不支持把旧版本改回 published（版本不可变）；如需回滚请发一个新版本号 |

`appId` 与 `version` 的存储键为 `n26:rel:<appId>@<version>`，因此 `appId` 中不允许出现 `@`（正则已排除）。

---

## 7. 存储与 CDN

### 7.1 存储选型

| 层 | 方案 | 状态 |
|---|---|---|
| 元数据 | Cloudflare KV（命名空间 `STORE_KV`，键前缀 `n26:`） | ✅ 已绑定 |
| 二进制 | **R2**（`N26_R2` 绑定） | ⏳ 未开通（当前 cf token 无 `r2` 权限） |
| 二进制降级 | **KV 分片**：8 MB / 片，键 `n26:blob:<releaseId>:<n>` | ✅ 当前生效 |

Worker 优先使用 R2（若 `env.N26_R2` 存在），否则自动落到 KV 分片，接口语义完全一致，调用方无感。

KV 分片约束：单键 ≤ 25 MB，64 MB 包 = 8 片；`Range` 请求只读取覆盖区间的最小分片集合，
不会把整包拉进内存。KV 写入按片串行，单片失败整次上传失败并回滚已写分片。

### 7.2 资源路由

| 路由 | 缓存策略 | 关键头 |
|---|---|---|
| `/apps/{id}/icon` | `public, max-age=31536000, immutable` | `ETag`, `Content-Type` |
| `/apps/{id}/screenshots/{i}` | 同上 | 同上 |
| `/download/{releaseId}` | 同上（内容不可变） | `Accept-Ranges`, `Content-Range`, `X-Content-SHA256`, `CSP: sandbox` |

- `Range`：支持单区间 `bytes=a-b`、`bytes=a-`、`bytes=-n`；多区间不支持（`416`）。
- `ETag` = `"<sha256>"`，支持 `If-None-Match` → `304`（不返回 body）。
- MIME 严格按扩展名映射，未知类型不猜，直接 `application/octet-stream`。
- `HEAD` 与 `GET` 同头、无 body。
- CSP：下载路由返回 `Content-Security-Policy: sandbox; default-src 'none'`，防止把包当页面执行。

---

## 8. 限流与配额

### 8.1 限流

| 维度 | 限制 | 触发响应 |
|---|---|---|
| 上传（Token） | 10 次 / 小时；30 次 / 天 | `429 RATE_LIMITED` |
| 提交审核（Token） | 20 次 / 天 | `429 RATE_LIMITED` |
| 创建 Token（Token） | 10 次 / 天 | `429 TOKEN_LIMIT` |
| 评分（IP + appId） | 5 次 / 小时 | `429 RATE_LIMITED` |
| 遥测（IP） | 60 次 / 分钟 | `429 RATE_LIMITED` |
| 管理接口 | 200 次 / 分钟（IP） | `429 RATE_LIMITED` |
| 公开读 | 交由 Cloudflare 边缘缓存与 WAF，不在应用层计数 | — |

计数实现：KV 滚动窗口（`n26:rl:<bucket>:<key>:<window>`，`expirationTtl` 自动过期）＋ 进程内 Map 快速闸门，
非严格原子（KV 无原子自增、跨边缘最终一致），允许秒级突发超额；目的是防滥用而非精确计费。
超出时响应带 `Retry-After` 秒数。

### 8.2 配额

| 配额 | 默认 |
|---|---|
| 单开发者应用数 | 50（`appLimit` 可调） |
| 单应用版本数 | 60（超出需先归档/删除草稿） |
| 单开发者存储 | 500 MB（按 release `size` 求和，超出 `QUOTA_EXCEEDED`） |
| 待审队列 | 200 条（满则 `429 REVIEW_QUEUE_FULL`） |

---

## 9. 错误规范

统一结构（所有 `/api/v1` 失败响应）：

```json
{
  "error": {
    "code": "INVALID_MANIFEST",
    "message": "manifest.json 缺少必填字段 version",
    "details": { "field": "version", "releaseId": null }
  }
}
```

- `code` 稳定、可编程判断；`message` 面向人，可能随文案优化变化；`details` 可选、结构随 code 而定。
- HTTP 状态码与 `code` 一一对应表见下。

| code | HTTP | 含义 |
|---|---|---|
| `BAD_REQUEST` | 400 | 请求参数非法（通用） |
| `INVALID_JSON` | 400 | 请求体不是合法 JSON |
| `METHOD_NOT_ALLOWED` | 405 | 方法不支持（带 `Allow` 头） |
| `NOT_FOUND` | 404 | 路由不存在 |
| `INVALID_PAGE` | 400 | `page` / `page_size` 非法 |
| `INVALID_CATEGORY` | 400 | 分类不在枚举内 |
| `INVALID_APP_ID` | 400 | appId 不符合命名规则 |
| `INVALID_VERSION` | 400 | 版本号不符合 semver |
| `INVALID_CHANNEL` | 400 | 通道非法 / 预发布版发到 stable |
| `INVALID_SCOPE` | 400 | 申请的 scope 不存在 |
| `INVALID_RATING` | 400 | `stars` 不在 1–5 |
| `QUERY_REQUIRED` | 400 | 搜索缺少 `q` |
| `MANIFEST_MISSING` | 400 | 包内没有 manifest.json |
| `INVALID_MANIFEST` | 400 | manifest 字段非法 / 超长 / JSON 解析失败 |
| `ENTRY_MISSING` | 400 | `entry` 指向的文件不在包内 |
| `ICON_MISSING` | 400 | `icon` 指向的文件不在包内 |
| `APP_ID_MISMATCH` | 400 | manifest `id` 与路径 `appId` 不一致 |
| `UNSAFE_PATH` | 400 | 包内路径穿越 / 非法字符 |
| `BAD_ZIP` | 400 | zip 结构损坏 / 压缩比异常 |
| `RANGE_INVALID` | 400 | `Range` 头格式错误（`416` 为 `RANGE_NOT_SATISFIABLE`） |
| `UNSUPPORTED_TYPE` | 415 | 文件类型不在白名单 |
| `PACKAGE_TOO_LARGE` | 413 | 包 / 解压后体积超限 |
| `TOO_MANY_FILES` | 413 | 文件数超限 |
| `ICON_TOO_LARGE` | 413 | 图标超 512 KB |
| `SCREENSHOT_TOO_LARGE` | 413 | 截图超 2 MB |
| `UNAUTHORIZED` | 401 | 未带 Token / Token 无效 |
| `TOKEN_REVOKED` | 401 | Token 已吊销 |
| `ADMIN_UNAUTHORIZED` | 401 | `X-N26-Admin` 错误 |
| `SCOPE_REQUIRED` | 403 | scope 不足（`details.required`） |
| `FORBIDDEN` | 403 | 资源不属于当前开发者 |
| `APP_TAKEDOWN` | 403 | 应用已下架，禁止上传/提交 |
| `APP_NOT_FOUND` | 404 | 应用不存在 / 不可见 |
| `RELEASE_NOT_FOUND` | 404 | 版本不存在 / 未上架 |
| `ASSET_NOT_FOUND` | 404 | 图标 / 截图不存在 |
| `APP_EXISTS` | 409 | appId 已被占用 |
| `VERSION_EXISTS` | 409 | 同 appId+version 已存在 |
| `RELEASE_NOT_REVIEWABLE` | 409 | 当前状态不允许提交/撤回 |
| `REVIEW_CONFLICT` | 409 | 该版本已被审核过 |
| `REVIEW_QUEUE_FULL` | 429 | 待审队列已满 |
| `REJECT_REASON_REQUIRED` | 400 | 拒绝/下架必须给 reason |
| `RATE_LIMITED` | 429 | 触发限流（`Retry-After`） |
| `TOKEN_LIMIT` | 429 | Token 数量 / 创建频率超限 |
| `QUOTA_EXCEEDED` | 429 | 应用数 / 存储配额超限 |
| `ADMIN_LOCKED` | 503 | 服务端未配置 `STORE_ADMIN`，管理端关闭 |
| `STORAGE_UNAVAILABLE` | 503 | KV 未绑定 / 存储异常 |
| `RANGE_NOT_SATISFIABLE` | 416 | 请求区间越界（带 `Content-Range: bytes */size`） |
| `INTERNAL_ERROR` | 500 | 未捕获异常（`details.traceId`） |

---

## 10. OpenAPI

- 文件：[openapi.json](./openapi.json)（OpenAPI 3.0.3）
- 使用方式：<https://editor.swagger.io> → File → Import File → 选择 `openapi.json`；
  或本地 `npx swagger-ui-watcher docs/openapi.json`。
- 服务器：`https://ai.fanggame.company/api/v1`；同时声明 `http://localhost:8787/api/v1` 供 `wrangler dev`。
- 安全方案：`devToken`（HTTP bearer）、`adminToken`（API Key in header `X-N26-Admin`）。

---

## 11. 与旧接口的关系

| 旧接口 | 状态 | 替代 |
|---|---|---|
| `POST /api/store/publish` | 保留（JSON 文本包，无审核） | `POST /api/v1/dev/apps/{appId}/releases` |
| `GET /api/store/list` | 保留 | `GET /api/v1/apps` |
| `GET /api/store/item` | 保留 | `GET /api/v1/apps/{appId}` + `/download/{releaseId}` |
| `POST /api/store/review`（`X-N26-Admin`） | 保留 | `POST /api/v1/admin/reviews/{releaseId}/approve|reject` |
| `/api/acc/*` | 不动 | — |
| `/api/admin/*` | 不动 | `/api/v1/admin/*`（更细粒度，含审计） |

旧接口与 v1 共享同一 KV 命名空间但键前缀不同（`store:` vs `n26:`），互不干扰；
v1 不会读写 `store:*`，因此不会破坏线上商店。
