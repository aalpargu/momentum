import { useEffect, useState } from 'react'
import { externalBackupState, externalBackupStateEvent, forgetExternalBackupDirectory, selectExternalBackupDirectory, writeExternalBackup, type ExternalBackupState } from '../lib/externalBackup'
import { localServerBackupState, localServerBackupStateEvent, writeLocalServerBackup, type LocalServerBackupState } from '../lib/localServerBackup'
import type { AppState } from '../lib/domain'

export function ExternalBackupPanel({ state }: { state: AppState }) {
  const [backup, setBackup] = useState<ExternalBackupState>({ supported: true, configured: false })
  const [driveBackup, setDriveBackup] = useState<LocalServerBackupState>({ available: false })
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Yedek klasörü kontrol ediliyor…')
  const payload = () => JSON.stringify(state)

  useEffect(() => {
    const onBackupState = (event: Event) => setBackup((event as CustomEvent<ExternalBackupState>).detail)
    const onDriveBackupState = (event: Event) => {
      const next = (event as CustomEvent<LocalServerBackupState>).detail
      setDriveBackup(next)
      if (next.available) setStatus('Google Drive for desktop bağlı; her başarılı değişiklik otomatik yedeklenir.')
    }
    window.addEventListener(externalBackupStateEvent, onBackupState)
    window.addEventListener(localServerBackupStateEvent, onDriveBackupState)
    void Promise.all([externalBackupState(), localServerBackupState().catch(() => ({ available: false } as LocalServerBackupState))]).then(([next, drive]) => {
      setBackup(next); setDriveBackup(drive)
      setStatus(drive.available ? 'Google Drive for desktop bağlı; her başarılı değişiklik otomatik yedeklenir.' : !next.supported ? 'Bu tarayıcı otomatik klasör yedeğini desteklemiyor; JSON indirme kullanılabilir.' : next.configured ? next.permission === 'granted' ? next.pendingSince ? 'Tamamlanmayı bekleyen bir yedek var; şimdi yeniden dene.' : 'Her başarılı değişiklik doğrulanarak seçili klasöre yazılır.' : 'Tarayıcı klasör iznini yeniden istiyor.' : 'Google Drive içindeki yedek klasörünü bir kez seçmen gerekiyor.')
    }).catch(error => setStatus(error instanceof Error ? error.message : 'Yedek klasörü okunamadı.'))
    return () => { window.removeEventListener(externalBackupStateEvent, onBackupState); window.removeEventListener(localServerBackupStateEvent, onDriveBackupState) }
  }, [])

  const choose = async () => {
    setBusy(true); setStatus('Klasör seçimi bekleniyor…')
    try {
      const next = await selectExternalBackupDirectory(payload())
      setBackup(next); setStatus(next.permission === 'granted' && next.lastBackupAt ? 'Google Drive klasörü bağlandı; ilk yedek yazıldı ve doğrulandı.' : 'Klasör seçildi ancak yedek yazılamadı. Yazma iznini kontrol et.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setStatus('Klasör seçimi iptal edildi.')
      else setStatus(error instanceof Error ? error.message : 'Yedek klasörü bağlanamadı.')
    } finally { setBusy(false) }
  }

  const saveNow = async () => {
    setBusy(true); setStatus('Yedek yazılıyor…')
    try {
      const drive = await writeLocalServerBackup(payload())
      setDriveBackup(drive)
      if (drive.available) { setStatus('Güncel ve günlük yedek Google Drive klasörüne yazıldı ve doğrulandı.'); return }
      const next = await writeExternalBackup(payload(), true)
      setBackup(next)
      setStatus(next.permission === 'granted' ? 'Güncel ve günlük yedek dosyaları yazıldı ve içerikleri doğrulandı.' : 'Klasör yazma izni verilmedi.')
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
    <div><p className="eyebrow">GOOGLE DRIVE YEDEĞİ</p><h3>Drive klasörüne otomatik ve doğrulanmış JSON</h3><p className="gemini-help">Momentum her başarılı değişiklikten sonra seçtiğin klasöre <code>momentum-latest.json</code> ve gün bazlı bir kopya yazar. Google Drive for desktop bu dosyaları buluta eşitler.</p></div>
    {!driveBackup.available && !backup.configured && <div className="external-backup-setup">
      <strong>Bir kez kur, sonrasında otomatik çalışsın</strong>
      <ol><li><a href="https://www.google.com/drive/download/" target="_blank" rel="noreferrer">Google Drive for desktop</a> uygulamasını kur ve hesabınla giriş yap.</li><li>Google Drive → Drive'ım altında <b>Momentum Yedekleri</b> adlı bir klasör oluştur.</li><li>Aşağıdaki düğmeye basıp bu klasörü seç ve tarayıcının yazma iznini onayla.</li></ol>
    </div>}
    {driveBackup.available && <div className="external-backup-state"><span aria-hidden="true">✓</span><div><strong>{driveBackup.directoryName} · Google Drive bağlı</strong><small>{driveBackup.lastBackupAt ? `Son doğrulanan yedek: ${new Date(driveBackup.lastBackupAt).toLocaleString('tr-TR')}` : 'İlk yedek bekleniyor'}</small></div></div>}
    {!driveBackup.available && backup.configured && <div className={`external-backup-state ${backup.pendingSince || backup.permission !== 'granted' ? 'needs-attention' : ''}`}><span aria-hidden="true">{backup.pendingSince || backup.permission !== 'granted' ? '!' : '✓'}</span><div><strong>{backup.directoryName}</strong><small>{backup.lastBackupAt ? `Son doğrulanan klasör yedeği: ${new Date(backup.lastBackupAt).toLocaleString('tr-TR')}` : 'İlk yedek bekleniyor'}</small>{backup.pendingSince && <small>Bekleyen değişiklik: {new Date(backup.pendingSince).toLocaleString('tr-TR')}</small>}</div></div>}
    <p className="backup-store-status" role="status">{status}</p>
    <div className="external-backup-actions">{!driveBackup.available && <button type="button" className="timer-button" disabled={busy || !backup.supported} onClick={() => void choose()}>{backup.configured ? 'Başka Drive klasörü seç' : 'Google Drive klasörünü seç'}</button>}<button type="button" className={driveBackup.available ? 'timer-button' : undefined} disabled={busy || (!driveBackup.available && !backup.configured)} onClick={() => void saveNow()}>Şimdi doğrula ve yedekle</button>{!driveBackup.available && backup.configured && <button type="button" disabled={busy} onClick={() => void forget()}>Bağlantıyı kaldır</button>}</div>
    <p className="gemini-help">Klasöre yazma ile buluta eşitleme iki ayrı adımdır. Son doğrulanan zaman Momentum'un yerel Drive klasörüne başarıyla yazdığını gösterir; Google Drive simgesinde “Eşitleme tamamlandı” durumunu da ara sıra kontrol et. Otomatik erişim masaüstü Chrome ve Edge'de çalışır.</p>
  </section>
}
