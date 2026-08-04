import type { Draft } from "./request";

/** 保存リクエストの保持件数。これを超えると古いものから自動的に消える。 */
export const SAVED_LIMIT = 30;

/** ユーザーが名前を付けて明示的に保存したリクエスト。 */
export type SavedRequest = Draft & {
  id: string;
  name: string;
  group?: string;
  updatedAt: number;
};

/**
 * 保存リクエストの同一性を決めるキー。グループ名と名前の組で判断するので、
 * 別グループにある同じ名前は別物として扱われる。
 *
 * 区切りに `\u0000` を使うのは、入力に現れない文字だから。
 * ハイフンのような普通の文字で区切ると、`"a"` + `"b-c"` と `"a-b"` + `"c"` が
 * 同じキーになってしまい、無関係な保存を上書きしてしまう。
 *
 * @param group グループ名。未分類のときは undefined か空文字（どちらも同じ扱い）
 * @param name 保存リクエストの名前
 * @returns 比較専用の文字列。前後の空白を落としてあるので、`" api "` と `"api"` は同じキーになる。表示には使わない
 */
export function savedKey(group: string | undefined, name: string): string {
  return `${(group ?? "").trim()}\u0000${name.trim()}`;
}

/** テストから時刻・id・上限を固定するための差し込み口。省略時は実際の値を使う。 */
type Options = { now?: number; id?: string; limit?: number };

/**
 * 同じキー（グループ + 名前）の保存があれば中身を差し替え、なければ先頭に足す。
 * 渡された配列は書き換えない。
 *
 * 差し替えのときは既存の id を引き継ぐ。id を振り直すと、
 * その id を見ている画面側の状態（選択位置など）とずれるため。
 * 新規追加で上限を超えた分は、末尾（古いもの）から切り捨てる。
 *
 * @param items いまの保存一覧
 * @param draft 保存する内容。複製して積むので、呼び出し側はそのまま使い続けてよい
 * @param name 保存リクエストの名前。前後の空白は落として保存する
 * @param group 空文字や空白だけのときは「グループなし」として undefined に寄せる
 * @param opts テスト用の差し込み口。省略時は現在時刻・新しい UUID・{@link SAVED_LIMIT}
 * @returns 差し替えまたは追加を反映した、新しい配列
 */
export function upsertSaved(
  items: SavedRequest[],
  draft: Draft,
  name: string,
  group?: string,
  opts: Options = {},
): SavedRequest[] {
  const { now = Date.now(), id, limit = SAVED_LIMIT } = opts;
  const g = group?.trim() ? group.trim() : undefined;
  const key = savedKey(g, name);
  const existing = items.find((x) => savedKey(x.group, x.name) === key);
  const entry: SavedRequest = {
    // 参照のまま持つと、あとで編集中の Draft を触ったときに保存済みの中身まで変わる。
    ...structuredClone(draft),
    id: existing?.id ?? id ?? crypto.randomUUID(),
    name: name.trim(),
    group: g,
    updatedAt: now,
  };
  return existing
    ? items.map((x) => (x.id === existing.id ? entry : x))
    : [entry, ...items].slice(0, limit);
}

/**
 * 画面に並べるため、グループごとにまとめ直す。
 *
 * グループ名は昇順（`localeCompare`）に並べ、未分類のかたまりは最後に置く。
 * 未分類が 1 件もないときは、そのかたまり自体を含めない。
 * グループの中の順番は、渡された配列のままにする（新しい順を保つため）。
 *
 * @param items 保存一覧。新しい順に並んでいることを前提にする
 * @returns `[グループ名, その中の保存リクエスト]` の配列。未分類のグループ名は undefined。`items` が空なら空配列
 */
export function groupSaved(items: SavedRequest[]): [string | undefined, SavedRequest[]][] {
  const map = new Map<string, SavedRequest[]>();
  const ungrouped: SavedRequest[] = [];
  for (const s of items) {
    if (!s.group) {
      ungrouped.push(s);
      continue;
    }
    if (!map.has(s.group)) map.set(s.group, []);
    map.get(s.group)!.push(s);
  }
  const out: [string | undefined, SavedRequest[]][] = [...map.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  if (ungrouped.length > 0) out.push([undefined, ungrouped]);
  return out;
}
