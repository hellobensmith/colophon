/**
 * The source layer is what makes the pitch honest.
 *
 * "Run this with your own text" was not true while the build could only fetch a
 * public archive from eBible: the publisher who most needs to self-host is the
 * one whose edition no aggregator may carry, and they have nothing to point a
 * URL at. These tests cover reading what someone hands you instead.
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readLocal, sourceOverride } from "./sources.ts";

let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "colophon-source-"));
});

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("a single file handed over directly", () => {
  test("is read whole, and its bytes are what identity binds to", async () => {
    const file = path.join(dir, "one.xml");
    await Bun.write(file, "<usfx>a</usfx>");
    const source = await readLocal(file);
    expect(source.xml).toBe("<usfx>a</usfx>");
    expect(source.bytes.byteLength).toBe(14);
    expect(source.origin).toContain("one.xml");
  });
});

describe("a directory of per-book files, as a DBL bundle ships them", () => {
  test("is concatenated in filename order, not filesystem order", async () => {
    const bundle = path.join(dir, "bundle");
    await mkdir(bundle, { recursive: true });
    // Written out of order on purpose.
    await Bun.write(path.join(bundle, "03-LEV.usx"), "<usx>lev</usx>");
    await Bun.write(path.join(bundle, "01-GEN.usx"), "<usx>gen</usx>");
    await Bun.write(path.join(bundle, "02-EXO.usx"), "<usx>exo</usx>");
    // Anything that is not a book file is ignored.
    await Bun.write(path.join(bundle, "metadata.json"), "{}");

    const source = await readLocal(bundle);
    expect(source.xml.indexOf("gen")).toBeLessThan(source.xml.indexOf("exo"));
    expect(source.xml.indexOf("exo")).toBeLessThan(source.xml.indexOf("lev"));
    expect(source.xml).not.toContain("{}");
    expect(source.origin).toContain("3 files");
  });

  test("reading it twice gives byte-identical results", async () => {
    // Ingest has to be deterministic: the same files must produce the same
    // revision id, so the ordering cannot depend on how the directory is read.
    const bundle = path.join(dir, "bundle");
    const first = await readLocal(bundle);
    const second = await readLocal(bundle);
    expect(second.xml).toBe(first.xml);
    expect([...second.bytes]).toEqual([...first.bytes]);
  });
});

describe("it refuses rather than guessing", () => {
  test("a path that does not exist says so, and says what is accepted", async () => {
    await expect(readLocal(path.join(dir, "nope"))).rejects.toThrow(/No such source/);
  });

  test("a directory with no book files points at the likely mistake", async () => {
    const empty = path.join(dir, "empty");
    await mkdir(empty, { recursive: true });
    await Bun.write(path.join(empty, "readme.txt"), "hello");
    await expect(readLocal(empty)).rejects.toThrow(/no \.usx or \.xml files/);
  });

  test("--source with no path is an error, not a silent default", () => {
    expect(() => sourceOverride(["build", "--source"])).toThrow(/needs a path/);
    expect(() => sourceOverride(["build", "--source", "--report"])).toThrow(/needs a path/);
  });
});

describe("--source is opt-in", () => {
  test("absent means the edition's registered archive is used", () => {
    expect(sourceOverride(["build", "--translation", "dra"])).toBeUndefined();
  });

  test("present, it is returned verbatim", () => {
    expect(sourceOverride(["build", "--source", "./csb-usx/"])).toBe("./csb-usx/");
  });
});
