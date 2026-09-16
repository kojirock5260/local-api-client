import { useState } from "preact/hooks";
import { fromCurl } from "../domain/curl";
import type { Draft } from "../domain/request";
import { AutoFocusTextarea } from "./AutoFocus";

/** {@link CurlDialog} に渡す値。 */
type Props = {
  onCancel: () => void;
  onImport: (draft: Draft, warnings: string[]) => void;
};

/**
 * cURL コマンドを貼り付けて取り込むダイアログ。
 *
 * クリップボードは読まない。拡張のページから読むには権限が要り、
 * この拡張は権限を増やさない方針のため。ユーザーが貼るだけでよい。
 *
 * 解釈に失敗した理由はダイアログの中に出し、閉じずに直せるようにしてある。
 * Cmd/Ctrl+Enter で取り込み、Escape で取り消し。
 *
 * @returns 画面を覆うオーバーレイとダイアログ。閉じる判断は親が持つ
 */
export default function CurlDialog({ onCancel, onImport }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** 貼られたコマンドを解釈して親に渡す。失敗したら理由を出して留まる。 */
  function confirm() {
    if (text.trim() === "") return;
    try {
      const { draft, warnings } = fromCurl(text);
      onImport(draft, warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this command.");
    }
  }

  return (
    <div className="overlay">
      <div className="dialog wide" role="dialog" aria-label="Paste cURL">
        <div className="dialogtitle">Paste cURL</div>

        <label className="field" htmlFor="curl-command">
          <span className="fieldlabel">Command</span>
          {/* 開いた直後から貼れるよう、マウント時にフォーカスを取る。 */}
          <AutoFocusTextarea
            id="curl-command"
            className="body mono"
            value={text}
            onInput={(e) => {
              setText(e.currentTarget.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirm();
            }}
            placeholder={
              "curl -X POST 'http://localhost:3000/users' \\\n  -H 'Content-Type: application/json' \\\n  --data '{\"name\":\"sato\"}'"
            }
            rows={6}
            spellcheck={false}
          />
        </label>

        {error && <div className="error">{error}</div>}

        <span className="note">
          Only localhost and 127.0.0.1 are accepted. Replaces the current request.
        </span>

        <div className="dialogfoot">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="send" onClick={confirm} disabled={text.trim() === ""}>
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
