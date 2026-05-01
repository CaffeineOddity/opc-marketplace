---
name: opc-hud
description: Configure OPC HUD statusline display (setup, uninstall, status)
level: 2
---

# OPC HUD Skill

Configure the OPC HUD (Heads-Up Display) for the statusline.

## Quick Commands

| Command | Description |
|---------|-------------|
| `/opc-founder:opc-hud` | Show current HUD status |
| `/opc-founder:opc-hud setup` | Install/repair HUD statusline |
| `/opc-founder:opc-hud uninstall` | Remove HUD statusline |
| `/opc-founder:opc-hud status` | Show detailed HUD status |

## What the HUD Shows

```
[OPC#1.0] | Opus | session:5m | skill:opc-plugin | ctx:45% | 🔧3 ⚡1 🎯2
```

| Element | Description |
|---------|-------------|
| `[OPC#version]` | OPC marketplace identifier |
| `Opus/Sonnet/Haiku` | Current model name (cyan) |
| `session:Xm` | Session duration in minutes |
| `skill:name` | Last activated skill (cyan) |
| `ctx:X%` | Context window usage (green/yellow/red) |
| `🔧N` | Tool call count |
| `⚡N` | Agent call count |
| `🎯N` | Skill call count |

## Color Coding

- **Green**: Normal/healthy (context < 70%)
- **Yellow**: Warning (context 70-85%)
- **Red**: Critical (context > 85%)

## Setup (Install HUD)

When the user runs `/opc-founder:opc-hud setup`:

### Step 1: Check if HUD script exists in marketplace

```bash
ls -la ~/.claude/plugins/marketplaces/opc-marketplace/.claude/hud/opc-hud.mjs
```

Or if developing locally:
```bash
ls -la ~/YYInc/Me/opc-marketplace/.claude/hud/opc-hud.mjs
```

### Step 2: Create HUD directory in cache

```bash
mkdir -p ~/.claude/plugins/cache/opc-marketplace/hud
```

**Why cache directory?** Placing HUD under `~/.claude/plugins/cache/opc-marketplace/` ensures it gets automatically cleaned up when running `/plugin remove opc-marketplace`.

### Step 3: Copy HUD script to cache location

```bash
# From marketplace
cp ~/.claude/plugins/marketplaces/opc-marketplace/.claude/hud/opc-hud.mjs ~/.claude/plugins/cache/opc-marketplace/hud/

# Or from local development
cp ~/YYInc/Me/opc-marketplace/.claude/hud/opc-hud.mjs ~/.claude/plugins/cache/opc-marketplace/hud/
```

### Step 4: Make it executable (Unix only)

```bash
chmod +x ~/.claude/plugins/cache/opc-marketplace/hud/opc-hud.mjs
```

### Step 5: Update settings.json

Read `~/.claude/settings.json`, then update/add the `statusLine` field:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node $HOME/.claude/plugins/cache/opc-marketplace/hud/opc-hud.mjs"
  }
}
```

**IMPORTANT:**
- Use `$HOME` on Unix for portability
- Use forward slashes on all platforms
- If user already has a statusLine configured, ask before overwriting

### Step 6: Verify installation

```bash
echo '{"context_window":{"used_percentage":45},"model":{"display_name":"Claude Opus 4.6"}}' | node ~/.claude/plugins/cache/opc-marketplace/hud/opc-hud.mjs
```

Expected output:
```
[OPC#1.0] | Opus | ctx:45%
```

### Step 7: Tell user to restart Claude Code

**Restart Claude Code for changes to take effect.**

## Uninstall (Remove HUD)

When the user runs `/opc-founder:opc-hud uninstall`:

### Step 1: Remove HUD script

```bash
rm -f ~/.claude/plugins/cache/opc-marketplace/hud/opc-hud.mjs
```

### Step 2: Remove HUD directory if empty

```bash
rmdir ~/.claude/plugins/cache/opc-marketplace/hud 2>/dev/null || true
```

### Step 3: Clear statusLine from settings.json

Read `~/.claude/settings.json`, then remove the `statusLine` field:

```json
{
  "statusLine": null
}
```

Or delete the field entirely using jq:
```bash
jq 'del(.statusLine)' ~/.claude/settings.json > /tmp/settings.json && mv /tmp/settings.json ~/.claude/settings.json
```

### Step 4: Confirm removal

Tell user: **HUD uninstalled. Restart Claude Code for changes to take effect.**

## Status Check

When the user runs `/opc-founder:opc-hud status` or `/opc-founder:opc-hud` with no arguments:

### Check 1: HUD script exists

```bash
ls -la ~/.claude/plugins/cache/opc-marketplace/hud/opc-hud.mjs
```

### Check 2: statusLine configured

```bash
jq '.statusLine' ~/.claude/settings.json
```

### Check 3: Test HUD output

```bash
echo '{"context_window":{"used_percentage":45},"model":{"display_name":"Claude Opus 4.6"}}' | node ~/.claude/plugins/cache/opc-marketplace/hud/opc-hud.mjs
```

### Report status to user

```
OPC HUD Status:
  Script: ✓ installed / ✗ missing
  Config: ✓ configured / ✗ not configured
  Output: [actual HUD output]
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| HUD not showing | Run `/opc-founder:opc-hud setup` |
| Script missing | Reinstall with `/opc-founder:opc-hud setup` |
| Wrong statusLine | Check settings.json, may conflict with other HUD |
| Permission denied | Run `chmod +x ~/.claude/plugins/cache/opc-marketplace/hud/opc-hud.mjs` |

## Manual Testing

Test the HUD with sample input:
```bash
echo '{"context_window":{"used_percentage":45},"model":{"display_name":"Claude Opus 4.6"}}' | node ~/.claude/plugins/cache/opc-marketplace/hud/opc-hud.mjs
```

---

*The HUD updates automatically on each prompt via Claude Code's statusline integration.*
