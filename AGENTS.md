# AGENTS.md

Guidance for AI agents and contributors working on this project.

## Project summary

A single, self-contained HTML page, written in strict TypeScript, that controls a **Frontier Silicon** Wi-Fi radio on the local network. `npm run build` produces one file, `dist/index.html`, with the script inlined. There is no server and there are no runtime dependencies.

## Background and decisions

- **API choice.** The originally suggested project, [KIMB-technologies/Radio-API](https://github.com/KIMB-technologies/Radio-API), is a replacement *station-list server* that the radio connects to. It has no volume, power or status endpoints, so it can't control the radio. The app uses the radio's own built-in **FSAPI** instead:
  - `http://<host>/fsapi/<OP>/<node>?pin=<PIN>[&value=N]`
  - `OP` is `GET`, `SET` or `LIST_GET_NEXT` (`.../LIST_GET_NEXT/<node>/-1?pin=…&maxItems=100`).
  - Replies are XML, for example `<fsapiResponse><status>FS_OK</status><value><u8>1</u8></value></fsapiResponse>`.
  - The default PIN is `1234`. It is entered by the user, not hardcoded.
- **CORS strategy (chosen by the user).**
  - Writes (`SET` power, mode, volume) use `fetch(..., { mode: 'no-cors' })`. The radio applies them, but the reply can't be read. The next status check confirms the result.
  - Status reads use a normal, readable `fetch`. If it fails with a timeout or network error, a `no-cors` probe (`checkHealth`, `GET netRemote.sys.info.friendlyName`) decides between "online, details unavailable (CORS)" and "offline".
  - The user confirmed direct requests work locally. The page must be opened from `file://` or `http://localhost` (HTTPS origins are blocked by mixed content).
- **No `GET_MULTIPLE` and no sessions (`CREATE_SESSION`).** Not all firmwares support them, and the radios handle concurrent connections poorly. Status reads run one after another.
- **XML is parsed with small regex helpers, not `DOMParser`**, so parsing can be unit-tested in Node. Parsers never throw; malformed input returns `null` or `[]`.
- **Mode keys differ between models.** Always read them from `netRemote.sys.caps.validModes`; never hardcode them.
- **UI choices (by the user):** a single power toggle (On/Off buttons only when power is unknown), a mode dropdown from the radio (number input fallback), and polling with a CORS fallback.

## FSAPI nodes used

| Node | Use |
| --- | --- |
| `netRemote.sys.info.friendlyName` | `no-cors` reachability probe |
| `netRemote.sys.power` | Read power (0/1); `SET` to turn on/off |
| `netRemote.sys.mode` | Read the active mode key; `SET` to change mode |
| `netRemote.sys.audio.volume` | Read volume; `SET` volume |
| `netRemote.sys.caps.volumeSteps` | Slider maximum is `volumeSteps - 1` (default 20) |
| `netRemote.sys.caps.validModes` | `LIST_GET_NEXT` mode list (key, id, label, selectable) |

Status mapping: HTTP 403 or `FS_PACKET_BAD` means the PIN was rejected. Other non-`FS_OK` statuses are `fsapi` errors.

## Behaviour

- **Polling:** starts when the IP is valid, runs immediately and then every 10 s. It restarts when the IP or PIN changes and stops when the IP is invalid. Checks never overlap; a tick is skipped while one is running. Each check reads power, then mode, then volume, with a 3 s timeout each (at most 3 requests per 10 s). Results for an old IP/PIN are discarded using a `statusVersion` counter.
- **Status results:** `online` (power, mode label or number, volume `N / max`, last checked `HH:MM:SS`), `unreadable` (CORS), `pin-rejected`, or `offline` (with the reason).
- **Power:** the toggle shows "Turn off" or "Turn on" based on the last known state and sends `SET netRemote.sys.power&value=0|1`.
- **Mode:** the mode list is loaded once per host after the first readable online check. Selectable modes appear in a `<select>`, with the active mode selected. If the list can't be read or is empty, a number input and "Set mode" button are shown.
- **Volume:** 250 ms trailing throttle, sent with `no-cors`. Polled volume updates the slider, except within 2 s after the user last moved it.
- After any power, mode or volume change, a status check runs immediately (`poller.triggerNow()`).
- IP and PIN are saved in `localStorage`. All controls are disabled while the IP is invalid.

## Code layout

```
src/index.html      # markup, CSS and the <!--APP_SCRIPT--> placeholder
src/main.ts         # the only module that touches the DOM: wiring, localStorage, rendering
src/fsapi.ts        # buildFsapiUrl, checkHealth, fsapiGetNumber, getModes, setPower, setMode, setVolume
src/fsapiXml.ts     # parseFsapiStatus, parseFsapiValue, parseModeList
src/radioStatus.ts  # getRadioStatus with the CORS fallback
src/poller.ts       # createPoller: generic, non-overlapping interval poller
src/validation.ts   # isValidHost (IPv4 + optional port), clampVolume
src/throttle.ts     # throttleTrailing
scripts/build.mjs   # esbuild bundle (IIFE, minified) inlined into dist/index.html
scripts/test.mjs    # bundles tests/*.test.ts with esbuild and runs node --test
scripts/changelog.mjs # releaseChangelog / latestReleasedVersion helpers (tested)
scripts/version.mjs # npm "version" hook: moves CHANGELOG "Unreleased" notes to the new version
tests/*.test.ts     # node:test unit tests with a mocked fetch
```

Functions that do network requests take an optional `fetchFn` so tests can pass a mock.

## Conventions

- TypeScript `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Keep `npm run typecheck` clean.
- No runtime dependencies. Dev dependencies are only `typescript` and `esbuild`.
- Keep the output a single self-contained `dist/index.html` with no external references.
- Keep DOM access in `main.ts`. Keep FSAPI, parsing and polling logic pure and testable.
- Two-space indentation, single quotes, ES modules with `.js` import suffixes in `src/`.
- Add a short, human-readable entry under `## [Unreleased]` in `CHANGELOG.md` for user-visible changes.
- **Version:** the only source is `version` in `package.json`. `scripts/build.mjs` replaces `<!--APP_VERSION-->` in `src/index.html` with it. Never hardcode the version elsewhere. Release with `npm version patch|minor|major`, which also releases the changelog section; a test checks that the newest released `CHANGELOG.md` section matches `package.json`.

## Commands

```sh
npm install          # install dev dependencies
npm run typecheck    # strict type check
npm test             # unit tests
npm run build        # writes dist/index.html
```

Validate every change with all three: `typecheck`, `test`, `build`. The agent has no network access to the radio, so live checks are left to the user.

## Out of scope (so far)

A proxy or server, presets and stations, mute, sessions, device discovery and `GET_MULTIPLE`.
