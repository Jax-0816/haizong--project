import { readContent, writeContent } from "./contentStore.mjs";
import { getIndustryProfile, getTopicColumnFallback, normalizeIndustryId } from "./industry.mjs";
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
  const industry = normalizeIndustryId(request.industry);
  const profile = getIndustryProfile(content, industry);
  const warnings = [];
  let sources = [];

  try {
    sources = await searchWeb({
      query: buildCandidateSearchQuery(request, profile),
      freshness: request.freshness,
    });
  } catch (caught) {
    warnings.push(normalizeExternalErrorMessage(caught, "联网搜索失败，已改用本地资料生成候选。"));
    console.warn("[topic-candidates] search failed, fallback to local context:", caught?.message ?? caught);
  }

  let modelResult;
  const accountContext = {
    industryProfile: profile,
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
  };

  try {
    modelResult = await generateTopicCandidates({
      request,
      industry,
      accountContext,
      sources,
    });
  } catch (caught) {
    warnings.push(normalizeExternalErrorMessage(caught, "大模型生成失败，已改用本地资料生成候选。"));
    console.warn("[topic-candidates] llm failed, fallback to local candidates:", caught?.message ?? caught);
    modelResult = buildLocalCandidateResult({ request, content, industry, profile });
  }

  return normalizeCandidateResult({ request, sources, modelResult, warnings });
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
  const industry = normalizeIndustryId(filters.industry);
  const profile = getIndustryProfile(content, industry);
  const normalizedColumn = column && column !== "全部栏目" ? column : getTopicColumnFallback(content, industry);
  const category = inferCategoryFromSource(sourceFilter, normalizedColumn);
  const searchParts = [
    query,
    column !== "全部栏目" ? `${column} 相关内容选题` : `${profile?.label ?? "当前行业"}近期经营热点与供应链选题`,
    sourceFilter !== "全部来源" ? `${sourceFilter} 方向` : "",
    contentStatus !== "全部状态" ? `${contentStatus} 可推进内容` : "",
  ].filter(Boolean);

  return {
    industry,
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

function buildCandidateSearchQuery(request, profile) {
  return truncateSearchQuery(
    [
      request.query,
      request.category,
      request.targetUser,
      request.column,
      profile?.searchKeywords?.candidate ?? categorySearchIntent[request.category],
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function normalizeCandidateResult({ request, sources, modelResult, warnings = [] }) {
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
          industry: normalizeIndustryId(item.industry, request.industry),
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
    warning: warnings.filter(Boolean).join(" "),
  };
}

function buildLocalCandidateResult({ request, content, industry, profile }) {
  const industryLabel = profile?.label ?? (industry === "bbq" ? "烧烤" : "火锅");
  const targetUser = String(request.targetUser ?? content.positioning?.audience ?? `${industryLabel}店老板`).trim();
  const category = normalizeCategory(request.category);
  const column = String(request.column ?? getTopicColumnFallback(content, industry)).trim();
  const query = String(request.query ?? "").trim();
  const materialTitles = Array.isArray(content.materials)
    ? content.materials
        .filter((section) => !section.industry || section.industry === industry)
        .map((section) => section.title)
        .slice(0, 4)
    : [];
  const baseTopics = [
    {
      title: `${targetUser}近期选品，先避开这3个高损耗坑`,
      painPoint: "门店想追热点上新品，但担心备货复杂、损耗上升、后厨执行不稳定。",
      angle: "从经营避坑切入，把选品判断拆成损耗、出餐、复购三个标准。",
      coreView: "选题先看能不能帮门店稳定赚钱，不是只看名字和流量热度。",
      businessLink: `结合${materialTitles.join("、") || `${industryLabel}食材供应链`}，给门店提供更稳的备货和搭配建议。`,
      format: "避坑型口播",
    },
    {
      title: `${industryLabel}店做爆品，别只换名字，要先算清这4笔账`,
      painPoint: "老板容易把爆品理解成新奇名字，忽略毛利、出餐效率和复购承接。",
      angle: "用算账逻辑拆解爆品打造，让内容更贴近 B 端经营决策。",
      coreView: "真正能长期跑的爆品，必须同时满足好出、好卖、好复购、好管理。",
      businessLink: `从供应链稳定性、产品规格和组合套餐角度，承接${column}方向。`,
      format: "清单型图文/口播",
    },
    {
      title: `${query || `${industryLabel}近期经营热点`}，门店老板真正该关注的是后厨能不能接住`,
      painPoint: "热点来了以后，门店容易盲目跟风，最后形成库存压力和出品波动。",
      angle: "把外部热点拉回门店后厨执行，强调标准化和供应链稳定。",
      coreView: "热点只负责吸引注意力，能不能变成复购，取决于后厨稳定交付。",
      businessLink: `关联${industryLabel}食材标准化、备货节奏和门店出餐效率。`,
      format: "观点型短视频",
    },
    {
      title: `${targetUser}做内容，不要只拍产品，要拍清楚顾客为什么愿意复购`,
      painPoint: "内容容易停留在展示产品，缺少门店经营价值和复购逻辑。",
      angle: "把产品卖点转成门店复购理由，适合做系列化内容。",
      coreView: "B 端内容要让老板看到经营结果，而不是只看到一个食材名称。",
      businessLink: `用${materialTitles[0] || `${industryLabel}供应链产品`}作为案例，说明稳定供应和标准出品的价值。`,
      format: "系列化口播",
    },
  ];

  return {
    candidates: baseTopics.slice(0, clampRefreshLimit(request.limit)).map((item) => ({
      ...item,
      industry,
      topicCategory: category,
      targetUser,
      hotSource: "本地资料兜底生成，未使用实时搜索来源",
      platform: "抖音/视频号",
      sourceUrls: [],
      recommendationScore: 52,
      risks: [
        "当前候选未引用实时搜索来源，需要人工确认热点真实性。",
        "建议补充门店案例、产品资料或最新行业数据后再确认入池。",
      ],
    })),
  };
}

function normalizeExternalErrorMessage(error, fallback) {
  const message = String(error?.message ?? "").trim();
  if (!message || message === "fetch failed" || message === "terminated") {
    return fallback;
  }
  return message;
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
  const industry = normalizeIndustryId(candidate.industry);

  return {
    id: nextTopicId(content.topics),
    industry,
    title: String(candidate.title).trim(),
    column: normalizeColumn(candidate.column, content.columns, topicCategory, industry),
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

function normalizeColumn(column, columns, topicCategory, industry) {
  const value = String(column ?? "").trim();
  if (columns.includes(value)) {
    return value;
  }

  const fallbackByCategory = {
    hotpot: {
      行业热点选题: "火锅店成本控制",
      节气节日选题: "节日节气备货建议",
      产品种草选题: "火锅食材选品指南",
      B端经营选题: "火锅店成本控制",
      用户痛点选题: "餐饮老板避坑指南",
      爆品打造选题: "火锅店爆品打造",
      系列化选题: "食材供应链知识",
    },
    bbq: {
      行业热点选题: "烧烤店成本控制",
      节气节日选题: "节日节气备货建议",
      产品种草选题: "烧烤食材选品指南",
      B端经营选题: "烧烤店成本控制",
      用户痛点选题: "餐饮老板避坑指南",
      爆品打造选题: "烧烤店爆品打造",
      系列化选题: "食材供应链知识",
    },
  };

  return fallbackByCategory[industry]?.[topicCategory] ?? columns[0];
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
  if (column === "烧烤店爆品打造") {
    return "爆品打造选题";
  }
  if (column === "节日节气备货建议") {
    return "节气节日选题";
  }
  if (column === "餐饮老板避坑指南") {
    return "用户痛点选题";
  }
  if (column === "烧烤店成本控制") {
    return "B端经营选题";
  }
  if (column === "食材供应链知识") {
    return "系列化选题";
  }
  if (column === "火锅食材选品指南") {
    return "产品种草选题";
  }
  if (column === "烧烤食材选品指南") {
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
