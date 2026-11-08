import { CrdtDecodeError, CrdtLimitError } from "./errors.js";

const MAX_VARINT_BYTES = 5;
const MAX_STRING_LENGTH = 16_777_216;

/**
 * Binary writer helper for varints and byte arrays.
 */
export class BinaryWriter {
  private buffer: Uint8Array;
  private offset = 0;

  constructor(initialCapacity = 256) {
    this.buffer = new Uint8Array(initialCapacity);
  }

  private ensureCapacity(additionalBytes: number): void {
    const required = this.offset + additionalBytes;
    if (required <= this.buffer.length) return;
    const nextSize = Math.max(this.buffer.length * 2, required);
    const next = new Uint8Array(nextSize);
    next.set(this.buffer.subarray(0, this.offset));
    this.buffer = next;
  }

  writeByte(val: number): void {
    this.ensureCapacity(1);
    this.buffer[this.offset++] = val & 0xff;
  }

  writeVarUint(val: number): void {
    if (val < 0 || !Number.isSafeInteger(val)) {
      throw new RangeError("Expected non-negative safe integer");
    }
    this.ensureCapacity(MAX_VARINT_BYTES);
    let v = val;
    while (v >= 0x80) {
      this.buffer[this.offset++] = (v & 0x7f) | 0x80;
      v = Math.floor(v / 128);
    }
    this.buffer[this.offset++] = v & 0x7f;
  }

  writeVarInt(val: number): void {
    if (!Number.isSafeInteger(val)) {
      throw new RangeError("Expected safe integer");
    }
    // ZigZag encoding
    const zigZag = val >= 0 ? val * 2 : -val * 2 - 1;
    this.writeVarUint(zigZag);
  }

  writeBytes(bytes: Uint8Array): void {
    this.ensureCapacity(bytes.length);
    this.buffer.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  writeString(str: string): void {
    const encoded = new TextEncoder().encode(str);
    this.writeVarUint(encoded.length);
    this.writeBytes(encoded);
  }

  toUint8Array(): Uint8Array {
    return this.buffer.subarray(0, this.offset).slice();
  }
}

/**
 * Binary reader helper for varints and byte arrays.
 */
export class BinaryReader {
  private buffer: Uint8Array;
  private offset = 0;

  constructor(bytes: Uint8Array) {
    this.buffer = bytes;
  }

  get remaining(): number {
    return this.buffer.length - this.offset;
  }

  readByte(): number {
    const byte = this.buffer[this.offset];
    if (byte === undefined) {
      throw new CrdtDecodeError("Unexpected EOF reading byte", "invalid_binary_format");
    }
    this.offset++;
    return byte;
  }

  readVarUint(): number {
    let result = 0;
    let shift = 0;
    let bytesRead = 0;

    while (true) {
      const byte = this.buffer[this.offset];
      if (byte === undefined) {
        throw new CrdtDecodeError("Unexpected EOF reading varint", "invalid_binary_format");
      }
      this.offset++;
      bytesRead++;
      if (bytesRead > MAX_VARINT_BYTES) {
        throw new CrdtDecodeError("Varint overflow", "invalid_binary_format");
      }
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  }

  readVarInt(): number {
    const raw = this.readVarUint();
    return raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
  }

  readBytes(length: number): Uint8Array {
    if (length < 0 || this.offset + length > this.buffer.length) {
      throw new CrdtDecodeError("Unexpected EOF reading bytes", "invalid_binary_format");
    }
    const slice = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  readString(): string {
    const len = this.readVarUint();
    if (len > MAX_STRING_LENGTH) {
      throw new CrdtLimitError("String length exceeds limit", "payload_too_large");
    }
    const bytes = this.readBytes(len);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new CrdtDecodeError("Malformed UTF-8 string", "invalid_binary_format");
    }
  }
}
