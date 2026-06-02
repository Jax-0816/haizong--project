import { createServer as createHttpServer } from "node:http";
import { createServer as createViteServer } from "vite";
import { createAppHandler } from "./app.mjs";
import { loadEnvFiles } from "./config.mjs";

loadEnvFiles("development");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4280);

let vite;

const server = createHttpServer(
  createAppHandler({
    notFound: async (req, res) => {
      vite.middlewares(req, res, () => {
        if (!res.headersSent) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "Not found" }));
        }
      });
    },
  }),
);

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
