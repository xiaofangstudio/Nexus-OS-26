var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/account.js
var ACC_PREFIX = "acc:";
var UID_PREFIX = "uid:";
var HID_PREFIX = "hid:";
var UID_SEQ_KEY = "meta:uidSeq";
var UID_START = 1;
var UID_WIDTH = 7;
var enc = new TextEncoder();
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra }
  });
}
__name(json, "json");
function bad(msg, status = 400) {
  return json({ ok: false, error: msg }, status);
}
__name(bad, "bad");
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
function randHex(n = 16) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(randHex, "randHex");
var PASS_ALGO = "pbkdf2-sha256-100k";
var PBKDF2_ITER = 1e5;
function hexToBytes(hex2) {
  const s = String(hex2 || "");
  const out = new Uint8Array(Math.floor(s.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16) || 0;
  return out;
}
__name(hexToBytes, "hexToBytes");
async function pbkdf2Hex(pass, saltHex, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(String(pass)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: hexToBytes(saltHex),
    iterations: Math.max(1e5, Number(iter) || PBKDF2_ITER),
    hash: "SHA-256"
  }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(pbkdf2Hex, "pbkdf2Hex");
async function verifyPass(acc, pass) {
  if (!acc || !acc.salt || !acc.passHash) return false;
  if (acc.passAlgo === PASS_ALGO) {
    return await pbkdf2Hex(pass, acc.salt, acc.passIter) === acc.passHash;
  }
  return await sha256Hex(acc.salt + "|" + pass) === acc.passHash;
}
__name(verifyPass, "verifyPass");
var ENC_SALT = "nexus-pass-enc-v1";
var _encKey = null;
async function encKey(env) {
  if (_encKey) return _encKey;
  if (!env.ACC_ENC_KEY) return null;
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(ENC_SALT + "|" + env.ACC_ENC_KEY));
  _encKey = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return _encKey;
}
__name(encKey, "encKey");
function toB64(buf) {
  let s = "";
  const a = new Uint8Array(buf);
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s);
}
__name(toB64, "toB64");
function fromB64(str) {
  const s = atob(str);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
__name(fromB64, "fromB64");
async function encryptPass(env, plain) {
  const k = await encKey(env);
  if (!k) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(String(plain)));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return toB64(out);
}
__name(encryptPass, "encryptPass");
async function decryptPass(env, blob) {
  const k = await encKey(env);
  if (!k || !blob) return "";
  try {
    const buf = fromB64(blob);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, k, buf.slice(12));
    return new TextDecoder().decode(pt);
  } catch (e) {
    return "";
  }
}
__name(decryptPass, "decryptPass");
var RE_ACCOUNT = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,20}$/;
var RE_HID = /^@?[A-Za-z0-9._#+~-]{2,20}$/;
function normAccount(s) {
  return String(s || "").trim();
}
__name(normAccount, "normAccount");
function normHid(s) {
  return String(s || "").trim();
}
__name(normHid, "normHid");
function lower(s) {
  return String(s || "").toLowerCase();
}
__name(lower, "lower");
async function signToken(accountName, env) {
  const exp = Date.now() + 30 * 24 * 3600 * 1e3;
  const body = accountName + "|" + exp;
  const sig = await sha256Hex(body + "|" + (env.ACC_SECRET || "dev-secret-change-me"));
  return btoa(body + "|" + sig).replace(/=+$/, "");
}
__name(signToken, "signToken");
async function verifyToken(token, env) {
  try {
    const raw = atob(token + "===".slice((token.length + 3) % 4));
    const parts = raw.split("|");
    if (parts.length < 3) return null;
    const sig = parts.pop();
    const exp = Number(parts.pop());
    const accountName = parts.join("|");
    if (!accountName || !exp || Date.now() > exp) return null;
    const want = await sha256Hex(accountName + "|" + exp + "|" + (env.ACC_SECRET || "dev-secret-change-me"));
    return want === sig ? accountName : null;
  } catch (e) {
    return null;
  }
}
__name(verifyToken, "verifyToken");
async function getAccount(env, accountName) {
  if (!accountName) return null;
  const raw = await env.ACC_KV.get(ACC_PREFIX + lower(accountName));
  return raw ? JSON.parse(raw) : null;
}
__name(getAccount, "getAccount");
async function putAccount(env, acc) {
  await env.ACC_KV.put(ACC_PREFIX + lower(acc.accountName), JSON.stringify(acc));
  await env.ACC_KV.put(UID_PREFIX + acc.uid, acc.accountName);
  if (acc.id) await env.ACC_KV.put(HID_PREFIX + lower(acc.id), acc.accountName);
}
__name(putAccount, "putAccount");
async function deleteHidIndex(env, hid) {
  if (hid) await env.ACC_KV.delete(HID_PREFIX + lower(hid));
}
__name(deleteHidIndex, "deleteHidIndex");
function publicView(acc) {
  if (!acc) return null;
  return {
    accountName: acc.accountName,
    userName: acc.userName || acc.accountName,
    uid: acc.uid,
    id: acc.id || "",
    gender: acc.gender || "secret",
    birthday: acc.birthday || "",
    avatar: acc.avatar || "",
    aiApi: acc.aiApi || null,
    createdAt: acc.createdAt || 0,
    updatedAt: acc.updatedAt || 0,
    lastLoginAt: acc.lastLoginAt || 0,
    status: acc.status || "active"
  };
}
__name(publicView, "publicView");
async function findByQuery(env, q) {
  q = String(q || "").trim();
  if (!q) return null;
  if (/^\d{1,7}$/.test(q)) {
    const uid = q.padStart(UID_WIDTH, "0");
    const name = await env.ACC_KV.get(UID_PREFIX + uid);
    if (name) return await getAccount(env, name);
  }
  if (RE_HID.test(q)) {
    const name = await env.ACC_KV.get(HID_PREFIX + lower(q));
    if (name) return await getAccount(env, name);
  }
  return await getAccount(env, q);
}
__name(findByQuery, "findByQuery");
async function allocUid(env) {
  let seq = parseInt(await env.ACC_KV.get(UID_SEQ_KEY) || "0", 10) || 0;
  seq = seq + 1;
  await env.ACC_KV.put(UID_SEQ_KEY, String(seq));
  return String(UID_START + seq - 1).padStart(UID_WIDTH, "0");
}
__name(allocUid, "allocUid");
async function createAccountRecord(env, b, opts = {}) {
  const accountName = normAccount(b.accountName);
  const pass = String(b.pass || "");
  const salt = randHex(16);
  const acc = {
    accountName,
    userName: normAccount(b.userName) || accountName,
    uid: await allocUid(env),
    // 默认 ID 号 = uid（可改）
    id: "",
    salt,
    passAlgo: PASS_ALGO,
    passIter: PBKDF2_ITER,
    passHash: await pbkdf2Hex(pass, salt, PBKDF2_ITER),
    passEnc: await encryptPass(env, pass),
    status: "active",
    lastLoginAt: opts.lastLogin ? Date.now() : 0,
    claimedAt: opts.source === "local-claim" ? Date.now() : 0,
    claimedFrom: opts.source || "cloud",
    computerPass: "",
    gender: b.gender === "male" || b.gender === "female" ? b.gender : "secret",
    birthday: String(b.birthday || "").slice(0, 10),
    avatar: "",
    aiApi: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  acc.id = acc.uid;
  await putAccount(env, acc);
  return acc;
}
__name(createAccountRecord, "createAccountRecord");
async function handleRegister(request, env) {
  if (!env.ACC_KV) return bad("\u670D\u52A1\u7AEF\u672A\u914D\u7F6E ACC_KV\uFF08\u89C1 wrangler.toml \u8BF4\u660E\uFF09", 503);
  let b;
  try {
    b = await request.json();
  } catch (e) {
    return bad("\u8BF7\u6C42\u4F53\u4E0D\u662F JSON");
  }
  b = b || {};
  const accountName = normAccount(b.accountName);
  const pass = String(b.pass || "");
  if (!RE_ACCOUNT.test(accountName)) return bad("\u8D26\u6237\u540D\u9700 2\u201320 \u4F4D\uFF0C\u53EA\u80FD\u7528\u4E2D\u82F1\u6587\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u6216\u8FDE\u5B57\u7B26\uFF0C\u4E0D\u80FD\u6709\u7A7A\u683C");
  if (pass.length < 4) return bad("\u8D26\u53F7\u5BC6\u7801\u81F3\u5C11 4 \u4F4D");
  const exists = await getAccount(env, accountName);
  if (exists) return bad("\u8BE5\u8D26\u6237\u540D\u5DF2\u88AB\u5360\u7528", 409);
  const acc = await createAccountRecord(env, { ...b, accountName, pass }, { source: "register", lastLogin: true });
  const token = await signToken(accountName, env);
  return json({ ok: true, account: publicView(acc), token });
}
__name(handleRegister, "handleRegister");
async function handleLogin(request, env) {
  if (!env.ACC_KV) return bad("\u670D\u52A1\u7AEF\u672A\u914D\u7F6E ACC_KV", 503);
  let b;
  try {
    b = await request.json();
  } catch (e) {
    return bad("\u8BF7\u6C42\u4F53\u4E0D\u662F JSON");
  }
  b = b || {};
  const q = String(b.q || "").trim();
  const pass = String(b.pass || "");
  if (!q || !pass) return bad("\u8BF7\u586B\u5199\u8D26\u6237\u540D/UID \u4E0E\u5BC6\u7801");
  const acc = await findByQuery(env, q);
  if (!acc) return bad("\u8D26\u53F7\u4E0D\u5B58\u5728", 404);
  const token = await signToken(acc.accountName, env);
  if ((acc.status || "active") === "revoked") {
    acc.lastLoginAt = Date.now();
    acc.updatedAt = Date.now();
    try {
      await putAccount(env, acc);
    } catch (e) {
    }
    return json({ ok: true, revoked: true, account: publicView(acc), token });
  }
  const hash = await verifyPass(acc, pass);
  if (!hash) return bad("\u5BC6\u7801\u9519\u8BEF", 401);
  if (acc.passAlgo !== PASS_ALGO) {
    const salt = randHex(16);
    acc.salt = salt;
    acc.passAlgo = PASS_ALGO;
    acc.passIter = PBKDF2_ITER;
    acc.passHash = await pbkdf2Hex(pass, salt, PBKDF2_ITER);
    if (!acc.passEnc) acc.passEnc = await encryptPass(env, pass);
  }
  acc.lastLoginAt = Date.now();
  acc.updatedAt = Date.now();
  try {
    await putAccount(env, acc);
  } catch (e) {
  }
  return json({ ok: true, account: publicView(acc), token });
}
__name(handleLogin, "handleLogin");
async function handleCheck(request, env, url) {
  if (!env.ACC_KV) return bad("\u670D\u52A1\u7AEF\u672A\u914D\u7F6E ACC_KV", 503);
  const out = { ok: true };
  const an = normAccount(url.searchParams.get("accountName"));
  const hid = normHid(url.searchParams.get("id"));
  if (an) {
    if (!RE_ACCOUNT.test(an)) out.accountNameInvalid = true;
    else out.accountNameTaken = !!await getAccount(env, an);
  }
  if (hid) {
    if (!RE_HID.test(hid)) out.idInvalid = true;
    else {
      const owner = await env.ACC_KV.get(HID_PREFIX + lower(hid));
      out.idTaken = !!owner;
      if (owner) out.idOwner = owner;
    }
  }
  return json(out);
}
__name(handleCheck, "handleCheck");
async function handleLookup(request, env, url) {
  if (!env.ACC_KV) return bad("\u670D\u52A1\u7AEF\u672A\u914D\u7F6E ACC_KV", 503);
  const q = String(url.searchParams.get("q") || "").trim();
  if (!q) return bad("\u7F3A\u5C11\u67E5\u8BE2\u8BCD");
  const acc = await findByQuery(env, q);
  if (!acc) return json({ ok: true, found: false });
  return json({
    ok: true,
    found: true,
    user: {
      accountName: acc.accountName,
      userName: acc.userName || acc.accountName,
      uid: acc.uid,
      id: acc.id || "",
      gender: acc.gender || "secret",
      birthday: acc.birthday || "",
      avatar: acc.avatar || ""
    }
  });
}
__name(handleLookup, "handleLookup");
async function handleMe(request, env, url) {
  if (!env.ACC_KV) return bad("\u670D\u52A1\u7AEF\u672A\u914D\u7F6E ACC_KV", 503);
  const name = await verifyToken(url.searchParams.get("token") || "", env);
  if (!name) return bad("\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55", 401);
  const acc = await getAccount(env, name);
  if (!acc) return bad("\u8D26\u53F7\u4E0D\u5B58\u5728", 404);
  return json({ ok: true, account: publicView(acc) });
}
__name(handleMe, "handleMe");
async function handleUpdate(request, env) {
  if (!env.ACC_KV) return bad("\u670D\u52A1\u7AEF\u672A\u914D\u7F6E ACC_KV", 503);
  let b;
  try {
    b = await request.json();
  } catch (e) {
    return bad("\u8BF7\u6C42\u4F53\u4E0D\u662F JSON");
  }
  b = b || {};
  const name = await verifyToken(b.token || "", env);
  if (!name) return bad("\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55", 401);
  const acc = await getAccount(env, name);
  if (!acc) return bad("\u8D26\u53F7\u4E0D\u5B58\u5728", 404);
  const patch = b.patch || {};
  delete patch.accountName;
  delete patch.uid;
  delete patch.passHash;
  delete patch.salt;
  if (patch.userName !== void 0) {
    const v = normAccount(patch.userName);
    if (!v) return bad("\u7528\u6237\u540D\u4E0D\u80FD\u4E3A\u7A7A");
    acc.userName = v.slice(0, 24);
  }
  if (patch.computerPass !== void 0) acc.computerPass = String(patch.computerPass).slice(0, 64);
  if (patch.gender !== void 0) {
    acc.gender = patch.gender === "male" || patch.gender === "female" ? patch.gender : "secret";
  }
  if (patch.birthday !== void 0) acc.birthday = String(patch.birthday || "").slice(0, 10);
  if (patch.avatar !== void 0) acc.avatar = String(patch.avatar || "").slice(0, 64);
  if (patch.aiApi !== void 0) {
    const a = patch.aiApi || null;
    if (a && typeof a === "object") {
      acc.aiApi = {
        provider: String(a.provider || "").slice(0, 24),
        baseUrl: String(a.baseUrl || "").slice(0, 200),
        model: String(a.model || "").slice(0, 80),
        key: String(a.key || "").slice(0, 200)
      };
    } else acc.aiApi = null;
  }
  if (patch.id !== void 0) {
    let hid = normHid(patch.id);
    if (!hid) return bad("ID \u53F7\u4E0D\u80FD\u4E3A\u7A7A");
    if (!RE_HID.test(hid)) return bad("ID \u53F7\u53EA\u80FD\u7528\u5B57\u6BCD\u3001\u6570\u5B57\u548C . _ - # + ~ @\uFF0C2\u201320 \u4F4D\uFF0C\u4E0D\u80FD\u6709\u4E2D\u6587");
    if (lower(hid) !== lower(acc.id)) {
      const owner = await env.ACC_KV.get(HID_PREFIX + lower(hid));
      if (owner && lower(owner) !== lower(acc.accountName)) return bad("\u8FD9\u4E2A ID \u53F7\u5DF2\u88AB\u5360\u7528", 409);
      await deleteHidIndex(env, acc.id);
      acc.id = hid;
    }
  }
  if (patch.newPass) {
    if (String(patch.newPass).length < 4) return bad("\u65B0\u5BC6\u7801\u81F3\u5C11 4 \u4F4D");
    if ((acc.status || "active") !== "revoked") {
      if (!await verifyPass(acc, String(patch.oldPass || ""))) return bad("\u539F\u5BC6\u7801\u4E0D\u6B63\u786E", 401);
    }
    const salt = randHex(16);
    acc.salt = salt;
    acc.passAlgo = PASS_ALGO;
    acc.passIter = PBKDF2_ITER;
    acc.passHash = await pbkdf2Hex(String(patch.newPass), salt, PBKDF2_ITER);
    acc.passEnc = await encryptPass(env, String(patch.newPass));
    acc.status = "active";
    delete acc.revokedAt;
  }
  acc.updatedAt = Date.now();
  await putAccount(env, acc);
  return json({ ok: true, account: publicView(acc) });
}
__name(handleUpdate, "handleUpdate");
async function handleSync(request, env) {
  if (!env.ACC_KV) return bad("\u670D\u52A1\u7AEF\u672A\u914D\u7F6E ACC_KV", 503);
  let b;
  try {
    b = await request.json();
  } catch (e) {
    return bad("\u8BF7\u6C42\u4F53\u4E0D\u662F JSON");
  }
  b = b || {};
  const list = Array.isArray(b.accounts) ? b.accounts : b.accountName ? [b] : [];
  if (!list.length) return bad("\u7F3A\u5C11 accounts");
  if (list.length > 5) return bad("\u5355\u6B21\u6700\u591A\u540C\u6B65 5 \u4E2A\u8D26\u53F7");
  const out = { ok: true, created: [], existed: [], skipped: [] };
  for (const item of list) {
    const accountName = normAccount(item && item.accountName);
    const pass = String(item && item.pass || "");
    if (!RE_ACCOUNT.test(accountName)) {
      out.skipped.push({ accountName, reason: "\u8D26\u6237\u540D\u4E0D\u5408\u89C4" });
      continue;
    }
    if (pass.length < 4) {
      out.skipped.push({ accountName, reason: "\u5BC6\u7801\u81F3\u5C11 4 \u4F4D" });
      continue;
    }
    const exists = await getAccount(env, accountName);
    if (exists) {
      if ((exists.status || "active") === "revoked") {
        out.existed.push({ accountName, status: "revoked", uid: exists.uid });
        continue;
      }
      exists.lastLoginAt = Date.now();
      exists.updatedAt = Date.now();
      try {
        await putAccount(env, exists);
      } catch (e) {
      }
      out.existed.push({ accountName, status: "exists", uid: exists.uid });
      continue;
    }
    const acc = await createAccountRecord(env, item, { source: "local-claim", lastLogin: true });
    out.created.push({ accountName: acc.accountName, uid: acc.uid, id: acc.id });
  }
  return json(out);
}
__name(handleSync, "handleSync");
async function handleAccount(request, env, url) {
  const sub = url.pathname.replace(/^\/api\/acc/, "") || "/";
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204 });
  try {
    if (sub === "/register" && method === "POST") return await handleRegister(request, env);
    if (sub === "/login" && method === "POST") return await handleLogin(request, env);
    if (sub === "/check" && method === "GET") return await handleCheck(request, env, url);
    if (sub === "/lookup" && method === "GET") return await handleLookup(request, env, url);
    if (sub === "/me" && method === "GET") return await handleMe(request, env, url);
    if (sub === "/update" && method === "POST") return await handleUpdate(request, env);
    if (sub === "/sync" && method === "POST") return await handleSync(request, env);
    if (sub === "/profile" && method === "GET") return await handleMe(request, env, url);
    if (sub === "/profile" && method === "POST") return await handleUpdate(request, env);
    return bad("\u672A\u77E5\u7684\u8D26\u53F7\u63A5\u53E3\uFF1A" + sub, 404);
  } catch (e) {
    return bad("\u670D\u52A1\u7AEF\u9519\u8BEF\uFF1A" + (e && e.message ? e.message : String(e)), 500);
  }
}
__name(handleAccount, "handleAccount");

// src/store.js
var KINDS = { app: 1, plugin: 1 };
var LIMITS = { app: { bytes: 2 * 1024 * 1024, files: 300 }, plugin: { bytes: 256 * 1024, files: 60 } };
function json2(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
__name(json2, "json");
function adminOk(request, env) {
  const key = (request.headers.get("X-N26-Admin") || "").trim();
  const expect = (env.STORE_ADMIN || "").trim();
  if (!expect) return { ok: false, status: 503, why: "\u670D\u52A1\u7AEF\u672A\u914D\u7F6E STORE_ADMIN\uFF0C\u7BA1\u7406\u7AEF\u5DF2\u9501\u5B9A" };
  return { ok: key.length > 0 && key === expect };
}
__name(adminOk, "adminOk");
function kvOk(env) {
  return !!(env && env.STORE_KV && typeof env.STORE_KV.get === "function");
}
__name(kvOk, "kvOk");
async function kvGet(env, key, fallback) {
  try {
    const raw = await env.STORE_KV.get(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}
__name(kvGet, "kvGet");
async function kvPut(env, key, val) {
  await env.STORE_KV.put(key, JSON.stringify(val));
}
__name(kvPut, "kvPut");
function makeId(name) {
  const slug = String(name || "app").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "app";
  return slug + "-" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, "0");
}
__name(makeId, "makeId");
var OK_EXT = /\.(cw|html?|css|js|mjs|json|md|txt|svg|csv)$/i;
function sanitizePackage(body, kind) {
  const meta = body || {};
  const name = String(meta.name || "").trim();
  if (name.length < 1 || name.length > 40) return { error: "\u540D\u79F0\u9700 1-40 \u5B57" };
  const desc = String(meta.desc || "").trim().slice(0, 200);
  const version = String(meta.version || "0.1.0").replace(/[^\w.\-]/g, "").slice(0, 20) || "0.1.0";
  const publisher = String(meta.publisher || "\u533F\u540D\u5F00\u53D1\u8005").trim().slice(0, 30) || "\u533F\u540D\u5F00\u53D1\u8005";
  const icon = /^fa[a-z]?\s+fa-[\w\-]+$/i.test(String(meta.icon || "")) ? String(meta.icon) : "fa-cube";
  const color = /^#[0-9a-fA-F]{6}$/.test(String(meta.color || "")) ? String(meta.color) : "#0e7490";
  const entry = String(meta.entry || "index.html").replace(/\\/g, "/").replace(/^\/+/, "").slice(0, 120);
  const tags = Array.isArray(meta.tags) ? meta.tags.slice(0, 5).map((t) => String(t).slice(0, 12)) : [];
  const subtitle = String(meta.subtitle || "").trim().slice(0, 80);
  const category = String(meta.category || "").trim().slice(0, 20);
  const iconUrl = /^https?:\/\//.test(String(meta.iconUrl || "")) ? String(meta.iconUrl).slice(0, 500) : "";
  const screenshots = (Array.isArray(meta.screenshots) ? meta.screenshots : []).map((s) => String(s || "").trim()).filter((s) => /^https?:\/\//.test(s)).slice(0, 8).map((s) => s.slice(0, 500));
  const permissions = (Array.isArray(meta.permissions) ? meta.permissions : []).map((p) => String(p || "").trim()).filter(Boolean).slice(0, 12).map((p) => p.slice(0, 30));
  const previewUrl = /^https?:\/\//.test(String(meta.previewUrl || "")) ? String(meta.previewUrl).slice(0, 500) : "";
  const changelog = String(meta.changelog || "").trim().slice(0, 400);
  const files = meta.files && typeof meta.files === "object" ? meta.files : null;
  if (!files || !Object.keys(files).length) return { error: "\u5305\u91CC\u6CA1\u6709\u4EFB\u4F55\u6587\u4EF6" };
  const lim = LIMITS[kind];
  const names = Object.keys(files);
  if (names.length > lim.files) return { error: `\u6587\u4EF6\u6570\u8D85\u8FC7\u4E0A\u9650\uFF08${lim.files}\uFF09` };
  let total = 0;
  for (const p of names) {
    if (!OK_EXT.test(p)) return { error: "\u53EA\u5141\u8BB8\u6587\u672C\u6587\u4EF6\uFF08html/css/js/json/md/txt/svg/csv\uFF09" };
    const v = files[p];
    if (typeof v !== "string") return { error: "\u6587\u4EF6\u5185\u5BB9\u5FC5\u987B\u662F\u6587\u672C" };
    total += v.length;
    if (total > lim.bytes) return { error: kind === "app" ? "\u5E94\u7528\u5305\u8D85\u8FC7 2MB \u4E0A\u9650" : "\u63D2\u4EF6\u5305\u8D85\u8FC7 256KB \u4E0A\u9650" };
  }
  if (kind === "app" && !names.length) return { error: "\u5E94\u7528\u5305\u91CC\u6CA1\u6709\u4EFB\u4F55\u6587\u4EF6" };
  if (kind === "plugin" && !names.some((p) => /plugin\.json$/i.test(p))) {
    return { error: "\u63D2\u4EF6\u5305\u91CC\u5FC5\u987B\u6709 plugin.json \u6E05\u5355" };
  }
  return {
    meta: {
      name,
      desc,
      version,
      publisher,
      icon,
      color,
      entry,
      tags,
      kind,
      subtitle,
      category,
      iconUrl,
      screenshots,
      permissions,
      previewUrl,
      changelog,
      bytes: total,
      fileCount: names.length,
      createdAt: Date.now()
    },
    files
  };
}
__name(sanitizePackage, "sanitizePackage");
async function handleStore(request, env, url) {
  if (!kvOk(env)) return json2({ ok: false, error: "store-kv-unbound", hint: "Worker \u672A\u7ED1\u5B9A STORE_KV\uFF0C\u5E02\u573A\u9000\u56DE\u672C\u5730\u6A21\u5F0F" }, 503);
  const path = url.pathname.replace(/^\/api\/store/, "") || "/";
  const method = request.method;
  if (path === "/publish" && method === "POST") {
    let body = null;
    try {
      body = await request.json();
    } catch (e) {
      return json2({ ok: false, error: "\u8BF7\u6C42\u4E0D\u662F JSON" }, 400);
    }
    const kind = KINDS[body && body.kind] ? body.kind : "app";
    const s = sanitizePackage(body, kind);
    if (s.error) return json2({ ok: false, error: s.error }, 400);
    const id = makeId(s.meta.name);
    const pkg = {
      id,
      kind,
      meta: s.meta,
      files: s.files,
      status: "pending",
      downloads: 0,
      submitter: s.meta.publisher || "\u533F\u540D\u5F00\u53D1\u8005",
      submittedAt: Date.now(),
      updatedAt: Date.now(),
      versions: [{ version: s.meta.version, at: Date.now(), by: s.meta.publisher || "\u533F\u540D\u5F00\u53D1\u8005" }]
    };
    const pend = await kvGet(env, "store:pend:" + kind, []);
    pend.unshift(id);
    if (pend.length > 200) pend.length = 200;
    await kvPut(env, "store:pend:" + kind, pend);
    await kvPut(env, "store:pkg:" + kind + ":" + id, pkg);
    return json2({ ok: true, id, kind, status: "pending" }, 200);
  }
  if (path === "/list" && method === "GET") {
    const kind = KINDS[url.searchParams.get("kind")] ? url.searchParams.get("kind") : "app";
    const ids = await kvGet(env, "store:idx:" + kind, []);
    const items = [];
    for (const id of ids.slice(0, 300)) {
      const pkg = await kvGet(env, "store:pkg:" + kind + ":" + id, null);
      if (pkg && pkg.status === "approved") items.push(Object.assign({ id, kind }, pkg.meta, { downloads: pkg.downloads || 0 }));
    }
    return json2({ ok: true, kind, items }, 200);
  }
  if (path === "/item" && method === "GET") {
    const kind = KINDS[url.searchParams.get("kind")] ? url.searchParams.get("kind") : "app";
    const id = String(url.searchParams.get("id") || "");
    if (!/^[a-z0-9\u4e00-\u9fa5\-]{1,64}$/i.test(id)) return json2({ ok: false, error: "bad id" }, 400);
    const pkg = await kvGet(env, "store:pkg:" + kind + ":" + id, null);
    if (!pkg || pkg.status !== "approved") return json2({ ok: false, error: "not found" }, 404);
    if (url.searchParams.get("dl") === "1") {
      pkg.downloads = (pkg.downloads || 0) + 1;
      try {
        await kvPut(env, "store:pkg:" + kind + ":" + id, pkg);
      } catch (e) {
      }
    }
    return json2({ ok: true, item: Object.assign({ id, kind }, pkg.meta), files: pkg.files, downloads: pkg.downloads }, 200);
  }
  const gate = adminOk(request, env);
  if (path === "/pending" && method === "GET") {
    if (!gate.ok) return json2({ ok: false, error: gate.why || "admin-unauthorized" }, gate.status || 401);
    const out = {};
    for (const kind of Object.keys(KINDS)) {
      const ids = await kvGet(env, "store:pend:" + kind, []);
      const items = [];
      for (const id of ids.slice(0, 200)) {
        const pkg = await kvGet(env, "store:pkg:" + kind + ":" + id, null);
        if (pkg) items.push(Object.assign({ id, kind }, pkg.meta));
      }
      out[kind] = items;
    }
    return json2({ ok: true, pending: out }, 200);
  }
  if (path === "/review" && method === "POST") {
    if (!gate.ok) return json2({ ok: false, error: gate.why || "admin-unauthorized" }, gate.status || 401);
    let b = null;
    try {
      b = await request.json();
    } catch (e) {
      return json2({ ok: false, error: "\u8BF7\u6C42\u4E0D\u662F JSON" }, 400);
    }
    const kind = KINDS[b && b.kind] ? b.kind : "app";
    const action = b.action === "approve" ? "approve" : b.action === "reject" ? "reject" : null;
    if (!action) return json2({ ok: false, error: "action \u5FC5\u987B\u662F approve / reject" }, 400);
    const id = String(b.id || "");
    const pkg = await kvGet(env, "store:pkg:" + kind + ":" + id, null);
    if (!pkg) return json2({ ok: false, error: "not found" }, 404);
    const pend = await kvGet(env, "store:pend:" + kind, []);
    const pi = pend.indexOf(id);
    if (pi >= 0) {
      pend.splice(pi, 1);
      await kvPut(env, "store:pend:" + kind, pend);
    }
    if (action === "approve") {
      const ids = await kvGet(env, "store:idx:" + kind, []);
      for (const old of ids.slice()) {
        const op = await kvGet(env, "store:pkg:" + kind + ":" + old, null);
        if (op && op.meta && op.meta.name === pkg.meta.name && old !== id) {
          op.status = "offline";
          op.offlineAt = Date.now();
          op.updatedAt = Date.now();
          op.supersededBy = id;
          try {
            await kvPut(env, "store:pkg:" + kind + ":" + old, op);
          } catch (e) {
          }
          const oi = ids.indexOf(old);
          if (oi >= 0) ids.splice(oi, 1);
        }
      }
      pkg.status = "approved";
      pkg.approvedAt = Date.now();
      pkg.updatedAt = Date.now();
      pkg.rejectReason = "";
      if (ids.indexOf(id) < 0) ids.unshift(id);
      await kvPut(env, "store:idx:" + kind, ids);
    } else {
      pkg.status = "rejected";
      pkg.rejectedAt = Date.now();
      pkg.updatedAt = Date.now();
      pkg.rejectReason = String(b && b.reason || "").slice(0, 300);
    }
    await kvPut(env, "store:pkg:" + kind + ":" + id, pkg);
    return json2({ ok: true, id, action, status: pkg.status }, 200);
  }
  if (path === "/unpublish" && method === "POST") {
    if (!gate.ok) return json2({ ok: false, error: gate.why || "admin-unauthorized" }, gate.status || 401);
    let b = null;
    try {
      b = await request.json();
    } catch (e) {
      return json2({ ok: false, error: "\u8BF7\u6C42\u4E0D\u662F JSON" }, 400);
    }
    const kind = KINDS[b && b.kind] ? b.kind : "app";
    const id = String(b.id || "");
    const ids = await kvGet(env, "store:idx:" + kind, []);
    const i = ids.indexOf(id);
    if (i >= 0) {
      ids.splice(i, 1);
      await kvPut(env, "store:idx:" + kind, ids);
    }
    const pkg = await kvGet(env, "store:pkg:" + kind + ":" + id, null);
    if (pkg) {
      pkg.status = "offline";
      pkg.offlineAt = Date.now();
      pkg.updatedAt = Date.now();
      await kvPut(env, "store:pkg:" + kind + ":" + id, pkg);
    }
    return json2({ ok: true, id, removed: i >= 0, status: pkg ? pkg.status : "not-found" }, 200);
  }
  if (path === "/admin-check" && method === "GET") {
    return json2({ ok: true, admin: gate.ok, why: gate.ok ? null : gate.why || "\u4EE4\u724C\u4E0D\u5BF9" }, gate.ok ? 200 : 401);
  }
  return json2({ ok: false, error: "not found", hint: "/api/store/publish|list|item|pending|review|unpublish" }, 404);
}
__name(handleStore, "handleStore");

// src/music.js
var NE = "https://music.163.com";
var UP_TIMEOUT = 8e3;
var STREAM_HOSTS = [
  /(^|\.)music\.126\.net$/i,
  /(^|\.)music\.163\.com$/i,
  /(^|\.)dzcdn\.net$/i,
  /(^|\.)deezer\.com$/i,
  /(^|\.)mzstatic\.com$/i,
  /(^|\.)itunes\.apple\.com$/i,
  /(^|\.)apple\.com$/i,
  /(^|\.)injahow\.cn$/i
];
var BOARDS = { hot: "3778678", new: "3779629", up: "19723756" };
var GD = "https://music-api.gdstudio.xyz/api.php";
var VK = "https://api.vkeys.cn/v2/music/netease";
var MT = "https://api.injahow.cn/meting/";
function json3(obj, status, env) {
  const h = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": env && env.ALLOW_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
  return new Response(JSON.stringify(obj), { status: status || 200, headers: h });
}
__name(json3, "json");
function b64urlDecode(s) {
  try {
    s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return atob(s);
  } catch (e) {
    return "";
  }
}
__name(b64urlDecode, "b64urlDecode");
async function upFetch(url, headers) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UP_TIMEOUT);
  try {
    return await fetch(url, { headers: headers || {}, signal: ctl.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}
__name(upFetch, "upFetch");
async function kvGetJSON(env, key) {
  try {
    const v = await env.MUSIC_KV.get(key);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return null;
  }
}
__name(kvGetJSON, "kvGetJSON");
async function kvPutJSON(env, key, val, ttl) {
  try {
    await env.MUSIC_KV.put(key, JSON.stringify(val), ttl ? { expirationTtl: ttl } : void 0);
  } catch (e) {
  }
}
__name(kvPutJSON, "kvPutJSON");
async function healthGet(env) {
  return await kvGetJSON(env, "music:health") || {};
}
__name(healthGet, "healthGet");
async function healthMark(env, src, okFlag) {
  if (env.__mockHealth) return;
  const h = await healthGet(env);
  const e = h[src] || { fails: 0, until: 0 };
  if (okFlag) {
    e.fails = 0;
    e.until = 0;
  } else {
    e.fails = (e.fails || 0) + 1;
    if (e.fails >= 3) {
      e.until = Date.now() + 30 * 60 * 1e3;
      e.fails = 0;
    }
  }
  h[src] = e;
  await kvPutJSON(env, "music:health", h, 24 * 3600);
}
__name(healthMark, "healthMark");
function srcBlocked(h, src) {
  const e = h[src];
  return e && e.until && Date.now() < e.until;
}
__name(srcBlocked, "srcBlocked");
var NE_HEADERS = {
  "Referer": "https://music.163.com/",
  "Cookie": "appver=2.9.7; os=pc",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
};
async function neGet(env, path, cacheKey, ttl) {
  if (cacheKey) {
    const hit = await kvGetJSON(env, cacheKey);
    if (hit) return hit;
  }
  const res = await upFetch(NE + path, NE_HEADERS);
  if (!res.ok) throw new Error("ne http " + res.status);
  const j = await res.json();
  if (j && (j.code === 200 || j.code === void 0)) {
    if (cacheKey) await kvPutJSON(env, cacheKey, j, ttl);
    return j;
  }
  throw new Error("ne code " + (j && j.code));
}
__name(neGet, "neGet");
function neTrack(s) {
  const ar = s.ar || s.artists || [];
  const al = s.al || s.album || {};
  return {
    id: String(s.id),
    src: "netease",
    name: s.name || "",
    artist: ar.map((a) => a.name).filter(Boolean).join("/") || "\u672A\u77E5\u6B4C\u624B",
    album: al.name || "",
    cover: al.picUrl || "",
    dur: Math.round((s.dt || s.duration || 0) / 1e3),
    fee: s.fee == null ? null : s.fee,
    preview: false
  };
}
__name(neTrack, "neTrack");
async function neSearch(env, q, limit) {
  const key = "music:q2:ne:" + q + ":" + limit;
  const hit = await kvGetJSON(env, key);
  if (Array.isArray(hit) && hit.length) return hit;
  let lastErr = null;
  try {
    const r1 = await neGet(env, "/api/search/get/web?s=" + encodeURIComponent(q) + "&type=1&limit=" + limit + "&offset=0", null, 0);
    const songs = r1.result && r1.result.songs || [];
    if (songs.length) {
      const ids = songs.slice(0, limit).map((s) => ({ id: s.id }));
      let det = {};
      try {
        const r2 = await neGet(env, "/api/v3/song/detail?c=" + encodeURIComponent(JSON.stringify(ids)), null, 0);
        (r2.songs || []).forEach((s) => {
          det[s.id] = s;
        });
      } catch (e) {
      }
      const out = songs.map((s) => Object.assign(neTrack(det[s.id] || s), { playable: null, via: "netease" }));
      await kvPutJSON(env, key, out, 600);
      return out;
    }
    lastErr = "netease empty";
  } catch (e) {
    lastErr = "netease " + (e && e.message);
  }
  try {
    const out = await vkSearch(env, q, limit);
    if (out.length) {
      await kvPutJSON(env, key, out, 600);
      return out;
    }
    lastErr = "vkeys empty";
  } catch (e) {
    lastErr = "vkeys " + (e && e.message);
  }
  const tracks = await gdSearch(env, q, limit);
  if (tracks.length) {
    await kvPutJSON(env, key, tracks, 600);
    return tracks;
  }
  throw new Error(lastErr || "netease unavailable");
}
__name(neSearch, "neSearch");
async function neUrl(env, id, br) {
  const key = "music:url:ne:" + id + ":" + br;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  try {
    const j = await neGet(env, "/api/song/enhance/player/url?ids=" + encodeURIComponent("[" + id + "]") + "&br=" + br, null, 0);
    const d = (j.data || [])[0] || {};
    if (d.url) {
      const out = { ok: true, url: d.url, br: d.br || br, type: d.type || "mp3", via: "netease" };
      await kvPutJSON(env, key, out, 600);
      return out;
    }
  } catch (e) {
  }
  const mt = await mtUrl(env, id);
  if (mt && mt.ok) {
    await kvPutJSON(env, key, mt, 600);
    return mt;
  }
  const gd = await gdUrl(env, id, br);
  if (gd && gd.ok) {
    await kvPutJSON(env, key, gd, 600);
    return gd;
  }
  return { ok: false, reason: "vip", playable: false };
}
__name(neUrl, "neUrl");
async function neLrc(env, id) {
  const key = "music:lrc:ne:" + id;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  try {
    const j = await neGet(env, "/api/song/lyric?id=" + id + "&lv=1&kv=1&tv=-1", null, 0);
    const out = { ok: true, lrc: j.lrc && j.lrc.lyric || "", via: "netease" };
    if (out.lrc) {
      await kvPutJSON(env, key, out, 24 * 3600);
      return out;
    }
  } catch (e) {
  }
  const mt = await mtLrc(env, id);
  if (mt && mt.ok) {
    await kvPutJSON(env, key, mt, 24 * 3600);
    return mt;
  }
  const gd = await gdLrc(env, id);
  if (gd.ok) {
    await kvPutJSON(env, key, gd, 24 * 3600);
    return gd;
  }
  return { ok: true, lrc: "", via: "none" };
}
__name(neLrc, "neLrc");
async function neTop(env, board) {
  const pid = BOARDS[board] || BOARDS.hot;
  const key = "music:top:" + board;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  const j = await neGet(env, "/api/playlist/detail?id=" + pid, null, 0);
  const tracks = (j.result && j.result.tracks || []).slice(0, 50).map(neTrack);
  const out = { ok: true, board, tracks };
  await kvPutJSON(env, key, out, 3600);
  return out;
}
__name(neTop, "neTop");
async function itSearch(env, q, limit) {
  const key = "music:q:it:" + q + ":" + limit;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  const res = await upFetch("https://itunes.apple.com/search?term=" + encodeURIComponent(q) + "&media=music&entity=song&limit=" + limit + "&country=CN");
  if (!res.ok) throw new Error("itunes http " + res.status);
  const j = await res.json();
  const out = (j.results || []).map((t) => ({
    id: String(t.trackId),
    src: "itunes",
    name: t.trackName || "",
    artist: t.artistName || "\u672A\u77E5\u6B4C\u624B",
    album: t.collectionName || "",
    cover: (t.artworkUrl100 || "").replace("100x100", "400x400"),
    dur: Math.round((t.trackTimeMillis || 0) / 1e3),
    fee: null,
    preview: true
    // iTunes 只有 30s 试听
  })).filter((t) => t.name);
  await kvPutJSON(env, key, out, 600);
  return out;
}
__name(itSearch, "itSearch");
async function itUrl(env, id) {
  const key = "music:url:it:" + id;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  const res = await upFetch("https://itunes.apple.com/lookup?id=" + id + "&entity=song&country=CN");
  if (!res.ok) throw new Error("itunes http " + res.status);
  const j = await res.json();
  const t = (j.results || []).find((x) => String(x.trackId) === String(id) && x.previewUrl);
  if (!t || !t.previewUrl) return { ok: false, reason: "vip" };
  const out = { ok: true, url: t.previewUrl, br: 0, type: "m4a", preview: true };
  await kvPutJSON(env, key, out, 24 * 3600);
  return out;
}
__name(itUrl, "itUrl");
async function dzSearch(env, q, limit) {
  const key = "music:q:dz:" + q + ":" + limit;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  const res = await upFetch("https://api.deezer.com/search?q=" + encodeURIComponent(q) + "&limit=" + limit);
  if (!res.ok) throw new Error("deezer http " + res.status);
  const j = await res.json();
  const out = (j.data || []).map((t) => ({
    id: String(t.id),
    src: "deezer",
    name: t.title || "",
    artist: t.artist && t.artist.name || "\u672A\u77E5\u6B4C\u624B",
    album: t.album && t.album.title || "",
    cover: t.album && t.album.cover_medium || "",
    dur: t.duration || 0,
    fee: null,
    preview: true
  })).filter((t) => t.name);
  await kvPutJSON(env, key, out, 600);
  return out;
}
__name(dzSearch, "dzSearch");
async function dzUrl(env, id) {
  const key = "music:url:dz:" + id;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  const res = await upFetch("https://api.deezer.com/track/" + id);
  if (!res.ok) throw new Error("deezer http " + res.status);
  const t = await res.json();
  if (!t.preview) return { ok: false, reason: "vip" };
  const out = { ok: true, url: t.preview, br: 0, type: "mp3", preview: true };
  await kvPutJSON(env, key, out, 24 * 3600);
  return out;
}
__name(dzUrl, "dzUrl");
async function vkSearch(env, q, limit) {
  const res = await upFetch(VK + "?word=" + encodeURIComponent(q) + "&num=" + limit, {
    "User-Agent": NE_HEADERS["User-Agent"],
    "Accept": "application/json"
  });
  if (!res.ok) throw new Error("vkeys http " + res.status);
  const j = await res.json();
  const arr = j && j.data || [];
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => ({
    id: String(t.id),
    src: "netease",
    name: t.song || "",
    artist: t.singer || "\u672A\u77E5\u6B4C\u624B",
    album: t.album || "",
    cover: (t.cover || "").replace(/^http:/, "https:"),
    picId: "",
    dur: 0,
    fee: null,
    vip: null,
    playable: null,
    preview: false,
    via: "vkeys"
  })).filter((t) => t.name);
}
__name(vkSearch, "vkSearch");
async function mtUrl(env, id) {
  try {
    const res = await upFetch(MT + "?server=netease&type=url&id=" + encodeURIComponent(id), {
      "User-Agent": NE_HEADERS["User-Agent"],
      "Referer": "https://music.163.com/",
      "Accept": "*/*"
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("Location") || "";
      if (loc) return { ok: true, url: loc, br: 0, type: "mp3", via: "meting", size: 0 };
    }
    if (res.ok && /audio|octet-stream/.test(res.headers.get("Content-Type") || "")) {
      return { ok: true, url: MT + "?server=netease&type=url&id=" + encodeURIComponent(id), br: 0, type: "mp3", via: "meting", size: 0 };
    }
  } catch (e) {
  }
  return { ok: false, reason: "vip", playable: false };
}
__name(mtUrl, "mtUrl");
async function mtLrc(env, id) {
  try {
    const res = await upFetch(MT + "?server=netease&type=lrc&id=" + encodeURIComponent(id), {
      "User-Agent": NE_HEADERS["User-Agent"],
      "Accept": "text/plain"
    });
    if (res.ok) {
      const t = await res.text();
      if (t && !/<html/i.test(t)) return { ok: true, lrc: t, via: "meting" };
    }
  } catch (e) {
  }
  return { ok: false };
}
__name(mtLrc, "mtLrc");
async function gdGet(env, params) {
  const u = new URL(GD);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  const res = await upFetch(u.toString(), { "User-Agent": NE_HEADERS["User-Agent"] });
  if (!res.ok) throw new Error("gd http " + res.status);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("gd non-json");
  }
}
__name(gdGet, "gdGet");
async function gdSearch(env, q, limit) {
  const key = "music:q:gd:" + q + ":" + limit;
  const hit = await kvGetJSON(env, key);
  if (hit) return hit;
  const arr = await gdGet(env, { types: "search", source: "netease", name: q, count: limit });
  if (!Array.isArray(arr)) return [];
  const tracks = arr.map((t) => ({
    id: String(t.id),
    src: "netease",
    name: t.name || "",
    artist: Array.isArray(t.artist) ? t.artist.filter(Boolean).join("/") : t.artist || "\u672A\u77E5\u6B4C\u624B",
    album: t.album || "",
    cover: "",
    picId: t.pic_id || "",
    dur: 0,
    fee: null,
    vip: null,
    playable: null,
    preview: false,
    via: "gdstudio"
  })).filter((t) => t.name);
  await kvPutJSON(env, key, tracks, 600);
  return tracks;
}
__name(gdSearch, "gdSearch");
async function gdUrl(env, id, br) {
  try {
    const j = await gdGet(env, { types: "url", source: "netease", id, br: br || 320 });
    if (j && j.url) return { ok: true, url: j.url, br: j.br || br || 0, type: "mp3", via: "gdstudio", size: j.size || 0 };
  } catch (e) {
  }
  return { ok: false, reason: "vip", playable: false };
}
__name(gdUrl, "gdUrl");
async function gdLrc(env, id) {
  try {
    const j = await gdGet(env, { types: "lyric", source: "netease", id });
    const lrc = j && (j.lyric || j.lrc) || "";
    return { ok: true, lrc, via: lrc ? "gdstudio" : "none" };
  } catch (e) {
    return { ok: true, lrc: "", via: "none" };
  }
}
__name(gdLrc, "gdLrc");
async function gdCover(env, picId) {
  const key = "music:pic:" + picId;
  const hit = await kvGetJSON(env, key);
  if (hit && hit.url) return hit.url;
  const j = await gdGet(env, { types: "pic", source: "netease", id: picId, size: 300 });
  const u = j && j.url || "";
  if (u) await kvPutJSON(env, key, { url: u }, 7 * 24 * 3600);
  return u;
}
__name(gdCover, "gdCover");
async function handleMusic(request, env, url) {
  const p = url.pathname.replace(/\/+$/, "");
  const route2 = p.slice("/api/music".length) || "/";
  const q = url.searchParams;
  if (request.method === "OPTIONS") return json3({ ok: true }, 200, env);
  if (request.method !== "GET") return json3({ ok: false, error: "method not allowed" }, 405, env);
  if (!env.MUSIC_KV) return json3({ ok: false, error: "\u5E02\u573A/\u97F3\u4E50 KV \u672A\u7ED1\u5B9A\uFF08MUSIC_KV\uFF09" }, 503, env);
  try {
    if (route2 === "/health" || route2 === "/") {
      return json3({
        ok: true,
        src: "netease",
        chain: ["netease-direct", "vkeys", "meting", "gdstudio"],
        health: await healthGet(env)
      }, 200, env);
    }
    if (route2 === "/search") {
      const qs2 = (q.get("q") || q.get("keyword") || "").trim();
      const limit = Math.min(50, Math.max(5, parseInt(q.get("limit") || "20", 10) || 20));
      let want = q.get("src") || "auto";
      if (!qs2) return json3({ ok: false, error: "\u7F3A\u5C11\u5173\u952E\u8BCD q\uFF08\u6216 keyword\uFF09" }, 400, env);
      const chain = want === "auto" ? ["netease", "itunes", "deezer"] : [want];
      const health = await healthGet(env);
      let lastErr = null;
      for (const src of chain) {
        if (want === "auto" && srcBlocked(health, src)) continue;
        try {
          const tracks = src === "netease" ? await neSearch(env, qs2, limit) : src === "itunes" ? await itSearch(env, qs2, limit) : src === "deezer" ? await dzSearch(env, qs2, limit) : null;
          if (!tracks) return json3({ ok: false, error: "\u672A\u77E5\u66F2\u6E90 " + src }, 400, env);
          if (!Array.isArray(tracks) || !tracks.length) {
            lastErr = src + ": \u7A7A\u7ED3\u679C";
            continue;
          }
          await healthMark(env, src, true);
          const origin = url.origin;
          const items = tracks.map((t) => {
            if (!t.cover && t.picId) return Object.assign({}, t, { cover: origin + "/api/music/cover?id=" + t.picId });
            return t;
          });
          return json3({ ok: true, src, tracks: items }, 200, env);
        } catch (e) {
          lastErr = src + ": " + (e && e.message);
          await healthMark(env, src, false);
        }
      }
      return json3({ ok: false, error: "\u5168\u90E8\u66F2\u6E90\u4E0D\u53EF\u7528" + (lastErr ? "\uFF08" + lastErr + "\uFF09" : "") }, 502, env);
    }
    if (route2 === "/url") {
      const src = q.get("src") || "netease";
      const id = (q.get("id") || q.get("songId") || "").trim();
      if (!id) return json3({ ok: false, error: "\u7F3A\u5C11 id" }, 400, env);
      const br = src === "netease" ? parseInt(q.get("br") || "320", 10) || 320 : 0;
      let r;
      try {
        r = src === "netease" ? await neUrl(env, id, br) : src === "itunes" ? await itUrl(env, id) : src === "deezer" ? await dzUrl(env, id) : { ok: false, reason: "unknown src" };
        await healthMark(env, src, true);
      } catch (e) {
        await healthMark(env, src, false);
        return json3({ ok: false, error: "\u53D6\u64AD\u653E\u5730\u5740\u5931\u8D25\uFF08" + src + "\uFF09" }, 502, env);
      }
      if (!r.ok) return json3({ ok: false, playable: false, reason: r.reason || "vip", id, src }, 200, env);
      const b642 = btoa(r.url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      return json3({ ok: true, playable: true, play: "/api/music/stream?u=" + b642, br: r.br || 0, type: r.type || "mp3", via: r.via || src, preview: !!r.preview }, 200, env);
    }
    if (route2 === "/lrc") {
      const src = q.get("src") || "netease";
      const id = (q.get("id") || q.get("songId") || "").trim();
      if (!id) return json3({ ok: false, error: "\u7F3A\u5C11 id" }, 400, env);
      if (src !== "netease") return json3({ ok: true, lrc: "" }, 200, env);
      try {
        return json3(await neLrc(env, id), 200, env);
      } catch (e) {
        await healthMark(env, "netease", false);
        return json3({ ok: true, lrc: "" }, 200, env);
      }
    }
    if (route2 === "/toplist") {
      const board = q.get("board") || "hot";
      try {
        return json3(await neTop(env, board), 200, env);
      } catch (e) {
        await healthMark(env, "netease", false);
        return json3({ ok: false, error: "\u699C\u5355\u6682\u4E0D\u53EF\u7528" }, 502, env);
      }
    }
    if (route2 === "/cover") {
      const picId = q.get("id");
      if (picId) {
        try {
          const u2 = await gdCover(env, picId);
          if (u2) {
            return new Response(null, {
              status: 302,
              headers: {
                "Location": u2,
                "Cache-Control": "public, max-age=604800",
                "Access-Control-Allow-Origin": env && env.ALLOW_ORIGIN || "*"
              }
            });
          }
        } catch (e) {
        }
        return json3({ ok: false, error: "cover not found" }, 404, env);
      }
      const target = b64urlDecode(q.get("u"));
      if (!/^https?:\/\//i.test(target) || !STREAM_HOSTS.some((rx) => rx.test(new URL(target).hostname))) {
        return json3({ ok: false, error: "host not allowed" }, 403, env);
      }
      try {
        const res = await upFetch(target, { "Referer": "https://music.163.com/" });
        const h = { "Content-Type": res.headers.get("Content-Type") || "image/jpeg", "Cache-Control": "public, max-age=86400" };
        return new Response(res.body, { status: res.status, headers: Object.assign(h, { "Access-Control-Allow-Origin": env && env.ALLOW_ORIGIN || "*" }) });
      } catch (e) {
        return json3({ ok: false, error: "cover fetch failed" }, 502, env);
      }
    }
    if (route2 === "/stream") {
      const target = b64urlDecode(q.get("u"));
      if (!/^https?:\/\//i.test(target)) return json3({ ok: false, error: "bad u" }, 400, env);
      let host = "";
      try {
        host = new URL(target).hostname;
      } catch (e) {
        return json3({ ok: false, error: "bad u" }, 400, env);
      }
      if (!STREAM_HOSTS.some((rx) => rx.test(host))) return json3({ ok: false, error: "host not allowed" }, 403, env);
      const headers = { "Referer": "https://music.163.com/", "User-Agent": NE_HEADERS["User-Agent"] };
      const range = request.headers.get("Range");
      if (range) headers["Range"] = range;
      let up;
      try {
        up = await upFetch(target, headers);
      } catch (e) {
        return json3({ ok: false, error: "stream unreachable" }, 502, env);
      }
      const h = {
        "Content-Type": up.headers.get("Content-Type") || "audio/mpeg",
        "Access-Control-Allow-Origin": env && env.ALLOW_ORIGIN || "*",
        "Cache-Control": "public, max-age=3600"
      };
      const cr = up.headers.get("Content-Range");
      const cl = up.headers.get("Content-Length");
      if (cr) h["Content-Range"] = cr;
      if (cl) h["Content-Length"] = cl;
      if (up.headers.get("Accept-Ranges")) h["Accept-Ranges"] = "bytes";
      return new Response(up.body, { status: up.status, headers: h });
    }
    return json3({ ok: false, error: "not found" }, 404, env);
  } catch (e) {
    return json3({ ok: false, error: "music internal: " + (e && e.message) }, 500, env);
  }
}
__name(handleMusic, "handleMusic");

// src/admin.js
var ACC_PREFIX2 = "acc:";
var KINDS2 = { app: 1, plugin: 1 };
var AUDIT_KEY = "audit:list";
var AUDIT_MAX = 300;
function json4(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
__name(json4, "json");
function bad2(msg, status = 400) {
  return json4({ ok: false, error: msg }, status);
}
__name(bad2, "bad");
function adminOk2(request, env) {
  const want = env.STORE_ADMIN || "";
  if (!want) return { ok: false, why: "STORE_ADMIN \u672A\u914D\u7F6E" };
  const got = request.headers.get("X-N26-Admin") || "";
  if (got && got === want) return { ok: true };
  return { ok: false, why: "admin-unauthorized" };
}
__name(adminOk2, "adminOk");
function lower2(s) {
  return String(s || "").toLowerCase();
}
__name(lower2, "lower");
function pickKind(v) {
  return KINDS2[v] ? v : "app";
}
__name(pickKind, "pickKind");
var enc2 = new TextEncoder();
async function sha256Hex2(text) {
  const buf = await crypto.subtle.digest("SHA-256", enc2.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex2, "sha256Hex");
async function listAccounts(env) {
  const out = [];
  if (!env.ACC_KV) return out;
  let cursor = void 0;
  for (let i = 0; i < 10; i++) {
    const page = await env.ACC_KV.list({ prefix: ACC_PREFIX2, cursor });
    for (const k of page.keys) {
      const raw = await env.ACC_KV.get(k.name);
      if (!raw) continue;
      try {
        out.push(JSON.parse(raw));
      } catch (e) {
      }
      if (out.length >= 500) return out;
    }
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  return out;
}
__name(listAccounts, "listAccounts");
async function findAccount(env, q) {
  q = String(q || "").trim();
  if (!q) return null;
  const direct = await env.ACC_KV.get(ACC_PREFIX2 + lower2(q));
  if (direct) {
    try {
      return JSON.parse(direct);
    } catch (e) {
      return null;
    }
  }
  if (/^\d{1,7}$/.test(q)) {
    const name = await env.ACC_KV.get("uid:" + q.padStart(7, "0"));
    if (name) {
      const raw = await env.ACC_KV.get(ACC_PREFIX2 + lower2(name));
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      }
    }
  }
  const owner = await env.ACC_KV.get("hid:" + lower2(q.replace(/^@/, "")));
  if (owner) {
    const raw = await env.ACC_KV.get(ACC_PREFIX2 + lower2(owner));
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}
__name(findAccount, "findAccount");
async function readAudit(env) {
  if (!env.STORE_KV) return [];
  const raw = await env.STORE_KV.get(AUDIT_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}
__name(readAudit, "readAudit");
async function writeAudit(request, env, entry) {
  if (!env.STORE_KV) return;
  const who = String(request.headers.get("X-N26-Operator") || "admin").slice(0, 40);
  const rec = Object.assign({
    id: "a" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36),
    at: Date.now(),
    who
  }, entry);
  const list = await readAudit(env);
  list.unshift(rec);
  if (list.length > AUDIT_MAX) list.length = AUDIT_MAX;
  try {
    await env.STORE_KV.put(AUDIT_KEY, JSON.stringify(list));
  } catch (e) {
  }
  return rec;
}
__name(writeAudit, "writeAudit");
async function handleUsers(env) {
  const accs = await listAccounts(env);
  const items = [];
  for (const a of accs) {
    let password = "";
    let passNote = "";
    if (a.passEnc) {
      password = await decryptPass(env, a.passEnc);
      if (!password) passNote = "\u89E3\u5BC6\u5931\u8D25\uFF08\u5BC6\u94A5\u53EF\u80FD\u5DF2\u66F4\u6362\uFF09";
    } else if (a.passHash) {
      passNote = "\u672A\u8BB0\u5F55\uFF08\u65E7\u8D26\u53F7\u53EA\u6709\u54C8\u5E0C\uFF09";
    } else {
      passNote = "\u5DF2\u6E05\u7A7A";
    }
    items.push({
      accountName: a.accountName,
      userName: a.userName || a.accountName,
      uid: a.uid || "",
      id: a.id || "",
      password,
      passNote,
      passAlgo: a.passAlgo || "sha256-legacy",
      status: a.status || "active",
      createdAt: a.createdAt || 0,
      updatedAt: a.updatedAt || 0,
      lastLoginAt: a.lastLoginAt || 0,
      revokedAt: a.revokedAt || 0,
      claimedFrom: a.claimedFrom || ""
    });
  }
  items.sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
  const active = items.filter((i) => i.status !== "revoked").length;
  const revoked = items.length - active;
  return json4({ ok: true, total: items.length, active, revoked, items });
}
__name(handleUsers, "handleUsers");
async function handleRevoke(request, env) {
  let b;
  try {
    b = await request.json();
  } catch (e) {
    return bad2("\u8BF7\u6C42\u4F53\u4E0D\u662F JSON");
  }
  b = b || {};
  const q = String(b && (b.accountName || b.uid || b.id) || "").trim();
  if (!q) return bad2("\u7F3A\u5C11 accountName / uid / id");
  const acc = await findAccount(env, q);
  if (!acc) return bad2("\u8D26\u53F7\u4E0D\u5B58\u5728", 404);
  if (!env.ACC_KV) return bad2("\u670D\u52A1\u7AEF\u672A\u914D\u7F6E ACC_KV", 503);
  acc.salt = "";
  acc.passHash = "";
  acc.passEnc = "";
  acc.status = "revoked";
  acc.revokedAt = Date.now();
  acc.updatedAt = Date.now();
  await env.ACC_KV.put(ACC_PREFIX2 + lower2(acc.accountName), JSON.stringify(acc));
  await writeAudit(request, env, {
    action: "revoke-account",
    targetType: "account",
    targetId: acc.accountName,
    targetName: acc.userName || acc.accountName,
    reason: "\u7BA1\u7406\u5458\u6CE8\u9500\u8D26\u53F7\u5BC6\u7801"
  });
  return json4({ ok: true, accountName: acc.accountName, status: acc.status });
}
__name(handleRevoke, "handleRevoke");
async function handleInventory(env) {
  if (!env.STORE_KV) return json4({ ok: true, total: 0, items: [], note: "STORE_KV \u672A\u7ED1\u5B9A" });
  const raw = await env.STORE_KV.get("nexus:inventory");
  let list = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [];
    } catch (e) {
      list = [];
    }
  }
  return json4({ ok: true, total: list.length, items: list });
}
__name(handleInventory, "handleInventory");
async function kvGet2(env, key, fallback) {
  const raw = await env.STORE_KV.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}
__name(kvGet2, "kvGet");
async function kvPut2(env, key, val) {
  await env.STORE_KV.put(key, JSON.stringify(val));
}
__name(kvPut2, "kvPut");
async function scanPackages(env, kind) {
  if (!env.STORE_KV) return [];
  const prefix = "store:pkg:" + kind + ":";
  const out = [];
  let cursor = void 0;
  for (let i = 0; i < 10; i++) {
    const page = await env.STORE_KV.list({ prefix, cursor });
    for (const k of page.keys) {
      const raw = await env.STORE_KV.get(k.name);
      if (!raw) continue;
      try {
        const pkg = JSON.parse(raw);
        pkg.id = pkg.id || k.name.slice(prefix.length);
        out.push(pkg);
      } catch (e) {
      }
      if (out.length >= 500) return out;
    }
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  return out;
}
__name(scanPackages, "scanPackages");
function pkgStatus(pkg) {
  const s = String(pkg && pkg.status || "pending");
  if (s === "approved" || s === "pending" || s === "rejected" || s === "offline") return s;
  return "pending";
}
__name(pkgStatus, "pkgStatus");
function pkgSummary(pkg) {
  const m = pkg.meta || {};
  return {
    id: pkg.id,
    kind: pkg.kind || "app",
    status: pkgStatus(pkg),
    name: m.name || pkg.id,
    subtitle: m.subtitle || "",
    desc: m.desc || "",
    version: m.version || "",
    category: m.category || "",
    tags: Array.isArray(m.tags) ? m.tags : [],
    icon: m.icon || "",
    iconUrl: m.iconUrl || "",
    screenshots: Array.isArray(m.screenshots) ? m.screenshots : [],
    publisher: m.publisher || pkg.submitter || "\u533F\u540D\u5F00\u53D1\u8005",
    submittedAt: pkg.submittedAt || m.createdAt || 0,
    updatedAt: pkg.updatedAt || 0,
    approvedAt: pkg.approvedAt || 0,
    rejectedAt: pkg.rejectedAt || 0,
    offlineAt: pkg.offlineAt || 0,
    rejectReason: pkg.rejectReason || "",
    bytes: m.bytes || 0,
    fileCount: m.fileCount || 0,
    downloads: pkg.downloads || 0,
    versions: Array.isArray(pkg.versions) ? pkg.versions : []
  };
}
__name(pkgSummary, "pkgSummary");
async function handleApps(env, url) {
  if (!env.STORE_KV) return json4({ ok: false, error: "STORE_KV \u672A\u7ED1\u5B9A" }, 503);
  const kind = pickKind(url.searchParams.get("kind"));
  const status = String(url.searchParams.get("status") || "all");
  const q = lower2(url.searchParams.get("q") || "");
  const all = (await scanPackages(env, kind)).map(pkgSummary);
  let items = all;
  if (status !== "all" && status !== "") items = items.filter((i) => i.status === status);
  if (q) items = items.filter((i) => lower2(i.name).indexOf(q) >= 0 || lower2(i.id).indexOf(q) >= 0 || lower2(i.publisher).indexOf(q) >= 0);
  items.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  const counts = { all: all.length, pending: 0, approved: 0, offline: 0, rejected: 0 };
  for (const i of all) counts[i.status] = (counts[i.status] || 0) + 1;
  return json4({ ok: true, kind, status, counts, total: items.length, items });
}
__name(handleApps, "handleApps");
async function handleAppDetail(env, url) {
  if (!env.STORE_KV) return json4({ ok: false, error: "STORE_KV \u672A\u7ED1\u5B9A" }, 503);
  const kind = pickKind(url.searchParams.get("kind"));
  const id = String(url.searchParams.get("id") || "");
  if (!id) return bad2("\u7F3A\u5C11 id");
  const pkg = await kvGet2(env, "store:pkg:" + kind + ":" + id, null);
  if (!pkg) return bad2("\u5305\u4E0D\u5B58\u5728", 404);
  const files = pkg.files && typeof pkg.files === "object" ? pkg.files : {};
  const names = Object.keys(files);
  const fileList = names.map((n) => ({ name: n, bytes: String(files[n] || "").length }));
  let sha = "";
  try {
    const text = names.sort().map((n) => n + "\n" + String(files[n] || "")).join("\n");
    sha = await sha256Hex2(text);
  } catch (e) {
  }
  const m = pkg.meta || {};
  return json4({
    ok: true,
    item: Object.assign(pkgSummary(pkg), {
      entry: m.entry || "",
      previewUrl: m.previewUrl || "",
      permissions: Array.isArray(m.permissions) ? m.permissions : [],
      changelog: m.changelog || "",
      sha256: sha,
      files: fileList.slice(0, 80),
      fileTotal: fileList.length
    })
  });
}
__name(handleAppDetail, "handleAppDetail");
async function handleReview(request, env) {
  if (!env.STORE_KV) return json4({ ok: false, error: "STORE_KV \u672A\u7ED1\u5B9A" }, 503);
  let b;
  try {
    b = await request.json();
  } catch (e) {
    return bad2("\u8BF7\u6C42\u4F53\u4E0D\u662F JSON");
  }
  b = b || {};
  const kind = pickKind(b && b.kind);
  const id = String(b && b.id || "");
  const action = String(b && b.action || "");
  const reason = String(b && b.reason || "").trim().slice(0, 300);
  if (!id) return bad2("\u7F3A\u5C11 id");
  if (!["approve", "reject", "offline", "online"].includes(action)) {
    return bad2("action \u5FC5\u987B\u662F approve / reject / offline / online");
  }
  if (action === "reject" && !reason) return bad2("\u62D2\u7EDD\u5FC5\u987B\u586B\u5199\u539F\u56E0");
  const pkg = await kvGet2(env, "store:pkg:" + kind + ":" + id, null);
  if (!pkg) return bad2("\u5305\u4E0D\u5B58\u5728", 404);
  const from = pkgStatus(pkg);
  const pend = await kvGet2(env, "store:pend:" + kind, []);
  const pi = pend.indexOf(id);
  if (pi >= 0) {
    pend.splice(pi, 1);
    await kvPut2(env, "store:pend:" + kind, pend);
  }
  const idx = await kvGet2(env, "store:idx:" + kind, []);
  if (action === "approve" || action === "online") {
    for (const oldId of idx.slice()) {
      if (oldId === id) continue;
      const op = await kvGet2(env, "store:pkg:" + kind + ":" + oldId, null);
      if (op && op.meta && op.meta.name === pkg.meta.name) {
        op.status = "offline";
        op.offlineAt = Date.now();
        op.updatedAt = Date.now();
        op.supersededBy = id;
        await kvPut2(env, "store:pkg:" + kind + ":" + oldId, op);
        const oi = idx.indexOf(oldId);
        if (oi >= 0) idx.splice(oi, 1);
      }
    }
    pkg.status = "approved";
    pkg.approvedAt = Date.now();
    pkg.updatedAt = Date.now();
    pkg.rejectReason = "";
    if (idx.indexOf(id) < 0) idx.unshift(id);
  } else if (action === "reject") {
    pkg.status = "rejected";
    pkg.rejectedAt = Date.now();
    pkg.updatedAt = Date.now();
    pkg.rejectReason = reason;
    const ii = idx.indexOf(id);
    if (ii >= 0) idx.splice(ii, 1);
  } else {
    pkg.status = "offline";
    pkg.offlineAt = Date.now();
    pkg.updatedAt = Date.now();
    const ii = idx.indexOf(id);
    if (ii >= 0) idx.splice(ii, 1);
  }
  await kvPut2(env, "store:idx:" + kind, idx);
  await kvPut2(env, "store:pkg:" + kind + ":" + id, pkg);
  await writeAudit(request, env, {
    action: action + "-package",
    targetType: kind,
    targetId: id,
    targetName: pkg.meta && pkg.meta.name || id,
    from,
    to: pkg.status,
    reason
  });
  return json4({ ok: true, id, kind, action, status: pkg.status });
}
__name(handleReview, "handleReview");
async function handleEditApp(request, env) {
  if (!env.STORE_KV) return json4({ ok: false, error: "STORE_KV \u672A\u7ED1\u5B9A" }, 503);
  let b;
  try {
    b = await request.json();
  } catch (e) {
    return bad2("\u8BF7\u6C42\u4F53\u4E0D\u662F JSON");
  }
  b = b || {};
  const kind = pickKind(b && b.kind);
  const id = String(b && b.id || "");
  const patch = b && b.patch || {};
  if (!id) return bad2("\u7F3A\u5C11 id");
  const pkg = await kvGet2(env, "store:pkg:" + kind + ":" + id, null);
  if (!pkg) return bad2("\u5305\u4E0D\u5B58\u5728", 404);
  pkg.meta = pkg.meta || {};
  const changed = [];
  function str(key, max, label) {
    if (patch[key] === void 0) return;
    const v = String(patch[key] == null ? "" : patch[key]).trim().slice(0, max);
    if (v !== pkg.meta[key]) {
      pkg.meta[key] = v;
      changed.push(label || key);
    }
  }
  __name(str, "str");
  str("name", 40, "\u540D\u79F0");
  str("subtitle", 80, "\u526F\u6807\u9898");
  str("desc", 400, "\u7B80\u4ECB");
  str("category", 20, "\u5206\u7C7B");
  str("icon", 40, "\u56FE\u6807");
  str("iconUrl", 500, "Icon \u56FE\u7247");
  str("entry", 160, "\u5165\u53E3");
  str("previewUrl", 500, "\u9884\u89C8\u5730\u5740");
  str("changelog", 400, "\u66F4\u65B0\u8BF4\u660E");
  if (patch.tags !== void 0) {
    const tags = Array.isArray(patch.tags) ? patch.tags.slice(0, 6).map((t) => String(t).slice(0, 12)).filter(Boolean) : String(patch.tags || "").split(/[,，]/).map((t) => t.trim()).filter(Boolean).slice(0, 6);
    if (JSON.stringify(tags) !== JSON.stringify(pkg.meta.tags || [])) {
      pkg.meta.tags = tags;
      changed.push("\u6807\u7B7E");
    }
  }
  if (patch.screenshots !== void 0) {
    const shots = (Array.isArray(patch.screenshots) ? patch.screenshots : String(patch.screenshots || "").split(/\s+/)).map((s) => String(s || "").trim()).filter(Boolean).slice(0, 8).map((s) => s.slice(0, 500));
    pkg.meta.screenshots = shots;
    changed.push("\u5BA3\u4F20\u56FE");
  }
  if (patch.permissions !== void 0) {
    const perms = Array.isArray(patch.permissions) ? patch.permissions : String(patch.permissions || "").split(/[,，]/);
    pkg.meta.permissions = perms.map((p) => String(p || "").trim()).filter(Boolean).slice(0, 12).map((p) => p.slice(0, 30));
    changed.push("\u6743\u9650\u58F0\u660E");
  }
  if (patch.version !== void 0) {
    const v = String(patch.version || "").replace(/[^\w.\-]/g, "").slice(0, 20);
    if (v && v !== pkg.meta.version) {
      pkg.versions = Array.isArray(pkg.versions) ? pkg.versions : [];
      pkg.versions.unshift({ version: v, at: Date.now(), by: "admin" });
      if (pkg.versions.length > 30) pkg.versions.length = 30;
      pkg.meta.version = v;
      changed.push("\u7248\u672C");
    }
  }
  pkg.updatedAt = Date.now();
  await kvPut2(env, "store:pkg:" + kind + ":" + id, pkg);
  if (changed.length) {
    await writeAudit(request, env, {
      action: "edit-package",
      targetType: kind,
      targetId: id,
      targetName: pkg.meta.name || id,
      fields: changed,
      reason: "\u7BA1\u7406\u5458\u7F16\u8F91\u4E0A\u67B6\u4FE1\u606F\uFF1A" + changed.join("\u3001")
    });
  }
  return json4({ ok: true, id, kind, changed, item: pkgSummary(pkg) });
}
__name(handleEditApp, "handleEditApp");
async function handleAudit(env, url) {
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
  const list = await readAudit(env);
  return json4({ ok: true, total: list.length, items: list.slice(0, limit) });
}
__name(handleAudit, "handleAudit");
async function handleOverview(env) {
  const out = {
    ok: true,
    version: "3.2.0-review",
    users: { total: 0, active: 0, revoked: 0 },
    store: { apps: 0, plugins: 0, pending: 0, byStatus: { app: {}, plugin: {} } },
    inventory: 0,
    audit: []
  };
  const accs = await listAccounts(env);
  out.users.total = accs.length;
  out.users.revoked = accs.filter((a) => (a.status || "active") === "revoked").length;
  out.users.active = out.users.total - out.users.revoked;
  if (env.STORE_KV) {
    for (const kind of Object.keys(KINDS2)) {
      const pkgs = await scanPackages(env, kind);
      const c = { pending: 0, approved: 0, offline: 0, rejected: 0 };
      for (const p of pkgs) c[pkgStatus(p)] = (c[pkgStatus(p)] || 0) + 1;
      out.store.byStatus[kind] = Object.assign({ total: pkgs.length }, c);
      out.store.pending += c.pending;
      if (kind === "app") out.store.apps = c.approved;
      else out.store.plugins = c.approved;
    }
    const inv = await kvGet2(env, "nexus:inventory", []);
    out.inventory = Array.isArray(inv) ? inv.length : inv && Array.isArray(inv.items) ? inv.items.length : 0;
    out.audit = (await readAudit(env)).slice(0, 8);
  }
  return json4(out);
}
__name(handleOverview, "handleOverview");
async function handleNexusAdmin(request, env, url) {
  const sub = url.pathname.replace(/^\/api\/admin/, "") || "/";
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204 });
  const gate = adminOk2(request, env);
  if (!gate.ok) return bad2(gate.why || "admin-unauthorized", 401);
  try {
    if (sub === "/overview" && method === "GET") return await handleOverview(env);
    if (sub === "/users" && method === "GET") return await handleUsers(env);
    if (sub === "/revoke" && method === "POST") return await handleRevoke(request, env);
    if (sub === "/inventory" && method === "GET") return await handleInventory(env);
    if (sub === "/apps" && method === "GET") return await handleApps(env, url);
    if (sub === "/app" && method === "GET") return await handleAppDetail(env, url);
    if (sub === "/review" && method === "POST") return await handleReview(request, env);
    if (sub === "/edit-app" && method === "POST") return await handleEditApp(request, env);
    if (sub === "/audit" && method === "GET") return await handleAudit(env, url);
    return bad2("\u672A\u77E5\u7684\u7BA1\u7406\u63A5\u53E3\uFF1A" + sub, 404);
  } catch (e) {
    return bad2("\u7BA1\u7406\u63A5\u53E3\u5F02\u5E38\uFF1A" + (e && e.message ? e.message : "unknown"), 500);
  }
}
__name(handleNexusAdmin, "handleNexusAdmin");

// ../../../node_modules/qrcode-generator/dist/qrcode.mjs
var qrcode = /* @__PURE__ */ __name(function(typeNumber, errorCorrectionLevel) {
  const PAD0 = 236;
  const PAD1 = 17;
  let _typeNumber = typeNumber;
  const _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
  let _modules = null;
  let _moduleCount = 0;
  let _dataCache = null;
  const _dataList = [];
  const _this = {};
  const makeImpl = /* @__PURE__ */ __name(function(test, maskPattern) {
    _moduleCount = _typeNumber * 4 + 17;
    _modules = (function(moduleCount) {
      const modules = new Array(moduleCount);
      for (let row = 0; row < moduleCount; row += 1) {
        modules[row] = new Array(moduleCount);
        for (let col = 0; col < moduleCount; col += 1) {
          modules[row][col] = null;
        }
      }
      return modules;
    })(_moduleCount);
    setupPositionProbePattern(0, 0);
    setupPositionProbePattern(_moduleCount - 7, 0);
    setupPositionProbePattern(0, _moduleCount - 7);
    setupPositionAdjustPattern();
    setupTimingPattern();
    setupTypeInfo(test, maskPattern);
    if (_typeNumber >= 7) {
      setupTypeNumber(test);
    }
    if (_dataCache == null) {
      _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
    }
    mapData(_dataCache, maskPattern);
  }, "makeImpl");
  const setupPositionProbePattern = /* @__PURE__ */ __name(function(row, col) {
    for (let r = -1; r <= 7; r += 1) {
      if (row + r <= -1 || _moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c += 1) {
        if (col + c <= -1 || _moduleCount <= col + c) continue;
        if (0 <= r && r <= 6 && (c == 0 || c == 6) || 0 <= c && c <= 6 && (r == 0 || r == 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
          _modules[row + r][col + c] = true;
        } else {
          _modules[row + r][col + c] = false;
        }
      }
    }
  }, "setupPositionProbePattern");
  const getBestMaskPattern = /* @__PURE__ */ __name(function() {
    let minLostPoint = 0;
    let pattern = 0;
    for (let i = 0; i < 8; i += 1) {
      makeImpl(true, i);
      const lostPoint = QRUtil.getLostPoint(_this);
      if (i == 0 || minLostPoint > lostPoint) {
        minLostPoint = lostPoint;
        pattern = i;
      }
    }
    return pattern;
  }, "getBestMaskPattern");
  const setupTimingPattern = /* @__PURE__ */ __name(function() {
    for (let r = 8; r < _moduleCount - 8; r += 1) {
      if (_modules[r][6] != null) {
        continue;
      }
      _modules[r][6] = r % 2 == 0;
    }
    for (let c = 8; c < _moduleCount - 8; c += 1) {
      if (_modules[6][c] != null) {
        continue;
      }
      _modules[6][c] = c % 2 == 0;
    }
  }, "setupTimingPattern");
  const setupPositionAdjustPattern = /* @__PURE__ */ __name(function() {
    const pos = QRUtil.getPatternPosition(_typeNumber);
    for (let i = 0; i < pos.length; i += 1) {
      for (let j = 0; j < pos.length; j += 1) {
        const row = pos[i];
        const col = pos[j];
        if (_modules[row][col] != null) {
          continue;
        }
        for (let r = -2; r <= 2; r += 1) {
          for (let c = -2; c <= 2; c += 1) {
            if (r == -2 || r == 2 || c == -2 || c == 2 || r == 0 && c == 0) {
              _modules[row + r][col + c] = true;
            } else {
              _modules[row + r][col + c] = false;
            }
          }
        }
      }
    }
  }, "setupPositionAdjustPattern");
  const setupTypeNumber = /* @__PURE__ */ __name(function(test) {
    const bits = QRUtil.getBCHTypeNumber(_typeNumber);
    for (let i = 0; i < 18; i += 1) {
      const mod = !test && (bits >> i & 1) == 1;
      _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
    }
    for (let i = 0; i < 18; i += 1) {
      const mod = !test && (bits >> i & 1) == 1;
      _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
    }
  }, "setupTypeNumber");
  const setupTypeInfo = /* @__PURE__ */ __name(function(test, maskPattern) {
    const data = _errorCorrectionLevel << 3 | maskPattern;
    const bits = QRUtil.getBCHTypeInfo(data);
    for (let i = 0; i < 15; i += 1) {
      const mod = !test && (bits >> i & 1) == 1;
      if (i < 6) {
        _modules[i][8] = mod;
      } else if (i < 8) {
        _modules[i + 1][8] = mod;
      } else {
        _modules[_moduleCount - 15 + i][8] = mod;
      }
    }
    for (let i = 0; i < 15; i += 1) {
      const mod = !test && (bits >> i & 1) == 1;
      if (i < 8) {
        _modules[8][_moduleCount - i - 1] = mod;
      } else if (i < 9) {
        _modules[8][15 - i - 1 + 1] = mod;
      } else {
        _modules[8][15 - i - 1] = mod;
      }
    }
    _modules[_moduleCount - 8][8] = !test;
  }, "setupTypeInfo");
  const mapData = /* @__PURE__ */ __name(function(data, maskPattern) {
    let inc = -1;
    let row = _moduleCount - 1;
    let bitIndex = 7;
    let byteIndex = 0;
    const maskFunc = QRUtil.getMaskFunction(maskPattern);
    for (let col = _moduleCount - 1; col > 0; col -= 2) {
      if (col == 6) col -= 1;
      while (true) {
        for (let c = 0; c < 2; c += 1) {
          if (_modules[row][col - c] == null) {
            let dark = false;
            if (byteIndex < data.length) {
              dark = (data[byteIndex] >>> bitIndex & 1) == 1;
            }
            const mask = maskFunc(row, col - c);
            if (mask) {
              dark = !dark;
            }
            _modules[row][col - c] = dark;
            bitIndex -= 1;
            if (bitIndex == -1) {
              byteIndex += 1;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || _moduleCount <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  }, "mapData");
  const createBytes = /* @__PURE__ */ __name(function(buffer, rsBlocks) {
    let offset = 0;
    let maxDcCount = 0;
    let maxEcCount = 0;
    const dcdata = new Array(rsBlocks.length);
    const ecdata = new Array(rsBlocks.length);
    for (let r = 0; r < rsBlocks.length; r += 1) {
      const dcCount = rsBlocks[r].dataCount;
      const ecCount = rsBlocks[r].totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);
      dcdata[r] = new Array(dcCount);
      for (let i = 0; i < dcdata[r].length; i += 1) {
        dcdata[r][i] = 255 & buffer.getBuffer()[i + offset];
      }
      offset += dcCount;
      const rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
      const rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
      const modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = new Array(rsPoly.getLength() - 1);
      for (let i = 0; i < ecdata[r].length; i += 1) {
        const modIndex = i + modPoly.getLength() - ecdata[r].length;
        ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
      }
    }
    let totalCodeCount = 0;
    for (let i = 0; i < rsBlocks.length; i += 1) {
      totalCodeCount += rsBlocks[i].totalCount;
    }
    const data = new Array(totalCodeCount);
    let index = 0;
    for (let i = 0; i < maxDcCount; i += 1) {
      for (let r = 0; r < rsBlocks.length; r += 1) {
        if (i < dcdata[r].length) {
          data[index] = dcdata[r][i];
          index += 1;
        }
      }
    }
    for (let i = 0; i < maxEcCount; i += 1) {
      for (let r = 0; r < rsBlocks.length; r += 1) {
        if (i < ecdata[r].length) {
          data[index] = ecdata[r][i];
          index += 1;
        }
      }
    }
    return data;
  }, "createBytes");
  const createData = /* @__PURE__ */ __name(function(typeNumber2, errorCorrectionLevel2, dataList) {
    const rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, errorCorrectionLevel2);
    const buffer = qrBitBuffer();
    for (let i = 0; i < dataList.length; i += 1) {
      const data = dataList[i];
      buffer.put(data.getMode(), 4);
      buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
      data.write(buffer);
    }
    let totalDataCount = 0;
    for (let i = 0; i < rsBlocks.length; i += 1) {
      totalDataCount += rsBlocks[i].dataCount;
    }
    if (buffer.getLengthInBits() > totalDataCount * 8) {
      throw "code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")";
    }
    if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
      buffer.put(0, 4);
    }
    while (buffer.getLengthInBits() % 8 != 0) {
      buffer.putBit(false);
    }
    while (true) {
      if (buffer.getLengthInBits() >= totalDataCount * 8) {
        break;
      }
      buffer.put(PAD0, 8);
      if (buffer.getLengthInBits() >= totalDataCount * 8) {
        break;
      }
      buffer.put(PAD1, 8);
    }
    return createBytes(buffer, rsBlocks);
  }, "createData");
  _this.addData = function(data, mode) {
    mode = mode || "Byte";
    let newData = null;
    switch (mode) {
      case "Numeric":
        newData = qrNumber(data);
        break;
      case "Alphanumeric":
        newData = qrAlphaNum(data);
        break;
      case "Byte":
        newData = qr8BitByte(data);
        break;
      case "Kanji":
        newData = qrKanji(data);
        break;
      default:
        throw "mode:" + mode;
    }
    _dataList.push(newData);
    _dataCache = null;
  };
  _this.isDark = function(row, col) {
    if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
      throw row + "," + col;
    }
    return _modules[row][col];
  };
  _this.getModuleCount = function() {
    return _moduleCount;
  };
  _this.make = function() {
    if (_typeNumber < 1) {
      let typeNumber2 = 1;
      for (; typeNumber2 < 40; typeNumber2++) {
        const rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, _errorCorrectionLevel);
        const buffer = qrBitBuffer();
        for (let i = 0; i < _dataList.length; i++) {
          const data = _dataList[i];
          buffer.put(data.getMode(), 4);
          buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
          data.write(buffer);
        }
        let totalDataCount = 0;
        for (let i = 0; i < rsBlocks.length; i++) {
          totalDataCount += rsBlocks[i].dataCount;
        }
        if (buffer.getLengthInBits() <= totalDataCount * 8) {
          break;
        }
      }
      _typeNumber = typeNumber2;
    }
    makeImpl(false, getBestMaskPattern());
  };
  _this.createTableTag = function(cellSize, margin) {
    cellSize = cellSize || 2;
    margin = typeof margin == "undefined" ? cellSize * 4 : margin;
    let qrHtml = "";
    qrHtml += '<table style="';
    qrHtml += " border-width: 0px; border-style: none;";
    qrHtml += " border-collapse: collapse;";
    qrHtml += " padding: 0px; margin: " + margin + "px;";
    qrHtml += '">';
    qrHtml += "<tbody>";
    for (let r = 0; r < _this.getModuleCount(); r += 1) {
      qrHtml += "<tr>";
      for (let c = 0; c < _this.getModuleCount(); c += 1) {
        qrHtml += '<td style="';
        qrHtml += " border-width: 0px; border-style: none;";
        qrHtml += " border-collapse: collapse;";
        qrHtml += " padding: 0px; margin: 0px;";
        qrHtml += " width: " + cellSize + "px;";
        qrHtml += " height: " + cellSize + "px;";
        qrHtml += " background-color: ";
        qrHtml += _this.isDark(r, c) ? "#000000" : "#ffffff";
        qrHtml += ";";
        qrHtml += '"/>';
      }
      qrHtml += "</tr>";
    }
    qrHtml += "</tbody>";
    qrHtml += "</table>";
    return qrHtml;
  };
  _this.createSvgTag = function(cellSize, margin, alt, title) {
    let opts = {};
    if (typeof arguments[0] == "object") {
      opts = arguments[0];
      cellSize = opts.cellSize;
      margin = opts.margin;
      alt = opts.alt;
      title = opts.title;
    }
    cellSize = cellSize || 2;
    margin = typeof margin == "undefined" ? cellSize * 4 : margin;
    alt = typeof alt === "string" ? { text: alt } : alt || {};
    alt.text = alt.text || null;
    alt.id = alt.text ? alt.id || "qrcode-description" : null;
    title = typeof title === "string" ? { text: title } : title || {};
    title.text = title.text || null;
    title.id = title.text ? title.id || "qrcode-title" : null;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    let c, mc, r, mr, qrSvg = "", rect;
    rect = "l" + cellSize + ",0 0," + cellSize + " -" + cellSize + ",0 0,-" + cellSize + "z ";
    qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
    qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : "";
    qrSvg += ' viewBox="0 0 ' + size + " " + size + '" ';
    qrSvg += ' preserveAspectRatio="xMinYMin meet"';
    qrSvg += title.text || alt.text ? ' role="img" aria-labelledby="' + escapeXml([title.id, alt.id].join(" ").trim()) + '"' : "";
    qrSvg += ">";
    qrSvg += title.text ? '<title id="' + escapeXml(title.id) + '">' + escapeXml(title.text) + "</title>" : "";
    qrSvg += alt.text ? '<description id="' + escapeXml(alt.id) + '">' + escapeXml(alt.text) + "</description>" : "";
    qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
    qrSvg += '<path d="';
    for (r = 0; r < _this.getModuleCount(); r += 1) {
      mr = r * cellSize + margin;
      for (c = 0; c < _this.getModuleCount(); c += 1) {
        if (_this.isDark(r, c)) {
          mc = c * cellSize + margin;
          qrSvg += "M" + mc + "," + mr + rect;
        }
      }
    }
    qrSvg += '" stroke="transparent" fill="black"/>';
    qrSvg += "</svg>";
    return qrSvg;
  };
  _this.createDataURL = function(cellSize, margin) {
    cellSize = cellSize || 2;
    margin = typeof margin == "undefined" ? cellSize * 4 : margin;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    const min = margin;
    const max = size - margin;
    return createDataURL(size, size, function(x, y) {
      if (min <= x && x < max && min <= y && y < max) {
        const c = Math.floor((x - min) / cellSize);
        const r = Math.floor((y - min) / cellSize);
        return _this.isDark(r, c) ? 0 : 1;
      } else {
        return 1;
      }
    });
  };
  _this.createImgTag = function(cellSize, margin, alt) {
    cellSize = cellSize || 2;
    margin = typeof margin == "undefined" ? cellSize * 4 : margin;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    let img = "";
    img += "<img";
    img += ' src="';
    img += _this.createDataURL(cellSize, margin);
    img += '"';
    img += ' width="';
    img += size;
    img += '"';
    img += ' height="';
    img += size;
    img += '"';
    if (alt) {
      img += ' alt="';
      img += escapeXml(alt);
      img += '"';
    }
    img += "/>";
    return img;
  };
  const escapeXml = /* @__PURE__ */ __name(function(s) {
    let escaped = "";
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charAt(i);
      switch (c) {
        case "<":
          escaped += "&lt;";
          break;
        case ">":
          escaped += "&gt;";
          break;
        case "&":
          escaped += "&amp;";
          break;
        case '"':
          escaped += "&quot;";
          break;
        default:
          escaped += c;
          break;
      }
    }
    return escaped;
  }, "escapeXml");
  const _createHalfASCII = /* @__PURE__ */ __name(function(margin) {
    const cellSize = 1;
    margin = typeof margin == "undefined" ? cellSize * 2 : margin;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    const min = margin;
    const max = size - margin;
    let y, x, r1, r2, p;
    const blocks = {
      "\u2588\u2588": "\u2588",
      "\u2588 ": "\u2580",
      " \u2588": "\u2584",
      "  ": " "
    };
    const blocksLastLineNoMargin = {
      "\u2588\u2588": "\u2580",
      "\u2588 ": "\u2580",
      " \u2588": " ",
      "  ": " "
    };
    let ascii = "";
    for (y = 0; y < size; y += 2) {
      r1 = Math.floor((y - min) / cellSize);
      r2 = Math.floor((y + 1 - min) / cellSize);
      for (x = 0; x < size; x += 1) {
        p = "\u2588";
        if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
          p = " ";
        }
        if (min <= x && x < max && min <= y + 1 && y + 1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
          p += " ";
        } else {
          p += "\u2588";
        }
        ascii += margin < 1 && y + 1 >= max ? blocksLastLineNoMargin[p] : blocks[p];
      }
      ascii += "\n";
    }
    if (size % 2 && margin > 0) {
      return ascii.substring(0, ascii.length - size - 1) + Array(size + 1).join("\u2580");
    }
    return ascii.substring(0, ascii.length - 1);
  }, "_createHalfASCII");
  _this.createASCII = function(cellSize, margin) {
    cellSize = cellSize || 1;
    if (cellSize < 2) {
      return _createHalfASCII(margin);
    }
    cellSize -= 1;
    margin = typeof margin == "undefined" ? cellSize * 2 : margin;
    const size = _this.getModuleCount() * cellSize + margin * 2;
    const min = margin;
    const max = size - margin;
    let y, x, r, p;
    const white = Array(cellSize + 1).join("\u2588\u2588");
    const black = Array(cellSize + 1).join("  ");
    let ascii = "";
    let line = "";
    for (y = 0; y < size; y += 1) {
      r = Math.floor((y - min) / cellSize);
      line = "";
      for (x = 0; x < size; x += 1) {
        p = 1;
        if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
          p = 0;
        }
        line += p ? white : black;
      }
      for (r = 0; r < cellSize; r += 1) {
        ascii += line + "\n";
      }
    }
    return ascii.substring(0, ascii.length - 1);
  };
  _this.renderTo2dContext = function(context, cellSize) {
    cellSize = cellSize || 2;
    const length = _this.getModuleCount();
    for (let row = 0; row < length; row++) {
      for (let col = 0; col < length; col++) {
        context.fillStyle = _this.isDark(row, col) ? "black" : "white";
        context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  };
  return _this;
}, "qrcode");
qrcode.stringToBytes = function(s) {
  const bytes = [];
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    bytes.push(c & 255);
  }
  return bytes;
};
qrcode.createStringToBytes = function(unicodeData, numChars) {
  const unicodeMap = (function() {
    const bin = base64DecodeInputStream(unicodeData);
    const read = /* @__PURE__ */ __name(function() {
      const b = bin.read();
      if (b == -1) throw "eof";
      return b;
    }, "read");
    let count = 0;
    const unicodeMap2 = {};
    while (true) {
      const b0 = bin.read();
      if (b0 == -1) break;
      const b1 = read();
      const b2 = read();
      const b3 = read();
      const k = String.fromCharCode(b0 << 8 | b1);
      const v = b2 << 8 | b3;
      unicodeMap2[k] = v;
      count += 1;
    }
    if (count != numChars) {
      throw count + " != " + numChars;
    }
    return unicodeMap2;
  })();
  const unknownChar = "?".charCodeAt(0);
  return function(s) {
    const bytes = [];
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i);
      if (c < 128) {
        bytes.push(c);
      } else {
        const b = unicodeMap[s.charAt(i)];
        if (typeof b == "number") {
          if ((b & 255) == b) {
            bytes.push(b);
          } else {
            bytes.push(b >>> 8);
            bytes.push(b & 255);
          }
        } else {
          bytes.push(unknownChar);
        }
      }
    }
    return bytes;
  };
};
var QRMode = {
  MODE_NUMBER: 1 << 0,
  MODE_ALPHA_NUM: 1 << 1,
  MODE_8BIT_BYTE: 1 << 2,
  MODE_KANJI: 1 << 3
};
var QRErrorCorrectionLevel = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2
};
var QRMaskPattern = {
  PATTERN000: 0,
  PATTERN001: 1,
  PATTERN010: 2,
  PATTERN011: 3,
  PATTERN100: 4,
  PATTERN101: 5,
  PATTERN110: 6,
  PATTERN111: 7
};
var QRUtil = (function() {
  const PATTERN_POSITION_TABLE = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
    [6, 30, 54],
    [6, 32, 58],
    [6, 34, 62],
    [6, 26, 46, 66],
    [6, 26, 48, 70],
    [6, 26, 50, 74],
    [6, 30, 54, 78],
    [6, 30, 56, 82],
    [6, 30, 58, 86],
    [6, 34, 62, 90],
    [6, 28, 50, 72, 94],
    [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102],
    [6, 28, 54, 80, 106],
    [6, 32, 58, 84, 110],
    [6, 30, 58, 86, 114],
    [6, 34, 62, 90, 118],
    [6, 26, 50, 74, 98, 122],
    [6, 30, 54, 78, 102, 126],
    [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134],
    [6, 34, 60, 86, 112, 138],
    [6, 30, 58, 86, 114, 142],
    [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150],
    [6, 24, 50, 76, 102, 128, 154],
    [6, 28, 54, 80, 106, 132, 158],
    [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166],
    [6, 30, 58, 86, 114, 142, 170]
  ];
  const G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
  const G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
  const G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
  const _this = {};
  const getBCHDigit = /* @__PURE__ */ __name(function(data) {
    let digit = 0;
    while (data != 0) {
      digit += 1;
      data >>>= 1;
    }
    return digit;
  }, "getBCHDigit");
  _this.getBCHTypeInfo = function(data) {
    let d = data << 10;
    while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
      d ^= G15 << getBCHDigit(d) - getBCHDigit(G15);
    }
    return (data << 10 | d) ^ G15_MASK;
  };
  _this.getBCHTypeNumber = function(data) {
    let d = data << 12;
    while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
      d ^= G18 << getBCHDigit(d) - getBCHDigit(G18);
    }
    return data << 12 | d;
  };
  _this.getPatternPosition = function(typeNumber) {
    return PATTERN_POSITION_TABLE[typeNumber - 1];
  };
  _this.getMaskFunction = function(maskPattern) {
    switch (maskPattern) {
      case QRMaskPattern.PATTERN000:
        return function(i, j) {
          return (i + j) % 2 == 0;
        };
      case QRMaskPattern.PATTERN001:
        return function(i, j) {
          return i % 2 == 0;
        };
      case QRMaskPattern.PATTERN010:
        return function(i, j) {
          return j % 3 == 0;
        };
      case QRMaskPattern.PATTERN011:
        return function(i, j) {
          return (i + j) % 3 == 0;
        };
      case QRMaskPattern.PATTERN100:
        return function(i, j) {
          return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
        };
      case QRMaskPattern.PATTERN101:
        return function(i, j) {
          return i * j % 2 + i * j % 3 == 0;
        };
      case QRMaskPattern.PATTERN110:
        return function(i, j) {
          return (i * j % 2 + i * j % 3) % 2 == 0;
        };
      case QRMaskPattern.PATTERN111:
        return function(i, j) {
          return (i * j % 3 + (i + j) % 2) % 2 == 0;
        };
      default:
        throw "bad maskPattern:" + maskPattern;
    }
  };
  _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
    let a = qrPolynomial([1], 0);
    for (let i = 0; i < errorCorrectLength; i += 1) {
      a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0));
    }
    return a;
  };
  _this.getLengthInBits = function(mode, type) {
    if (1 <= type && type < 10) {
      switch (mode) {
        case QRMode.MODE_NUMBER:
          return 10;
        case QRMode.MODE_ALPHA_NUM:
          return 9;
        case QRMode.MODE_8BIT_BYTE:
          return 8;
        case QRMode.MODE_KANJI:
          return 8;
        default:
          throw "mode:" + mode;
      }
    } else if (type < 27) {
      switch (mode) {
        case QRMode.MODE_NUMBER:
          return 12;
        case QRMode.MODE_ALPHA_NUM:
          return 11;
        case QRMode.MODE_8BIT_BYTE:
          return 16;
        case QRMode.MODE_KANJI:
          return 10;
        default:
          throw "mode:" + mode;
      }
    } else if (type < 41) {
      switch (mode) {
        case QRMode.MODE_NUMBER:
          return 14;
        case QRMode.MODE_ALPHA_NUM:
          return 13;
        case QRMode.MODE_8BIT_BYTE:
          return 16;
        case QRMode.MODE_KANJI:
          return 12;
        default:
          throw "mode:" + mode;
      }
    } else {
      throw "type:" + type;
    }
  };
  _this.getLostPoint = function(qrcode2) {
    const moduleCount = qrcode2.getModuleCount();
    let lostPoint = 0;
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        let sameCount = 0;
        const dark = qrcode2.isDark(row, col);
        for (let r = -1; r <= 1; r += 1) {
          if (row + r < 0 || moduleCount <= row + r) {
            continue;
          }
          for (let c = -1; c <= 1; c += 1) {
            if (col + c < 0 || moduleCount <= col + c) {
              continue;
            }
            if (r == 0 && c == 0) {
              continue;
            }
            if (dark == qrcode2.isDark(row + r, col + c)) {
              sameCount += 1;
            }
          }
        }
        if (sameCount > 5) {
          lostPoint += 3 + sameCount - 5;
        }
      }
    }
    ;
    for (let row = 0; row < moduleCount - 1; row += 1) {
      for (let col = 0; col < moduleCount - 1; col += 1) {
        let count = 0;
        if (qrcode2.isDark(row, col)) count += 1;
        if (qrcode2.isDark(row + 1, col)) count += 1;
        if (qrcode2.isDark(row, col + 1)) count += 1;
        if (qrcode2.isDark(row + 1, col + 1)) count += 1;
        if (count == 0 || count == 4) {
          lostPoint += 3;
        }
      }
    }
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount - 6; col += 1) {
        if (qrcode2.isDark(row, col) && !qrcode2.isDark(row, col + 1) && qrcode2.isDark(row, col + 2) && qrcode2.isDark(row, col + 3) && qrcode2.isDark(row, col + 4) && !qrcode2.isDark(row, col + 5) && qrcode2.isDark(row, col + 6)) {
          lostPoint += 40;
        }
      }
    }
    for (let col = 0; col < moduleCount; col += 1) {
      for (let row = 0; row < moduleCount - 6; row += 1) {
        if (qrcode2.isDark(row, col) && !qrcode2.isDark(row + 1, col) && qrcode2.isDark(row + 2, col) && qrcode2.isDark(row + 3, col) && qrcode2.isDark(row + 4, col) && !qrcode2.isDark(row + 5, col) && qrcode2.isDark(row + 6, col)) {
          lostPoint += 40;
        }
      }
    }
    let darkCount = 0;
    for (let col = 0; col < moduleCount; col += 1) {
      for (let row = 0; row < moduleCount; row += 1) {
        if (qrcode2.isDark(row, col)) {
          darkCount += 1;
        }
      }
    }
    const ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
    lostPoint += ratio * 10;
    return lostPoint;
  };
  return _this;
})();
var QRMath = (function() {
  const EXP_TABLE = new Array(256);
  const LOG_TABLE = new Array(256);
  for (let i = 0; i < 8; i += 1) {
    EXP_TABLE[i] = 1 << i;
  }
  for (let i = 8; i < 256; i += 1) {
    EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
  }
  for (let i = 0; i < 255; i += 1) {
    LOG_TABLE[EXP_TABLE[i]] = i;
  }
  const _this = {};
  _this.glog = function(n) {
    if (n < 1) {
      throw "glog(" + n + ")";
    }
    return LOG_TABLE[n];
  };
  _this.gexp = function(n) {
    while (n < 0) {
      n += 255;
    }
    while (n >= 256) {
      n -= 255;
    }
    return EXP_TABLE[n];
  };
  return _this;
})();
var qrPolynomial = /* @__PURE__ */ __name(function(num, shift) {
  if (typeof num.length == "undefined") {
    throw num.length + "/" + shift;
  }
  const _num = (function() {
    let offset = 0;
    while (offset < num.length && num[offset] == 0) {
      offset += 1;
    }
    const _num2 = new Array(num.length - offset + shift);
    for (let i = 0; i < num.length - offset; i += 1) {
      _num2[i] = num[i + offset];
    }
    return _num2;
  })();
  const _this = {};
  _this.getAt = function(index) {
    return _num[index];
  };
  _this.getLength = function() {
    return _num.length;
  };
  _this.multiply = function(e) {
    const num2 = new Array(_this.getLength() + e.getLength() - 1);
    for (let i = 0; i < _this.getLength(); i += 1) {
      for (let j = 0; j < e.getLength(); j += 1) {
        num2[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i)) + QRMath.glog(e.getAt(j)));
      }
    }
    return qrPolynomial(num2, 0);
  };
  _this.mod = function(e) {
    if (_this.getLength() - e.getLength() < 0) {
      return _this;
    }
    const ratio = QRMath.glog(_this.getAt(0)) - QRMath.glog(e.getAt(0));
    const num2 = new Array(_this.getLength());
    for (let i = 0; i < _this.getLength(); i += 1) {
      num2[i] = _this.getAt(i);
    }
    for (let i = 0; i < e.getLength(); i += 1) {
      num2[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
    }
    return qrPolynomial(num2, 0).mod(e);
  };
  return _this;
}, "qrPolynomial");
var QRRSBlock = (function() {
  const RS_BLOCK_TABLE = [
    // L
    // M
    // Q
    // H
    // 1
    [1, 26, 19],
    [1, 26, 16],
    [1, 26, 13],
    [1, 26, 9],
    // 2
    [1, 44, 34],
    [1, 44, 28],
    [1, 44, 22],
    [1, 44, 16],
    // 3
    [1, 70, 55],
    [1, 70, 44],
    [2, 35, 17],
    [2, 35, 13],
    // 4
    [1, 100, 80],
    [2, 50, 32],
    [2, 50, 24],
    [4, 25, 9],
    // 5
    [1, 134, 108],
    [2, 67, 43],
    [2, 33, 15, 2, 34, 16],
    [2, 33, 11, 2, 34, 12],
    // 6
    [2, 86, 68],
    [4, 43, 27],
    [4, 43, 19],
    [4, 43, 15],
    // 7
    [2, 98, 78],
    [4, 49, 31],
    [2, 32, 14, 4, 33, 15],
    [4, 39, 13, 1, 40, 14],
    // 8
    [2, 121, 97],
    [2, 60, 38, 2, 61, 39],
    [4, 40, 18, 2, 41, 19],
    [4, 40, 14, 2, 41, 15],
    // 9
    [2, 146, 116],
    [3, 58, 36, 2, 59, 37],
    [4, 36, 16, 4, 37, 17],
    [4, 36, 12, 4, 37, 13],
    // 10
    [2, 86, 68, 2, 87, 69],
    [4, 69, 43, 1, 70, 44],
    [6, 43, 19, 2, 44, 20],
    [6, 43, 15, 2, 44, 16],
    // 11
    [4, 101, 81],
    [1, 80, 50, 4, 81, 51],
    [4, 50, 22, 4, 51, 23],
    [3, 36, 12, 8, 37, 13],
    // 12
    [2, 116, 92, 2, 117, 93],
    [6, 58, 36, 2, 59, 37],
    [4, 46, 20, 6, 47, 21],
    [7, 42, 14, 4, 43, 15],
    // 13
    [4, 133, 107],
    [8, 59, 37, 1, 60, 38],
    [8, 44, 20, 4, 45, 21],
    [12, 33, 11, 4, 34, 12],
    // 14
    [3, 145, 115, 1, 146, 116],
    [4, 64, 40, 5, 65, 41],
    [11, 36, 16, 5, 37, 17],
    [11, 36, 12, 5, 37, 13],
    // 15
    [5, 109, 87, 1, 110, 88],
    [5, 65, 41, 5, 66, 42],
    [5, 54, 24, 7, 55, 25],
    [11, 36, 12, 7, 37, 13],
    // 16
    [5, 122, 98, 1, 123, 99],
    [7, 73, 45, 3, 74, 46],
    [15, 43, 19, 2, 44, 20],
    [3, 45, 15, 13, 46, 16],
    // 17
    [1, 135, 107, 5, 136, 108],
    [10, 74, 46, 1, 75, 47],
    [1, 50, 22, 15, 51, 23],
    [2, 42, 14, 17, 43, 15],
    // 18
    [5, 150, 120, 1, 151, 121],
    [9, 69, 43, 4, 70, 44],
    [17, 50, 22, 1, 51, 23],
    [2, 42, 14, 19, 43, 15],
    // 19
    [3, 141, 113, 4, 142, 114],
    [3, 70, 44, 11, 71, 45],
    [17, 47, 21, 4, 48, 22],
    [9, 39, 13, 16, 40, 14],
    // 20
    [3, 135, 107, 5, 136, 108],
    [3, 67, 41, 13, 68, 42],
    [15, 54, 24, 5, 55, 25],
    [15, 43, 15, 10, 44, 16],
    // 21
    [4, 144, 116, 4, 145, 117],
    [17, 68, 42],
    [17, 50, 22, 6, 51, 23],
    [19, 46, 16, 6, 47, 17],
    // 22
    [2, 139, 111, 7, 140, 112],
    [17, 74, 46],
    [7, 54, 24, 16, 55, 25],
    [34, 37, 13],
    // 23
    [4, 151, 121, 5, 152, 122],
    [4, 75, 47, 14, 76, 48],
    [11, 54, 24, 14, 55, 25],
    [16, 45, 15, 14, 46, 16],
    // 24
    [6, 147, 117, 4, 148, 118],
    [6, 73, 45, 14, 74, 46],
    [11, 54, 24, 16, 55, 25],
    [30, 46, 16, 2, 47, 17],
    // 25
    [8, 132, 106, 4, 133, 107],
    [8, 75, 47, 13, 76, 48],
    [7, 54, 24, 22, 55, 25],
    [22, 45, 15, 13, 46, 16],
    // 26
    [10, 142, 114, 2, 143, 115],
    [19, 74, 46, 4, 75, 47],
    [28, 50, 22, 6, 51, 23],
    [33, 46, 16, 4, 47, 17],
    // 27
    [8, 152, 122, 4, 153, 123],
    [22, 73, 45, 3, 74, 46],
    [8, 53, 23, 26, 54, 24],
    [12, 45, 15, 28, 46, 16],
    // 28
    [3, 147, 117, 10, 148, 118],
    [3, 73, 45, 23, 74, 46],
    [4, 54, 24, 31, 55, 25],
    [11, 45, 15, 31, 46, 16],
    // 29
    [7, 146, 116, 7, 147, 117],
    [21, 73, 45, 7, 74, 46],
    [1, 53, 23, 37, 54, 24],
    [19, 45, 15, 26, 46, 16],
    // 30
    [5, 145, 115, 10, 146, 116],
    [19, 75, 47, 10, 76, 48],
    [15, 54, 24, 25, 55, 25],
    [23, 45, 15, 25, 46, 16],
    // 31
    [13, 145, 115, 3, 146, 116],
    [2, 74, 46, 29, 75, 47],
    [42, 54, 24, 1, 55, 25],
    [23, 45, 15, 28, 46, 16],
    // 32
    [17, 145, 115],
    [10, 74, 46, 23, 75, 47],
    [10, 54, 24, 35, 55, 25],
    [19, 45, 15, 35, 46, 16],
    // 33
    [17, 145, 115, 1, 146, 116],
    [14, 74, 46, 21, 75, 47],
    [29, 54, 24, 19, 55, 25],
    [11, 45, 15, 46, 46, 16],
    // 34
    [13, 145, 115, 6, 146, 116],
    [14, 74, 46, 23, 75, 47],
    [44, 54, 24, 7, 55, 25],
    [59, 46, 16, 1, 47, 17],
    // 35
    [12, 151, 121, 7, 152, 122],
    [12, 75, 47, 26, 76, 48],
    [39, 54, 24, 14, 55, 25],
    [22, 45, 15, 41, 46, 16],
    // 36
    [6, 151, 121, 14, 152, 122],
    [6, 75, 47, 34, 76, 48],
    [46, 54, 24, 10, 55, 25],
    [2, 45, 15, 64, 46, 16],
    // 37
    [17, 152, 122, 4, 153, 123],
    [29, 74, 46, 14, 75, 47],
    [49, 54, 24, 10, 55, 25],
    [24, 45, 15, 46, 46, 16],
    // 38
    [4, 152, 122, 18, 153, 123],
    [13, 74, 46, 32, 75, 47],
    [48, 54, 24, 14, 55, 25],
    [42, 45, 15, 32, 46, 16],
    // 39
    [20, 147, 117, 4, 148, 118],
    [40, 75, 47, 7, 76, 48],
    [43, 54, 24, 22, 55, 25],
    [10, 45, 15, 67, 46, 16],
    // 40
    [19, 148, 118, 6, 149, 119],
    [18, 75, 47, 31, 76, 48],
    [34, 54, 24, 34, 55, 25],
    [20, 45, 15, 61, 46, 16]
  ];
  const qrRSBlock = /* @__PURE__ */ __name(function(totalCount, dataCount) {
    const _this2 = {};
    _this2.totalCount = totalCount;
    _this2.dataCount = dataCount;
    return _this2;
  }, "qrRSBlock");
  const _this = {};
  const getRsBlockTable = /* @__PURE__ */ __name(function(typeNumber, errorCorrectionLevel) {
    switch (errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L:
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M:
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q:
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H:
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default:
        return void 0;
    }
  }, "getRsBlockTable");
  _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
    const rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);
    if (typeof rsBlock == "undefined") {
      throw "bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel;
    }
    const length = rsBlock.length / 3;
    const list = [];
    for (let i = 0; i < length; i += 1) {
      const count = rsBlock[i * 3 + 0];
      const totalCount = rsBlock[i * 3 + 1];
      const dataCount = rsBlock[i * 3 + 2];
      for (let j = 0; j < count; j += 1) {
        list.push(qrRSBlock(totalCount, dataCount));
      }
    }
    return list;
  };
  return _this;
})();
var qrBitBuffer = /* @__PURE__ */ __name(function() {
  const _buffer = [];
  let _length = 0;
  const _this = {};
  _this.getBuffer = function() {
    return _buffer;
  };
  _this.getAt = function(index) {
    const bufIndex = Math.floor(index / 8);
    return (_buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
  };
  _this.put = function(num, length) {
    for (let i = 0; i < length; i += 1) {
      _this.putBit((num >>> length - i - 1 & 1) == 1);
    }
  };
  _this.getLengthInBits = function() {
    return _length;
  };
  _this.putBit = function(bit) {
    const bufIndex = Math.floor(_length / 8);
    if (_buffer.length <= bufIndex) {
      _buffer.push(0);
    }
    if (bit) {
      _buffer[bufIndex] |= 128 >>> _length % 8;
    }
    _length += 1;
  };
  return _this;
}, "qrBitBuffer");
var qrNumber = /* @__PURE__ */ __name(function(data) {
  const _mode = QRMode.MODE_NUMBER;
  const _data = data;
  const _this = {};
  _this.getMode = function() {
    return _mode;
  };
  _this.getLength = function(buffer) {
    return _data.length;
  };
  _this.write = function(buffer) {
    const data2 = _data;
    let i = 0;
    while (i + 2 < data2.length) {
      buffer.put(strToNum(data2.substring(i, i + 3)), 10);
      i += 3;
    }
    if (i < data2.length) {
      if (data2.length - i == 1) {
        buffer.put(strToNum(data2.substring(i, i + 1)), 4);
      } else if (data2.length - i == 2) {
        buffer.put(strToNum(data2.substring(i, i + 2)), 7);
      }
    }
  };
  const strToNum = /* @__PURE__ */ __name(function(s) {
    let num = 0;
    for (let i = 0; i < s.length; i += 1) {
      num = num * 10 + chatToNum(s.charAt(i));
    }
    return num;
  }, "strToNum");
  const chatToNum = /* @__PURE__ */ __name(function(c) {
    if ("0" <= c && c <= "9") {
      return c.charCodeAt(0) - "0".charCodeAt(0);
    }
    throw "illegal char :" + c;
  }, "chatToNum");
  return _this;
}, "qrNumber");
var qrAlphaNum = /* @__PURE__ */ __name(function(data) {
  const _mode = QRMode.MODE_ALPHA_NUM;
  const _data = data;
  const _this = {};
  _this.getMode = function() {
    return _mode;
  };
  _this.getLength = function(buffer) {
    return _data.length;
  };
  _this.write = function(buffer) {
    const s = _data;
    let i = 0;
    while (i + 1 < s.length) {
      buffer.put(
        getCode(s.charAt(i)) * 45 + getCode(s.charAt(i + 1)),
        11
      );
      i += 2;
    }
    if (i < s.length) {
      buffer.put(getCode(s.charAt(i)), 6);
    }
  };
  const getCode = /* @__PURE__ */ __name(function(c) {
    if ("0" <= c && c <= "9") {
      return c.charCodeAt(0) - "0".charCodeAt(0);
    } else if ("A" <= c && c <= "Z") {
      return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
    } else {
      switch (c) {
        case " ":
          return 36;
        case "$":
          return 37;
        case "%":
          return 38;
        case "*":
          return 39;
        case "+":
          return 40;
        case "-":
          return 41;
        case ".":
          return 42;
        case "/":
          return 43;
        case ":":
          return 44;
        default:
          throw "illegal char :" + c;
      }
    }
  }, "getCode");
  return _this;
}, "qrAlphaNum");
var qr8BitByte = /* @__PURE__ */ __name(function(data) {
  const _mode = QRMode.MODE_8BIT_BYTE;
  const _data = data;
  const _bytes = qrcode.stringToBytes(data);
  const _this = {};
  _this.getMode = function() {
    return _mode;
  };
  _this.getLength = function(buffer) {
    return _bytes.length;
  };
  _this.write = function(buffer) {
    for (let i = 0; i < _bytes.length; i += 1) {
      buffer.put(_bytes[i], 8);
    }
  };
  return _this;
}, "qr8BitByte");
var qrKanji = /* @__PURE__ */ __name(function(data) {
  const _mode = QRMode.MODE_KANJI;
  const _data = data;
  const stringToBytes2 = qrcode.stringToBytes;
  !(function(c, code) {
    const test = stringToBytes2(c);
    if (test.length != 2 || (test[0] << 8 | test[1]) != code) {
      throw "sjis not supported.";
    }
  })("\u53CB", 38726);
  const _bytes = stringToBytes2(data);
  const _this = {};
  _this.getMode = function() {
    return _mode;
  };
  _this.getLength = function(buffer) {
    return ~~(_bytes.length / 2);
  };
  _this.write = function(buffer) {
    const data2 = _bytes;
    let i = 0;
    while (i + 1 < data2.length) {
      let c = (255 & data2[i]) << 8 | 255 & data2[i + 1];
      if (33088 <= c && c <= 40956) {
        c -= 33088;
      } else if (57408 <= c && c <= 60351) {
        c -= 49472;
      } else {
        throw "illegal char at " + (i + 1) + "/" + c;
      }
      c = (c >>> 8 & 255) * 192 + (c & 255);
      buffer.put(c, 13);
      i += 2;
    }
    if (i < data2.length) {
      throw "illegal char at " + (i + 1);
    }
  };
  return _this;
}, "qrKanji");
var byteArrayOutputStream = /* @__PURE__ */ __name(function() {
  const _bytes = [];
  const _this = {};
  _this.writeByte = function(b) {
    _bytes.push(b & 255);
  };
  _this.writeShort = function(i) {
    _this.writeByte(i);
    _this.writeByte(i >>> 8);
  };
  _this.writeBytes = function(b, off, len) {
    off = off || 0;
    len = len || b.length;
    for (let i = 0; i < len; i += 1) {
      _this.writeByte(b[i + off]);
    }
  };
  _this.writeString = function(s) {
    for (let i = 0; i < s.length; i += 1) {
      _this.writeByte(s.charCodeAt(i));
    }
  };
  _this.toByteArray = function() {
    return _bytes;
  };
  _this.toString = function() {
    let s = "";
    s += "[";
    for (let i = 0; i < _bytes.length; i += 1) {
      if (i > 0) {
        s += ",";
      }
      s += _bytes[i];
    }
    s += "]";
    return s;
  };
  return _this;
}, "byteArrayOutputStream");
var base64EncodeOutputStream = /* @__PURE__ */ __name(function() {
  let _buffer = 0;
  let _buflen = 0;
  let _length = 0;
  let _base64 = "";
  const _this = {};
  const writeEncoded = /* @__PURE__ */ __name(function(b) {
    _base64 += String.fromCharCode(encode(b & 63));
  }, "writeEncoded");
  const encode = /* @__PURE__ */ __name(function(n) {
    if (n < 0) {
      throw "n:" + n;
    } else if (n < 26) {
      return 65 + n;
    } else if (n < 52) {
      return 97 + (n - 26);
    } else if (n < 62) {
      return 48 + (n - 52);
    } else if (n == 62) {
      return 43;
    } else if (n == 63) {
      return 47;
    } else {
      throw "n:" + n;
    }
  }, "encode");
  _this.writeByte = function(n) {
    _buffer = _buffer << 8 | n & 255;
    _buflen += 8;
    _length += 1;
    while (_buflen >= 6) {
      writeEncoded(_buffer >>> _buflen - 6);
      _buflen -= 6;
    }
  };
  _this.flush = function() {
    if (_buflen > 0) {
      writeEncoded(_buffer << 6 - _buflen);
      _buffer = 0;
      _buflen = 0;
    }
    if (_length % 3 != 0) {
      const padlen = 3 - _length % 3;
      for (let i = 0; i < padlen; i += 1) {
        _base64 += "=";
      }
    }
  };
  _this.toString = function() {
    return _base64;
  };
  return _this;
}, "base64EncodeOutputStream");
var base64DecodeInputStream = /* @__PURE__ */ __name(function(str) {
  const _str = str;
  let _pos = 0;
  let _buffer = 0;
  let _buflen = 0;
  const _this = {};
  _this.read = function() {
    while (_buflen < 8) {
      if (_pos >= _str.length) {
        if (_buflen == 0) {
          return -1;
        }
        throw "unexpected end of file./" + _buflen;
      }
      const c = _str.charAt(_pos);
      _pos += 1;
      if (c == "=") {
        _buflen = 0;
        return -1;
      } else if (c.match(/^\s$/)) {
        continue;
      }
      _buffer = _buffer << 6 | decode(c.charCodeAt(0));
      _buflen += 6;
    }
    const n = _buffer >>> _buflen - 8 & 255;
    _buflen -= 8;
    return n;
  };
  const decode = /* @__PURE__ */ __name(function(c) {
    if (65 <= c && c <= 90) {
      return c - 65;
    } else if (97 <= c && c <= 122) {
      return c - 97 + 26;
    } else if (48 <= c && c <= 57) {
      return c - 48 + 52;
    } else if (c == 43) {
      return 62;
    } else if (c == 47) {
      return 63;
    } else {
      throw "c:" + c;
    }
  }, "decode");
  return _this;
}, "base64DecodeInputStream");
var gifImage = /* @__PURE__ */ __name(function(width, height) {
  const _width = width;
  const _height = height;
  const _data = new Array(width * height);
  const _this = {};
  _this.setPixel = function(x, y, pixel) {
    _data[y * _width + x] = pixel;
  };
  _this.write = function(out) {
    out.writeString("GIF87a");
    out.writeShort(_width);
    out.writeShort(_height);
    out.writeByte(128);
    out.writeByte(0);
    out.writeByte(0);
    out.writeByte(0);
    out.writeByte(0);
    out.writeByte(0);
    out.writeByte(255);
    out.writeByte(255);
    out.writeByte(255);
    out.writeString(",");
    out.writeShort(0);
    out.writeShort(0);
    out.writeShort(_width);
    out.writeShort(_height);
    out.writeByte(0);
    const lzwMinCodeSize = 2;
    const raster = getLZWRaster(lzwMinCodeSize);
    out.writeByte(lzwMinCodeSize);
    let offset = 0;
    while (raster.length - offset > 255) {
      out.writeByte(255);
      out.writeBytes(raster, offset, 255);
      offset += 255;
    }
    out.writeByte(raster.length - offset);
    out.writeBytes(raster, offset, raster.length - offset);
    out.writeByte(0);
    out.writeString(";");
  };
  const bitOutputStream = /* @__PURE__ */ __name(function(out) {
    const _out = out;
    let _bitLength = 0;
    let _bitBuffer = 0;
    const _this2 = {};
    _this2.write = function(data, length) {
      if (data >>> length != 0) {
        throw "length over";
      }
      while (_bitLength + length >= 8) {
        _out.writeByte(255 & (data << _bitLength | _bitBuffer));
        length -= 8 - _bitLength;
        data >>>= 8 - _bitLength;
        _bitBuffer = 0;
        _bitLength = 0;
      }
      _bitBuffer = data << _bitLength | _bitBuffer;
      _bitLength = _bitLength + length;
    };
    _this2.flush = function() {
      if (_bitLength > 0) {
        _out.writeByte(_bitBuffer);
      }
    };
    return _this2;
  }, "bitOutputStream");
  const getLZWRaster = /* @__PURE__ */ __name(function(lzwMinCodeSize) {
    const clearCode = 1 << lzwMinCodeSize;
    const endCode = (1 << lzwMinCodeSize) + 1;
    let bitLength = lzwMinCodeSize + 1;
    const table = lzwTable();
    for (let i = 0; i < clearCode; i += 1) {
      table.add(String.fromCharCode(i));
    }
    table.add(String.fromCharCode(clearCode));
    table.add(String.fromCharCode(endCode));
    const byteOut = byteArrayOutputStream();
    const bitOut = bitOutputStream(byteOut);
    bitOut.write(clearCode, bitLength);
    let dataIndex = 0;
    let s = String.fromCharCode(_data[dataIndex]);
    dataIndex += 1;
    while (dataIndex < _data.length) {
      const c = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;
      if (table.contains(s + c)) {
        s = s + c;
      } else {
        bitOut.write(table.indexOf(s), bitLength);
        if (table.size() < 4095) {
          if (table.size() == 1 << bitLength) {
            bitLength += 1;
          }
          table.add(s + c);
        }
        s = c;
      }
    }
    bitOut.write(table.indexOf(s), bitLength);
    bitOut.write(endCode, bitLength);
    bitOut.flush();
    return byteOut.toByteArray();
  }, "getLZWRaster");
  const lzwTable = /* @__PURE__ */ __name(function() {
    const _map = {};
    let _size = 0;
    const _this2 = {};
    _this2.add = function(key) {
      if (_this2.contains(key)) {
        throw "dup key:" + key;
      }
      _map[key] = _size;
      _size += 1;
    };
    _this2.size = function() {
      return _size;
    };
    _this2.indexOf = function(key) {
      return _map[key];
    };
    _this2.contains = function(key) {
      return typeof _map[key] != "undefined";
    };
    return _this2;
  }, "lzwTable");
  return _this;
}, "gifImage");
var createDataURL = /* @__PURE__ */ __name(function(width, height, getPixel) {
  const gif = gifImage(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      gif.setPixel(x, y, getPixel(x, y));
    }
  }
  const b = byteArrayOutputStream();
  gif.write(b);
  const base64 = base64EncodeOutputStream();
  const bytes = b.toByteArray();
  for (let i = 0; i < bytes.length; i += 1) {
    base64.writeByte(bytes[i]);
  }
  base64.flush();
  return "data:image/gif;base64," + base64;
}, "createDataURL");
var qrcode_default = qrcode;
var stringToBytes = qrcode.stringToBytes;

// src/http.js
function allowedOrigins(env) {
  return String(env && env.ALLOW_ORIGIN || "*").split(",").map((s) => s.trim()).filter(Boolean);
}
__name(allowedOrigins, "allowedOrigins");
function corsHeaders(env, request) {
  const list = allowedOrigins(env);
  const origin = request ? request.headers.get("Origin") || "" : "";
  let allow = "*";
  if (list.length && !list.includes("*")) {
    allow = origin && list.includes(origin) ? origin : list[0];
  }
  const h = {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-AI-Key, X-Requested-With, X-Bili-Cookie, Range, X-N26-Token, X-N26-Admin",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type, X-Cache, X-Upstream-Status, ETag, X-Content-SHA256, Content-Disposition, Retry-After",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
  if (allow !== "*") h["Access-Control-Allow-Credentials"] = "true";
  return h;
}
__name(corsHeaders, "corsHeaders");
function json5(data, status = 200, env, request, extra = {}) {
  const headers = Object.assign(
    { "Content-Type": "application/json; charset=utf-8" },
    corsHeaders(env, request),
    extra
  );
  return new Response(JSON.stringify({ ok: true, code: 0, data }), { status, headers });
}
__name(json5, "json");
function fail(code, error, status = 502, env, request, extra = {}, upstream) {
  const body = { ok: false, code, error };
  if (upstream !== void 0) body.upstream = upstream;
  const headers = Object.assign(
    { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    corsHeaders(env, request),
    extra
  );
  return new Response(JSON.stringify(body), { status, headers });
}
__name(fail, "fail");
async function fetchTimeout(url, init, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, Object.assign({}, init || {}, { signal: ctl.signal }));
  } finally {
    clearTimeout(timer);
  }
}
__name(fetchTimeout, "fetchTimeout");
function cacheHeader(maxAge) {
  return { "Cache-Control": "public, max-age=" + Math.max(0, maxAge) };
}
__name(cacheHeader, "cacheHeader");
async function kvGet3(env, key) {
  const ns = env.BILI_KV || env.MUSIC_KV || env.STORE_KV;
  if (!ns) return null;
  try {
    const raw = await ns.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
__name(kvGet3, "kvGet");
async function kvPut3(env, key, value, ttl) {
  const ns = env.BILI_KV || env.MUSIC_KV || env.STORE_KV;
  if (!ns) return;
  try {
    await ns.put(key, JSON.stringify(value), ttl ? { expirationTtl: ttl } : void 0);
  } catch (e) {
  }
}
__name(kvPut3, "kvPut");
async function readUpstream(res) {
  let text = "";
  try {
    text = await res.text();
  } catch (e) {
  }
  let jsonBody = null;
  try {
    jsonBody = JSON.parse(text);
  } catch (e) {
  }
  return { status: res.status, json: jsonBody, text };
}
__name(readUpstream, "readUpstream");

// src/bili.js
var API = "https://api.bilibili.com";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
var TTL = { feed: 300, search: 600, video: 600, play: 300, related: 600 };
var API_TIMEOUT = 12e3;
var PLAY_TIMEOUT = 15e3;
var S_SHIFT = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
var K_TABLE = (() => {
  const k = new Int32Array(64);
  for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  return k;
})();
function rotl(x, c) {
  return x << c | x >>> 32 - c;
}
__name(rotl, "rotl");
function md5(str) {
  const bytes = new TextEncoder().encode(String(str));
  const len = bytes.length;
  const words = new Int32Array(((len + 8 >> 6) + 1) * 16);
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << i % 4 * 8;
  words[len >> 2] |= 128 << len % 4 * 8;
  const bits = len * 8;
  words[words.length - 2] = bits >>> 0;
  words[words.length - 1] = Math.floor(bits / 4294967296);
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < words.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d;
    for (let j = 0; j < 64; j++) {
      let f, g, s;
      if (j < 16) {
        f = b & c | ~b & d;
        g = j;
        s = S_SHIFT[j % 4];
      } else if (j < 32) {
        f = d & b | ~d & c;
        g = (5 * j + 1) % 16;
        s = S_SHIFT[4 + j % 4];
      } else if (j < 48) {
        f = b ^ c ^ d;
        g = (3 * j + 5) % 16;
        s = S_SHIFT[8 + j % 4];
      } else {
        f = c ^ (b | ~d);
        g = 7 * j % 16;
        s = S_SHIFT[12 + j % 4];
      }
      const tmp = d;
      d = c;
      c = b;
      b = b + rotl(a + f + K_TABLE[j] + words[i + g] | 0, s) | 0;
      a = tmp;
    }
    a = a + oa | 0;
    b = b + ob | 0;
    c = c + oc | 0;
    d = d + od | 0;
  }
  return [a, b, c, d].map((n) => {
    let hex2 = "";
    for (let i = 0; i < 4; i++) hex2 += (n >> i * 8 & 255).toString(16).padStart(2, "0");
    return hex2;
  }).join("");
}
__name(md5, "md5");
var MIXIN_TAB = [
  46,
  47,
  18,
  2,
  53,
  8,
  23,
  32,
  15,
  50,
  10,
  31,
  58,
  3,
  45,
  35,
  27,
  43,
  5,
  49,
  33,
  9,
  42,
  19,
  29,
  28,
  14,
  39,
  12,
  38,
  41,
  13,
  37,
  48,
  7,
  16,
  24,
  55,
  40,
  61,
  26,
  17,
  0,
  1,
  60,
  51,
  30,
  4,
  22,
  25,
  54,
  21,
  56,
  59,
  6,
  63,
  57,
  62,
  11,
  36,
  20,
  34,
  44,
  52
];
var MEM_WBI = null;
var MEM_BUVID = null;
async function getWbiKeys(env, force) {
  if (!force && MEM_WBI && Date.now() - MEM_WBI.ts < 6 * 3600 * 1e3) return MEM_WBI;
  if (!force) {
    const cached = await kvGet3(env, "bili:wbi");
    if (cached && cached.img && cached.sub) {
      MEM_WBI = { img: cached.img, sub: cached.sub, ts: cached.ts || Date.now() };
      return MEM_WBI;
    }
  }
  const rm = relayMode(env);
  const urls = [];
  if (rm.on) urls.push(rm.base + "/x/web-interface/nav?" + qs(RELAY_PARAMS));
  urls.push(API + "/x/web-interface/nav");
  for (const u of urls) {
    try {
      const res = await fetchTimeout(
        u,
        { headers: u.includes("translate.goog") ? { "User-Agent": UA } : baseHeaders(await getCookie(env)) },
        API_TIMEOUT
      );
      const { json: body } = await readUpstream(res);
      const wi = body && body.data && body.data.wbi_img;
      if (!wi || !wi.img_url || !wi.sub_url) continue;
      const img = wi.img_url.split("/").pop().split(".")[0];
      const sub = wi.sub_url.split("/").pop().split(".")[0];
      MEM_WBI = { img, sub, ts: Date.now() };
      await kvPut3(env, "bili:wbi", MEM_WBI, 6 * 3600);
      return MEM_WBI;
    } catch (e) {
    }
  }
  return null;
}
__name(getWbiKeys, "getWbiKeys");
function wbiQuery(params, keys) {
  const raw = keys.img + keys.sub;
  const mixin = MIXIN_TAB.map((i) => raw[i] || "").join("").slice(0, 32);
  const all = Object.assign({}, params, { wts: Math.floor(Date.now() / 1e3) });
  const query = Object.keys(all).sort().map((k) => {
    const v = String(all[k]).replace(/[!'()*]/g, "");
    return encodeURIComponent(k) + "=" + encodeURIComponent(v);
  }).join("&");
  return query + "&w_rid=" + md5(query + mixin);
}
__name(wbiQuery, "wbiQuery");
function baseHeaders(cookie) {
  const h = {
    "User-Agent": UA,
    Referer: "https://www.bilibili.com/",
    Origin: "https://www.bilibili.com",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6"
  };
  if (cookie) h.Cookie = cookie;
  return h;
}
__name(baseHeaders, "baseHeaders");
async function getBuvid(env) {
  if (MEM_BUVID && Date.now() - MEM_BUVID.ts < 12 * 3600 * 1e3) return MEM_BUVID.cookie;
  const cached = await kvGet3(env, "bili:buvid");
  if (cached && cached.cookie) {
    MEM_BUVID = { cookie: cached.cookie, ts: cached.ts || Date.now() };
    return MEM_BUVID.cookie;
  }
  try {
    const res = await fetchTimeout(API + "/x/frontend/finger/spi", { headers: baseHeaders("") }, API_TIMEOUT);
    const { json: body } = await readUpstream(res);
    const d = body && body.data;
    if (!d || !d.b_3) return "";
    const cookie = "buvid3=" + d.b_3 + "; buvid4=" + (d.b_4 || "") + "; b_nut=" + Math.floor(Date.now() / 1e3) + "; buvid_fp=" + d.b_3;
    MEM_BUVID = { cookie, ts: Date.now() };
    await kvPut3(env, "bili:buvid", MEM_BUVID, 12 * 3600);
    return cookie;
  } catch (e) {
    return "";
  }
}
__name(getBuvid, "getBuvid");
async function getCookie(env, userCookie) {
  if (userCookie) return userCookie;
  if (env.BILI_COOKIE) return String(env.BILI_COOKIE);
  return await getBuvid(env);
}
__name(getCookie, "getCookie");
function qs(params) {
  return Object.keys(params).filter((k) => params[k] !== void 0 && params[k] !== null && params[k] !== "").map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(String(params[k]))).join("&");
}
__name(qs, "qs");
function mapError(status, body, note) {
  if (status === 412) {
    return {
      code: "BILI_412",
      status: 502,
      error: "B\u7AD9\u98CE\u63A7\u62E6\u622A\uFF08HTTP 412\uFF09\u3002\u5F53\u524D\u51FA\u53E3 IP \u88AB\u4E34\u65F6\u9650\u5236\uFF0C" + (note || "\u53EF\u914D\u7F6E\u670D\u52A1\u5668 Cookie\uFF08BILI_COOKIE\uFF09\u63D0\u5347\u6210\u529F\u7387\uFF0C\u6216\u7A0D\u540E\u91CD\u8BD5\u3002")
    };
  }
  if (body && typeof body.code === "number" && body.code !== 0) {
    const st = body.code === -404 ? 404 : body.code === -10403 ? 403 : 502;
    return { code: "BILI_" + body.code, status: st, error: body.message || "\u4E0A\u6E38\u8FD4\u56DE\u9519\u8BEF", upstream: body };
  }
  return { code: "BILI_UPSTREAM", status: 502, error: "\u4E0A\u6E38 HTTP " + status, upstream: body };
}
__name(mapError, "mapError");
var RELAY_BASE = "https://api-bilibili-com.translate.goog";
var RELAY_PARAMS = { _x_tr_sl: "auto", _x_tr_tl: "zh-CN", _x_tr_hl: "zh-CN" };
function relayMode(env) {
  const m = String(env && env.BILI_RELAY || "").toLowerCase();
  if (m === "direct" || m === "off") return { on: false, base: RELAY_BASE };
  if (/^https?:\/\//.test(m)) return { on: true, base: m.replace(/\/+$/, "") };
  return { on: true, base: RELAY_BASE };
}
__name(relayMode, "relayMode");
function buildTargets(env, path, query, withRelayParams) {
  const rm = relayMode(env);
  const extras = withRelayParams ? qs(RELAY_PARAMS) : "";
  const relayQuery = [query, extras].filter(Boolean).join("&");
  const out = [];
  if (rm.on) out.push({ url: rm.base + path + "?" + relayQuery, mode: "relay" });
  out.push({ url: API + path + (query ? "?" + query : ""), mode: "direct" });
  return out;
}
__name(buildTargets, "buildTargets");
async function biliGet(env, request, path, paramsIn, opt = {}) {
  const ttl = opt.ttl || 0;
  const userCookie = request.headers.get("X-Bili-Cookie") || "";
  const useCache = ttl > 0 && !userCookie;
  const key = "bili:v3:" + path + "?" + qs(paramsIn) + (opt.wbi ? "&wbi" : "");
  if (useCache) {
    const hit = await kvGet3(env, key);
    if (hit && hit.data) return { ok: true, body: hit.data, cached: true, via: hit.via || "kv" };
  }
  const params = Object.assign({}, paramsIn);
  const rm = relayMode(env);
  if (rm.on) Object.assign(params, RELAY_PARAMS);
  let query;
  if (opt.wbi) {
    const keys = await getWbiKeys(env, false);
    query = keys ? wbiQuery(params, keys) : qs(params);
  } else {
    query = qs(params);
  }
  const cookie = await getCookie(env, userCookie);
  const targets = buildTargets(env, path, query, false);
  let last = null;
  let relayErr = null;
  for (const t of targets) {
    const attempts = t.mode === "relay" ? 5 : 1;
    for (let i = 0; i < attempts; i++) {
      let res;
      try {
        const headers = t.mode === "relay" ? { "User-Agent": UA, Accept: "application/json, */*" } : baseHeaders(cookie);
        res = await fetchTimeout(t.url, { headers }, opt.timeout || API_TIMEOUT);
      } catch (e) {
        last = { code: "BILI_TIMEOUT", status: 504, error: "\u8FDE\u63A5\u4E0A\u6E38\u8D85\u65F6\uFF08" + t.mode + "\uFF09\uFF1A" + (e && e.message) };
        if (t.mode === "relay") relayErr = last;
        await new Promise((r) => setTimeout(r, 900 + i * 1400));
        continue;
      }
      const parsed = await readUpstream(res);
      if (!parsed.json) {
        last = {
          code: parsed.status === 429 ? "BILI_RELAY_LIMIT" : "BILI_NON_JSON",
          status: 502,
          error: "\u4E0A\u6E38\u8FD4\u56DE\u975E JSON\uFF08" + t.mode + " HTTP " + parsed.status + "\uFF09"
        };
        if (t.mode === "relay") relayErr = last;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 900 + i * 1400));
        continue;
      }
      if (parsed.status !== 200 || parsed.json.code !== 0 && parsed.json.code !== void 0) {
        last = mapError(parsed.status, parsed.json, t.mode === "relay" ? "" : "\u672A\u914D\u7F6E BILI_COOKIE \u65F6\u8F83\u5E38\u89C1\u3002");
        if (t.mode === "relay") relayErr = last;
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 900 + i * 1400));
        continue;
      }
      if (useCache) await kvPut3(env, key, { data: parsed.json, ts: Date.now(), via: t.mode }, ttl);
      return { ok: true, body: parsed.json, cached: false, via: t.mode, tries: i + 1 };
    }
  }
  return { ok: false, err: relayErr || last || { code: "BILI_UPSTREAM", status: 502, error: "\u4E0A\u6E38\u4E0D\u53EF\u7528" } };
}
__name(biliGet, "biliGet");
var stripTags = /* @__PURE__ */ __name((s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim(), "stripTags");
var httpsPic = /* @__PURE__ */ __name((u) => {
  let s = String(u || "");
  if (/^\/\//.test(s)) s = "https:" + s;
  return s.replace(/^http:\/\//i, "https://");
}, "httpsPic");
function normArchive(v) {
  const pic = httpsPic(v.pic || v.cover || "");
  return {
    bvid: v.bvid || "",
    aid: v.aid || v.id || 0,
    title: stripTags(v.title),
    cover: pic,
    author: v.owner && v.owner.name || v.author || "",
    mid: v.owner && v.owner.mid || v.mid || 0,
    view: v.stat && v.stat.view || v.play || 0,
    danmaku: v.stat && v.stat.danmaku || v.video_review || 0,
    duration: v.duration || 0,
    pubdate: v.pubdate || v.ctime || 0,
    tag: v.tname || ""
  };
}
__name(normArchive, "normArchive");
function relayBaseFor(env) {
  return relayMode(env).base;
}
__name(relayBaseFor, "relayBaseFor");
function extractState(html) {
  const marker = "__INITIAL_STATE__";
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const eq = html.indexOf("{", i);
  if (eq < 0) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let p = eq; p < html.length; p++) {
    const ch = html[p];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = p;
        break;
      }
    }
  }
  if (end < 0) return null;
  let raw = html.slice(eq, end + 1).replace(/:\s*undefined/g, ":null");
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
__name(extractState, "extractState");
async function fetchHtml(env, targetPath, params, hostBase) {
  const base = hostBase || relayBaseFor(env);
  const url = base + targetPath + "?" + qs(Object.assign({}, params, RELAY_PARAMS));
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetchTimeout(url, { headers: { "User-Agent": UA, Accept: "text/html" } }, 2e4);
      if (res.status === 200) return await res.text();
    } catch (e) {
    }
    await new Promise((r) => setTimeout(r, 900 + i * 1200));
  }
  return null;
}
__name(fetchHtml, "fetchHtml");
function normVideoData(d, bvid) {
  const pages = (Array.isArray(d.pages) ? d.pages : []).map((p) => ({
    cid: p.cid,
    page: p.page,
    part: stripTags(p.part),
    duration: p.duration || 0,
    width: p.dimension && p.dimension.width,
    height: p.dimension && p.dimension.height
  }));
  return {
    bvid: d.bvid || bvid,
    aid: d.aid,
    cid: d.cid,
    title: stripTags(d.title),
    cover: httpsPic(d.pic),
    author: { mid: d.owner && d.owner.mid, name: d.owner && d.owner.name || "", face: httpsPic(d.owner && d.owner.face) },
    desc: String(d.desc || ""),
    duration: d.duration || 0,
    pubdate: d.pubdate || 0,
    stat: d.stat || {},
    pages,
    url: "https://www.bilibili.com/video/" + (d.bvid || bvid)
  };
}
__name(normVideoData, "normVideoData");
function parseSearchHtml(html) {
  if (!html) return [];
  const bvSet = [];
  const seen = /* @__PURE__ */ new Set();
  const bvRe = /BV[0-9A-Za-z]{10}/g;
  let m;
  while (m = bvRe.exec(html)) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      bvSet.push({ bvid: m[0], i: m.index });
    }
  }
  const titles = [];
  const tRe = /class="bili-video-card__info--tit(?:\s[^"]*)?"([^>]*)>([\s\S]*?)<\/h3>/g;
  while (m = tRe.exec(html)) {
    const attrs = m[1] || "";
    const attrTitle = /title="([^"]*)"/.exec(attrs);
    titles.push({ title: stripTags(attrTitle ? attrTitle[1] : stripTags(m[2])), i: m.index });
  }
  const n = Math.min(bvSet.length, titles.length);
  const items = [];
  for (let k = 0; k < n; k++) {
    const t = titles[k];
    const seg = html.slice(Math.max(0, t.i - 2600), t.i);
    const after = html.slice(t.i, t.i + 900);
    const coverM = /bfs\/archive\/([A-Za-z0-9/._-]+?\.(?:jpg|png|webp))/i.exec(seg);
    const authorM = /class="bili-video-card__info--author"[^>]*>([^<]{1,40})/.exec(after);
    const durM = /class="bili-video-card__info--bottom"[^]*?([0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)/.exec(after);
    items.push({
      bvid: bvSet[k].bvid,
      aid: 0,
      title: t.title,
      cover: coverM ? "https://i0.hdslb.com/bfs/archive/" + coverM[1] : "",
      author: authorM ? stripTags(authorM[1]) : "",
      mid: 0,
      view: 0,
      danmaku: 0,
      duration: durM ? durM[1] : "",
      pubdate: 0,
      tag: ""
    });
  }
  return items.filter((v) => v.bvid && v.title);
}
__name(parseSearchHtml, "parseSearchHtml");
async function handleFeed(request, env, url, origin) {
  const page = Math.max(1, parseInt(url.searchParams.get("page") || url.searchParams.get("pn") || "1", 10) || 1);
  const ps = Math.min(40, Math.max(1, parseInt(url.searchParams.get("ps") || "20", 10) || 20));
  const params = {
    ps,
    fresh_type: 3,
    fresh_idx: page,
    fresh_idx_1h: page,
    brush: page,
    homepage_ver: 1,
    feed_version: "V8"
  };
  let r = await biliGet(env, request, "/x/web-interface/wbi/index/top/feed/rcmd", params, { wbi: true, ttl: TTL.feed });
  let source = "rcmd";
  if (!r.ok) {
    r = await biliGet(env, request, "/x/web-interface/popular", { ps, pn: page }, { ttl: TTL.feed });
    source = "popular";
  }
  if (!r.ok) return fail(r.err.code, r.err.error, r.err.status, env, request, {}, r.err.upstream);
  const d = r.body.data || {};
  const list = Array.isArray(d.item) ? d.item : Array.isArray(d.list) ? d.list : [];
  const items = list.map((v) => {
    const a = normArchive(v);
    if (!a.bvid && v.id) a.bvid = String(v.id);
    return a;
  }).filter((v) => v.bvid && v.title);
  return json5(
    { page, ps, source, hasMore: !!d.has_more, items },
    200,
    env,
    request,
    { "Cache-Control": "public, max-age=300", "X-Cache": r.cached ? "HIT" : "MISS", "X-Bili-Via": r.via || "kv" }
  );
}
__name(handleFeed, "handleFeed");
async function handleSearch(request, env, url, origin) {
  const keyword = String(url.searchParams.get("keyword") || url.searchParams.get("q") || "").trim();
  if (!keyword) return fail("BAD_REQUEST", "\u7F3A\u5C11 keyword \u53C2\u6570", 400, env, request);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || url.searchParams.get("pn") || "1", 10) || 1);
  const order = String(url.searchParams.get("order") || "");
  const params = { search_type: "video", keyword, page };
  if (order) params.order = order;
  let r = await biliGet(env, request, "/x/web-interface/wbi/search/type", params, { wbi: true, ttl: TTL.search });
  if (!r.ok) r = await biliGet(env, request, "/x/web-interface/search/type", params, { ttl: TTL.search });
  let items = [];
  let via = "";
  if (r.ok) {
    const d = r.body.data || {};
    items = (Array.isArray(d.result) ? d.result : []).map((v) => {
      const a = normArchive(v);
      if (v.pic && !/^https?:/.test(a.cover)) a.cover = httpsPic(v.pic);
      return a;
    }).filter((v) => v.bvid && v.title);
    via = r.via || "api";
  }
  if (items.length === 0) {
    const hk = "bili:v3:search_html:" + keyword;
    const hc = await kvGet3(env, hk);
    if (hc && hc.data && hc.data.length) {
      items = hc.data;
      via = "html-cache";
    } else {
      const html = await fetchHtml(env, "/all", { keyword }, "https://search-bilibili-com.translate.goog");
      const parsed = parseSearchHtml(html);
      if (parsed.length) {
        items = parsed;
        via = "html";
        await kvPut3(env, hk, { data: items, ts: Date.now() }, TTL.search);
      }
    }
  }
  if (items.length === 0 && !r.ok) return fail(r.err.code, r.err.error, r.err.status, env, request);
  return json5(
    {
      keyword,
      page,
      via,
      numResults: items.length,
      items
    },
    200,
    env,
    request,
    { "Cache-Control": "public, max-age=600", "X-Cache": r.cached ? "HIT" : "MISS", "X-Bili-Via": via }
  );
}
__name(handleSearch, "handleSearch");
async function handleVideo(request, env, url, origin) {
  const bvid = String(url.searchParams.get("bvid") || "").trim();
  const aid = String(url.searchParams.get("aid") || "").trim();
  if (!bvid && !aid) return fail("BAD_REQUEST", "\u7F3A\u5C11 bvid\uFF08\u6216 aid\uFF09\u53C2\u6570", 400, env, request);
  const params = bvid ? { bvid } : { aid };
  const key = "bili:v3:video:" + (bvid || "aid" + aid);
  const cached = await kvGet3(env, key);
  if (cached && cached.data) {
    return json5(cached.data, 200, env, request, { "Cache-Control": "public, max-age=600", "X-Cache": "HIT", "X-Bili-Via": "kv" });
  }
  let data = null, via = "";
  let err = null;
  if (bvid) {
    let r = await biliGet(env, request, "/x/web-interface/view", params, { ttl: TTL.video });
    if (!r.ok) r = await biliGet(env, request, "/x/web-interface/wbi/view", params, { wbi: true, ttl: TTL.video });
    if (r.ok) {
      data = normVideoData(r.body.data || {}, bvid);
      via = r.via || "api";
    } else {
      err = r.err;
    }
  }
  if ((!data || !data.cid) && bvid) {
    const html = await fetchHtml(env, "/video/" + bvid, {});
    const st = html ? extractState(html) : null;
    const vd = st && (st.videoData || st.video && st.video.videoData);
    if (vd) {
      data = normVideoData(vd, bvid);
      via = "html";
    }
  }
  if (!data) {
    const e = err || { code: "BILI_UPSTREAM", status: 502, error: "\u65E0\u6CD5\u83B7\u53D6\u89C6\u9891\u4FE1\u606F\uFF08API \u4E0E\u9875\u9762\u515C\u5E95\u5747\u5931\u8D25\uFF09" };
    return fail(e.code, e.error, e.status, env, request, {}, e.upstream);
  }
  await kvPut3(env, key, { data, ts: Date.now() }, TTL.video);
  return json5(data, 200, env, request, {
    "Cache-Control": "public, max-age=600",
    "X-Cache": "MISS",
    "X-Bili-Via": via
  });
}
__name(handleVideo, "handleVideo");
async function handlePlay(request, env, url, origin) {
  let bvid = String(url.searchParams.get("bvid") || "").trim();
  let cid = String(url.searchParams.get("cid") || "").trim();
  const qn = parseInt(url.searchParams.get("q") || url.searchParams.get("qn") || "64", 10) || 64;
  const aid = String(url.searchParams.get("aid") || "").trim();
  if (!bvid && !aid) return fail("BAD_REQUEST", "\u7F3A\u5C11 bvid\uFF08\u6216 aid\uFF09\u53C2\u6570", 400, env, request);
  if (!cid) {
    let got = null;
    if (bvid || aid) {
      const vr = await biliGet(env, request, "/x/web-interface/view", bvid ? { bvid } : { aid }, { ttl: TTL.video });
      if (vr.ok) got = vr.body.data || {};
    }
    if ((!got || !got.cid) && bvid) {
      const html = await fetchHtml(env, "/video/" + bvid, {});
      const st = html ? extractState(html) : null;
      const vd = st && (st.videoData || st.video && st.video.videoData);
      if (vd) got = vd;
    }
    if (!got) return fail("NO_CID", "\u65E0\u6CD5\u83B7\u53D6\u89C6\u9891 cid\uFF08\u89C6\u9891\u4FE1\u606F\u63A5\u53E3\u4E0E\u9875\u9762\u515C\u5E95\u5747\u5931\u8D25\uFF09", 502, env, request);
    bvid = bvid || got.bvid;
    cid = String(got.pages && got.pages[0] && got.pages[0].cid || got.cid || "");
    if (!cid) return fail("NO_CID", "\u65E0\u6CD5\u83B7\u53D6 cid", 502, env, request);
  }
  let r = await biliGet(env, request, "/x/player/wbi/playurl", { bvid, cid, qn, fnval: 1, fnver: 0, fourk: 1 }, {
    wbi: true,
    ttl: TTL.play,
    timeout: PLAY_TIMEOUT
  });
  if (!r.ok || !(r.body.data && Array.isArray(r.body.data.durl) && r.body.data.durl.length)) {
    r = await biliGet(env, request, "/x/player/playurl", { bvid, cid, qn, fnval: 1, fnver: 0, fourk: 1 }, {
      ttl: TTL.play,
      timeout: PLAY_TIMEOUT
    });
  }
  if (!r.ok || !(r.body.data && Array.isArray(r.body.data.durl) && r.body.data.durl.length)) {
    r = await biliGet(
      env,
      request,
      "/x/player/playurl",
      { bvid, cid, qn, fnval: 0, fnver: 0, platform: "html5", high_quality: 1, fourk: 1 },
      { ttl: TTL.play, timeout: PLAY_TIMEOUT }
    );
  }
  if (!r.ok) return fail(r.err.code, r.err.error, r.err.status, env, request, {}, r.err.upstream);
  const d = r.body.data || {};
  const qualities = (d.accept_quality || []).map((q, i) => ({
    id: q,
    label: (d.accept_description || [])[i] || String(q)
  }));
  const durl = (Array.isArray(d.durl) ? d.durl : []).map((u) => {
    const all = [u.url || "", ...u.backup_url || []].filter(Boolean);
    all.sort((a, b) => urlScore(b) - urlScore(a));
    const q = all.map((x) => "url=" + encodeURIComponent(x)).join("&");
    return {
      order: u.order,
      size: u.size || 0,
      length: u.length || 0,
      format: "mp4",
      url: all[0] || "",
      backup: all.slice(1),
      proxy: all.length && origin ? origin + "/api/bili/stream?" + q : ""
    };
  });
  const chosen = qualities.find((q) => q.id === (Number(d.quality) || qn)) || { id: d.quality || qn, label: "" };
  return json5(
    {
      bvid,
      cid: Number(cid),
      quality: chosen,
      accept: qualities,
      loginRequired: !durl.length,
      note: durl.length ? "" : "\u4E0A\u6E38\u672A\u8FD4\u56DE\u53EF\u76F4\u63A5\u64AD\u653E\u7684 MP4\uFF0C\u53EF\u80FD\u9700\u8981\u5728\u670D\u52A1\u5668\u914D\u7F6E BILI_COOKIE\uFF08SESSDATA\uFF09\u3002",
      durl
    },
    200,
    env,
    request,
    { "Cache-Control": "public, max-age=300", "X-Cache": r.cached ? "HIT" : "MISS", "X-Bili-Via": r.via || "kv" }
  );
}
__name(handlePlay, "handlePlay");
async function handleRelated(request, env, url, origin) {
  const bvid = String(url.searchParams.get("bvid") || "").trim();
  if (!bvid) return fail("BAD_REQUEST", "\u7F3A\u5C11 bvid \u53C2\u6570", 400, env, request);
  const r = await biliGet(env, request, "/x/web-interface/archive/related", { bvid }, { ttl: TTL.related });
  if (!r.ok) return fail(r.err.code, r.err.error, r.err.status, env, request, {}, r.err.upstream);
  const items = (Array.isArray(r.body.data) ? r.body.data : []).map(normArchive).filter((v) => v.bvid && v.title);
  return json5({ bvid, items }, 200, env, request, {
    "Cache-Control": "public, max-age=600",
    "X-Cache": r.cached ? "HIT" : "MISS",
    "X-Bili-Via": r.via || "kv"
  });
}
__name(handleRelated, "handleRelated");
var IMG_HOSTS = [/(^|\.)hdslb\.com$/i, /(^|\.)bilibili\.com$/i, /(^|\.)biliimg\.com$/i];
var MEDIA_HOSTS = [
  /(^|\.)bilivideo\.com$/i,
  /(^|\.)bilivideo\.cn$/i,
  /(^|\.)hdslb\.com$/i,
  /(^|\.)akamaized\.net$/i,
  /(^|\.)szbdyd\.com$/i,
  /(^|\.)bilibili\.com$/i,
  /(^|\.)com\.cn$/i
];
function urlScore(u) {
  try {
    const h = new URL(u).hostname;
    if (/akamaized\.net$/i.test(h)) return 20;
    if (/hdslb\.com$/i.test(h)) return 15;
    if (/bilivideo\.cn$/i.test(h)) return 10;
    if (/bilivideo\.com$/i.test(h)) return 5;
    return 1;
  } catch (e) {
    return 0;
  }
}
__name(urlScore, "urlScore");
function allowedHost(u, list) {
  try {
    const h = new URL(u).hostname;
    return list.some((re) => re.test(h));
  } catch (e) {
    return false;
  }
}
__name(allowedHost, "allowedHost");
async function handleImg(request, env, url) {
  const target = url.searchParams.get("url") || "";
  if (!target) return fail("BAD_REQUEST", "\u7F3A\u5C11 url \u53C2\u6570", 400, env, request);
  if (!/^https?:\/\//.test(target) || !allowedHost(target, IMG_HOSTS)) {
    return fail("BAD_TARGET", "\u4EC5\u5141\u8BB8 B\u7AD9\u56FE\u7247\u57DF\u540D", 400, env, request);
  }
  let res;
  try {
    res = await fetchTimeout(target, { headers: baseHeaders(await getCookie(env)) }, API_TIMEOUT);
  } catch (e) {
    return fail("UPSTREAM_TIMEOUT", "\u56FE\u7247\u4E0A\u6E38\u8D85\u65F6", 504, env, request);
  }
  if (!res.ok) return fail("UPSTREAM_HTTP", "\u56FE\u7247\u4E0A\u6E38 HTTP " + res.status, 502, env, request);
  const headers = Object.assign(corsHeaders(env, request), {
    "Content-Type": res.headers.get("Content-Type") || "image/jpeg",
    "Cache-Control": "public, max-age=86400, immutable",
    "X-Cache": "MISS"
  });
  return new Response(res.body, { status: 200, headers });
}
__name(handleImg, "handleImg");
async function handleStream(request, env, url) {
  const targets = url.searchParams.getAll("url").filter(Boolean);
  if (!targets.length) return fail("BAD_REQUEST", "\u7F3A\u5C11 url \u53C2\u6570", 400, env, request);
  if (targets.some((t) => !/^https?:\/\//.test(t) || !allowedHost(t, MEDIA_HOSTS))) {
    return fail("BAD_TARGET", "\u4EC5\u5141\u8BB8 B\u7AD9\u89C6\u9891 CDN \u57DF\u540D", 400, env, request);
  }
  const headers = baseHeaders(await getCookie(env));
  const range = request.headers.get("Range");
  if (range) headers.Range = range;
  let lastStatus = 0;
  const tried = [];
  for (const target of targets) {
    let res;
    try {
      res = await fetch(target, { headers, redirect: "follow" });
    } catch (e) {
      tried.push(new URL(target).hostname + ":timeout");
      lastStatus = 0;
      continue;
    }
    tried.push(new URL(target).hostname + ":" + res.status);
    if (!res.ok && res.status !== 206) {
      lastStatus = res.status;
      continue;
    }
    const out = Object.assign(corsHeaders(env, request), {
      "Content-Type": res.headers.get("Content-Type") || "video/mp4",
      "Accept-Ranges": res.headers.get("Accept-Ranges") || "bytes",
      "Cache-Control": "no-store",
      "X-Bili-Cdn": new URL(target).hostname
    });
    for (const name of ["Content-Length", "Content-Range", "Last-Modified", "ETag"]) {
      const v = res.headers.get(name);
      if (v) out[name] = v;
    }
    return new Response(res.body, { status: res.status, headers: out });
  }
  return fail(
    lastStatus ? "UPSTREAM_HTTP" : "UPSTREAM_TIMEOUT",
    "\u89C6\u9891\u4E0A\u6E38\u5168\u90E8\u5019\u9009\u4E0D\u53EF\u7528\uFF08" + tried.join(", ") + "\uFF09",
    502,
    env,
    request,
    {},
    { tried }
  );
}
__name(handleStream, "handleStream");
async function handleDiag(request, env, url) {
  const probe = url && url.searchParams.get("html");
  if (probe) {
    const html = await fetchHtml(env, "/all", { keyword: probe }, "https://search-bilibili-com.translate.goog");
    const idx = html ? html.indexOf("__INITIAL_STATE__") : -2;
    const cardIdx = html ? html.indexOf("/video/BV") : -1;
    const jsonBvidIdx = html ? html.indexOf('"bvid":"') : -1;
    const bvs = html ? html.match(/BV[0-9A-Za-z]{10}/g) || [] : [];
    const titles = html ? html.match(/bili-video-card__info--tit/g) || [] : [];
    return json5(
      {
        len: html ? html.length : 0,
        hasJsonBvid: jsonBvidIdx > 0,
        bvTotal: bvs.length,
        bvUnique: new Set(bvs).size,
        titleBlocks: titles.length,
        jsonSnippet: html && jsonBvidIdx > 0 ? html.slice(jsonBvidIdx - 200, jsonBvidIdx + 500) : "",
        cardSnippet: html && cardIdx > 0 ? html.slice(cardIdx - 120, cardIdx + 260) : ""
      },
      200,
      env,
      request,
      { "Cache-Control": "no-store" }
    );
  }
  const synthetic = (() => {
    const hex2 = "0123456789ABCDEF";
    const seg = /* @__PURE__ */ __name((n) => {
      let s = "";
      for (let i = 0; i < n; i++) s += hex2[Math.floor(Math.random() * 16)];
      return s;
    }, "seg");
    return seg(8) + "-" + seg(4) + "-" + seg(4) + "-" + seg(4) + "-" + seg(12) + "infoc";
  })();
  const ua = UA;
  const tests = [
    {
      name: "popular_plain",
      url: API + "/x/web-interface/popular?ps=3&pn=1",
      headers: { "User-Agent": ua, Referer: "https://www.bilibili.com/" }
    },
    {
      name: "popular_synthetic_buvid",
      url: API + "/x/web-interface/popular?ps=3&pn=1",
      headers: {
        "User-Agent": ua,
        Referer: "https://www.bilibili.com/",
        Cookie: "buvid3=" + synthetic + "; b_nut=" + Math.floor(Date.now() / 1e3) + "; buvid_fp=" + synthetic
      }
    },
    {
      name: "popular_no_referer",
      url: API + "/x/web-interface/popular?ps=3&pn=1",
      headers: { "User-Agent": ua }
    },
    {
      name: "nav",
      url: API + "/x/web-interface/nav",
      headers: { "User-Agent": ua, Referer: "https://www.bilibili.com/" }
    },
    {
      name: "view",
      url: API + "/x/web-interface/view?bvid=BV1GJ411x7h7",
      headers: { "User-Agent": ua, Referer: "https://www.bilibili.com/" }
    },
    {
      name: "www_video_html",
      url: "https://www.bilibili.com/video/BV1GJ411x7h7",
      headers: { "User-Agent": ua }
    },
    {
      name: "search_html",
      url: "https://search.bilibili.com/all?keyword=%E5%8E%9F%E7%A5%9E",
      headers: { "User-Agent": ua }
    },
    {
      name: "app_feed",
      url: "https://app.bilibili.com/x/v2/feed/index?build=8400&mobi_app=android&platform=android&ps=3",
      headers: { "User-Agent": ua }
    },
    {
      name: "img_cdn",
      url: "https://i0.hdslb.com/bfs/face/member/noface.jpg",
      headers: { "User-Agent": ua, Referer: "https://www.bilibili.com/" }
    },
    {
      name: "relay_allorigins",
      url: "https://api.allorigins.win/raw?url=" + encodeURIComponent(API + "/x/web-interface/popular?ps=3&pn=1"),
      headers: { "User-Agent": ua }
    },
    {
      name: "relay_jina",
      url: "https://r.jina.ai/" + API + "/x/web-interface/popular?ps=3&pn=1",
      headers: { "User-Agent": ua, "X-Return-Format": "text" }
    },
    {
      name: "relay_corslol",
      url: "https://api.cors.lol/?url=" + encodeURIComponent(API + "/x/web-interface/popular?ps=3&pn=1"),
      headers: { "User-Agent": ua }
    },
    {
      name: "relay_corsfix",
      url: "https://proxy.corsfix.com/?" + API + "/x/web-interface/popular?ps=3&pn=1",
      headers: { "User-Agent": ua }
    },
    {
      name: "relay_allorigins_get",
      url: "https://api.allorigins.win/get?url=" + encodeURIComponent(API + "/x/web-interface/popular?ps=3&pn=1"),
      headers: { "User-Agent": ua }
    },
    {
      name: "relay_codetabs",
      url: "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(API + "/x/web-interface/popular?ps=3&pn=1"),
      headers: { "User-Agent": ua }
    },
    {
      name: "relay_corsproxy",
      url: "https://corsproxy.io/?url=" + encodeURIComponent(API + "/x/web-interface/popular?ps=3&pn=1"),
      headers: { "User-Agent": ua }
    },
    {
      name: "relay_thingproxy",
      url: "https://thingproxy.freeboard.io/fetch/" + API + "/x/web-interface/popular?ps=3&pn=1",
      headers: { "User-Agent": ua }
    }
  ];
  const out = [];
  for (const t of tests) {
    try {
      const res = await fetchTimeout(t.url, { headers: t.headers }, 2e4);
      const text = (await res.text()).slice(0, 160);
      out.push({ name: t.name, status: res.status, body: text.replace(/\s+/g, " ") });
    } catch (e) {
      out.push({ name: t.name, status: 0, body: String(e && e.message || e) });
    }
  }
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetchTimeout(
        "https://r.jina.ai/" + API + "/x/web-interface/view?bvid=BV1GJ411x7h7",
        { headers: { "User-Agent": ua, "X-Return-Format": "text" } },
        25e3
      );
      const text = (await res.text()).slice(0, 200);
      out.push({ name: "jina_try" + i, status: res.status, body: text.replace(/\s+/g, " ") });
      if (res.status === 200) break;
    } catch (e) {
      out.push({ name: "jina_try" + i, status: 0, body: String(e && e.message || e) });
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  for (const t of [
    {
      name: "corsfix_with_origin",
      url: "https://proxy.corsfix.com/?https://api.bilibili.com/x/web-interface/popular?ps=3&pn=1",
      headers: { "User-Agent": ua, Origin: "https://www.bilibili.com" }
    },
    { name: "relay_injahow2", url: "https://api.injahow.cn/bparse/?av=BV1GJ411x7h7&p=1&q=80&otype=json", headers: { "User-Agent": ua } },
    { name: "relay_isogit", url: "https://cors.isomorphic-git.org/https://api.bilibili.com/x/web-interface/popular?ps=3&pn=1", headers: { "User-Agent": ua } },
    { name: "relay_whateverorigin", url: "https://whateverorigin.org/get?url=" + encodeURIComponent(API + "/x/web-interface/popular?ps=3&pn=1"), headers: { "User-Agent": ua } },
    { name: "relay_afeld", url: "https://jsonp.afeld.me/?url=" + encodeURIComponent(API + "/x/web-interface/popular?ps=3&pn=1"), headers: { "User-Agent": ua } },
    { name: "relay_yacdn", url: "https://yacdn.org/proxy/" + API + "/x/web-interface/popular?ps=3&pn=1", headers: { "User-Agent": ua } },
    {
      name: "gtranslate_auto",
      url: "https://api-bilibili-com.translate.goog/x/web-interface/popular?ps=3&pn=1&_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN",
      headers: { "User-Agent": ua }
    },
    { name: "host_api_live", url: "https://api.live.bilibili.com/xlive/web-interface/v1/index/getList?platform=web", headers: { "User-Agent": ua, Referer: "https://live.bilibili.com/" } },
    { name: "host_grpc", url: "https://grpc.biliapi.net/bilibili.app.view.v1.View/View", headers: { "User-Agent": ua } },
    { name: "relay_bilibili_tv", url: "https://api.bilibili.tv/intl/gateway/web/v2/search?keyword=naruto&page=1", headers: { "User-Agent": ua } },
    { name: "popular_xff", url: API + "/x/web-interface/popular?ps=3&pn=1", headers: { "User-Agent": ua, Referer: "https://www.bilibili.com/", "X-Forwarded-For": "223.5.5.5", "X-Real-IP": "223.5.5.5" } },
    { name: "relay_popular", url: "https://api-bilibili-com.translate.goog/x/web-interface/popular?ps=3&pn=1&_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN", headers: { "User-Agent": ua } },
    { name: "relay_view", url: "https://api-bilibili-com.translate.goog/x/web-interface/view?bvid=BV1GJ411x7h7&_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN", headers: { "User-Agent": ua } },
    { name: "relay_view_detail", url: "https://api-bilibili-com.translate.goog/x/web-interface/view/detail?bvid=BV1GJ411x7h7&_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN", headers: { "User-Agent": ua } },
    { name: "relay_related", url: "https://api-bilibili-com.translate.goog/x/web-interface/archive/related?bvid=BV1GJ411x7h7&_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN", headers: { "User-Agent": ua } },
    { name: "relay_nav", url: "https://api-bilibili-com.translate.goog/x/web-interface/nav?_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN", headers: { "User-Agent": ua } },
    { name: "relay_video_html", url: "https://www-bilibili-com.translate.goog/video/BV1GJ411x7h7?_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN", headers: { "User-Agent": ua } },
    { name: "relay_search_html2", url: "https://search-bilibili-com.translate.goog/all?keyword=%E7%8E%8B%E8%80%85%E8%8D%A3%E8%80%80&_x_tr_sl=auto&_x_tr_tl=zh-CN&_x_tr_hl=zh-CN", headers: { "User-Agent": ua } }
  ]) {
    try {
      const res = await fetchTimeout(t.url, { headers: t.headers }, 2e4);
      const text = await res.text();
      out.push({ name: t.name, status: res.status, body: text.slice(0, 300).replace(/\s+/g, " ") });
    } catch (e) {
      out.push({ name: t.name, status: 0, body: String(e && e.message || e) });
    }
  }
  try {
    const keys = await getWbiKeys(env, false);
    const q = keys ? wbiQuery(Object.assign({ search_type: "video", keyword: "\u738B\u8005\u8363\u8000", page: 1 }, RELAY_PARAMS), keys) : qs(Object.assign({ search_type: "video", keyword: "\u738B\u8005\u8363\u8000", page: 1 }, RELAY_PARAMS));
    const res = await fetchTimeout(relayBaseFor(env) + "/x/web-interface/wbi/search/type?" + q, { headers: { "User-Agent": ua } }, 2e4);
    const t = await res.text();
    out.push({ name: "search_signed", status: res.status, body: t.slice(0, 400).replace(/\s+/g, " ") });
  } catch (e) {
    out.push({ name: "search_signed", status: 0, body: String(e && e.message || e) });
  }
  return json5({ at: (/* @__PURE__ */ new Date()).toISOString(), synthetic, tests: out }, 200, env, request, { "Cache-Control": "no-store" });
}
__name(handleDiag, "handleDiag");
async function handleHealth(request, env) {
  const keys = await getWbiKeys(env, false);
  const cookie = await getCookie(env);
  return json5(
    {
      service: "nexus-bili-proxy",
      upstream: API,
      relay: relayMode(env).on ? relayMode(env).base : "direct",
      cookieMode: env.BILI_COOKIE ? "server" : cookie ? "buvid-auto" : "none",
      wbi: keys ? "ok" : "unavailable",
      endpoints: ["feed", "search", "video", "play", "related", "img", "stream", "login/qrcode", "login/poll", "login/me", "login/logout"],
      cache: TTL
    },
    200,
    env,
    request,
    { "Cache-Control": "no-store" }
  );
}
__name(handleHealth, "handleHealth");
var PASSPORT = "https://passport.bilibili.com";
var PASSPORT_RELAY = "https://passport-bilibili-com.translate.goog";
var LOGIN_TTL = 7 * 24 * 3600;
var COOKIE_KEYS = ["SESSDATA", "bili_jct", "DedeUserID", "DedeUserID__ckMd5"];
function randomToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
__name(randomToken, "randomToken");
async function passportGet(env, path, params) {
  const rm = relayMode(env);
  const plain = qs(params || {});
  const relayQuery = [plain, qs(RELAY_PARAMS)].filter(Boolean).join("&");
  const targets = [{ url: PASSPORT + path + "?" + plain, mode: "direct" }];
  if (rm.on) targets.push({ url: PASSPORT_RELAY + path + "?" + relayQuery, mode: "relay" });
  let last = null;
  for (const t of targets) {
    try {
      const res = await fetchTimeout(
        t.url,
        {
          headers: {
            "User-Agent": UA,
            Referer: "https://www.bilibili.com/",
            Accept: "application/json, */*",
            "Accept-Language": "zh-CN,zh;q=0.9"
          }
        },
        2e4
      );
      const text = await res.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch (e) {
      }
      let setCookies = [];
      try {
        setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      } catch (e) {
        setCookies = [];
      }
      if (res.status === 200 && body) return { ok: true, body, via: t.mode, setCookies };
      last = { status: res.status, mode: t.mode, text: text.slice(0, 100) };
    } catch (e) {
      last = { status: 0, mode: t.mode, text: e && e.message || "\u8FDE\u63A5\u5931\u8D25" };
    }
  }
  return { ok: false, err: last || { status: 0, mode: "none", text: "passport \u4E0D\u53EF\u7528" } };
}
__name(passportGet, "passportGet");
function pickLoginCookie(setCookies) {
  const out = {};
  (setCookies || []).forEach((line) => {
    COOKIE_KEYS.forEach((k) => {
      const m = new RegExp("(?:^|;\\s*)" + k + "=([^;]+)").exec(String(line));
      if (m && !out[k]) out[k] = decodeURIComponent(m[1]);
    });
  });
  return COOKIE_KEYS.map((k) => out[k] ? k + "=" + out[k] : "").filter(Boolean).join("; ");
}
__name(pickLoginCookie, "pickLoginCookie");
function cookieFromLoginUrl(u) {
  try {
    const q = new URL(String(u || "")).searchParams;
    const out = {};
    COOKIE_KEYS.forEach((k) => {
      const v = q.get(k);
      if (v) out[k] = v;
    });
    return COOKIE_KEYS.map((k) => out[k] ? k + "=" + out[k] : "").filter(Boolean).join("; ");
  } catch (e) {
    return "";
  }
}
__name(cookieFromLoginUrl, "cookieFromLoginUrl");
function midOfCookie(cookie) {
  const m = /(?:^|;\s*)DedeUserID=([^;]+)/.exec(String(cookie || ""));
  return m ? m[1] : "";
}
__name(midOfCookie, "midOfCookie");
function normProfile(c, fallbackMid) {
  c = c || {};
  return {
    mid: c.mid || Number(fallbackMid) || 0,
    name: c.name || "",
    face: httpsPic(c.face || ""),
    fans: Number(c.fans || 0),
    following: Number(c.attention || 0),
    level: c.level_info && c.level_info.current_level || 0,
    sign: c.sign || ""
  };
}
__name(normProfile, "normProfile");
async function profileFromCookie(env, request, cookie) {
  const mid = midOfCookie(cookie);
  if (!mid) return null;
  try {
    const r = await biliGet(env, request, "/x/web-interface/card", { mid, photo: "true" }, { ttl: 300, timeout: 2e4 });
    if (r.ok && r.body && r.body.code === 0 && r.body.data && r.body.data.card) {
      const p = normProfile(r.body.data.card, mid);
      try {
        const rel = await biliGet(env, request, "/x/relation/stat", { vmid: mid }, { ttl: 300, timeout: 15e3 });
        if (rel.ok && rel.body && rel.body.data) {
          p.fans = Number(rel.body.data.follower || p.fans);
          p.following = Number(rel.body.data.following || p.following);
        }
      } catch (e) {
      }
      return p;
    }
  } catch (e) {
  }
  try {
    const res = await fetchTimeout(API + "/x/web-interface/nav", { headers: baseHeaders(cookie) }, 15e3);
    const { json: body } = await readUpstream(res);
    if (body && body.code === 0 && body.data && body.data.isLogin) {
      return normProfile(
        {
          mid: body.data.mid,
          name: body.data.uname,
          face: body.data.face,
          fans: body.data.follower,
          attention: body.data.following,
          level_info: body.data.level_info,
          sign: body.data.sign
        },
        mid
      );
    }
  } catch (e) {
  }
  return { mid: Number(mid) || 0, name: "", face: "", fans: 0, following: 0, level: 0, sign: "" };
}
__name(profileFromCookie, "profileFromCookie");
function b64(buf) {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
__name(b64, "b64");
async function loginAesKey(env, token) {
  const secret = String(env && env.BILI_LOGIN_SECRET || "n26-bili-login-v1") + "|" + token;
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
__name(loginAesKey, "loginAesKey");
async function sealSession(env, token, cookie, profile) {
  const key = await loginAesKey(env, token);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc4 = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(cookie));
  return { v: 1, iv: b64(iv), c: b64(enc4), profile, at: Date.now() };
}
__name(sealSession, "sealSession");
async function kvDel(env, key) {
  try {
    if (env.BILI_KV) await env.BILI_KV.delete(key);
  } catch (e) {
  }
}
__name(kvDel, "kvDel");
async function handleLoginQrcode(request, env) {
  const r = await passportGet(env, "/x/passport-login/web/qrcode/generate", {});
  if (!r.ok) {
    return fail(
      "BILI_LOGIN_UPSTREAM",
      "\u4E8C\u7EF4\u7801\u751F\u6210\u5931\u8D25\uFF1Apassport " + (r.err.mode || "") + " HTTP " + (r.err.status || 0) + "\uFF08" + (r.err.text || "") + "\uFF09",
      502,
      env,
      request,
      { "Cache-Control": "no-store" },
      r.err
    );
  }
  const d = r.body && r.body.data;
  if (!d || !d.qrcode_key || !d.url) {
    return fail("BILI_LOGIN_UPSTREAM", "\u4E8C\u7EF4\u7801\u751F\u6210\u5931\u8D25\uFF1A\u4E0A\u6E38\u6CA1\u6709\u8FD4\u56DE qrcode_key", 502, env, request, { "Cache-Control": "no-store" }, r.body);
  }
  const token = randomToken();
  await kvPut3(env, "bili:login:qr:" + token, { key: d.qrcode_key, at: Date.now(), via: r.via }, 240);
  let svg = "";
  try {
    const qr = qrcode_default(0, "M");
    qr.addData(d.url);
    qr.make();
    svg = qr.createSvgTag({ cellSize: 3, margin: 3, scalable: true });
  } catch (e) {
  }
  return json5(
    { token, url: d.url, svg, expires_in: 180, via: r.via },
    200,
    env,
    request,
    { "Cache-Control": "no-store" }
  );
}
__name(handleLoginQrcode, "handleLoginQrcode");
async function handleLoginPoll(request, env, url) {
  const token = String(url.searchParams.get("token") || "");
  if (!/^[0-9a-f]{24,64}$/.test(token)) {
    return fail("BILI_LOGIN_TOKEN", "\u7F3A\u5C11\u6216\u975E\u6CD5\u7684\u767B\u5F55 token", 400, env, request, { "Cache-Control": "no-store" });
  }
  const rec = await kvGet3(env, "bili:login:qr:" + token);
  if (!rec || !rec.key) {
    return json5({ status: "expired", message: "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210" }, 200, env, request, { "Cache-Control": "no-store" });
  }
  const p = await passportGet(env, "/x/passport-login/web/qrcode/poll", { qrcode_key: rec.key, source: "main-fe-header" });
  if (!p.ok) {
    return fail(
      "BILI_LOGIN_POLL",
      "\u626B\u7801\u72B6\u6001\u67E5\u8BE2\u5931\u8D25\uFF1Apassport " + (p.err.mode || "") + " HTTP " + (p.err.status || 0),
      502,
      env,
      request,
      { "Cache-Control": "no-store" },
      p.err
    );
  }
  const d = p.body && p.body.data || {};
  const code = d.code;
  if (code === 86101) return json5({ status: "waiting", message: "\u7B49\u5F85\u626B\u7801" }, 200, env, request, { "Cache-Control": "no-store" });
  if (code === 86090) return json5({ status: "scanned", message: "\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u786E\u8BA4" }, 200, env, request, { "Cache-Control": "no-store" });
  if (code === 86038) {
    await kvDel(env, "bili:login:qr:" + token);
    return json5({ status: "expired", message: "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210" }, 200, env, request, { "Cache-Control": "no-store" });
  }
  if (code !== 0) {
    return json5({ status: "error", code, message: d.message || "\u672A\u77E5\u626B\u7801\u72B6\u6001" }, 200, env, request, { "Cache-Control": "no-store" });
  }
  const cookie = pickLoginCookie(p.setCookies) || cookieFromLoginUrl(d.url);
  if (!cookie) {
    return fail(
      "BILI_LOGIN_COOKIE",
      "B\u7AD9\u5DF2\u786E\u8BA4\u767B\u5F55\uFF0C\u4F46\u6CA1\u62FF\u5230 Cookie\uFF08\u4E0A\u6E38\u5265\u79BB\u4E86 Set-Cookie\uFF0C\u4E14 data.url \u65E0 SESSDATA\uFF09",
      502,
      env,
      request,
      { "Cache-Control": "no-store" }
    );
  }
  const profile = await profileFromCookie(env, request, cookie);
  const sealed = await sealSession(env, token, cookie, profile);
  await kvPut3(env, "bili:login:sess:" + token, sealed, LOGIN_TTL);
  await kvDel(env, "bili:login:qr:" + token);
  return json5({ status: "ok", profile, ttl: LOGIN_TTL }, 200, env, request, { "Cache-Control": "no-store" });
}
__name(handleLoginPoll, "handleLoginPoll");
async function handleLoginMe(request, env, url) {
  const token = String(url.searchParams.get("token") || "");
  if (!/^[0-9a-f]{24,64}$/.test(token)) {
    return json5({ status: "anonymous" }, 200, env, request, { "Cache-Control": "no-store" });
  }
  const rec = await kvGet3(env, "bili:login:sess:" + token);
  if (!rec || !rec.profile) {
    return json5({ status: "anonymous" }, 200, env, request, { "Cache-Control": "no-store" });
  }
  return json5({ status: "ok", profile: rec.profile, at: rec.at || 0 }, 200, env, request, { "Cache-Control": "no-store" });
}
__name(handleLoginMe, "handleLoginMe");
async function handleLoginLogout(request, env, url) {
  const token = String(url.searchParams.get("token") || "");
  if (/^[0-9a-f]{24,64}$/.test(token)) {
    await kvDel(env, "bili:login:qr:" + token);
    await kvDel(env, "bili:login:sess:" + token);
  }
  return json5({ ok: true }, 200, env, request, { "Cache-Control": "no-store" });
}
__name(handleLoginLogout, "handleLoginLogout");
async function handleBili(request, env, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(env, request) });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return fail("METHOD", "\u4EC5\u652F\u6301 GET", 405, env, request);
  }
  const origin = url.origin;
  let sub = url.pathname.replace(/^\/api\/bili/, "") || "/";
  if (/^\/api\//.test(sub)) sub = sub.slice(4);
  sub = sub.replace(/\/+$/, "") || "/";
  try {
    if (sub === "/feed" || sub === "/popular" || sub === "/") return await handleFeed(request, env, url, origin);
    if (sub === "/search") return await handleSearch(request, env, url, origin);
    if (sub === "/video") return await handleVideo(request, env, url, origin);
    if (sub === "/play") return await handlePlay(request, env, url, origin);
    if (sub === "/related") return await handleRelated(request, env, url, origin);
    if (sub === "/img") return await handleImg(request, env, url);
    if (sub === "/stream") return await handleStream(request, env, url);
    if (sub === "/login/qrcode") return await handleLoginQrcode(request, env);
    if (sub === "/login/poll") return await handleLoginPoll(request, env, url);
    if (sub === "/login/me") return await handleLoginMe(request, env, url);
    if (sub === "/login/logout") return await handleLoginLogout(request, env, url);
    if (sub === "/health") return await handleHealth(request, env);
    if (sub === "/diag") return await handleDiag(request, env, url);
    if (sub === "/ranking" || sub === "/rank") {
      const rid = parseInt(url.searchParams.get("rid") || "0", 10) || 0;
      const r = await biliGet(env, request, "/x/web-interface/ranking/v2", { rid, type: url.searchParams.get("type") || "all" }, { ttl: 600 });
      if (!r.ok) return fail(r.err.code, r.err.error, r.err.status, env, request, {}, r.err.upstream);
      const list = r.body.data && r.body.data.list || [];
      return json5({ rid, items: list.map(normArchive).filter((v) => v.bvid) }, 200, env, request, {
        "Cache-Control": "public, max-age=600",
        "X-Cache": r.cached ? "HIT" : "MISS"
      });
    }
    return fail("NOT_FOUND", "\u672A\u77E5\u7684 B\u7AD9\u63A5\u53E3\uFF1A" + sub, 404, env, request);
  } catch (e) {
    return fail("SERVER", "\u670D\u52A1\u7AEF\u9519\u8BEF\uFF1A" + (e && e.message ? e.message : String(e)), 500, env, request);
  }
}
__name(handleBili, "handleBili");

// src/weather.js
var BASE = "https://devapi.qweather.com";
var TIMEOUT = 1e4;
var TTL2 = { now: 600, hourly: 1800, daily: 1800, city: 604800 };
var ICON = /* @__PURE__ */ __name((code) => "https://icons.qweather.com/assets/icons/" + String(code || "999") + ".svg", "ICON");
function hasKey(env) {
  return !!(env && (env.QWEATHER_KEY || env.QWEATHER_JWT));
}
__name(hasKey, "hasKey");
function noKey(env, request) {
  return fail(
    "WEATHER_NO_KEY",
    "\u5929\u6C14\u670D\u52A1\u672A\u914D\u7F6E\uFF1A\u8BF7\u6267\u884C wrangler secret put QWEATHER_KEY \u540E\u91CD\u65B0\u90E8\u7F72",
    503,
    env,
    request
  );
}
__name(noKey, "noKey");
function locationOf(q) {
  const direct = (q.get("location") || "").trim();
  if (direct) return direct;
  const lat = parseFloat(q.get("lat"));
  const lon = parseFloat(q.get("lon"));
  if (!isFinite(lat) || !isFinite(lon)) return "";
  return lon.toFixed(2) + "," + lat.toFixed(2);
}
__name(locationOf, "locationOf");
async function qweather(env, path, params) {
  const base = (env.QWEATHER_BASE || BASE).replace(/\/+$/, "");
  const u = new URL(base + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v != null) u.searchParams.set(k, String(v));
  });
  if (env.QWEATHER_KEY) u.searchParams.set("key", env.QWEATHER_KEY);
  if (env.QWEATHER_JWT) u.searchParams.set("jwt", env.QWEATHER_JWT);
  const res = await fetchTimeout(u.toString(), {
    headers: { "Accept-Encoding": "gzip", "User-Agent": "NexusOS26/1.0 (+https://fanggame.company)" }
  }, TIMEOUT);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
  }
  if (!data) throw Object.assign(new Error("\u4E0A\u6E38\u8FD4\u56DE\u975E JSON"), { status: res.status });
  if (String(data.code) !== "200") {
    throw Object.assign(new Error("QWeather " + data.code), { qcode: String(data.code), status: res.status });
  }
  return data;
}
__name(qweather, "qweather");
function failFromQ(err, env, request) {
  const code = err && err.qcode;
  if (code === "401" || code === "403") {
    return fail("WEATHER_KEY_INVALID", "\u548C\u98CE Key \u65E0\u6548\u6216\u65E0\u6743\u9650\uFF08code " + code + "\uFF09\uFF0C\u8BF7\u68C0\u67E5 QWEATHER_KEY", 502, env, request, {}, code);
  }
  if (code === "402") {
    return fail("WEATHER_QUOTA", "\u548C\u98CE\u8C03\u7528\u989D\u5EA6\u5DF2\u7528\u5B8C\uFF08code 402\uFF09", 502, env, request, {}, code);
  }
  if (code === "404" || code === "204") {
    return fail("WEATHER_NO_DATA", "\u8BE5\u4F4D\u7F6E\u6682\u65E0\u5929\u6C14\u6570\u636E\uFF08code " + code + "\uFF09", 404, env, request, {}, code);
  }
  return fail("WEATHER_UPSTREAM", "\u548C\u98CE\u4E0A\u6E38\u5F02\u5E38\uFF1A" + (err && err.message || "unknown"), 502, env, request, {}, code);
}
__name(failFromQ, "failFromQ");
var nowOf = /* @__PURE__ */ __name((d) => ({
  obsTime: d.obsTime || "",
  temp: d.temp,
  feelsLike: d.feelsLike,
  text: d.text || "",
  icon: d.icon || "",
  iconUrl: ICON(d.icon),
  wind360: d.wind360,
  windDir: d.windDir || "",
  windScale: d.windScale || "",
  windSpeed: d.windSpeed || "",
  humidity: d.humidity,
  precip: d.precip,
  pressure: d.pressure,
  vis: d.vis,
  cloud: d.cloud,
  dew: d.dew
}), "nowOf");
var hourOf = /* @__PURE__ */ __name((d) => ({
  time: d.fxTime || "",
  temp: d.temp,
  text: d.text || "",
  icon: d.icon || "",
  iconUrl: ICON(d.icon),
  windDir: d.windDir || "",
  windScale: d.windScale || "",
  pop: d.pop,
  precip: d.precip,
  humidity: d.humidity
}), "hourOf");
var dayOf = /* @__PURE__ */ __name((d) => ({
  date: d.fxDate || "",
  sunrise: d.sunrise || "",
  sunset: d.sunset || "",
  moonrise: d.moonrise || "",
  moonset: d.moonset || "",
  moonPhase: d.moonPhase || "",
  tempMax: d.tempMax,
  tempMin: d.tempMin,
  textDay: d.textDay || "",
  textNight: d.textNight || "",
  iconDay: d.iconDay || "",
  iconDayUrl: ICON(d.iconDay),
  iconNight: d.iconNight || "",
  windDirDay: d.windDirDay || "",
  windScaleDay: d.windScaleDay || "",
  precip: d.precip,
  uvIndex: d.uvIndex
}), "dayOf");
async function handleWeather(request, env, url) {
  if (request.method !== "GET") return fail("METHOD", "\u4EC5\u652F\u6301 GET", 405, env, request);
  const route2 = url.pathname.replace(/\/+$/, "").slice("/api/weather".length) || "/";
  const q = url.searchParams;
  if (route2 === "/health") {
    return json5({ configured: hasKey(env), base: env.QWEATHER_BASE || BASE }, 200, env, request);
  }
  if (!hasKey(env)) return noKey(env, request);
  try {
    if (route2 === "/now" || route2 === "/") {
      const loc = locationOf(q);
      if (!loc) return fail("BAD_LOCATION", "\u7F3A\u5C11 location\uFF0C\u6216 lat/lon \u4E0D\u5408\u6CD5", 400, env, request);
      const key = "wx:now:" + loc;
      const hit = await kvGet3(env, key);
      if (hit) return json5(hit, 200, env, request, Object.assign({ "X-Cache": "HIT" }, cacheHeader(TTL2.now)));
      const d = await qweather(env, "/v7/weather/now", { location: loc });
      const out = Object.assign({ location: loc, updateTime: d.updateTime || "" }, nowOf(d.now || {}));
      await kvPut3(env, key, out, TTL2.now);
      return json5(out, 200, env, request, Object.assign({ "X-Cache": "MISS" }, cacheHeader(TTL2.now)));
    }
    if (route2 === "/hourly") {
      const loc = locationOf(q);
      if (!loc) return fail("BAD_LOCATION", "\u7F3A\u5C11 location\uFF0C\u6216 lat/lon \u4E0D\u5408\u6CD5", 400, env, request);
      const hours = String(q.get("hours") || "24");
      const path = hours === "72" ? "/v7/weather/72h" : "/v7/weather/24h";
      const key = "wx:hourly:" + hours + ":" + loc;
      const hit = await kvGet3(env, key);
      if (hit) return json5(hit, 200, env, request, Object.assign({ "X-Cache": "HIT" }, cacheHeader(TTL2.hourly)));
      const d = await qweather(env, path, { location: loc });
      const out = { location: loc, updateTime: d.updateTime || "", items: (d.hourly || []).map(hourOf) };
      await kvPut3(env, key, out, TTL2.hourly);
      return json5(out, 200, env, request, Object.assign({ "X-Cache": "MISS" }, cacheHeader(TTL2.hourly)));
    }
    if (route2 === "/daily") {
      const loc = locationOf(q);
      if (!loc) return fail("BAD_LOCATION", "\u7F3A\u5C11 location\uFF0C\u6216 lat/lon \u4E0D\u5408\u6CD5", 400, env, request);
      const days = String(q.get("days") || "7");
      const path = days === "3" ? "/v7/weather/3d" : "/v7/weather/7d";
      const key = "wx:daily:" + days + ":" + loc;
      const hit = await kvGet3(env, key);
      if (hit) return json5(hit, 200, env, request, Object.assign({ "X-Cache": "HIT" }, cacheHeader(TTL2.daily)));
      const d = await qweather(env, path, { location: loc });
      const out = { location: loc, updateTime: d.updateTime || "", items: (d.daily || []).map(dayOf) };
      await kvPut3(env, key, out, TTL2.daily);
      return json5(out, 200, env, request, Object.assign({ "X-Cache": "MISS" }, cacheHeader(TTL2.daily)));
    }
    if (route2 === "/city") {
      const name = (q.get("q") || q.get("name") || q.get("keyword") || "").trim();
      if (!name) return fail("BAD_QUERY", "\u7F3A\u5C11 q\uFF08\u57CE\u5E02\u540D\uFF09", 400, env, request);
      const key = "wx:city:" + name;
      const hit = await kvGet3(env, key);
      if (hit) return json5(hit, 200, env, request, Object.assign({ "X-Cache": "HIT" }, cacheHeader(TTL2.city)));
      const d = await qweather(env, "/v2/city/lookup", { location: name, number: q.get("number") || "5", lang: q.get("lang") || "zh" });
      const out = {
        query: name,
        items: (d.location || []).map((c) => ({
          id: c.id,
          name: c.name,
          adm1: c.adm1 || "",
          adm2: c.adm2 || "",
          country: c.country || "",
          lat: parseFloat(c.lat),
          lon: parseFloat(c.lon),
          tz: c.tz || "",
          type: c.type || ""
        }))
      };
      await kvPut3(env, key, out, TTL2.city);
      return json5(out, 200, env, request, Object.assign({ "X-Cache": "MISS" }, cacheHeader(TTL2.city)));
    }
    return fail("NOT_FOUND", "\u672A\u77E5\u5929\u6C14\u63A5\u53E3\uFF0C\u53EF\u7528\uFF1A/now /hourly /daily /city /health", 404, env, request);
  } catch (e) {
    return failFromQ(e, env, request);
  }
}
__name(handleWeather, "handleWeather");

// src/map.js
var BASE2 = "https://restapi.amap.com";
var TIMEOUT2 = 1e4;
var TTL3 = { geocode: 86400, regeo: 86400, poi: 21600 };
var LIMIT = { max: 60, windowMs: 60 * 1e3 };
var hits = /* @__PURE__ */ new Map();
function rateLimited(ip) {
  const now = Date.now();
  const e = hits.get(ip) || { n: 0, reset: now + LIMIT.windowMs };
  if (now > e.reset) {
    e.n = 0;
    e.reset = now + LIMIT.windowMs;
  }
  e.n += 1;
  hits.set(ip, e);
  if (hits.size > 5e3) hits.clear();
  return { limited: e.n > LIMIT.max, remain: Math.max(0, LIMIT.max - e.n), reset: e.reset };
}
__name(rateLimited, "rateLimited");
function hasKey2(env) {
  return !!(env && env.AMAP_KEY);
}
__name(hasKey2, "hasKey");
async function amap(env, path, params) {
  const u = new URL(BASE2 + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v != null) u.searchParams.set(k, String(v));
  });
  u.searchParams.set("key", env.AMAP_KEY);
  const res = await fetchTimeout(u.toString(), {
    headers: { "User-Agent": "NexusOS26/1.0 (+https://fanggame.company)" }
  }, TIMEOUT2);
  const text = await res.text();
  let d = null;
  try {
    d = JSON.parse(text);
  } catch (e) {
  }
  if (!d) throw Object.assign(new Error("\u4E0A\u6E38\u975E JSON"), { kind: "nonjson", status: res.status });
  if (String(d.status) !== "1") {
    throw Object.assign(new Error(d.info || "AMap error"), { info: String(d.info || ""), infocode: String(d.infocode || "") });
  }
  return d;
}
__name(amap, "amap");
function failFrom(e, env, request) {
  const info = e && e.info || "";
  if (/INVALID_USER_KEY|USERKEY_PLAT_NOMATCH|INVALID_USER_SCODE/i.test(info)) {
    return fail("MAP_KEY_INVALID", "\u9AD8\u5FB7 Key \u65E0\u6548\u6216\u65E0\u6743\u9650\uFF08" + info + "\uFF09\uFF0C\u8BF7\u68C0\u67E5 AMAP_KEY", 502, env, request, {}, info);
  }
  if (/DAILY_QUERY_OVER_LIMIT|OVER_QUOTA|CUQPS_HAS_EXCEEDED/i.test(info)) {
    return fail("MAP_QUOTA", "\u9AD8\u5FB7\u8C03\u7528\u989D\u5EA6/\u5E76\u53D1\u8D85\u9650\uFF08" + info + "\uFF09", 502, env, request, {}, info);
  }
  return fail("MAP_UPSTREAM", "\u9AD8\u5FB7\u4E0A\u6E38\u5F02\u5E38\uFF1A" + (e && e.message || "unknown"), 502, env, request, {}, info + (e && e.infocode || ""));
}
__name(failFrom, "failFrom");
async function handleMap(request, env, url) {
  if (request.method !== "GET") return fail("METHOD", "\u4EC5\u652F\u6301 GET", 405, env, request);
  const route2 = url.pathname.replace(/\/+$/, "").slice("/api/map".length) || "/";
  const q = url.searchParams;
  if (route2 === "/health") {
    const r = rateLimited(request.headers.get("CF-Connecting-IP") || "anon");
    return json5({ configured: hasKey2(env), rate: { remain: r.remain, reset: r.reset } }, 200, env, request);
  }
  if (!hasKey2(env)) {
    return fail("MAP_NO_KEY", "\u5730\u56FE\u670D\u52A1\u672A\u914D\u7F6E\uFF1A\u8BF7\u6267\u884C wrangler secret put AMAP_KEY \u540E\u91CD\u65B0\u90E8\u7F72", 503, env, request);
  }
  const ip = request.headers.get("CF-Connecting-IP") || "anon";
  const rl = rateLimited(ip);
  if (rl.limited) {
    return fail("MAP_RATE_LIMIT", "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\uFF08\u6BCF IP 60 \u6B21/\u5206\u949F\uFF09", 429, env, request, { "Retry-After": "60" });
  }
  try {
    if (route2 === "/geocode") {
      const address = (q.get("address") || "").trim();
      if (!address) return fail("BAD_ADDRESS", "\u7F3A\u5C11 address", 400, env, request);
      const city = (q.get("city") || "").trim();
      const key = "map:geo:" + city + ":" + address;
      const hit = await kvGet3(env, key);
      if (hit) return json5(hit, 200, env, request, Object.assign({ "X-Cache": "HIT", "X-RateLimit-Remaining": String(rl.remain) }, cacheHeader(TTL3.geocode)));
      const d = await amap(env, "/v3/geocode/geo", { address, city, batch: "false" });
      const out = {
        query: { address, city },
        items: (d.geocodes || []).map((g) => ({
          formattedAddress: g.formatted_address || "",
          province: g.province || "",
          city: g.city || "",
          district: g.district || "",
          adcode: g.adcode || "",
          level: g.level || "",
          location: g.location || "",
          lat: parseFloat((g.location || ",").split(",")[1]),
          lon: parseFloat((g.location || ",").split(",")[0])
        }))
      };
      await kvPut3(env, key, out, TTL3.geocode);
      return json5(out, 200, env, request, Object.assign({ "X-Cache": "MISS", "X-RateLimit-Remaining": String(rl.remain) }, cacheHeader(TTL3.geocode)));
    }
    if (route2 === "/regeo") {
      const lat = parseFloat(q.get("lat"));
      const lon = parseFloat(q.get("lon"));
      if (!isFinite(lat) || !isFinite(lon)) return fail("BAD_LOCATION", "\u7F3A\u5C11 lat/lon \u6216\u683C\u5F0F\u4E0D\u5408\u6CD5", 400, env, request);
      const loc = lon.toFixed(6) + "," + lat.toFixed(6);
      const key = "map:regeo:" + loc;
      const hit = await kvGet3(env, key);
      if (hit) return json5(hit, 200, env, request, Object.assign({ "X-Cache": "HIT", "X-RateLimit-Remaining": String(rl.remain) }, cacheHeader(TTL3.regeo)));
      const d = await amap(env, "/v3/geocode/regeo", { location: loc, extensions: "all", radius: "1000" });
      const r = d.regeocode || {};
      const ac = r.addressComponent || {};
      const out = {
        location: loc,
        formattedAddress: r.formatted_address || "",
        addressComponent: {
          province: ac.province || "",
          city: ac.city || "",
          district: ac.district || "",
          township: ac.township || "",
          neighborhood: ac.neighborhood && ac.neighborhood.name || "",
          street: ac.streetNumber ? (ac.streetNumber.street || "") + (ac.streetNumber.number || "") : "",
          adcode: ac.adcode || "",
          citycode: ac.citycode || ""
        },
        pois: (r.pois || []).slice(0, 10).map((p) => ({
          id: p.id || "",
          name: p.name || "",
          type: p.type || "",
          address: p.address || "",
          distance: p.distance || ""
        }))
      };
      await kvPut3(env, key, out, TTL3.regeo);
      return json5(out, 200, env, request, Object.assign({ "X-Cache": "MISS", "X-RateLimit-Remaining": String(rl.remain) }, cacheHeader(TTL3.regeo)));
    }
    if (route2 === "/poi") {
      const keyword = (q.get("keyword") || q.get("q") || "").trim();
      if (!keyword) return fail("BAD_KEYWORD", "\u7F3A\u5C11 keyword", 400, env, request);
      const city = (q.get("city") || "").trim();
      const page = Math.max(1, parseInt(q.get("page") || "1", 10) || 1);
      const size = Math.min(25, Math.max(1, parseInt(q.get("size") || "20", 10) || 20));
      const key = "map:poi:" + city + ":" + keyword + ":" + page + ":" + size;
      const hit = await kvGet3(env, key);
      if (hit) return json5(hit, 200, env, request, Object.assign({ "X-Cache": "HIT", "X-RateLimit-Remaining": String(rl.remain) }, cacheHeader(TTL3.poi)));
      const d = await amap(env, "/v3/place/text", { keywords: keyword, city, offset: size, page, extensions: "base" });
      const out = {
        query: { keyword, city, page, size },
        count: parseInt(d.count || "0", 10) || 0,
        items: (d.pois || []).map((p) => ({
          id: p.id || "",
          name: p.name || "",
          type: p.type || "",
          typecode: p.typecode || "",
          address: p.address || "",
          location: p.location || "",
          lat: parseFloat((p.location || ",").split(",")[1]),
          lon: parseFloat((p.location || ",").split(",")[0]),
          tel: p.tel || "",
          adcode: p.adcode || "",
          cityname: p.cityname || ""
        }))
      };
      await kvPut3(env, key, out, TTL3.poi);
      return json5(out, 200, env, request, Object.assign({ "X-Cache": "MISS", "X-RateLimit-Remaining": String(rl.remain) }, cacheHeader(TTL3.poi)));
    }
    return fail("NOT_FOUND", "\u672A\u77E5\u5730\u56FE\u63A5\u53E3\uFF0C\u53EF\u7528\uFF1A/geocode /regeo /poi /health", 404, env, request);
  } catch (e) {
    return failFrom(e, env, request);
  }
}
__name(handleMap, "handleMap");

// src/news.js
var TTL4 = 600;
var TIMEOUT3 = 1e4;
var UA2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
var MAX_BYTES = 1.5 * 1024 * 1024;
var SOURCES = [
  { id: "36kr", name: "36\u6C2A", url: "https://www.36kr.com/feed-newsflash", site: "https://36kr.com" },
  { id: "ithome", name: "IT\u4E4B\u5BB6", url: "https://www.ithome.com/rss/", site: "https://www.ithome.com" },
  { id: "sspai", name: "\u5C11\u6570\u6D3E", url: "https://sspai.com/feed", site: "https://sspai.com" },
  { id: "ifanr", name: "\u7231\u8303\u513F", url: "https://www.ifanr.com/feed", site: "https://www.ifanr.com" },
  { id: "chinanews", name: "\u4E2D\u56FD\u65B0\u95FB\u7F51", url: "https://www.chinanews.com.cn/rss/scroll-news.xml", site: "https://www.chinanews.com.cn" }
];
var byId = /* @__PURE__ */ __name((id) => SOURCES.find((s) => s.id === id), "byId");
function unescapeXml(s) {
  return String(s || "").replace(/<![CDATA[\s\S]*?\]\]>/g, (m) => m.slice(9, -3)).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, "&");
}
__name(unescapeXml, "unescapeXml");
function stripTags2(s) {
  let t = String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  t = unescapeXml(t);
  t = t.replace(/<[^>]+>/g, " ");
  return t.replace(/\s+/g, " ").trim();
}
__name(stripTags2, "stripTags");
function pick(block, tag) {
  const m = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i").exec(block);
  return m ? m[1] : "";
}
__name(pick, "pick");
function pickAttr(block, tag, attr) {
  const m = new RegExp("<" + tag + "[^>]*" + attr + `\\s*=\\s*["']([^"']+)["'][^>]*>`, "i").exec(block);
  return m ? m[1] : "";
}
__name(pickAttr, "pickAttr");
function toTime(s) {
  const t = Date.parse(String(s || "").trim());
  return isFinite(t) ? t : 0;
}
__name(toTime, "toTime");
function normalizeItem(block, src, isAtom) {
  const title = stripTags2(isAtom ? pick(block, "title") : pick(block, "title"));
  const link = isAtom ? pickAttr(block, "link", "href") || stripTags2(pick(block, "link")) : stripTags2(pick(block, "link"));
  const summary = stripTags2(pick(block, "description") || pick(block, "summary") || pick(block, "content"));
  const pub = toTime(pick(block, "pubDate") || pick(block, "published") || pick(block, "updated") || pick(block, "dc:date"));
  let cover = "";
  const enc4 = pickAttr(block, "enclosure", "url");
  if (enc4) cover = enc4;
  if (!cover) {
    const m = /<img[^>]+src=["']([^"']+)["']/i.exec(pick(block, "content:encoded") || pick(block, "description") || "");
    if (m) cover = m[1];
  }
  if (!title || !link) return null;
  const guid = stripTags2(pick(block, "guid") || pick(block, "id")) || link;
  return {
    id: src.id + ":" + guid.slice(0, 120),
    title,
    link,
    summary: summary.slice(0, 240),
    cover: cover || "",
    source: src.id,
    sourceName: src.name,
    published: pub ? new Date(pub).toISOString() : "",
    time: pub
  };
}
__name(normalizeItem, "normalizeItem");
function parseFeed(xml, src) {
  const text = String(xml || "");
  const isAtom = /<feed[\s>]/i.test(text) && !/<rss[\s>]/i.test(text);
  const blocks = [];
  if (isAtom) {
    const re = /<entry[\s>][\s\S]*?<\/entry>/gi;
    let m;
    while (m = re.exec(text)) blocks.push(m[0]);
  } else {
    const re = /<item[\s>][\s\S]*?<\/item>/gi;
    let m;
    while (m = re.exec(text)) blocks.push(m[0]);
    if (!blocks.length) {
      const re2 = /<item[\s>][\s\S]*?<\/item>/gi;
      while (m = re2.exec(text)) blocks.push(m[0]);
    }
  }
  return blocks.map((b) => normalizeItem(b, src, isAtom)).filter(Boolean);
}
__name(parseFeed, "parseFeed");
async function loadSource(env, src, fresh) {
  const key = "news:v1:" + src.id;
  if (!fresh) {
    const hit = await kvGet3(env, key);
    if (hit && Array.isArray(hit.items)) return hit;
  }
  const res = await fetchTimeout(src.url, {
    headers: { "User-Agent": UA2, "Accept": "application/rss+xml, application/xml, text/xml, */*" },
    redirect: "follow",
    cf: { cacheTtl: 300, cacheEverything: true }
  }, TIMEOUT3);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new Error("\u6E90\u8FC7\u5927");
  const xml = new TextDecoder("utf-8").decode(buf);
  const items = parseFeed(xml, src).slice(0, 60);
  if (!items.length) throw new Error("\u89E3\u6790\u5230 0 \u6761\uFF08\u4E0A\u6E38\u53EF\u80FD\u8FD4\u56DE\u4E86 HTML \u6216\u5DF2\u505C\u66F4\uFF09");
  const out = { source: src.id, fetchedAt: Date.now(), items };
  await kvPut3(env, key, out, TTL4);
  return out;
}
__name(loadSource, "loadSource");
async function handleNews(request, env, url) {
  if (request.method !== "GET") return fail("METHOD", "\u4EC5\u652F\u6301 GET", 405, env, request);
  const route2 = url.pathname.replace(/\/+$/, "").slice("/api/news".length) || "/";
  const q = url.searchParams;
  if (route2 === "/sources") {
    return json5({
      items: SOURCES.map((s) => ({ id: s.id, name: s.name, site: s.site })),
      total: SOURCES.length
    }, 200, env, request, Object.assign({ "X-Cache": "STATIC" }, cacheHeader(3600)));
  }
  if (route2 === "/feed" || route2 === "/") {
    const want = (q.get("source") || "all").trim();
    const limit = Math.min(80, Math.max(1, parseInt(q.get("limit") || "30", 10) || 30));
    const fresh = q.get("fresh") === "1";
    const list = want === "all" ? SOURCES : byId(want) ? [byId(want)] : null;
    if (!list) return fail("BAD_SOURCE", "\u672A\u77E5\u65B0\u95FB\u6E90\uFF1A" + want + "\uFF08\u53EF\u7528 /api/news/sources\uFF09", 400, env, request);
    const settled = await Promise.allSettled(list.map((s) => loadSource(env, s, fresh).then((r) => ({ id: s.id, name: s.name, items: r.items, fetchedAt: r.fetchedAt })).catch((e) => Promise.reject(Object.assign(e, { source: s.id })))));
    const items = [];
    const failed = [];
    const sources = [];
    let hitCount = 0;
    settled.forEach((r, i) => {
      const s = list[i];
      if (r.status === "fulfilled") {
        sources.push({ id: s.id, name: s.name, count: r.value.items.length, fetchedAt: r.value.fetchedAt });
        hitCount += 1;
        r.value.items.forEach((it) => items.push(it));
      } else {
        failed.push({ id: s.id, name: s.name, error: String(r.reason && r.reason.message || r.reason) });
      }
    });
    if (!items.length && failed.length) {
      return fail("NEWS_ALL_FAILED", "\u6240\u6709\u65B0\u95FB\u6E90\u6682\u4E0D\u53EF\u7528", 502, env, request, {}, failed);
    }
    items.sort((a, b) => (b.time || 0) - (a.time || 0));
    const dedup = [];
    const seen = /* @__PURE__ */ new Set();
    for (const it of items) {
      const k = it.title.slice(0, 60);
      if (seen.has(k)) continue;
      seen.add(k);
      dedup.push(it);
      if (dedup.length >= limit) break;
    }
    return json5({
      source: want,
      total: dedup.length,
      sources,
      failed,
      items: dedup.map((it) => it.cover && it.cover.startsWith("//") ? Object.assign({}, it, { cover: "https:" + it.cover }) : it)
    }, 200, env, request, Object.assign({
      "X-Cache": hitCount === list.length ? "MISS" : "PARTIAL",
      "X-News-Sources-Ok": String(hitCount),
      "X-News-Sources-Failed": String(failed.length)
    }, cacheHeader(TTL4)));
  }
  return fail("NOT_FOUND", "\u672A\u77E5\u65B0\u95FB\u63A5\u53E3\uFF0C\u53EF\u7528\uFF1A/feed /sources", 404, env, request);
}
__name(handleNews, "handleNews");

// src/v1/core.js
var enc3 = new TextEncoder();
var KV = "n26:";
var CATEGORIES = ["tools", "games", "media", "productivity", "social", "education", "system", "demo", "other"];
var CATEGORY_LABELS = {
  tools: "\u5DE5\u5177",
  games: "\u6E38\u620F",
  media: "\u5A92\u4F53",
  productivity: "\u6548\u7387",
  social: "\u793E\u4EA4",
  education: "\u6559\u80B2",
  system: "\u7CFB\u7EDF",
  demo: "\u6F14\u793A",
  other: "\u5176\u4ED6"
};
var SCOPES = ["app:read", "app:write", "release:publish", "review:read", "telemetry:write", "*"];
var LIMITS2 = {
  packageBytes: 64 * 1024 * 1024,
  unpackedBytes: 256 * 1024 * 1024,
  files: 800,
  manifestBytes: 64 * 1024,
  iconBytes: 512 * 1024,
  screenshotBytes: 2 * 1024 * 1024,
  screenshots: 8,
  chunkBytes: 8 * 1024 * 1024,
  appsPerDev: 50,
  releasesPerApp: 60,
  queueMax: 200
};
var ApiError = class extends Error {
  static {
    __name(this, "ApiError");
  }
  constructor(code, status, message, details) {
    super(message || code);
    this.code = code;
    this.status = status || 400;
    this.details = details || null;
  }
};
function json6(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {})
  });
}
__name(json6, "json");
function toErrorResponse(e) {
  if (e instanceof ApiError) {
    return json6({ error: { code: e.code, message: e.message, details: e.details } }, e.status, e.retryAfter ? { "Retry-After": String(e.retryAfter) } : void 0);
  }
  return json6({
    error: {
      code: "INTERNAL_ERROR",
      message: "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF",
      details: { traceId: randHex2(6), reason: String(e && e.message || e).slice(0, 200) }
    }
  }, 500);
}
__name(toErrorResponse, "toErrorResponse");
function notFound(message) {
  return new ApiError("NOT_FOUND", 404, message || "\u8D44\u6E90\u4E0D\u5B58\u5728");
}
__name(notFound, "notFound");
async function sha256Hex3(input) {
  const data = typeof input === "string" ? enc3.encode(input) : input;
  const buf = await crypto.subtle.digest("SHA-256", data);
  const u8 = new Uint8Array(buf);
  let hex2 = "";
  for (let i = 0; i < u8.length; i++) hex2 += u8[i].toString(16).padStart(2, "0");
  return hex2;
}
__name(sha256Hex3, "sha256Hex");
function randHex2(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  let hex2 = "";
  for (let i = 0; i < a.length; i++) hex2 += a[i].toString(16).padStart(2, "0");
  return hex2;
}
__name(randHex2, "randHex");
function nowISO() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowISO, "nowISO");
function storage(env) {
  const ns = env && env.STORE_KV;
  if (!ns || typeof ns.get !== "function") throw new ApiError("STORAGE_UNAVAILABLE", 503, "\u670D\u52A1\u7AEF\u672A\u7ED1\u5B9A STORE_KV");
  return ns;
}
__name(storage, "storage");
async function getJSON(env, key, fallback) {
  try {
    const raw = await storage(env).get(KV + key);
    return raw == null ? fallback === void 0 ? null : fallback : JSON.parse(raw);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    return fallback === void 0 ? null : fallback;
  }
}
__name(getJSON, "getJSON");
async function putJSON(env, key, val, opts) {
  await storage(env).put(KV + key, JSON.stringify(val), opts || void 0);
}
__name(putJSON, "putJSON");
async function delKey(env, key) {
  await storage(env).delete(KV + key);
}
__name(delKey, "delKey");
async function putBytes(env, key, bytes, opts) {
  await storage(env).put(KV + key, bytes, opts || void 0);
}
__name(putBytes, "putBytes");
async function getBytes(env, key) {
  try {
    return await storage(env).get(KV + key, { type: "arrayBuffer" });
  } catch (e) {
    return null;
  }
}
__name(getBytes, "getBytes");
async function delBytes(env, key) {
  try {
    await storage(env).delete(KV + key);
  } catch (e) {
  }
}
__name(delBytes, "delBytes");
async function appendAudit(env, entry) {
  try {
    const rec = Object.assign({ auditId: "au_" + randHex2(5), at: nowISO() }, entry);
    await putJSON(env, "audit:e:" + rec.at + ":" + rec.auditId, rec, { expirationTtl: 90 * 86400 });
    return rec;
  } catch (e) {
    return null;
  }
}
__name(appendAudit, "appendAudit");
async function listAudit(env, limit) {
  try {
    const res = await storage(env).list({ prefix: KV + "audit:e:", limit: 1e3 });
    const names = (res.keys || []).map((k) => k.name.slice(KV.length));
    const items = (await Promise.all(names.map((n) => getJSON(env, n)))).filter(Boolean);
    return items.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit || 200);
  } catch (e) {
    return [];
  }
}
__name(listAudit, "listAudit");
async function rateLimitKV(env, bucket, key, limit, windowSec) {
  const win = Math.floor(Date.now() / (windowSec * 1e3));
  const k = `rl:${bucket}:${key}:${win}`;
  let cur = 0;
  try {
    cur = Number(await storage(env).get(KV + k) || 0);
  } catch (e) {
    return;
  }
  if (cur >= limit) {
    const err = new ApiError("RATE_LIMITED", 429, "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5", { bucket, limit, windowSec });
    err.retryAfter = windowSec - Math.floor(Date.now() / 1e3 % windowSec);
    throw err;
  }
  try {
    await storage(env).put(KV + k, String(cur + 1), { expirationTtl: windowSec * 2 });
  } catch (e) {
  }
}
__name(rateLimitKV, "rateLimitKV");
var _buckets = /* @__PURE__ */ new Map();
function rateLimitLocal(bucket, key, limit, windowSec) {
  const win = Math.floor(Date.now() / (windowSec * 1e3));
  const k = bucket + "|" + key + "|" + win;
  const cur = _buckets.get(k) || 0;
  if (cur >= limit) {
    const err = new ApiError("RATE_LIMITED", 429, "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5", { bucket, limit, windowSec });
    err.retryAfter = windowSec - Math.floor(Date.now() / 1e3 % windowSec);
    throw err;
  }
  _buckets.set(k, cur + 1);
  if (_buckets.size > 2e3) {
    const cutoff = win - 2;
    for (const kk of _buckets.keys()) {
      const parts = kk.split("|");
      if (Number(parts[2]) < cutoff) _buckets.delete(kk);
    }
  }
}
__name(rateLimitLocal, "rateLimitLocal");
function clientIP(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || request.headers.get("X-Real-IP") || "0.0.0.0";
}
__name(clientIP, "clientIP");
async function readJSON(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not object");
    return body;
  } catch (e) {
    throw new ApiError("INVALID_JSON", 400, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON \u5BF9\u8C61");
  }
}
__name(readJSON, "readJSON");
function queryInt(url, name, def, min, max) {
  const raw = url.searchParams.get(name);
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
    throw new ApiError("INVALID_PAGE", 400, `\u53C2\u6570 ${name} \u5FC5\u987B\u662F ${min}\u2013${max} \u7684\u6574\u6570`);
  }
  return n;
}
__name(queryInt, "queryInt");
function pagination(url) {
  const page = queryInt(url, "page", 1, 1, 1e5);
  const pageSize = queryInt(url, "page_size", 20, 1, 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}
__name(pagination, "pagination");
function pageSlice(items, p) {
  return items.slice(p.offset, p.offset + p.pageSize);
}
__name(pageSlice, "pageSlice");
var APP_ID_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;
var SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
function compareSemver(a, b) {
  const pa = String(a).split("+")[0].split("-")[0].split(".").map(Number);
  const pb = String(b).split("+")[0].split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  const ra = String(a).includes("-"), rb = String(b).includes("-");
  if (ra && !rb) return -1;
  if (!ra && rb) return 1;
  return 0;
}
__name(compareSemver, "compareSemver");
function normalizeTagList(list, maxItems, maxLen) {
  if (!Array.isArray(list)) return [];
  return list.map((t) => String(t).trim()).filter(Boolean).slice(0, maxItems).map((t) => t.slice(0, maxLen));
}
__name(normalizeTagList, "normalizeTagList");
function clip(str, max) {
  return String(str == null ? "" : str).trim().slice(0, max);
}
__name(clip, "clip");

// src/v1/data.js
async function getApp(env, appId) {
  return await getJSON(env, "app:" + appId);
}
__name(getApp, "getApp");
async function saveApp(env, app) {
  app.updatedAt = nowISO();
  await putJSON(env, "app:" + app.id, app);
  return app;
}
__name(saveApp, "saveApp");
async function listAppIds(env) {
  const ids = await getJSON(env, "appidx", []);
  return Array.isArray(ids) ? ids : [];
}
__name(listAppIds, "listAppIds");
async function addAppId(env, appId) {
  const ids = await listAppIds(env);
  if (!ids.includes(appId)) ids.unshift(appId);
  await putJSON(env, "appidx", ids);
}
__name(addAppId, "addAppId");
async function devAppCount(env, devId) {
  const ids = await getJSON(env, "devidx:" + devId, []);
  return Array.isArray(ids) ? ids.length : 0;
}
__name(devAppCount, "devAppCount");
async function listDevAppIds(env, devId) {
  const ids = await getJSON(env, "devidx:" + devId, []);
  return Array.isArray(ids) ? ids : [];
}
__name(listDevAppIds, "listDevAppIds");
async function addDevAppId(env, devId, appId) {
  const ids = await listDevAppIds(env, devId);
  if (!ids.includes(appId)) ids.unshift(appId);
  await putJSON(env, "devidx:" + devId, ids);
}
__name(addDevAppId, "addDevAppId");
async function getRelease(env, releaseId) {
  return await getJSON(env, "rel:" + releaseId);
}
__name(getRelease, "getRelease");
async function saveRelease(env, rel) {
  await putJSON(env, "rel:" + rel.releaseId, rel);
  return rel;
}
__name(saveRelease, "saveRelease");
async function listReleaseIds(env, appId) {
  const ids = await getJSON(env, "relidx:" + appId, []);
  return Array.isArray(ids) ? ids : [];
}
__name(listReleaseIds, "listReleaseIds");
async function addReleaseId(env, appId, releaseId) {
  const ids = await listReleaseIds(env, appId);
  ids.unshift(releaseId);
  await putJSON(env, "relidx:" + appId, ids);
}
__name(addReleaseId, "addReleaseId");
async function listReleases(env, appId) {
  const ids = await listReleaseIds(env, appId);
  const out = await Promise.all(ids.map((id) => getRelease(env, id)));
  return out.filter(Boolean);
}
__name(listReleases, "listReleases");
async function putBlob(env, releaseId, bytes) {
  const size = bytes.byteLength;
  const chunk = LIMITS2.chunkBytes;
  const count = Math.ceil(size / chunk);
  const written = [];
  try {
    for (let i = 0; i < count; i++) {
      const part = bytes.subarray(i * chunk, Math.min(size, (i + 1) * chunk));
      const key = "blob:" + releaseId + ":" + i;
      await putBytes(env, key, part);
      written.push(key);
    }
  } catch (e) {
    for (const key of written) await delBytes(env, key);
    throw e;
  }
  return count;
}
__name(putBlob, "putBlob");
async function getBlobRange(env, releaseId, chunks, start, end) {
  const chunk = LIMITS2.chunkBytes;
  const first = Math.floor(start / chunk);
  const last = Math.floor((end - 1) / chunk);
  const idx = [];
  for (let i = first; i <= last; i++) idx.push(i);
  const parts = await Promise.all(idx.map((i) => getBytes(env, "blob:" + releaseId + ":" + i)));
  if (parts.some((p) => !p)) return null;
  const sliceStart = start - first * chunk;
  const sliceEnd = sliceStart + (end - start);
  if (idx.length === 1) return new Uint8Array(parts[0], sliceStart, sliceEnd - sliceStart);
  const out = new Uint8Array(end - start);
  let pos = 0;
  for (let k = 0; k < parts.length; k++) {
    const buf = new Uint8Array(parts[k]);
    const from = k === 0 ? sliceStart : 0;
    const to = k === parts.length - 1 ? sliceEnd - (parts.length - 1) * chunk : buf.length;
    const piece = buf.subarray(from, to);
    out.set(piece, pos);
    pos += piece.length;
  }
  return out;
}
__name(getBlobRange, "getBlobRange");
async function saveIcon(env, appId, icon) {
  if (!icon) return;
  await putJSON(env, "icon:" + appId, { mime: icon.mime, bytes: icon.bytes.length, b64: toBase64(icon.bytes), at: nowISO() });
}
__name(saveIcon, "saveIcon");
async function getIcon(env, appId) {
  const rec = await getJSON(env, "icon:" + appId);
  if (!rec) return null;
  return { mime: rec.mime, bytes: fromBase64(rec.b64) };
}
__name(getIcon, "getIcon");
async function saveScreenshots(env, appId, shots) {
  for (let i = 0; i < LIMITS2.screenshots; i++) {
    if (i < shots.length) {
      await putJSON(env, "shot:" + appId + ":" + i, { mime: shots[i].mime, b64: toBase64(shots[i].bytes) });
    } else {
      await delKey(env, "shot:" + appId + ":" + i);
    }
  }
}
__name(saveScreenshots, "saveScreenshots");
async function getScreenshot(env, appId, index) {
  const rec = await getJSON(env, "shot:" + appId + ":" + index);
  if (!rec) return null;
  return { mime: rec.mime, bytes: fromBase64(rec.b64) };
}
__name(getScreenshot, "getScreenshot");
function toBase64(u8) {
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}
__name(toBase64, "toBase64");
function fromBase64(b642) {
  const bin = atob(b642);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
__name(fromBase64, "fromBase64");
function ratingOf(app) {
  const count = app.ratingCount || 0;
  const sum = app.ratingSum || 0;
  return {
    avg: count ? Number((sum / count).toFixed(2)) : 0,
    count,
    dist: app.ratingDist || [0, 0, 0, 0, 0]
  };
}
__name(ratingOf, "ratingOf");
function appSummary(app) {
  const rel = app.latestReleaseId ? {
    releaseId: app.latestReleaseId,
    version: app.latestVersion,
    size: app.latestSize || 0,
    sha256: app.latestSha256 || ""
  } : {};
  return {
    id: app.id,
    name: app.name,
    subtitle: app.subtitle || "",
    developer: app.developerName || "",
    developerId: app.developerId || "",
    category: app.category || "other",
    tags: app.tags || [],
    download_count: app.downloadCount || 0,
    latest_version: app.latestVersion || null,
    latest_version_id: app.latestReleaseId || null,
    releaseId: app.latestReleaseId || null,
    size: rel.size || 0,
    sha256: rel.sha256 || "",
    iconUrl: "/api/v1/apps/" + app.id + "/icon",
    rating: { avg: ratingOf(app).avg, count: ratingOf(app).count },
    published_at: app.publishedAt || null,
    channel: app.latestChannel || "stable",
    // 仅用于服务端搜索，返回给客户端前会被 stripItem 去掉
    _desc: String(app.description || "").slice(0, 240)
  };
}
__name(appSummary, "appSummary");
function stripItem(item) {
  const o = Object.assign({}, item);
  delete o._desc;
  return o;
}
__name(stripItem, "stripItem");
async function publicIndex(env, force) {
  if (!force) {
    const cached = await getJSON(env, "pub:index");
    if (cached && Array.isArray(cached.items) && Date.now() - cached.builtAt < 6e4) return cached;
  }
  const ids = await listAppIds(env);
  const apps = (await Promise.all(ids.slice(0, 300).map((id) => getApp(env, id)))).filter((a) => a && a.status === "published");
  const items = apps.map(appSummary);
  const idx = { builtAt: Date.now(), items };
  try {
    await putJSON(env, "pub:index", idx);
  } catch (e) {
  }
  return idx;
}
__name(publicIndex, "publicIndex");
async function invalidateIndex(env) {
  try {
    await delKey(env, "pub:index");
  } catch (e) {
  }
}
__name(invalidateIndex, "invalidateIndex");
async function bumpDownload(env, appId, releaseId) {
  try {
    const key = "dl:" + appId + ":" + releaseId;
    const last = await getJSON(env, key);
    if (last && Date.now() - last.at < 6e4) return;
    await putJSON(env, key, { at: Date.now() });
    const app = await getApp(env, appId);
    if (app) {
      app.downloadCount = (app.downloadCount || 0) + 1;
      await saveApp(env, app);
    }
    const rel = await getRelease(env, releaseId);
    if (rel) {
      rel.downloadCount = (rel.downloadCount || 0) + 1;
      await putJSON(env, "rel:" + releaseId, rel);
    }
    await invalidateIndex(env);
  } catch (e) {
  }
}
__name(bumpDownload, "bumpDownload");
async function addRating(env, appId, stars, comment, author) {
  const app = await getApp(env, appId);
  if (!app) return null;
  const sum = (app.ratingSum || 0) + stars;
  const count = (app.ratingCount || 0) + 1;
  const dist = Array.isArray(app.ratingDist) ? app.ratingDist.slice() : [0, 0, 0, 0, 0];
  while (dist.length < 5) dist.push(0);
  dist[stars - 1] = (dist[stars - 1] || 0) + 1;
  app.ratingSum = sum;
  app.ratingCount = count;
  app.ratingDist = dist;
  await saveApp(env, app);
  const list = await getJSON(env, "ratings:" + appId, []);
  const items = Array.isArray(list) ? list : [];
  items.unshift({
    ratingId: "rt_" + Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4),
    stars,
    comment: comment || "",
    author: author || "\u533F\u540D\u7528\u6237",
    createdAt: nowISO()
  });
  if (items.length > 200) items.length = 200;
  await putJSON(env, "ratings:" + appId, items);
  await invalidateIndex(env);
  return { summary: ratingOf(app), item: items[0] };
}
__name(addRating, "addRating");
async function ratingList(env, appId, limit) {
  const list = await getJSON(env, "ratings:" + appId, []);
  const items = Array.isArray(list) ? list : [];
  return items.slice(0, limit || 20);
}
__name(ratingList, "ratingList");

// src/v1/auth.js
var TOKEN_PREFIX = "n26_";
var TOKEN_RE = /^n26_[0-9a-f]{32}$/;
function hasScope(scopes, need) {
  const list = Array.isArray(scopes) ? scopes : [];
  return list.includes("*") || list.includes(need);
}
__name(hasScope, "hasScope");
async function requireDev(request, env, scope) {
  const auth = request.headers.get("Authorization") || "";
  const headerToken = (/^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "").trim() : "") || (request.headers.get("X-N26-Token") || "").trim();
  if (!headerToken) throw new ApiError("UNAUTHORIZED", 401, "\u7F3A\u5C11\u5F00\u53D1\u8005 Token");
  if (!TOKEN_RE.test(headerToken)) throw new ApiError("UNAUTHORIZED", 401, "Token \u683C\u5F0F\u65E0\u6548");
  const hash = await sha256Hex3(headerToken);
  const rec = await getJSON(env, "tok:" + hash);
  if (!rec) throw new ApiError("UNAUTHORIZED", 401, "Token \u65E0\u6548");
  if (rec.revokedAt) throw new ApiError("TOKEN_REVOKED", 401, "Token \u5DF2\u540A\u9500");
  const dev = await getJSON(env, "dev:" + rec.devId);
  if (!dev) throw new ApiError("UNAUTHORIZED", 401, "\u5F00\u53D1\u8005\u4E0D\u5B58\u5728");
  if (dev.status !== "active") throw new ApiError("FORBIDDEN", 403, "\u5F00\u53D1\u8005\u8D26\u53F7\u5DF2\u505C\u7528");
  if (scope && !hasScope(rec.scopes, scope)) {
    throw new ApiError("SCOPE_REQUIRED", 403, `\u9700\u8981 scope: ${scope}`, { required: scope, granted: rec.scopes || [] });
  }
  if (!rec.lastUsedAt || Date.now() - rec.lastUsedAt > 3e5) {
    rec.lastUsedAt = Date.now();
    try {
      await putJSON(env, "tok:" + hash, rec);
    } catch (e) {
    }
  }
  return { dev, token: rec, tokenHash: hash };
}
__name(requireDev, "requireDev");
function requireAdmin(request, env) {
  const expect = String(env.N26_ADMIN || env.STORE_ADMIN || "").trim();
  if (!expect) throw new ApiError("ADMIN_LOCKED", 503, "\u670D\u52A1\u7AEF\u672A\u914D\u7F6E STORE_ADMIN\uFF0C\u7BA1\u7406\u7AEF\u5DF2\u9501\u5B9A");
  const got = String(request.headers.get("X-N26-Admin") || "").trim();
  if (!got || got !== expect) throw new ApiError("ADMIN_UNAUTHORIZED", 401, "\u7BA1\u7406\u5458\u4EE4\u724C\u65E0\u6548");
  return { id: "admin" };
}
__name(requireAdmin, "requireAdmin");
async function issueToken(env, devId, name, scopes) {
  const plain = TOKEN_PREFIX + (await sha256Hex3(crypto.randomUUID() + Date.now())).slice(0, 32);
  const hash = await sha256Hex3(plain);
  const rec = {
    tokenId: "tk_" + hash.slice(0, 10),
    devId,
    name,
    scopes,
    createdAt: nowISO(),
    lastUsedAt: null,
    revokedAt: null
  };
  await putJSON(env, "tok:" + hash, rec);
  const idx = await getJSON(env, "tokidx:" + devId, []);
  const list = Array.isArray(idx) ? idx : [];
  list.unshift(hash);
  await putJSON(env, "tokidx:" + devId, list);
  return { plain, rec };
}
__name(issueToken, "issueToken");
async function revokeToken(env, devId, tokenId) {
  const idx = await getJSON(env, "tokidx:" + devId, []);
  const hashes = Array.isArray(idx) ? idx : [];
  for (const h of hashes) {
    const rec = await getJSON(env, "tok:" + h);
    if (!rec) continue;
    if (rec.tokenId !== tokenId) continue;
    if (rec.revokedAt) return rec;
    rec.revokedAt = nowISO();
    await putJSON(env, "tok:" + h, rec);
    return rec;
  }
  throw new ApiError("NOT_FOUND", 404, "Token \u4E0D\u5B58\u5728");
}
__name(revokeToken, "revokeToken");
async function listTokens(env, devId) {
  const idx = await getJSON(env, "tokidx:" + devId, []);
  const hashes = Array.isArray(idx) ? idx : [];
  const out = [];
  for (const h of hashes) {
    const rec = await getJSON(env, "tok:" + h);
    if (!rec) continue;
    out.push({
      tokenId: rec.tokenId,
      prefix: rec.tokenId.slice(0, 5) + "\u2026",
      name: rec.name,
      scopes: rec.scopes || [],
      createdAt: rec.createdAt,
      lastUsedAt: rec.lastUsedAt ? new Date(rec.lastUsedAt).toISOString() : null,
      revokedAt: rec.revokedAt || null
    });
  }
  return out;
}
__name(listTokens, "listTokens");

// src/v1/zip.js
var SIG_EOCD = 101010256;
var SIG_CD = 33639248;
var SIG_LOCAL = 67324752;
function u16(dv, off) {
  return dv.getUint16(off, true);
}
__name(u16, "u16");
function u32(dv, off) {
  return dv.getUint32(off, true);
}
__name(u32, "u32");
function fail2(msg) {
  throw new ApiError("BAD_ZIP", 400, msg || "zip \u7ED3\u6784\u635F\u574F");
}
__name(fail2, "fail");
function listZip(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.length < 22) fail2("\u6587\u4EF6\u8FC7\u5C0F\uFF0C\u4E0D\u662F zip");
  let eocd = -1;
  const stop = Math.max(0, u8.length - 22 - 65535);
  for (let i = u8.length - 22; i >= stop; i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail2("\u627E\u4E0D\u5230 zip \u76EE\u5F55\u7ED3\u6784");
  const count = u16(dv, eocd + 10);
  const cdOffset = u32(dv, eocd + 16);
  if (count === 65535 || cdOffset === 4294967295) fail2("\u4E0D\u652F\u6301 ZIP64");
  if (count > LIMITS2.files) {
    const err = new ApiError("TOO_MANY_FILES", 413, `\u6587\u4EF6\u6570\u8D85\u8FC7\u4E0A\u9650\uFF08${LIMITS2.files}\uFF09`);
    throw err;
  }
  if (cdOffset > u8.length) fail2("\u4E2D\u592E\u76EE\u5F55\u504F\u79FB\u8D8A\u754C");
  const entries = [];
  let p = cdOffset;
  let unpacked = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > u8.length || u32(dv, p) !== SIG_CD) fail2("\u4E2D\u592E\u76EE\u5F55\u6761\u76EE\u635F\u574F");
    const flags = u16(dv, p + 8);
    const method = u16(dv, p + 10);
    const csize = u32(dv, p + 20);
    const usize = u32(dv, p + 24);
    const nameLen = u16(dv, p + 28);
    const extraLen = u16(dv, p + 30);
    const cmtLen = u16(dv, p + 32);
    const offset = u32(dv, p + 42);
    if (csize === 4294967295 || usize === 4294967295 || offset === 4294967295) fail2("\u4E0D\u652F\u6301 ZIP64");
    const rawName = u8.subarray(p + 46, p + 46 + nameLen);
    const name = new TextDecoder("utf-8").decode(rawName);
    if (p + 46 + nameLen + extraLen + cmtLen > u8.length) fail2("\u4E2D\u592E\u76EE\u5F55\u8D8A\u754C");
    unpacked += usize;
    if (unpacked > LIMITS2.unpackedBytes) {
      throw new ApiError("PACKAGE_TOO_LARGE", 413, "\u89E3\u538B\u540E\u4F53\u79EF\u8D85\u8FC7\u4E0A\u9650");
    }
    entries.push({ name, method, csize, usize, offset, flags });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  for (const e of entries) {
    if (e.usize > 1024 * 1024 && e.csize > 0 && e.usize / e.csize > 100) {
      fail2("\u538B\u7F29\u6BD4\u5F02\u5E38\uFF0C\u7591\u4F3C zip bomb");
    }
    if (e.usize > LIMITS2.packageBytes) {
      throw new ApiError("PACKAGE_TOO_LARGE", 413, "\u5355\u6587\u4EF6\u89E3\u538B\u540E\u8D85\u8FC7 64MB");
    }
  }
  return { entries, u8, dv };
}
__name(listZip, "listZip");
async function inflateRaw(bytes) {
  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
__name(inflateRaw, "inflateRaw");
async function readEntry(zip, entry, maxBytes) {
  if (maxBytes && entry.usize > maxBytes) {
    throw new ApiError("PACKAGE_TOO_LARGE", 413, `\u6761\u76EE ${entry.name} \u8D85\u8FC7\u5927\u5C0F\u4E0A\u9650`);
  }
  const { u8, dv } = zip;
  const off = entry.offset;
  if (off + 30 > u8.length || dv.getUint32(off, true) !== SIG_LOCAL) fail2("\u6761\u76EE\u672C\u5730\u5934\u635F\u574F");
  const nameLen = u16(dv, off + 26);
  const extraLen = u16(dv, off + 28);
  const start = off + 30 + nameLen + extraLen;
  const end = start + entry.csize;
  if (end > u8.length) fail2("\u6761\u76EE\u6570\u636E\u8D8A\u754C");
  const data = u8.subarray(start, end);
  if (entry.method === 0) return new Uint8Array(data);
  if (entry.method === 8) return inflateRaw(data);
  throw new ApiError("BAD_ZIP", 400, `\u4E0D\u652F\u6301\u7684\u538B\u7F29\u7B97\u6CD5\uFF08method=${entry.method}\uFF09`);
}
__name(readEntry, "readEntry");
var CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 4294967295;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
__name(crc32, "crc32");
function dosTime(d) {
  const time = (d.getHours() & 31) << 11 | (d.getMinutes() & 63) << 5 | Math.floor(d.getSeconds() / 2) & 31;
  const date = (d.getFullYear() - 1980 & 127) << 9 | (d.getMonth() + 1 & 15) << 5 | d.getDate() & 31;
  return { time, date };
}
__name(dosTime, "dosTime");
function buildZip(files, now) {
  const d = now || /* @__PURE__ */ new Date();
  const { time, date } = dosTime(d);
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = new TextEncoder().encode(f.name);
    const data = f.bytes;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, SIG_LOCAL, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 2048, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, time, true);
    dv.setUint16(12, date, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    chunks.push(local, data);
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, SIG_CD, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 2048, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += local.length + data.length;
  }
  let cdSize = 0;
  for (const c of central) cdSize += c.length;
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, SIG_EOCD, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);
  const all = chunks.concat(central, [eocd]);
  let total = 0;
  for (const c of all) total += c.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of all) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
__name(buildZip, "buildZip");

// src/v1/pkg.js
var MIME = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  map: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  wasm: "application/wasm",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp4: "video/mp4",
  webm: "video/webm"
};
var OK_EXT2 = new Set(Object.keys(MIME));
var SKIP = /(__MACOSX\/|^\.DS_Store$|\/\.DS_Store$|^Thumbs\.db$)/i;
function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}
__name(extOf, "extOf");
function mimeOf(name) {
  return MIME[extOf(name)] || "application/octet-stream";
}
__name(mimeOf, "mimeOf");
function safePath(raw) {
  let name = String(raw == null ? "" : raw);
  if (!name) throw new ApiError("UNSAFE_PATH", 400, "\u5305\u5185\u5B58\u5728\u7A7A\u6587\u4EF6\u540D");
  if (name.length > 200) throw new ApiError("UNSAFE_PATH", 400, "\u8DEF\u5F84\u8FC7\u957F\uFF08>200\uFF09");
  if (name.startsWith("/") || name.startsWith("\\")) throw new ApiError("UNSAFE_PATH", 400, `\u7981\u6B62\u7EDD\u5BF9\u8DEF\u5F84\uFF1A${name}`);
  if (name.includes("\\")) throw new ApiError("UNSAFE_PATH", 400, `\u7981\u6B62\u53CD\u659C\u6760\uFF1A${name}`);
  if (/^[a-zA-Z]:/.test(name)) throw new ApiError("UNSAFE_PATH", 400, `\u7981\u6B62\u76D8\u7B26\uFF1A${name}`);
  if (/[\u0000-\u001f]/.test(name)) throw new ApiError("UNSAFE_PATH", 400, "\u8DEF\u5F84\u542B\u63A7\u5236\u5B57\u7B26");
  const segs = name.split("/");
  for (const s of segs) {
    if (s === ".." || s === "." || s === "") throw new ApiError("UNSAFE_PATH", 400, `\u975E\u6CD5\u8DEF\u5F84\u6BB5\uFF1A${name}`);
  }
  return name;
}
__name(safePath, "safePath");
function isSkippable(name) {
  return SKIP.test(name);
}
__name(isSkippable, "isSkippable");
function normalizeManifest(raw, pathAppId, fallbackVersion) {
  if (!raw || typeof raw !== "object") throw new ApiError("INVALID_MANIFEST", 400, "manifest \u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  const id = String(raw.id || "").trim();
  if (!APP_ID_RE.test(id)) throw new ApiError("INVALID_MANIFEST", 400, "manifest.id \u4E0D\u7B26\u5408\u547D\u540D\u89C4\u5219\uFF08^[a-z0-9][a-z0-9._-]{2,63}$\uFF09", { field: "id" });
  if (pathAppId && id !== pathAppId) {
    throw new ApiError("APP_ID_MISMATCH", 400, `manifest.id(${id}) \u4E0E\u8BF7\u6C42\u8DEF\u5F84(${pathAppId}) \u4E0D\u4E00\u81F4`);
  }
  const name = clip(raw.name, 60);
  if (!name) throw new ApiError("INVALID_MANIFEST", 400, "manifest.name \u7F3A\u5931", { field: "name" });
  let version = String(raw.version || fallbackVersion || "1.0.0").trim();
  if (!SEMVER_RE.test(version)) {
    throw new ApiError("INVALID_MANIFEST", 400, `\u7248\u672C\u53F7\u4E0D\u7B26\u5408 semver\uFF1A${version}`, { field: "version" });
  }
  version = version.slice(0, 64);
  const entry = clip(raw.entry || raw.main, 200);
  const category = CATEGORIES.includes(String(raw.category || "").toLowerCase()) ? String(raw.category).toLowerCase() : "other";
  const permissions = Array.isArray(raw.permissions) ? raw.permissions.map((p) => String(p)).filter((p) => /^[a-z][a-z0-9:._-]{1,31}$/i.test(p)).slice(0, 16) : [];
  const minOsVersion = /^\d+(\.\d+){0,3}$/.test(String(raw.minOsVersion || "")) ? String(raw.minOsVersion).slice(0, 16) : null;
  const screenshots = Array.isArray(raw.screenshots) ? raw.screenshots.map((s) => String(s)).filter(Boolean).slice(0, LIMITS2.screenshots) : [];
  let i18n = {};
  if (raw.i18n && typeof raw.i18n === "object" && !Array.isArray(raw.i18n)) {
    const keys = Object.keys(raw.i18n).slice(0, 12);
    for (const k of keys) {
      const v = raw.i18n[k];
      if (!v || typeof v !== "object") continue;
      i18n[k.slice(0, 20)] = {
        name: clip(v.name, 60) || void 0,
        description: clip(v.description, 4e3) || void 0
      };
    }
    if (!keys.length) i18n = {};
  }
  return {
    id,
    name,
    subtitle: clip(raw.subtitle, 80),
    version,
    entry,
    icon: clip(raw.icon, 200),
    category,
    description: clip(raw.description, 4e3),
    author: clip(raw.author || raw.developer, 60),
    tags: normalizeTagList(raw.tags, 8, 16),
    permissions,
    minOsVersion,
    screenshots,
    i18n
  };
}
__name(normalizeManifest, "normalizeManifest");
function findIcon(manifest, names) {
  const candidates = [manifest.icon, "assets/svg.png", "icon.png", "assets/icon.png", "icon.svg", "assets/icon.svg"].filter(Boolean);
  for (const c of candidates) {
    const n = c.replace(/^\.?\//, "");
    if (names.has(n)) return n;
  }
  return null;
}
__name(findIcon, "findIcon");
function pickEntry(manifest, names, warnings) {
  if (manifest.entry) {
    const n = manifest.entry.replace(/^\.?\//, "");
    if (!names.has(n)) throw new ApiError("ENTRY_MISSING", 400, `\u5165\u53E3\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${manifest.entry}`, { field: "entry" });
    return n;
  }
  if (names.has("app.bin")) {
    warnings.push("manifest \u672A\u58F0\u660E entry\uFF0C\u6309 MxOS \u7EA6\u5B9A\u4F7F\u7528 app.bin");
    return "app.bin";
  }
  if (names.has("index.html")) {
    warnings.push("manifest \u672A\u58F0\u660E entry\uFF0C\u56DE\u9000 index.html");
    return "index.html";
  }
  throw new ApiError("INVALID_MANIFEST", 400, "manifest.entry \u7F3A\u5931\u4E14\u5305\u5185\u6CA1\u6709 app.bin / index.html", { field: "entry" });
}
__name(pickEntry, "pickEntry");
function checkExt(name, entryName) {
  const ext = extOf(name);
  if (ext === "") {
    if (name === "app.bin" || name === entryName) return;
    throw new ApiError("UNSUPPORTED_TYPE", 415, `\u6587\u4EF6\u6CA1\u6709\u6269\u5C55\u540D\uFF1A${name}`);
  }
  if (!OK_EXT2.has(ext)) throw new ApiError("UNSUPPORTED_TYPE", 415, `\u4E0D\u652F\u6301\u7684\u6269\u5C55\u540D .${ext}\uFF1A${name}`);
}
__name(checkExt, "checkExt");
async function buildPackage(opts) {
  const warnings = [];
  const appId = opts.appId || null;
  if (opts.file) {
    const f = opts.file;
    const name = String(f.name || "upload");
    const size = f.size || 0;
    if (size > LIMITS2.packageBytes) throw new ApiError("PACKAGE_TOO_LARGE", 413, "\u5B89\u88C5\u5305\u8D85\u8FC7 64MB \u4E0A\u9650");
    const head = new Uint8Array(await (await f.slice(0, 4).arrayBuffer()).buffer);
    const looksZip = head[0] === 80 && head[1] === 75;
    const ext = extOf(name);
    if (looksZip || ext === "zip" || ext === "mx") {
      const bytes = new Uint8Array(await f.arrayBuffer());
      return await parseZipPackage(bytes, appId, opts.manifestText, warnings, opts.versionFallback);
    }
    if (ext === "html" || ext === "htm") {
      return await parseHtmlPackage(name, new Uint8Array(await f.arrayBuffer()), appId, opts.manifestText, warnings, opts.versionFallback);
    }
    throw new ApiError("UNSUPPORTED_TYPE", 415, `\u53EA\u63A5\u53D7 .zip / .mx / .html \u5355\u6587\u4EF6\uFF0C\u6536\u5230 ${name}`);
  }
  if (opts.files && opts.files.length) {
    return await parseDirPackage(opts.files, appId, opts.manifestText, warnings, opts.versionFallback);
  }
  throw new ApiError("BAD_REQUEST", 400, "\u7F3A\u5C11\u4E0A\u4F20\u5185\u5BB9\uFF1A\u9700\u8981 file \u6216 files \u5B57\u6BB5");
}
__name(buildPackage, "buildPackage");
async function parseZipPackage(bytes, appId, manifestText, warnings, versionFallback) {
  const zip = listZip(bytes);
  const byName = /* @__PURE__ */ new Map();
  for (const e of zip.entries) {
    if (e.name.endsWith("/")) continue;
    if (isSkippable(e.name)) continue;
    const n = safePath(e.name.replace(/\\/g, "/"));
    byName.set(n, e);
  }
  if (!byName.size) throw new ApiError("BAD_ZIP", 400, "zip \u5185\u6CA1\u6709\u4EFB\u4F55\u6587\u4EF6");
  const mEntry = byName.get("manifest.json");
  if (!mEntry) throw new ApiError("MANIFEST_MISSING", 400, "\u5305\u6839\u76EE\u5F55\u7F3A\u5C11 manifest.json");
  if (mEntry.usize > LIMITS2.manifestBytes) throw new ApiError("INVALID_MANIFEST", 400, "manifest.json \u8D85\u8FC7 64KB");
  const mBytes = await readEntry(zip, mEntry, LIMITS2.manifestBytes);
  let rawManifest;
  try {
    rawManifest = JSON.parse(new TextDecoder("utf-8").decode(mBytes));
  } catch (e) {
    throw new ApiError("INVALID_MANIFEST", 400, "manifest.json \u4E0D\u662F\u5408\u6CD5 JSON");
  }
  if (manifestText) warnings.push("\u5305\u5185 manifest.json \u4F18\u5148\u4E8E\u8868\u5355\u5B57\u6BB5");
  const manifest = normalizeManifest(rawManifest, appId, versionFallback);
  const entry = pickEntry(manifest, byName, warnings);
  checkExt(entry, entry);
  let total = 0;
  for (const [n, e] of byName) {
    total += e.usize;
    if (n !== "manifest.json") checkExt(n, entry);
  }
  if (total > LIMITS2.unpackedBytes) throw new ApiError("PACKAGE_TOO_LARGE", 413, "\u89E3\u538B\u540E\u603B\u4F53\u79EF\u8D85\u9650");
  const iconName = findIcon(manifest, byName);
  let icon = null;
  if (iconName) {
    const e = byName.get(iconName);
    if (e.usize > LIMITS2.iconBytes) throw new ApiError("ICON_TOO_LARGE", 413, "\u56FE\u6807\u8D85\u8FC7 512KB");
    const b = await readEntry(zip, e, LIMITS2.iconBytes);
    icon = { name: iconName, mime: mimeOf(iconName), bytes: b };
  }
  const shots = [];
  for (let i = 0; i < manifest.screenshots.length; i++) {
    const raw = manifest.screenshots[i].replace(/^\.?\//, "");
    const e = byName.get(raw);
    if (!e) {
      warnings.push(`\u622A\u56FE\u4E0D\u5B58\u5728\uFF0C\u5DF2\u8DF3\u8FC7\uFF1A${raw}`);
      continue;
    }
    if (e.usize > LIMITS2.screenshotBytes) throw new ApiError("SCREENSHOT_TOO_LARGE", 413, `\u622A\u56FE\u8D85\u8FC7 2MB\uFF1A${raw}`);
    const ext = extOf(raw);
    if (!["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
      throw new ApiError("UNSUPPORTED_TYPE", 415, `\u622A\u56FE\u683C\u5F0F\u4E0D\u652F\u6301\uFF1A${raw}`);
    }
    shots.push({ mime: mimeOf(raw), bytes: await readEntry(zip, e, LIMITS2.screenshotBytes) });
  }
  return { format: "zip", bytes, manifest, entry, fileCount: byName.size, icon, screenshots: shots, warnings };
}
__name(parseZipPackage, "parseZipPackage");
async function parseHtmlPackage(filename, bytes, appId, manifestText, warnings, versionFallback) {
  if (bytes.length > LIMITS2.packageBytes) throw new ApiError("PACKAGE_TOO_LARGE", 413, "\u5B89\u88C5\u5305\u8D85\u8FC7 64MB \u4E0A\u9650");
  if (!manifestText) throw new ApiError("MANIFEST_MISSING", 400, "\u5355\u6587\u4EF6 HTML \u4E0A\u4F20\u5FC5\u987B\u540C\u65F6\u63D0\u4F9B manifest \u8868\u5355\u5B57\u6BB5");
  let rawManifest;
  try {
    rawManifest = JSON.parse(manifestText);
  } catch (e) {
    throw new ApiError("INVALID_MANIFEST", 400, "manifest \u8868\u5355\u5B57\u6BB5\u4E0D\u662F\u5408\u6CD5 JSON");
  }
  const manifest = normalizeManifest(rawManifest, appId, versionFallback);
  const base = safePath(String(filename).split("/").pop());
  if (!/\.html?$/i.test(base)) throw new ApiError("UNSUPPORTED_TYPE", 415, "\u5355\u6587\u4EF6\u5FC5\u987B\u662F .html / .htm");
  manifest.entry = base;
  manifest.icon = "";
  const icon = null;
  const shots = [];
  if (manifest.screenshots.length) warnings.push("\u5355\u6587\u4EF6 HTML \u65E0\u5916\u90E8\u622A\u56FE\uFF0C\u5DF2\u5FFD\u7565 manifest.screenshots");
  manifest.screenshots = [];
  return { format: "html", bytes, manifest, entry: base, fileCount: 1, icon, screenshots: shots, warnings };
}
__name(parseHtmlPackage, "parseHtmlPackage");
async function parseDirPackage(files, appId, manifestText, warnings, versionFallback) {
  if (!manifestText) throw new ApiError("MANIFEST_MISSING", 400, "\u76EE\u5F55\u4E0A\u4F20\u5FC5\u987B\u540C\u65F6\u63D0\u4F9B manifest \u8868\u5355\u5B57\u6BB5");
  let rawManifest;
  try {
    rawManifest = JSON.parse(manifestText);
  } catch (e) {
    throw new ApiError("INVALID_MANIFEST", 400, "manifest \u8868\u5355\u5B57\u6BB5\u4E0D\u662F\u5408\u6CD5 JSON");
  }
  const manifest = normalizeManifest(rawManifest, appId, versionFallback);
  if (files.length > LIMITS2.files) throw new ApiError("TOO_MANY_FILES", 413, `\u6587\u4EF6\u6570\u8D85\u8FC7\u4E0A\u9650\uFF08${LIMITS2.files}\uFF09`);
  const map = /* @__PURE__ */ new Map();
  let total = 0;
  for (const f of files) {
    const name = safePath(String(f.name || "").replace(/\\/g, "/").replace(/^\.?\//, ""));
    if (isSkippable(name)) continue;
    if (name === "manifest.json") {
      warnings.push("\u8868\u5355\u5DF2\u63D0\u4F9B manifest\uFF0C\u5FFD\u7565\u540C\u540D\u6587\u4EF6");
      continue;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    total += bytes.length;
    if (total > LIMITS2.packageBytes) throw new ApiError("PACKAGE_TOO_LARGE", 413, "\u4E0A\u4F20\u5185\u5BB9\u8D85\u8FC7 64MB \u4E0A\u9650");
    map.set(name, { bytes, mime: mimeOf(name) });
  }
  if (!map.size) throw new ApiError("BAD_REQUEST", 400, "\u76EE\u5F55\u91CC\u6CA1\u6709\u4EFB\u4F55\u6587\u4EF6");
  const names = new Set(map.keys());
  const entry = pickEntry(manifest, names, warnings);
  const zipFiles = [];
  zipFiles.push({ name: "manifest.json", bytes: new TextEncoder().encode(JSON.stringify(Object.assign({}, manifest, { entry }))) });
  for (const [name, f] of map) {
    checkExt(name, entry);
    zipFiles.push({ name, bytes: f.bytes });
  }
  const zipBytes = buildZip(zipFiles);
  const iconName = findIcon(manifest, names);
  let icon = null;
  if (iconName) {
    const f = map.get(iconName);
    if (f.bytes.length > LIMITS2.iconBytes) throw new ApiError("ICON_TOO_LARGE", 413, "\u56FE\u6807\u8D85\u8FC7 512KB");
    icon = { name: iconName, mime: f.mime, bytes: f.bytes };
  }
  const shots = [];
  for (const raw of manifest.screenshots) {
    const n = raw.replace(/^\.?\//, "");
    const f = map.get(n);
    if (!f) {
      warnings.push(`\u622A\u56FE\u4E0D\u5B58\u5728\uFF0C\u5DF2\u8DF3\u8FC7\uFF1A${raw}`);
      continue;
    }
    if (f.bytes.length > LIMITS2.screenshotBytes) throw new ApiError("SCREENSHOT_TOO_LARGE", 413, `\u622A\u56FE\u8D85\u8FC7 2MB\uFF1A${raw}`);
    shots.push({ mime: f.mime, bytes: f.bytes });
  }
  return { format: "dir", bytes: zipBytes, manifest, entry, fileCount: map.size + 1, icon, screenshots: shots, warnings };
}
__name(parseDirPackage, "parseDirPackage");

// src/v1/dev.js
function serializeRelease(rel, full) {
  const out = {
    version: rel.version,
    releaseId: rel.releaseId,
    channel: rel.channel,
    status: rel.status,
    size: rel.size,
    sha256: rel.sha256,
    fileCount: rel.fileCount,
    release_notes: rel.releaseNotes || "",
    force_update: !!rel.forceUpdate,
    uploaded_at: rel.uploadedAt,
    submitted_at: rel.submittedAt || null,
    published_at: rel.publishedAt || null
  };
  if (full) {
    out.appId = rel.appId;
    out.format = rel.format;
    out.entry = rel.entry;
    out.manifest = rel.manifest;
    out.review = rel.review || null;
  } else if (rel.review && rel.review.status !== "approved") {
    out.review = rel.review;
  }
  return out;
}
__name(serializeRelease, "serializeRelease");
function serializeApp(app) {
  return {
    id: app.id,
    name: app.name,
    subtitle: app.subtitle || "",
    developer: app.developerName || "",
    developerId: app.developerId,
    category: app.category,
    tags: app.tags || [],
    description: app.description || "",
    status: app.status,
    latestVersion: app.latestVersion || null,
    latestChannel: app.latestChannel || null,
    downloadCount: app.downloadCount || 0,
    rating: { avg: app.ratingCount ? Number(((app.ratingSum || 0) / app.ratingCount).toFixed(2)) : 0, count: app.ratingCount || 0 },
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    publishedAt: app.publishedAt || null
  };
}
__name(serializeApp, "serializeApp");
async function loadOwnApp(env, appId, devId) {
  if (!APP_ID_RE.test(appId)) throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  const app = await getApp(env, appId);
  if (!app) throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  if (app.developerId !== devId) throw new ApiError("FORBIDDEN", 403, "\u65E0\u6743\u64CD\u4F5C\u8BE5\u5E94\u7528");
  return app;
}
__name(loadOwnApp, "loadOwnApp");
async function getMe(request, env) {
  const { dev, token } = await requireDev(request, env, "app:read");
  const apps = await devAppCount(env, dev.devId);
  return json6({
    developer: {
      devId: dev.devId,
      type: dev.type,
      name: dev.name,
      email: dev.email || "",
      status: dev.status,
      appLimit: dev.appLimit || LIMITS2.appsPerDev,
      webhookUrl: dev.webhookUrl || null,
      createdAt: dev.createdAt
    },
    token: { tokenId: token.tokenId, name: token.name, scopes: token.scopes || [] },
    usage: { apps, appLimit: dev.appLimit || LIMITS2.appsPerDev }
  });
}
__name(getMe, "getMe");
async function patchMe(request, env) {
  const { dev } = await requireDev(request, env, "app:write");
  const body = await readJSON(request);
  if (body.name !== void 0) {
    const name = clip(body.name, 60);
    if (!name) throw new ApiError("BAD_REQUEST", 400, "name \u4E0D\u80FD\u4E3A\u7A7A");
    dev.name = name;
  }
  if (body.email !== void 0) dev.email = clip(body.email, 120);
  if (body.webhookUrl !== void 0) {
    if (body.webhookUrl === null || body.webhookUrl === "") {
      dev.webhookUrl = "";
      dev.webhookSecret = "";
    } else {
      const u = String(body.webhookUrl);
      let parsed;
      try {
        parsed = new URL(u);
      } catch (e) {
        throw new ApiError("BAD_REQUEST", 400, "webhookUrl \u4E0D\u662F\u5408\u6CD5 URL");
      }
      if (parsed.protocol !== "https:") throw new ApiError("BAD_REQUEST", 400, "webhookUrl \u5FC5\u987B\u662F https");
      dev.webhookUrl = u.slice(0, 300);
      if (!dev.webhookSecret) dev.webhookSecret = (await sha256Hex3(crypto.randomUUID() + Date.now())).slice(0, 32);
    }
  }
  dev.updatedAt = nowISO();
  await putJSON(env, "dev:" + dev.devId, dev);
  await appendAudit(env, { actor: { type: "developer", id: dev.devId }, action: "dev.patch", target: dev.devId });
  return getMe(request, env);
}
__name(patchMe, "patchMe");
async function createApp(request, env) {
  const { dev } = await requireDev(request, env, "app:write");
  const body = await readJSON(request);
  const appId = String(body.appId || body.id || "").trim();
  if (!APP_ID_RE.test(appId)) throw new ApiError("INVALID_APP_ID", 400, "appId \u5FC5\u987B\u662F 3-64 \u4F4D\u5C0F\u5199\u5B57\u6BCD/\u6570\u5B57/._-\uFF0C\u4E14\u4EE5\u5B57\u6BCD\u6216\u6570\u5B57\u5F00\u5934");
  const name = clip(body.name, 60);
  if (!name) throw new ApiError("BAD_REQUEST", 400, "name \u4E0D\u80FD\u4E3A\u7A7A");
  if (await getApp(env, appId)) throw new ApiError("APP_EXISTS", 409, "appId \u5DF2\u88AB\u5360\u7528");
  const limit = dev.appLimit || LIMITS2.appsPerDev;
  if (await devAppCount(env, dev.devId) >= limit) {
    throw new ApiError("QUOTA_EXCEEDED", 429, `\u5E94\u7528\u6570\u91CF\u8FBE\u5230\u4E0A\u9650\uFF08${limit}\uFF09`, { limit });
  }
  const category = CATEGORIES.includes(String(body.category || "").toLowerCase()) ? String(body.category).toLowerCase() : "other";
  const app = {
    id: appId,
    name,
    subtitle: clip(body.subtitle, 80),
    developerId: dev.devId,
    developerName: clip(dev.name, 60),
    category,
    tags: normalizeTagList(body.tags, 8, 16),
    description: clip(body.description, 4e3),
    status: "draft",
    latestVersion: null,
    latestChannel: null,
    downloadCount: 0,
    ratingSum: 0,
    ratingCount: 0,
    ratingDist: [0, 0, 0, 0, 0],
    createdAt: nowISO(),
    updatedAt: nowISO(),
    publishedAt: null
  };
  await saveApp(env, app);
  await addAppId(env, appId);
  await addDevAppId(env, dev.devId, appId);
  await appendAudit(env, { actor: { type: "developer", id: dev.devId }, action: "app.create", target: appId });
  return json6({ app: serializeApp(app) }, 201);
}
__name(createApp, "createApp");
async function listMyApps(request, env, url) {
  const { dev } = await requireDev(request, env, "app:read");
  const p = pagination(url);
  const status = url.searchParams.get("status");
  const ids = await listDevAppIds(env, dev.devId);
  const apps = (await Promise.all(ids.map((id) => getApp(env, id)))).filter(Boolean);
  const filtered = status ? apps.filter((a) => a.status === status) : apps;
  return json6({
    items: pageSlice(filtered, p).map(serializeApp),
    page: p.page,
    page_size: p.pageSize,
    total: filtered.length
  });
}
__name(listMyApps, "listMyApps");
async function getMyApp(request, env, appId) {
  const { dev } = await requireDev(request, env, "app:read");
  const app = await loadOwnApp(env, appId, dev.devId);
  const rels = await listReleases(env, appId);
  return json6({
    app: serializeApp(app),
    releases: rels.map((r) => serializeRelease(r, true))
  });
}
__name(getMyApp, "getMyApp");
async function patchApp(request, env, appId) {
  const { dev } = await requireDev(request, env, "app:write");
  const app = await loadOwnApp(env, appId, dev.devId);
  const body = await readJSON(request);
  if (body.name !== void 0) {
    const name = clip(body.name, 60);
    if (!name) throw new ApiError("BAD_REQUEST", 400, "name \u4E0D\u80FD\u4E3A\u7A7A");
    app.name = name;
  }
  if (body.subtitle !== void 0) app.subtitle = clip(body.subtitle, 80);
  if (body.description !== void 0) app.description = clip(body.description, 4e3);
  if (body.category !== void 0) {
    const c = String(body.category).toLowerCase();
    if (!CATEGORIES.includes(c)) throw new ApiError("INVALID_CATEGORY", 400, "\u5206\u7C7B\u4E0D\u5728\u679A\u4E3E\u5185", { category: body.category });
    app.category = c;
  }
  if (body.tags !== void 0) app.tags = normalizeTagList(body.tags, 8, 16);
  if (body.developerName !== void 0) app.developerName = clip(body.developerName, 60) || app.developerName;
  await saveApp(env, app);
  await invalidateIndex(env);
  await appendAudit(env, { actor: { type: "developer", id: dev.devId }, action: "app.patch", target: appId });
  return json6({ app: serializeApp(app) });
}
__name(patchApp, "patchApp");
async function uploadRelease(request, env, appId) {
  const { dev, token } = await requireDev(request, env, "release:publish");
  const app = await loadOwnApp(env, appId, dev.devId);
  if (app.status === "unpublished") throw new ApiError("APP_TAKEDOWN", 403, "\u5E94\u7528\u5DF2\u4E0B\u67B6\uFF0C\u7981\u6B62\u4E0A\u4F20");
  await rateLimitKV(env, "upload", token.tokenId, 10, 3600);
  const rels = await listReleaseIds(env, appId);
  if (rels.length >= LIMITS2.releasesPerApp) {
    throw new ApiError("QUOTA_EXCEEDED", 429, `\u5355\u5E94\u7528\u7248\u672C\u6570\u8FBE\u5230\u4E0A\u9650\uFF08${LIMITS2.releasesPerApp}\uFF09`, { limit: LIMITS2.releasesPerApp });
  }
  let form;
  try {
    form = await request.formData();
  } catch (e) {
    throw new ApiError("BAD_REQUEST", 400, "\u8BF7\u6C42\u4E0D\u662F\u5408\u6CD5 multipart/form-data");
  }
  const file = form.get("file");
  const files = form.getAll("files");
  const manifestText = form.get("manifest") ? String(form.get("manifest")) : "";
  const channel = String(form.get("channel") || "stable");
  if (!["stable", "beta"].includes(channel)) throw new ApiError("INVALID_CHANNEL", 400, "channel \u5FC5\u987B\u662F stable / beta");
  const releaseNotes = clip(form.get("release_notes"), 1e3);
  const forceUpdate = String(form.get("force_update") || "") === "true";
  const versionFallback = form.get("version") ? String(form.get("version")).trim() : "";
  const pkg = await buildPackage({
    file: file && typeof file === "object" ? file : null,
    files: files.filter((f) => f && typeof f === "object"),
    manifestText,
    appId,
    versionFallback,
    channel
  });
  if (pkg.manifest.version.includes("-") && channel === "stable") {
    throw new ApiError("INVALID_CHANNEL", 400, "\u9884\u53D1\u5E03\u7248\u672C\u53EA\u80FD\u53D1\u5E03\u5230 beta \u901A\u9053");
  }
  const releaseId = appId + "@" + pkg.manifest.version;
  if (await getRelease(env, releaseId)) {
    throw new ApiError("VERSION_EXISTS", 409, `\u7248\u672C\u5DF2\u5B58\u5728\uFF1A${releaseId}`, { releaseId });
  }
  const sha256 = await sha256Hex3(pkg.bytes);
  const chunks = await putBlob(env, releaseId, pkg.bytes);
  const rel = {
    releaseId,
    appId,
    version: pkg.manifest.version,
    channel,
    status: "draft",
    format: pkg.format,
    entry: pkg.entry,
    size: pkg.bytes.length,
    sha256,
    chunks,
    fileCount: pkg.fileCount,
    manifest: pkg.manifest,
    releaseNotes,
    forceUpdate,
    downloadCount: 0,
    uploadedAt: nowISO(),
    submittedAt: null,
    publishedAt: null,
    review: { status: "draft", reason: null, reviewer: null, submittedAt: null, reviewedAt: null },
    storage: "kv-chunks"
  };
  await saveRelease(env, rel);
  await addReleaseId(env, appId, releaseId);
  await saveIcon(env, releaseId, pkg.icon);
  await saveScreenshots(env, releaseId, pkg.screenshots);
  if (app.status === "draft") {
    app.name = pkg.manifest.name || app.name;
    app.subtitle = pkg.manifest.subtitle || app.subtitle;
    app.category = pkg.manifest.category || app.category;
    app.tags = pkg.manifest.tags && pkg.manifest.tags.length ? pkg.manifest.tags : app.tags;
    app.description = pkg.manifest.description || app.description;
    await saveApp(env, app);
  }
  await appendAudit(env, {
    actor: { type: "developer", id: dev.devId },
    action: "release.upload",
    target: releaseId,
    ip: clientIP(request)
  });
  return json6({
    release: serializeRelease(rel, true),
    manifest: pkg.manifest,
    warnings: pkg.warnings
  }, 201);
}
__name(uploadRelease, "uploadRelease");
async function listMyReleases(request, env, appId) {
  const { dev } = await requireDev(request, env, "app:read");
  await loadOwnApp(env, appId, dev.devId);
  const rels = await listReleases(env, appId);
  return json6({
    appId,
    items: rels.map((r) => serializeRelease(r, false))
  });
}
__name(listMyReleases, "listMyReleases");
async function getMyRelease(request, env, releaseId) {
  const { dev } = await requireDev(request, env, "review:read");
  const rel = await getRelease(env, releaseId);
  if (!rel) throw new ApiError("RELEASE_NOT_FOUND", 404, "\u7248\u672C\u4E0D\u5B58\u5728");
  if (rel.appId) await loadOwnApp(env, rel.appId, dev.devId);
  return json6({ release: serializeRelease(rel, true), review: rel.review || null });
}
__name(getMyRelease, "getMyRelease");
async function submitRelease(request, env, releaseId) {
  const { dev } = await requireDev(request, env, "release:publish");
  const rel = await getRelease(env, releaseId);
  if (!rel) throw new ApiError("RELEASE_NOT_FOUND", 404, "\u7248\u672C\u4E0D\u5B58\u5728");
  const app = await loadOwnApp(env, rel.appId, dev.devId);
  if (app.status === "unpublished") throw new ApiError("APP_TAKEDOWN", 403, "\u5E94\u7528\u5DF2\u4E0B\u67B6\uFF0C\u7981\u6B62\u63D0\u4EA4");
  if (rel.status !== "draft") {
    throw new ApiError("RELEASE_NOT_REVIEWABLE", 409, `\u5F53\u524D\u72B6\u6001 ${rel.status} \u4E0D\u53EF\u63D0\u4EA4`, { status: rel.status });
  }
  await rateLimitKV(env, "submit", dev.devId, 20, 86400);
  const queue = await getJSON(env, "revq", []);
  const list = Array.isArray(queue) ? queue : [];
  if (list.length >= LIMITS2.queueMax) throw new ApiError("REVIEW_QUEUE_FULL", 429, "\u5F85\u5BA1\u961F\u5217\u5DF2\u6EE1\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
  if (!list.includes(releaseId)) list.push(releaseId);
  await putJSON(env, "revq", list);
  let notes;
  try {
    const b = await request.json();
    notes = clip(b && b.release_notes, 1e3);
  } catch (e) {
  }
  rel.status = "pending";
  rel.submittedAt = nowISO();
  if (notes) rel.releaseNotes = notes;
  rel.review = { status: "pending", reason: null, reviewer: null, submittedAt: rel.submittedAt, reviewedAt: null };
  await saveRelease(env, rel);
  await appendAudit(env, {
    actor: { type: "developer", id: dev.devId },
    action: "release.submit",
    target: releaseId,
    ip: clientIP(request)
  });
  return json6({ releaseId, status: "pending", submittedAt: rel.submittedAt });
}
__name(submitRelease, "submitRelease");
async function withdrawRelease(request, env, releaseId) {
  const { dev } = await requireDev(request, env, "release:publish");
  const rel = await getRelease(env, releaseId);
  if (!rel) throw new ApiError("RELEASE_NOT_FOUND", 404, "\u7248\u672C\u4E0D\u5B58\u5728");
  await loadOwnApp(env, rel.appId, dev.devId);
  if (rel.status !== "pending") {
    throw new ApiError("RELEASE_NOT_REVIEWABLE", 409, `\u5F53\u524D\u72B6\u6001 ${rel.status} \u4E0D\u53EF\u64A4\u56DE`, { status: rel.status });
  }
  const queue = await getJSON(env, "revq", []);
  const list = Array.isArray(queue) ? queue : [];
  const i = list.indexOf(releaseId);
  if (i >= 0) {
    list.splice(i, 1);
    await putJSON(env, "revq", list);
  }
  rel.status = "draft";
  rel.submittedAt = null;
  rel.review = { status: "draft", reason: null, reviewer: null, submittedAt: null, reviewedAt: null };
  await saveRelease(env, rel);
  await appendAudit(env, { actor: { type: "developer", id: dev.devId }, action: "release.withdraw", target: releaseId });
  return json6({ releaseId, status: "draft" });
}
__name(withdrawRelease, "withdrawRelease");
async function createToken(request, env) {
  const { dev } = await requireDev(request, env, "app:write");
  const body = await readJSON(request);
  const name = clip(body.name, 40);
  if (!name) throw new ApiError("BAD_REQUEST", 400, "Token \u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
  const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : [];
  const allowed = ["app:read", "app:write", "release:publish", "review:read", "telemetry:write", "*"];
  if (!scopes.length || scopes.some((s) => !allowed.includes(s))) {
    throw new ApiError("INVALID_SCOPE", 400, "scopes \u975E\u6CD5", { allowed });
  }
  const tokens = await listTokens(env, dev.devId);
  if (tokens.filter((t) => !t.revokedAt).length >= 12) throw new ApiError("TOKEN_LIMIT", 429, "Token \u6570\u91CF\u8FBE\u5230\u4E0A\u9650\uFF0812\uFF09");
  await rateLimitKV(env, "token", dev.devId, 10, 86400);
  const { plain, rec } = await issueToken(env, dev.devId, name, scopes);
  await appendAudit(env, { actor: { type: "developer", id: dev.devId }, action: "token.create", target: rec.tokenId });
  return json6({
    tokenId: rec.tokenId,
    token: plain,
    name,
    scopes,
    note: "\u5B8C\u6574 Token \u53EA\u8FD4\u56DE\u8FD9\u4E00\u6B21\uFF0C\u8BF7\u7ACB\u5373\u4FDD\u5B58"
  }, 201);
}
__name(createToken, "createToken");
async function getTokens(request, env) {
  const { dev } = await requireDev(request, env, "app:read");
  return json6({ items: await listTokens(env, dev.devId) });
}
__name(getTokens, "getTokens");
async function deleteToken(request, env, tokenId) {
  const { dev } = await requireDev(request, env, "app:write");
  const rec = await revokeToken(env, dev.devId, tokenId);
  await appendAudit(env, { actor: { type: "developer", id: dev.devId }, action: "token.revoke", target: tokenId });
  return json6({ ok: true, tokenId: rec.tokenId, revokedAt: rec.revokedAt });
}
__name(deleteToken, "deleteToken");

// src/v1/public.js
var PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#12141a"/><path d="M40 88V40h20c12 0 20 8 20 20s-8 20-20 20H48" stroke="#6ee7ff" stroke-width="6" fill="none"/><circle cx="86" cy="88" r="6" fill="#6ee7ff"/></svg>`;
async function listApps(request, env, url) {
  const p = pagination(url);
  const category = url.searchParams.get("category");
  if (category && !CATEGORIES.includes(category)) {
    throw new ApiError("INVALID_CATEGORY", 400, "\u5206\u7C7B\u4E0D\u5728\u679A\u4E3E\u5185", { category });
  }
  const sort = url.searchParams.get("sort") || "hot";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const channel = url.searchParams.get("channel") || "stable";
  const idx = await publicIndex(env);
  let items = idx.items.slice();
  if (category) items = items.filter((a) => a.category === category);
  if (channel === "beta") items = items.filter((a) => a.channel === "beta" || a.channel === "stable");
  if (q) {
    items = items.filter((a) => a.name.toLowerCase().includes(q) || (a.subtitle || "").toLowerCase().includes(q) || (a.tags || []).some((t) => t.toLowerCase().includes(q)));
  }
  if (sort === "new") items.sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
  else if (sort === "rating") items.sort((a, b) => b.rating.avg - a.rating.avg || b.rating.count - a.rating.count);
  else items.sort((a, b) => b.download_count - a.download_count || String(b.published_at || "").localeCompare(String(a.published_at || "")));
  return json6({
    items: pageSlice(items, p).map(stripItem),
    page: p.page,
    page_size: p.pageSize,
    total: items.length
  });
}
__name(listApps, "listApps");
async function getAppDetail(request, env, appId) {
  const app = await getApp(env, appId);
  if (!app || app.status !== "published") throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  let latest = null;
  if (app.latestReleaseId) latest = await getRelease(env, app.latestReleaseId);
  const shots = [];
  const shotCount = latest && latest.manifest && latest.manifest.screenshots ? latest.manifest.screenshots.length : 0;
  for (let i = 0; i < Math.min(shotCount, LIMITS2.screenshots); i++) {
    shots.push(`/api/v1/apps/${appId}/screenshots/${i}`);
  }
  return json6({
    app: {
      id: app.id,
      name: app.name,
      subtitle: app.subtitle || "",
      developer: app.developerName || "",
      developerId: app.developerId,
      category: app.category,
      description: app.description || "",
      tags: app.tags || [],
      status: app.status,
      rating: ratingOf(app),
      download_count: app.downloadCount || 0,
      screenshots: shots,
      iconUrl: `/api/v1/apps/${appId}/icon`
    },
    latest_version: latest ? serializeRelease(latest, false) : null,
    permissions: latest && latest.manifest && latest.manifest.permissions || [],
    minOsVersion: latest && latest.manifest && latest.manifest.minOsVersion || null,
    i18n: latest && latest.manifest && latest.manifest.i18n || {}
  });
}
__name(getAppDetail, "getAppDetail");
async function listVersions(request, env, appId) {
  const app = await getApp(env, appId);
  if (!app || app.status !== "published") throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  const rels = (await listReleases(env, appId)).filter((r) => r.status === "published" || r.status === "archived");
  return json6({ appId, items: rels.map((r) => serializeRelease(r, false)) });
}
__name(listVersions, "listVersions");
async function getAppIcon(request, env, appId) {
  const app = await getApp(env, appId);
  if (!app) throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  const icon = app.latestReleaseId ? await getIcon(env, app.latestReleaseId) : null;
  if (!icon) {
    return new Response(PLACEHOLDER_SVG, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600"
      }
    });
  }
  return binaryResponse(request, icon.bytes, icon.mime, "public, max-age=31536000, immutable");
}
__name(getAppIcon, "getAppIcon");
async function getAppScreenshot(request, env, appId, index) {
  const app = await getApp(env, appId);
  if (!app) throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  const shot = app.latestReleaseId ? await getScreenshot(env, app.latestReleaseId, index) : null;
  if (!shot) throw new ApiError("ASSET_NOT_FOUND", 404, "\u622A\u56FE\u4E0D\u5B58\u5728");
  return binaryResponse(request, shot.bytes, shot.mime, "public, max-age=31536000, immutable");
}
__name(getAppScreenshot, "getAppScreenshot");
async function binaryResponse(request, bytes, mime, cacheControl) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const etag = '"' + hex(digest).slice(0, 32) + '"';
  const inm = request.headers.get("If-None-Match");
  if (inm && inm === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.length),
      ETag: etag,
      "Cache-Control": cacheControl,
      "X-Content-SHA256": hex(digest)
    }
  });
}
__name(binaryResponse, "binaryResponse");
function hex(buf) {
  const u8 = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, "0");
  return s;
}
__name(hex, "hex");
async function downloadRelease(request, env, releaseId) {
  const rel = await getRelease(env, releaseId);
  if (!rel || !["published", "archived"].includes(rel.status)) {
    throw new ApiError("RELEASE_NOT_FOUND", 404, "\u7248\u672C\u4E0D\u5B58\u5728\u6216\u672A\u4E0A\u67B6");
  }
  const app = await getApp(env, rel.appId);
  if (!app || app.status !== "published") throw new ApiError("RELEASE_NOT_FOUND", 404, "\u5E94\u7528\u5DF2\u4E0B\u67B6");
  const etag = '"' + rel.sha256 + '"';
  const inm = (request.headers.get("If-None-Match") || "").replace(/^W\//i, "").replace(/"/g, "").trim().toLowerCase();
  if (inm && inm === rel.sha256) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }
  const total = Number(rel.size) || 0;
  const mime = rel.format === "html" ? "text/html; charset=utf-8" : "application/zip";
  const ext = rel.format === "html" ? "html" : "zip";
  const filename = `${rel.appId}-${rel.version}.${ext}`;
  const baseHeaders2 = {
    "Content-Type": mime,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Accept-Ranges": "bytes",
    "X-Content-SHA256": rel.sha256,
    ETag: etag,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Security-Policy": "sandbox; default-src 'none'"
  };
  const rangeHeader = request.headers.get("Range");
  if (rangeHeader && total > 0) {
    const parsed = parseRange(rangeHeader, total);
    if (!parsed) {
      return json6({ error: { code: "RANGE_NOT_SATISFIABLE", message: "Range \u8D85\u51FA\u8D44\u6E90\u8303\u56F4", details: { total } } }, 416, {
        "Content-Range": `bytes */${total}`,
        "Accept-Ranges": "bytes",
        ETag: etag
      });
    }
    const bytes2 = await getBlobRange(env, rel.releaseId, rel.chunks || 0, parsed.start, parsed.end + 1);
    if (!bytes2) throw new ApiError("STORAGE_UNAVAILABLE", 503, "\u5B89\u88C5\u5305\u6570\u636E\u4E0D\u53EF\u8BFB");
    bumpDownloadAsync(env, rel);
    return new Response(bytes2, {
      status: 206,
      headers: Object.assign({}, baseHeaders2, {
        "Content-Length": String(bytes2.length),
        "Content-Range": `bytes ${parsed.start}-${parsed.end}/${total}`
      })
    });
  }
  const bytes = await assemble(env, rel);
  if (!bytes) throw new ApiError("STORAGE_UNAVAILABLE", 503, "\u5B89\u88C5\u5305\u6570\u636E\u4E0D\u53EF\u8BFB");
  bumpDownloadAsync(env, rel);
  return new Response(bytes, {
    status: 200,
    headers: Object.assign({}, baseHeaders2, { "Content-Length": String(bytes.length) })
  });
}
__name(downloadRelease, "downloadRelease");
function parseRange(raw, total) {
  const m = /^bytes=(\d*)-(\d*)$/i.exec(String(raw).trim());
  if (!m) return null;
  const [, a, b] = m;
  if (!a && !b) return null;
  let start, end;
  if (!a) {
    const n = Number(b);
    if (!Number.isInteger(n) || n <= 0) return null;
    start = Math.max(0, total - n);
    end = total - 1;
  } else {
    start = Number(a);
    end = b ? Number(b) : total - 1;
    if (!Number.isInteger(start) || start < 0) return null;
    if (end >= total) end = total - 1;
  }
  if (start >= total || start > end) return null;
  return { start, end };
}
__name(parseRange, "parseRange");
async function assemble(env, rel) {
  const parts = await Promise.all(
    Array.from({ length: rel.chunks || 0 }, (_, i) => env.STORE_KV.get("n26:blob:" + rel.releaseId + ":" + i, { type: "arrayBuffer" }))
  );
  if (parts.some((p) => !p)) return null;
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), pos);
    pos += p.byteLength;
  }
  return out;
}
__name(assemble, "assemble");
function bumpDownloadAsync(env, rel) {
  bumpDownload(env, rel.appId, rel.releaseId).catch(() => {
  });
}
__name(bumpDownloadAsync, "bumpDownloadAsync");
function listCategories() {
  return json6({ items: CATEGORIES.map((id) => ({ id, name: CATEGORY_LABELS[id] })) });
}
__name(listCategories, "listCategories");
async function searchApps(request, env, url) {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) throw new ApiError("QUERY_REQUIRED", 400, "\u641C\u7D22\u9700\u8981 q \u53C2\u6570");
  if (q.length > 80) throw new ApiError("BAD_REQUEST", 400, "q \u8FC7\u957F\uFF08\u226480\uFF09");
  const category = url.searchParams.get("category");
  if (category && !CATEGORIES.includes(category)) throw new ApiError("INVALID_CATEGORY", 400, "\u5206\u7C7B\u4E0D\u5728\u679A\u4E3E\u5185");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 10)));
  const ql = q.toLowerCase();
  const idx = await publicIndex(env);
  const hits2 = [];
  for (const a of idx.items) {
    if (category && a.category !== category) continue;
    let score = 0;
    let matched = "";
    const name = (a.name || "").toLowerCase();
    if (name === ql) {
      score = 1.4;
      matched = "name";
    } else if (name.startsWith(ql)) {
      score = 1.15;
      matched = "name";
    } else if (name.includes(ql)) {
      score = 1;
      matched = "name";
    } else if ((a.id || "").toLowerCase().includes(ql)) {
      score = 0.9;
      matched = "id";
    } else if ((a.tags || []).some((t) => t.toLowerCase().includes(ql))) {
      score = 0.7;
      matched = "tag";
    } else if ((a.subtitle || "").toLowerCase().includes(ql)) {
      score = 0.5;
      matched = "description";
    } else if ((a._desc || "").toLowerCase().includes(ql)) {
      score = 0.4;
      matched = "description";
    }
    if (!score) continue;
    score += Math.min(0.2, (a.download_count || 0) / 1e4);
    hits2.push({ id: a.id, name: a.name, score: Number(score.toFixed(3)), matched });
  }
  hits2.sort((x, y) => y.score - x.score);
  return json6({ query: q, hits: hits2.slice(0, limit), estimated_total: hits2.length });
}
__name(searchApps, "searchApps");
async function rankings(request, env, url) {
  const type = url.searchParams.get("type") || "hot";
  if (!["hot", "new", "weekly", "rating"].includes(type)) {
    throw new ApiError("BAD_REQUEST", 400, "type \u5FC5\u987B\u662F hot / new / weekly / rating");
  }
  const p = pagination(url);
  const idx = await publicIndex(env);
  let items = idx.items.slice();
  let period = "all";
  let degraded = false;
  if (type === "new") {
    period = "latest";
    items.sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
  } else if (type === "rating") {
    items.sort((a, b) => b.rating.avg - a.rating.avg || b.rating.count - a.rating.count);
  } else if (type === "weekly") {
    period = "7d";
    const cutoff = Date.now() - 7 * 864e5;
    const recent = items.filter((a) => a.published_at && Date.parse(a.published_at) >= cutoff);
    if (recent.length < 3) {
      degraded = true;
      items.sort((a, b) => b.download_count - a.download_count);
    } else {
      items = recent.sort((a, b) => b.download_count - a.download_count);
    }
  } else {
    items.sort((a, b) => b.download_count - a.download_count || String(b.published_at || "").localeCompare(String(a.published_at || "")));
  }
  const out = { type, period, items: pageSlice(items, p).map(stripItem), page: p.page, page_size: p.pageSize };
  if (degraded) out.degraded = true;
  return json6(out);
}
__name(rankings, "rankings");
async function getRatings(request, env, url, appId) {
  const app = await getApp(env, appId);
  if (!app || app.status !== "published") throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)));
  return json6({ appId, summary: ratingOf(app), items: await ratingList(env, appId, limit) });
}
__name(getRatings, "getRatings");
async function postRating(request, env, appId) {
  const ip = clientIP(request);
  rateLimitLocal("rating", ip + "|" + appId, 5, 3600);
  await rateLimitKV(env, "rating", ip + "|" + appId, 5, 3600);
  const app = await getApp(env, appId);
  if (!app || app.status !== "published") throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  const body = await readJSON(request);
  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new ApiError("INVALID_RATING", 400, "stars \u5FC5\u987B\u662F 1\u20135 \u7684\u6574\u6570");
  const comment = clip(body.comment, 500);
  const author = clip(body.author, 32) || "\u533F\u540D\u7528\u6237";
  const r = await addRating(env, appId, stars, comment, author);
  if (!r) throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  return json6({ ok: true, rating: r.summary, item: r.item }, 201);
}
__name(postRating, "postRating");
async function checkUpdate(request, env, url, appId) {
  const app = await getApp(env, appId);
  if (!app || app.status !== "published") throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728\u6216\u5DF2\u4E0B\u67B6");
  const channel = url.searchParams.get("channel") || "stable";
  if (!["stable", "beta"].includes(channel)) throw new ApiError("INVALID_CHANNEL", 400, "channel \u5FC5\u987B\u662F stable / beta");
  const current = clip(url.searchParams.get("current") || url.searchParams.get("version"), 32);
  const rels = (await listReleases(env, appId)).filter((r) => r.status === "published" && (r.channel === channel || channel === "beta" && r.channel === "stable")).sort((a, b) => compareSemver(b.version, a.version));
  const latest = rels[0];
  if (!latest) throw new ApiError("RELEASE_NOT_FOUND", 404, "\u8BE5\u901A\u9053\u6682\u65E0\u53EF\u7528\u7248\u672C");
  const available = current ? compareSemver(latest.version, current) > 0 : true;
  return json6({
    appId,
    channel,
    installed_version: current || null,
    update_available: available,
    latest: {
      version: latest.version,
      releaseId: latest.releaseId,
      channel: latest.channel,
      size: latest.size,
      sha256: latest.sha256,
      release_notes: latest.releaseNotes || "",
      force_update: !!latest.forceUpdate,
      published_at: latest.publishedAt || null,
      download_url: "/api/v1/download/" + latest.releaseId
    }
  });
}
__name(checkUpdate, "checkUpdate");

// src/v1/admin.js
async function hmacHex(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hmacHex, "hmacHex");
async function notifyWebhook(env, ctx, devId, event, data) {
  if (!devId) return;
  try {
    const dev = await getJSON(env, "dev:" + devId);
    if (!dev || !dev.webhookUrl || !dev.webhookSecret) return;
    const body = JSON.stringify({ event, sentAt: nowISO(), data });
    const signature = "sha256=" + await hmacHex(dev.webhookSecret, body);
    const task = fetch(dev.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-N26-Event": event, "X-N26-Signature": signature },
      body
    }).catch(() => null);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(task);
    else await task;
  } catch (e) {
  }
}
__name(notifyWebhook, "notifyWebhook");
async function adminCreateDeveloper(request, env) {
  requireAdmin(request, env);
  const body = await readJSON(request);
  const type = body.type === "org" ? "org" : "personal";
  const name = clip(body.name, 60);
  if (!name) throw new ApiError("BAD_REQUEST", 400, "name \u4E0D\u80FD\u4E3A\u7A7A");
  const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : ["*"];
  if (scopes.some((s) => !SCOPES.includes(s))) {
    throw new ApiError("INVALID_SCOPE", 400, "scopes \u975E\u6CD5", { allowed: SCOPES });
  }
  const devId = "dev_" + Math.random().toString(16).slice(2, 8) + Date.now().toString(16).slice(-6);
  const limit = Number.isInteger(body.appLimit) ? Math.min(Math.max(body.appLimit, 1), 500) : LIMITS2.appsPerDev;
  const dev = {
    devId,
    type,
    name,
    email: clip(body.email, 120),
    status: "active",
    appLimit: limit,
    webhookUrl: "",
    webhookSecret: "",
    createdAt: nowISO(),
    updatedAt: nowISO()
  };
  await putJSON(env, "dev:" + devId, dev);
  const idx = await getJSON(env, "devidx", []);
  const list = Array.isArray(idx) ? idx : [];
  list.unshift(devId);
  await putJSON(env, "devidx", list);
  const { plain, rec } = await issueToken(env, devId, "admin-issued", scopes);
  await appendAudit(env, {
    actor: { type: "admin", id: "admin" },
    action: "developer.create",
    target: devId,
    ip: clientIP(request)
  });
  return json6({
    developer: {
      devId,
      type,
      name,
      email: dev.email,
      status: "active",
      appLimit: limit,
      webhookUrl: null,
      createdAt: dev.createdAt
    },
    token: { tokenId: rec.tokenId, token: plain, name: "admin-issued", scopes }
  }, 201);
}
__name(adminCreateDeveloper, "adminCreateDeveloper");
async function adminListDevelopers(request, env) {
  requireAdmin(request, env);
  const idx = await getJSON(env, "devidx", []);
  const ids = Array.isArray(idx) ? idx : [];
  const devs = (await Promise.all(ids.map((id) => getJSON(env, "dev:" + id)))).filter(Boolean);
  return json6({
    items: devs.map((d) => ({
      devId: d.devId,
      type: d.type,
      name: d.name,
      email: d.email || "",
      status: d.status,
      appLimit: d.appLimit,
      webhookUrl: d.webhookUrl || null,
      createdAt: d.createdAt
    })),
    total: devs.length
  });
}
__name(adminListDevelopers, "adminListDevelopers");
async function adminListReviews(request, env, url) {
  requireAdmin(request, env);
  const status = url.searchParams.get("status") || "pending";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") || 20)));
  if (status === "pending") {
    const queue = await getJSON(env, "revq", []);
    const ids2 = Array.isArray(queue) ? queue : [];
    const items = [];
    for (const id of ids2.slice((page - 1) * pageSize, page * pageSize)) {
      const rel = await getRelease(env, id);
      if (!rel) continue;
      const app = await getApp(env, rel.appId);
      items.push({
        releaseId: rel.releaseId,
        appId: rel.appId,
        appName: app ? app.name : "",
        developer: app ? app.developerName || "" : "",
        version: rel.version,
        channel: rel.channel,
        size: rel.size,
        sha256: rel.sha256,
        fileCount: rel.fileCount,
        submittedAt: rel.submittedAt
      });
    }
    return json6({ items, page, page_size: pageSize, total: ids2.length });
  }
  const appIds = await getJSON(env, "appidx", []);
  const ids = Array.isArray(appIds) ? appIds : [];
  const all = [];
  for (const appId of ids) {
    for (const rel of await listReleases(env, appId)) {
      if (rel.review && rel.review.status === status) {
        all.push(Object.assign(serializeRelease(rel, false), {
          appId: rel.appId,
          review: rel.review
        }));
      }
    }
  }
  return json6({ items: all.slice((page - 1) * pageSize, page * pageSize), page, page_size: pageSize, total: all.length });
}
__name(adminListReviews, "adminListReviews");
async function adminApprove(request, env, releaseId, ctx) {
  const admin = requireAdmin(request, env);
  await rateLimitLocal("admin", admin.id + "|approve", 200, 60);
  const rel = await getRelease(env, releaseId);
  if (!rel) throw new ApiError("RELEASE_NOT_FOUND", 404, "\u7248\u672C\u4E0D\u5B58\u5728");
  if (rel.status !== "pending") {
    throw new ApiError("REVIEW_CONFLICT", 409, `\u5F53\u524D\u72B6\u6001 ${rel.status} \u4E0D\u53EF\u5BA1\u6838`, { status: rel.status });
  }
  const app = await getApp(env, rel.appId);
  if (!app) throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  if (app.latestVersion && app.latestChannel === rel.channel && compareSemver(rel.version, app.latestVersion) <= 0 && rel.version !== app.latestVersion) {
    throw new ApiError("REVIEW_CONFLICT", 409, `\u5DF2\u6709\u66F4\u9AD8\u7248\u672C ${app.latestVersion} \u5728\u7EBF\uFF0C\u8BF7\u5148\u64A4\u9500\u6216\u53D1\u5E03\u66F4\u9AD8\u7248\u672C`);
  }
  let note = "";
  try {
    const b = await request.json();
    note = clip(b && b.note, 500);
  } catch (e) {
  }
  const siblings = await listReleases(env, rel.appId);
  for (const s of siblings) {
    if (s.releaseId !== releaseId && s.status === "published" && s.channel === rel.channel) {
      s.status = "archived";
      s.archivedAt = nowISO();
      await saveRelease(env, s);
    }
  }
  rel.status = "published";
  rel.publishedAt = nowISO();
  rel.review = { status: "approved", reason: note || null, reviewer: admin.id, submittedAt: rel.submittedAt || null, reviewedAt: nowISO() };
  await saveRelease(env, rel);
  app.status = "published";
  app.latestVersion = rel.version;
  app.latestChannel = rel.channel;
  app.latestReleaseId = rel.releaseId;
  app.latestSize = rel.size;
  app.latestSha256 = rel.sha256;
  app.publishedAt = app.publishedAt || nowISO();
  app.unpublishedReason = null;
  if (!app.name && rel.manifest) app.name = rel.manifest.name;
  await saveApp(env, app);
  await removeFromQueue(env, releaseId);
  await invalidateIndex(env);
  await appendAudit(env, {
    actor: { type: "admin", id: admin.id },
    action: "review.approve",
    target: releaseId,
    reason: note || void 0,
    ip: clientIP(request)
  });
  await notifyWebhook(env, ctx, app.developerId, "release.approved", {
    appId: rel.appId,
    releaseId,
    version: rel.version,
    channel: rel.channel,
    publishedAt: rel.publishedAt
  });
  return json6({ releaseId, appId: rel.appId, status: "published", publishedAt: rel.publishedAt });
}
__name(adminApprove, "adminApprove");
async function adminReject(request, env, releaseId, ctx) {
  const admin = requireAdmin(request, env);
  const body = await readJSON(request);
  const reason = clip(body.reason, 500);
  if (!reason) throw new ApiError("REJECT_REASON_REQUIRED", 400, "\u62D2\u7EDD\u5FC5\u987B\u586B\u5199 reason");
  const rel = await getRelease(env, releaseId);
  if (!rel) throw new ApiError("RELEASE_NOT_FOUND", 404, "\u7248\u672C\u4E0D\u5B58\u5728");
  if (rel.status !== "pending") {
    throw new ApiError("REVIEW_CONFLICT", 409, `\u5F53\u524D\u72B6\u6001 ${rel.status} \u4E0D\u53EF\u5BA1\u6838`, { status: rel.status });
  }
  rel.status = "rejected";
  rel.review = { status: "rejected", reason, reviewer: admin.id, submittedAt: rel.submittedAt || null, reviewedAt: nowISO() };
  await saveRelease(env, rel);
  await removeFromQueue(env, releaseId);
  await appendAudit(env, {
    actor: { type: "admin", id: admin.id },
    action: "review.reject",
    target: releaseId,
    reason,
    ip: clientIP(request)
  });
  const app = await getApp(env, rel.appId);
  await notifyWebhook(env, ctx, app && app.developerId, "release.rejected", {
    appId: rel.appId,
    releaseId,
    version: rel.version,
    reason
  });
  return json6({ releaseId, status: "rejected", reason });
}
__name(adminReject, "adminReject");
async function removeFromQueue(env, releaseId) {
  const queue = await getJSON(env, "revq", []);
  const list = Array.isArray(queue) ? queue : [];
  const i = list.indexOf(releaseId);
  if (i >= 0) {
    list.splice(i, 1);
    await putJSON(env, "revq", list);
  }
}
__name(removeFromQueue, "removeFromQueue");
async function adminTakedown(request, env, appId, ctx) {
  const admin = requireAdmin(request, env);
  const body = await readJSON(request);
  const reason = clip(body.reason, 500);
  if (!reason) throw new ApiError("REJECT_REASON_REQUIRED", 400, "\u4E0B\u67B6\u5FC5\u987B\u586B\u5199 reason");
  const app = await getApp(env, appId);
  if (!app) throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  for (const rel of await listReleases(env, appId)) {
    if (rel.status === "published") {
      rel.status = "archived";
      rel.archivedAt = nowISO();
      await saveRelease(env, rel);
    }
  }
  app.status = "unpublished";
  app.unpublishedReason = reason;
  app.unpublishedAt = nowISO();
  await saveApp(env, app);
  await invalidateIndex(env);
  await appendAudit(env, {
    actor: { type: "admin", id: admin.id },
    action: "app.takedown",
    target: appId,
    reason,
    ip: clientIP(request)
  });
  await notifyWebhook(env, ctx, app.developerId, "app.takedown", { appId, reason });
  return json6({ appId, status: "unpublished", reason });
}
__name(adminTakedown, "adminTakedown");
async function adminRestore(request, env, appId) {
  const admin = requireAdmin(request, env);
  const app = await getApp(env, appId);
  if (!app) throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  if (app.status === "published") throw new ApiError("REVIEW_CONFLICT", 409, "\u5E94\u7528\u5DF2\u5904\u4E8E\u4E0A\u67B6\u72B6\u6001");
  const rels = await listReleases(env, appId);
  const latestPublished = rels.filter((r) => r.status === "archived").sort((a, b) => compareSemver(b.version, a.version))[0];
  if (!latestPublished) throw new ApiError("REVIEW_CONFLICT", 409, "\u6CA1\u6709\u4EFB\u4F55\u53EF\u6062\u590D\u7684\u5DF2\u53D1\u5E03\u7248\u672C\uFF0C\u8BF7\u5148\u53D1\u5E03\u65B0\u7248\u672C");
  latestPublished.status = "published";
  latestPublished.publishedAt = latestPublished.publishedAt || nowISO();
  await saveRelease(env, latestPublished);
  app.status = "published";
  app.latestVersion = latestPublished.version;
  app.latestChannel = latestPublished.channel;
  app.latestReleaseId = latestPublished.releaseId;
  app.latestSize = latestPublished.size;
  app.latestSha256 = latestPublished.sha256;
  app.unpublishedReason = null;
  await saveApp(env, app);
  await invalidateIndex(env);
  await appendAudit(env, { actor: { type: "admin", id: admin.id }, action: "app.restore", target: appId, ip: clientIP(request) });
  return json6({ appId, status: "published", version: latestPublished.version });
}
__name(adminRestore, "adminRestore");
async function adminAuditLogs(request, env, url) {
  requireAdmin(request, env);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  const action = url.searchParams.get("action");
  const actor = url.searchParams.get("actor");
  let items = await listAudit(env, 1e3);
  if (action) items = items.filter((e) => e.action === action);
  if (actor) items = items.filter((e) => e.actor && e.actor.id === actor);
  return json6({ items: items.slice(0, limit), total: items.length });
}
__name(adminAuditLogs, "adminAuditLogs");
var LEGACY_DEV_ID = "dev_legacy";
function legacyAppId(kind, legacyId) {
  const base = ("legacy-" + kind + "-" + String(legacyId)).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 60);
  return base.length >= 3 ? base : "legacy-" + kind + "-" + randHex2(4);
}
__name(legacyAppId, "legacyAppId");
function legacyPackFiles(pkg) {
  const files = pkg && pkg.files && typeof pkg.files === "object" ? pkg.files : {};
  const out = [];
  for (const [rawName, content] of Object.entries(files)) {
    const name = String(rawName).replace(/\\/g, "/").replace(/^\/+/, "");
    if (!name || name.includes("..") || name.length > 200) continue;
    out.push({ name, bytes: new TextEncoder().encode(String(content)) });
    if (out.length >= 600) break;
  }
  return out;
}
__name(legacyPackFiles, "legacyPackFiles");
async function adminMigrateLegacy(request, env, ctx) {
  const admin = requireAdmin(request, env);
  let body = {};
  try {
    body = await readJSON(request);
  } catch (e) {
    body = {};
  }
  const dryRun = body.dryRun === void 0 ? true : !!body.dryRun;
  if (!dryRun) {
    let dev = await getJSON(env, "dev:" + LEGACY_DEV_ID);
    if (!dev) {
      dev = {
        devId: LEGACY_DEV_ID,
        type: "org",
        name: "\u65E7\u5E02\u573A\u8FC1\u79FB",
        email: "",
        status: "active",
        appLimit: 500,
        webhookUrl: "",
        webhookSecret: "",
        createdAt: nowISO(),
        updatedAt: nowISO()
      };
      await putJSON(env, "dev:" + dev.devId, dev);
      const devIdx = await getJSON(env, "devidx", []);
      const list = Array.isArray(devIdx) ? devIdx : [];
      if (!list.includes(LEGACY_DEV_ID)) {
        list.unshift(LEGACY_DEV_ID);
        await putJSON(env, "devidx", list);
      }
    }
  }
  const scanned = {};
  const migrated = [];
  const skipped = [];
  for (const kind of ["app", "plugin"]) {
    const idx = await env.STORE_KV.get("store:idx:" + kind);
    const pend = await env.STORE_KV.get("store:pend:" + kind);
    const published = idx ? JSON.parse(idx) : [];
    const pending = pend ? JSON.parse(pend) : [];
    const ids = Array.from(/* @__PURE__ */ new Set([...published, ...pending]));
    scanned[kind] = ids.length;
    for (const legacyId of ids) {
      const raw = await env.STORE_KV.get("store:pkg:" + kind + ":" + legacyId);
      if (!raw) {
        skipped.push({ kind, legacyId, why: "\u5305\u4E0D\u5B58\u5728" });
        continue;
      }
      let pkg;
      try {
        pkg = JSON.parse(raw);
      } catch (e) {
        skipped.push({ kind, legacyId, why: "\u5305\u4E0D\u662F\u5408\u6CD5 JSON" });
        continue;
      }
      const meta = pkg && pkg.meta || pkg || {};
      const appId = legacyAppId(kind, legacyId);
      if (!APP_ID_RE.test(appId)) {
        skipped.push({ kind, legacyId, why: "\u65E0\u6CD5\u751F\u6210\u5408\u6CD5 appId" });
        continue;
      }
      if (await getApp(env, appId)) {
        skipped.push({ kind, legacyId, appId, why: "appId \u5DF2\u5B58\u5728" });
        continue;
      }
      const version = String(meta.version || "1.0.0").replace(/[^\w.\-]/g, "").slice(0, 20) || "1.0.0";
      const releaseId = appId + "@" + version;
      const isPublished = published.includes(legacyId);
      const files = legacyPackFiles(pkg);
      const manifest = {
        id: appId,
        name: String(meta.name || appId).slice(0, 60),
        version,
        entry: String(meta.entry || "index.html").replace(/\\/g, "/").replace(/^\/+/, "") || "index.html",
        category: CATEGORIES.includes(meta.category) ? meta.category : kind === "plugin" ? "tools" : "other",
        description: String(meta.desc || "").slice(0, 500),
        permissions: [],
        legacy: { kind, id: legacyId }
      };
      const zipBytes = files.length ? buildZip([
        { name: "manifest.json", bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) },
        ...files
      ]) : null;
      const plan = {
        kind,
        legacyId,
        appId,
        releaseId,
        name: manifest.name,
        version,
        fileCount: files.length,
        size: zipBytes ? zipBytes.length : 0,
        status: isPublished ? "published" : "draft"
      };
      if (dryRun) {
        migrated.push(plan);
        continue;
      }
      if (!zipBytes || zipBytes.length > LIMITS2.packageBytes) {
        skipped.push({ kind, legacyId, appId, why: zipBytes ? "\u5305\u8D85\u8FC7 64MB" : "\u65E0\u53EF\u8FC1\u79FB\u6587\u4EF6" });
        continue;
      }
      const sha256 = await sha256Hex3(zipBytes);
      const chunks = await putBlob(env, releaseId, zipBytes);
      const now = nowISO();
      const app = {
        id: appId,
        name: manifest.name,
        subtitle: String(meta.subtitle || "").slice(0, 80),
        description: manifest.description,
        category: manifest.category,
        tags: Array.isArray(meta.tags) ? meta.tags.slice(0, 8).map((t) => String(t).slice(0, 12)) : [],
        developerId: LEGACY_DEV_ID,
        developerName: String(meta.publisher || "\u533F\u540D\u5F00\u53D1\u8005").slice(0, 60),
        status: isPublished ? "published" : "draft",
        downloadCount: Number(pkg.downloads || pkg.downloadCount || 0) || 0,
        ratingSum: 0,
        ratingCount: 0,
        ratingDist: [0, 0, 0, 0, 0],
        createdAt: now,
        updatedAt: now,
        publishedAt: isPublished ? now : null
      };
      if (isPublished) {
        app.latestVersion = version;
        app.latestChannel = "stable";
        app.latestReleaseId = releaseId;
        app.latestSize = zipBytes.length;
        app.latestSha256 = sha256;
      }
      await saveApp(env, app);
      await addAppId(env, appId);
      await addDevAppId(env, LEGACY_DEV_ID, appId);
      const rel = {
        releaseId,
        appId,
        version,
        channel: "stable",
        status: isPublished ? "published" : "draft",
        size: zipBytes.length,
        sha256,
        chunks,
        fileCount: files.length,
        format: "zip",
        entry: manifest.entry,
        manifest,
        releaseNotes: "",
        forceUpdate: false,
        uploadedAt: now,
        submittedAt: isPublished ? now : null,
        publishedAt: isPublished ? now : null,
        review: isPublished ? { status: "approved", reason: null, reviewer: "migration", submittedAt: now, reviewedAt: now } : { status: "draft", reason: null, reviewer: null, submittedAt: null, reviewedAt: null }
      };
      await saveRelease(env, rel);
      const relIdx = await getJSON(env, "relidx:" + appId, []);
      const relList = Array.isArray(relIdx) ? relIdx : [];
      if (!relList.includes(releaseId)) {
        relList.unshift(releaseId);
        await putJSON(env, "relidx:" + appId, relList);
      }
      migrated.push(plan);
    }
  }
  if (!dryRun) {
    await invalidateIndex(env);
    await appendAudit(env, {
      actor: { type: "admin", id: admin.id },
      action: "legacy.migrate",
      target: "store:*",
      ip: clientIP(request),
      details: { scanned, migrated: migrated.length, skipped: skipped.length }
    });
  }
  return json6({ dryRun, scanned, migrated, skipped, note: dryRun ? "dryRun \u6A21\u5F0F\uFF0C\u672A\u5199\u5165\u4EFB\u4F55\u6570\u636E" : "\u5DF2\u5199\u5165 n26:*\uFF0Cstore:* \u4FDD\u6301\u53EA\u8BFB\u672A\u6539\u52A8" });
}
__name(adminMigrateLegacy, "adminMigrateLegacy");
async function adminStats(request, env) {
  requireAdmin(request, env);
  const devIdx = await getJSON(env, "devidx", []);
  const appIdx = await getJSON(env, "appidx", []);
  const devIds = Array.isArray(devIdx) ? devIdx : [];
  const appIds = Array.isArray(appIdx) ? appIdx : [];
  const apps = (await Promise.all(appIds.map((id) => getApp(env, id)))).filter(Boolean);
  const queue = await getJSON(env, "revq", []);
  let releases = 0, downloads = 0;
  for (const a of apps) {
    downloads += a.downloadCount || 0;
    releases += (await listReleaseIds(env, a.id)).length;
  }
  return json6({
    apps: apps.length,
    published: apps.filter((a) => a.status === "published").length,
    draft: apps.filter((a) => a.status === "draft").length,
    unpublished: apps.filter((a) => a.status === "unpublished").length,
    pending: Array.isArray(queue) ? queue.length : 0,
    developers: devIds.length,
    releases,
    downloads
  });
}
__name(adminStats, "adminStats");

// src/v1/telemetry.js
async function resolve(env, body) {
  const releaseId = clip(body.releaseId, 200);
  let appId = clip(body.appId, 64);
  let rel = null;
  if (releaseId) rel = await getRelease(env, releaseId);
  if (rel) appId = rel.appId;
  if (!appId && !rel) throw new ApiError("BAD_REQUEST", 400, "\u5FC5\u987B\u63D0\u4F9B appId \u6216 releaseId");
  return { releaseId: rel ? rel.releaseId : "", appId, rel };
}
__name(resolve, "resolve");
async function optionalDev(request, env) {
  const auth = request.headers.get("Authorization") || request.headers.get("X-N26-Token") || "";
  if (!auth) return null;
  const { token } = await requireDev(request, env, "telemetry:write");
  return token;
}
__name(optionalDev, "optionalDev");
async function bumpCounter(env, key) {
  try {
    const cur = Number(await getJSON(env, key, 0)) || 0;
    await putJSON(env, key, cur + 1);
    return cur + 1;
  } catch (e) {
    return null;
  }
}
__name(bumpCounter, "bumpCounter");
async function postDownload(request, env) {
  rateLimitLocal("telemetry", clientIP(request), 60, 60);
  await rateLimitKV(env, "telemetry", clientIP(request), 60, 60);
  const body = await readJSON(request);
  const { rel, appId } = await resolve(env, body);
  if (!appId) throw new ApiError("BAD_REQUEST", 400, "\u65E0\u6CD5\u5B9A\u4F4D\u5E94\u7528");
  const app = await getApp(env, appId);
  if (!app) throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  if (rel && !["published", "archived"].includes(rel.status)) {
    throw new ApiError("RELEASE_NOT_FOUND", 404, "\u7248\u672C\u672A\u4E0A\u67B6");
  }
  const rid = rel ? rel.releaseId : app.latestReleaseId || "";
  if (rid) await bumpDownload(env, appId, rid);
  return json6({ ok: true, counted: true });
}
__name(postDownload, "postDownload");
async function postInstall(request, env) {
  rateLimitLocal("telemetry", clientIP(request), 60, 60);
  await rateLimitKV(env, "telemetry", clientIP(request), 60, 60);
  const token = await optionalDev(request, env);
  const body = await readJSON(request);
  const { appId, rel } = await resolve(env, body);
  const app = await getApp(env, appId);
  if (!app) throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  const n = await bumpCounter(env, "telem:" + appId + ":install");
  if (token) await bumpCounter(env, "telem:dev:" + token.devId + ":install");
  return json6({ ok: true, counted: !!n, appId, releaseId: rel ? rel.releaseId : "" });
}
__name(postInstall, "postInstall");
async function postLaunch(request, env) {
  rateLimitLocal("telemetry", clientIP(request), 60, 60);
  await rateLimitKV(env, "telemetry", clientIP(request), 60, 60);
  const token = await optionalDev(request, env);
  const body = await readJSON(request);
  const { appId, rel } = await resolve(env, body);
  const app = await getApp(env, appId);
  if (!app) throw new ApiError("APP_NOT_FOUND", 404, "\u5E94\u7528\u4E0D\u5B58\u5728");
  const n = await bumpCounter(env, "telem:" + appId + ":launch");
  if (token) await bumpCounter(env, "telem:dev:" + token.devId + ":launch");
  return json6({ ok: true, counted: !!n, appId, releaseId: rel ? rel.releaseId : "" });
}
__name(postLaunch, "postLaunch");

// src/v1/index.js
function methodNotAllowed(allow) {
  const err = new ApiError("METHOD_NOT_ALLOWED", 405, "\u65B9\u6CD5\u4E0D\u652F\u6301");
  err.allow = allow;
  return err;
}
__name(methodNotAllowed, "methodNotAllowed");
async function handleV1(request, env, ctx, url) {
  try {
    const raw = url.pathname.slice("/api/v1".length);
    const segs = raw.split("/").filter(Boolean).map((s) => {
      try {
        return decodeURIComponent(s);
      } catch (e) {
        return s;
      }
    });
    return await route(request, env, ctx, url, segs);
  } catch (e) {
    const res = toErrorResponse(e);
    if (e && e.allow) res.headers.set("Allow", e.allow);
    return res;
  }
}
__name(handleV1, "handleV1");
async function route(request, env, ctx, url, segs) {
  const method = request.method === "HEAD" ? "GET" : request.method;
  const n = segs.length;
  if (n === 0) {
    return json6({
      service: "nexus-cloud",
      apiVersion: "v1",
      docs: "/docs/Nexus-Cloud-API.md",
      openapi: "/docs/openapi.json",
      storage: env && env.STORE_KV ? "kv" : "unavailable"
    });
  }
  const root = segs[0];
  if (root === "health" && n === 1) {
    if (method !== "GET") throw methodNotAllowed("GET");
    return json6({
      ok: true,
      service: "nexus-cloud",
      apiVersion: "v1",
      storage: env && env.STORE_KV ? "kv" : "unavailable",
      features: ["apps", "releases", "reviews", "ratings", "telemetry", "webhooks"]
    });
  }
  if (root === "categories" && n === 1) {
    if (method !== "GET") throw methodNotAllowed("GET");
    return listCategories();
  }
  if (root === "apps" && n === 1) {
    if (method !== "GET") throw methodNotAllowed("GET");
    return listApps(request, env, url);
  }
  if (root === "apps" && n >= 2) {
    const appId = segs[1];
    if (n === 2) {
      if (method !== "GET") throw methodNotAllowed("GET");
      return getAppDetail(request, env, appId);
    }
    const sub = segs[2];
    if (sub === "versions" && n === 3) {
      if (method !== "GET") throw methodNotAllowed("GET");
      return listVersions(request, env, appId);
    }
    if (sub === "icon" && n === 3) {
      if (method !== "GET") throw methodNotAllowed("GET");
      return getAppIcon(request, env, appId);
    }
    if (sub === "screenshots" && n === 4) {
      if (method !== "GET") throw methodNotAllowed("GET");
      const idx = Number(segs[3]);
      if (!Number.isInteger(idx) || idx < 0) throw new ApiError("ASSET_NOT_FOUND", 404, "\u622A\u56FE\u4E0D\u5B58\u5728");
      return getAppScreenshot(request, env, appId, idx);
    }
    if (sub === "ratings" && n === 3) {
      if (method === "GET") return getRatings(request, env, url, appId);
      if (method === "POST") return postRating(request, env, appId);
      throw methodNotAllowed("GET, POST");
    }
    if (sub === "updates" && n === 3) {
      if (method !== "GET") throw methodNotAllowed("GET");
      return checkUpdate(request, env, url, appId);
    }
  }
  if (root === "search" && n === 1) {
    if (method !== "GET") throw methodNotAllowed("GET");
    return searchApps(request, env, url);
  }
  if (root === "rankings" && n === 1) {
    if (method !== "GET") throw methodNotAllowed("GET");
    return rankings(request, env, url);
  }
  if (root === "telemetry" && n === 2) {
    if (method !== "POST") throw methodNotAllowed("POST");
    if (segs[1] === "download") return postDownload(request, env);
    if (segs[1] === "install") return postInstall(request, env);
    if (segs[1] === "launch") return postLaunch(request, env);
    throw notFound("\u8DEF\u7531\u4E0D\u5B58\u5728");
  }
  if (root === "download" && n === 2) {
    if (method !== "GET") throw methodNotAllowed("GET");
    return downloadRelease(request, env, segs[1]);
  }
  if (root === "dev") {
    const sub = segs[1];
    if (sub === "me" && n === 2) {
      if (method === "GET") return getMe(request, env);
      if (method === "PATCH" || method === "PUT") return patchMe(request, env);
      throw methodNotAllowed("GET, PATCH");
    }
    if (sub === "apps" && n === 2) {
      if (method === "GET") return listMyApps(request, env, url);
      if (method === "POST") return createApp(request, env);
      throw methodNotAllowed("GET, POST");
    }
    if (sub === "apps" && n === 3) {
      if (method === "GET") return getMyApp(request, env, segs[2]);
      if (method === "PATCH" || method === "PUT") return patchApp(request, env, segs[2]);
      throw methodNotAllowed("GET, PATCH");
    }
    if (sub === "apps" && n === 4 && segs[3] === "releases") {
      if (method === "GET") return listMyReleases(request, env, segs[2]);
      if (method === "POST") return uploadRelease(request, env, segs[2]);
      throw methodNotAllowed("GET, POST");
    }
    if (sub === "releases" && n === 3) {
      if (method !== "GET") throw methodNotAllowed("GET");
      return getMyRelease(request, env, segs[2]);
    }
    if (sub === "releases" && n === 4) {
      if (method !== "POST") throw methodNotAllowed("POST");
      if (segs[3] === "submit") return submitRelease(request, env, segs[2]);
      if (segs[3] === "withdraw") return withdrawRelease(request, env, segs[2]);
      throw notFound("\u8DEF\u7531\u4E0D\u5B58\u5728");
    }
    if (sub === "tokens" && n === 2) {
      if (method === "GET") return getTokens(request, env);
      if (method === "POST") return createToken(request, env);
      throw methodNotAllowed("GET, POST");
    }
    if (sub === "tokens" && n === 3) {
      if (method !== "DELETE") throw methodNotAllowed("DELETE");
      return deleteToken(request, env, segs[2]);
    }
  }
  if (root === "admin") {
    const sub = segs[1];
    if (sub === "developers" && n === 2) {
      if (method === "GET") return adminListDevelopers(request, env);
      if (method === "POST") return adminCreateDeveloper(request, env);
      throw methodNotAllowed("GET, POST");
    }
    if (sub === "reviews" && n === 2) {
      if (method !== "GET") throw methodNotAllowed("GET");
      return adminListReviews(request, env, url);
    }
    if (sub === "reviews" && n === 4) {
      if (method !== "POST") throw methodNotAllowed("POST");
      if (segs[3] === "approve") return adminApprove(request, env, segs[2], ctx);
      if (segs[3] === "reject") return adminReject(request, env, segs[2], ctx);
      throw notFound("\u8DEF\u7531\u4E0D\u5B58\u5728");
    }
    if (sub === "apps" && n === 4) {
      if (method !== "POST") throw methodNotAllowed("POST");
      if (segs[3] === "takedown") return adminTakedown(request, env, segs[2], ctx);
      if (segs[3] === "restore") return adminRestore(request, env, segs[2]);
      throw notFound("\u8DEF\u7531\u4E0D\u5B58\u5728");
    }
    if (sub === "migrate" && n === 3 && segs[2] === "legacy-store") {
      if (method !== "POST") throw methodNotAllowed("POST");
      return adminMigrateLegacy(request, env, ctx);
    }
    if (sub === "audit-logs" && n === 2) {
      if (method !== "GET") throw methodNotAllowed("GET");
      return adminAuditLogs(request, env, url);
    }
    if (sub === "stats" && n === 2) {
      if (method !== "GET") throw methodNotAllowed("GET");
      return adminStats(request, env);
    }
  }
  throw notFound("\u8DEF\u7531\u4E0D\u5B58\u5728");
}
__name(route, "route");

// src/index.js
var PROVIDERS = {
  deepseek: { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  qwen: { name: "\u901A\u4E49\u5343\u95EE", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  moonshot: { name: "Moonshot", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  zhipu: { name: "\u667A\u8C31 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  siliconflow: { name: "\u7845\u57FA\u6D41\u52A8", baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-7B-Instruct" },
  groq: { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant" },
  ollama: { name: "\u672C\u5730 Ollama", baseUrl: "http://127.0.0.1:11434/v1", model: "qwen2.5:7b" }
};
function corsHeaders2(env, request) {
  return corsHeaders(env, request);
}
__name(corsHeaders2, "corsHeaders");
function json7(data, status, env) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, corsHeaders2(env || {}))
  });
}
__name(json7, "json");
function userKey(request) {
  const auth = request.headers.get("Authorization") || "";
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  const k = request.headers.get("X-AI-Key");
  return k ? k.trim() : "";
}
__name(userKey, "userKey");
function isSafeBaseUrl(u) {
  if (!u) return false;
  let url;
  try {
    url = new URL(u);
  } catch (e) {
    return false;
  }
  if (url.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)) return true;
  if (url.protocol !== "https:") return false;
  const h = url.hostname;
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
  if (/\.(internal|local|localhost)$/i.test(h)) return false;
  return true;
}
__name(isSafeBaseUrl, "isSafeBaseUrl");
function inferProvider(model) {
  if (!model) return "deepseek";
  var m = String(model).toLowerCase();
  if (/^gpt|^o[134]|^chatgpt/.test(m)) return "openai";
  if (/^qwen|^qwq/.test(m)) return "qwen";
  if (/^glm/.test(m)) return "zhipu";
  if (/^moonshot|^kimi/.test(m)) return "moonshot";
  if (/^llama|^mixtral/.test(m)) return "groq";
  return "deepseek";
}
__name(inferProvider, "inferProvider");
function resolveTarget(body) {
  if (body.provider && PROVIDERS[body.provider]) {
    const p2 = PROVIDERS[body.provider];
    return { id: body.provider, baseUrl: p2.baseUrl, model: body.model || p2.model };
  }
  if (body.baseUrl) {
    if (!isSafeBaseUrl(body.baseUrl)) return { error: "baseUrl \u4E0D\u5B89\u5168\u6216\u4E0D\u652F\u6301\uFF08\u4EC5\u5141\u8BB8 https\uFF0C\u7981\u6B62\u5185\u7F51\u5730\u5740\uFF09" };
    return { id: "custom", baseUrl: String(body.baseUrl).replace(/\/+$/, ""), model: body.model || "gpt-4o-mini" };
  }
  const id = inferProvider(body.model);
  const p = PROVIDERS[id] || PROVIDERS.deepseek;
  return { id, baseUrl: p.baseUrl, model: body.model || p.model };
}
__name(resolveTarget, "resolveTarget");
function buildPayload(body, target, stream) {
  const payload = {
    model: body.model || target.model,
    messages: Array.isArray(body.messages) ? body.messages : []
  };
  const passthrough = [
    "temperature",
    "top_p",
    "max_tokens",
    "n",
    "stop",
    "presence_penalty",
    "frequency_penalty",
    "seed",
    "response_format",
    "tools",
    "tool_choice",
    "parallel_tool_calls"
  ];
  for (const k of passthrough) if (body[k] !== void 0) payload[k] = body[k];
  if (stream) payload.stream = true;
  return payload;
}
__name(buildPayload, "buildPayload");
function oaiError(message, status, env, type) {
  return new Response(JSON.stringify({ error: { message, type: type || "upstream_error" } }), {
    status: status || 400,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, corsHeaders2(env))
  });
}
__name(oaiError, "oaiError");
async function handleChat(request, env, raw) {
  const fail3 = /* @__PURE__ */ __name((msg, status, code, extra) => raw ? oaiError(msg, status, env, code) : json7(Object.assign({ ok: false, code, error: msg }, extra || {}), status, env), "fail");
  if (request.method !== "POST") return fail3("POST only", 405, "METHOD");
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return fail3("invalid JSON body", 400, "BAD_JSON");
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return fail3("messages required", 400, "NO_MESSAGES");
  }
  if (env.MOCK_AI === "true") {
    const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
    const reply = `\u3010\u6A21\u62DF\u56DE\u590D\u3011\u6536\u5230\uFF1A\u300C${String(lastUser && lastUser.content || "").slice(0, 120)}\u300D\u3002\u8BF7\u5728\u4F60\u7684 Nexus OS \u8BBE\u7F6E\u91CC\u586B\u5165\u81EA\u5DF1\u7684 API Key\u3002`;
    if (raw) {
      return new Response(JSON.stringify({
        id: "mock",
        object: "chat.completion",
        model: "mock",
        choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      }), { headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders2(env)) });
    }
    return json7({ ok: true, mock: true, provider: "mock", content: reply, tool_calls: null, finish_reason: "stop" }, 200, env);
  }
  const key = userKey(request);
  if (!key) {
    return fail3("\u672A\u63D0\u4F9B API Key\u3002\u8BF7\u5728\u672C\u673A Nexus OS \u8BBE\u7F6E \u2192 AI \u5C0F\u65B9 \u91CC\u586B\u5165\u4F60\u81EA\u5DF1\u7684 Key\uFF08\u53EA\u5B58\u4F60\u672C\u673A\uFF0C\u4E0D\u4F1A\u4E0A\u4F20\u5230\u670D\u52A1\u5668\uFF09\u3002", 401, "NO_KEY");
  }
  const target = resolveTarget(body);
  if (target.error) return fail3(target.error, 400, "BAD_TARGET");
  const stream = !!body.stream;
  const url = target.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const payload = buildPayload(body, target, stream);
  let upstream;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return fail3("\u65E0\u6CD5\u8FDE\u63A5\u4E0A\u6E38\uFF1A" + (e && e.message), 502, "UPSTREAM_FETCH");
  }
  if (stream && upstream.ok) {
    const headers = {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    };
    Object.assign(headers, corsHeaders2(env));
    return new Response(upstream.body, { status: 200, headers });
  }
  let data = null, textBody = "";
  try {
    textBody = await upstream.text();
  } catch (e) {
  }
  try {
    data = JSON.parse(textBody);
  } catch (e) {
  }
  if (!upstream.ok) {
    const msg = data && data.error && (data.error.message || data.error) || textBody.slice(0, 500) || "HTTP " + upstream.status;
    return fail3(String(msg), upstream.status >= 500 ? 502 : upstream.status, upstream.status === 401 ? "BAD_KEY" : "UPSTREAM_ERROR", { status: upstream.status, provider: target.id });
  }
  if (!data) return fail3("\u4E0A\u6E38\u8FD4\u56DE\u975E JSON", 502, "NON_JSON", { raw: textBody.slice(0, 300) });
  if (raw) {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, corsHeaders2(env))
    });
  }
  const choice = data.choices && data.choices[0] || {};
  const message = choice.message || {};
  return json7({
    ok: true,
    provider: target.id,
    model: data.model || target.model,
    content: message.content == null ? "" : message.content,
    tool_calls: message.tool_calls || null,
    finish_reason: choice.finish_reason || null,
    usage: data.usage || null
  }, 200, env);
}
__name(handleChat, "handleChat");
async function handleMx(request, env, url) {
  const base = (env.MX_STORE_BASE || "").replace(/\/+$/, "");
  if (!base) return json7({ ok: false, error: "MX_STORE_BASE not configured" }, 503, env);
  const sub = url.pathname.replace(/^\/api\/mx/, "") || "/";
  const target = base + sub + (url.search || "");
  const init = { method: request.method, headers: {} };
  const ct = request.headers.get("Content-Type");
  if (ct) init.headers["Content-Type"] = ct;
  const auth = request.headers.get("Authorization");
  if (auth) init.headers["Authorization"] = auth;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      init.body = await request.arrayBuffer();
    } catch (e) {
    }
  }
  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    return json7({ ok: false, error: "MX upstream unreachable: " + (e && e.message) }, 502, env);
  }
  const headers = corsHeaders2(env);
  const upCt = upstream.headers.get("Content-Type");
  if (upCt) headers["Content-Type"] = upCt;
  const sha = upstream.headers.get("X-Content-SHA256");
  if (sha) headers["X-Content-SHA256"] = sha;
  const cd = upstream.headers.get("Content-Disposition");
  if (cd) headers["Content-Disposition"] = cd;
  headers["X-MX-Upstream-Status"] = String(upstream.status);
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
}
__name(handleMx, "handleMx");
async function handleAuthMe(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "").trim() : new URL(request.url).searchParams.get("token") || "";
  if (!token) return json7({ ok: false, code: "NO_TOKEN", error: "\u7F3A\u5C11\u4F1A\u8BDD\u4EE4\u724C" }, 401, env);
  const u = new URL(request.url);
  u.pathname = "/api/acc/me";
  u.search = "?token=" + encodeURIComponent(token);
  let res;
  try {
    res = await handleAccount(request, env, u);
  } catch (e) {
    return json7({ ok: false, code: "AUTH_UPSTREAM", error: "\u8D26\u53F7\u670D\u52A1\u4E0D\u53EF\u7528" }, 502, env);
  }
  const j = await res.json().catch(() => null);
  if (!j || !j.ok || !j.account) {
    return json7({ ok: false, code: "BAD_TOKEN", error: j && j.error || "\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55" }, 401, env);
  }
  const a = j.account;
  return json7({
    ok: true,
    user: {
      id: a.accountName,
      displayName: a.userName || a.accountName,
      avatar: a.avatar || "",
      email: a.email || "",
      uid: a.uid,
      accountName: a.accountName
    }
  }, 200, env);
}
__name(handleAuthMe, "handleAuthMe");
async function handleBingDaily(request, env) {
  const cors = corsHeaders2(env, request);
  const mkt = new URL(request.url).searchParams.get("mkt") || "zh-CN";
  try {
    const upstream = await fetch(
      "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=" + encodeURIComponent(mkt),
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; NexusOS26/1.0)" }, cf: { cacheTtl: 3600 } }
    );
    if (!upstream.ok) throw new Error("upstream " + upstream.status);
    const j = await upstream.json();
    const im = j && j.images && j.images[0];
    if (!im || !im.url) throw new Error("empty image");
    const full = /^https?:\/\//.test(im.url) ? im.url : "https://www.bing.com" + im.url;
    return new Response(JSON.stringify({
      ok: true,
      url: full,
      title: im.title || "",
      copyright: im.copyright || "",
      date: im.startdate || ""
    }), {
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: String(e && e.message || e) }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8" }
    });
  }
}
__name(handleBingDaily, "handleBingDaily");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders2(env, request) });
    if (url.pathname === "/api/health" || url.pathname === "/healthz") {
      return json7({
        ok: true,
        service: "nexus-os-ai",
        version: "3.2.0-review",
        mode: "byok",
        ownerKey: false,
        // 明确：服务器不持有任何人的 Key
        providers: Object.keys(PROVIDERS).map((id) => ({ id, name: PROVIDERS[id].name, model: PROVIDERS[id].model })),
        mxBase: env.MX_STORE_BASE || null
      }, 200, env);
    }
    if (url.pathname === "/api/models") {
      return json7({ ok: true, providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, model: p.model })) }, 200, env);
    }
    if (url.pathname === "/api/chat") return handleChat(request, env, false);
    if (url.pathname === "/api/auth/me") return handleAuthMe(request, env);
    if (url.pathname === "/v1/chat/completions" || url.pathname === "/chat/completions") return handleChat(request, env, true);
    if (url.pathname === "/v1/models") {
      return json7({ object: "list", data: Object.keys(PROVIDERS).map((id) => ({ id: PROVIDERS[id].model, object: "model", owned_by: id })) }, 200, env);
    }
    if (url.pathname.startsWith("/api/v1")) {
      const res = await handleV1(request, env, ctx, url);
      const h = new Headers(res.headers);
      Object.entries(corsHeaders2(env, request)).forEach(([k, v]) => h.set(k, v));
      if (request.method === "HEAD") return new Response(null, { status: res.status, headers: h });
      return new Response(res.body, { status: res.status, headers: h });
    }
    if (url.pathname.startsWith("/api/acc")) {
      const res = await handleAccount(request, env, url);
      const h = new Headers(res.headers);
      Object.entries(corsHeaders2(env, request)).forEach(([k, v]) => h.set(k, v));
      return new Response(res.body, { status: res.status, headers: h });
    }
    if (url.pathname.startsWith("/api/mx")) return handleMx(request, env, url);
    if (url.pathname.startsWith("/api/bili")) return handleBili(request, env, url);
    if (url.pathname.startsWith("/api/weather")) return handleWeather(request, env, url);
    if (url.pathname.startsWith("/api/map")) return handleMap(request, env, url);
    if (url.pathname.startsWith("/api/news")) return handleNews(request, env, url);
    if (url.pathname === "/api/bing/daily") return handleBingDaily(request, env);
    if (url.pathname.startsWith("/api/store")) {
      const res = await handleStore(request, env, url);
      const h = new Headers(res.headers);
      Object.entries(corsHeaders2(env, request)).forEach(([k, v]) => h.set(k, v));
      return new Response(res.body, { status: res.status, headers: h });
    }
    if (url.pathname.startsWith("/api/music")) {
      env.MUSIC_KV = env.MUSIC_KV || env.STORE_KV;
      return handleMusic(request, env, url);
    }
    if (url.pathname.startsWith("/api/admin")) {
      const res = await handleNexusAdmin(request, env, url);
      const h = new Headers(res.headers);
      Object.entries(corsHeaders2(env, request)).forEach(([k, v]) => h.set(k, v));
      return new Response(res.body, { status: res.status, headers: h });
    }
    if (url.pathname === "/" || url.pathname === "") {
      return json7({ ok: true, hint: "Nexus OS 26 AI backend (BYOK). POST /api/chat with your own key in Authorization header." }, 200, env);
    }
    return json7({ ok: false, error: "not found" }, 404, env);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
