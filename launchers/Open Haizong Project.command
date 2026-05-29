#!/bin/zsh

set -e

LAUNCHER_DIR="${0:A:h}"
PROJECT_DIR="${LAUNCHER_DIR:h}"
SCRIPT_PATH="$PROJECT_DIR/scripts/start-haizong.command"

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "Could not find the macOS launcher script:"
  echo "$SCRIPT_PATH"
  echo
  read "reply?Press Enter to close..."
  exit 1
fi

exec "$SCRIPT_PATH"
