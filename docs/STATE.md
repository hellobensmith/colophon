# State — read this first

Last updated 8 September 2026 · public repo · deployed

This file is a **progress tracker**, not the source of truth. The code is the
source of truth; this exists so a session does not re-derive what an earlier one
already worked out, and so nothing gets forgotten between them. When the two
disagree, the code wins and this file is what gets corrected.

**Keeping it honest.** The facts in "Checked facts" are asserted by
`src/state.test.ts`, so drift fails `bun test`. Everything else is prose and
rots silently — this file has claimed 186 tests while the suite ran 214, and
seven deuterocanonical books where `canon.ts` says ten. When something here is
wrong, **correct the sentence in place**. Do not append an erratum: it leaves the
false claim in the file and makes this longer, and the test rejects the pattern.
Git history is the record of what changed.

---

## What exists

**A deployed API.** <https://colophon.hellobensmith.workers.dev> — the complete
ASV 1901, 31,102 verses, embedded in a Cloudflare Worker with no database.
Reference parsing, ranked search, three canon traditions, Hebrew and Greek psalm
numbering, a demo page at `/`.

**A conformance suite.** `conformance/` — asks seven public Scripture APIs the
same semantic questions and writes a capability matrix. Published for
transparency, not criticism.

### Checked facts

`src/state.test.ts` asserts every row below against the code. If one drifts the
suite goes red, so **correct this table, not the test** — and never delete a row
to make it pass, which fails too.

| Fact | Value |
|---|---|
| ASV verses | 31,102 |
| ASV books | 66 |
| Books with metadata only | 10 |
| Registered translations | asv |
| REVISION_ID | 365da92d6d9b… |
| GENERATION_ID | 1f4166f15db9… |

The test count is deliberately absent. It changed on nearly every commit, went
stale as "186" while the suite ran 214, and tells a new session nothing that
running `bun test` would not.

### Measured, not checked

These need a build, a server or the network, so they are snapshots. Each names
the command that refreshes it; re-run before relying on one.

| Measurement | Value | Refresh with |
|---|---|---|
| Contract | 54/54 responses conform to `openapi.yaml` | `bun run check:contract` |
| Bundle | 1,941 KiB gzip against a 10 MB limit (paid plan; 3 MB is free-tier) | `bun run deploy` output, or `check:platform --probe-limit` |
| Production CPU | median 3-18 ms, worst 21-48 ms over six runs; the worst tracks cold isolates, not the code. No CPU cap enforced. | `bun run check:platform` |
| Repo | `github.com/hellobensmith/colophon`, **public** | — |

```bash
bun test                    # no network; includes the STATE.md checks above
bun run typecheck           # tsc, strict
bun run build:data          # re-ingest; refuses to emit on any failed assertion
bun run dev                 # wrangler dev on :8787
bun run check:contract      # live responses against openapi.yaml (server must be up)
bun run check:platform      # re-measures the platform claims below against production
bun run check:platform --probe-limit   # also verifies the real bundle limit
bun conformance/run.ts --cached   # replay the matrix offline
bun run deploy
```

---

## Where Phase 1 stands — Douay-Rheims

Not "add a translation." **Prove the architecture is plural using the text that
stresses it hardest.** It has already done that, and the answer is not the one
the plan assumed.

**Verified 7 September from the source, with `parseUsfx` unchanged** — no new
element roles, nothing added to `ELEMENT_ROLES`:

- **73 books, 35,811 verses**, coverage ledger balanced exactly
  (4,652,766 source characters = 4,645,927 emitted + 3,559 dropped + 3,280
  unattributed)
- **Zero empty verses**, where the ASV has 16
- **Zero `<d>` titles and zero footnotes.** New, and not what was assumed here
  before: the DRA folds each psalm superscription into verse 1 rather than
  marking it, so none of the title machinery built for the ASV fires at all
- Source `https://ebible.org/Scriptures/engDRA_usfx.zip`, 2,946,666 bytes,
  sha256 `9dfbc526d699e9e461d0a8419c60dd12390e8618af7ac3e97083ae5e53e2ed29`

