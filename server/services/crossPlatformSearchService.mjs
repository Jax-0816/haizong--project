import { requireEnv } from "../config.mjs";
import { cacheGet, cacheSet, cacheKey } from "./cache.mjs";

const DEFAULT_BASE_URL = "http://47.117.133.51:30015";
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_SOURCES = ["DOUYIN", "XIAOHONGSHU", "KUAISHOU", "WEIXIN"];
const SOURCE_LABELS = {
  DOUYIN: "抖音",
  XIAOHONGSHU: "小红书",
  KUAISHOU: "快手",
  WEIXIN: "微信",
  WEIBO: "微博",
  BILIBILI: "哔哩哔哩",
  ZHIHU: "知乎",
  NEWS: "新闻",
};

export async function searchCrossPlatformSources({
  keyword,
  sources = DEFAULT_SOURCES,
  start,
  end,
  maxResultsPerSource = 5,
  timeoutMs,
}) {
  const normalizedKeyword = String(keyword ?? "").trim();
  if (!normalizedKeyword) {
    return [];
  }

  const token = requireEnv(
    "JUSTONEAPI_TOKEN",
    "缺少 JUSTONEAPI_TOKEN，请在 .env.local 中配置 JustOneAPI 认证 Token。",
  );
  const range = resolveTimeRange({ start, end });
  const results = await Promise.all(
    sources.map((source) =>
      searchSingleSource({
        token,
        keyword: normalizedKeyword,
        source,
        start: range.start,
        end: range.end,
        maxResults: maxResultsPerSource,
        timeoutMs,
      }),
    ),
  );

  return dedupeSources(results.flat()).slice(0, sources.length * maxResultsPerSource);
}

async function searchSingleSource({ token, keyword, source, start, end, maxResults, timeoutMs }) {
  const normalizedSource = String(source || "ALL").toUpperCase();
  const cacheParams = { keyword, source: normalizedSource, start, end };
  const ck = cacheKey("cross-platform-search", cacheParams);
  const cached = cacheGet(ck);
  if (cached) {
    return cached.slice(0, maxResults);
  }

  const baseUrl = process.env.JUSTONEAPI_BASE_URL || DEFAULT_BASE_URL;
  const endpoint = `${baseUrl}/api/search/v1`;
  const timeout = normalizeTimeout(timeoutMs ?? process.env.JUSTONEAPI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const params = new URLSearchParams({
    token,
    keyword,
    source: normalizedSource,
    start,
    end,
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
        ? `${sourceLabel(normalizedSource)}跨平台搜索超时，请稍后重试。`
        : `${sourceLabel(normalizedSource)}跨平台搜索连接失败，请检查本机网络或 JUSTONEAPI_TOKEN 配置。`,
    );
    error.statusCode = 502;
    error.code = isTimeout ? "CROSS_PLATFORM_SEARCH_TIMEOUT" : "CROSS_PLATFORM_SEARCH_FETCH_FAILED";
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const message =
      response.status === 401 || response.status === 403
        ? "JustOneAPI Token 无效或已过期，请检查 JUSTONEAPI_TOKEN 配置。"
        : `${sourceLabel(normalizedSource)}跨平台搜索 API 请求失败：${response.status}${detail ? ` ${detail}` : ""}`;
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  if (String(payload?.code ?? "0") !== "0") {
    const error = new Error(`${sourceLabel(normalizedSource)}跨平台搜索返回异常：${payload?.message ?? payload?.code ?? "未知错误"}`);
    error.statusCode = 502;
    throw error;
  }

  const normalized = normalizeCrossPlatformSources(payload, normalizedSource, keyword).slice(0, maxResults);
  cacheSet(ck, normalized);
  return normalized;
}

function normalizeCrossPlatformSources(payload, source, keyword) {
  const items = collectResultItems(payload?.data);
  return items
    .map((item, index) => normalizeSourceItem(item, source, keyword, index))
    .filter(Boolean);
}

function collectResultItems(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (!data || typeof data !== "object") {
    return [];
  }

  const candidates = [
    data.list,
    data.items,
    data.records,
    data.results,
    data.data,
    data.searchResult,
    data.searchResults,
    data.feeds,
    data.documents,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  for (const value of Object.values(data)) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function normalizeSourceItem(item, source, keyword, index) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const nested = item.data && typeof item.data === "object" ? item.data : {};
  const title = firstString(
    item.title,
    item.name,
    item.desc,
    item.description,
    item.content,
    item.text,
    item.keyword,
    nested.title,
    nested.name,
    nested.desc,
    nested.description,
    nested.content,
    nested.text,
  );
  const url = firstString(
    item.url,
    item.link,
    item.shareUrl,
    item.share_url,
    item.articleUrl,
    item.article_url,
    item.videoUrl,
    item.video_url,
    item.noteUrl,
    item.note_url,
    nested.url,
    nested.link,
    nested.shareUrl,
    nested.share_url,
  );
  const author = firstString(item.author, item.nickname, item.userName, item.username, nested.author, nested.nickname);
  const publishedAt = firstString(
    item.datePublished,
    item.publishTime,
    item.publish_time,
    item.createdAt,
    item.created_at,
    item.time,
    nested.datePublished,
    nested.publishTime,
    nested.publish_time,
  );
  const snippet = [
    title ? `标题：${title}` : "",
    author ? `作者：${author}` : "",
    publishedAt ? `时间：${publishedAt}` : "",
    firstString(item.summary, item.snippet, item.brief, nested.summary, nested.snippet, nested.brief),
  ].filter(Boolean).join("；");

  if (!title && !url && !snippet) {
    return null;
  }

  return {
    title: title || `${sourceLabel(source)}搜索结果 ${index + 1}`,
    url: url || buildSearchUrl(source, keyword),
    siteName: sourceLabel(source),
    snippet: snippet || `${sourceLabel(source)}跨平台搜索结果`,
    datePublished: publishedAt || undefined,
  };
}

function resolveTimeRange({ start, end }) {
  const endDate = end ? new Date(end) : new Date();
  const startDate = start ? new Date(start) : new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
  return {
    start: formatDateTime(startDate),
    end: formatDateTime(endDate),
  };
}

function formatDateTime(date) {
  const value = Number.isFinite(date.getTime()) ? date : new Date();
  const pad = (num) => String(num).padStart(2, "0");
  return [
    value.getFullYear(),
    "-",
    pad(value.getMonth() + 1),
    "-",
    pad(value.getDate()),
    " ",
    pad(value.getHours()),
    ":",
    pad(value.getMinutes()),
    ":",
    pad(value.getSeconds()),
  ].join("");
}

function firstString(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function buildSearchUrl(source, keyword) {
  const encoded = encodeURIComponent(keyword);
  const urls = {
    DOUYIN: `https://www.douyin.com/search/${encoded}`,
    XIAOHONGSHU: `https://www.xiaohongshu.com/search_result?keyword=${encoded}`,
    KUAISHOU: `https://www.kuaishou.com/search/video?searchKey=${encoded}`,
    WEIXIN: `https://weixin.sogou.com/weixin?type=2&query=${encoded}`,
  };
  return urls[source] || `https://www.baidu.com/s?wd=${encoded}`;
}

function sourceLabel(source) {
  return SOURCE_LABELS[source] || source || "跨平台";
}

function dedupeSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = source.url || `${source.siteName}:${source.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeTimeout(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : fallback;
}
