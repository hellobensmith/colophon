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
import { existsSync } from "node:fs";
import { BOOKS } from "./canon.ts";
import { totalVersesOf } from "./corpus.ts";
import { versificationOf, TRANSLATION_IDS, DEFAULT_TRANSLATION } from "./translations.ts";
import { REVISION_ID, GENERATION_ID } from "./data/asv/meta.ts";
import { chapterCount } from "./parser.ts";
import { verseAt } from "./corpus.ts";
import { greekVerseCount, numberedVerses } from "./psalms.ts";

const TOTAL_VERSES = totalVersesOf("asv");

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

  test("DRA verse count", () => {
    expect(claimed("DRA verses")).toBe(totalVersesOf("dra").toLocaleString("en-US"));
  });

  test("DRA book count", () => {
    expect(claimed("DRA books")).toBe(String(versificationOf("dra").order.length));
  });

  test("ASV book count", () => {
    const books = versificationOf(DEFAULT_TRANSLATION).order.length;
    expect(claimed("ASV books")).toBe(String(books));
  });

  test("books carrying metadata only", () => {
    const count = [...BOOKS.values()].filter((book) => book.isDeuterocanon).length;
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

/**
 * Everything the file says about the code, not just the facts table.
 *
 * Prose rots the same way numbers do, only more quietly: a symbol gets renamed,
 * a script disappears from package.json, a path moves. All of that is
 * mechanical, so none of it needs to be anyone's job to remember.
 */
describe("STATE.md references nothing that has been removed", () => {
  // A symbol deliberately named as gone is struck through. Everything else
  // backticked must still resolve, or the sentence around it is describing a
  // codebase that no longer exists.
  const prose = STATE.replace(/~~[^~]+~~/g, "");

  test("every code symbol still exists", async () => {
    let body = "";
    for (const file of new Bun.Glob("{src,scripts,conformance}/**/*.ts").scanSync(".")) {
      body += await Bun.file(file).text();
    }
    const symbols = new Set(
      [...prose.matchAll(/`([A-Z][A-Z0-9_]{2,}|[a-z][a-zA-Z0-9]*\(\))`/g)].map((m) =>
        m[1]!.replace(/\(\)$/, ""),
      ),
    );
    expect(symbols.size).toBeGreaterThan(5);
    const dead = [...symbols].filter((name) => !body.includes(name)).sort();
    expect(dead).toEqual([]);
  });

  test("every file path still exists", async () => {
    const paths = new Set(
      [...prose.matchAll(/`((?:src|scripts|conformance|docs)\/[A-Za-z0-9_./-]+)`/g)].map(
        (m) => m[1]!,
      ),
    );
    expect(paths.size).toBeGreaterThan(5);
    // existsSync, not Bun.file().exists() — the latter reports false for a
    // directory, and STATE.md legitimately points at src/data/.
    expect([...paths].filter((p) => !existsSync(p)).sort()).toEqual([]);
  });

  test("every documented command is defined in package.json", async () => {
    const pkg = JSON.parse(await Bun.file("package.json").text()) as {
      scripts: Record<string, string>;
    };
    const commands = new Set([...prose.matchAll(/bun run ([a-z:]+)/g)].map((m) => m[1]!));
    expect(commands.size).toBeGreaterThan(3);
    expect([...commands].filter((c) => !(c in pkg.scripts)).sort()).toEqual([]);
  });
});

describe("STATE.md's prose numbers match the corpus", () => {
  // These are stated in sentences rather than the facts table, and were just as
  // capable of drifting.
  test("Esther and Daniel chapter counts", () => {
    expect(STATE).toContain(`EST is ${chapterCount("EST", "asv")} chapters in the ASV`);
    expect(STATE).toMatch(new RegExp(`DAN is ${chapterCount("DAN", "asv")} and`));
  });

  test("empty verse count", () => {
    let empty = 0;
    for (let sequence = 1; sequence <= TOTAL_VERSES; sequence += 1) {
      if (verseAt(sequence, "asv").text.trim() === "") empty += 1;
    }
    expect(STATE).toContain(`where the ASV has ${empty}`);
  });

  test("the Greek/Hebrew psalm splits it cites actually sum", () => {
    const claims: [string, number, number][] = [
      ["Greek 114+115", greekVerseCount(114, "asv") + greekVerseCount(115, "asv"), numberedVerses(116)],
      ["Greek 146+147", greekVerseCount(146, "asv") + greekVerseCount(147, "asv"), numberedVerses(147)],
      ["Greek 113", greekVerseCount(113, "asv"), numberedVerses(114) + numberedVerses(115)],
    ];
    for (const [label, left, right] of claims) {
      expect(left).toBe(right);
      // and the file quotes the same total
      expect(STATE).toContain(`${label} = ${left}`);
    }
  });
});

describe("STATE.md's stated sums add up", () => {
  // Arithmetic quoted in prose needs no source of truth beyond itself, and a
  // ledger that stops balancing is exactly the kind of error worth catching.
  test("the DRA coverage ledger balances", () => {
    const m = STATE.match(
      /\(([\d,]+) source characters = ([\d,]+) emitted \+ ([\d,]+) dropped \+ ([\d,]+)\s*\n?\s*unattributed\)/,
    );
    expect(m).not.toBeNull();
    const n = (v: string) => Number(v.replace(/,/g, ""));
    expect(n(m![2]!) + n(m![3]!) + n(m![4]!)).toBe(n(m![1]!));
  });

  // The psalm title-line distribution (84/62/4) and the naive-borrowing
  // correction (98 right, 52 wrong) were narrative from the 9 September
  // investigation, not durable state — the design they explain (borrowing
  // the Hebrew psalm's own superscription status) was rejected in favor of
  // direct Vulgate verification, and neither number is referenced by any
  // other fact in this file. Trimmed 10 September along with the rest of
  // that investigation's blow-by-blow; git history has the full account.
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