**The Greek psalm numbering is confirmed, textually and not just arithmetically.**
Greek 50 opens "Have mercy on me, O God" — the Miserere, Hebrew 51. Every split
sums exactly: Greek 114+115 = 19 = Hebrew 116; Greek 146+147 = 20 = Hebrew 147;
Greek 113 = 26 = Hebrew 114+115. `src/psalms.ts` is externally confirmed.

Correcting what this file said before: not "all 150 agreed within 1". Of the 146
directly comparable psalms, 82 match exactly, 59 read one higher because the
superscription is verse 1, and **5 read two higher because their superscription
runs to two lines** — Greek 50:1-2 is the visible example. Nothing is
unaccounted for.

**32 of the 66 shared books differ in versification**, and not only the odd ones.
EST is 10 chapters in the ASV and 16 in the DRA; DAN is 12 and 14. But Genesis,
Matthew, Acts and 29 others differ chapter by chapter too. There is no shared
verse skeleton to key against, which settles the plumbing question: `VERSE_COUNTS`,
`BOOK_START`, `CHAPTER_OFFSET`, `sequenceOf` and `locate` must all become
per-translation. A verse coordinate is only meaningful with its translation.

**Canon order — decided and built.** eBible's DRA prints the deuterocanon after
Malachi; `src/canon.ts` interleaves it the NABRE way. Both are real, and they
answer different questions, so both are kept: `CANON_ORDER` for traditions,
`EDITION_ORDER` for what an edition prints, with `editionPosition()` alongside
`canonPosition()`. `src/edition.test.ts` asserts the two orders *disagree* about
Tobit, so a future collapse of one into the other fails loudly.

**And the architecture holds.** The earlier conclusion in this session — that
two translations would not fit — was drawn against the free plan's 3 MB limit,
which does not apply to this account. Verified by deploying a 5.94 MB throwaway
Worker: the limit is 10 MB, two translations come to ~4.01 MB, and no
architectural change is needed. See the bundle limit below.

### What Phase 1 still has to build

The plumbing, unchanged from the original plan and now confirmed necessary by
measurement rather than assumed:

- ~~A `?translation=` parameter defaulting to `asv`~~ **done.**
  `src/translations.ts` is the registry. All five read routes accept
  `?translation=` and 404 an unknown id, naming what is served rather than
  silently falling back — `/books/:id` and `/books/:id/chapters/:num` were
  answering from the ASV under HTTP 200 until 8 September. Every ASV response
  checked byte-identical.
- ~~Versification per translation~~ **done 8 September.** **32 of 66 shared
  books differ**, so there is no shared skeleton: `src/versification.ts` derives
  an edition's sequence tables, the registry carries each edition's verse counts,
  and `versificationOf(id)` memoises the result lazily. `sequenceOf` and `locate`
  take a translation; ~~`BOOK_START`~~ / ~~`CHAPTER_OFFSET`~~ are gone as module
  globals.
- **Next:** the *text* keyed by `(translation, book)`. `src/corpus.ts` still
  imports one edition's `TEXT` statically, so `verseAt` returns ASV text whatever
  translation was asked for. Registering a second edition before this lands would
  serve DRA coordinates against ASV words. Needs a dispatch layer over both
  editions' modules — and needs two editions present to design against, which is
  why it waits on the DRA ingest rather than leading it.
- `data_availability` per `(translation, book)`. The ASV reports **ten** books as
  `metadata_only`: TOB, JDT, WIS, SIR, BAR, 1MA, 2MA, 1ES, 3MA, MAN — asserted by
  `src/state.test.ts`. How many the DRA supplies is **unverified**; count them
  against the archive before relying on a number.
