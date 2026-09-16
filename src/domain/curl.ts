import { basicValue } from "./auth";
import { buildPayload } from "./body";
import {
  type BodyMode,
  type Draft,
  type HeaderRow,
  METHODS,
  type Method,
  normalizeDraft,
  ORIGINS,
} from "./request";
import { ALLOWED_HOSTS, buildUrl } from "./url";

/**
 * シェルに安全に渡せるよう、文字列をシングルクォートで囲む。
 *
 * シングルクォートの中では他のすべての文字がそのまま扱われるので、
 * エスケープが必要なのはシングルクォート自身だけ。
 * いったんクォートを閉じ、エスケープしたクォートを置き、また開き直す
 * （`'` → `'\''`）という定番の書き方をしている。
 *
 * @param s 囲みたい文字列。改行や空白が入っていてもよい
 * @returns シングルクォートで囲んだ文字列。空文字を渡すと `''` になる
 */
function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Draft を cURL コマンドの文字列に変換する。
 *
 * ボディと自動付与ヘッダーの計算は送信時と同じ {@link buildPayload} を通す。
 * そのため、コピーしたコマンドと実際に飛ぶリクエストの中身は必ず一致する。
 *
 * HEAD だけは `-X HEAD` ではなく `--head` を使う。`--head` が curl 側で
 * HEAD リクエスト用に用意されているオプションのため。
 *
 * 出力は `\` で行末を継続した複数行にする。ターミナルにそのまま貼れて、
 * かつヘッダーが多いときも読めるようにするため。
 *
 * @param draft 変換する Draft
 * @returns そのままターミナルに貼れる cURL コマンド。末尾に改行は付けない
 * @throws URL を組み立てられないとき、およびホストが localhost / 127.0.0.1 でないとき
 */
export function toCurl(draft: Draft): string {
  const url = buildUrl(draft.origin, draft.path);

  let first = "curl";
  if (draft.method === "HEAD") first += " --head";
  else if (draft.method !== "GET") first += ` -X ${draft.method}`;
  first += ` ${sq(url.href)}`;

  const payload = buildPayload(draft);
  const lines: string[] = [first];

  // 自動付与ヘッダーを先に出す。ユーザーが書いたヘッダーと並んだとき、
  // どちらがこちらの補完かひと目で分かるようにするため。
  for (const [k, v] of Object.entries(payload.autoHeaders)) {
    lines.push(`-H ${sq(`${k}: ${v}`)}`);
  }
  for (const h of draft.headers) {
    if (h.enabled && h.key.trim() !== "") {
      lines.push(`-H ${sq(`${h.key.trim()}: ${h.value}`)}`);
    }
  }
  if (payload.body !== "") {
    lines.push(`--data ${sq(payload.body)}`);
  }

  return lines.join(" \\\n  ");
}

/* ======================================================================
 * ここから下は逆方向。貼り付けられた cURL コマンドを Draft に戻す。
 * ====================================================================== */

/**
 * {@link fromCurl} の結果。
 *
 * `warnings` は取り込み自体は成功したが伝えたいこと。無視したオプションや、
 * 対応していない機能（ファイルからの本文など）を落とした旨が入る。
 */
export type CurlImport = { draft: Draft; warnings: string[] };

/**
 * ANSI-C クォート（`$'...'`）の中で使えるエスケープ。
 * `\x` `\u` `\U` は桁数が変わるので、ここには入れず {@link tokenize} で扱う。
 */
const ANSI_ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "\\": "\\",
  "'": "'",
  '"': '"',
  a: "\x07",
  b: "\b",
  f: "\f",
  v: "\v",
  e: "\x1b",
  "0": "\0",
};

/**
 * シェルの単語分割を、curl コマンドを読むのに必要な範囲で再現する。
 *
 * 対応するのは次のとおり。
 * - 空白（スペース、タブ、改行）での区切り
 * - 行末の `\` による継続
 * - `\` による 1 文字のエスケープ
 * - シングルクォート（中はすべてそのまま）
 * - ダブルクォート（`\"` `\\` `\$` `` \` `` と行継続だけがエスケープ）
 * - `$'...'` の ANSI-C クォート（DevTools の「Copy as cURL」が非 ASCII に使う）
 * - `|` `;` `&&` `||` が単独で現れたら、そこから先は別のコマンドなので読まない
 *
 * 変数展開やコマンド置換はしない。`$HOME` のような文字列はそのまま残る。
 *
 * @param text コマンド全体
 * @returns 単語の配列。クォートは外してある
 * @throws クォートが閉じていないとき
 */
