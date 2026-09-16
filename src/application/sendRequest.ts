import { buildPayload } from "../domain/body";
import type { Draft } from "../domain/request";
import { prettyJson, type ResponseData, tryParseJson } from "../domain/response";
import { buildUrl } from "../domain/url";

/**
 * 無通信がこれだけ続いたら打ち切る時間（ミリ秒）。相手がローカルなので短めにしてある。
 *
 * 「送信してから合計で」ではなく「最後にデータが届いてから」の時間。
 * ストリーミングで少しずつ届き続ける応答は、届いている限り打ち切らない。
 */
export const TIMEOUT_MS = 15_000;

/**
 * 画面に載せるレスポンス本文の上限（バイト数）。
 *
 * これを超える分は捨てる。狭いサイドパネルで数MBの本文を文字列にして
 * そのまま描画すると、パネルが固まって操作できなくなるため。
 *
 * ローカルの静的サーバー（README が案内している `python3 -m http.server` など）を
 * 相手にすると、大きなファイルを 1 回の GET で引いてしまうことが実際にある。
 *
 * 履歴側の {@link BODY_LIMIT}（30KB）とは別物。あちらは書き込み量を抑えるための上限で、
 * こちらは受け取った直後に画面が耐えられる量の上限。
 */
export const RESPONSE_LIMIT = 1024 * 1024;

/**
 * 受信の途中経過。ヘッダーが届いた時点で 1 回、以後はチャンクが届くたびに通知される。
 *
 * `bodyText` は上限までの本文で、上限を超えたあとは増えない。
 * `size` は上限に関係なく、受け取ったバイト数を数え続ける。
 */
export type Progress = {
  status: number;
  statusText: string;
  headers: [string, string][];
  bodyText: string;
  size: number;
  truncated: boolean;
};

/**
 * 送信の結果。失敗も例外ではなくこの型で返るので、呼び出し側は try/catch を書かなくていい。
 *
 * `reason` の意味は次のとおり。
 * - `invalid` … URL を組み立てられなかった。リクエストは飛んでいない
 * - `timeout` … 無通信が {@link TIMEOUT_MS} を超えた
 * - `cancelled` … ユーザーが中断した
 * - `network` … 接続できなかった（サーバーが起動していない、ポート違いなど）
 */
export type SendOutcome =
  | { ok: true; data: ResponseData }
  | { ok: false; reason: "invalid" | "timeout" | "cancelled" | "network"; message: string };

/**
 * リクエストを送り、結果の Promise と中断用の関数を返す。
 *
 * AbortController を呼び出し側に触らせないための包み。
 * 画面側は返ってきた `cancel` を保持して、必要なときに呼ぶだけでよい。
 *
 * @param draft 送信する内容
 * @param timeoutMs 無通信の上限。省略時は {@link TIMEOUT_MS}。テストから短くするために開けてある
 * @param onProgress 受信の途中経過を受け取る関数。省略可。呼ばれる頻度はチャンク次第なので、
 *   描画に使うなら呼び出し側で間引くこと
 * @returns `promise` は必ず解決する（reject しない）。失敗は {@link SendOutcome} として返る。
 */
export function createSend(
  draft: Draft,
  timeoutMs: number = TIMEOUT_MS,
  onProgress?: (p: Progress) => void,
): { promise: Promise<SendOutcome>; cancel: () => void } {
  const controller = new AbortController();
  return {
    promise: run(draft, controller, timeoutMs, onProgress),
    // タイムアウトと区別できるよう、中断の理由を signal に載せておく。
    cancel: () => controller.abort("cancel"),
  };
}

/**
 * 実際の送信処理。
 *
 * 本文は丸ごと待たずに、届いた分から順に読む。そのため巨大な本文でも
 * 上限を超えた時点で文字列化を止められ、SSE のように終わらない応答も
 * 届いている途中の内容を画面に出せる。
 *
 * 所要時間はボディを受け取り終えるまでを測る。ヘッダーだけの時間ではないので、
 * 大きなレスポンスでは転送時間も含まれる。
 *
 * @param draft 送信する内容
 * @param controller タイムアウトと中断の両方に使う。理由の文字列で区別する
 * @param timeoutMs 無通信の上限（ミリ秒）
 * @param onProgress 途中経過の通知先。省略可
 * @returns 成功なら {@link ResponseData}、失敗なら理由付きの {@link SendOutcome}。
 */
