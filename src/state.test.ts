/**
 * Keeps `docs/STATE.md` honest.
 *
 * STATE.md exists so a new session does not re-derive anything, which only
 * works if what it says is true. Prose does not rot loudly: this file has
 * claimed 186 tests when there were 214, and "seven" deuterocanonical books
 * when `canon.ts` says ten. Nobody noticed until someone read carefully.
 *
 * So the facts that can be checked exactly are checked here, and drift fails
 * the same suite that a broken parser would. Two rules keep this from becoming
 * busywork:
 *
 * - **Only pin what is stable.** The test *count* is deliberately not checked;
 *   it changes on almost every commit and tells a reader nothing a `bun test`
 *   would not. A number that must be edited constantly gets edited carelessly.
 * - **A missing claim fails too.** Deleting the row is not a way to pass.
 *
 * When one of these fails, the file is wrong more often than the code is.
 * Correct STATE.md in place — do not append an erratum, and do not edit the
 * expected value here to match. Git history is the record of what changed.
 */
import { describe, expect, test } from "bun:test";
import { BOOKS } from "./canon.ts";
import { TOTAL_VERSES } from "./corpus.ts";
import { versificationOf, TRANSLATION_IDS, DEFAULT_TRANSLATION } from "./translations.ts";
import { REVISION_ID, GENERATION_ID } from "./data/meta.ts";

const STATE = await Bun.file(
  new URL("../docs/STATE.md", import.meta.url),
).text();

/**
 * Pulls one row out of the checked-facts table. Throws rather than returning
 * undefined so a deleted row reads as a failure with a usable message.
 */
function claimed(fact: string): string {
  const row = new RegExp(
    `^\\|\\s*${fact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\|\\s*([^|]+?)\\s*\\|`,
    "m",
  ).exec(STATE);

  if (row === null) {
    throw new Error(
      `docs/STATE.md has no "${fact}" row in the checked-facts table. ` +
        `If the fact is genuinely gone, remove its assertion here too — ` +
        `but do not delete the row to make this pass.`,
    );
  }

  return row[1]!.replace(/`/g, "").trim();
}

describe("docs/STATE.md matches the code it describes", () => {
  test("ASV verse count", () => {
    expect(claimed("ASV verses")).toBe(TOTAL_VERSES.toLocaleString("en-US"));
  });

  test("ASV book count", () => {
    const books = versificationOf(DEFAULT_TRANSLATION).order.length;
    expect(claimed("ASV books")).toBe(String(books));
  });

  test("books carrying metadata only", () => {
    const count = [...BOOKS.values()].filter(
      (book) => book.dataAvailability === "metadata_only",
    ).length;
    expect(claimed("Books with metadata only")).toBe(String(count));
  });

  test("registered translations", () => {
    expect(claimed("Registered translations")).toBe(TRANSLATION_IDS.join(", "));
  });

  // The identifiers are the one thing a saved coordinate binds to, so a stale
  // value here is worse than a stale number elsewhere.
  test("REVISION_ID prefix", () => {
    expect(REVISION_ID.startsWith(claimed("REVISION_ID").replace(/…$/, ""))).toBe(true);
  });

  test("GENERATION_ID prefix", () => {
    expect(GENERATION_ID.startsWith(claimed("GENERATION_ID").replace(/…$/, ""))).toBe(true);
  });
});

describe("STATE.md keeps the shape the checker depends on", () => {
  test("the checked-facts table is present and points at this file", () => {
    expect(STATE).toContain("src/state.test.ts");
  });

  test("no erratum blocks — corrections belong in place, not appended", () => {
    // "Correction:" / "Corrected above:" stack up and leave the wrong claim in
    // the file. Fix the sentence that is wrong instead.
    expect(STATE).not.toMatch(/^\*\*Correct(ion|ed above)/m);
  });
});
