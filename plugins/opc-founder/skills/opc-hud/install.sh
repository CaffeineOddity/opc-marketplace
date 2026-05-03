#!/bin/bash
# OPC HUD Installer
# This script installs the OPC HUD statusline for Claude Code

set -e

HUD_SOURCE="$HOME/.claude/plugins/marketplaces/opc-marketplace/.claude/hud/opc-hud.mjs"
HUD_CACHE_DIR="$HOME/.claude/plugins/cache/opc-marketplace/hud"
HUD_CACHE="$HUD_CACHE_DIR/opc-hud.mjs"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "[OPC HUD] Installing..."

# Step 1: Check source exists
if [ ! -f "$HUD_SOURCE" ]; then
    echo "[OPC HUD] Error: HUD script not found at $HUD_SOURCE"
    echo "[OPC HUD] Please ensure opc-marketplace plugin is installed."
    exit 1
fi

# Step 2: Create cache directory and copy
mkdir -p "$HUD_CACHE_DIR"
cp "$HUD_SOURCE" "$HUD_CACHE"
chmod +x "$HUD_CACHE"
echo "[OPC HUD] Copied to $HUD_CACHE"

# Step 3: Update settings.json
if [ -f "$SETTINGS_FILE" ]; then
    # Check if statusLine already exists
    if grep -q '"statusLine"' "$SETTINGS_FILE"; then
        # Update existing statusLine
        if command -v jq &> /dev/null; then
            tmp_file=$(mktemp)
            jq '.statusLine = {"type": "command", "command": "node $HOME/.claude/plugins/cache/opc-marketplace/hud/opc-hud.mjs"}' "$SETTINGS_FILE" > "$tmp_file"
            mv "$tmp_file" "$SETTINGS_FILE"
            echo "[OPC HUD] Updated statusLine in settings.json"
        else
            # Fallback: use sed (less reliable but works for simple cases)
            sed -i.tmp 's/"command": *"[^"]*opc-hud[^"]*"/"command": "node $HOME\/.claude\/plugins\/cache\/opc-marketplace\/hud\/opc-hud.mjs"/g' "$SETTINGS_FILE"
            rm -f "${SETTINGS_FILE}.tmp"
            echo "[OPC HUD] Updated statusLine (sed fallback)"
        fi
    else
        # Add statusLine (insert before the last closing brace)
        tmp_file=$(mktemp)
        awk 'BEGIN{p=1} /^}$/{print ",\"statusLine\": {\"type\": \"command\", \"command\": \"node $HOME/.claude/plugins/cache/opc-marketplace/hud/opc-hud.mjs\"}"; p=0} {print} END{if(p) print ",\"statusLine\": {\"type\": \"command\", \"command\": \"node $HOME/.claude/plugins/cache/opc-marketplace/hud/opc-hud.mjs\"}"}' "$SETTINGS_FILE" > "$tmp_file"
        mv "$tmp_file" "$SETTINGS_FILE"
        echo "[OPC HUD] Added statusLine to settings.json"
    fi
else
    echo "[OPC HUD] Warning: settings.json not found at $SETTINGS_FILE"
fi

# Step 4: Verify
echo "[OPC HUD] Verifying installation..."
if [ -f "$HUD_CACHE" ]; then
    echo '{"context_window":{"used_percentage":45},"model":{"display_name":"Test"}}' | node "$HUD_CACHE" 2>/dev/null && echo "" || echo "[OPC HUD] Warning: HUD test failed"
else
    echo "[OPC HUD] Error: Installation failed"
    exit 1
fi

echo "[OPC HUD] Installation complete. Restart Claude Code for changes to take effect."
