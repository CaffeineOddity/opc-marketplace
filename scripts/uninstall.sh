#!/bin/bash
# OPC Marketplace Uninstaller
# Removes OPC plugins, HUD, and cleans up settings

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}OPC Marketplace Uninstaller${NC}"
echo ""

CLAUDE_CONFIG_DIR="$HOME/.claude"

echo "This will remove ALL OPC components from:"
echo "  $CLAUDE_CONFIG_DIR"
echo ""
echo "Components to be removed:"
echo "  - OPC plugins (product-kit, design-kit, dev-kit, qa-kit, ship-kit, growth-kit, docs-kit)"
echo "  - OPC founder plugin"
echo "  - HUD script (~/.claude/hud/opc-hud.mjs)"
echo "  - statusLine configuration from settings.json"
echo ""

if [ -t 0 ]; then
    read -p "Continue? (y/N) " -n 1 -r
    echo
else
    if [ -c /dev/tty ]; then
        echo -n "Continue? (y/N) " >&2
        read -n 1 -r < /dev/tty
        echo
    else
        echo "Non-interactive mode detected. Uninstallation cancelled."
        exit 1
    fi
fi

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Remove OPC plugins from cache
echo -e "${BLUE}Removing OPC plugins...${NC}"
PLUGINS="opc-founder product-kit design-kit dev-kit qa-kit ship-kit growth-kit docs-kit"
for plugin in $PLUGINS; do
    if [ -d "$CLAUDE_CONFIG_DIR/plugins/cache/opc-marketplace/$plugin" ]; then
        rm -rf "$CLAUDE_CONFIG_DIR/plugins/cache/opc-marketplace/$plugin"
        echo "  Removed: $plugin"
    fi
done

# Remove opc-marketplace cache directory if empty
if [ -d "$CLAUDE_CONFIG_DIR/plugins/cache/opc-marketplace" ]; then
    rmdir "$CLAUDE_CONFIG_DIR/plugins/cache/opc-marketplace" 2>/dev/null || true
fi

# Update installed_plugins.json
INSTALLED_PLUGINS_FILE="$CLAUDE_CONFIG_DIR/plugins/installed_plugins.json"
if [ -f "$INSTALLED_PLUGINS_FILE" ] && command -v jq &> /dev/null; then
    echo -e "${BLUE}Updating installed_plugins.json...${NC}"

    TEMP_FILE=$(mktemp)
    jq 'with_entries(select(.key | startswith("opc-") | not)) | with_entries(select(.key | contains("@opc-marketplace") | not))' "$INSTALLED_PLUGINS_FILE" > "$TEMP_FILE" 2>/dev/null

    if [ $? -eq 0 ] && [ -s "$TEMP_FILE" ]; then
        mv "$TEMP_FILE" "$INSTALLED_PLUGINS_FILE"
        echo -e "${GREEN}✓ Removed OPC plugins from installed_plugins.json${NC}"
    else
        rm -f "$TEMP_FILE"
        echo -e "${YELLOW}⚠ Could not update installed_plugins.json${NC}"
    fi
fi

# Remove HUD script
echo -e "${BLUE}Removing HUD script...${NC}"
rm -f "$CLAUDE_CONFIG_DIR/plugins/cache/opc-marketplace/hud/opc-hud.mjs"

# Remove HUD directory if empty
if [ -d "$CLAUDE_CONFIG_DIR/plugins/cache/opc-marketplace/hud" ]; then
    rmdir "$CLAUDE_CONFIG_DIR/plugins/cache/opc-marketplace/hud" 2>/dev/null || true
fi

# Remove statusLine from settings.json
SETTINGS_FILE="$CLAUDE_CONFIG_DIR/settings.json"
if [ -f "$SETTINGS_FILE" ] && command -v jq &> /dev/null; then
    echo -e "${BLUE}Removing statusLine from settings.json...${NC}"

    # Create a backup
    cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak"

    # Check if statusLine is OPC HUD
    STATUSLINE=$(jq -r '.statusLine.command // empty' "$SETTINGS_FILE" 2>/dev/null)
    if [[ "$STATUSLINE" == *"opc-hud.mjs"* ]]; then
        TEMP_SETTINGS=$(mktemp)
        jq 'del(.statusLine)' "$SETTINGS_FILE" > "$TEMP_SETTINGS" 2>/dev/null

        if [ $? -eq 0 ] && [ -s "$TEMP_SETTINGS" ]; then
            mv "$TEMP_SETTINGS" "$SETTINGS_FILE"
            echo -e "${GREEN}✓ Removed statusLine from settings.json${NC}"
            echo -e "${YELLOW}  Backup saved to: $SETTINGS_FILE.bak${NC}"
        else
            rm -f "$TEMP_SETTINGS"
            echo -e "${YELLOW}⚠ Could not modify settings.json automatically${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ statusLine is not OPC HUD, skipping${NC}"
        rm -f "$SETTINGS_FILE.bak"
    fi
fi

# Update enabledPlugins in settings.json
if [ -f "$SETTINGS_FILE" ] && command -v jq &> /dev/null; then
    echo -e "${BLUE}Updating enabledPlugins in settings.json...${NC}"

    TEMP_SETTINGS=$(mktemp)
    jq '.enabledPlugins |= with_entries(select(.key | contains("@opc-marketplace") | not))' "$SETTINGS_FILE" > "$TEMP_SETTINGS" 2>/dev/null

    if [ $? -eq 0 ] && [ -s "$TEMP_SETTINGS" ]; then
        mv "$TEMP_SETTINGS" "$SETTINGS_FILE"
        echo -e "${GREEN}✓ Removed OPC from enabledPlugins${NC}"
    else
        rm -f "$TEMP_SETTINGS"
    fi
fi

echo ""
echo -e "${GREEN}Uninstallation complete!${NC}"
echo ""
echo -e "${YELLOW}Items removed:${NC}"
echo "  - OPC plugins cache"
echo "  - HUD script"
echo "  - statusLine configuration"
echo ""
echo -e "${YELLOW}Next step:${NC}"
echo "  Run: /plugin remove opc-marketplace"
echo ""
echo -e "${YELLOW}Backup saved to:${NC}"
echo "  $SETTINGS_FILE.bak"
