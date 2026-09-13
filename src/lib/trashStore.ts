import { openIndexedDatabase, runIndexedTransaction } from './indexedDb'
import { createTrashItem, type TrashItem, type TrashKind } from './trash'

const databaseName = 'momentum-trash-v1'
const storeName = 'deleted-items'
const fallbackKey = 'momentum-trash-fallback-v1'
const maximumItems = 50
const retentionMs = 30 * 24 * 60 * 60 * 1000

function openDatabase() {
  return openIndexedDatabase(databaseName, 1, database => {
    if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: 'id' })
  })
}

function retained(items: TrashItem[], now = Date.now()) {
  return items.filter(item => Number.isFinite(Date.parse(item.deletedAt)) && Date.parse(item.deletedAt) >= now - retentionMs).sort((left, right) => right.deletedAt.localeCompare(left.deletedAt)).slice(0, maximumItems)
}

function readFallback() {
  try { return retained(JSON.parse(localStorage.getItem(fallbackKey) ?? '[]') as TrashItem[]) }
  catch { return [] }
}

function writeFallback(items: TrashItem[]) {
  localStorage.setItem(fallbackKey, JSON.stringify(retained(items)))
}

export async function listTrashItems(): Promise<TrashItem[]> {
  if (typeof indexedDB === 'undefined') return readFallback()
  try {
    const database = await openDatabase()
    try {
      const stored = await runIndexedTransaction<TrashItem[]>(database, storeName, 'readonly', store => store.getAll()) ?? []
      const items = retained(stored)
      if (items.length !== stored.length) await runIndexedTransaction(database, storeName, 'readwrite', store => { store.clear(); items.forEach(item => store.put(item)) })
      return items
    }
    finally { database.close() }
  } catch { return readFallback() }
}

export async function addTrashItem(kind: TrashKind, label: string, payload: unknown) {
  const item = createTrashItem(kind, label, payload)
  if (typeof indexedDB !== 'undefined') {
    try {
      const existing = await listTrashItems()
      const database = await openDatabase()
      try { await runIndexedTransaction(database, storeName, 'readwrite', store => { store.put(item); existing.slice(maximumItems - 1).forEach(entry => store.delete(entry.id)) }) }
      finally { database.close() }
      return item
    } catch { /* Tarayıcı IndexedDB'yi engellerse küçük yerel geri dönüş deposunu kullan. */ }
  }
  writeFallback([item, ...readFallback()])
  return item
}

export async function removeTrashItem(id: string) {
  if (typeof indexedDB !== 'undefined') {
    try {
      const database = await openDatabase()
      try { await runIndexedTransaction(database, storeName, 'readwrite', store => store.delete(id)) }
      finally { database.close() }
    } catch { /* Geri dönüş deposu da aşağıda temizlenir. */ }
  }
  writeFallback(readFallback().filter(item => item.id !== id))
}

export async function clearTrashItems() {
  if (typeof indexedDB !== 'undefined') {
    try {
      const database = await openDatabase()
      try { await runIndexedTransaction(database, storeName, 'readwrite', store => store.clear()) }
      finally { database.close() }
    } catch { /* Yerel geri dönüş deposu yine temizlenir. */ }
  }
  localStorage.removeItem(fallbackKey)
}
