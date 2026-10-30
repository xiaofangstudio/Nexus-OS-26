# MX 应用商店 API 文档

> 版本：v0.3（2026-10-24）

## 1. 服务地址

- 商店 API：`http://api.store.mxos.zlromi.com/api/v1`
- 后台管理界面：`http://api.store.mxos.zlromi.com/admin/`
- 健康检查：`GET http://api.store.mxos.zlromi.com/healthz`

## 2. 认证

- 公开接口（浏览、搜索、下载）：无需认证
- 管理接口（上传、上架等）：请求头带 `Authorization: Bearer <管理Token>`，Token 向管理员获取

## 3. 公开接口

### 3.1 应用列表

```
GET /api/v1/apps?category=&sort=hot|new&page=1&page_size=20
```

返回已上架应用及最新版本信息：

```json
{
  "items": [
    {
      "id": 8, "name": "方码", "subtitle": "", "developer": "MX 项目组",
      "category": "tools", "tags": ["效率"],
      "download_count": 0, "latest_version": "1.0.0",
      "size": 1048576, "published_at": "2026-10-24T10:00:00+00:00"
    }
  ],
  "page": 1, "page_size": 20
}
```

| 参数 | 说明 |
|---|---|
| `category` | 按分类过滤 |
| `sort` | `hot` 按下载量（默认）/ `new` 按上架时间 |
| `page` / `page_size` | 分页，page_size 上限 100 |

### 3.2 应用详情

```
GET /api/v1/apps/{app_id}
```

```json
{
  "app": { "id": 8, "name": "方码", "developer": "...", "category": "tools",
           "description": "...", "tags": ["..."], "status": "published" },
  "latest_version": { "version": "1.0.0", "size": 1048576, "force_update": false,
                      "published_at": "2026-10-24T10:00:00+00:00" }
}
```

### 3.3 版本历史

```
GET /api/v1/apps/{app_id}/versions
```

### 3.4 应用图标

```
GET /api/v1/apps/{app_id}/icon
```

返回 PNG 二进制。

### 3.5 搜索

```
GET /api/v1/search?q=关键词&page=1&page_size=20
```

```json
{ "query": "方码", "hits": [ { "id": 8, "name": "方码", "score": 0.2 } ],
  "estimated_total": 1 }
```

### 3.6 榜单

```
GET /api/v1/rankings?type=hot|new&page=1&page_size=20
```

### 3.7 下载安装包

```
GET /api/v1/download/{version_id}
```

- 返回 `.mx` 文件二进制
- 响应头 `X-Content-SHA256` 可用于校验完整性

## 4. 管理接口（需 Bearer Token）

### 4.1 上传 .mx 包

```
POST /api/v1/admin/packages
Content-Type: multipart/form-data
file: <xxx.mx>            # 必填，只收 .mx
release_notes: <string>   # 可选，更新说明
```

上传即自动完成：解析包内 `manifest.json` → 按 `id` 匹配应用（没有则自动创建）→ 版本号取 `version` → 图标自动提取。

```json
{
  "app_id": 8, "app_name": "方码", "created_new_app": false,
  "version_id": 12, "version": "1.3.0",
  "sha256": "e4a4...", "size": 1048576,
  "parsed": { "mx_id": "com.mxos.fangma", "name": "方码",
              "developer": "MX 项目组", "category": "tools" }
}
```

包不合法返回 400：非 zip / 根目录缺 manifest.json / manifest 非法 JSON / 缺 app.bin / 缺 id / icon 不是 svg.png / 文件超 64MB。

### 4.2 上架 / 下架

```
PUT /api/v1/admin/apps/{app_id}/publish
{ "action": "publish", "version_id": 12 }
{ "action": "unpublish" }
```

### 4.3 应用管理列表

```
GET /api/v1/admin/apps?status=draft|published|unpublished&page=1&page_size=50
```

含未上架应用，多返回 `mx_id`、`status`。

### 4.4 应用详情（管理视角）

```
GET /api/v1/admin/apps/{app_id}
```

返回全部版本及各版本的安装包信息。

### 4.5 编辑应用信息

```
PUT /api/v1/admin/apps/{app_id}
{ "name": "方码", "developer": "MX 项目组", "subtitle": "一句话介绍",
  "category": "tools", "tags": ["效率","工具"], "description": "详细描述" }
```

### 4.6 审计日志

```
GET /api/v1/admin/audit-logs?limit=50
```

## 5. 状态说明

| 对象 | 状态 |
|---|---|
| 应用 | `draft` 草稿 / `published` 已上架 / `unpublished` 已下架 |
| 版本 | `draft` 待上架 / `published` 已上架 / `archived` 已归档 |

## 6. .mx 安装包格式

`.mx` = zip 压缩包，根目录结构：

```text
xxx.mx
├─ manifest.json      # 必填，应用元数据
├─ app.bin            # 必填，应用入口（HTML 或 JS）
└─ assets
   └─ svg.png         # 必填，图标（文件名必须严格为 svg.png）
```

`manifest.json` 字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 应用唯一 ID（包名），如 `com.mxos.fangma`，**全局唯一**；重复上传同一 id = 更新该应用 |
| `name` | 是 | 应用名称 |
| `version` | 否 | 版本号，缺省 `1.0.0` |
| `author` | 否 | 作者 → 商店"开发者" |
| `category` | 否 | 分类，如 `tools` / `demo` / `media` |
| `description` | 否 | 应用描述 |
| `icon` | 是 | 包内相对路径，必须指向 `svg.png` |
| `permissions` / `window` / `screenshots` | 否 | 权限、窗口配置、截图元数据（商店暂不使用） |

## 7. 快速上手

```bash
BASE=http://api.store.mxos.zlromi.com
TOKEN=<管理Token>

# 上传 .mx（自动建应用/加版本）
curl -X POST $BASE/api/v1/admin/packages -H "Authorization: Bearer $TOKEN" \
  -F "file=@你的应用.mx"

# 上架
curl -X PUT $BASE/api/v1/admin/apps/8/publish \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"publish","version_id":12}'

# 下载
curl -O $BASE/api/v1/download/12
```

日常上传推荐直接用后台界面：浏览器打开 `http://api.store.mxos.zlromi.com/admin/`，登录后把 `.mx` 拖进上传区即可。
