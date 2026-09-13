import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeDiagnosticText } from '../src/lib/diagnostics.ts'

test('diagnostic text redacts email, token-like keys and URL details', () => {
  const input = 'user@example.com sb_secret_1234567890abcdef https://example.com/path?token=secret#profile'
  const sanitized = sanitizeDiagnosticText(input)
  assert.equal(sanitized.includes('user@example.com'), false)
  assert.equal(sanitized.includes('sb_secret_1234567890abcdef'), false)
  assert.equal(sanitized.includes('?token='), false)
  assert.equal(sanitized.includes('#profile'), false)
  assert.match(sanitized, /https:\/\/example\.com\/path/)
})

test('diagnostic text obeys its maximum length', () => {
  assert.equal(sanitizeDiagnosticText('x'.repeat(50), 12), 'x'.repeat(12))
})
