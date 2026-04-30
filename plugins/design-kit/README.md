# design-kit

Design stage plugin — UX design, UI design, design systems, and user research for the one-person company.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/ui-design` | UI/UX design specification |
| `/ui-ux-pro-max` | Design system generator with 50+ styles, 97 color palettes, 57 font pairings |
| `/baoyu-imagine` | AI image generation (OpenAI, Azure, Google, OpenRouter, DashScope, Replicate) |

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| ux-agent | sonnet | Information architecture, user flows, wireframes, interaction logic |
| ui-agent | sonnet | Visual design, design systems, component specs, design tokens |
| ui-ux-designer | sonnet | Full-stack UI/UX designer reference |
| design-system-architect | inherit | Design system architecture, token systems, component libraries |
| ux-researcher | inherit | User research, interviews, usability testing, persona development |

## Quick Start

### UI Design

```shell
/ui-design <component or feature>
```

Generates:
- Component structure
- Visual hierarchy
- Interaction patterns
- Responsive behavior

### UI-UX-Pro-Max

```shell
/ui-ux-pro-max
```

Generates complete design system:
- 50+ visual styles
- 97 color palettes
- 57 font pairings
- Design tokens
- Component specifications

### AI Image Generation

```shell
/baoyu-imagine <prompt>
```

AI image generation with multiple backends:
- OpenAI GPT Image
- Azure OpenAI
- Google (Gemini)
- OpenRouter
- DashScope (阿里云)
- Z.AI GLM-Image
- MiniMax
- Jimeng (即梦)
- Seedream
- Replicate

Options:
- `--aspect <ratio>` — Aspect ratio (1:1, 16:9, 9:16, etc.)
- `--ref <files>` — Reference images for style guidance
- `--batch` — Batch parallel generation

## Agent Usage

### ux-agent

Use for:
- Information architecture
- User flow diagrams
- Wireframe creation
- Interaction design
- Navigation structure

**Delivers to:** ui-agent (visual specs), frontend-agent (interaction logic)

### ui-agent

Use for:
- Visual design
- Component specifications
- Design tokens
- Style guides
- Responsive layouts

**Delivers to:** frontend-agent (implementation specs)

### design-system-architect

Use for:
- Design token architecture
- Component library structure
- Theming system
- Multi-brand support

### ux-researcher

Use for:
- User interviews
- Usability testing
- Persona development
- Journey mapping
- A/B test design

## Workflow Integration

```
product-kit (requirements) → design-kit (design) → dev-kit (implementation)
```

### Design Handoff

```
ux-agent → ui-agent → frontend-agent
    │          │           │
    │          │           └── Implement components
    │          └── Visual specs, tokens
    └── User flows, wireframes
```

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
