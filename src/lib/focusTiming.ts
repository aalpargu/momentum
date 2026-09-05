import type { Area, FocusSegment, FocusSession } from './domain'

type ActiveTiming = { id: string; title: string; area: Area; segments: { startedAt: string; endedAt?: string }[] }
type Timing = Pick<FocusSession, 'source' | 'timerSessionId' | 'segments'>

// Split at local hour boundaries, preserving the recording timezone and pauses.
export function buildTimedFocusSessions(active: ActiveTiming, nowMs: number): FocusSession[] {
  const days = new Map<string, FocusSegment[]>()
  for (const segment of active.segments) {
    let cursor = Date.parse(segment.startedAt)
    const end = Math.min(segment.endedAt ? Date.parse(segment.endedAt) : nowMs, nowMs)
    if (!Number.isFinite(cursor) || !Number.isFinite(end)) continue
    while (cursor < end) {
      const local = new Date(cursor)
      const offsetMinutes = local.getTimezoneOffset()
      const key = new Date(cursor - offsetMinutes * 60_000).toISOString().slice(0, 10)
      const nextHour = cursor + (60 - local.getMinutes()) * 60_000 - local.getSeconds() * 1000 - local.getMilliseconds()
      const boundary = Math.min(end, nextHour)
      const parts = days.get(key) ?? []
      parts.push({ startedAt: new Date(cursor).toISOString(), endedAt: new Date(boundary).toISOString(), offsetMinutes })
      days.set(key, parts)
      cursor = boundary
    }
  }
  const values = [...days.entries()]
  const duration = (segments: FocusSegment[]) => segments.reduce((sum, part) => sum + Date.parse(part.endedAt) - Date.parse(part.startedAt), 0)
  let remaining = Math.floor(values.reduce((sum, [, segments]) => sum + duration(segments), 0) / 1000)
  return values.flatMap(([date, segments], index) => {
    const seconds = index === values.length - 1 ? remaining : Math.floor(duration(segments) / 1000)
    remaining -= seconds
    return seconds > 0 ? [{ id: `${active.id}-${date}`, title: active.title, area: active.area, seconds, startedAt: segments[0].startedAt, date, source: 'timer' as const, timerSessionId: active.id, segments }] : []
  })
}

/** Optional metadata keeps older v2 backups readable without guessing their hours. */
export function validateFocusTiming(item: Record<string, unknown>, session: Pick<FocusSession, 'date' | 'seconds' | 'startedAt'>): Timing {
  const invalid = (detail: string): never => { throw new Error(`Odak saat bilgisi: ${detail}`) }
  if (item.source === undefined) {
    if (item.segments !== undefined || item.timerSessionId !== undefined) invalid('kaynak belirtilmeli.')
    return {}
  }
  if (item.source === 'manual') {
    if (item.segments !== undefined || item.timerSessionId !== undefined) invalid('manuel kayıtta zamanlayıcı aralıkları olamaz.')
    return { source: 'manual' }
  }
  if (item.source !== 'timer') invalid('geçersiz kaynak.')
  if (typeof item.timerSessionId !== 'string' || !item.timerSessionId.trim() || item.timerSessionId.length > 100) invalid('oturum kimliği geçersiz.')
  if (!Array.isArray(item.segments) || !item.segments.length || item.segments.length > 10_000) invalid('çalışma aralıkları eksik veya fazla.')
  let previousEnd = -Infinity
  let milliseconds = 0
  const segments = (item.segments as unknown[]).map((value): FocusSegment => {
    if (!value || typeof value !== 'object') invalid('aralık geçersiz.')
    const part = value as Record<string, unknown>
    if (typeof part.startedAt !== 'string' || typeof part.endedAt !== 'string' || !/Z$/.test(part.startedAt) || !/Z$/.test(part.endedAt)) invalid('aralıklar UTC tarih-saat olmalı.')
    const start = Date.parse(part.startedAt as string), end = Date.parse(part.endedAt as string)
    const offset = part.offsetMinutes
    if (typeof offset !== 'number' || !Number.isInteger(offset) || Math.abs(offset) > 840) invalid('saat dilimi geçersiz.')
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < previousEnd || end > Date.now() + 60_000) invalid('aralıklar sıralı, geçmişte ve çakışmasız olmalı.')
    const localStart = new Date(start - Number(offset) * 60_000).toISOString().slice(0, 10)
    const localEnd = new Date(end - 1 - Number(offset) * 60_000).toISOString().slice(0, 10)
    if (localStart !== session.date || localEnd !== session.date) invalid('aralık kayıt günüyle uyuşmuyor.')
    previousEnd = end
    milliseconds += end - start
    return { startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(), offsetMinutes: Number(offset) }
  })
  if (Math.abs(milliseconds / 1000 - session.seconds) > 1 || segments[0].startedAt !== session.startedAt) invalid('toplam süre veya başlangıç uyuşmuyor.')
  return { source: 'timer', timerSessionId: item.timerSessionId as string, segments }
}

export function updateFocusSession(session: FocusSession, update: Pick<FocusSession, 'title' | 'area' | 'seconds'>): FocusSession {
  if (update.seconds === session.seconds) return { ...session, ...update }
  // Editing the duration makes the old measured intervals inapplicable.
  const { segments: _segments, timerSessionId: _timerId, ...rest } = session
  return { ...rest, ...update, source: 'manual' }
}
