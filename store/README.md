# Store assets

Everything to submit to the Chrome Web Store.

| Path | What | How to make |
|---|---|---|
| `local-api-client-<version>.zip` | The package to upload. Git-ignored | `npm run pack` |
| `en/01-tree.png` … `en/05-saved.png` | Screenshots, 1280x800, upload up to 5 | `npm run screenshots` |
| `en/promo-small-440x280.png` | Small promo tile | same |
| `en/promo-marquee-1400x560.png` | Marquee promo tile | same |
| `ja/…` | The same set with Japanese captions | `npm run screenshots -- --lang ja` |

The captions live in `scripts/store-screenshots.mjs` under `TEXT`. Every run changes the image
bytes (timestamps and timings appear in the panel), so commit new images only when the look changed.
