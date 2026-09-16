#!/usr/bin/env node
/**
 * Local API Client を試すためのデモ API。依存なし、Node だけで動く。
 *
 *   npm run demo             # http://localhost:3000
 *   PORT=8080 npm run demo   # ポートを変える
 *
 * 用意している経路は次のとおり。`GET /` を開くと同じ一覧が HTML で出る。
 *
 *   GET    /users            ユーザー一覧（JSON）
 *   GET    /users/:id        1 人分。無ければ 404
 *   POST   /users            JSON かフォームを受けて 201 で返す。name が無ければ 400
 *   PATCH  /users/:id        一部更新
 *   DELETE /users/:id        204
 *   POST   /login            Cookie（session）を発行する
 *   GET    /me               Cookie が無いと 401。Send cookies の確認用
 *   GET    /secret           Authorization: Bearer demo-token が無いと 401
 *   ANY    /echo             メソッド・ヘッダー・本文をそのまま返す
 *   GET    /events           SSE。0.4 秒ごとに 10 件
 *   GET    /slow             3 秒待ってから返す
 *   GET    /big              約 2MB の JSON。truncated 表示の確認用
 *   GET    /stall            最初の 1 行だけ送って止まる。Cancel と無通信タイムアウトの確認用
 *   GET    /error            500 と application/problem+json
 *
 * CORS を開けてあるので、`npm run dev` のページからも叩ける。
 * データはメモリ上だけで、再起動すると元に戻る。
 */
import http from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 3000;
const SESSION = "demo-session";
const TOKEN = "demo-token";

/** 起動時のユーザー一覧。POST や DELETE で増減する。 */
function seedUsers() {
  const tz = "Asia/Tokyo";
  return [
    {
      id: 1,
      name: "Sato Hana",
      email: "hana@example.com",
      active: true,
      roles: ["admin", "developer"],
      profile: { age: 29, city: "Tokyo", timezone: tz },
    },
    {
      id: 2,
      name: "Suzuki Ken",
      email: "ken@example.com",
      active: true,
      roles: ["developer"],
      profile: { age: 41, city: "Osaka", timezone: tz },
    },
    {
      id: 3,
      name: "Takahashi Mei",
      email: "mei@example.com",
      active: false,
      roles: ["editor"],
      profile: { age: 33, city: "Fukuoka", timezone: tz },
    },
    {
      id: 4,
      name: "Tanaka Ren",
      email: "ren@example.com",
      active: true,
      roles: [],
      profile: { age: 25, city: "Sapporo", timezone: tz },
    },
    {
      id: 5,
      name: "Ito Yui",
      email: "yui@example.com",
      active: true,
      roles: ["developer", "support"],
      profile: { age: 37, city: "Nagoya", timezone: tz },
    },
  ];
}

/** `GET /` に出す一覧。左からメソッド、パス、説明、curl の例。 */
const ENDPOINTS = [
  ["GET", "/users", "List users", "curl http://localhost:PORT/users"],
  ["GET", "/users/1", "One user, 404 when missing", "curl http://localhost:PORT/users/1"],
  [
    "POST",
    "/users",
    "Create (JSON or form). 400 without name",
    `curl -X POST http://localhost:PORT/users -H 'Content-Type: application/json' -d '{"name":"Takahashi Mei","email":"mei@example.com"}'`,
  ],
  [
    "PATCH",
    "/users/1",
    "Partial update",
    `curl -X PATCH http://localhost:PORT/users/1 -H 'Content-Type: application/json' -d '{"active":false}'`,
  ],
  ["DELETE", "/users/1", "Delete, returns 204", "curl -X DELETE http://localhost:PORT/users/1"],
  [
    "POST",
    "/login",
    "Sets a session cookie",
    "curl -X POST http://localhost:PORT/login -c jar.txt",
  ],
  [
    "GET",
    "/me",
    "401 without the cookie. Try Send cookies",
    "curl http://localhost:PORT/me -b jar.txt",
  ],
  [
    "GET",
    "/secret",
    "401 without Authorization: Bearer demo-token",
    "curl http://localhost:PORT/secret -H 'Authorization: Bearer demo-token'",
  ],
  [
    "ANY",
    "/echo",
    "Echoes method, headers, query and body",
    `curl -X PUT http://localhost:PORT/echo?x=1 -d 'a=1&b=2'`,
  ],
  [
    "GET",
    "/events",
    "Server-sent events, 10 over 4 seconds",
    "curl -N http://localhost:PORT/events",
  ],
  ["GET", "/slow", "Answers after 3 seconds", "curl http://localhost:PORT/slow"],
  ["GET", "/big", "About 2 MB of JSON", "curl -s http://localhost:PORT/big | wc -c"],
  [
    "GET",
    "/stall",
    "One line, then silence forever",
    "curl -N --max-time 5 http://localhost:PORT/stall",
  ],
  ["GET", "/error", "500 with application/problem+json", "curl -i http://localhost:PORT/error"],
];

