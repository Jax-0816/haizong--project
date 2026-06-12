import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { getEnv } from "../config.mjs";

const authUsersPath = resolve(process.cwd(), getEnv("AUTH_USERS_PATH", "server/data/auth-users.json"));
const codeTtlMs = Number(getEnv("AUTH_CODE_TTL_MS", String(5 * 60 * 1000)));
const sessionTtlMs = Number(getEnv("AUTH_SESSION_TTL_MS", String(8 * 60 * 60 * 1000)));
const verificationCodes = new Map();

export function sendVerificationCode(body) {
  const phone = normalizePhone(body?.phone);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + codeTtlMs).toISOString();

  verificationCodes.set(phone, {
    code,
    expiresAt,
  });

  return {
    ok: true,
    phone,
    expiresAt,
    devCode: code,
    message: "本地模拟验证码已生成。",
  };
}

export function loginWithCode(body) {
  const phone = normalizePhone(body?.phone);
  const code = String(body?.code ?? "").trim();

  if (!code) {
    const error = new Error("请输入验证码。");
    error.statusCode = 400;
    throw error;
  }

  assertVerificationCode(phone, code);

  const data = readAuthData();
  const adminPhone = getAdminPhone();
  const now = new Date().toISOString();
  let user = data.users.find((item) => item.phone === phone);

  if (user?.status === "deleted") {
    const error = new Error("该账号已被管理员删除，无法登录。");
    error.statusCode = 403;
    throw error;
  }

  if (!user) {
    user = {
      id: nextUserId(data.users),
      phone,
      displayName: phone === adminPhone ? getAdminDisplayName() : maskPhone(phone),
      role: phone === adminPhone ? "admin" : "member",
      status: "active",
      createdAt: now,
      lastLoginAt: now,
    };
    data.users.push(user);
  } else {
    user.lastLoginAt = now;
    if (phone === adminPhone && user.role !== "admin") {
      user.role = "admin";
      user.displayName = user.displayName || getAdminDisplayName();
    }
  }

  writeAuthData(data);
  verificationCodes.delete(phone);

  return createSession(user);
}

export function getCurrentUserFromRequest(req) {
  const user = requireUser(req);
  return { user: publicUser(user) };
}

export function validateAuthSession(body) {
  const token = String(body?.token ?? "").trim();
  if (!token) {
    return { valid: false };
  }

  try {
    const user = getUserByToken(token);
    return { valid: true, user: publicUser(user) };
  } catch {
    return { valid: false };
  }
}

export function listAuthUsers(req) {
  requireAdmin(req);
  const data = readAuthData();

  return {
    users: data.users.map(publicUser),
  };
}

export function deleteAuthUser(req, body) {
  const admin = requireAdmin(req);
  const userId = String(body?.userId ?? "").trim();

  if (!userId) {
    const error = new Error("缺少用户 ID。");
    error.statusCode = 400;
    throw error;
  }

  if (admin.id === userId) {
    const error = new Error("不能删除当前登录的管理员账号。");
    error.statusCode = 400;
    throw error;
  }

  const data = readAuthData();
  const user = data.users.find((item) => item.id === userId);

  if (!user) {
    const error = new Error("未找到要删除的账号。");
    error.statusCode = 404;
    throw error;
  }

  if (user.role === "admin" && activeAdmins(data.users).length <= 1) {
    const error = new Error("不能删除最后一个管理员账号。");
    error.statusCode = 400;
    throw error;
  }

  user.status = "deleted";
  writeAuthData(data);

  return { user: publicUser(user) };
}

export function logoutAuthUser() {
  return { ok: true };
}

function requireAdmin(req) {
  const user = requireUser(req);
  if (user.role !== "admin") {
    const error = new Error("需要管理员权限。");
    error.statusCode = 403;
    throw error;
  }
  return user;
}

function requireUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error("缺少登录凭证。");
    error.statusCode = 401;
    throw error;
  }
  return getUserByToken(token);
}

function getUserByToken(token) {
  const payload = verifyToken(token);
  const data = readAuthData();
  const user = data.users.find((item) => item.id === payload.userId);

  if (!user || user.status !== "active") {
    const error = new Error("登录状态已失效，请重新登录。");
    error.statusCode = 401;
    throw error;
  }

  return user;
}

function assertVerificationCode(phone, code) {
  const record = verificationCodes.get(phone);

  if (!record) {
    const error = new Error("请先获取验证码。");
    error.statusCode = 400;
    throw error;
  }

  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    verificationCodes.delete(phone);
    const error = new Error("验证码已过期，请重新获取。");
    error.statusCode = 400;
    throw error;
  }

  if (record.code !== code) {
    const error = new Error("验证码不正确。");
    error.statusCode = 400;
    throw error;
  }
}

