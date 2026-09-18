# Store assets

Everything to submit to the Chrome Web Store.

| Path | What | How to make |
|---|---|---|
| `local-api-client-<version>.zip` | The package to upload. Git-ignored | `npm run pack` |
| `en/01-tree.png` … `en/05-saved.png` | Screenshots, 1280x800, upload up to 5 | `npm run screenshots` |
| `en/promo-small-440x280.png` | Small promo tile | same |
| `en/promo-marquee-1400x560.png` | Marquee promo tile | same |
| `ja/…` | Optional set with Japanese captions, not kept in the repo | `npm run screenshots -- --lang ja` |
| `description.en.txt`, `description.ja.txt` | Detailed description for the store listing, plain text | edit by hand |

The captions live in `scripts/store-screenshots.mjs` under `TEXT`. Every run changes the image
bytes (timestamps and timings appear in the panel), so commit new images only when the look changed.

## Microsoft Edge Add-ons

Same package, same images. In Partner Center, fill in:

| Field | Value |
|---|---|
| Package | `local-api-client-<version>.zip` from `npm run pack` |
| Name | Local API Client |
| Short description | the `extDescription` text in `public/_locales/en/messages.json` |
| Description | `description.en.txt` (and `description.ja.txt` under Japanese) |
| Category | Developer tools |
| Privacy policy URL | https://github.com/kojirock5260/local-api-client/blob/main/PRIVACY.md |
| Support URL | https://github.com/kojirock5260/local-api-client/issues |
| Screenshots | `en/01-tree.png` to `en/05-saved.png` |
| Small promotional tile | `en/promo-small-440x280.png` |
| Large promotional tile | `en/promo-marquee-1400x560.png` |
| Notes for certification | "REST client that only talks to localhost / 127.0.0.1. To test, start any local HTTP server, e.g. `python3 -m http.server 3000`, open the side panel and send GET http://localhost :3000/." |
