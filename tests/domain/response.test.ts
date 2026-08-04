import { describe, expect, it } from "vitest";
import { prettyJson, tryParseJson } from "../../src/domain/response";

describe("prettyJson", () => {
  it("pretty-prints valid JSON when content-type includes json", () => {
    expect(prettyJson("application/json", '{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it("handles charset suffixes", () => {
    expect(prettyJson("application/json; charset=utf-8", "[1,2]")).toBe("[\n  1,\n  2\n]");
  });

  it("returns null for non-json content types", () => {
    expect(prettyJson("text/html", '{"a":1}')).toBeNull();
  });

  it("returns null for broken JSON", () => {
    expect(prettyJson("application/json", "{oops")).toBeNull();
  });

  it("returns null for an empty body", () => {
    expect(prettyJson("application/json", "   ")).toBeNull();
  });
});

describe("tryParseJson", () => {
  it("returns the parsed value for valid JSON", () => {
    expect(tryParseJson("application/json", '{"a":1}')).toEqual({ a: 1 });
  });

  it("returns undefined otherwise", () => {
    expect(tryParseJson("text/html", "{}")).toBeUndefined();
    expect(tryParseJson("application/json", "{oops")).toBeUndefined();
  });
});
