# Radio Control

A web app for controlling a Frontier Silicon Wi-Fi radio on your local network through its built-in **FSAPI** (`http://<radio-ip>/fsapi/...`). It is written in strict TypeScript; the radio-control page code is inlined in `dist/index.html`, while the manifest, service worker and icons provide PWA installation and offline loading. There are no runtime dependencies.

Features:
- Inputs for the radio IP (IPv4, optional `:port`) and PIN (default `1234`), remembered between visits in `localStorage`.
- A live status panel that checks the radio every 10 seconds (online/offline, power, mode, volume, last check time), with a Pause/Resume button.
- A power on/off toggle.
- A mode dropdown filled with the radio's own modes, with a number input as fallback.
- A volume slider that follows the radio's volume.
- An internet-radio presets table with play, edit, delete, and empty-slot support.

## Requirements

- Node.js 22 or newer and npm.

## Install

```sh
npm install
```

## Build and run

```sh
npm run build
```

To use the page directly without a server, open `dist/index.html` in your browser, for example:

```sh
xdg-open dist/index.html          # Linux
open dist/index.html              # macOS
```

or serve it locally:

```sh
npx --yes serve dist              # then open http://localhost:3000
```

Opening the page from `file://` still supports radio control, but cannot install the PWA or use its service worker for offline loading. Browser storage behavior for `file://` pages can vary. A page served over HTTPS can't call the radio's plain-HTTP API.

## Install as an app

Build the app, then serve `dist/` from `http://localhost` (for example with `npx --yes serve dist` or the Docker setup below). Open the local URL and choose the browser's install menu or install icon. The installed app can load its app shell offline; controlling the radio still requires a network connection to the radio.

PWA installation and offline caching require an HTTP(S) secure context. Use `http://localhost` for this app so the browser can also reach the radio's plain-HTTP API. The `file://` page remains usable for control but is not installable.

## Docker

A multi-stage `Dockerfile` builds the app (install, typecheck, test, build) with Node and serves all of `dist/` from a small `nginx:alpine-slim` image:

```sh
docker build -t radio-control .
docker run --rm -p 8080:80 radio-control   # then open http://localhost:8080
```

Serve it over plain HTTP (not HTTPS) so the page can reach the radio.

## Test

```sh
npm run typecheck   # strict DOM and service-worker TypeScript checks
npm test            # unit tests (node:test with a mocked fetch)
```

## Versioning and releases

The app version lives in one place: the `version` field of `package.json`. The build shows it next to the page title, and the newest released section in `CHANGELOG.md` must match it (a test checks this).

To release:

1. Add short notes for your changes under `## [Unreleased]` in `CHANGELOG.md`.
2. Bump the version (with a clean git working tree):

   ```sh
   npm version patch   # or: minor, major
   ```

   This updates `package.json` and `package-lock.json`, moves the "Unreleased" notes under `## [x.y.z] - <date>`, and creates a commit and a `vx.y.z` tag.
3. Push with tags: `git push --follow-tags`.

## Notes

- If the browser can't read the radio's replies (CORS), the page shows "online, details unavailable" and still sends power, mode and volume changes.
- Power, mode and volume writes use `no-cors`, so the page can't confirm those changes directly; preset play, edit and delete use readable requests and report the radio's result.
