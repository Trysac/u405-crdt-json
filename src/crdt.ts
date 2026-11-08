import { BinaryReader, BinaryWriter } from "./encoding.js";
import { CrdtDecodeError, CrdtKeyError, CrdtLimitError } from "./errors.js";
import { type LamportId, type Operation, OpType, type RgaNode, type StateVector } from "./types.js";

const WIRE_VERSION = 1;
export const DEFAULT_MAX_PAYLOAD_BYTES = 16_777_216; // 16 MiB
export const DEFAULT_MAX_NESTING_DEPTH = 32;
export const MAX_REPLICA_ID_BYTES = 64;

/**
 * Validates replica ID format and size.
 */
export function validateReplicaId(id: string): void {
  if (typeof id !== "string" || id.length === 0) {
    throw new CrdtKeyError("Replica ID must be a non-empty string", "invalid_replica_id");
  }
  const byteLen = new TextEncoder().encode(id).length;
  if (byteLen > MAX_REPLICA_ID_BYTES) {
    throw new CrdtKeyError(
      `Replica ID exceeds ${MAX_REPLICA_ID_BYTES} bytes`,
      "invalid_replica_id",
    );
  }
}

/**
 * Compares two Lamport IDs. Returns > 0 if a > b, < 0 if a < b, 0 if equal.
 */
export function compareLamportIds(a: LamportId, b: LamportId): number {
  if (a.clock !== b.clock) {
    return a.clock - b.clock;
  }
  if (a.client < b.client) return -1;
  if (a.client > b.client) return 1;
  return 0;
}

/**
 * Validates nesting depth of values placed into CRDT.
 */
export function validateValueNesting(
  val: unknown,
  depth = 0,
  maxDepth = DEFAULT_MAX_NESTING_DEPTH,
): void {
  if (depth > maxDepth) {
    throw new CrdtLimitError("Nesting depth exceeds maximum allowed limit", "max_nesting_exceeded");
  }
  if (val !== null && typeof val === "object") {
    if (Array.isArray(val)) {
      for (const item of val) {
        validateValueNesting(item, depth + 1, maxDepth);
      }
    } else {
      for (const v of Object.values(val as Record<string, unknown>)) {
        validateValueNesting(v, depth + 1, maxDepth);
      }
    }
  }
}

/**
 * Document options.
 */
export interface DocOptions {
  maxPayloadBytes?: number;
}

/**
 * LWW Map CRDT wrapper.
 */
export class CMap {
  private readonly doc: Doc;
  private readonly rootKey: string;

  constructor(doc: Doc, rootKey: string) {
    this.doc = doc;
    this.rootKey = rootKey;
  }

  set(key: string, value: unknown): void {
    if (typeof key !== "string") {
      throw new TypeError("Key must be a string");
    }
    validateValueNesting(value);
    this.doc.applyLocalMapSet(this.rootKey, key, value);
  }

  get(key: string): unknown {
    return this.doc.getMapValue(this.rootKey, key);
  }

  delete(key: string): void {
    if (typeof key !== "string") {
      throw new TypeError("Key must be a string");
    }
    this.doc.applyLocalMapDelete(this.rootKey, key);
  }

  toJSON(): Record<string, unknown> {
    return this.doc.getMapSnapshot(this.rootKey);
  }
}

/**
 * RGA Text CRDT wrapper.
 */
export class CText {
  private readonly doc: Doc;
  private readonly rootKey: string;

  constructor(doc: Doc, rootKey: string) {
    this.doc = doc;
    this.rootKey = rootKey;
  }

  insert(index: number, content: string): void {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError("Index must be a non-negative integer");
    }
    if (typeof content !== "string") {
      throw new TypeError("Content must be a string");
    }
    if (content.length === 0) return;
    this.doc.applyLocalTextInsert(this.rootKey, index, content);
  }

  delete(index: number, count: number): void {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError("Index must be a non-negative integer");
    }
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError("Count must be a non-negative integer");
    }
    if (count === 0) return;
    this.doc.applyLocalTextDelete(this.rootKey, index, count);
  }

  toString(): string {
    return this.doc.getTextSnapshot(this.rootKey);
  }
}

