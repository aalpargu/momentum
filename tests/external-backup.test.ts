import assert from 'node:assert/strict'
import test from 'node:test'
import { createExternalBackupContents } from '../src/lib/externalBackupEnvelope.ts'

test('external backup uses the same validated v3 envelope as manual exports', () => {
  const exportedAt = '2026-09-13T15:00:00.000Z'
  const data = { sessions: [], habits: [], settings: { name: 'Ada' } }
  const backup = JSON.parse(createExternalBackupContents(JSON.stringify(data), exportedAt))

  assert.deepEqual(backup, {
    format: 'momentum-backup',
    version: 3,
    exportedAt,
    data,
  })
})

test('external backup rejects a corrupt state payload instead of overwriting a good file', () => {
  assert.throws(() => createExternalBackupContents('{', new Date().toISOString()), SyntaxError)
})
