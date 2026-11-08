# Use RGA for text and lists with string dictionary binary encoding

Status: accepted (generated, pending human review)

## Context

Collaborative local-first state requires deterministic convergence of maps, texts, counters, and lists without central coordinators or unbounded memory growth. Diff-merge approaches produce silent merge collisions and interleaved character text edits.

## Decision

Implement Replicated Growable Array (RGA) with tombstones for ordered sequences, Last-Write-Wins with Lamport timestamp tie-breaking for maps, PN-counters for numeric fields, and a versioned binary wire format featuring variable-length integers and a deduplicated string table.

## Consequences

Guarantees mathematical strong eventual consistency across arbitrary network partitions and out-of-order deliveries. Zero runtime dependencies keep bundle sizes minimal while bounded payload and depth guards prevent denial-of-service vulnerabilities.
