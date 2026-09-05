import { openIndexedDatabase, runIndexedTransaction } from './indexedDb'

export type MainStateRecord = { key: 'current'; updatedAt: string; payload: string }

const databaseName = 'momentum-main-v1'
const databaseVersion = 1
const stateStoreName = 'app-state'
let saveQueue: Promise<void> = Promise.resolve()

function openDatabase() {
  return openIndexedDatabase(databaseName, databaseVersion, database => {
    if (!database.objectStoreNames.contains(stateStoreName)) database.createObjectStore(stateStoreName, { keyPath: 'key' })
  })
}

export async function loadMainState(): Promise<MainStateRecord | null> {
  await saveQueue.catch(() => undefined)
  const database = await openDatabase()
  try {
    return await runIndexedTransaction<MainStateRecord>(database, stateStoreName, 'readonly', store => store.get('current')) ?? null
  } finally { database.close() }
}

async function performSave(payload: string) {
  if (!payload) throw new Error('Boş uygulama verisi kaydedilemez.')
  const database = await openDatabase()
  try {
    await runIndexedTransaction(database, stateStoreName, 'readwrite', store => {
      store.put({ key: 'current', updatedAt: new Date().toISOString(), payload } satisfies MainStateRecord)
    })
  } finally { database.close() }
}

export function saveMainState(payload: string) {
  const operation = () => performSave(payload)
  saveQueue = saveQueue.then(operation, operation)
  return saveQueue
}
