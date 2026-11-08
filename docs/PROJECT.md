# Project Record

## Objective

Deliver `@trysac/crdt-json`, a zero-runtime-dependency conflict-free replicated JSON document library featuring Lamport clocks, RGA sequences, PN-counters, state vector synchronization, and compact binary encoding.

## Scope

- Core: Lamport timestamps with replica ID tie-breaking, LWW Map, RGA Text/List with tombstones, PN-Counter.
- Synchronization: Varint/string-table binary encoding and state vector differential calculation.
- Testing: Property-based verification with fast-check (100 runs per suite) and MCP-based integration testing.

## Out-of-Scope

- Real-time network transports (WebSocket/BroadcastChannel).
- Arbitrary Rich Text formatting or Peritext.
- Byzantine fault tolerance or cryptographic signature verification.

## Line comparison metrics

| Model | Line | Fix rounds | Input tokens | Output tokens | Cost | Time | Failing checks per round | Conformance percentage | Integrations achieved | Public API only |
|---|---|---|---|---|---|---|---|---|---|---|

## Factory run u405 (measured from API usage)

| Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|
| analyst | gemini-3.8-flash | no | 3488 | 1204 | 0 | 0 | 0.0071 |
| generation | gemini-3.8-flash | yes | 8342 | 20033 | 0 | 0 | 0.0407 |
| fix-1 | gemini-3.8-flash | no | 124149 | 3685 | 0 | 1452747 | 0.2159 |
| fix-2 | gemini-3.8-flash | no | 82191 | 4356 | 0 | 595657 | 0.1227 |
| fix-3 | gemini-3.8-flash | no | 142116 | 1300 | 0 | 2015636 | 0.2626 |
| fix-4 | gemini-3.8-flash | no | 137558 | 1815 | 0 | 1757956 | 0.2418 |
| fix-5 | gemini-3.8-flash | no | 143721 | 2080 | 0 | 1878121 | 0.2564 |
| fix-6 | gemini-3.8-flash | no | 150008 | 3337 | 0 | 2158459 | 0.2869 |
| fix-1 | gemini-3.8-flash | no | 145225 | 1646 | 0 | 1806611 | 0.2506 |
| fix-2 | gemini-3.8-flash | no | 155422 | 4549 | 0 | 1981346 | 0.2822 |
| fix-3 | gemini-3.8-flash | no | 94137 | 5243 | 0 | 1104022 | 0.1731 |
| audit | gemini-3.8-flash | no | 154176 | 1485 | 0 | 1648072 | 0.2448 |
| docs | gemini-3.1-flash-lite | no | 24564 | 1395 | 0 | 0 | 0.0082 |

Total: $2.3931. Prices: Anthropic list prices.