/**
 * PN-Counter CRDT wrapper.
 */
export class CCounter {
  private readonly doc: Doc;
  private readonly rootKey: string;

  constructor(doc: Doc, rootKey: string) {
    this.doc = doc;
    this.rootKey = rootKey;
  }

  increment(amount = 1): void {
    if (!Number.isFinite(amount)) {
      throw new TypeError("Amount must be a finite number");
    }
    this.doc.applyLocalCounterAdd(this.rootKey, amount);
  }

  decrement(amount = 1): void {
    if (!Number.isFinite(amount)) {
      throw new TypeError("Amount must be a finite number");
    }
    this.doc.applyLocalCounterAdd(this.rootKey, -amount);
  }

  get value(): number {
    return this.doc.getCounterValue(this.rootKey);
  }
}

/**
 * RGA List CRDT wrapper.
 */
export class CList {
  private readonly doc: Doc;
  private readonly rootKey: string;

  constructor(doc: Doc, rootKey: string) {
    this.doc = doc;
    this.rootKey = rootKey;
  }

  insert(index: number, value: unknown): void {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError("Index must be a non-negative integer");
    }
    validateValueNesting(value);
    this.doc.applyLocalListInsert(this.rootKey, index, value);
  }

  delete(index: number, count: number): void {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError("Index must be a non-negative integer");
    }
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError("Count must be a non-negative integer");
    }
    if (count === 0) return;
    this.doc.applyLocalListDelete(this.rootKey, index, count);
  }

  toArray(): unknown[] {
    return this.doc.getListSnapshot(this.rootKey);
  }
}

/**
 * Internal state storage for Maps.
 */
interface MapEntryState {
  lamport: LamportId;
  deleted: boolean;
  value: unknown;
}

/**
 * Conflict-free replicated JSON Document.
 */
export class Doc {
  readonly replicaId: string;
  private readonly maxPayloadBytes: number;
  private lamportClock = 0;
  private readonly stateVector: StateVector = new Map();
  private readonly operations: Operation[] = [];
  private readonly operationIds: Set<string> = new Set();

  private readonly rootTypes = new Map<string, "map" | "text" | "counter" | "list">();
  private readonly maps = new Map<string, Map<string, MapEntryState>>();
  private readonly textNodes = new Map<string, RgaNode<string>[]>();
  private readonly listNodes = new Map<string, RgaNode<unknown>[]>();
  private readonly counterValues = new Map<string, Map<string, number>>();

  private readonly changeListeners = new Set<(delta: { origin: string; path: string[] }) => void>();

  constructor(replicaId: string, options?: DocOptions) {
    validateReplicaId(replicaId);
    this.replicaId = replicaId;
    this.maxPayloadBytes = options?.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
    this.stateVector.set(replicaId, 0);
  }

  private nextLamport(): LamportId {
    this.lamportClock += 1;
    this.stateVector.set(this.replicaId, this.lamportClock);
    return { clock: this.lamportClock, client: this.replicaId };
  }

  private emitChange(origin: string, path: string[]): void {
    for (const listener of this.changeListeners) {
      try {
        listener({ origin, path });
      } catch {
        // Ignore listener exceptions to protect core processing
      }
    }
  }

  on(event: "change", handler: (delta: { origin: string; path: string[] }) => void): () => void {
    if (event !== "change") {
      throw new Error(`Unsupported event: ${event}`);
    }
    this.changeListeners.add(handler);
    return () => {
      this.changeListeners.delete(handler);
    };
  }

  getMap(key: string): CMap {
    const type = this.rootTypes.get(key);
    if (type && type !== "map") {
      throw new CrdtKeyError(`Root key ${key} is already used as ${type}`, "type_mismatch");
    }
    return new CMap(this, key);
  }

  getText(key: string): CText {
    const type = this.rootTypes.get(key);
    if (type && type !== "text") {
      throw new CrdtKeyError(`Root key ${key} is already used as ${type}`, "type_mismatch");
    }
    return new CText(this, key);
  }

