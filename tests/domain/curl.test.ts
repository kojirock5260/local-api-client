import { describe, expect, it } from "vitest";
import { buildPayload } from "../../src/domain/body";
import { fromCurl, toCurl } from "../../src/domain/curl";
import { type Draft, emptyDraft } from "../../src/domain/request";
import { buildUrl } from "../../src/domain/url";

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

  it("emits form mode as urlencoded with auto Content-Type", () => {
    const d = draft({ method: "POST", path: ":3000/login", bodyMode: "form" });
    d.bodyFields = [
      { id: "1", key: "user", value: "sato", enabled: true },
      { id: "2", key: "pass", value: "p w", enabled: true },
    ];
    expect(toCurl(d)).toBe(
      [
        "curl -X POST 'http://localhost:3000/login'",
        "-H 'Content-Type: application/x-www-form-urlencoded'",
        "--data 'user=sato&pass=p+w'",
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

/**
 * 実際に飛ぶ形に落として比べるための要約。行の id や並びには依存しない。
 *
 * @param d 比べたい Draft
 * @returns メソッド・URL・実効ヘッダー・本文
 */
function wire(d: Draft) {
  const p = buildPayload(d);
  const headers: Record<string, string> = { ...p.autoHeaders };
  for (const h of d.headers) {
    if (h.enabled && h.key.trim() !== "") headers[h.key.trim()] = h.value;
  }
  return { method: d.method, url: buildUrl(d.origin, d.path).href, headers, body: p.body };
}

describe("fromCurl", () => {
  it("reads a minimal GET", () => {
    const { draft: d, warnings } = fromCurl("curl http://localhost:3000/api");
    expect(d).toMatchObject({
      method: "GET",
      origin: "http://localhost",
      path: ":3000/api",
      bodyMode: "fields",
      cookies: false,
    });
    expect(warnings).toEqual([]);
  });

  it("adds http:// when the scheme is missing", () => {
    expect(fromCurl("curl localhost:3000/x").draft).toMatchObject({
      origin: "http://localhost",
      path: ":3000/x",
    });
  });

  it("keeps https and 127.0.0.1", () => {
    expect(fromCurl("curl -k https://127.0.0.1:8443/").draft).toMatchObject({
      origin: "https://127.0.0.1",
      path: ":8443/",
    });
  });

  it("reads a multi-line JSON POST as raw with its headers", () => {
    const text = [
      "curl -X POST 'http://localhost:3000/users' \\",
      "  -H 'Content-Type: application/json' \\",
      '  -H "Authorization: Bearer abc" \\',
      `  -d '{"name":"sato"}'`,
    ].join("\n");
    const { draft: d, warnings } = fromCurl(text);
    expect(d.method).toBe("POST");
    expect(d.bodyMode).toBe("raw");
    expect(d.body).toBe('{"name":"sato"}');
    expect(d.headers.map((h) => [h.key, h.value])).toEqual([
      ["Content-Type", "application/json"],
      ["Authorization", "Bearer abc"],
    ]);
    expect(warnings).toEqual([]);
  });

  it("turns -d without a Content-Type into form rows", () => {
    const { draft: d } = fromCurl("curl -d 'user=sato&pass=p%20w' localhost:3000/login");
    expect(d.method).toBe("POST");
    expect(d.bodyMode).toBe("form");
    expect(d.bodyFields.map((f) => [f.key, f.value])).toEqual([
      ["user", "sato"],
      ["pass", "p w"],
    ]);
    expect(wire(d).body).toBe("user=sato&pass=p+w");
    expect(wire(d).headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("decodes --data-urlencode into a form row", () => {
    const { draft: d } = fromCurl("curl --data-urlencode 'q=a b' localhost:3000/s");
    expect(d.bodyMode).toBe("form");
    expect(d.bodyFields[0]).toMatchObject({ key: "q", value: "a b" });
  });

  it("keeps non-form data as raw and adds curl's default Content-Type", () => {
    const { draft: d } = fromCurl("curl -d 'plain text' localhost:3000/t");
    expect(d.bodyMode).toBe("raw");
    expect(d.body).toBe("plain text");
    expect(wire(d).headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  it("moves -G data into the query string", () => {
    const { draft: d } = fromCurl("curl -G -d a=1 -d b=2 'localhost:3000/s?x=1'");
    expect(d.method).toBe("GET");
    expect(d.path).toBe(":3000/s?x=1&a=1&b=2");
    expect(wire(d).body).toBe("");
  });

  it("maps -I and --head to HEAD", () => {
    expect(fromCurl("curl -I localhost:3000/").draft.method).toBe("HEAD");
    expect(fromCurl("curl --head localhost:3000/").draft.method).toBe("HEAD");
  });

  it("accepts bundled short flags and attached values", () => {
    const { draft: d, warnings } = fromCurl(
      `curl -sSL -XPUT localhost:3000/i -d '{"a":1}' -H 'content-type: application/json'`,
    );
    expect(d.method).toBe("PUT");
    expect(d.bodyMode).toBe("raw");
    expect(d.body).toBe('{"a":1}');
    expect(warnings).toEqual([]);
  });

  it("handles --json like curl: raw body plus Content-Type and Accept", () => {
    const { draft: d } = fromCurl(`curl --json '{"a":1}' localhost:3000/j`);
    expect(d.method).toBe("POST");
    expect(d.body).toBe('{"a":1}');
    expect(wire(d).headers).toEqual({
      "Content-Type": "application/json",
      Accept: "application/json",
    });
  });

  it("turns -u into a Basic Authorization header", () => {
    const { draft: d } = fromCurl("curl -u user:pass localhost:3000/");
    expect(wire(d).headers.Authorization).toBe("Basic dXNlcjpwYXNz");
  });

  it("turns userinfo in the URL into a Basic Authorization header", () => {
    const { draft: d } = fromCurl("curl http://u:p@localhost:3000/");
    expect(d.path).toBe(":3000/");
    expect(wire(d).headers.Authorization).toBe("Basic dTpw");
  });

  it("reads -b as a Cookie header and -A as User-Agent", () => {
    const { draft: d } = fromCurl("curl -b 'session=abc' -A 'me/1.0' localhost:3000/");
    expect(wire(d).headers).toEqual({ Cookie: "session=abc", "User-Agent": "me/1.0" });
  });

  it("reads a header with an empty value written as Name;", () => {
    const { draft: d } = fromCurl("curl -H 'X-Empty;' localhost:3000/");
    expect(d.headers[0]).toMatchObject({ key: "X-Empty", value: "" });
  });

  it("unquotes an escaped single quote", () => {
    const { draft: d } = fromCurl(`curl -H 'X-Q: it'\\''s' localhost:3000/`);
    expect(d.headers[0].value).toBe("it's");
  });

  it("reads ANSI-C quoting used by DevTools", () => {
    const { draft: d } = fromCurl(`curl -d $'a=\\u3042\\x41' localhost:3000/`);
    expect(d.bodyFields[0]).toMatchObject({ key: "a", value: "あA" });
  });

  it("accepts a $ prompt and curl.exe", () => {
    expect(fromCurl("$ curl localhost:3000/a").draft.path).toBe(":3000/a");
    expect(fromCurl("curl.exe localhost:3000/b").draft.path).toBe(":3000/b");
  });

  it("stops at a pipe", () => {
    const { draft: d, warnings } = fromCurl("curl localhost:3000/a | jq .");
    expect(d.path).toBe(":3000/a");
    expect(warnings).toEqual([]);
  });

  it("warns about dropped or ignored options", () => {
    const { draft: d, warnings } = fromCurl(
      "curl -F file=@x.png --frobnicate -d @body.json localhost:3000/u",
    );
    expect(warnings.join("\n")).toMatch(/-F/);
    expect(warnings.join("\n")).toMatch(/--frobnicate/);
    expect(warnings.join("\n")).toMatch(/body\.json/);
    // 本文は落としたが、curl と同じく POST にはする。
    expect(d.method).toBe("POST");
    expect(wire(d).body).toBe("");
  });

  it("warns when a body is given to GET", () => {
    const { warnings } = fromCurl("curl -X GET -d a=1 localhost:3000/");
    expect(warnings.join("\n")).toMatch(/GET has no body/);
  });

  it("rejects anything that is not localhost", () => {
    expect(() => fromCurl("curl http://evil.com/")).toThrow(/localhost/);
    expect(() => fromCurl("curl 'http://localhost:80@evil.com/'")).toThrow(/localhost/);
    expect(() => fromCurl("curl http://localhost.evil.com/")).toThrow(/localhost/);
    expect(() => fromCurl("curl ftp://localhost/")).toThrow(/http/);
  });

  it("rejects text that is not a curl command", () => {
    expect(() => fromCurl("echo hi")).toThrow(/curl command/);
    expect(() => fromCurl("")).toThrow(/curl command/);
    expect(() => fromCurl("curl -X POST")).toThrow(/No URL/);
    expect(() => fromCurl('curl "http://localhost:3000')).toThrow(/quote/);
    expect(() => fromCurl("curl -X FETCH localhost:3000/")).toThrow(/Unsupported method/);
  });

  it("round-trips what toCurl produces", () => {
    const fields = draft({ method: "POST", path: ":3000/users" });
    fields.bodyFields = [{ id: "1", key: "age", value: "30", enabled: true }];
    const form = draft({ method: "PATCH", path: ":3000/f", bodyMode: "form" });
    form.bodyFields = [{ id: "1", key: "q", value: "a b", enabled: true }];
    const raw = draft({ method: "PUT", path: ":8080/r?x=1", bodyMode: "raw", body: "it's <b>" });
    raw.headers = [{ id: "1", key: "Content-Type", value: "text/plain", enabled: true }];
    const get = draft({ path: "/health", origin: "https://127.0.0.1" });
    get.headers = [{ id: "1", key: "Authorization", value: "Bearer t", enabled: true }];
    const head = draft({ method: "HEAD", path: ":3000/" });

    for (const d of [fields, form, raw, get, head]) {
      const back = fromCurl(toCurl(d)).draft;
      expect(wire(back)).toEqual(wire(d));
    }
  });
});
