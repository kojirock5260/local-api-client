import { describe, expect, it } from "vitest";
import { emptyDraft, normalizeDraft } from "../../src/domain/request";

describe("normalizeDraft", () => {
  it("returns a full draft for missing input", () => {
    expect(normalizeDraft(undefined)).toMatchObject({
      method: "GET",
      bodyMode: "fields",
      cookies: false,
    });
    expect(normalizeDraft(null).headers).toHaveLength(1);
  });

  it("accepts the form body mode", () => {
    expect(normalizeDraft({ ...emptyDraft(), bodyMode: "form" }).bodyMode).toBe("form");
  });

  it("falls back for an unknown body mode, choosing raw when there is a body", () => {
    const junk = { ...emptyDraft(), bodyMode: "xml" as never };
    expect(normalizeDraft(junk).bodyMode).toBe("fields");
    expect(normalizeDraft({ ...junk, body: "<a/>" }).bodyMode).toBe("raw");
  });

  it("treats cookies as off unless explicitly true", () => {
    expect(normalizeDraft({ ...emptyDraft(), cookies: true }).cookies).toBe(true);
    const legacy = { ...emptyDraft() } as Record<string, unknown>;
    delete legacy.cookies;
    expect(normalizeDraft(legacy).cookies).toBe(false);
    expect(normalizeDraft({ ...emptyDraft(), cookies: "yes" as never }).cookies).toBe(false);
  });

  it("replaces an invalid method with the default", () => {
    expect(normalizeDraft({ ...emptyDraft(), method: "FETCH" as never }).method).toBe("GET");
  });
});
