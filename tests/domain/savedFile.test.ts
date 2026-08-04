import { describe, expect, it } from "vitest";
import { emptyDraft } from "../../src/domain/request";
import { type SavedRequest, upsertSaved } from "../../src/domain/saved";
import { mergeSaved, parseSavedFile, serializeSaved } from "../../src/domain/savedFile";

function make(name: string, group?: string): SavedRequest[] {
  return upsertSaved([], emptyDraft(), name, group);
}

describe("serialize / parse round trip", () => {
  it("survives a round trip", () => {
    const items = make("users", "project-a");
    const parsed = parseSavedFile(serializeSaved(items));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("users");
    expect(parsed[0].group).toBe("project-a");
    expect(parsed[0].origin).toBe("http://localhost");
  });

  it("rejects non-JSON", () => {
    expect(() => parseSavedFile("not json")).toThrow(/valid JSON/);
  });

  it("rejects files from other apps", () => {
    expect(() => parseSavedFile('{"app":"other","saved":[]}')).toThrow(/export file/);
  });

  it("rejects entries with a non-localhost origin", () => {
    const items = make("evil");
    const text = serializeSaved(items).replace("http://localhost", "http://evil.com");
    expect(() => parseSavedFile(text)).toThrow(/localhost/);
  });

  it("regenerates ids and drops malformed headers", () => {
    const items = make("x");
    const file = JSON.parse(serializeSaved(items));
    file.saved[0].headers = [{ key: "Ok", value: "1" }, { broken: true }, "junk"];
    const parsed = parseSavedFile(JSON.stringify(file));
    expect(parsed[0].headers).toHaveLength(1);
    expect(parsed[0].headers[0].key).toBe("Ok");
    expect(parsed[0].id).not.toBe(items[0].id);
  });
});

describe("mergeSaved", () => {
  it("adds new entries and overwrites same group+name, keeping local id", () => {
    const current = make("users", "a");
    const incoming = [...make("users", "a"), ...make("orders", "a")];
    const { items, added, updated } = mergeSaved(current, incoming);
    expect(added).toBe(1);
    expect(updated).toBe(1);
    expect(items).toHaveLength(2);
    const users = items.find((s) => s.name === "users")!;
    expect(users.id).toBe(current[0].id);
  });

  it("respects the limit", () => {
    const current = make("a");
    const incoming = [...make("b"), ...make("c")];
    const { items } = mergeSaved(current, incoming, { limit: 2 });
    expect(items).toHaveLength(2);
  });
});
