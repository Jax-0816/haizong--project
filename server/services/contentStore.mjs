import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getBooleanEnv } from "../config.mjs";

export const contentPath = resolve(process.cwd(), process.env.CONTENT_STORAGE_PATH || "src/data/content.json");

const rootKeys = [
  "positioning",
  "industryProfiles",
  "columns",
  "topics",
  "scriptTemplates",
  "prompts",
  "materials",
  "hotspots",
  "iterationSuggestions",
  "priorityTopics",
  "reviews",
  "topicCategories",
  "productions",
];

const industryIds = ["hotpot", "bbq"];

const topicCategories = [
  "行业热点选题",
  "节气节日选题",
  "产品种草选题",
  "B端经营选题",
  "用户痛点选题",
  "爆品打造选题",
  "系列化选题",
];

const scriptStatuses = ["未写", "已写", "已拍", "已发"];
const priorities = ["高", "中", "低"];
const productionSteps = ["topic", "research", "template", "script", "materials", "publish", "review"];

export function readContent() {
  if (!existsSync(contentPath)) {
    const error = new Error(`内容数据文件不存在：${contentPath}`);
    error.statusCode = 500;
    error.code = "CONTENT_FILE_MISSING";
    throw error;
  }
  return JSON.parse(readFileSync(contentPath, "utf8"));
}

export function saveContent(nextContent) {
  assertWritable();
  validateContent(nextContent);
  writeContent(nextContent);
  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    path: "src/data/content.json",
  };
}

export function writeContent(content) {
  assertWritable();
  const serialized = `${JSON.stringify(content, null, 2)}\n`;
  mkdirSync(dirname(contentPath), { recursive: true });
  const tempPath = resolve(dirname(contentPath), `.content.${Date.now()}.${process.pid}.tmp`);
  writeFileSync(tempPath, serialized, "utf8");
  renameSync(tempPath, contentPath);
}

function assertWritable() {
  if (getBooleanEnv("CONTENT_READONLY", false)) {
    const error = new Error("当前环境已开启只读模式，禁止写入内容数据。");
    error.statusCode = 403;
    error.code = "CONTENT_READONLY";
    throw error;
  }
}

export function validateContent(content) {
  assertObject(content, "content");
  assertKnownKeys(content, rootKeys, "content");
  rootKeys.forEach((key) => assertHas(content, key, "content"));

  validatePositioning(content.positioning);
  assertArray(content.industryProfiles, "content.industryProfiles").forEach(validateIndustryProfile);
  assertStringArray(content.columns, "content.columns", { nonEmpty: true });
  assertStringArray(content.topicCategories, "content.topicCategories", { allowed: topicCategories, exact: topicCategories });
  assertArray(content.topics, "content.topics").forEach(validateTopic);
  assertArray(content.scriptTemplates, "content.scriptTemplates").forEach(validateScriptTemplate);
  assertArray(content.prompts, "content.prompts").forEach(validatePrompt);
  assertArray(content.materials, "content.materials").forEach(validateMaterialSection);
  assertArray(content.hotspots, "content.hotspots").forEach(validateHotspot);
  assertArray(content.iterationSuggestions, "content.iterationSuggestions").forEach(validateIterationSuggestion);
  assertArray(content.priorityTopics, "content.priorityTopics").forEach(validatePriorityTopic);
  assertArray(content.reviews, "content.reviews").forEach(validateReview);
  assertArray(content.productions, "content.productions").forEach(validateProduction);

  return true;
}

function validatePositioning(value) {
  assertObject(value, "content.positioning");
  assertKnownKeys(value, ["name", "audience", "promise", "style", "platforms", "conversionGoal"], "content.positioning");
  ["name", "audience", "promise", "style", "conversionGoal"].forEach((key) => assertString(value[key], `content.positioning.${key}`));
  assertStringArray(value.platforms, "content.positioning.platforms", { nonEmpty: true });
}