  getCounter(key: string): CCounter {
    const type = this.rootTypes.get(key);
    if (type && type !== "counter") {
      throw new CrdtKeyError(`Root key ${key} is already used as ${type}`, "type_mismatch");
    }
    return new CCounter(this, key);
  }

  getList(key: string): CList {
    const type = this.rootTypes.get(key);
    if (type && type !== "list") {
      throw new CrdtKeyError(`Root key ${key} is already used as ${type}`, "type_mismatch");
    }
    return new CList(this, key);
  }

  // Internal Map operations
  applyLocalMapSet(rootKey: string, key: string, value: unknown): void {
    const id = this.nextLamport();
    const op: Operation = {
      id,
      type: OpType.MapSet,
      rootKey,
      key,
      value,
    };
    this.applyOp(op, this.replicaId);
  }

  applyLocalMapDelete(rootKey: string, key: string): void {
    const id = this.nextLamport();
    const op: Operation = {
      id,
      type: OpType.MapDelete,
      rootKey,
      key,
    };
    this.applyOp(op, this.replicaId);
  }

  getMapValue(rootKey: string, key: string): unknown {
    const map = this.maps.get(rootKey);
    if (!map) return undefined;
    const entry = map.get(key);
    if (!entry || entry.deleted) return undefined;
    return entry.value;
  }

  getMapSnapshot(rootKey: string): Record<string, unknown> {
    const res: Record<string, unknown> = {};
    const map = this.maps.get(rootKey);
    if (!map) return res;
    for (const [k, v] of map.entries()) {
      if (!v.deleted) {
        res[k] = v.value;
      }
    }
    return res;
  }

  // Internal Text operations
  private getVisibleTextNodes(rootKey: string): RgaNode<string>[] {
    const nodes = this.textNodes.get(rootKey);
    if (!nodes) return [];
    return nodes.filter((n) => !n.deleted);
  }

  applyLocalTextInsert(rootKey: string, index: number, content: string): void {
    const visible = this.getVisibleTextNodes(rootKey);
    if (index > visible.length) {
      throw new RangeError(`Index ${index} is out of bounds for text length ${visible.length}`);
    }
    const prevNode = index === 0 ? undefined : visible[index - 1];
    let prevId: LamportId | null = prevNode ? prevNode.id : null;

    for (const char of content) {
      const id = this.nextLamport();
      const op: Operation = {
        id,
        type: OpType.TextInsert,
        rootKey,
        value: char,
        prevId,
      };
      this.applyOp(op, this.replicaId);
      prevId = id;
    }
  }

  applyLocalTextDelete(rootKey: string, index: number, count: number): void {
    const visible = this.getVisibleTextNodes(rootKey);
    const end = Math.min(index + count, visible.length);
    for (let i = index; i < end; i++) {
      const targetNode = visible[i];
      if (!targetNode) continue;
      const id = this.nextLamport();
      const op: Operation = {
        id,
        type: OpType.TextDelete,
        rootKey,
        targetId: targetNode.id,
      };
      this.applyOp(op, this.replicaId);
    }
  }

  getTextSnapshot(rootKey: string): string {
    const nodes = this.textNodes.get(rootKey);
    if (!nodes) return "";
    let out = "";
    for (const node of nodes) {
      if (!node.deleted) {
        out += node.value;
      }
    }
    return out;
  }

  // Internal Counter operations
  applyLocalCounterAdd(rootKey: string, amount: number): void {
    const id = this.nextLamport();
    const op: Operation = {
      id,
      type: OpType.CounterAdd,
      rootKey,
      amount,
    };
    this.applyOp(op, this.replicaId);
  }

  getCounterValue(rootKey: string): number {
    const counts = this.counterValues.get(rootKey);
    if (!counts) return 0;
    let sum = 0;
    for (const val of counts.values()) {
      sum += val;
    }
    return sum;
  }

  // Internal List operations
  private getVisibleListNodes(rootKey: string): RgaNode<unknown>[] {
    const nodes = this.listNodes.get(rootKey);
    if (!nodes) return [];
    return nodes.filter((n) => !n.deleted);
  }

