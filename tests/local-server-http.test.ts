import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import serverModule from '../serve.cjs'

test('local HTTP server rejects traversal, hostile hosts and cross-origin API writes', async () => {
  const server = serverModule.createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const request = (path: string, method = 'GET', headers: Record<string, string> = {}) => new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: address.port, path, method, headers: { Host: '127.0.0.1:5173', ...headers } }, response => {
      response.resume(); response.on('end', () => resolve({ status: response.statusCode!, headers: response.headers }))
    })
    req.on('error', reject); req.end()
  })
  try {
    for (const path of ['/%2e%2e/package.json', '/..%5cpackage.json', '/C:/Windows/win.ini']) assert.equal((await request(path)).status, 403, path)
    assert.equal((await request('/%00')).status, 400)
    assert.equal((await request('/', 'GET', { Host: 'untrusted.example' })).status, 403)
    const blocked = await request('/api/settings/gemini-key', 'POST', { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' })
    assert.equal(blocked.status, 403)
    assert.equal(blocked.headers['x-content-type-options'], 'nosniff')
    assert.equal((await request('/api/settings/gemini-key', 'DELETE')).status, 403)
    assert.equal((await request('/missing-file.js')).status, 404)
    assert.equal((await request('/', 'POST')).status, 405)
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})
