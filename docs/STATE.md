# State — read this first

Last updated 10 September 2026 · public repo · deployed

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

**A deployed API serving three editions.**
<https://colophon.hellobensmith.workers.dev> — the ASV 1901 (31,102 verses),
the Douay-Rheims (35,811 verses, 73 books), and the SBL Greek New Testament
(7,939 verses, 27 books, CC BY 4.0), all embedded in a Cloudflare Worker with
no database. Reference parsing, three canon traditions, Hebrew and Greek
psalm numbering, a demo page at `/`. Search covers the two English editions,
each from its own index, and returns 501 for a translation with none rather
than answering from the wrong index — the SBLGNT included, deliberately:
Greek needs its own tokenizer, not attempted yet. `GET /translations` reports
each edition's real, derived capabilities (search, apparatus, testaments,
psalm numbering) so a generic client can discover them rather than guess.
`GET /apparatus` serves the SBLGNT's critical apparatus — a collation of
printed editions (WH, Tregelles, NA27/NA28, RP, and occasionally others),
not manuscripts.

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
| DRA verses | 35,811 |
| DRA books | 73 |
| Books with metadata only | 10 |
| Registered translations | asv, dra, sblgnt |
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
| Bundle | 4.05 MB gzip against a 10 MB limit (paid plan; 3 MB is free-tier, which this deployment now exceeds) | `bun run deploy` output, or `check:platform --probe-limit` |
| Production CPU | median 9-39 ms, worst 47-112 ms over eight runs (10 September, wider than the 7 September baseline — two more indexed translations and a heavier passage-read path); the worst tracks cold isolates, not the code. No CPU cap enforced. | `bun run check:platform` |
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

## Phase 1 and Phase 2 — where things stand

### Phase 1 — plural translations, done

The Douay-Rheims proved the
architecture is plural using the text that stresses it hardest — not just
"add a translation." Versification, corpus text, `data_availability`,
ingest, and `validate.ts` are all per-translation now (`src/versification.ts`,
`src/corpus.ts`, `scripts/editions.ts`, `src/expectations/`); the DRA-specific
numbers and the Greek/Hebrew psalm-numbering verification are in "Facts that
were expensive to establish" below, not repeated here. One intentional
behavior change along the way, still true today: `/books/:id` and
`/books/:id/chapters/:num` used to silently answer from the ASV under HTTP
200 for an unknown `?translation=`; both now 404 an unknown id like every
other route. `EDITION_ORDER` (what an edition prints) and `CANON_ORDER`
(what a tradition counts) are kept deliberately separate —
`src/edition.test.ts` asserts they *disagree* about Tobit's position, so a
future collapse of one into the other fails loudly. The per-Worker
federation idea (a publisher self-hosting their own text entirely) stays a
*vision* question, not forced by any ceiling — see the roadmap artifact.

### Phase 2 — bring your own text, substantially built

More already existed than this file said. Three commits from 8 September —
`src/usfm.ts`, `src/usx.ts`, `src/format.ts`, local-bundle reading in
`scripts/sources.ts` — shipped a USFM reader proven byte-identical to the
USFX-ingested ASV, a USX reader tested against schema-derived fixtures, and
content-sniffing format detection, none of it mentioned here until now.

**10 September 2026: both readers now carry the same coverage-ledger rigor
USFX has, and `scripts/build-data.ts` dispatches by detected format.**
`parseUsfm`/`parseUsx` used to return a bare `dropped` map; they now return
the same `ScriptureDocument` (`src/document.ts`) every reader produces,
carrying a full six-bucket `CoverageLedger` that balances against
`sourceCharacters` — checked against the real ASV-as-USFM bundle
(15,708,824 source characters, corrected 11 September 2026 — measured
twice independently against the same on-disk bundle via `build-data.ts
--report`; the figure recorded here the same day these readers landed did
not match a fresh run and the discrepancy was not tracked down, so this is
the number the code actually produces today, not a reconciliation of why
the two differ), not just fixtures. The largest single gap
closed was the `\w...|strong=...\w*` attribute tail: ~10.6M characters,
two-thirds of the whole corpus, previously unaccounted for anywhere.
`src/ingest.ts`'s `parseSource(text, format?)` is the pure dispatch seam —
`detectFormat()` when no format is given — that `build-data.ts` now calls
instead of hardcoding `parseUsfx`.

