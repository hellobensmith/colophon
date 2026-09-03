/**
 * Ranked full-text search over the embedded inverted index.
 *
 * Scoring is BM25 with a binary term frequency: the index records whether a
 * token occurs in a verse, not how often. Verses average 26 words, so repeated
 * terms within one verse are rare enough that storing per-verse frequencies
 * would inflate the bundle for almost no ranking benefit.
 *
 * Postings decode lazily, one token at a time, so startup only splits the index
 * into lines and a query pays for the handful of terms it actually touches.
 */

import { INDEX, WORD_COUNTS, TOKEN_COUNT } from "./data/search-index.ts";
import { decodeDeltas, TOTAL_VERSES, verseAt, type CorpusVerse } from "./corpus.ts";
import { buildFamilies } from "./morphology.ts";

const K1 = 1.2;
const B = 0.75;

/**
 * Ceiling on postings materialized for the most selective term.
 *
 * Cloudflare's free plan allows 10 ms of CPU per request. This figure is tuned
 * against CPU measured on the deployed Worker rather than a laptop: production
 * isolates ran roughly four times slower than local benchmarking suggested, and
 * an earlier cap of 12,000 put "the" at 13 ms in production while local tests
 * reported 3 ms.
 *
 * At 6,000 the only single words that truncate are function words — "the",
 * "and", "of", "unto", "shall" — which carry almost no ranking signal anyway.
 * Words that actually mean something stay exact: "Jehovah" (5,821 verses) is
 * the most common of them and sits just inside the cap. Any query of two or
 * more terms is exact regardless, since the rarest term seeds the search.
 */
const MAX_POSTINGS_SCANNED = 6_000;

/** Ceiling on how many index terms one prefix wildcard may expand to. */
const MAX_PREFIX_EXPANSIONS = 64;

const LINES: readonly string[] = INDEX.split("\n");

const TOKENS: readonly string[] = LINES.map((line) => {
  const colon = line.indexOf(":");
  if (colon === -1) throw new Error("Malformed index line without a separator");
  return line.slice(0, colon);
});

if (TOKENS.length !== TOKEN_COUNT) {
  throw new Error(`Index holds ${TOKENS.length} tokens, expected ${TOKEN_COUNT}`);
}

const POSTINGS_CACHE: (Int32Array | undefined)[] = new Array<Int32Array | undefined>(
  LINES.length,
);

const WORD_LENGTHS: Int32Array = decodeDeltas(WORD_COUNTS, TOTAL_VERSES);

/**
 * Surface forms grouped by lemma, so "speak" reaches "spake" and "say" reaches
 * "said". Computed from the vocabulary at startup rather than shipped, which
 * costs about 13 ms of the one-second startup budget and nothing in bundle size.
 */
const FAMILIES: ReadonlyMap<string, readonly string[]> = buildFamilies(TOKENS);

const AVERAGE_LENGTH: number = (() => {
  let total = 0;
  for (let index = 0; index < WORD_LENGTHS.length; index += 1) total += WORD_LENGTHS[index]!;
  return total / WORD_LENGTHS.length;
})();

function postingsAt(index: number): Int32Array {
  const cached = POSTINGS_CACHE[index];
  if (cached !== undefined) return cached;
  const line = LINES[index]!;
  const encoded = line.slice(line.indexOf(":") + 1);
  const parts = encoded.split(",");
  const values = new Int32Array(parts.length);
  let running = 0;
  for (let position = 0; position < parts.length; position += 1) {
    running += Number.parseInt(parts[position]!, 36);
    values[position] = running;
  }
  POSTINGS_CACHE[index] = values;
  return values;
}

/** Index of `token`, or -1. TOKENS is sorted, so this is a binary search. */
function findToken(token: string): number {
  let low = 0;
  let high = TOKENS.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const value = TOKENS[mid]!;
    if (value === token) return mid;
    if (value < token) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

/** First index whose token is >= prefix. */
function lowerBound(prefix: string): number {
  let low = 0;
  let high = TOKENS.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (TOKENS[mid]! < prefix) low = mid + 1;
    else high = mid;
  }
  return low;
}

const TOKEN_SPLIT = /[^a-z']+/;

export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .filter((token) => token.length >= 2);
}

export interface SearchHit extends CorpusVerse {
  readonly score: number;
}

export interface SearchOutcome {
  readonly total: number;
  readonly hits: readonly SearchHit[];
  /** True when a very common term was dropped to stay inside the CPU budget. */
  readonly truncated: boolean;
}

interface Term {
  readonly indices: readonly number[];
  readonly documentFrequency: number;
}

