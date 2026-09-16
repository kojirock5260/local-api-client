import { afterEach, describe, expect, it, vi } from "vitest";
import { createSend, type Progress, RESPONSE_LIMIT } from "../../src/application/sendRequest";
import { type Draft, emptyDraft } from "../../src/domain/request";

afterEach(() => {
  vi.unstubAllGlobals();
});

const draft = (over: Partial<Draft> = {}): Draft => ({ ...emptyDraft(), ...over });

/**
 * チャンクを順に流す本文を持つレスポンスを作る。
 *
 * @param chunks 流すチャンク。文字列は UTF-8 に、バイト列はそのまま
 * @param opts.delayMs 各チャンクの前に待つ時間。省略時は待たない
 * @param opts.close false なら最後のチャンクのあと閉じない。止まったストリームの再現用
 * @param opts.headers レスポンスヘッダー。省略時は text/plain
 * @returns 200 のレスポンス
 */
function streamed(
  chunks: (string | Uint8Array)[],
  opts: { delayMs?: number; close?: boolean; headers?: Record<string, string> } = {},
): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const c of chunks) {
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        controller.enqueue(typeof c === "string" ? enc.encode(c) : c);
      }
      if (opts.close !== false) controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: opts.headers ?? { "content-type": "text/plain" },
  });
}

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
    if (!outcome.ok) expect(outcome.message).not.toMatch(/certificate/);
  });

  it("adds a certificate hint when an https connection fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const outcome = await createSend(draft({ origin: "https://localhost" })).promise;
    expect(outcome).toMatchObject({ ok: false, reason: "network" });
    if (!outcome.ok) expect(outcome.message).toMatch(/certificate/);
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

  it("handles a response without a body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    const outcome = await createSend(draft()).promise;
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.bodyText).toBe("");
      expect(outcome.data.size).toBe(0);
      expect(outcome.data.truncated).toBe(false);
    }
  });

  describe("Cookie", () => {
    it("omits credentials by default", async () => {
      const fetchMock = vi.fn(
        async (_url: URL, _init?: RequestInit) => new Response("", { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const outcome = await createSend(draft()).promise;
      expect(fetchMock.mock.calls[0][1]!.credentials).toBe("omit");
      if (outcome.ok) expect(outcome.data.request.cookies).toBe(false);
    });

    it("includes credentials only when the draft asks for cookies", async () => {
      const fetchMock = vi.fn(
        async (_url: URL, _init?: RequestInit) => new Response("", { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const outcome = await createSend(draft({ cookies: true })).promise;
      expect(fetchMock.mock.calls[0][1]!.credentials).toBe("include");
      if (outcome.ok) expect(outcome.data.request.cookies).toBe(true);
    });
  });

  describe("ストリーミング", () => {
    it("届いた分から順に途中経過を通知し、最後に全体を返す", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => streamed(["data: 1\n\n", "data: 2\n\n", "data: 3\n\n"])),
      );

      const seen: Progress[] = [];
      const outcome = await createSend(draft(), 1000, (p) => seen.push(p)).promise;

      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.data.bodyText).toBe("data: 1\n\ndata: 2\n\ndata: 3\n\n");
      // ヘッダー到着で 1 回、チャンクごとに 1 回。
      expect(seen[0]).toMatchObject({ status: 200, bodyText: "", size: 0 });
      expect(seen[seen.length - 1]?.bodyText).toBe("data: 1\n\ndata: 2\n\ndata: 3\n\n");
      expect(seen[seen.length - 1]?.size).toBe(27);
    });

    it("データが届き続けている限りタイムアウトしない", async () => {
      // 合計は上限を超えるが、チャンクの間隔は上限より短い。
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => streamed(["a", "b", "c", "d"], { delayMs: 15 })),
      );

      const outcome = await createSend(draft(), 40).promise;
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.data.bodyText).toBe("abcd");
    });

    it("途中で止まったストリームは無通信としてタイムアウトする", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => streamed(["a"], { close: false })),
      );

      const outcome = await createSend(draft(), 20).promise;
      expect(outcome).toMatchObject({ ok: false, reason: "timeout" });
    });

    it("受信の途中で中断できる", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => streamed(["a"], { close: false })),
      );

      const { promise, cancel } = createSend(draft(), 1000);
      // ヘッダーと最初のチャンクが届くのを待ってから止める。
      await new Promise((r) => setTimeout(r, 10));
      cancel();
      const outcome = await promise;
      expect(outcome).toMatchObject({ ok: false, reason: "cancelled" });
    });

    it("チャンクの切れ目が多バイト文字の途中でも壊れない", async () => {
      // "あ" は E3 81 82 の 3 バイト。2 バイト目と 3 バイト目の間で切る。
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => streamed([new Uint8Array([0xe3, 0x81]), new Uint8Array([0x82]), "い"])),
      );

      const outcome = await createSend(draft()).promise;
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.bodyText).toBe("あい");
        expect(outcome.data.size).toBe(6);
      }
    });

    it("生バイトを Content-Type 付きの Blob でも返す", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => streamed(["ab", "c"], { headers: { "content-type": "text/csv" } })),
      );

      const outcome = await createSend(draft()).promise;
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.bytes?.size).toBe(3);
        expect(outcome.data.bytes?.type).toBe("text/csv");
        expect(await outcome.data.bytes?.text()).toBe("abc");
      }
    });
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
        // Blob も上限まで。
        expect(outcome.data.bytes?.size).toBe(RESPONSE_LIMIT);
      }
    });

    it("チャンクに分かれて届いても、上限のあとは数えるだけにする", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          streamed(["x".repeat(RESPONSE_LIMIT - 10), "y".repeat(20), "z".repeat(30)]),
        ),
      );

      const seen: Progress[] = [];
      const outcome = await createSend(draft(), 1000, (p) => seen.push(p)).promise;

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.truncated).toBe(true);
        expect(outcome.data.bodyText.length).toBe(RESPONSE_LIMIT);
        expect(outcome.data.bodyText.endsWith("y".repeat(10))).toBe(true);
        expect(outcome.data.size).toBe(RESPONSE_LIMIT + 40);
      }
      // 上限を超えたあとの通知でも size は増え続ける。
      expect(seen[seen.length - 1]?.size).toBe(RESPONSE_LIMIT + 40);
      expect(seen[seen.length - 1]?.truncated).toBe(true);
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

    it("多バイト文字の途中で切れても置換文字を出さない", async () => {
      // 末尾の "あ" の 1 バイト目だけが上限内に入る。
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => streamed([`${"x".repeat(RESPONSE_LIMIT - 1)}あ`])),
      );

      const outcome = await createSend(draft()).promise;

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.truncated).toBe(true);
        expect(outcome.data.bodyText.length).toBe(RESPONSE_LIMIT - 1);
        expect(outcome.data.bodyText).not.toContain("�");
        expect(outcome.data.size).toBe(RESPONSE_LIMIT + 2);
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
