/**
 * The one tokenizer, shared by the index builder and the query path.
 *
 * It has to be shared. A corpus tokenized one way and a query tokenized another
 * fails silently: the index is well formed, the query is well formed, and the
 * result is empty for reasons nothing reports.
 *
 * ## Why folding is necessary here
 *
 * This edition prints 1901 typography, and two characters in it defeat a naive
 * `[a-z]` tokenizer:
 *
 * - **The right single quotation mark, U+2019.** Every apostrophe in the corpus
 *   is this character; there are no ASCII apostrophes at all. A reader typing
 *   `Jehovah's` on an ordinary keyboard produced no results, because the query
 *   tokenized to one token that the index could not contain.
 * - **The ligature æ, and the diaereses ï and ü.** They appear in about
 *   twenty-six proper nouns — Cæsar, Judæa, Galilæan, Zacchæus, Jaïrus. Since æ
 *   is outside `[a-z]`, it was read as a word separator: `Cæsar` tokenized to
 *   `sar`, which then matched `Sarai`, while the ordinary spelling `Caesar`
 *   matched nothing.
 *
 * Folding happens for search only. The text the API serves keeps the ligature
 * and the curly apostrophe exactly as the ASV printed them; nothing here
 * modifies the corpus.
 */

/**
 * Characters folded before tokenizing. The apostrophe folds to a space rather
 * than to an ASCII apostrophe, so `Jehovah's` and `Jehovah` reach the same
 * token in every position — a possessive is a form of the word, not a word.
 */
const FOLDED: readonly (readonly [RegExp, string])[] = [
  [/’/g, " "], // right single quotation mark
  [/æ/g, "ae"], // æ
  [/Æ/g, "Ae"], // Æ
  [/ï/g, "i"], // ï
  [/ü/g, "u"], // ü
];

/** Folds 1901 typography to the letters a searcher can actually type. */
export function foldForSearch(text: string): string {
  let folded = text;
  for (const [pattern, replacement] of FOLDED) folded = folded.replace(pattern, replacement);
  return folded;
}

/** Anything outside the Latin alphabet separates words, once folding is done. */
const TOKEN_SPLIT = /[^a-z]+/;

/** Shortest token worth indexing; single letters carry no signal. */
export const MIN_TOKEN_LENGTH = 2;

/** Folds, lowercases, and splits text into index or query terms. */
export function tokenize(text: string): string[] {
  return foldForSearch(text)
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}
