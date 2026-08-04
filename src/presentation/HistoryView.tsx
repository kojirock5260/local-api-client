import { HISTORY_LIMIT, type HistoryEntry, type StoredResponse } from "../domain/history";
import type { Draft } from "../domain/request";
import { ago, statusClass } from "./format";

/** {@link HistoryView} に渡す値。 */
type Props = {
  entries: HistoryEntry[];
  onLoad: (d: Draft, response?: StoredResponse) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
};

/**
 * 履歴の一覧。
 *
 * 状態は持たず、表示と通知だけを受け持つ。削除や読み込みの実処理は App 側。
 *
 * 送信に失敗した行はステータスが null で入っているので、`ERR` と表示する。
 * 「送ったが失敗した」ことも記録として残したいので、行自体は消さない。
 *
 * @returns 履歴の一覧。1 件も無いときは案内文だけのカード
 */
export default function HistoryView({ entries, onLoad, onDelete, onClear }: Props) {
  if (entries.length === 0) {
    return (
      <section className="card">
        <div className="empty">
          Requests you send will show up here.
          <br />
          <span className="note">Keeps the last {HISTORY_LIMIT} · older ones are removed.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="card list">
      {entries.map((e) => (
        <div className="item" key={e.id}>
          <button
            type="button"
            className="itemmain"
            onClick={() => onLoad(e, e.response)}
            title="Load into editor"
          >
            <span className={`imethod mono m-${e.method}`}>{e.method}</span>
            {/* パスが空のときは、行が詰まって見えないよう "/" を置く。 */}
            <span className="ipath mono">{e.path || "/"}</span>
            <span className={`istatus mono ${e.status === null ? "serr" : statusClass(e.status)}`}>
              {e.status ?? "ERR"}
            </span>
            <span className="iago">{ago(e.at)}</span>
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => onDelete(e.id)}
            aria-label="Delete entry"
          >
            ×
          </button>
        </div>
      ))}
      <div className="listfoot">
        <span className="note">Keeps the last {HISTORY_LIMIT} · older ones are removed.</span>
        <button type="button" className="ghost" onClick={onClear}>
          Clear history
        </button>
      </div>
    </section>
  );
}
