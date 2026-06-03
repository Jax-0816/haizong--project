#!/bin/bash
# ============================================================
# 海哥内容工作台 — content.json 备份脚本
# ============================================================
# 用法：
#   手动：./scripts/backup-content.sh
#   定时：crontab -e 添加：0 3 * * * /opt/haizong-workbench/scripts/backup-content.sh
#
# 行为：
#   - 将 content.json 备份到 backups/ 目录，文件名为 content-YYYY-MM-DD-HHMMSS.json
#   - 保留最近 30 个备份，自动清理旧文件
# ============================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONTENT_FILE="${PROJECT_DIR}/src/data/content.json"
BACKUP_DIR="${PROJECT_DIR}/backups"
MAX_BACKUPS=30

# 检查源文件是否存在
if [ ! -f "$CONTENT_FILE" ]; then
  echo "错误: content.json 不存在 ($CONTENT_FILE)"
  exit 1
fi

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 生成备份文件名
TIMESTAMP=$(date +%F-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/content-${TIMESTAMP}.json"

# 执行备份
cp "$CONTENT_FILE" "$BACKUP_FILE"
echo "✓ 已备份: $BACKUP_FILE ($(wc -c < "$BACKUP_FILE") bytes)"

# 清理超过 30 个的旧备份
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/content-*.json 2>/dev/null | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  DELETE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
  echo "  清理 $DELETE_COUNT 个旧备份..."
  ls -1t "$BACKUP_DIR"/content-*.json | tail -n "$DELETE_COUNT" | xargs rm -f
  echo "  清理完成，保留最近 $MAX_BACKUPS 个备份"
fi

echo "  当前备份总数: $(ls -1 "$BACKUP_DIR"/content-*.json 2>/dev/null | wc -l | tr -d ' ')"
