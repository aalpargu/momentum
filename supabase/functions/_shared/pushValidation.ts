/** Only browser push providers may receive server-side Web Push requests. */
export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false
    return ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname)
      || url.hostname.endsWith('.notify.windows.com')
  } catch { return false }
}