async function run(
  draft: Draft,
  controller: AbortController,
  timeoutMs: number,
  onProgress?: (p: Progress) => void,
): Promise<SendOutcome> {
  // URL の組み立て失敗はリクエストを出す前に分かるので、タイマーを張る前に返す。
  let url: URL;
  try {
    url = buildUrl(draft.origin, draft.path);
  } catch (e) {
    return {
      ok: false,
      reason: "invalid",
      message: e instanceof Error ? e.message : "Invalid URL.",
    };
  }

  // 無通信タイマー。ヘッダー待ちにも、チャンクとチャンクの間にも同じものを使い、
  // 何か届くたびに張り直す。
  let timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  };

  // 自動付与ヘッダーを先に置いてから上書きする。同じ名前をユーザーが
  // 指定していれば、そちらが勝つ。
  const payload = buildPayload(draft);
  const headers: Record<string, string> = { ...payload.autoHeaders };
  for (const h of draft.headers) {
    if (h.enabled && h.key.trim() !== "") headers[h.key.trim()] = h.value;
  }

  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: draft.method,
      headers,
      body: payload.body !== "" ? payload.body : undefined,
      signal: controller.signal,
      // 開発中に古いレスポンスが返ってきて変更に気づけない、という事故を防ぐ。
      cache: "no-store",
      // 拡張のページと localhost は別オリジンなので、既定では Cookie が付かない。
      // ユーザーが明示的に選んだときだけ、Chrome が持つ localhost の Cookie を付ける。
      credentials: draft.cookies ? "include" : "omit",
    });
    touch();

    const head = {
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()] as [string, string][],
    };
    onProgress?.({ ...head, bodyText: "", size: 0, truncated: false });

    // 上限までの生バイト。ファイル保存で文字化けさせないために、文字列とは別に持つ。
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    // ストリームモードで少しずつ復号すると、チャンクの切れ目が多バイト文字の
    // 途中でも壊れない。バイト列を連結してから一度に復号するより、メモリも要らない。
    const decoder = new TextDecoder();
    let bodyText = "";
    let size = 0;
    let truncated = false;

    // HEAD や 204 のように本文が無いときは body が null になる。
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await readChunk(reader, controller.signal);
        if (done) break;
        touch();
        const before = size;
        size += value.byteLength;
        if (!truncated) {
          const room = RESPONSE_LIMIT - before;
          // 上限をまたぐチャンクは、収まる分だけ取り込んで残りを捨てる。
          const part = value.byteLength <= room ? value : value.subarray(0, room);
          chunks.push(part);
          bodyText += decoder.decode(part, { stream: true });
          truncated = part !== value;
        }
        // 上限を超えたあとも、受け取った量は数え続けて通知する。
        onProgress?.({ ...head, bodyText, size, truncated });
      }
      // 切ったときは流さない。切れ目に残った不完全な文字が、置換文字として出てしまうため。
      if (!truncated) bodyText += decoder.decode();
    }

    const timeMs = Math.round(performance.now() - started);
    const ct = response.headers.get("content-type") ?? "";

    return {
      ok: true,
      data: {
        request: {
          method: draft.method,
          url: url.href,
          headers: Object.entries(headers),
          body: payload.body,
          cookies: draft.cookies,
        },
        status: head.status,
        statusText: head.statusText,
        timeMs,
        // 切ったあとも、サイズは受け取った本当の量を出す。
        size,
        headers: head.headers,
        bodyText,
        bytes: new Blob(chunks, { type: ct }),
        // 切れているなら JSON として解釈しない。{@link ResponseData.json} を参照。
        json: truncated ? undefined : tryParseJson(ct, bodyText),
        pretty: truncated ? null : prettyJson(ct, bodyText),
        truncated,
      },
    };
  } catch {
    // fetch は中断でも接続失敗でも同じように例外を投げるので、
    // signal を見て「打ち切ったのか、そもそも繋がらなかったのか」を分ける。
    if (controller.signal.aborted) {
      return controller.signal.reason === "timeout"
        ? {
            ok: false,
            reason: "timeout",
            message: `Timed out: no data for ${timeoutMs / 1000}s.`,
          }
        : { ok: false, reason: "cancelled", message: "Request cancelled." };
    }
    return {
      ok: false,
      reason: "network",
      message:
        url.protocol === "https:"
          ? "Could not connect. Is your server running on that port? For https, Chrome must also trust the certificate."
          : "Could not connect. Is your server running on that port?",
    };
  } finally {
    // 成功しても失敗しても、張りっぱなしのタイマーを必ず片づける。
    clearTimeout(timer);
  }
}

/**
 * チャンクを 1 つ読む。読んでいる途中で中断されたら、その時点で例外を投げる。
 *
 * 本物の fetch なら中断で本文のストリームも壊れて read が失敗するが、
 * ストリームによってはそうならず、read が永遠に待ち続けることがある。
 * そのため中断の合図と競走させて、どちらが先でも必ず戻るようにしてある。
 *
 * @param reader 本文のリーダー
 * @param signal 中断の合図
 * @returns 読めたチャンク。終端なら `done` が true
 * @throws 中断されたとき。理由は signal に載っているものをそのまま投げる
 */
function readChunk<T>(
  reader: ReadableStreamDefaultReader<T>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<T>> {
  if (signal.aborted) return Promise.reject(signal.reason);
  const read = reader.read();
  // 負けた側の read があとで失敗しても、誰も待っていないので握りつぶす。
  read.catch(() => {});
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reader.cancel().catch(() => {});
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    read.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