function validateIndustryProfile(profile, index) {
  const path = `content.industryProfiles[${index}]`;
  assertObject(profile, path);
  assertKnownKeys(
    profile,
    [
      "id",
      "label",
      "name",
      "audience",
      "promise",
      "style",
      "platforms",
      "conversionGoal",
      "columns",
      "quickTopics",
      "defaultTopicCandidate",
      "defaultResearch",
      "dashboard",
      "searchKeywords",
    ],
    path,
  );
  assertEnum(profile.id, industryIds, `${path}.id`);
  ["label", "name", "audience", "promise", "style", "conversionGoal"].forEach((key) => assertString(profile[key], `${path}.${key}`));
  assertStringArray(profile.platforms, `${path}.platforms`, { nonEmpty: true });
  assertStringArray(profile.columns, `${path}.columns`, { nonEmpty: true });
  assertStringArray(profile.quickTopics, `${path}.quickTopics`, { nonEmpty: true });

  assertObject(profile.defaultTopicCandidate, `${path}.defaultTopicCandidate`);
  assertKnownKeys(profile.defaultTopicCandidate, ["category", "query", "targetUser", "column"], `${path}.defaultTopicCandidate`);
  ["category", "query", "targetUser", "column"].forEach((key) => assertString(profile.defaultTopicCandidate[key], `${path}.defaultTopicCandidate.${key}`));

  assertObject(profile.defaultResearch, `${path}.defaultResearch`);
  assertKnownKeys(profile.defaultResearch, ["query", "targetUser", "column"], `${path}.defaultResearch`);
  ["query", "targetUser", "column"].forEach((key) => assertString(profile.defaultResearch[key], `${path}.defaultResearch.${key}`));

  assertObject(profile.dashboard, `${path}.dashboard`);
  assertKnownKeys(
    profile.dashboard,
    ["kicker", "subtitle", "heroTitle", "heroDescription", "heroTopic", "stats", "workflowSteps", "assetCards", "weeklyPlan"],
    `${path}.dashboard`,
  );
  ["kicker", "subtitle", "heroTitle", "heroDescription"].forEach((key) => assertString(profile.dashboard[key], `${path}.dashboard.${key}`));
  validateIndustryHeroTopic(profile.dashboard.heroTopic, `${path}.dashboard.heroTopic`);
  assertArray(profile.dashboard.stats, `${path}.dashboard.stats`).forEach((item, statIndex) => validateIndustryStat(item, `${path}.dashboard.stats[${statIndex}]`));
  assertArray(profile.dashboard.workflowSteps, `${path}.dashboard.workflowSteps`).forEach((item, stepIndex) =>
    validateIndustryWorkflowStep(item, `${path}.dashboard.workflowSteps[${stepIndex}]`),
  );
  assertArray(profile.dashboard.assetCards, `${path}.dashboard.assetCards`).forEach((item, cardIndex) =>
    validateIndustryAssetCard(item, `${path}.dashboard.assetCards[${cardIndex}]`),
  );
  assertArray(profile.dashboard.weeklyPlan, `${path}.dashboard.weeklyPlan`).forEach((item, planIndex) =>
    validateIndustryPlanEntry(item, `${path}.dashboard.weeklyPlan[${planIndex}]`),
  );

  assertObject(profile.searchKeywords, `${path}.searchKeywords`);
  assertKnownKeys(
    profile.searchKeywords,
    ["dashboardDecision", "hotspotMatch", "topicExpand", "materialSuggestion", "general", "candidate"],
    `${path}.searchKeywords`,
  );
  Object.keys(profile.searchKeywords).forEach((key) => assertString(profile.searchKeywords[key], `${path}.searchKeywords.${key}`));
}

function validateIndustryHeroTopic(value, path) {
  assertObject(value, path);
  assertKnownKeys(value, ["title", "targetUser", "contentType", "productAssociation", "platform"], path);
  ["title", "targetUser", "contentType", "productAssociation", "platform"].forEach((key) => assertString(value[key], `${path}.${key}`));
}

