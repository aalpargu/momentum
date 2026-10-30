import { expect, test } from '@playwright/test'

test('a late cloud upload cannot relink an account after an auth sign-out event', async ({ page }) => {
  test.skip(process.env.MULTIPLIFE_E2E_PRODUCTION === '1', 'Uses an isolated mock cloud module in the dev server')
  await page.route('**/src/lib/cloudConfig.ts*', route => route.fulfill({ contentType: 'text/javascript', body: 'export const cloudConfigured=true; export const supabaseUrl="https://example.supabase.co"; export const supabasePublishableKey="test";' }))
  await page.route('**/src/lib/cloud.ts*', route => route.fulfill({ contentType: 'text/javascript', body: `
    export class CloudConflictError extends Error {}
    export const getCloudAccount = async () => ({id:'test-account', email:'audit@example.test'});
    export const observeCloudAccount = listener => { globalThis.auditSignOut = () => listener(null); return () => {}; };
    export const loadCloudState = async () => null;
    export const saveCloudState = (userId, payload) => new Promise(resolve => { globalThis.auditFinishCloudWrite = () => resolve({userId,payload,revision:1,schemaVersion:2,updatedAt:new Date().toISOString()}); });
  ` }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Multiplife’ı başlat' }).click()
  await expect(page.getByRole('dialog', { name: 'Multiplife ilk kurulumu' })).toBeHidden()
  await page.getByRole('button', { name: /Senkronizasyon:/ }).click()
  await page.getByRole('button', { name: 'Bu cihazı buluta aktar' }).click()
  await expect(page.getByText('Bu cihazdaki veriler buluta yazılıyor…')).toBeVisible()
  await page.evaluate(() => (window as unknown as { auditSignOut: () => void }).auditSignOut())
  await expect(page.getByText('Hesapsız, yalnızca bu cihazda kullanıyorsun.')).toBeVisible()
  await page.evaluate(() => (window as unknown as { auditFinishCloudWrite: () => void }).auditFinishCloudWrite())
  await expect(page.getByText('Hesapsız, yalnızca bu cihazda kullanıyorsun.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('momentum-cloud-link-v1'))).toBeNull()
})
