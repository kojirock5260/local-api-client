import type { Draft, HeaderRow } from "./request";

/**
 * フィールドの値を解釈する。
 * JSON として読めればその型を保ち（`30` → 数値、`true` → 真偽値、`"30"` → 文字列）、
 * 読めなければ入力された文字列をそのまま使う。
 *
 * 空文字は `JSON.parse` が失敗するため、先に空文字として返している。
 *
 * @param raw 入力欄の生の文字列
 * @returns JSON として解釈した値、または入力そのままの文字列（この場合は空白を落とさない）
 */
export function parseFieldValue(raw: string): unknown {
  const t = raw.trim();
  if (t === "") return "";
  try {
    return JSON.parse(t);
  } catch {
    return raw;
  }
}

/**
 * 有効かつキーが空でない行だけを集めて、JSON のもとになるオブジェクトを作る。
 * キーは前後の空白を落とし、値の解釈は {@link parseFieldValue} に任せる。
 * 同じキーの行が複数あるときは、後ろの行の値が残る。
 *
 * @param rows ボディフィールドの行。無効な行やキーが空の行が混ざっていてよい
 * @returns キーと値のオブジェクト。集める行が 1 つも無ければ空オブジェクト
 */
export function fieldsToObject(rows: HeaderRow[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const r of rows) {
    if (r.enabled && r.key.trim() !== "") obj[r.key.trim()] = parseFieldValue(r.value);
  }
  return obj;
}

/**
 * 実際に送るボディと、こちらで自動的に付け足すヘッダーを計算する。
 *
 * 送信も cURL 出力もこの関数を通すので、画面に出るコマンドと実際に飛ぶ
 * リクエストが必ず一致する。片方だけ直して食い違う事故を防ぐための共通化。
 *
 * 判定の順序は次のとおり。
 * 1. GET と HEAD はボディを持たないので、常に空を返す
 * 2. raw モードは入力をそのまま返す。ヘッダーの補完もしない
 * 3. fields モードで有効な行が 1 つもなければ空を返す（`{}` は送らない）
 * 4. fields モードでユーザーが Content-Type を指定していなければ
 *    `application/json` を補う。指定済みならそちらを尊重する
 *
 * @param draft 送信しようとしている Draft。`method` `bodyMode` `bodyFields` `body` `headers` を参照する
 * @returns `body` は送信するボディ文字列（空文字ならボディを送らない）、`autoHeaders` は自動的に付け足すヘッダー（補完不要なら空オブジェクト）
 */
export function buildPayload(draft: Draft): {
  body: string;
  autoHeaders: Record<string, string>;
} {
  const hasBody = draft.method !== "GET" && draft.method !== "HEAD";
  if (!hasBody) return { body: "", autoHeaders: {} };

  if (draft.bodyMode === "raw") {
    return { body: draft.body, autoHeaders: {} };
  }

  const active = draft.bodyFields.filter((r) => r.enabled && r.key.trim() !== "");
  if (active.length === 0) return { body: "", autoHeaders: {} };

  // ヘッダー名の大文字小文字は区別されないので、小文字に揃えてから探す。
  const hasContentType = draft.headers.some(
    (h) => h.enabled && h.key.trim().toLowerCase() === "content-type",
  );
  return {
    body: JSON.stringify(fieldsToObject(draft.bodyFields)),
    autoHeaders: hasContentType ? {} : { "Content-Type": "application/json" },
  };
}
