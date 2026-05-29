#!/bin/zsh

set -e

LAUNCHER_DIR="${0:A:h}"
PROJECT_DIR="${LAUNCHER_DIR:h}"
DESKTOP_DIR="$HOME/Desktop"
TARGET_PATH="$DESKTOP_DIR/Open Haizong Project.command"
SOURCE_PATH="$PROJECT_DIR/launchers/Open Haizong Project.command"

if [ ! -f "$SOURCE_PATH" ]; then
  echo "Could not find the source launcher:"
  echo "$SOURCE_PATH"
  echo
  read "reply?Press Enter to close..."
  exit 1
fi

mkdir -p "$DESKTOP_DIR"

cat >"$TARGET_PATH" <<EOF
#!/bin/zsh
exec "$SOURCE_PATH"
EOF

chmod +x "$TARGET_PATH"

echo "Desktop launcher created:"
echo "$TARGET_PATH"
echo
echo "You can now double-click it from the Desktop."
echo
read "reply?Press Enter to close..."
