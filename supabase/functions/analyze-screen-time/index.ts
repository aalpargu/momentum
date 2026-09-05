import { withSupabase } from 'npm:@supabase/server@^1'

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

type ScreenTimeEntry = { app: string; minutes: number }

function validateImagePayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(400, 'Geçersiz istek.')
  const body = value as { mimeType?: unknown; data?: unknown }
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''
  const data = typeof body.data === 'string' ? body.data : ''
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw new RequestError(400, 'PNG, JPEG veya WebP biçiminde bir ekran görüntüsü seç.')
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new RequestError(400, 'Geçersiz ekran görüntüsü verisi.')
  const approximateBytes = Math.floor(data.length * 3 / 4)
  if (approximateBytes < 1 || approximateBytes > 10 * 1024 * 1024) throw new RequestError(413, 'Ekran görüntüsü en fazla 10 MB olabilir.')
  return { mimeType, data }
}

function validateEntries(value: unknown): ScreenTimeEntry[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200) throw new RequestError(502, 'Gemini geçerli bir uygulama listesi döndürmedi.')
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new RequestError(502, 'Gemini cevabında geçersiz bir kayıt var.')
    const item = candidate as { app?: unknown; minutes?: unknown }
    const app = typeof item.app === 'string' ? item.app.trim() : ''
    const minutes = Number(item.minutes)
    if (!app || app.length > 100 || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new RequestError(502, 'Gemini cevabındaki uygulama veya süre geçersiz.')
    return { app, minutes }
  })
}

async function callGemini(image: { mimeType: string; data: string }) {
  const apiKey = Deno.env.get('GEMINI_API_KEY')?.trim()
  const model = Deno.env.get('GEMINI_MODEL')?.trim() || 'gemini-3.5-flash-lite'
  if (!apiKey) throw new RequestError(503, 'Gemini servisi henüz yapılandırılmamış.')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45_000)
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Bu Samsung Digital Wellbeing ekran görüntüsündeki tüm uygulama adlarını ve kullanım sürelerini dakika cinsinden çıkar. Her uygulamayı dahil et.' }, { inline_data: { mime_type: image.mimeType, data: image.data } }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: { type: 'ARRAY', maxItems: 200, items: { type: 'OBJECT', properties: { app: { type: 'STRING' }, minutes: { type: 'INTEGER', minimum: 1, maximum: 1440 } }, required: ['app', 'minutes'] } },
        },
      }),
    })
    const result = await response.json().catch(() => null) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } } | null
    if (!response.ok) {
      if (response.status === 429) throw new RequestError(429, 'Gemini kotası doldu. Bir süre sonra tekrar dene.')
      throw new RequestError(response.status >= 500 ? 502 : 400, result?.error?.message?.slice(0, 240) || 'Gemini isteği başarısız oldu.')
    }
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof text !== 'string') throw new RequestError(502, 'Gemini geçerli bir cevap döndürmedi.')
    try { return validateEntries(JSON.parse(text)) }
    catch (error) { if (error instanceof RequestError) throw error; throw new RequestError(502, 'Gemini cevabı JSON olarak okunamadı.') }
  } catch (error) {
    if (error instanceof RequestError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw new RequestError(504, 'Gemini isteği zaman aşımına uğradı.')
    throw new RequestError(502, 'Gemini servisine ulaşılamadı.')
  } finally { clearTimeout(timer) }
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') return Response.json({ error: 'Method Not Allowed' }, { status: 405 })
    try {
      const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
      if (!contentType.startsWith('application/json')) throw new RequestError(415, 'Content-Type application/json olmalı.')
      const image = validateImagePayload(await request.json())
      const { data: quotaClaimed, error: quotaError } = await context.supabase.rpc('claim_ai_daily_quota', { daily_limit: 5 })
      if (quotaError) throw new RequestError(503, 'AI kullanım kotası kontrol edilemedi.')
      if (!quotaClaimed) throw new RequestError(429, 'Bugünkü beş ekran görüntüsü analiz hakkın doldu.')
      return Response.json({ entries: await callGemini(image) })
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 400
      const message = error instanceof Error ? error.message : 'İstek işlenemedi.'
      return Response.json({ error: message }, { status })
    }
  }),
}
