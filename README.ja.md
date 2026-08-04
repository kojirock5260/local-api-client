# Local API Client

[English](README.md)

localhost 専用のミニマルな REST クライアント（Chrome 拡張・サイドパネル）。

![Local API Client](docs/screenshot.png)

## 思想

- **権限は最小**: `permissions` は `sidePanel` と `storage` のみ。`host_permissions` は localhost / 127.0.0.1 のみ
- **外部通信ゼロ**: 解析・クラウド保存・外部フォント一切なし。データはマシンから出ない
- **必要最小限の機能**: リクエストを組んで送ってレスポンスを見る。

## プライバシー

収集も送信もしない。すべて端末内の `chrome.storage.local` に留まる。
詳細は [プライバシーポリシー](PRIVACY.md)（英語）を参照。

## インストール

Chrome Web Store: （準備中）

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

動作確認は適当なローカルサーバを立てて:

```bash
python3 -m http.server 3000
# 拡張側: GET http://localhost + :3000/ → 200 が返れば OK
```

## Notes

- **Body (Fields)** の値は JSON としてパースできればその型（`30`→数値、`"30"`→文字列、`true`→真偽）、できなければ文字列として送る。Content-Type 未指定なら `application/json` を自動付与する
- **履歴・保存ともに30件**が上限。超えると古いものから自動削除される
- **履歴にはレスポンスも残る**ので、クリックすればその時の結果をそのまま見返せる。
  本文は30KBまでで、超えた分は切り捨てて `truncated` と表示する
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
