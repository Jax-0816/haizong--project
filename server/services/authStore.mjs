import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { dirname, resolve } from "node:path";
import { getEnv } from "../config.mjs";

const authUsersPath = resolve(process.cwd(), getEnv("AUTH_USERS_PATH", "server/data/auth-users.json"));
const sessionTtlMs = Number(getEnv("AUTH_SESSION_TTL_MS", String(8 * 60 * 60 * 1000)));

export function loginWithPassword(body) {
  const identifier = normalizeIdentifier(body?.identifier ?? body?.phone);
  const password = String(body?.password ?? "");

  if (!password) {
    const error = new Error("请输入密码。");
    error.statusCode = 400;
    throw error;
  }

  const data = readAuthData();
  const now = new Date().toISOString();
  const user = findUserByIdentifier(data.users, identifier);

  if (!user) {
    throwInvalidCredentials();
  }
  if (user?.status === "deleted" || user?.status === "disabled") {
    const error = new Error(user.status === "disabled" ? "该账号已被管理员禁用，无法登录。" : "该账号已被管理员删除，无法登录。");
    error.statusCode = 403;
    throw error;
  }
  if (!normalizePasswordHash(user.passwordHash)) {
    const error = new Error(user.phone === getAdminPhone() ? "管理员账号尚未配置 AUTH_ADMIN_PASSWORD。" : "该账号尚未设置密码，请联系管理员重置。");
    error.statusCode = 403;
    throw error;
  }
  if (!verifyPassword(password, user.passwordHash)) {
    throwInvalidCredentials();
  }

  user.lastLoginAt = now;
  writeAuthData(data);

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
    users: data.users.filter((user) => user.status !== "deleted").map(publicUser),
  };
}