- ~~Ingest must tolerate a source with **no `<d>` titles and no footnotes**~~
  **done 8 September, and it was never a parser change.** This file used to call
  it "the one parser change the DRA actually needs", contradicting its own note
  above that the DRA parsed with `parseUsfx` unchanged. What refused a
  title-less corpus was `src/validate.ts`, whose bucket guards asserted that
  text had reached the title, subscription and note buckets. Those guards exist
  to catch routing that silently stopped working, so they now read their premise
  from the edition: an empty title bucket fails only where the edition claims
  superscriptions.
- ~~`validate.ts` hard-codes the ASV's assertions~~ **done 8 September.**
  `validateCorpus(doc, expected)` takes a `CorpusExpectations`;
  `src/expectations/asv.ts` holds the ASV's. The assertions now sort three ways
  — universal (contiguity, the coverage ledger, residual markup), edition-specific
  (totals, per-book counts, empty verses, dropped-character inventory), and
  conditional (the bucket guards above). Proven by regenerating the whole corpus
  through the rewritten gate: `src/data/` came back byte-identical and neither
  identifier moved.

  Expectations are hand-authored and must never be derived from `src/data/*` —
  a gate that checks its output against numbers taken from that output passes on
  any corpus. The duplication between `books` and the generated `VERSE_COUNTS`
  is the test.

  `src/validate.test.ts` exercises the gate itself in both directions: with
  `titleCount: 0` an empty title bucket passes, with `titleCount: 116` it fails.
  Writing those tests surfaced a design gap — book order came from
  `EDITION_ORDER`, so no small fixture could exist. `CorpusExpectations.order`
  now overrides it, which is also how a publisher validates a text canon.ts has
  never heard of.
- ~~`build:data` hard-codes the ASV source URL~~ **done 8 September.**
  `bun run build:data --translation <id>` resolves a descriptor from
  `scripts/editions.ts` — source id, archive URL, unzip member, expectation set
  — and writes to `src/data/<id>/`. The ASV’s artifacts moved to
  `src/data/asv/` and the 15 import sites followed. An unknown id is refused by
  name rather than quietly building the default, which would overwrite a
  published corpus with the wrong text.

  Build-time descriptors live in `scripts/` so eBible URLs and unzip member
  names never reach the Worker. eBible’s own ids are inconsistent —
  `eng-asv` against `engDRA` — so `sourceId` is recorded, never derived.

  Moving the output directory left **both identifiers unmoved**: the manifest
  records artifact names, not paths, so identity binds to content. Verified by
  rebuilding — git reported four 100% renames and no content change.

The per-Worker federation idea is worth keeping as a *vision* question — it is
how a publisher self-hosts their own text — but it is no longer forced by any
ceiling, and Phase 1 should not wait on it.

---

## Decisions already made, and why

Re-litigating these wastes time. Each was measured, not chosen by taste.

