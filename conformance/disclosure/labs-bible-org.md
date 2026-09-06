# Disclosure draft — Bible.org (labs.bible.org API)

**Channel:** the contact form at bible.org, or whatever address the API
documentation page lists. The page sits behind a bot check, so it needs opening
in a normal browser.

**Send before:** publishing the matrix. Two weeks' notice.

**Status:** not sent.

---

**Subject:** labs.bible.org API returns a different verse for out-of-range references

Hello,

I've been testing several public Scripture APIs for a small open-source project,
and found four behaviours in the labs.bible.org web service that I think are
worth flagging. I wanted to send them to you before writing anything publicly.

The two that concern me most are out-of-range references. Rather than reporting
that the verse doesn't exist, the API returns a different verse with HTTP 200:

```
curl "https://labs.bible.org/api/?passage=John+3:99&type=json"
→ 200, John 3:1  ("Now a certain man, a Pharisee named Nicodemus…")

curl "https://labs.bible.org/api/?passage=Genesis+99:1&type=json"
→ 200, Genesis 1:1  ("In the beginning God created the heavens and the earth.")
```

John 3 has 36 verses and Genesis has 50 chapters, so both requests are asking
for something that isn't there. Because the response is a success with real
scripture in it, a caller has no way to tell it got a substitution — software
built on this would display or quote the wrong verse silently. A 404, or a 200
with an empty result, would both make it detectable.

Two others, less severe:

```
curl "https://labs.bible.org/api/?passage=Jo+3:16&type=json"
→ 200, John 3:16
```

"Jo" is also the start of Job, Joel, Jonah and Joshua. Returning one of the five
without indicating a choice was made has the same shape as the problem above.

```
curl "https://labs.bible.org/api/?passage=Psalms+23:1&type=json"
→ "A psalm of David. The Lord is my shepherd, I lack nothing."
```

The superscription is merged into verse 1. That shifts the verse contents
relative to editions that number or separate it, so verse-level comparison
against another source doesn't line up.

I also noticed `Jude 5` returns the whole book, and `1 Corinthians 13:4-7,13`
returns thirteen verses rather than five. Those look more like parsing quirks
than correctness problems, so I've recorded them separately.

None of this is urgent, and I realise the service is offered free. I'm intending
to publish the comparison in a couple of weeks, and I'd much rather include a
note that something was changed — or your explanation of the intended
behaviour, if I've misread it — than just the observation. Happy to share the
full results beforehand if that's useful.

Thanks for keeping the API up; it's clearly had a lot of use over the years.

Ben Smith

---

## Reproduction summary, for reference

| Request | Returned | Expected shape |
|---|---|---|
| `John 3:99` | 200, John 3:1 | 404, or 200 with no verses |
| `Genesis 99:1` | 200, Genesis 1:1 | 404, or 200 with no verses |
| `Jo 3:16` | 200, John 3:16 | 400 naming the candidates |
| `Psalms 23:1` | superscription merged into verse 1 | separated or numbered |
| `Jude 5` | whole book, 25 verses | Jude 1:5 |
| `1 Cor 13:4-7,13` | 13 verses | 5 verses |

Verified 2026-09-05. Full matrix in `conformance/report.md`; raw responses are
cached under `conformance/.cache/` and reproducible with
`bun conformance/run.ts --only labs.bible.org --refresh`.
