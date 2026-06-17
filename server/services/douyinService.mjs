import { requireEnv } from "../config.mjs";
import { cacheGet, cacheSet, cacheKey } from "./cache.mjs";

const DEFAULT_BASE_URL = "http://47.117.133.51:30015";
const DEFAULT_TIMEOUT_MS = 60000;

/**
 * 调用 JustOneAPI 抖音视频搜索 V4 接口，返回过滤后的视频列表。
 *
 * @param {object} options
 * @param {string}  options.query       - 搜索关键词（必填）
 * @param {number}  [options.maxResults] - 最多返回条数（默认 20，最大 20）
 * @param {string}  [options.sortType]   - 排序：_0 综合 / _1 最多点赞 / _2 最新发布（默认 _1）
 * @param {string}  [options.publishTime] - 发布时间：_0 不限 / _1 一天内 / _7 一周内 / _180 六月内（默认 _0）
 * @param {number}  [options.timeoutMs]  - 超时毫秒（默认 60000）
 * @returns {Promise<Array<{ title: string, digg_count: number, comment_count: number, play_url: string }>>}
 */
export async function searchDouyinVideos({
  query,
  maxResults = 20,
  sortType = "_1",
  publishTime = "_0",
  timeoutMs,
}) {
  const cacheParams = { query: String(query).trim(), sortType, publishTime };
  const ck = cacheKey("douyin", cacheParams);
  const cached = cacheGet(ck);
  if (cached) {
    return cached.slice(0, Math.min(maxResults, 20));
  }

  const token = requireEnv(
    "JUSTONEAPI_TOKEN",
    "缺少 JUSTONEAPI_TOKEN，请在 .env.local 中配置 JustOneAPI 认证 Token。",
  );
  const baseUrl = process.env.JUSTONEAPI_BASE_URL || DEFAULT_BASE_URL;
  const endpoint = `${baseUrl}/api/douyin/search-video/v4`;
  const timeout = normalizeTimeout(timeoutMs ?? process.env.JUSTONEAPI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  const params = new URLSearchParams({
    token,
    keyword: query,
    sortType,
    publishTime,
    page: "1",
  });
  const url = `${endpoint}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
  } catch (caught) {
    const isTimeout = caught?.name === "AbortError";
    const error = new Error(
      isTimeout
        ? "抖音搜索超时，请稍后重试。"
        : "抖音搜索服务连接失败，请检查本机网络或 JUSTONEAPI_TOKEN 配置。",
    );
    error.statusCode = 502;
    error.code = isTimeout ? "DOUYIN_SEARCH_TIMEOUT" : "DOUYIN_SEARCH_FETCH_FAILED";
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const message =
      response.status === 401 || response.status === 403
        ? "JustOneAPI Token 无效或已过期，请检查 JUSTONEAPI_TOKEN 配置。"
        : `抖音搜索 API 请求失败：${response.status}${detail ? ` ${detail}` : ""}`;
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const results = normalizeDouyinResults(payload, maxResults);
  cacheSet(ck, results);
  return results;
}

/**
 * 将 JustOneAPI 返回的原始数据规范化为选题调研所需字段。
 *
 * JustOneAPI V4 搜索响应结构：
 * {
 *   code: 0,
 *   data: {
 *     business_data: [
 *       { data: { aweme_info: { desc, statistics: { digg_count, comment_count }, video: { play_addr: { url_list } } } } }
 *     ]
 *   }
 * }
 *
 * 只提取餐饮选题调研需要的字段：
 *   title（标题）、digg_count（点赞数）、comment_count（评论数）、play_url（播放链接）
 */
function normalizeDouyinResults(payload, maxResults) {
  const items = payload?.data?.business_data ?? [];

  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      const info = item?.data?.aweme_info;
      if (!info) return null;
      return {
        title: String(info.desc ?? "").trim(),
        digg_count: normalizeCount(info.statistics?.digg_count),
        comment_count: normalizeCount(info.statistics?.comment_count),
        play_url: String(info.video?.play_addr?.url_list?.[0] ?? "").trim(),
      };
    })
    .filter(Boolean)
    .filter((item) => item.title)
    .slice(0, Math.min(maxResults, 20));
}

/** 将各种可能的计数字段统一转为数字，无效值返回 0 */
function normalizeCount(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function normalizeTimeout(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : fallback;
}
