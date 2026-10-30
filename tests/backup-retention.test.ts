import test from 'node:test'
import assert from 'node:assert/strict'
import { retainedBackupIds } from '../src/lib/backupRetention.ts'
test('frequent edits retain daily history alongside the last seven versions', () => {
  const days = Array.from({ length: 40 }, (_, index) => ({ id: index + 1, createdAt: new Date(Date.UTC(2026, 0, index + 1, 12)).toISOString() }))
  const edits = Array.from({ length: 20 }, (_, index) => ({ id: 41 + index, createdAt: days.at(-1)!.createdAt }))
  const retained = retainedBackupIds([...days, ...edits])
  assert.equal(retained.size, 36)
  assert.equal(retained.has(39), true)
  assert.equal(retained.has(1), false)
  for (let id = 54; id <= 60; id++) assert.equal(retained.has(id), true)
})
