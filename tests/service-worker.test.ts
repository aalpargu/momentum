import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { createServiceWorker, shellRevision } from '../scripts/service-worker.mjs'

function worker() {
  const events: Record<string, (event: unknown) => void> = {}
  const deleted: string[] = [], opened: string[] = []
  const cache = new Map([['/index.html', 'active release'], ['/privacy.html', 'privacy document'], ['/assets/app.js', 'active javascript']])
  const self = {
    location: { origin: 'https://momentum.test' },
    addEventListener: (name: string, fn: (event: unknown) => void) => { events[name] = fn },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async (url: string) => { opened.push(url) } },
  }
  vm.runInNewContext(createServiceWorker('test', ['/', ...cache.keys()]), {
    self, URL, Promise,
    caches: { open: async () => ({ match: async (key: string) => cache.get(key) }), keys: async () => ['momentum-shell-vold', 'other-application'], delete: async (name: string) => deleted.push(name) },
    fetch: async () => 'new release from server',
  })
  const invoke = async (name: string, data: Record<string, unknown>) => {
    let result: unknown
    events[name]({ ...data, waitUntil: (work: unknown) => { result = work }, respondWith: (work: unknown) => { result = work } })
    return await result
  }
  return { invoke, deleted, opened }
}

test('release fingerprint changes with file content even without a version bump', () => {
  assert.notEqual(shellRevision([['app.js', 'old']]), shellRevision([['app.js', 'new']]))
  assert.equal(shellRevision([['b', '2'], ['a', '1']]), shellRevision([['a', '1'], ['b', '2']]))
})
test('worker activation only deletes obsolete Momentum caches', async () => {
  const { invoke, deleted } = worker()
  await invoke('activate', {})
  assert.deepEqual(deleted, ['momentum-shell-vold'])
})
test('navigation keeps the active release and serves legal pages independently', async () => {
  const { invoke } = worker()
  const request = (path: string) => ({ request: { url: 'https://momentum.test' + path, method: 'GET', mode: 'navigate' } })
  assert.equal(await invoke('fetch', request('/?tab=progress')), 'active release')
  assert.equal(await invoke('fetch', request('/privacy.html')), 'privacy document')
  assert.equal(await invoke('fetch', request('/api/backups/google-drive')), undefined)
  assert.equal(await invoke('fetch', request('/missing.js')), undefined)
})
test('notification click never navigates outside the app origin', async () => {
  const { invoke, opened } = worker()
  await invoke('notificationclick', { notification: { close() {}, data: { url: 'https://untrusted.test/' } } })
  assert.deepEqual(opened, ['https://momentum.test/'])
})
