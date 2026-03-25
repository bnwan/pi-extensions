#!/usr/bin/env bash
set -euo pipefail

EXTENSION_NAME=${1:?usage: ./scripts/link-extension.sh <extension-name>}
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
SOURCE_DIR="$ROOT_DIR/extensions/$EXTENSION_NAME"
TARGET_DIR="$HOME/.pi/agent/extensions/$EXTENSION_NAME"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "extension not found: $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$HOME/.pi/agent/extensions"
rm -rf "$TARGET_DIR"
ln -s "$SOURCE_DIR" "$TARGET_DIR"

echo "linked $EXTENSION_NAME -> $TARGET_DIR"
