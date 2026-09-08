/**
 * Captures a fixed set of responses so a refactor can be proven
 * byte-identical rather than merely "tests still pass".
 *
 * The set leans on everything versification touches: book and chapter
 * boundaries, the first and last verse of the corpus, cross-book passages,
 * Psalm superscriptions, and the metadata-only books.
 *
 *   bun scripts/snapshot-responses.ts before.json
 *   ... make the change ...
 *   bun scripts/snapshot-responses.ts after.json
 *   diff before.json after.json
 */
import app from "../src/index.ts";

const PATHS = [
  "/",
  "/health",
  "/books",
  "/books?translation=asv",

  // every book: chapter counts come straight off the versification tables
  ...["GEN", "PSA", "EST", "DAN", "MAL", "MAT", "REV", "OBA", "PHM", "3JN"].map(
    (id) => `/books/${id}`,
  ),

  // chapter endpoints exercise verseCount() per chapter
  "/books/GEN/chapters/1",
  "/books/GEN/chapters/50",
  "/books/PSA/chapters/119",
  "/books/PSA/chapters/117",
  "/books/REV/chapters/22",
  "/books/OBA/chapters/1",

  // corpus edges — sequenceOf/locate at 1 and 31102
  "/passages?ref=Genesis+1:1",
  "/passages?ref=Revelation+22:21",

  // book and testament boundaries, where BOOK_START matters
  "/passages?ref=Malachi+4:6",
  "/passages?ref=Matthew+1:1",
  "/passages?ref=Genesis+50:26",
  "/passages?ref=Exodus+1:1",

  // cross-chapter and cross-book ranges walk CHAPTER_OFFSET
  "/passages?ref=Genesis+1:29-2:3",
  "/passages?ref=Psalm+22:31-23:2",
  "/passages?ref=John+21:24-25",

  // superscriptions and the one subscription in the corpus
  "/passages?ref=Psalm+3:1",
  "/passages?ref=Psalm+51:1",
  "/passages?ref=Habakkuk+3:19",

  // out-of-range must stay out-of-range
  "/passages?ref=Genesis+1:32",
  "/passages?ref=Psalm+151:1",
  "/books/GEN/chapters/51",
  "/books/NOPE",

  // search touches the index, not versification, but proves nothing else moved
  "/search?q=beginning&limit=3",
  "/search?q=shepherd&limit=3",

  // translation plumbing
  "/books?translation=nope",
  "/passages?ref=John+1:1&translation=asv",
];

/**
 * Fields that move on their own. Redacted rather than dropped, so the
 * comparison still fails if one disappears entirely.
 */
function redactVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactVolatile);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        k === "timestamp" ? [k, "<redacted>"] : [k, redactVolatile(v)],
      ),
    );
  }
  return value;
}

const out: Record<string, { status: number; body: unknown }> = {};

for (const path of PATHS) {
  const response = await app.fetch(
    new Request(`https://colophon.test${path}`),
  );
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  out[path] = { status: response.status, body: redactVolatile(body) };
}

const target = process.argv[2];
if (!target) {
  console.error("Usage: bun scripts/snapshot-responses.ts <out.json>");
  process.exit(1);
}

await Bun.write(target, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Captured ${PATHS.length} responses -> ${target}`);
