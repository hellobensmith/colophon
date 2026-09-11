/**
 * Format-agnostic ingest: read a source, however it's marked up, into the
 * one document shape the rest of the pipeline already trusts.
 *
 * Pure and I/O-free on purpose — `scripts/build-data.ts` is the only caller
 * that reads a file or writes anything, and keeping this function free of
 * that lets format dispatch be tested directly, rather than only indirectly
 * through a script with file-system side effects.
 */

import type { ScriptureDocument } from "./document.ts";
import { parseUsfx } from "./usfx.ts";
import { parseUsfm } from "./usfm.ts";
import { parseUsx } from "./usx.ts";
import { parseSblgnt } from "./sblgnt.ts";
import { detectFormat, type ScriptureFormat } from "./format.ts";

export function parseSource(text: string, format?: ScriptureFormat): ScriptureDocument {
  const detected = format ?? detectFormat(text);
  switch (detected) {
    case "usfx":
      return parseUsfx(text);
    case "usx":
      return parseUsx(text);
    case "usfm":
      return parseUsfm(text);
    case "sblgnt":
      return parseSblgnt(text);
  }
}
