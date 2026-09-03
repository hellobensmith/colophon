# Canon-Aware Bible API

The complete American Standard Version (1901) as a REST API: natural-language
reference parsing, ranked full-text search, and book metadata for the
Protestant, Catholic, and Orthodox Greek canons.

The ASV is public domain. So is this data. Nothing here costs money to run.

## How it works

The whole Bible — 31,102 verses — is compiled into the Worker itself. A request
never touches a database, a cache, or the network. Verse lookup is a string
slice; search runs BM25 over an inverted index built at compile time.

The bundle is 1.86 MB gzipped, against Cloudflare's 3 MB limit on the free plan.
A search costs 1–2 ms of CPU, against a 10 ms budget.

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
bun test             # 57 tests
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
`immutable`; book lists last a day; search results last a minute.

## Search

Two things make search work on a translation written in 1901.

**Every term must appear.** Searching `good shepherd` returns 2 verses — John
10:11 and 10:14 — not the 768 that contain either word. The count means what it
says.

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

## Two things about the text

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

**Psalm superscriptions are real text.** "A Psalm of David, when he fled from
Absalom his son" is verse 1 in the Hebrew Bible, though English Bibles print it
as an unnumbered heading. 116 Psalms carry one, and so does Habakkuk 3. They are
returned as `descriptive_title` on a chapter, and as verse 0 when you ask for
Hebrew numbering.

This is what `?numbering=hebrew` is for. Psalm 23 has a title, so English verses
1–6 are Hebrew verses 2–7:

```bash
curl 'localhost:8787/passages?ref=Psalm+23:1-2&numbering=hebrew'
# verse 0: "A Psalm of David."
# verse 1: "Jehovah is my shepherd; I shall not want."
```

The divine name is preserved as the ASV printed it: **Jehovah**, 6,887 times,
where most English Bibles substitute "the LORD".

## Deploying

```bash
bun run deploy
```

That is the whole procedure. There are no secrets, no bindings, no database to
provision, and nothing to configure — the data is in the bundle.

## Limitations

**Hebrew numbering handles the simple case only.** A single per-verse offset
covers the 116 Psalms whose superscription shifts the count. It cannot express
the places where the Hebrew and Greek Psalters divide the text differently:
Psalms 9/10 are one psalm in Hebrew, as are 114/115, while 116 and 147 each
split in two. Those are genuine structural differences, not offsets, and they
are left for a later version.

**One translation.** A second would roughly double the bundle and push past the
3 MB free-tier limit. At that point the data belongs in KV, static assets, or D1
rather than the bundle.

**Updating means redeploying.** Fine for a text fixed in 1901.

**Very common single words are capped.** Searching `the` on its own scans the
first 12,000 postings and sets `truncated: true`. Adding any second term makes
the query exact again, because the rarer term seeds the search and the common one
only filters it.

**Search has no word sense.** "Lie" (recline) and "lie" (falsehood) share a
family, as do the two senses of "saw". Separating them would need part-of-speech
tagging.

**Author and date fields are traditional ascriptions**, not critical judgements.
"Moses" for the Pentateuch is what the tradition says, and the date ranges are
wide enough to span the composition debate rather than settle it. The canon
*orderings*, by contrast, are verified: Catholic against the USCCB's published
NABRE order, Orthodox against Rahlfs-Hanhart's `Septuaginta`.

## Layout

| Path | Role |
| --- | --- |
| `scripts/build-data.ts` | Download, parse, verify, generate |
| `src/usfx.ts` | USFX XML → verses, titles, notes |
| `src/validate.ts` | The assertions the build must pass |
| `src/data/` | Generated; do not edit |
| `src/canon.ts` | Book metadata and canon orderings |
| `src/parser.ts` | Reference parser — a pure function |
| `src/corpus.ts` | Verse lookup over the embedded text |
| `src/search.ts` | BM25 ranking |
| `src/index.ts` | The Hono app |

## Source

Text from [ebible.org](https://ebible.org/Scriptures/eng-asv_usfx.zip), the
USFX edition of the American Standard Version (1901). Public domain.
