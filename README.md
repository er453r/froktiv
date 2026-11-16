# Radio Control

A single, self-contained web page for controlling a Frontier Silicon Wi-Fi radio on your local network through its built-in **FSAPI** (`http://<radio-ip>/fsapi/...`). It is written in strict TypeScript and builds into one `dist/index.html` file. No server and no runtime dependencies are needed.

Features:
- Inputs for the radio IP (IPv4, optional `:port`) and PIN (default `1234`), saved in `localStorage`.
- A live status panel that checks the radio every 10 seconds (online/offline, power, mode, volume, last check time), with a Pause/Resume button.
- A power on/off toggle.
- A mode dropdown filled with the radio's own modes, with a number input as fallback.
- A volume slider that follows the radio's volume.

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

Then open `dist/index.html` in your browser, for example:

```sh
xdg-open dist/index.html          # Linux
open dist/index.html              # macOS
```

or serve it locally:

```sh
npx --yes serve dist              # then open http://localhost:3000
```

Open the page from `file://` or `http://localhost`. A page served over HTTPS can't call the radio's plain-HTTP API.

## Test

```sh
npm run typecheck   # strict TypeScript check (tsc --noEmit)
npm test            # unit tests (node:test with a mocked fetch)
```

## Notes

- If the browser can't read the radio's replies (CORS), the page shows "online, details unavailable" and still sends power, mode and volume changes.
- With `no-cors` writes, the page can't confirm that a change was applied. The next status check shows the result.
