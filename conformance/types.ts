/**
 * The shared vocabulary of the conformance suite.
 *
 * The suite does not test whether an API matches our endpoint shapes — that
 * would only ever pass for our own implementation, which proves nothing. It
 * asks *semantic* questions, and each API answers in its own dialect through an
 * adapter.
 *
 * The distinction that matters most here is between an API that gets something
 * wrong and an API that never claimed to do it. Half of the public Scripture
 * APIs take numeric book identifiers and leave reference parsing to the client;
 * that is a legitimate design, not a failure, and the matrix has to say so.
 * Hence {@link Capability}: a probe that needs something the adapter does not
 * offer records `not-applicable`, never a defect.
 */

/** What an adapter is able to be asked. */
export type Capability =
  /** Accepts a human-typed reference string, so reference parsing is its job. */
  | "freeform-reference"
  /** Addresses a verse by structured book, chapter and verse. */
  | "structured-verse"
  /** Returns more than one verse for a range request. */
  | "range"
  /** Lists the books it holds. */
  | "book-list"
  /** Describes the edition, licence or provenance of its text. */
  | "self-description";

/** One verse as any API might return it, normalized. */
export interface NormalizedVerse {
  /** USFM code where the adapter can supply one, e.g. "JHN". */
  readonly book: string | null;
  readonly chapter: number | null;
  readonly verse: number | null;
  readonly text: string;
}

/** What came back from one request, in a shape probes can reason about. */
export interface Outcome {
  readonly status: number;
  readonly verses: readonly NormalizedVerse[];
  /** The body as received, so a probe can inspect fields we did not normalize. */
  readonly raw: unknown;
  /** Set when the request could not be made at all, as distinct from a 4xx. */
  readonly transportError: string | null;
  /** True when the response was replayed from disk rather than fetched. */
  readonly fromCache: boolean;
}

export interface Adapter {
  readonly id: string;
  readonly name: string;
  readonly homepage: string;
  /** Which of the ASV-bearing editions this adapter is pointed at, if any. */
  readonly edition: string;
  readonly capabilities: ReadonlySet<Capability>;

  /** Resolve a reference exactly as a person would type it. */
  resolve?(reference: string): Promise<Outcome>;
  /** Fetch one verse by structured coordinates. */
  verse?(book: string, chapter: number, verse: number): Promise<Outcome>;
  /** Fetch a whole chapter. */
  chapter?(book: string, chapter: number): Promise<Outcome>;
  /** List books. */
  books?(): Promise<Outcome>;
  /** Whatever the API says about itself: edition, licence, provenance. */
  describe?(): Promise<Outcome>;
}

/**
 * How a probe judges what it saw.
 *
 * Deliberately not a score. A single number would flatten the one distinction
 * worth making: between an API that declines to answer and an API that answers
 * confidently and wrongly.
 */
export type Verdict =
  /** Behaved in the way that keeps a caller out of trouble. */
  | "safe"
  /** Returned a plausible-looking answer that is not what was asked for. */
  | "unsafe"
  /** A defensible choice that is incompatible with another defensible choice. */
  | "divergent"
  /** Honestly absent. */
  | "missing"
  /** The adapter does not claim the capability this probe needs. */
  | "not-applicable"
  /** The host could not be reached, or changed shape. Never a finding. */
  | "unreachable";

export interface ProbeResult {
  readonly verdict: Verdict;
  /** One line, written to be read in a table cell. */
  readonly summary: string;
  /** What was actually requested, so any finding is reproducible. */
  readonly request: string | null;
  /** A short excerpt of what came back, for the report. */
  readonly evidence: string | null;
}

export type Dimension =
  | "reference-resolution"
  | "textual-integrity"
  | "self-description"
  | "wire-contract";

export interface Probe {
  readonly id: string;
  readonly dimension: Dimension;
  /** Short enough to head a matrix column. */
  readonly title: string;
  /** What a caller loses if this goes wrong. Printed in the report. */
  readonly rationale: string;
  /** The probe runs if the adapter claims *any* of these. */
  readonly requires: readonly Capability[];
  run(adapter: Adapter): Promise<ProbeResult>;
}

/** Convenience for the common "this adapter cannot be asked" result. */
export function notApplicable(reason: string): ProbeResult {
  return { verdict: "not-applicable", summary: reason, request: null, evidence: null };
}

/** Trims a response excerpt to something a table can hold. */
export function excerpt(value: unknown, limit = 120): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const collapsed = (text ?? "").replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit)}…` : collapsed;
}
