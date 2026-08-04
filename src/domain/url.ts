export const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * オリジンとパスから送信先の URL を組み立てる。
 *
 * パスは `":3000/api"` `"/api"` `"api"` `""` のどの書き方でも受け付ける。
 * `:` か `/` で始まらないときだけ、先頭に `/` を補う。
 *
 * この関数の要点は、組み立てたあとに `URL` が解釈した結果のホスト名を検証している点。
 * そのため、パスに `":80@evil.com"` のようなユーザー情報を紛れ込ませて
 * 別ホストへ向けさせる細工も、ここで弾ける。
 * 文字列のまま前方一致で調べる方式では、この手口を防げない。
 *
 * @param origin `ORIGINS` のいずれか。`"http://localhost"` のようなスキーム付きの文字列
 * @param path ポートを含むパス。前後の空白は無視する。空文字も可
 * @returns 解釈済みの `URL`。ホスト名が localhost / 127.0.0.1 であることは確認済み
 * @throws URL として解釈できないとき、およびホスト名が {@link ALLOWED_HOSTS} に含まれないとき
 */
export function buildUrl(origin: string, path: string): URL {
  const p = path.trim();
  const suffix = p === "" || p.startsWith(":") || p.startsWith("/") ? p : `/${p}`;
  const url = new URL(origin + suffix);
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error("Only localhost and 127.0.0.1 are allowed.");
  }
  return url;
}
