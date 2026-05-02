---
name: testing
description: Testing — writing and running tests with bun:test, test patterns, validation. Trigger keywords: test, testing, unit test, integration test, bun test, spec, assertion.
metadata:
  author: CorvidLabs
  version: "1.0"
---

# Testing — bun:test Patterns

How to write and run tests in the corvid-agent project.

## Running Tests

```bash
# Run all tests via fledge
fledge run test

# Run specific test file (pass through to bun)
bun test server/db/schema.test.ts

# Run tests matching a pattern
bun test --filter "agent"
```

## Test File Convention

- Test files live next to the code they test: `foo.ts` → `foo.test.ts`
- End-to-end tests live in `e2e/` (Playwright)

## Writing Tests

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';

describe('MyModule', () => {
  beforeEach(() => {
    // setup
  });

  test('should do the expected thing', () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });

  test('should handle edge case', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

## Assertions

```typescript
expect(value).toBe(exact);           // strict equality
expect(value).toEqual(deep);         // deep equality
expect(value).toBeTruthy();          // truthy check
expect(value).toBeNull();            // null check
expect(value).toContain(item);       // array/string contains
expect(value).toHaveLength(n);       // length check
expect(fn).toThrow();                // error throwing
expect(fn).toThrow('message');       // specific error
```

## Test Patterns

- **No mocking the database** — use real SQLite for integration tests
- **Use descriptive test names** that explain the expected behavior
- **One assertion per concept** — test one behavior at a time
- **Arrange-Act-Assert** pattern for test structure
- **Clean up after tests** — don't leave side effects

## Validation Pipeline

Before committing, run the full verification lane:

```bash
fledge lanes run verify               # lint → typecheck → test → spec-check
```

Work tasks auto-run this pipeline and iterate up to 3 times on failure.

## E2E Tests (Playwright)

```bash
# Run e2e tests
cd e2e && npx playwright test

# Run with UI
cd e2e && npx playwright test --ui
```

E2E tests live in `e2e/` and test the full stack including the Angular frontend.
