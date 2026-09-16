import { useState } from "preact/hooks";
import { basicValue, bearerValue } from "../domain/auth";

/** {@link AuthDialog} に渡す値。 */
type Props = {
  onCancel: () => void;
  onApply: (value: string) => void;
};

/**
 * Authorization ヘッダーの値を作るダイアログ。
 *
 * Bearer はトークンをそのまま、Basic はユーザー名とパスワードを base64 にする。
 * 値を組み立てるだけで、ヘッダー行への反映は親に任せる。
 *
 * Enter で確定、Escape で取り消し。
 *
 * @returns 画面を覆うオーバーレイとダイアログ。閉じる判断は親が持つ
 */
export default function AuthDialog({ onCancel, onApply }: Props) {
  const [kind, setKind] = useState<"bearer" | "basic">("bearer");
  const [token, setToken] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");

  // Basic はパスワード無しでも成り立つので、ユーザー名だけを必須にする。
  const ready = kind === "bearer" ? token.trim() !== "" : user !== "";

  /** 入力から値を組み立てて親に渡す。足りなければ何もしない（ボタンも無効にしてある）。 */
  function confirm() {
    if (!ready) return;
    onApply(kind === "bearer" ? bearerValue(token) : basicValue(user, password));
  }

  /**
   * 入力欄共通のキー操作。
   *
   * @param e キーイベント
   */
  function keys(e: KeyboardEvent) {
    if (e.key === "Enter") confirm();
    if (e.key === "Escape") onCancel();
  }

  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-label="Authorization">
        <div className="dialogtitle">Authorization</div>

        <label className="field">
          <span className="fieldlabel">Type</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.currentTarget.value as "bearer" | "basic")}
          >
            <option value="bearer">Bearer token</option>
            <option value="basic">Basic</option>
          </select>
        </label>

        {kind === "bearer" ? (
          <label className="field">
            <span className="fieldlabel">Token</span>
            {/* 開いた直後から打ち始められるよう autofocus を付けている。 */}
            <input
              className="mono"
              value={token}
              onInput={(e) => setToken(e.currentTarget.value)}
              onKeyDown={keys}
              placeholder="eyJhbGciOi…"
              autoFocus
              spellcheck={false}
            />
          </label>
        ) : (
          <>
            <label className="field">
              <span className="fieldlabel">User</span>
              <input
                className="mono"
                value={user}
                onInput={(e) => setUser(e.currentTarget.value)}
                onKeyDown={keys}
                autoFocus
                spellcheck={false}
              />
            </label>
            <label className="field">
              <span className="fieldlabel">Password</span>
              <input
                className="mono"
                value={password}
                onInput={(e) => setPassword(e.currentTarget.value)}
                onKeyDown={keys}
                spellcheck={false}
              />
            </label>
          </>
        )}

        <span className="note">Sets the Authorization header. An existing one is replaced.</span>

        <div className="dialogfoot">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="send" onClick={confirm} disabled={!ready}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
