import { describe, expect, it } from "vitest";
import { buildPayload, fieldsToForm, fieldsToObject, parseFieldValue } from "../../src/domain/body";
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

  it("builds a urlencoded body and auto Content-Type in form mode", () => {
    const d = draft({ method: "POST", bodyMode: "form", bodyFields: [row("name", "sato")] });
    const p = buildPayload(d);
    expect(p.body).toBe("name=sato");
    expect(p.autoHeaders).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
  });

  it("respects a user Content-Type in form mode", () => {
    const d = draft({ method: "POST", bodyMode: "form", bodyFields: [row("a", "1")] });
    d.headers = [row("content-type", "application/x-www-form-urlencoded; charset=utf-8")];
    expect(buildPayload(d).autoHeaders).toEqual({});
  });

  it("is empty in form mode with no active rows", () => {
    expect(buildPayload(draft({ method: "POST", bodyMode: "form" })).body).toBe("");
  });
});

describe("fieldsToForm", () => {
  it("keeps values as strings and encodes them", () => {
    expect(fieldsToForm([row("age", "30"), row("quoted", '"30"'), row("q", "a b&c")])).toBe(
      "age=30&quoted=%2230%22&q=a+b%26c",
    );
  });

  it("keeps repeated keys and skips disabled or empty-key rows", () => {
    expect(
      fieldsToForm([row("ids", "1"), row("ids", "2"), row("off", "x", false), row("", "y")]),
    ).toBe("ids=1&ids=2");
  });

  it("trims keys", () => {
    expect(fieldsToForm([row("  name ", "sato")])).toBe("name=sato");
  });
});
