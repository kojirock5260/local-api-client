#!/usr/bin/env node
/**
 * Chrome Web Store 掲載用の画像を作る。
 *
 *   npm run screenshots                # docs/store/en と docs/store/ja
 *   npm run screenshots -- --lang ja   # 片方だけ
 *
 * 手元の Google Chrome を playwright-core で動かす。ブラウザの追加ダウンロードは無い。
 * デモ API と Vite の開発サーバーをこのプロセス内で立ち上げ、パネルの画面を撮ってから
 * 1280x800 の台紙に載せる。拡張として動かしているわけではないので chrome.* API は
 * 通らないが、見た目は同じ。
 *
 * 出力（言語ごと）:
 *   01-tree.png … 05-saved.png     1280x800 のスクリーンショット
 *   promo-small-440x280.png        小さいプロモタイル
 *   promo-marquee-1400x560.png     マーキー用タイル
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { start as startDemo } from "./demo-server.mjs";

const API_PORT = Number(process.env.DEMO_PORT) || 3000;
const VITE_PORT = 5177;
/** パネルの CSS ピクセル。台紙には 1.5 倍で載せる。 */
const PANEL = { width: 420, height: 500 };
const SHOT_WIDTH = 630;
const OUT = resolve("docs/store");

const langs = (() => {
  const i = process.argv.indexOf("--lang");
  const v = i >= 0 ? process.argv[i + 1] : "all";
  return v === "all" ? ["en", "ja"] : [v];
})();

/** 台紙の文言。 */
const TEXT = {
  en: {
    kicker: "CHROME SIDE PANEL",
    tags: ["No account", "No cloud", "localhost only"],
    promo:
      "A minimal REST client for localhost, in Chrome's side panel. Zero external communication.",
    shots: {
      "01-tree": [
        "Talk to localhost without leaving the tab",
        "Build a request, send it, read the response as a tree. Only localhost and 127.0.0.1 are allowed, and nothing is sent anywhere else.",
      ],
      "02-stream": [
        "Responses stream in as they arrive",
        "Server-sent events and long responses show up line by line. Cancel keeps what you already got.",
      ],
      "03-curl": [
        "Paste a curl command, get a request",
        "From docs, DevTools or an AI. Method, headers and body are filled in. Copy as cURL works the other way.",
      ],
      "04-body": [
        "Fields, form or raw body",
        "Key-value rows are sent as JSON or a form post. Bearer or Basic auth in one click. Cookies only when you turn them on.",
      ],
      "05-saved": [
        "History and saved requests, on your machine",
        "The last 30 requests with their responses. Save requests into groups, export and import them as JSON. Stored in chrome.storage.local only.",
      ],
    },
  },
  ja: {
    kicker: "CHROME サイドパネル",
    tags: ["アカウント不要", "クラウドなし", "localhost のみ"],
    promo: "localhost 専用のミニマルな REST クライアント。Chrome のサイドパネルで、外部通信ゼロ。",
    shots: {
      "01-tree": [
        "タブを離れずに localhost を叩く",
        "リクエストを組んで送り、レスポンスをツリーで読む。宛先は localhost と 127.0.0.1 だけで、外部にはなにも送らない。",
      ],
      "02-stream": [
        "レスポンスは届いた分から表示",
        "SSE や長い応答も一行ずつ見える。Cancel しても、途中まで届いた内容は残る。",
      ],
      "03-curl": [
        "curl を貼ればリクエストになる",
        "ドキュメント、DevTools、AI の出力から。メソッド・ヘッダー・本文が埋まる。逆向きの cURL コピーもある。",
      ],
      "04-body": [
        "本文は Fields、Form、Raw",
        "キーと値の行を JSON かフォームとして送る。Bearer / Basic のヘッダーは一クリック。Cookie はオンにしたときだけ。",
      ],
      "05-saved": [
        "履歴と保存は自分のマシンの中",
        "直近 30 件をレスポンスごと残す。保存はグループ分けでき、JSON で書き出しと取り込みができる。置き場所は chrome.storage.local だけ。",
      ],
    },
  },
};

const CURL_SAMPLE = [
  `curl -X POST 'http://localhost:${API_PORT}/users' \\`,
  "  -H 'Content-Type: application/json' \\",
  "  -H 'Authorization: Bearer demo-token' \\",
  `  -d '{"name":"Takahashi Mei","email":"mei@example.com"}'`,
].join("\n");

/* ---------- パネルに仕込むデータ ---------- */

const now = Date.now();
const row = (key, value, enabled = true) => ({ id: crypto.randomUUID(), key, value, enabled });
const draft = (over = {}) => ({
  method: "GET",
  origin: "http://localhost",
  path: `:${API_PORT}/users`,
  headers: [row("", "")],
  bodyMode: "fields",
  bodyFields: [row("", "")],
  body: "",
  cookies: false,
  ...over,
});

