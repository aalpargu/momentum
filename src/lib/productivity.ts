import type { FocusSession, ScreenTimeEntry } from './domain'

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export type WorkSeriesMode = 'day' | 'week' | 'month'

function mondayOf(date: string) {
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7
  return shiftDate(date, -weekday)
}

function monthShift(month: string, offset: number) {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + offset, 1, 12))
  return date.toISOString().slice(0, 7)
}

export function buildWorkSeries(sessions: FocusSession[], today: string, mode: WorkSeriesMode) {
  const ranges = mode === 'day'
    ? Array.from({ length: 14 }, (_, index) => { const date = shiftDate(today, index - 13); return { key: date, start: date, end: date } })
    : mode === 'week'
      ? Array.from({ length: 12 }, (_, index) => { const start = shiftDate(mondayOf(today), (index - 11) * 7); return { key: start, start, end: index === 11 ? today : shiftDate(start, 6) } })
      : Array.from({ length: 12 }, (_, index) => { const key = monthShift(today.slice(0, 7), index - 11); const next = monthShift(key, 1); return { key, start: `${key}-01`, end: key === today.slice(0, 7) ? today : shiftDate(`${next}-01`, -1) } })
  return ranges.map((range) => {
    const inside = sessions.filter((session) => session.date >= range.start && session.date <= range.end)
    const activities = [...inside.reduce((map, session) => map.set(session.title, (map.get(session.title) ?? 0) + session.seconds), new Map<string, number>()).entries()]
      .map(([title, seconds]) => ({ title, seconds })).sort((a, b) => b.seconds - a.seconds || a.title.localeCompare(b.title, 'tr-TR'))
    const date = new Date(`${range.start}T12:00:00Z`)
    const shortLabel = mode === 'day'
      ? date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
      : mode === 'week'
        ? date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
        : date.toLocaleDateString('tr-TR', { month: 'short', timeZone: 'UTC' })
    return { ...range, shortLabel, label: periodLabel(range.start, range.end), seconds: inside.reduce((sum, session) => sum + session.seconds, 0), activities }
  })
}

export function signalNoise(sessions: FocusSession[], entries: ScreenTimeEntry[], start: string, end: string) {
  const inside = (date: string) => date >= start && date <= end
  const focusMinutes = sessions.filter((item) => inside(item.date)).reduce((sum, item) => sum + item.seconds / 60, 0)
  const usefulMinutes = entries.filter((item) => inside(item.date) && item.kind === 'useful').reduce((sum, item) => sum + item.minutes, 0)
  const noiseMinutes = entries.filter((item) => inside(item.date) && item.kind === 'passive').reduce((sum, item) => sum + item.minutes, 0)
  const excludedMinutes = entries.filter((item) => inside(item.date) && (item.kind === 'necessary' || item.kind === 'unclassified')).reduce((sum, item) => sum + item.minutes, 0)
  const signalMinutes = focusMinutes + usefulMinutes
  const measuredMinutes = signalMinutes + noiseMinutes
  return { signalMinutes, noiseMinutes, excludedMinutes, share: measuredMinutes ? signalMinutes / measuredMinutes * 100 : null, ratio: noiseMinutes ? signalMinutes / noiseMinutes : signalMinutes ? Infinity : null }
}

export function productivityStreak(activeDates: Set<string>, today: string) {
  const ordered = [...activeDates].filter((date) => date <= today).sort()
  let best = 0, run = 0, previous = ''
  for (const date of ordered) {
    run = previous && shiftDate(date, -1) === previous ? run + 1 : 1
    best = Math.max(best, run); previous = date
  }
  let current = 0, cursor = activeDates.has(today) ? today : shiftDate(today, -1)
  while (activeDates.has(cursor)) { current += 1; cursor = shiftDate(cursor, -1) }
  return { current, best, activeToday: activeDates.has(today), nextMilestone: [3, 7, 14, 30, 60, 100].find((value) => value > current) ?? Math.ceil((current + 1) / 100) * 100 }
}

export function weekPeriod(today: string, offset = 0) {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7
  const start = shiftDate(today, -weekday + Math.min(0, offset) * 7)
  const end = offset < 0 ? shiftDate(start, 6) : today
  const days = Array.from({ length: offset < 0 ? 7 : weekday + 1 }, (_, i) => shiftDate(start, i))
  return { start, end, days, previousStart: shiftDate(start, -7), previousEnd: shiftDate(end, -7) }
}

