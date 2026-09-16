import { describe, expect, it } from "vitest";
import { emptyDraft } from "../../src/domain/request";
import {
  copyName,
  duplicateSaved,
  groupSaved,
  type SavedRequest,
  upsertSaved,
} from "../../src/domain/saved";

describe("upsertSaved", () => {
  it("prepends a new entry", () => {
    const one = upsertSaved([], emptyDraft(), "first", undefined, { id: "a", now: 1 });
    const two = upsertSaved(one, emptyDraft(), "second", undefined, { id: "b", now: 2 });
    expect(two.map((s) => s.name)).toEqual(["second", "first"]);
  });

  it("overwrites when the name already exists, keeping id and count", () => {
    const draftA = { ...emptyDraft(), path: ":3000/a" };
    const draftB = { ...emptyDraft(), path: ":3000/b" };
    let items: SavedRequest[] = upsertSaved([], draftA, "same", undefined, {
      id: "keep-me",
      now: 1,
    });
    items = upsertSaved(items, draftB, "same", undefined, { now: 2 });

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("keep-me");
    expect(items[0].path).toBe(":3000/b");
    expect(items[0].updatedAt).toBe(2);
  });

  it("treats different names as separate entries", () => {
    let items: SavedRequest[] = upsertSaved([], emptyDraft(), "a");
    items = upsertSaved(items, emptyDraft(), "b");
    expect(items).toHaveLength(2);
  });

  it("deep-copies the draft", () => {
    const draft = emptyDraft();
    const items = upsertSaved([], draft, "snap");
    draft.body = "mutated";
    expect(items[0].body).toBe("");
  });
});

describe("upsertSaved with groups", () => {
  it("treats same name in different groups as separate entries", () => {
    let items: SavedRequest[] = upsertSaved([], emptyDraft(), "users", "project-a");
    items = upsertSaved(items, emptyDraft(), "users", "project-b");
    expect(items).toHaveLength(2);
  });

  it("overwrites same name within the same group", () => {
    let items: SavedRequest[] = upsertSaved([], emptyDraft(), "users", "project-a");
    items = upsertSaved(items, emptyDraft(), "users", "project-a");
    expect(items).toHaveLength(1);
  });

  it("normalizes empty group to ungrouped", () => {
    const items = upsertSaved([], emptyDraft(), "x", "   ");
    expect(items[0].group).toBeUndefined();
  });

  it("caps at SAVED_LIMIT, dropping the oldest", () => {
    let items: SavedRequest[] = [];
    for (let i = 0; i < 5; i++) {
      items = upsertSaved(items, emptyDraft(), `r${i}`, undefined, { limit: 3, now: i });
    }
    expect(items).toHaveLength(3);
    expect(items.map((s) => s.name)).toEqual(["r4", "r3", "r2"]);
  });
});

describe("groupSaved", () => {
  it("sorts groups alphabetically and puts ungrouped last", () => {
    let items: SavedRequest[] = upsertSaved([], emptyDraft(), "a", "zebra");
    items = upsertSaved(items, emptyDraft(), "b", "alpha");
    items = upsertSaved(items, emptyDraft(), "c");
    const grouped = groupSaved(items);
    expect(grouped.map(([g]) => g)).toEqual(["alpha", "zebra", undefined]);
  });
});

describe("copyName", () => {
  it("appends copy, then numbers", () => {
    let items: SavedRequest[] = upsertSaved([], emptyDraft(), "users");
    expect(copyName(items, undefined, "users")).toBe("users copy");
    items = upsertSaved(items, emptyDraft(), "users copy");
    expect(copyName(items, undefined, "users")).toBe("users copy 2");
    items = upsertSaved(items, emptyDraft(), "users copy 2");
    expect(copyName(items, undefined, "users")).toBe("users copy 3");
  });

  it("only looks inside the same group", () => {
    const items = upsertSaved([], emptyDraft(), "users copy", "other");
    expect(copyName(items, undefined, "users")).toBe("users copy");
  });
});

describe("duplicateSaved", () => {
  it("prepends a copy with the same content and a new name", () => {
    const src = upsertSaved([], { ...emptyDraft(), path: ":3000/x" }, "users", "g", { id: "a" });
    const { items, name } = duplicateSaved(src, "a", { id: "b" });
    expect(name).toBe("users copy");
    expect(items.map((s) => s.name)).toEqual(["users copy", "users"]);
    expect(items[0]).toMatchObject({ id: "b", group: "g", path: ":3000/x" });
    expect(src).toHaveLength(1);
  });

  it("returns the input unchanged for an unknown id", () => {
    const src = upsertSaved([], emptyDraft(), "users");
    const { items, name } = duplicateSaved(src, "nope");
    expect(items).toBe(src);
    expect(name).toBeNull();
  });
});
