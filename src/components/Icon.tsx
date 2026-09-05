import type { Area } from '../lib/domain'

const paths = {
  book: 'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4z M13 7a3 3 0 0 1 3-3h4v14h-3a4 4 0 0 0-4 3',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16',
  globe: 'M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18',
  heart: 'M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 5 2 10 8 15 6-5 12-10 8-15Z',
  cap: 'm2 9 10-5 10 5-10 5-10-5m4 2v6c4 3 8 3 12 0v-6m4-2v7',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  clock: 'M12 7v5l3 2',
  check: 'm6 12 4 4 8-8',
  expand: 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',
  pause: 'M8 5v14M16 5v14',
  play: 'm8 5 11 7-11 7Z',
  stop: 'M6 6h12v12H6Z',
  close: 'm6 6 12 12M6 18 18 6',
  calendar: 'M4 5h16v16H4ZM8 3v4m8-4v4M4 10h16',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  flame: 'M13 3c1 6-4 6-4 10-2-1-3-3-3-3-5 9 10 16 13 5 1-5-3-8-6-12Z',
  alert: 'm12 3 10 18H2ZM12 9v5m0 3v.1',
  undo: 'm8 5-5 5 5 5M3 10h10a7 7 0 0 1 7 7',
} as const
export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return <svg className="line-icon" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{(name === 'clock' || name === 'globe') && <circle cx="12" cy="12" r="9" />}<path d={paths[name]} /></svg>
}
export function AreaIcon({ area }: { area: Area }) {
  return <Icon name={area === 'Bilgi' ? 'book' : area === 'Kariyer' ? 'code' : area === 'Sağlık' ? 'heart' : area === 'İngilizce' ? 'globe' : 'cap'} />
}
export function HabitRing({ value, completed = value >= 1 }: { value: number; completed?: boolean }) {
  return <span className="habit-ring" aria-label={(completed ? 'Tamamlandı · ' : '') + 'İlerleme yüzde ' + Math.round(value * 100)}><svg viewBox="0 0 36 36"><circle className="habit-ring-bg" cx="18" cy="18" r="15" /><circle className="habit-ring-value" cx="18" cy="18" r="15" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - Math.max(0, Math.min(1, value)) * 100} /></svg>{completed && <Icon name="check" size={18} />}</span>
}
