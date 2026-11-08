import { describe, expect, it } from "vitest";
import { Doc } from "../src/index.js";

describe("Conformance Tier (CI only)", () => {
  it("runs text interleaving and cyclic replica synchronization scenarios", () => {
    const reps = ["r1", "r2", "r3"].map((id) => new Doc(id));
    const rep0 = reps[0];
    const rep1 = reps[1];
    const rep2 = reps[2];
    if (!rep0 || !rep1 || !rep2) {
      throw new Error("Replicas missing");
    }

    for (let round = 0; round < 50; round++) {
      rep0.getText("txt").insert(0, `A${round}`);
      rep1.getText("txt").insert(0, `B${round}`);
      rep2.getText("txt").insert(0, `C${round}`);

      const u0 = rep0.encodeUpdate();
      const u1 = rep1.encodeUpdate();
      const u2 = rep2.encodeUpdate();

      rep0.applyUpdate(u1);
      rep0.applyUpdate(u2);
      rep1.applyUpdate(u0);
      rep1.applyUpdate(u2);
      rep2.applyUpdate(u0);
      rep2.applyUpdate(u1);
    }

    expect(rep0.toJSON()).toEqual(rep1.toJSON());
    expect(rep1.toJSON()).toEqual(rep2.toJSON());
  });
});
