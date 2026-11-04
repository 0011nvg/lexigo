/* LEXI: static assets only. Account, API and HTML responses are never cached. */
'use strict';
const CACHE = 'lexi-static-v2';
const PREFIX = 'lexi-static-';
const BASE = new URL(self.registration.scope);
const OFFLINE = new URL('offline.html', BASE).href;
const MAX_ENTRIES = 160;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(OFFLINE)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    // Existing tabs keep their worker until closed; do not force a mixed-version reload.
  })());
});
function isStatic(request, url) {
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return false;
  if (request.headers.has('authorization') || request.headers.has('range')) return false;
  // Do not cache account endpoints, configuration, arbitrary query strings, or documents.
  if (Array.from(url.searchParams.keys()).some(key => key !== 'v')) return false;
  const rel = url.pathname.slice(BASE.pathname.length);
  if (/^(?:config\.js|sw\.js|pwa-register\.js)$/i.test(rel)) return false;
  // HTML is always fresh; pairing it with an older JS/CSS fallback can corrupt
  // behavior or lose answers. Keep executable code, styles and vocabulary on
  // the network until there is an atomic, content-versioned release strategy.
  return /^assets\/[a-z0-9_./-]+\.(?:woff2?|png|jpe?g|svg|webp|ico)$/i.test(rel);
}
async function trim(cache) {
  const keys = await cache.keys();
  // Retain the offline fallback, remove oldest assets first.
  const disposable = keys.filter(req => req.url !== OFFLINE);
  while (disposable.length > MAX_ENTRIES) await cache.delete(disposable.shift());
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  if (request.mode === 'navigate') {
    // Never put documents (including auth callbacks) or their URL in Cache Storage.
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
    return;
  }
  if (!isStatic(request, url)) return;
  // Register waitUntil during dispatch, before any await, so background writes
  // cannot outlive the fetch event unnoticed.
  // Clone before handing the body to the page, which may consume it immediately.
  const network = fetch(request).then(response => ({response, copy: response.clone()}));
  const opened = caches.open(CACHE);
  event.waitUntil(Promise.all([network, opened]).then(async ([{response, copy}, cache]) => {
    const controls = response.headers.get('cache-control') || '';
    if (response.ok && response.type === 'basic' && request.cache !== 'no-store' && !/\b(?:no-store|private)\b/i.test(controls) && response.headers.get('vary') !== '*') {
      await cache.put(request, copy);
      await trim(cache);
    }
  }).catch(() => {}));
  event.respondWith(network.then(result => result.response).catch(async error => {
    const cached = await (await opened).match(request);
    if (cached) return cached;
    throw error;
  }));
});
