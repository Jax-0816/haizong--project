import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateResearchInsight } from "./llm.mjs";
import { searchWeb } from "./search.mjs";

const content = JSON.parse(readFileSync(resolve(process.cwd(), "src/data/content.json"), "utf8"));

export async function runResearch(request) {
  const sources = await searchWeb({
    query: buildSearchQuery(request),
    freshness: request.freshness,
  });

  const modelResult = await generateResearchInsight({
    request,
    accountContext: {
      positioning: content.positioning,
      columns: content.columns,
      materials: content.materials,
      recentHotspots: content.hotspots,
    },
    sources,
  });

  return normalizeResearchResult({ request, sources, modelResult });
}

function buildSearchQuery(request) {
  const intent =
    request.mode === "dashboardDecision"
      ? "餐饮 火锅 供应链 经营 趋势 内容选题"
      : request.mode === "hotspotMatch"
        ? "餐饮 火锅 热点 经营 供应链"
        : request.mode === "topicExpand"
          ? "餐饮 火锅 爆品 选题 案例 经营"
          : request.mode === "materialSuggestion"
            ? "餐饮 火锅 供应链 素材 案例 复盘"
            : "";

  return truncateSearchQuery([request.query, request.targetUser, request.column, intent].filter(Boolean).join(" "));
}

function truncateSearchQuery(query) {
  const normalized = query.replace(/\s+/g, " ").trim();
  return normalized.length > 380 ? normalized.slice(0, 380) : normalized;
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
