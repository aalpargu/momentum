import { type DragEvent, type FormEvent, useEffect, useRef, useState } from 'react'
import type { Area, CalendarBlock, FocusCategory } from '../lib/domain'
import { clockLabel, conflictsFor, shiftDay, validCalendarBlock } from '../lib/experience'
import { AccessibleModal } from './AccessibleModal'
import { NumberInput } from './NumberInput'
import { AreaIcon, Icon } from './Icon'

const areas: Area[] = ['Eğitim', 'Kariyer', 'İngilizce', 'Sağlık', 'Bilgi']
const dayLabel = (date: string, short = false) => new Date(date + 'T12:00:00Z').toLocaleDateString('tr-TR', { weekday: short ? 'short' : 'long', day: 'numeric', month: short ? 'short' : 'long', timeZone: 'UTC' })
const weekStart = (date: string) => shiftDay(date, -(new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7)
export function CalendarView({ today, blocks, categories, onSave, onDelete, onDayClick }: { today: string; blocks: CalendarBlock[]; categories: FocusCategory[]; onSave: (block: CalendarBlock) => Promise<string | null>; onDelete: (id: string) => Promise<boolean>; onDayClick: (date: string) => void }) {
  const [start, setStart] = useState(() => weekStart(today))
  const [draft, setDraft] = useState<CalendarBlock | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [dragging, setDragging] = useState<CalendarBlock | null>(null)
  const [preview, setPreview] = useState<CalendarBlock | null>(null)
  const [message, setMessage] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(start, i))
  const visible = blocks.filter(block => days.includes(block.date)).sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute)
  const conflicting = preview ? conflictsFor(preview, blocks) : []
  const newBlock = (date: string, startMinute = 540) => setDraft({ id: crypto.randomUUID(), title: categories[0]?.title ?? 'Çalışma', area: categories[0]?.area ?? 'Eğitim', date, startMinute, minutes: 60 })
  useEffect(() => {
    const first = visible.length ? Math.min(480, ...visible.map(block => block.startMinute)) : 480
    if (scrollRef.current) scrollRef.current.scrollTop = first / 60 * 64
  }, [start])
  const destination = (event: DragEvent<HTMLDivElement>, date: string) => {
    if (!dragging) return null
    const minute = Math.floor((event.clientY - event.currentTarget.getBoundingClientRect().top) / 16) * 15
    return { ...dragging, date, startMinute: Math.min(1440 - dragging.minutes, Math.max(0, minute)) }
  }
  const drop = async (event: DragEvent<HTMLDivElement>, date: string) => {
    event.preventDefault()
    const next = destination(event, date)
    setDragging(null); setPreview(null)
    if (!next) return
    const overlaps = conflictsFor(next, blocks)
    if (overlaps.length) { setMessage('Taşınmadı: ' + clockLabel(next.startMinute) + ' saati ' + overlaps.map(block => block.title).join(', ') + ' ile çakışıyor.'); return }
    const error = await onSave(next)
    setMessage(error ?? dayLabel(date, true) + ' · ' + clockLabel(next.startMinute) + ' saatine taşındı.')
  }
  return <section className="planner-page"><header className="section-heading"><div><p className="eyebrow">ZAMANINA YER AÇ</p><h1>Haftanı tasarla</h1><p className="hero-copy">Çalışmalarını planla; günün akışını bir bakışta gör.</p></div><button className="primary-action" onClick={() => newBlock(days.includes(today) ? today : start)}><Icon name="calendar" />Çalışma bloğu ekle</button></header><article className="card planner-card"><div className="planner-toolbar"><div><h2>{dayLabel(start, true)} — {dayLabel(days[6], true)}</h2><span>{visible.length} blok · {Math.round(visible.reduce((sum, block) => sum + block.minutes, 0) / 60 * 10) / 10} saat planlandı</span></div><div className="planner-navigation"><button aria-label="Önceki takvim haftası" onClick={() => setStart(shiftDay(start, -7))}>‹</button><button onClick={() => setStart(weekStart(today))}>Bugün</button><button aria-label="Sonraki takvim haftası" onClick={() => setStart(shiftDay(start, 7))}>›</button><input aria-label="Takvimde tarihe git" type="date" value={start} onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setStart(weekStart(e.target.value)) }} /></div></div><p className="planner-hint">Bir bloğu taşıyarak saatini değiştir. Dokunmatik ekran veya klavyeyle düzenlemek için bloğu seç.</p><div className={'drop-readout ' + (conflicting.length ? 'has-conflict' : '')} role="status">{preview ? <><Icon name={conflicting.length ? 'alert' : 'clock'} /><span>{dayLabel(preview.date, true)} · {clockLabel(preview.startMinute)}–{clockLabel(preview.startMinute + preview.minutes)}{conflicting.length ? ' · Çakışıyor: ' + conflicting.map(block => block.title).join(', ') : ' · Buraya bırak'}</span></> : <span>{message || 'Planlanan bloklar çalışma istatistiklerine eklenmez; tamamladığın süreyi ayrıca kaydet.'}</span>}</div><div className="planner-scroll" ref={scrollRef}><div className="planner-board"><div className="planner-week-head"><span>Saat</span>{days.map(date => <button key={date} className={date === today ? 'is-today' : ''} onClick={() => setDay(date)} aria-label={dayLabel(date) + ' ayrıntıları'}>{dayLabel(date, true)}</button>)}</div><div className="planner-columns"><div className="planner-hours">{Array.from({ length: 24 }, (_, hour) => <span key={hour}>{clockLabel(hour * 60)}</span>)}</div>{days.map(date => <div key={date} className={'planner-day ' + (date === today ? 'is-today' : '')} onDragOver={event => { if (!dragging) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setPreview(destination(event, date)) }} onDrop={event => void drop(event, date)}>{Array.from({ length: 24 }, (_, hour) => <button key={hour} className="planner-slot" aria-label={dayLabel(date, true) + ' ' + clockLabel(hour * 60) + ' bloğu ekle'} onClick={() => newBlock(date, hour * 60)} />)}{visible.filter(block => block.date === date).map(block => { const overlaps = conflictsFor(block, blocks); return <button key={block.id} data-record={block.id} draggable onDragStart={event => { event.dataTransfer.setData('text/plain', block.id); event.dataTransfer.effectAllowed = 'move'; setDragging(block); setMessage('') }} onDragEnd={() => { setDragging(null); setPreview(null) }} onClick={() => setDraft(block)} className={'planner-block area-' + areas.indexOf(block.area) + (overlaps.length ? ' block-conflict' : '') + (dragging?.id === block.id ? ' is-dragging' : '')} style={{ top: block.startMinute / 60 * 64, height: block.minutes / 60 * 64 }} title={block.title + ' · ' + clockLabel(block.startMinute) + '–' + clockLabel(block.startMinute + block.minutes) + (overlaps.length ? ' · Saat çakışması' : '')} aria-label={block.title + ', ' + dayLabel(date, true) + ', ' + clockLabel(block.startMinute) + ', ' + block.minutes + ' dakika. Düzenle veya taşı.'}><strong>{overlaps.length ? '⚠ ' : ''}{block.title}</strong><span>{clockLabel(block.startMinute)}–{clockLabel(block.startMinute + block.minutes)}</span></button> })}{preview?.date === date && <div className={'drop-preview ' + (conflicting.length ? 'has-conflict' : '')} style={{ top: preview.startMinute / 60 * 64, height: preview.minutes / 60 * 64 }}>{clockLabel(preview.startMinute)}{conflicting.length ? ' · Çakışma' : ''}</div>}</div>)}</div></div></div></article><section className="planner-agenda"><div className="section-heading"><h2>Haftanın planı</h2><span className="subtle">Blokları seçerek gün ve saatlerini de değiştirebilirsin.</span></div>{visible.length ? visible.map(block => <button className="agenda-row" key={block.id} data-record={block.id} onClick={() => setDraft(block)}><AreaIcon area={block.area} /><strong>{block.title}</strong><span>{dayLabel(block.date, true)}</span><time>{clockLabel(block.startMinute)}–{clockLabel(block.startMinute + block.minutes)}</time><span>{conflictsFor(block, blocks).length ? 'Saat çakışması' : block.area}</span></button>) : <div className="calendar-empty"><Icon name="calendar" size={32} /><h3>Bu hafta sana ait.</h3><p>İlk çalışma bloğunu ekleyerek başla. Sınav hazırlığına veya okumaya yer ayırabilirsin.</p><button onClick={() => newBlock(start)}>İlk bloğu ekle</button></div>}</section>{draft && <BlockEditor block={draft} blocks={blocks} onClose={() => setDraft(null)} onSave={onSave} onDelete={onDelete} existing={blocks.some(block => block.id === draft.id)} />}{day && <AccessibleModal label="Takvim günü" className="card calendar-day-drawer" onClose={() => setDay(null)}><div className="card-heading"><div><p className="eyebrow">GÜNÜN PLANI</p><h2>{dayLabel(day)}</h2></div><button className="modal-close" aria-label="Kapat" onClick={() => setDay(null)}><Icon name="close" /></button></div><div className="drawer-agenda">{blocks.filter(block => block.date === day).sort((a,b) => a.startMinute-b.startMinute).map(block => <button key={block.id} onClick={() => { setDay(null); setDraft(block) }}><time>{clockLabel(block.startMinute)}</time><strong>{block.title}</strong><span>{block.minutes} dk · {block.area}</span></button>)}{!blocks.some(block => block.date === day) && <p className="empty-state">Bu gün için henüz plan yok.</p>}</div><button className="primary-action" onClick={() => { setDay(null); newBlock(day) }}>Bu güne blok ekle</button>{day <= today && <button className="quiet-button" onClick={() => { setDay(null); onDayClick(day) }}>Çalışma ve alışkanlık kayıtlarını aç</button>}</AccessibleModal>}</section>
}

