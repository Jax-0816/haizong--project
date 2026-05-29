import { createServer as createHttpServer } from "node:http";
import { createServer as createViteServer } from "vite";
import { loadLocalEnv } from "./config.mjs";
import { readContent, saveContent } from "./services/contentStore.mjs";
import { generatePublishDraft, generateScriptDraft, researchProductionTopic, saveProduction } from "./services/production.mjs";
import { runResearch } from "./services/research.mjs";
import { confirmTopic, generateCandidates, getTopicCategories, refreshCandidates } from "./services/topicCandidates.mjs";

loadLocalEnv();

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4280);

let vite;

const server = createHttpServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/content") {
      sendJson(res, 200, readContent());
      return;
    }

    if ((req.method === "PUT" || req.method === "POST") && req.url === "/api/content") {
      const body = await readJsonBody(req, { maxBytes: 2 * 1024 * 1024 });
      const result = saveContent(body.content ?? body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/research") {
      const body = await readJsonBody(req);
      validateResearchRequest(body);
      const result = await runResearch(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/topic-candidates/generate") {
      const body = await readJsonBody(req);
      validateTopicCandidateRequest(body);
      const result = await generateCandidates(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/topics/refresh") {
      const body = await readJsonBody(req);
      validateTopicRefreshRequest(body);
      const result = await refreshCandidates(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/topics/confirm") {
      const body = await readJsonBody(req);
      const result = confirmTopic(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/production/save") {
      const body = await readJsonBody(req);
      const result = saveProduction(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/production/research") {
      const body = await readJsonBody(req);
      const result = await researchProductionTopic(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/production/generate-script") {
      const body = await readJsonBody(req);
      const result = await generateScriptDraft(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/production/generate-publish") {
      const body = await readJsonBody(req);
      const result = await generatePublishDraft(body);
      sendJson(res, 200, result);
      return;
    }

    vite.middlewares(req, res, () => {
      if (!res.headersSent) {
        sendJson(res, 404, { error: "Not found" });
      }
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(res, statusCode, {
      error: error.message || "服务器处理失败",
      code: error.code || "SERVER_ERROR",
    });
  }
});

vite = await createViteServer({
  server: { hmr: { server }, middlewareMode: true, host: HOST },
  appType: "spa",
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${PORT} 已被占用。请关闭旧的项目窗口或占用该端口的进程后重试。`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Haizong workbench running at http://${HOST}:${PORT}/`);
});

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

  body.query = String(body.query ?? "").trim();
  body.column = String(body.column ?? "全部栏目").trim() || "全部栏目";
  body.sourceFilter = String(body.sourceFilter ?? "全部来源").trim() || "全部来源";
  body.contentStatus = String(body.contentStatus ?? "全部状态").trim() || "全部状态";

  const limit = Number(body.limit ?? 5);
  body.limit = Number.isFinite(limit) ? Math.min(8, Math.max(1, Math.round(limit))) : 5;
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