| Decision | Reason |
|---|---|
| **No database** | The corpus is 31,102 rows fixed in 1901: no writes, no concurrency, no growth. Embedding measured 1.94 MB gzip with zero I/O, and 6-18 ms median CPU (re-measured 7 September; the 4 ms recorded originally was a quieter sample). A DB adds a round trip to one region to solve a problem we do not have. |
| **Embedded, not R2** | Same measurement, and it survives the second translation: the limit is 10 MB, not the 3 MB assumed here, so two translations fit at ~4.01 MB with room for about four more. R2 is not needed for Phase 1. |
| **Search stays in v1** | A build brief we evaluated forbids it. We measured the alternative and kept it; the morphology work is the most-used feature. |
| **Greek/Hebrew psalm numbering synthesized** | That brief forbids synthesizing versification the source does not carry. We built it anyway, verified it as a bijection over 2,577 positions, and then confirmed it externally against Douay-Rheims. |
| **Platform cache, not the Cache API** | `[cache] enabled` in `wrangler.toml` serves hits *without running the Worker*: re-measured 7 September at 1 MISS and 7 HITs across 8 identical requests, one invocation. **Wrangler warns `Unexpected fields found in top-level field: "cache"` and honours the key anyway.** That warning is not evidence the key is dead — acting on it the same day switched caching off and took 8 identical requests to 8 invocations. `bun run check:platform` now counts invocations, so this fails loudly instead of silently. **A deploy does not purge this cache** — that was documented backwards and measured false on 7 September; verse data is now `max-age=86400` rather than a year of `immutable`. A deploy invalidates it automatically, which is what makes `immutable` safe. The in-Worker Hono middleware was removed as redundant. |
| **Exact-form search ranking rejected** | Built and measured. It fixed the four homographs but pushed `spake`, `saith` and `went` out of the top 20 entirely, and roughly doubled CPU. `spake` outnumbers `speak` in this translation, so the trade loses. |
| **Query cost cap rejected** | Built to refuse expensive searches, priced from the shipped document frequencies, and removed the same day. The costliest query the index can express prices at 135,841; "and it came to pass in the days of the king" prices at 99,444. No threshold separates them, and it was refusing `?q=the`, which the spec documents. What it guarded against is a one-time posting-cache warm per isolate, not a repeatable amplification. Deduplicating terms and capping at twelve is the whole fix. |
| **Tradition order and edition order are different facts** | `/books?tradition=catholic` keeps the USCCB's NABRE interleaving, because that answers "what is the Catholic canon". The DRA's own after-Malachi order is carried as edition metadata, because that answers "how does this edition print". Collapsing them into one field forces a wrong answer to one of the two questions. |
| **Conformance framed as transparency** | The maintainers of these APIs are the people best placed to adopt a shared contract. A scorecard would cost exactly that goodwill. |

---

## Facts that were expensive to establish

**The ASV corpus.** 31,102 verses, 66 books. Per-book chapter and verse counts
are asserted in `src/validate.ts` — all 66, derived from the source, not typed.
Sixteen verses are empty by design (MAT 17:21, 18:11, 23:14; MRK 7:16, 9:44,
9:46, 11:26, 15:28; LUK 17:36, 23:17; JHN 5:4; ACT 8:37, 15:34, 24:7, 28:29;
ROM 16:24), each carrying its footnote. 116 Psalm superscriptions plus exactly
one subscription — Habakkuk 3, printed *below* verse 19, distinguished from a
superscription only by position.

**Typography.** Six distinct non-ASCII characters, 2,178 occurrences. The corpus
contains **zero ASCII apostrophes** — all 1,999 are U+2019 — and uses `æ` in
about 26 proper nouns. Both are folded for search only, in `src/tokenize.ts`;
the served text keeps them. Byte/char divergence across the corpus is 4,218.

**Production is roughly four times slower than local.** Local benchmarks
understated CPU by that factor. Use `wrangler tail --format json` and read
`cpuTime`; never quote a local `performance.now()` as production CPU. Cold-start
cost lands on whichever request an isolate serves first, whatever that request is.

**The bundle limit is 10 MB, not 3 MB — two translations fit.** This corrects a
conclusion drawn earlier the same day from the wrong premise. Verified
empirically on 7 September by deploying a throwaway Worker padded with
incompressible data: **5.94 MB gzip uploaded and deployed successfully**, and a
3.26 MB one before it. The 3 MB figure is the *free* plan's; this account is not
on it. The throwaway was deleted.

Measured composition, against the deployed 1,940 KiB:

| | gzip |
|---|---|
| ASV text | 1.18 MB |
| ASV search index | 0.65 MB |
| families, meta, code | 0.06 MB |
| **deployed today** | **1.89 MB** |
| DRA text plus offsets | 1.39 MB |
| DRA search index, scaled from the ASV's | ~0.73 MB |
| **two translations** | **~4.01 MB against 10 MB** |

The DRA is the larger text — 4.40 MB raw against the ASV's 3.92 MB — and gzips
to 1.34 MB against 1.16 MB, so it costs more than the ASV rather than the same.
That much was right. What was wrong was the ceiling it was measured against.

**So Phase 1 needs no architectural change.** Keep the corpus embedded, keep the
search index shipped rather than rebuilt at startup, and add the DRA. Roughly six
MB of headroom remains — about four more translations at this size.

