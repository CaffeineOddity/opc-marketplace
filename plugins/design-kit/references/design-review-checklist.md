# Design Review Checklist

> Comprehensive checklist for design review and validation. Use with design-reviewer agent.

## Review Categories

### 1. Accessibility (WCAG 2.1 AA) — CRITICAL

#### Color Contrast
- [ ] Normal text (< 18px) has contrast ratio ≥ 4.5:1
- [ ] Large text (≥ 18px or 14px bold) has contrast ratio ≥ 3:1
- [ ] UI components have contrast ratio ≥ 3:1
- [ ] Graphical objects have contrast ratio ≥ 3:1
- [ ] Focus indicators have contrast ratio ≥ 3:1

#### Keyboard Navigation
- [ ] All interactive elements focusable
- [ ] Focus order matches visual order
- [ ] Focus indicators visible
- [ ] No keyboard traps
- [ ] Skip links provided (if needed)

#### Screen Reader
- [ ] All images have meaningful alt text
- [ ] Decorative images have empty alt
- [ ] Form inputs have associated labels
- [ ] Complex elements have aria labels
- [ ] Headings follow logical hierarchy
- [ ] Landmarks used correctly

#### Touch Targets
- [ ] Touch targets minimum 44x44px (web)
- [ ] Touch targets minimum 44x44pt (mobile)
- [ ] Adequate spacing between targets
- [ ] No accidental tap triggers

#### Motion & Animation
- [ ] prefers-reduced-motion respected
- [ ] No flashing content (> 3 times/second)
- [ ] Animations can be paused

---

### 2. Visual Quality — HIGH

#### Icons
- [ ] No emojis used as UI icons
- [ ] SVG icons used (not PNG/JPG)
- [ ] Consistent icon set (Heroicons, Lucide, etc.)
- [ ] Icons have consistent sizing
- [ ] Brand logos are correct (verified from Simple Icons)

#### Hover States
- [ ] Hover provides clear visual feedback
- [ ] Hover doesn't cause layout shift
- [ ] Transitions smooth (150-300ms)
- [ ] Cursor changes to pointer on clickable elements

#### Light/Dark Mode
- [ ] Light mode text has sufficient contrast
- [ ] Dark mode text has sufficient contrast
- [ ] Glass/transparent elements visible in both modes
- [ ] Borders visible in both modes
- [ ] Images work in both modes

#### Typography
- [ ] Font sizes readable (≥ 16px body on mobile)
- [ ] Line height appropriate (1.5-1.75 for body)
- [ ] Line length limited (65-75 characters)
- [ ] Font weights used consistently

---

### 3. Brand Compliance — HIGH

#### Logo Usage
- [ ] Logo placement correct
- [ ] Logo colors correct
- [ ] Logo minimum size respected
- [ ] Clear space around logo maintained
- [ ] No unapproved logo modifications

#### Colors
- [ ] Primary brand color used correctly
- [ ] Secondary colors match guidelines
- [ ] Semantic colors appropriate
- [ ] No off-brand color usage

#### Typography
- [ ] Headings use brand fonts
- [ ] Body text uses brand fonts
- [ ] Font weights match guidelines
- [ ] No unapproved font usage

#### Visual Style
- [ ] Style matches brand personality
- [ ] Photography style consistent
- [ ] Illustration style consistent
- [ ] Icon style consistent

---

### 4. UX Completeness — HIGH

#### States Coverage
- [ ] Default state defined
- [ ] Hover state defined (web)
- [ ] Focus state defined
- [ ] Active state defined
- [ ] Disabled state defined
- [ ] Loading state defined
- [ ] Empty state defined
- [ ] Error state defined
- [ ] Success state defined

#### Edge Cases
- [ ] Long text handled
- [ ] Short text handled
- [ ] Missing data handled
- [ ] Zero values handled
- [ ] RTL support (if needed)
- [ ] Internationalization considered

#### Navigation
- [ ] Clear navigation structure
- [ ] Current location indicated
- [ ] Back navigation available
- [ ] Home accessible
- [ ] Search available (if content extensive)

#### Feedback
- [ ] Action feedback provided
- [ ] Success messages shown
- [ ] Error messages helpful
- [ ] Progress indicated for long operations

---

### 5. Platform-Specific (Web) — HIGH

#### Responsive
- [ ] Works at 375px (mobile)
- [ ] Works at 768px (tablet)
- [ ] Works at 1024px (laptop)
- [ ] Works at 1440px (desktop)
- [ ] No horizontal scroll on mobile
- [ ] Content reflows appropriately

#### Performance
- [ ] Images optimized (WebP, srcset)
- [ ] Lazy loading used
- [ ] Critical CSS identified
- [ ] Font loading optimized
- [ ] No layout shift during load

#### SEO
- [ ] Semantic HTML used
- [ ] Meta tags present
- [ ] Open Graph tags present
- [ ] Structured data considered

---

### 6. Platform-Specific (Mobile) — HIGH

#### iOS (HIG)
- [ ] Tab bar for primary navigation (3-5 items)
- [ ] Navigation bar for hierarchical content
- [ ] SF Symbols used for icons
- [ ] Dynamic Type supported
- [ ] Safe areas handled
- [ ] Context menus used appropriately

#### Android (Material Design 3)
- [ ] Bottom navigation for primary (3-5 items)
- [ ] FAB for primary action (if applicable)
- [ ] Material Icons used
- [ ] Material You colors supported
- [ ] Elevation used correctly
- [ ] Cards used appropriately

#### Cross-Platform
- [ ] Platform adaptations documented
- [ ] Shared components identified
- [ ] Platform-specific components identified
- [ ] Navigation patterns per platform

#### Device Coverage
- [ ] Small phones (iPhone SE, 375px)
- [ ] Large phones (iPhone Pro Max, 428px)
- [ ] Tablets (iPad, 768px+)
- [ ] Landscape orientation

---

### 7. Design System Compliance — MEDIUM

#### Tokens
- [ ] Design tokens used (not hardcoded values)
- [ ] Token naming follows convention
- [ ] Tokens documented
- [ ] Tokens match brand guidelines

#### Components
- [ ] Existing components reused
- [ ] New components follow patterns
- [ ] Component variants documented
- [ ] Component states complete

#### Documentation
- [ ] Design decisions documented
- [ ] Usage guidelines provided
- [ ] Edge cases documented

---

## Issue Severity Levels

| Level | Definition | Response |
|-------|------------|----------|
| **Critical** | Blocks users or legal violation | Must fix before release |
| **High** | Significant UX/brand impact | Should fix before release |
| **Medium** | Noticeable but not blocking | Fix in next iteration |
| **Low** | Minor polish | Fix when convenient |

---

## Review Report Template

```markdown
# Design Review Report

## Summary
- Total Issues: [count]
- Critical: [count]
- High: [count]
- Medium: [count]
- Low: [count]

## Critical Issues
| ID | Category | Location | Issue | Recommendation |
|----|----------|----------|-------|----------------|
| C1 | Accessibility | [where] | [what] | [fix] |

## High Issues
| ID | Category | Location | Issue | Recommendation |
|----|----------|----------|-------|----------------|
| H1 | Brand | [where] | [what] | [fix] |

## Medium Issues
...

## Low Issues
...

## Recommendations
1. [Priority recommendation]
2. [Secondary recommendation]

## Approved for Implementation
- [ ] Yes, after fixing Critical issues
- [ ] Yes, after fixing Critical + High issues
- [ ] No, requires significant revision
```