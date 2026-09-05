import type { AppState, Area, FocusSession, ScreenTimeEntry } from './domain'

export type HistoricalKind = 'focus' | 'useful' | 'passive' | 'necessary' | 'unclassified'
export type HistoricalRecord = { row: number; date: string; title: string; minutes: number; kind: HistoricalKind; area: Area }
export type HistoricalParseResult = { records: HistoricalRecord[]; errors: string[] }

const areas: Area[] = ['Eğitim', 'Kariyer', 'İngilizce', 'Sağlık', 'Bilgi']
const durationPattern = /(\d+(?:[.,]\d+)?)\s*(saat|sa|hour|hours|dk|dakika|dak|minute|minutes|min)\b/giu

function normalize(value: unknown) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').trim().replace(/\s+/g, ' ')
}

function isoDate(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day))
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseHistoricalDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
  if (typeof value === 'number' && value > 20_000 && value < 100_000) {
    const excelDate = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000)
    return isoDate(excelDate.getUTCFullYear(), excelDate.getUTCMonth() + 1, excelDate.getUTCDate())
  }
  const text = String(value ?? '').trim()
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]))
  match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  return match ? isoDate(Number(match[3]), Number(match[2]), Number(match[1])) : null
}

function minutesFrom(value: unknown, unit?: unknown): number | null {
  if (typeof value === 'string') {
    const match = [...value.matchAll(durationPattern)][0]
    if (match) {
      const amount = Number(match[1].replace(',', '.'))
      return /saat|sa|hour/i.test(match[2]) ? amount * 60 : amount
    }
  }
  const amount = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(amount)) return null
  return /saat|sa|hour/i.test(normalize(unit)) ? amount * 60 : amount
}

function explicitArea(value: unknown): Area | null {
  const normalized = normalize(value).split('/')[0]
  return areas.find((area) => normalize(area) === normalized) ?? null
}

export function inferArea(title: string): Area {
  const value = normalize(title)
  if (/ingiliz|english|vocabulary|kelime/.test(value)) return 'İngilizce'
  if (/spor|egzersiz|yuruyus|kosu|fitness|saglik/.test(value)) return 'Sağlık'
  if (/dsa|veri yap|algoritma|universite|ders|sinav|okul/.test(value)) return 'Eğitim'
  if (/kod|coding|yazilim|proje|staj|kariyer|program/.test(value)) return 'Kariyer'
  return 'Bilgi'
}

function kindFrom(value: unknown, fallback: HistoricalKind = 'focus'): HistoricalKind {
  const text = normalize(value)
  if (/faydasiz|pasif|noise|waste/.test(text)) return 'passive'
  if (/zorunlu|necessary/.test(text)) return 'necessary'
  if (/siniflandirilmamis|unclassified/.test(text)) return 'unclassified'
  if (/faydali ekran|useful screen/.test(text)) return 'useful'
  if (/screen.?time|ekran suresi/.test(text)) {
    const sourceKind = text.split('/')[0]
    if (/passive|pasif/.test(sourceKind)) return 'passive'
    if (/useful|faydali/.test(sourceKind)) return 'useful'
    if (/necessary|zorunlu/.test(sourceKind)) return 'necessary'
    return 'unclassified'
  }
  return fallback
}

function cleanTitle(value: string) {
  return value
    .replace(/\[(?:faydasız|faydasiz|pasif|noise|faydalı ekran|faydali ekran|zorunlu|necessary|unclassified|sınıflandırılmamış)\]/giu, '')
    .replace(/^[\s;,:|\-–—>]+|[\s;,:|\-–—>]+$/g, '').trim()
}

function record(row: number, date: string | null, titleValue: string, minutesValue: number | null, kindValue: HistoricalKind, areaValue?: Area | null): HistoricalRecord | string {
  const title = cleanTitle(titleValue)
  if (!date) return `${row}. satır: tarih anlaşılmadı.`
  if (!title) return `${row}. satır: etkinlik adı eksik.`
  if (minutesValue === null || !Number.isFinite(minutesValue) || minutesValue <= 0 || minutesValue > 1_440) return `${row}. satır: süre 1–1440 dakika arasında olmalı.`
  return { row, date, title: title.slice(0, 150), minutes: Math.round(minutesValue), kind: kindValue, area: areaValue ?? inferArea(title) }
}

export function parseHistoricalText(text: string): HistoricalParseResult {
  const records: HistoricalRecord[] = [], errors: string[] = []
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line, index) => {
    const row = index + 1
    if (!line.trim() || line.trim().startsWith('#')) return
    const dateMatch = line.match(/^\s*((?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(?:\d{1,2}[./-]\d{1,2}[./-]\d{4}))\s*(?:->|→|:|[-–—])\s*(.+)$/)
    if (!dateMatch) { errors.push(`${row}. satır: “Tarih -> süre etkinlik” biçimi bekleniyor.`); return }
    const date = parseHistoricalDate(dateMatch[1])
    const content = dateMatch[2]
    const matches = [...content.matchAll(durationPattern)]
    if (!matches.length) { errors.push(`${row}. satır: “30 dk” veya “2 saat” gibi bir süre bulunamadı.`); return }
    const leading = content.slice(0, matches[0].index).replace(/[\s;,:|\-–—>]+/g, '')
    const titleBeforeDuration = Boolean(leading)
    matches.forEach((match, durationIndex) => {
      const start = titleBeforeDuration ? (durationIndex ? (matches[durationIndex - 1].index ?? 0) + matches[durationIndex - 1][0].length : 0) : (match.index ?? 0) + match[0].length
      const end = titleBeforeDuration ? (match.index ?? 0) : durationIndex + 1 < matches.length ? (matches[durationIndex + 1].index ?? content.length) : content.length
      const rawTitle = content.slice(start, end)
      const kind = kindFrom(rawTitle)
      const parsed = record(row, date, rawTitle, minutesFrom(match[0]), kind)
      if (typeof parsed === 'string') errors.push(parsed); else records.push(parsed)
    })
  })
  return { records, errors }
}

