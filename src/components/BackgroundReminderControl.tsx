import { useEffect, useState } from 'react'
import type { CloudAccount } from '../lib/cloud'
import type { ReminderSettings } from '../lib/domain'
import { backgroundReminderState, disableBackgroundReminders, enableBackgroundReminders, type BackgroundReminderState } from '../lib/pushReminders'

export function BackgroundReminderControl({ account, reminders }: { account: CloudAccount | null; reminders: ReminderSettings }) {
  const [state, setState] = useState<BackgroundReminderState>({ supported: true, subscribed: false, permission: 'default' })
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Arka plan desteği kontrol ediliyor…')

  useEffect(() => {
    void backgroundReminderState().then(next => {
      setState(next)
      setStatus(!next.supported ? 'Bu tarayıcı Web Push desteklemiyor.' : next.subscribed ? 'Bu cihaz uygulama kapalıyken de sunucu hatırlatıcıları alabilir.' : 'Bu cihaz henüz arka plan hatırlatıcılarına bağlı değil.')
    }).catch(() => setStatus('Arka plan desteği kontrol edilemedi.'))
  }, [])

  const enable = async () => {
    if (!account) { setStatus('Arka plan hatırlatıcıları için önce bulut hesabında oturum aç.'); return }
    if (!reminders.enabled) { setStatus('Önce günlük hatırlatıcıları açıp ayarları kaydet.'); return }
    setBusy(true); setStatus('Bu cihaz güvenli Web Push servisine bağlanıyor…')
    try { const next = await enableBackgroundReminders(reminders); setState(next); setStatus('Arka plan hatırlatıcıları bu cihazda açıldı.') }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Arka plan hatırlatıcıları açılamadı.') }
    finally { setBusy(false) }
  }

  const disable = async () => {
    setBusy(true); setStatus('Abonelik kaldırılıyor…')
    try { const next = await disableBackgroundReminders(); setState(next); setStatus('Arka plan hatırlatıcıları bu cihazda kapatıldı.') }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Abonelik kaldırılamadı.') }
    finally { setBusy(false) }
  }

  return <section className="background-reminder-control">
    <div className="background-reminder-heading"><div><strong>Uygulama kapalıyken hatırlat</strong><p>Supabase Cron ve standart Web Push ile çalışır; ek bildirim servisi kullanılmaz.</p></div><span className={state.subscribed ? 'connected' : ''}>{state.subscribed ? 'Bağlı' : 'Kapalı'}</span></div>
    <p className="background-reminder-status" role="status">{status}</p>
    {!account && <p className="subtle">Cihaz aboneliğini yalnız sana bağlayabilmek için ücretsiz Momentum hesabı gerekir.</p>}
    {state.supported && (state.subscribed ? <button type="button" disabled={busy} onClick={() => void disable()}>Bu cihazda kapat</button> : <button type="button" disabled={busy || !account || !reminders.enabled} onClick={() => void enable()}>Bu cihazda arka planı aç</button>)}
    <small>iPhone ve iPad’de Web Push için Momentum’u Ana Ekran’a eklemek gerekir. Teslim zamanı tarayıcı ve işletim sistemi tarafından birkaç dakika geciktirilebilir.</small>
  </section>
}
