#!/bin/bash
# OPC HUD Uninstaller
# This script removes the OPC HUD statusline from Claude Code

set -e

HUD_CACHE_DIR="$HOME/.claude/plugins/cache/opc-marketplace/hud"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "[OPC HUD] Uninstalling..."

# Step 1: Remove HUD script
if [ -f "$HUD_CACHE_DIR/opc-hud.mjs" ]; then
    rm -f "$HUD_CACHE_DIR/opc-hud.mjs"
    echo "[OPC HUD] Removed HUD script"
fi

# Step 2: Remove cache directory if empty
rmdir "$HUD_CACHE_DIR" 2>/dev/null || true
echo "[OPC HUD] Cleaned up cache directory"

# Step 3: Remove statusLine from settings.json
if [ -f "$SETTINGS_FILE" ]; then
    if command -v jq &> /dev/null; then
        tmp_file=$(mktemp)
        jq 'del(.statusLine)' "$SETTINGS_FILE" > "$tmp_file"
        mv "$tmp_file" "$SETTINGS_FILE"
        echo "[OPC HUD] Removed statusLine from settings.json"
    else
        # Fallback: use sed to remove statusLine block
        sed -i.tmp '/"statusLine"/,/}/d' "$SETTINGS_FILE"
        rm -f "${SETTINGS_FILE}.tmp"
        echo "[OPC HUD] Removed statusLine (sed fallback)"
    fi
fi

echo "[OPC HUD] Uninstallation complete. Restart Claude Code for changes to take effect."
