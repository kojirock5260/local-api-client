# Store assets

Everything to submit to the Chrome Web Store.

| Path | What | How to make |
|---|---|---|
| `local-api-client-<version>.zip` | The package to upload. Git-ignored | `npm run pack` |
| `en/01-tree.png` … `en/05-saved.png` | Screenshots, 1280x800, upload up to 5 | `npm run screenshots` |
| `en/promo-small-440x280.png` | Small promo tile | same |
| `en/promo-marquee-1400x560.png` | Marquee promo tile | same |
| `ja/…` | Optional set with Japanese captions, not kept in the repo | `npm run screenshots -- --lang ja` |
| `description.en.txt`, `description.ja.txt` | Detailed description for the Chrome listing, plain text | edit by hand |
| `description.edge.en.txt`, `description.edge.ja.txt` | The same for the Edge listing (sidebar wording) | edit by hand |

The captions live in `scripts/store-screenshots.mjs` under `TEXT`. Every run changes the image
bytes (timestamps and timings appear in the panel), so commit new images only when the look changed.

## Microsoft Edge Add-ons

Same package, same images. In Partner Center, fill in:

| Field | Value |
|---|---|
| Package | `local-api-client-<version>.zip` from `npm run pack` |
| Name | Local API Client |
| Short description | the `extDescription` text in `public/_locales/en/messages.json` |
| Description | `description.edge.en.txt` (and `description.edge.ja.txt` under Japanese). Same text as the Chrome one with Edge wording |
| Short description (250 chars) | A minimal REST client for localhost in Microsoft Edge's sidebar. Send HTTP requests, read JSON as a tree, paste curl commands, watch responses stream in. No account, no cloud, zero external communication. Talks only to localhost and 127.0.0.1. |
| Search terms (up to 7) | REST client, API client, localhost, HTTP client, JSON viewer, curl, sidebar |
| Website URL | https://kojirock5260.github.io/local-api-client/ |
| Store logo (300x300) | `en/logo-300x300.png` |
| Category | Developer tools |
| Privacy policy URL | https://github.com/kojirock5260/local-api-client/blob/main/PRIVACY.md |
| Support URL | https://github.com/kojirock5260/local-api-client/issues |
| Screenshots | `en/01-tree.png` to `en/05-saved.png` |
| Small promotional tile | `en/promo-small-440x280.png` |
| Large promotional tile | `en/promo-marquee-1400x560.png` |
| Notes for certification | "REST client that only talks to localhost / 127.0.0.1. To test, start any local HTTP server, e.g. `python3 -m http.server 3000`, open the side panel and send GET http://localhost :3000/." |
