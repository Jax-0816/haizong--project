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

function normalizeProduction(production) {
  const topicId = String(production.topicId ?? "").trim();
  if (!topicId) {
    const error = new Error("缺少 topicId，无法保存生产进度。");
    error.statusCode = 400;
    throw error;
  }

  return {
    topicId,
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

function maybeUpsertReview(content, production) {
  const topic = content.topics.find((item) => item.id === production.topicId);
  const draft = production.reviewDraft;

  if (!topic || production.currentStep !== "review" || !draft.publishDate || !draft.platform) {
    return { review: null, topic: null };
  }

  const reviews = Array.isArray(content.reviews) ? content.reviews : [];
  const review = {
    id: nextReviewId(reviews),
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
