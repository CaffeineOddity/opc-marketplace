# UX Design Guide

> This guide is derived from the original ux-agent specification. Use it as a reference for UX design principles and patterns.

## Core UX Principles

### Information Architecture
- Screen/page inventory and navigation structure
- Content hierarchy and grouping
- Sitemap and user path analysis
- Mental model alignment

### User Flows & Interaction Design
- Step-by-step user flow diagrams
- State transitions and edge cases
- Error states, empty states, loading states
- Micro-interaction and animation specifications

### Wireframing Principles
- Text-based wireframe specifications
- Layout rules (spacing, alignment, responsive breakpoints)
- Component placement and hierarchy
- Mobile-first responsive strategies

### Usability Heuristics (Nielsen's 10)
1. Visibility of system status
2. Match between system and real world
3. User control and freedom
4. Consistency and standards
5. Error prevention
6. Recognition rather than recall
7. Flexibility and efficiency of use
8. Aesthetic and minimalist design
9. Help users recognize and recover from errors
10. Help and documentation

## State Design Checklist

Every interactive element should have these states defined:

| State | Description |
|-------|-------------|
| **Default** | Initial appearance |
| **Hover** | Mouse over (web only) |
| **Focus** | Keyboard navigation focus |
| **Active** | Being interacted with |
| **Disabled** | Not available for interaction |
| **Loading** | Waiting for data |
| **Empty** | No data to display |
| **Error** | Something went wrong |
| **Success** | Action completed successfully |

## UX Guidelines

### Cognitive Load
- Limit choices per screen
- Use progressive disclosure
- Chunk information logically
- Avoid unnecessary decisions

### Feedback & Affordance
- Clear visual feedback for all actions
- Obvious clickable elements
- Predictable behavior
- Immediate response to user input

### Navigation
- Consistent navigation patterns
- Clear current location indication
- Easy return to previous states
- Search when content is extensive

### Forms & Input
- Minimal required fields
- Clear field labels
- Inline validation
- Helpful error messages
- Auto-focus on first field

### Error Handling
- Clear error messages
- Explain what went wrong
- Provide solution steps
- Preserve user input
- Allow recovery

## Handoff Protocol

UX design outputs feed into:
- **UI Agent**: Wireframe specs and interaction behaviors for visual refinement
- **Frontend Agent**: Complete interaction specifications with state diagrams

## Design for User's Mental Model

Always design for the user's mental model, not the system architecture. Users don't care about your database structure — they care about completing their tasks.