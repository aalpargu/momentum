import test from 'node:test'
import assert from 'node:assert/strict'
import { writeBackupFile, type BackupDirectoryHandle } from '../src/lib/externalBackup.ts'
test('failed backup write aborts rather than committing a truncated file', async () => {
  let closed = 0, aborted = 0
  const directory = { getFileHandle: async () => ({ createWritable: async () => ({ write: async () => { throw new Error('disk full') }, close: async () => { closed++ }, abort: async () => { aborted++ } }), getFile: async () => ({ text: async () => '' }) }) } as unknown as BackupDirectoryHandle
  await assert.rejects(writeBackupFile(directory, 'backup.json', 'new data'), /disk full/)
  assert.equal(closed, 0); assert.equal(aborted, 1)
})
test('successful backup commits exactly once after its contents are written', async () => {
  const calls: string[] = []
  const directory = { getFileHandle: async () => ({ createWritable: async () => ({ write: async (contents: string) => { calls.push(contents) }, close: async () => { calls.push('commit') }, abort: async () => { calls.push('abort') } }), getFile: async () => ({ text: async () => 'new data' }) }) } as unknown as BackupDirectoryHandle
  await writeBackupFile(directory, 'backup.json', 'new data')
  assert.deepEqual(calls, ['new data', 'commit'])
})
test('backup write rejects a file whose saved contents do not match', async () => {
  const directory = { getFileHandle: async () => ({ createWritable: async () => ({ write: async () => undefined, close: async () => undefined, abort: async () => undefined }), getFile: async () => ({ text: async () => 'truncated' }) }) } as unknown as BackupDirectoryHandle
  await assert.rejects(writeBackupFile(directory, 'backup.json', 'complete data'), /doğrulanamadı/)
})
