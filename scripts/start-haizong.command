#!/bin/zsh

set -e

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
URL="http://127.0.0.1:4280/"

cd "$PROJECT_DIR"

echo "Starting Haizong project from:"
echo "$PROJECT_DIR"
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Please install Node.js first:"
  echo "https://nodejs.org/"
  echo
  read "reply?Press Enter to close..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
  echo
fi

echo "Opening $URL"
open "$URL" >/dev/null 2>&1 || true
echo "Starting dev server. Keep this window open while using the project."
echo

npm run dev
