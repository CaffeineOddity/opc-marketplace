---
name: plugin
description: Manage OPC plugins — install, update, or list. Use when user wants to setup, add, or update plugins.
---

# OPC Plugin Manager

Install, update, and manage plugins from opc-marketplace.

## Usage

```shell
/plugin [command] [option]
```

## Commands

| Command | Description |
|---------|-------------|
| `install [option]` | Install plugins |
| `update` | Update marketplace and all installed plugins |
| `update <plugin>` | Update specific plugin |
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

## Examples

### Install

```shell
/plugin install              # Interactive selection
/plugin install all          # Install all 7 plugins
/plugin install web          # Web product
/plugin install designer     # Product & design focus
```

### Update

```shell
/plugin update               # Update marketplace + all plugins
/plugin update design-kit    # Update specific plugin
```

### Status

```shell
/plugin list                 # List installed plugins
/plugin status               # Show detailed status
```

## Available Plugins

| Plugin | Agents | Skills | Description |
|--------|--------|--------|-------------|
| product-kit | 3 | 4 | Research, requirements, brainstorm |
| design-kit | 4 | 3 | Brand, web, mobile design |
| dev-kit | 10 | 10 | Frontend, backend, security |
| qa-kit | 2 | 7 | Testing, accessibility |
| ship-kit | 3 | 7 | Deploy, CI/CD, infrastructure |
| growth-kit | 5 | 12 | Marketing, SEO, analytics |
| docs-kit | 1 | 9 | Documents, presentations |

## Installation Commands

### Full Install (All Plugins)
```bash
/plugin marketplace add CaffeineOddity/opc-marketplace

/plugin install product-kit@opc-marketplace && \
/plugin install design-kit@opc-marketplace && \
/plugin install dev-kit@opc-marketplace && \
/plugin install qa-kit@opc-marketplace && \
/plugin install ship-kit@opc-marketplace && \
/plugin install growth-kit@opc-marketplace && \
/plugin install docs-kit@opc-marketplace
```

### By Use Case

**Web Product:**
```bash
/plugin install product-kit@opc-marketplace && \
/plugin install design-kit@opc-marketplace && \
/plugin install dev-kit@opc-marketplace && \
/plugin install qa-kit@opc-marketplace && \
/plugin install ship-kit@opc-marketplace && \
/plugin install growth-kit@opc-marketplace
```

**Mobile App:**
```bash
/plugin install product-kit@opc-marketplace && \
/plugin install design-kit@opc-marketplace && \
/plugin install dev-kit@opc-marketplace && \
/plugin install qa-kit@opc-marketplace && \
/plugin install ship-kit@opc-marketplace
```

**Product & Design Focus:**
```bash
/plugin install product-kit@opc-marketplace && \
/plugin install design-kit@opc-marketplace && \
/plugin install docs-kit@opc-marketplace
```

**Content/Marketing:**
```bash
/plugin install product-kit@opc-marketplace && \
/plugin install growth-kit@opc-marketplace && \
/plugin install docs-kit@opc-marketplace
```

**Minimal:**
```bash
/plugin install product-kit@opc-marketplace && \
/plugin install dev-kit@opc-marketplace
```

## Update Commands

### Update All
```bash
/plugin marketplace update opc-marketplace

# Then update each installed plugin
/plugin update product-kit@opc-marketplace
/plugin update design-kit@opc-marketplace
# ... etc
```

### Update Specific Plugin
```bash
/plugin update design-kit@opc-marketplace
```

## Interactive Mode

When called without arguments, present options:

```
/plugin

🚀 OPC Plugin Manager

What would you like to do?

1. Install plugins
2. Update all plugins
3. List installed plugins
4. Show status

Enter your choice [1-4]:
```

## Troubleshooting

**Marketplace not found:**
```bash
/plugin marketplace add CaffeineOddity/opc-marketplace
```

**Plugin already installed:**
```bash
/plugin update <plugin-name>@opc-marketplace
```

**Reinstall plugin:**
```bash
/plugin uninstall <plugin-name>
/plugin install <plugin-name>@opc-marketplace
```
