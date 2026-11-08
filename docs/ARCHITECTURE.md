# Architecture

`@trysac/crdt-json` implements conflict-free replicated data types (CRDTs) with zero runtime dependencies.

## Core Components

- **Lamport Timestamps & State Vectors**: Operations carry `{ client, clock }` pairs. Clocks monotonically increase per replica, resolving concurrency ties deterministically by lexicographical comparison of client IDs.
- **LWW CMap**: Last-Write-Wins element map where ties on identical Lamport clock break deterministically using client identifier ordering.
- **RGA CText & CList**: Replicated Growable Array (RGA) tracking sequence elements with tombstones. When concurrent insertions share the same predecessor, higher Lamport IDs are sequenced earlier without character interleaving.
- **PN-Counter**: CCounter stores per-client positive and negative deltas to provide commutative and convergent integer accounting.
- **Binary Wire Encoding**: Wire version 1 format encodes operation count, a shared string dictionary table, and packed varint payloads.
