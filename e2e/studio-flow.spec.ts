import { expect, test, type Page } from '@playwright/test'

async function start(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Multiplife’ı başlat' }).click()
  await expect(page.getByRole('dialog', { name: 'Multiplife ilk kurulumu' })).toBeHidden()
}

test('chosen focus duration survives reload and pause/resume', async ({ page }) => {
  await start(page)
  await page.getByRole('group', { name: 'Oturum süresi' }).getByRole('button', { name: '50 dk', exact: true }).click()
  await expect(page.getByRole('timer', { name: 'Planlanan odak süresi' })).toHaveText('50:00')
  await page.getByRole('button', { name: 'Odak başlat', exact: true }).click()
  await expect(page.getByRole('timer', { name: 'Geçen odak süresi' })).toBeVisible()
  await page.getByRole('button', { name: 'Duraklat', exact: true }).click()
  const pausedTime = await page.getByRole('timer', { name: 'Geçen odak süresi' }).textContent()
  await page.reload()
  await expect(page.getByRole('timer', { name: 'Geçen odak süresi' })).toHaveText(pausedTime!)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('momentum-active-focus-v1')!).targetSeconds)).toBe(3000)
  await page.getByRole('button', { name: 'Devam et', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Duraklat', exact: true })).toBeVisible()
})

test('daily path opens the correct action and manual capture stays available', async ({ page }) => {
  await start(page)
  await page.getByRole('button', { name: /^Gününü tasarla/ }).click()
  await expect(page.getByRole('textbox', { name: 'Yeni önemli iş' })).toBeFocused()
  await page.getByRole('textbox', { name: 'Yeni önemli iş' }).fill('Bugünün tek önceliği')
  await page.getByRole('button', { name: 'Ekle', exact: true }).click()
  await page.getByRole('button', { name: 'Bugünün tek önceliği tamamlandı' }).click()
  await expect(page.getByRole('button', { name: /^Gününü tasarla/ })).toContainText('1/1 iş tamamlandı')
  await page.keyboard.press('Control+k')
  await page.getByRole('textbox', { name: 'Hızlı kayıt', exact: true }).fill('15 dk okuma')
  await page.getByRole('button', { name: 'Kaydı ekle', exact: true }).click()
  await expect(page.locator('.time-display strong')).toHaveText('15 dk')
  await page.getByRole('button', { name: /^Gününü kapat/ }).click()
  await expect(page.getByRole('heading', { name: 'Günlük ve ekran süresi' })).toBeVisible()
})

test('light theme and reduced motion persist with no page overflow', async ({ page }) => {
  await start(page)
  await page.getByRole('button', { name: 'Ayarlar', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Multiplife ayarları' })
  await dialog.getByRole('combobox', { name: 'Tema', exact: true }).selectOption('light')
  await dialog.getByRole('checkbox', { name: /^Hareketi azalt/ }).check()
  await dialog.getByRole('button', { name: 'Profili kaydet' }).click()
  await dialog.getByRole('button', { name: 'Kapat', exact: true }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
  await expect(page.locator('.page-transition')).toHaveCSS('animation-name', 'none')
  for (const name of ['Bugün', 'Alışkanlıklar', 'Günlük', 'İlerleme', 'Takvim']) {
    await page.getByRole('navigation', { name: 'Ana bölümler' }).getByRole('button', { name, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test('focus ring tracks the current round while keeping total elapsed time', async ({ page }) => {
  await start(page)
  await page.evaluate(() => {
    const endedAt = new Date().toISOString()
    const startedAt = new Date(Date.now() - 1_800_000).toISOString()
    localStorage.setItem('momentum-active-focus-v1', JSON.stringify({
      version: 1, id: 'studio-round-two', title: 'Derin çalışma', area: 'Kariyer',
      startedAt, status: 'paused', segments: [{ startedAt, endedAt }],
      targetSeconds: 1500, breakMinutes: 5, rounds: 4, currentRound: 2,
    }))
  })
  await page.reload()
  await expect(page.getByRole('timer', { name: 'Geçen odak süresi' })).toHaveText('30:00')
  await expect(page.locator('.dial-status')).toHaveText('Tur 2/4 · %20 tamamlandı')
  await expect(page.locator('.dial-progress')).toHaveAttribute('stroke-dashoffset', '80')
})

test('quick capture focuses typing and keeps its own preview description', async ({ page }) => {
  await start(page)
  await page.keyboard.press('Control+k')
  await page.getByRole('textbox', { name: 'Hızlı kayıt', exact: true }).fill('15 dk okuma')
  const dialog = page.getByRole('dialog', { name: 'Hızlı odak kaydı' })
  const input = dialog.getByRole('textbox', { name: 'Hızlı kayıt', exact: true })
  await expect(input).toBeFocused()
  await input.fill('50 dk öğrenme')
  const previewId = await input.getAttribute('aria-describedby')
  expect(await page.evaluate(id => {
    const elements = Array.from(document.querySelectorAll('[id]')).filter(element => element.id === id)
    return { count: elements.length, text: elements[0]?.textContent }
  }, previewId)).toEqual({ count: 1, text: expect.stringContaining('50 dk') })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Hızlı kayıt', exact: true })).toBeHidden()
})

for (const mode of ['running', 'paused', 'break'] as const) {
  test(`discard ${mode} focus without changing saved work`, async ({ page }) => {
    await start(page)
    await page.keyboard.press('Control+k')
    const capture = page.getByRole('dialog', { name: 'Hızlı odak kaydı' })
    await capture.getByRole('textbox', { name: 'Hızlı kayıt', exact: true }).fill('15 dk okuma')
    await capture.getByRole('button', { name: 'Kaydı ekle' }).click()
    await expect(capture).toBeHidden()
    await page.evaluate(mode => {
      const startedAt = new Date(Date.now() - 300_000).toISOString()
      localStorage.setItem('momentum-active-focus-v1', JSON.stringify({
        version: 1, id: 'discard-test', title: 'Deneme', area: 'Kariyer', startedAt,
        status: mode === 'running' ? 'running' : 'paused',
        segments: [{ startedAt, ...(mode === 'running' ? {} : { endedAt: new Date().toISOString() }) }],
        targetSeconds: 1500, rounds: 4, currentRound: 1, breakMinutes: 5,
        ...(mode === 'break' ? { breakEndsAt: new Date(Date.now() + 300_000).toISOString() } : {}),
      }))
    }, mode)
    await page.reload()
    if (mode === 'break') {
      await page.getByRole('button', { name: 'Tam ekran odak', exact: true }).click()
      await page.getByRole('dialog', { name: 'Tam ekran odak' }).getByRole('button', { name: 'Kaydetmeden sıfırla', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'Tam ekran odak' })).toBeHidden()
    } else {
      await page.getByRole('button', { name: 'Kaydetmeden sıfırla', exact: true }).click()
    }
    await expect(page.getByRole('button', { name: 'Odak başlat', exact: true })).toBeVisible()
    await expect(page.getByText('Oturum kaydedilmeden sıfırlandı.', { exact: true })).toBeVisible()
    await expect(page.locator('.time-display strong')).toHaveText('15 dk')
    await expect(page.getByRole('dialog', { name: 'Odak oturumu notu' })).toBeHidden()
    expect(await page.evaluate(() => localStorage.getItem('momentum-active-focus-v1'))).toBeNull()
    await page.reload()
    await expect(page.getByRole('timer', { name: 'Planlanan odak süresi' })).toHaveText('25:00')
    await expect(page.locator('.time-display strong')).toHaveText('15 dk')
    await expect(page.locator('.today-records')).not.toContainText('Deneme')
  })
}
