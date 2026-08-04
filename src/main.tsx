import { render } from "preact";
import App from "./presentation/App";
import "./presentation/app.css";

/**
 * サイドパネル（`sidepanel.html`）のエントリーポイント。
 * 描画を始めるだけで、状態の管理はすべて App が持つ。
 *
 * React の `StrictMode` に当たるものは Preact に無いので置いていない。
 * あれは開発時に副作用を 2 回走らせて検出する仕組みで、本番の挙動には関係しない。
 */
render(<App />, document.getElementById("root")!);
