import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'

export function buildServiceWorker(version, bundle) {
  const publicAssets = ['/manifest.webmanifest', '/icon.svg', '/icon-180.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-192.png', '/icon-maskable-512.png', '/privacy.html', '/terms.html', '/support.html']
  const assets = ['/', '/index.html', ...publicAssets, ...Object.keys(bundle).map(file => '/' + file)]
  const sources = [
    ...Object.entries(bundle).map(([file, output]) => [file, output.type === 'chunk' ? output.code : output.source]),
    ...publicAssets.map(file => [file, readFileSync(new URL('../public' + file, import.meta.url))]),
  ]
  return createServiceWorker(version + '-' + shellRevision(sources), assets)
}

export function shellRevision(sources) {
  const hash = createHash('sha256')
  for (const [name, contents] of [...sources].sort(([a], [b]) => a.localeCompare(b))) hash.update(name).update('\0').update(contents).update('\0')
  return hash.digest('hex').slice(0, 16)
}

export function createServiceWorker(version, assets) {
  return `const CACHE_NAME=${JSON.stringify('momentum-shell-v' + version)}
const APP_SHELL=${JSON.stringify([...new Set(assets)])}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('momentum-shell-v') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting() })
self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  // Keep the HTML and assets of the active release together until update.
  // Legal pages have their own offline content; unknown files never get app HTML.
  const navigation = request.mode === 'navigate'
  const key = navigation && (url.pathname === '/' || !url.pathname.split('/').pop().includes('.')) ? '/index.html' : url.pathname
  if (!APP_SHELL.includes(key)) return
  event.respondWith(caches.open(CACHE_NAME).then(cache => cache.match(key)).then(cached => cached || fetch(request)))
})
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch { data = { body: event.data?.text() ?? '' } }
  if (!data || typeof data !== 'object') data = {}
  const title = typeof data.title === 'string' ? data.title : 'Momentum'
  const options = { body: typeof data.body === 'string' ? data.body : 'Momentum hatırlatıcın hazır.', icon: '/icon-192.png', badge: '/icon-192.png', tag: typeof data.tag === 'string' ? data.tag : 'momentum-reminder', data: { url: typeof data.url === 'string' ? data.url : '/' } }
  event.waitUntil(self.registration.showNotification(title, options))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  let target = self.location.origin + '/'
  try { const url = new URL(event.notification.data?.url || '/', self.location.origin); if (url.origin === self.location.origin) target = url.href } catch { /* Use the app home page. */ }
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) { await existing.navigate?.(target); return existing.focus() }
    return self.clients.openWindow(target)
  }))
})
`
}
