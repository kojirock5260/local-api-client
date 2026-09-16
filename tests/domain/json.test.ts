import { describe, expect, it } from "vitest";
import { formatJson, jsonError, looksLikeJson } from "../../src/domain/json";

describe("jsonError", () => {
  it("returns null for valid or empty input", () => {
    expect(jsonError("")).toBeNull();
    expect(jsonError("   ")).toBeNull();
    expect(jsonError('{"a":1}')).toBeNull();
    expect(jsonError("[1, 2]")).toBeNull();
  });

  it("returns the parser's reason for broken input", () => {
    expect(jsonError("{")).toEqual(expect.any(String));
    expect(jsonError("{a:1}")).not.toBeNull();
  });
});

describe("formatJson", () => {
  it("pretty-prints with two spaces", () => {
    expect(formatJson('{"a":1,"b":[1,2]}')).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
  });

  it("returns null for broken or empty input", () => {
    expect(formatJson("{")).toBeNull();
    expect(formatJson("")).toBeNull();
  });
});

describe("looksLikeJson", () => {
  it("is true for text starting with { or [", () => {
    expect(looksLikeJson('{"a":1}')).toBe(true);
    expect(looksLikeJson("  [1]")).toBe(true);
  });

  it("is false otherwise", () => {
    expect(looksLikeJson("a=1")).toBe(false);
    expect(looksLikeJson("<a/>")).toBe(false);
    expect(looksLikeJson("")).toBe(false);
  });
});
