# State — read this first

Last updated 7 September 2026 · public repo · working tree clean

This file exists so a new session does not have to re-derive anything. Everything
below was measured or verified; nothing here is recalled.

---

## What exists

**A deployed API.** <https://colophon.hellobensmith.workers.dev> — the complete
ASV 1901, 31,102 verses, embedded in a Cloudflare Worker with no database.
Reference parsing, ranked search, three canon traditions, Hebrew and Greek psalm
numbering, a demo page at `/`.

**A conformance suite.** `conformance/` — asks seven public Scripture APIs the
same semantic questions and writes a capability matrix. Published for
transparency, not criticism.

| | |
|---|---|
| Tests | 186 across 12 files |
| Contract | 54/54 responses conform to `openapi.yaml` |
| Bundle | 1,940 KiB gzip against a 10 MB limit (paid plan; the 3 MB figure is free-tier) |
| Production CPU | 6 ms median overall; 16-21 ms median on long phrase searches, 33 ms peak. No CPU cap enforced. |
| Repo | `github.com/hellobensmith/colophon`, **public** |

```bash
bun test                    # 186 tests, no network
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
  `src/translations.ts` is the registry; `/books`, `/passages` and `/search`
  accept `?translation=`, and an unknown id is a 404 naming what is served
  rather than a silent fall back. Every ASV response was checked byte-identical.
- **Next:** data keyed by `(translation, book)`. **32 of 66 shared books differ
  in versification**, so `VERSE_COUNTS`, `BOOK_START`, `CHAPTER_OFFSET`,
  `sequenceOf` and `locate` all become per-translation. There is no shared
  skeleton. The registry deliberately holds no verse counts yet — carrying them
  for one translation and not the other is worse than carrying them for neither.
- `data_availability` per `(translation, book)` — the DRA supplies exactly the
  seven books the ASV reports as `metadata_only`.
- Ingest must tolerate a source with **no `<d>` titles and no footnotes**. The
  ASV path assumes both exist.
- `build:data` and `validate.ts` currently hard-code the ASV source URL and its
  assertions; both need to run per translation.

The per-Worker federation idea is worth keeping as a *vision* question — it is
how a publisher self-hosts their own text — but it is no longer forced by any
ceiling, and Phase 1 should not wait on it.

---

## Decisions already made, and why

Re-litigating these wastes time. Each was measured, not chosen by taste.

| Decision | Reason |
|---|---|
| **No database** | The corpus is 31,102 rows fixed in 1901: no writes, no concurrency, no growth. Embedding measured 1.93 MB gzip / 4 ms CPU with zero I/O. A DB adds a round trip to one region to solve a problem we do not have. |
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

1. **Send the Bible.org outreach?** Drafted and unsent at
   `conformance/outreach/bible-org.md`. It leads with their translator notes and
   offers the API findings underneath, freely.
2. **Publish the matrix** — after the outreach, with a two-week window.
3. **Should the conformance suite become the front door** — a service any API
   runs against itself — rather than a file in this repository?

---

## The roadmap artifact

Vision, mission and the six phases:
<https://claude.ai/code/artifact/94ac6bfa-3c67-4eba-af6e-37eb98c632d4>

Update it rather than making a new one; it is the shareable statement of what
this is for.
