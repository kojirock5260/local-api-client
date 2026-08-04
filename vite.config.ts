/// <reference types="vitest/config" />

import { resolve } from "node:path";
import { defineConfig } from "vite";

// JSX の変換はプラグインを使わず、Vite 内蔵の esbuild に任せている。
// 変換先は tsconfig.json の `jsx` と `jsxImportSource` を見て決まるので、
// あちらで `preact` を指していれば、ここに設定は要らない。
// プラグインを 1 つ減らせるぶん、配布物に混ざるコードも減る。
export default defineConfig({
  build: {
    // Vite が既定で埋め込む modulepreload polyfill を外す。
    // この polyfill は link[rel="modulepreload"] を fetch するコードを含むが、
    // sidepanel.html にその要素は 1 つも無く、Chrome では冒頭で return するため
    // そもそも動かない。それでもバンドルに fetch が残ると、
    // 「外部通信ゼロ」を確かめたい人が余計な 1 件を追う羽目になる。
    // これを外すと、バンドル内の fetch は sendRequest の 1 箇所だけになる。
    modulePreload: false,
    rollupOptions: {
      input: {
        sidepanel: resolve(import.meta.dirname, "sidepanel.html"),
        background: resolve(import.meta.dirname, "src/background.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
      },
    },
  },
  test: {
    environment: "node",
  },
});