  applyLocalListInsert(rootKey: string, index: number, value: unknown): void {
    const visible = this.getVisibleListNodes(rootKey);
    if (index > visible.length) {
      throw new RangeError(`Index ${index} is out of bounds for list length ${visible.length}`);
    }
    const prevNode = index === 0 ? undefined : visible[index - 1];
    const prevId: LamportId | null = prevNode ? prevNode.id : null;
    const id = this.nextLamport();
    const op: Operation = {
      id,
      type: OpType.ListInsert,
      rootKey,
      value,
      prevId,
    };
    this.applyOp(op, this.replicaId);
  }

  applyLocalListDelete(rootKey: string, index: number, count: number): void {
    const visible = this.getVisibleListNodes(rootKey);
    const end = Math.min(index + count, visible.length);
    for (let i = index; i < end; i++) {
      const target = visible[i];
      if (!target) continue;
      const id = this.nextLamport();
      const op: Operation = {
        id,
        type: OpType.ListDelete,
        rootKey,
        targetId: target.id,
      };
      this.applyOp(op, this.replicaId);
    }
  }

  getListSnapshot(rootKey: string): unknown[] {
    const nodes = this.listNodes.get(rootKey);
    if (!nodes) return [];
    const out: unknown[] = [];
    for (const node of nodes) {
      if (!node.deleted) {
        out.push(node.value);
      }
    }
    return out;
  }

  /**
   * Insert a node into an RGA array respecting RGA tie-breaking rules.
   * Elements with the same predecessor are ordered by LamportId descending.
   * If a node is placed after a sibling, it must also be placed after all descendants of that sibling.
   */
  private insertRgaNode<T>(nodes: RgaNode<T>[], newNode: RgaNode<T>): void {
    let insertIdx = 0;
    const newPrevId = newNode.prevId;
    if (newPrevId !== null) {
      const prevIdx = nodes.findIndex(
        (n) => n.id.clock === newPrevId.clock && n.id.client === newPrevId.client,
      );
      insertIdx = prevIdx === -1 ? nodes.length : prevIdx + 1;
    }

    while (insertIdx < nodes.length) {
      const current = nodes[insertIdx];
      if (!current) break;

      // In RGA, if newNode has a higher Lamport timestamp than the sibling inserted at the same position,
      // newNode takes priority and is placed before that sibling (and before all its descendants).
      // If newNode has a lower Lamport timestamp, newNode must be placed after that sibling AND after
      // any descendants that were inserted after that sibling.
      const samePredecessor =
        newPrevId === null
          ? current.prevId === null
          : current.prevId !== null &&
            current.prevId.clock === newPrevId.clock &&
            current.prevId.client === newPrevId.client;

      if (samePredecessor) {
        if (compareLamportIds(newNode.id, current.id) > 0) {
          // newNode has higher priority than this sibling; insert before it
          break;
        }
        // newNode has lower priority; skip over this sibling and search past its subtree
        insertIdx++;
        while (insertIdx < nodes.length) {
          const next = nodes[insertIdx];
          if (!next) break;
          // Check if next is a sibling or beyond the subtree
          const nextSamePred =
            newPrevId === null
              ? next.prevId === null
              : next.prevId !== null &&
                next.prevId.clock === newPrevId.clock &&
                next.prevId.client === newPrevId.client;
          if (nextSamePred) {
            break;
          }
          // In RGA, descendants of an element have clocks that can't break out of the subtree
          // unless an element has a predecessor before newPrevId.
          // But any element inserted after `current` that is NOT a sibling with newPrevId
          // is either a descendant of current or a descendant of another element.
          // In standard RGA, we continue advancing while current node's origin is later than newPrevId.
          if (compareLamportIds(newNode.id, next.id) < 0) {
            insertIdx++;
          } else {
            break;
          }
        }
      } else {
        // current is not a sibling with newPrevId.
        // If newNode.id < current.id, newNode was created before current or concurrent with lower id,
        // so current remains ahead.
        if (compareLamportIds(newNode.id, current.id) < 0) {
          insertIdx++;
        } else {
          break;
        }
      }
    }
    nodes.splice(insertIdx, 0, newNode);
  }

