import { expect, test, type Page } from '@playwright/test'

async function start(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Multiplife’ı başlat' }).click()
  await expect(page.getByRole('dialog', { name: 'Multiplife ilk kurulumu' })).toBeHidden()
}
async function addTask(page: Page, text: string) {
  await page.getByLabel('Yeni önemli iş').fill(text)
  await page.locator('.plan-add').getByRole('button', { name: 'Ekle', exact: true }).click()
  await expect(page.locator('.plan-item').filter({ hasText: text })).toBeVisible()
}
async function payload(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('momentum-main-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try { return await new Promise<string>((resolve, reject) => { const request = db.transaction('app-state').objectStore('app-state').get('current'); request.onsuccess = () => resolve(request.result.payload); request.onerror = () => reject(request.error) }) }
    finally { db.close() }
  })
}

test('todos exceed three, complete/reopen, survive reload and validate as a backup', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await start(page)
  for (let i = 1; i <= 6; i++) await addTask(page, `Çalışma işi ${i}`)
  await expect(page.locator('.plan-item')).toHaveCount(6)
  const first = page.locator('.plan-item').filter({ hasText: 'Çalışma işi 1' })
  await first.getByRole('button', { name: 'Çalışma işi 1 tamamlandı' }).click()
  await expect(first).toHaveClass(/plan-complete/)
  await expect(first.locator('.todo-text')).toHaveCSS('text-decoration-line', 'line-through')
  await expect(page.locator('.todo-card .date-pill')).toHaveText('1/6 tamamlandı')
  await page.reload()
  await expect(first).toHaveClass(/plan-complete/)
  await expect(page.locator('.plan-item')).toHaveCount(6)
  await first.getByRole('button', { name: 'Çalışma işi 1 tamamlandı' }).click()
  await expect(first).not.toHaveClass(/plan-complete/)
  await page.getByRole('button', { name: /^Gününü tasarla/ }).click()
  await expect(page.getByLabel('Yeni önemli iş')).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const editButton = first.getByRole('button', { name: 'Düzenle' })
  await editButton.scrollIntoViewIfNeeded()
  const rowBounds = await first.boundingBox(), buttonBounds = await editButton.boundingBox()
  expect(buttonBounds!.y + buttonBounds!.height).toBeLessThanOrEqual(rowBounds!.y + rowBounds!.height)
  await page.locator('.todo-card').screenshot({ path: testInfo.outputPath('todos.png'), animations: 'disabled' })
  const state = JSON.parse(await payload(page))
  await page.getByRole('button', { name: /Senkronizasyon:/ }).click()
  const data = page.getByRole('dialog', { name: 'Veri yönetimi' })
  await data.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name: 'todo-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'momentum-backup', version: 3, exportedAt: new Date().toISOString(), data: state })) })
  await expect(data.locator('.import-valid')).toHaveText('Geçerli')
  await expect(data.locator('.import-summary')).toContainText('6')
})

test('a todo starts linked work, reload preserves it and today records edit its saved duration', async ({ page }) => {
  await start(page)
  await addTask(page, 'Algoritma sorularını çöz')
  const task = page.locator('.plan-item').filter({ hasText: 'Algoritma sorularını çöz' })
  const category = task.getByRole('combobox')
  const categoryId = await category.locator('option').nth(1).getAttribute('value')
  await category.selectOption(categoryId!)
  await expect(category).toHaveValue(categoryId!)
  await task.getByRole('button', { name: /Bu işe çalış/ }).click()
  const active = await page.evaluate(() => JSON.parse(localStorage.getItem('momentum-active-focus-v1')!))
  expect(active.taskId).toBeTruthy()
  expect(active.intention).toBe('Algoritma sorularını çöz')
  expect(JSON.parse(await payload(page)).focusCategories.find((item: { id: string }) => item.id === categoryId).title).toBe(active.title)
  await expect(task.getByRole('button', { name: /Oturum açık/ })).toBeDisabled()
  await expect(page.locator('.time-display strong')).toHaveText('0 dk')
  // Simulate two measured minutes, then reload through the real active-session validator.
  await page.evaluate(() => {
    const active = JSON.parse(localStorage.getItem('momentum-active-focus-v1')!)
    const endedAt = new Date().toISOString(), startedAt = new Date(Date.now() - 120000).toISOString()
    localStorage.setItem('momentum-active-focus-v1', JSON.stringify({ ...active, startedAt, status: 'paused', segments: [{ startedAt, endedAt }] }))
  })
  await page.reload()
  await expect(page.getByRole('timer', { name: 'Geçen odak süresi' })).toHaveText('02:00')
  await page.getByRole('button', { name: 'Kaydet ve bitir', exact: true }).click()
  await page.getByRole('button', { name: 'Şimdi değil', exact: true }).click()
  await expect(task).toContainText('2 dk kayıtlı çalışma')
  const record = page.locator('.today-record').filter({ hasText: 'Algoritma sorularını çöz' })
  await record.getByRole('button', { name: 'Düzenle' }).click()
  await record.getByLabel(active.title + ' dakika').fill('5')
  await record.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await expect(task).toContainText('5 dk kayıtlı çalışma')
  await expect(page.locator('.time-display strong')).toHaveText('5 dk')
  await page.reload()
  const state = JSON.parse(await payload(page))
  expect(state.sessions[0].taskId).toBe(active.taskId)
  expect(state.sessions[0].seconds).toBe(300)
  expect(state.sessions[0].source).toBe('manual')
  await expect(task).toContainText('5 dk kayıtlı çalışma')
})

