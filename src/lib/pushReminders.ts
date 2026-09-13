import type { ReminderSettings } from './domain'

export type BackgroundReminderState = {
  supported: boolean
  subscribed: boolean
  permission: NotificationPermission | 'unsupported'
}

function urlBase64Bytes(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, character => character.charCodeAt(0))
}

export async function backgroundReminderState(): Promise<BackgroundReminderState> {
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!supported) return { supported: false, subscribed: false, permission: 'unsupported' }
  const registration = await navigator.serviceWorker.ready
  return { supported: true, subscribed: Boolean(await registration.pushManager.getSubscription()), permission: Notification.permission }
}

function subscriptionValues(subscription: PushSubscription) {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Tarayıcı push aboneliğini tamamlamadı.')
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }
}

export async function enableBackgroundReminders(preferences: ReminderSettings) {
  const state = await backgroundReminderState()
  if (!state.supported) throw new Error('Bu tarayıcı arka plan bildirimlerini desteklemiyor.')
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Bildirim izni verilmedi.')
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    const { getPushPublicKey } = await import('./cloud')
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64Bytes(await getPushPublicKey()) })
  }
  const { registerPushSubscription } = await import('./cloud')
  await registerPushSubscription({ ...subscriptionValues(subscription), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, preferences })
  return backgroundReminderState()
}

export async function disableBackgroundReminders() {
  const state = await backgroundReminderState()
  if (!state.supported) return state
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    const { removePushSubscription } = await import('./cloud')
    await removePushSubscription(subscription.endpoint)
    await subscription.unsubscribe()
  }
  return backgroundReminderState()
}

export async function syncBackgroundReminderPreferences(preferences: ReminderSettings) {
  const state = await backgroundReminderState()
  if (!state.supported || !state.subscribed) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  const { updatePushReminderPreferences } = await import('./cloud')
  await updatePushReminderPreferences(subscription.endpoint, Intl.DateTimeFormat().resolvedOptions().timeZone, preferences)
}
