#!/usr/bin/env bash
set -euo pipefail

EXTENSION_NAME=${1:?usage: ./scripts/unlink-extension.sh <extension-name>}
TARGET_DIR="$HOME/.pi/agent/extensions/$EXTENSION_NAME"

if [ -L "$TARGET_DIR" ] || [ -e "$TARGET_DIR" ]; then
  rm -rf "$TARGET_DIR"
  echo "unlinked $EXTENSION_NAME"
else
  echo "nothing to unlink for $EXTENSION_NAME"
fi