test('one report selector filters every analysis and leaves only one quick entry visible', async ({ page, isMobile }, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-09-14T12:00:00Z'))
  await start(page)
  await expect(page.locator('.quick-capture-trigger')).toBeVisible({ visible: !isMobile })
  await expect(page.locator('.universal-capture-button')).toBeVisible({ visible: isMobile })
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('momentum-main-v1', 1); request.onsuccess = () => resolve(request.result) })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('app-state', 'readwrite'), store = tx.objectStore('app-state'), request = store.get('current')
      request.onsuccess = () => {
        const record = request.result, state = JSON.parse(record.payload)
        state.settings.dailyFocusMinutes = 120
        state.sessions = [
          { id: 'today', title: 'Coding', area: 'Kariyer', seconds: 7200, date: '2026-09-14', startedAt: '2026-09-14T08:00:00Z', source: 'manual' },
          { id: 'month', title: 'Kitap', area: 'Bilgi', seconds: 3600, date: '2026-09-02', startedAt: '2026-09-02T08:00:00Z', source: 'manual' },
          { id: 'previous', title: 'Eski konu', area: 'Bilgi', seconds: 14400, date: '2026-08-31', startedAt: '2026-08-31T08:00:00Z', source: 'manual' },
        ]
        state.screenTimeEntries = [{ id: 'screen', app: 'Instagram', minutes: 30, date: '2026-09-02', source: 'manual', kind: 'passive', createdAt: '2026-09-02T20:00:00Z' }]
        store.put({ ...record, payload: JSON.stringify(state) })
      }
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error)
    }); db.close()
  })
  await page.reload()
  await expect(page.locator('.work-streak-number strong')).toHaveText('1')
  await page.getByRole('navigation', { name: 'Ana bölümler' }).getByRole('button', { name: 'İlerleme', exact: true }).click()
  await expect(page.locator('.productivity-overview .productivity-metrics').first()).toContainText('2 sa')
  await expect(page.locator('.period-work-bars button')).toHaveCount(1)
  await expect(page.locator('.work-detail')).not.toContainText('Kitap')
  await page.getByRole('group', { name: 'Rapor dönemi' }).getByRole('button', { name: 'Aylık' }).click()
  await expect(page.locator('.productivity-overview .productivity-metrics').first()).toContainText('3 sa')
  await expect(page.locator('.period-work-bars button')).toHaveCount(14)
  await expect(page.locator('.work-detail')).toContainText('Kitap')
  await expect(page.locator('.work-detail')).not.toContainText('Eski konu')
  await page.locator('.report-details > summary').click()
  await expect(page.locator('.app-comparison')).toContainText('30 dk')
  await page.getByRole('button', { name: 'Önceki ay', exact: true }).click()
  await expect(page.locator('.period-work-bars button')).toHaveCount(31)
  await expect(page.locator('.work-detail')).toContainText('Eski konu')
  await expect(page.locator('.work-detail')).not.toContainText('Kitap')
  await expect(page.locator('.app-comparison-list li')).toHaveCount(0)
  await page.locator('.report-details > summary').click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('.work-hours-card').screenshot({ path: testInfo.outputPath('report.png'), animations: 'disabled' })
})
