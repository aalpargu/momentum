import { type FormEvent, useState } from 'react'
import type { CloudSyncController } from '../hooks/useCloudSync'

export function CloudAccountPanel({ cloud }: { cloud: CloudSyncController }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const validCredentials = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 8

  const submitSignIn = async (event: FormEvent) => {
    event.preventDefault()
    if (!validCredentials) return
    await cloud.signIn(email.trim(), password)
    setPassword('')
  }

  const createAccount = async () => {
    if (!validCredentials) return
    await cloud.signUp(email.trim(), password)
    setPassword('')
  }

  if (!cloud.configured) return <section className="cloud-account cloud-disabled"><div className="cloud-heading"><div><p className="eyebrow">HESAP VE BULUT</p><h3>Bu cihazda kullanılıyor</h3></div><span>Yerel</span></div><p>Momentum çevrimdışı çalışmaya devam ediyor. Hesap ve cihazlar arası senkronizasyon, Supabase ortam değerleri eklendiğinde açılacak.</p></section>

  const needsChoice = cloud.account && cloud.phase === 'choice'
  const connected = cloud.account && ['synced', 'syncing'].includes(cloud.phase)

  return <section className="cloud-account">
    <div className="cloud-heading"><div><p className="eyebrow">HESAP VE BULUT</p><h3>{cloud.account ? cloud.account.email : 'İsteğe bağlı bulut hesabı'}</h3></div><span className={connected ? 'connected' : ''}>{connected ? 'Senkron' : cloud.account ? 'Bağlı' : 'Yerel'}</span></div>
    {!cloud.account ? <form className="cloud-auth-form" onSubmit={submitSignIn}>
      <label>E-posta<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={cloud.busy} /></label>
      <label>Parola<input type="password" minLength={8} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={cloud.busy} /></label>
      <div><button type="submit" disabled={cloud.busy || !validCredentials}>Giriş yap</button><button type="button" disabled={cloud.busy || !validCredentials} onClick={createAccount}>Hesap oluştur</button></div>
    </form> : <div className="cloud-actions">
      {cloud.record && <p>Son bulut kaydı: {new Date(cloud.record.updatedAt).toLocaleString('tr-TR')} · sürüm {cloud.record.revision}</p>}
      {needsChoice && <div><button type="button" disabled={cloud.busy || cloud.disabled} onClick={() => { if (!cloud.record || window.confirm('Buluttaki veri bu cihazdaki güncel verilerle değiştirilsin mi?')) void cloud.uploadLocal() }}>{cloud.record ? 'Bu cihazı kullan' : 'Bu cihazı buluta aktar'}</button>{cloud.record && <button type="button" disabled={cloud.busy || cloud.disabled} onClick={() => { if (window.confirm('Buluttaki doğrulanmış veri bu cihaza yüklensin mi? Mevcut cihaz verisi geri alma yedeğinde korunacak.')) void cloud.downloadCloud() }}>Buluttaki veriyi kullan</button>}</div>}
      {cloud.phase === 'error' && <button type="button" disabled={cloud.busy} onClick={() => void cloud.retry()}>Bağlantıyı tekrar dene</button>}
      <button className="cloud-signout" type="button" disabled={cloud.busy} onClick={() => void cloud.signOut()}>Hesaptan çık</button>
    </div>}
    {cloud.disabled && <p className="cloud-warning">Bulut verisini değiştirmeden önce açık odak oturumunu bitir.</p>}
    {cloud.message && <p className="cloud-status" role="status">{cloud.message}</p>}
  </section>
}
