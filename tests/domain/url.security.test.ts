// このアプリの「外部通信ゼロ」という主張を守るための回帰テスト。
//
// 送信が起きうる箇所は sendRequest.ts の fetch 1 箇所だけで、その宛先は必ず
// buildUrl を通る。つまり buildUrl が破られなければ、外部ホストへは出ていかない。
// ここではその 1 点を、外へ向けさせようとする入力で繰り返し叩いて確かめる。
//
// buildUrl を触るときは、このファイルが通ることを必ず確認すること。
import { describe, expect, it } from "vitest";
import { ORIGINS } from "../../src/domain/request";
import { buildUrl } from "../../src/domain/url";

/** 許可されているホスト名。これ以外が出てきたら防御が破れている。 */
const ALLOWED = ["localhost", "127.0.0.1"];

/**
 * パス欄に入れて外部ホストへ向けさせようとする入力。
 * 例外で弾かれるか、ホスト名が localhost のままであること。
 */
const MALICIOUS_PATHS = [
  // URL のユーザー情報部を使って、@ の後ろを本当のホストにさせる手口
  ":80@evil.com",
  ":3000@evil.com",
  "@evil.com",
  " @evil.com",
  ":3000/@evil.com",
  // プロトコル相対
  "//evil.com",
  "//evil.com/path",
  // 一部の実装がスラッシュとして扱うバックスラッシュ
  "\\evil.com",
  "\\\\evil.com",
  // ホスト名の後ろに繋げてサブドメインに見せる手口
  ".evil.com",
  "localhost.evil.com",
  // パスを遡る
  ":3000/../../evil.com",
  // 区切りを飛ばす
  "#@evil.com",
  "?next=http://evil.com",
  "%2F%2Fevil.com",
  // 制御文字で解釈をずらす
  ":80\t@evil.com",
  ":80\n@evil.com",
  // 見た目が似た文字
  "。evil.com",
];

/**
 * origin 欄に直接入り得る不正な値。
 *
 * normalizeDraft は origin を ORIGINS と突き合わせないので、
 * ストレージが書き換えられれば任意の origin が入り得る。
 * その場合でも buildUrl が最後の砦として止まること。
 */
const MALICIOUS_ORIGINS = [
  "https://evil.com",
  "http://evil.com",
  "http://localhost.evil.com",
  "http://127.0.0.1.evil.com",
  "http://[::1]",
  "http://localhost.",
  "http://LOCALHOST",
  // 先頭がキリル文字の "ⅼ"。punycode に変換されて別ホストになる
  "http://ⅼocalhost",
];

describe("buildUrl は外部ホストへ出さない", () => {
  for (const origin of ORIGINS) {
    for (const path of MALICIOUS_PATHS) {
      it(`${origin} + ${JSON.stringify(path)}`, () => {
        let host: string;
        try {
          host = buildUrl(origin, path).hostname;
        } catch {
          return; // 弾かれたので問題なし
        }
        expect(ALLOWED).toContain(host);
      });
    }
  }

  for (const origin of MALICIOUS_ORIGINS) {
    it(`細工された origin: ${origin}`, () => {
      let host: string;
      try {
        host = buildUrl(origin, "/").hostname;
      } catch {
        return; // 弾かれたので問題なし
      }
      expect(ALLOWED).toContain(host);
    });
  }
});
