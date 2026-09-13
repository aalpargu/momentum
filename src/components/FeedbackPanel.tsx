import { type FormEvent, useState } from 'react'
import type { CloudAccount } from '../lib/cloud'
import { analyticsOptOutKey, clearDiagnostics, recentDiagnostics } from '../lib/diagnostics'

type FeedbackCategory = 'idea' | 'problem' | 'experience'

export function FeedbackPanel({ account }: { account: CloudAccount | null }) {
  const [category, setCategory] = useState<FeedbackCategory>('experience')
  const [message, setMessage] = useState('')
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() => localStorage.getItem(analyticsOptOutKey) !== '1')

  const toggleAnalytics = (enabled: boolean) => {
    setAnalyticsEnabled(enabled)
    if (enabled) localStorage.removeItem(analyticsOptOutKey)
    else localStorage.setItem(analyticsOptOutKey, '1')
    setStatus(enabled ? 'Anonim sayfa istatistikleri bu cihazda açıldı.' : 'Anonim sayfa istatistikleri bu cihazda kapatıldı.')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = message.trim()
    if (!account) { setStatus('Geri bildirim göndermek için önce bulut hesabında oturum aç.'); return }
    if (text.length < 10) { setStatus('En az 10 karakterlik bir açıklama yaz.'); return }
    setBusy(true); setStatus('Geri bildirim güvenli biçimde gönderiliyor…')
    try {
      const { submitProductFeedback } = await import('../lib/cloud')
      await submitProductFeedback({ category, message: text, diagnostics: includeDiagnostics ? recentDiagnostics() : [] })
      setMessage(''); setStatus('Teşekkürler. Geri bildirimin alındı.')
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Geri bildirim gönderilemedi.') }
    finally { setBusy(false) }
  }

  return <section className="feedback-panel">
    <div className="privacy-control"><div><p className="eyebrow">GİZLİLİK KONTROLÜ</p><h3>Anonim kullanım istatistikleri</h3><p className="gemini-help">Vercel Web Analytics yalnız toplu sayfa görüntülemelerini ölçer; üçüncü taraf çerez, üretkenlik içeriği, e-posta veya tam URL parametreleri gönderilmez.</p></div><label className="toggle-label"><input type="checkbox" checked={analyticsEnabled} onChange={event => toggleAnalytics(event.target.checked)} /><span>Bu cihazda açık</span></label></div>
    <div><p className="eyebrow">GERİ BİLDİRİM VE HATA RAPORU</p><h3>Momentum’u birlikte iyileştirelim</h3><p className="gemini-help">Üretkenlik kayıtların gönderilmez. Tanılama izni açıksa yalnız uygulama sürümü, ekran boyutu, sayfa yolu ve ayıklanmış son teknik hatalar eklenir.</p></div>
    <form onSubmit={submit}>
      <label>Konu<select value={category} onChange={event => setCategory(event.target.value as FeedbackCategory)}><option value="experience">Deneyim</option><option value="problem">Sorun bildir</option><option value="idea">Öneri</option></select></label>
      <label>Açıklama<textarea value={message} onChange={event => { setMessage(event.target.value); setStatus('') }} minLength={10} maxLength={2_000} placeholder="Ne oldu, ne bekliyordun veya neyi daha iyi yapabiliriz?" /></label>
      <label className="toggle-label"><input type="checkbox" checked={includeDiagnostics} onChange={event => setIncludeDiagnostics(event.target.checked)} /><span>Teknik tanılamayı ekle</span></label>
      <button className="timer-button" disabled={busy || !account || message.trim().length < 10}>{busy ? 'Gönderiliyor…' : 'Geri bildirimi gönder'}</button>
    </form>
    {!account && <p className="backup-warning">Sunucuyu kötüye kullanımdan korumak için gönderim giriş yapmış hesaplarla sınırlıdır. Hesapsız kullanımda <a href="https://github.com/aalpargu/momentum/issues" target="_blank" rel="noreferrer">destek sayfasını</a> kullanabilirsin.</p>}
    <button type="button" className="quiet-button clear-diagnostics" onClick={() => { clearDiagnostics(); setStatus('Bu cihazdaki teknik tanılama geçmişi temizlendi.') }}>Yerel tanılama geçmişini temizle</button>
    {status && <p className="feedback-status" role="status">{status}</p>}
  </section>
}
