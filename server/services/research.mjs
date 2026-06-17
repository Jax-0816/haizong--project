import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getIndustryProfile, normalizeIndustryId } from "./industry.mjs";
import { generateResearchInsight } from "./llm.mjs";
import { searchWeb } from "./search.mjs";
import { searchDouyinVideos } from "./douyinService.mjs";

const content = JSON.parse(readFileSync(resolve(process.cwd(), "src/data/content.json"), "utf8"));

export async function runResearch(request) {
  const industry = normalizeIndustryId(request.industry);
  const douyinPublishTime = freshnessToDouyinPublishTime(request.freshness);

  // 并行调用 Tavily 网页搜索 + 抖音视频搜索（抖音失败降级，不阻塞主流程）
  const [sources, douyinVideos] = await Promise.all([
    searchWeb({
      query: buildSearchQuery(request, industry),
      freshness: request.freshness,
    }),
    searchDouyinVideos({
      query: buildDouyinQuery(request, industry),
      publishTime: douyinPublishTime,
      maxResults: 10,
    }).catch((err) => {
      console.warn("[research] 抖音搜索失败，继续主流程:", err.message);
      return [];
    }),
  ]);

  const modelResult = await generateResearchInsight({
    request,
    industry,
    accountContext: {
      industryProfile: getIndustryProfile(content, industry),
      positioning: content.positioning,
      columns: content.columns,
      materials: content.materials,
      recentHotspots: content.hotspots,
      douyinTrends: douyinVideos,
    },
    sources,
  });

  return normalizeResearchResult({ request, sources, modelResult });
}

function buildSearchQuery(request, industry) {
  const profile = getIndustryProfile(content, industry);
  const intent =
    request.mode === "dashboardDecision"
      ? profile?.searchKeywords?.dashboardDecision
      : request.mode === "hotspotMatch"
        ? profile?.searchKeywords?.hotspotMatch
        : request.mode === "topicExpand"
          ? profile?.searchKeywords?.topicExpand
          : request.mode === "materialSuggestion"
            ? profile?.searchKeywords?.materialSuggestion
            : profile?.searchKeywords?.general;

  return truncateSearchQuery([request.query, request.targetUser, request.column, intent].filter(Boolean).join(" "));
}

function truncateSearchQuery(query) {
  const normalized = query.replace(/\s+/g, " ").trim();
  return normalized.length > 380 ? normalized.slice(0, 380) : normalized;
}

function buildDouyinQuery(request, industry) {
  const profile = getIndustryProfile(content, industry);
  const intent = profile?.searchKeywords?.general ?? "";
  const parts = [request.query, intent].filter(Boolean).join(" ");
  const normalized = parts.replace(/\s+/g, " ").trim();
  return normalized.length > 200 ? normalized.slice(0, 200) : normalized;
}

function freshnessToDouyinPublishTime(freshness) {
  const map = {
    noLimit: "_0",
    oneDay: "_1",
    oneWeek: "_7",
    oneMonth: "_180",
    oneYear: "_180",
  };
  return map[freshness] ?? "_0";
}

function normalizeResearchResult({ request, sources, modelResult }) {
  return {
    id: `research-${Date.now()}`,
    createdAt: new Date().toISOString(),
    request,
    summary: String(modelResult.summary ?? ""),
    matchScore: normalizeScore(modelResult.matchScore),
    matchedReason: String(modelResult.matchedReason ?? ""),
    angles: toStringArray(modelResult.angles).slice(0, 5),
    topicIdeas: Array.isArray(modelResult.topicIdeas)
      ? modelResult.topicIdeas.slice(0, 5).map((item) => ({
          title: String(item.title ?? ""),
          targetUser: String(item.targetUser ?? ""),
          angle: String(item.angle ?? ""),
          coreView: String(item.coreView ?? ""),
          platform: String(item.platform ?? ""),
          format: String(item.format ?? ""),
        }))
      : [],
    risks: toStringArray(modelResult.risks).slice(0, 4),
    sources,
  };
}

function normalizeScore(value) {
  return value === "高" || value === "中" || value === "低" ? value : "中";
}

function toStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}
