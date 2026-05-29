import { readContent, writeContent } from "./contentStore.mjs";
import { generateTopicCandidates } from "./llm.mjs";
import { searchWeb } from "./search.mjs";

const topicCategories = [
  "行业热点选题",
  "节气节日选题",
  "产品种草选题",
  "B端经营选题",
  "用户痛点选题",
  "爆品打造选题",
  "系列化选题",
];

const categorySearchIntent = {
  行业热点选题: "餐饮趋势 火锅行业 消费变化 供应链热点 内容选题",
  节气节日选题: "火锅 节日 节气 备货 套餐 旺季 淡季",
  产品种草选题: "火锅食材 产品卖点 采购理由 门店经营 毛利 复购",
  B端经营选题: "火锅店 成本 毛利 翻台 菜单结构 后厨效率",
  用户痛点选题: "火锅店 采购 损耗 出餐 复购 标准化 库存 痛点",
  爆品打造选题: "火锅 招牌菜 爆款食材 套餐组合 复购逻辑",
  系列化选题: "火锅店 经营 系列 内容 选题 清单 模板",
};

export function getTopicCategories() {
  return topicCategories;
}

export async function generateCandidates(request) {
  const content = readContent();
  const sources = await searchWeb({
    query: buildCandidateSearchQuery(request),
    freshness: request.freshness,
  });

  const modelResult = await generateTopicCandidates({
    request,
    accountContext: {
      positioning: content.positioning,
      columns: content.columns,
      materials: content.materials,
      recentHotspots: content.hotspots,
      existingTopics: content.topics.map((topic) => ({
        title: topic.title,
        topicCategory: topic.topicCategory,
        column: topic.column,
        targetUser: topic.targetUser,
      })),
    },
    sources,
  });

  return normalizeCandidateResult({ request, sources, modelResult });
}

export async function refreshCandidates(filters) {
  const content = readContent();
  const request = buildRefreshRequest(filters, content);
  return generateCandidates(request);
}

export function confirmTopic(candidate) {
  const content = readContent();
  const topic = normalizeTopicForStorage(candidate, content);
  const existingTitle = content.topics.some((item) => item.title.trim() === topic.title.trim());

  if (existingTitle) {
    const error = new Error("选题池中已存在同名选题，请修改标题后再确认入池。");
    error.statusCode = 409;
    throw error;
  }

  content.topics.push(topic);
  writeContent(content);
  return topic;
}

function buildRefreshRequest(filters, content) {
  const column = String(filters.column ?? "").trim();
  const sourceFilter = String(filters.sourceFilter ?? "").trim();
  const contentStatus = String(filters.contentStatus ?? "").trim();
  const query = String(filters.query ?? "").trim();
  const normalizedColumn = column && column !== "全部栏目" ? column : content.columns[0];
  const category = inferCategoryFromSource(sourceFilter, normalizedColumn);
  const searchParts = [
    query,
    column !== "全部栏目" ? `${column} 相关内容选题` : "火锅店近期经营热点与供应链选题",
    sourceFilter !== "全部来源" ? `${sourceFilter} 方向` : "",
    contentStatus !== "全部状态" ? `${contentStatus} 可推进内容` : "",
  ].filter(Boolean);

  return {
    category,
    query: searchParts.join("，"),
    targetUser: content.positioning.audience,
    column: normalizedColumn,
    freshness: "oneMonth",
    notes: [
      "这是从选题池顶部筛选区发起的快捷重调研。",
      column !== "全部栏目" ? `优先适配栏目：${column}` : "栏目不限，但要能映射到现有栏目。",
      sourceFilter !== "全部来源" ? `优先贴近来源方向：${sourceFilter}` : "来源不限，但需要明确来源类型。",
      contentStatus !== "全部状态" ? `请优先生成适合当前状态“${contentStatus}”推进的题目。` : "内容状态不限。",
      query ? `用户补充检索词：${query}` : "没有额外关键词，请优先覆盖近期更值得推进的方向。",
      "避免与现有选题重复，标题要具体，可直接进入内容生产。",
    ].join("\n"),
    limit: clampRefreshLimit(filters.limit),
  };
}

