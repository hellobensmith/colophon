/**
 * Which editions carry a critical apparatus, and the lookup itself.
 *
 * Mirrors `src/search.ts`'s shape deliberately: `APPARATUS_TRANSLATIONS` is
 * derived from which editions actually have a dataset embedded, the same
 * way `SEARCHABLE_TRANSLATIONS` is — never hand-maintained, so it can't
 * drift from what's really there.
 */

import { APPARATUS as SBLGNT_APPARATUS } from "./data/sblgnt/apparatus.ts";
import type { ApparatusNote } from "./sblgnt-apparatus.ts";

const APPARATUS_SOURCES: Readonly<Record<string, Readonly<Record<string, readonly ApparatusNote[]>>>> = {
  sblgnt: SBLGNT_APPARATUS,
};

/** Editions with a critical apparatus embedded. */
export const APPARATUS_TRANSLATIONS: readonly string[] = Object.keys(APPARATUS_SOURCES);

/** A verse's apparatus notes, or an empty array if it has none (never an error). */
export function apparatusFor(translation: string, bcv: string): readonly ApparatusNote[] {
  return APPARATUS_SOURCES[translation]?.[bcv] ?? [];
}