**CPU is two numbers, not one.** `check:platform` claims a median and a worst
separately, because they measure different things. The median tracks the code
and is where a regression shows. The worst tracks cold isolates — a request
landing on a fresh one pays the posting-cache warm, and a run straight after a
deploy finds nothing else, which is how a 48 ms reading appeared with no code
change behind it. Conflating them meant the check failed on cold starts while a
real slowdown could have hidden in the same range. Claimed at 25 ms and 60 ms,
from an observed 3-18 and 21-48.

**Production CPU is higher than this file recorded.** Measured 7 September with
`wrangler tail`, cache-busted so every request reached the Worker:

| Request | min | median | max |
|---|---|---|---|
| `?q=good shepherd` | 0 | 2 | 5 |
| `?ref=Psalm 119:1-176` | 1 | 6 | 6 |
| `?q=the` | 4 | 6 | 9 |
| `?q=and it came to pass in the days of the king` | 4 | 16 | 33 |
| `?q=` twelve commonest words | 7 | 21 | 31 |

All 31 outcomes were `ok`; nothing was terminated. **There is no 10 ms
enforcement on this account**, which is the other half of not being on the free
plan. The earlier "4 ms median, 8 ms peak against 10 ms" understates ordinary
traffic: a long phrase search costs 16-21 ms median.

The variance is isolate churn, not query cost — requests land on many isolates
across colos, and each new one pays the posting-cache warm. That is also why the
same query reads 4 ms and 33 ms minutes apart, and why the local "it caches away"
observation is weaker in production than on one laptop process.

**The eBible catalogue** (`translations.csv`): 1,294 redistributable translations
across 1,024 languages, ~15M verses, ~2 GB. Only **111** are outright public
domain; 1,183 carry a named holder and terms. 52 are English. R2's free tier is
10 GB, so the whole redistributable corpus would fit five times over.

**The NET's notes are unavailable.** eBible's `engnet` USFX carries the text but
only **39 footnotes**; the published NET has tens of thousands. It does carry
6,830 `<nd>` divine-name spans and 1,801 `<s>` section headings, neither of which
the ASV has at all — so it is the corpus that would most exercise a stand-off
annotation layer. Draft approach in `conformance/outreach/bible-org.md`.

**Conformance results.** 105 cells, 7 APIs. Four cases where a caller cannot tell
the answer is wrong, all `labs.bible.org` — most sharply `John 3:99` returning
John 3:1 and `Genesis 99:1` returning Genesis 1:1, both under HTTP 200. Four of
the six external APIs do no reference parsing at all. Full matrix in
`conformance/report.md`.

---

## Traps that already cost time

- **Wrangler warns about `[cache]` and honours it.** `Unexpected fields found in
  top-level field: "cache"` is emitted on every deploy, and the key works. It was
  removed on that evidence and edge caching stopped — 8 identical requests went
  from 1 Worker invocation to 8, and `cf-cache-status` vanished. Restored and
  verified. `bun run check:platform` guards it now.
- **Bun's `fetch` is not served from Cloudflare's edge cache.** The same URL that
  curl reports as MISS,HIT,HIT… invokes the Worker every time from Bun, with no
  `cf-cache-status` header at all. Any cache measurement written in Bun must
  shell out to curl, or it will report caching as broken while it works.
- **ebible.org truncates large downloads.** `scripts/download.ts` resumes with
  Range requests and keeps partial bytes; reading the whole body at once loses
  them and the retry can never progress.
- **The Turso CLI needs the sandbox disabled** — TLS interception breaks it and
  `~/.turso` is unreadable. Only relevant if a database ever returns; it does not
  currently.
- **A deploy does not purge the platform cache.** Documented the other way in
  both README and this file, and measured false: a `/search` response cached
  before a deploy was still served after it, from a Worker version no longer
  deployed, while the same path with a cache-buster returned the new answer.
  `GENERATION_ID` does not help — it covers the build manifest, so a code change
  that alters responses does not move it. Verse data is now capped at a day.
  Raising it again requires a real purge, which workers.dev has no zone for, or
  putting the generation id in the URL.
