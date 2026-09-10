# Colophon

A Scripture API you can call today, and a reference implementation you can run
with your own text tomorrow.

The live instance serves the complete American Standard Version (1901): natural
-language reference parsing, ranked full-text search, and book metadata for the
Protestant, Catholic and Orthodox Greek canons. No key, no account, no rate-limit
tier, CORS open to everyone.

```bash
curl 'https://colophon.hellobensmith.workers.dev/passages?ref=Psalm+23'
curl 'https://colophon.hellobensmith.workers.dev/search?q=good+shepherd'
```

```js
const res = await fetch(
  "https://colophon.hellobensmith.workers.dev/passages?ref=" +
    encodeURIComponent("John 3:16"),
);
const { reference, verses } = await res.json();
```

A colophon is the note at the end of a manuscript saying who made it, when, and
from what. That is the commitment: every response carries an edition, a revision
and a generation identifier, so you always know exactly which text you are
holding.

The ASV is public domain. So is this data. Nothing here costs money to run.

**Working on this?** `docs/STATE.md` carries the current phase, the decisions
already settled and why, and the facts that were costly to establish.
`CLAUDE.md` carries the invariants that must not be violated.

**Wondering how this compares to other Scripture APIs?** [`conformance/report.md`](conformance/report.md)
measures this API against six others on the same semantic questions — reference
resolution, textual integrity, self-description, wire contract. Published for
transparency, not as a scorecard: this project's own API is a subject in the
table, not the judge of it.

## How it works

The whole Bible — 31,102 verses — is compiled into the Worker itself. A request
never touches a database, a cache, or the network. Verse lookup is a string
slice; search runs BM25 over an inverted index built at compile time.

Measured on the deployed Worker rather than a laptop, and re-measured by
`bun run check:platform` so these numbers cannot quietly go stale:

| | Measured | Limit |
| --- | --- | --- |
| Bundle | 4.05 MB gzip (two translations) | 10 MB on this account's plan; 3 MB on the free plan |
| CPU per request | 9–39 ms median, 47–112 ms worst | none enforced on this plan; 10 ms on the free plan |
| Worker startup | ~19 ms | 1,000 ms |
| Requests | — | 100,000/day on the free plan |

The CPU figures move between runs because requests land across many isolates and
each new one pays a posting-cache warm; a long phrase search is the expensive
shape. A deployment of this on the free plan would exceed the 10 ms CPU limit on
those searches, and the bundle would still fit.

The peak is the first search an isolate serves, which pays to decode the
postings it touches. Everything after that runs in 0–4 ms.

Repeat requests cost no CPU at all. `[cache] enabled` in `wrangler.toml` puts a
cache in front of the Worker, so a hit is served without running it — measured at
7 of 8 identical requests never reaching the Worker. Deploying does **not** invalidate that cache. This was
measured on 7 September 2026, and it had been documented the other way round: a
response cached before a deploy was still served afterwards, from a Worker
version no longer deployed, while a cache-busted request to the same path
returned the new answer. Verse data is therefore cached for a day rather than
the year of `immutable` it used to claim, so a correction propagates on its own.
Every response carries `x-generation-id`, so a caller can always tell which
build its copy came from.

A cache hit still counts against the free plan's 100,000 requests/day, so on
that plan requests, not CPU, are the limit you would reach first.

