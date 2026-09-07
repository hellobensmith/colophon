/**
 * Asserts that live responses match openapi.yaml exactly — no missing required
 * fields, no undeclared extras, correct types and enums, correct status codes.
 *
 * Start the server first, then: bun run check:contract
 */

interface SchemaNode {
  readonly $ref?: string;
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, SchemaNode>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly items?: SchemaNode;
  readonly enum?: readonly unknown[];
}

const BASE = process.env["CONTRACT_BASE_URL"] ?? "http://127.0.0.1:8787";
const spec = Bun.YAML.parse(
  await Bun.file(new URL("../openapi.yaml", import.meta.url).pathname).text(),
) as Record<string, any>;

const failures: string[] = [];

function deref(node: SchemaNode | undefined): SchemaNode | undefined {
  if (node?.$ref === undefined) return node;
  const path = node.$ref.replace(/^#\//, "").split("/");
  let cursor: unknown = spec;
  for (const key of path) cursor = (cursor as Record<string, unknown>)?.[key];
  return deref(cursor as SchemaNode);
}

function typeNames(schema: SchemaNode): readonly string[] {
  const { type } = schema;
  if (type === undefined) return [];
  return typeof type === "string" ? [type] : type;
}

function check(path: string, rawSchema: SchemaNode | undefined, value: unknown): void {
  const schema = deref(rawSchema);
  if (schema === undefined) return;
  const types = typeNames(schema);

  if (value === null) {
    if (!types.includes("null")) failures.push(`${path}: null is not allowed here`);
    return;
  }

  if (types.includes("object") && schema.properties !== undefined) {
    if (typeof value !== "object" || Array.isArray(value)) {
      failures.push(`${path}: expected an object`);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in record)) failures.push(`${path}.${key}: required field missing`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in schema.properties)) failures.push(`${path}.${key}: undeclared field`);
      }
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      if (key in record) check(`${path}.${key}`, child, record[key]);
    }
    return;
  }

  if (types.includes("array") && schema.items !== undefined) {
    if (!Array.isArray(value)) {
      failures.push(`${path}: expected an array`);
      return;
    }
    value.forEach((item, index) => check(`${path}[${index}]`, schema.items, item));
    return;
  }

  const actual =
    typeof value === "number" ? (Number.isInteger(value) ? "integer" : "number") : typeof value;
  const matches = types.some(
    (name) => name === actual || (name === "number" && actual === "integer"),
  );
  if (types.length > 0 && !matches) {
    failures.push(`${path}: expected ${types.join(" or ")}, got ${actual}`);
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    failures.push(`${path}: ${JSON.stringify(value)} is outside the declared enum`);
  }
}

/** Successful responses, checked against the schema for that path. */
const SUCCESSES: readonly (readonly [string, string])[] = [
  ["/health", "/health"],
  ["/books", "/books"],
  ["/books?tradition=catholic", "/books"],
  ["/books?tradition=orthodox_greek", "/books"],
  ["/books/JHN", "/books/{id}"],
  ["/books/TOB", "/books/{id}"],
  ["/books/PSA/chapters/23", "/books/{id}/chapters/{num}"],
  ["/books/GEN/chapters/1", "/books/{id}/chapters/{num}"],
  ["/books/HAB/chapters/3", "/books/{id}/chapters/{num}"],
  ["/passages?ref=John%203:16", "/passages"],
  ["/passages?ref=Matthew%2017:21", "/passages"],
  ["/passages?ref=Genesis%201:1-2:3", "/passages"],
  ["/passages?ref=1%20Cor%2013:4-7,13", "/passages"],
  ["/passages?ref=2%20John%201:10", "/passages"],
  ["/passages?ref=2%20John%2010", "/passages"],
  ["/passages?ref=Jude%205", "/passages"],
  ["/passages?ref=Psalm%2023:1-3&numbering=hebrew", "/passages"],
  ["/passages?ref=Psalm%2050:2&numbering=greek", "/passages"],
  ["/passages?ref=Psalm%20115:1&numbering=greek", "/passages"],
  ["/passages?ref=Psalm%209:21-22&numbering=greek", "/passages"],
  ["/passages?ref=Psalm%209:1&numbering=greek", "/passages"],
  ["/search?q=good%20shepherd", "/search"],
  ["/search?q=the", "/search"],
  // Ordinary long phrases made of common words: served, never refused.
  ["/search?q=and+it+came+to+pass+in+the+days+of+the+king", "/search"],
];

/** Forty distinct alphabetic terms, past the twelve-term cap. */
const DISTINCT_TERMS = Array.from(
  { length: 40 },
  (_, i) => String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26)),
);

/** Failures, checked for both status code and the shared Error shape. */
const ERRORS: readonly (readonly [string, number])[] = [
  ["/books?tradition=nonsense", 400],
  ["/books/XYZ", 404],
  ["/passages", 400],
  ["/passages?ref=Jo%203:16", 400],
  ["/passages?ref=John%203:abc", 400],
  ["/passages?ref=Genesis%205:1-2:1", 400],
  ["/passages?ref=John%203:16&numbering=hebrew", 400],
  ["/passages?ref=John%203:16&numbering=greek", 400],
  ["/passages?ref=Psalm%2023:1&numbering=klingon", 400],
  ["/passages?ref=Psalm%209:40&numbering=greek", 404],
  ["/passages?ref=John%203:99", 404],
  ["/passages?ref=Genesis%2099:1", 404],
  ["/passages?ref=Tobit%201:1", 404],
  ["/passages?ref=Hezekiah%201:1", 404],
  ["/books/GEN/chapters/99", 404],
  ["/books/TOB/chapters/1", 404],
  ["/passages?ref=Psalms", 413],
  ["/search?q=a", 400],
  ["/search?q=love&limit=999", 400],
  // The hardening limits. Each was a measured amplification, not a theory.
  [`/passages?ref=John%203:${"9".repeat(600)}`, 400],
  [`/passages?ref=John%203:${Array.from({ length: 200 }, (_, i) => i + 1).join(",")}`, 400],
  [`/search?q=${"a".repeat(600)}`, 400],
  // Distinct terms must be alphabetic: the tokenizer strips digits, so
  // `word0 word1` is one term, not two.
  [`/search?q=${DISTINCT_TERMS.join("+")}`, 400],
  ["/nope", 404],
];

for (const [url, specPath] of SUCCESSES) {
  const before = failures.length;
  const response = await fetch(BASE + url);
  if (response.status !== 200) failures.push(`${url}: expected 200, got ${response.status}`);
  const schema = spec["paths"][specPath]["get"]["responses"]["200"]["content"]["application/json"]["schema"];
  check("$", schema as SchemaNode, await response.json());
  console.log(`${failures.length === before ? "ok  " : "FAIL"} ${response.status} ${url}`);
}

for (const [url, expected] of ERRORS) {
  const before = failures.length;
  const response = await fetch(BASE + url);
  if (response.status !== expected) {
    failures.push(`${url}: expected ${expected}, got ${response.status}`);
  }
  check("$", spec["components"]["schemas"]["Error"] as SchemaNode, await response.json());
  console.log(`${failures.length === before ? "ok  " : "FAIL"} ${response.status} ${url}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} contract violation(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`\nAll ${SUCCESSES.length + ERRORS.length} responses conform to openapi.yaml`);