/**
 * 応答を返す。オブジェクトなら JSON に、文字列ならそのまま。
 *
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} body 省略時は本文なし
 * @param {Record<string, string>} headers 追加ヘッダー
 */
function send(res, status, body, headers = {}) {
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  const isText = typeof body === "string";
  res.writeHead(status, {
    "Content-Type": isText ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers,
  });
  res.end(isText ? body : JSON.stringify(body, null, 2));
}

/**
 * 本文を Content-Type に応じて解釈する。
 *
 * @param {string} raw
 * @param {string} contentType
 * @returns {{ value: unknown, error?: string }}
 */
function parseBody(raw, contentType) {
  if (raw === "") return { value: null };
  if (contentType.includes("json")) {
    try {
      return { value: JSON.parse(raw) };
    } catch {
      return { value: raw, error: "body is not valid JSON" };
    }
  }
  if (contentType.includes("x-www-form-urlencoded")) {
    return { value: Object.fromEntries(new URLSearchParams(raw)) };
  }
  return { value: raw };
}

/**
 * Cookie ヘッダーから session の値を取り出す。
 *
 * @param {http.IncomingMessage} req
 * @returns {string | null}
 */
function sessionOf(req) {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === "session") return v.join("=");
  }
  return null;
}

/**
 * `GET /` の HTML。
 *
 * @param {number} port
 * @returns {string}
 */
function indexHtml(port) {
  const rows = ENDPOINTS.map(
    ([m, p, d, c]) =>
      `<tr><td><b>${m}</b></td><td><code>${p}</code></td><td>${d}</td><td><code>${c.replaceAll("PORT", String(port)).replaceAll("<", "&lt;")}</code></td></tr>`,
  ).join("\n");
  return `<!doctype html><meta charset="utf-8"><title>Local API Client demo</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:32px;max-width:1100px;color:#24272c}code{font-family:ui-monospace,Menlo,monospace;font-size:12px}table{border-collapse:collapse}td{padding:6px 12px;border-bottom:1px solid #e2e1dc;vertical-align:top}@media(prefers-color-scheme:dark){body{background:#16181d;color:#d9dce2}td{border-color:#2c3038}}</style>
<h1>Local API Client demo server</h1>
<p>Running on <code>http://localhost:${port}</code>. In the extension, pick <code>http://localhost</code> and type <code>:${port}/users</code>.</p>
<table>${rows}</table>`;
}

/**
 * サーバーを立ち上げる。
 *
 * @param {{ port?: number, quiet?: boolean }} opts
 * @returns {Promise<http.Server>} listen が終わったサーバー
 */
