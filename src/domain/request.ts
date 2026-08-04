export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type Method = (typeof METHODS)[number];

/**
 * 接続を許可するオリジン。ユーザーに自由入力させず、この中から選ばせる。
 * `public/manifest.json` の `host_permissions` と対応させること。
 */
export const ORIGINS = [
  "http://localhost",
  "http://127.0.0.1",
  "https://localhost",
  "https://127.0.0.1",
] as const;

/**
 * ヘッダー行とボディフィールド行に共通の形。
 * `id` は React の key と、行の更新・削除の目印に使うもので、送信内容には含まれない。
 */
export type HeaderRow = { id: string; key: string; value: string; enabled: boolean };

/** 画面上で編集中のリクエスト定義。履歴も保存リクエストもこれを土台にしている。 */
export type Draft = {
  method: Method;
  origin: string;
  path: string;
  headers: HeaderRow[];
  bodyMode: "fields" | "raw";
  bodyFields: HeaderRow[];
  body: string;
};

/**
 * 空の行を 1 つ作る。ヘッダーにもボディフィールドにも使う。
 *
 * @returns 有効かつキーも値も空の行。id は毎回新しく振る
 */
export const newHeader = (): HeaderRow => ({
  id: crypto.randomUUID(),
  key: "",
  value: "",
  enabled: true,
});

/**
 * 初期状態の Draft。パスには開発でよく使うポートを置いてある。
 *
 * @returns `GET http://localhost:3000/` を指す、ヘッダーもボディも空の Draft
 */
export const emptyDraft = (): Draft => ({
  method: "GET",
  origin: ORIGINS[0],
  path: ":3000/",
  headers: [newHeader()],
  bodyMode: "fields",
  bodyFields: [newHeader()],
  body: "",
});

/**
 * ストレージやインポートファイルから読み込んだ Draft を、現在の形に整える。
 * 欠けている項目や型が合わない項目は初期値で補うので、戻り値は必ず全項目が揃う。
 *
 * v0.6 より前に保存された Draft には `bodyMode` と `bodyFields` がない。
 * その場合は、本文があれば raw モード、なければ fields モードとして開く。
 *
 * @param d 保存されていた Draft。項目が欠けていても、undefined や null でもよい
 * @returns 全項目が揃った Draft。`d` が無効なときは {@link emptyDraft} と同じもの
 */
export function normalizeDraft(d: Partial<Draft> | undefined | null): Draft {
  const base = emptyDraft();
  if (!d) return base;
  const body = typeof d.body === "string" ? d.body : "";
  return {
    method: (METHODS as readonly unknown[]).includes(d.method) ? (d.method as Method) : base.method,
    origin: typeof d.origin === "string" ? d.origin : base.origin,
    path: typeof d.path === "string" ? d.path : base.path,
    headers: Array.isArray(d.headers) && d.headers.length > 0 ? d.headers : [newHeader()],
    bodyMode:
      d.bodyMode === "raw" || d.bodyMode === "fields" ? d.bodyMode : body !== "" ? "raw" : "fields",
    bodyFields:
      Array.isArray(d.bodyFields) && d.bodyFields.length > 0 ? d.bodyFields : [newHeader()],
    body,
  };
}