function validateIndustryStat(value, path) {
  assertObject(value, path);
  assertKnownKeys(value, ["label", "value", "detail"], path);
  ["label", "value", "detail"].forEach((key) => assertString(value[key], `${path}.${key}`));
}

function validateIndustryWorkflowStep(value, path) {
  assertObject(value, path);
  assertKnownKeys(value, ["icon", "title", "detail"], path);
  ["icon", "title", "detail"].forEach((key) => assertString(value[key], `${path}.${key}`));
}

function validateIndustryAssetCard(value, path) {
  assertObject(value, path);
  assertKnownKeys(value, ["title", "detail", "count", "updated"], path);
  ["title", "detail", "count", "updated"].forEach((key) => assertString(value[key], `${path}.${key}`));
}

function validateIndustryPlanEntry(value, path) {
  assertObject(value, path);
  assertKnownKeys(value, ["day", "theme", "output"], path);
  ["day", "theme", "output"].forEach((key) => assertString(value[key], `${path}.${key}`));
}

function validateTopic(topic, index) {
  const path = `content.topics[${index}]`;
  assertObject(topic, path);
  assertKnownKeys(
    topic,
    [
      "id",
      "title",
      "column",
      "topicCategory",
      "industry",
      "contentType",
      "targetUser",
      "painPoint",
      "businessLink",
      "hotSource",
      "angle",
      "coreView",
      "platform",
      "format",
      "scriptStatus",
      "publishData",
      "review",
      "sourceUrls",
      "recommendationScore",
      "aiGenerated",
      "riskNotes",
    ],
    path,
  );
  [
    "id",
    "title",
    "column",
    "contentType",
    "targetUser",
    "painPoint",
    "businessLink",
    "hotSource",
    "angle",
    "coreView",
    "platform",
    "format",
    "review",
  ].forEach((key) => assertString(topic[key], `${path}.${key}`));
  if ("industry" in topic) assertEnum(topic.industry, industryIds, `${path}.industry`);
  assertEnum(topic.topicCategory, topicCategories, `${path}.topicCategory`);
  assertEnum(topic.scriptStatus, scriptStatuses, `${path}.scriptStatus`);
  validateMetrics(topic.publishData, `${path}.publishData`, ["views", "likes", "saves", "comments", "conversions"]);
  if ("sourceUrls" in topic) assertStringArray(topic.sourceUrls, `${path}.sourceUrls`);
  if ("riskNotes" in topic) assertStringArray(topic.riskNotes, `${path}.riskNotes`);
  if ("recommendationScore" in topic) assertNumber(topic.recommendationScore, `${path}.recommendationScore`);
  if ("aiGenerated" in topic) assertBoolean(topic.aiGenerated, `${path}.aiGenerated`);
}

function validateScriptTemplate(template, index) {
  const path = `content.scriptTemplates[${index}]`;
  assertObject(template, path);
  assertKnownKeys(template, ["id", "name", "scenario", "steps", "opener", "platforms", "industry"], path);
  ["id", "name", "scenario", "opener"].forEach((key) => assertString(template[key], `${path}.${key}`));
  if ("industry" in template) assertEnum(template.industry, industryIds, `${path}.industry`);
  assertStringArray(template.steps, `${path}.steps`, { nonEmpty: true });
  assertStringArray(template.platforms, `${path}.platforms`, { nonEmpty: true });
}

function validatePrompt(prompt, index) {
  const path = `content.prompts[${index}]`;
  assertObject(prompt, path);
  assertKnownKeys(prompt, ["id", "purpose", "audience", "body", "outputFields", "industry"], path);
  ["id", "purpose", "audience", "body"].forEach((key) => assertString(prompt[key], `${path}.${key}`));
  if ("industry" in prompt) assertEnum(prompt.industry, industryIds, `${path}.industry`);
  assertStringArray(prompt.outputFields, `${path}.outputFields`, { nonEmpty: true });
}