  private applyOp(op: Operation, origin: string): void {
    const opKey = `${op.id.client}:${op.id.clock}`;
    if (this.operationIds.has(opKey)) {
      return;
    }
    this.operationIds.add(opKey);
    this.operations.push(op);

    if (op.id.clock > this.lamportClock) {
      this.lamportClock = op.id.clock;
    }
    const curKnown = this.stateVector.get(op.id.client) ?? 0;
    if (op.id.clock > curKnown) {
      this.stateVector.set(op.id.client, op.id.clock);
    }

    let path: string[] = [op.rootKey];

    switch (op.type) {
      case OpType.MapSet:
      case OpType.MapDelete: {
        this.rootTypes.set(op.rootKey, "map");
        let map = this.maps.get(op.rootKey);
        if (!map) {
          map = new Map();
          this.maps.set(op.rootKey, map);
        }
        const key = op.key ?? "";
        path = [op.rootKey, key];
        const existing = map.get(key);
        if (!existing || compareLamportIds(op.id, existing.lamport) > 0) {
          map.set(key, {
            lamport: op.id,
            deleted: op.type === OpType.MapDelete,
            value: op.value,
          });
        }
        break;
      }
      case OpType.TextInsert: {
        this.rootTypes.set(op.rootKey, "text");
        let nodes = this.textNodes.get(op.rootKey);
        if (!nodes) {
          nodes = [];
          this.textNodes.set(op.rootKey, nodes);
        }
        this.insertRgaNode(nodes, {
          id: op.id,
          prevId: op.prevId ?? null,
          value: op.value as string,
          deleted: false,
        });
        break;
      }
      case OpType.TextDelete: {
        this.rootTypes.set(op.rootKey, "text");
        const nodes = this.textNodes.get(op.rootKey);
        const targetId = op.targetId;
        if (nodes && targetId) {
          const target = nodes.find(
            (n) => n.id.clock === targetId.clock && n.id.client === targetId.client,
          );
          if (target) {
            target.deleted = true;
          }
        }
        break;
      }
      case OpType.CounterAdd: {
        this.rootTypes.set(op.rootKey, "counter");
        let counterMap = this.counterValues.get(op.rootKey);
        if (!counterMap) {
          counterMap = new Map();
          this.counterValues.set(op.rootKey, counterMap);
        }
        const current = counterMap.get(op.id.client) ?? 0;
        counterMap.set(op.id.client, current + (op.amount ?? 0));
        break;
      }
      case OpType.ListInsert: {
        this.rootTypes.set(op.rootKey, "list");
        let nodes = this.listNodes.get(op.rootKey);
        if (!nodes) {
          nodes = [];
          this.listNodes.set(op.rootKey, nodes);
        }
        this.insertRgaNode(nodes, {
          id: op.id,
          prevId: op.prevId ?? null,
          value: op.value,
          deleted: false,
        });
        break;
      }
      case OpType.ListDelete: {
        this.rootTypes.set(op.rootKey, "list");
        const nodes = this.listNodes.get(op.rootKey);
        const targetId = op.targetId;
        if (nodes && targetId) {
          const target = nodes.find(
            (n) => n.id.clock === targetId.clock && n.id.client === targetId.client,
          );
          if (target) {
            target.deleted = true;
          }
        }
        break;
      }
    }

    this.emitChange(origin, path);
  }

  encodeStateVector(): Uint8Array {
    const writer = new BinaryWriter();
    writer.writeVarUint(this.stateVector.size);
    for (const [client, clock] of this.stateVector.entries()) {
      writer.writeString(client);
      writer.writeVarUint(clock);
    }
    return writer.toUint8Array();
  }

  static decodeStateVector(bytes: Uint8Array): StateVector {
    const reader = new BinaryReader(bytes);
    const map: StateVector = new Map();
    const count = reader.readVarUint();
    for (let i = 0; i < count; i++) {
      const client = reader.readString();
      const clock = reader.readVarUint();
      map.set(client, clock);
    }
    return map;
  }

