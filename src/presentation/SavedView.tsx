import { useRef, useState } from "preact/hooks";
import type { Draft } from "../domain/request";
import { groupSaved, SAVED_LIMIT, type SavedRequest } from "../domain/saved";
import { serializeSaved } from "../domain/savedFile";
import { ago } from "./format";

/** {@link SavedView} に渡す値。 */
type Props = {
  items: SavedRequest[];
  onLoad: (d: Draft) => void;
  onDelete: (id: string) => void;
  onImport: (text: string) => void;
};

/**
 * 保存リクエストの一覧。グループごとに折りたためる。
 * ファイルの書き出しと取り込みの入口もここに置いている。
 *
 * @returns 保存の一覧。1 件も無いときも、取り込みができるようツールバーは出す
 */
export default function SavedView({ items, onLoad, onDelete, onImport }: Props) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * グループの開閉を切り替える。
   *
   * @param key グループ名、または未分類を表す内部キー
   */
  function toggleGroup(key: string) {
    setClosed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /**
   * 保存リクエストをまとめて JSON ファイルに書き出す。
   *
   * ヘッダーとボディがそのまま入るので、書き出したファイルの扱いには注意がいる
   * （ボタンの title にも同じ注意を出している）。
   *
   * 拡張に downloads 権限を足したくないので、Blob と `<a>` の click で落とす。
   */
  function exportFile() {
    const blob = new Blob([serializeSaved(items)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    // 同じ日に何度も書き出したときに上書きされないよう、日付をファイル名に入れる。
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    a.href = url;
    a.download = `local-api-client-saved-${stamp}.json`;
    a.click();

    // 使い終わった URL を解放しないと、パネルを開いている間ずっとメモリに残る。
    URL.revokeObjectURL(url);
  }

  /**
   * 選んだファイルを読んで取り込みを依頼する。中身の検証は App 側に任せる。
   *
   * @param file ファイル選択で選ばれたファイル
   * @returns 読み込みと取り込みの依頼が終わると解決する Promise
   */
  async function importFile(file: File) {
    onImport(await file.text());
  }

  // 一覧が空のときも出したいので、変数に切り出して両方の分岐で使う。
  const toolbar = (
    <div className="toolbar">
      <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
        Import
      </button>
      {items.length > 0 && (
        <button
          type="button"
          className="ghost"
          onClick={exportFile}
          title="Headers and bodies are included as-is"
        >
          Export
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) importFile(f);
          // 同じファイルを続けて選んでも change が起きるよう、値を空に戻す。
          e.currentTarget.value = "";
        }}
      />
    </div>
  );

  if (items.length === 0) {
    return (
      <section className="card">
        {toolbar}
        <div className="empty">
          Save a request with the “Save” button to keep it here.
          <br />
          <span className="note">Keeps up to {SAVED_LIMIT} · oldest are removed.</span>
        </div>
      </section>
    );
  }

  const grouped = groupSaved(items);

  // グループが 1 つも無いときは見出しを出さない。全部が「Ungrouped」の下に
  // ぶら下がるだけになり、階層が意味を持たないため。
  const hasGroups = grouped.some(([g]) => g !== undefined);

  return (
    <section className="card list">
      {toolbar}
      {grouped.map(([g, members]) => {
        // 未分類のかたまりにも React の key と開閉状態の目印が要る。
        // グループ名には現れない \u0000 で始めて、実在するグループ名との衝突を避ける。
        const key = g ?? "\u0000ungrouped";
        const isClosed = closed.has(key);
        return (
          <div key={key}>
            {hasGroups && (
              <button
                type="button"
                className="groupheader"
                onClick={() => toggleGroup(key)}
                aria-expanded={!isClosed}
              >
                <span className={isClosed ? "jarr" : "jarr jopen"}>▶</span>
                <span className="gname">{g ?? "Ungrouped"}</span>
                <span className="count">{members.length}</span>
              </button>
            )}
            {!isClosed &&
              members.map((s) => (
                <div className="item" key={s.id}>
                  <button
                    type="button"
                    className="itemmain saveditem"
                    onClick={() => onLoad(s)}
                    title="Load into editor"
                  >
                    <span className="iname">{s.name}</span>
                    <span className={`imethod mono m-${s.method}`}>{s.method}</span>
                    <span className="ipath mono">{s.path || "/"}</span>
                    <span className="iago">{ago(s.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onDelete(s.id)}
                    aria-label="Delete saved request"
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        );
      })}
      <div className="listfoot">
        <span className="note">Keeps up to {SAVED_LIMIT} · oldest are removed.</span>
      </div>
    </section>
  );
}
