export function retainedBackupIds(snapshots: { id: number; createdAt: string }[]) {
  const ordered = snapshots.slice().sort((a, b) => b.id - a.id)
  const keep = new Set(ordered.slice(0, 7).map(item => item.id))
  const days = new Set<string>()
  for (const item of ordered) {
    const date = new Date(item.createdAt)
    const day = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    if (!days.has(day) && days.size < 30) { days.add(day); keep.add(item.id) }
  }
  return keep
}
