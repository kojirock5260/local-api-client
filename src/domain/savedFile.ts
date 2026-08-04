import { METHODS, normalizeDraft, ORIGINS } from "./request";
import { SAVED_LIMIT, type SavedRequest, savedKey } from "./saved";

/** 保存リクエストを受け渡しするためのエクスポートファイルの形。 */
export type SavedFile = {
  app: "local-api-client";
  version: 1;
  exportedAt: number;
  saved: SavedRequest[];
};

/**
 * 保存リクエストをエクスポートファイルの JSON 文字列にする。
 *
 * ヘッダーとボディはそのまま書き出される。認証トークンなどを書いていれば
 * ファイルにも平文で残るので、共有するときは中身を確認すること。
 *
 * @param items 書き出す保存リクエスト。並び順はそのまま保たれる
 * @param now 書き出し時刻。テストから固定できるようにしてある
 * @returns インデント 2 で整形した JSON 文字列。差分を見やすくするため 1 行にはしない
 */
export function serializeSaved(items: SavedRequest[], now: number = Date.now()): string {
  const file: SavedFile = { app: "local-api-client", version: 1, exportedAt: now, saved: items };
  return JSON.stringify(file, null, 2);
}

/**
 * インポートファイルを検証して、保存リクエストの配列に変換する。
 *
 * 1 件でも不正な項目があれば、その場で例外を投げて 1 件も取り込まない。
 * 途中まで取り込んで中途半端な状態を作らないため。
 *
 * @param text 読み込んだファイルの中身
 * @returns 検証を通った保存リクエストの配列。id は振り直されている。
 *   `saved` が空配列のファイルなら空配列
 * @throws JSON として読めないとき、このアプリのエクスポートファイルでないとき、
 *   および各エントリの検証に失敗したとき（{@link sanitize} を参照）
 */
export function parseSavedFile(text: string): SavedRequest[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Not a valid JSON file.");
  }
  const f = raw as Partial<SavedFile>;
  if (f?.app !== "local-api-client" || !Array.isArray(f.saved)) {
    throw new Error("Not a Local API Client export file.");
  }
  return f.saved.map(sanitize);
}

/**
 * エクスポートファイルの 1 エントリを検証して {@link SavedRequest} に変換する。
 *
 * origin は文字列の形を見るのではなく、`ORIGINS` に含まれるかどうかで判定する。
 * 細工したファイルを読ませて外部ホストへ送信させる手口を、ここで止めるため。
 * 送信時にも `buildUrl` が同じ判定をするので、防御は二重になっている。
 *
 * ヘッダーとボディフィールドは、壊れている行だけを黙って捨てる。
 * 名前やオリジンと違って、行が 1 つ欠けても危険にはならないため。
 *
 * id は取り込み側で振り直す。書き出し元の id をそのまま使うと、
 * 手元にある別の保存リクエストと衝突するおそれがあるため。
 *
 * @param s ファイルから読んだ 1 エントリ。形は一切保証されていない
 * @param i エラーメッセージに出すための、0 起点の位置
 * @returns 検証と補完を済ませた保存リクエスト。id は新しく振り直す
 * @throws 名前・メソッド・オリジン・パス・ボディのいずれかが不正なとき
 */
function sanitize(s: unknown, i: number): SavedRequest {
  /**
   * エラーメッセージに何件目かを添える。
   *
   * @param msg 何が不正だったかの説明
   * @returns 位置を前置きした Error。投げるのは呼び出し側
   */
  const fail = (msg: string) => new Error(`Entry ${i + 1}: ${msg}`);
  const e = s as Record<string, unknown>;
  if (typeof e?.name !== "string" || e.name.trim() === "") throw fail("missing name.");
  if (!(METHODS as readonly unknown[]).includes(e.method)) throw fail("invalid method.");
  if (!(ORIGINS as readonly unknown[]).includes(e.origin)) {
    throw fail("origin must be localhost or 127.0.0.1.");
  }
  if (typeof e.path !== "string" || typeof e.body !== "string") throw fail("invalid path or body.");

  // enabled は省略されていたら有効とみなす（false と明示されたときだけ無効）。
  const headers = Array.isArray(e.headers)
    ? e.headers
        .filter(
          (h): h is { key: string; value: string; enabled?: unknown } =>
            typeof (h as Record<string, unknown>)?.key === "string" &&
            typeof (h as Record<string, unknown>)?.value === "string",
        )
        .map((h) => ({
          id: crypto.randomUUID(),
          key: h.key,
          value: h.value,
          enabled: h.enabled !== false,
        }))
    : [];

  // 配列そのものが無いときは undefined を渡す。normalizeDraft が空行 1 つで補ってくれる。
  const bodyFields = Array.isArray(e.bodyFields)
    ? e.bodyFields
        .filter(
          (h): h is { key: string; value: string; enabled?: unknown } =>
            typeof (h as Record<string, unknown>)?.key === "string" &&
            typeof (h as Record<string, unknown>)?.value === "string",
        )
        .map((h) => ({
          id: crypto.randomUUID(),
          key: h.key,
          value: h.value,
          enabled: h.enabled !== false,
        }))
    : undefined;

  return {
    // 古い形式のファイルも読めるよう、Draft 部分は normalizeDraft に通す。
    ...normalizeDraft({
      method: e.method as SavedRequest["method"],
      origin: e.origin as string,
      path: e.path as string,
      headers,
      bodyMode: e.bodyMode as SavedRequest["bodyMode"],
      bodyFields,
      body: e.body as string,
    }),
    id: crypto.randomUUID(),
    name: (e.name as string).trim(),
    group:
      typeof e.group === "string" && e.group.trim() !== "" ? (e.group as string).trim() : undefined,
    updatedAt: typeof e.updatedAt === "number" ? e.updatedAt : Date.now(),
  };
}

/**
 * 取り込んだエントリを、いま手元にある一覧に統合する。
 *
 * 同じキー（グループ + 名前）があれば中身を差し替え、なければ先頭に足す。
 * 差し替えのときは手元の id を残すので、画面が参照している id はずれない。
 * 上限を超えた分は末尾（古いもの）から切り捨てる。
 *
 * 切り捨ては全件を統合し終えたあとに 1 度だけ行う。
 * 途中で切ると、後ろのほうのエントリが理由もなく落ちてしまうため。
 *
 * @param current いま手元にある保存一覧
 * @param incoming 取り込むエントリ。{@link parseSavedFile} を通したもの
 * @param opts 上限を差し替えるための差し込み口。省略時は {@link SAVED_LIMIT}
 * @returns 統合後の一覧と、追加・更新それぞれの件数（トーストの表示に使う）。
 *   件数は切り捨て前に数えた値。追加分は先頭に積まれるので普通は残るが、
 *   取り込んだ件数そのものが上限を超えると、その分は落ちて `added` と食い違う
 */
export function mergeSaved(
  current: SavedRequest[],
  incoming: SavedRequest[],
  opts: { limit?: number } = {},
): { items: SavedRequest[]; added: number; updated: number } {
  const { limit = SAVED_LIMIT } = opts;
  let items = [...current];
  let added = 0;
  let updated = 0;
  for (const inc of incoming) {
    const key = savedKey(inc.group, inc.name);
    const idx = items.findIndex((x) => savedKey(x.group, x.name) === key);
    if (idx >= 0) {
      items[idx] = { ...inc, id: items[idx].id };
      updated++;
    } else {
      items = [inc, ...items];
      added++;
    }
  }
  return { items: items.slice(0, limit), added, updated };
}
