export function createExternalBackupContents(payload: string, exportedAt: string) {
  const data = JSON.parse(payload) as unknown
  return JSON.stringify({ format: 'momentum-backup', version: 3, exportedAt, data }, null, 2)
}
