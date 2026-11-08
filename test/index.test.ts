import { describe, expect, it } from "vitest";
import { Doc } from "../src/index.js";

describe("Public API Exports", () => {
  it("exports Doc and exposes public methods", () => {
    const doc = new Doc("replica-root");
    expect(doc.replicaId).toBe("replica-root");
    expect(doc.getMap("map")).toBeDefined();
    expect(doc.getText("text")).toBeDefined();
    expect(doc.getCounter("counter")).toBeDefined();
    expect(doc.getList("list")).toBeDefined();
  });
});
