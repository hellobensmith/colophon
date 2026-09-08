import { describe, expect, test } from "bun:test";
import { detectFormat } from "./format.ts";

describe("format detection reads the content, not the extension", () => {
  test("USFX", () => {
    expect(detectFormat(`<?xml version="1.0"?><usfx xmlns=""><book id="GEN"/></usfx>`)).toBe("usfx");
  });

  test("USX, which a DBL bundle often stores under .xml", () => {
    expect(detectFormat(`<?xml version="1.0"?><usx version="3.0"><book code="GEN"/></usx>`)).toBe("usx");
  });

  test("USFM", () => {
    expect(detectFormat("\\id GEN - Some Edition\n\\h Genesis\n")).toBe("usfm");
  });

  test("anything else is refused with a usable message", () => {
    expect(() => detectFormat('{"format":"json"}')).toThrow(/Could not tell what format/);
  });
});
