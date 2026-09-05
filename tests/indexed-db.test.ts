import test from 'node:test'
import assert from 'node:assert/strict'
import { openIndexedDatabase, runIndexedTransaction } from '../src/lib/indexedDb.ts'

test('unresponsive open rejects and closes a connection that arrives after timeout', async t => {
  let closed = 0, upgraded = 0, aborted = 0
  const request = { result: { close() { closed++ } }, transaction: { abort() { aborted++ } } } as unknown as IDBOpenDBRequest
  t.mock.method(globalThis, 'setTimeout', globalThis.setTimeout)
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => request } })
  try {
    await assert.rejects(openIndexedDatabase('test', 1, () => { upgraded++ }, 10), /zamanında/)
    request.onupgradeneeded?.call(request, {} as IDBVersionChangeEvent)
    request.onsuccess?.call(request, {} as Event)
    assert.equal(aborted, 1); assert.equal(upgraded, 0); assert.equal(closed, 1)
  } finally {
    if (original) Object.defineProperty(globalThis, 'indexedDB', original)
    else Reflect.deleteProperty(globalThis, 'indexedDB')
  }
})

test('timed-out write is aborted, cannot report success later, and permits a subsequent transaction', async () => {
  let aborted = 0
  const transaction = { objectStore: () => ({}), abort: () => { aborted++ } } as unknown as IDBTransaction
  const database = { transaction: () => transaction } as unknown as IDBDatabase
  let acknowledged = false
  const writing = runIndexedTransaction(database, 'data', 'readwrite', () => {}, 10).then(() => { acknowledged = true })
  await assert.rejects(writing, /zamanında/)
  assert.equal(aborted, 1)
  transaction.oncomplete?.call(transaction, {} as Event)
  assert.equal(acknowledged, false)
  const next = runIndexedTransaction<number>(database, 'data', 'readonly', () => ({ result: 42 }) as IDBRequest<number>)
  transaction.oncomplete?.call(transaction, {} as Event)
  assert.equal(await next, 42)
})

test('request success alone cannot acknowledge a write before transaction completion', async () => {
  const transaction = { objectStore: () => ({}) } as unknown as IDBTransaction
  const database = { transaction: () => transaction } as unknown as IDBDatabase
  let acknowledged = false
  const writing = runIndexedTransaction(database, 'data', 'readwrite', () => {}).then(() => { acknowledged = true })
  await Promise.resolve()
  assert.equal(acknowledged, false)
  transaction.oncomplete?.call(transaction, {} as Event)
  await writing
  assert.equal(acknowledged, true)
})

test('synchronous write failure aborts the transaction without partial commit', async () => {
  let aborted = false
  const transaction = { objectStore: () => ({}), abort: () => { aborted = true } } as unknown as IDBTransaction
  const database = { transaction: () => transaction } as unknown as IDBDatabase
  await assert.rejects(runIndexedTransaction(database, 'data', 'readwrite', () => { throw new Error('quota') }), /quota/)
  assert.equal(aborted, true)
})
