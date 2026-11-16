import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { writeIcons } from './icon.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const htmlPath = join(root, 'src/index.html');
const outputPath = join(root, 'dist/index.html');
const marker = '<!--APP_SCRIPT-->';
const versionMarker = '<!--APP_VERSION-->';
const html = await readFile(htmlPath, 'utf8');
// package.json "version" is the single source of the app version.
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

for (const placeholder of [marker, versionMarker]) {
  if (html.split(placeholder).length !== 2) {
    throw new Error(`Expected exactly one ${placeholder} placeholder in src/index.html`);
  }
}

const result = await build({
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false
});

const bundle = result.outputFiles[0]?.text;
if (bundle === undefined) {
  throw new Error('esbuild did not produce an output bundle');
}

await mkdir(dirname(outputPath), { recursive: true });
const page = html
  .replace(versionMarker, () => version)
  .replace(marker, () => `<script>${bundle}</script>`);
await writeFile(outputPath, page);
await copyFile(join(root, 'src/icon.svg'), join(root, 'dist/icon.svg'));
await writeIcons(join(root, 'dist'));
await copyFile(join(root, 'src/manifest.webmanifest'), join(root, 'dist/manifest.webmanifest'));
await build({
  entryPoints: [join(root, 'src/sw.ts')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  define: { __APP_VERSION__: JSON.stringify(version) },
  outfile: join(root, 'dist/sw.js')
});