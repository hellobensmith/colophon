# Outreach draft — Bible.org / NET Bible

**Two things in one message, in this order:** an interest in the NET's translator
notes, and some API behaviour we found while testing. The order matters. The
findings are offered freely and with no conditions attached — if they read as
leverage for the ask, the message has failed and should be split in two.

**Channel:** the contact form at bible.org. The API documentation page sits
behind a bot check, so it needs opening in a normal browser.

**Status:** not sent.

---

**Subject:** The NET's translator notes, and a couple of things we found in the API

Hello,

I'm building an open-source Scripture API and a conformance suite that tests
several public Bible APIs against the same questions. Two things came out of it
that I wanted to bring to you — one because I'd genuinely like to work on it, and
one because it seemed rude not to mention.

**The notes.**

The NET's translator notes are, as far as I can tell, the largest apparatus of
their kind attached to any English translation, and the reason a lot of people
reach for the NET in the first place. They are also almost impossible to consume
programmatically. The redistributable USFX package on eBible carries the text but
only 39 footnotes — the notes are effectively unavailable outside your own
products.

I think that's a shame, and I think it's solvable. The architecture I've been
building models annotations as stand-off ranges: rather than a note belonging to
a verse, it points at a byte span in the text and carries a type and an authority
class. That handles the thing verse-keyed models cannot — a note anchored to a
phrase rather than a whole verse, several notes overlapping the same clause,
text-critical notes and study notes distinguished from each other rather than
flattened into one footnote field.

It also keeps the boundary you'd want. The API states that a span carries a
translator's note of a given kind; it never says how a client should present it.
That is deliberate — the same reason it doesn't do red-letter, which is a client's
decision about an editorial annotation rather than a property of the text.

I'd be glad to talk about what a first-class notes API could look like, on
whatever terms make sense for you — including you running it yourselves, with
your own text, on your own infrastructure. The project holds nobody's text and
isn't trying to.

**The other thing.**

While testing labs.bible.org I found four behaviours worth passing on. The two
that concern me most:

```
curl "https://labs.bible.org/api/?passage=John+3:99&type=json"
→ 200, John 3:1  ("Now a certain man, a Pharisee named Nicodemus…")

curl "https://labs.bible.org/api/?passage=Genesis+99:1&type=json"
→ 200, Genesis 1:1
```

John 3 has 36 verses and Genesis has 50 chapters, so both requests ask for
something that isn't there — and both get real scripture back under a success
status. A caller has no way to tell it received a substitution.

Also `Jo 3:16` returns John 3:16 without indicating that Job, Joel, Jonah and
Joshua were also candidates; and `Psalms 23:1` merges the superscription into
verse 1, which shifts the verse contents relative to editions that separate it.

None of this is urgent and I'm not writing to complain — the service has clearly
been useful to a lot of people for a long time. I'm planning to publish the
comparison in a couple of weeks. It's framed as a map of how the ecosystem
differs rather than a scorecard, because I think the real finding is that four of
the six APIs I tested do no reference parsing at all, so everyone building on them
reimplements it and gets it wrong differently. My own API is in the table too, and
the suite found a gap in it as well.

Happy to share the full results first, and happier still to talk about the notes.

Ben Smith

---

## Why the notes are the substantive ask

Not a pretext. Measured 5 September 2026:

| | |
|---|---|
| Footnotes in eBible's `engnet` USFX | **39** |
| Translator notes in the NET as published | tens of thousands |
| `<nd>` divine-name spans in that USFX | 6,830 |
| `<s>` section headings | 1,801 |

The text is redistributable and parses cleanly with our ingest — 31,102 verses,
coverage ledger balanced, after classifying one element (`<fl>`) the ASV never
uses. The notes are the part that is genuinely unavailable, and the part no
amount of engineering on our side can substitute for.

The NET also happens to be the translation that would most exercise the
annotation model: it carries divine-name spans and section headings that the ASV
does not have at all, which is precisely the apparatus a stand-off layer exists
to represent.
