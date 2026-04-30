---
name: install
description: Install OPC plugins from marketplace. Supports full install, selective install by stage, or custom selection. Use when user wants to setup or add plugins.
---

# OPC Plugin Installer

Install plugins from opc-marketplace with one command.

## Usage

```shell
/install [option]
```

## Options

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
| `content` | Install for content/marketing (product + growth + docs) |
| `designer` | Install for product & design focus (product + design + docs) |
| `minimal` | Install minimal set (product + dev) |

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

### By Stage

**Product + Design (Early Stage):**
```bash
/plugin install product-kit@opc-marketplace && \
/plugin install design-kit@opc-marketplace
```

**Dev + QA (Implementation):**
```bash
/plugin install dev-kit@opc-marketplace && \
/plugin install qa-kit@opc-marketplace
```

**Ship + Growth (Launch):**
```bash
/plugin install ship-kit@opc-marketplace && \
/plugin install growth-kit@opc-marketplace
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

## Interactive Mode

When called without arguments, present options:

```
/install

🚀 OPC Plugin Installer

What would you like to install?

1. All plugins (7 plugins, 28 agents, 52 skills)
2. Web product (product + design + dev + qa + ship + growth)
3. Mobile app (product + design + dev + qa + ship)
4. Product & Design focus (product + design + docs)
5. Content/Marketing (product + growth + docs)
6. Minimal (product + dev)
7. Custom selection...

Enter your choice [1-7]:
```

## Verify Installation

After installation:
```bash
/plugin list
```

Should show installed plugins with their agents and skills.

## Troubleshooting

**Marketplace not found:**
```bash
/plugin marketplace add CaffeineOddity/opc-marketplace
```

**Plugin already installed:**
```bash
/plugin update product-kit@opc-marketplace
```

**Update all:**
```bash
/plugin marketplace update opc-marketplace
```
