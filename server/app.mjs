import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { getEnv } from "./config.mjs";
import { extname, normalize, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { readContent, saveContent, writeContent } from "./services/contentStore.mjs";
import {
  deleteGeneratedScriptTemplate,
  generatePublishDraft,
  generateScriptDraft,
  researchProductionTopic,
  saveGeneratedScriptTemplate,
  saveProduction,
} from "./services/production.mjs";
import { runResearch } from "./services/research.mjs";
import { confirmTopic, generateCandidates, getTopicCategories, refreshCandidates } from "./services/topicCandidates.mjs";
import { expandMaterialPhrases, refreshScriptTemplate } from "./services/llm.mjs";
import { getAppRuntimeConfig } from "./runtimeConfig.mjs";
import { normalizeIndustryId } from "./services/industry.mjs";
import {
  deleteAuthUser,
  getCurrentUserFromRequest,
  listAuthUsers,
  loginWithCode,
  logoutAuthUser,
  sendVerificationCode,
  validateAuthSession,
} from "./services/authStore.mjs";

export function createAppHandler(options = {}) {
  const notFound = options.notFound ?? defaultNotFound;

  return async function handleRequest(req, res) {
    try {
      const pathname = getPathname(req.url);

      if (req.method === "GET" && pathname === "/api/content") {
        sendJson(res, 200, readContent());
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/uploads/")) {
        await sendUploadedFile(res, pathname);
        return;
      }

      if ((req.method === "PUT" || req.method === "POST") && pathname === "/api/content") {
        const body = await readJsonBody(req, { maxBytes: 2 * 1024 * 1024 });
        const result = saveContent(body.content ?? body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "GET" && pathname === "/api/health") {
        sendJson(res, 200, {
          status: "ok",
          version: "0.1.0",
          uptime: process.uptime(),
          contentWritable: getEnv("CONTENT_READONLY", "false") !== "true",
        });
        return;
      }

      if (req.method === "POST" && pathname === "/api/auth/code/send") {
        const body = await readJsonBody(req);
        const result = sendVerificationCode(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/auth/login") {
        const body = await readJsonBody(req);
        const result = loginWithCode(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "GET" && pathname === "/api/auth/profile") {
        const result = getCurrentUserFromRequest(req);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/auth/validate") {
        const body = await readJsonBody(req);
        const result = validateAuthSession(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/auth/logout") {
        const result = logoutAuthUser();
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "GET" && pathname === "/api/auth/users") {
        const result = listAuthUsers(req);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/auth/users/delete") {
        const body = await readJsonBody(req);
        const result = deleteAuthUser(req, body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/research") {
        const body = await readJsonBody(req);
        validateResearchRequest(body);
        const result = await runResearch(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/topic-candidates/generate") {
        const body = await readJsonBody(req);
        validateTopicCandidateRequest(body);
        const result = await generateCandidates(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/topics/refresh") {
        const body = await readJsonBody(req);
        validateTopicRefreshRequest(body);
        const result = await refreshCandidates(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/topics/confirm") {
        const body = await readJsonBody(req);
        const result = confirmTopic(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/production/save") {
        const body = await readJsonBody(req);
        const result = saveProduction(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/production/research") {
        const body = await readJsonBody(req);
        const result = await researchProductionTopic(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/production/generate-script") {
        const body = await readJsonBody(req);
        const result = await generateScriptDraft(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/production/generate-publish") {
        const body = await readJsonBody(req);
        const result = await generatePublishDraft(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/production/save-script-template") {
        const body = await readJsonBody(req);
        const result = saveGeneratedScriptTemplate(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/production/delete-script-template") {
        const body = await readJsonBody(req);
        const result = deleteGeneratedScriptTemplate(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/scripts/templates/refresh") {
        const body = await readJsonBody(req);
        validateTemplateRefreshRequest(body);
        const result = await refreshScriptTemplate({ template: body.template, industry: normalizeIndustryId(body.industry) });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && pathname === "/api/materials/expand-phrases") {
        const body = await readJsonBody(req);
        validateMaterialExpandRequest(body);
        const result = await expandMaterialPhrases({
          sectionTitle: body.sectionTitle,
          existingItems: body.existingItems,
          industry: normalizeIndustryId(body.industry),
        });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "PUT" && pathname === "/api/materials/image-assets") {
        const body = await readJsonBody(req, { maxBytes: 24 * 1024 * 1024 });
        const result = await saveMaterialImageAssets(body);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "GET" && pathname === "/app-config.js") {
        sendJavascript(res, 200, `window.__APP_CONFIG__ = ${JSON.stringify(getAppRuntimeConfig())};\n`);
        return;
      }

      await notFound(req, res, pathname);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      sendJson(res, statusCode, {
        error: error.message || "服务器处理失败",
        code: error.code || "SERVER_ERROR",
      });
    }
  };
}

async function defaultNotFound(_req, res) {
  sendJson(res, 404, { error: "Not found" });
}

function getPathname(url) {
  return new URL(url || "/", "http://127.0.0.1").pathname;
}

const uploadsRoot = resolve(process.cwd(), "public/uploads");
const materialUploadsRoot = resolve(uploadsRoot, "materials");
const acceptedImageTypes = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

async function sendUploadedFile(res, pathname) {
  const relativePath = decodeURIComponent(pathname.replace(/^\/uploads\//, ""));
  const filePath = resolve(uploadsRoot, relativePath);
  const safePath = normalize(filePath);

  if (!safePath.startsWith(uploadsRoot)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const fileStats = await safeStat(safePath);
  if (!fileStats?.isFile()) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", getUploadContentType(safePath));
  res.setHeader("Content-Length", String(fileStats.size));
  createReadStream(safePath).pipe(res);
}

async function saveMaterialImageAssets(body) {
  if (!body || typeof body !== "object") {
    const error = new Error("请求参数缺失。");
    error.statusCode = 400;
    throw error;
  }

  const sectionId = String(body.sectionId ?? "").trim();
  const incomingImages = Array.isArray(body.images) ? body.images : null;

  if (!sectionId) {
    const error = new Error("缺少素材分组 ID。");
    error.statusCode = 400;
    throw error;
  }

  if (!incomingImages) {
    const error = new Error("缺少图片素材列表。");
    error.statusCode = 400;
    throw error;
  }

  const content = readContent();
  const sectionIndex = content.materials.findIndex((section) => section.id === sectionId);

  if (sectionIndex === -1) {
    const error = new Error("没有找到要保存的素材分组。");
    error.statusCode = 404;
    throw error;
  }

  const sectionDir = resolve(materialUploadsRoot, sanitizePathSegment(sectionId));
  await mkdir(sectionDir, { recursive: true });

  const existingImages = Array.isArray(content.materials[sectionIndex].images) ? content.materials[sectionIndex].images : [];
  const savedImages = [];

  for (const image of incomingImages) {
    const productName = String(image?.productName ?? "").trim();
    if (!productName) {
      const error = new Error("每张图片都需要填写产品名称。");
      error.statusCode = 400;
      throw error;
    }

    if (typeof image?.dataUrl === "string" && image.dataUrl.startsWith("data:")) {
      const savedImage = await persistMaterialImage({ image, productName, sectionDir, sectionId });
      savedImages.push(savedImage);
      continue;
    }

    const existing = existingImages.find((item) => item.id === image?.id && item.imageUrl === image?.imageUrl);
    if (!existing) {
      const error = new Error("图片素材数据不完整，请重新上传。");
      error.statusCode = 400;
      throw error;
    }

    savedImages.push({
      ...existing,
      productName,
    });
  }

  await removeUnusedMaterialImages(sectionDir, savedImages);

  const nextMaterials = content.materials.map((section, index) =>
    index === sectionIndex
      ? {
          ...section,
          images: savedImages,
        }
      : section,
  );

  const nextContent = { ...content, materials: nextMaterials };
  writeContent(nextContent);

  return {
    ok: true,
    materials: nextMaterials,
    images: savedImages,
    updatedAt: new Date().toISOString(),
  };
}

async function persistMaterialImage({ image, productName, sectionDir, sectionId }) {
  const parsed = parseDataUrl(image.dataUrl);
  const extension = acceptedImageTypes[parsed.mimeType];

  if (!extension) {
    const error = new Error("仅支持 jpg、png、webp、gif 图片。");
    error.statusCode = 400;
    throw error;
  }

  if (parsed.buffer.length > 5 * 1024 * 1024) {
    const error = new Error("单张图片不能超过 5MB。");
    error.statusCode = 413;
    throw error;
  }

  const id = `material-image-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const originalName = String(image.fileName ?? "material-image").trim();
  const baseName = sanitizePathSegment(originalName.replace(/\.[^.]+$/, "")) || "material-image";
  const fileName = `${id}-${baseName}${extension}`;
  const filePath = resolve(sectionDir, fileName);
  const safeFilePath = normalize(filePath);

  if (!safeFilePath.startsWith(sectionDir)) {
    const error = new Error("图片文件名不合法。");
    error.statusCode = 400;
    throw error;
  }

  await writeFile(safeFilePath, parsed.buffer);

  return {
    id,
    productName,
    imageUrl: `/uploads/materials/${encodeURIComponent(sanitizePathSegment(sectionId))}/${encodeURIComponent(fileName)}`,
    fileName,
    uploadedAt: new Date().toISOString(),
  };
}

function parseDataUrl(dataUrl) {
  const matched = /^data:([^;,]+);base64,(.+)$/u.exec(dataUrl);
  if (!matched) {
    const error = new Error("图片数据格式不正确。");
    error.statusCode = 400;
    throw error;
  }

  return {
    mimeType: matched[1].toLowerCase(),
    buffer: Buffer.from(matched[2], "base64"),
  };
}

async function removeUnusedMaterialImages(sectionDir, savedImages) {
  const keepFileNames = new Set(savedImages.map((image) => image.fileName));
  const files = await readdir(sectionDir).catch(() => []);

  await Promise.all(
    files.map(async (fileName) => {
      if (keepFileNames.has(fileName)) {
        return;
      }
      const filePath = resolve(sectionDir, fileName);
      if (normalize(filePath).startsWith(sectionDir)) {
        await unlink(filePath).catch(() => {});
      }
    }),
  );
}

function sanitizePathSegment(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function safeStat(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

function getUploadContentType(filePath) {
  const extension = extname(filePath).toLowerCase();
  const contentTypes = {
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };

  return contentTypes[extension] || "application/octet-stream";
}

function readJsonBody(req, options = {}) {
  const maxBytes = options.maxBytes ?? 64 * 1024;

  return new Promise((resolveBody, rejectBody) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) {
        const error = new Error("请求体过大。");
        error.statusCode = 413;
        rejectBody(error);
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        const error = new Error("请求体不是合法 JSON。");
        error.statusCode = 400;
        rejectBody(error);
      }
    });
    req.on("error", rejectBody);
  });
}

function validateResearchRequest(body) {
  if (!body || typeof body !== "object") {
    const error = new Error("请求参数缺失。");
    error.statusCode = 400;
    throw error;
  }

  if (!String(body.query ?? "").trim()) {
    const error = new Error("请输入调研主题。");
    error.statusCode = 400;
    throw error;
  }

  body.industry = normalizeIndustryId(body.industry);
  body.query = String(body.query).trim();
  body.targetUser = String(body.targetUser ?? "").trim();
  body.column = String(body.column ?? "").trim();
  body.freshness = String(body.freshness ?? "noLimit");
  body.notes = String(body.notes ?? "").trim();
}

function validateTopicCandidateRequest(body) {
  validateResearchRequest(body);

  const categories = getTopicCategories();
  body.category = String(body.category ?? "").trim();

  if (!categories.includes(body.category)) {
    const error = new Error("请选择合法的选题类型。");
    error.statusCode = 400;
    throw error;
  }

  const limit = Number(body.limit ?? 5);
  body.limit = Number.isFinite(limit) ? Math.min(8, Math.max(1, Math.round(limit))) : 5;
}

function validateTopicRefreshRequest(body) {
  if (!body || typeof body !== "object") {
    const error = new Error("请求参数缺失。");
    error.statusCode = 400;
    throw error;
  }

  body.industry = normalizeIndustryId(body.industry);
  body.query = String(body.query ?? "").trim();
  body.column = String(body.column ?? "全部栏目").trim() || "全部栏目";
  body.sourceFilter = String(body.sourceFilter ?? "全部来源").trim() || "全部来源";
  body.contentStatus = String(body.contentStatus ?? "全部状态").trim() || "全部状态";

  const limit = Number(body.limit ?? 5);
  body.limit = Number.isFinite(limit) ? Math.min(8, Math.max(1, Math.round(limit))) : 5;
}

function validateMaterialExpandRequest(body) {
  if (!body || typeof body !== "object") {
    const error = new Error("请求参数缺失。");
    error.statusCode = 400;
    throw error;
  }

  if (!String(body.sectionTitle ?? "").trim()) {
    const error = new Error("缺少素材板块名称。");
    error.statusCode = 400;
    throw error;
  }

  if (!Array.isArray(body.existingItems)) {
    const error = new Error("缺少已有素材列表。");
    error.statusCode = 400;
    throw error;
  }

  body.sectionTitle = String(body.sectionTitle).trim();
  body.existingItems = body.existingItems.map((i) => String(i).trim()).filter(Boolean);
}

function validateTemplateRefreshRequest(body) {
  if (!body || typeof body !== "object") {
    const error = new Error("请求参数缺失。");
    error.statusCode = 400;
    throw error;
  }

  if (!body.template || typeof body.template !== "object") {
    const error = new Error("缺少模板信息。");
    error.statusCode = 400;
    throw error;
  }

  const template = body.template;

  if (!String(template.id ?? "").trim()) {
    const error = new Error("缺少模板 ID。");
    error.statusCode = 400;
    throw error;
  }

  if (!String(template.name ?? "").trim()) {
    const error = new Error("缺少模板名称。");
    error.statusCode = 400;
    throw error;
  }

  if (!Array.isArray(template.steps) || template.steps.length === 0) {
    const error = new Error("模板步骤不能为空。");
    error.statusCode = 400;
    throw error;
  }

  template.steps = template.steps.map((s) => String(s).trim()).filter(Boolean);
  template.scenario = String(template.scenario ?? "").trim();
  template.opener = String(template.opener ?? "").trim();
  template.platforms = Array.isArray(template.platforms) ? template.platforms : [];
}

export function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export function sendJavascript(res, statusCode, source) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.end(source);
}
