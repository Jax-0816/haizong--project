import { readContent, writeContent } from "./contentStore.mjs";
import { generateProductionPublish, generateProductionScript } from "./llm.mjs";
import { runResearch } from "./research.mjs";

const productionSteps = ["topic", "research", "template", "script", "materials", "publish", "review"];

export function saveProduction(production) {
  const content = readContent();
  const normalized = normalizeProduction(production);
  const productions = Array.isArray(content.productions) ? content.productions : [];
  const index = productions.findIndex((item) => item.topicId === normalized.topicId);
  const saved = { ...normalized, updatedAt: new Date().toISOString() };

  if (index === -1) {
    productions.push(saved);
  } else {
    productions[index] = saved;
  }

  content.productions = productions;
  const { review, topic } = maybeUpsertReview(content, saved);
  writeContent(content);

  return { production: saved, review, topic };
}

export async function researchProductionTopic(body) {
  const content = readContent();
  const topic = findTopic(content, body.topicId);
  return runResearch({
    mode: "general",
    industry: topic.industry || "hotpot",
    query: topic.title,
    targetUser: topic.targetUser,
    column: topic.column,
    freshness: body.freshness || "oneMonth",
    notes: JSON.stringify({
      topic,
      requiredEvidence: ["行业热点", "节气节点", "用户痛点", "产品卖点"],
      notes: body.notes || "",
    }),
  });
}

export async function generateScriptDraft(body) {
  const content = readContent();
  const topic = findTopic(content, body.topicId);
  const template = content.scriptTemplates.find((item) => item.id === body.selectedTemplateId) ?? content.scriptTemplates[0];
  const modelResult = await generateProductionScript({
    topic,
    template,
    researchNotes: body.researchNotes || "",
    materials: body.matchedMaterials || {},
  });

  return {
    opener: String(modelResult.opener ?? ""),
    structure: String(modelResult.structure ?? ""),
    ending: String(modelResult.ending ?? ""),
    voiceover: String(modelResult.voiceover ?? ""),
  };
}

export async function generatePublishDraft(body) {
  const content = readContent();
  const topic = findTopic(content, body.topicId);
  const modelResult = await generateProductionPublish({
    topic,
    scriptDraft: body.scriptDraft || {},
    platforms: splitPlatforms(topic.platform),
  });

  return {
    title: String(modelResult.title ?? ""),
    description: String(modelResult.description ?? ""),
    hashtags: toStringArray(modelResult.hashtags).slice(0, 8),
    platformCopies: Array.isArray(modelResult.platformCopies)
      ? modelResult.platformCopies.slice(0, 5).map((item) => ({
          platform: String(item.platform ?? ""),
          copy: String(item.copy ?? ""),
        }))
      : [],
  };
}

export function saveGeneratedScriptTemplate(body) {
  const content = readContent();
  const topic = findTopic(content, body.topicId);
  const draft = normalizeScriptDraft(body.scriptDraft);
  const draftParts = [draft.opener, draft.structure, draft.ending, draft.voiceover].filter(Boolean);

  if (draftParts.length === 0) {
    const error = new Error("脚本内容为空，无法保存到脚本模板。");
    error.statusCode = 400;
    throw error;
  }

  const templates = Array.isArray(content.scriptTemplates) ? content.scriptTemplates : [];
  const sourceTemplate = templates.find((item) => item.id === body.selectedTemplateId);
  const savedAt = new Date().toISOString();
  const topicPlatforms = splitPlatforms(topic.platform);
  const template = {
    id: nextSavedScriptTemplateId(templates),
    industry: String(body.industry || topic.industry || "hotpot"),
    name: `保存脚本：${clampText(topic.title, 28)}`,
    scenario: [
      `来源选题：${topic.title}`,
      `原模板：${sourceTemplate?.name || "未选择"}`,
      `保存时间：${savedAt}`,
    ].join("；"),
    steps: [
      draft.structure ? `正文结构：${draft.structure}` : "",
      draft.ending ? `结尾：${draft.ending}` : "",
      draft.voiceover ? `口播文案：${draft.voiceover}` : "",
    ].filter(Boolean),
    opener: draft.opener || draftParts[0],
    platforms: topicPlatforms.length > 0 ? topicPlatforms : ["通用"],
  };

  templates.push(template);
  content.scriptTemplates = templates;
  writeContent(content);

  return { template };
}

export function deleteGeneratedScriptTemplate(body) {
  const content = readContent();
  const templateId = String(body?.templateId ?? "").trim();

  if (!templateId) {
    const error = new Error("缺少脚本模板 ID。");
    error.statusCode = 400;
    throw error;
  }

  if (!templateId.startsWith("script-saved-")) {
    const error = new Error("只能删除从内容生产台保存的脚本。");
    error.statusCode = 400;
    throw error;
  }

  const templates = Array.isArray(content.scriptTemplates) ? content.scriptTemplates : [];
  const existingIndex = templates.findIndex((template) => template.id === templateId);

  if (existingIndex === -1) {
    const error = new Error("未找到要删除的脚本内容。");
    error.statusCode = 404;
    throw error;
  }

  content.scriptTemplates = templates.filter((template) => template.id !== templateId);
  writeContent(content);

  return { templateId };
}

