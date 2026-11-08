/**
 * Base error class for all CRDT errors.
 */
export class CrdtError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    const safeMessage = message.length > 200 ? `${message.slice(0, 197)}...` : message;
    super(safeMessage);
    this.name = "CrdtError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when binary decoding fails or unsupported wire version is encountered.
 */
export class CrdtDecodeError extends CrdtError {
  constructor(message: string, code: "invalid_binary_format" | "unsupported_wire_version") {
    super(message, code);
    this.name = "CrdtDecodeError";
  }
}

/**
 * Error thrown when input size, payload size, or nesting exceeds limits.
 */
export class CrdtLimitError extends CrdtError {
  constructor(message: string, code: "payload_too_large" | "max_nesting_exceeded") {
    super(message, code);
    this.name = "CrdtLimitError";
  }
}

/**
 * Error thrown when an invalid replica ID or mismatched CRDT type is accessed.
 */
export class CrdtKeyError extends CrdtError {
  constructor(message: string, code: "invalid_replica_id" | "type_mismatch") {
    super(message, code);
    this.name = "CrdtKeyError";
  }
}
