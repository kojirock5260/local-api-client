import type { Draft } from "./request";
import { prettyJson, type ResponseData, type SentRequest, tryParseJson } from "./response";

/** 履歴の保持件数。これを超えると古いものから自動的に消える。 */
export const HISTORY_LIMIT = 30;

/**
 * 履歴に残すレスポンス本文の上限（バイト数ではなく文字数）。
 *
 * `chrome.storage.local` には上限があり、超えると書き込みが即座に失敗する。
 * 相手が localhost の開発サーバーなので本文は小さい前提だが、
 * 大きなレスポンスを続けて叩いたときに枠を使い切らないよう頭を押さえている。
 *
 * 見積もり: 1 件あたり約 13KB（本文 10KB + JSON 文字列化の膨張 + ヘッダー）。
 * {@link HISTORY_LIMIT} 件で約 400KB、既定の quota 10MB に対して約 4%。
 */
export const BODY_LIMIT = 10 * 1024;

/**
 * 履歴に残すレスポンス。{@link ResponseData} から、本文を切り詰めて保存する。
 *
 * `json` と `pretty` は持たない。本文と Content-Type から作り直せるうえ、
 * 同じ内容を二重に持つと容量を無駄に使うため。
 */
export type StoredResponse = {
  request: SentRequest;
  status: number;
  statusText: string;
  timeMs: number;
  size: number;
  headers: [string, string][];
  bodyText: string;
  truncated: boolean;
};

/**
 * 送信のたびに自動で残る履歴 1 件。
 *
 * `status` と `timeMs` は一覧に出すために持っている。
 * `response` は送信が成功したときだけ入り、読み込んだときの再現に使う。
 */
export type HistoryEntry = Draft & {
  id: string;
  at: number;
  status: number | null;
  timeMs: number | null;
  response?: StoredResponse;
};

/**
 * レスポンスを履歴に残せる形にする。本文が長ければ切り詰める。
 *
 * @param data 受け取ったレスポンス
 * @param limit 本文の上限。省略時は {@link BODY_LIMIT}
 * @returns 保存用に整えたレスポンス
 */
export function toStoredResponse(data: ResponseData, limit: number = BODY_LIMIT): StoredResponse {
  const truncated = data.bodyText.length > limit;
  return {
    request: data.request,
    status: data.status,
    statusText: data.statusText,
    timeMs: data.timeMs,
    size: data.size,
    headers: data.headers,
    bodyText: truncated ? data.bodyText.slice(0, limit) : data.bodyText,
    truncated,
  };
}

/**
 * 保存しておいたレスポンスを、表示用の {@link ResponseData} に戻す。
 *
 * `json` と `pretty` は保存していないので、本文と Content-Type から作り直す。
 * 本文を切り詰めてある場合は JSON として壊れているため、両方 undefined / null になり、
 * 画面は自動的に生テキスト表示に落ちる。
 *
 * @param r 履歴に保存されていたレスポンス
 * @returns 画面にそのまま渡せる {@link ResponseData}
 */
export function fromStoredResponse(r: StoredResponse): ResponseData {
  const ct = r.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
  return {
    request: r.request,
    status: r.status,
    statusText: r.statusText,
    timeMs: r.timeMs,
    size: r.size,
    headers: r.headers,
    bodyText: r.bodyText,
    json: tryParseJson(ct, r.bodyText),
    pretty: prettyJson(ct, r.bodyText),
    truncated: r.truncated,
  };
}

/** テストから時刻・id・上限を固定するための差し込み口。省略時は実際の値を使う。 */
type Options = { now?: number; id?: string; limit?: number };

/**
 * 履歴の先頭に 1 件足した新しい配列を返す。渡された配列は書き換えない。
 * 上限を超えた分は末尾（古いもの）から切り捨てる。
 *
 * Draft は `structuredClone` で複製してから積む。
 * 参照のまま入れると、そのあと編集中の Draft を触ったときに
 * 履歴の中身まで一緒に変わってしまうため。
 *
 * @param entries いまの履歴。新しい順に並んでいることを前提にする
 * @param draft 送信した内容。複製して積むので、呼び出し側はそのまま使い続けてよい
 * @param result 送信結果。失敗・中断のときは status と timeMs に null を渡し、
 *   `response` は省略する
 * @param opts テスト用の差し込み口。省略時は現在時刻・新しい UUID・{@link HISTORY_LIMIT}
 * @returns 先頭に 1 件足して上限で切り詰めた、新しい配列
 */
export function pushHistory(
  entries: HistoryEntry[],
  draft: Draft,
  result: { status: number | null; timeMs: number | null; response?: StoredResponse },
  opts: Options = {},
): HistoryEntry[] {
  const { now = Date.now(), id = crypto.randomUUID(), limit = HISTORY_LIMIT } = opts;
  return [{ ...structuredClone(draft), id, at: now, ...result }, ...entries].slice(0, limit);
}
