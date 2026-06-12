import { requireEnv } from "../config.mjs";

const DEFAULT_SEARCH_URL = "https://api.tavily.com/search";
const DEFAULT_SEARCH_TIMEOUT_MS = 15000;
const freshnessToTimeRange = {
  noLimit: undefined,
  oneDay: "day",
  oneWeek: "week",
  oneMonth: "month",
  oneYear: "year",
};

export async function searchWeb({ query, freshness }) {
  const apiKey = requireEnv("TAVILY_API_KEY", "缺少 TAVILY_API_KEY，请在 .env.local 中配置 Tavily API Key。");
  const endpoint = process.env.TAVILY_BASE_URL || DEFAULT_SEARCH_URL;
  const timeRange = freshnessToTimeRange[freshness];
  const timeoutMs = normalizeTimeout(process.env.TAVILY_TIMEOUT_MS, DEFAULT_SEARCH_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        topic: "general",
        search_depth: "basic",
        max_results: 8,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        ...(timeRange ? { time_range: timeRange } : {}),
      }),
    });
  } catch (caught) {
    const isTimeout = caught?.name === "AbortError";
    const error = new Error(
      isTimeout
        ? "联网搜索超时，请稍后重试，或先减少调研关键词。"
        : "联网搜索服务连接失败，请检查本机网络、TAVILY_API_KEY 或 TAVILY_BASE_URL 配置。",
    );
    error.statusCode = 502;
    error.code = isTimeout ? "SEARCH_TIMEOUT" : "SEARCH_FETCH_FAILED";
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text();
    const message =
      response.status === 400 && /query is too long/i.test(detail)
        ? "搜索关键词过长，请减少调研主题字数后重试。"
        : `搜索 API 请求失败：${response.status} ${detail}`;
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  return normalizeSearchResults(payload);
}

function normalizeTimeout(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : fallback;
}

function normalizeSearchResults(payload) {
  const candidates =
    payload?.data?.webPages?.value ??
    payload?.data?.webPages ??
    payload?.webPages?.value ??
    payload?.webPages ??
    payload?.results ??
    [];

  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .map((item) => ({
      title: String(item.name ?? item.title ?? ""),
      url: String(item.url ?? item.link ?? ""),
      siteName: String(item.siteName ?? item.site ?? item.displayUrl ?? getHostName(item.url ?? item.link ?? "")),
      snippet: String(item.snippet ?? item.description ?? item.content ?? ""),
      summary: item.summary ? String(item.summary) : undefined,
      datePublished: item.datePublished ? String(item.datePublished) : undefined,
    }))
    .filter((item) => item.title && item.url)
    .slice(0, 8);
}

function getHostName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
