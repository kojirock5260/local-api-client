/**
 * 画面に一度に出す本文の上限（文字数）。
 *
 * 送信時の {@link RESPONSE_LIMIT}（1MB）や履歴の {@link BODY_LIMIT}（30KB）とは別物で、
 * 受け取った本文のうち DOM に載せる量の上限。1MB の文字列を 1 つの pre に入れると
 * 折り返しの計算でパネルが数秒固まる。特に改行の無い JSON は全体が 1 行になって重い。
 * Copy と Download は全文を使うので、ここで切っても失われない。
 */
export const PREVIEW_LIMIT = 100_000;

/** ツリー表示で、1 つの階層に一度に出す子の数の上限。 */
export const TREE_CHILDREN_LIMIT = 200;

/**
 * 画面に出す分だけを切り出す。
 *
 * @param text 本文
 * @param limit 出す文字数の上限。省略時は {@link PREVIEW_LIMIT}
 * @returns `shown` は出す文字列、`hidden` は隠した文字数。上限内なら hidden は 0
 */
export function previewText(
  text: string,
  limit: number = PREVIEW_LIMIT,
): { shown: string; hidden: number } {
  if (text.length <= limit) return { shown: text, hidden: 0 };
  return { shown: text.slice(0, limit), hidden: text.length - limit };
}
