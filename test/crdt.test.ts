import { describe, expect, it } from "vitest";
import { BinaryReader, BinaryWriter } from "../src/encoding.js";
import { CrdtDecodeError, CrdtError, CrdtKeyError, CrdtLimitError, Doc } from "../src/index.js";

describe("CRDT Specification & Acceptance Tests", () => {
  it("WHEN replica 'a' sets key 'k' to 1 and replica 'b' sets 'k' to 2 concurrently with equal Lamport clocks THEN after exchanging updates both toJSON() return { k: 2 } (the greater replica id wins ties)", () => {
    const docA = new Doc("a");
    const docB = new Doc("b");

    const mapA = docA.getMap("k_map");
    const mapB = docB.getMap("k_map");

    // Both apply locally with clock = 1
    mapA.set("k", 1);
    mapB.set("k", 2);

    const updateA = docA.encodeUpdate();
    const updateB = docB.encodeUpdate();

    docA.applyUpdate(updateB);
    docB.applyUpdate(updateA);

    expect(docA.toJSON().k_map).toEqual({ k: 2 });
    expect(docB.toJSON().k_map).toEqual({ k: 2 });
    expect(mapA.get("k")).toBe(2);
    expect(mapB.get("k")).toBe(2);
  });

  it("WHEN replica A inserts 'world' at index 0 and replica B inserts 'hello ' at index 0 concurrently THEN text sequences do not interleave individual characters and converge to either 'hello world' or 'worldhello ' deterministically across both replicas", () => {
    const docA = new Doc("A");
    const docB = new Doc("B");

    const textA = docA.getText("content");
    const textB = docB.getText("content");

    textA.insert(0, "world");
    textB.insert(0, "hello ");

    const updateA = docA.encodeUpdate();
    const updateB = docB.encodeUpdate();

    docA.applyUpdate(updateB);
    docB.applyUpdate(updateA);

    const valA = textA.toString();
    const valB = textB.toString();

    expect(valA).toBe(valB);
    expect(["hello world", "worldhello "]).toContain(valA);
  });

  it("WHEN the same update bytes are applied 3 times THEN toJSON() and encodeStateVector() equal the result of applying them once (idempotence)", () => {
    const docA = new Doc("a");
    const textA = docA.getText("notes");
    textA.insert(0, "idempotent test");
    const update = docA.encodeUpdate();

    const docB = new Doc("b");
    docB.applyUpdate(update);
    const singleJson = docB.toJSON();
    const singleVector = docB.encodeStateVector();

    docB.applyUpdate(update);
    docB.applyUpdate(update);

    expect(docB.toJSON()).toEqual(singleJson);
    expect(docB.encodeStateVector()).toEqual(singleVector);
  });

  it("WHEN doc.encodeUpdate(doc.encodeStateVector()) is called on a document THEN it returns the empty update Uint8Array [1, 0] (wire version 1, zero operations) and applying it changes nothing", () => {
    const doc = new Doc("a");
    const map = doc.getMap("meta");
    map.set("active", true);

    const stateVec = doc.encodeStateVector();
    const emptyUpdate = doc.encodeUpdate(stateVec);

    expect(emptyUpdate).toEqual(new Uint8Array([1, 0]));

    const beforeJson = doc.toJSON();
    doc.applyUpdate(emptyUpdate);
    expect(doc.toJSON()).toEqual(beforeJson);
  });

  it("IF doc.applyUpdate(bytes) receives malformed binary payload THEN it raises CrdtDecodeError with code 'invalid_binary_format'", () => {
    const doc = new Doc("a");
    expect(() => {
      doc.applyUpdate(new Uint8Array([1])); // Length < 2
    }).toThrow(CrdtDecodeError);

    expect(() => {
      doc.applyUpdate(new Uint8Array([1, 2, 255])); // Incomplete truncated payload
    }).toThrowError(expect.objectContaining({ code: "invalid_binary_format" }));
  });

  it("WHEN a CCounter receives 5 increments of 2 and 3 decrements of 1 across 3 replicas THEN doc.toJSON()['count'] evaluates exactly to 7 across all synchronized peers", () => {
    const doc1 = new Doc("p1");
    const doc2 = new Doc("p2");
    const doc3 = new Doc("p3");

    const c1 = doc1.getCounter("count");
    const c2 = doc2.getCounter("count");
    const c3 = doc3.getCounter("count");

    // 5 increments of 2 = +10, 3 decrements of 1 = -3. Total = 7.
    // Distribute across 3 peers:
    c1.increment(2);
    c2.increment(2);
    c3.increment(2);
    c1.increment(2);
    c2.increment(2);

    c3.decrement(1);
    c1.decrement(1);
    c2.decrement(1);

    // Exchange updates among all 3
    const u1 = doc1.encodeUpdate();
    const u2 = doc2.encodeUpdate();
    const u3 = doc3.encodeUpdate();

    doc1.applyUpdate(u2);
    doc1.applyUpdate(u3);

    doc2.applyUpdate(u1);
    doc2.applyUpdate(u3);

    doc3.applyUpdate(u1);
    doc3.applyUpdate(u2);

    expect(doc1.toJSON().count).toBe(7);
    expect(doc2.toJSON().count).toBe(7);
    expect(doc3.toJSON().count).toBe(7);
    expect(c1.value).toBe(7);
    expect(c2.value).toBe(7);
    expect(c3.value).toBe(7);
  });

  it("IF binary payload size exceeds maxPayloadBytes limit of 16777216 THEN doc.applyUpdate raises CrdtLimitError with code 'payload_too_large'", () => {
    const doc = new Doc("a", { maxPayloadBytes: 16_777_216 });
    // Boundary test at 16_777_217 bytes
    const largePayload = new Uint8Array(16_777_217);
    expect(() => {
      doc.applyUpdate(largePayload);
    }).toThrowError(expect.objectContaining({ code: "payload_too_large" }));
  });

  it("WHEN doc.encodeUpdate() is applied to a new Doc('b') THEN its toJSON() deeply equals the source document's toJSON()", () => {
    const docA = new Doc("a");
    const map = docA.getMap("settings");
    map.set("theme", "dark");
    map.set("fontSize", 14);

    const text = docA.getText("title");
    text.insert(0, "CRDT JSON");

    const counter = docA.getCounter("views");
    counter.increment(42);

    const list = docA.getList("items");
    list.insert(0, "first");
    list.insert(1, "second");

    const update = docA.encodeUpdate();
    const docB = new Doc("b");
    docB.applyUpdate(update);

    expect(docB.toJSON()).toEqual(docA.toJSON());
  });
});

