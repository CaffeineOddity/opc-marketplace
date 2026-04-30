---
name: spec-driven-development
description: Define specifications before implementation. Use when starting any feature to create clear contracts, data models, and behavior rules that drive TDD and architecture.
---

# Spec-Driven Development (SDD)

## Overview

Define the specification first. Let the spec drive tests, architecture, and implementation.

**Core principle:** No implementation without a clear specification. The spec is the contract.

**Violating the letter of this process is violating the spirit of engineering discipline.**

## The Iron Law

```
NO IMPLEMENTATION WITHOUT A CLEAR SPECIFICATION FIRST
```

Write code before the spec? Stop. Define what you're building first.

## When to Use

**Always:**
- New features
- API design
- Data model changes
- Integration points
- Behavior changes

**Exceptions (ask your human partner):**
- Exploratory prototypes
- Quick fixes with obvious scope

## The SDD Flow

```
┌─────────────────────────────────────────────────────────┐
│ Phase 1: SPEC DEFINITION                                │
│   What are we building? What are the constraints?       │
│   Output: Specification Document                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 2: SPEC REVIEW                                    │
│   Is the spec complete? Unambiguous? Testable?          │
│   Output: Reviewed & Approved Spec                      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 3: TEST DERIVATION (TDD Integration)              │
│   Derive test cases from spec                           │
│   Each spec item → at least one test                    │
│   Output: Test Plan / Test Cases                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 4: IMPLEMENTATION                                 │
│   TDD: RED → GREEN → REFACTOR                           │
│   Verify implementation matches spec                     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 5: VERIFICATION                                   │
│   Does implementation satisfy the spec?                 │
│   Use /verification-before-completion                   │
└─────────────────────────────────────────────────────────┘
```

## Specification Structure

### 1. Interface Contract

```yaml
# API Specification Example
endpoint: /api/users/{id}/orders
method: GET
description: Retrieve paginated orders for a user

path_parameters:
  - name: id
    type: string
    required: true
    description: User ID

query_parameters:
  - name: status
    type: string
    enum: [pending, completed, cancelled]
    required: false
  - name: page
    type: integer
    default: 1
    min: 1
  - name: limit
    type: integer
    default: 20
    min: 1
    max: 100

responses:
  200:
    description: Paginated list of orders
    schema:
      type: object
      properties:
        items:
          type: array
          items: Order
        total:
          type: integer
        page:
          type: integer
        has_more:
          type: boolean
  404:
    description: User not found
  401:
    description: Unauthorized

errors:
  - code: INVALID_PAGE
    message: Page must be >= 1
  - code: USER_NOT_FOUND
    message: User with id {id} not found
```

### 2. Data Model Specification

```yaml
# Data Model Specification Example
entity: Order
description: Customer order with items

attributes:
  id:
    type: string
    format: uuid
    description: Unique order identifier
  user_id:
    type: string
    format: uuid
    required: true
  status:
    type: enum
    values: [pending, confirmed, shipped, delivered, cancelled]
    default: pending
  items:
    type: array
    items: OrderItem
    required: true
    min_items: 1
  total:
    type: decimal
    precision: 10
    scale: 2
    description: Total order amount
  created_at:
    type: datetime
    auto: true
  updated_at:
    type: datetime
    auto: true

constraints:
  - total must equal sum of items.price * items.quantity
  - status can only transition: pending → confirmed → shipped → delivered
  - cancelled is terminal state from any non-delivered state

indexes:
  - [user_id, created_at]
  - [status]
```

### 3. Behavior Rules

```yaml
# Behavior Specification Example
feature: Order Processing

rules:
  - name: Order Creation
    given: User exists and has valid payment method
    when: User submits order with items
    then:
      - Order created with status "pending"
      - Inventory reserved for each item
      - Payment authorized (not captured)
      - User receives confirmation email

  - name: Order Confirmation
    given: Order exists with status "pending"
    when: Payment is successfully captured
    then:
      - Order status changes to "confirmed"
      - Inventory committed (not just reserved)
      - Shipping label generated

  - name: Order Cancellation
    given: Order exists with status in [pending, confirmed]
    when: User or admin cancels order
    then:
      - Order status changes to "cancelled"
      - Inventory released
      - Payment refunded if captured
      - User receives cancellation email

edge_cases:
  - name: Partial Inventory
    given: Order has 3 items
    when: Only 2 items have sufficient inventory
    then:
      - Order rejected entirely
      - No inventory reserved
      - User notified of insufficient stock

  - name: Payment Failure
    given: Order created with status "pending"
    when: Payment capture fails after 3 retries
    then:
      - Order status changes to "cancelled"
      - Inventory released
      - User notified of payment failure
```

### 4. Boundary Conditions

