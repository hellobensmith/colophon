/**
 * Light morphology for Jacobean English.
 *
 * The ASV's verb forms defeat plain prefix matching in both directions. Regular
 * endings look unrelated at the front of the word only sometimes ("loveth" does
 * share a prefix with "love", but "spake" shares none with "speak"), and the
 * highest-frequency verbs in this translation are exactly the irregular ones:
 * "said" occurs 3,903 times and "saith" 1,326, neither reachable from "say".
 *
 * Two mechanisms, in order:
 *
 *  1. An explicit table of archaic irregulars, which no suffix rule can derive.
 *  2. Suffix stripping, constrained so that a derived root only counts when it
 *     is itself a word that occurs in the text. That constraint is what keeps
 *     "loved" -> "love" while refusing "bed" -> "be": the rule may only connect
 *     two forms the corpus actually contains.
 */

/** Archaic and irregular forms mapped to the lemma a reader would search for. */
const IRREGULAR: ReadonlyMap<string, string> = new Map([
  // Speech, by far the most common verbs in the text.
  ["said", "say"], ["saith", "say"], ["sayest", "say"], ["saidst", "say"],
  ["spake", "speak"], ["spoken", "speak"], ["speaketh", "speak"], ["speakest", "speak"],
  ["told", "tell"], ["telleth", "tell"],
  // To be, to have, to do.
  ["was", "be"], ["were", "be"], ["wast", "be"], ["wert", "be"], ["been", "be"],
  ["art", "be"], ["are", "be"], ["is", "be"],
  ["hath", "have"], ["hast", "have"], ["had", "have"], ["hadst", "have"],
  ["doeth", "do"], ["doth", "do"], ["dost", "do"], ["did", "do"], ["didst", "do"], ["done", "do"],
  // Motion.
  ["went", "go"], ["gone", "go"], ["goeth", "go"], ["goest", "go"],
  ["came", "come"], ["cometh", "come"], ["comest", "come"],
  ["brought", "bring"], ["bringeth", "bring"],
  ["sent", "send"], ["sendeth", "send"],
  ["fell", "fall"], ["fallen", "fall"], ["falleth", "fall"],
  ["rose", "rise"], ["risen", "rise"], ["riseth", "rise"],
  ["stood", "stand"], ["standeth", "stand"],
  ["sat", "sit"], ["sitteth", "sit"],
  // Perception and knowledge.
  ["knew", "know"], ["known", "know"], ["knoweth", "know"], ["knowest", "know"],
  ["saw", "see"], ["seen", "see"], ["seeth", "see"], ["seest", "see"], ["sawest", "see"],
  ["heard", "hear"], ["heareth", "hear"], ["hearest", "hear"],
  ["found", "find"], ["findeth", "find"],
  ["thought", "think"], ["thinketh", "think"],
  // Transfer and action.
  ["gave", "give"], ["given", "give"], ["giveth", "give"], ["givest", "give"],
  ["took", "take"], ["taken", "take"], ["taketh", "take"], ["takest", "take"],
  ["made", "make"], ["maketh", "make"], ["makest", "make"],
  ["wrote", "write"], ["written", "write"], ["writeth", "write"],
  ["begat", "beget"], ["begotten", "beget"],
  ["smote", "smite"], ["smitten", "smite"], ["smiteth", "smite"],
  ["slew", "slay"], ["slain", "slay"], ["slayeth", "slay"],
  ["ate", "eat"], ["eaten", "eat"], ["eateth", "eat"],
  ["drank", "drink"], ["drunk", "drink"], ["drinketh", "drink"],
  ["built", "build"], ["buildeth", "build"],
  ["dwelt", "dwell"], ["dwelleth", "dwell"],
  ["bare", "bear"], ["borne", "bear"], ["beareth", "bear"],
  ["became", "become"], ["becometh", "become"],
  ["began", "begin"], ["begun", "begin"], ["beginneth", "begin"],
  ["lay", "lie"], ["lain", "lie"], ["lieth", "lie"],
  ["kept", "keep"], ["keepeth", "keep"],
  ["left", "leave"], ["leaveth", "leave"],
  ["casteth", "cast"],
  ["shalt", "shall"], ["wilt", "will"], ["wouldest", "would"], ["couldest", "could"],
  // Irregular plurals.
  ["men", "man"], ["women", "woman"], ["children", "child"], ["brethren", "brother"],
  ["feet", "foot"], ["teeth", "tooth"], ["oxen", "ox"], ["mice", "mouse"],
]);

