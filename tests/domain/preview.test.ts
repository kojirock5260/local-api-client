import { describe, expect, it } from "vitest";
import { PREVIEW_LIMIT, previewText } from "../../src/domain/preview";

describe("previewText", () => {
  it("returns short text whole", () => {
    expect(previewText("abc")).toEqual({ shown: "abc", hidden: 0 });
    expect(previewText("")).toEqual({ shown: "", hidden: 0 });
  });

  it("does not cut at exactly the limit", () => {
    const text = "x".repeat(PREVIEW_LIMIT);
    expect(previewText(text).hidden).toBe(0);
  });

  it("cuts over the limit and counts what is hidden", () => {
    const { shown, hidden } = previewText("abcdef", 4);
    expect(shown).toBe("abcd");
    expect(hidden).toBe(2);
  });
});