/**
 * Resolves one query token to every index term that should satisfy it: the word
 * itself, the rest of its morphological family, and — for the final token — any
 * term it prefixes, which gives a trailing wildcard for partially typed words.
 */
function resolveTerm(token: string, isLast: boolean): Term | null {
  const indices = new Set<number>();

  const exact = findToken(token);
  if (exact !== -1) indices.add(exact);

  for (const relative of FAMILIES.get(token) ?? []) {
    const index = findToken(relative);
    if (index !== -1) indices.add(index);
  }

  if (isLast) {
    for (let index = lowerBound(token); index < TOKENS.length; index += 1) {
      if (!TOKENS[index]!.startsWith(token)) break;
      if (indices.size >= MAX_PREFIX_EXPANSIONS) break;
      indices.add(index);
    }
  }

  if (indices.size === 0) return null;
  const list = [...indices];
  let frequency = 0;
  for (const index of list) frequency += postingsAt(index).length;
  return { indices: list, documentFrequency: frequency };
}

function resolveTerms(tokens: readonly string[]): Term[] {
  const terms: Term[] = [];
  tokens.forEach((token, position) => {
    const term = resolveTerm(token, position === tokens.length - 1);
    if (term !== null) terms.push(term);
  });
  return terms;
}

/** Postings are stored ascending, so membership is a binary search. */
function postingsContain(postings: Int32Array, document: number): boolean {
  let low = 0;
  let high = postings.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const value = postings[mid]!;
    if (value === document) return true;
    if (value < document) low = mid + 1;
    else high = mid - 1;
  }
  return false;
}

function termMatches(term: Term, document: number): boolean {
  for (const tokenIndex of term.indices) {
    if (postingsContain(postingsAt(tokenIndex), document)) return true;
  }
  return false;
}

export function search(query: string, limit: number, offset: number): SearchOutcome {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return { total: 0, hits: [], truncated: false };

  const terms = resolveTerms(tokens);
  // A word absent from the ASV cannot be satisfied, so the whole query fails.
  if (terms.length !== tokens.length) return { total: 0, hits: [], truncated: false };

  // Rarest first. Only this term's postings are ever materialized; the rest
  // filter the candidates by membership test, so a query costs the size of its
  // most selective term rather than the sum of all of them.
  terms.sort((a, b) => a.documentFrequency - b.documentFrequency);
  const [rarest, ...rest] = terms as [Term, ...Term[]];

  let truncated = false;
  let scanned = 0;
  const seed = new Set<number>();
  for (const tokenIndex of rarest.indices) {
    const postings = postingsAt(tokenIndex);
    const take = Math.min(postings.length, MAX_POSTINGS_SCANNED - scanned);
    if (take < postings.length) truncated = true;
    for (let position = 0; position < take; position += 1) seed.add(postings[position]!);
    scanned += take;
    if (scanned >= MAX_POSTINGS_SCANNED) break;
  }

  let candidates = [...seed];
  for (const term of rest) {
    candidates = candidates.filter((document) => termMatches(term, document));
    if (candidates.length === 0) break;
  }

  if (candidates.length === 0) return { total: 0, hits: [], truncated };

  // Every surviving verse contains every term, so the terms contribute the same
  // total IDF to each. Only BM25's length normalization varies, and it falls
  // monotonically with verse length — so the ranking is exactly "shortest verse
  // containing all the terms, first".
  //
  // That means the order can be decided by an integer comparison on word count
  // instead of a float comparison on a computed score, and the scores need only
  // be worked out for the page actually returned. On a query like "the", which
  // reaches the scan cap, that avoids allocating and sorting twelve thousand
  // score tuples.
  const idfTotal = terms.reduce(
    (sum, term) =>
      sum +
      Math.log(1 + (TOTAL_VERSES - term.documentFrequency + 0.5) / (term.documentFrequency + 0.5)),
    0,
  );

  candidates.sort((a, b) => {
    const byLength = WORD_LENGTHS[a]! - WORD_LENGTHS[b]!;
    return byLength !== 0 ? byLength : a - b;
  });

  const scoreOf = (document: number): number => {
    const normalization = 1 + K1 * (1 - B + (B * WORD_LENGTHS[document]!) / AVERAGE_LENGTH);
    return (idfTotal * (K1 + 1)) / normalization;
  };

  const page = candidates.slice(offset, offset + limit);
  return {
    total: candidates.length,
    truncated,
    hits: page.map((document) => ({
      ...verseAt(document + 1),
      score: Math.round(scoreOf(document) * 10_000) / 10_000,
    })),
  };
}
