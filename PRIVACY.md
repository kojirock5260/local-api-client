# Privacy Policy

**Local API Client** (the "extension")

Last updated: 2026-08-05

## Summary

The extension collects nothing, sends nothing, and has no server.
Everything you type stays on your machine.

## What is stored, and where

The extension stores three things in `chrome.storage.local`, which lives on your
own device:

| Key | Contents |
|---|---|
| `editor` | The request you are currently editing (method, URL, headers, body) |
| `history` | Up to 30 past requests, together with their responses |
| `saved` | Up to 30 requests you explicitly saved, with names and groups |

Response bodies kept in history are capped at 30 KB; anything longer is truncated.

`chrome.storage.sync` is **not** used. That API would replicate data through
Google's servers to sync across devices, which would break the guarantee that
your data never leaves your machine.

Uninstalling the extension removes this data along with it.

## What is sent over the network

Only the HTTP requests you build and send yourself.

Before a request is sent, its destination is parsed and rejected unless the host
is `localhost` or `127.0.0.1`. Chrome enforces the same limit independently: the
extension's `host_permissions` are `http://localhost/*`, `http://127.0.0.1/*`,
`https://localhost/*` and `https://127.0.0.1/*`.

Like any HTTP client, the extension follows redirects returned by the server you
send to. If a local server responds with a redirect to somewhere else, the
request follows it. That is the server's behavior, not something the extension
initiates or sends on its own.

There is no analytics, no crash reporting, no cloud sync, no external fonts, and
no remote code. The extension makes no connection to the developer or to any
third party.

## What is not collected

- Personally identifiable information
- Health, financial, or authentication information
- Location, browsing history, or web page contents
- Usage or telemetry data of any kind

## Permissions

| Permission | Why it is needed |
|---|---|
| `sidePanel` | Renders the extension's UI in Chrome's side panel |
| `storage` | Saves your draft, history, and saved requests locally |
| `host_permissions` (localhost, 127.0.0.1) | Sends the requests you build to your local development server |

## Files you export

Exporting saved requests writes a JSON file to a location you choose. That file
contains your headers and bodies as-is, including any credentials you typed into
them. Handle exported files accordingly.

## Third parties

The extension shares no data with anyone, and it is not used for advertising,
profiling, or credit assessment.

## Changes to this policy

Changes will be published in this file. The "Last updated" date above reflects
the most recent revision.

## Contact

Please open an issue at
https://github.com/kojirock5260/local-api-client/issues
