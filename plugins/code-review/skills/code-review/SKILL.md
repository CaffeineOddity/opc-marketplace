---
description: Review code for bugs, security, performance, and readability
disable-model-invocation: true
---

Review the code I've selected or the recent changes. Analyze across four dimensions:

## Bug & Edge Cases
- Logic errors and off-by-one mistakes
- Unhandled error paths and null/undefined risks
- Race conditions or concurrency issues

## Security
- Injection vulnerabilities (SQL, XSS, command)
- Authentication/authorization gaps
- Sensitive data exposure (secrets, credentials, PII)

## Performance
- Unnecessary re-renders, redundant computations
- N+1 queries or missing indexes
- Memory leaks or resource cleanup issues

## Readability
- Naming clarity and consistency
- Overly complex logic that needs simplification
- Missing or misleading comments

## Output Format

For each finding, provide:
- **Severity**: Critical / Warning / Info
- **Category**: Bug / Security / Performance / Readability
- **Location**: file:line
- **Issue**: One-sentence description
- **Fix**: Concrete suggestion or code snippet

Prioritize critical and security issues. Be concise and actionable. Skip categories with no findings.