export function start({ port = DEFAULT_PORT, quiet = false } = {}) {
  let users = seedUsers();
  let nextId = users.length + 1;

  const server = http.createServer((req, res) => {
    // どのオリジンからでも叩けるようにする。Cookie 付きも通すので `*` ではなく Origin を返す。
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] ?? "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Expose-Headers", "Content-Type, Content-Length, X-Request-Id");
    res.setHeader("Vary", "Origin");
    res.setHeader("X-Request-Id", Math.random().toString(36).slice(2, 10));
    if (req.method === "OPTIONS") {
      send(res, 204);
      return;
    }

    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const method = req.method ?? "GET";
      const path = url.pathname;
      const contentType = (req.headers["content-type"] ?? "").toLowerCase();
      const body = parseBody(raw, contentType);
      const idMatch = path.match(/^\/users\/(\d+)$/);

      if (path === "/" && method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(indexHtml(port));
        return;
      }

      if (path === "/users" && (method === "GET" || method === "HEAD")) {
        send(res, 200, {
          users,
          total: users.length,
          page: 1,
          hasNext: false,
          generatedAt: new Date().toISOString(),
        });
        return;
      }

      if (path === "/users" && method === "POST") {
        const v = body.value;
        if (body.error) {
          send(res, 400, { error: body.error });
          return;
        }
        if (!v || typeof v !== "object" || typeof v.name !== "string" || v.name.trim() === "") {
          send(res, 400, { error: "name is required", received: v });
          return;
        }
        const user = {
          id: nextId++,
          active: true,
          roles: [],
          ...v,
          createdAt: new Date().toISOString(),
        };
        users.push(user);
        send(res, 201, user, { Location: `/users/${user.id}` });
        return;
      }

      if (idMatch) {
        const id = Number(idMatch[1]);
        const user = users.find((u) => u.id === id);
        if (method === "GET" || method === "HEAD") {
          if (user) send(res, 200, user);
          else send(res, 404, { error: "user not found", id });
          return;
        }
        if (method === "PATCH" || method === "PUT") {
          if (!user) {
            send(res, 404, { error: "user not found", id });
            return;
          }
          if (body.error) {
            send(res, 400, { error: body.error });
            return;
          }
          Object.assign(user, body.value ?? {}, { updatedAt: new Date().toISOString() });
          send(res, 200, user);
          return;
        }
        if (method === "DELETE") {
          if (!user) {
            send(res, 404, { error: "user not found", id });
            return;
          }
          users = users.filter((u) => u.id !== id);
          send(res, 204);
          return;
        }
      }

      if (path === "/login" && method === "POST") {
        send(
          res,
          200,
          { ok: true, user: users[0], note: "Cookie set. Turn on Send cookies, then GET /me." },
          { "Set-Cookie": `session=${SESSION}; Path=/; SameSite=Lax; HttpOnly` },
        );
        return;
      }

      if (path === "/me" && method === "GET") {
        if (sessionOf(req) === SESSION) send(res, 200, { user: users[0], session: SESSION });
        else
          send(res, 401, {
            error: "not logged in",
            hint: "POST /login first, then turn on Send cookies",
          });
        return;
      }

      if (path === "/secret" && method === "GET") {
        if (req.headers.authorization === `Bearer ${TOKEN}`) {
          send(res, 200, { secret: "The cake is real.", issuedTo: TOKEN });
        } else {
          send(
            res,
            401,
            { error: "missing or wrong token", hint: `Authorization: Bearer ${TOKEN}` },
            { "WWW-Authenticate": "Bearer" },
          );
        }
        return;
      }

      if (path === "/echo") {
        send(res, 200, {
          method,
          path,
          query: Object.fromEntries(url.searchParams),
          headers: req.headers,
          body: body.value,
        });
        return;
      }

      if (path === "/events" && method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.flushHeaders();
        const steps = [
          "connecting",
          "authenticating",
          "loading users",
          "loading roles",
          "indexing",
          "resolving",
          "rendering",
          "verifying",
          "cleaning up",
          "done",
        ];
        let i = 0;
        const timer = setInterval(() => {
          const step = i + 1;
          res.write(
            `event: progress\ndata: ${JSON.stringify({ step, of: steps.length, status: steps[i] })}\n\n`,
          );
          i++;
          if (i >= steps.length) {
            clearInterval(timer);
            res.end();
          }
        }, 400);
        // req の close は GET だと本文を読み終えた時点で発火するので、res 側で見る。
        res.on("close", () => clearInterval(timer));
        return;
      }

      if (path === "/slow" && method === "GET") {
        setTimeout(() => send(res, 200, { slow: true, waitedMs: 3000 }), 3000);
        return;
      }

      if (path === "/big" && method === "GET") {
        const items = Array.from(
          { length: 60000 },
          (_, i) => `{"i":${i},"pad":"xxxxxxxxxxxxxxxxxxxx"}`,
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(`[${items.join(",")}]`);
        return;
      }

      if (path === "/stall" && method === "GET") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.flushHeaders();
        res.write("first line arrived, then the server went quiet\n");
        // 意図的に終わらせない。
        return;
      }

      if (path === "/error" && method === "GET") {
        send(
          res,
          500,
          {
            type: "about:blank",
            title: "Internal Server Error",
            status: 500,
            detail: "Something went wrong on purpose.",
          },
          { "Content-Type": "application/problem+json" },
        );
        return;
      }

      send(res, 404, { error: "not found", method, path });
    });
  });

  return new Promise((resolveStart) => {
    server.listen(port, () => {
      if (!quiet) {
        console.log(`Local API Client demo server: http://localhost:${port}`);
        console.log("In the extension: GET http://localhost + :%d/users", port);
        console.log("Open http://localhost:%d in a tab for the full list.", port);
      }
      resolveStart(server);
    });
  });
}

// `node scripts/demo-server.mjs` で直接動かしたときだけ起動する。import されたときは何もしない。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start({ port: Number(process.env.PORT) || DEFAULT_PORT });
}
