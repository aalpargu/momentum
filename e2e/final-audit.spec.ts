import { expect, test, type Page } from '@playwright/test'

async function start(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Multiplife’ı başlat' }).click()
  await expect(page.getByRole('dialog', { name: 'Multiplife ilk kurulumu' })).toBeHidden()
}

async function readPayload(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('momentum-main-v1', 1); request.onsuccess = () => resolve(request.result) })
    try { return await new Promise<string>(resolve => { const request = db.transaction('app-state').objectStore('app-state').get('current'); request.onsuccess = () => resolve(request.result.payload) }) }
    finally { db.close() }
  })
}

test('Escape dismisses only the top modal and restores focus and scroll lock', async ({ page }) => {
  await start(page)
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Multiplife ayarları' })
  await expect(settings).toBeVisible()
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Hızlı odak kaydı' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Hızlı odak kaydı' })).toBeHidden()
  await expect(settings).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden')
  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
})

test('unsupported Notification constructor cannot crash a completed focus round', async ({ page }) => {
  await start(page)
  await page.evaluate(() => {
    const startedAt = new Date(Date.now() - 2000).toISOString()
    localStorage.setItem('momentum-active-focus-v1', JSON.stringify({ version: 1, id: 'notification-failure', title: 'Çalışma', area: 'Kariyer', startedAt, status: 'running', segments: [{ startedAt }], targetSeconds: 1, rounds: 2, currentRound: 1 }))
  })
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Notification', { configurable: true, value: class {
      static permission = 'granted'
      constructor() { throw new TypeError('Illegal constructor. Use showNotification instead.') }
    } })
  })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Molayı başlat' })).toBeVisible()
  await page.getByRole('button', { name: 'Molayı başlat' }).click()
  await expect(page.getByText('Mola — nefes al ve hareket et')).toBeVisible()
  expect(errors).toEqual([])
})

test('focusing an outdated tab never overwrites the latest external backup', async ({ page, context }) => {
  const writes: string[] = []
  await context.route('**/api/backups/google-drive', async route => {
    if (route.request().method() === 'POST') writes.push(JSON.parse(route.request().postData()!).backup)
    await route.fulfill({ json: { available: true, directoryName: 'Test backup' } })
  })
  await start(page)
  const stale = await context.newPage()
  await stale.goto('/')
  await expect(stale.getByRole('textbox', { name: 'Yeni önemli iş' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Yeni önemli iş' }).fill('En son kalıcı iş')
  await page.getByRole('button', { name: 'Ekle', exact: true }).click()
  await expect(page.getByRole('button', { name: 'En son kalıcı iş tamamlandı' })).toBeVisible()
  await expect.poll(() => writes.at(-1)).toContain('En son kalıcı iş')
  const previousCount = writes.length
  await stale.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => writes.length).toBeGreaterThan(previousCount)
  expect(writes.at(-1)).toContain('En son kalıcı iş')
  // Reading for backup must not adopt the new revision for the stale UI.
  await stale.getByRole('textbox', { name: 'Yeni önemli iş' }).fill('Eski sekmeden yazım')
  await stale.getByRole('button', { name: 'Ekle', exact: true }).click()
  await expect(stale.getByText(/Başka bir sekmede kayıtlar değişti/)).toBeVisible()
})

test('valid legacy recovery remains usable when the snapshot database is unavailable', async ({ page }) => {
  await start(page)
  const payload = await readPayload(page)
  await page.evaluate(async value => {
    const state = JSON.parse(value); state.settings.name = 'Kurtarılan kullanıcı'
    localStorage.setItem('momentum-localstorage-migration-backup-v1', JSON.stringify(state))
    await new Promise<void>(resolve => {
      const request = indexedDB.deleteDatabase('momentum-main-v1'); request.onsuccess = () => resolve()
    })
  }, payload)
  await page.addInitScript(() => {
    const original = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (name, version) {
      if (name === 'momentum-recovery-v1') throw new Error('Recovery store unavailable')
      return original.call(this, name, version)
    }
  })
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Yeni önemli iş' })).toBeVisible()
  expect(JSON.parse(await readPayload(page)).settings.name).toBe('Kurtarılan kullanıcı')
})

test('fallback trash records remain visible after IndexedDB becomes available again', async ({ page }) => {
  await start(page)
  await page.getByRole('textbox', { name: 'Yeni önemli iş' }).fill('Geçici depodan kurtar')
  await page.getByRole('button', { name: 'Ekle', exact: true }).click()
  const item = page.locator('.plan-item').filter({ hasText: 'Geçici depodan kurtar' })
  await expect(item).toBeVisible()
  await page.evaluate(() => {
    const original = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (name, version) {
      if (name === 'momentum-trash-v1') throw new Error('Trash temporarily unavailable')
      return original.call(this, name, version)
    }
  })
  await item.getByRole('button', { name: 'Sil', exact: true }).click()
  await expect(item).toBeHidden()
  await page.reload()
  await page.getByRole('button', { name: /Senkronizasyon:/ }).click()
  const trash = page.locator('.trash-list > div').filter({ hasText: 'Geçici depodan kurtar' })
  await expect(trash).toBeVisible()
  await trash.getByRole('button', { name: 'Geri yükle' }).click()
  await expect(page.getByText('Geçici depodan kurtar geri yüklendi.')).toBeVisible()
})

test('blocked privacy preference storage does not crash the data settings', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = function (key) {
      if (key === 'momentum-analytics-disabled-v1') throw new DOMException('Preference storage blocked', 'SecurityError')
      return original.call(this, key)
    }
  })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await start(page)
  await page.getByRole('button', { name: /Senkronizasyon:/ }).click()
  await expect(page.getByRole('heading', { name: 'Anonim kullanım istatistikleri' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Bu cihazda açık' })).not.toBeChecked()
  expect(errors).toEqual([])
})

test('an update installed before the main UI mounts is still offered', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, 'getRegistration', { configurable: true, value: async () => ({ waiting: { postMessage() {} } }) })
  })
  await start(page)
  await expect(page.getByRole('button', { name: 'Güncelle', exact: true })).toBeVisible()
})
