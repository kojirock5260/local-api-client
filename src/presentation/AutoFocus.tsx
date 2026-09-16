import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";

/**
 * マウント時にフォーカスを取る input。
 *
 * HTML の `autofocus` 属性は、ユーザーが一度でも何かにフォーカスした文書では効かない。
 * 仕様上、その時点で autofocus の処理は打ち切られ、以後は無視されるため。
 * React はマウント時に focus() を呼んで補うが、Preact は属性を付けるだけなので、
 * ダイアログの入力欄はこの部品で明示的にフォーカスする。
 *
 * @param when false のときはフォーカスを取らない。同じ画面に複数置いたとき、
 *   後からマウントされた側が奪わないようにするための切り替え。省略時は取る
 * @param props そのまま input に渡す属性
 * @returns フォーカス済みの input
 */
export function AutoFocusInput({
  when = true,
  ...props
}: JSX.IntrinsicElements["input"] & { when?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (when) ref.current?.focus();
  }, [when]);
  return <input ref={ref} {...props} />;
}

/**
 * マウント時にフォーカスを取る textarea。{@link AutoFocusInput} の textarea 版。
 *
 * @param props そのまま textarea に渡す属性
 * @returns フォーカス済みの textarea
 */
export function AutoFocusTextarea(props: JSX.IntrinsicElements["textarea"]) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return <textarea ref={ref} {...props} />;
}
