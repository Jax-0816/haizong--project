import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { extname, normalize, resolve } from "node:path";
import { createAppHandler } from "./app.mjs";
import { loadEnvFiles } from "./config.mjs";

loadEnvFiles("production");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 4280);
const distDir = resolve(process.cwd(), "dist");

const server = createHttpServer(
  createAppHandler({
    notFound: async (req, res, pathname) => {
      const filePath = resolveStaticPath(pathname);

      if (!filePath) {
        sendNotFound(res);
        return;
      }

      const fileStats = await safeStat(filePath);
      if (!fileStats?.isFile()) {
        sendNotFound(res);
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", getContentType(filePath));
      if (fileStats.size > 0) {
        res.setHeader("Content-Length", String(fileStats.size));
      }
      createReadStream(filePath).pipe(res);
    },
  }),
);

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${PORT} 已被占用，请更换 PORT 或关闭旧进程后重试。`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Haizong workbench running at http://${HOST}:${PORT}/`);
});

function resolveStaticPath(pathname) {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const candidate = resolve(distDir, `.${normalizedPath}`);
  const safeCandidate = normalize(candidate);

  if (!safeCandidate.startsWith(distDir)) {
    return null;
  }

  if (existsSync(safeCandidate)) {
    return safeCandidate;
  }

  if (!extname(normalizedPath)) {
    const htmlCandidate = resolve(distDir, `.${normalizedPath}.html`);
    if (normalize(htmlCandidate).startsWith(distDir) && existsSync(htmlCandidate)) {
      return htmlCandidate;
    }
  }

  return null;
}

async function safeStat(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

function getContentType(filePath) {
  const extension = extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };

  return map[extension] || "application/octet-stream";
}

function sendNotFound(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Not found");
}
