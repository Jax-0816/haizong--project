#!/bin/bash
# ============================================================
# 海哥内容工作台 — 数据备份脚本
# ============================================================
# 用法：
#   手动：./scripts/backup-content.sh
#   定时：crontab -e 添加：0 3 * * * /opt/haizong-workbench/scripts/backup-content.sh
#
# 行为：
#   - 将 content.json 和 auth-users.json 备份到 backups/ 目录
#   - 保留最近 30 个备份，自动清理旧文件
# ============================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env.production.local"
BACKUP_DIR="${PROJECT_DIR}/backups"
MAX_BACKUPS=30

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

resolve_data_path() {
  local value="$1"
  local fallback="$2"
  local path="${value:-$fallback}"

  case "$path" in
    /*) printf '%s\n' "$path" ;;
    *) printf '%s\n' "${PROJECT_DIR}/${path}" ;;
  esac
}

CONTENT_FILE="$(resolve_data_path "${CONTENT_STORAGE_PATH:-}" "src/data/content.json")"
AUTH_USERS_FILE="$(resolve_data_path "${AUTH_USERS_PATH:-}" "server/data/auth-users.json")"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 生成备份文件名
TIMESTAMP=$(date +%F-%H%M%S)

backup_file() {
  local source_file="$1"
  local label="$2"
  local backup_file="${BACKUP_DIR}/${label}-${TIMESTAMP}.json"

  if [ ! -f "$source_file" ]; then
    echo "⚠ 跳过: ${label}.json 不存在 ($source_file)"
    return
  fi

  cp "$source_file" "$backup_file"
  echo "✓ 已备份: $backup_file ($(wc -c < "$backup_file") bytes)"
}

cleanup_old_backups() {
  local label="$1"
  local backup_count
  backup_count=$(ls -1 "$BACKUP_DIR"/"${label}"-*.json 2>/dev/null | wc -l | tr -d ' ')

  if [ "$backup_count" -gt "$MAX_BACKUPS" ]; then
    local delete_count=$((backup_count - MAX_BACKUPS))
    echo "  清理 ${label} 的 $delete_count 个旧备份..."
    ls -1t "$BACKUP_DIR"/"${label}"-*.json | tail -n "$delete_count" | xargs rm -f
  fi

  echo "  ${label} 当前备份总数: $(ls -1 "$BACKUP_DIR"/"${label}"-*.json 2>/dev/null | wc -l | tr -d ' ')"
}

backup_file "$CONTENT_FILE" "content"
backup_file "$AUTH_USERS_FILE" "auth-users"

# 清理超过 30 个的旧备份
cleanup_old_backups "content"
cleanup_old_backups "auth-users"
