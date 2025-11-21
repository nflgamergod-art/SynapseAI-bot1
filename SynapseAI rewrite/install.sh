#!/bin/bash

# SynapseAI Executor Installer
# This script installs SynapseAI and all dependencies

set -e

echo "============================================================"
echo "   SynapseAI Executor - Installer"
echo "============================================================"
echo ""

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
echo "✓ Found Python $PYTHON_VERSION"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
python3 -m pip install --user flask flask-cors psutil lupa

echo ""
echo "✓ Dependencies installed successfully!"

# Create executable script in user's local bin
INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"

# Get the current directory (where the script is located)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

    # macOS-specific: install native app dependencies (pywebview + pyobjc)
if [[ "$(uname)" == "Darwin" ]]; then
    echo "\n🧰 Detected macOS - installing native app dependencies (pywebview, pyobjc)..."
    python3 -m pip install --user pywebview pyobjc || true
fi
# Create the synapse command
cat > "$INSTALL_DIR/synapse" << EOL
#!/bin/bash
cd "$SCRIPT_DIR"
python3 main.py "\$@"
EOL

chmod +x "$INSTALL_DIR/synapse"

echo ""
echo "✓ Installed synapse command to $INSTALL_DIR"

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo ""
    echo "⚠️  Please add the following to your ~/.zshrc or ~/.bash_profile:"
    echo ""
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    echo "Then run: source ~/.zshrc"
fi

echo ""
echo "============================================================"
echo "✅ Installation Complete!"
echo "============================================================"
echo ""
echo "To start SynapseAI Executor, run:"
echo "    synapse"
echo ""
if [[ "$(uname)" == "Darwin" ]]; then
    # Create the synapse-app command (native window on macOS)
    cat > "$INSTALL_DIR/synapse-app" << EOL
#!/bin/bash
cd "$SCRIPT_DIR"
python3 mac_app.py "\$@"
EOL

    chmod +x "$INSTALL_DIR/synapse-app"

    echo ""
    echo "✓ Installed synapse-app command to $INSTALL_DIR (macOS native window)"
fi
echo "Or directly:"
echo "    python3 $SCRIPT_DIR/main.py"
echo ""
echo "============================================================"
