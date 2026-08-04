import { useEffect, useRef, useState } from "preact/hooks";
import { load, save } from "../application/storage";
import {
  fromStoredResponse,
  type HistoryEntry,
  pushHistory,
  type StoredResponse,
} from "../domain/history";
import { type Draft, emptyDraft, normalizeDraft } from "../domain/request";
import type { ResponseData } from "../domain/response";
import { type SavedRequest, savedKey, upsertSaved } from "../domain/saved";
import { mergeSaved, parseSavedFile } from "../domain/savedFile";
import HistoryView from "./HistoryView";
import RequestView from "./RequestView";
import SavedView from "./SavedView";
import Toasts, { type ToastItem, type ToastKind } from "./Toast";

/** 上部のタブで切り替わる画面。 */
type View = "request" | "history" | "saved";

/**
 * 画面全体の入れ物。
 *
 * Draft・履歴・保存リクエストの状態と、ストレージへの読み書きをここに集めて、
 * 表示は各ビューに任せる。ビュー側が直接ストレージを触らないようにしているのは、
 * 保存のタイミングを 1 か所で把握できるようにするため。
 *
 * @returns ヘッダー・タブ・選択中のビュー・トースト・フッターを積んだ画面全体
 */
export default function App() {
  const [view, setView] = useState<View>("request");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [saved, setSaved] = useState<SavedRequest[]>([]);

  // 履歴や保存から読み込むたびに増やす値。RequestView の key に渡している。
  // key が変わると作り直されるので、前に表示していたレスポンスが消える。
  // これが無いと、別のリクエストを読み込んだのに前の結果が残り、
  // その結果が今のリクエストのものだと誤読させてしまう。
  const [loadCount, setLoadCount] = useState(0);

  // 履歴から読み込んだレスポンス。作り直した RequestView の初期表示に渡す。
  // 保存リクエストから読み込んだときや、まだ何も読み込んでいないときは undefined。
  const [loadedResponse, setLoadedResponse] = useState<ResponseData | undefined>(undefined);

  // 読み込みが終わるまで true にしない。false の間は保存も走らせない。
  // 空の初期状態をそのまま書き戻して、既存のデータを消してしまうのを防ぐため。
  const [ready, setReady] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // 保存が失敗し続けているあいだ true。同じ知らせを何度も出さないための目印。
  // 再描画のたびに戻ってほしくないので state ではなく ref に置く。
  const saveFailedRef = useRef(false);

  /**
   * トーストを 1 件出す。3 秒後に自動で消える。
   *
   * @param message 表示する文言
   * @param kind 見た目の種類。省略時は `info`
   */
  function notify(message: string, kind: ToastKind = "info") {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }

  /**
   * ストレージへ書き、失敗したらトーストで知らせる。
   *
   * `save` の Promise を放置すると、quota を超えたときに書き込みが拒否されても
   * 画面には何も出ず、保存されていないことに気づけない。
   *
   * ただし Draft の保存は入力のたびに走るので、失敗が続くとトーストが積み上がる。
   * そのため知らせるのは「成功していた状態から失敗に変わったとき」の 1 回だけにして、
   * 書けるようになったらまた知らせられる状態に戻す。
   *
   * @param key ストレージのキー
   * @param value 保存する値
   */
  function persist(key: string, value: unknown) {
    save(key, value)
      .then(() => {
        saveFailedRef.current = false;
      })
      .catch(() => {
        if (saveFailedRef.current) return;
        saveFailedRef.current = true;
        notify("Could not save. Storage may be full.", "danger");
      });
  }

  // 起動時に Draft・履歴・保存リクエストを復元する。
  // Draft だけ normalizeDraft を通すのは、古い形式で保存されている可能性があるため。
  useEffect(() => {
    (async () => {
      const [d, h, s] = await Promise.all([
        load<Draft>("editor", emptyDraft()),
        load<HistoryEntry[]>("history", []),
        load<SavedRequest[]>("saved", []),
      ]);
      setDraft(normalizeDraft(d));
      setHistory(h);
      setSaved(s);
      setReady(true);
    })();
  }, []);

  // Draft の自動保存。パネルを閉じても編集内容が残るようにする。
  // 1 文字打つたびに書くと重いので、300ms 待ってからまとめて書く。
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => persist("editor", draft), 300);
    return () => clearTimeout(t);
  }, [draft, ready]);

  // 履歴と保存リクエストは、送信や保存の操作をしたときにしか変わらない。
  // 連続で書き込まれることがないので、Draft と違って遅延させずにそのまま書く。
  useEffect(() => {
    if (ready) persist("history", history);
  }, [history, ready]);

  useEffect(() => {
    if (ready) persist("saved", saved);
  }, [saved, ready]);

  /**
   * 送信が終わるたびに呼ばれ、履歴に 1 件足す。
   * レスポンスは本文を切り詰めたうえで一緒に残す（{@link HistoryEntry} を参照）。
   *
   * @param result 送信結果。失敗・中断のときは status と timeMs が null で、
   *   `response` は入らない
   */
  function recordHistory(result: {
    status: number | null;
    timeMs: number | null;
    response?: StoredResponse;
  }) {
    setHistory((h) => pushHistory(h, draft, result));
  }

  /**
   * インポートファイルを検証して取り込む。
   * 検証で弾かれた理由をユーザーに伝えたいので、例外はここで受けてトーストに出す。
   *
   * @param text 読み込んだファイルの中身
   */
  function importSaved(text: string) {
    try {
      const incoming = parseSavedFile(text);
      const { items, added, updated } = mergeSaved(saved, incoming);
      setSaved(items);
      notify(`Imported: ${added} added, ${updated} updated`, "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Import failed.", "danger");
    }
  }

  /**
   * 現在の Draft に名前を付けて保存する。
   * 同じグループ + 名前がすでにあれば上書きになるので、トーストの文言を変えて知らせる。
   * 上書きかどうかは更新前の一覧で判定する必要があるため、setSaved より先に調べる。
   *
   * @param name 保存リクエストの名前
   * @param group グループ名。グループなしのときは空文字
   */
  function saveRequest(name: string, group: string) {
    const key = savedKey(group, name);
    const exists = saved.some((s) => savedKey(s.group, s.name) === key);
    setSaved((s) => upsertSaved(s, draft, name, group));
    notify(exists ? `Updated “${name.trim()}”` : `Saved “${name.trim()}”`, "success");
  }

  /**
   * 保存リクエストを 1 件消す。消したものの名前をトーストに出すため、先に控えておく。
   *
   * @param id 消す保存リクエストの id。存在しない id なら何も起きない
   */
  function deleteSaved(id: string) {
    const target = saved.find((s) => s.id === id);
    setSaved((s) => s.filter((e) => e.id !== id));
    if (target) notify(`Deleted “${target.name}”`, "danger");
  }

  /**
   * 履歴や保存から選んだ内容をエディタに読み込み、Request 画面に切り替える。
   *
   * 編集中の内容は確認なしで置き換わる。取り消せないが、Draft は自動保存されており
   * 元の内容も履歴に残っているので、確認を挟むほどの操作ではないと判断している。
   *
   * 複製してから渡すのは、エディタでの編集が履歴や保存済みの中身にまで
   * 及ばないようにするため。
   *
   * @param d 読み込む内容。{@link HistoryEntry} や {@link SavedRequest} を
   *   そのまま渡してよい（Draft 以外の項目は捨てられる）
   * @param response その時のレスポンス。履歴から読み込んだときだけ渡す。
   *   保存リクエストはレスポンスを持たないので省略される
   */
  function loadIntoEditor(d: Draft, response?: StoredResponse) {
    setLoadedResponse(response ? fromStoredResponse(response) : undefined);
    setDraft(normalizeDraft(structuredClone({ ...d })));
    // 表示中のレスポンスは、いま読み込んだリクエストのものではないので消す。
    setLoadCount((n) => n + 1);
    setView("request");
  }

  return (
    <div className="app">
      <header className="titlebar">
        <span className="logo">▸_</span>
        <h1>Local API Client</h1>
      </header>

      <div className="segment" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === "request"}
          className={view === "request" ? "seg active" : "seg"}
          onClick={() => setView("request")}
        >
          Request
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "history"}
          className={view === "history" ? "seg active" : "seg"}
          onClick={() => setView("history")}
        >
          History{history.length > 0 && <span className="count"> {history.length}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "saved"}
          className={view === "saved" ? "seg active" : "seg"}
          onClick={() => setView("saved")}
        >
          Saved{saved.length > 0 && <span className="count"> {saved.length}</span>}
        </button>
      </div>

      {/* Request 画面だけは、隠すときも display: none にしてマウントしたままにする。アンマウントすると送信中のリクエストと表示中のレスポンスが消えてしまい、送信のあいだに History を覗くといった使い方ができなくなるため。 */}
      <div className="view" style={view === "request" ? undefined : { display: "none" }}>
        <RequestView
          key={loadCount}
          initialResponse={loadedResponse}
          draft={draft}
          setDraft={setDraft}
          onSent={recordHistory}
          onSave={saveRequest}
          onNotify={notify}
          savedKeys={saved.map((s) => savedKey(s.group, s.name))}
          groups={[...new Set(saved.map((s) => s.group).filter((g): g is string => !!g))]}
        />
      </div>

      {view === "history" && (
        <HistoryView
          entries={history}
          onLoad={loadIntoEditor}
          onDelete={(id) => setHistory((h) => h.filter((e) => e.id !== id))}
          onClear={() => setHistory([])}
        />
      )}

      {view === "saved" && (
        <SavedView
          items={saved}
          onLoad={loadIntoEditor}
          onDelete={deleteSaved}
          onImport={importSaved}
        />
      )}

      <Toasts items={toasts} />

      <footer className="foot">
        No data leaves your machine · stored locally · localhost only
      </footer>
    </div>
  );
}
