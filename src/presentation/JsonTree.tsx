import { useState } from "preact/hooks";

/**
 * レスポンスの JSON を、折りたためるツリーで表示する。
 *
 * 外部ライブラリは使わない。この拡張の売りは依存の少なさなので、
 * 表示のためだけに third-party のコードを持ち込まない方針。
 *
 * @param value {@link tryParseJson} が返した値。パース済みであることが前提
 * @returns ルートだけを開いた状態のツリー
 */
export default function JsonTree({ value }: { value: unknown }) {
  return (
    <div className="jtree mono">
      <Node k={null} value={value} depth={0} />
    </div>
  );
}

/**
 * ツリーの 1 ノード。オブジェクトと配列なら子を持ち、それ以外は葉として表示する。
 *
 * 開閉の状態は各ノードが自分で持つ。親がまとめて管理すると、
 * 深い階層のためにパスの一覧を持ち回ることになって重くなる。
 *
 * @param k このノードのキー名。ルートだけ null（キーを表示しない）
 * @param value このノードが表す値
 * @param depth ルートを 0 とした深さ。最初から開いておくかの判定に使う
 * @returns オブジェクトと配列なら開閉できる行、それ以外は 1 行の葉
 */
function Node({ k, value, depth }: { k: string | null; value: unknown; depth: number }) {
  const isObj = value !== null && typeof value === "object";

  // 最初に開いておくのはルートだけ。全部開くとレスポンスが大きいとき画面が埋まる。
  const [open, setOpen] = useState(depth < 1);

  if (!isObj) {
    return (
      <div className="jleaf">
        {k !== null && <span className="jkey">{k}: </span>}
        <Leaf v={value} />
      </div>
    );
  }

  const isArr = Array.isArray(value);

  // 配列も添字をキーにして、オブジェクトと同じ形で扱う。
  const entries: [string, unknown][] = isArr
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);

  // 閉じているときに中身を推し量るための要約。
  // 配列は件数、オブジェクトは先頭 3 つのキー名を出す。
  const preview = isArr
    ? `${entries.length} item${entries.length === 1 ? "" : "s"}`
    : entries
        .slice(0, 3)
        .map(([kk]) => kk)
        .join(", ") + (entries.length > 3 ? ", …" : "");

  return (
    <div className="jnode">
      <button
        type="button"
        className="jrow"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={open ? "jarr jopen" : "jarr"}>▶</span>
        {k !== null && <span className="jkey">{k}: </span>}
        <span>{isArr ? "[" : "{"}</span>
        {/* 閉じているときだけ、要約と閉じ括弧を同じ行に収める。 */}
        {!open && (
          <>
            <span className="jprev"> {preview} </span>
            <span>{isArr ? "]" : "}"}</span>
          </>
        )}
      </button>
      {open && (
        <div className="jkids">
          {entries.map(([kk, vv]) => (
            <Node key={kk} k={kk} value={vv} depth={depth + 1} />
          ))}
          <div className="jbracket">{isArr ? "]" : "}"}</div>
        </div>
      )}
    </div>
  );
}

/**
 * 値そのものの表示。型ごとにクラスを分けて色を変える。
 * 文字列だけは、JSON での見た目に合わせて引用符を添える。
 *
 * @param v 表示する値。オブジェクトと配列は {@link Node} 側で処理されるので渡らない
 * @returns 型に応じたクラスを付けた `span`
 */
function Leaf({ v }: { v: unknown }) {
  if (typeof v === "string") return <span className="jstr">"{v}"</span>;
  if (typeof v === "number") return <span className="jnum">{String(v)}</span>;
  // 残るのは真偽値と null。どちらも同じ見た目にする。
  return <span className="jlit">{String(v)}</span>;
}
