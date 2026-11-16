export const appShellFiles: readonly string[] = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

export function cacheName(version: string): string {
  return `radio-control-v${version}`;
}

export function shouldHandleRequest(method: string, requestUrl: string, scopeOrigin: string): boolean {
  if (method !== 'GET') {
    return false;
  }
  try {
    return new URL(requestUrl).origin === new URL(scopeOrigin).origin;
  } catch {
    return false;
  }
}

export function canRegisterServiceWorker(protocol: string, hasServiceWorker: boolean): boolean {
  return hasServiceWorker && (protocol === 'http:' || protocol === 'https:');
}