function tokenize(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  // 空の引用（`''`）も 1 単語として数えるため、文字数ではなく「何か入ったか」で見る。
  let has = false;
  let i = 0;
  const n = text.length;

  const push = () => {
    if (has) out.push(cur);
    cur = "";
    has = false;
  };

  /**
   * 16 進のエスケープを読む。`\x41` のように、桁数の上限までを数字として読む。
   *
   * @param max 読む桁数の上限
   * @returns 読めた文字。数字が 1 桁も無ければ null
   */
  const hex = (max: number): string | null => {
    let j = i;
    let digits = "";
    while (j < n && digits.length < max && /[0-9a-fA-F]/.test(text[j])) {
      digits += text[j];
      j++;
    }
    if (digits === "") return null;
    i = j;
    return String.fromCodePoint(Number.parseInt(digits, 16));
  };

  while (i < n) {
    const c = text[i];

    if (c === "\\") {
      const next = text[i + 1];
      if (next === "\n") {
        i += 2;
        continue;
      }
      if (next === "\r" && text[i + 2] === "\n") {
        i += 3;
        continue;
      }
      if (next === undefined) {
        i++;
        continue;
      }
      cur += next;
      has = true;
      i += 2;
      continue;
    }

    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      if (end < 0) throw new Error("Unterminated single quote.");
      cur += text.slice(i + 1, end);
      has = true;
      i = end + 1;
      continue;
    }

    if (c === '"') {
      i++;
      let closed = false;
      while (i < n) {
        const d = text[i];
        if (d === '"') {
          closed = true;
          i++;
          break;
        }
        if (d === "\\") {
          const next = text[i + 1];
          if (next === "\n") {
            i += 2;
            continue;
          }
          if (next === '"' || next === "\\" || next === "$" || next === "`") {
            cur += next;
            i += 2;
            continue;
          }
        }
        cur += d;
        i++;
      }
      if (!closed) throw new Error("Unterminated double quote.");
      has = true;
      continue;
    }

    if (c === "$" && text[i + 1] === "'") {
      i += 2;
      let closed = false;
      while (i < n) {
        const d = text[i];
        if (d === "'") {
          closed = true;
          i++;
          break;
        }
        if (d === "\\") {
          const next = text[i + 1];
          if (next === "x" || next === "u" || next === "U") {
            i += 2;
            const ch = hex(next === "x" ? 2 : next === "u" ? 4 : 8);
            cur += ch ?? `\\${next}`;
            continue;
          }
          if (next !== undefined && next in ANSI_ESCAPES) {
            cur += ANSI_ESCAPES[next];
            i += 2;
            continue;
          }
        }
        cur += d;
        i++;
      }
      if (!closed) throw new Error("Unterminated quote.");
      has = true;
      continue;
    }

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      push();
      i++;
      continue;
    }

    cur += c;
    has = true;
    i++;
  }
  push();

  // 別のコマンドに繋いでいる部分は読まない。`curl ... | jq .` のように貼られることが多い。
  const stop = out.findIndex((t) => t === "|" || t === "||" || t === "&&" || t === ";");
  return stop >= 0 ? out.slice(0, stop) : out;
}

/** 値を取らない短いオプション。見つけても何もしない。 */
const BOOL_SHORT = new Set(["s", "S", "k", "L", "v", "i", "f", "g", "N", "4", "6", "q", "#"]);

