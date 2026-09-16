import type { HeaderRow } from "./request";

/**
 * 文字列を UTF-8 のバイト列として base64 にする。
 *
 * `btoa` はバイト列相当の文字列しか受け付けず、日本語をそのまま渡すと例外になる。
 * 先に UTF-8 に落としてから 1 バイトずつ文字にして渡す。
 *
 * @param s 元の文字列
 * @returns base64 文字列
 */
function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Bearer 認証の Authorization ヘッダーの値を作る。
 *
 * @param token トークン。前後の空白は落とす
 * @returns `Bearer <token>`
 */
export function bearerValue(token: string): string {
  return `Bearer ${token.trim()}`;
}

/**
 * Basic 認証の Authorization ヘッダーの値を作る。
 *
 * @param user ユーザー名
 * @param password パスワード。空でもよい
 * @returns `Basic <base64(user:password)>`
 */
export function basicValue(user: string, password: string): string {
  return `Basic ${toBase64(`${user}:${password}`)}`;
}

/**
 * 同じ名前のヘッダー行があれば値を差し替え、なければ足す。
 *
 * 名前の比較は大文字小文字を区別しない。差し替えるときは、ユーザーが書いた
 * 名前の綴りはそのまま残し、無効にしてあった行は有効に戻す。
 * 足すときは、空のまま置いてある行があればそこを使う。空行を残して
 * その下に足すと、見た目が散らかるため。
 *
 * @param rows いまのヘッダー行
 * @param key ヘッダー名
 * @param value ヘッダーの値
 * @returns 差し替えまたは追加を反映した、新しい配列
 */
export function upsertHeader(rows: HeaderRow[], key: string, value: string): HeaderRow[] {
  const k = key.trim().toLowerCase();
  const idx = rows.findIndex((r) => r.key.trim().toLowerCase() === k);
  if (idx >= 0) return rows.map((r, i) => (i === idx ? { ...r, value, enabled: true } : r));
  const blank = rows.findIndex((r) => r.key.trim() === "" && r.value === "");
  if (blank >= 0) {
    return rows.map((r, i) => (i === blank ? { ...r, key, value, enabled: true } : r));
  }
  return [...rows, { id: crypto.randomUUID(), key, value, enabled: true }];
}
