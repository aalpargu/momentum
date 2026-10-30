import { expect, test } from '@playwright/test'

test('production shell reloads offline with lazy sections and legal documents', async ({ page, context }) => {
  test.skip(process.env.MOMENTUM_E2E_PRODUCTION !== '1', 'Requires the production preview')
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Momentum’u başlat' }).click()
  await expect(page.getByRole('dialog', { name: 'Momentum ilk kurulumu' })).toBeHidden()
  await page.getByRole('textbox', { name: 'Yeni önemli iş' }).fill('Çevrimdışı kalan iş')
  await page.getByRole('button', { name: 'Ekle', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Çevrimdışı kalan iş tamamlandı' })).toBeVisible()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Çevrimdışı kalan iş tamamlandı' })).toBeVisible()
  for (const section of ['Alışkanlıklar', 'Günlük', 'İlerleme', 'Takvim']) {
    await page.getByRole('navigation', { name: 'Ana bölümler' }).getByRole('button', { name: section, exact: true }).click()
    await expect(page.locator('main h1')).toBeVisible()
  }
  await page.goto('/privacy.html')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Gizlilik')
  expect(errors).toEqual([])
})
