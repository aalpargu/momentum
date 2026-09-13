import { expect, test } from '@playwright/test'

async function finishOnboarding(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByRole('dialog', { name: 'Momentum ilk kurulumu' })).toBeVisible()
  await page.getByLabel('Adın').fill('Test Kullanıcısı')
  await page.getByRole('button', { name: /^Yazılımcı/ }).click()
  await page.getByRole('button', { name: 'Momentum’u başlat' }).click()
  await expect(page.getByRole('dialog', { name: 'Momentum ilk kurulumu' })).toBeHidden()
  await expect(page.getByRole('heading', { name: /Merhaba|Günaydın|İyi/ })).toBeVisible()
}

test('onboarding, URL navigation and browser history work', async ({ page }) => {
  await finishOnboarding(page)
  await page.getByRole('button', { name: 'Alışkanlıklar' }).click()
  await expect(page).toHaveURL(/tab=habits/)
  await expect(page.getByRole('heading', { name: 'Alışkanlıkların' })).toBeVisible()
  await page.goBack()
  await expect(page).not.toHaveURL(/tab=/)
})

test('universal quick capture saves a focus session', async ({ page }) => {
  await finishOnboarding(page)
  await page.keyboard.press('Control+K')
  const captureDialog = page.getByRole('dialog', { name: 'Hızlı odak kaydı' })
  await expect(captureDialog).toBeVisible()
  await captureDialog.getByLabel('Hızlı kayıt').fill('25 dk kodlama')
  await captureDialog.getByRole('button', { name: 'Kaydı ekle' }).click()
  await expect(captureDialog).toBeHidden()
  await expect(page.getByText('25 dk', { exact: true }).first()).toBeVisible()
})

test('a completed focus round can start a timed break', async ({ page }) => {
  await finishOnboarding(page)
  await page.evaluate(() => {
    const startedAt = new Date(Date.now() - 2_000).toISOString()
    localStorage.setItem('momentum-active-focus-v1', JSON.stringify({
      version: 1,
      id: 'e2e-focus-cycle',
      title: 'Geliştirme',
      area: 'Kariyer',
      startedAt,
      status: 'running',
      segments: [{ startedAt }],
      targetSeconds: 1,
      breakMinutes: 1,
      rounds: 2,
      currentRound: 1,
    }))
  })
  await page.reload()
  await page.getByRole('button', { name: 'Molayı başlat' }).click()
  await expect(page.getByText('Mola — nefes al ve hareket et')).toBeVisible()
  await page.getByRole('button', { name: 'Tam ekran odak' }).click()
  const focusDialog = page.getByRole('dialog', { name: 'Tam ekran odak' })
  await expect(focusDialog.getByRole('timer', { name: 'Kalan mola süresi' })).toBeVisible()
  await expect(focusDialog.getByRole('button', { name: 'Molayı atla' })).toBeVisible()
})

test('a deleted priority can be restored from the local trash', async ({ page }) => {
  await finishOnboarding(page)
  await page.getByLabel('Yeni önemli iş').fill('Geri dönüştürülecek iş')
  await page.getByRole('button', { name: 'Ekle', exact: true }).click()
  const planItem = page.locator('.plan-item').filter({ hasText: 'Geri dönüştürülecek iş' })
  await expect(planItem).toBeVisible()
  await planItem.getByRole('button', { name: 'Sil' }).click()
  await expect(planItem).toBeHidden()

  await page.getByRole('button', { name: /Senkronizasyon:/ }).click()
  const dataDialog = page.getByRole('dialog', { name: 'Veri yönetimi' })
  await expect(dataDialog.getByRole('heading', { name: 'Silinen kayıtları geri al' })).toBeVisible()
  const trashItem = dataDialog.locator('.trash-list > div').filter({ hasText: 'Geri dönüştürülecek iş' })
  await trashItem.getByRole('button', { name: 'Geri yükle' }).click()
  await expect(dataDialog.getByText('Geri dönüştürülecek iş geri yüklendi.')).toBeVisible()
  await dataDialog.getByRole('button', { name: 'Kapat' }).click()
  await expect(page.locator('.plan-item').filter({ hasText: 'Geri dönüştürülecek iş' })).toBeVisible()
})

test('all lazy-loaded sections and settings open without browser errors', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  await finishOnboarding(page)

  const sections = [
    { tab: 'Alışkanlıklar', heading: 'Alışkanlıkların' },
    { tab: 'Günlük', heading: 'Günlük ve ekran süresi' },
    { tab: 'İlerleme', heading: 'Uzun vadeli ilerlemen' },
    { tab: 'Takvim', heading: 'Haftanı tasarla' },
  ]
  for (const section of sections) {
    await page.getByRole('button', { name: section.tab, exact: true }).click()
    await expect(page.getByRole('heading', { name: section.heading })).toBeVisible()
  }

  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click()
  const customizeDialog = page.getByRole('dialog', { name: 'Momentum ayarları' })
  await expect(customizeDialog).toBeVisible()
  await customizeDialog.getByRole('tab', { name: 'Hatırlatıcılar', exact: true }).click()
  await expect(customizeDialog.getByText('Uygulama kapalıyken hatırlat', { exact: true })).toBeVisible()
  await customizeDialog.getByRole('tab', { name: 'Profil', exact: true }).click()
  await customizeDialog.getByRole('button', { name: /Yedekleme, içe aktarma/ }).click()
  const dataDialog = page.getByRole('dialog', { name: 'Veri yönetimi' })
  await expect(dataDialog).toBeVisible()
  await expect(dataDialog.getByText('TXT, Excel veya CSV’den doldur')).toBeVisible()
  await expect(dataDialog.getByRole('heading', { name: 'Bulut klasörüne otomatik JSON' })).toBeVisible()
  expect(browserErrors).toEqual([])
})
