import { describe, expect, it } from "vitest";
import { basicValue, bearerValue, upsertHeader } from "../../src/domain/auth";
import { type HeaderRow, newHeader } from "../../src/domain/request";

const row = (key: string, value: string, enabled = true): HeaderRow => ({
  id: crypto.randomUUID(),
  key,
  value,
  enabled,
});

describe("bearerValue", () => {
  it("prefixes the trimmed token", () => {
    expect(bearerValue("  abc  ")).toBe("Bearer abc");
  });
});

describe("basicValue", () => {
  it("encodes user:password in base64", () => {
    expect(basicValue("aladdin", "opensesame")).toBe("Basic YWxhZGRpbjpvcGVuc2VzYW1l");
  });

  it("encodes non-ASCII as UTF-8", () => {
    // "a:é" は 61 3a c3 a9 の 4 バイト。
    expect(basicValue("a", "é")).toBe("Basic YTrDqQ==");
  });

  it("allows an empty password", () => {
    expect(basicValue("u", "")).toBe("Basic dTo=");
  });
});

describe("upsertHeader", () => {
  it("replaces an existing header case-insensitively and re-enables it", () => {
    const rows = [row("authorization", "old", false), row("X-Other", "1")];
    const out = upsertHeader(rows, "Authorization", "new");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ key: "authorization", value: "new", enabled: true });
    expect(out[0].id).toBe(rows[0].id);
  });

  it("fills a blank row instead of appending", () => {
    const rows = [newHeader()];
    const out = upsertHeader(rows, "Authorization", "Bearer x");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "Authorization", value: "Bearer x", enabled: true });
  });

  it("appends when there is no blank row", () => {
    const rows = [row("Accept", "application/json")];
    const out = upsertHeader(rows, "Authorization", "Bearer x");
    expect(out.map((r) => r.key)).toEqual(["Accept", "Authorization"]);
    expect(rows).toHaveLength(1);
  });
});
