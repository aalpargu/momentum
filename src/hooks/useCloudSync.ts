import { useEffect, useRef, useState } from 'react'
import type { AppState } from '../lib/domain'
import { cloudConfigured } from '../lib/cloudConfig'
import type { CloudAccount, CloudStateRecord } from '../lib/cloud'

const cloudLinkStorageKey = 'momentum-cloud-link-v1'

type CloudLink = { userId: string; revision: number; payloadHash: string }
type RestoreResult = { ok: boolean; error?: string }
export type CloudPhase = 'disabled' | 'loading' | 'local' | 'choice' | 'syncing' | 'synced' | 'error'

export type CloudSyncController = {
  configured: boolean
  account: CloudAccount | null
  record: CloudStateRecord | null
  phase: CloudPhase
  busy: boolean
  message: string
  disabled: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  uploadLocal: () => Promise<void>
  downloadCloud: () => Promise<void>
  retry: () => Promise<void>
}

function readLink(userId: string): CloudLink | null {
  try {
    const value = JSON.parse(localStorage.getItem(cloudLinkStorageKey) ?? 'null') as Partial<CloudLink> | null
    if (!value || value.userId !== userId || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || typeof value.payloadHash !== 'string') return null
    return { userId, revision: Number(value.revision), payloadHash: value.payloadHash }
  } catch { return null }
}

function saveLink(link: CloudLink) {
  localStorage.setItem(cloudLinkStorageKey, JSON.stringify(link))
}