const history = [
  { ...draft(), id: "h1", at: now - 60_000, status: 200, timeMs: 12 },
  { ...draft({ method: "POST" }), id: "h2", at: now - 8 * 60_000, status: 201, timeMs: 18 },
  {
    ...draft({ path: `:${API_PORT}/me` }),
    id: "h3",
    at: now - 25 * 60_000,
    status: 401,
    timeMs: 9,
  },
  {
    ...draft({ path: `:${API_PORT}/events` }),
    id: "h4",
    at: now - 2 * 3_600_000,
    status: 200,
    timeMs: 4021,
  },
];

const saved = [
  { ...draft(), id: "s1", name: "List users", group: "users", updatedAt: now - 3 * 60_000 },
  {
    ...draft({
      method: "POST",
      bodyFields: [row("name", '"Takahashi Mei"'), row("email", '"mei@example.com"')],
    }),
    id: "s2",
    name: "Create user",
    group: "users",
    updatedAt: now - 3_600_000,
  },
  {
    ...draft({ method: "DELETE", path: `:${API_PORT}/users/3` }),
    id: "s3",
    name: "Delete user",
    group: "users",
    updatedAt: now - 2 * 3_600_000,
  },
  {
    ...draft({ method: "POST", path: `:${API_PORT}/login`, cookies: true }),
    id: "s4",
    name: "Login",
    group: "auth",
    updatedAt: now - 86_400_000,
  },
  {
    ...draft({ path: `:${API_PORT}/me`, cookies: true }),
    id: "s5",
    name: "Who am I",
    group: "auth",
    updatedAt: now - 86_400_000,
  },
  {
    ...draft({ path: `:${API_PORT}/events` }),
    id: "s6",
    name: "Progress stream",
    updatedAt: now - 2 * 86_400_000,
  },
];

/* ---------- 各画面の操作 ---------- */

/**
 * Send を押して、ステータス行が出るまで待つ。
 *
 * @param {import("playwright-core").Page} page
 */
async function send(page) {
  await page.getByRole("button", { name: /^Send/ }).click();
  await page.locator(".statusline .status").first().waitFor();
  await page.waitForTimeout(300);
}

const SCENARIOS = [
  {
    file: "01-tree",
    editor: draft(),
    run: async (page) => {
      await send(page);
      // ルートしか開いていないので、users と最初の 1 人を開いて中身を見せる。
      await page.locator(".jrow", { hasText: "users" }).first().click();
      // ルートの子も .jkids の中にあるので、users の子は 2 段目の .jkids で探す。
      await page.locator(".jkids .jkids .jrow").first().click();
      await page.waitForTimeout(150);
    },
  },
  {
    file: "02-stream",
    editor: draft({ path: `:${API_PORT}/events` }),
    run: async (page) => {
      await page.getByRole("button", { name: /^Send/ }).click();
      // 10 件のうち 3 件ほど届いた、受信中の状態を撮る。
      await page.waitForTimeout(1350);
    },
  },
  {
    file: "03-curl",
    editor: draft(),
    run: async (page) => {
      await page.getByRole("button", { name: "Paste" }).click();
      await page.getByLabel("Command").fill(CURL_SAMPLE);
    },
  },
  {
    file: "04-body",
    editor: draft({
      method: "POST",
      headers: [row("Authorization", "Bearer demo-token")],
      // 3 行にするとレスポンスが画面から出てしまうので 2 行に留める。
      bodyFields: [row("name", '"Takahashi Mei"'), row("email", '"mei@example.com"')],
    }),
    run: async (page) => {
      await page.getByRole("tab", { name: "Body" }).click();
      await send(page);
    },
  },
  {
    file: "05-saved",
    editor: draft(),
    run: async (page) => {
      await page.getByRole("tab", { name: /^Saved/ }).click();
      await page.waitForTimeout(200);
    },
  },
];

/* ---------- 台紙 ---------- */

const STAGE_CSS = `
  html, body { margin: 0; width: 1280px; height: 800px; overflow: hidden; }
  body { background: linear-gradient(135deg, #16181d 0%, #1b1e24 100%); color: #d9dce2;
         font-family: system-ui, -apple-system, "Segoe UI", "Hiragino Sans", sans-serif; }
  .wrap { display: flex; align-items: center; height: 800px; padding: 0 56px; gap: 44px; box-sizing: border-box; }
  .text { flex: 1; min-width: 0; }
  .kicker { color: #3fbf8f; font: 600 14px/1.4 ui-monospace, Menlo, monospace; letter-spacing: .08em; margin-bottom: 18px; }
  h1 { font-size: 40px; line-height: 1.18; margin: 0 0 20px; font-weight: 700; letter-spacing: -.01em; }
  p { font-size: 19px; line-height: 1.55; color: #a3a9b5; margin: 0; }
  .tags { display: flex; gap: 8px; margin-top: 28px; flex-wrap: wrap; }
  .tag { border: 1px solid #2c3038; border-radius: 99px; padding: 5px 13px; font-size: 14px; color: #878e99; }
  .shot { flex: none; width: ${SHOT_WIDTH}px; border-radius: 14px; overflow: hidden; border: 1px solid #2c3038;
          box-shadow: 0 30px 60px rgba(0, 0, 0, .5); background: #16181d; }
  .shot img { display: block; width: ${SHOT_WIDTH}px; height: auto; }
`;