/** 値を取らない長いオプション。見つけても何もしない。 */
const BOOL_LONG = new Set([
  "silent",
  "show-error",
  "insecure",
  "location",
  "location-trusted",
  "verbose",
  "include",
  "fail",
  "fail-with-body",
  "compressed",
  "globoff",
  "no-buffer",
  "no-keepalive",
  "no-progress-meter",
  "progress-bar",
  "http1.0",
  "http1.1",
  "http2",
  "http2-prior-knowledge",
  "http3",
  "tlsv1",
  "tlsv1.0",
  "tlsv1.1",
  "tlsv1.2",
  "tlsv1.3",
  "ssl-reqd",
  "ipv4",
  "ipv6",
  "disable",
  "styled-output",
  "no-styled-output",
]);

/** 値を取る短いオプション。 */
const VALUE_SHORT = new Set([
  "X",
  "H",
  "d",
  "u",
  "A",
  "e",
  "b",
  "F",
  "o",
  "w",
  "m",
  "x",
  "c",
  "T",
  "r",
  "E",
  "K",
  "D",
  "y",
  "Y",
  "z",
  "C",
  "P",
  "Q",
  "t",
  "U",
]);

/** 値を取る長いオプション。ここに無い `--xxx` は値を取らないものとみなす。 */
const VALUE_LONG = new Set([
  "request",
  "header",
  "data",
  "data-raw",
  "data-binary",
  "data-ascii",
  "data-urlencode",
  "json",
  "user",
  "user-agent",
  "referer",
  "cookie",
  "cookie-jar",
  "form",
  "form-string",
  "output",
  "write-out",
  "max-time",
  "connect-timeout",
  "proxy",
  "upload-file",
  "range",
  "cert",
  "cacert",
  "capath",
  "key",
  "config",
  "dump-header",
  "resolve",
  "interface",
  "max-redirs",
  "retry",
  "retry-delay",
  "retry-max-time",
  "limit-rate",
  "proto",
  "unix-socket",
  "abstract-unix-socket",
  "cert-type",
  "key-type",
  "pass",
  "aws-sigv4",
  "oauth2-bearer",
  "url",
  "url-query",
  "time-cond",
  "continue-at",
  "speed-limit",
  "speed-time",
  "stderr",
  "trace",
  "trace-ascii",
  "keepalive-time",
  "happy-eyeballs-timeout-ms",
  "expect100-timeout",
  "alt-svc",
  "hsts",
  "etag-save",
  "etag-compare",
  "variable",
  "expand-url",
]);

/**
 * 値を取るオプションのうち、無視すると挙動が変わるもの。落としたことを警告に出す。
 * それ以外の値付きオプション（出力先やタイムアウトなど）は黙って捨てる。
 */
const WARN_VALUE = new Set([
  "F",
  "form",
  "form-string",
  "T",
  "upload-file",
  "x",
  "proxy",
  "resolve",
  "unix-socket",
  "abstract-unix-socket",
  "url-query",
  "aws-sigv4",
  "c",
  "cookie-jar",
  "y",
  "Y",
  "z",
  "time-cond",
  "C",
  "continue-at",
  "P",
  "Q",
  "t",
  "U",
]);

/** 取り込みの途中で集める値。 */
type Parsed = {
  method?: string;
  head: boolean;
  get: boolean;
  url?: string;
  headers: { key: string; value: string }[];
  data: string[];
  json?: string;
  user?: string;
  /** ファイルからの本文を落としたか。落としても curl は POST にするので、メソッドの推定に使う。 */
  droppedData: boolean;
  warnings: string[];
};

/**
 * `-H` の値をヘッダー名と値に分ける。
 *
 * `Name;` は curl で「空の値を送る」書き方なので、名前だけを取り出して値は空にする。
 * `:` も `;` も無いものはヘッダーとして扱えないので警告に回す。
 *
 * @param p 集めている途中の値
 * @param raw `-H` に渡された文字列
 */
