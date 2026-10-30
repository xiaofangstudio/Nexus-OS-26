-- 方聊（N聊）D1 数据库结构
-- 开发模式（AUTH_API_BASE 为空）时使用 users 表；接入 MXOS 后 users 仅作资料缓存。
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  displayName  TEXT NOT NULL,
  email        TEXT UNIQUE,
  avatar       TEXT DEFAULT '',
  passHash     TEXT,
  salt         TEXT,
  createdAt    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id         TEXT PRIMARY KEY,
  fromId     TEXT NOT NULL,
  toId       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending / accepted / rejected
  createdAt  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fr_to ON friend_requests (toId, status);

CREATE TABLE IF NOT EXISTS friends (
  userA     TEXT NOT NULL,
  userB     TEXT NOT NULL,   -- 恒定 userA < userB
  createdAt INTEGER NOT NULL,
  PRIMARY KEY (userA, userB)
);
CREATE INDEX IF NOT EXISTS idx_fr_a ON friends (userA);
CREATE INDEX IF NOT EXISTS idx_fr_b ON friends (userB);

CREATE TABLE IF NOT EXISTS messages (
  id        TEXT PRIMARY KEY,
  chatId    TEXT NOT NULL,   -- 'world' 或 'friend:<a>:<b>'（字典序）
  senderId  TEXT NOT NULL,
  content   TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_chat ON messages (chatId, timestamp);
