import { useState } from "preact/hooks";
import { savedKey } from "../domain/saved";

/** {@link SaveDialog} に渡す値。 */
type Props = {
  defaultName: string;
  groups: string[];
  savedKeys: string[];
  onCancel: () => void;
  onSave: (name: string, group: string) => void;
};

/**
 * 保存ダイアログ。
 *
 * グループは既存のものから選ぶのが既定。「New」を押すと入力欄に切り替わり、
 * Add で作成して選択、× で一覧に戻る。まだグループが 1 つも無いときは
 * 最初から入力欄を出す（選ぶものが無い一覧を見せても仕方がないため）。
 *
 * Enter で確定、Escape で取り消し。狭いパネルでマウスに持ち替えずに済むよう、
 * どちらの入力欄でもキーボードだけで進められるようにしてある。
 *
 * @returns 画面を覆うオーバーレイとダイアログ。閉じる判断は親が持つので、
 *   このコンポーネント自身は null を返さない
 */
export default function SaveDialog({ defaultName, groups, savedKeys, onCancel, onSave }: Props) {
  const [name, setName] = useState(defaultName);
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"select" | "new">(groups.length === 0 ? "new" : "select");
  const [newGroup, setNewGroup] = useState("");
  const [extraGroups, setExtraGroups] = useState<string[]>([]);
  const allGroups = [...new Set([...groups, ...extraGroups])].sort((a, b) => a.localeCompare(b));
  const canGoBack = allGroups.length > 0;
  const overwriting = savedKeys.includes(savedKey(selected, name));

  /**
   * 入力されたグループ名を候補に足して、それを選択した状態にする。
   * すでに同じ名前があるときは候補を増やさず、その既存のグループを選ぶ。
   *
   * 空のまま押したときは何も作らない。戻れる一覧があれば戻り、
   * 無ければ入力欄に留まる（空の一覧を見せても選ぶものが無いため）。
   */
  function addGroup() {
    const g = newGroup.trim();
    if (g === "") {
      if (canGoBack) setMode("select");
      return;
    }
    if (!allGroups.includes(g)) setExtraGroups((x) => [...x, g]);
    setSelected(g);
    setNewGroup("");
    setMode("select");
  }

  /** 名前が空でなければ保存を依頼する。空のときは何も起きない（ボタンも無効にしてある）。 */
  function confirm() {
    const n = name.trim();
    if (n === "") return;
    onSave(n, selected);
  }

  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-label="Save request">
        <div className="dialogtitle">Save request</div>

        <label className="field">
          <span className="fieldlabel">Name</span>
          {/* 意図的な autofocus。この入力欄が保存操作の入口なので、開いた直後から名前を打ち始められるようにしている。biome.json で noAutofocus を無効にしてあるのはこのため。 */}
          <input
            className="mono"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm();
              if (e.key === "Escape") onCancel();
            }}
            placeholder="Request name"
            autoFocus
            spellcheck={false}
          />
        </label>

        <div className="field">
          <span className="fieldlabel">
            Group <span className="optional">(optional)</span>
          </span>
          {mode === "select" ? (
            <div className="grouprow">
              <select value={selected} onChange={(e) => setSelected(e.currentTarget.value)}>
                <option value="">No group</option>
                {allGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <button type="button" className="btn" onClick={() => setMode("new")}>
                New
              </button>
            </div>
          ) : (
            <div className="grouprow">
              {/* New を押した直後にそのまま打ち始められるよう autofocus を付けている。 */}
              <input
                className="mono"
                value={newGroup}
                onInput={(e) => setNewGroup(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addGroup();
                  if (e.key === "Escape" && canGoBack) setMode("select");
                }}
                placeholder="New group (optional)"
                autoFocus
                spellcheck={false}
              />
              <button type="button" className="btn" onClick={addGroup}>
                Add
              </button>
              {/* × は「一覧に戻る」ボタン。戻る先の一覧が無いとき（既存グループが
                  1 つも無く、最初から入力欄で開いているとき）は出さない。
                  押しても何も起きないボタンを置くと、意味を探させてしまう。 */}
              {canGoBack && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setMode("select")}
                  aria-label="Back to group list"
                >
                  ×
                </button>
              )}
            </div>
          )}
        </div>

        <div className="dialogfoot">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="send" onClick={confirm} disabled={name.trim() === ""}>
            {overwriting ? "Overwrite" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
