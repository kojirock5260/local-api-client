# Changelog

## 1.0.0 (2026-09-17)

### Added

- **Streaming responses.** The body is shown as it arrives, so SSE and other long-lived responses work. Cancel keeps what arrived so far.
- **Form body mode.** The same key-value rows as Fields, sent as `application/x-www-form-urlencoded`. Values stay strings and repeated keys are kept.
- **Paste cURL.** Paste a `curl` command (from docs, an AI, or DevTools) into the Paste dialog or straight into the path field. Understands `-X`, `-H`, `-d` / `--data-*`, `--json`, `-u`, `-G`, `-I`, `-b`, `-A`; drops file bodies and multipart with a warning; rejects anything not on localhost.
- **Send cookies** switch per request, off by default. When on, Chrome's cookies for localhost are attached and `Set-Cookie` responses are stored by Chrome.
- **Auth helper** that writes a Bearer or Basic `Authorization` header.
- **Keyboard shortcuts.** `Ctrl+Shift+L` / `⌘⇧L` opens the panel, `Ctrl+Enter` / `⌘↵` sends from anywhere in the panel.
- **Format** button and an invalid-JSON note under a Raw body that looks like JSON.
- **Download** button that saves the response body exactly as received.
- **Duplicate** button for saved requests.
- Large bodies render in part at first (100,000 characters, 200 tree children per level) with *Show all* / *Show more*, so a 1 MB response no longer freezes the panel.
- Japanese store description and UI strings for the manifest (`_locales/ja`).

### Changed

- The timeout now means 15 seconds *without data*, not 15 seconds in total.
- A truncated body no longer ends in a broken multibyte character.
- Connection failures to an `https` origin mention that Chrome must trust the certificate.
- Chrome 116 or later is required, for the shortcut that opens the panel.
- Toasts now appear at the bottom right and never block clicks on the tabs.

### Compatibility

- Export files keep `version: 1`. New fields are optional, so older versions still import them: the Form mode falls back to Fields and the cookie switch is ignored.
- Requests saved by earlier versions load unchanged.

## 0.7.3 and earlier

Initial releases: requests with headers and a JSON or raw body, history with responses, saved requests with groups, export / import, copy as cURL, a JSON tree view, and the localhost-only guarantee.
