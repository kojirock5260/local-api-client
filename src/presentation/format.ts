/** 表示のためだけの整形ヘルパー。ここに判断のロジックは置かない。 */

/**
 * バイト数を人が読める単位にする。
 * 小数点以下 1 桁までにしているのは、サイドパネルが狭く桁を伸ばせないため。
 *
 * @param bytes バイト数
 * @returns 単位付きの文字列。1KB 未満は `B`、1MB 未満は `KB`、それ以上は `MB`
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * ステータスコードを、色分け用の CSS クラス名に変換する。
 * 実際の色は `app.css` の `.s2xx` などで決めている。
 *
 * 2xx 未満（1xx）も `s2xx` に寄せている。ローカル相手ではまず出ないため。
 *
 * @param status HTTP ステータスコード
 * @returns `s2xx` `s3xx` `s4xx` `s5xx` のいずれか
 */
export function statusClass(status: number): string {
  if (status >= 500) return "s5xx";
  if (status >= 400) return "s4xx";
  if (status >= 300) return "s3xx";
  return "s2xx";
}

/**
 * 時刻を「どれくらい前か」の短い表記にする。1 分未満は `now`。
 *
 * 一覧の行に収めたいので、単位は 1 つだけ（`1h30m` のようには書かない）。
 * 日をまたぐと `d` 止まりで、それ以上細かくは出さない。
 *
 * @param t エポックミリ秒
 * @returns `now` `5m` `3h` `2d` のような短い文字列。未来の時刻を渡すと `now` になる
 */
export function ago(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
