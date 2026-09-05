export const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
export const supabasePublishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()

export const cloudConfigured = /^https:\/\/.+\.supabase\.co\/?$/i.test(supabaseUrl)
  && (supabasePublishableKey.startsWith('sb_publishable_') || supabasePublishableKey.startsWith('eyJ'))
  && !supabaseUrl.includes('your-project')
  && !supabasePublishableKey.includes('your_key')