Two independent bugs surfaced and were fixed along the way, both in
`scripts/build-usx-styles.ts`'s schema-derived role table:
`bd`/`bdit`/`em`/`it`/`sc` were locked to `footnote` instead of `transparent`
(present in both `Char.char.style.enum` and `FootnoteChar.char.style.enum`,
and the generator's precedence rules picked the wrong one), which would have
silently routed bold/italic verse text into notes for any USX source using
them; separately, `ip`/`rem` were double-classified via an unconditional
overwrite in the generator's `Para.para.style.enum` branch (the only branch
without the "first, more specific role wins" guard every other branch has),
which would have folded a translator's remark into verse text.

**Deliberately not done yet**: `CorpusExpectations.dropped` (see
`src/expectations/asv.ts`) is authored against USFX's element vocabulary —
`languageCode`, `id`, `h`, `toc`, `fr` — and a USFM-derived read of the same
ASV text produces 16 dropped keys, several with no USFX counterpart at all
(`chapter-number`, `front-matter`, `word-attribute`...), because USFM
carries book/chapter/verse identifiers as consumed text tokens where XML
carries them as attributes. `validateCorpus` requires exact key-set parity,
so `bun run build:data --translation asv --source <a-usfm-path>` fails at
that check today — not a bug, a real design question not yet answered
(per-format expectations? a looser check for non-primary formats?) and
deliberately scoped out of the ledger work rather than improvised under it.
Nothing currently exercises this path — no script or test calls `build:data`
against a real `--source` end to end — so the gap is real but inert.

**Three more bugs found and fixed the same way, 10 September 2026.** A USFM
inline cross-reference (`\x...\x*`) mid-verse used to truncate everything
after it — the generic `"metadata"` role finished the verse unconditionally,
correct for boundary markers (`\s`, `\mt`...) but wrong for the four markers
(`x`, `va`, `vp`, `fig`) that carry their own closer and can appear
mid-verse, exactly like `\f` already handles correctly. A new `"discard"`
role fixes it. Separately, USX filed every `<note>` as a footnote regardless
of `style`, so a cross-reference's text landed in `verse.note` instead of
being dropped as apparatus — `USX_STYLE_ROLES` already classified it
correctly, the `<note>` special case just never let that classification
run. And `<table>`/`<figure>`/`<periph>` threw immediately on their opening
tag: their `style` attributes are a schema pattern, free text, or absent
entirely, none of which a static role table can represent — `<table>`/
`<cell>`/`<periph>` are now bypassed (their content is inert or already
reaches whatever verse is open, either way fully accounted for in the
ledger), `<figure>`'s caption is forced to the `"metadata"` role since it
can appear mid-verse and needs active dropping, not a bare bypass. All
three were real but latent: the ASV/DRA contain none of the triggering
markers, in any format.

**`PARSER_VERSION` (`src/identity.ts`) was not bumped** for either the two
USX misclassification fixes or these three — re-verified each time that
neither shipped edition (`asv`, `dra`) builds from anything but `parseUsfx`,
so nothing published is affected. Revisit the moment either format's
`--source` override is actually used to build a shipped edition — two
manifests both carrying the same `PARSER_VERSION` could otherwise have come
from different, non-equivalent code.