/**
 * パネルの画像と文言から 1280x800 の台紙 HTML を組む。
 *
 * @param {string} lang
 * @param {string} file
 * @param {Buffer} panelPng
 * @returns {string}
 */
function stageHtml(lang, file, panelPng) {
  const t = TEXT[lang];
  const [title, body] = t.shots[file];
  const tags = t.tags.map((x) => `<span class="tag">${x}</span>`).join("");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${STAGE_CSS}</style></head>
<body><div class="wrap">
  <div class="text">
    <div class="kicker">▸_ LOCAL API CLIENT · ${t.kicker}</div>
    <h1>${title}</h1>
    <p>${body}</p>
    <div class="tags">${tags}</div>
  </div>
  <div class="shot"><img src="data:image/png;base64,${panelPng.toString("base64")}" alt=""></div>
</div></body></html>`;
}

/**
 * プロモタイルの HTML。
 *
 * @param {string} lang
 * @param {number} width
 * @param {number} height
 * @param {string} iconB64
 * @returns {string}
 */
function tileHtml(lang, width, height, iconB64) {
  const big = width >= 1000;
  const t = TEXT[lang];
  const tags = big
    ? `<div class="tags">${t.tags.map((x) => `<span class="tag">${x}</span>`).join("")}</div>`
    : "";
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
  body { background: linear-gradient(135deg, #16181d 0%, #1e2127 100%); color: #d9dce2; display: flex; align-items: center; justify-content: center;
         gap: ${big ? 56 : 24}px; font-family: system-ui, -apple-system, "Segoe UI", "Hiragino Sans", sans-serif; box-sizing: border-box; padding: 0 ${big ? 120 : 28}px; }
  img { width: ${big ? 168 : 96}px; height: ${big ? 168 : 96}px; border-radius: ${big ? 36 : 20}px; flex: none; box-shadow: 0 16px 40px rgba(0,0,0,.45); }
  .name { font-size: ${big ? 60 : 30}px; font-weight: 700; letter-spacing: -.01em; line-height: 1.1; }
  .tag-line { font-size: ${big ? 24 : 14}px; color: #a3a9b5; margin-top: ${big ? 18 : 8}px; line-height: 1.45; max-width: ${big ? 760 : 270}px; }
  .tags { display: flex; gap: 10px; margin-top: 26px; }
  .tag { border: 1px solid #2c3038; border-radius: 99px; padding: 6px 14px; font-size: 16px; color: #878e99; }
</style></head><body>
  <img src="data:image/png;base64,${iconB64}" alt="">
  <div><div class="name">Local API Client</div><div class="tag-line">${t.promo}</div>${tags}</div>
</body></html>`;
}

/**
 * HTML をそのサイズで描画して PNG にする。
 *
 * @param {import("playwright-core").Browser} browser
 * @param {string} html
 * @param {{ width: number, height: number }} size
 * @returns {Promise<Buffer>}
 */
async function render(browser, html, size) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(100);
  const png = await page.screenshot({ type: "png" });
  await page.close();
  return png;
}

/* ---------- 本体 ---------- */

const vite = await createServer({
  server: { port: VITE_PORT, strictPort: true },
  logLevel: "silent",
});
await vite.listen();
const browser = await chromium.launch({ channel: "chrome" });
const iconB64 = (await readFile("public/icons/icon128.png")).toString("base64");

try {
  for (const lang of langs) {
    const dir = resolve(OUT, lang);
    await mkdir(dir, { recursive: true });
    // メモリ上のユーザーが前の言語の操作で増えないよう、言語ごとにデモ API を立て直す。
    const api = await startDemo({ port: API_PORT, quiet: true });

    for (const sc of SCENARIOS) {
      const ctx = await browser.newContext({
        viewport: PANEL,
        deviceScaleFactor: 2,
        colorScheme: "dark",
      });
      await ctx.addInitScript(
        (seed) => {
          localStorage.setItem("editor", JSON.stringify(seed.editor));
          localStorage.setItem("history", JSON.stringify(seed.history));
          localStorage.setItem("saved", JSON.stringify(seed.saved));
        },
        { editor: sc.editor, history, saved },
      );
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${VITE_PORT}/sidepanel.html`);
      await page.locator(".reqview").waitFor();
      await sc.run(page);
      const panelPng = await page.screenshot({ type: "png" });
      await ctx.close();

      const out = resolve(dir, `${sc.file}.png`);
      await writeFile(
        out,
        await render(browser, stageHtml(lang, sc.file, panelPng), { width: 1280, height: 800 }),
      );
      console.log("wrote", out);
    }

    for (const [w, h] of [
      [440, 280],
      [1400, 560],
    ]) {
      const out = resolve(dir, `promo-${w === 440 ? "small" : "marquee"}-${w}x${h}.png`);
      await writeFile(
        out,
        await render(browser, tileHtml(lang, w, h, iconB64), { width: w, height: h }),
      );
      console.log("wrote", out);
    }
    await new Promise((done) => api.close(done));
  }
} finally {
  await browser.close();
  await vite.close();
}