async function hashPayload(payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function useCloudSync({ state, storageReady, disabled, validatePayload, replaceState }: {
  state: AppState
  storageReady: boolean
  disabled: boolean
  validatePayload: (payload: unknown) => AppState
  replaceState: (state: AppState) => Promise<RestoreResult>
}): CloudSyncController {
  const [account, setAccount] = useState<CloudAccount | null>(null)
  const [record, setRecord] = useState<CloudStateRecord | null>(null)
  const [phase, setPhase] = useState<CloudPhase>(cloudConfigured ? 'loading' : 'disabled')
  const [busy, setBusy] = useState(cloudConfigured)
  const [message, setMessage] = useState(cloudConfigured ? 'Bulut oturumu kontrol ediliyor…' : 'Bulut bağlantısı yapılandırılmamış.')
  const stateRef = useRef(state)
  const accountRef = useRef(account)
  const recordRef = useRef(record)
  const revisionRef = useRef<number | null>(null)
  const lastHashRef = useRef<string | null>(null)
  const operationRef = useRef(0)
  const uploadInFlightRef = useRef(false)
  stateRef.current = state
  accountRef.current = account
  recordRef.current = record

  const refreshAccount = async (next: CloudAccount | null) => {
    const operation = ++operationRef.current
    setAccount(next); accountRef.current = next
    setRecord(null); recordRef.current = null
    revisionRef.current = null; lastHashRef.current = null
    if (!next) { setPhase('local'); setBusy(false); setMessage('Hesapsız, yalnızca bu cihazda kullanıyorsun.'); return }
    setBusy(true); setPhase('loading'); setMessage('Bulut kaydı kontrol ediliyor…')
    try {
      const api = await import('../lib/cloud')
      const remote = await api.loadCloudState(next.id)
      if (operation !== operationRef.current) return
      setRecord(remote); recordRef.current = remote; revisionRef.current = remote?.revision ?? null
      const link = readLink(next.id)
      if (remote && link?.revision === remote.revision) {
        lastHashRef.current = link.payloadHash
        setPhase('synced'); setMessage(`Bulut senkronizasyonu açık · sürüm ${remote.revision}`)
      } else {
        setPhase('choice')
        setMessage(remote ? 'Bu cihaz ile buluttaki kayıt farklı. Hangisinin kullanılacağını seç.' : 'Bu hesapta henüz Momentum verisi yok.')
      }
    } catch (error) {
      if (operation !== operationRef.current) return
      setPhase('error'); setMessage(error instanceof Error ? error.message : 'Bulut kaydı okunamadı.')
    } finally { if (operation === operationRef.current) setBusy(false) }
  }

  useEffect(() => {
    if (!cloudConfigured) return
    let active = true
    let stopObserving: () => void = () => undefined
    void import('../lib/cloud').then(async api => {
      if (!active) return
      stopObserving = api.observeCloudAccount(next => {
        if (active && next?.id !== accountRef.current?.id) void refreshAccount(next)
      })
      try { if (active) await refreshAccount(await api.getCloudAccount()) }
      catch (error) { if (active) { setBusy(false); setPhase('error'); setMessage(error instanceof Error ? error.message : 'Bulut oturumu okunamadı.') } }
    }).catch(error => { if (active) { setBusy(false); setPhase('error'); setMessage(error instanceof Error ? error.message : 'Bulut özelliği yüklenemedi.') } })
    return () => { active = false; operationRef.current += 1; stopObserving() }
  }, [])

  useEffect(() => {
    if (!cloudConfigured || !storageReady || disabled || phase !== 'synced' || !account || uploadInFlightRef.current) return
    const timer = window.setTimeout(async () => {
      const snapshot = stateRef.current
      const hash = await hashPayload(snapshot)
      if (hash === lastHashRef.current || uploadInFlightRef.current || !accountRef.current) return
      const operation = ++operationRef.current
      uploadInFlightRef.current = true; setBusy(true); setPhase('syncing'); setMessage('Değişiklikler buluta kaydediliyor…')
      try {
        const api = await import('../lib/cloud')
        const next = await api.saveCloudState(account.id, snapshot, revisionRef.current)
        if (operation !== operationRef.current) return
        setRecord(next); recordRef.current = next; revisionRef.current = next.revision; lastHashRef.current = hash
        saveLink({ userId: account.id, revision: next.revision, payloadHash: hash })
        setPhase('synced'); setMessage(`Bulut güncel · sürüm ${next.revision}`)
      } catch (error) {
        if (operation !== operationRef.current) return
        const api = await import('../lib/cloud')
        setPhase(error instanceof api.CloudConflictError ? 'choice' : 'error')
        setMessage(error instanceof Error ? error.message : 'Değişiklikler buluta kaydedilemedi; yerel kayıt korundu.')
      } finally {
        if (operation === operationRef.current) setBusy(false)
        uploadInFlightRef.current = false
      }
    }, 1_200)
    return () => window.clearTimeout(timer)
  }, [state, storageReady, disabled, phase, account?.id])

  const signIn = async (email: string, password: string) => {
    setBusy(true); setMessage('Giriş yapılıyor…')
    try {
      const api = await import('../lib/cloud')
      const next = await api.signInToCloud(email, password)
      if (next) await refreshAccount(next)
    } catch (error) { setPhase('local'); setMessage(error instanceof Error ? error.message : 'Giriş yapılamadı.') }
    finally { setBusy(false) }
  }

  const signUp = async (email: string, password: string) => {
    setBusy(true); setMessage('Hesap oluşturuluyor…')
    try {
      const api = await import('../lib/cloud')
      const result = await api.registerCloudAccount(email, password)
      if (result.account) await refreshAccount(result.account)
      else if (result.confirmationRequired) { setPhase('local'); setMessage('Onay bağlantısı e-posta adresine gönderildi. Onayladıktan sonra giriş yapabilirsin.') }
    } catch (error) { setPhase('local'); setMessage(error instanceof Error ? error.message : 'Hesap oluşturulamadı.') }
    finally { setBusy(false) }
  }

  const signOut = async () => {
    setBusy(true); setMessage('Çıkış yapılıyor…'); operationRef.current += 1
    try {
      const api = await import('../lib/cloud')
      await api.signOutFromCloud()
      await refreshAccount(null)
      setMessage('Çıkış yapıldı. Yerel verilerin bu cihazda duruyor.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Çıkış yapılamadı.') }
    finally { setBusy(false) }
  }

  const uploadLocal = async () => {
    const current = accountRef.current
    if (!current || disabled) return
    setBusy(true); setPhase('syncing'); setMessage('Bu cihazdaki veriler buluta yazılıyor…')
    try {
      const snapshot = stateRef.current
      const hash = await hashPayload(snapshot)
      const api = await import('../lib/cloud')
      const next = await api.saveCloudState(current.id, snapshot, recordRef.current?.revision ?? null)
      setRecord(next); recordRef.current = next; revisionRef.current = next.revision; lastHashRef.current = hash
      saveLink({ userId: current.id, revision: next.revision, payloadHash: hash })
      setPhase('synced'); setMessage(`Bulut senkronizasyonu açıldı · sürüm ${next.revision}`)
    } catch (error) {
      const api = await import('../lib/cloud')
      setPhase(error instanceof api.CloudConflictError ? 'choice' : 'error')
      setMessage(error instanceof Error ? error.message : 'Bulut kaydı güncellenemedi.')
      try {
        const next = await api.loadCloudState(current.id)
        setRecord(next); recordRef.current = next; revisionRef.current = next?.revision ?? null
      } catch { /* Asıl hata mesajını koru. */ }
    } finally { setBusy(false) }
  }

  const downloadCloud = async () => {
    const current = accountRef.current
    const remote = recordRef.current
    if (!current || !remote || disabled) return
    setBusy(true); setPhase('syncing'); setMessage('Bulut kaydı doğrulanıp bu cihaza yükleniyor…')
    try {
      const nextState = validatePayload(remote.payload)
      const result = await replaceState(nextState)
      if (!result.ok) throw new Error(result.error ?? 'Bulut verisi yerel depoya yazılamadı.')
      const hash = await hashPayload(nextState)
      revisionRef.current = remote.revision; lastHashRef.current = hash
      saveLink({ userId: current.id, revision: remote.revision, payloadHash: hash })
      setPhase('synced'); setMessage(`Bulut verisi yüklendi · sürüm ${remote.revision}`)
    } catch (error) { setPhase('choice'); setMessage(error instanceof Error ? error.message : 'Bulut verisi yüklenemedi.') }
    finally { setBusy(false) }
  }

  const retry = async () => { await refreshAccount(accountRef.current) }

  return { configured: cloudConfigured, account, record, phase, busy, message, disabled, signIn, signUp, signOut, uploadLocal, downloadCloud, retry }
}
