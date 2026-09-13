import { openIndexedDatabase, runIndexedTransaction } from './indexedDb'
import { createExternalBackupContents } from './externalBackupEnvelope'

type PermissionStateValue = 'granted' | 'denied' | 'prompt'
type WritableFileHandle = { write: (data: string) => Promise<void>; close: () => Promise<void> }
type BackupFileHandle = { createWritable: () => Promise<WritableFileHandle> }
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
}

const databaseName = 'momentum-external-backup-v1'
const storeName = 'settings'
const handleKey = 'destination'
const metadataKey = 'metadata'
let writeQueue: Promise<ExternalBackupState> = Promise.resolve({ supported: true, configured: false })

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

async function writeFile(directory: BackupDirectoryHandle, name: string, contents: string) {
  const handle = await directory.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  try { await writable.write(contents) }
  finally { await writable.close() }
}

export async function externalBackupState(): Promise<ExternalBackupState> {
  if (!supported()) return { supported: false, configured: false }
  try {
    const directory = await readValue<BackupDirectoryHandle>(handleKey)
    const metadata = await readValue<{ lastBackupAt?: string }>(metadataKey)
    if (!directory) return { supported: true, configured: false, lastBackupAt: metadata?.lastBackupAt }
    return { supported: true, configured: true, directoryName: directory.name, permission: await directory.queryPermission({ mode: 'readwrite' }), lastBackupAt: metadata?.lastBackupAt }
  } catch { return { supported: true, configured: false } }
}

export async function selectExternalBackupDirectory(payload: string) {
  if (!supported()) throw new Error('Bu tarayıcı otomatik klasör yedeğini desteklemiyor.')
  const picker = fileSystemWindow().showDirectoryPicker
  if (!picker) throw new Error('Klasör seçici kullanılamıyor.')
  const directory = await picker({ id: 'momentum-backups', mode: 'readwrite' })
  await writeValue(handleKey, directory)
  return writeExternalBackup(payload, true)
}

async function performWrite(payload: string, requestPermission: boolean): Promise<ExternalBackupState> {
  const current = await externalBackupState()
  if (!current.supported || !current.configured) return current
  const directory = await readValue<BackupDirectoryHandle>(handleKey)
  if (!directory) return { supported: true, configured: false }
  let permission = await directory.queryPermission({ mode: 'readwrite' })
  if (permission !== 'granted' && requestPermission) permission = await directory.requestPermission({ mode: 'readwrite' })
  if (permission !== 'granted') return { ...current, permission }
  const now = new Date()
  const exportedAt = now.toISOString()
  const contents = createExternalBackupContents(payload, exportedAt)
  const day = exportedAt.slice(0, 10)
  await writeFile(directory, 'momentum-latest.json', contents)
  await writeFile(directory, `momentum-${day}.json`, contents)
  await writeValue(metadataKey, { lastBackupAt: exportedAt })
  return { supported: true, configured: true, directoryName: directory.name, permission: 'granted', lastBackupAt: exportedAt }
}

export function writeExternalBackup(payload: string, requestPermission = false) {
  const operation = () => performWrite(payload, requestPermission)
  writeQueue = writeQueue.then(operation, operation)
  return writeQueue
}

export async function forgetExternalBackupDirectory() {
  if (!supported()) return
  const database = await openDatabase()
  try { await runIndexedTransaction(database, storeName, 'readwrite', store => { store.delete(handleKey); store.delete(metadataKey) }) }
  finally { database.close() }
}