  encodeUpdate(sinceVectorBytes?: Uint8Array): Uint8Array {
    let sinceVector: StateVector | undefined;
    if (sinceVectorBytes && sinceVectorBytes.length > 0) {
      sinceVector = Doc.decodeStateVector(sinceVectorBytes);
    }

    const relevantOps = this.operations.filter((op) => {
      if (!sinceVector) return true;
      const knownClock = sinceVector.get(op.id.client) ?? 0;
      return op.id.clock > knownClock;
    });

    if (relevantOps.length === 0) {
      // Wire version 1, zero operations
      return new Uint8Array([WIRE_VERSION, 0]);
    }

    // Build string table to optimize payload size
    const stringTable: string[] = [];
    const stringIndices = new Map<string, number>();
    const getStringIdx = (str: string): number => {
      let idx = stringIndices.get(str);
      if (idx === undefined) {
        idx = stringTable.length;
        stringTable.push(str);
        stringIndices.set(str, idx);
      }
      return idx;
    };

    const bodyWriter = new BinaryWriter();
    for (const op of relevantOps) {
      bodyWriter.writeVarUint(op.type);
      bodyWriter.writeVarUint(getStringIdx(op.id.client));
      bodyWriter.writeVarUint(op.id.clock);
      bodyWriter.writeVarUint(getStringIdx(op.rootKey));

      switch (op.type) {
        case OpType.MapSet: {
          bodyWriter.writeVarUint(getStringIdx(op.key ?? ""));
          const jsonStr = JSON.stringify(op.value === undefined ? null : op.value);
          bodyWriter.writeString(jsonStr);
          break;
        }
        case OpType.MapDelete: {
          bodyWriter.writeVarUint(getStringIdx(op.key ?? ""));
          break;
        }
        case OpType.TextInsert: {
          bodyWriter.writeString(op.value as string);
          if (op.prevId === null || op.prevId === undefined) {
            bodyWriter.writeByte(0);
          } else {
            bodyWriter.writeByte(1);
            bodyWriter.writeVarUint(getStringIdx(op.prevId.client));
            bodyWriter.writeVarUint(op.prevId.clock);
          }
          break;
        }
        case OpType.TextDelete: {
          const targetId = op.targetId ?? { client: "", clock: 0 };
          bodyWriter.writeVarUint(getStringIdx(targetId.client));
          bodyWriter.writeVarUint(targetId.clock);
          break;
        }
        case OpType.CounterAdd: {
          bodyWriter.writeVarInt(op.amount ?? 0);
          break;
        }
        case OpType.ListInsert: {
          const jsonStr = JSON.stringify(op.value === undefined ? null : op.value);
          bodyWriter.writeString(jsonStr);
          if (op.prevId === null || op.prevId === undefined) {
            bodyWriter.writeByte(0);
          } else {
            bodyWriter.writeByte(1);
            bodyWriter.writeVarUint(getStringIdx(op.prevId.client));
            bodyWriter.writeVarUint(op.prevId.clock);
          }
          break;
        }
        case OpType.ListDelete: {
          const targetId = op.targetId ?? { client: "", clock: 0 };
          bodyWriter.writeVarUint(getStringIdx(targetId.client));
          bodyWriter.writeVarUint(targetId.clock);
          break;
        }
      }
    }

    const writer = new BinaryWriter();
    writer.writeByte(WIRE_VERSION);
    writer.writeVarUint(relevantOps.length);

    // Write string table
    writer.writeVarUint(stringTable.length);
    for (const str of stringTable) {
      writer.writeString(str);
    }

    // Write encoded ops
    writer.writeBytes(bodyWriter.toUint8Array());

    return writer.toUint8Array();
  }

