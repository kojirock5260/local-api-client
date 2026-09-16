import { describe, expect, it } from "vitest";
import { responseFilename } from "../../src/domain/filename";

describe("responseFilename", () => {
  it("keeps a filename that already has an extension", () => {
    expect(responseFilename("http://localhost:3000/users.json", "text/plain")).toBe("users.json");
  });

  it("adds an extension from the Content-Type", () => {
    expect(
      responseFilename("http://localhost:3000/api/users", "application/json; charset=utf-8"),
    ).toBe("users.json");
    expect(responseFilename("http://localhost:3000/img", "image/svg+xml")).toBe("img.svg");
    expect(responseFilename("http://localhost:3000/page", "text/html")).toBe("page.html");
  });

  it("falls back to response and txt", () => {
    expect(responseFilename("http://localhost:3000/", "text/html")).toBe("response.html");
    expect(responseFilename("http://localhost:3000/a/b?x=1", "")).toBe("b.txt");
    expect(responseFilename("not a url", "application/json")).toBe("response.json");
  });

  it("decodes and sanitizes the name", () => {
    expect(responseFilename("http://localhost:3000/na%20me", "text/plain")).toBe("na me.txt");
    expect(responseFilename("http://localhost:3000/a:b", "text/csv")).toBe("a_b.csv");
    expect(responseFilename("http://localhost:3000/a%09b", "text/csv")).toBe("ab.csv");
  });
});
