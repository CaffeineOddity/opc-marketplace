# Design System Guide

> This guide is derived from the original design-system-architect specification. Use it as a reference for building scalable design systems.

## Design Token Architecture

### Token Taxonomy
| Level | Purpose | Example |
|-------|---------|---------|
| **Primitive** | Raw values | `#3B82F6`, `16px` |
| **Semantic** | Purpose-based aliases | `color-primary`, `spacing-card` |
| **Component** | Component-specific | `button-bg-primary`, `input-border` |

### Token Naming Convention
```
[category]-[property]-[variant]-[state]

Examples:
- color-bg-primary
- color-text-muted
- spacing-padding-card
- border-radius-button
- shadow-elevation-2
```

## Component Library Architecture

### Component API Design Principles
- Clear prop interfaces
- Sensible defaults
- Flexible customization
- Consistent naming
- Slot-based composition

### Component Categories
| Category | Components |
|----------|------------|
| **Layout** | Box, Stack, Flex, Grid, Container |
| **Typography** | Heading, Text, Label, Link |
| **Forms** | Input, Select, Checkbox, Radio, Button |
| **Navigation** | Tabs, Breadcrumbs, Menu, Pagination |
| **Feedback** | Alert, Toast, Progress, Spinner |
| **Data Display** | Table, List, Card, Badge |
| **Overlay** | Modal, Popover, Tooltip, Drawer |

### Component Documentation Structure
```
component-doc/
├── overview.md         # Purpose and usage
├── anatomy.md          # Structure breakdown
├── variants.md         # All variants documented
├── states.md           # Interactive states
├── accessibility.md    # A11y requirements
├── examples.md         # Usage examples
└── code-examples.md    # Implementation code
```

## Theming System

### Multi-Brand Architecture
```
themes/
├── base.json           # Shared foundation
├── brand-a.json        # Brand A overrides
├── brand-b.json        # Brand B overrides
└── dark.json           # Dark mode overrides
```

### Theme Switching Strategies
| Strategy | Use Case |
|----------|----------|
| CSS Custom Properties | Runtime switching |
| CSS-in-JS theming | Component-scoped |
| Tailwind config | Build-time |
| CSS Layers | Cascade control |

## Design-Development Workflow

### Handoff Checklist
- [ ] Design tokens documented
- [ ] Component specs complete
- [ ] All states defined
- [ ] Responsive behavior specified
- [ ] Accessibility requirements listed
- [ ] Usage guidelines written
- [ ] Code examples provided

### Documentation Standards
- Clear component purpose
- When to use / when not to use
- Do's and don'ts with visuals
- Accessibility notes per component
- Migration guides for changes

## Performance Considerations

### CSS Optimization
- Critical CSS extraction
- CSS code splitting
- Unused CSS removal
- Token deduplication

### Asset Optimization
- Icon system (SVG sprites vs individual)
- Font loading strategy
- Image format selection
- Lazy loading patterns

## Governance & Maintenance

### Versioning Strategy
- Semantic versioning for tokens
- Breaking change documentation
- Migration guides
- Deprecation notices

### Contribution Guidelines
- Proposal process
- Review criteria
- Testing requirements
- Documentation standards

## Industry Design Systems Reference

| System | Organization | Strengths |
|--------|--------------|-----------|
| Material Design | Google | Comprehensive, cross-platform |
| Carbon | IBM | Enterprise, data-heavy |
| Spectrum | Adobe | Creative tools, accessibility |
| Polaris | Shopify | E-commerce, commerce patterns |
| Atlassian Design | Atlassian | Team collaboration |

## Tools & Integration

| Tool | Purpose |
|------|---------|
| Style Dictionary | Token transformation |
| Tokens Studio | Figma token sync |
| Storybook | Component documentation |
| Chromatic | Visual regression |
| Figma | Design tool |

## Scalable Design System Principles

1. Think systematically about design decisions and their cascading effects
2. Balance flexibility with consistency in component APIs
3. Prioritize developer experience alongside design quality
4. Document decisions thoroughly for team alignment
5. Plan for scale and multi-platform requirements from the start
6. Measure success through adoption metrics and user feedback