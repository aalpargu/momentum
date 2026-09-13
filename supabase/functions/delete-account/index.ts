import { withSupabase } from 'npm:@supabase/server@^1'
import { createClient } from 'npm:@supabase/supabase-js@^2'

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    if (request.method !== 'POST') return Response.json({ error: 'Method Not Allowed' }, { status: 405 })
    const { data, error } = await context.supabase.auth.getUser()
    if (error || !data.user) return Response.json({ error: 'Oturum doğrulanamadı.' }, { status: 401 })
    const url = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceRoleKey) return Response.json({ error: 'Hesap silme servisi yapılandırılmamış.' }, { status: 503 })
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const result = await admin.auth.admin.deleteUser(data.user.id)
    if (result.error) return Response.json({ error: 'Hesap silinemedi.' }, { status: 500 })
    return Response.json({ deleted: true })
  }),
}
