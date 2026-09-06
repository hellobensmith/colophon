/**
 * The semantic questions.
 *
 * Each probe asks something a caller would care about and judges the answer.
 * The verdicts are deliberately conservative about calling anything `safe`: on
 * questions where the ecosystem has no agreed answer — how to represent a verse
 * the translation omits, for instance — every implementation records
 * `divergent`, including this project's. Scoring ourselves best on a question
 * nobody has settled would make the whole matrix worthless.
 */

import { book } from "./books.ts";
import { excerpt, notApplicable, type Adapter, type Outcome, type Probe, type ProbeResult } from "./types.ts";

/** Reads one verse using whichever access the adapter offers. */
async function readVerse(
  adapter: Adapter,
  usfm: string,
  chapter: number,
  verse: number,
): Promise<{ outcome: Outcome; how: string } | null> {
  if (adapter.verse !== undefined && adapter.capabilities.has("structured-verse")) {
    return { outcome: await adapter.verse(usfm, chapter, verse), how: `${usfm} ${chapter}:${verse}` };
  }
  if (adapter.resolve !== undefined && adapter.capabilities.has("freeform-reference")) {
    const reference = `${book(usfm).name} ${chapter}:${verse}`;
    return { outcome: await adapter.resolve(reference), how: reference };
  }
  return null;
}

function unreachable(outcome: Outcome, request: string): ProbeResult {
  return {
    verdict: "unreachable",
    summary: outcome.transportError ?? `status ${outcome.status}`,
    request,
    evidence: null,
  };
}

const VERSE_ACCESS = ["structured-verse", "freeform-reference"] as const;

/* ------------------------------------------------------------------ *
 * A — Reference resolution. Does it refuse to guess?
 * ------------------------------------------------------------------ */

const ambiguousAbbreviation: Probe = {
  id: "ambiguous-abbreviation",
  dimension: "reference-resolution",
  title: "Ambiguous abbreviation",
  rationale:
    '"Jo" begins Job, Joel, John, Jonah and Joshua. An API that picks one silently ' +
    "returns a real verse from the wrong book, and the caller has no way to detect it.",
  requires: ["freeform-reference"],
  async run(adapter) {
    if (adapter.resolve === undefined) return notApplicable("takes structured identifiers");
    const reference = "Jo 3:16";
    const outcome = await adapter.resolve(reference);
    if (outcome.transportError !== null) return unreachable(outcome, reference);

    if (outcome.status >= 400) {
      const detail = excerpt((outcome.raw as { detail?: unknown })?.detail ?? outcome.raw, 90);
      const namesCandidates = /job|joel|john|jonah|joshua/i.test(detail) &&
        detail.split(/job|joel|john|jonah|joshua/i).length > 2;
      return {
        verdict: "safe",
        summary: namesCandidates ? "refused, naming the candidates" : "refused",
        request: reference,
        evidence: detail,
      };
    }
    if (outcome.verses.length === 0) {
      return { verdict: "divergent", summary: "200 with no verses", request: reference, evidence: excerpt(outcome.raw, 90) };
    }
    const chosen = outcome.verses[0]!.book ?? "(unnamed)";
    return {
      verdict: "unsafe",
      summary: `200 — silently chose ${chosen}`,
      request: reference,
      evidence: excerpt(outcome.verses[0]!.text, 90),
    };
  },
};

const verseOutOfRange: Probe = {
  id: "verse-out-of-range",
  dimension: "reference-resolution",
  title: "Verse past end of chapter",
  rationale:
    "John 3 has 36 verses. Asking for verse 99 must not produce a different verse " +
    "under a success status — that is a wrong answer a caller will quote.",
  requires: ["freeform-reference"],
  async run(adapter) {
    if (adapter.resolve === undefined) return notApplicable("takes structured identifiers");
    const reference = "John 3:99";
    const outcome = await adapter.resolve(reference);
    if (outcome.transportError !== null) return unreachable(outcome, reference);

    if (outcome.status >= 400) {
      const detail = excerpt((outcome.raw as { detail?: unknown })?.detail ?? outcome.raw, 90);
      return {
        verdict: "safe",
        summary: /36/.test(detail) ? "refused, stating the real length" : "refused",
        request: reference,
        evidence: detail,
      };
    }
    if (outcome.verses.length === 0) {
      return { verdict: "divergent", summary: "200 with no verses", request: reference, evidence: excerpt(outcome.raw, 90) };
    }
    const got = outcome.verses[0]!;
    if (got.verse !== null && got.verse !== 99) {
      return {
        verdict: "unsafe",
        summary: `200 — returned verse ${got.verse} instead`,
        request: reference,
        evidence: excerpt(got.text, 90),
      };
    }
    return { verdict: "divergent", summary: "200 with a verse 99", request: reference, evidence: excerpt(got.text, 90) };
  },
};