export function parseDelimitedText(text: string): string[][] {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false
  const source = text.replace(/^\uFEFF/, '')
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char === '"' && quoted && source[index + 1] === '"') { field += '"'; index += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === delimiter && !quoted) { row.push(field); field = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(field); if (row.some((cell) => cell.trim())) rows.push(row); row = []; field = ''
    } else field += char
  }
  row.push(field); if (row.some((cell) => cell.trim())) rows.push(row)
  return rows
}

export function parseHistoricalRows(rows: unknown[][]): HistoricalParseResult {
  const records: HistoricalRecord[] = [], errors: string[] = []
  if (!rows.length) return { records, errors: ['Dosyada okunabilir satır yok.'] }
  const headers = rows[0].map(normalize)
  const column = (...names: string[]) => headers.findIndex((header) => names.some((name) => header === normalize(name)))
  const dateColumn = column('tarih', 'date', 'gün', 'gun')
  const titleColumn = column('etkinlik', 'faaliyet', 'aktivite', 'iş', 'is', 'ad', 'name')
  const durationColumn = column('süre', 'sure', 'dakika', 'minutes', 'value', 'değer', 'deger')
  const unitColumn = column('birim', 'unit')
  const kindColumn = column('tür', 'tur', 'type', 'sınıf', 'sinif')
  const areaColumn = column('alan', 'area', 'area/source')
  if (dateColumn < 0 || titleColumn < 0 || durationColumn < 0) return { records, errors: ['Başlık satırında Tarih, Etkinlik ve Süre sütunları bulunmalı.'] }
  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2
    if (!cells.some((cell) => String(cell ?? '').trim())) return
    const rawKind = `${kindColumn >= 0 ? cells[kindColumn] ?? '' : ''} ${areaColumn >= 0 ? cells[areaColumn] ?? '' : ''}`
    const parsed = record(rowNumber, parseHistoricalDate(cells[dateColumn]), String(cells[titleColumn] ?? ''), minutesFrom(cells[durationColumn], unitColumn >= 0 ? cells[unitColumn] : undefined), kindFrom(rawKind), areaColumn >= 0 ? explicitArea(cells[areaColumn]) : null)
    if (typeof parsed === 'string') errors.push(parsed); else records.push(parsed)
  })
  return { records, errors }
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0).toString(36)
}

function fingerprint(recordValue: Pick<HistoricalRecord, 'date' | 'title' | 'minutes' | 'kind' | 'area'>) {
  return [recordValue.date, normalize(recordValue.title), recordValue.minutes, recordValue.kind, recordValue.kind === 'focus' ? recordValue.area : ''].join('|')
}

function existingFingerprints(state: AppState) {
  const counts = new Map<string, number>()
  const add = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)
  state.sessions.forEach((session) => add(fingerprint({ date: session.date, title: session.title, minutes: Math.round(session.seconds / 60), kind: 'focus', area: session.area })))
  state.screenTimeEntries.forEach((entry) => add(fingerprint({ date: entry.date, title: entry.app, minutes: entry.minutes, kind: entry.kind, area: 'Bilgi' })))
  return counts
}

export function mergeHistoricalRecords(state: AppState, records: HistoricalRecord[], maximumDate: string) {
  const sessions: FocusSession[] = [], screenEntries: ScreenTimeEntry[] = []
  const existing = existingFingerprints(state), seen = new Map<string, number>()
  let skipped = 0
  for (const item of records) {
    if (item.date > maximumDate) throw new Error(`${item.row}. satır gelecekteki bir tarihe ait (${item.date}).`)
    const key = fingerprint(item), occurrence = (seen.get(key) ?? 0) + 1
    seen.set(key, occurrence)
    if (occurrence <= (existing.get(key) ?? 0)) { skipped += 1; continue }
    const id = `history-${stableHash(key)}-${occurrence}`
    if (item.kind === 'focus') sessions.push({ id, title: item.title, area: item.area, seconds: item.minutes * 60, startedAt: `${item.date}T12:00:00.000Z`, date: item.date, source: 'manual' })
    else screenEntries.push({ id, date: item.date, app: item.title, minutes: item.minutes, kind: item.kind, source: 'manual', createdAt: `${item.date}T12:00:00.000Z` })
  }
  const nextSessions = [...state.sessions, ...sessions], nextScreen = [...state.screenTimeEntries, ...screenEntries]
  const affectedDates = new Set(records.map((item) => item.date))
  for (const date of affectedDates) {
    const focusMinutes = nextSessions.filter((item) => item.date === date).reduce((sum, item) => sum + item.seconds / 60, 0)
    const screenMinutes = nextScreen.filter((item) => item.date === date).reduce((sum, item) => sum + item.minutes, 0)
    if (focusMinutes > 1_440) throw new Error(`${date} için toplam odak süresi 24 saati aşıyor.`)
    if (screenMinutes > 1_440) throw new Error(`${date} için toplam ekran süresi 24 saati aşıyor.`)
  }
  return { state: { ...state, sessions: nextSessions, screenTimeEntries: nextScreen }, sessions, screenEntries, skipped }
}
