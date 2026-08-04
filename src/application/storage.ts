/**
 * `chrome.storage.local` の薄い包み。
 *
 * `storage.sync` は絶対に使わない。あちらは Google のサーバーを経由して
 * 端末間で同期するため、「データはマシンから出ない」という前提が崩れる。
 *
 * 拡張の外（`npm run dev`）では chrome API が無いので localStorage に切り替える。
 * UI だけをブラウザで確認するための逃げ道で、拡張として動くときは通らない。
 */

/** chrome API を使えるかどうか。読み込み時に 1 度だけ判定する。 */
const hasChrome = typeof chrome !== "undefined" && !!chrome.storage?.local;

/**
 * 保存済みの値を読む。キーが無ければ fallback を返す。
 *
 * 中身の形は検証しない。古い形式が入っている可能性があるので、
 * Draft のように形が変わるものは、読んだあとに `normalizeDraft` を通すこと。
 *
 * @typeParam T 保存されている値の型。実行時には検証されないので、呼び出し側の宣言を信じる
 * @param key ストレージのキー
 * @param fallback キーが存在しないときに返す値
 * @returns 保存されていた値、または `fallback`
 */
export async function load<T>(key: string, fallback: T): Promise<T> {
  if (hasChrome) {
    const r = await chrome.storage.local.get(key);
    return (r[key] as T) ?? fallback;
  }
  const raw = localStorage.getItem(key);
  return raw !== null ? (JSON.parse(raw) as T) : fallback;
}

/**
 * 値を保存する。同じキーの既存の値は上書きされる。
 *
 * @param key ストレージのキー
 * @param value 保存する値。JSON にできる形であること
 * @returns 書き込みが終わると解決する Promise
 */
export async function save(key: string, value: unknown): Promise<void> {
  if (hasChrome) {
    await chrome.storage.local.set({ [key]: value });
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
}
