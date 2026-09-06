# Disclosure

Findings go to the maintainer before the matrix is published. Correctness bugs
are not vulnerabilities, but the courtesy is the same and it costs nothing — and
the people best placed to adopt a shared contract are the people maintaining
these APIs.

| API | Unsafe findings | Action | Status |
|---|---|---|---|
| labs.bible.org | 4 | [draft](./labs-bible-org.md) | not sent |
| bolls.life | 0 | courtesy note, optional | not sent |
| bible-api.com | 0 | none needed | — |
| rkeplin | 0 | none needed | — |
| getbible.net | 0 | none needed | — |
| wldeh | 0 | none needed | — |
| this project | 0 | fixed the one gap found | done |

## The one that isn't listed

An earlier run reported two unsafe findings against bolls.life: Strong's markup
inside verse text, and the Psalm 23 superscription folded into verse 1.

Both were wrong. bolls offers the ASV only as *"American Standard Version 1901
(with Strong's numbers)"* — the markup is the advertised product, and the
superscription is delimited by a `<sup>` element rather than merged into the
prose. The suite had treated a deliberately annotated edition as though it
should be plain text.

Had that gone out, it would have been an email telling a maintainer that the
feature they document is a defect. Reading their API documentation before
drafting is what caught it. The suite now records `not-applicable` for an
edition that declares inline markup, and both corrections are pinned by tests.

It is worth stating plainly, because it is the failure mode of this whole
exercise: a conformance suite that is wrong is worse than no conformance suite,
since it arrives with the authority of a measurement.

## Etiquette

bolls.life's documentation asks that `get-text` and `get-chapter` not be used to
fetch whole translations — it runs on a single-core server. The suite makes a
handful of requests, caches every response and replays from disk by default, so
a full run costs each host well under twenty requests. Keep it that way.