function addHeader(p: Parsed, raw: string): void {
  const colon = raw.indexOf(":");
  if (colon > 0) {
    p.headers.push({ key: raw.slice(0, colon).trim(), value: raw.slice(colon + 1).trim() });
    return;
  }
  if (raw.endsWith(";") && raw.length > 1) {
    p.headers.push({ key: raw.slice(0, -1).trim(), value: "" });
    return;
  }
  p.warnings.push(`Ignored header without a value: ${raw}`);
}

/**
 * 1 つのオプションを解釈して {@link Parsed} に反映する。
 *
 * @param p 集めている途中の値
 * @param name オプション名。先頭の `-` は除いてある（`X` や `header` など）
 * @param value 値。値を取らないオプションでは undefined
 */
function applyOption(p: Parsed, name: string, value: string | undefined): void {
  const v = value ?? "";
  switch (name) {
    case "X":
    case "request":
      p.method = v.toUpperCase();
      return;
    case "H":
    case "header":
      addHeader(p, v);
      return;
    case "d":
    case "data":
    case "data-ascii":
    case "data-binary":
      // `@file` はファイルの中身を送る書き方。拡張からは読めないので落とす。
      if (v.startsWith("@")) {
        p.droppedData = true;
        p.warnings.push(`Dropped body from file: ${v}`);
        return;
      }
      p.data.push(v);
      return;
    case "data-raw":
      // --data-raw では @ に特別な意味が無く、そのまま送る。
      p.data.push(v);
      return;
    case "data-urlencode": {
      // 形は `content` `=content` `name=content` `@file` `name@file` の 5 つ。
      const eq = v.indexOf("=");
      const at = v.indexOf("@");
      if (eq < 0 && at >= 0) {
        p.droppedData = true;
        p.warnings.push(`Dropped body from file: ${v}`);
        return;
      }
      if (eq < 0) {
        p.data.push(encodeURIComponent(v));
      } else if (eq === 0) {
        p.data.push(encodeURIComponent(v.slice(1)));
      } else {
        p.data.push(`${v.slice(0, eq)}=${encodeURIComponent(v.slice(eq + 1))}`);
      }
      return;
    }
    case "json":
      // 複数回指定すると curl は連結する。
      p.json = (p.json ?? "") + v;
      return;
    case "u":
    case "user":
      p.user = v;
      return;
    case "oauth2-bearer":
      p.headers.push({ key: "Authorization", value: `Bearer ${v}` });
      return;
    case "A":
    case "user-agent":
      p.headers.push({ key: "User-Agent", value: v });
      return;
    case "e":
    case "referer":
      p.headers.push({ key: "Referer", value: v });
      return;
    case "b":
    case "cookie":
      // `=` が無ければ Cookie ファイルの指定。読めないので落とす。
      if (v.includes("=")) p.headers.push({ key: "Cookie", value: v });
      else p.warnings.push(`Dropped cookie file: ${v}`);
      return;
    case "I":
    case "head":
      p.head = true;
      return;
    case "G":
    case "get":
      p.get = true;
      return;
    case "url":
      p.url = v;
      return;
    default:
      if (WARN_VALUE.has(name)) {
        p.warnings.push(`Ignored -${name.length === 1 ? "" : "-"}${name}`);
      }
  }
}

/**
 * 単語の並びを走査して、オプションと URL を拾い出す。
 *
 * 短いオプションは `-sSL` のようにまとめて書ける。値を取るものは `-XPOST` のように
 * 値をくっつけても、次の単語に置いてもよい。
 *
 * @param tokens {@link tokenize} の結果。先頭の `curl` は含まない
 * @returns 集めた値
 */
