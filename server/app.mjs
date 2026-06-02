import { readContent, saveContent } from "./services/contentStore.mjs";
import { generatePublishDraft, generateScriptDraft, researchProductionTopic, saveProduction } from "./services/production.mjs";
import { runResearch } from "./services/research.mjs";
import { confirmTopic, generateCandidates, getTopicCategories, refreshCandidates } from "./services/topicCandidates.mjs";
import { getAppRuntimeConfig } from "./runtimeConfig.mjs";
import { normalizeIndustryId } from "./services/industry.mjs";

export function createAppHandler(options = {}) {
  const notFound = options.notFound ?? defaultNotFound;

  return async function handleRequest(req, res) {
    try {
      const pathname = getPathname(req.url);

      if (req.method === "GET" && pathname === "/api/content") {
        sendJson(res, 200, readContent());
        return;
      }

      if ((req.method === "PUT" || req.method === "POST") && pathname === "/api/content") {
        const body = await readJsonBody(req, { maxBytes: 2 * 1024 * 1024 });
        const result = saveContent(body.content ?? body);
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

export function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export function sendJavascript(res, statusCode, source) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.end(source);
}
