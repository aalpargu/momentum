import { useEffect, useState } from 'react'
import { externalBackupState, forgetExternalBackupDirectory, selectExternalBackupDirectory, writeExternalBackup, type ExternalBackupState } from '../lib/externalBackup'
import type { AppState } from '../lib/domain'

export function ExternalBackupPanel({ state }: { state: AppState }) {
  const [backup, setBackup] = useState<ExternalBackupState>({ supported: true, configured: false })
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Yedek klasörü kontrol ediliyor…')
  const payload = () => JSON.stringify(state)

  useEffect(() => {
    void externalBackupState().then(next => {
      setBackup(next)
      setStatus(!next.supported ? 'Bu tarayıcı otomatik klasör yedeğini desteklemiyor; JSON indirme kullanılabilir.' : next.configured ? next.permission === 'granted' ? 'Her başarılı değişiklik seçili klasöre otomatik yedeklenir.' : 'Tarayıcı klasör iznini yeniden istiyor.' : 'Henüz bir yedek klasörü seçilmedi.')
    })
  }, [])

  const choose = async () => {
    setBusy(true); setStatus('Klasör seçimi bekleniyor…')
    try {
      const next = await selectExternalBackupDirectory(payload())
      setBackup(next); setStatus('Klasör bağlandı ve ilk yedek yazıldı.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setStatus('Klasör seçimi iptal edildi.')
      else setStatus(error instanceof Error ? error.message : 'Yedek klasörü bağlanamadı.')
    } finally { setBusy(false) }
  }

  const saveNow = async () => {
    setBusy(true); setStatus('Yedek yazılıyor…')
    try {
      const next = await writeExternalBackup(payload(), true)
      setBackup(next)
      setStatus(next.permission === 'granted' ? 'Güncel ve günlük yedek dosyaları yazıldı.' : 'Klasör yazma izni verilmedi.')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Yedek yazılamadı.') }
    finally { setBusy(false) }
  }

  const forget = async () => {
    setBusy(true)
    try { await forgetExternalBackupDirectory(); setBackup({ supported: true, configured: false }); setStatus('Klasör bağlantısı kaldırıldı; mevcut yedek dosyaları silinmedi.') }
    catch { setStatus('Klasör bağlantısı kaldırılamadı.') }
    finally { setBusy(false) }
  }

  return <section className="external-backup-panel">
    <div><p className="eyebrow">CİHAZ DIŞI YEDEK</p><h3>Bulut klasörüne otomatik JSON</h3><p className="gemini-help">OneDrive veya Google Drive ile eşitlenen yerel bir klasör seçebilirsin. Momentum yalnız seçtiğin klasöre <code>momentum-latest.json</code> ve gün bazlı bir kopya yazar.</p></div>
    {backup.configured && <div className="external-backup-state"><span aria-hidden="true">↗</span><div><strong>{backup.directoryName}</strong><small>{backup.lastBackupAt ? `Son yedek: ${new Date(backup.lastBackupAt).toLocaleString('tr-TR')}` : 'İlk yedek bekleniyor'}</small></div></div>}
    <p className="backup-store-status" role="status">{status}</p>
    <div className="external-backup-actions"><button type="button" className="timer-button" disabled={busy || !backup.supported} onClick={() => void choose()}>{backup.configured ? 'Başka klasör seç' : 'Yedek klasörü seç'}</button>{backup.configured && <><button type="button" disabled={busy} onClick={() => void saveNow()}>Şimdi yedekle</button><button type="button" disabled={busy} onClick={() => void forget()}>Bağlantıyı kaldır</button></>}</div>
    <p className="gemini-help">Otomatik klasör erişimi masaüstü Chromium tarayıcılarında çalışır. Diğer tarayıcılarda yukarıdaki JSON indirme ve paylaşma seçenekleri kullanılmaya devam eder.</p>
  </section>
}
