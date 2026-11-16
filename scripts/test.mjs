import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const testsPath = join(root, 'tests');
const testNames = (await readdir(testsPath)).filter((name) => name.endsWith('.test.ts'));
if (testNames.length === 0) {
  throw new Error('No TypeScript test files were found in tests/');
}

const outputPath = await mkdtemp(join(root, '.radio-tests-'));
try {
  await build({
    entryPoints: testNames.map((name) => ({
      in: join(testsPath, name),
      out: basename(name, '.ts')
    })),
    bundle: true,
    outdir: outputPath,
    outExtension: { '.js': '.mjs' },
    platform: 'node',
    format: 'esm',
    target: 'node22'
  });

  const bundledTests = testNames.map((name) => join(outputPath, `${basename(name, '.ts')}.mjs`));
  const result = spawnSync(process.execPath, ['--test', ...bundledTests], { stdio: 'inherit' });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
} finally {
  await rm(outputPath, { recursive: true, force: true });
}