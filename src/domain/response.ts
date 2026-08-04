/**
 * 送信したリクエストの控え。
 * ヘッダーはこのクライアントが設定した分だけで、ブラウザが自動で足す
 * User-Agent や Accept は含まれない（拡張からは取得できないため）。
 */
export type SentRequest = {
  method: string;
  url: string;
  headers: [string, string][];
  body: string;
};

/** 1 回のレスポンスをまとめた、画面表示用のデータ。 */
export type ResponseData = {
  request: SentRequest;
  status: number;
  statusText: string;
  timeMs: number;
  size: number;
  headers: [string, string][];
  bodyText: string;
  /**
   * 本文を JSON として解釈した値。JSON でないときと、{@link truncated} のときは `undefined`。
   *
   * 切れている本文を解釈しないのは、途中で切っても構文として通ってしまう形があるため。
   * たとえば本文が巨大な数値 1 個だと、どこで切っても数値として読めてしまい、
   * 実際とは違う値を「完全な結果」として表示することになる。
   */
  json: unknown | undefined;
  pretty: string | null;
  truncated?: boolean;
};

/**
 * Content-Type が JSON を示していて、本文が JSON として読めるときだけ値を返す。
 * それ以外は `undefined`。本文が空のときも `undefined` にする。
 *
 * 戻り値そのものが `null` や `false` になり得るので、
 * 「JSON だったかどうか」の判定には `undefined` との比較を使うこと。
 *
 * @param contentType レスポンスの Content-Type。`json` を含むかどうかだけを見るので、`application/problem+json` のような派生型も通る。ヘッダーが無いときは空文字を渡す
 * @param text レスポンス本文
 * @returns パースした値。Content-Type が JSON でない、本文が空、またはパースに失敗したときは `undefined`
 */
export function tryParseJson(contentType: string, text: string): unknown | undefined {
  if (!contentType.includes("json") || text.trim() === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * {@link tryParseJson} と同じ条件で、整形済みの JSON 文字列を返す。
 *
 * `undefined` ではなく `null` を返すのは、{@link ResponseData.pretty} が
 * 「整形できなかった」ことを明示的に持つため。
 *
 * @param contentType レスポンスの Content-Type
 * @param text レスポンス本文
 * @returns インデント 2 の整形済み JSON。JSON として扱えないときは `null`
 */
export function prettyJson(contentType: string, text: string): string | null {
  const v = tryParseJson(contentType, text);
  return v === undefined ? null : JSON.stringify(v, null, 2);
}
