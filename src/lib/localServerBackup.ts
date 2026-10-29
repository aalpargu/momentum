import { createExternalBackupContents } from './externalBackupEnvelope.ts'
import { withDurableBackup } from './durableBackup.ts'

export type LocalServerBackupState = {
  available: boolean
  directoryName?: string
  lastBackupAt?: string
}

export const localServerBackupStateEvent = 'momentum:local-server-backup-state'
let writeQueue: Promise<LocalServerBackupState> = Promise.resolve({ available: false })

function announce(state: LocalServerBackupState) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(localServerBackupStateEvent, { detail: state }))
  return state
}

async function readState(response: Response): Promise<LocalServerBackupState> {
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Google Drive yedeği yazılamadı.')
  return response.json() as Promise<LocalServerBackupState>
}

export async function localServerBackupState() {
  const response = await fetch('/api/backups/google-drive', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
  if (response.status === 404 || response.status === 409) return { available: false } satisfies LocalServerBackupState
  return readState(response)
}

async function performWrite(payload: string) {
  const backup = createExternalBackupContents(payload, new Date().toISOString())
  const response = await fetch('/api/backups/google-drive', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ backup }), signal: AbortSignal.timeout(15_000) })
  if (response.status === 404 || response.status === 409) return { available: false } satisfies LocalServerBackupState
  return announce(await readState(response))
}

export function writeLocalServerBackup(_payload: string) {
  const operation = () => withDurableBackup('local-server', performWrite)
  writeQueue = writeQueue.then(operation, operation)
  return writeQueue
}
