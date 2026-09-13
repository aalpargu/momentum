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
  if (habit.archived || (habit.pausedUntil && habit.pausedUntil >= dateKey)) return false
  const scheduled = habit.scheduleDays?.length ? habit.scheduleDays : weekdays.map(day => day.value)
  return scheduled.includes(new Date(`${dateKey}T12:00:00`).getDay())
}
