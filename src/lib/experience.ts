import type { AppState, Area, CalendarBlock, RecentEntry } from './domain'

const validAreas: Area[] = ['Eğitim', 'Kariyer', 'İngilizce', 'Sağlık', 'Bilgi']
export const saveFailure = 'Kaydedilemedi. Girdiğin değerler korunuyor; depolama alanını kontrol edip tekrar dene.'

export function parseQuickEntry(text: string, categories: { title: string; area: Area }[], fallback: Area): RecentEntry {
  const match = text.trim().match(/^(?:(\d+(?:[.,]\d+)?)\s*(?:saat|sa)\s*)?(?:(\d+)\s*(?:dakika|dk)\s*)?(.+)$/i)
  if (!match || (!match[1] && !match[2])) throw new Error('Örn. “30 dk kitap” veya “1 saat 20 dk DSA” yaz.')
  const minutes = Number(match[1]?.replace(',', '.') ?? 0) * 60 + Number(match[2] ?? 0)
  const title = match[3].trim()
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('Süre 1–1440 arasında tam dakika olmalı.')
  if (!title || title.length > 60 || /^[\d+.,-]/.test(title) || /(?:\d\s*(?:dk|dakika|saat)|[;\n])/i.test(title)) throw new Error('Tek bir etkinlik adı yaz; süreyi başa koy.')
  const category = categories.find(item => item.title.toLocaleLowerCase('tr-TR') === title.toLocaleLowerCase('tr-TR'))
  const area = category?.area ?? (/kitap|okuma/i.test(title) ? 'Bilgi' : /ingilizce/i.test(title) ? 'İngilizce' : fallback)
  return { title: category?.title ?? title.charAt(0).toLocaleUpperCase('tr-TR') + title.slice(1), area, minutes }
}

export function rememberEntry(state: AppState, entry: RecentEntry) {
  const recentEntries = [entry, ...(state.experience?.recentEntries ?? []).filter(item => item.title !== entry.title || item.minutes !== entry.minutes)].slice(0, 6)
  return { recentEntries, seenMilestones: state.experience?.seenMilestones ?? [] }
}

export function clockLabel(minute: number) {
  return String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0')
}
export function shiftDay(date: string, amount: number) {
  const next = new Date(date + 'T12:00:00Z')
  next.setUTCDate(next.getUTCDate() + amount)
  return next.toISOString().slice(0, 10)
}
export function validCalendarBlock(block: CalendarBlock) {
  return Boolean(block.id && block.title.trim() && block.title.length <= 100 && validAreas.includes(block.area)
    && /^\d{4}-\d{2}-\d{2}$/.test(block.date) && Number.isFinite(Date.parse(block.date + 'T12:00:00Z'))
    && new Date(block.date + 'T12:00:00Z').toISOString().slice(0, 10) === block.date
    && Number.isInteger(block.startMinute) && block.startMinute >= 0
    && Number.isInteger(block.minutes) && block.minutes >= 15 && block.startMinute + block.minutes <= 1440)
}
export function conflictsFor(block: CalendarBlock, blocks: CalendarBlock[]) {
  return blocks.filter(other => other.id !== block.id && other.date === block.date && block.startMinute < other.startMinute + other.minutes && other.startMinute < block.startMinute + block.minutes)
}
export function validateStateTotals(state: AppState) {
  for (const [items, limit] of [[state.sessions.map(s => ({ date: s.date, value: s.seconds })), 86400], [state.screenTimeEntries.map(s => ({ date: s.date, value: s.minutes })), 1440]] as const) {
    const totals = new Map<string, number>()
    for (const item of items) {
      const sum = (totals.get(item.date) ?? 0) + item.value
      if (!Number.isFinite(item.value) || item.value <= 0 || sum > limit) throw new Error(item.date + ': günlük toplam süre 24 saati aşamaz.')
      totals.set(item.date, sum)
    }
  }
  if (Object.values(state.dailyPlans).some(plan => plan.length > 3)) throw new Error('Bir gün için en fazla 3 öncelik eklenebilir.')
}
export function milestoneLabels(state: AppState): Map<string, string> {
  const result = new Map<string, string>()
  const hours = state.sessions.reduce((sum, session) => sum + session.seconds / 3600, 0)
  for (const threshold of [10, 50, 100, 500]) if (hours >= threshold) result.set('hours:' + threshold, threshold === 10 ? 'İlk 10 saatini tamamladın!' : threshold + ' saatlik emek birikti!')
  const dates = new Set(state.sessions.filter(s => s.seconds > 0).map(s => s.date))
  Object.entries(state.habitLog).forEach(([date, log]) => { if (Object.values(log).some(entry => entry.status !== 'partial')) dates.add(date) })
  let run = 0, best = 0, previous = ''
  for (const date of [...dates].sort()) { run = previous && shiftDay(previous, 1) === date ? run + 1 : 1; best = Math.max(best, run); previous = date }
  for (const threshold of [7, 30, 100]) if (best >= threshold) result.set('streak:' + threshold, threshold + ' günlük seriye ulaştın!')
  for (const goal of state.goals) {
    const automatic = goal.unit === 'saat' && goal.activity !== 'manual' ? state.sessions.filter(s => goal.activity === 'all' || s.title === goal.activity).reduce((sum, s) => sum + s.seconds / 3600, 0) : 0
    if (goal.target > 0 && goal.manualProgress + automatic >= goal.target) result.set('goal:' + goal.id, 'Hedef tamamlandı: ' + goal.title)
  }
  return result
}
export function newMilestones(before: AppState, after: AppState) {
  const previous = milestoneLabels(before)
  const seen = new Set([...(before.experience?.seenMilestones ?? []), ...(after.experience?.seenMilestones ?? [])])
  return [...milestoneLabels(after)].filter(([id]) => !previous.has(id) && !seen.has(id))
}

/** Queue functional updates against the last durable state; failures never publish. */
export function createCommitQueue<T>(read: () => T, persist: (next: T) => Promise<void>, publish: (next: T) => void) {
  let tail: Promise<unknown> = Promise.resolve()
  return (update: (current: T) => T) => {
    const task = tail.then(async () => {
      const previous = read()
      const next = update(previous)
      if (next !== previous) { await persist(next); publish(next) }
      return { previous, next }
    })
    tail = task.catch(() => undefined)
    return task
  }
}
