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

### Step 1: Run the install script

```bash
bash ~/.claude/plugins/marketplaces/opc-marketplace/plugins/opc-founder/skills/opc-hud/install.sh
```

**The script handles all installation steps automatically.**

### Step 2: Restart Claude Code

Tell user: **Restart Claude Code for changes to take effect.**

## Uninstall (Remove HUD)

When the user runs `/opc-founder:opc-hud uninstall`:

### Step 1: Run the uninstall script

```bash
bash ~/.claude/plugins/marketplaces/opc-marketplace/plugins/opc-founder/skills/opc-hud/uninstall.sh
```

**The script handles all uninstallation steps automatically.**

### Step 2: Restart Claude Code

Tell user: **Restart Claude Code for changes to take effect.**

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
