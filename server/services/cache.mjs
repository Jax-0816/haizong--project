/**
 * 通用内存 TTL 缓存。
 *
 * - 默认 TTL 30 分钟，可通过 CACHE_TTL_MS 环境变量调节。
 * - 每次 get/set 时自动清理过期条目。
 * - 纯内存实现，服务重启即清空。
 */

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 分钟

function resolveTTL() {
  const parsed = Number(process.env.CACHE_TTL_MS);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : DEFAULT_TTL_MS;
}

const store = new Map();

function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.expiresAt) {
      store.delete(key);
    }
  }
}

/**
 * 读取缓存。命中返回 value，未命中或已过期返回 undefined。
 * @param {string} key
 * @returns {any|undefined}
 */
export function cacheGet(key) {
  purgeExpired();
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * 写入缓存。
 * @param {string} key
 * @param {any} value
 * @param {number} [ttlMs] - 自定义 TTL（毫秒），默认 30 分钟
 */
export function cacheSet(key, value, ttlMs) {
  purgeExpired();
  store.set(key, {
    value,
    expiresAt: Date.now() + (ttlMs ?? resolveTTL()),
  });
}

/**
 * 生成稳定的缓存 key。
 * @param {string} prefix - 前缀（如 "douyin"）
 * @param {object} params - 参数对象
 * @returns {string}
 */
export function cacheKey(prefix, params = {}) {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  const suffix = entries.map(([k, v]) => `${k}=${String(v)}`).join("&");
  return suffix ? `${prefix}:${suffix}` : prefix;
}