function buildCandidateSearchQuery(request) {
  return truncateSearchQuery(
    [
      request.query,
      request.category,
      request.targetUser,
      request.column,
      categorySearchIntent[request.category],
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function normalizeCandidateResult({ request, sources, modelResult }) {
  const sourceUrlSet = new Set(sources.map((source) => source.url));
  const rawCandidates = Array.isArray(modelResult.candidates) ? modelResult.candidates : [];
  const existingTitleSet = new Set(readContent().topics.map((topic) => normalizeTitleKey(topic.title)));
  const seenTitleKeys = new Set();

  return {
    id: `candidate-run-${Date.now()}`,
    createdAt: new Date().toISOString(),
    request,
    candidates: rawCandidates
      .map((item, index) => {
        const sourceUrls = toStringArray(item.sourceUrls).filter((url) => sourceUrlSet.has(url));
        const score = clampScore(Number(item.recommendationScore));
        return {
          id: `candidate-${Date.now()}-${index + 1}`,
          title: String(item.title ?? "").trim(),
          topicCategory: normalizeCategory(item.topicCategory, request.category),
          targetUser: String(item.targetUser ?? request.targetUser ?? ""),
          painPoint: String(item.painPoint ?? ""),
          hotSource: String(item.hotSource ?? ""),
          angle: String(item.angle ?? ""),
          coreView: String(item.coreView ?? ""),
          businessLink: String(item.businessLink ?? ""),
          platform: String(item.platform ?? ""),
          format: String(item.format ?? ""),
          sourceUrls,
          recommendationScore: sourceUrls.length > 0 ? score : Math.min(score, 60),
          risks: toStringArray(item.risks).slice(0, 4),
        };
      })
      .filter((candidate) => candidate.title)
      .filter((candidate) => {
        const titleKey = normalizeTitleKey(candidate.title);
        if (!titleKey || seenTitleKeys.has(titleKey) || existingTitleSet.has(titleKey)) {
          return false;
        }
        seenTitleKeys.add(titleKey);
        return true;
      })
      .slice(0, request.limit),
    sources,
  };
}

function normalizeTopicForStorage(candidate, content) {
  const missingFields = ["title", "topicCategory", "targetUser", "painPoint", "angle", "coreView", "businessLink"].filter(
    (field) => !String(candidate[field] ?? "").trim(),
  );

  if (missingFields.length > 0) {
    const error = new Error(`确认入池失败，缺少字段：${missingFields.join("、")}。`);
    error.statusCode = 400;
    throw error;
  }

  const topicCategory = normalizeCategory(candidate.topicCategory);

  return {
    id: nextTopicId(content.topics),
    title: String(candidate.title).trim(),
    column: normalizeColumn(candidate.column, content.columns, topicCategory),
    topicCategory,
    contentType: inferContentType(topicCategory),
    targetUser: String(candidate.targetUser).trim(),
    painPoint: String(candidate.painPoint).trim(),
    businessLink: String(candidate.businessLink).trim(),
    hotSource: String(candidate.hotSource ?? "联网选题").trim() || "联网选题",
    angle: String(candidate.angle).trim(),
    coreView: String(candidate.coreView).trim(),
    platform: String(candidate.platform ?? "抖音/视频号").trim() || "抖音/视频号",
    format: String(candidate.format ?? "口播/图文").trim() || "口播/图文",
    scriptStatus: "未写",
    publishData: { views: 0, likes: 0, saves: 0, comments: 0, conversions: 0 },
    review: "AI 联网生成，已人工确认入池，待脚本和素材补充",
    sourceUrls: toStringArray(candidate.sourceUrls).slice(0, 4),
    recommendationScore: clampScore(Number(candidate.recommendationScore)),
    aiGenerated: true,
    riskNotes: toStringArray(candidate.risks).slice(0, 4),
  };
}

function normalizeColumn(column, columns, topicCategory) {
  const value = String(column ?? "").trim();
  if (columns.includes(value)) {
    return value;
  }

  const fallbackByCategory = {
    行业热点选题: "火锅店成本控制",
    节气节日选题: "节日节气备货建议",
    产品种草选题: "火锅食材选品指南",
    B端经营选题: "火锅店成本控制",
    用户痛点选题: "餐饮老板避坑指南",
    爆品打造选题: "火锅店爆品打造",
    系列化选题: "食材供应链知识",
  };

  return fallbackByCategory[topicCategory] ?? columns[0];
}

function inferContentType(topicCategory) {
  const map = {
    行业热点选题: "热点",
    节气节日选题: "节日",
    产品种草选题: "种草",
    B端经营选题: "经营",
    用户痛点选题: "痛点",
    爆品打造选题: "爆品",
    系列化选题: "系列",
  };
  return map[topicCategory] ?? "选题";
}

function nextTopicId(topics) {
  const max = topics.reduce((currentMax, topic) => {
    const match = String(topic.id ?? "").match(/^topic-(\d+)$/);
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);
  return `topic-${String(max + 1).padStart(3, "0")}`;
}

function normalizeCategory(value, fallback = "行业热点选题") {
  return topicCategories.includes(value) ? value : fallback;
}

function inferCategoryFromSource(sourceFilter, column) {
  if (sourceFilter === "节日节气") {
    return "节气节日选题";
  }
  if (sourceFilter === "用户痛点") {
    return "用户痛点选题";
  }
  if (sourceFilter === "产品卖点") {
    return "产品种草选题";
  }
  if (sourceFilter === "B端经营") {
    return "B端经营选题";
  }
  if (sourceFilter === "供应链趋势" || sourceFilter === "系列延展") {
    return "系列化选题";
  }
  if (column === "火锅店爆品打造") {
    return "爆品打造选题";
  }
  if (column === "节日节气备货建议") {
    return "节气节日选题";
  }
  if (column === "餐饮老板避坑指南") {
    return "用户痛点选题";
  }
  if (column === "食材供应链知识") {
    return "系列化选题";
  }
  if (column === "火锅食材选品指南") {
    return "产品种草选题";
  }
  return "行业热点选题";
}

function clampScore(value) {
  if (!Number.isFinite(value)) {
    return 60;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampRefreshLimit(value) {
  const limit = Number(value ?? 5);
  return Number.isFinite(limit) ? Math.min(8, Math.max(1, Math.round(limit))) : 5;
}

function toStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function truncateSearchQuery(query) {
  const normalized = query.replace(/\s+/g, " ").trim();
  return normalized.length > 380 ? normalized.slice(0, 380) : normalized;
}

function normalizeTitleKey(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[｜|/\\，,。！？!?\s]+/g, "")
    .trim();
}
