/**
 * Which of the four Scripture formats a source is written in.
 *
 * A publisher hands over what they have. Asking them to tell us the format as
 * well is a needless step, and getting it wrong is loud rather than subtle —
 * each reader refuses anything it cannot classify — so this sniffs the content
 * rather than trusting a file extension, which says nothing useful when a DBL
 * bundle stores USX under `.xml`.
 */

export type ScriptureFormat = "usfx" | "usx" | "usfm" | "sblgnt";

export function detectFormat(source: string): ScriptureFormat {
  const head = source.slice(0, 4096);
  if (/<usfx[\s>]/.test(head)) return "usfx";
  if (/<usx[\s>]/.test(head)) return "usx";
  if (/^\s*\\id\s/m.test(head)) return "usfm";
  // SBLGNT's own XML opens with a BOM then a bare <book id="..."> — no
  // <usfx>/<usx> root and no \id marker, so it collides with none of the above.
  if (/^﻿?\s*<book\s+id="/.test(head)) return "sblgnt";

  throw new Error(
    "Could not tell what format this source is. Expected a USFX document " +
      "(<usfx>), a USX document (<usx>), USFM beginning with \\id, or an " +
      "SBLGNT-style <book id=\"...\"> document. If the text is in something " +
      "else, it needs converting before ingest — or a reader for it, which " +
      "is a day's work when the format has a schema.",
  );
}
