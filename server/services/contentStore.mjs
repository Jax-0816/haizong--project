import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const contentPath = resolve(process.cwd(), "src/data/content.json");

const rootKeys = [
  "positioning",
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
  return JSON.parse(readFileSync(contentPath, "utf8"));
}

export function saveContent(nextContent) {
  validateContent(nextContent);
  writeContent(nextContent);
  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    path: "src/data/content.json",
  };
}

export function writeContent(content) {
  const serialized = `${JSON.stringify(content, null, 2)}\n`;
  const tempPath = resolve(dirname(contentPath), `.content.${Date.now()}.${process.pid}.tmp`);
  writeFileSync(tempPath, serialized, "utf8");
  renameSync(tempPath, contentPath);
}

export function validateContent(content) {
  assertObject(content, "content");
  assertKnownKeys(content, rootKeys, "content");
  rootKeys.forEach((key) => assertHas(content, key, "content"));

  validatePositioning(content.positioning);
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
  assertKnownKeys(template, ["id", "name", "scenario", "steps", "opener", "platforms"], path);
  ["id", "name", "scenario", "opener"].forEach((key) => assertString(template[key], `${path}.${key}`));
  assertStringArray(template.steps, `${path}.steps`, { nonEmpty: true });
  assertStringArray(template.platforms, `${path}.platforms`, { nonEmpty: true });
}

function validatePrompt(prompt, index) {
  const path = `content.prompts[${index}]`;
  assertObject(prompt, path);
  assertKnownKeys(prompt, ["id", "purpose", "audience", "body", "outputFields"], path);
  ["id", "purpose", "audience", "body"].forEach((key) => assertString(prompt[key], `${path}.${key}`));
  assertStringArray(prompt.outputFields, `${path}.outputFields`, { nonEmpty: true });
}

function validateMaterialSection(section, index) {
  const path = `content.materials[${index}]`;
  assertObject(section, path);
  assertKnownKeys(section, ["id", "title", "description", "items"], path);
  ["id", "title", "description"].forEach((key) => assertString(section[key], `${path}.${key}`));
  assertStringArray(section.items, `${path}.items`);
}

function validateHotspot(hotspot, index) {
  const path = `content.hotspots[${index}]`;
  assertObject(hotspot, path);
  assertKnownKeys(hotspot, ["id", "title", "type", "window", "matchedColumn", "targetUser", "recommendedAngle", "priority"], path);
  ["id", "title", "type", "window", "matchedColumn", "targetUser", "recommendedAngle"].forEach((key) =>
    assertString(hotspot[key], `${path}.${key}`),
  );
  assertEnum(hotspot.priority, priorities, `${path}.priority`);
}

function validateIterationSuggestion(suggestion, index) {
  const path = `content.iterationSuggestions[${index}]`;
  assertObject(suggestion, path);
  assertKnownKeys(suggestion, ["id", "type", "related", "action", "reason", "output"], path);
  ["id", "type", "related", "action", "reason", "output"].forEach((key) => assertString(suggestion[key], `${path}.${key}`));
}

function validatePriorityTopic(topic, index) {
  const path = `content.priorityTopics[${index}]`;
  assertObject(topic, path);
  assertKnownKeys(topic, ["id", "title", "priority", "reason", "source"], path);
  ["id", "title", "reason", "source"].forEach((key) => assertString(topic[key], `${path}.${key}`));
  assertEnum(topic.priority, priorities, `${path}.priority`);
}

function validateReview(review, index) {
  const path = `content.reviews[${index}]`;
  assertObject(review, path);
  assertKnownKeys(review, ["id", "topicTitle", "publishDate", "platform", "views", "likes", "saves", "comments", "conversions", "conclusion"], path);
  ["id", "topicTitle", "publishDate", "platform", "conclusion"].forEach((key) => assertString(review[key], `${path}.${key}`));
  ["views", "likes", "saves", "comments", "conversions"].forEach((key) => assertNonNegativeNumber(review[key], `${path}.${key}`));
}

function validateProduction(production, index) {
  const path = `content.productions[${index}]`;
  assertObject(production, path);
  assertKnownKeys(
    production,
    ["topicId", "currentStep", "researchNotes", "selectedTemplateId", "scriptDraft", "matchedMaterials", "publishDraft", "reviewDraft", "updatedAt"],
    path,
  );
  ["topicId", "researchNotes", "selectedTemplateId", "updatedAt"].forEach((key) => assertString(production[key], `${path}.${key}`));
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
