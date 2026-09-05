# Scripture API conformance suite

Asks the same semantic questions of several public Scripture APIs and records
how each one answers.

```bash
bun conformance/run.ts              # replay from cache, fetch what is missing
bun conformance/run.ts --refresh    # ignore the cache, re-fetch everything
bun conformance/run.ts --cached     # never touch the network
bun conformance/run.ts --only ours  # a single API
bun conformance/run.ts --base http://127.0.0.1:8787   # test a local instance
```

Writes `report.md` for people and `results.json` for machines.

## Why it is shaped this way

A suite that checked whether an API matched *our* endpoints would only ever pass
for this project, which proves nothing. So each probe asks a question a caller
would care about — *what happens if I ask for a verse that does not exist?* — and
every API answers in its own dialect through a small adapter.

That makes the output a **capability matrix** rather than a pass/fail score.

The distinction the suite works hardest to preserve is between an API that
declines to answer and one that answers confidently and wrongly. Several of these
APIs take numeric book identifiers and leave reference parsing to the client;
that is a design choice, recorded as `n/a`, not a failure.

## Verdicts

| | Meaning |
|---|---|
| `ok` | Behaved in a way that keeps a caller out of trouble. |
| **`UNSAFE`** | Returned a plausible-looking answer that is not what was asked for. |
| `differs` | A defensible choice incompatible with another defensible choice. |
| `absent` | Honestly missing. |
| `n/a` | The API does not claim this capability. |
| `—` | Unreachable. Never counted as a finding. |

On questions the ecosystem has not settled — how to represent a verse the
translation omits, for instance — **every** implementation records `differs`,
including this one. A scorecard whose author scores best on an open question is
worth nothing.

## Being a good citizen

These are free services whose maintainers did not ask to be measured. The runner
caches every response to disk and replays by default, leaves at least 1.1 s
between requests to the same host, sends a `User-Agent` naming this project, and
supports `--only` so one API can be re-tested without touching the others.

The cache is not committed: it holds third-party responses, some of them from
copyrighted translations. `results.json` keeps only short excerpts, quoted as
evidence for the findings they support.

## Adding an API

An adapter is about thirty lines. Declare what the API can be asked, map each
request into its dialect, and normalize the response — but do not tidy anything
away. If an API returns markup inside verse text, the adapter passes it through;
smoothing it here would hide exactly what the suite exists to find.

```ts
export function example(options: FetchOptions): Adapter {
  return {
    id: "example",
    name: "example.com",
    homepage: "https://example.com",
    edition: "asv",
    capabilities: new Set(["structured-verse"]),
    verse: (usfm, chapter, verse) => /* → Outcome */,
  };
}
```

Add it to `allAdapters()` in `adapters/index.ts`.

## Trusting the results

`conformance.test.ts` covers the probes with synthetic adapters, including
behaviour no real API exhibits, so a probe cannot quietly stop distinguishing a
refusal from a wrong answer. It also pins the cases where an earlier version
overstated a finding: answering `Jude 5` with the whole book is recorded as
`differs`, not `UNSAFE`, because it is a different fault from returning a
different verse.

Adapter honesty is checked separately against the eBible USFX source, so a
normalization bug here cannot be mistaken for a defect in the API being tested.
