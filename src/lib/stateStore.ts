import { openIndexedDatabase, runIndexedTransaction } from './indexedDb.ts'

export type MainStateRecord = { key: 'current'; updatedAt: string; payload: string; revision?: string }
export class StateConflictError extends Error {
  constructor() { super('Başka bir sekmede kayıtlar değişti. Bu değişiklik kaydedilmedi; sayfayı yenileyip tekrar dene.'); this.name = 'StateConflictError' }
}
const databaseName = 'momentum-main-v1'
const stateStoreName = 'app-state'
let saveQueue: Promise<void> = Promise.resolve()
let loaded = false
let expected: MainStateRecord | null = null
function openDatabase() {
  return openIndexedDatabase(databaseName, 1, database => {
    if (!database.objectStoreNames.contains(stateStoreName)) database.createObjectStore(stateStoreName, { keyPath: 'key' })
  })
}
/** Read for backup without adopting a revision that the current UI has not loaded. */
export async function readMainState(): Promise<MainStateRecord | null> {
  await saveQueue.catch(() => undefined)
  const database = await openDatabase()
  try {
    return await runIndexedTransaction<MainStateRecord>(database, stateStoreName, 'readonly', store => store.get('current')) ?? null
  } finally { database.close() }
}
export async function loadMainState(): Promise<MainStateRecord | null> {
  const record = await readMainState()
  expected = record; loaded = true
  return record
}
async function performSave(payload: string) {
  if (!loaded) throw new Error('Ana kayıt okunmadan üzerine yazılamaz.')
  if (!payload) throw new Error('Boş uygulama verisi kaydedilemez.')
  const database = await openDatabase()
  let conflict = false
  const next: MainStateRecord = { key: 'current', updatedAt: new Date().toISOString(), payload, revision: crypto.randomUUID() }
  try {
    await runIndexedTransaction(database, stateStoreName, 'readwrite', store => {
      const request = store.get('current')
      request.onsuccess = () => {
        const current = request.result as MainStateRecord | undefined
        // Compare and write in the same transaction: other tabs cannot interleave.
        if (JSON.stringify(current ?? null) !== JSON.stringify(expected) && current?.payload !== payload) {
          conflict = true; store.transaction.abort(); return
        }
        store.put(next)
      }
    })
    expected = next
  } catch (error) { if (conflict) throw new StateConflictError(); throw error }
  finally { database.close() }
}
export function saveMainState(payload: string) {
  const operation = () => performSave(payload)
  saveQueue = saveQueue.then(operation, operation)
  return saveQueue
}
