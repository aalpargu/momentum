import type { Habit } from './domain.ts'

export const weekdays = [
  { value: 1, short: 'Pzt', label: 'Pazartesi' },
  { value: 2, short: 'Sal', label: 'Salı' },
  { value: 3, short: 'Çar', label: 'Çarşamba' },
  { value: 4, short: 'Per', label: 'Perşembe' },
  { value: 5, short: 'Cum', label: 'Cuma' },
  { value: 6, short: 'Cmt', label: 'Cumartesi' },
  { value: 0, short: 'Paz', label: 'Pazar' },
] as const

export function habitIsDue(habit: Habit, dateKey: string) {
  if (habit.archived || habit.pauseHistory?.some(period => period.start <= dateKey && period.end >= dateKey) || (!habit.pauseHistory && habit.pausedUntil && habit.pausedUntil >= dateKey)) return false
  const scheduled = habit.scheduleDays?.length ? habit.scheduleDays : weekdays.map(day => day.value)
  return scheduled.includes(new Date(`${dateKey}T12:00:00`).getDay())
}

/** Rest days do not break a scheduled habit; today's unfinished task has grace. */
export function habitStreak(habit: Habit, log: Record<string, Record<string, { status: string }>>, today: string) {
  const earliest = Object.keys(log).filter(date => log[date]?.[habit.id]).sort()[0]
  if (!earliest) return 0
  const scheduled = habit.scheduleDays?.length ? habit.scheduleDays : weekdays.map(day => day.value)
  let cursor = today, count = 0
  while (cursor >= earliest) {
    const date = new Date(cursor + 'T12:00:00Z')
    const paused = habit.pauseHistory?.some(period => period.start <= cursor && period.end >= cursor) ?? false
    const due = scheduled.includes(date.getUTCDay()) && !paused
    const completed = log[cursor]?.[habit.id]?.status === 'minimum' || log[cursor]?.[habit.id]?.status === 'ideal'
    if (due) { if (completed) count++; else if (cursor !== today) break }
    date.setUTCDate(date.getUTCDate() - 1)
    cursor = date.toISOString().slice(0, 10)
  }
  return count
}

/** Record explicit pause boundaries so pausing does not erase previous streak history. */
export function updateHabitPause(previous: Habit, next: Habit, today: string): Habit {
  if ((previous.pausedUntil ?? '') === (next.pausedUntil ?? '')) return { ...next, pauseHistory: previous.pauseHistory }
  const yesterday = new Date(today + 'T12:00:00Z'); yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const end = yesterday.toISOString().slice(0, 10)
  const history = (previous.pauseHistory ?? []).map(period => period.end >= today ? { ...period, end } : period).filter(period => period.start <= period.end)
  if (next.pausedUntil && next.pausedUntil >= today) history.push({ start: today, end: next.pausedUntil })
  return { ...next, pauseHistory: history }
}
