# 腾讯云 Ubuntu 部署指南

本文档用于将海宗内容工作台部署到腾讯云 Ubuntu CVM。公网入口使用 Nginx 80 端口，反向代理到服务器本机 `http://127.0.0.1:4280`；不要在腾讯云安全组开放 `4280`。

## 1. 本地部署前检查

在本地项目根目录执行：

```bash
npm run build
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:4280/api/health
```

确认无误后关闭本地容器：

```bash
docker compose down
```

当前 Docker 配置适合腾讯云部署：

- `Dockerfile` 使用 Node 20 Alpine，构建后通过 `npm start` 启动生产服务。
- `docker-compose.yml` 将容器端口映射为 `127.0.0.1:4280:4280`，不会把 `4280` 暴露到公网。
- `.dockerignore` 排除了 `.env`、`.env.*`、`node_modules/`、`dist/`、`server/data/auth-users.json`、`public/uploads/` 等本地和运行态文件。

## 2. 腾讯云安全组

入站规则建议：

| 端口 | 来源 | 用途 |
| --- | --- | --- |
| 22 | 你的固定 IP | SSH 管理 |
| 80 | 0.0.0.0/0 | Nginx HTTP 入口 |
| 443 | 0.0.0.0/0 | 后续 HTTPS |

不要开放 `4280`。应用只允许 Nginx 从服务器本机访问。

## 3. 上传或拉取代码

推荐目录：

```bash
/opt/haizong-workbench
```

如果服务器通过 Git 拉取代码，可在执行部署脚本时传入仓库地址：

```bash
sudo GIT_REPO="你的 Git 仓库地址" GIT_BRANCH="main" bash deploy/tencent-ubuntu.sh
```

如果已经手动把项目放到了 `/opt/haizong-workbench`，直接执行：

```bash
cd /opt/haizong-workbench
sudo bash deploy/tencent-ubuntu.sh
```

## 4. 创建生产环境变量

部署脚本启动项目前会检查：

```text
/opt/haizong-workbench/.env.production.local
```

如果文件不存在，脚本会停止并提示你手动创建。不要把 `.env`、`.env.local`、API Key、密码提交到 Git。

可参考模板：

```bash
cp deploy/tencent-cloud.env.example .env.production.local
chmod 600 .env.production.local
vi .env.production.local
```

至少确认这些字段：

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=4280

AUTH_ADMIN_PHONE=你的管理员手机号
AUTH_ADMIN_PASSWORD=管理员登录密码
AUTH_TOKEN_SECRET=一串足够长的随机字符串
AUTH_USERS_PATH=/data/haizong/auth-users.json

CONTENT_STORAGE_PATH=/data/haizong/content.json
CONTENT_READONLY=false
```

如需 AI 能力，再填写 Tavily、DeepSeek、JustOneAPI 等真实密钥。部署脚本不会生成、写入或提交任何真实 API Key。

## 5. 一键安装和部署

在腾讯云 Ubuntu 服务器执行：

```bash
cd /opt/haizong-workbench
sudo bash deploy/tencent-ubuntu.sh
```

脚本会执行：

1. 安装 `git`、`nginx`、`docker.io`、`docker-compose-plugin`、`curl`。
2. 启动并设置 Docker、Nginx 开机自启。
3. 创建 `/data/haizong/uploads` 持久化目录。
4. 初始化 `/data/haizong/content.json` 和 `/data/haizong/auth-users.json`。
5. 检查 `.env.production.local` 是否已手动创建。
6. 安装 Nginx 配置 `deploy/nginx-haizong-project.conf`。
7. 执行 `docker compose up -d --build`。
8. 访问 `http://127.0.0.1:4280/api/health` 做健康检查。

部署成功后公网访问：

```text
http://124.222.212.16/
```

## 6. Nginx 配置

项目提供：

```text
deploy/nginx-haizong-project.conf
```

核心代理目标：

```text
proxy_pass http://127.0.0.1:4280;
```

部署脚本会复制到：

```text
/etc/nginx/conf.d/haizong-project.conf
```

手动检查：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 7. 常用运维命令

```bash
cd /opt/haizong-workbench

docker compose ps
docker compose logs -f app
docker compose restart app
docker compose up -d --build
curl http://127.0.0.1:4280/api/health
```

## 8. 提交前注意

不要提交以下内容：

- `.env`
- `.env.local`
- `.env.*.local`
- API Key、密码、Token
- `server/data/auth-users.json`
- `public/uploads/`
- 因登录产生的账号登录时间变化

上线前再次确认腾讯云安全组没有开放 `4280`。
