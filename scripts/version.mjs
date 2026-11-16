// Runs from the npm "version" lifecycle (`npm version patch|minor|major`), after package.json
// has the new version: moves the CHANGELOG.md "Unreleased" notes into a section for that version.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseChangelog } from './changelog.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const changelogPath = join(root, 'CHANGELOG.md');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const date = new Date().toISOString().slice(0, 10);

const changelog = await readFile(changelogPath, 'utf8');
await writeFile(changelogPath, releaseChangelog(changelog, version, date));
console.log(`CHANGELOG.md: released ${version} (${date})`);
