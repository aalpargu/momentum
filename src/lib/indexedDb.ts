const operationTimeoutMs = 8000

/** Open requests cannot be cancelled, so close any late connection without using it. */
export function openIndexedDatabase(name: string, version: number, upgrade: (database: IDBDatabase) => void, timeoutMs = operationTimeoutMs): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB kullanılamıyor.')); return }
    const request = indexedDB.open(name, version)
    let finished = false
    const fail = (error: unknown) => {
      if (finished) return
      finished = true; clearTimeout(timer); reject(error)
    }
    const timer = setTimeout(() => fail(new Error('Veri deposu zamanında yanıt vermedi.')), timeoutMs)
    request.onerror = () => fail(request.error ?? new Error('Veri deposu açılamadı.'))
    request.onblocked = () => fail(new Error('Veri deposu başka bir sekme tarafından kilitlendi.'))
    request.onupgradeneeded = () => {
      if (finished) { request.transaction?.abort(); return }
      try { upgrade(request.result) }
      catch (error) { request.transaction?.abort(); fail(error) }
    }
    request.onsuccess = () => {
      if (finished) { request.result.close(); return }
      finished = true; clearTimeout(timer)
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}

/** Abort timed-out transactions before allowing callers to retry or use a fallback. */
export function runIndexedTransaction<T = undefined>(
  database: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T> | void,
  timeoutMs = operationTimeoutMs,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = mode === 'readwrite'
      ? database.transaction(storeName, mode, { durability: 'strict' })
      : database.transaction(storeName, mode)
    let request: IDBRequest<T> | void
    let finished = false
    let failure: unknown
    const fail = (error: unknown) => {
      if (finished) return
      finished = true; clearTimeout(timer); reject(error)
    }
    const timer = setTimeout(() => {
      failure = new Error('Veri deposu işlemi zamanında tamamlanmadı; işlem iptal edildi.')
      try { transaction.abort() } catch { /* Tamamlanmış işlem artık yeni yazım yapamaz. */ }
      fail(failure)
    }, timeoutMs)
    transaction.oncomplete = () => {
      if (finished) return
      finished = true; clearTimeout(timer); resolve(request?.result)
    }
    transaction.onerror = () => { failure = transaction.error ?? new Error('Veri deposu işlemi başarısız.') }
    transaction.onabort = () => fail(failure ?? transaction.error ?? new Error('Veri deposu işlemi iptal edildi.'))
    try { request = operation(transaction.objectStore(storeName)) }
    catch (error) { try { transaction.abort() } catch { /* İşlem zaten bitmiş olabilir. */ }; fail(error) }
  })
}
