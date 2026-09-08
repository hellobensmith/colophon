/**
 * Where a text comes from, and in what shape.
 *
 * Until now the build could only fetch a public archive from eBible. That is
 * exactly backwards from what this project is for: eBible carries the texts that
 * are already free, and the publisher who most needs to run their own instance
 * is the one whose text no aggregator may serve. They cannot put a file on
 * eBible, and should not have to.
 *
 * So a source is either an archive to download or a path on disk that someone
 * handed you. The rest of the build does not care which.
 */

import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

export type Source =
  | {
      /** A public USFX archive published by eBible.org. */
      readonly kind: "ebible";
      readonly sourceId: string;
    }
  | {
      /**
       * A path on this machine: a single USFX or USX file, or a directory of
       * per-book USX files as a Digital Bible Library bundle ships them.
       *
       * Nothing is uploaded and nothing is fetched. The text stays where the
       * publisher put it.
       */
      readonly kind: "local";
      readonly path: string;
    };

export interface SourceDocument {
  /** The XML to parse. */
  readonly xml: string;
  /** Human-readable provenance, for the build log and the manifest. */
  readonly origin: string;
  /** Bytes the identity is derived from — the archive, or the files as read. */
  readonly bytes: Uint8Array;
}

const USX_EXTENSIONS = new Set([".usx", ".xml"]);

/**
 * Reads a local source into a single document.
 *
 * A directory is read as a USX bundle: every `.usx` file, in filename order,
 * concatenated inside one wrapper so the parser sees one stream. Filename order
 * is what DBL bundles rely on to express canonical order, and sorting is done
 * with an explicit comparator rather than the default, whose behaviour depends
 * on locale.
 */
export async function readLocal(target: string): Promise<SourceDocument> {
  const resolved = path.resolve(target);

  if (!existsSync(resolved)) {
    throw new Error(
      `No such source: ${target}. Pass --source with a path to a USFX file, ` +
        `a USX file, or a directory of .usx files.`,
    );
  }

  if (statSync(resolved).isFile()) {
    const bytes = new Uint8Array(await Bun.file(resolved).arrayBuffer());
    return {
      xml: await Bun.file(resolved).text(),
      origin: resolved,
      bytes,
    };
  }

  const entries = (await readdir(resolved))
    .filter((name) => USX_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  if (entries.length === 0) {
    throw new Error(
      `${target} holds no .usx or .xml files. A Digital Bible Library bundle ` +
        `keeps them under a "release/USX_1" directory or similar; point ` +
        `--source at the directory that actually contains the files.`,
    );
  }

  const parts: string[] = [];
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const file = Bun.file(path.join(resolved, entry));
    parts.push(await file.text());
    chunks.push(new Uint8Array(await file.arrayBuffer()));
  }

  let total = 0;
  for (const chunk of chunks) total += chunk.byteLength;
  const bytes = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  return {
    xml: parts.join("\n"),
    origin: `${resolved} (${entries.length} files)`,
    bytes,
  };
}

/**
 * Parses `--source <path>` out of the argument list.
 *
 * Absent means the edition's registered archive is used, which keeps every
 * existing invocation working unchanged.
 */
export function sourceOverride(argv: readonly string[]): string | undefined {
  const index = argv.indexOf("--source");
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error("--source needs a path, for example --source ./csb-usx/");
  }
  return value;
}