describe("Error handling and limits", () => {
  it("validates replicaId format and bounds", () => {
    expect(() => new Doc("")).toThrow(CrdtKeyError);
    expect(() => new Doc("a".repeat(65))).toThrow(CrdtKeyError);
    expect(() => new Doc(null as unknown as string)).toThrow(CrdtKeyError);
  });

  it("enforces maximum nesting depth", () => {
    const doc = new Doc("a");
    const map = doc.getMap("nested");

    type RecursiveObj = { child?: RecursiveObj };
    const deepObj: RecursiveObj = {};
    let cur = deepObj;
    for (let i = 0; i < 35; i++) {
      cur.child = {};
      cur = cur.child;
    }

    expect(() => {
      map.set("tooDeep", deepObj);
    }).toThrow(CrdtLimitError);
  });

  it("throws unsupported_wire_version on invalid version byte", () => {
    const doc = new Doc("a");
    expect(() => {
      doc.applyUpdate(new Uint8Array([99, 0]));
    }).toThrowError(expect.objectContaining({ code: "unsupported_wire_version" }));
  });

  it("throws type_mismatch when root key has different type", () => {
    const doc = new Doc("a");
    const map = doc.getMap("shared");
    map.set("init", true);
    expect(() => {
      doc.getText("shared");
    }).toThrow(CrdtKeyError);
    expect(() => {
      doc.getCounter("shared");
    }).toThrow(CrdtKeyError);
    expect(() => {
      doc.getList("shared");
    }).toThrow(CrdtKeyError);
  });

  it("handles map deletion and change listeners", () => {
    const doc = new Doc("a");
    const changes: string[][] = [];
    const unsub = doc.on("change", (d) => {
      changes.push(d.path);
    });

    const map = doc.getMap("users");
    map.set("alice", { active: true });
    expect(map.get("alice")).toEqual({ active: true });

    map.delete("alice");
    expect(map.get("alice")).toBeUndefined();
    expect(map.toJSON()).toEqual({});

    unsub();
    map.set("bob", { active: false });
    // Listener should not record bob after unsubscribe
    expect(changes.length).toBe(2);
  });

  it("handles text deletion and bounds", () => {
    const doc = new Doc("a");
    const text = doc.getText("article");
    text.insert(0, "Hello cruel world");
    text.delete(5, 6); // delete ' cruel'
    expect(text.toString()).toBe("Hello world");

    expect(() => text.insert(-1, "fail")).toThrow(RangeError);
    expect(() => text.insert(999, "fail")).toThrow(RangeError);
    expect(() => text.delete(-1, 1)).toThrow(RangeError);
    expect(() => text.delete(0, -1)).toThrow(RangeError);
  });

  it("handles list insertion, deletion, and bounds", () => {
    const doc = new Doc("a");
    const list = doc.getList("tags");
    list.insert(0, "tag1");
    list.insert(1, "tag2");
    list.insert(2, "tag3");
    expect(list.toArray()).toEqual(["tag1", "tag2", "tag3"]);

    list.delete(1, 1); // remove 'tag2'
    expect(list.toArray()).toEqual(["tag1", "tag3"]);

    expect(() => list.insert(-1, "bad")).toThrow(RangeError);
    expect(() => list.insert(999, "bad")).toThrow(RangeError);
    expect(() => list.delete(-1, 1)).toThrow(RangeError);
    expect(() => list.delete(0, -1)).toThrow(RangeError);
  });

  it("handles CrdtError base properties and message truncation", () => {
    const longMsg = "X".repeat(250);
    const err = new CrdtError(longMsg, "custom_code");
    expect(err.code).toBe("custom_code");
    expect(err.message.length).toBe(200);
    expect(err.message.endsWith("...")).toBe(true);
  });

  it("covers additional branches in CMap, CText, CCounter, CList and Doc", () => {
    const doc = new Doc("cov");
    const map = doc.getMap("cov_map");
    expect(() => map.set(123 as unknown as string, "val")).toThrow(TypeError);
    expect(() => map.delete(123 as unknown as string)).toThrow(TypeError);
    expect(map.get("nonexistent")).toBeUndefined();

    const text = doc.getText("cov_text");
    text.insert(0, ""); // empty content early return
    text.delete(0, 0); // 0 count early return
    expect(() => text.insert(0, 123 as unknown as string)).toThrow(TypeError);
    expect(() => text.delete("bad" as unknown as number, 1)).toThrow(RangeError);
    expect(() => text.delete(0, "bad" as unknown as number)).toThrow(RangeError);

    const counter = doc.getCounter("cov_counter");
    expect(() => counter.increment(Number.NaN)).toThrow(TypeError);
    expect(() => counter.decrement(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(doc.getCounter("nonexistent_counter").value).toBe(0);

    const list = doc.getList("cov_list");
    list.delete(0, 0); // 0 count early return
    expect(() => list.insert("bad" as unknown as number, "val")).toThrow(RangeError);
    expect(() => list.delete("bad" as unknown as number, 1)).toThrow(RangeError);
    expect(() => list.delete(0, "bad" as unknown as number)).toThrow(RangeError);
    expect(doc.getList("nonexistent_list").toArray()).toEqual([]);
    expect(doc.getText("nonexistent_text").toString()).toBe("");
    expect(doc.getMap("nonexistent_map").toJSON()).toEqual({});

    expect(() => doc.on("invalid" as "change", () => {})).toThrow();

    // Listener throwing error handled gracefully
    doc.on("change", () => {
      throw new Error("listener boom");
    });
    map.set("key", "val");

    // Array nesting validation
    expect(() => {
      let arr: unknown[] = [];
      const root = arr;
      for (let i = 0; i < 35; i++) {
        const next: unknown[] = [];
        arr.push(next);
        arr = next;
      }
      map.set("deepArr", root);
    }).toThrow(CrdtLimitError);
  });

  it("covers binary encoding and decoding edge cases", () => {
    const docA = new Doc("covA");
    const docB = new Doc("covB");

    // List operations sync
    const listA = docA.getList("cov_list");
    listA.insert(0, "item1");
    listA.insert(1, "item2");
    listA.delete(0, 1);

    const upA = docA.encodeUpdate();
    docB.applyUpdate(upA);
    expect(docB.getList("cov_list").toArray()).toEqual(["item2"]);

    // Malformed List / prevId
    // Corrupt prevId flag in update
    // Unknown operation type in update
    const corruptOpTypeDoc = new Doc("dec");
    // Wire version 1, 1 op, 1 string in table ("client"), opType 99 (unknown)
    // Format: [1, opCount=1, stringCount=1, strLen=4, 'c','o','v','A', opType=99]
    const writer = new Uint8Array([
      1, // version 1
      1, // 1 op
      1, // 1 string in table
      4,
      99,
      111,
      118,
      65, // "covA"
      99, // unknown opType
      0, // client string index 0
      1, // clock
      0, // rootKey string index 0
    ]);
    expect(() => corruptOpTypeDoc.applyUpdate(writer)).toThrow(CrdtDecodeError);

    // ListDelete in applyUpdate
    const listDelUpdate = new Uint8Array([
      1, // version 1
      1, // 1 op
      2, // 2 strings
      4,
      99,
      111,
      118,
      65, // "covA"
      4,
      108,
      105,
      115,
      116, // "list"
      7, // ListDelete opType
      0, // client string index 0
      2, // clock
      1, // rootKey string index 1
      0, // target client string index 0
      1, // target clock 1
    ]);
    const listDoc = new Doc("covA");
    listDoc.applyUpdate(listDelUpdate);

    // Descendant insertion in RGA
    const docRga1 = new Doc("rep1");
    const docRga2 = new Doc("rep2");
    const t1 = docRga1.getText("txt");
    t1.insert(0, "a");
    // Sync to rep2
    docRga2.applyUpdate(docRga1.encodeUpdate());
    const t2 = docRga2.getText("txt");
    t1.insert(1, "b");
    t1.insert(2, "c");
    t2.insert(0, "x");
    docRga1.applyUpdate(docRga2.encodeUpdate());
    docRga2.applyUpdate(docRga1.encodeUpdate());
    expect(t1.toString()).toBe(t2.toString());

    // Invalid prevId flag for TextInsert (neither 0 nor 1, say 2)
    const corruptPrevIdText = new Uint8Array([
      1, // version
      1, // 1 op
      2, // 2 strings
      4,
      99,
      111,
      118,
      65, // "covA"
      3,
      116,
      120,
      116, // "txt"
      3, // TextInsert OpType
      0, // client idx 0
      1, // clock 1
      1, // rootKey idx 1
      1,
      97, // text value "a"
      2, // invalid hasPrev flag (2)
    ]);
    expect(() => corruptOpTypeDoc.applyUpdate(corruptPrevIdText)).toThrow(CrdtDecodeError);

    // Invalid prevId flag for ListInsert
    const corruptPrevIdList = new Uint8Array([
      1, // version
      1, // 1 op
      2, // 2 strings
      4,
      99,
      111,
      118,
      65, // "covA"
      4,
      108,
      105,
      115,
      116, // "list"
      6, // ListInsert OpType
      0, // client idx 0
      1, // clock 1
      1, // rootKey idx 1
      4,
      34,
      120,
      34, // json string '"x"'
      2, // invalid hasPrev flag (2)
    ]);
    expect(() => corruptOpTypeDoc.applyUpdate(corruptPrevIdList)).toThrow(CrdtDecodeError);

    // Invalid JSON in MapSet
    const corruptJsonMap = new Uint8Array([
      1, // version
      1, // 1 op
      3, // 3 strings
      4,
      99,
      111,
      118,
      65, // "covA"
      3,
      109,
      97,
      112, // "map"
      1,
      107, // "k"
      1, // MapSet OpType
      0, // client idx 0
      1, // clock 1
      1, // rootKey idx 1
      2, // key idx 2
      1,
      123, // json string "{" (invalid JSON)
    ]);
    expect(() => corruptOpTypeDoc.applyUpdate(corruptJsonMap)).toThrow(CrdtDecodeError);

    // Invalid JSON in ListInsert
    const corruptJsonList = new Uint8Array([
      1, // version
      1, // 1 op
      2, // 2 strings
      4,
      99,
      111,
      118,
      65, // "covA"
      4,
      108,
      105,
      115,
      116, // "list"
      6, // ListInsert OpType
      0, // client idx 0
      1, // clock 1
      1, // rootKey idx 1
      1,
      123, // json string "{" (invalid JSON)
    ]);
    expect(() => corruptOpTypeDoc.applyUpdate(corruptJsonList)).toThrow(CrdtDecodeError);

    // Invalid string index in payload
    const corruptStringIdx = new Uint8Array([
      1, // version
      1, // 1 op
      1, // 1 string
      1,
      97, // "a"
      1, // MapSet
      5, // string idx 5 (out of bounds)
      1,
      0,
    ]);
    expect(() => corruptOpTypeDoc.applyUpdate(corruptStringIdx)).toThrow(CrdtDecodeError);
  });

  it("covers encoding reader/writer errors and edge cases", () => {
    const bw = new BinaryWriter();
    expect(() => bw.writeVarUint(-1)).toThrow(RangeError);
    expect(() => bw.writeVarUint(Number.NaN)).toThrow(RangeError);
    expect(() => bw.writeVarInt(Number.NaN)).toThrow(RangeError);

    // BinaryReader errors
    const brEmpty = new BinaryReader(new Uint8Array([]));
    expect(() => brEmpty.readByte()).toThrow(CrdtDecodeError);
    expect(() => brEmpty.readVarUint()).toThrow(CrdtDecodeError);
    expect(() => brEmpty.readBytes(5)).toThrow(CrdtDecodeError);
    expect(() => brEmpty.readBytes(-1)).toThrow(CrdtDecodeError);

    // Varint overflow (> 5 bytes with high bit set)
    const brOverflow = new BinaryReader(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80]));
    expect(() => brOverflow.readVarUint()).toThrow(CrdtDecodeError);

    // Malformed UTF-8 string
    const bwBad = new BinaryWriter();
    bwBad.writeVarUint(2);
    bwBad.writeByte(0xff);
    bwBad.writeByte(0xff);
    const brBadUtf8 = new BinaryReader(bwBad.toUint8Array());
    expect(() => brBadUtf8.readString()).toThrow(CrdtDecodeError);
  });
});