```markdown
## Boundary Specification

### Input Validation
| Field | Valid Range | Invalid Handling |
|-------|-------------|------------------|
| page | 1 to MAX_INT | Return 400 with INVALID_PAGE |
| limit | 1 to 100 | Clamp to [1, 100] |
| status | enum values | Return 400 with INVALID_STATUS |

### Rate Limits
| Endpoint | Limit | Exceeded Response |
|----------|-------|-------------------|
| GET /orders | 100/min | 429 with Retry-After |
| POST /orders | 10/min | 429 with Retry-After |

### Pagination
| Scenario | Behavior |
|----------|----------|
| Empty result | Return { items: [], total: 0, has_more: false } |
| Last page | has_more = false |
| Beyond last page | Return empty items, total reflects actual count |
```

## Spec Formats

### Choose Based on Context

| Context | Format | Tool |
|---------|--------|------|
| REST API | OpenAPI 3.1 | `/openapi-spec` |
| Data Model | JSON Schema / YAML | This skill |
| Behavior Rules | Gherkin (BDD) | This skill |
| Decision Logic | Decision Tables | This skill |
| UI Components | Component Spec | `/ui-design` |

### Gherkin Example (BDD)

```gherkin
Feature: Order Processing

  Scenario: Successful order creation
    Given user "alice" exists with payment method "visa-1234"
    And product "widget" has 10 units in stock
    When alice creates an order with:
      | product | quantity |
      | widget  | 2        |
    Then order is created with status "pending"
    And product "widget" has 8 units available
    And alice receives confirmation email

  Scenario: Insufficient inventory
    Given user "bob" exists with payment method "mastercard-5678"
    And product "gadget" has 3 units in stock
    When bob creates an order with:
      | product | quantity |
      | gadget  | 5        |
    Then order is rejected with error "INSUFFICIENT_INVENTORY"
    And product "gadget" still has 3 units available
```

## Integration with TDD

### Spec → Test Mapping

```
Specification Item              →    Test Case
─────────────────────────────────────────────────────
GET /api/users/{id}/orders      →    test_list_user_orders
  - 200 response                →    test_list_orders_success
  - 404 for missing user        →    test_list_orders_user_not_found
  - pagination                  →    test_list_orders_pagination
  - status filter               →    test_list_orders_filter_by_status

Order.total = sum(items)        →    test_order_total_calculation
Order status transitions        →    test_order_status_transitions
Partial inventory rejection     →    test_order_rejected_partial_inventory
```

### TDD Workflow with SDD

```
1. Write Spec (SDD)
   └── Define expected behavior, constraints, edge cases

2. Derive Tests (SDD → TDD)
   └── Each spec item → test case(s)

3. RED (TDD)
   └── Write failing test from spec
   └── Verify test fails for right reason

4. GREEN (TDD)
   └── Minimal implementation to pass test
   └── Implementation must satisfy spec

5. REFACTOR (TDD)
   └── Clean up while staying green

6. Verify Against Spec (SDD)
   └── Does implementation match specification?
   └── Use /verification-before-completion
```

## Spec Review Checklist

Before proceeding to implementation:

- [ ] **Complete**: All scenarios covered?
- [ ] **Unambiguous**: Only one interpretation possible?
- [ ] **Testable**: Can we verify each item?
- [ ] **Feasible**: Can we implement within constraints?
- [ ] **Consistent**: No contradictions between rules?
- [ ] **Edge Cases**: Boundary conditions defined?
- [ ] **Error Handling**: All failure modes addressed?

## Workflow Integration

```
/product-kit:
  /research → /requirement → /spec-driven-development

/dev-kit:
  /spec-driven-development output → /architect → /test-driven-development

Full Flow:
  /research → /requirement → /spec-driven-development → /architect → /test-driven-development → /verification-before-completion
```

## Handoff Protocol

### From SDD to TDD

```markdown
## Spec Handoff Document

### Summary
Brief description of what's being built

### Specifications
1. Interface Contract (API endpoints, request/response)
2. Data Model (entities, attributes, constraints)
3. Behavior Rules (business logic, state transitions)
4. Boundary Conditions (validation, limits, edge cases)

### Test Derivation
Mapping from spec items to test cases

### Open Questions
Items needing clarification before implementation

### Dependencies
External systems, services, or data required
```

## Common Mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Vague spec | Multiple interpretations | Be precise, use examples |
| Missing edge cases | Bugs in production | List all boundary conditions |
| Spec after implementation | Spec justifies code, not guides it | Write spec first |
| Over-specification | Implementation constrained unnecessarily | Focus on WHAT, not HOW |
| Under-specification | Ambiguity, rework | Cover all scenarios |
| No spec review | Errors propagate | Always review before implementing |

## Red Flags

- "The spec is obvious from the requirement"
- "I'll update the spec after implementing"
- "This is too simple to need a spec"
- "The code is the spec"
- "We'll figure out edge cases during testing"

**All of these mean: Stop. Write the spec first.**

## Final Rule

```
Specification → Test → Implementation
Otherwise → Not SDD
```

No exceptions without your human partner's permission.
