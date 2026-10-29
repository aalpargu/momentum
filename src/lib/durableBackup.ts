import { readMainState } from './stateStore.ts'

/** Serialize backup writers across tabs and use the latest committed data. */
export async function withDurableBackup<T>(destination: string, write: (payload: string) => Promise<T>): Promise<T> {
  const operation = async () => {
    const record = await readMainState()
    if (!record) throw new Error('Ana kayıt okunamadığı için klasör yedeği güncellenmedi.')
    return write(record.payload)
  }
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('momentum-backup-' + destination, operation)
  return operation()
}
