import { type FormEvent, useMemo, useState } from 'react'
import type { Area, FocusCategory, RecentEntry } from '../lib/domain'
import { parseQuickEntry } from '../lib/experience'
import { NumberInput } from './NumberInput'
import { Icon } from './Icon'

export function QuickCapture({ selected, categories, recent, onSave }: { selected: { title: string; area: Area }; categories: FocusCategory[]; recent: RecentEntry[]; onSave: (date: string, title: string, area: Area, minutes: number) => Promise<string | null> }) {
  const [mode, setMode] = useState<'text' | 'minutes'>('text')
  const [text, setText] = useState('')
  const [minutes, setMinutes] = useState(String(recent[0]?.minutes ?? 25))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const preview = useMemo(() => { try { return { value: parseQuickEntry(text, categories, selected.area), error: '' } } catch (error) { return { value: null, error: (error as Error).message } } }, [text, categories, selected.area])
  const presets = [...new Set([...recent.map(entry => entry.minutes), 15, 25, 45, 60])].slice(0, 5)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (mode === 'text' && !preview.value) { setError(preview.error); return }
    const entry = mode === 'text' ? preview.value! : { ...selected, minutes: Number(minutes) }
    const now = new Date()
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    setBusy(true)
    const message = await onSave(today, entry.title, entry.area, entry.minutes)
    setBusy(false); setError(message ?? '')
    if (!message) { setText(''); setMinutes(String(entry.minutes)) }
  }
  return <section className="quick-entry"><div className="quick-entry-heading"><span className="quick-entry-icon"><Icon name="clock" /></span><div><strong>Tamamladığın çalışmayı ekle</strong><p>Bir cümle yaz; süreni ve konunu ayıralım.</p></div></div><div className="capture-modes" role="group" aria-label="Hızlı giriş biçimi"><button aria-pressed={mode === 'text'} onClick={() => { setMode('text'); setError('') }}>Yazarak ekle</button><button aria-pressed={mode === 'minutes'} onClick={() => { setMode('minutes'); setError('') }}>Süre seç</button></div><form className="quick-add-form" onSubmit={submit}>{mode === 'text' ? <input aria-label="Hızlı kayıt" placeholder="30 dk kitap veya 1 saat 20 dk DSA" maxLength={100} value={text} onChange={e => { setText(e.target.value); setError('') }} aria-describedby="quick-preview" autoComplete="off" /> : <NumberInput aria-label="Hızlı focus kaydı dakika" required unit="dakika" min="1" max="1440" step="1" value={minutes} onChange={e => { setMinutes(e.target.value); setError('') }} />}<button type="submit" disabled={busy || (mode === 'text' ? !text.trim() : !minutes)}>{busy ? 'Kaydediliyor…' : 'Kaydı ekle'}</button></form><p id="quick-preview" className="capture-preview">{mode === 'text' ? preview.value ? 'Bugün · ' + preview.value.title + ' · ' + preview.value.minutes + ' dk · ' + preview.value.area : 'Örn. 30 dk kitap · 2 saat DSA · 1,5 saat İngilizce' : selected.title + ' alanına eklenecek.'}</p>{mode === 'minutes' && <div className="minute-presets" aria-label="Hatırlanan süreler">{presets.map(value => <button key={value} aria-pressed={minutes === String(value)} onClick={() => setMinutes(String(value))}>{value} dk</button>)}</div>}{recent.length > 0 && <div className="recent-captures"><span>Son kullandıkların</span>{recent.slice(0, 4).map(entry => <button key={entry.title + entry.minutes} onClick={() => { setMode('text'); setText(entry.minutes + ' dk ' + entry.title); setError('') }}>{entry.title}<small>{entry.minutes} dk</small></button>)}</div>}{error && <p className="form-error" role="alert">{error}</p>}</section>
}
