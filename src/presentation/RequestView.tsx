import type { Dispatch, StateUpdater } from "preact/hooks";
import { useRef, useState } from "preact/hooks";
import { createSend, type Progress, TIMEOUT_MS } from "../application/sendRequest";
import { upsertHeader } from "../domain/auth";
import { fromCurl, toCurl } from "../domain/curl";
import { responseFilename } from "../domain/filename";
import { type StoredResponse, toStoredResponse } from "../domain/history";
import { formatJson, jsonError, looksLikeJson } from "../domain/json";
import {
  type Draft,
  type HeaderRow,
  METHODS,
  type Method,
  newHeader,
  ORIGINS,
} from "../domain/request";
import type { ResponseData } from "../domain/response";
import AuthDialog from "./AuthDialog";
import CurlDialog from "./CurlDialog";
import { downloadBlob } from "./download";
import { formatSize, statusClass } from "./format";
import JsonTree from "./JsonTree";
import SaveDialog from "./SaveDialog";

/** {@link RequestView} に渡す値。 */
type Props = {
  draft: Draft;
  setDraft: Dispatch<StateUpdater<Draft>>;
  onSent: (result: {
    status: number | null;
    timeMs: number | null;
    response?: StoredResponse;
  }) => void;
  initialResponse?: ResponseData;
  onSave: (name: string, group: string) => void;
  onNotify: (message: string, kind?: "info" | "success" | "danger") => void;
  savedKeys: string[];
  groups: string[];
};

/**
 * リクエストの編集と、レスポンスの表示。
 *
 * Draft は App が持っているが、レスポンスと送信中かどうかはこのコンポーネントの
 * 中だけで持つ。他の画面が使わない状態なので、上げても取り回しが増えるだけのため。
 *
 * ただしそのぶん、App 側でこのビューをアンマウントしてしまうと状態ごと消える。
 * タブを切り替えても消えないよう、App では display: none で隠している。
 *
 * @returns リクエストの編集カードとレスポンスのカード。
 *   保存ダイアログは開いているときだけ後ろに足す
 */
