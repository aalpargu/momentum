export type TrackedScreenKind = 'passive' | 'useful' | 'necessary' | 'unclassified'
export type AnalyticsSession = { date: string; seconds: number }
export type AnalyticsScreenEntry = { date: string; minutes: number; kind?: TrackedScreenKind }

export type DailyScoreBreakdown = {
  total: number
  focusPoints: number
  habitPoints: number
  focusMaximum: 65
  habitMaximum: 35
}

export function previousDay(key: string) {
  const date = new Date(`${key}T12:00:00`)
  date.setDate(date.getDate() - 1)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function calculateDailyScore(input: { focusSeconds: number; focusTargetMinutes: number; idealHabits: number; minimumHabits: number; habitCount: number }): DailyScoreBreakdown {
  const targetSeconds = Math.max(1, input.focusTargetMinutes * 60)
  const focusPoints = Math.min(65, Math.max(0, input.focusSeconds) / targetSeconds * 65)
  const habitValue = Math.max(0, input.idealHabits) + Math.max(0, input.minimumHabits) * 0.6
  const habitPoints = input.habitCount > 0 ? Math.min(35, habitValue / input.habitCount * 35) : 0
  return { total: Math.max(0, Math.min(100, Math.round(focusPoints + habitPoints))), focusPoints: Math.round(focusPoints), habitPoints: Math.round(habitPoints), focusMaximum: 65, habitMaximum: 35 }
}

export function screenMinutes(entries: AnalyticsScreenEntry[], kind?: TrackedScreenKind) {
  return entries.filter((entry) => !kind || (entry.kind ?? 'unclassified') === kind).reduce((sum, entry) => sum + entry.minutes, 0)
}

export function buildDailySeries(sessions: AnalyticsSession[], screenEntries: AnalyticsScreenEntry[], endDate: string, length = 7) {
  const reversed: string[] = []
  let cursor = endDate
  for (let index = 0; index < length; index += 1) { reversed.push(cursor); cursor = previousDay(cursor) }
  return reversed.reverse().map((date) => ({
    date,
    focusMinutes: Math.round(sessions.filter((session) => session.date === date).reduce((sum, session) => sum + session.seconds, 0) / 60),
    passiveMinutes: screenMinutes(screenEntries.filter((entry) => entry.date === date), 'passive'),
  }))
}

export function buildMonthlySeries(sessions: AnalyticsSession[], screenEntries: AnalyticsScreenEntry[], endDate: string, length = 6) {
  const end = new Date(`${endDate.slice(0, 7)}-01T12:00:00`)
  return Array.from({ length }, (_, reverseIndex) => {
    const offset = reverseIndex - (length - 1)
    const date = new Date(end.getFullYear(), end.getMonth() + offset, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return {
      key,
      focusMinutes: Math.round(sessions.filter((session) => session.date.startsWith(key)).reduce((sum, session) => sum + session.seconds, 0) / 60),
      passiveMinutes: screenMinutes(screenEntries.filter((entry) => entry.date.startsWith(key)), 'passive'),
    }
  })
}
