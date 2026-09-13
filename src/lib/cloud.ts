import { createClient, type Session, type User } from '@supabase/supabase-js'
import { cloudConfigured, supabasePublishableKey, supabaseUrl } from './cloudConfig'
import type { ClientDiagnostic } from './diagnostics'

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

function localizedCloudMessage(message: string, fallback: string) {
  const normalized = message.toLocaleLowerCase('en-US')
  if (normalized.includes('invalid login credentials')) return 'E-posta veya parola hatalı.'
  if (normalized.includes('email not confirmed')) return 'Önce e-posta adresine gönderilen bağlantıyı onayla.'
  if (normalized.includes('user already registered')) return 'Bu e-posta adresiyle zaten bir hesap var.'
  if (normalized.includes('password should be')) return 'Parola en az 8 karakter olmalı.'
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) return 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.'
  if (normalized.includes('network') || normalized.includes('fetch')) return 'Bulut hizmetine ulaşılamadı. İnternet bağlantını kontrol et.'
  return fallback
}

function cloudError(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(localizedCloudMessage(error.message, fallback))
}

async function runCloudOperation<T>(operation: () => PromiseLike<T>, fallback: string, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    try {
      return await Promise.race([
        Promise.resolve(operation()),
        new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Bulut isteği zaman aşımına uğradı.')), { once: true })),
      ])
    } catch (error) {
      lastError = error
      if (error instanceof CloudConflictError || attempt === attempts - 1) break
      await new Promise(resolve => window.setTimeout(resolve, 350 * (2 ** attempt)))
    } finally { window.clearTimeout(timeout) }
  }
  throw lastError instanceof Error ? lastError : new Error(fallback)
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
  const { data, error } = await requireClient().auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
  cloudError(error, 'Hesap oluşturulamadı.')
  return { account: accountFromSession(data.session), confirmationRequired: Boolean(data.user && !data.session) }
}

export async function signOutFromCloud() {
  const { error } = await requireClient().auth.signOut({ scope: 'local' })
  cloudError(error, 'Çıkış yapılamadı.')
}

export async function signOutEverywhere() {
  const { error } = await requireClient().auth.signOut({ scope: 'global' })
  cloudError(error, 'Diğer cihazlardaki oturumlar kapatılamadı.')
}

export async function sendPasswordReset(email: string) {
  const { error } = await requireClient().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
  cloudError(error, 'Parola sıfırlama bağlantısı gönderilemedi.')
}

export async function updateCloudEmail(email: string) {
  const { data, error } = await requireClient().auth.updateUser({ email })
  cloudError(error, 'E-posta adresi güncellenemedi.')
  return accountFromUser(data.user)
}

export async function updateCloudPassword(password: string) {
  const { error } = await requireClient().auth.updateUser({ password })
  cloudError(error, 'Parola güncellenemedi.')
}

export async function deleteCloudAccount() {
  const { data, error } = await requireClient().functions.invoke('delete-account', { body: {} })
  if (error) throw new Error(localizedCloudMessage(error.message, 'Hesap silinemedi. Daha sonra tekrar dene.'))
  if (!data?.deleted) throw new Error('Hesap silme işlemi doğrulanamadı.')
  await requireClient().auth.signOut({ scope: 'local' })
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
  const { data, error } = await runCloudOperation(() => requireClient()
    .from('user_states')
    .select('user_id,schema_version,revision,payload,updated_at')
    .eq('user_id', userId)
    .maybeSingle(), 'Bulut kaydı okunamadı.')
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
    const { data, error } = await runCloudOperation(() => requireClient().from('user_states').insert(values).select('user_id,schema_version,revision,payload,updated_at').single(), 'Bulut kaydı oluşturulamadı.', 1)
    if (error?.code === '23505') throw new CloudConflictError()
    cloudError(error, 'Bulut kaydı oluşturulamadı.')
    return toCloudStateRecord(data as Record<string, unknown>)
  }

  const { data, error } = await runCloudOperation(() => requireClient()
    .from('user_states')
    .update(values)
    .eq('user_id', userId)
    .eq('revision', expectedRevision)
    .select('user_id,schema_version,revision,payload,updated_at')
    .maybeSingle(), 'Bulut kaydı güncellenemedi.', 1)
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

export async function submitProductFeedback(input: { category: 'idea' | 'problem' | 'experience' | 'crash'; message: string; diagnostics?: ClientDiagnostic[] }) {
  const api = requireClient()
  const { data: accountData, error: accountError } = await api.auth.getUser()
  cloudError(accountError, 'Oturum doğrulanamadı. Yeniden giriş yapıp tekrar dene.')
  if (!accountData.user) throw new Error('Geri bildirim göndermek için hesabında oturum aç.')
  const diagnostics = (input.diagnostics ?? []).slice(0, 10).map(item => ({
    id: item.id.slice(0, 100),
    kind: item.kind,
    message: item.message.slice(0, 500),
    ...(item.stack ? { stack: item.stack.slice(0, 1_500) } : {}),
    path: item.path.slice(0, 200),
    createdAt: item.createdAt,
  }))
  const { error } = await api.from('product_feedback').insert({
    user_id: accountData.user.id,
    category: input.category,
    message: input.message.trim().slice(0, 2_000),
    app_version: __APP_VERSION__,
    page_path: window.location.pathname.slice(0, 200),
    diagnostics: [
      { kind: 'environment', viewport: `${window.innerWidth}x${window.innerHeight}`, online: navigator.onLine },
      ...diagnostics,
    ],
  })
  if (error?.message.includes('Daily feedback limit reached')) throw new Error('Günlük geri bildirim sınırına ulaşıldı. Yarın tekrar deneyebilirsin.')
  cloudError(error, 'Geri bildirim gönderilemedi. Daha sonra tekrar dene.')
}