This is a deliberate trade. The text was fixed in 1901 and will never change, so
there are no writes, no concurrency, and nothing to grow into. A database would
have added a round trip to a single region on every request — 100–250 ms for a
reader far from it — to serve data that can simply live in the isolate. It would
also have added a connection to lose, a token to rotate, and a query to inject
into. See [Limitations](#limitations) for what this costs.

## Quick start

```bash
bun install
bun run build:data   # download, parse, verify, and generate src/data/
bun test             # runs the suite
bun run dev          # http://localhost:8787
```

With the server running, `bun run check:contract` asserts that live responses
match `openapi.yaml` exactly — every required field present, no undeclared
extras, and the right status code for each failure.

`build:data` refuses to emit anything unless the parsed corpus matches the known
ASV versification exactly — all 66 book totals, 31,102 verses, 117 titles.

## Examples

```bash
# A single verse
curl 'localhost:8787/passages?ref=John+3:16'

# A range across chapters
curl 'localhost:8787/passages?ref=Genesis+1:1-2:3'

# Several segments at once
curl 'localhost:8787/passages?ref=1+Cor+13:4-7,13'

# A one-chapter book takes a bare verse
curl 'localhost:8787/passages?ref=Jude+5'

# Hebrew numbering: the superscription is verse 1
curl 'localhost:8787/passages?ref=Psalm+23:1-3&numbering=hebrew'

# Ranked search. Every term must appear, and words match their whole family:
# "speak" also finds "spake", "say" also finds "said" and "saith".
curl 'localhost:8787/search?q=good+shepherd'
curl 'localhost:8787/search?q=speak'
curl 'localhost:8787/search?q=believet'    # the last term also matches by prefix

# Books in each canon's own order
curl 'localhost:8787/books?tradition=catholic'
curl 'localhost:8787/books/PSA/chapters/23'
```

One-chapter books accept either form — `Jude 5` and `Jude 1:5` both work, as do
`2 John 10` and `2 John 1:10`.

## Errors

Failures divide by cause rather than by endpoint.

**400** means the request could not be understood. Ambiguity is refused rather
than guessed:

```bash
curl 'localhost:8787/passages?ref=Jo+3:16'
# 400 — Ambiguous book abbreviation "Jo" — it could mean Job, Joel, John, Jonah, Joshua
```

**404** means the reference made sense but names something that is not there:

```bash
curl 'localhost:8787/passages?ref=John+3:99'
# 404 — John 3 only has 36 verses

curl 'localhost:8787/passages?ref=Genesis+99:1'
# 404 — Genesis has 50 chapters, so there is no chapter 99

curl 'localhost:8787/passages?ref=Tobit+1:1'
# 404 — Tobit is not present in the American Standard Version
```

This is deliberate: `/books/GEN/chapters/99` and `?ref=Genesis+99:1` describe the
same missing chapter, so they return the same status. Reserving 400 for input
the parser genuinely cannot read keeps the two cases distinguishable by a client.

## Endpoints

Every endpoint accepts `?translation=`, defaulting to `asv`.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Liveness |
| `GET /books?tradition=` | Books in canon order |
| `GET /books/:id` | One book |
| `GET /books/:id/chapters/:num` | A chapter in full |
| `GET /passages?ref=&numbering=` | Resolve a reference |
| `GET /search?q=&limit=&offset=` | Ranked search |

`openapi.yaml` is the source of truth for every response shape, and the test
suite checks live responses against it.

Passages are capped at 500 verses and return 413 above that. Search needs at
least 2 characters and returns at most 100 results. Verse data is served
a day; book lists last a day; search results last a minute.

## Search

Two things make search work on a translation written in 1901.

**Every term must appear.** Searching `good shepherd` returns 2 verses — John
10:11 and 10:14 — not the 768 that contain either word. The count means what it
says.

**Typography is folded.** This edition prints 1901 typography, and two
characters in it defeat a naive tokenizer. Every apostrophe in the corpus is
U+2019, not the one on your keyboard — so `Jehovah's` used to return nothing at
all. And æ appears in about twenty-six proper nouns, where it was read as a word
separator: `Cæsar` tokenized to `sar` and matched *Sarai*, while `Caesar` matched
nothing. Both spellings now reach the same verses, and the served text keeps the
ligature and the curly quote exactly as the ASV printed them.

**Words match their whole family.** Prefix matching alone fails badly here,
because the most common verbs in this translation are irregular:

| Search | Also finds | Occurrences that prefix matching misses |
| --- | --- | --- |
| `say` | said, saith, sayest | 3,903 + 1,326 |
| `speak` | spake, spoken | 620 |
| `go` | went, gone | 1,272 |
| `see` | saw, seen | — |
| `have` | hath, hast, had | 1,904 |

`spake` occurs more often than `speak` in the ASV. Without this, searching for
one of these verbs returns roughly half the passages you meant.

Families are derived from the corpus itself: a suffix rule may only connect two
forms when the root it produces is *also a word in the text*. That constraint is
what keeps `loved → love` while refusing `bed → be`. Irregulars that no rule
could derive are listed explicitly in `src/morphology.ts`.

Ranking is BM25. Since every result contains every term, length normalization
does the ordering — the most concise verse containing all your words comes first.

## Two identities

Every response carries `x-generation-id` and `x-revision-id`, and `/health`
reports both.

They answer different questions. **`revision_id`** is what the text *is*,
derived from the source archive alone — it moves only when eBible republishes.
**`generation_id`** is what was *published*, derived from the whole build
manifest — it moves whenever anything published changes, including a metadata
correction over identical text.

The distinction only costs something the day it is missing. Correcting a canon
date should retire every cached response but must not invalidate a coordinate
someone saved into the text. One identifier gets exactly one of those right.

`src/data/<translation>/manifest.json` records what a generation is made of:
source hash, artifact hashes, policy versions, and the corpus counts. Rebuilding
from identical source reproduces the same `generation_id` byte for byte. Each
edition keeps its own, because each is a separate published thing.

## The canons

A book's place in the Bible depends on whose Bible you mean. Every book carries
its position in all three traditions:

| Tradition | Books | Adds |
| --- | --- | --- |
| Protestant | 66 | — |
| Catholic | 73 | Tobit, Judith, Wisdom, Sirach, Baruch, 1–2 Maccabees |
| Orthodox Greek | 76 | the above, plus 1 Esdras, 3 Maccabees, Prayer of Manasseh |

Order differs too, not just contents. Catholic Bibles follow the Vulgate, which
places Tobit and Judith after Nehemiah. Greek Bibles follow the Septuagint,
where the Minor Prophets come *before* Isaiah, Jeremiah, and Ezekiel.

Two conventions keep the totals at their traditional counts: the Letter of
Jeremiah is carried as Baruch 6, and Psalm 151 is appended to the Psalter rather
than counted as a book.

**The ASV contains no deuterocanonical text.** Those ten books are served as
metadata only — you get their canon positions, authorship, and date, and
`data_availability: "metadata_only"`. Asking for their text returns 404, which
is honest rather than empty.

## Three things about the text

**Sixteen verses are empty on purpose.** The ASV omits verses its translators
judged absent from the earliest manuscripts, but keeps the numbering so
references still line up. Matthew 17:21, Mark 9:44, John 5:4, Acts 8:37 and
twelve others come back with `text: ""` and a `note` explaining why:

```json
{
  "id": "MAT.17.21",
  "text": "",
  "note": "Many authorities, some ancient, insert v. 21. But this kind goeth not out save by prayer and fasting. See Mrk 9:29."
}
```

**Selah is bracketed, and the bracket is repaired.** Every `<qs>` marker in the
source reads `[Selah` with no closing bracket — 78 opening brackets in the file
against four closing ones, none of which belong to a Selah. The API closes it, so
the text reads `[Selah]`.

That repair is deliberately confined to the Selah markers. The ASV also brackets
John 7:53–8:11 to mark that passage's disputed manuscript standing, and *that*
bracket opens in one verse and closes thirteen verses later. Balancing brackets
verse by verse would have corrupted real textual apparatus in order to tidy a
markup artifact, so those two verses are left exactly as printed.

**Psalm superscriptions are real text.** "A Psalm of David, when he fled from
Absalom his son" is verse 1 in the Hebrew Bible, though English Bibles print it
as an unnumbered heading. 116 Psalms carry one. They are returned as
`descriptive_title` on a chapter, and as verse 0 when you ask for Hebrew
numbering.

Habakkuk 3 is the one chapter that closes with a line rather than opening with
one: "For the Chief Musician, on my stringed instruments", printed below verse
19. The source marks it with the same element as a superscription, so position
is the only thing that distinguishes them. It is returned as `subscription`, and
a parser that reads the element alone will either hang it above verse 1 as a
heading or paste it onto the end of verse 19.

This is what `?numbering=hebrew` is for. Psalm 23 has a title, so English verses
1–6 are Hebrew verses 2–7:

```bash
curl 'localhost:8787/passages?ref=Psalm+23:1-2&numbering=hebrew'
# verse 0: "A Psalm of David."
# verse 1: "Jehovah is my shepherd; I shall not want."
```

## The two Psalters

Catholic and Orthodox sources number the Psalms as the Septuagint and Vulgate do,
which is not how the ASV numbers them. "Psalm 50" in a patristic citation or a
liturgical text is the *Miserere* — printed here as Psalm 51.

The divergence is not a constant offset. Two psalms merge, two split:

| Greek | Hebrew |
| --- | --- |
| 1–8 | 1–8 |
| **9** | **9 + 10** |
| 10–112 | 11–113 |
| **113** | **114 + 115** |
| **114** | **116:1–9** |
| **115** | **116:10–19** |
| 116–145 | 117–146 |
| **146** | **147:1–11** |
| **147** | **147:12–20** |
| 148–150 | 148–150 |

`?numbering=greek` handles all of it, including verse positions inside the merged
and split psalms:

```bash
curl 'localhost:8787/passages?ref=Psalm+50:3&numbering=greek'
# Psalm 51:1 — "Have mercy upon me, O God"

curl 'localhost:8787/passages?ref=Psalm+115:1&numbering=greek'
# Psalm 116:10 — "I believe, for I will speak", the Vulgate's Credidi

curl 'localhost:8787/passages?ref=Psalm+9:21-22&numbering=greek'
# crosses from Hebrew 9:20 into Hebrew 10:1 inside a single Greek psalm
```

Every mapping is checked against the Clementine Vulgate's own text, not
reconstructed from this translation alone: 2,526 Greek coordinates resolve
onto 2,506 distinct positions in this translation (four two-line
superscriptions and two verse splits each address the same position twice,
which is why distinct positions run lower than addressable coordinates). Nine
psalms — 12, 43, 52, 55, 71, 99, 108, 129, 145 — have a genuine content split
or merge inside them where the Vulgate's own verse divisions disagree with
this translation's, not just at the title; a handful of specific verses in
those psalms are refused rather than guessed, since returning either half of
a merged verse would silently omit real content.

`?translation=dra&numbering=greek` needs no conversion at all: the
Douay-Rheims already prints the Vulgate's own division, so addressing it in
Greek numbering is a bounds check against its own verse counts.

The divine name is preserved as the ASV printed it: **Jehovah**, 6,887 times,
where most English Bibles substitute "the LORD".

## Deploying

```bash
bun run deploy
```

That is the whole procedure. There are no secrets, no bindings, no database to
provision, and nothing to configure — the data is in the bundle.

## Limitations

**Two translations, on the paid plan.** The ASV and the Douay-Rheims are both
embedded and searchable, each from its own index — `?translation=dra` works
on every endpoint. Together they run about 4.05 MB gzip, comfortably under
the 10 MB limit a paid Worker gets, but over the 3 MB a free account gets: this
deployment needs the paid tier. A third translation is plumbing, not a wall —
verse counts are per edition, and 32 of the 66 books the ASV and the
Douay-Rheims share disagree about them — Esther and Daniel by whole chapters —
so a verse coordinate is only ever meaningful paired with the translation it
was resolved against.

**Updating means redeploying, and then waiting.** Fine for a text fixed in 1901,
but worth stating plainly: a deploy does not purge the cache in front of the
Worker, so a correction takes up to the `max-age` on the affected responses —
a day for verse data — to reach a caller who has already fetched that URL. Every
response carries `x-generation-id`, so a stale copy can always be identified as
one.

**Very common single words are capped.** Searching `the` on its own scans the
first 6,000 postings and sets `truncated: true`. The cap is tuned against CPU
measured on the deployed Worker, not locally — production isolates ran about four
times slower than a laptop suggested. Only function words reach it: `the`, `and`,
`of`, `unto`, `shall`. Every word that carries meaning stays exact, `Jehovah`
(5,821 verses) included. Any query of two or more terms is exact regardless,
since the rarest term seeds the search and the common one only filters it.

**Modern spellings of ligatured names are not aliased.** `Judæa` and `Judaea`
both work, because the fold expands the ligature. `Judea` — the modern spelling
with one `a` — does not, since that is a synonym problem rather than a
normalization one, and solving it would need a name table.

**Search has no word sense.** Four tokens carry two meanings each: `lie`
(recline / falsehood), `saw` (tool / past of see), `found` (past of find / to
establish), and `bear` (carry / the animal). The two senses are the same string,
so no morphology can separate them.

Ranking literal matches above family relatives was tried and rejected. It works
for those four words — a search for `saw` surfaces "Then I returned and saw
vanity under the sun" first — but it costs the feature that matters more. With
the boost in place, the top twenty results for `speak`, `say`, `go` and `see`
contained no archaic form at all: `spake`, `saith` and `went` were pushed below
a hundred literal matches. Since `spake` occurs more often than `speak` in this
translation, that trade loses more than it wins, and it also roughly doubled the
CPU of a common-word search. The homograph stays.

What *was* fixable has been fixed: the rules no longer merge `being` into "bee",
`doing` into "doe", `lying` into "lye", or `thing` into "the".

**Author and date fields are traditional ascriptions**, not critical judgements.
"Moses" for the Pentateuch is what the tradition says, and the date ranges are
wide enough to span the composition debate rather than settle it. The canon
*orderings*, by contrast, are verified: Catholic against the USCCB's published
NABRE order, Orthodox against Rahlfs-Hanhart's `Septuaginta`.

## Layout

| Path | Role |
| --- | --- |
| `scripts/build-data.ts` | Download, parse, verify, generate |
| `src/identity.ts` | Revision and generation identity |
| `src/tokenize.ts` | The one tokenizer, shared by index and query |
| `src/document.ts` | The shared document/ledger shape every reader produces |
| `src/ingest.ts` | Format dispatch — USFX, USFM, or USX in |
| `src/usfx.ts` | USFX XML → verses, titles, notes |
| `src/usfm.ts` | USFM marker text → verses, titles, notes |
| `src/usx.ts` | USX XML → verses, titles, notes |
| `src/usx-styles.ts` | USX `style` vocabulary, generated from the schema |
| `src/validate.ts` | The assertions the build must pass |
| `src/data/` | Generated; do not edit |
| `src/canon.ts` | Book metadata and canon orderings |
| `src/parser.ts` | Reference parser — a pure function |
| `src/corpus.ts` | Verse lookup over the embedded text |
| `src/search.ts` | BM25 ranking |
| `src/index.ts` | The Hono app |

## Source

Text from [ebible.org](https://ebible.org/Scriptures/eng-asv_usfx.zip), the
USFX edition of the American Standard Version (1901). Public domain. The
Douay-Rheims comes from the same publisher, as
[engDRA](https://ebible.org/Scriptures/engDRA_usfx.zip), also public domain.
