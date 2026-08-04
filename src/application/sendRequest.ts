import { buildPayload } from "../domain/body";
import type { Draft } from "../domain/request";
import { prettyJson, type ResponseData, tryParseJson } from "../domain/response";
import { buildUrl } from "../domain/url";

/** 送信を打ち切るまでの時間（ミリ秒）。相手がローカルなので短めにしてある。 */
export const TIMEOUT_MS = 15_000;

/**
 * 送信の結果。失敗も例外ではなくこの型で返るので、呼び出し側は try/catch を書かなくていい。
 *
 * `reason` の意味は次のとおり。
 * - `invalid` … URL を組み立てられなかった。リクエストは飛んでいない
 * - `timeout` … {@link TIMEOUT_MS} を超えた
 * - `cancelled` … ユーザーが中断した
 * - `network` … 接続できなかった（サーバーが起動していない、ポート違いなど）
 */
export type SendOutcome =
  | { ok: true; data: ResponseData }
  | { ok: false; reason: "invalid" | "timeout" | "cancelled" | "network"; message: string };

/**
 * リクエストを送り、結果の Promise と中断用の関数を返す。
 *
 * AbortController を呼び出し側に触らせないための包み。
 * 画面側は返ってきた `cancel` を保持して、必要なときに呼ぶだけでよい。
 *
 * @param draft 送信する内容
 * @param timeoutMs 省略時は {@link TIMEOUT_MS}。テストから短くするために開けてある
 * @returns `promise` は必ず解決する（reject しない）。失敗は {@link SendOutcome} として返る。
 */
export function createSend(
  draft: Draft,
  timeoutMs: number = TIMEOUT_MS,
): { promise: Promise<SendOutcome>; cancel: () => void } {
  const controller = new AbortController();
  return {
    promise: run(draft, controller, timeoutMs),
    // タイムアウトと区別できるよう、中断の理由を signal に載せておく。
    cancel: () => controller.abort("cancel"),
  };
}

/**
 * 実際の送信処理。
 *
 * 所要時間はボディを受け取り終えるまでを測る。ヘッダーだけの時間ではないので、
 * 大きなレスポンスでは転送時間も含まれる。
 *
 * @param draft 送信する内容
 * @param controller タイムアウトと中断の両方に使う。理由の文字列で区別する
 * @param timeoutMs 打ち切りまでのミリ秒
 * @returns 成功なら {@link ResponseData}、失敗なら理由付きの {@link SendOutcome}。
 */
async function run(
  draft: Draft,
  controller: AbortController,
  timeoutMs: number,
): Promise<SendOutcome> {
  // URL の組み立て失敗はリクエストを出す前に分かるので、タイマーを張る前に返す。
  let url: URL;
  try {
    url = buildUrl(draft.origin, draft.path);
  } catch (e) {
    return {
      ok: false,
      reason: "invalid",
      message: e instanceof Error ? e.message : "Invalid URL.",
    };
  }

  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

  // 自動付与ヘッダーを先に置いてから上書きする。同じ名前をユーザーが
  // 指定していれば、そちらが勝つ。
  const payload = buildPayload(draft);
  const headers: Record<string, string> = { ...payload.autoHeaders };
  for (const h of draft.headers) {
    if (h.enabled && h.key.trim() !== "") headers[h.key.trim()] = h.value;
  }

  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: draft.method,
      headers,
      body: payload.body !== "" ? payload.body : undefined,
      signal: controller.signal,
      // 開発中に古いレスポンスが返ってきて変更に気づけない、という事故を防ぐ。
      cache: "no-store",
    });
    // いったん blob で受けるのは、blob.size で実際のバイト数が取れるから。
    // 先にテキストへ変換すると、文字数しか分からずサイズ表示がずれる。
    const blob = await response.blob();
    const timeMs = Math.round(performance.now() - started);
    const bodyText = await blob.text();
    const ct = response.headers.get("content-type") ?? "";

    return {
      ok: true,
      data: {
        request: {
          method: draft.method,
          url: url.href,
          headers: Object.entries(headers),
          body: payload.body,
        },
        status: response.status,
        statusText: response.statusText,
        timeMs,
        size: blob.size,
        headers: [...response.headers.entries()],
        bodyText,
        json: tryParseJson(ct, bodyText),
        pretty: prettyJson(ct, bodyText),
      },
    };
  } catch {
    // fetch は中断でも接続失敗でも同じように例外を投げるので、
    // signal を見て「打ち切ったのか、そもそも繋がらなかったのか」を分ける。
    if (controller.signal.aborted) {
      return controller.signal.reason === "timeout"
        ? { ok: false, reason: "timeout", message: `Timed out after ${timeoutMs / 1000}s.` }
        : { ok: false, reason: "cancelled", message: "Request cancelled." };
    }
    return {
      ok: false,
      reason: "network",
      message: "Could not connect. Is your server running on that port?",
    };
  } finally {
    // 成功しても失敗しても、張りっぱなしのタイマーを必ず片づける。
    clearTimeout(timer);
  }
}
