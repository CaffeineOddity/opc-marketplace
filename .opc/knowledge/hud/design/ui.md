# HUD UI Design Specification

## HUD Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ [OPC#1.0] | Opus | session:5m | skill:opc-plugin | ctx:45% | 🔧3 ⚡1 🎯2 │
└─────────────────────────────────────────────────────────────────────┘
```

## Visual Design

### Color Coding for Context Usage

| Range | Color | Hex | Meaning |
|-------|-------|-----|---------|
| 0-50% | 🟢 Green | `#22c55e` | Healthy |
| 50-75% | 🟡 Yellow | `#eab308` | Warning |
| 75-100% | 🔴 Red | `#ef4444` | Critical |

### Icon Design

| Icon | Meaning | Unicode |
|------|---------|---------|
| 🔧 | Tool calls | U+1F527 |
| ⚡ | Agent dispatches | U+26A1 |
| 🎯 | Skill activations | U+1F3AF |

### Typography

- **Font:** Monospace (inherited from terminal)
- **Size:** Default terminal size
- **Weight:** Normal

## Component Breakdown

### 1. Brand Identifier

```
[OPC#1.0]
```

- **Purpose:** Identify OPC marketplace
- **Format:** `[OPC#<version>]`
- **Style:** Bold brackets, version number

### 2. Model Indicator

```
Opus | Sonnet | Haiku
```

- **Purpose:** Show current model
- **Update:** On model switch
- **Style:** Plain text, capitalized

### 3. Session Duration

```
session:5m
```

- **Purpose:** Show how long session has been active
- **Update:** Every minute
- **Format:** `session:<minutes>m` or `session:<hours>h<minutes>m`

### 4. Skill Indicator

```
skill:opc-plugin
```

- **Purpose:** Show last activated skill
- **Update:** On skill activation
- **Format:** `skill:<skill-name>`

### 5. Context Usage

```
ctx:45%
```

- **Purpose:** Show context window usage
- **Update:** Real-time
- **Format:** `ctx:<percentage>%`
- **Color:** Dynamic based on percentage

### 6. Activity Counters

```
🔧3 ⚡1 🎯2
```

- **Purpose:** Show activity intensity
- **Update:** On each call
- **Format:** `<icon><count>`

## Responsive Behavior

### Full Display (Wide Terminal)

```
[OPC#1.0] | Opus | session:5m | skill:opc-plugin | ctx:45% | 🔧3 ⚡1 🎯2
```

### Compact Display (Narrow Terminal)

```
[OPC#1.0] | Opus | ctx:45% | 🔧3 ⚡1 🎯2
```

### Minimal Display (Very Narrow)

```
[OPC#1.0] | ctx:45%
```

## Interaction States

### Normal State

- All elements visible
- Green context indicator
- Standard counters

### Warning State (ctx > 50%)

- Yellow context indicator
- Optional: subtle animation

### Critical State (ctx > 75%)

- Red context indicator
- Optional: warning icon
- Consider: auto-suggest compaction

## Accessibility

### Color Blindness

- Color is not the only indicator
- Percentage number always visible
- Icons provide additional context

### Screen Reader

- All elements are text-based
- Readable by screen readers
- Semantic structure maintained

## Implementation Notes

### Statusline Setting

```json
{
  "statusline": {
    "template": "[OPC#{{version}}] | {{model}} | session:{{session}} | skill:{{skill}} | ctx:{{ctx}}% | 🔧{{tools}} ⚡{{agents}} 🎯{{skills}}"
  }
}
```

### Dynamic Updates

- Use Claude Code API for real-time updates
- Subscribe to context window events
- Track tool/agent/skill invocations