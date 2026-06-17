import { readContent, writeContent } from "./contentStore.mjs";
import { getIndustryProfile, normalizeIndustryId } from "./industry.mjs";
import { generateWeeklyPlan } from "./llm.mjs";

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

  const modelResult = await generateWeeklyPlan({
    industry: id,
    industryLabel,
    weeklyPlanContext: {
      topics,
      priorityTopics,
      hotspots: content.hotspots || [],
      positioning: content.positioning,
    },
  });

  const weeklyPlan = normalizeWeeklyPlan(modelResult, topics);

  // 写回 content.json
  const profileKey = id === "bbq" ? "bbq" : "hotpot";
  if (!content.industryProfiles) content.industryProfiles = {};
  if (!content.industryProfiles[profileKey]) content.industryProfiles[profileKey] = {};
  if (!content.industryProfiles[profileKey].dashboard) content.industryProfiles[profileKey].dashboard = {};
  content.industryProfiles[profileKey].dashboard.weeklyPlan = weeklyPlan;

  writeContent(content);

  return { weeklyPlan };
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