function validateMaterialSection(section, index) {
  const path = `content.materials[${index}]`;
  assertObject(section, path);
  assertKnownKeys(section, ["id", "title", "description", "items", "industry"], path);
  ["id", "title", "description"].forEach((key) => assertString(section[key], `${path}.${key}`));
  if ("industry" in section) assertEnum(section.industry, industryIds, `${path}.industry`);
  assertStringArray(section.items, `${path}.items`);
}

function validateHotspot(hotspot, index) {
  const path = `content.hotspots[${index}]`;
  assertObject(hotspot, path);
  assertKnownKeys(hotspot, ["id", "title", "type", "window", "matchedColumn", "targetUser", "recommendedAngle", "priority", "industry"], path);
  ["id", "title", "type", "window", "matchedColumn", "targetUser", "recommendedAngle"].forEach((key) =>
    assertString(hotspot[key], `${path}.${key}`),
  );
  if ("industry" in hotspot) assertEnum(hotspot.industry, industryIds, `${path}.industry`);
  assertEnum(hotspot.priority, priorities, `${path}.priority`);
}

function validateIterationSuggestion(suggestion, index) {
  const path = `content.iterationSuggestions[${index}]`;
  assertObject(suggestion, path);
  assertKnownKeys(suggestion, ["id", "type", "related", "action", "reason", "output", "industry"], path);
  ["id", "type", "related", "action", "reason", "output"].forEach((key) => assertString(suggestion[key], `${path}.${key}`));
  if ("industry" in suggestion) assertEnum(suggestion.industry, industryIds, `${path}.industry`);
}

function validatePriorityTopic(topic, index) {
  const path = `content.priorityTopics[${index}]`;
  assertObject(topic, path);
  assertKnownKeys(topic, ["id", "title", "priority", "reason", "source", "industry"], path);
  ["id", "title", "reason", "source"].forEach((key) => assertString(topic[key], `${path}.${key}`));
  if ("industry" in topic) assertEnum(topic.industry, industryIds, `${path}.industry`);
  assertEnum(topic.priority, priorities, `${path}.priority`);
}

function validateReview(review, index) {
  const path = `content.reviews[${index}]`;
  assertObject(review, path);
  assertKnownKeys(review, ["id", "topicTitle", "publishDate", "platform", "views", "likes", "saves", "comments", "conversions", "conclusion", "industry"], path);
  ["id", "topicTitle", "publishDate", "platform", "conclusion"].forEach((key) => assertString(review[key], `${path}.${key}`));
  if ("industry" in review) assertEnum(review.industry, industryIds, `${path}.industry`);
  ["views", "likes", "saves", "comments", "conversions"].forEach((key) => assertNonNegativeNumber(review[key], `${path}.${key}`));
}