const chapterOutOfRange: Probe = {
  id: "chapter-out-of-range",
  dimension: "reference-resolution",
  title: "Chapter past end of book",
  rationale: "Genesis has 50 chapters. The same substitution risk as a bad verse number.",
  requires: ["freeform-reference"],
  async run(adapter) {
    if (adapter.resolve === undefined) return notApplicable("takes structured identifiers");
    const reference = "Genesis 99:1";
    const outcome = await adapter.resolve(reference);
    if (outcome.transportError !== null) return unreachable(outcome, reference);
    if (outcome.status >= 400) {
      return { verdict: "safe", summary: "refused", request: reference, evidence: excerpt((outcome.raw as { detail?: unknown })?.detail ?? outcome.raw, 90) };
    }
    if (outcome.verses.length === 0) {
      return { verdict: "divergent", summary: "200 with no verses", request: reference, evidence: null };
    }
    const got = outcome.verses[0]!;
    return {
      verdict: got.chapter !== null && got.chapter !== 99 ? "unsafe" : "divergent",
      summary: got.chapter !== null && got.chapter !== 99 ? `200 — returned chapter ${got.chapter}` : "200 with content",
      request: reference,
      evidence: excerpt(got.text, 90),
    };
  },
};

const crossChapterRange: Probe = {
  id: "cross-chapter-range",
  dimension: "reference-resolution",
  title: "Range across a chapter break",
  rationale:
    "Genesis 1:31–2:3 spans a chapter boundary. Support tells a caller whether it " +
    "must decompose ranges itself.",
  requires: ["freeform-reference"],
  async run(adapter) {
    if (adapter.resolve === undefined) return notApplicable("takes structured identifiers");
    const reference = "Genesis 1:31-2:3";
    const outcome = await adapter.resolve(reference);
    if (outcome.transportError !== null) return unreachable(outcome, reference);
    const chapters = new Set(outcome.verses.map((v) => v.chapter));
    if (outcome.verses.length === 4 && chapters.size === 2) {
      return { verdict: "safe", summary: "4 verses across both chapters", request: reference, evidence: null };
    }
    if (outcome.verses.length === 0) {
      return { verdict: "missing", summary: outcome.status >= 400 ? `refused (${outcome.status})` : "200, no verses", request: reference, evidence: null };
    }
    return {
      verdict: "divergent",
      summary: `${outcome.verses.length} verses, ${chapters.size} chapter(s)`,
      request: reference,
      evidence: excerpt(outcome.verses.map((v) => `${v.chapter}:${v.verse}`).join(" "), 60),
    };
  },
};

const multiSegment: Probe = {
  id: "multi-segment",
  dimension: "reference-resolution",
  title: "Multi-segment reference",
  rationale:
    "1 Cor 13:4-7,13 is how the passage is normally cited. Without it a caller " +
    "issues several requests and stitches the result.",
  requires: ["freeform-reference"],
  async run(adapter) {
    if (adapter.resolve === undefined) return notApplicable("takes structured identifiers");
    const reference = "1 Corinthians 13:4-7,13";
    const outcome = await adapter.resolve(reference);
    if (outcome.transportError !== null) return unreachable(outcome, reference);
    const numbers = outcome.verses.map((v) => v.verse);
    const wanted = [4, 5, 6, 7, 13];
    if (numbers.length === 5 && wanted.every((n) => numbers.includes(n))) {
      return { verdict: "safe", summary: "verses 4-7 and 13", request: reference, evidence: null };
    }
    if (outcome.verses.length === 0) {
      return { verdict: "missing", summary: outcome.status >= 400 ? `refused (${outcome.status})` : "200, no verses", request: reference, evidence: null };
    }
    return {
      verdict: "divergent",
      summary: `${numbers.length} verses: ${numbers.join(",")}`,
      request: reference,
      evidence: null,
    };
  },
};

