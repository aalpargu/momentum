import { openIndexedDatabase, runIndexedTransaction } from './indexedDb.ts'
import { createExternalBackupContents } from './externalBackupEnvelope.ts'
import { withDurableBackup } from './durableBackup.ts'

type PermissionStateValue = 'granted' | 'denied' | 'prompt'
type WritableFileHandle = { write: (data: string) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }
type BackupFileHandle = { createWritable: () => Promise<WritableFileHandle>; getFile: () => Promise<{ text: () => Promise<string> }> }
export type BackupDirectoryHandle = {
  kind: 'directory'
  name: string
  queryPermission: (options: { mode: 'readwrite' }) => Promise<PermissionStateValue>
  requestPermission: (options: { mode: 'readwrite' }) => Promise<PermissionStateValue>
  getFileHandle: (name: string, options: { create: true }) => Promise<BackupFileHandle>
}

export type ExternalBackupState = {
  supported: boolean
  configured: boolean
  directoryName?: string
  permission?: PermissionStateValue
  lastBackupAt?: string
  pendingSince?: string
}

const databaseName = 'momentum-external-backup-v1'
const storeName = 'settings'
const handleKey = 'destination'
const metadataKey = 'metadata'
const pendingStorageKey = 'momentum-external-backup-pending-v1'
export const externalBackupStateEvent = 'momentum:external-backup-state'
let writeQueue: Promise<ExternalBackupState> = Promise.resolve({ supported: true, configured: false })

function announce(state: ExternalBackupState) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(externalBackupStateEvent, { detail: state }))
  return state
}

function pendingSince() {
  try { return localStorage.getItem(pendingStorageKey) ?? undefined }
  catch { return undefined }
}

function markPending() {
  try { if (!localStorage.getItem(pendingStorageKey)) localStorage.setItem(pendingStorageKey, new Date().toISOString()) }
  catch { /* IndexedDB ve doğrudan yazma akışı çalışmaya devam eder. */ }
}

function clearPending() {
  try { localStorage.removeItem(pendingStorageKey) }
  catch { /* Başarılı dosya yedeği bu işaretten bağımsızdır. */ }
}

function fileSystemWindow() {
  return window as Window & { showDirectoryPicker?: (options?: { id?: string; mode?: 'readwrite' }) => Promise<BackupDirectoryHandle> }
}

function supported() {
  return typeof window !== 'undefined' && typeof fileSystemWindow().showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined'
}

function openDatabase() {
  return openIndexedDatabase(databaseName, 1, database => {
    if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName)
  })
}

async function readValue<T>(key: string): Promise<T | null> {
  if (!supported()) return null
  const database = await openDatabase()
  try { return await runIndexedTransaction<T>(database, storeName, 'readonly', store => store.get(key)) ?? null }
  finally { database.close() }
}

async function writeValue(key: string, value: unknown) {
  const database = await openDatabase()
  try { await runIndexedTransaction(database, storeName, 'readwrite', store => store.put(value, key)) }
  finally { database.close() }
}

export async function writeBackupFile(directory: BackupDirectoryHandle, name: string, contents: string) {
  const handle = await directory.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  try { await writable.write(contents); await writable.close() }
  catch (error) { await writable.abort().catch(() => undefined); throw error }
  const savedContents = await (await handle.getFile()).text()
  if (savedContents !== contents) throw new Error(`${name} yazıldı ancak doğrulanamadı.`)
}

export async function externalBackupState(): Promise<ExternalBackupState> {
  if (!supported()) return { supported: false, configured: false }
  try {
    const directory = await readValue<BackupDirectoryHandle>(handleKey)
    const metadata = await readValue<{ lastBackupAt?: string }>(metadataKey)
    if (!directory) return { supported: true, configured: false, lastBackupAt: metadata?.lastBackupAt, pendingSince: pendingSince() }
    return { supported: true, configured: true, directoryName: directory.name, permission: await directory.queryPermission({ mode: 'readwrite' }), lastBackupAt: metadata?.lastBackupAt, pendingSince: pendingSince() }
  } catch { throw new Error('Klasör yedeğinin durumu okunamadı.') }
}

export async function selectExternalBackupDirectory(payload: string) {
  if (!supported()) throw new Error('Bu tarayıcı otomatik klasör yedeğini desteklemiyor.')
  const picker = fileSystemWindow().showDirectoryPicker
  if (!picker) throw new Error('Klasör seçici kullanılamıyor.')
  const directory = await picker({ id: 'momentum-backups', mode: 'readwrite' })
  await writeValue(handleKey, directory)
  return writeExternalBackup(payload, true)
}

async function performWrite(requestPermission: boolean): Promise<ExternalBackupState> {
  const current = await externalBackupState()
  if (!current.supported || !current.configured) { clearPending(); return current }
  const directory = await readValue<BackupDirectoryHandle>(handleKey)
  if (!directory) return { supported: true, configured: false }
  let permission = await directory.queryPermission({ mode: 'readwrite' })
  if (permission !== 'granted' && requestPermission) permission = await directory.requestPermission({ mode: 'readwrite' })
  if (permission !== 'granted') return { ...current, permission }
  return withDurableBackup('directory', async payload => {
    const exportedAt = new Date().toISOString()
    const contents = createExternalBackupContents(payload, exportedAt)
    const day = exportedAt.slice(0, 10)
    await writeBackupFile(directory, 'momentum-latest.json', contents)
    await writeBackupFile(directory, `momentum-${day}.json`, contents)
    await writeValue(metadataKey, { lastBackupAt: exportedAt })
    clearPending()
    return { supported: true, configured: true, directoryName: directory.name, permission: 'granted', lastBackupAt: exportedAt }
  })
}

export function writeExternalBackup(_payload: string, requestPermission = false) {
  markPending()
  const operation = () => { markPending(); return performWrite(requestPermission) }
  writeQueue = writeQueue.then(operation, operation)
  void writeQueue.then(announce).catch(() => undefined)
  return writeQueue
}

export async function retryPendingExternalBackup(payload: string) {
  if (!pendingSince()) return externalBackupState()
  return writeExternalBackup(payload)
}

export async function forgetExternalBackupDirectory() {
  if (!supported()) return
  const database = await openDatabase()
  try { await runIndexedTransaction(database, storeName, 'readwrite', store => { store.delete(handleKey); store.delete(metadataKey) }) }
  finally { database.close() }
  clearPending()
  announce({ supported: true, configured: false })
}