  applyUpdate(update: Uint8Array): void {
    if (update.length > this.maxPayloadBytes) {
      throw new CrdtLimitError(
        `Binary payload size exceeds maxPayloadBytes limit of ${this.maxPayloadBytes}`,
        "payload_too_large",
      );
    }

    if (update.length < 2) {
      throw new CrdtDecodeError("Payload too short", "invalid_binary_format");
    }

    const reader = new BinaryReader(update);
    const version = reader.readByte();
    if (version !== WIRE_VERSION) {
      throw new CrdtDecodeError(`Unsupported wire version: ${version}`, "unsupported_wire_version");
    }

    const opCount = reader.readVarUint();
    if (opCount === 0) {
      return;
    }

    const stringCount = reader.readVarUint();
    const stringTable: string[] = [];
    for (let i = 0; i < stringCount; i++) {
      stringTable.push(reader.readString());
    }

    const getString = (idx: number): string => {
      const str = stringTable[idx];
      if (str === undefined) {
        throw new CrdtDecodeError(`Invalid string index: ${idx}`, "invalid_binary_format");
      }
      return str;
    };

    for (let i = 0; i < opCount; i++) {
      const opType = reader.readVarUint() as OpType;
      const client = getString(reader.readVarUint());
      validateReplicaId(client);
      const clock = reader.readVarUint();
      const rootKey = getString(reader.readVarUint());

      const id: LamportId = { client, clock };

      switch (opType) {
        case OpType.MapSet: {
          const key = getString(reader.readVarUint());
          const jsonStr = reader.readString();
          let value: unknown;
          try {
            value = JSON.parse(jsonStr);
          } catch {
            throw new CrdtDecodeError("Invalid JSON in MapSet operation", "invalid_binary_format");
          }
          this.applyOp({ id, type: opType, rootKey, key, value }, client);
          break;
        }
        case OpType.MapDelete: {
          const key = getString(reader.readVarUint());
          this.applyOp({ id, type: opType, rootKey, key }, client);
          break;
        }
        case OpType.TextInsert: {
          const val = reader.readString();
          const hasPrev = reader.readByte();
          let prevId: LamportId | null = null;
          if (hasPrev === 1) {
            const prevClient = getString(reader.readVarUint());
            const prevClock = reader.readVarUint();
            prevId = { client: prevClient, clock: prevClock };
          } else if (hasPrev !== 0) {
            throw new CrdtDecodeError("Invalid prevId flag", "invalid_binary_format");
          }
          this.applyOp({ id, type: opType, rootKey, value: val, prevId }, client);
          break;
        }
        case OpType.TextDelete: {
          const targetClient = getString(reader.readVarUint());
          const targetClock = reader.readVarUint();
          this.applyOp(
            { id, type: opType, rootKey, targetId: { client: targetClient, clock: targetClock } },
            client,
          );
          break;
        }
        case OpType.CounterAdd: {
          const amount = reader.readVarInt();
          this.applyOp({ id, type: opType, rootKey, amount }, client);
          break;
        }
        case OpType.ListInsert: {
          const jsonStr = reader.readString();
          let value: unknown;
          try {
            value = JSON.parse(jsonStr);
          } catch {
            throw new CrdtDecodeError(
              "Invalid JSON in ListInsert operation",
              "invalid_binary_format",
            );
          }
          const hasPrev = reader.readByte();
          let prevId: LamportId | null = null;
          if (hasPrev === 1) {
            const prevClient = getString(reader.readVarUint());
            const prevClock = reader.readVarUint();
            prevId = { client: prevClient, clock: prevClock };
          } else if (hasPrev !== 0) {
            throw new CrdtDecodeError("Invalid prevId flag", "invalid_binary_format");
          }
          this.applyOp({ id, type: opType, rootKey, value, prevId }, client);
          break;
        }
        case OpType.ListDelete: {
          const targetClient = getString(reader.readVarUint());
          const targetClock = reader.readVarUint();
          this.applyOp(
            { id, type: opType, rootKey, targetId: { client: targetClient, clock: targetClock } },
            client,
          );
          break;
        }
        default: {
          throw new CrdtDecodeError(`Unknown operation type: ${opType}`, "invalid_binary_format");
        }
      }
    }
  }

  toJSON(): Record<string, unknown> {
    const res: Record<string, unknown> = {};
    for (const [key, type] of this.rootTypes.entries()) {
      switch (type) {
        case "map":
          res[key] = this.getMapSnapshot(key);
          break;
        case "text":
          res[key] = this.getTextSnapshot(key);
          break;
        case "counter":
          res[key] = this.getCounterValue(key);
          break;
        case "list":
          res[key] = this.getListSnapshot(key);
          break;
      }
    }
    return res;
  }
}
