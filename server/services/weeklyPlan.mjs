import { readContent, writeContent } from "./contentStore.mjs";
import { getIndustryProfile, normalizeIndustryId } from "./industry.mjs";
import { generateResearchInsight, generateWeeklyPlan } from "./llm.mjs";
import { searchDouyinVideos } from "./douyinService.mjs";
import { searchCrossPlatformSources } from "./crossPlatformSearchService.mjs";

/**
 * 从选题池中智能生成本周发布计划（周一至周五），写入 content.json。
 *
 * @param {object} options
 * @param {string} options.industry - 行业 ID
 * @returns {Promise<Array<{ day: string, theme: string, output: string, topicId?: string, reason?: string }>>}
 */
export async function refreshWeeklyPlan({ industry }) {
  const content = readContent();
  const id = normalizeIndustryId(industry);
  const profile = getIndustryProfile(content, id);
  const industryLabel = profile?.label ?? (id === "bbq" ? "烧烤" : "火锅");

  // 过滤当前行业的选题
  const topics = (content.topics || [])
    .filter((t) => !t.industry || t.industry === id)
    .map((t) => ({
      id: t.id,
      title: t.title,
      topicCategory: t.topicCategory,
      contentType: t.contentType,
      targetUser: t.targetUser,
      painPoint: t.painPoint,
      angle: t.angle,
      coreView: t.coreView,
      platform: t.platform,
      format: t.format,
      scriptStatus: t.scriptStatus,
    }));

  const priorityTopics = (content.priorityTopics || [])
    .filter((p) => !p.industry || p.industry === id);

  const { weeklyPlan, warning } = await resolveWeeklyPlan({
    industry: id,
    industryLabel,
    topics,
    priorityTopics,
    hotspots: content.hotspots || [],
    positioning: content.positioning,
  });

  updateDashboard(content, id, { weeklyPlan });

  writeContent(content);

  return { weeklyPlan, warning };
}

