#!/bin/bash
# 生成干净的 Windows 分发包 ZIP
# 排除 macOS 元数据、node_modules、.git、dist 等

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"
OUTPUT="$HOME/Desktop/${PROJECT_NAME}.zip"

# 删除旧 ZIP
rm -f "$OUTPUT"

echo "📦 打包项目: $PROJECT_NAME"
echo "📍 输出位置: $OUTPUT"
echo ""

cd "$PROJECT_DIR/.."

# 使用系统 zip（而非 ditto）以避免 __MACOSX 元数据
zip -r "$OUTPUT" "$PROJECT_NAME/" \
  -x "*/node_modules/*" \
  -x "*/.git/*" \
  -x "*/dist/*" \
  -x "*/.env" \
  -x "*/.env.local" \
  -x "*/.env.*.local" \
  -x "*/__MACOSX/*" \
  -x "*/.DS_Store" \
  -x "*/._*" \
  -x "*.tsbuildinfo" \
  -x "*/logs/*" \
  -x "*/backups/*" \
  -x "*.zip"

SIZE=$(du -h "$OUTPUT" | cut -f1)
echo ""
echo "✅ 打包完成: $OUTPUT ($SIZE)"
echo ""
echo "📋 ZIP 内根目录文件:"
unzip -l "$OUTPUT" | grep -E "${PROJECT_NAME}/[^/]+$" | grep -v "/\." | head -20
