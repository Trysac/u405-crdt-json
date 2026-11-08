# crdt-json

[![npm version](https://img.shields.io/npm/v/@trysac/crdt-json.svg)](https://www.npmjs.com/package/@trysac/crdt-json)

Conflict-free replicated JSON document library with maps, RGA sequences, PN-counters, and compact binary encoding.

## Problem

Collaborative web and local-first applications require synchronization of structured JSON state across untrusted or intermittent networks without a central coordinator. Ad-hoc diff-merge algorithms often result in silent data loss, non-convergent states, and interleaved character edits. This library provides deterministic convergence, compact delta synchronization, and mathematical consistency across distributed peers.

## Why not Automerge or Yjs?

Unlike heavier alternatives like Automerge or Yjs that introduce large WASM bundles or complex non-tree runtimes, `crdt-json` is a lightweight, zero-runtime-dependency TypeScript library. It features a minimal binary wire format and clear deterministic execution semantics tailored specifically for modern web browsers and Node.js.

## Install

```sh
npm install @trysac/crdt-json
```

## Usage

```ts
import { Doc } from "@trysac/crdt-json";
const docA = new Doc("replica-a");
const docB = new Doc("replica-b");
docA.getMap("users").set("alice", { status: "online" });
docB.getText("notes").insert(0, "Hello CRDT!");
docA.applyUpdate(docB.encodeUpdate());
docB.applyUpdate(docA.encodeUpdate());
console.log(docA.toJSON());
```

## API Summary

- **Doc**: The root container.
  - `getMap(key)`, `getText(key)`, `getCounter(key)`, `getList(key)`: Access data structures.
  - `encodeStateVector()`, `encodeUpdate(sinceVector?)`, `applyUpdate(bytes)`: Synchronization primitives.
  - `toJSON()`: Snapshot.
  - `on('change', handler)`: Event listening.
- **Error Types**: `CrdtDecodeError`, `CrdtLimitError`, `CrdtKeyError`, and `CrdtError` (base class).

## Limits

- `maxPayloadBytes`: 16 MiB default.
- `maxNestingDepth`: 32 levels default.
- `replicaId`: Max 64 UTF-8 bytes.

See [docs/SECURITY.md](docs/SECURITY.md) for threat model and limits.