**Two more stale-doc fixes, same day.** `conformance/results.json`'s `base`
field still named the pre-rename domain (`bible-api.hellobensmith...`) —
`conformance/run.ts` itself has defaulted to the current one since the
rename, the published file was just never regenerated; fixed, and it
changes no measured verdict, only the provenance label. Separately,
`openapi.yaml` documented `?translation=` on `/books`, `/passages` and
`/search` but not on `/books/{id}` or `/books/{id}/chapters/{num}`, even
though every route accepts it — fixed, embedded copy regenerated with
`bun run build:openapi`.

**11 September 2026: a fourth format, and the first edition built entirely
through `--source` — the SBL Greek New Testament, text and apparatus.**
Plan drafted, then red-teamed by three independent audits (a tradition-
neutral NT textual critic, a digital-Bible-format specialist, an API
architect) before a line of `src/sblgnt.ts` was written; the audits caught
real defects a synopsis-level read of one book (Jude) couldn't have — see
"Facts that were expensive to establish" below.

New format `sblgnt` (`src/format.ts`, `src/sblgnt.ts`): SBL's own bespoke
XML, not USFM/USX/OSIS. Verified character-exact against the source's own
`data/sblgnt/text/*.txt` across all 7,939 verses. `ScriptureDocument` grew
two fields for it, both currently empty for every other edition:
`interpolations` (text between two named verses with no verse number of
its own — Mark's Shorter Ending is the one real case) and
`CorpusExpectations.omittedVerses` (verses a source drops outright, no
placeholder — 15 of them here, contrast `emptyVerses`, which the ASV
already used for verses it numbers-and-empties).

A separate, structured critical apparatus (`src/sblgnt-apparatus.ts`,
`scripts/build-sblgnt-apparatus.ts`) — 6,934 notes, split on the one `]`
every note genuinely has, deliberately *not* decomposed further into
per-witness fields; see the open question below for why. Served at
`GET /apparatus`, gated the same way `/search` already gates an edition
with no index (`501`/`not_implemented` — which surfaced a real, separate
pre-existing bug: that error code was never in `openapi.yaml`'s enum even
though the search and psalm-numbering paths already used it; fixed, and
both now have contract-test coverage for the first time).

New `GET /translations`: every registered edition's capabilities
(search, apparatus, testaments, psalm numbering), all derived from the
same registries the routes gate on rather than hand-maintained — the
SBLGNT is the first edition whose capabilities genuinely differ from
every other one's, which is what exposed that this never existed.

`TranslationMeta` grew `license_url`/`attribution`, snake_case on the TS
interface itself (not the usual camelCase) because `src/index.ts` spreads
`translation.meta` directly into API responses with no transform layer —
the field name *is* the wire key.

---

## Decisions already made, and why

Re-litigating these wastes time. Each was measured, not chosen by taste.

| Decision | Reason |
|---|---|
| **No database** | The corpus is 31,102 rows fixed in 1901: no writes, no concurrency, no growth. Embedding measured 1.94 MB gzip with zero I/O, and 6-18 ms median CPU (re-measured 7 September; the 4 ms recorded originally was a quieter sample). A DB adds a round trip to one region to solve a problem we do not have. |
| **Embedded, not R2** | Same measurement, and it survives the second translation: the limit is 10 MB, not the 3 MB assumed here, so two translations fit at ~4.01 MB with room for about four more. R2 is not needed for Phase 1. |
| **Search stays in v1** | A build brief we evaluated forbids it. We measured the alternative and kept it; the morphology work is the most-used feature. |
| **Greek/Hebrew psalm numbering synthesized** | That brief forbids synthesizing versification the source does not carry. We built it anyway — not as a clean bijection, since the Vulgate genuinely splits and merges content the ASV divides differently. Verified against the Clementine Vulgate directly: 2,526 addressable Greek coordinates onto the ASV, 2,506 distinct positions (four two-line titles and two clean splits each collapse two coordinates onto one), 14 verses explicitly refused rather than guessed at nine psalms with a genuine interior split or merge. |
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

**The Douay-Rheims corpus.** 73 books, 35,811 verses, coverage ledger
balanced exactly (4,652,766 source characters = 4,645,927 emitted + 3,559 dropped + 3,280
unattributed). Zero empty verses, where the ASV has 16. Zero
`<d>` titles and zero footnotes — the DRA folds each psalm superscription
into verse 1 rather than marking it, so none of the title machinery built
for the ASV fires at all. Source
`https://ebible.org/Scriptures/engDRA_usfx.zip`, 2,946,666 bytes, sha256
`9dfbc526d699e9e461d0a8419c60dd12390e8618af7ac3e97083ae5e53e2ed29`.

**32 of the 66 books the ASV and DRA share differ in versification** — not
only the obvious ones (EST is 10 chapters in the ASV and 16 in the DRA;
DAN is 12 and 14). 24 differ in book-level totals; **8 more agree on every
total while distributing verses differently** — NUM, JOS, JDG, JOB, ECC,
ISA, JON, HAG. Those eight are the case that makes per-translation
versification load-bearing rather than tidy: any check at book level calls
them identical, and a coordinate resolved against the wrong edition returns
the wrong verse under a reference that looks fine. There is no shared verse
skeleton to key against. (This is exactly the failure class that surfaced
mid-build as a real bug, not a hypothetical: with the coordinate layer
per-translation but corpus reads still defaulting to the ASV, `Esther 14:1`
in the Douay-Rheims briefly returned `JOB.3.5` — a real verse, from the
wrong book, under a reference that looked fine.)

**Greek/Hebrew psalm numbering, checked against the Clementine Vulgate
directly**, not reconstructed from the ASV or DRA against each other (Ben
supplied a local copy of the source text; cross-checked live against
drbo.org and bible.catholicgallery.org, 9 September 2026). Every split still
sums exactly: Greek 114+115 = 19 = Hebrew 116; Greek 146+147 = 20 = Hebrew
147; Greek 113 = 26 = Hebrew 114+115. Nine psalms —
12, 43, 52, 55, 71, 99, 108, 129, 145 — have a genuine interior content
split or merge where the Vulgate's own verse divisions disagree with the
ASV's, not just at the title; specific verses in those are refused
(`PsalmNumberingError`) rather than guessed, since returning either half of
a merged verse would silently omit real content. The DRA needs none of
this: it already prints the Vulgate's own division natively (145 of 150
psalms match exactly; five are a minor, real edition variance, not a bug),
so `?numbering=greek&translation=dra` is a bounds check against its own
verse counts, not a conversion. See the Decisions table above for the
full coordinate-count breakdown.

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
real slowdown could have hidden in the same range. Claimed at 45 ms and 130 ms
as of 10 September, from an observed 9-39 and 47-112 across eight runs — both
ranges wider than 7 September's 25/60 claim (from an observed 3-18 and 21-48).
The DRA became searchable and the Greek psalm-numbering rewrite landed on the
passage-read path in between; that's enough to explain the shift in ceiling,
but the *variance* grew too, not just the top of the range, which is worth
watching rather than assuming away.

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