function BlockEditor({ block, blocks, existing, onClose, onSave, onDelete }: { block: CalendarBlock; blocks: CalendarBlock[]; existing: boolean; onClose: () => void; onSave: (block: CalendarBlock) => Promise<string | null>; onDelete: (id: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState(block)
  const [time, setTime] = useState(clockLabel(block.startMinute))
  const [minutes, setMinutes] = useState(String(block.minutes))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const parts = time.split(':').map(Number)
  const candidate = { ...draft, title: draft.title.trim(), startMinute: parts[0] * 60 + parts[1], minutes: Number(minutes) }
  const conflicts = conflictsFor(candidate, blocks)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!validCalendarBlock(candidate)) { setError('Geçerli bir konu, tarih ve en az 15 dakika gir. Bitiş saati gece yarısını aşamaz.'); return }
    if (conflicts.length) { setError('Bu saat dolu. Başlangıç saatini veya süreyi değiştir.'); return }
    setBusy(true)
    const message = await onSave(candidate)
    setBusy(false); setError(message ?? '')
    if (!message) onClose()
  }
  return <AccessibleModal label={existing ? 'Çalışma bloğunu düzenle' : 'Çalışma bloğu ekle'} className="card block-editor" onClose={onClose}><div className="card-heading"><div><p className="eyebrow">TAKVİM</p><h2>{existing ? 'Bloğunu düzenle' : 'Bir çalışmaya yer aç'}</h2></div><button className="modal-close" aria-label="Kapat" onClick={onClose}><Icon name="close" /></button></div><form onSubmit={submit}><label>Konu<input required maxLength={100} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label><div className="form-grid"><label>Gün<input required type="date" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label><label>Alan<select value={draft.area} onChange={event => setDraft({ ...draft, area: event.target.value as Area })}>{areas.map(area => <option key={area}>{area}</option>)}</select></label></div><div className="form-grid"><label>Başlangıç<input type="time" required step="900" value={time} onChange={event => setTime(event.target.value)} /></label><label>Süre<NumberInput required min="15" max="1440" step="15" unit="dakika" value={minutes} onChange={event => setMinutes(event.target.value)} /></label></div><p className="subtle">{validCalendarBlock(candidate) ? 'Bitiş · ' + clockLabel(candidate.startMinute + candidate.minutes) : 'Blok aynı gün içinde bitmeli.'}</p>{conflicts.length > 0 && <div className="calendar-conflict" role="alert"><Icon name="alert" /><span>Bu saat dolu: {conflicts.map(item => item.title + ' (' + clockLabel(item.startMinute) + '–' + clockLabel(item.startMinute + item.minutes) + ')').join(', ')}</span></div>}{error && <p className="form-error" role="alert">{error}</p>}<div className="block-actions"><button type="submit" className="primary-action" disabled={busy || conflicts.length > 0}>{busy ? 'Kaydediliyor…' : 'Bloğu kaydet'}</button>{existing && <button type="button" className="delete-action" disabled={busy} onClick={async () => { setBusy(true); if (await onDelete(block.id)) onClose(); else setBusy(false) }}>Bloğu sil</button>}</div></form></AccessibleModal>
}
