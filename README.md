# Local API Client

[日本語](README.ja.md)

A minimal REST client for localhost, as a Chrome extension side panel.

![Local API Client](docs/screenshot.png)

## Principles

- **Least privilege**: `permissions` is only `sidePanel` and `storage`. `host_permissions` is only localhost / 127.0.0.1
- **Zero external communication**: no analytics, no cloud sync, no external fonts. Your data never leaves your machine
- **Only what is needed**: build a request, send it, read the response.

## Features

- GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS with custom headers
- Body as key-value **Fields** (sent as JSON), **Form** (`application/x-www-form-urlencoded`), or **Raw** text
- **Streaming**: the response is shown as it arrives, so SSE and other long-lived responses work
- **Copy as cURL** and **Paste cURL**: paste a `curl` command from docs or an AI and it becomes the request
- **Auth** helper for Bearer and Basic, and an opt-in **Send cookies** switch
- History with responses, saved requests with groups, export / import as a JSON file
- Keyboard: `Ctrl+Shift+L` / `⌘⇧L` opens the panel, `Ctrl+Enter` / `⌘↵` sends

## Privacy

Nothing is collected or transmitted. Everything stays in `chrome.storage.local`
on your device. See the [Privacy Policy](PRIVACY.md) for details.

## Install

[Chrome Web Store](https://chromewebstore.google.com/detail/local-api-client/ihmoinkdbohnodnjpkdmenkmiikllfgp). Requires Chrome 116 or later.

## Try it

```bash
npm run demo
```

This starts a small API on http://localhost:3000 with no extra dependencies: users you can list, create and delete, a login that sets a cookie, a route that needs a Bearer token, a server-sent event stream, a slow route, a 2 MB body and a 500. Open http://localhost:3000 in a tab for the list with curl examples. In the extension, pick `http://localhost` and type `:3000/users`.

## Development

```bash
npm install
npm run build   # outputs to dist/
npm run dev     # to check the UI in a browser (chrome.* APIs do not work)
```

To run your build in Chrome:

1. Open `chrome://extensions`
2. Turn on "Developer mode" in the top right
3. "Load unpacked" → select the `dist/` folder

To try it out, use `npm run demo` above, or any local server:

```bash
python3 -m http.server 3000
# In the extension: GET http://localhost + :3000/ → a 200 means it works
```

`npm run screenshots` regenerates the store images in `docs/store/` (1280x800 screenshots and promo tiles, English and Japanese). It drives your installed Google Chrome through `playwright-core`, so nothing extra is downloaded.

## Notes

- **Body (Fields)** values keep their JSON type when they parse (`30` → number, `"30"` → string, `true` → boolean), and are sent as plain strings otherwise. `application/json` is added automatically unless you set a Content-Type
- **Body (Form)** sends the same rows as `application/x-www-form-urlencoded`. Values are sent as strings, and repeated keys are kept
- **Paste cURL** understands `-X`, `-H`, `-d` / `--data-*`, `--json`, `-u`, `-G`, `-I`, `-b`, `-A` and ignores flags that do not change the request (`-s`, `-k`, `-L`, …). Bodies read from files (`-d @file`) and multipart (`-F`) are dropped with a warning. Anything not on localhost / 127.0.0.1 is rejected. You can also paste a command straight into the path field
- **Send cookies** is off by default. When on, Chrome attaches the cookies it holds for localhost to the request, and a `Set-Cookie` in the response is stored by Chrome
- **Responses are shown as they arrive.** A request is cut off after 15 seconds *without data*, not 15 seconds in total, so a stream that keeps sending is never cut. Cancel keeps what arrived so far
- **Responses are read up to 1 MB.** Anything past that is dropped and marked `truncated`,
  to keep a huge response from freezing the panel. The size shown is always the real one
- **Very large bodies are shown in part at first.** The first 100,000 characters are rendered, and *Show all* renders the rest. The tree view shows 200 children per level and offers *Show more*. Copy and Download always use the whole body
- **Download** saves the body exactly as received, named after the path and the Content-Type. It is not offered for truncated bodies
- **History and saved requests hold 30 entries each.** Older ones are dropped automatically
- **History keeps the response too**, so clicking an entry brings back what you got.
  Bodies kept in history are capped at 30 KB; anything longer is cut and marked `truncated`
- **A `truncated` body is never parsed as JSON**, so the raw text is shown instead of the tree
- **Export files contain your headers and bodies as-is**
- **Shortcuts** can be changed at `chrome://extensions/shortcuts`

## Test and Lint

```bash
npm test          # run Vitest once
npm run test:watch
npm run lint      # Biome (lint + format check)
npm run lint:fix  # apply fixes
```

## Contributing

As a security policy, **pull requests are not being accepted for now.**

Please open an Issue for bug reports and suggestions.

## About development

This project is built with the help of [Claude](https://claude.com) (Anthropic).