export async function refreshDashboardDaily({ industry }) {
  const content = readContent();
  const id = normalizeIndustryId(industry);
  const profile = getIndustryProfile(content, id);
  const industryLabel = profile?.label ?? (id === "bbq" ? "烧烤" : "火锅");
  const refreshedAt = new Date().toISOString();
  const researchRequest = {
    industry: id,
    mode: "dashboardDecision",
    query: `${industryLabel}餐饮供应链今日内容机会`,
    targetUser: profile?.audience ?? content.positioning?.audience ?? "",
    column: "全部栏目",
    freshness: "oneDay",
    notes: JSON.stringify({
      task: "首页每日刷新：基于抖音与跨平台搜索结果生成今日推荐选题，只更新首页推荐区，不自动写入选题池。",
      industryProfile: profile,
      positioning: content.positioning,
      priorityTopics: content.priorityTopics,
      materials: content.materials,
    }),
  };
  const searchQuery = buildDashboardSearchQuery(researchRequest, profile);
  const [douyinVideos, crossPlatformResult] = await Promise.all([
    searchDouyinVideos({
      query: searchQuery,
      publishTime: "_1",
      sortType: "_1",
      maxResults: 12,
    }),
    searchCrossPlatformSources({
      keyword: searchQuery,
      sources: ["DOUYIN", "XIAOHONGSHU", "KUAISHOU", "WEIXIN"],
      maxResultsPerSource: 4,
    })
      .then((sources) => ({ sources, warning: "" }))
      .catch((caught) => {
        const message = caught instanceof Error ? caught.message : "跨平台搜索失败";
        return {
          sources: [],
          warning: `跨平台搜索已跳过：${message}`,
        };
      }),
  ]);
  const douyinSources = normalizeDouyinSources(douyinVideos, researchRequest.query);
  const mergedSources = mergeResearchSources([...douyinSources, ...crossPlatformResult.sources]);
  const researchModelResult = await generateResearchInsight({
    request: researchRequest,
    industry: id,
    accountContext: {
      industryProfile: profile,
      positioning: content.positioning,
      columns: content.columns,
      materials: content.materials,
      recentHotspots: content.hotspots,
      douyinTrends: douyinVideos,
      crossPlatformTrends: crossPlatformResult.sources,
    },
    sources: mergedSources,
  });
  const researchResult = normalizeDashboardResearchResult({
    request: researchRequest,
    sources: mergedSources,
    modelResult: researchModelResult,
  });

  const topics = getDashboardTopics(content, id);
  const { weeklyPlan, warning: weeklyPlanWarning } = await resolveWeeklyPlan({
    industry: id,
    industryLabel,
    topics,
    priorityTopics: (content.priorityTopics || []).filter((p) => !p.industry || p.industry === id),
    hotspots: content.hotspots || [],
    positioning: content.positioning,
  });
  const heroTopic = normalizeHeroTopic(researchResult, profile);
  const latestContent = readContent();

  updateDashboard(latestContent, id, {
    heroTopic,
    weeklyPlan,
    lastRefreshedAt: refreshedAt,
  });
  writeContent(latestContent);

  return {
    refreshedAt,
    heroTopic,
    weeklyPlan,
    sources: researchResult.sources ?? [],
    warning: [
      researchResult.sources?.length ? "" : "未获取到可展示的抖音或跨平台来源，请检查 JUSTONEAPI_TOKEN 或搜索服务。",
      crossPlatformResult.warning,
      !crossPlatformResult.warning && crossPlatformResult.sources.length === 0 ? "跨平台搜索未返回可展示来源，已使用抖音搜索继续刷新。" : "",
      weeklyPlanWarning,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

async function resolveWeeklyPlan({ industry, industryLabel, topics, priorityTopics, hotspots, positioning }) {
  try {
    const modelResult = await generateWeeklyPlan({
      industry,
      industryLabel,
      weeklyPlanContext: {
        topics,
        priorityTopics,
        hotspots,
        positioning,
      },
    });

    return {
      weeklyPlan: normalizeWeeklyPlan(modelResult, topics),
      warning: "",
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "周计划大模型生成失败";
    return {
      weeklyPlan: normalizeWeeklyPlan(null, topics),
      warning: `周计划已降级为本地选题兜底：${message}`,
    };
  }
}

function buildDashboardSearchQuery(request, profile) {
  const intent = profile?.searchKeywords?.dashboardDecision ?? profile?.searchKeywords?.general ?? "";
  const normalized = [request.query, request.targetUser, intent].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return normalized.length > 200 ? normalized.slice(0, 200) : normalized;
}

function mergeResearchSources(sources) {
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

function normalizeDouyinSources(videos, query) {
  const searchUrl = `https://www.douyin.com/search/${encodeURIComponent(query)}`;
  return (Array.isArray(videos) ? videos : []).slice(0, 8).map((video, index) => ({
    title: video.title || `抖音搜索结果 ${index + 1}`,
    url: video.play_url || searchUrl,
    siteName: "抖音",
    snippet: [
      video.title ? `视频标题：${video.title}` : "",
      Number.isFinite(video.digg_count) ? `点赞：${video.digg_count}` : "",
      Number.isFinite(video.comment_count) ? `评论：${video.comment_count}` : "",
    ].filter(Boolean).join("；"),
  }));
}

function normalizeDashboardResearchResult({ request, sources, modelResult }) {
  return {
    id: `dashboard-refresh-${Date.now()}`,
    createdAt: new Date().toISOString(),
    request,
    summary: String(modelResult.summary ?? ""),
    matchScore: modelResult.matchScore === "高" || modelResult.matchScore === "中" || modelResult.matchScore === "低" ? modelResult.matchScore : "中",
    matchedReason: String(modelResult.matchedReason ?? ""),
    angles: Array.isArray(modelResult.angles) ? modelResult.angles.map((item) => String(item)).filter(Boolean).slice(0, 5) : [],
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
    risks: Array.isArray(modelResult.risks) ? modelResult.risks.map((item) => String(item)).filter(Boolean).slice(0, 4) : [],
    sources,
  };
}

function buildWeeklyPlanContext(content, industryId) {
  return {
    topics: getDashboardTopics(content, industryId),
    priorityTopics: (content.priorityTopics || []).filter((p) => !p.industry || p.industry === industryId),
    hotspots: content.hotspots || [],
    positioning: content.positioning,
  };
}

function getDashboardTopics(content, industryId) {
  return (content.topics || [])
    .filter((t) => !t.industry || t.industry === industryId)
    .map((t) => ({
      id: t.id,
      title: t.title,
      topicCategory: t.topicCategory,
      contentType: t.contentType,
      targetUser: t.targetUser,
      painPoint: t.painPoint,
      angle: t.angle,
      coreView: t.coreView,
      platform: t.platform,
      format: t.format,
      scriptStatus: t.scriptStatus,
    }));
}

function updateDashboard(content, industryId, patch) {
  if (!Array.isArray(content.industryProfiles)) {
    const error = new Error("行业配置数据异常，无法写回首页配置。");
    error.statusCode = 500;
    throw error;
  }

  const index = content.industryProfiles.findIndex((profile) => profile?.id === industryId);
  if (index === -1) {
    const error = new Error("未找到当前行业配置，无法刷新首页。");
    error.statusCode = 404;
    throw error;
  }

  const profile = content.industryProfiles[index];
  content.industryProfiles[index] = {
    ...profile,
    dashboard: {
      ...profile.dashboard,
      ...patch,
    },
  };
}

function normalizeHeroTopic(researchResult, profile) {
  const firstIdea = Array.isArray(researchResult.topicIdeas) ? researchResult.topicIdeas[0] : null;
  const fallback = profile?.dashboard?.heroTopic ?? {};

  return {
    title: String(firstIdea?.title || fallback.title || `${profile?.label ?? "餐饮"}今日内容机会`),
    targetUser: String(firstIdea?.targetUser || fallback.targetUser || profile?.audience || ""),
    contentType: String(firstIdea?.angle || fallback.contentType || "AI 今日研判"),
    productAssociation: String(researchResult.angles?.[0] || fallback.productAssociation || profile?.conversionGoal || ""),
    platform: String(firstIdea?.platform || fallback.platform || profile?.platforms?.join(" / ") || ""),
  };
}

function normalizeWeeklyPlan(modelResult, topics) {
  const raw = Array.isArray(modelResult?.weeklyPlan) ? modelResult.weeklyPlan : [];

  if (raw.length === 0) {
    // 兜底：直接用选题池前 5 条
    return topics.slice(0, 5).map((t, i) => ({
      day: ["周一", "周二", "周三", "周四", "周五"][i] || "周一",
      theme: mapCategoryToTheme(t.topicCategory),
      output: t.title,
    }));
  }

  const days = ["周一", "周二", "周三", "周四", "周五"];

  return days.map((day, i) => {
    const match = raw.find((item) => String(item.day).includes(day)) || raw[i] || raw[0];
    return {
      day,
      theme: String(match.theme ?? mapCategoryToTheme(match?.topicCategory)).trim(),
      output: String(match.output ?? "").trim(),
      topicId: match.topicId ? String(match.topicId) : undefined,
      reason: match.reason ? String(match.reason) : undefined,
    };
  });
}

function mapCategoryToTheme(category) {
  const map = {
    行业热点选题: "行业热点 / 经营判断",
    产品种草选题: "产品选品指南",
    用户痛点选题: "痛点解决",
    B端经营选题: "痛点解决",
    爆品打造选题: "节日借势 / 套餐建议",
    案例拆解: "案例拆解",
    节气节日选题: "节日借势 / 套餐建议",
    系列化选题: "产品选品指南",
  };
  return map[category] || "行业热点 / 经营判断";
}
