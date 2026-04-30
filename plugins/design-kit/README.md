# design-kit

Design stage plugin — Brand design, Web design, Mobile design, and Design review for the one-person company.

## Version 2.0.0

Restructured to 4 core Agents + 6 Reference documents.

## Agents

| Agent | Description | When to Use |
|-------|-------------|-------------|
| **brand-agent** | Brand design — strategy, visual identity, logo, guidelines | New product branding |
| **web-agent** | Web design — responsive, dashboards, landing pages | Web platform design |
| **mobile-agent** | Mobile design — iOS, Android, React Native, Flutter | Mobile app design |
| **design-reviewer** | Design review — consistency, accessibility, brand compliance | Post-design validation |

## Skills

| Skill | Description |
|-------|-------------|
| `/ui-design` | UI/UX design specification |
| `/ui-ux-pro-max` | Design system generator — 50+ styles, 97 color palettes, 57 font pairings |
| `/baoyu-imagine` | AI image generation (OpenAI, Azure, Google, DashScope, Replicate, etc.) |

## References (Design Guides)

| Reference | Description |
|-----------|-------------|
| `ux-design-guide.md` | UX principles, user flows, wireframing, usability heuristics |
| `ui-design-guide.md` | UI principles, design tokens, color system, typography |
| `design-system-guide.md` | Design system architecture, token taxonomy, component library |
| `ux-research-guide.md` | User research methods, usability testing, interviews, journey mapping |
| `brand-design-guide.md` | Brand design process, visual identity, brand guidelines |
| `design-review-checklist.md` | Design review checklist, accessibility, brand compliance |

## Workflows

### New Product (Full Design)
```
brand-agent → web-agent / mobile-agent → design-reviewer → dev-kit
    │              │              │
  Brand        Platform       Review
```

### Web Only
```
web-agent → design-reviewer → dev-kit
```

### Mobile Only
```
mobile-agent → design-reviewer → dev-kit
```

### Multi-Platform (Parallel)
```
brand-agent → web-agent + mobile-agent (parallel) → design-reviewer → dev-kit
```

## Quick Start

### Brand Design
```shell
# Invoke brand-agent
Agent(subagent_type="design-kit:brand-agent", prompt="Design brand for SaaS product")
```

### Web Design
```shell
# Invoke web-agent
Agent(subagent_type="design-kit:web-agent", prompt="Design dashboard page")

# Or use skill
/ui-ux-pro-max
python3 scripts/search.py "SaaS dashboard elegant" --design-system -p "MyProject"
```

### Mobile Design
```shell
# Invoke mobile-agent
Agent(subagent_type="design-kit:mobile-agent", prompt="Design iOS profile page")
```

### Design Review
```shell
# Invoke design-reviewer
Agent(subagent_type="design-kit:design-reviewer", prompt="Review landing page design")
```

## Agent Coordination

### Integration with opc-founder

opc-founder can dispatch design-kit agents:

```
opc-founder
    │
    ├── Brand stage → brand-agent
    │
    ├── Web design → web-agent
    │
    ├── Mobile design → mobile-agent
    │
    └── Design validation → design-reviewer
```

### Example Workflow

**New product full flow**:
```
1. brand-agent: "Design brand for [product]"
2. web-agent: "Design Web platform, reference brand guidelines"
3. design-reviewer: "Review design for brand compliance and accessibility"
4. dev-kit: "Implement design"
```

## Routing Rules

| Keywords | Route to |
|----------|----------|
| brand, logo, VI | brand-agent |
| web, website, dashboard, landing | web-agent |
| mobile, app, iOS, Android, SwiftUI, Flutter | mobile-agent |
| review, audit, validate | design-reviewer |

## Design System Structure

```
design-system/
├── tokens/
│   ├── colors.json
│   ├── typography.json
│   ├── spacing.json
│   └── shadows.json
├── components/
│   ├── button.json
│   ├── input.json
│   └── card.json
└── themes/
    ├── light.json
    └── dark.json
```

## File Structure

```
plugins/design-kit/
├── plugin.json
├── README.md
├── README_CN.md
├── agents/
│   ├── brand-agent.md
│   ├── web-agent.md
│   ├── mobile-agent.md
│   └── design-reviewer.md
├── references/
│   ├── ux-design-guide.md
│   ├── ui-design-guide.md
│   ├── design-system-guide.md
│   ├── ux-research-guide.md
│   ├── brand-design-guide.md
│   └── design-review-checklist.md
└── skills/
    ├── ui-design/
    ├── ui-ux-pro-max/
    └── baoyu-imagine/
```

## Changelog

### v2.0.0
- Restructured to 4 core Agents: brand-agent, web-agent, mobile-agent, design-reviewer
- Converted 5 original agents to reference documents
- Added brand-design-guide.md and design-review-checklist.md
- Defined clear workflows and coordination patterns
- Support for opc-founder dispatch integration

### v1.x
- ui-agent, ux-agent, ui-ux-designer, design-system-architect, ux-researcher
- ui-design, ui-ux-pro-max, baoyu-imagine skills