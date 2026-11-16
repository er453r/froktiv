import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const htmlPath = join(root, 'src/index.html');
const outputPath = join(root, 'dist/index.html');
const marker = '<!--APP_SCRIPT-->';
const html = await readFile(htmlPath, 'utf8');

if (html.split(marker).length !== 2) {
  throw new Error(`Expected exactly one ${marker} placeholder in src/index.html`);
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
await writeFile(outputPath, html.replace(marker, () => `<script>${bundle}</script>`));