function readAuthData() {
  ensureAuthFile();
  const data = JSON.parse(readFileSync(authUsersPath, "utf8"));
  if (!data || typeof data !== "object" || !Array.isArray(data.users)) {
    return { users: [] };
  }
  return ensureSeedAdmin(data);
}

function writeAuthData(data) {
  const serialized = `${JSON.stringify({ users: data.users.map(normalizeUser) }, null, 2)}\n`;
  mkdirSync(dirname(authUsersPath), { recursive: true });
  const tempPath = resolve(dirname(authUsersPath), `.auth-users.${Date.now()}.${process.pid}.tmp`);
  writeFileSync(tempPath, serialized, "utf8");
  renameSync(tempPath, authUsersPath);
}

function ensureAuthFile() {
  if (existsSync(authUsersPath)) {
    return;
  }

  mkdirSync(dirname(authUsersPath), { recursive: true });
  writeFileSync(authUsersPath, JSON.stringify({ users: [] }, null, 2) + "\n", "utf8");
}

function ensureSeedAdmin(data) {
  const adminPhone = getAdminPhone();
  let changed = false;
  let admin = data.users.find((user) => user.phone === adminPhone);
  const now = new Date().toISOString();

  if (!admin) {
    admin = {
      id: nextUserId(data.users),
      phone: adminPhone,
      displayName: getAdminDisplayName(),
      role: "admin",
      status: "active",
      createdAt: now,
      lastLoginAt: "",
    };
    data.users.push(admin);
    changed = true;
  } else {
    const nextName = admin.displayName || getAdminDisplayName();
    if (admin.role !== "admin" || admin.status !== "active" || admin.displayName !== nextName) {
      admin.role = "admin";
      admin.status = "active";
      admin.displayName = nextName;
      changed = true;
    }
  }

  if (changed) {
    writeAuthData(data);
  }

  return data;
}

function normalizeUser(user) {
  return {
    id: String(user.id ?? ""),
    phone: String(user.phone ?? ""),
    displayName: String(user.displayName ?? ""),
    role: user.role === "admin" ? "admin" : "member",
    status: user.status === "deleted" ? "deleted" : "active",
    createdAt: String(user.createdAt ?? ""),
    lastLoginAt: String(user.lastLoginAt ?? ""),
  };
}

function createSession(user) {
  const loginAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  const token = signToken({
    userId: user.id,
    exp: new Date(expiresAt).getTime(),
    nonce: randomUUID(),
  });

  return {
    token,
    expiresAt,
    user: publicUser(user),
    loginAt,
  };
}

function publicUser(user) {
  return {
    id: user.id,
    phone: user.phone,
    username: user.phone,
    displayName: user.displayName || maskPhone(user.phone),
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

function signToken(payload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac("sha256", getTokenSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  const [encodedPayload, signature] = String(token).split(".");
  if (!encodedPayload || !signature) {
    throwUnauthorized();
  }

  const expected = createHmac("sha256", getTokenSecret()).update(encodedPayload).digest("base64url");
  if (signature !== expected) {
    throwUnauthorized();
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  if (!payload.userId || !payload.exp || Number(payload.exp) <= Date.now()) {
    throwUnauthorized();
  }

  return payload;
}

function throwUnauthorized() {
  const error = new Error("登录状态已失效，请重新登录。");
  error.statusCode = 401;
  throw error;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function getBearerToken(req) {
  const authorization = req.headers.authorization || "";
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function normalizePhone(value) {
  const phone = String(value ?? "").replace(/\s+/g, "");
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    const error = new Error("请输入有效的 11 位手机号。");
    error.statusCode = 400;
    throw error;
  }
  return phone;
}

function getAdminPhone() {
  return normalizePhone(getEnv("AUTH_ADMIN_PHONE", "13800000000"));
}

function getAdminDisplayName() {
  return getEnv("AUTH_ADMIN_DISPLAY_NAME", "海总管理员");
}

function getTokenSecret() {
  return getEnv("AUTH_TOKEN_SECRET", "haizong-local-dev-secret");
}

function nextUserId(users) {
  const max = users.reduce((currentMax, user) => {
    const match = String(user.id ?? "").match(/^user-(\d+)$/);
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);
  return `user-${String(max + 1).padStart(3, "0")}`;
}

function activeAdmins(users) {
  return users.filter((user) => user.role === "admin" && user.status === "active");
}

function maskPhone(phone) {
  return `${phone.slice(0, 3)}****${phone.slice(7)}`;
}
