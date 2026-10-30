import { expect, test, type Page } from '@playwright/test'

async function start(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Momentum’u başlat' }).click()
  await expect(page.getByRole('dialog', { name: 'Momentum ilk kurulumu' })).toBeHidden()
}
async function plan(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Yeni önemli iş' }).fill(text)
  await page.getByRole('button', { name: 'Ekle', exact: true }).click()
}
async function readMain(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('momentum-main-v1', 1)
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<{ payload: string; revision?: string }>((resolve, reject) => {
        const request = db.transaction('app-state').objectStore('app-state').get('current')
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
      })
    } finally { db.close() }
  })
}

test('a nearly completed goal is never rounded up to completed', async ({ page }) => {
  await start(page)
  await page.getByRole('navigation', { name: 'Ana bölümler' }).getByRole('button', { name: 'İlerleme', exact: true }).click()
  await page.getByRole('button', { name: '+ Yeni hedef', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Yeni hedef oluştur' })
  await dialog.getByLabel('Hedef adı', { exact: true }).fill('Gerçek tamamlanma')
  await dialog.getByLabel(/^Hedef değer/).fill('100')
  await dialog.getByLabel(/^Başlangıç/).fill('99.6')
  await dialog.getByRole('button', { name: 'Hedefi oluştur', exact: true }).click()
  const card = page.locator('.goal-card').filter({ hasText: 'Gerçek tamamlanma' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('%99 tamamlandı')
  await expect(card).not.toHaveClass(/goal-complete/)
  await card.getByLabel('Gerçek tamamlanma mevcut değer').fill('100')
  await card.getByRole('button', { name: 'Güncelle', exact: true }).click()
  await expect(card).toHaveClass(/goal-complete/)
  await expect(card).toContainText('Tamamlandı ✓')
})

test('failed save keeps the durable state and does not create a conflicting fallback', async ({ page }) => {
  await start(page)
  const before = await readMain(page)
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      if (this.name === 'momentum-main-v1' && args[1] === 'readwrite') throw new DOMException('Test quota exceeded', 'QuotaExceededError')
      return original.apply(this, args)
    }
  })
  await plan(page, 'Kaybolmaması gereken taslak')
  await expect(page.locator('.save-toast.error')).toContainText('Kaydedilemedi')
  await expect(page.getByRole('textbox', { name: 'Yeni önemli iş' })).toHaveValue('Kaybolmaması gereken taslak')
  expect(await readMain(page)).toEqual(before)
  expect(await page.evaluate(() => localStorage.getItem('momentum-v1'))).toBeNull()
})

test('accidentally discarded work can be restored paused without adding waiting time', async ({ page }) => {
  await start(page)
  await page.evaluate(() => {
    const startedAt = new Date(Date.now() - 3600000).toISOString()
    const endedAt = new Date().toISOString()
    localStorage.setItem('momentum-active-focus-v1', JSON.stringify({ version: 1, id: 'restore-discard', title: 'Kodlama', area: 'Kariyer', startedAt, status: 'paused', segments: [{ startedAt, endedAt }] }))
  })
  await page.reload()
  await page.getByRole('button', { name: 'Kaydetmeden sıfırla', exact: true }).click()
  await expect(page.locator('.time-display strong')).toHaveText('0 dk')
  await page.getByRole('button', { name: 'Sıfırlanan oturumu geri getir' }).click()
  await expect(page.getByRole('timer', { name: 'Geçen odak süresi' })).toHaveText('60:00')
  await expect(page.getByRole('button', { name: 'Devam et', exact: true })).toBeVisible()
  expect(JSON.parse((await readMain(page)).payload).sessions).toHaveLength(0)
})

test('stale tab cannot overwrite work saved in another tab', async ({ page, context }) => {
  await start(page)
  const second = await context.newPage()
  await second.goto('/')
  await expect(second.getByRole('textbox', { name: 'Yeni önemli iş' })).toBeVisible()
  await plan(page, 'Birinci sekmenin işi')
  await expect(page.getByRole('button', { name: 'Birinci sekmenin işi tamamlandı' })).toBeVisible()
  await plan(second, 'İkinci sekmenin işi')
  await expect(second.getByText(/Başka bir sekmede kayıtlar değişti/)).toBeVisible()
  const before = await readMain(page)
  expect(before.payload).toContain('Birinci sekmenin işi')
  expect(before.payload).not.toContain('İkinci sekmenin işi')
  await second.reload()
  await expect(second.getByRole('button', { name: 'Birinci sekmenin işi tamamlandı' })).toBeVisible()
  await plan(second, 'İkinci sekmenin işi')
  await expect(second.getByRole('button', { name: 'İkinci sekmenin işi tamamlandı' })).toBeVisible()
  expect((await readMain(second)).payload).toContain('Birinci sekmenin işi')
})

test('read failure never overwrites the durable database or pretends to start fresh', async ({ page, context }) => {
  await start(page)
  await plan(page, 'Korunması gereken çalışma')
  await expect(page.getByRole('button', { name: 'Korunması gereken çalışma tamamlandı' })).toBeVisible()
  const before = await readMain(page)
  const failed = await context.newPage()
  await failed.addInitScript(() => {
    const original = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (name, version) {
      if (name === 'momentum-main-v1') throw new Error('Deneme: veri deposu okunamıyor')
      return original.call(this, name, version)
    }
  })
  await failed.goto('/')
  await expect(failed.getByRole('button', { name: 'Tekrar dene', exact: true })).toBeVisible()
  await expect(failed.getByRole('button', { name: 'Momentum’u başlat' })).toHaveCount(0)
  expect(await readMain(page)).toEqual(before)
})

test('recovery prefers the latest validated snapshot over the old migration backup', async ({ page }) => {
  await start(page)
  await plan(page, 'En yeni çalışma')
  await expect(page.getByRole('button', { name: 'En yeni çalışma tamamlandı' })).toBeVisible()
  const current = await readMain(page)
  await page.evaluate(async payload => {
    const old = JSON.parse(payload); old.dailyPlans = {}
    localStorage.setItem('momentum-localstorage-migration-backup-v1', JSON.stringify(old))
    const write = async (name: string, store: string, value: object) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, 1)
        request.onupgradeneeded = () => request.result.createObjectStore(store, store === 'snapshots' ? { keyPath: 'id', autoIncrement: true } : { keyPath: 'key' })
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value)
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error)
      }); db.close()
    }
    await write('momentum-recovery-v1', 'snapshots', { createdAt: new Date().toISOString(), payload })
    await write('momentum-main-v1', 'app-state', { key: 'current', updatedAt: new Date().toISOString(), payload: '{broken' })
  }, current.payload)
  await page.reload()
  await expect(page.getByRole('button', { name: 'En yeni çalışma tamamlandı' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('momentum-corrupt-state-v1'))).toBe('{broken')
})

