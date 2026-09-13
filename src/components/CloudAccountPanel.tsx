import { type FormEvent, useState } from 'react'
import type { CloudSyncController } from '../hooks/useCloudSync'
import { confirmAction } from './confirmAction'

export function CloudAccountPanel({ cloud }: { cloud: CloudSyncController }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newEmail, setNewEmail] = useState(cloud.account?.email ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [deletePhrase, setDeletePhrase] = useState('')
  const [manageOpen, setManageOpen] = useState(false)
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim())
  const validCredentials = validEmail && password.length >= 8

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
      <button className="password-reset" type="button" disabled={cloud.busy || !validEmail} onClick={() => void cloud.resetPassword(email.trim())}>Parolamı unuttum</button>
    </form> : <div className="cloud-actions">
      {cloud.record && <p>Son bulut kaydı: {new Date(cloud.record.updatedAt).toLocaleString('tr-TR')} · sürüm {cloud.record.revision}</p>}
      {needsChoice && <div className="cloud-choice"><p><strong>İki farklı kayıt bulundu.</strong> Bulut: {cloud.record ? new Date(cloud.record.updatedAt).toLocaleString('tr-TR') : 'boş'} · Bu cihaz: şu an açık olan kayıt.</p><button type="button" disabled={cloud.busy || cloud.disabled} onClick={async () => { if (!cloud.record || await confirmAction('Buluttaki veri bu cihazdaki güncel verilerle değiştirilecek.', 'Bu cihazı kullan', 'Bulut verisini değiştir')) void cloud.uploadLocal() }}>{cloud.record ? 'Bu cihazı kullan' : 'Bu cihazı buluta aktar'}</button>{cloud.record && <button type="button" disabled={cloud.busy || cloud.disabled} onClick={async () => { if (await confirmAction('Buluttaki doğrulanmış veri bu cihaza yüklenecek. Mevcut cihaz verisi geri alma yedeğinde korunacak.', 'Bulutu kullan', 'Cihaz verisini değiştir')) void cloud.downloadCloud() }}>Buluttaki veriyi kullan</button>}</div>}
      {cloud.phase === 'error' && <button type="button" disabled={cloud.busy} onClick={() => void cloud.retry()}>Bağlantıyı tekrar dene</button>}
      <button type="button" aria-expanded={manageOpen} onClick={() => setManageOpen(open => !open)}>Hesabı yönet</button>
      {manageOpen && <div className="account-management">
        <form onSubmit={event => { event.preventDefault(); if (/^\S+@\S+\.\S+$/.test(newEmail.trim())) void cloud.updateEmail(newEmail.trim()) }}><label>Yeni e-posta<input type="email" autoComplete="email" value={newEmail} onChange={event => setNewEmail(event.target.value)} /></label><button disabled={cloud.busy || !/^\S+@\S+\.\S+$/.test(newEmail.trim()) || newEmail.trim() === cloud.account?.email}>E-postayı değiştir</button></form>
        <form onSubmit={event => { event.preventDefault(); if (newPassword.length >= 8) { void cloud.updatePassword(newPassword); setNewPassword('') } }}><label>Yeni parola<input type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label><button disabled={cloud.busy || newPassword.length < 8}>Parolayı değiştir</button></form>
        <button type="button" disabled={cloud.busy} onClick={() => void cloud.signOutEverywhere()}>Tüm cihazlardan çık</button>
        <div className="account-danger"><strong>Hesabı sil</strong><p>Bulut hesabı ve sunucudaki Momentum verisi kalıcı olarak silinir. Bu cihazdaki yerel kayıt korunur.</p><label>Onaylamak için SİL yaz<input value={deletePhrase} onChange={event => setDeletePhrase(event.target.value)} /></label><button type="button" disabled={cloud.busy || deletePhrase !== 'SİL'} onClick={() => void cloud.deleteAccount()}>Hesabı ve bulut verisini sil</button></div>
      </div>}
      <button className="cloud-signout" type="button" disabled={cloud.busy} onClick={() => void cloud.signOut()}>Bu cihazdan çık</button>
    </div>}
    {cloud.disabled && <p className="cloud-warning">Bulut verisini değiştirmeden önce açık odak oturumunu bitir.</p>}
    {cloud.message && <p className="cloud-status" role="status">{cloud.message}</p>}
  </section>
}
