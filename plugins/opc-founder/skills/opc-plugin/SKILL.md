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
| `init` | Initialize project: configure .gitignore, copy workflows, install HUD |
| `init --force` | Force re-run initialization even if already done |
| `init --dry-run` | Show what would happen without making changes |
| `install [option]` | Install plugins |
| `install hud` | Install HUD statusline only |
| `update` | Update marketplace and all installed plugins |
| `update <plugin>` | Update specific plugin |
| `uninstall` | Uninstall all OPC plugins (interactive) |
| `uninstall --all` | Uninstall all OPC plugins without prompt |
| `uninstall <plugin>` | Uninstall specific plugin |
| `uninstall marketplace` | **Full uninstall**: plugins + HUD + marketplace |
| `uninstall hud` | Uninstall HUD statusline only |
| `list` | List installed plugins |
| `status` | Show marketplace and plugin status |
| `hud status` | Show HUD statusline status |

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
- If `init`: Initialize project configuration
- If `init --force`: Force re-run initialization
- If `init --dry-run`: Show what would happen without making changes
- If `install all`: Install all 7 plugins
- If `install <option>`: Install the specified plugin set
- If `install hud`: Install HUD statusline only
- If `update`: Update all installed plugins
- If `update <plugin>`: Update specific plugin
- If `uninstall`: Uninstall all OPC plugins (interactive)
- If `uninstall --all`: Uninstall all without prompt
- If `uninstall <plugin>`: Uninstall specific plugin
- If `uninstall marketplace`: Full uninstall (plugins + HUD + marketplace)
- If `uninstall hud`: Uninstall HUD statusline only
- If `list` or `status`: Show plugin status
- If `hud status`: Show HUD statusline status

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

### Step 3.5: Project Init

After installing opc-founder plugin, run the project init script:

```bash
python3 {marketplace_root}/plugins/opc-founder/skills/opc-plugin/scripts/init.py
```

Where `{marketplace_root}` is the opc-marketplace source directory.

This script performs:

1. **Configure .gitignore**: Add `.opc/state/` entry (if not exists)
2. **Copy built-in workflows**: `build-in/workflows/*.json` → `{git-toplevel}/.opc/workflows/`
3. **Create marker file**: `{git-toplevel}/.opc/.project-init` to prevent re-run

**Note:** HUD statusline is installed separately via `install.py` or `/opc-plugin install hud`.

**Marker file structure:**
```json
{
  "version": "1.0.0",
  "initialized_at": "2026-05-06T10:30:00",
  "workflows_count": 8,
  "force_mode": false
}
```

On subsequent runs, the script checks for this marker and skips if it exists. Use `--force` to re-run.

**Options:**
- `--force`: Force re-run even if already initialized
- `--dry-run`: Show what would happen without making changes

### Step 4: File Paths

- Marketplace path: `{marketplace-root}` (detected from `~/.claude/plugins/marketplaces/opc-marketplace/`)
- Plugins source: `{marketplace-root}/plugins/{plugin-name}/`
- Cache path: `~/.claude/plugins/cache/opc-marketplace/{plugin-name}/{version}/`
- Installed plugins: `~/.claude/plugins/installed_plugins.json`
- Settings: `~/.claude/settings.json`

### Step 5: Execution

When user runs `/opc-plugin install <option>`:

```bash
python3 {marketplace_root}/plugins/opc-founder/skills/opc-plugin/scripts/install.py <option>
```

Where `{marketplace_root}` is the opc-marketplace source directory (detected from `~/.claude/plugins/marketplaces/opc-marketplace/` or the current project if it is opc-marketplace itself).

The script handles:
1. Finding marketplace path from `~/.claude/plugins/marketplaces/opc-marketplace/`
2. Reading plugin versions from plugin.json
3. Creating cache directories and copying files
4. Updating `installed_plugins.json` and `settings.json`
5. Running first-install setup for workflows and HUD

After installation, remind user to run `/reload-plugins`.

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

```bash
python3 {marketplace_root}/plugins/opc-founder/skills/opc-plugin/scripts/uninstall.py [--all]
```

### Remove Plugin Cache

For each installed OPC plugin:
1. Remove cache directory: `~/.claude/plugins/cache/opc-marketplace/{plugin}/`
2. Update `installed_plugins.json`: Remove the plugin entry
3. Update `settings.json`: Disable in `enabledPlugins`

### Remove HUD

1. Remove HUD script from both locations:
   - `~/.claude/plugins/cache/opc-marketplace/hud/`
   - `~/.claude/plugins/marketplaces/opc-marketplace/.claude/hud/`
2. Remove `statusLine` from `settings.json`

### Verify Cleanup

After uninstall:
1. Verify no OPC plugins remain in `installed_plugins.json`
2. Verify no OPC entries in `enabledPlugins`
3. Verify HUD script removed
4. Show summary of what was removed

## Full Uninstall (marketplace)

When user runs `/opc-plugin uninstall marketplace`:

```bash
python3 {marketplace_root}/plugins/opc-founder/skills/opc-plugin/scripts/uninstall.py marketplace
```

Where `{marketplace_root}` is detected from:
1. `~/.claude/plugins/marketplaces/opc-marketplace/` (if marketplace is registered)
2. The current project directory if it contains `plugins/opc-founder/`

This performs a **complete removal** in one command:

1. **Remove cache directory**: `~/.claude/plugins/cache/opc-marketplace/`
2. **Update installed_plugins.json**: Remove all OPC plugin entries
3. **Update settings.json**:
   - Remove all `enabledPlugins` entries for OPC
   - Remove `statusLine` if it's OPC HUD
   - Remove `opc-marketplace` from `extraKnownMarketplaces`
4. **Remove marketplace directory**: `~/.claude/plugins/marketplaces/opc-marketplace/`

After completion, remind user to run `/reload-plugins` to refresh the plugin system.

## Troubleshooting

- If marketplace not found: Add it first via settings.json extraKnownMarketplaces
- If plugin already installed: Skip or update depending on context
- If version mismatch: Read actual version from source plugin.json

## Quick Reference

| Scenario | Command |
|----------|---------|
| Initialize project | `/opc-plugin init` |
| Force re-init | `/opc-plugin init --force` |
| Dry-run init | `/opc-plugin init --dry-run` |
| Install all plugins | `/opc-plugin install all` |
| Install web preset | `/opc-plugin install web` |
| Install HUD only | `/opc-plugin install hud` |
| Uninstall plugins only | `/opc-plugin uninstall --all` |
| Uninstall HUD only | `/opc-plugin uninstall hud` |
| **Complete removal** | `/opc-plugin uninstall marketplace` |
| Check HUD status | `/opc-plugin hud status` |

## HUD Management

OPC provides a HUD (Heads-Up Display) statusline that shows useful information:

```
[OPC#1.0] | Opus | session:5m | skill:opc-plugin | ctx:45% | 🔧3 ⚡1 🎯2
```

### Install HUD

When user runs `/opc-plugin install hud`:

```bash
python3 {marketplace_root}/plugins/opc-founder/skills/opc-plugin/scripts/hud.py install
```

This installs the HUD statusline without installing any plugins.

### Uninstall HUD

When user runs `/opc-plugin uninstall hud`:

```bash
python3 {marketplace_root}/plugins/opc-founder/skills/opc-plugin/scripts/hud.py uninstall
```

This removes the HUD statusline while keeping all plugins intact.

### Check HUD Status

When user runs `/opc-plugin hud status`:

```bash
python3 {marketplace_root}/plugins/opc-founder/skills/opc-plugin/scripts/hud.py status
```

This shows whether HUD is configured and the current statusline command.
