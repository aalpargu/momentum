import { retainedBackupIds } from './backupRetention.ts'
import { openIndexedDatabase, runIndexedTransaction } from './indexedDb'

export type AutomaticBackup = { id: number; createdAt: string; payload: string }

const databaseName = 'momentum-recovery-v1'
const storeName = 'snapshots'
let saveQueue: Promise<void> = Promise.resolve()

function openDatabase() {
  return openIndexedDatabase(databaseName, 1, database => {
    if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true })
  })
}

export async function listAutomaticBackups(): Promise<AutomaticBackup[]> {
  if (typeof indexedDB === 'undefined') return []
  const database = await openDatabase()
  try {
    const values = await runIndexedTransaction<AutomaticBackup[]>(database, storeName, 'readonly', store => store.getAll())
    return (values ?? []).sort((left, right) => right.id - left.id)
  } finally { database.close() }
}

async function performAutomaticBackup(payload: string) {
  if (typeof indexedDB === 'undefined' || !payload) return
  const database = await openDatabase()
  try {
    await runIndexedTransaction(database, storeName, 'readwrite', store => {
      const request = store.getAll()
      request.onsuccess = () => {
        const existing = (request.result as AutomaticBackup[]).sort((a, b) => b.id - a.id)
        if (existing[0]?.payload === payload) return
        const createdAt = new Date().toISOString()
        const keep = retainedBackupIds([{ id: (existing[0]?.id ?? 0) + 1, createdAt }, ...existing])
        store.add({ createdAt, payload })
        existing.filter(snapshot => !keep.has(snapshot.id)).forEach(snapshot => store.delete(snapshot.id))
      }
    })
  } finally { database.close() }
}

export function saveAutomaticBackup(payload: string) {
  const operation = () => performAutomaticBackup(payload)
  saveQueue = saveQueue.then(operation, operation)
  return saveQueue
}
