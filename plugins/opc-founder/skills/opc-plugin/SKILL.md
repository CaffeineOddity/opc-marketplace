---
name: opc-plugin
invoke-name: opc-founder:opc-plugin
description: Manage OPC plugins — install, update, or list. Use when user wants to setup, add, or update plugins.
---

# OPC Plugin Manager

Install, update, and manage plugins from opc-marketplace.

## Usage

```shell
/opc-plugin [command] [option]
```

## Commands

| Command | Description |
|---------|-------------|
| `install [option]` | Install plugins |
| `update` | Update marketplace and all installed plugins |
| `update <plugin>` | Update specific plugin |
| `uninstall` | Uninstall all OPC plugins |
| `uninstall <plugin>` | Uninstall specific plugin |
| `list` | List installed plugins |
| `status` | Show marketplace and plugin status |

## Install Options

| Option | Description |
|--------|-------------|
| (no option) | Interactive selection |
| `all` | Install all 7 plugins |
| `product` | Install product-kit only |
| `design` | Install design-kit only |
| `dev` | Install dev-kit only |
| `qa` | Install qa-kit only |
| `ship` | Install ship-kit only |
| `growth` | Install growth-kit only |
| `docs` | Install docs-kit only |
| `web` | Install for web product (product + design + dev + qa + ship + growth) |
| `mobile` | Install for mobile app (product + design + dev + qa + ship) |
| `designer` | Install for product & design focus (product + design + docs) |
| `content` | Install for content/marketing (product + growth + docs) |
| `minimal` | Install minimal set (product + dev) |

## Implementation

When this skill is invoked, execute the appropriate action based on arguments:

### Step 1: Parse Arguments

- If no arguments: Show interactive menu
- If `install all`: Install all 7 plugins
- If `install <option>`: Install the specified plugin set
- If `update`: Update all installed plugins
- If `update <plugin>`: Update specific plugin
- If `uninstall`: Uninstall all OPC plugins
- If `uninstall <plugin>`: Uninstall specific plugin
- If `list` or `status`: Show plugin status

### Step 2: Define Plugin Sets

```javascript
const PLUGIN_SETS = {
  all: ['product-kit', 'design-kit', 'dev-kit', 'qa-kit', 'ship-kit', 'growth-kit', 'docs-kit'],
  web: ['product-kit', 'design-kit', 'dev-kit', 'qa-kit', 'ship-kit', 'growth-kit'],
  mobile: ['product-kit', 'design-kit', 'dev-kit', 'qa-kit', 'ship-kit'],
  designer: ['product-kit', 'design-kit', 'docs-kit'],
  content: ['product-kit', 'growth-kit', 'docs-kit'],
  minimal: ['product-kit', 'dev-kit'],
  product: ['product-kit'],
  design: ['design-kit'],
  dev: ['dev-kit'],
  qa: ['qa-kit'],
  ship: ['ship-kit'],
  growth: ['growth-kit'],
  docs: ['docs-kit']
};
```

### Step 3: Installation Logic

For each plugin to install:

1. **Check if marketplace exists**: Verify `opc-marketplace` is in known marketplaces
2. **Get plugin version**: Read version from source plugin.json
3. **Create cache directory**: `~/.claude/plugins/cache/opc-marketplace/{plugin}/{version}/`
4. **Copy/symlink plugin files**: Copy `.claude-plugin/`, `agents/`, `skills/`, and optionally `hooks/`
5. **Update installed_plugins.json**: Add entry for the plugin
6. **Update settings.json**: Enable the plugin in `enabledPlugins`
7. **Run first-install setup**: Execute Python script for one-time setup

### Step 3.5: First Install Setup

After installing opc-founder plugin, run the first-install setup script:

```bash
python {marketplace_path}/scripts/first-install-setup.py {project_root}
```

This script runs **once** and performs:

1. **Copy built-in workflows**: `plugins/opc-founder/workflows/built-in/*.json` → `.opc/workflows/`
2. **Update .gitignore**: Add `.opc/state/` entry (if not exists)
3. **Create marker file**: `.opc/.first-install-done` to prevent re-run

**Marker file structure:**
```json
{
  "version": "1.0.0",
  "installed_at": "2026-05-02T10:30:00",
  "workflows_copied": 7
}
```

On subsequent installs, the script checks for this marker and skips if it exists.

### Step 3.6: Install OPC HUD

### Step 4: File Paths

- Marketplace path: `/Users/zhuangchubin/learn/opc-marketplace`
- Plugins source: `/Users/zhuangchubin/learn/opc-marketplace/plugins/{plugin-name}/`
- Cache path: `~/.claude/plugins/cache/opc-marketplace/{plugin-name}/{version}/`
- Installed plugins: `~/.claude/plugins/installed_plugins.json`
- Settings: `~/.claude/settings.json`

### Step 5: Execution

When user runs `/opc-plugin install all`:

1. Read all plugin versions from their plugin.json files
2. For each plugin in PLUGIN_SETS.all:
   - Create versioned cache directory
   - Copy plugin files (or create symlinks)
   - Update installed_plugins.json
3. Update settings.json to enable all plugins
4. Show summary and remind user to run `/reload-plugins`

## Available Plugins

| Plugin | Agents | Skills | Description |
|--------|--------|--------|-------------|
| product-kit | 3 | 4 | Research, requirements, brainstorm |
| design-kit | 4 | 3 | Brand, web, mobile, design review |
| dev-kit | 10 | 10 | Frontend, backend, security |
| qa-kit | 2 | 7 | Testing, accessibility |
| ship-kit | 3 | 7 | Deploy, CI/CD, infrastructure |
| growth-kit | 5 | 12 | Marketing, SEO, analytics |
| docs-kit | 1 | 9 | Documents, presentations |

## Interactive Mode

When called without arguments, use AskUserQuestion to present options:

1. Install plugins
2. Update all plugins
3. Uninstall plugins
4. List installed plugins
5. Show status

## Uninstall Logic

When user runs `/opc-plugin uninstall`:

### Remove Plugin Cache

For each installed OPC plugin:
1. Remove cache directory: `~/.claude/plugins/cache/opc-marketplace/{plugin}/`
2. Update `installed_plugins.json`: Remove the plugin entry
3. Update `settings.json`: Disable in `enabledPlugins`

### Verify Cleanup

After uninstall:
1. Verify no OPC plugins remain in `installed_plugins.json`
2. Verify no OPC entries in `enabledPlugins`
3. Show summary of what was removed

**Note:** `/opc-plugin uninstall` only removes plugins. To also remove HUD, run `/opc-hud uninstall` or use the `uninstall.sh` script.

## Troubleshooting

- If marketplace not found: Add it first via settings.json extraKnownMarketplaces
- If plugin already installed: Skip or update depending on context
- If version mismatch: Read actual version from source plugin.json

## Full Uninstall (Manual)

To completely remove OPC Marketplace (plugins + HUD):

```bash
# Run the uninstall script (removes plugins + HUD)
~/YYInc/Me/opc-marketplace/scripts/uninstall.sh

# Then remove the marketplace via Claude Code
/plugin remove opc-marketplace
```

Or use skill commands separately:
```
/opc-plugin uninstall    # Remove plugins only
/opc-hud uninstall       # Remove HUD only
```

**Note:** Claude Code does not automatically trigger cleanup hooks when removing a marketplace. You must run the uninstall script or skill commands first.
