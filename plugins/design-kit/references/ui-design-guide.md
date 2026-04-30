# UI Design Guide

> This guide is derived from the original ui-agent specification. Use it as a reference for UI design principles and visual specifications.

## Core UI Principles

### Design System
- Create and maintain design tokens (colors, typography, spacing, radii, shadows)
- Define component patterns and variants
- Ensure visual consistency across all features
- Document design system usage guidelines

### Component Specification
- Detailed component anatomy (slots, variants, states)
- Visual interaction behaviors (hover, focus, active, disabled)
- Responsive behavior and breakpoint strategies
- Animation and transition specifications

### Visual Design
- Color palette (primary, secondary, semantic, neutral)
- Typography scale (sizes, weights, line heights, letter spacing)
- Icon system and illustration style
- Spacing and layout grid system

### Accessibility in Visual Design
- Color contrast validation (WCAG AA/AAA)
- Focus indicator specifications
- Touch target sizing (minimum 44x44px)
- Screen reader considerations in visual design

## Design Token Structure

```
design-tokens/
├── colors/
│   ├── primitive.json    # Raw color values
│   ├── semantic.json     # Purpose-based aliases
│   └── component.json    # Component-specific tokens
├── typography/
│   ├── families.json     # Font families
│   ├── sizes.json        # Size scale
│   └── weights.json      # Weight scale
├── spacing/
│   └── scale.json        # Spacing scale (4px base)
├── borders/
│   ├── radius.json       # Border radius
│   └── width.json        # Border widths
└── effects/
│   ├── shadows.json      # Shadow scale
│   └── transitions.json  # Animation timings
```

## Color System

### Palette Categories
| Category | Purpose |
|----------|---------|
| **Primary** | Brand color, main actions |
| **Secondary** | Supporting actions, accents |
| **Semantic** | Success, warning, error, info |
| **Neutral** | Text, backgrounds, borders |
| **Surface** | Cards, modals, overlays |

### Contrast Requirements (WCAG)
| Text Type | Minimum Ratio |
|-----------|---------------|
| Normal text (< 18px) | 4.5:1 |
| Large text (≥ 18px or 14px bold) | 3:1 |
| UI components | 3:1 |
| Graphical objects | 3:1 |

## Typography System

### Type Scale
| Name | Size | Weight | Use Case |
|------|------|--------|----------|
| Display | 48-72px | Bold | Hero headlines |
| H1 | 32-40px | Bold | Page titles |
| H2 | 24-28px | Semibold | Section headers |
| H3 | 20-22px | Semibold | Sub-sections |
| H4 | 18px | Medium | Card headers |
| Body | 16px | Regular | Main content |
| Small | 14px | Regular | Secondary text |
| Caption | 12px | Regular | Labels, hints |

### Line Height Guidelines
| Type | Line Height |
|------|-------------|
| Headings | 1.2-1.3 |
| Body text | 1.5-1.75 |
| Dense text | 1.4 |
| Captions | 1.4 |

## Spacing System

### 4px Base Scale
| Token | Value | Use Case |
|--------|-------|----------|
| space-1 | 4px | Tight spacing |
| space-2 | 8px | Small gaps |
| space-3 | 12px | Related elements |
| space-4 | 16px | Standard padding |
| space-5 | 20px | Section gaps |
| space-6 | 24px | Component padding |
| space-8 | 32px | Large gaps |
| space-10 | 40px | Section margins |
| space-12 | 48px | Page sections |
| space-16 | 64px | Major sections |

## Component States

Every interactive component needs:
- Default state
- Hover state (web)
- Focus state
- Active/pressed state
- Disabled state
- Loading state (if applicable)
- Error state (if applicable)

## Handoff Protocol

UI design outputs feed into:
- **Frontend Agent**: Design tokens and component specs ready for implementation
- **UX Agent**: Visual constraints that affect interaction patterns

## Guidelines

1. Every design decision should have a clear rationale
2. Consistency over creativity — a design system's value is predictability
3. Specify edge cases: long text, RTL, dark mode, high contrast
4. A lean design system — start minimal, extend as needed