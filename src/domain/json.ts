/**
 * Raw ボディを JSON として扱うための小さな判定と整形。
 * 送信内容は変えない。書いている途中に間違いに気づけるようにするためのもの。
 */

/**
 * JSON として読めるか調べ、読めなければその理由を返す。
 *
 * 空文字は「まだ何も書いていない」だけなので、間違いとは言わない。
 *
 * @param text 調べる文字列
 * @returns 読めれば null。読めなければ JSON.parse が出した理由
 */
export function jsonError(text: string): string | null {
  if (text.trim() === "") return null;
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid JSON";
  }
}

/**
 * インデント 2 で整形する。
 *
 * @param text 整形したい文字列
 * @returns 整形した文字列。JSON として読めないとき、および空のときは null
 */
export function formatJson(text: string): string | null {
  if (text.trim() === "") return null;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

/**
 * JSON のつもりで書いているかどうか。
 *
 * 先頭が `{` か `[` なら JSON と見なす。数値や文字列だけの JSON もあり得るが、
 * それを送りたい人より、プレーンテキストを送りたい人のほうが多い。
 *
 * @param text 調べる文字列
 * @returns JSON らしければ true
 */
export function looksLikeJson(text: string): boolean {
  return /^\s*[[{]/.test(text);
}
