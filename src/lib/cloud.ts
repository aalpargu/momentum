import { createClient, type Session, type User } from '@supabase/supabase-js'
import { cloudConfigured, supabasePublishableKey, supabaseUrl } from './cloudConfig'

const client = cloudConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export type CloudAccount = { id: string; email: string }
export type CloudStateRecord = {
  userId: string
  schemaVersion: number
  revision: number
  payload: unknown
  updatedAt: string
}

export class CloudConflictError extends Error {
  constructor() { super('Bulut kaydı başka bir cihazda değişmiş. Güncel kaydı yeniden yükle.') }
}

function requireClient() {
  if (!client) throw new Error('Bulut bağlantısı bu kurulumda yapılandırılmamış.')
  return client
}

function accountFromUser(user: User | null): CloudAccount | null {
  if (!user) return null
  return { id: user.id, email: user.email ?? 'E-posta adresi yok' }
}

function accountFromSession(session: Session | null) {
  return accountFromUser(session?.user ?? null)
}

function cloudError(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback)
}

export async function getCloudAccount() {
  const { data, error } = await requireClient().auth.getSession()
  cloudError(error, 'Bulut oturumu okunamadı.')
  return accountFromSession(data.session)
}

export function observeCloudAccount(listener: (account: CloudAccount | null) => void) {
  if (!client) return () => undefined
  const { data } = client.auth.onAuthStateChange((_event, session) => listener(accountFromSession(session)))
  return () => data.subscription.unsubscribe()
}

export async function signInToCloud(email: string, password: string) {
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password })
  cloudError(error, 'Giriş yapılamadı.')
  return accountFromSession(data.session)
}

export async function registerCloudAccount(email: string, password: string) {
  const { data, error } = await requireClient().auth.signUp({ email, password })
  cloudError(error, 'Hesap oluşturulamadı.')
  return { account: accountFromSession(data.session), confirmationRequired: Boolean(data.user && !data.session) }
}

export async function signOutFromCloud() {
  const { error } = await requireClient().auth.signOut()
  cloudError(error, 'Çıkış yapılamadı.')
}

function toCloudStateRecord(row: Record<string, unknown>): CloudStateRecord {
  const revision = Number(row.revision)
  const schemaVersion = Number(row.schema_version)
  if (typeof row.user_id !== 'string' || !Number.isSafeInteger(revision) || revision < 1 || !Number.isSafeInteger(schemaVersion) || schemaVersion < 1 || typeof row.updated_at !== 'string') {
    throw new Error('Bulut kaydının üst bilgileri geçersiz.')
  }
  return { userId: row.user_id, schemaVersion, revision, payload: row.payload, updatedAt: row.updated_at }
}

export async function loadCloudState(userId: string) {
  const { data, error } = await requireClient()
    .from('user_states')
    .select('user_id,schema_version,revision,payload,updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  cloudError(error, 'Bulut kaydı okunamadı.')
  return data ? toCloudStateRecord(data as Record<string, unknown>) : null
}

export async function saveCloudState(userId: string, payload: unknown, expectedRevision: number | null) {
  const nextRevision = expectedRevision === null ? 1 : expectedRevision + 1
  const values = {
    user_id: userId,
    schema_version: 2,
    revision: nextRevision,
    payload,
    updated_at: new Date().toISOString(),
  }

  if (expectedRevision === null) {
    const { data, error } = await requireClient().from('user_states').insert(values).select('user_id,schema_version,revision,payload,updated_at').single()
    if (error?.code === '23505') throw new CloudConflictError()
    cloudError(error, 'Bulut kaydı oluşturulamadı.')
    return toCloudStateRecord(data as Record<string, unknown>)
  }

  const { data, error } = await requireClient()
    .from('user_states')
    .update(values)
    .eq('user_id', userId)
    .eq('revision', expectedRevision)
    .select('user_id,schema_version,revision,payload,updated_at')
    .maybeSingle()
  cloudError(error, 'Bulut kaydı güncellenemedi.')
  if (!data) throw new CloudConflictError()
  return toCloudStateRecord(data as Record<string, unknown>)
}

export async function analyzeScreenTimeInCloud(payload: { mimeType: string; data: string }) {
  const { data, error } = await requireClient().functions.invoke('analyze-screen-time', { body: payload })
  if (error) {
    const context = error.context as Response | undefined
    if (context) {
      try {
        const body = await context.clone().json() as { error?: unknown; message?: unknown }
        const message = typeof body.error === 'string' ? body.error : typeof body.message === 'string' ? body.message : ''
        if (message) throw new Error(message)
      } catch (cause) { if (cause instanceof Error && cause.message !== 'Unexpected end of JSON input') throw cause }
    }
    throw new Error(error.message || 'Gemini analiz servisine ulaşılamadı.')
  }
  return data as { entries?: unknown }
}