const singleChapterBook: Probe = {
  id: "single-chapter-book",
  dimension: "reference-resolution",
  title: "One-chapter book, both forms",
  rationale:
    "Jude has one chapter, so both `Jude 5` and `Jude 1:5` are cited in the wild. " +
    "An API that accepts only one form silently mishandles the other.",
  requires: ["freeform-reference"],
  async run(adapter) {
    if (adapter.resolve === undefined) return notApplicable("takes structured identifiers");
    const bare = await adapter.resolve("Jude 5");
    const explicit = await adapter.resolve("Jude 1:5");
    if (bare.transportError !== null) return unreachable(bare, "Jude 5");

    const explicitText = explicit.verses[0]?.text ?? "";
    const bareText = bare.verses[0]?.text ?? "";

    // Returning the whole book is a distinct behaviour from returning a
    // different verse, and conflating them would overstate the finding.
    if (bare.verses.length > 5) {
      return {
        verdict: "divergent",
        summary: `\`Jude 5\` returned the whole book (${bare.verses.length} verses)`,
        request: "Jude 5 / Jude 1:5",
        evidence: excerpt(bareText, 70),
      };
    }
    if (bareText !== "" && bareText === explicitText) {
      return { verdict: "safe", summary: "both forms agree", request: "Jude 5 / Jude 1:5", evidence: excerpt(bareText, 70) };
    }
    if (bareText === "" || explicitText === "") {
      return {
        verdict: "divergent",
        summary: bareText === "" ? "`Jude 5` returned nothing" : "`Jude 1:5` returned nothing",
        request: "Jude 5 / Jude 1:5",
        evidence: null,
      };
    }
    return {
      verdict: "unsafe",
      summary: "the two forms return different single verses",
      request: "Jude 5 / Jude 1:5",
      evidence: excerpt(`${bareText} || ${explicitText}`, 100),
    };
  },
};

/* ------------------------------------------------------------------ *
 * B — Textual integrity.
 * ------------------------------------------------------------------ */

