import { createClient } from 'npm:@supabase/supabase-js@^2'
import webpush from 'npm:web-push@3.6.7'

type ReminderPreferences = {
  enabled: boolean
  planTime: string
  habitsTime: string
  reflectionTime: string
  weeklyEnabled: boolean
  weeklyTime: string
}

type PushRow = { subscription_id: string; endpoint: string; p256dh: string; auth_key: string; notification_kind: 'plan' | 'habits' | 'reflection' | 'weekly' }
const allowedOrigins = new Set(['https://momentum-kappa-sepia.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://127.0.0.1:4173'])
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

function headers(request: Request) {
  const origin = request.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://momentum-kappa-sepia.vercel.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function response(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: headers(request) })
}

function validPreferences(value: unknown): value is ReminderPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Partial<ReminderPreferences>
  return typeof item.enabled === 'boolean' && typeof item.weeklyEnabled === 'boolean'
    && [item.planTime, item.habitsTime, item.reflectionTime, item.weeklyTime].every(value => typeof value === 'string' && timePattern.test(value))
}

function validTimezone(value: unknown) {
  if (typeof value !== 'string' || value.length > 100) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return true }
  catch { return false }
}

function notification(kind: PushRow['notification_kind']) {
  if (kind === 'plan') return { title: 'Günü planlama zamanı', body: 'Bugünün en önemli üç işini seçerek güne yön ver.', tag: 'momentum-plan' }
  if (kind === 'habits') return { title: 'Bugünün ritmini tamamla', body: 'Alışkanlıklarını kontrol et; küçük ilerleme de ilerlemedir.', tag: 'momentum-habits' }
  if (kind === 'reflection') return { title: 'Günü kapat', body: 'Bugünden öğrendiğini ve yarının ilk adımını kısaca kaydet.', tag: 'momentum-reflection' }
  return { title: 'Haftalık Momentum özeti', body: 'Kazançlarını, sürtünmeleri ve gelecek haftanın odağını gözden geçir.', tag: 'momentum-weekly' }
}

function claimedDateColumn(kind: PushRow['notification_kind']) {
  if (kind === 'plan') return 'last_plan_date'
  if (kind === 'habits') return 'last_habits_date'
  if (kind === 'reflection') return 'last_reflection_date'
  return 'last_weekly_date'
}

export default {
  fetch: async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) })
    if (request.method !== 'POST') return response(request, { error: 'Method Not Allowed' }, 405)
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    if (!url || !anonKey || !serviceKey || !publicKey || !privateKey) return response(request, { error: 'Push servisi yapılandırılmamış.' }, 503)
    let body: Record<string, unknown>
    try { body = await request.json() as Record<string, unknown> }
    catch { return response(request, { error: 'Geçersiz istek.' }, 400) }

    if (body.action === 'public-key') return response(request, { publicKey })
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

    if (body.action === 'dispatch') {
      const cronSecret = request.headers.get('x-cron-secret')
      if (!cronSecret) return response(request, { error: 'Yetkisiz.' }, 401)
      const { data, error } = await admin.rpc('claim_due_push_notifications', { cron_secret: cronSecret, batch_size: 50 })
      if (error) return response(request, { error: 'Hatırlatıcı kuyruğu alınamadı.' }, 401)
      webpush.setVapidDetails('mailto:momentum-notifications@users.noreply.github.com', publicKey, privateKey)
      let sent = 0
      let removed = 0
      for (const row of (data ?? []) as PushRow[]) {
        try {
          const payload = JSON.stringify({ ...notification(row.notification_kind), url: '/', kind: row.notification_kind })
          await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_key } }, payload, { TTL: 60 * 60 * 6, urgency: 'normal' })
          sent += 1
        } catch (error) {
          const statusCode = Number((error as { statusCode?: unknown })?.statusCode)
          if (statusCode === 404 || statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('id', row.subscription_id)
            removed += 1
          } else {
            await admin.from('push_subscriptions').update({ [claimedDateColumn(row.notification_kind)]: null }).eq('id', row.subscription_id)
          }
        }
      }
      return response(request, { ok: true, due: (data ?? []).length, sent, removed })
    }

    const authorization = request.headers.get('authorization')
    if (!authorization) return response(request, { error: 'Oturum gerekli.' }, 401)
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return response(request, { error: 'Oturum doğrulanamadı.' }, 401)

    if (body.action === 'unsubscribe-all') {
      const { error } = await admin.from('push_subscriptions').delete().eq('user_id', userData.user.id)
      return error ? response(request, { error: 'Cihaz abonelikleri kaldırılamadı.' }, 500) : response(request, { ok: true })
    }

    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
    if (!endpoint.startsWith('https://') || endpoint.length > 2048) return response(request, { error: 'Push aboneliği geçersiz.' }, 400)

    if (body.action === 'unsubscribe') {
      const { error } = await admin.from('push_subscriptions').delete().eq('user_id', userData.user.id).eq('endpoint', endpoint)
      return error ? response(request, { error: 'Abonelik kaldırılamadı.' }, 500) : response(request, { ok: true })
    }

    if (!validPreferences(body.preferences) || !validTimezone(body.timezone)) return response(request, { error: 'Hatırlatıcı ayarları geçersiz.' }, 400)
    const preferences = body.preferences
    if (body.action === 'preferences') {
      const { error } = await admin.from('push_subscriptions').update({ enabled: preferences.enabled, plan_time: preferences.planTime, habits_time: preferences.habitsTime, reflection_time: preferences.reflectionTime, weekly_enabled: preferences.weeklyEnabled, weekly_time: preferences.weeklyTime, timezone: body.timezone }).eq('user_id', userData.user.id)
      return error ? response(request, { error: 'Hatırlatıcı ayarları eşitlenemedi.' }, 500) : response(request, { ok: true })
    }

    if (body.action !== 'subscribe' || typeof body.p256dh !== 'string' || typeof body.auth !== 'string') return response(request, { error: 'Push aboneliği eksik.' }, 400)
    const values = { user_id: userData.user.id, endpoint, p256dh: body.p256dh.slice(0, 255), auth_key: body.auth.slice(0, 255), timezone: body.timezone, enabled: preferences.enabled, plan_time: preferences.planTime, habits_time: preferences.habitsTime, reflection_time: preferences.reflectionTime, weekly_enabled: preferences.weeklyEnabled, weekly_time: preferences.weeklyTime }
    const { data: existing } = await admin.from('push_subscriptions').select('user_id').eq('endpoint', endpoint).maybeSingle()
    if (existing && existing.user_id !== userData.user.id) return response(request, { error: 'Bu cihaz aboneliği başka bir hesaba bağlı.' }, 409)
    if (!existing) {
      const { count, error: countError } = await admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', userData.user.id)
      if (countError) return response(request, { error: 'Cihaz sınırı doğrulanamadı.' }, 500)
      if ((count ?? 0) >= 5) return response(request, { error: 'En fazla beş cihaz bağlanabilir.' }, 429)
    }
    const query = existing
      ? admin.from('push_subscriptions').update(values).eq('endpoint', endpoint).eq('user_id', userData.user.id)
      : admin.from('push_subscriptions').insert(values)
    const { error } = await query
    return error ? response(request, { error: 'Push aboneliği kaydedilemedi.' }, 500) : response(request, { ok: true })
  },
}