function walk(tokens: string[]): Parsed {
  const p: Parsed = {
    head: false,
    get: false,
    headers: [],
    data: [],
    droppedData: false,
    warnings: [],
  };
  let i = 0;
  /** 次の単語を値として取り出す。無ければ undefined。 */
  const take = (): string | undefined => (i < tokens.length ? tokens[i++] : undefined);

  while (i < tokens.length) {
    const t = tokens[i++];

    if (t === "--") {
      // ここから先はすべて位置引数（URL）。
      const rest = tokens.slice(i);
      i = tokens.length;
      for (const r of rest) {
        if (p.url === undefined) p.url = r;
        else p.warnings.push(`Ignored extra argument: ${r}`);
      }
      break;
    }

    if (t.startsWith("--") && t.length > 2) {
      const name = t.slice(2);
      if (BOOL_LONG.has(name)) continue;
      if (VALUE_LONG.has(name)) {
        applyOption(p, name, take());
        continue;
      }
      if (name === "head" || name === "get") {
        applyOption(p, name, undefined);
        continue;
      }
      p.warnings.push(`Ignored unknown option: ${t}`);
      continue;
    }

    if (t.startsWith("-") && t.length > 1) {
      // まとめ書きされた短いオプションを 1 文字ずつほどく。
      let j = 1;
      while (j < t.length) {
        const ch = t[j];
        j++;
        if (BOOL_SHORT.has(ch)) continue;
        if (ch === "I" || ch === "G") {
          applyOption(p, ch, undefined);
          continue;
        }
        if (VALUE_SHORT.has(ch)) {
          // 残りが値。残りが無ければ次の単語が値。
          const rest = t.slice(j);
          applyOption(p, ch, rest !== "" ? rest : take());
          break;
        }
        p.warnings.push(`Ignored unknown option: -${ch}`);
      }
      continue;
    }

    if (p.url === undefined) p.url = t;
    else p.warnings.push(`Ignored extra argument: ${t}`);
  }
  return p;
}

/**
 * URL を origin と path に分け、localhost 以外を弾く。
 *
 * スキームが無ければ `http://` を補う。`localhost:3000/api` のように書かれることが多いため。
 * ユーザー情報（`user:pass@`）が付いていれば Basic 認証として返す。
 *
 * @param raw コマンドに書かれていた URL
 * @returns origin と path、およびユーザー情報があればその文字列
 * @throws URL として読めないとき、http/https 以外のとき、ホストが localhost / 127.0.0.1 でないとき
 */
function splitUrl(raw: string): { origin: string; path: string; user?: string } {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http and https are supported.");
  }
  if (!ALLOWED_HOSTS.has(u.hostname)) {
    throw new Error("Only localhost and 127.0.0.1 are allowed.");
  }
  const origin = `${u.protocol}//${u.hostname}`;
  if (!(ORIGINS as readonly string[]).includes(origin)) {
    throw new Error("Only localhost and 127.0.0.1 are allowed.");
  }
  const path = `${u.port ? `:${u.port}` : ""}${u.pathname}${u.search}`;
  const user =
    u.username !== ""
      ? `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`
      : undefined;
  return { origin, path, user };
}

/**
 * `a=1&b=2` の形なら行に分解する。
 *
 * すべての要素に `=` があるときだけ分解する。1 つでも無ければ、
 * フォームの形ではないので分解しない（呼び出し側は raw で送る）。
 *
 * @param joined `&` で繋いだ本文
 * @returns 行の配列。フォームの形でなければ null
 */
function toFormRows(joined: string): HeaderRow[] | null {
  const pieces = joined.split("&");
  if (pieces.some((s) => s === "" || !s.includes("="))) return null;
  return [...new URLSearchParams(joined).entries()].map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value,
    enabled: true,
  }));
}