function validateProduction(production, index) {
  const path = `content.productions[${index}]`;
  assertObject(production, path);
  assertKnownKeys(
    production,
    ["topicId", "currentStep", "researchNotes", "selectedTemplateId", "scriptDraft", "matchedMaterials", "publishDraft", "reviewDraft", "updatedAt", "industry"],
    path,
  );
  ["topicId", "researchNotes", "selectedTemplateId", "updatedAt"].forEach((key) => assertString(production[key], `${path}.${key}`));
  if ("industry" in production) assertEnum(production.industry, industryIds, `${path}.industry`);
  assertEnum(production.currentStep, productionSteps, `${path}.currentStep`);

  assertObject(production.scriptDraft, `${path}.scriptDraft`);
  assertKnownKeys(production.scriptDraft, ["opener", "structure", "ending", "voiceover"], `${path}.scriptDraft`);
  ["opener", "structure", "ending", "voiceover"].forEach((key) => assertString(production.scriptDraft[key], `${path}.scriptDraft.${key}`));

  assertObject(production.matchedMaterials, `${path}.matchedMaterials`);
  assertKnownKeys(production.matchedMaterials, ["productImages", "storeScenes", "foodShots", "coverReferences"], `${path}.matchedMaterials`);
  ["productImages", "storeScenes", "foodShots", "coverReferences"].forEach((key) =>
    assertStringArray(production.matchedMaterials[key], `${path}.matchedMaterials.${key}`),
  );

  assertObject(production.publishDraft, `${path}.publishDraft`);
  assertKnownKeys(production.publishDraft, ["title", "description", "hashtags", "platformCopies"], `${path}.publishDraft`);
  ["title", "description"].forEach((key) => assertString(production.publishDraft[key], `${path}.publishDraft.${key}`));
  assertStringArray(production.publishDraft.hashtags, `${path}.publishDraft.hashtags`);
  assertArray(production.publishDraft.platformCopies, `${path}.publishDraft.platformCopies`).forEach((copy, copyIndex) => {
    const copyPath = `${path}.publishDraft.platformCopies[${copyIndex}]`;
    assertObject(copy, copyPath);
    assertKnownKeys(copy, ["platform", "copy"], copyPath);
    assertString(copy.platform, `${copyPath}.platform`);
    assertString(copy.copy, `${copyPath}.copy`);
  });

  assertObject(production.reviewDraft, `${path}.reviewDraft`);
  assertKnownKeys(
    production.reviewDraft,
    ["publishDate", "platform", "views", "likes", "comments", "saves", "shares", "leads", "optimization"],
    `${path}.reviewDraft`,
  );
  ["publishDate", "platform", "optimization"].forEach((key) => assertString(production.reviewDraft[key], `${path}.reviewDraft.${key}`));
  ["views", "likes", "comments", "saves", "shares", "leads"].forEach((key) =>
    assertNonNegativeNumber(production.reviewDraft[key], `${path}.reviewDraft.${key}`),
  );
}

function validateMetrics(value, path, keys) {
  assertObject(value, path);
  assertKnownKeys(value, keys, path);
  keys.forEach((key) => assertNonNegativeNumber(value[key], `${path}.${key}`));
}

function assertHas(value, key, path) {
  if (!(key in value)) {
    fail(`${path} 缺少字段 ${key}`);
  }
}

function assertKnownKeys(value, allowed, path) {
  Object.keys(value).forEach((key) => {
    if (!allowed.includes(key)) {
      fail(`${path} 包含未定义字段 ${key}`);
    }
  });
}

function assertObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${path} 必须是对象`);
  }
}

function assertArray(value, path) {
  if (!Array.isArray(value)) {
    fail(`${path} 必须是数组`);
  }
  return value;
}

function assertString(value, path) {
  if (typeof value !== "string") {
    fail(`${path} 必须是字符串`);
  }
}

function assertStringArray(value, path, options = {}) {
  assertArray(value, path);
  if (options.nonEmpty && value.length === 0) {
    fail(`${path} 不能为空`);
  }
  if (options.exact && (value.length !== options.exact.length || value.some((item, index) => item !== options.exact[index]))) {
    fail(`${path} 必须严格等于：${options.exact.join("、")}`);
  }
  value.forEach((item, index) => {
    assertString(item, `${path}[${index}]`);
    if (options.allowed && !options.allowed.includes(item)) {
      fail(`${path}[${index}] 不是合法枚举值`);
    }
  });
}

function assertEnum(value, allowed, path) {
  if (!allowed.includes(value)) {
    fail(`${path} 必须是以下值之一：${allowed.join("、")}`);
  }
}

function assertNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} 必须是数字`);
  }
}

function assertNonNegativeNumber(value, path) {
  assertNumber(value, path);
  if (value < 0) {
    fail(`${path} 不能小于 0`);
  }
}

function assertBoolean(value, path) {
  if (typeof value !== "boolean") {
    fail(`${path} 必须是布尔值`);
  }
}

function fail(message) {
  const error = new Error(`数据结构校验失败：${message}。`);
  error.statusCode = 400;
  error.code = "CONTENT_SCHEMA_INVALID";
  throw error;
}
