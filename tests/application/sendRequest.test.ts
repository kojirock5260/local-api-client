import { afterEach, describe, expect, it, vi } from "vitest";
import { createSend, RESPONSE_LIMIT } from "../../src/application/sendRequest";
import { type Draft, emptyDraft } from "../../src/domain/request";

afterEach(() => {
  vi.unstubAllGlobals();
});

const draft = (over: Partial<Draft> = {}): Draft => ({ ...emptyDraft(), ...over });

describe("createSend", () => {
  it("returns ok with parsed response data on success", async () => {
    const fetchMock = vi.fn(
      async (_url: URL, _init?: RequestInit) =>
        new Response('{"hello":"world"}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { promise } = createSend(draft({ path: ":3000/api" }));
    const outcome = await promise;

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.status).toBe(200);
      expect(outcome.data.pretty).toContain('"hello"');
      expect(outcome.data.request.method).toBe("GET");
      expect(outcome.data.request.url).toBe("http://localhost:3000/api");
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl.href).toBe("http://localhost:3000/api");
  });

  it("rejects a non-localhost URL without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { promise } = createSend(draft({ path: ":80@evil.com/" }));
    const outcome = await promise;

    expect(outcome).toMatchObject({ ok: false, reason: "invalid" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps connection failures to reason: network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const { promise } = createSend(draft());
    const outcome = await promise;
    expect(outcome).toMatchObject({ ok: false, reason: "network" });
  });

  it("maps cancel() to reason: cancelled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: URL, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );

    const { promise, cancel } = createSend(draft());
    cancel();
    const outcome = await promise;
    expect(outcome).toMatchObject({ ok: false, reason: "cancelled" });
  });

  it("maps a timeout to reason: timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: URL, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );

    const { promise } = createSend(draft(), 10); // times out after 10 ms
    const outcome = await promise;
    expect(outcome).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("skips disabled and empty-key headers", async () => {
    const fetchMock = vi.fn(
      async (_url: URL, _init?: RequestInit) => new Response("", { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const d = draft();
    d.headers = [
      { id: "1", key: "X-On", value: "yes", enabled: true },
      { id: "2", key: "X-Off", value: "no", enabled: false },
      { id: "3", key: "", value: "ignored", enabled: true },
    ];
    await createSend(d).promise;

    const init = fetchMock.mock.calls[0][1]!;
    expect(init.headers).toEqual({ "X-On": "yes" });
  });

  it("snapshots the sent request including the auto Content-Type in fields mode", async () => {
    const fetchMock = vi.fn(
      async (_url: URL, _init?: RequestInit) => new Response("", { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const d = draft({ method: "POST", path: ":3000/users" });
    d.bodyFields = [{ id: "1", key: "age", value: "30", enabled: true }];
    const outcome = await createSend(d).promise;

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.request.headers).toContainEqual(["Content-Type", "application/json"]);
      expect(outcome.data.request.body).toBe('{"age":30}');
    }
  });

  describe("大きすぎる本文", () => {
    /**
     * 上限ちょうどまでの本文を返すレスポンスを作る。
     *
     * @param size 本文のバイト数
     * @param body 本文。省略時は `x` の繰り返し
     * @returns JSON を名乗るレスポンス
     */
    const bigJson = (size: number, body?: string) =>
      new Response(body ?? "x".repeat(size), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    it("上限を超えた本文は切り詰めて truncated を立てる", async () => {
      const over = RESPONSE_LIMIT + 100;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => bigJson(over)),
      );

      const outcome = await createSend(draft()).promise;

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.truncated).toBe(true);
        expect(outcome.data.bodyText.length).toBe(RESPONSE_LIMIT);
        // size は切る前の、受け取った本当の量。
        expect(outcome.data.size).toBe(over);
      }
    });

    it("上限ちょうどなら切らない", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => bigJson(RESPONSE_LIMIT)),
      );

      const outcome = await createSend(draft()).promise;

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.truncated).toBe(false);
        expect(outcome.data.bodyText.length).toBe(RESPONSE_LIMIT);
      }
    });

    // 途中で切っても構文として通ってしまう形。ここで parse すると、
    // 実際とは違う値を完全な結果として表示してしまう。
    it("切った本文が JSON として読めてしまう場合でも解釈しない", async () => {
      const digits = "1".repeat(RESPONSE_LIMIT + 100);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => bigJson(0, digits)),
      );

      const outcome = await createSend(draft()).promise;

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.truncated).toBe(true);
        // 切らずに解釈していたら、この長さの数値が入ってしまう。
        expect(outcome.data.json).toBeUndefined();
        expect(outcome.data.pretty).toBeNull();
      }
    });

    it("上限内なら今まで通り JSON として解釈する", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => bigJson(0, '{"ok":true}')),
      );

      const outcome = await createSend(draft()).promise;

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.truncated).toBe(false);
        expect(outcome.data.json).toEqual({ ok: true });
      }
    });
  });
});