function normalizedApp(name: string) {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

const socialApps: Record<string, string[]> = {
  'Sosyal medya': ['sosyal medya', 'social media'],
  Instagram: ['instagram', 'instagram lite', 'com.instagram.android'],
  TikTok: ['tiktok', 'tik tok', 'tiktok lite', 'com.zhiliaoapp.musically'],
  'X / Twitter': ['x', 'twitter', 'x (twitter)', 'x / twitter', 'com.twitter.android'],
  Facebook: ['facebook', 'facebook lite', 'com.facebook.katana'],
  YouTube: ['youtube', 'youtube shorts', 'com.google.android.youtube'],
  Snapchat: ['snapchat', 'com.snapchat.android'],
  Reddit: ['reddit', 'com.reddit.frontpage'],
  Threads: ['threads', 'com.instagram.barcelona'],
  Pinterest: ['pinterest', 'com.pinterest'],
  LinkedIn: ['linkedin', 'com.linkedin.android'],
  Discord: ['discord', 'com.discord'],
  Bluesky: ['bluesky', 'xyz.blueskyweb.app'],
  Mastodon: ['mastodon', 'org.joinmastodon.android'],
}
const aliases = new Map(Object.entries(socialApps).flatMap(([name, values]) => values.map((alias) => [alias, name] as const)))
export const socialAppNames = Object.keys(socialApps)
export function socialAppName(name: string) { return aliases.get(normalizedApp(name)) ?? null }

export function durationText(seconds: number) {
  if (seconds > 0 && seconds < 60) return `${Math.round(seconds)} saniye`
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60), rest = minutes % 60
  return hours ? `${hours} saat${rest ? ` ${rest} dakika` : ''}` : `${minutes} dakika`
}
export function shortDuration(seconds: number) {
  if (seconds > 0 && seconds < 60) return `${Math.round(seconds)} sn`
  const minutes = Math.round(seconds / 60), hours = Math.floor(minutes / 60), rest = minutes % 60
  return hours ? `${hours} sa${rest ? ` ${rest} dk` : ''}` : `${minutes} dk`
}
export function periodLabel(start: string, end: string) {
  const format = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return start === end ? format(start) : `${format(start)} – ${format(end)}`
}
export function percentageChange(current: number, previous: number): number | null {
  // An absent entry is unknown usage, not a measured zero.
  return current > 0 && previous > 0 ? (current - previous) / previous * 100 : null
}
export function changeText(change: number | null) {
  if (change === null) return 'Karşılaştırma için iki dönemde de kayıt gerekli'
  if (change === 0) return 'Değişmedi'
  const amount = Math.abs(change)
  const formatted = amount < 1 ? '%1’den az' : `%${Math.round(amount).toLocaleString('tr-TR')}`
  return `${formatted} ${change < 0 ? 'azaldı' : 'arttı'}`
}

function focusStats(sessions: FocusSession[]) {
  const grouped = new Map<string, number>()
  for (const session of sessions) {
    const key = session.source === 'timer' && session.timerSessionId ? `timer:${session.timerSessionId}` : `entry:${session.id}`
    grouped.set(key, (grouped.get(key) ?? 0) + session.seconds)
  }
  const seconds = sessions.reduce((sum, session) => sum + session.seconds, 0)
  return { seconds, count: grouped.size, averageSeconds: grouped.size ? seconds / grouped.size : 0, activeDays: new Set(sessions.map((s) => s.date)).size }
}

export function hourlyFocus(sessions: FocusSession[]) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, seconds: 0, days: new Set<string>() }))
  const measuredIds = new Set<string>()
  const measuredDays = new Set<string>()
  let excludedCount = 0
  for (const session of sessions) {
    if (session.source !== 'timer' || !session.segments?.length || !session.timerSessionId) { excludedCount += 1; continue }
    measuredIds.add(session.timerSessionId)
    measuredDays.add(session.date)
    for (const segment of session.segments) {
      let cursor = Date.parse(segment.startedAt) - segment.offsetMinutes * 60_000
      const end = Date.parse(segment.endedAt) - segment.offsetMinutes * 60_000
      while (cursor < end) {
        const local = new Date(cursor)
        const nextHour = Math.floor(cursor / 3_600_000) * 3_600_000 + 3_600_000
        const boundary = Math.min(end, nextHour)
        hours[local.getUTCHours()].seconds += (boundary - cursor) / 1000
        hours[local.getUTCHours()].days.add(session.date)
        cursor = boundary
      }
    }
  }
  const ranked = hours.filter((hour) => hour.seconds > 0).sort((a, b) => b.seconds - a.seconds || a.hour - b.hour)
  return { hours: hours.map(({ days, ...hour }) => ({ ...hour, days: days.size })), ranked: ranked.map(({ days, ...hour }) => ({ ...hour, days: days.size })), measuredCount: measuredIds.size, measuredDays: measuredDays.size, excludedCount }
}

