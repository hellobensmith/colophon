import { describe, expect, test } from "bun:test";
import { decodeDeltas, textAt } from "./corpus.ts";
import { VERSE_COUNT } from "./data/asv/text.ts";

describe("decodeDeltas", () => {
  test("decodes simple base‑36 deltas into cumulative values", () => {
    const result = decodeDeltas("1,2,3", 3);
    expect([...result]).toEqual([1, 3, 6]);
  });

  test("throws when the encoded part count does not match the expected length", () => {
    expect(() => decodeDeltas("a,b", 3)).toThrow();
  });
});

describe("textAt", () => {
  test("throws a RangeError for a sequence below 1", () => {
    expect(() => textAt(0, "asv")).toThrow(RangeError);
  });

  test("throws a RangeError for a sequence above VERSE_COUNT", () => {
    expect(() => textAt(VERSE_COUNT + 1, "asv")).toThrow(RangeError);
  });
});
