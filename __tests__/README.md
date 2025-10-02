# Tests

This directory contains tests for the service application.

## Setup

First, install the test dependencies:

```bash
npm install
```

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (reruns on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

```
__tests__/
├── api/
│   └── checks/
│       ├── assess.simple.test.ts      # Unit tests for batch logic
│       ├── assess.test.ts             # Integration tests (WIP)
│       └── assessment-progress.test.ts  # Integration tests (WIP)
└── README.md
```

## Test Coverage

### Batch Logic Tests (`assess.simple.test.ts`) ✅

Tests the core batching and aggregation logic:

- ✅ Batches 90 sections into 3 groups of 30
- ✅ Handles non-evenly divisible counts (95 sections → 4 batches, last has 5)
- ✅ Handles single section (1 batch of 1)
- ✅ Aggregates overall status (violation > needs_more_info > compliant)
- ✅ Calculates progress percentage (2/3 = 67%)
- ✅ Recognizes completion (3/3 = 100%, inProgress = false)

### Integration Tests (WIP)

The integration tests for the full API endpoints are currently in progress. They test complex interactions with Supabase, Neo4j, and AI services which require more sophisticated mocking strategies.

## Key Test Scenarios

### Batching Logic

The tests verify that:

- Sections are batched into groups of 30
- First batch is processed synchronously
- Remaining batches are processed in background
- Progress can be tracked via polling endpoint

### Element Checks

Tests verify element checks work correctly:

- Multiple sections loaded from `element_sections` array
- All sections from Neo4j are fetched and batched
- Batch results include section keys

### Error Handling

Tests verify proper error handling:

- Missing required parameters return 400
- AI failures return 500 with error message
- Database errors are caught and returned
- Check status is updated to 'failed' on errors

## Mocking

Tests use Vitest mocks for:

- **Supabase**: Database queries and mutations
- **Neo4j**: Code assembly and section data
- **AI Services**: Model responses and analysis

This allows tests to run without external dependencies.

## Adding New Tests

When adding new tests:

1. Create test file in appropriate subdirectory
2. Import functions to test and mock dependencies
3. Use `describe()` blocks to group related tests
4. Use `beforeEach()` to reset mocks between tests
5. Write clear test descriptions using `it()`
6. Assert expected behavior with `expect()`

Example:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('MyFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do something', async () => {
    // Arrange
    const input = 'test';

    // Act
    const result = await myFunction(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```
