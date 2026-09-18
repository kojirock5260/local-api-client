# Local API Client

[English](README.md)

localhost 専用のミニマルな REST クライアント（Chrome 拡張・サイドパネル）。

![Local API Client](docs/screenshot.png)

## 思想

- **権限は最小**: `permissions` は `sidePanel` と `storage` のみ。`host_permissions` は localhost / 127.0.0.1 のみ
- **外部通信ゼロ**: 解析・クラウド保存・外部フォント一切なし。データはマシンから出ない
- **必要最小限の機能**: リクエストを組んで送ってレスポンスを見る。

## できること

- GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS と任意のヘッダー
- ボディはキーと値の **Fields**（JSON として送る）、**Form**（`application/x-www-form-urlencoded`）、**Raw** テキスト
- **ストリーミング**: 届いた分から順に表示するので、SSE のような終わらない応答も見られる
- **cURL としてコピー** と **cURL の貼り付け**: ドキュメントや AI が出した `curl` コマンドを貼ればそのままリクエストになる
- Bearer / Basic の **Auth** ヘルパーと、任意で有効にする **Send cookies**
- レスポンス付きの履歴、グループ分けできる保存、JSON ファイルでのエクスポート / インポート
- キーボード: パネルのどこからでも `Ctrl+Enter` / `⌘↵` で送信

## プライバシー

収集も送信もしない。すべて端末内の `chrome.storage.local` に留まる。
詳細は [プライバシーポリシー](PRIVACY.md)（英語）を参照。

## インストール

[Chrome Web Store](https://chromewebstore.google.com/detail/local-api-client/ihmoinkdbohnodnjpkdmenkmiikllfgp)。Chrome 114 以上が必要。

紹介ページ: https://kojirock5260.github.io/local-api-client/ja/

## 試す

```bash
npm run demo
```

追加の依存なしで http://localhost:3000 に小さな API が立つ。ユーザーの一覧・作成・削除、Cookie を発行するログイン、Bearer トークンが要る経路、SSE のストリーム、遅い経路、2MB の本文、500 が揃っている。http://localhost:3000 をタブで開くと curl の例付きの一覧が出る。拡張側では `http://localhost` を選んで `:3000/users` と打てばよい。

## 開発

```bash
npm install
npm run build   # dist/ に出力
npm run dev     # UI だけブラウザで確認する場合（chrome.* API は動かない）
```

ビルドしたものを手元の Chrome で動かす場合:

1. `chrome://extensions` を開く
2. 右上「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」→ `dist/` フォルダを選択

動作確認は上の `npm run demo` か、適当なローカルサーバを立てて:

```bash
python3 -m http.server 3000
# 拡張側: GET http://localhost + :3000/ → 200 が返れば OK
```

Chrome Web Store 向けのものは `store/` にまとめてある。`npm run pack` でビルドして提出用の zip をそこに作る（zip は git に含めない）。`npm run screenshots` で 1280x800 のスクリーンショットとプロモタイルを `store/en` に作り直せる（`-- --lang ja` を付けると日本語版）。撮影には手元の Google Chrome を `playwright-core` で動かすので、追加のダウンロードは無い。

## Notes

- **Body (Fields)** の値は JSON としてパースできればその型（`30`→数値、`"30"`→文字列、`true`→真偽）、できなければ文字列として送る。Content-Type 未指定なら `application/json` を自動付与する
- **Body (Form)** は同じ行を `application/x-www-form-urlencoded` で送る。値は文字列のまま、同じキーが複数あっても両方送る
- **cURL の貼り付け** は `-X` `-H` `-d` / `--data-*` `--json` `-u` `-G` `-I` `-b` `-A` を解釈し、リクエストを変えないフラグ（`-s` `-k` `-L` など）は無視する。ファイルからの本文（`-d @file`）と multipart（`-F`）は警告を出して落とす。localhost / 127.0.0.1 以外は拒否する。パス欄に直接貼っても取り込める
- **Send cookies** は既定でオフ。オンにすると Chrome が持つ localhost の Cookie がリクエストに付き、レスポンスの `Set-Cookie` も Chrome に保存される
- **レスポンスは届いた分から表示する。** 打ち切りは「無通信が 15 秒続いたら」で、合計 15 秒ではない。送り続けているストリームは切れない。Cancel しても途中まで届いた分は残る
- **レスポンスの読み込みは1MBまで**。超えた分は捨てて `truncated` と表示する。
  巨大なレスポンスでパネルが固まるのを防ぐため。サイズ表示は常に実際の値
- **大きな本文は最初は一部だけ表示する。** 先頭 100,000 文字を出し、Show all で残りを描画する。ツリー表示は各階層 200 件ずつで、Show more で続きを出す。Copy と Download は常に全文を使う
- **Download** は受信したままの本文をファイルに保存する。名前はパスと Content-Type から決める。`truncated` の本文には出さない
- **履歴・保存ともに30件**が上限。超えると古いものから自動削除される
- **履歴にはレスポンスも残る**ので、クリックすればその時の結果をそのまま見返せる。
  履歴に残す本文は30KBまでで、超えた分は切り捨てて `truncated` と表示する
- **`truncated` の本文は JSON として解釈しない**ので、ツリー表示にはならず生テキストになる
- **エクスポートファイルにはヘッダーとボディがそのまま含まれる**

## テスト・Lint

```bash
npm test          # Vitest 一回実行
npm run test:watch
npm run lint      # Biome（lint + format チェック）
npm run lint:fix  # 自動修正
```

## Contributing

セキュリティ方針として、**Pull Request 一旦は受け付けていません。**

バグ報告や提案は Issue へお願いします。

## 開発について

このプロジェクトは [Claude](https://claude.com)（Anthropic）を活用して開発しています。
