# State — read this first

Last updated 5 September 2026 · commit `ecfa75e` · 15 commits · working tree clean

This file exists so a new session does not have to re-derive anything. Everything
below was measured or verified; nothing here is recalled.

---

## What exists

**A deployed API.** <https://bible-api.hellobensmith.workers.dev> — the complete
ASV 1901, 31,102 verses, embedded in a Cloudflare Worker with no database.
Reference parsing, ranked search, three canon traditions, Hebrew and Greek psalm
numbering, a demo page at `/`.

**A conformance suite.** `conformance/` — asks seven public Scripture APIs the
same semantic questions and writes a capability matrix. Published for
transparency, not criticism.

| | |
|---|---|
| Tests | 149 across 9 files |
| Contract | 43/43 responses conform to `openapi.yaml` |
| Bundle | 1,939 KiB gzip against a 3 MB free-tier limit |
| Production CPU | 4 ms median, 8 ms peak, against 10 ms |
| Repo | `github.com/hellobensmith/bible-api`, **private** |

```bash
bun test                    # 149 tests, no network
bun run typecheck           # tsc, strict
bun run build:data          # re-ingest; refuses to emit on any failed assertion
bun run dev                 # wrangler dev on :8787
bun run check:contract      # live responses against openapi.yaml (server must be up)
bun conformance/run.ts --cached   # replay the matrix offline
bun run deploy
```

---

## What is next — Phase 1, Douay-Rheims

Not "add a translation." **Prove the architecture is plural using the text that
stresses it hardest.** Already verified during planning:

- Parses with our ingest unchanged: **73 books, 35,811 verses**, ledger balanced,
  zero residual markup
- Carries the full Catholic canon — TOB JDT WIS SIR BAR 1MA 2MA — which are the
  exact seven books `/books?tradition=catholic` currently reports as
  `metadata_only`
- Numbers its Psalms the **Greek** way, so it independently confirms
  `src/psalms.ts`; all 150 psalms agreed on verse count within 1
- Has **zero** empty verses where the ASV has 16, because it translates the
  Vulgate rather than the critical text — which stresses every assumption baked
  in from one edition
- Source: `https://ebible.org/Scriptures/engDRA_usfx.zip`

**The work is plumbing, not parsing.** Data keyed by `(translation, book)` rather
than `book`; a `?translation=` parameter defaulting to `asv` so nothing existing
breaks; per-translation `verse_sequence`; `data_availability` becomes
per-`(translation, book)`.

One caution: eBible's DRA orders the deuterocanon **after Malachi**, whereas
`src/canon.ts` uses the USCCB's NABRE interleaving. Both are real Catholic
orderings. Decide deliberately; do not "fix" one into the other silently.

---

## Decisions already made, and why

Re-litigating these wastes time. Each was measured, not chosen by taste.

| Decision | Reason |
|---|---|
| **No database** | The corpus is 31,102 rows fixed in 1901: no writes, no concurrency, no growth. Embedding measured 1.93 MB gzip / 4 ms CPU with zero I/O. A DB adds a round trip to one region to solve a problem we do not have. |
| **Embedded, not R2** | Same measurement. R2 becomes right at translation 3 — see the ceiling below. |
| **Search stays in v1** | A build brief we evaluated forbids it. We measured the alternative and kept it; the morphology work is the most-used feature. |
| **Greek/Hebrew psalm numbering synthesized** | That brief forbids synthesizing versification the source does not carry. We built it anyway, verified it as a bijection over 2,577 positions, and then confirmed it externally against Douay-Rheims. |
| **Platform cache, not the Cache API** | `[cache] enabled` in `wrangler.toml` serves hits *without running the Worker*: measured 7 of 8 identical requests never invoked it. A deploy invalidates it automatically, which is what makes `immutable` safe. The in-Worker Hono middleware was removed as redundant. |
| **Exact-form search ranking rejected** | Built and measured. It fixed the four homographs but pushed `spake`, `saith` and `went` out of the top 20 entirely, and roughly doubled CPU. `spake` outnumbers `speak` in this translation, so the trade loses. |
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

**The bundle ceiling.** Text plus offsets is 1.20 MB gzip per translation; the
search artifacts are another 0.67 MB and can be rebuilt at startup for 180 ms of
a 1,000 ms budget. Two translations fit (~2.59 MB with DRA). **Three do not.**

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

- **ebible.org truncates large downloads.** `scripts/download.ts` resumes with
  Range requests and keeps partial bytes; reading the whole body at once loses
  them and the retry can never progress.
- **The Turso CLI needs the sandbox disabled** — TLS interception breaks it and
  `~/.turso` is unreadable. Only relevant if a database ever returns; it does not
  currently.
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

## Open questions

1. **The project has no name.** Recommendation on the table: **Colophon** — the
   statement at the end of a manuscript saying who made it and from what, which
   is the project's central commitment. Alternatives considered: Stephanus (who
   invented verse numbers in 1551), Ambo, Apparatus.
2. **Send the Bible.org outreach?** Drafted and unsent at
   `conformance/outreach/bible-org.md`. It leads with their translator notes and
   offers the API findings underneath, freely.
3. **Publish the matrix** — after the outreach, with a two-week window.
4. **Make the repo public?** Currently private. Nothing in it is sensitive; the
   scan found only the word "secrets" in prose.
5. **Should the conformance suite become the front door** — a service any API
   runs against itself — rather than a file in this repository?

---

## The roadmap artifact

Vision, mission and the six phases:
<https://claude.ai/code/artifact/94ac6bfa-3c67-4eba-af6e-37eb98c632d4>

Update it rather than making a new one; it is the shareable statement of what
this is for.
