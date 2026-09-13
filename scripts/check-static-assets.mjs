import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDirectory = join(root, 'public')
const manifest = JSON.parse(readFileSync(join(publicDirectory, 'manifest.webmanifest'), 'utf8'))
const viteConfig = readFileSync(join(root, 'vite.config.ts'), 'utf8')

assert.equal(manifest.display, 'standalone', 'PWA bağımsız uygulama olarak açılmalı.')
assert.equal(manifest.lang, 'tr', 'Manifest dili Türkçe olmalı.')
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 5, 'Manifest gerekli ikon çeşitlerini içermeli.')

for (const icon of manifest.icons) {
  assert.equal(typeof icon.src, 'string', 'Her manifest ikonunun yolu olmalı.')
  assert.ok(icon.src.startsWith('/') && !icon.src.includes('..'), `Güvenli olmayan ikon yolu: ${icon.src}`)
  assert.ok(existsSync(join(publicDirectory, icon.src.slice(1))), `Manifest ikonu eksik: ${icon.src}`)
}

for (const size of ['192x192', '512x512']) {
  assert.ok(manifest.icons.some(icon => icon.sizes === size && icon.purpose === 'maskable'), `${size} maskable ikon eksik.`)
}

for (const file of ['privacy.html', 'terms.html', 'support.html']) {
  assert.ok(existsSync(join(publicDirectory, file)), `Son kullanıcı belgesi eksik: ${file}`)
}

assert.equal(existsSync(join(publicDirectory, 'sw.js')), false, 'Eski statik service worker tekrar eklenmemeli; build sürümlü dosyayı üretir.')
assert.match(viteConfig, /addEventListener\('push'/, 'Service worker arka plan push bildirimlerini işlemeli.')
assert.match(viteConfig, /addEventListener\('notificationclick'/, 'Push bildirimi uygulamaya geri dönmeli.')
console.log('PWA ikonları, manifest, push olayları ve son kullanıcı belgeleri doğrulandı.')