export function buildProductivityReport(sessions: FocusSession[], entries: ScreenTimeEntry[], today: string, offset = 0) {
  const period = weekPeriod(today, offset)
  const inside = (date: string, start: string, end: string) => date >= start && date <= end
  const currentSessions = sessions.filter((s) => inside(s.date, period.start, period.end))
  const previousSessions = sessions.filter((s) => inside(s.date, period.previousStart, period.previousEnd))
  const currentEntries = entries.filter((e) => inside(e.date, period.start, period.end))
  const previousEntries = entries.filter((e) => inside(e.date, period.previousStart, period.previousEnd))
  const appMap = new Map<string, { name: string; social: boolean; current: number; previous: number; currentDays: Set<string>; previousDays: Set<string> }>()
  for (const [list, which] of [[previousEntries, 'previous'], [currentEntries, 'current']] as const) {
    for (const entry of list) {
      const social = socialAppName(entry.app)
      const key = normalizedApp(social ?? entry.app)
      const app = appMap.get(key) ?? { name: social ?? entry.app.trim(), social: Boolean(social), current: 0, previous: 0, currentDays: new Set<string>(), previousDays: new Set<string>() }
      app[which] += entry.minutes
      app[`${which}Days`].add(entry.date)
      appMap.set(key, app)
    }
  }
  const apps = [...appMap.values()].map((app) => ({ ...app, currentDays: app.currentDays.size, previousDays: app.previousDays.size, change: percentageChange(app.current, app.previous) })).sort((a, b) => Math.max(b.current, b.previous) - Math.max(a.current, a.previous) || a.name.localeCompare(b.name, 'tr'))
  const socialMinutes = (list: ScreenTimeEntry[]) => list.reduce((sum, e) => sum + (socialAppName(e.app) ? e.minutes : 0), 0)
  const focus = focusStats(currentSessions), previousFocus = focusStats(previousSessions)
  const days = period.days.map((date) => ({ date, focusSeconds: currentSessions.filter((s) => s.date === date).reduce((sum, s) => sum + s.seconds, 0), socialMinutes: socialMinutes(currentEntries.filter((e) => e.date === date)), hasScreenRecord: currentEntries.some((e) => e.date === date) }))
  const bestDay = days.filter((d) => d.focusSeconds > 0).sort((a, b) => b.focusSeconds - a.focusSeconds || a.date.localeCompare(b.date))[0] ?? null
  const currentSocialMinutes = socialMinutes(currentEntries), previousSocialMinutes = socialMinutes(previousEntries)
  return { period, focus, previousFocus, focusChange: percentageChange(focus.seconds, previousFocus.seconds), socialMinutes: currentSocialMinutes, previousSocialMinutes, socialChange: percentageChange(currentSocialMinutes, previousSocialMinutes), screenDays: new Set(currentEntries.map((e) => e.date)).size, previousScreenDays: new Set(previousEntries.map((e) => e.date)).size, apps, days, bestDay, hourly: hourlyFocus(currentSessions) }
}
export type ProductivityReport = ReturnType<typeof buildProductivityReport>

export function weeklyReportText(report: ProductivityReport) {
  return [
    '# Momentum · Haftalık verimlilik raporu',
    periodLabel(report.period.start, report.period.end),
    `Karşılaştırma: ${periodLabel(report.period.previousStart, report.period.previousEnd)}`,
    '',
    `Kaydedilen odak: ${durationText(report.focus.seconds)} · ${report.focus.count} oturum`,
    `Ortalama odak: ${report.focus.count ? durationText(report.focus.averageSeconds) : 'Kayıt yok'}`,
    `Odak değişimi: ${changeText(report.focusChange)}`,
    `Kaydedilen sosyal medya: ${report.socialMinutes ? durationText(report.socialMinutes * 60) : 'Kayıt yok'}`,
    `Odak kaydı olan gün: ${report.focus.activeDays}/${report.period.days.length}`,
    `Ekran kaydı olan gün: ${report.screenDays}/${report.period.days.length}; önceki dönem: ${report.previousScreenDays}/${report.period.days.length}`,
    '', '## Uygulama karşılaştırması',
    ...report.apps.map((app) => `${app.name}: ${app.current ? durationText(app.current * 60) : 'Kayıt yok'} / önceki ${app.previous ? durationText(app.previous * 60) : 'Kayıt yok'} · ${changeText(app.change)} · kayıt günü ${app.currentDays}/${app.previousDays}`),
    '', '## En çok odaklanılan saatler',
    ...(report.hourly.ranked.length ? report.hourly.ranked.slice(0, 3).map((h) => `${String(h.hour).padStart(2, '0')}:00–${String(h.hour + 1).padStart(2, '0')}:00: ${durationText(h.seconds)}`) : ['Saat bilgisi olan tamamlanmış zamanlayıcı oturumu yok.']),
    '', 'Hesaplar kaydedilen verilere dayanır. Eksik kayıtlar sıfır kullanım sayılmaz. Açık oturumlar ortalamaya dahil değildir. Saat analizinde mola süreleri, manuel ve saat ayrıntısı olmayan eski kayıtlar kullanılmaz.',
    `Sosyal medya uygulamaları: ${socialAppNames.join(', ')}. Faydalı olarak işaretlenen sosyal medya kullanımı da bu toplama dahildir.`,
  ].join('\n')
}