/** Merges the rules would make that are wrong; the corpus contains both words. */
const FORBIDDEN_MERGE: ReadonlySet<string> = new Set([
  "seed>see", "bed>be", "deed>dee", "need>nee", "heed>hee", "reed>ree",
  "creed>cree", "weed>wee", "feed>fee", "breed>bree", "steed>stee",
  "wicked>wick", "sacred>sacr", "blessed>bless", "aged>age", "hundred>hundr",
  "red>re", "led>le", "fed>fe", "wed>we", "shed>she", "bred>bre",
  "goodly>good", "godly>god", "holy>hol",
  // Distinct words that a suffix rule would otherwise fuse.
  "founded>found", "felled>fell", "lied>lie", "lies>lie",
  "hades>hade", "hasted>hast", "wasted>wast",
]);

/**
 * Candidate roots for a surface form, best first. A candidate counts only if the
 * caller confirms it occurs in the corpus.
 *
 * Two constraints stop the rules from producing nonsense:
 *
 *  - The longer root is tried first. Stripping "hasted" to "hast" before trying
 *    "haste" would capture it into the verb "to have", because "hast" is itself
 *    an archaic form of "have". Preferring "haste" keeps the two apart.
 *  - A root may never be a form the irregular table has already claimed. That
 *    single rule prevents "hades" -> "had" -> have, "wasted" -> "wast" -> be,
 *    "founded" -> "found" -> find, and "sawed" -> "saw" -> see.
 */
function candidateRoots(token: string): string[] {
  const roots: string[] = [];
  const add = (root: string): void => {
    if (root.length < 3 || root === token) return;
    if (IRREGULAR.has(root)) return;
    if (FORBIDDEN_MERGE.has(`${token}>${root}`)) return;
    roots.push(root);
  };

  if (token.endsWith("eth")) {
    add(token.slice(0, -2));       // loveth  -> love
    add(token.slice(0, -3));       // walketh -> walk
  }
  if (token.endsWith("est")) {
    add(token.slice(0, -2));       // lovest  -> love
    add(token.slice(0, -3));       // walkest -> walk
  }
  if (token.endsWith("ing")) {
    add(`${token.slice(0, -3)}e`); // making  -> make
    add(token.slice(0, -3));       // walking -> walk
  }
  if (token.endsWith("ed")) {
    add(token.slice(0, -1));       // loved  -> love
    add(token.slice(0, -2));       // walked -> walk
  }
  if (token.endsWith("es")) {
    add(token.slice(0, -1));       // judges -> judge
    add(token.slice(0, -2));       // riches -> rich
  }
  if (token.endsWith("s") && !token.endsWith("ss")) add(token.slice(0, -1));
  return roots;
}

/**
 * Groups the corpus vocabulary into families sharing a lemma.
 * Returns a map from any surface form to every form in its family.
 */
export function buildFamilies(tokens: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const vocabulary = new Set(tokens);
  const lemmaOf = new Map<string, string>();

  for (const token of tokens) {
    const irregular = IRREGULAR.get(token);
    if (irregular !== undefined && vocabulary.has(irregular)) {
      lemmaOf.set(token, irregular);
      continue;
    }
    for (const root of candidateRoots(token)) {
      if (vocabulary.has(root)) {
        lemmaOf.set(token, root);
        break;
      }
    }
  }

  // Follow chains (walkedst -> walked -> walk) to a settled lemma.
  const resolve = (token: string): string => {
    let current = token;
    for (let hop = 0; hop < 4; hop += 1) {
      const next = lemmaOf.get(current);
      if (next === undefined || next === current) break;
      current = next;
    }
    return current;
  };

  const families = new Map<string, string[]>();
  for (const token of tokens) {
    const lemma = resolve(token);
    let family = families.get(lemma);
    if (family === undefined) {
      family = [];
      families.set(lemma, family);
    }
    family.push(token);
  }

  const lookup = new Map<string, readonly string[]>();
  for (const [, family] of families) {
    if (family.length < 2) continue;
    for (const member of family) lookup.set(member, family);
  }
  return lookup;
}

/** Exposed for tests: the irregular table itself. */
export const IRREGULAR_FORMS = IRREGULAR;
