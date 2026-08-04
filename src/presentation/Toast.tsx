/** トーストの種類。色が変わるだけで、動きの違いはない。 */
export type ToastKind = "info" | "success" | "danger";

/** 表示中のトースト 1 件。 */
export type ToastItem = { id: string; message: string; kind: ToastKind };

/**
 * 右上に積み上がる通知。
 *
 * 消すタイミングは App が持っていて（3 秒後）、ここは渡されたものを並べるだけ。
 * タイマーを両方に散らすと消え方がずれるので、管理は片側に寄せている。
 *
 * `role="status"` と `aria-live="polite"` を付けているのは、
 * 画面を見ていない人にも保存や削除の結果が伝わるようにするため。
 *
 * @param items 表示するトースト。配列の先頭が上に並ぶ
 * @returns 積み上げた通知。1 件も無いときは `null`（空の枠を残さない）
 */
export default function Toasts({ items }: { items: ToastItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
