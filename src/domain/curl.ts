import { buildPayload } from "./body";
import type { Draft } from "./request";
import { buildUrl } from "./url";

/**
 * シェルに安全に渡せるよう、文字列をシングルクォートで囲む。
 *
 * シングルクォートの中では他のすべての文字がそのまま扱われるので、
 * エスケープが必要なのはシングルクォート自身だけ。
 * いったんクォートを閉じ、エスケープしたクォートを置き、また開き直す
 * （`'` → `'\''`）という定番の書き方をしている。
 *
 * @param s 囲みたい文字列。改行や空白が入っていてもよい
 * @returns シングルクォートで囲んだ文字列。空文字を渡すと `''` になる
 */
function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Draft を cURL コマンドの文字列に変換する。
 *
 * ボディと自動付与ヘッダーの計算は送信時と同じ {@link buildPayload} を通す。
 * そのため、コピーしたコマンドと実際に飛ぶリクエストの中身は必ず一致する。
 *
 * HEAD だけは `-X HEAD` ではなく `--head` を使う。`--head` が curl 側で
 * HEAD リクエスト用に用意されているオプションのため。
 *
 * 出力は `\` で行末を継続した複数行にする。ターミナルにそのまま貼れて、
 * かつヘッダーが多いときも読めるようにするため。
 *
 * @param draft 変換する Draft
 * @returns そのままターミナルに貼れる cURL コマンド。末尾に改行は付けない
 * @throws URL を組み立てられないとき、およびホストが localhost / 127.0.0.1 でないとき
 */
export function toCurl(draft: Draft): string {
  const url = buildUrl(draft.origin, draft.path);

  let first = "curl";
  if (draft.method === "HEAD") first += " --head";
  else if (draft.method !== "GET") first += ` -X ${draft.method}`;
  first += ` ${sq(url.href)}`;

  const payload = buildPayload(draft);
  const lines: string[] = [first];

  // 自動付与ヘッダーを先に出す。ユーザーが書いたヘッダーと並んだとき、
  // どちらがこちらの補完かひと目で分かるようにするため。
  for (const [k, v] of Object.entries(payload.autoHeaders)) {
    lines.push(`-H ${sq(`${k}: ${v}`)}`);
  }
  for (const h of draft.headers) {
    if (h.enabled && h.key.trim() !== "") {
      lines.push(`-H ${sq(`${h.key.trim()}: ${h.value}`)}`);
    }
  }
  if (payload.body !== "") {
    lines.push(`--data ${sq(payload.body)}`);
  }

  return lines.join(" \\\n  ");
}