function normalizeProduction(production) {
  const topicId = String(production.topicId ?? "").trim();
  if (!topicId) {
    const error = new Error("缺少 topicId，无法保存生产进度。");
    error.statusCode = 400;
    throw error;
  }

  return {
    topicId,
    industry: String(production.industry ?? "hotpot"),
    currentStep: productionSteps.includes(production.currentStep) ? production.currentStep : "topic",
    researchNotes: String(production.researchNotes ?? ""),
    selectedTemplateId: String(production.selectedTemplateId ?? ""),
    scriptDraft: {
      opener: String(production.scriptDraft?.opener ?? ""),
      structure: String(production.scriptDraft?.structure ?? ""),
      ending: String(production.scriptDraft?.ending ?? ""),
      voiceover: String(production.scriptDraft?.voiceover ?? ""),
    },
    matchedMaterials: {
      productImages: toStringArray(production.matchedMaterials?.productImages),
      storeScenes: toStringArray(production.matchedMaterials?.storeScenes),
      foodShots: toStringArray(production.matchedMaterials?.foodShots),
      coverReferences: toStringArray(production.matchedMaterials?.coverReferences),
    },
    publishDraft: {
      title: String(production.publishDraft?.title ?? ""),
      description: String(production.publishDraft?.description ?? ""),
      hashtags: toStringArray(production.publishDraft?.hashtags),
      platformCopies: Array.isArray(production.publishDraft?.platformCopies)
        ? production.publishDraft.platformCopies.map((item) => ({
            platform: String(item.platform ?? ""),
            copy: String(item.copy ?? ""),
          }))
        : [],
    },
    reviewDraft: {
      publishDate: String(production.reviewDraft?.publishDate ?? ""),
      platform: String(production.reviewDraft?.platform ?? ""),
      views: toNumber(production.reviewDraft?.views),
      likes: toNumber(production.reviewDraft?.likes),
      comments: toNumber(production.reviewDraft?.comments),
      saves: toNumber(production.reviewDraft?.saves),
      shares: toNumber(production.reviewDraft?.shares),
      leads: toNumber(production.reviewDraft?.leads),
      optimization: String(production.reviewDraft?.optimization ?? ""),
    },
    updatedAt: String(production.updatedAt ?? ""),
  };
}

function normalizeScriptDraft(scriptDraft = {}) {
  return {
    opener: String(scriptDraft.opener ?? "").trim(),
    structure: String(scriptDraft.structure ?? "").trim(),
    ending: String(scriptDraft.ending ?? "").trim(),
    voiceover: String(scriptDraft.voiceover ?? "").trim(),
  };
}

function maybeUpsertReview(content, production) {
  const topic = content.topics.find((item) => item.id === production.topicId);
  const draft = production.reviewDraft;

  if (!topic || production.currentStep !== "review" || !draft.publishDate || !draft.platform) {
    return { review: null, topic: null };
  }

  const reviews = Array.isArray(content.reviews) ? content.reviews : [];
  const review = {
    id: nextReviewId(reviews),
    industry: topic.industry || production.industry || "hotpot",
    topicTitle: topic.title,
    publishDate: draft.publishDate,
    platform: draft.platform,
    views: draft.views,
    likes: draft.likes,
    saves: draft.saves,
    comments: draft.comments,
    conversions: draft.leads,
    conclusion: draft.optimization || "已完成发布复盘，待继续优化。",
  };
  const existingIndex = reviews.findIndex(
    (item) => item.topicTitle === review.topicTitle && item.publishDate === review.publishDate && item.platform === review.platform,
  );

  if (existingIndex === -1) {
    reviews.push(review);
  } else {
    review.id = reviews[existingIndex].id;
    reviews[existingIndex] = review;
  }

  content.reviews = reviews;
  topic.scriptStatus = "已发";
  topic.publishData = {
    views: draft.views,
    likes: draft.likes,
    saves: draft.saves,
    comments: draft.comments,
    conversions: draft.leads,
  };
  topic.review = draft.optimization || topic.review;

  return { review, topic };
}

function findTopic(content, topicId) {
  const topic = content.topics.find((item) => item.id === topicId);
  if (!topic) {
    const error = new Error("未找到对应选题。");
    error.statusCode = 404;
    throw error;
  }
  return topic;
}

function nextReviewId(reviews) {
  const max = reviews.reduce((currentMax, review) => {
    const match = String(review.id ?? "").match(/^review-(\d+)$/);
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);
  return `review-${String(max + 1).padStart(3, "0")}`;
}

function nextSavedScriptTemplateId(templates) {
  const max = templates.reduce((currentMax, template) => {
    const match = String(template.id ?? "").match(/^script-saved-(\d+)$/);
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);
  return `script-saved-${String(max + 1).padStart(3, "0")}`;
}

function clampText(value, maxLength) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function splitPlatforms(value) {
  return String(value ?? "")
    .split(/[、/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  return String(value ?? "")
    .split(/\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}