test('expired break waits for the user and starts the next round from actual elapsed focus', async ({ page }) => {
  await start(page)
  await page.evaluate(() => {
    const startedAt = new Date(Date.now() - 36 * 60000).toISOString()
    const endedAt = new Date(Date.now() - 6 * 60000).toISOString()
    localStorage.setItem('momentum-active-focus-v1', JSON.stringify({ version: 1, id: 'late-break', title: 'Kodlama', area: 'Kariyer', startedAt, status: 'paused', segments: [{ startedAt, endedAt }], targetSeconds: 1500, rounds: 4, currentRound: 1, breakMinutes: 5, breakEndsAt: new Date(Date.now() - 60000).toISOString() }))
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sıradaki tura başla' })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('momentum-active-focus-v1')!).status)).toBe('paused')
  await page.getByRole('button', { name: 'Sıradaki tura başla' }).click()
  await expect(page.locator('.dial-status')).toContainText('Tur 2/4 · %0')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('momentum-active-focus-v1')!).roundStartSeconds)).toBe(1800)
  await expect(page.getByRole('button', { name: 'Molayı başlat' })).toHaveCount(0)
})

test('overshooting round one does not shorten round two; old paused sessions survive reload', async ({ page }) => {
  await start(page)
  await page.evaluate(() => {
    const startedAt = new Date(Date.now() - 10 * 86400000).toISOString()
    const endedAt = new Date(Date.parse(startedAt) + 3000000).toISOString()
    localStorage.setItem('momentum-active-focus-v1', JSON.stringify({ version: 1, id: 'old-paused', title: 'Kodlama', area: 'Kariyer', startedAt, status: 'paused', segments: [{ startedAt, endedAt }], targetSeconds: 1500, rounds: 4, currentRound: 2, roundStartSeconds: 1800, breakMinutes: 5 }))
  })
  await page.reload()
  await expect(page.getByRole('timer', { name: 'Geçen odak süresi' })).toHaveText('50:00')
  await expect(page.locator('.dial-status')).toContainText('Tur 2/4 · %80')
  await expect(page.getByRole('button', { name: 'Molayı başlat' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Kaydet ve bitir' }).click()
  await expect(page.getByRole('button', { name: 'Kaydet ve bitir' })).toHaveCount(0)
  expect(JSON.parse((await readMain(page)).payload).sessions.reduce((sum: number, s: { seconds: number }) => sum + s.seconds, 0)).toBe(3000)
})

test('six months of daily ten-hour records reload and show honest monthly averages and target chain', async ({ page }) => {
  await start(page)
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('momentum-main-v1', 1); request.onsuccess = () => resolve(request.result) })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('app-state', 'readwrite'); const store = tx.objectStore('app-state'); const request = store.get('current')
      request.onsuccess = () => {
        const record = request.result; const state = JSON.parse(record.payload)
        state.settings.dailyFocusMinutes = 480
        state.sessions = Array.from({ length: 1800 }, (_, i) => {
          const date = new Date(); date.setDate(date.getDate() - Math.floor(i / 10)); date.setHours(12, 0, 0, 0)
          const key = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
          return { id: 'long-use-' + i, date: key, startedAt: date.toISOString(), seconds: 3600, title: 'Kodlama', area: 'Kariyer', source: 'manual' }
        })
        store.put({ ...record, payload: JSON.stringify(state), revision: crypto.randomUUID() })
      }
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error)
    }); db.close()
  })
  await page.reload()
  await expect(page.locator('.time-display strong')).toHaveText('10 sa')
  await expect(page.locator('.work-streak-number strong')).toHaveText('180')
  await page.getByRole('navigation', { name: 'Ana bölümler' }).getByRole('button', { name: 'İlerleme', exact: true }).click()
  await page.getByRole('button', { name: 'Aylık', exact: true }).click()
  await expect(page.locator('.productivity-overview .productivity-metrics > div').nth(1)).toContainText('10 sa')
  await expect(page.locator('.signal-score')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
