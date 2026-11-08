# Testing

## Test Suites

- `test/crdt.test.ts`: Acceptance tests validating core functionality, error types, boundary cases (e.g., nesting limits), and idempotence.
- `test/property.test.ts`: Fast-check property-based tests covering multi-replica scenarios with interleaved operations, drops, and duplicates.
- `test/integration/mcp-shared-doc.test.ts`: Integration tests using `@trysac/mcp-server-template` and `@trysac/retry-policies` to simulate collaborative agents.
- `test/crdt.conformance.test.ts`: Text interleaving and cyclic synchronization tests executed in CI.
- `test/index.test.ts`: Unit tests ensuring proper public API surface.

## Conformance Exclusions

None.
