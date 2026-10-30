# Nexus OS 26 · 方聊（N聊）后端 · Cloudflare Worker

> 依据 `../../API文档大全.md` 第一部分「N聊 项目 API」规范实现。
> **好友必须对方同意**、REST Bearer 认证、WS 子协议认证（`nliao-auth.*` → 回应 `nliao-v1`）、
> 消息/好友/请求全量落 D1，WebSocket 实时扇出走 Durable Object。

## 部署（3 步）

```bash
wrangler d1 create nliao-db                                  # 把返回的 database_id 填进 wrangler.toml
wrangler d1 execute nliao-db --remote --file=./schema.sql    # 建表
wrangler deploy
```

部署前改两处 `wrangler.toml`：

| 变量 | 说明 |
|------|------|
| `database_id` | 上一步 D1 返回的 id |
| `TICKET_SECRET` | **务必改成随机长串**（WS 票据签名密钥） |
| `AUTH_API_BASE` | **接 MXOS 后填写**（如 `https://auth.mxos.zlromi.com`），Worker 会调 `${AUTH_API_BASE}/api/auth/me` 验证每个会话；**留空 = 开发模式**（自带账户，仅测试用） |

## 开发模式（未接 MXOS 时）

```bash
# 注册（直接拿 token）
curl -X POST https://<worker>/api/dev/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@test.com","password":"123456","displayName":"小方"}'
# 之后所有 REST 带 Authorization: Bearer <token>
```

## 接口一览

REST（`Authorization: Bearer <mxos_session_token>`）：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/ws-ticket` | POST | `{ ticket }`，60 秒有效 |
| `/api/chats` | GET | 聊天对象列表（`world` 大厅 + 好友私聊） |
| `/api/friends` | GET | 好友列表 |
| `/api/friends/request` | GET / POST | 待处理请求 / 发送请求 `{targetUserId}` |
| `/api/friends/request/{id}` | PUT | 响应 `{action:'accept'\|'reject'}` |
| `/api/friends/{friendId}` | DELETE | 删除好友 |
| `/api/messages?chatId=&offset=` | GET | 历史消息（私聊校验好友关系） |
| `/api/users/search?q=` | GET | 按昵称/邮箱/ID 搜用户 |

WebSocket：

| 端点 | 说明 |
|------|------|
| `/api/ws?chatId=world` | 大厅聊天；`chatId=friend:<a>:<b>`（字典序）为私聊 |
| `/api/notifications/ws` | 通知通道：`friend_request` / `friend_request_result` |

WS 认证（浏览器不能带 Authorization 头）：

```js
const token = localStorage.getItem('mxos_session_token');
const b64 = btoa(token).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const ws = new WebSocket('wss://<worker>/api/ws?chatId=world', ['nliao-auth.' + b64, 'nliao-v1']);
// 发消息
ws.send(JSON.stringify({ type: 'message', payload: { content: '你好', timestamp: Date.now() } }));
// 收消息
ws.onmessage = (e) => { const d = JSON.parse(e.data); /* {type:'message', data:{id,content,senderId,sender:{displayName},timestamp}} */ };
```

## 数据模型

与规范一致：`User{id,displayName,email,avatar}` / `Friend{id,displayName,online}` /
`Message{id,content,senderId,sender:{displayName},timestamp}` / `Chat{id,name,kind:'world'|'friend',friendId?,online?}`。

## 下一步（前端接入）

- `apps/fangliao.html`：读 token（MXOS 或开发模式登录页）→ `/api/chats` 渲染列表 → WS 收发 → 好友申请/同意 UI。
- MXOS 侧互通后，把 `AUTH_API_BASE` 指到 MXOS 账户中心即可无缝切换，数据（users 表）自动按 id 关联。
