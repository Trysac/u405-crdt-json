/**
 * Public entry point of @trysac/crdt-json.
 *
 * Zero-runtime-dependency conflict-free replicated JSON document with maps, RGA sequences, PN-counters,
 * state-vector synchronization, and compact binary encoding.
 */

export {
  CCounter,
  CList,
  CMap,
  CText,
  DEFAULT_MAX_NESTING_DEPTH,
  DEFAULT_MAX_PAYLOAD_BYTES,
  Doc,
  type DocOptions,
  MAX_REPLICA_ID_BYTES,
} from "./crdt.js";

export {
  CrdtDecodeError,
  CrdtError,
  CrdtKeyError,
  CrdtLimitError,
} from "./errors.js";

export { type LamportId, OpType, type StateVector } from "./types.js";
