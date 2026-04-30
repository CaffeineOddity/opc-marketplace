# qa-kit

Quality assurance plugin — test planning, bug reports, E2E testing, and accessibility audits for the one-person company.

## Components

### Skills

| Skill | Description |
|-------|-------------|
| `/test-plan` | Test plan generation |
| `/bug-report` | Structured bug report |
| `/e2e-test` | Playwright / Cypress E2E testing patterns |
| `/wcag-audit` | WCAG 2.2 accessibility audit |
| `/webapp-testing` | Playwright web application testing toolkit |

### Agents

| Agent | Model | Description |
|-------|-------|-------------|
| qa-agent | sonnet | QA testing agent — test planning, defect management, quality gates |
| accessibility-expert | inherit | WCAG compliance, assistive technology, a11y testing |

## Quick Start

### Test Plan

```shell
/test-plan <feature>
```

Generates:
- Test scope and objectives
- Test cases (positive, negative, edge)
- Test data requirements
- Entry/exit criteria

### Bug Report

```shell
/bug-report
```

Structured report with:
- Steps to reproduce
- Expected vs actual behavior
- Severity and priority
- Environment details
- Screenshots/logs

### E2E Test

```shell
/e2e-test <scenario>
```

Generates Playwright/Cypress tests:
- Page object models
- Test scenarios
- Assertions
- Setup/teardown

### WCAG Audit

```shell
/wcag-audit <url or component>
```

Audits against WCAG 2.2:
- Perceivable (alt text, contrast, captions)
- Operable (keyboard, timing, navigation)
- Understandable (readable, predictable, input help)
- Robust (compatible, parsing)

### Webapp Testing

```shell
/webapp-testing
```

Playwright testing toolkit:
- Test generation
- Page interactions
- Assertions
- Best practices

## Agent Usage

### qa-agent

Use for:
- Test strategy
- Test case design
- Bug triage
- Quality metrics
- Regression planning

**Receives from:** frontend-agent, backend-agent (implementation)
**Delivers to:** devops-agent (deployment approval)

### accessibility-expert

Use for:
- WCAG compliance audits
- Screen reader testing
- Keyboard navigation
- Color contrast analysis
- Assistive technology compatibility

## Workflow Integration

```
dev-kit (implementation) → qa-kit (testing) → ship-kit (deployment)
```

### Test-First Flow (with TDD)

```
/test-plan → /test-driven-development (dev-kit) → /verification-before-completion
```

### Bug Fix Flow

```
/bug-report → /systematic-debugging (dev-kit) → /e2e-test → /verification-before-completion
```

### Accessibility Flow

```
/wcag-audit → accessibility-expert → frontend-agent (fixes) → /wcag-audit (verify)
```

## WCAG 2.2 Quick Reference

| Level | Description | Requirement |
|-------|-------------|-------------|
| A | Minimum | Legal baseline |
| AA | Standard | Most regulations |
| AAA | Enhanced | Specialized needs |

### Common Violations

| Violation | Impact | Fix |
|-----------|--------|-----|
| Missing alt text | Critical | Add descriptive alt |
| Low contrast | Serious | Increase to 4.5:1 |
| No keyboard access | Critical | Add tabindex, handlers |
| Missing form labels | Critical | Add label elements |
