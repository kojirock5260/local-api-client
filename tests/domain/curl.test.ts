import { describe, expect, it } from "vitest";
import { toCurl } from "../../src/domain/curl";
import { type Draft, emptyDraft } from "../../src/domain/request";

const draft = (over: Partial<Draft> = {}): Draft => ({ ...emptyDraft(), ...over });

describe("toCurl", () => {
  it("emits a minimal GET", () => {
    expect(toCurl(draft({ path: ":3000/api" }))).toBe("curl 'http://localhost:3000/api'");
  });

  it("emits method, headers, and body for POST", () => {
    const d = draft({
      method: "POST",
      path: ":3000/users",
      bodyMode: "raw",
      body: '{"name":"sato"}',
    });
    d.headers = [{ id: "1", key: "Content-Type", value: "application/json", enabled: true }];
    expect(toCurl(d)).toBe(
      [
        "curl -X POST 'http://localhost:3000/users'",
        "-H 'Content-Type: application/json'",
        `--data '{"name":"sato"}'`,
      ].join(" \\\n  "),
    );
  });

  it("escapes single quotes in the body", () => {
    const d = draft({ method: "POST", bodyMode: "raw", body: "it's" });
    expect(toCurl(d)).toContain(`--data 'it'\\''s'`);
  });

  it("uses --head for HEAD requests", () => {
    expect(toCurl(draft({ method: "HEAD", path: ":3000/" }))).toBe(
      "curl --head 'http://localhost:3000/'",
    );
  });

  it("emits fields mode as JSON with auto Content-Type", () => {
    const d = draft({ method: "POST", path: ":3000/users" });
    d.bodyFields = [{ id: "1", key: "age", value: "30", enabled: true }];
    expect(toCurl(d)).toBe(
      [
        "curl -X POST 'http://localhost:3000/users'",
        "-H 'Content-Type: application/json'",
        `--data '{"age":30}'`,
      ].join(" \\\n  "),
    );
  });

  it("skips disabled and empty-key headers, and body for GET", () => {
    const d = draft({ bodyMode: "raw", body: "should-not-appear" });
    d.headers = [
      { id: "1", key: "X-Off", value: "no", enabled: false },
      { id: "2", key: "", value: "ignored", enabled: true },
    ];
    expect(toCurl(d)).toBe("curl 'http://localhost:3000/'");
  });

  it("throws for non-localhost URLs", () => {
    expect(() => toCurl(draft({ path: ":80@evil.com/" }))).toThrow(/localhost/);
  });
});
