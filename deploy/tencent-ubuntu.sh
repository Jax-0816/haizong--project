#!/usr/bin/env bash
# ============================================================
# 海宗内容工作台 - 腾讯云 Ubuntu Docker + Nginx 部署脚本
# ============================================================
# 推荐在腾讯云 Ubuntu 服务器上执行：
#   sudo bash deploy/tencent-ubuntu.sh
#
# 可选环境变量：
#   APP_DIR=/opt/haizong-workbench
#   DATA_DIR=/data/haizong
#   GIT_REPO=https://example.com/your/repo.git
#   GIT_BRANCH=main
# ============================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/haizong-workbench}"
DATA_DIR="${DATA_DIR:-/data/haizong}"
GIT_REPO="${GIT_REPO:-}"
GIT_BRANCH="${GIT_BRANCH:-main}"
ENV_FILE="$APP_DIR/.env.production.local"
NGINX_CONF_SOURCE="$APP_DIR/deploy/nginx-haizong-project.conf"
NGINX_CONF_TARGET="/etc/nginx/conf.d/haizong-project.conf"

if [ "$(id -u)" -ne 0 ]; then
  echo "请使用 root 权限执行，例如：sudo bash deploy/tencent-ubuntu.sh"
  exit 1
fi

echo "=========================================="
echo "海宗内容工作台 - 腾讯云 Ubuntu 部署"
echo "应用目录: $APP_DIR"
echo "数据目录: $DATA_DIR"
echo "=========================================="

echo ""
echo "[1/7] 安装 git、nginx、docker..."
apt-get update
apt-get install -y git nginx docker.io docker-compose-plugin curl ca-certificates
systemctl enable --now docker
systemctl enable --now nginx

echo ""
echo "[2/7] 准备项目目录..."
mkdir -p "$APP_DIR" "$DATA_DIR/uploads"

if [ -n "$GIT_REPO" ]; then
  if [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" fetch --all --prune
    git -C "$APP_DIR" checkout "$GIT_BRANCH"
    git -C "$APP_DIR" pull --ff-only origin "$GIT_BRANCH"
  else
    if [ -n "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
      echo "$APP_DIR 已存在且不是 Git 仓库。"
      echo "请手动清理或换一个 APP_DIR，脚本不会自动删除现有目录。"
      exit 1
    fi
    git clone --branch "$GIT_BRANCH" "$GIT_REPO" "$APP_DIR"
  fi
elif [ ! -f "$APP_DIR/docker-compose.yml" ]; then
  echo "未发现 $APP_DIR/docker-compose.yml。"
  echo "请先把项目代码放到 $APP_DIR，或使用 GIT_REPO=你的仓库地址 运行本脚本。"
  exit 1
fi

cd "$APP_DIR"

echo ""
echo "[3/7] 检查 Docker 部署配置..."
if [ ! -f Dockerfile ] || [ ! -f docker-compose.yml ] || [ ! -f .dockerignore ]; then
  echo "缺少 Dockerfile、docker-compose.yml 或 .dockerignore，请确认项目文件完整。"
  exit 1
fi

if ! grep -q '127.0.0.1:4280:4280' docker-compose.yml; then
  echo "docker-compose.yml 必须将 4280 绑定到 127.0.0.1，避免公网直连。"
  echo "期望配置：ports: [\"127.0.0.1:4280:4280\"]"
  exit 1
fi

echo ""
echo "[4/7] 初始化持久化数据目录..."
mkdir -p "$DATA_DIR/uploads"
if [ ! -f "$DATA_DIR/content.json" ]; then
  cp "$APP_DIR/src/data/content.json" "$DATA_DIR/content.json"
fi
if [ ! -f "$DATA_DIR/auth-users.json" ]; then
  printf '{"users":[]}\n' > "$DATA_DIR/auth-users.json"
fi
chmod 600 "$DATA_DIR/auth-users.json"
chmod 644 "$DATA_DIR/content.json"

echo ""
echo "[5/7] 检查生产环境变量..."
if [ ! -f "$ENV_FILE" ]; then
  cat <<EOF

未找到 $ENV_FILE

请先手动创建该文件并填写真实生产配置，再重新运行本脚本。
不要把 .env、.env.local、API Key、密码提交到 Git。

可参考：
  $APP_DIR/deploy/tencent-cloud.env.example

最少需要确认：
  NODE_ENV=production
  HOST=0.0.0.0
  PORT=4280
  AUTH_ADMIN_PHONE=你的管理员手机号
  AUTH_ADMIN_PASSWORD=管理员登录密码
  AUTH_TOKEN_SECRET=一串足够长的随机字符串
  AUTH_USERS_PATH=$DATA_DIR/auth-users.json
  CONTENT_STORAGE_PATH=$DATA_DIR/content.json

EOF
  exit 1
fi
chmod 600 "$ENV_FILE"

echo ""
echo "[6/7] 配置 Nginx 反向代理..."
if [ ! -f "$NGINX_CONF_SOURCE" ]; then
  echo "缺少 Nginx 配置模板：$NGINX_CONF_SOURCE"
  exit 1
fi
cp "$NGINX_CONF_SOURCE" "$NGINX_CONF_TARGET"
nginx -t
systemctl reload nginx

echo ""
echo "[7/7] 构建并启动 Docker Compose..."
docker compose up -d --build

echo ""
echo "等待应用启动..."
sleep 5
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4280/api/health || true)"
if [ "$HTTP_CODE" != "200" ]; then
  echo "健康检查失败，HTTP 状态码：$HTTP_CODE"
  echo "请查看日志：cd $APP_DIR && docker compose logs --tail=100 app"
  exit 1
fi

echo ""
echo "部署完成。"
echo "本机健康检查：http://127.0.0.1:4280/api/health"
echo "公网入口：http://124.222.212.16/"
echo "请确认腾讯云安全组只开放 22、80、443，不要开放 4280。"
