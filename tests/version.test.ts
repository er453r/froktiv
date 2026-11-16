import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { latestReleasedVersion, releaseChangelog } from '../scripts/changelog.mjs';

const sample = '# Changelog\n\n## [Unreleased]\n\n### Added\n- Something new.\n\n## [1.0.0] - 2026-01-01\n\n### Added\n- First release.\n';

test('package.json version matches the latest released CHANGELOG.md section', () => {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  assert.equal(latestReleasedVersion(readFileSync('CHANGELOG.md', 'utf8')), version);
});

test('releases the Unreleased notes under the new version and starts a new Unreleased section', () => {
  const released = releaseChangelog(sample, '1.1.0', '2026-02-02');
  assert.equal(
    released,
    '# Changelog\n\n## [Unreleased]\n\n## [1.1.0] - 2026-02-02\n\n### Added\n- Something new.\n\n## [1.0.0] - 2026-01-01\n\n### Added\n- First release.\n'
  );
  assert.equal(latestReleasedVersion(released), '1.1.0');
});

test('refuses to release without notes, without an Unreleased section, or twice', () => {
  const empty = '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n';
  assert.throws(() => releaseChangelog(empty, '1.1.0', '2026-02-02'), /empty/);
  assert.throws(() => releaseChangelog('# Changelog\n', '1.1.0', '2026-02-02'), /no "## \[Unreleased\]"/);
  assert.throws(() => releaseChangelog(sample, '1.0.0', '2026-02-02'), /already has a section/);
  assert.throws(() => releaseChangelog(sample, 'v1', '2026-02-02'), /Invalid version/);
});
