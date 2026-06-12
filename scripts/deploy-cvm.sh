#!/bin/bash
# ============================================================
# 海哥内容工作台 — CVM 一键部署脚本
# ============================================================
# 用法：
#   ./scripts/deploy-cvm.sh <cvm-ip> <ssh-key-path> [ssh-user]
#
# 示例：
#   ./scripts/deploy-cvm.sh 1.12.xx.xx ~/.ssh/haizong_cvm.pem root
#   ./scripts/deploy-cvm.sh 1.12.xx.xx ~/.ssh/haizong_cvm.pem haizong
#
# 前置条件：
#   - 本地已安装 rsync（macOS 自带）
#   - SSH 密钥已配置
#   - CVM 上已创建用户并安装 Node.js 20+
# ============================================================

set -euo pipefail

# ── 参数 ──────────────────────────────────────────────
CVM_IP="${1:-}"
SSH_KEY="${2:-}"
SSH_USER="${3:-root}"

if [ -z "$CVM_IP" ] || [ -z "$SSH_KEY" ]; then
  echo "用法: $0 <cvm-ip> <ssh-key-path> [ssh-user]"
  echo "示例: $0 1.12.xx.xx ~/.ssh/haizong_cvm.pem root"
  exit 1
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "错误: SSH 密钥 $SSH_KEY 不存在"
  exit 1
fi

# ── 配置 ──────────────────────────────────────────────
REMOTE_DIR="/opt/haizong-workbench"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=========================================="
echo "海哥内容工作台 — CVM 部署"
echo "目标: $SSH_USER@$CVM_IP"
echo "远程目录: $REMOTE_DIR"
echo "=========================================="

# ── Step 1: 本地构建 ─────────────────────────────────
echo ""
echo "[1/5] 本地构建..."
cd "$PROJECT_DIR"
npm run build
echo "✓ 构建完成"

# ── Step 2: 上传到 CVM ────────────────────────────────
echo ""
echo "[2/5] 上传文件到 CVM..."

# 确保远程目录存在
ssh $SSH_OPTS "$SSH_USER@$CVM_IP" "sudo mkdir -p $REMOTE_DIR && sudo chown -R $SSH_USER:$SSH_USER $REMOTE_DIR" || true

# rsync 同步（排除不必要文件，保护远程业务数据和账号数据）
rsync -avz --delete \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='src/data/content.json' \
  --exclude='server/data/auth-users.json' \
  --exclude='logs/' \
  --exclude='backups/' \
  -e "ssh $SSH_OPTS" \
  "$PROJECT_DIR/" "$SSH_USER@$CVM_IP:$REMOTE_DIR/"

echo "✓ 文件上传完成"

# ── Step 3: 安装依赖 ─────────────────────────────────
echo ""
echo "[3/5] 安装依赖..."
ssh $SSH_OPTS "$SSH_USER@$CVM_IP" "cd $REMOTE_DIR && npm install --omit=dev 2>/dev/null || npm install"
echo "✓ 依赖安装完成"

# ── Step 4: 重启服务 ──────────────────────────────────
echo ""
echo "[4/5] 重启服务..."

# 尝试 systemd
if ssh $SSH_OPTS "$SSH_USER@$CVM_IP" "sudo systemctl is-enabled haizong 2>/dev/null"; then
  ssh $SSH_OPTS "$SSH_USER@$CVM_IP" "sudo systemctl restart haizong"
  echo "✓ systemd 服务已重启"
# 回退到 PM2
elif ssh $SSH_OPTS "$SSH_USER@$CVM_IP" "command -v pm2 >/dev/null 2>&1 && pm2 list | grep -q haizong-workbench"; then
  ssh $SSH_OPTS "$SSH_USER@$CVM_IP" "cd $REMOTE_DIR && pm2 restart haizong-workbench"
  echo "✓ PM2 服务已重启"
else
  echo "⚠ 未检测到 systemd 或 PM2，请手动启动: node server/prod.mjs"
fi

# ── Step 5: 健康检查 ─────────────────────────────────
echo ""
echo "[5/5] 健康检查..."
sleep 2

HTTP_CODE=$(ssh $SSH_OPTS "$SSH_USER@$CVM_IP" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4280/api/health" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  echo "✓ 健康检查通过 (HTTP $HTTP_CODE)"
  ssh $SSH_OPTS "$SSH_USER@$CVM_IP" "curl -s http://127.0.0.1:4280/api/health" 2>/dev/null || true
else
  echo "⚠ 健康检查异常 (HTTP $HTTP_CODE)，请检查服务日志"
  echo "  查看日志: ssh $SSH_OPTS $SSH_USER@$CVM_IP 'journalctl -u haizong -n 20 --no-pager'"
fi

echo ""
echo "=========================================="
echo "部署完成！"
echo "访问地址: http://$CVM_IP/"
echo "=========================================="
