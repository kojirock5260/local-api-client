import { describe, expect, it } from "vitest";
import {
  BODY_LIMIT,
  fromStoredResponse,
  HISTORY_LIMIT,
  type HistoryEntry,
  pushHistory,
  toStoredResponse,
} from "../../src/domain/history";
import { emptyDraft } from "../../src/domain/request";
import type { ResponseData } from "../../src/domain/response";

const result = { status: 200, timeMs: 12 };

/** 表示用のレスポンスを組み立てる。本文と Content-Type だけ差し替えられる。 */
function makeResponse(bodyText: string, contentType = "application/json"): ResponseData {
  return {
    request: { method: "GET", url: "http://localhost:3000/", headers: [], body: "" },
    status: 200,
    statusText: "OK",
    timeMs: 12,
    size: bodyText.length,
    headers: [["content-type", contentType]],
    bodyText,
    json: undefined,
    pretty: null,
  };
}

describe("pushHistory", () => {
  it("prepends the newest entry", () => {
    const first = pushHistory([], emptyDraft(), result, { id: "a", now: 1 });
    const second = pushHistory(first, emptyDraft(), result, { id: "b", now: 2 });
    expect(second.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("caps at the limit, dropping the oldest", () => {
    let entries: HistoryEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries = pushHistory(entries, emptyDraft(), result, { id: `e${i}`, now: i, limit: 3 });
    }
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.id)).toEqual(["e4", "e3", "e2"]);
  });

  it("defaults to HISTORY_LIMIT", () => {
    let entries: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      entries = pushHistory(entries, emptyDraft(), result, { id: `e${i}`, now: i });
    }
    expect(entries).toHaveLength(HISTORY_LIMIT);
  });

  it("records connection failures as null status", () => {
    const entries = pushHistory([], emptyDraft(), { status: null, timeMs: null });
    expect(entries[0].status).toBeNull();
  });

  it("deep-copies the draft (later edits do not mutate history)", () => {
    const draft = emptyDraft();
    const entries = pushHistory([], draft, result);
    draft.path = ":9999/changed";
    draft.headers[0].key = "X-Changed";
    expect(entries[0].path).toBe(":3000/");
    expect(entries[0].headers[0].key).toBe("");
  });

  it("keeps the response when one is given", () => {
    const stored = toStoredResponse(makeResponse('{"ok":true}'));
    const entries = pushHistory([], emptyDraft(), { ...result, response: stored });
    expect(entries[0].response?.bodyText).toBe('{"ok":true}');
  });

  it("has no response for failed sends", () => {
    const entries = pushHistory([], emptyDraft(), { status: null, timeMs: null });
    expect(entries[0].response).toBeUndefined();
  });
});

describe("toStoredResponse", () => {
  it("keeps short bodies whole", () => {
    const s = toStoredResponse(makeResponse('{"ok":true}'));
    expect(s.bodyText).toBe('{"ok":true}');
    expect(s.truncated).toBe(false);
  });

  it("cuts bodies over the limit", () => {
    const s = toStoredResponse(makeResponse("x".repeat(BODY_LIMIT + 100)));
    expect(s.bodyText).toHaveLength(BODY_LIMIT);
    expect(s.truncated).toBe(true);
  });

  it("keeps the original size even after cutting", () => {
    const body = "x".repeat(BODY_LIMIT + 500);
    const s = toStoredResponse(makeResponse(body));
    expect(s.size).toBe(body.length);
    expect(s.bodyText.length).toBeLessThan(s.size);
  });

  it("does not cut at exactly the limit", () => {
    const s = toStoredResponse(makeResponse("x".repeat(BODY_LIMIT)));
    expect(s.truncated).toBe(false);
  });

  it("respects an explicit limit", () => {
    const s = toStoredResponse(makeResponse("abcdefghij"), 4);
    expect(s.bodyText).toBe("abcd");
    expect(s.truncated).toBe(true);
  });
});

describe("fromStoredResponse", () => {
  it("rebuilds json and pretty from the stored body", () => {
    const r = fromStoredResponse(toStoredResponse(makeResponse('{"a":1}')));
    expect(r.json).toEqual({ a: 1 });
    expect(r.pretty).toBe('{\n  "a": 1\n}');
  });

  it("falls back to raw text when the body was cut", () => {
    // 途中で切れた JSON はパースできないので、ツリー表示ではなく生テキストになる。
    const long = `{"items":[${'"x",'.repeat(BODY_LIMIT)}]}`;
    const r = fromStoredResponse(toStoredResponse(makeResponse(long)));
    expect(r.truncated).toBe(true);
    expect(r.json).toBeUndefined();
    expect(r.pretty).toBeNull();
  });

  it("leaves json undefined for non-JSON content types", () => {
    const r = fromStoredResponse(toStoredResponse(makeResponse("<html></html>", "text/html")));
    expect(r.json).toBeUndefined();
  });

  it("round-trips the request snapshot and headers", () => {
    const r = fromStoredResponse(toStoredResponse(makeResponse('{"a":1}')));
    expect(r.request.url).toBe("http://localhost:3000/");
    expect(r.headers).toEqual([["content-type", "application/json"]]);
    expect(r.status).toBe(200);
    expect(r.statusText).toBe("OK");
  });
});
