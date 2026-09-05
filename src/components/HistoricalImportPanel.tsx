import { useMemo, useRef, useState } from 'react'
import { readSheet } from 'read-excel-file/browser'
import type { AppState } from '../lib/domain'
import { mergeHistoricalRecords, parseDelimitedText, parseHistoricalRows, parseHistoricalText, type HistoricalParseResult } from '../lib/historicalImport'
import { shortDuration } from '../lib/productivity'

type ApplyResult = { ok: boolean; error?: string }

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function HistoricalImportPanel({ state, maximumDate, disabled, onApply }: { state: AppState; maximumDate: string; disabled: boolean; onApply: (state: AppState) => Promise<ApplyResult> }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<HistoricalParseResult | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const preview = useMemo(() => {
    if (!parsed?.records.length) return null
    try { return { value: mergeHistoricalRecords(state, parsed.records, maximumDate), error: '' } }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : 'Kayıtlar birleştirilemedi.' } }
  }, [state, parsed, maximumDate])
  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    setBusy(true); setStatus('Dosya okunuyor…'); setParsed(null); setFileName(file.name)
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Dosya en fazla 10 MB olabilir.')
      const extension = file.name.split('.').pop()?.toLocaleLowerCase('tr-TR')
      let result: HistoricalParseResult
      if (extension === 'xlsx') result = parseHistoricalRows(await readSheet(file) as unknown[][])
      else if (extension === 'csv') result = parseHistoricalRows(parseDelimitedText(await file.text()))
      else if (extension === 'txt') result = parseHistoricalText(await file.text())
      else throw new Error('TXT, CSV veya XLSX dosyası seçmelisin.')
      if (result.records.length > 10_000) throw new Error('Tek seferde en fazla 10.000 kayıt içe aktarılabilir.')
      setParsed(result); setStatus(result.records.length ? '' : 'Dosyada içe aktarılabilecek geçerli kayıt bulunamadı.')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Dosya okunamadı.') }
    finally { setBusy(false) }
  }
  const apply = async () => {
    if (!preview?.value) return
    const result = await onApply(preview.value.state)
    if (!result.ok) { setStatus(result.error ?? 'Geçmiş kayıtlar eklenemedi.'); return }
    const added = preview.value.sessions.length + preview.value.screenEntries.length
    setStatus(`${added} geçmiş kayıt eklendi${preview.value.skipped ? `, mevcut ${preview.value.skipped} kayıt atlandı` : ''}. İşlemi aşağıdaki “Son içe aktarmayı geri al” düğmesiyle geri alabilirsin.`)
    setParsed(null); setFileName('')
  }
  const downloadTxt = () => download('momentum-gecmis-kayit-sablonu.txt', [
    '# Bir satıra bir tarih yaz. Aynı günde birden fazla süre olabilir.',
    '02.09.2026 -> 30 dk Kitap; 2 saat Veri Yapıları ve Algoritmalar (DSA)',
    '03.09.2026 -> 45 dk İngilizce; 35 dk Instagram [faydasız]',
    '04.09.2026 -> 20 dk YouTube eğitim [faydalı ekran]; 15 dk Bankacılık [zorunlu]',
  ].join('\n'), 'text/plain;charset=utf-8')
  const downloadCsv = () => download('momentum-gecmis-kayit-sablonu.csv', [
    'Tarih;Etkinlik;Süre;Birim;Tür;Alan',
    '02.09.2026;Kitap;30;dakika;Odak;Bilgi',
    '02.09.2026;Veri Yapıları ve Algoritmalar (DSA);2;saat;Odak;Eğitim',
    '03.09.2026;Instagram;35;dakika;Faydasız;',
    '04.09.2026;YouTube eğitim;20;dakika;Faydalı ekran;',
  ].join('\n'), 'text/csv;charset=utf-8')
  const addedCount = preview?.value ? preview.value.sessions.length + preview.value.screenEntries.length : 0
  const totalMinutes = preview?.value ? [...preview.value.sessions.map((item) => item.seconds / 60), ...preview.value.screenEntries.map((item) => item.minutes)].reduce((sum, value) => sum + value, 0) : 0
  return <section className="history-import">
    <div><p className="eyebrow">GEÇMİŞ KAYIT AKTARIMI</p><h3>TXT, Excel veya CSV’den doldur</h3><p className="gemini-help">Dosya mevcut verilerinin üzerine eklenir. Aynı kayıt tekrar yüklenirse ikinci kez yazılmaz; önce önizleme gösterilir.</p></div>
    <div className="history-template-actions"><button type="button" onClick={downloadTxt}>TXT şablonu</button><button type="button" onClick={downloadCsv}>Excel/CSV şablonu</button></div>
    <div className="history-format-note"><code>02.09.2026 → 30 dk Kitap; 2 saat DSA</code><p>Tür yazılmazsa faydalı odak kaydı sayılır. Pasif kullanım için etkinliğin sonuna <strong>[faydasız]</strong> ekleyebilirsin.</p></div>
    <input ref={inputRef} type="file" accept=".txt,.csv,.xlsx,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="visually-hidden-file" tabIndex={-1} aria-hidden="true" onChange={chooseFile} />
    <button type="button" className="timer-button history-file-button" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>{busy ? 'Dosya okunuyor…' : 'Geçmiş kayıt dosyasını seç'}</button>
    {parsed && <div className="history-preview" aria-live="polite"><div className="history-preview-head"><div><strong>{fileName}</strong><span>{parsed.records.length} geçerli satır · {parsed.errors.length} hata</span></div><span>{preview?.error ? 'Kontrol gerekli' : 'Hazır'}</span></div>
      {preview?.value && <div className="history-preview-stats"><span><strong>{addedCount}</strong> yeni kayıt</span><span><strong>{preview.value.skipped}</strong> tekrar</span><span><strong>{shortDuration(totalMinutes * 60)}</strong> toplam süre</span></div>}
      {parsed.records.length > 0 && <div className="history-preview-list">{parsed.records.slice(0, 5).map((item, index) => <div key={`${item.row}-${index}`}><time>{item.date}</time><strong>{item.title}</strong><span>{item.minutes} dk · {item.kind === 'focus' ? item.area : item.kind === 'passive' ? 'Faydasız' : item.kind === 'useful' ? 'Faydalı ekran' : item.kind === 'necessary' ? 'Zorunlu' : 'Sınıfsız'}</span></div>)}</div>}
      {parsed.records.length > 5 && <p className="gemini-help">İlk 5 kayıt gösteriliyor; kalan {parsed.records.length - 5} kayıt da içe aktarılacak.</p>}
      {(preview?.error || parsed.errors.length > 0) && <details className="history-errors" open={Boolean(preview?.error)}><summary>{preview?.error ? 'İçe aktarmayı engelleyen sorun' : `${parsed.errors.length} hatalı satır atlanacak`}</summary>{preview?.error && <p>{preview.error}</p>}{parsed.errors.slice(0, 20).map((error) => <p key={error}>{error}</p>)}</details>}
      <div className="import-actions"><button type="button" disabled={!preview?.value || addedCount === 0 || disabled} onClick={apply}>{addedCount ? `${addedCount} kaydı geçmişe ekle` : 'Yeni kayıt yok'}</button><button type="button" onClick={() => { setParsed(null); setStatus(''); setFileName('') }}>Vazgeç</button></div>
    </div>}
    {status && <p className="import-status" role="status">{status}</p>}
  </section>
}
