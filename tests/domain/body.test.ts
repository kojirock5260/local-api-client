import { describe, expect, it } from "vitest";
import { buildPayload, fieldsToObject, parseFieldValue } from "../../src/domain/body";
import { type Draft, emptyDraft, newHeader } from "../../src/domain/request";

const draft = (over: Partial<Draft> = {}): Draft => ({ ...emptyDraft(), ...over });
const row = (key: string, value: string, enabled = true) => ({
  id: crypto.randomUUID(),
  key,
  value,
  enabled,
});

describe("parseFieldValue", () => {
  it("parses JSON literals to their types", () => {
    expect(parseFieldValue("30")).toBe(30);
    expect(parseFieldValue("true")).toBe(true);
    expect(parseFieldValue("null")).toBeNull();
    expect(parseFieldValue('"30"')).toBe("30");
    expect(parseFieldValue('{"a":1}')).toEqual({ a: 1 });
  });

  it("falls back to the raw string", () => {
    expect(parseFieldValue("hello")).toBe("hello");
    expect(parseFieldValue("")).toBe("");
  });
});

describe("fieldsToObject", () => {
  it("skips disabled and empty-key rows", () => {
    const obj = fieldsToObject([row("name", '"sato"'), row("off", "1", false), row("", "x")]);
    expect(obj).toEqual({ name: "sato" });
  });
});

describe("buildPayload", () => {
  it("builds a JSON body and auto Content-Type in fields mode", () => {
    const d = draft({ method: "POST", bodyFields: [row("age", "30")] });
    const p = buildPayload(d);
    expect(p.body).toBe('{"age":30}');
    expect(p.autoHeaders).toEqual({ "Content-Type": "application/json" });
  });

  it("does not auto-add Content-Type when the user set one", () => {
    const d = draft({ method: "POST", bodyFields: [row("a", "1")] });
    d.headers = [row("Content-Type", "application/vnd.api+json")];
    expect(buildPayload(d).autoHeaders).toEqual({});
  });

  it("returns raw body untouched in raw mode", () => {
    const d = draft({ method: "POST", bodyMode: "raw", body: "plain text" });
    expect(buildPayload(d)).toEqual({ body: "plain text", autoHeaders: {} });
  });

  it("is empty for GET and for fields with no active rows", () => {
    expect(buildPayload(draft({ bodyFields: [row("x", "1")] })).body).toBe("");
    expect(buildPayload(draft({ method: "POST", bodyFields: [newHeader()] })).body).toBe("");
  });
});