const omittedVerse: Probe = {
  id: "omitted-verse",
  dimension: "textual-integrity",
  title: "A verse the ASV omits",
  rationale:
    "The ASV prints no text at Matthew 17:21, keeping the number and a footnote. " +
    "Implementations disagree on how to represent that, and a caller cannot tell " +
    "which convention it is getting. No agreed answer exists, so nothing here is `safe`.",
  requires: VERSE_ACCESS,
  async run(adapter) {
    const read = await readVerse(adapter, "MAT", 17, 21);
    if (read === null) return notApplicable("no verse access");
    const { outcome, how } = read;
    if (outcome.transportError !== null) return unreachable(outcome, how);

    if (outcome.status >= 400) {
      return { verdict: "divergent", summary: `refused (${outcome.status})`, request: how, evidence: null };
    }
    const text = outcome.verses[0]?.text ?? "";
    if (text === "") {
      const note = (outcome.raw as { verses?: { note?: unknown }[] })?.verses?.[0]?.note;
      return {
        verdict: "divergent",
        summary: typeof note === "string" && note !== "" ? "empty text, with a note" : "empty, unexplained",
        request: how,
        evidence: typeof note === "string" ? excerpt(note, 80) : null,
      };
    }
    const bracketed = /^\s*[[(]/.test(text);
    return {
      verdict: "divergent",
      summary: bracketed ? "text present, bracketed" : "text present, unmarked",
      request: how,
      evidence: excerpt(text, 80),
    };
  },
};

const psalmSuperscription: Probe = {
  id: "psalm-superscription",
  dimension: "textual-integrity",
  title: "Psalm superscription",
  rationale:
    '"A Psalm of David" is verse 1 in Hebrew and an unnumbered heading in English ' +
    "Bibles. An API that drops it loses text; one that folds it into verse 1 shifts " +
    "every subsequent verse.",
  requires: VERSE_ACCESS,
  async run(adapter) {
    const read = await readVerse(adapter, "PSA", 23, 1);
    if (read === null) return notApplicable("no verse access");
    const { outcome, how } = read;
    if (outcome.transportError !== null) return unreachable(outcome, how);
    const text = outcome.verses[0]?.text ?? "";
    if (text === "") return { verdict: "unreachable", summary: "no text returned", request: how, evidence: null };
    // A superscription inside its own element is delimited, not merged: a
    // client rendering the markup still shows a heading. Only an undelimited
    // run-on genuinely loses the distinction.
    const delimited = /<(sup|h\d|span|i|em)[^>]*>[^<]*psalm of david/i.test(text);
    const plain = text.replace(/<[^>]*>/g, "");
    const foldedIn = /psalm of david/i.test(plain);
    const isVerseOne = /shepherd/i.test(plain);
    if (foldedIn && isVerseOne) {
      return {
        verdict: delimited ? "divergent" : "unsafe",
        summary: delimited
          ? "superscription inside verse 1, delimited by markup"
          : "superscription folded into verse 1",
        request: how,
        evidence: excerpt(text, 80),
      };
    }
    if (!isVerseOne) {
      return { verdict: "divergent", summary: "verse 1 is not the expected line", request: how, evidence: excerpt(text, 80) };
    }
    // Verse 1 is correct. The remaining question is whether the heading is
    // available at all — an API that serves it as its own field deserves credit
    // an API that discards it does not.
    if (adapter.chapter !== undefined) {
      const whole = await adapter.chapter("PSA", 23);
      const body = JSON.stringify(whole.raw ?? "");
      if (/psalm of david/i.test(body)) {
        return { verdict: "safe", summary: "verse 1 correct, heading served separately", request: how, evidence: null };
      }
    }
    return { verdict: "divergent", summary: "verse 1 correct, heading not offered", request: how, evidence: excerpt(text, 70) };
  },
};

const divineName: Probe = {
  id: "divine-name",
  dimension: "textual-integrity",
  title: "The divine name",
  rationale:
    'The ASV prints "Jehovah" 6,887 times where most translations put "LORD". ' +
    "Substituting it silently changes what the edition says it is.",
  requires: VERSE_ACCESS,
  async run(adapter) {
    const read = await readVerse(adapter, "EXO", 6, 3);
    if (read === null) return notApplicable("no verse access");
    const { outcome, how } = read;
    if (outcome.transportError !== null) return unreachable(outcome, how);
    const text = outcome.verses[0]?.text ?? "";
    if (text === "") return { verdict: "unreachable", summary: "no text returned", request: how, evidence: null };
    if (adapter.edition !== "asv") {
      return { verdict: "not-applicable", summary: `edition is ${adapter.edition}, not the ASV`, request: how, evidence: excerpt(text, 60) };
    }
    if (/jehovah/i.test(text)) {
      return { verdict: "safe", summary: "Jehovah preserved", request: how, evidence: excerpt(text, 70) };
    }
    return { verdict: "unsafe", summary: "the ASV's divine name is missing", request: how, evidence: excerpt(text, 80) };
  },
};

const markupLeakage: Probe = {
  id: "markup-leakage",
  dimension: "textual-integrity",
  title: "Markup in verse text",
  rationale:
    "Verse text should be text. Embedded tags force every consumer to write a " +
    "stripper, and each one strips differently.",
  requires: VERSE_ACCESS,
  async run(adapter) {
    const read = await readVerse(adapter, "JHN", 3, 16);
    if (read === null) return notApplicable("no verse access");
    const { outcome, how } = read;
    if (outcome.transportError !== null) return unreachable(outcome, how);
    const text = outcome.verses[0]?.text ?? "";
    if (text === "") return { verdict: "unreachable", summary: "no text returned", request: how, evidence: null };
    if (adapter.textCarriesMarkup === true) {
      return {
        verdict: "not-applicable",
        summary: "edition declares inline markup (Strong's numbers)",
        request: how,
        evidence: excerpt(text, 70),
      };
    }
    const tags = text.match(/<[^>]+>/g);
    if (tags !== null) {
      return {
        verdict: "unsafe",
        summary: `${tags.length} markup tag(s) inside the text`,
        request: how,
        evidence: excerpt(text, 90),
      };
    }
    return { verdict: "safe", summary: "plain text", request: how, evidence: excerpt(text, 70) };
  },
};

const typography: Probe = {
  id: "typography",
  dimension: "textual-integrity",
  title: "1901 typography",
  rationale:
    "The ASV prints the curly apostrophe U+2019 throughout and the ligature æ in " +
    "about twenty-six proper nouns. Silently transliterating them changes the text; " +
    "keeping them without folding for search makes those words unsearchable.",
  requires: VERSE_ACCESS,
  async run(adapter) {
    const read = await readVerse(adapter, "MAT", 22, 21);
    if (read === null) return notApplicable("no verse access");
    const { outcome, how } = read;
    if (outcome.transportError !== null) return unreachable(outcome, how);
    const text = outcome.verses[0]?.text ?? "";
    if (text === "") return { verdict: "unreachable", summary: "no text returned", request: how, evidence: null };
    if (adapter.edition !== "asv") {
      return { verdict: "not-applicable", summary: `edition is ${adapter.edition}`, request: how, evidence: null };
    }
    const hasLigature = /æ/.test(text);
    const hasCurly = /’/.test(text);
    return {
      verdict: hasLigature ? "safe" : "divergent",
      summary: hasLigature
        ? `ligature kept${hasCurly ? ", curly apostrophe kept" : ", apostrophe transliterated"}`
        : "ligature transliterated to ae",
      request: how,
      evidence: excerpt(text, 80),
    };
  },
};

const lastVerse: Probe = {
  id: "last-verse",
  dimension: "textual-integrity",
  title: "Last verse of the canon",
  rationale: "Revelation 22:21 is the final boundary. Off-by-one errors surface here.",
  requires: VERSE_ACCESS,
  async run(adapter) {
    const read = await readVerse(adapter, "REV", 22, 21);
    if (read === null) return notApplicable("no verse access");
    const { outcome, how } = read;
    if (outcome.transportError !== null) return unreachable(outcome, how);
    const text = outcome.verses[0]?.text ?? "";
    if (/grace/i.test(text)) return { verdict: "safe", summary: "returned", request: how, evidence: excerpt(text, 70) };
    return {
      verdict: text === "" ? "missing" : "divergent",
      summary: text === "" ? "not returned" : "unexpected text",
      request: how,
      evidence: excerpt(text, 70),
    };
  },
};

/* ------------------------------------------------------------------ *
 * C — Self-description.
 * ------------------------------------------------------------------ */

const declaresEdition: Probe = {
  id: "declares-edition",
  dimension: "self-description",
  title: "Declares its edition",
  rationale:
    "Two APIs serving 'the ASV' disagreed about whether Matthew 17:21 exists. " +
    "Without an edition or revision identifier a caller cannot tell which text it has.",
  requires: ["self-description"],
  async run(adapter) {
    if (adapter.describe === undefined) return notApplicable("nothing to describe");
    const outcome = await adapter.describe();
    if (outcome.transportError !== null) return unreachable(outcome, "self-description endpoint");
    const body = JSON.stringify(outcome.raw ?? "");
    const named = /translation|version|edition|abbreviation/i.test(body);
    const revisioned = /revision|generation|sha|checksum|"?updated/i.test(body);
    if (named && revisioned) {
      return { verdict: "safe", summary: "names the edition and a revision", request: "self-description", evidence: null };
    }
    if (named) {
      return { verdict: "divergent", summary: "names the edition, no revision identifier", request: "self-description", evidence: null };
    }
    return { verdict: "missing", summary: "does not identify its text", request: "self-description", evidence: null };
  },
};

const declaresLicence: Probe = {
  id: "declares-licence",
  dimension: "self-description",
  title: "Declares licence or provenance",
  rationale:
    "Most redistributable Scripture carries terms. An API that does not state them " +
    "leaves every consumer to guess at their obligations.",
  requires: ["self-description"],
  async run(adapter) {
    if (adapter.describe === undefined) return notApplicable("nothing to describe");
    const outcome = await adapter.describe();
    if (outcome.transportError !== null) return unreachable(outcome, "self-description endpoint");
    const body = JSON.stringify(outcome.raw ?? "");
    if (/licen[cs]e|copyright|public domain|permission/i.test(body)) {
      return { verdict: "safe", summary: "states licence or copyright", request: "self-description", evidence: null };
    }
    return { verdict: "missing", summary: "no licence or provenance stated", request: "self-description", evidence: null };
  },
};

/* ------------------------------------------------------------------ *
 * D — Wire contract.
 * ------------------------------------------------------------------ */

const errorStatus: Probe = {
  id: "error-status",
  dimension: "wire-contract",
  title: "Failure is a failure status",
  rationale:
    "A caller checks the status code before the body. An API answering a bad " +
    "request with 200 defeats every client library's error handling.",
  requires: ["freeform-reference"],
  async run(adapter) {
    if (adapter.resolve === undefined) return notApplicable("takes structured identifiers");
    const reference = "Hezekiah 1:1";
    const outcome = await adapter.resolve(reference);
    if (outcome.transportError !== null) return unreachable(outcome, reference);
    if (outcome.status >= 400) {
      return { verdict: "safe", summary: `${outcome.status} for an unknown book`, request: reference, evidence: null };
    }
    return {
      verdict: outcome.verses.length > 0 ? "unsafe" : "divergent",
      summary: outcome.verses.length > 0 ? `200 with content for a book that does not exist` : "200 with an empty result",
      request: reference,
      evidence: excerpt(outcome.raw, 80),
    };
  },
};

export const PROBES: readonly Probe[] = [
  ambiguousAbbreviation,
  verseOutOfRange,
  chapterOutOfRange,
  crossChapterRange,
  multiSegment,
  singleChapterBook,
  omittedVerse,
  psalmSuperscription,
  divineName,
  markupLeakage,
  typography,
  lastVerse,
  declaresEdition,
  declaresLicence,
  errorStatus,
];
