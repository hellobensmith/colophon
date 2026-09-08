/**
 * Generates `src/usx-styles.ts` from the USX RelaxNG schema.
 *
 *   bun scripts/build-usx-styles.ts [path-to-usx.rng]
 *
 * USX carries the USFM marker name in a `style` attribute, so a reader has to
 * classify the same vocabulary USFM uses. Doing that by hand from a sample
 * bundle would classify only what that bundle happened to contain, and the
 * first publisher whose text used anything else would hit a wall.
 *
 * The schema names all of it, and — usefully — groups it: BookHeaders,
 * BookTitles, BookIntroduction, Char, FootnoteChar, CrossReferenceChar, List.
 * Those groups *are* the classification, so the roles below are derived rather
 * than guessed, and the table is complete for the schema version it was built
 * from.
 *
 * The one thing the schema cannot settle is inside `Para`, which mixes real
 * paragraphs (`p`, `q1`, `mi`) with headings (`s1`, `sp`, `qa`). That split is
 * semantic, so it is listed explicitly below and marked as judgement.
 */

const SCHEMA = process.argv[2] ?? "/tmp/usx.rng";

/** Role per schema group. A group's name says what its members are for. */
const GROUP_ROLES: Readonly<Record<string, string>> = {
  "BookHeaders.para.style.enum": "metadata",
  "BookTitles.para.style.enum": "metadata",
  "BookIntroduction.para.style.enum": "metadata",
  "BookIntroductionEndTitles.para.style.enum": "metadata",
  "IntroChar.char.style.enum": "metadata",
  "Char.char.style.enum": "transparent",
  "CharWithAttrib.char.style.w": "transparent",
  "CharWithAttrib.char.style.rb": "transparent",
  "ListChar.char.style.enum": "transparent",
  "List.para.style.enum": "paragraph",
  "Footnote": "footnote",
  "FootnoteChar.char.style.enum": "footnote",
  "CrossReference": "metadata",
  "CrossReferenceChar.char.style.enum": "metadata",
  "BookChapterLabel": "metadata",
  "BookIdentification": "metadata",
  "PeripheralBookIdentification": "metadata",
  "PeripheralDividedBookIdentification": "metadata",
  "Sidebar": "metadata",
  "VerseStart": "milestone",
  "ChapterStart": "milestone",
  "Table": "paragraph",
  "FootnoteVerse": "footnote-reference",
};

/**
 * Para styles that are headings rather than paragraphs.
 *
 * Judgement, not schema: `Para` holds both, and only knowing what a marker is
 * *for* separates them. A heading's text is not verse content, so it is dropped
 * and recorded; a paragraph's text belongs to the verse it sits in.
 *
 * `qa` is here for the same reason `\qc` is a heading in usfm.ts — it labels an
 * acrostic section, as Psalm 119's Hebrew letters do.
 */
const PARA_HEADINGS: readonly string[] = [
  "cd", "cl", "cp", "d", "iex", "k1", "k2", "lit", "mr", "ms", "ms1", "ms2",
  "ms3", "mte", "mte1", "mte2", "qa", "qc", "r", "restore", "s", "s1", "s2",
  "s3", "s4", "sd", "sd1", "sd2", "sd3", "sd4", "sp", "sr", "ts",
];

const rng = await Bun.file(SCHEMA).text();

const byGroup = new Map<string, string[]>();
let group = "";
for (const line of rng.split("\n")) {
  const define = line.match(/<define name="([A-Za-z.]+)"/);
  if (define) group = define[1]!;
  const value = line.match(/<value>([^<]+)<\/value>/);
  if (value) {
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push(value[1]!);
  }
}

const version = rng.match(/USX ([0-9.]+)/)?.[1] ?? "unknown";
const roles = new Map<string, string>();
const unresolved: string[] = [];

/*
 * A style can appear in several groups: "xt" is listed under Char, under
 * CrossReferenceChar and under FootnoteChar. The most specific context wins,
 * because that is what the style means where it actually occurs — a cross
 * reference is apparatus wherever it sits, not scripture.
 */
const GROUP_PRECEDENCE: readonly string[] = [
  "CrossReferenceChar.char.style.enum",
  "CrossReference",
  "FootnoteChar.char.style.enum",
  "Footnote",
  "IntroChar.char.style.enum",
  "BookHeaders.para.style.enum",
  "BookTitles.para.style.enum",
  "BookIntroduction.para.style.enum",
  "BookIntroductionEndTitles.para.style.enum",
];

const ordered = [...byGroup.entries()].sort(([a], [b]) => {
  const rank = (name: string) => {
    const index = GROUP_PRECEDENCE.indexOf(name);
    return index === -1 ? GROUP_PRECEDENCE.length : index;
  };
  return rank(a) - rank(b);
});

for (const [name, values] of ordered) {
  // Book codes and table alignment are not markers.
  if (name.includes("book.code") || name.includes("periph.id") || name.includes("align")) continue;

  for (const style of values) {
    if (name === "Para.para.style.enum") {
      roles.set(style, PARA_HEADINGS.includes(style) ? "metadata" : "paragraph");
      continue;
    }
    const role = GROUP_ROLES[name];
    if (role === undefined) {
      if (!unresolved.includes(name)) unresolved.push(name);
      continue;
    }
    // A style appearing in several groups keeps the first, most specific role.
    if (!roles.has(style)) roles.set(style, role);
  }
}

if (unresolved.length > 0) {
  console.error(
    `Schema groups with no role assigned: ${unresolved.join(", ")}.\n` +
      `Add them to GROUP_ROLES rather than letting their styles go unclassified.`,
  );
  process.exit(1);
}

const entries = [...roles].sort(([a], [b]) => (a < b ? -1 : 1));
const lines = entries.map(([style, role]) => `  ["${style}", "${role}"],`).join("\n");

const out = `// GENERATED by scripts/build-usx-styles.ts from USX ${version}. Do not edit.
//
// Roles are derived from the schema's own grouping — BookHeaders, Char,
// FootnoteChar, CrossReferenceChar and so on — so this table is complete for
// the schema version above rather than for whatever one sample bundle held.
// The split inside Para between paragraphs and headings is judgement, and is
// recorded in the generator.

import type { MarkerRole } from "./usfm.ts";

/** Every \`style\` value USX ${version} defines, and what a reader does with it. */
export const USX_STYLE_ROLES: ReadonlyMap<string, MarkerRole> = new Map([
${lines}
]);

export const USX_SCHEMA_VERSION = "${version}";
`;

await Bun.write(new URL("../src/usx-styles.ts", import.meta.url).pathname, out);
console.log(`Classified ${entries.length} style values from USX ${version} -> src/usx-styles.ts`);

const counts = new Map<string, number>();
for (const [, role] of entries) counts.set(role, (counts.get(role) ?? 0) + 1);
for (const [role, count] of [...counts].sort(([, a], [, b]) => b - a)) {
  console.log(`  ${role.padEnd(20)} ${count}`);
}
