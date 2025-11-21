#!/usr/bin/env bash
# Build a standalone macOS .app using PyInstaller
# Output: dist/SynapseAI.app

set -euo pipefail
cd "$(dirname "$0")"

if ! command -v pyinstaller &>/dev/null; then
  echo "Installing PyInstaller..."
  python3 -m pip install --user pyinstaller
fi

# Ensure dependencies for native window are present
python3 -m pip install --user pywebview pyobjc || true

# Clean previous build artifacts
rm -rf build dist *.spec || true

# Include templates, static, and scripts as application data
# On macOS/Linux, use ':' as the separator for --add-data
pyinstaller \
  --windowed \
  --name "SynapseAI" \
  --add-data "templates:templates" \
  --add-data "static:static" \
  --add-data "scripts:scripts" \
  mac_app.py

APP_PATH="dist/SynapseAI.app"

if [[ -d "$APP_PATH" ]]; then
  echo "\n✅ Built $APP_PATH"
  echo "Open it with: open \"$APP_PATH\""
else
  echo "\n❌ Build failed. Check the PyInstaller output above."
  exit 1
fi
