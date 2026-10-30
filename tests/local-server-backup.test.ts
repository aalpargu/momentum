import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import server from '../serve.cjs'

const { validateBackupContents, writeGoogleDriveBackup, writeVerifiedBackupFile } = server

function validBackup(exportedAt = '2026-09-14T20:00:00.000Z') {
  return JSON.stringify({ format: 'momentum-backup', version: 3, exportedAt, data: { sessions: [], habits: [], settings: {} } }, null, 2)
}

test('local server validates and writes current plus dated Google Drive backups', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'multiplife-drive-test-'))
  try {
    const contents = validBackup()
    const result = writeGoogleDriveBackup(directory, contents)
    assert.equal(result.lastBackupAt, '2026-09-14T20:00:00.000Z')
    assert.equal(fs.readFileSync(path.join(directory, 'multiplife-latest.json'), 'utf8'), contents)
    assert.equal(fs.readFileSync(path.join(directory, 'multiplife-2026-09-14.json'), 'utf8'), contents)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('local server refuses malformed backup data and unsafe file names', () => {
  assert.throws(() => validateBackupContents(JSON.stringify({ format: 'momentum-backup', version: 3, exportedAt: 'bad', data: {} })), /geçersiz/)
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'multiplife-drive-test-'))
  try { assert.throws(() => writeVerifiedBackupFile(directory, '..\\outside.json', validBackup()), /dosyası adı/) }
  finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('invalid exportedAt never replaces an existing verified backup', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'multiplife-drive-test-'))
  try {
    const original = validBackup()
    writeGoogleDriveBackup(directory, original)
    for (const exportedAt of ['September 15, 2026', '2026-02-30T20:00:00.000Z', 2026, null]) {
      assert.throws(() => writeGoogleDriveBackup(directory, validBackup(exportedAt as string)))
      assert.equal(fs.readFileSync(path.join(directory, 'multiplife-latest.json'), 'utf8'), original)
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