export function createAuthUser(req, body) {
  requireAdmin(req);
  const phone = normalizePhone(body?.phone);
  const password = normalizePassword(body?.password);
  const displayName = String(body?.displayName ?? "").trim() || maskPhone(phone);
  const role = normalizeRole(body?.role);
  const data = readAuthData();

  if (data.users.some((item) => item.phone === phone)) {
    const error = new Error("该手机号已存在。");
    error.statusCode = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const user = {
    id: nextUserId(data.users),
    phone,
    displayName,
    role,
    status: "active",
    createdAt: now,
    lastLoginAt: "",
    passwordHash: hashPassword(password),
  };
  data.users.push(user);
  writeAuthData(data);

  return { user: publicUser(user) };
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

export function updateAuthUserPassword(req, body) {
  requireAdmin(req);
  const userId = String(body?.userId ?? "").trim();
  const password = normalizePassword(body?.password);
  const data = readAuthData();
  const user = data.users.find((item) => item.id === userId);

  if (!user) {
    const error = new Error("未找到要更新的账号。");
    error.statusCode = 404;
    throw error;
  }
  if (user.status === "deleted") {
    const error = new Error("已删除账号不能重置密码。");
    error.statusCode = 400;
    throw error;
  }

  user.passwordHash = hashPassword(password);
  writeAuthData(data);

  return { user: publicUser(user) };
}

export function updateAuthUserStatus(req, body) {
  const admin = requireAdmin(req);
  const user = findManagedUser(body?.userId);
  const nextStatus = normalizeStatus(body?.status);

  if (admin.id === user.id && nextStatus !== "active") {
    const error = new Error("不能禁用或删除当前登录的管理员账号。");
    error.statusCode = 400;
    throw error;
  }

  const data = readAuthData();
  const target = data.users.find((item) => item.id === user.id);
  if (!target) {
    const error = new Error("未找到要更新的账号。");
    error.statusCode = 404;
    throw error;
  }

  if (target.role === "admin" && nextStatus !== "active" && activeAdmins(data.users).length <= 1) {
    const error = new Error("不能禁用或删除最后一个管理员账号。");
    error.statusCode = 400;
    throw error;
  }

  target.status = nextStatus;
  writeAuthData(data);

  return { user: publicUser(target) };
}

export function updateAuthUserRole(req, body) {
  const admin = requireAdmin(req);
  const nextRole = normalizeRole(body?.role);
  const data = readAuthData();
  const userId = String(body?.userId ?? "").trim();
  const user = data.users.find((item) => item.id === userId);

  if (!user) {
    const error = new Error("未找到要更新的账号。");
    error.statusCode = 404;
    throw error;
  }

  if (admin.id === user.id && nextRole !== "admin") {
    const error = new Error("不能取消当前登录账号的管理员权限。");
    error.statusCode = 400;
    throw error;
  }

  if (user.role === "admin" && nextRole !== "admin" && activeAdmins(data.users).length <= 1) {
    const error = new Error("不能取消最后一个管理员账号的权限。");
    error.statusCode = 400;
    throw error;
  }

  user.role = nextRole;
  if (user.status === "deleted") {
    user.status = "disabled";
  }
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

function readAuthData() {
  ensureAuthFile();
  const data = JSON.parse(readFileSync(authUsersPath, "utf8"));
  if (!data || typeof data !== "object" || !Array.isArray(data.users)) {
    return { users: [] };
  }
  const migrated = migrateAuthData(data);
  if (migrated.changed) {
    writeAuthData(migrated.data);
  }
  return ensureSeedAdmin(migrated.data);
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
  const adminPassword = getAdminPassword();
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
      passwordHash: adminPassword ? hashPassword(adminPassword) : "",
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
    if (!admin.passwordHash && adminPassword) {
      admin.passwordHash = hashPassword(adminPassword);
      changed = true;
    }
  }

  if (changed) {
    writeAuthData(data);
  }

  return data;
}

function normalizeUser(user) {
  const normalized = {
    id: String(user.id ?? ""),
    phone: String(user.phone ?? ""),
    displayName: String(user.displayName ?? ""),
    role: user.role === "admin" ? "admin" : "member",
    status: normalizeStatus(user.status, "active"),
    createdAt: String(user.createdAt ?? ""),
    lastLoginAt: String(user.lastLoginAt ?? ""),
  };

  const passwordHash = normalizePasswordHash(user.passwordHash);
  if (passwordHash) {
    normalized.passwordHash = passwordHash;
  } else if (typeof user.password === "string" && user.password) {
    normalized.passwordHash = hashPassword(user.password);
  }

  return normalized;
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
    hasPassword: !!normalizePasswordHash(user.passwordHash),
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
  if (!safeEqual(signature, expected)) {
    throwUnauthorized();
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  if (!payload.userId || !payload.exp || Number(payload.exp) <= Date.now()) {
    throwUnauthorized();
  }

  return payload;
}

function safeEqual(value, expected) {
  const valueBuffer = Buffer.from(String(value));
  const expectedBuffer = Buffer.from(String(expected));
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
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

function getAdminPassword() {
  return String(getEnv("AUTH_ADMIN_PASSWORD", "")).trim();
}

function getTokenSecret() {
  const secret = getEnv("AUTH_TOKEN_SECRET", "haizong-local-dev-secret");
  if (process.env.NODE_ENV === "production" && secret === "haizong-local-dev-secret") {
    const error = new Error("生产环境必须配置 AUTH_TOKEN_SECRET。");
    error.statusCode = 500;
    error.code = "MISSING_AUTH_TOKEN_SECRET";
    throw error;
  }
  return secret;
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

function normalizeIdentifier(value) {
  const identifier = String(value ?? "").trim();
  if (!identifier) {
    const error = new Error("请输入账号或手机号。");
    error.statusCode = 400;
    throw error;
  }
  return identifier;
}

function normalizePassword(value) {
  const password = String(value ?? "");
  if (password.length < 8) {
    const error = new Error("密码至少需要 8 位。");
    error.statusCode = 400;
    throw error;
  }
  return password;
}

function findUserByIdentifier(users, identifier) {
  const trimmed = String(identifier ?? "").trim();
  const compact = trimmed.replace(/\s+/g, "");
  return users.find((user) => user.phone === compact || user.displayName === trimmed || user.id === trimmed);
}

function throwInvalidCredentials() {
  const error = new Error("账号或密码不正确。");
  error.statusCode = 401;
  throw error;
}

function migrateAuthData(data) {
  const users = data.users.map(normalizeUser);
  const changed = JSON.stringify(users) !== JSON.stringify(data.users);
  return {
    changed,
    data: { users },
  };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const key = scryptSync(String(password), salt, 64).toString("base64url");
  return `scrypt$${salt}$${key}`;
}

function normalizePasswordHash(value) {
  const passwordHash = String(value ?? "").trim();
  if (!passwordHash) {
    return "";
  }

  if (!passwordHash.startsWith("scrypt$")) {
    return "";
  }

  const parts = passwordHash.split("$");
  if (parts.length !== 3 || !parts[1] || !parts[2]) {
    return "";
  }

  return passwordHash;
}

function verifyPassword(password, passwordHash) {
  const normalizedHash = normalizePasswordHash(passwordHash);
  if (!normalizedHash) {
    return false;
  }

  const [, salt, storedKey] = normalizedHash.split("$");
  const candidate = scryptSync(String(password), salt, 64);
  const stored = Buffer.from(storedKey, "base64url");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function findManagedUser(userId) {
  const id = String(userId ?? "").trim();
  if (!id) {
    const error = new Error("缺少用户 ID。");
    error.statusCode = 400;
    throw error;
  }

  const data = readAuthData();
  const user = data.users.find((item) => item.id === id);
  if (!user) {
    const error = new Error("未找到要更新的账号。");
    error.statusCode = 404;
    throw error;
  }
  return user;
}

function normalizeRole(value) {
  return value === "admin" ? "admin" : "member";
}

function normalizeStatus(value, fallback = "active") {
  if (value === "deleted" || value === "disabled" || value === "active") {
    return value;
  }
  return fallback;
}