**The SBLGNT's join algorithm was never actually specified by the source,
and the obvious naive read is wrong.** 85% of `<suffix>` elements are
empty; the XML's own pretty-printed indentation is not the word separator.
The real rule — a `prefix? + w` unit's leading whitespace *is* the
separator, stripped only if the output already ends in whitespace;
`suffix` always appends raw, never through that logic; a `<p>` boundary
mid-verse contributes one more space — reconstructs all 7,939 verses
character-exact against the source's own `data/sblgnt/text/*.txt`, which
nobody had used as ground truth before. See the doc comment on
`src/sblgnt.ts`.

**The SBLGNT disagrees with the ASV's own New Testament versification in
9 of 27 books — not a defect.** Romans ends at 16:24 *with text* (the
Byzantine closing) and has no 16:25-27 — NA28/WH/Tregelles's doxology
sits in the apparatus, not the text, siding with the Byzantine tradition
against the critical editions at Paul's most-discussed structural crux.
Acts 19:41 folds into the ASV's 19:41 being NA/SBL's own 19:40 — a moved
boundary, nothing missing. 3 John and Revelation 12 run the other way (3
John splits the ASV's v14 into 14+15; Revelation 12 has 18 verses because
NA/SBL's 12:18 is the ASV's 13:1). And 15 verses the ASV numbers-and-
empties, the SBLGNT omits outright — no placeholder, no number at all
(`src/expectations/sblgnt.ts`'s `omittedVerses`). A validation gate that
treated any of this as a bug to fix would have fabricated or deleted real
text-critical content — this is exactly why `validateCorpus`'s ASV
cross-check for this edition is diagnostic only, never a pass/fail gate.

**The apparatus is a collation of printed editions, not manuscripts.**
Every siglum across all 6,934 notes, inventoried directly: `WH, Treg,
Tregmarg, NA27, NA28, RP, NIV, Holmes, TR, SBL, WHapp, WHmarg, ⟦WH⟧` — 13
distinct tokens, zero papyri, uncials, minuscules, versional or patristic
witnesses anywhere. Say so wherever this is served; a scholar who assumes
manuscript support and doesn't find it will conclude the project doesn't
know what an apparatus is.

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
- **Eight separate `curl` processes to the same URL can land on eight different
  Cloudflare datacenters.** Each opens its own connection, and anycast routes
  each independently — one run measured ATL, MIA, DFW, BOS and back to MIA
  across eight requests to the same cache key. Cloudflare's tiered cache does
  not promise a fresh entry is instantly visible across datacenters, so
  `check:platform`'s edge-caching check read 1-3 invocations instead of the
  expected 1, intermittently, for a working cache. Fixed by sending all eight
  through one `curl` invocation instead of eight, so the connection — and the
  datacenter — is reused. Confirmed by `cf-ray`'s datacenter suffix: eight
  requests on one connection all read the same one, and MISS,HIT×7 every time.
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
2. ~~Publish the matrix~~ **Decided 9 September 2026: yes, as a link.** The
   README now points at `conformance/report.md` — GitHub renders it natively,
   so no new infrastructure was needed. The framing there is already
   transparency rather than scorecard, which is what made linking it safe.
3. ~~Should the conformance suite become the front door~~ **Decided 9
   September 2026: no.** A hosted service that judges other APIs live would
   make Colophon the aggregator this project exists to refuse to be — this
   project's own API is a subject in the conformance table, not the judge of
   it, and that framing only holds while the suite stays a file anyone can
   read and rerun themselves. Do not re-open this without Ben saying so.
4. **Verse-data caching is capped at a day.** Raising it needs either a real
   purge, which workers.dev has no zone for, or the generation id in the URL.
   Deliberate, and Ben can overrule it — see the trap below.
5. ~~DRA support in `src/psalms.ts`~~ **Resolved 9 September 2026.** Not a
   hand-built offset table forcing DRA to agree with an ASV reconstruction —
   that design was reviewed and rejected for exactly that reason. Ben
   supplied a local Clementine Vulgate source text, which settled it
   properly: the DRA already prints native Vulgate numbering (145 of 150
   psalms match the source exactly; five are a minor, real edition variance,
   not a bug), so `fromGreekOntoDra` is a bounds check against the DRA's own
   verse counts, not a conversion. `?numbering=greek&translation=dra`
   answers directly now. Separately, the ASV's own `numbering=greek` had a
   real bug (`fromGreek(12, 7)` silently returned the wrong verse under
   200) — nine psalms turned out to have a genuine interior content split or
   merge the title-only model couldn't represent; see "Facts that were
   expensive to establish" above for the psalm-by-psalm summary and
   `src/psalms.ts`'s `irregularGreekParts` for the per-psalm detail.
6. ~~`CorpusExpectations.dropped` has no per-format variant~~ **Resolved 11
   September 2026.** It is now `ReadonlyMap<ScriptureFormat, ReadonlyMap<string,
   number>>` (`src/validate.ts`), and every `ScriptureDocument` carries the
   format that produced it. `validateCorpus` looks up ground truth by
   `doc.format` and fails loudly — one more entry in the same failure list
   as everything else, not a separate abort — when a format has none
   authored yet. The ASV now has real ground truth for both `usfx` and
   `usfm`, measured against `.cache/asv-usfm/`; a real end-to-end
   `bun run build:data --translation asv --source .cache/asv-usfm` reaches
   "Validating… all assertions passed" for the first time. Two gaps remain,
   both deliberate and both loud rather than silent: no USFM ground truth
   for the DRA (no real DRA-as-USFM bundle exists to measure against) and
   no USX ground truth for the ASV (no real ASV-as-USX bundle exists
   either). Neither is exercised by the shipped build. And a caveat worth
   keeping in mind before trusting this for a third-party publisher's file:
   the USFM ground truth is scoped to this specific eBible bundle's marker
   profile, not to USFM as a format — a file using markers this bundle
   never triggers (`\rem`, `\sp`, a different Strong's convention) will
   trip the same parity check on its first run and need its own ground
   truth authored the same way.
7. **`PARSER_VERSION` was not bumped for the USX misclassification fixes,
   or for the three USFM/USX bugs fixed 10 September** (inline apparatus
   truncation, cross-references filed as notes, unparseable table/figure/
   periph). See "Phase 2 — bring your own text" above: neither reader is in
   the `asv`/`dra` build path today, so their output has no effect on
   anything published. Revisit the moment either format's `--source`
   override is actually used to build a shipped edition.
8. **The apparatus's readings aren't decomposed into per-witness fields.**
   Attempted, and abandoned on real evidence, not caution for its own sake:
   Matt 11:9/19:17 and John 18:21 are multi-part word-order transpositions
   sharing one trailing witness list across `;`-joined clauses; Mark 9:38
   cites "Greeven," a named conjecture no siglum list had; Mark 16:8 has a
   witness with trailing punctuation (`NIV.`); John 7:52 embeds the entire
   Pericope Adulterae as a quoted reading with no witness of its own. A
   `witnesses: string[]` field that silently mis-split any of these would
   misrepresent a scholar's own apparatus entry. `lemma`/`readings` stay
   plain strings, `raw` alongside regardless — see `src/sblgnt-apparatus.ts`.
9. **No second Greek edition yet.** The textual-critic audit's strongest
   recommendation: Robinson-Pierpont's Byzantine Textform, freely licensed,
   would turn "an API serving one eclectic critical text" into the only
   place to diff Greek textual traditions programmatically — RP already
   sits inside the SBLGNT's own apparatus as one of its four base editions
   (56 places SBLGNT follows RP alone against WH/Treg/NA28), so the
   scholarly case is already half-made by data this project already holds.
   Not decided, not started — Ben's call, not bundled into this work.
10. **MorphGNT's lemma/parsing tagging of this exact text is unverified.**
    Believed to exist as a free, separate companion dataset (James Tauber);
    not checked this session (no network access during the audit that
    raised it). If it holds up, "no morphology" (true of the SBLGNT-src
    download alone) stops being an ecosystem gap and becomes a real,
    scoped follow-up ingest.
11. **Greek-aware search stays out of scope**, on purpose, matching the
    roadmap's own Phase 05: `src/tokenize.ts`'s folding and `[^a-z]+`
    splitting sends every polytonic Greek character to the separator
    class, tokenizing the whole SBLGNT to zero tokens as written. `sblgnt`
    registers with no search index and relies on the existing per-edition
    gate rather than shipping a half-built tokenizer.

---

## The roadmap artifact

Vision, mission and the six phases:
<https://claude.ai/code/artifact/94ac6bfa-3c67-4eba-af6e-37eb98c632d4>

Update it rather than making a new one; it is the shareable statement of what
this is for.
