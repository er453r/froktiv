import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { appShellFiles, cacheName, canRegisterServiceWorker, shouldHandleRequest } from '../src/pwa.ts';

test('builds a cache name from the app version', () => {
  assert.equal(cacheName('2.1.0'), 'radio-control-v2.1.0');
});

test('handles only same-origin GET requests', () => {
  const origin = 'http://localhost:8080';
  assert.equal(shouldHandleRequest('GET', 'http://localhost:8080/radio/', origin), true);
  assert.equal(shouldHandleRequest('POST', 'http://localhost:8080/', origin), false);
  assert.equal(shouldHandleRequest('GET', 'http://192.168.1.5/fsapi/GET/netRemote.sys.power', origin), false);
  assert.equal(shouldHandleRequest('GET', 'not a URL', origin), false);
});

test('allows service worker registration only on HTTP(S) when supported', () => {
  assert.equal(canRegisterServiceWorker('http:', true), true);
  assert.equal(canRegisterServiceWorker('https:', true), true);
  assert.equal(canRegisterServiceWorker('file:', true), false);
  assert.equal(canRegisterServiceWorker('http:', false), false);
});

test('precache file list includes every manifest icon', () => {
  const manifest = JSON.parse(readFileSync('src/manifest.webmanifest', 'utf8')) as {
    icons: { src: string }[];
  };
  const shellIcons = appShellFiles.filter((file) => file.startsWith('./icon')).sort();
  assert.deepEqual(shellIcons, manifest.icons.map((icon) => icon.src).sort());
  assert.ok(appShellFiles.includes('./apple-touch-icon.png'));
});