- **The demo page carries `max-age=300`.** During iteration the browser will
  serve a stale copy; bust with a query parameter rather than assuming the deploy
  failed.
- **Do not edit files containing quotes via shell heredocs.** A shell-quoting
  artifact once mangled a template literal in `src/demo.ts` into broken
  JavaScript that still passed a syntax check on the server side. Use Python with
  explicit encoding, or the Write tool.
- **Verify tool exit codes directly.** `bun run typecheck | tail` reports
  `tail`'s status, not `tsc`'s. A failing typecheck was reported as passing once.

---

## Settled since

**The name is Colophon** — the note at the end of a manuscript recording who made
it, when and from what. It names the project's central commitment: every response
carries edition, revision and generation identifiers, so a caller always knows
which text it is holding. Repo, Worker, package and docs all renamed; the old
`bible-api` Worker is retired.

## Open questions

1. ~~Send the Bible.org outreach?~~ **Decided 7 September 2026: no.** The draft
   stays at `conformance/outreach/bible-org.md` as a record of the approach; it
   is not being sent. Do not re-open this without Ben saying so.
2. **Publish the matrix** — this was gated behind the outreach, which is no
   longer happening, so the gate is gone and the question is open on its own
   terms. The framing in `conformance/report.md` is already transparency rather
   than scorecard.
3. **Should the conformance suite become the front door** — a service any API
   runs against itself — rather than a file in this repository?
4. **Verse-data caching is capped at a day.** Raising it needs either a real
   purge, which workers.dev has no zone for, or the generation id in the URL.
   Deliberate, and Ben can overrule it — see the trap below.

---

## Where the 7 September session left off

Seven commits, all deployed and pushed. `bun test` 186 across 12 files,
`bun run typecheck` clean, `bun run check:contract` 54/54, `bun run
check:platform` all green.

**Shipped**

- **Request hardening.** Deduplicated and capped query terms at 12; `God`
  repeated 5,000 times had measured 1.1 s of CPU from a hand-typable URL. Also
  a 512-character input cap, 64 comma-separated reference segments, and
  `locate()` turned from a 66-book scan into a binary search.
- **A rejected guard, kept as reasoning.** Pricing queries from document
  frequencies and refusing expensive ones cannot work: the costliest query the
  index can express prices at 135,841 and "and it came to pass in the days of
  the king" at 99,444. It was also refusing `?q=the`. See the comment on
  `MAX_QUERY_TERMS`.
- **`EDITION_ORDER` beside `CANON_ORDER`.** What an edition prints is not what a
  tradition counts. `src/edition.test.ts` asserts the two *disagree* about
  Tobit, so a future collapse fails loudly.
- **`bun run check:platform`.** The platform claims in this file now run.
- **Exact search totals.** The scan cap was undercounting multi-term results —
  345 reported as 313 — and raising it to 25,000 is also 4.5x faster there.
- **`src/translations.ts`.** `?translation=` on `/books`, `/passages`,
  `/search`, defaulting to `asv`; unknown ids are a 404 naming what is served.
  Every ASV response verified byte-identical.

**Versification is in the registry — done 8 September 2026.**

`src/versification.ts` derives the sequence tables for one edition from its
verse counts and book order. `src/translations.ts` holds those per translation
and memoises the derived tables in `versificationOf(id)`, lazily: cold start
lands on whichever request an isolate serves first, so an edition nobody asks
for is never built. `src/parser.ts` no longer imports `VERSE_COUNTS` at all —
`chapterCount`, `verseCount`, `sequenceOf` and `locate` each take a translation,
defaulting to the ASV, and ~~`BOOK_START`~~ / ~~`CHAPTER_OFFSET`~~ /
~~`BOOK_STARTS`~~ are gone as module globals. (Struck through because they no
longer exist: `src/state.test.ts` treats a struck symbol as deliberately dead
and every other backticked symbol as one that must still resolve.)