/**
 * cURL コマンドを Draft に変換する。{@link toCurl} の逆。
 *
 * AI やドキュメントに載っている curl の例をそのまま貼って試せるようにするためのもの。
 * 送信先は {@link splitUrl} で localhost / 127.0.0.1 に限る。送信時にも
 * `buildUrl` が同じ判定をするので、防御は二重になっている。
 *
 * ボディの扱いは次のとおり。
 * - `--json` があれば raw。Content-Type と Accept を補う（curl と同じ挙動）
 * - Content-Type が JSON なら raw
 * - Content-Type が無い、またはフォームで、本文が `a=1&b=2` の形なら Form モード
 * - それ以外は raw。Content-Type が無ければ curl の既定に合わせてフォームのヘッダーを足す
 *
 * メソッドは `-X` があればそれ、`-I` なら HEAD、本文があれば POST、なければ GET。
 * これも curl の挙動に合わせている。
 *
 * @param text 貼り付けられたコマンド。先頭に `$ ` が付いていてもよい
 * @returns 変換した Draft と警告
 * @throws curl コマンドでないとき、URL が無いか不正なとき、メソッドが対応外のとき
 */
export function fromCurl(text: string): CurlImport {
  const tokens = tokenize(text);
  if (tokens[0] === "$") tokens.shift();
  if (tokens.length === 0 || !/^curl(\.exe)?$/i.test(tokens[0])) {
    throw new Error("Not a curl command.");
  }

  const p = walk(tokens.slice(1));
  if (p.url === undefined) throw new Error("No URL found.");

  const parsed = splitUrl(p.url);
  const origin = parsed.origin;
  const urlUser = parsed.user;
  let path = parsed.path;

  // -G は本文をクエリに回す。
  if (p.get && p.data.length > 0) {
    const q = p.data.join("&");
    path += (path.includes("?") ? "&" : "?") + q;
    p.data = [];
  }

  let method: string;
  if (p.method !== undefined) method = p.method;
  else if (p.head) method = "HEAD";
  else if (p.data.length > 0 || p.json !== undefined || p.droppedData) method = "POST";
  else method = "GET";
  if (!(METHODS as readonly string[]).includes(method)) {
    throw new Error(`Unsupported method: ${method}`);
  }

  const headers = p.headers.map((h) => ({ id: crypto.randomUUID(), ...h, enabled: true }));
  const has = (key: string) => headers.some((h) => h.key.toLowerCase() === key.toLowerCase());
  const basic = p.user ?? urlUser;
  if (basic !== undefined && !has("Authorization")) {
    const colon = basic.indexOf(":");
    const value =
      colon >= 0
        ? basicValue(basic.slice(0, colon), basic.slice(colon + 1))
        : basicValue(basic, "");
    headers.push({ id: crypto.randomUUID(), key: "Authorization", value, enabled: true });
  }

  let bodyMode: BodyMode = "fields";
  let body = "";
  let bodyFields: HeaderRow[] | undefined;

  if (p.json !== undefined) {
    bodyMode = "raw";
    body = p.json;
    if (!has("Content-Type")) {
      headers.push({
        id: crypto.randomUUID(),
        key: "Content-Type",
        value: "application/json",
        enabled: true,
      });
    }
    if (!has("Accept")) {
      headers.push({
        id: crypto.randomUUID(),
        key: "Accept",
        value: "application/json",
        enabled: true,
      });
    }
  } else if (p.data.length > 0) {
    const joined = p.data.join("&");
    const ct = headers.find((h) => h.key.toLowerCase() === "content-type")?.value ?? "";
    const rows = ct === "" || ct.includes("x-www-form-urlencoded") ? toFormRows(joined) : null;
    if (rows !== null) {
      bodyMode = "form";
      bodyFields = rows;
    } else {
      bodyMode = "raw";
      body = joined;
      // curl は -d の既定でフォームの Content-Type を付ける。raw では補完しないので明示する。
      if (ct === "") {
        headers.push({
          id: crypto.randomUUID(),
          key: "Content-Type",
          value: "application/x-www-form-urlencoded",
          enabled: true,
        });
      }
    }
  }

  if ((method === "GET" || method === "HEAD") && (body !== "" || bodyFields !== undefined)) {
    p.warnings.push(`${method} has no body; the data will not be sent`);
  }

  return {
    draft: normalizeDraft({
      method: method as Method,
      origin,
      path,
      headers,
      bodyMode,
      bodyFields,
      body,
      cookies: false,
    }),
    warnings: p.warnings,
  };
}
