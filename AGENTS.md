# AGENTS.md

Guidance for AI agents and contributors working on this project.

## Project summary

A web app, written in strict TypeScript, that controls a **Frontier Silicon** Wi-Fi radio on the local network. `npm run build` inlines app code into `dist/index.html` and also emits a manifest, service worker and icons for PWA installation. There are no runtime dependencies; PWA installation requires serving it from a secure origin such as `http://localhost`.

## Background and decisions

- **API choice.** The originally suggested project, [KIMB-technologies/Radio-API](https://github.com/KIMB-technologies/Radio-API), is a replacement *station-list server* that the radio connects to. It has no volume, power or status endpoints, so it can't control the radio. The app uses the radio's own built-in **FSAPI** instead:
  - `http://<host>/fsapi/<OP>/<node>?pin=<PIN>[&value=N]`
  - `OP` is `GET`, `SET`, `LIST_GET_NEXT` (`.../LIST_GET_NEXT/<node>/-1?pin=…&maxItems=100`) or `LIST_SET` (`.../LIST_SET/<node>?pin=…&key=…&name=…&type=…&url=…`).
  - Replies are XML, for example `<fsapiResponse><status>FS_OK</status><value><u8>1</u8></value></fsapiResponse>`.
  - The default PIN is `1234`. It is entered by the user, not hardcoded.
- **CORS strategy (chosen by the user).**
  - Power, mode and volume writes use `fetch(..., { mode: 'no-cors' })`. The reply can't be read; the next status check shows the result.
  - Preset operations use readable requests. The radio sends permissive CORS headers, so `SET netRemote.nav.action.selectPreset` and `LIST_SET netRemote.nav.presets` can confirm `FS_OK` and report radio errors.
  - Status reads use a normal, readable `fetch`. If it fails with a timeout or network error, a `no-cors` probe (`checkHealth`, `GET netRemote.sys.info.friendlyName`) decides between "online, details unavailable (CORS)" and "offline".
  - The user confirmed direct requests work locally. The page must be opened from `file://` or `http://localhost` (HTTPS origins are blocked by mixed content).
- **No `GET_MULTIPLE` and no sessions (`CREATE_SESSION`).** Not all firmwares support them, and the radios handle concurrent connections poorly. Status reads run one after another.
- **XML is parsed with small regex helpers, not `DOMParser`**, so parsing can be unit-tested in Node. Parsers never throw; malformed input returns `null` or `[]`.
- **Mode keys differ between models.** Always read them from `netRemote.sys.caps.validModes`; never hardcode them.
- **UI choices (by the user):** a single power toggle (On/Off buttons only when power is unknown), a mode dropdown from the radio (number input fallback), and polling with a CORS fallback.
- **PWA:** `manifest.webmanifest` and the service worker are served beside `index.html`. The worker precaches the app shell and only handles same-origin GET requests; radio FSAPI requests are cross-origin and must never be intercepted.

## FSAPI nodes used

| Node | Use |
| --- | --- |
| `netRemote.sys.info.friendlyName` | `no-cors` reachability probe |
| `netRemote.sys.power` | Read power (0/1); `SET` to turn on/off |
| `netRemote.sys.mode` | Read the active mode key; `SET` to change mode |
| `netRemote.sys.audio.volume` | Read volume; `SET` volume |
| `netRemote.sys.caps.volumeSteps` | Slider maximum is `volumeSteps - 1` (default 20) |
| `netRemote.sys.caps.validModes` | `LIST_GET_NEXT` mode list (key, id, label, selectable) |
| `netRemote.nav.state` | Readable `SET` to `1` before preset access |
| `netRemote.nav.caps` | Preset capability bits: `0x2` means supported, `0x4` means editable |
| `netRemote.nav.presets` | Internet-radio preset list (`LIST_GET_NEXT`) and edits/deletes (`LIST_SET`) |
| `netRemote.nav.action.selectPreset` | Readable `SET` with a preset's 0-based key to play it |

Status mapping: HTTP 403 or `FS_PACKET_BAD` means the PIN was rejected. Other non-`FS_OK` statuses are `fsapi` errors.

## Behaviour

- **Polling:** starts when the IP is valid, runs immediately and then every 10 s. It restarts when the IP or PIN changes and stops when the IP is invalid. Checks never overlap; a tick is skipped while one is running. Each check reads power, then mode, then volume, with a 3 s timeout each (at most 3 requests per 10 s). Results for an old IP/PIN are discarded using a `statusVersion` counter.
- **Status results:** `online` (power, mode label or number, volume `N / max`, last checked `HH:MM:SS`), `unreadable` (CORS), `pin-rejected`, or `offline` (with the reason).
- **Power:** the toggle shows "Turn off" or "Turn on" based on the last known state and sends `SET netRemote.sys.power&value=0|1`.
- **Mode:** the mode list is loaded once per host after the first readable online check. Selectable modes appear in a `<select>`, with the active mode selected. If the list can't be read or is empty, a number input and "Set mode" button are shown.
- **Volume:** 250 ms trailing throttle, sent with `no-cors`. Polled volume updates the slider, except within 2 s after the user last moved it.
- **Presets:** loaded when a status check finds the radio on; the page sends `SET nav.state=1`, reads `nav.caps`, then reads the preset pages sequentially. The list reloads after the mode, host/PIN or power-on state changes, after an action, or on Refresh—not on every 10-second poll. Empty slots are shown and can be edited; Play is available for filled slots, while Edit/Delete require the `0x4` capability. Preset writes are readable and their `FS_OK` results are checked. Preset controls are disabled when the IP is invalid or a preset request is running.
- After any power, mode or volume change, a status check runs immediately (`poller.triggerNow()`). A successful preset play also triggers an immediate check before the preset list is refreshed.
- IP and PIN are saved in `localStorage`. All controls are disabled while the IP is invalid.

## Code layout

```
src/index.html      # markup, CSS and the <!--APP_SCRIPT--> placeholder
src/main.ts         # the only module that touches the DOM: wiring, storage, rendering, SW registration
src/storage.ts      # guarded localStorage helpers and radio host/PIN keys
src/pwa.ts          # app-shell file list and pure service-worker helper functions
src/sw.ts           # service worker: install precache, version cleanup, same-origin GET handling
src/manifest.webmanifest # PWA name, scope, theme and icon declarations
src/icon.svg        # master SVG app icon
src/fsapi.ts        # buildFsapiUrl, status/mode/preset requests, and power/mode/volume writes
src/fsapiXml.ts     # parseFsapiStatus, parseFsapiValue, parseModeList, parsePresetList
src/presets.ts      # pure preset capabilities, validation, reload decisions and URL shortening
src/radioStatus.ts  # getRadioStatus with the CORS fallback
src/poller.ts       # createPoller: generic, non-overlapping interval poller
src/validation.ts   # isValidHost (IPv4 + optional port), clampVolume
src/throttle.ts     # throttleTrailing
scripts/build.mjs   # esbuild bundle (IIFE, minified) inlined into dist/index.html
scripts/icon.mjs    # dependency-free SVG-matched PNG rasterizer and encoder
scripts/test.mjs    # bundles tests/*.test.ts with esbuild and runs node --test
scripts/changelog.mjs # releaseChangelog / latestReleasedVersion helpers (tested)
scripts/version.mjs # npm "version" hook: moves CHANGELOG "Unreleased" notes to the new version
tests/*.test.ts     # node:test unit tests with a mocked fetch
tsconfig.sw.json    # strict WebWorker type check for src/sw.ts
nginx.default.conf  # static serving rules, including the webmanifest MIME type
```

Functions that do network requests take an optional `fetchFn` so tests can pass a mock.

## Conventions

- TypeScript `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Keep `npm run typecheck` clean.
- No runtime dependencies. Dev dependencies are only `typescript` and `esbuild`.
- Keep app logic and styling inlined in `dist/index.html`; other `dist/` files are limited to the required PWA manifest, service worker and icons. Do not load external assets.
- The service worker may handle only same-origin GET requests. Never intercept cross-origin radio FSAPI requests.
- Keep DOM access in `main.ts`. Keep FSAPI, parsing and polling logic pure and testable.
- Two-space indentation, single quotes, ES modules with `.js` import suffixes in `src/`.
- Add a short, human-readable entry under `## [Unreleased]` in `CHANGELOG.md` for user-visible changes.
- **Version:** the only source is `version` in `package.json`. `scripts/build.mjs` replaces `<!--APP_VERSION-->` in `src/index.html` with it. Never hardcode the version elsewhere. Release with `npm version patch|minor|major`, which also releases the changelog section; a test checks that the newest released `CHANGELOG.md` section matches `package.json`.

## Commands

```sh
npm install          # install dev dependencies
npm run typecheck    # strict app and service-worker type checks
npm test             # unit tests
npm run build        # writes dist/index.html, the service worker, manifest and icons
```

Validate every change with all three: `typecheck`, `test`, `build`. Live checks, when a radio is available, must be read-only; state-changing preset actions are covered with mocked requests and should be tested manually by the user.

## Out of scope (so far)

A proxy or server, station-catalogue browsing, preset reordering, presets for non-internet modes, mute, sessions, device discovery and `GET_MULTIPLE`.
