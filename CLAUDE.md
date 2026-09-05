# bible-api — durable invariants

Short on purpose. These are the things a future session cannot re-derive by
reading the code quickly, and which are expensive to get wrong.

## Identity

Two identifiers, never conflated:

- **`REVISION_ID`** — what the text *is*. Derived from the source archive alone.
  Moves only when eBible republishes. Anything anchored into the text binds to
  this.
- **`GENERATION_ID`** — what was *published*. Derived from the whole build
  manifest. Moves whenever anything published changes, including a metadata
  correction over identical text. Cache keys belong to this.

A single identifier gets one of those two wrong, always. Correcting a genre
label must retire caches but must not invalidate a saved coordinate.

## Data

- The corpus is embedded in the Worker. There is no database, by measurement:
  1.93 MB gzip against a 3 MB limit, 4 ms median CPU against 10 ms.
- `src/data/*` is generated. Never edit it; run `bun run build:data`.
- Ingest is deterministic — the same source produces the same `GENERATION_ID`.
  Map iteration order, timestamps in hashed payloads, and locale-dependent
  sorting are the usual ways that breaks.
- The build refuses to emit anything unless every assertion in `src/validate.ts`
  passes.

## The parser

- USFX is milestone-based: `<v/>` marks a start, text follows as a *sibling*.
  A DOM reading of `<v>` returns empty strings for all 31,102 verses.
- **Every source element must have a role in `ELEMENT_ROLES`.** An unclassified
  element stops the build. This is what makes a future edition that wraps the
  divine name or the words of Jesus visible instead of silently flattened.
- The coverage ledger proves no source text disappears: every character is
  emitted somewhere or dropped somewhere, and the totals must agree.
- `<d>` is both a superscription and a subscription; only position separates
  them. Habakkuk 3 is the one subscription in the corpus.

## Search

- One tokenizer, `src/tokenize.ts`, shared by the index builder and the query
  path. Tokenizing them differently fails silently — both sides look correct and
  the result is empty.
- The corpus contains **no ASCII apostrophes**; all 1,999 are U+2019. It also
  uses æ, ï and ü in about twenty-six proper nouns. Both are folded for search
  only; the served text keeps the typography as printed.
- Terms are ANDed, so `total` means what it says.
- Ranking literal matches above morphological relatives was tried and rejected —
  it buried `spake`, `saith` and `went`. See the README.

## Measurement

- Local timings are not production CPU. Production isolates measured roughly
  four times slower. Use `wrangler tail` for anything load-bearing.
- Cold-start cost lands on whichever request an isolate serves first, whatever
  that request is.
