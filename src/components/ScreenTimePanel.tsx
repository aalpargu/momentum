import { NumberInput } from './NumberInput'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { screenMinutes, type TrackedScreenKind } from '../lib/analytics'
import type { ScreenTimeEntry } from '../lib/domain'
import { cloudConfigured } from '../lib/cloudConfig'

export type WastedEntry = { app: string; minutes: number }

const screenKindLabels: Record<TrackedScreenKind, string> = {
  passive: 'Pasif / eğlence',
  useful: 'Faydalı',
  necessary: 'Zorunlu',
  unclassified: 'Sınıflandırılmadı',
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes} dk`
  return `${hours}s ${minutes}dk`
}

function normalizeWastedEntries(value: unknown): WastedEntry[] {
  if (!Array.isArray(value)) throw new Error('Gemini geçerli bir uygulama listesi döndürmedi.')
  const merged = new Map<string, WastedEntry>()
  value.forEach((candidate) => {
    if (!candidate || typeof candidate !== 'object') throw new Error('Gemini cevabında geçersiz bir kayıt var.')
    const item = candidate as { app?: unknown; minutes?: unknown }
    const app = typeof item.app === 'string' ? item.app.trim() : ''
    const minutes = Number(item.minutes)
    if (!app) throw new Error('Uygulama adı boş olamaz.')
    if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) throw new Error(`${app} için dakika değeri geçersiz.`)
    const key = app.toLocaleLowerCase('tr-TR')
    const previous = merged.get(key)
    merged.set(key, { app: previous?.app ?? app, minutes: (previous?.minutes ?? 0) + minutes })
  })
  const entries = [...merged.values()]
  if (!entries.length) throw new Error('Ekran görüntüsünde süre kaydı bulunamadı.')
  if (entries.reduce((sum, entry) => sum + entry.minutes, 0) > 1440) throw new Error('Toplam ekran süresi 24 saati aşamaz.')
  return entries
}

async function fileSha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function ScreenTimePanel({ entries, existingScreenshotHashes, onAddManual, onAddScreenshot, onUpdate, onDelete }: {
  entries: ScreenTimeEntry[]
  existingScreenshotHashes: Set<string>
  onAddManual: (app: string, minutes: number, kind: TrackedScreenKind) => Promise<string | null>
  onAddScreenshot: (entries: WastedEntry[], hash: string) => Promise<string | null>
  onUpdate: (id: string, update: Pick<ScreenTimeEntry, 'app' | 'minutes' | 'kind'>) => Promise<string | null>
  onDelete: (id: string) => void
}) {
  const [manualApp, setManualApp] = useState('')
  const [manualMinutes, setManualMinutes] = useState('')
  const [manualKind, setManualKind] = useState<TrackedScreenKind>('passive')
  const [panelError, setPanelError] = useState('')
  const total = entries.reduce((sum, entry) => sum + entry.minutes, 0)
  const passive = screenMinutes(entries, 'passive')
  const submitManual = async (event: FormEvent) => {
    event.preventDefault()
    const minutes = Number(manualMinutes)
    if (!manualApp.trim()) { setPanelError('Uygulama veya etkinlik adını yaz.'); return }
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) { setPanelError('1–1440 arasında tam dakika gir.'); return }
    const error = await onAddManual(manualApp.trim(), minutes, manualKind)
    if (error) { setPanelError(error); return }
    setPanelError(''); setManualApp(''); setManualMinutes('')
  }
  return <section className="screen-time-section"><div className="screen-time-heading"><span>TOPLAM / PASİF EKRAN SÜRESİ</span><strong>{formatDuration(total * 60)} / {formatDuration(passive * 60)}</strong></div><ScreenTimeScanner existingScreenshotHashes={existingScreenshotHashes} onConfirm={onAddScreenshot} />{entries.length > 0 && <div className="screen-time-list"><p>Bugünün kayıtları</p>{entries.map((entry) => <ScreenTimeEntryEditor key={entry.id} entry={entry} onSave={(update) => onUpdate(entry.id, update)} onDelete={() => onDelete(entry.id)} />)}</div>}{panelError && <p className="screen-time-error" role="alert">⚠️ {panelError}</p>}<form className="screen-time-manual" onSubmit={submitManual}><input aria-label="Uygulama veya etkinlik adı" placeholder="Örn. TikTok" value={manualApp} onChange={(event) => { setManualApp(event.target.value); setPanelError('') }} /><NumberInput unit="dk" min="1" max="1440" step="1" aria-label="Manuel ekran süresi dakika" placeholder="Süre" value={manualMinutes} onChange={(event) => { setManualMinutes(event.target.value); setPanelError('') }} /><select aria-label="Ekran süresi türü" value={manualKind} onChange={(event) => setManualKind(event.target.value as TrackedScreenKind)}>{Object.entries(screenKindLabels).filter(([kind]) => kind !== 'unclassified').map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select><button type="submit" disabled={!manualMinutes || !manualApp.trim()}>Ekle</button></form></section>
}

export function ScreenTimeEntryEditor({ entry, onSave, onDelete }: { entry: ScreenTimeEntry; onSave: (update: Pick<ScreenTimeEntry, 'app' | 'minutes' | 'kind'>) => Promise<string | null>; onDelete: () => void }) {
  const [app, setApp] = useState(entry.app)
  const [minutes, setMinutes] = useState(String(entry.minutes))
  const [kind, setKind] = useState<TrackedScreenKind>(entry.kind)
  const [error, setError] = useState('')
  useEffect(() => { setApp(entry.app); setMinutes(String(entry.minutes)); setKind(entry.kind) }, [entry.id, entry.app, entry.minutes, entry.kind])
  const validMinutes = Number(minutes)
  const isValid = app.trim().length > 0 && Number.isInteger(validMinutes) && validMinutes > 0 && validMinutes <= 1440
  const changed = app.trim() !== entry.app || validMinutes !== entry.minutes || kind !== entry.kind
  const save = async () => { const message = await onSave({ app: app.trim(), minutes: validMinutes, kind }); setError(message ?? '') }
  return <><div className="screen-time-entry" data-record={entry.id}><input aria-label="Uygulama veya kayıt adı" value={app} onChange={(event) => { setApp(event.target.value); setError('') }} /><NumberInput aria-label={`${entry.app} dakika`} unit="dk" min="1" max="1440" step="1" value={minutes} onChange={(event) => { setMinutes(event.target.value); setError('') }} /><select aria-label={`${entry.app} ekran süresi türü`} value={kind} onChange={(event) => { setKind(event.target.value as TrackedScreenKind); setError('') }}>{Object.entries(screenKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" disabled={!changed || !isValid} onClick={save}>Kaydet</button><button type="button" className="delete-action" aria-label={`${entry.app} kaydını sil`} onClick={() => { if (window.confirm(`${entry.app} ekran süresi kaydı silinsin mi?`)) onDelete() }}>Sil</button></div>{error && <p className="screen-time-error" role="alert">⚠️ {error}</p>}</>
}

function ScreenTimeScanner({ existingScreenshotHashes, onConfirm }: { existingScreenshotHashes: Set<string>; onConfirm: (entries: WastedEntry[], hash: string) => Promise<string | null> }) {
  const imgRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'confirm' | 'error'>('idle')
  const [entries, setEntries] = useState<WastedEntry[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [pendingHash, setPendingHash] = useState('')
  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return
    setStatus('loading'); setErrorMsg('')
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('PNG, JPEG veya WebP biçiminde bir ekran görüntüsü seç.')
      if (file.size > 10 * 1024 * 1024) throw new Error('Ekran görüntüsü en fazla 10 MB olabilir.')
      const hash = await fileSha256(file)
      if (existingScreenshotHashes.has(hash)) throw new Error('Bu ekran görüntüsü daha önce kaydedildi; süre tekrar eklenmedi.')
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve((reader.result as string).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file) })
      let data: { entries?: unknown }
      if (cloudConfigured) {
        const cloud = await import('../lib/cloud')
        data = await cloud.analyzeScreenTimeInCloud({ mimeType: file.type, data: base64 })
      } else {
        const response = await fetch('/api/screen-time/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mimeType: file.type, data: base64 }) })
        data = await response.json()
        if (!response.ok) throw new Error((data as { error?: string })?.error || `HTTP ${response.status}`)
      }
      setEntries(normalizeWastedEntries(data.entries)); setPendingHash(hash); setStatus('confirm')
    } catch (error: unknown) { setErrorMsg(error instanceof Error ? error.message : String(error)); setStatus('error') }
    if (imgRef.current) imgRef.current.value = ''
  }
  const saveEntries = async () => {
    try {
      const normalized = normalizeWastedEntries(entries)
      const error = await onConfirm(normalized, pendingHash)
      if (error) { setErrorMsg(error); return }
      setStatus('idle'); setEntries([]); setPendingHash(''); setErrorMsg('')
    } catch (error) { setErrorMsg(error instanceof Error ? error.message : String(error)); setStatus('error') }
  }
  if (status === 'confirm') return (
    <div className="screen-time-confirm">
      <p>Tespit edilenler — bütün uygulamalar toplama dahil edilir:</p>
      {errorMsg && <p className="screen-time-error" role="alert">⚠️ {errorMsg}</p>}
      {entries.map((entry, index) => (
        <div key={index} className="screen-time-confirm-row">
          <input aria-label={`${index + 1}. uygulama adı`} value={entry.app} onChange={(event) => setEntries((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, app: event.target.value } : item))} />
          <NumberInput aria-label={`${entry.app} tespit edilen dakika`} unit="dk" min="1" max="1440" step="1" value={entry.minutes} onChange={(event) => setEntries((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, minutes: Number(event.target.value) } : item))} />
          <button type="button" aria-label={`${entry.app} satırını kaldır`} onClick={() => setEntries((items) => items.filter((_, itemIndex) => itemIndex !== index))}>✕</button>
        </div>
      ))}
      <div className="screen-time-confirm-actions">
        <button type="button" disabled={!entries.length} onClick={saveEntries}>Kaydet</button>
        <button type="button" onClick={() => { setStatus('idle'); setEntries([]); setPendingHash('') }}>İptal</button>
      </div>
    </div>
  )
  return (
    <div className="screen-time-scanner">
      <p className="screen-time-privacy">Seçtiğin ekran görüntüsü analiz için Google Gemini'ye gönderilir.</p>
      {status === 'loading' && <p className="screen-time-status">🤖 Gemini analiz ediyor…</p>}
      {status === 'error' && <p className="screen-time-error" role="alert">⚠️ {errorMsg}</p>}
      <input type="file" accept="image/*" ref={imgRef} className="visually-hidden-file" tabIndex={-1} aria-hidden="true" onChange={handleFile} />
      <button type="button" className="screen-time-upload" onClick={() => imgRef.current?.click()} disabled={status === 'loading'}>📷 Digital Wellbeing ekran görüntüsü yükle</button>
    </div>
  )
}
