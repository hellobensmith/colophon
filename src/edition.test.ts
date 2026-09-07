import { describe, expect, test } from "bun:test";
import {
  BOOKS,
  CANON_ORDER,
  EDITION_ORDER,
  EDITIONS,
  canonPosition,
  editionPosition,
  isEdition,
  PROTESTANT_ORDER,
} from "./canon.ts";

/**
 * Tradition order and edition order answer different questions and must not be
 * collapsed into one field. These tests exist to make a future collapse fail
 * loudly rather than quietly reorder what a source prints.
 */
describe("edition order is not tradition order", () => {
  test("the DRA carries the 73 books its source parses to", () => {
    expect(EDITION_ORDER.dra).toHaveLength(73);
    expect(new Set(EDITION_ORDER.dra).size).toBe(73);
    for (const id of EDITION_ORDER.dra) expect(BOOKS.has(id)).toBe(true);
  });

  test("the ASV edition is the 66-book Protestant order", () => {
    expect(EDITION_ORDER.asv).toEqual(PROTESTANT_ORDER);
    expect(EDITION_ORDER.asv).toHaveLength(66);
  });

  test("the DRA prints its whole deuterocanon after Malachi", () => {
    const order = EDITION_ORDER.dra;
    const malachi = order.indexOf("MAL");
    const matthew = order.indexOf("MAT");
    expect(malachi).toBeGreaterThan(-1);
    for (const id of ["TOB", "JDT", "WIS", "SIR", "BAR", "1MA", "2MA"]) {
      const at = order.indexOf(id);
      expect(at).toBeGreaterThan(malachi);
      expect(at).toBeLessThan(matthew);
    }
  });

  test("and the Catholic tradition interleaves it instead — the orders disagree", () => {
    // Tobit sits after Nehemiah in the NABRE enumeration and after Malachi as
    // the Douay-Rheims prints it. If these ever agree, one of them has been
    // quietly rewritten to match the other.
    const tobitByTradition = canonPosition("TOB", "catholic");
    const tobitByEdition = editionPosition("TOB", "dra");
    expect(tobitByTradition).not.toBe(tobitByEdition);
    expect(CANON_ORDER.catholic.indexOf("TOB")).toBeLessThan(
      CANON_ORDER.catholic.indexOf("MAL"),
    );
    expect(EDITION_ORDER.dra.indexOf("TOB")).toBeGreaterThan(
      EDITION_ORDER.dra.indexOf("MAL"),
    );
  });

  test("a book absent from an edition has no position in it", () => {
    expect(editionPosition("TOB", "asv")).toBeNull();
    expect(editionPosition("3MA", "dra")).toBeNull();
    expect(editionPosition("GEN", "asv")).toBe(1);
    expect(editionPosition("GEN", "dra")).toBe(1);
  });

  test("edition ids are validated, not trusted", () => {
    for (const id of EDITIONS) expect(isEdition(id)).toBe(true);
    for (const bad of ["ASV", "kjv", "", "__proto__"]) expect(isEdition(bad)).toBe(false);
  });
});
