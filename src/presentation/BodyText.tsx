import { useState } from "preact/hooks";
import { previewText } from "../domain/preview";

/** {@link BodyText} に渡す値。 */
type Props = {
  /** 表示する本文。 */
  text: string;
  /** false なら Show all を出さない。受信中のように、まだ増えていく本文に使う。 */
  expandable?: boolean;
};

/**
 * レスポンス本文のテキスト表示。
 *
 * 最初は先頭の一部だけを DOM に出す（{@link previewText} を参照）。
 * 全部見たいときは Show all で描画する。重くなるかどうかをユーザーが選べる。
 *
 * 別のレスポンスに変わったときに一部表示へ戻すのは、親が key を変えて作り直すことで行う。
 *
 * @returns pre と、切ってあるときだけその旨の一行
 */
export default function BodyText({ text, expandable = true }: Props) {
  const [all, setAll] = useState(false);
  const { shown, hidden } = all ? { shown: text, hidden: 0 } : previewText(text);
  return (
    <>
      <pre className="resbody mono">{shown}</pre>
      {hidden > 0 && (
        <div className="previewfoot">
          <span className="note">
            Showing {shown.length.toLocaleString()} of {text.length.toLocaleString()} characters
            {expandable ? ". Copy and Download use the whole body." : " while receiving."}
          </span>
          {expandable && (
            <>
              <div className="spacer" />
              <button
                type="button"
                className="ghost add"
                onClick={() => setAll(true)}
                title="Render the whole body. Very large bodies can take a moment."
              >
                Show all
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