Proven byte-identical: `scripts/snapshot-responses.ts` captures 40 responses
weighted to book and chapter boundaries, the corpus edges, Psalm
superscriptions and the out-of-range cases; pre- and post-refactor output
matched exactly (185,600 bytes). 198 tests, `tsc` clean, `src/data/` untouched
so neither identifier moved. 31,102 `locate`+`sequenceOf` round trips cost
17 ms — 0.55 µs each.

**The translation is threaded through the read path — done 8 September 2026.**

`parseReference` takes a `translation` option and forwards it through
`resolveBook` → `ensureAvailable`, `validateChapter`, `validateVerse` and every
`sequenceOf` call. All four read handlers in `src/index.ts` pass the id they had
already resolved.

Two of them were not resolving one at all. `/books/:id` and
`/books/:id/chapters/:num` ignored `?translation=` and answered from the ASV
under HTTP 200 — the silent wrong answer the conformance suite records against
other APIs, in our own code. Both now 404 an unknown id like `/books` and
`/passages` already did. **This is the one intentional behaviour change**;
everything else is byte-identical across 50 captured responses.

`src/threading.test.ts` proves the parameter is consumed rather than accepted
and dropped, which byte-identity cannot: with everything defaulting to the ASV,
identical output is guaranteed by construction. Each assertion was checked by
deliberately breaking the threading and confirming it fails. One earlier version
of the `resolveBook` test survived that check — asserting `parseReference` throws
for a bogus translation proves nothing, because `chapterCount` throws a moment
later regardless. A metadata-only book discriminates: `ensureAvailable` throws
there before `chapterCount` runs, with a different error type.

Still ASV-only: `src/psalms.ts`, `src/data.test.ts` and `scripts/build-data.ts`
reach for `VERSE_COUNTS` directly, and `src/validate.ts` keeps per-book
assertions.

`src/psalms.ts` was deliberately left alone. It holds no verse-count table; it
encodes a tradition — `fromHebrew` maps "to its position in the ASV's English
text", and `irregularGreekParts` hardcodes the Septuagint mapping (Greek 9 =
Hebrew 9+10, Greek 113 = Hebrew 114+115). A `translation` parameter there would
be accepted and then ignored by the logic underneath. For the DRA the premise
inverts, since Greek numbering is native and `fromGreek` becomes identity. That
module needs the DRA in hand to design against.

`dataAvailability` is a known half-measure: `ensureAvailable` now names the
edition from the registry, but the fact it reports comes from `src/canon.ts`,
where it is derived globally (`isDeuterocanon ? "metadata_only" : "full"`). The
message can therefore name an edition while stating the ASV's availability.
Closes when `data_availability` becomes per `(translation, book)`.

Then `build:data` and `validate.ts` need to run per translation — both currently
hard-code the ASV source URL — and the DRA data can be generated. Its archive is
already verified: 2,946,666 bytes, sha256 `9dfbc526d699e9e461d0a8419c60dd12390e8618af7ac3e97083ae5e53e2ed29`,
and ingest tolerating a source with **no `<d>` titles and no footnotes** is the
one parser change the DRA actually needs.

**Use `lcr find` to locate code, then `lcr read` to understand it.**
`lcr find` answers in ~0.05 s. `lcr read --question "..." --paths FILE [FILE
...]` names the files itself and returns only the answer — prefer it to
`lcr ask`, which has to guess which files matter. The whole pipeline works now:
the worker moved off a 3B local model onto `gpt-oss:120b-cloud`, so the note
that `ask` and `inspect` time out on this hardware no longer holds.

---

## The roadmap artifact

Vision, mission and the six phases:
<https://claude.ai/code/artifact/94ac6bfa-3c67-4eba-af6e-37eb98c632d4>

Update it rather than making a new one; it is the shareable statement of what
this is for.
