# Security

## Threat Model

### Defended

- **Payload Injection**: Binary updates are strictly bounds-checked. Payloads exceeding `maxPayloadBytes` (16 MiB) are rejected before memory allocation.
- **Depth Bombs**: Recursive structure validation prevents call stack overflows during update processing (limit: 32 nesting levels).
- **Malformed Input**: Invalid wire versions, malformed varints, invalid string table indices, or truncated payloads trigger specific error types (`CrdtDecodeError`, `CrdtLimitError`).
- **Replica ID Spoofing**: Invalid or oversized (64+ bytes) replica IDs are rejected via `CrdtKeyError`.

### Not Defended

- **Malicious Operations**: This library does not provide BFT (Byzantine Fault Tolerance) or cryptographic signatures; any peer with access to the sync stream can inject operations into the document state.
- **Rich Text Formatting**: Does not support cryptographically verified document editing or complex formatting permission models.
