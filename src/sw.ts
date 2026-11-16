import { appShellFiles, cacheName, shouldHandleRequest } from './pwa.js';

declare const __APP_VERSION__: string;

const serviceWorker = self as unknown as ServiceWorkerGlobalScope;
const currentCacheName = cacheName(__APP_VERSION__);

serviceWorker.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil((async () => {
    const cache = await caches.open(currentCacheName);
    const files = appShellFiles.map((file) => new URL(file, serviceWorker.registration.scope).href);
    await cache.addAll(files);
    await serviceWorker.skipWaiting();
  })());
});

serviceWorker.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith('radio-control-v') && name !== currentCacheName)
      .map((name) => caches.delete(name)));
    await serviceWorker.clients.claim();
  })());
});

serviceWorker.addEventListener('fetch', (event: FetchEvent) => {
  const request = event.request;
  if (!shouldHandleRequest(request.method, request.url, serviceWorker.location.origin)) {
    return;
  }

  const cachePromise = caches.open(currentCacheName);
  const networkPromise = (async () => {
    const response = await fetch(request);
    const responseUrl = response.url === '' ? request.url : response.url;
    if (response.ok && new URL(responseUrl).origin === serviceWorker.location.origin) {
      await cachePromise
        .then((cache) => cache.put(request, response.clone()))
        .catch(() => undefined);
    }
    return response;
  })();
  event.waitUntil(networkPromise.then(() => undefined, () => undefined));
  event.respondWith((async () => {
    try {
      const cached = await (await cachePromise).match(request);
      if (cached !== undefined) {
        return cached;
      }
    } catch {
      // Fall through to the network when Cache Storage is unavailable.
    }

    try {
      return await networkPromise;
    } catch {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});