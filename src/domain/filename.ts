/**
 * Content-Type に含まれる語と、それに対応する拡張子。上から順に探す。
 * `image/svg+xml` のように 2 語含むものがあるので、より具体的な語を先に置く。
 */
const EXTENSIONS: [string, string][] = [
  ["svg", "svg"],
  ["html", "html"],
  ["json", "json"],
  ["xml", "xml"],
  ["csv", "csv"],
  ["javascript", "js"],
  ["text/plain", "txt"],
  ["png", "png"],
  ["jpeg", "jpg"],
  ["gif", "gif"],
  ["webp", "webp"],
  ["pdf", "pdf"],
];

/**
 * レスポンス本文を保存するときのファイル名を決める。
 *
 * パスの最後の要素を名前にし、拡張子が無ければ Content-Type から補う。
 * どちらからも決まらなければ `response.txt`。
 *
 * @param url 送信した URL
 * @param contentType レスポンスの Content-Type。無ければ空文字
 * @returns 拡張子付きのファイル名。ファイル名に使えない文字は `_` に置き換え、制御文字は落とす
 */
export function responseFilename(url: string, contentType: string): string {
  let base = "response";
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (last) base = decodeURIComponent(last);
  } catch {
    // URL として読めなければ既定の名前を使う。
  }
  base = [...base]
    .filter((c) => c.charCodeAt(0) >= 32)
    .join("")
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 80);
  if (/\.[a-z0-9]{1,5}$/i.test(base)) return base;
  const ct = contentType.toLowerCase();
  const ext = EXTENSIONS.find(([word]) => ct.includes(word))?.[1] ?? "txt";
  return `${base}.${ext}`;
}
