import { openIndexedDatabase, runIndexedTransaction } from './indexedDb'

export type AutomaticBackup = { id: number; createdAt: string; payload: string }

const databaseName = 'momentum-recovery-v1'
const storeName = 'snapshots'
const maximumSnapshots = 7
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
  const existing = await listAutomaticBackups()
  if (existing[0]?.payload === payload) return
  const database = await openDatabase()
  try {
    await runIndexedTransaction(database, storeName, 'readwrite', store => {
      store.add({ createdAt: new Date().toISOString(), payload })
      existing.slice(maximumSnapshots - 1).forEach(snapshot => store.delete(snapshot.id))
    })
  } finally { database.close() }
}

export function saveAutomaticBackup(payload: string) {
  const operation = () => performAutomaticBackup(payload)
  saveQueue = saveQueue.then(operation, operation)
  return saveQueue
}
