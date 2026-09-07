const CACHE_NAME = 'game-daily-v0.1.2'
const BASE_PATH = new URL('./', self.registration.scope).pathname
const APP_SHELL = [BASE_PATH, `${BASE_PATH}index.html`, `${BASE_PATH}manifest.webmanifest`]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(cacheNames.filter((cacheName) => cacheName !== CACHE_NAME).map((cacheName) => caches.delete(cacheName))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return
  const requestUrl = new URL(event.request.url)
  const isAppDocument = event.request.mode === 'navigate' || requestUrl.pathname === BASE_PATH || requestUrl.pathname === `${BASE_PATH}index.html`
  if (isAppDocument) {
    // cache: 'no-store'を指定しないと、このfetch自体がブラウザの通常のHTTPキャッシュを
    // 経由してしまい、Service Worker側は「ネットワークを優先している」つもりでも実際には
    // 古いレスポンスを受け取り続けることがある(2026-09-07、実機で全体管理画面がSupabase未接続の
    // 古いビルドのまま表示され続ける不具合が発生し判明。training-menu側で既に踏んでいた
    // 既知のパターン、feedback_sw_fetch_no_store参照)。
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then((response) => {
      const copy = response.clone()
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
      return response
    }).catch(() => caches.match(event.request)))
    return
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)))
})
