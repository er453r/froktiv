# Changelog

## [2.0.0] - 2026-11-16

### Added
- Automatic status checks every 10 seconds, showing whether the radio is online and, if so, its power state, active mode, volume and the time of the last check.
- Pause/Resume button for the status checks.
- Power toggle button ("Turn on" / "Turn off"), with separate On/Off buttons when the power state is unknown.
- Mode dropdown filled with the radio's own modes, with a number input and "Set mode" button as fallback.
- The volume slider follows the radio's current volume and uses the radio's own maximum volume when it can be read.
- Clear messages when the PIN is rejected or the browser blocks reading replies (CORS).

### Changed
- The manual "Check radio" button was replaced by the automatic status checks.

### Fixed
- The build no longer leaves the script placeholder in the generated page.

## [1.0.0] - 2026-11-16

### Added
- Single-page radio control built from strict TypeScript into one `dist/index.html`.
- Inputs for the radio IP address and PIN, saved between visits.
- "Check radio" button that reports whether the radio is reachable.
- Volume slider (0–20) that sends changes to the radio.
