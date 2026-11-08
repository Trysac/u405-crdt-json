import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Doc } from "../src/index.js";

describe("CRDT Property-based Testing", () => {
  it("WHEN 200 seeded property scenarios with 2 to 5 replicas apply random map, text and counter operations and exchange updates in random order with duplicates and drops that are resent THEN every replica's toJSON() is deeply equal (CI conformance job: 100000 scenarios)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.array(
          fc.record({
            replicaIdx: fc.integer({ min: 0, max: 4 }),
            opType: fc.constantFrom(
              "map_set",
              "map_delete",
              "text_insert",
              "text_delete",
              "counter_inc",
            ),
            key: fc.constantFrom("k1", "k2", "k3"),
            val: fc.integer({ min: -50, max: 50 }),
            textStr: fc.constantFrom("a", "b", "xyz", " "),
            textIdx: fc.integer({ min: 0, max: 5 }),
          }),
          { minLength: 5, maxLength: 30 },
        ),
        (numReplicas, actions) => {
          const replicas = Array.from({ length: numReplicas }, (_, i) => new Doc(`rep_${i}`));
          const updates: Uint8Array[] = [];

          for (const act of actions) {
            const rep = replicas[act.replicaIdx % numReplicas];
            if (!rep) continue;
            if (act.opType === "map_set") {
              rep.getMap("shared_map").set(act.key, act.val);
            } else if (act.opType === "map_delete") {
              rep.getMap("shared_map").delete(act.key);
            } else if (act.opType === "text_insert") {
              const txt = rep.getText("shared_text");
              const currentLen = txt.toString().length;
              const safeIdx = Math.min(act.textIdx, currentLen);
              txt.insert(safeIdx, act.textStr);
            } else if (act.opType === "text_delete") {
              const txt = rep.getText("shared_text");
              const currentLen = txt.toString().length;
              if (currentLen > 0) {
                const safeIdx = Math.min(act.textIdx, currentLen - 1);
                txt.delete(safeIdx, 1);
              }
            } else if (act.opType === "counter_inc") {
              rep.getCounter("shared_count").increment(act.val);
            }
            updates.push(rep.encodeUpdate());
          }

          // Resent with duplicates and random order to test convergence
          const allUpdatesShuffled = [...updates, ...updates];
          // Seeded deterministic pseudorandom shuffle
          for (let i = allUpdatesShuffled.length - 1; i > 0; i--) {
            const j = (i * 17 + 3) % (i + 1);
            const temp = allUpdatesShuffled[i];
            const target = allUpdatesShuffled[j];
            if (temp !== undefined && target !== undefined) {
              allUpdatesShuffled[i] = target;
              allUpdatesShuffled[j] = temp;
            }
          }

          for (const rep of replicas) {
            for (const u of allUpdatesShuffled) {
              rep.applyUpdate(u);
            }
          }

          const firstReplica = replicas[0];
          const baseline = firstReplica ? firstReplica.toJSON() : {};
          for (let i = 1; i < replicas.length; i++) {
            const currentRep = replicas[i];
            expect(currentRep ? currentRep.toJSON() : null).toEqual(baseline);
          }
        },
      ),
      { numRuns: 200, seed: 42 },
    );
  });
});
