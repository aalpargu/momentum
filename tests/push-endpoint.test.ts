import assert from 'node:assert/strict'
import test from 'node:test'
import { validPushEndpoint } from '../supabase/functions/_shared/pushValidation.ts'

test('only browser push providers can be used as server-side notification targets', () => {
  for (const url of ['https://fcm.googleapis.com/fcm/send/token', 'https://fcm.googleapis.com/wp/token', 'https://updates.push.services.mozilla.com/wpush/v2/token', 'https://web.push.apple.com/token', 'https://wns2.notify.windows.com/w/?token=example']) assert.equal(validPushEndpoint(url), true, url)
  for (const url of [null, {}, 'https://127.0.0.1/private', 'https://169.254.169.254/', 'https://[::1]/', 'https://example.test/', 'http://fcm.googleapis.com/', 'https://fcm.googleapis.com.evil.test/', 'https://fcm.googleapis.com@evil.test/', 'https://fcm.googleapis.com:444/', 'https://user:password@fcm.googleapis.com/', 'https://fcm.googleapis.com/#fragment']) assert.equal(validPushEndpoint(url), false, String(url))
})