export default function RequestView({
  draft,
  setDraft,
  onSent,
  onSave,
  onNotify,
  savedKeys,
  groups,
  initialResponse,
}: Props) {
  const { method, origin, path, headers, body, bodyMode, bodyFields } = draft;

  const [reqTab, setReqTab] = useState<"headers" | "body">("headers");
  const [resTab, setResTab] = useState<"body" | "response" | "request">("body");
  const [sending, setSending] = useState(false);
  const [res, setRes] = useState<ResponseData | null>(initialResponse ?? null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [curlOpen, setCurlOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [resMode, setResMode] = useState<"tree" | "raw">("tree");

  // 受信の途中経過。送信中はここに届いた分が入り、完了すると res に置き換わる。
  // 中断やタイムアウトのあとも残しておき、途中まで届いた内容を見られるようにする。
  const [partial, setPartial] = useState<Progress | null>(null);

  // 途中経過の間引き用。チャンクごとに描画すると細かい応答で固まるので、
  // 最新の値だけ ref に控えておき、100ms に 1 回まとめて state に流す。
  const latestRef = useRef<Progress | null>(null);
  const flushRef = useRef<number | null>(null);

  // 送信中のリクエストを打ち切るための関数。送信していないときは null。
  // 再描画のたびに作り直したくないので state ではなく ref に置く。
  const cancelRef = useRef<(() => void) | null>(null);

  const hasBody = method !== "GET" && method !== "HEAD";

  // Raw ボディが JSON のつもりかどうか。先頭の文字か Content-Type で判断する。
  // XML やプレーンテキストを送りたい人に JSON の注意を出しても邪魔なだけなため。
  const rawIsJson =
    bodyMode === "raw" &&
    (looksLikeJson(body) ||
      headers.some(
        (h) =>
          h.enabled &&
          h.key.trim().toLowerCase() === "content-type" &&
          h.value.toLowerCase().includes("json"),
      ));
  const rawError = rawIsJson ? jsonError(body) : null;

  // 切れている本文は保存しない。途中までのファイルを完全なものと取り違えるため。
  const canDownload =
    res !== null && !res.truncated && (res.bodyText !== "" || (res.bytes?.size ?? 0) > 0);

  /** Raw ボディを整形する。読めない JSON なら何もしない（ボタンも無効にしてある）。 */
  function formatRaw() {
    const f = formatJson(body);
    if (f !== null) patch({ body: f });
  }

  /**
   * レスポンス本文をファイルに保存する。
   * 受信したままの生バイトがあればそれを使う。履歴から復元したものには無いので、文字列から作る。
   */
  function downloadBody() {
    if (!res) return;
    const ct = res.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
    const blob = res.bytes ?? new Blob([res.bodyText], { type: ct });
    downloadBlob(responseFilename(res.request.url, ct), blob);
  }

  /**
   * Draft の一部だけを差し替える。
   *
   * @param p 差し替えたい項目だけを持つオブジェクト
   */
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  /**
   * ヘッダー行を 1 つ書き換える。
   *
   * @param id 書き換える行の id
   * @param p 変えたい項目だけを持つオブジェクト
   */
  function updateHeader(id: string, p: Partial<HeaderRow>) {
    patch({ headers: headers.map((h) => (h.id === id ? { ...h, ...p } : h)) });
  }

  /**
   * ヘッダー行を 1 つ消す。
   * 最後の 1 行だけは消さずに空行へ戻す。行がゼロになると「+ Add header」以外に
   * 手がかりが無くなり、行を戻せたのか分からない見た目になるため。
   *
   * @param id 消す行の id
   */
  function removeHeader(id: string) {
    patch({ headers: headers.length > 1 ? headers.filter((h) => h.id !== id) : [newHeader()] });
  }

  /**
   * ボディフィールドを 1 つ書き換える。
   *
   * @param id 書き換える行の id
   * @param p 変えたい項目だけを持つオブジェクト
   */
  function updateBodyField(id: string, p: Partial<HeaderRow>) {
    patch({ bodyFields: bodyFields.map((f) => (f.id === id ? { ...f, ...p } : f)) });
  }

  /**
   * ボディフィールドを 1 つ消す。{@link removeHeader} と同じく、最後の 1 行は空行に戻す。
   *
   * @param id 消す行の id
   */
  function removeBodyField(id: string) {
    patch({
      bodyFields: bodyFields.length > 1 ? bodyFields.filter((f) => f.id !== id) : [newHeader()],
    });
  }

  /**
   * 受信の途中経過を受け取り、間引いて state に流す。
   *
   * @param p 最新の途中経過
   */
  function onProgress(p: Progress) {
    latestRef.current = p;
    if (flushRef.current !== null) return;
    flushRef.current = window.setTimeout(() => {
      flushRef.current = null;
      setPartial(latestRef.current);
    }, 100);
  }

  /** 間引きのタイマーを止め、控えていた途中経過を捨てる。 */
  function stopProgress() {
    if (flushRef.current !== null) {
      clearTimeout(flushRef.current);
      flushRef.current = null;
    }
    latestRef.current = null;
  }

  /**
   * リクエストを送り、結果を画面に反映する。
   *
   * 送信のたびに前回のレスポンスとエラーを先に消す。古い結果が残っていると、
   * 送信し直したのに前の内容を見て判断してしまうため。
   *
   * @returns 送信が終わり、画面への反映まで済むと解決する Promise。
   *   失敗しても例外は投げない
   */
  async function send() {
    setError(null);
    setRes(null);
    setPartial(null);
    setSending(true);

    const { promise, cancel } = createSend(draft, TIMEOUT_MS, onProgress);
    cancelRef.current = cancel;
    const outcome = await promise;
    cancelRef.current = null;
    // 完了後に遅れて届く途中経過は要らない。最後の値だけ控えてから止める。
    const last = latestRef.current;
    stopProgress();
    setSending(false);

    if (outcome.ok) {
      setPartial(null);
      setRes(outcome.data);
      // 前回 Response や Request のタブを見ていても、まずは本文に戻す。
      setResTab("body");
      onSent({
        status: outcome.data.status,
        timeMs: outcome.data.timeMs,
        response: toStoredResponse(outcome.data),
      });
      return;
    }

    // 中断やタイムアウトでも、途中まで届いた分は見せる。
    setPartial(last);
    setError(outcome.message);
    // URL が不正だった場合はリクエスト自体が飛んでいないので、履歴には残さない。
    // タイムアウトや接続失敗は「送ったが失敗した」ことなので記録する。
    if (outcome.reason !== "invalid") {
      onSent({ status: null, timeMs: null });
    }
  }

  /** 送信中のリクエストを打ち切る。送信していなければ何も起きない。 */
  function cancel() {
    cancelRef.current?.();
  }

  /**
   * レスポンス本文をクリップボードにコピーする。JSON なら整形済みのほうを渡す。
   *
   * @returns コピーが終わると解決する Promise。レスポンスが無いときは何もしない
   */
  async function copyBody() {
    if (!res) return;
    await navigator.clipboard.writeText(res.pretty ?? res.bodyText);
    onNotify("Copied response body");
  }

  /**
   * 現在の Draft を cURL コマンドにしてコピーする。
   * URL が不正なら toCurl が例外を投げるので、ここで受けてトーストに出す。
   *
   * @returns コピーが終わると解決する Promise。失敗しても例外は投げない
   */
  async function copyCurl() {
    try {
      await navigator.clipboard.writeText(toCurl(draft));
      onNotify("Copied as cURL");
    } catch (e) {
      onNotify(e instanceof Error ? e.message : "Invalid URL.", "danger");
    }
  }

  /**
   * 解釈済みの cURL を Draft に流し込む。
   * 表示中のレスポンスは前のリクエストのものなので消し、本文があれば Body タブを開く。
   *
   * @param next 取り込む Draft
   * @param warnings 落としたオプションなどの警告。あればトーストで知らせる
   */
  function applyImport(next: Draft, warnings: string[]) {
    setDraft(next);
    setRes(null);
    setError(null);
    setPartial(null);
    const hasPayload =
      next.bodyMode === "raw" ? next.body !== "" : next.bodyFields.some((f) => f.key.trim() !== "");
    const withBody = next.method !== "GET" && next.method !== "HEAD";
    setReqTab(withBody && hasPayload ? "body" : "headers");
    onNotify("Imported from cURL", "success");
    if (warnings.length > 0) onNotify(warnings.join(" · "));
  }

  /**
   * パス欄に cURL コマンドごと貼られたときに、パスではなくリクエスト全体として取り込む。
   *
   * @param text 貼られた文字列
   * @returns cURL として扱ったら true（失敗もトーストに出したうえで true）。
   *   cURL でなければ何もせず false
   */
  function pasteCurl(text: string): boolean {
    if (!/^\s*(\$\s*)?curl(\.exe)?\s/i.test(text)) return false;
    try {
      const { draft: next, warnings } = fromCurl(text);
      applyImport(next, warnings);
    } catch (e) {
      onNotify(e instanceof Error ? e.message : "Could not read this command.", "danger");
    }
    return true;
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 中の入力欄からバブルしてくるキー操作を 1 か所で拾うだけで、この div 自体は操作対象ではない
    <div
      className="reqview"
      onKeyDown={(e) => {
        // ダイアログの中の Enter はそのダイアログの確定に使うので、送信には回さない。
        if (dialogOpen || curlOpen || authOpen) return;
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !sending) {
          e.preventDefault();
          send();
        }
      }}
    >
      {/* リクエストの編集 */}
      <section className="card">
        <div className="urlrow">
          <select
            className={`method m-${method}`}
            value={method}
            onChange={(e) => patch({ method: e.currentTarget.value as Method })}
            aria-label="HTTP method"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <div className="urlbox">
            <select
              className="origin"
              value={origin}
              onChange={(e) => patch({ origin: e.currentTarget.value })}
              aria-label="Origin (locked to localhost)"
            >
              {ORIGINS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {/* テキスト入力は onChange ではなく onInput を使う。
                Preact の onChange はネイティブの change なので、フォーカスを外すまで
                発火しない（React は内部で input にマップするため 1 文字ごとに発火する）。
                onChange のままだと打っている最中に Draft が更新されず、
                自動保存も cURL コピーも古い値のままになる。
                select とチェックボックスは change で正しく発火するのでそのままでよい。 */}
            <input
              className="path mono"
              value={path}
              onInput={(e) => patch({ path: e.currentTarget.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !sending) send();
              }}
              onPaste={(e) => {
                if (pasteCurl(e.clipboardData?.getData("text") ?? "")) e.preventDefault();
              }}
              placeholder=":3000/api/users"
              spellcheck={false}
              aria-label="Port and path"
            />
          </div>
        </div>

        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={reqTab === "headers"}
            className={reqTab === "headers" ? "tab active" : "tab"}
            onClick={() => setReqTab("headers")}
          >
            Headers
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={reqTab === "body"}
            className={reqTab === "body" ? "tab active" : "tab"}
            onClick={() => setReqTab("body")}
            disabled={!hasBody}
            title={hasBody ? undefined : `${method} has no body`}
          >
            Body
          </button>
          <div className="spacer" />
          <button type="button" className="btn" onClick={copyCurl} title="Copy as cURL command">
            cURL
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setCurlOpen(true)}
            title="Paste a cURL command to load it"
            disabled={sending}
          >
            Paste
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setDialogOpen(true)}
            disabled={sending}
          >
            Save
          </button>
          {sending ? (
            <button type="button" className="send cancel" onClick={cancel}>
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className="send"
              onClick={send}
              title="Enter in the path field, or Cmd/Ctrl+Enter anywhere"
            >
              Send ↵
            </button>
          )}
        </div>

        {reqTab === "headers" && (
          <div className="headers">
            {headers.map((h) => (
              <div className="hrow" key={h.id}>
                <input
                  type="checkbox"
                  checked={h.enabled}
                  onChange={(e) => updateHeader(h.id, { enabled: e.currentTarget.checked })}
                  aria-label="Enable header"
                />
                <input
                  className="mono"
                  value={h.key}
                  onInput={(e) => updateHeader(h.id, { key: e.currentTarget.value })}
                  placeholder="Content-Type"
                  spellcheck={false}
                />
                <input
                  className="mono"
                  value={h.value}
                  onInput={(e) => updateHeader(h.id, { value: e.currentTarget.value })}
                  placeholder="application/json"
                  spellcheck={false}
                />
                <button
                  type="button"
                  className="ghost"
                  onClick={() => removeHeader(h.id)}
                  aria-label="Remove header"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="hfoot">
              <button
                type="button"
                className="ghost add"
                onClick={() => patch({ headers: [...headers, newHeader()] })}
              >
                + Add header
              </button>
              <button
                type="button"
                className="ghost add"
                onClick={() => setAuthOpen(true)}
                title="Set an Authorization header (Bearer or Basic)"
              >
                Auth…
              </button>
              <div className="spacer" />
              {/* 既定はオフ。オンにすると Chrome が持つ localhost の Cookie が付き、
                  レスポンスの Set-Cookie も Chrome に保存される。 */}
              <label
                className="cookies"
                title="Send the cookies Chrome holds for localhost. Responses may also set cookies in Chrome."
              >
                <input
                  type="checkbox"
                  checked={draft.cookies}
                  onChange={(e) => patch({ cookies: e.currentTarget.checked })}
                />
                Send cookies
              </label>
            </div>
          </div>
        )}

        {reqTab === "body" && hasBody && (
          <>
            <div className="subtabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={bodyMode === "fields"}
                className={bodyMode === "fields" ? "subtab active" : "subtab"}
                onClick={() => patch({ bodyMode: "fields" })}
              >
                Fields
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bodyMode === "form"}
                className={bodyMode === "form" ? "subtab active" : "subtab"}
                onClick={() => patch({ bodyMode: "form" })}
              >
                Form
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bodyMode === "raw"}
                className={bodyMode === "raw" ? "subtab active" : "subtab"}
                onClick={() => patch({ bodyMode: "raw" })}
              >
                Raw
              </button>
            </div>

            {/* Fields と Form は同じ行を使う。エンコードの違いは buildPayload が吸収する。 */}
            {(bodyMode === "fields" || bodyMode === "form") && (
              <div className="headers">
                {bodyFields.map((f) => (
                  <div className="hrow" key={f.id}>
                    <input
                      type="checkbox"
                      checked={f.enabled}
                      onChange={(e) => updateBodyField(f.id, { enabled: e.currentTarget.checked })}
                      aria-label="Enable field"
                    />
                    <input
                      className="mono"
                      value={f.key}
                      onInput={(e) => updateBodyField(f.id, { key: e.currentTarget.value })}
                      placeholder="name"
                      spellcheck={false}
                    />
                    <input
                      className="mono"
                      value={f.value}
                      onInput={(e) => updateBodyField(f.id, { value: e.currentTarget.value })}
                      placeholder={bodyMode === "form" ? "sato" : '"sato" / 30 / true'}
                      spellcheck={false}
                    />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => removeBodyField(f.id)}
                      aria-label="Remove field"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="ghost add"
                  onClick={() => patch({ bodyFields: [...bodyFields, newHeader()] })}
                >
                  + Add field
                </button>
                <span className="note">
                  {bodyMode === "form"
                    ? "Sent as application/x-www-form-urlencoded. Values are sent as strings; repeated keys are kept."
                    : "Sent as JSON. Values parse as JSON when possible, otherwise as strings."}
                </span>
              </div>
            )}

            {bodyMode === "raw" && (
              <>
                <textarea
                  className="body mono"
                  value={body}
                  onInput={(e) => patch({ body: e.currentTarget.value })}
                  placeholder='{"name": "test"}'
                  spellcheck={false}
                  rows={6}
                />
                {rawIsJson && (
                  <div className="rawfoot">
                    {rawError !== null && (
                      <span className="note bad">Invalid JSON: {rawError}</span>
                    )}
                    <div className="spacer" />
                    <button
                      type="button"
                      className="ghost add"
                      onClick={formatRaw}
                      disabled={rawError !== null || body.trim() === ""}
                      title="Pretty-print the JSON body"
                    >
                      Format
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>

      {/* レスポンスの表示 */}
      <section className="card response">
        {error && <div className="error">{error}</div>}

        {!error && !res && !sending && (
          <div className="empty">Send a request to see the response here.</div>
        )}

        {sending && !partial && <div className="empty">Waiting for response…</div>}

        {/* 受信中の途中経過。中断やタイムアウトのあとも、届いた分はそのまま残す。 */}
        {partial && (
          <>
            <div className="statusline">
              <span className={`status ${statusClass(partial.status)}`}>
                {partial.status} {partial.statusText}
              </span>
              <span className="meta">{sending ? "receiving…" : "stopped"}</span>
              <span className="meta">{formatSize(partial.size)}</span>
              {partial.truncated && (
                <span
                  className="meta trunc"
                  title="Body was too large; only the first part is shown"
                >
                  truncated
                </span>
              )}
            </div>
            <pre className="resbody mono">
              {partial.bodyText === "" ? "(no body yet)" : partial.bodyText}
            </pre>
          </>
        )}

        {res && (
          <>
            <div className="statusline">
              <span className={`status ${statusClass(res.status)}`}>
                {res.status} {res.statusText}
              </span>
              <span className="meta">{res.timeMs} ms</span>
              <span className="meta">{formatSize(res.size)}</span>
              {/* 表示している本文が全部ではないことを断る。大きすぎて受信時に切った
                  場合と、履歴に残す際に切った場合の両方で出る。 */}
              {res.truncated && (
                <span
                  className="meta trunc"
                  title="Body was too large; only the first part is shown"
                >
                  truncated
                </span>
              )}
              <div className="spacer" />
              {res.bodyText !== "" && (
                <button
                  type="button"
                  className="ghost copybtn"
                  onClick={copyBody}
                  title="Copy response body"
                >
                  Copy
                </button>
              )}
              {canDownload && (
                <button
                  type="button"
                  className="ghost copybtn"
                  onClick={downloadBody}
                  title="Save the response body to a file"
                >
                  Download
                </button>
              )}
            </div>
            <div className="tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={resTab === "body"}
                className={resTab === "body" ? "tab active" : "tab"}
                onClick={() => setResTab("body")}
              >
                Body
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={resTab === "response"}
                className={resTab === "response" ? "tab active" : "tab"}
                onClick={() => setResTab("response")}
              >
                Response <span className="count">{res.headers.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={resTab === "request"}
                className={resTab === "request" ? "tab active" : "tab"}
                onClick={() => setResTab("request")}
              >
                Request
              </button>
            </div>
            {resTab === "body" && res.json !== undefined && (
              <>
                <div className="subtabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={resMode === "tree"}
                    className={resMode === "tree" ? "subtab active" : "subtab"}
                    onClick={() => setResMode("tree")}
                  >
                    Tree
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={resMode === "raw"}
                    className={resMode === "raw" ? "subtab active" : "subtab"}
                    onClick={() => setResMode("raw")}
                  >
                    Raw
                  </button>
                </div>
                {resMode === "tree" ? (
                  <div className="resbody">
                    <JsonTree value={res.json} />
                  </div>
                ) : (
                  <pre className="resbody mono">{res.bodyText}</pre>
                )}
              </>
            )}
            {resTab === "body" && res.json === undefined && (
              <pre className="resbody mono">
                {res.bodyText === "" ? "(empty body)" : res.bodyText}
              </pre>
            )}
            {resTab === "response" && (
              <div className="resheaders mono">
                {res.headers.map(([k, v]) => (
                  <div className="rh" key={k}>
                    <span className="rk">{k}</span>
                    <span className="rv">{v}</span>
                  </div>
                ))}
              </div>
            )}
            {resTab === "request" && (
              <div className="sentreq">
                <div className="sentline mono">
                  <span className={`imethod m-${res.request.method}`}>{res.request.method}</span>{" "}
                  <span className="senturl">{res.request.url}</span>
                </div>
                {res.request.cookies && (
                  <span className="note">Sent with the cookies Chrome holds for localhost.</span>
                )}
                {res.request.headers.length > 0 && (
                  <div className="resheaders mono">
                    {res.request.headers.map(([k, v]) => (
                      <div className="rh" key={k}>
                        <span className="rk">{k}</span>
                        <span className="rv">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {res.request.body !== "" && (
                  <pre className="resbody mono sentbody">{res.request.body}</pre>
                )}
                <span className="note">
                  Headers set by this client. The browser adds more (User-Agent, Accept, …).
                </span>
              </div>
            )}
          </>
        )}
      </section>

      {dialogOpen && (
        <SaveDialog
          defaultName={`${method} ${path}`.trim()}
          groups={groups}
          savedKeys={savedKeys}
          onCancel={() => setDialogOpen(false)}
          onSave={(n, g) => {
            onSave(n, g);
            setDialogOpen(false);
          }}
        />
      )}

      {curlOpen && (
        <CurlDialog
          onCancel={() => setCurlOpen(false)}
          onImport={(next, warnings) => {
            applyImport(next, warnings);
            setCurlOpen(false);
          }}
        />
      )}

      {authOpen && (
        <AuthDialog
          onCancel={() => setAuthOpen(false)}
          onApply={(value) => {
            patch({ headers: upsertHeader(headers, "Authorization", value) });
            setAuthOpen(false);
            onNotify("Authorization header set", "success");
          }}
        />
      )}
    </div>
  );
}
