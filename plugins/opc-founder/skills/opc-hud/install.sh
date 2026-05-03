#!/bin/bash
# OPC HUD Installer
# This script installs the OPC HUD statusline for Claude Code

set -e

HUD_SOURCE="$HOME/.claude/plugins/marketplaces/opc-marketplace/.claude/hud/opc-hud.mjs"
# Install to marketplaces dir (persistent, not cache which gets cleaned)
HUD_DIR="$HOME/.claude/plugins/marketplaces/opc-marketplace/.claude/hud"
HUD_TARGET="$HUD_DIR/opc-hud.mjs"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo "[OPC HUD] Installing..."

# Step 1: Check source exists (try local dev location first)
if [ ! -f "$HUD_SOURCE" ]; then
    # Try local development path
    LOCAL_SOURCE="$HOME/YYInc/Me/opc-marketplace/.claude/hud/opc-hud.mjs"
    if [ -f "$LOCAL_SOURCE" ]; then
        HUD_SOURCE="$LOCAL_SOURCE"
        HUD_DIR="$HOME/YYInc/Me/opc-marketplace/.claude/hud"
        HUD_TARGET="$HUD_DIR/opc-hud.mjs"
    else
        echo "[OPC HUD] Error: HUD script not found"
        echo "[OPC HUD] Please ensure opc-marketplace plugin is installed."
        exit 1
    fi
fi

# Step 2: Ensure target is executable
chmod +x "$HUD_TARGET"
echo "[OPC HUD] HUD script ready at $HUD_TARGET"

# Step 3: Update settings.json (use marketplaces path, not cache)
HUD_COMMAND="node $HOME/.claude/plugins/marketplaces/opc-marketplace/.claude/hud/opc-hud.mjs"
if [ -f "$SETTINGS_FILE" ]; then
    # Check if statusLine already exists
    if grep -q '"statusLine"' "$SETTINGS_FILE"; then
        # Update existing statusLine
        if command -v jq &> /dev/null; then
            tmp_file=$(mktemp)
            jq ".statusLine = {\"type\": \"command\", \"command\": \"$HUD_COMMAND\"}" "$SETTINGS_FILE" > "$tmp_file"
            mv "$tmp_file" "$SETTINGS_FILE"
            echo "[OPC HUD] Updated statusLine in settings.json"
        else
            # Fallback: use sed (less reliable but works for simple cases)
            sed -i.tmp 's/"command": *"[^"]*opc-hud[^"]*"/"command": "'"$HUD_COMMAND"'"/g' "$SETTINGS_FILE"
            rm -f "${SETTINGS_FILE}.tmp"
            echo "[OPC HUD] Updated statusLine (sed fallback)"
        fi
    else
        # Add statusLine (insert before the last closing brace)
        tmp_file=$(mktemp)
        awk 'BEGIN{p=1} /^}$/{print ",\"statusLine\": {\"type\": \"command\", \"command\": \"'"$HUD_COMMAND"'\"}"; p=0} {print} END{if(p) print ",\"statusLine\": {\"type\": \"command\", \"command\": \"'"$HUD_COMMAND"'\"}"}' "$SETTINGS_FILE" > "$tmp_file"
        mv "$tmp_file" "$SETTINGS_FILE"
        echo "[OPC HUD] Added statusLine to settings.json"
    fi
else
    echo "[OPC HUD] Warning: settings.json not found at $SETTINGS_FILE"
fi

# Step 4: Verify
echo "[OPC HUD] Verifying installation..."
if [ -f "$HUD_TARGET" ]; then
    echo '{"context_window":{"used_percentage":45},"model":{"display_name":"Test"}}' | node "$HUD_TARGET" 2>/dev/null && echo "" || echo "[OPC HUD] Warning: HUD test failed"
else
    echo "[OPC HUD] Error: Installation failed"
    exit 1
fi

echo "[OPC HUD] Installation complete. Restart Claude Code for changes to take effect."
