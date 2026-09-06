const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const PORT = Number(process.env.MOMENTUM_PORT || 5173)
const HOST = '127.0.0.1'
const DIST = path.resolve(__dirname, 'dist')
const DIST_PREFIX = `${DIST.toLocaleLowerCase()}${path.sep}`
const DATA_DIR = path.resolve(process.env.MOMENTUM_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Momentum'))
const SECRET_PATH = path.join(DATA_DIR, 'gemini-key.dpapi')
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`])
let cachedGeminiKey = null

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co",
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function sendError(res, status, message, extraHeaders = {}) {
  const body = `${message}\n`
  res.writeHead(status, { ...securityHeaders, ...extraHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' })
  res.end(body)
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' })
  res.end(body)
}

function runDpapi(script, input) {
  const encodedCommand = Buffer.from(script, 'utf16le').toString('base64')
  const result = spawnSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand], { input, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 })
  if (result.error) throw new Error(`Windows güvenli depolama başlatılamadı: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = String(result.stderr || '').replace(/[\r\n]+/g, ' ').slice(0, 240)
    throw new Error(`Windows güvenli depolama işlemi başarısız oldu.${detail ? ` ${detail}` : ''}`)
  }
  return result.stdout.trim()
}

function protectSecret(secret) {
  return runDpapi("Add-Type -AssemblyName System.Security;$value=[Console]::In.ReadToEnd();$bytes=[Text.Encoding]::UTF8.GetBytes($value);$protected=[System.Security.Cryptography.ProtectedData]::Protect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($protected))", secret)
}

function unprotectSecret(encrypted) {
  return runDpapi("Add-Type -AssemblyName System.Security;$value=[Console]::In.ReadToEnd();$bytes=[Convert]::FromBase64String($value);$plain=[System.Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))", encrypted)
}

function saveGeminiKey(key) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const temporaryPath = `${SECRET_PATH}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, protectSecret(key), { encoding: 'utf8', mode: 0o600 })
  try { fs.rmSync(SECRET_PATH, { force: true }); fs.renameSync(temporaryPath, SECRET_PATH) } catch (error) { fs.rmSync(temporaryPath, { force: true }); throw error }
  cachedGeminiKey = key
}

function loadGeminiKey() {
  if (cachedGeminiKey) return cachedGeminiKey
  if (!fs.existsSync(SECRET_PATH)) return null
  const key = unprotectSecret(fs.readFileSync(SECRET_PATH, 'utf8').trim()).trim()
  if (!key) throw new Error('Güvenli depodaki Gemini anahtarı boş.')
  cachedGeminiKey = key
  return key
}

function removeGeminiKey() {
  cachedGeminiKey = null
  fs.rmSync(SECRET_PATH, { force: true })
}

function isInsideDist(candidate) {
  const normalized = path.resolve(candidate).toLocaleLowerCase()
  return normalized === DIST.toLocaleLowerCase() || normalized.startsWith(DIST_PREFIX)
}

function resolveRequestPath(rawUrl) {
  const rawPath = String(rawUrl || '/').split('?')[0]
  let decodedPath
  try { decodedPath = decodeURIComponent(rawPath) } catch { return { error: 400 } }
  if (decodedPath.includes('\0')) return { error: 400 }
  const normalizedForCheck = decodedPath.replace(/\\/g, '/')
  if (normalizedForCheck.split('/').includes('..')) return { error: 403 }
  const relativePath = normalizedForCheck.replace(/^\/+/, '') || 'index.html'
  const candidate = path.resolve(DIST, relativePath)
  if (!isInsideDist(candidate)) return { error: 403 }
  return { candidate, relativePath }
}

function selectFile(req, resolved) {
  if (fs.existsSync(resolved.candidate) && fs.statSync(resolved.candidate).isFile()) return resolved.candidate
  const extension = path.extname(resolved.relativePath)
  const acceptsHtml = String(req.headers.accept || '').includes('text/html')
  if (!extension && acceptsHtml) return path.join(DIST, 'index.html')
  return null
}

function requestIsLocal(req, requireOrigin = false) {
  const host = String(req.headers.host || '').toLocaleLowerCase()
  if (!allowedHosts.has(host)) return false
  if (!requireOrigin) return true
  const origin = String(req.headers.origin || '').toLocaleLowerCase()
  return origin === `http://${host}`
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0
    let finished = false
    const chunks = []
    req.on('data', (chunk) => {
      if (finished) return
      size += chunk.length
      if (size > maxBytes) { finished = true; reject(new HttpError(413, 'İstek çok büyük.')); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (finished) return
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new HttpError(400, 'Geçersiz JSON.')) }
    })
    req.on('error', () => { if (!finished) reject(new HttpError(400, 'İstek okunamadı.')) })
  })
}

async function readResponseText(response, maxBytes) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new HttpError(502, 'Gemini yanıtı beklenenden büyük.')
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function fetchJsonWithTimeout(url, options, timeoutMs = 45000, maxResponseBytes = 2 * 1024 * 1024) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const text = await readResponseText(response, maxResponseBytes)
    let body = null
    if (text) {
      try { body = JSON.parse(text) }
      catch { if (response.ok) throw new HttpError(502, 'Gemini geçerli bir JSON yanıtı döndürmedi.') }
    }
    return { response, body }
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (error && error.name === 'AbortError') throw new HttpError(504, 'Gemini isteği zaman aşımına uğradı.')
    throw new HttpError(502, 'Gemini servisine ulaşılamadı.')
  }
  finally { clearTimeout(timer) }
}

function googleErrorMessage(response, body) {
  return String(body?.error?.message || `Gemini HTTP ${response.status}`).slice(0, 300)
}

async function validateGeminiKey(key) {
  const { response, body } = await fetchJsonWithTimeout('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Yalnızca OK yaz.' }] }], generationConfig: { maxOutputTokens: 4 } }),
  }, 20000)
  if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 400, googleErrorMessage(response, body))
}

function validateImagePayload(body) {
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : ''
  const data = typeof body?.data === 'string' ? body.data : ''
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw new HttpError(400, 'Desteklenmeyen ekran görüntüsü biçimi.')
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new HttpError(400, 'Geçersiz ekran görüntüsü verisi.')
  const bytes = Buffer.from(data, 'base64')
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new HttpError(413, 'Ekran görüntüsü en fazla 10 MB olabilir.')
  return { mimeType, data }
}

async function analyzeScreenTime(body) {
  const key = loadGeminiKey()
  if (!key) throw new HttpError(409, "Önce Ayarlar'dan Gemini bağlantısını kur.")
  const image = validateImagePayload(body)
  const geminiBody = { contents: [{ parts: [{ text: 'Bu ekran süresi görüntüsündeki tüm uygulama adlarını ve kullanım sürelerini dakika cinsinden çıkar. Her uygulamayı dahil et.' }, { inlineData: { mimeType: image.mimeType, data: image.data } }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { app: { type: 'STRING' }, minutes: { type: 'INTEGER', minimum: 1, maximum: 1440 } }, required: ['app', 'minutes'] } } } }
  const { response, body: result } = await fetchJsonWithTimeout('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(geminiBody) })
  if (!response.ok) throw new HttpError(response.status >= 500 ? 502 : response.status, googleErrorMessage(response, result))
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text !== 'string') throw new HttpError(502, 'Gemini geçerli bir cevap döndürmedi.')
  let entries
  try { entries = JSON.parse(text) } catch { throw new HttpError(502, 'Gemini cevabı JSON olarak okunamadı.') }
  if (!Array.isArray(entries)) throw new HttpError(502, 'Gemini geçerli bir uygulama listesi döndürmedi.')
  return entries
}

async function handleApi(req, res) {
  const apiPath = String(req.url || '').split('?')[0]
  if (!apiPath.startsWith('/api/')) return false
  if (!requestIsLocal(req, req.method !== 'GET' && req.method !== 'HEAD')) throw new HttpError(403, 'Forbidden')

  if (apiPath === '/api/settings/gemini-key') {
    if (req.method === 'GET') { sendJson(res, 200, { configured: Boolean(loadGeminiKey()) }); return true }
    if (req.method === 'POST') {
      if (!String(req.headers['content-type'] || '').toLocaleLowerCase().startsWith('application/json')) throw new HttpError(415, 'Content-Type application/json olmalı.')
      const body = await readJson(req, 4096)
      const key = typeof body?.key === 'string' ? body.key.trim() : ''
      if (key.length < 20 || key.length > 512 || /\s/.test(key)) throw new HttpError(400, 'Gemini API anahtarı geçersiz görünüyor.')
      await validateGeminiKey(key)
      saveGeminiKey(key)
      sendJson(res, 200, { configured: true }); return true
    }
    if (req.method === 'DELETE') { removeGeminiKey(); sendJson(res, 200, { configured: false }); return true }
    throw new HttpError(405, 'Method Not Allowed')
  }

  if (apiPath === '/api/screen-time/analyze') {
    if (req.method !== 'POST') throw new HttpError(405, 'Method Not Allowed')
    if (!String(req.headers['content-type'] || '').toLocaleLowerCase().startsWith('application/json')) throw new HttpError(415, 'Content-Type application/json olmalı.')
    const body = await readJson(req, 15 * 1024 * 1024)
    sendJson(res, 200, { entries: await analyzeScreenTime(body) }); return true
  }

  throw new HttpError(404, 'Not Found')
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      if (await handleApi(req, res)) return
      if (!requestIsLocal(req)) { sendError(res, 403, 'Forbidden'); return }
      if (req.method !== 'GET' && req.method !== 'HEAD') { sendError(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' }); return }

      const resolved = resolveRequestPath(req.url)
      if (resolved.error) { sendError(res, resolved.error, resolved.error === 403 ? 'Forbidden' : 'Bad Request'); return }
      const filePath = selectFile(req, resolved)
      if (!filePath || !isInsideDist(filePath)) { sendError(res, 404, 'Not Found'); return }

      let realPath
      try { realPath = fs.realpathSync(filePath) } catch { sendError(res, 404, 'Not Found'); return }
      if (!isInsideDist(realPath)) { sendError(res, 403, 'Forbidden'); return }

      const stat = fs.statSync(realPath)
      const extension = path.extname(realPath).toLocaleLowerCase()
      const immutableAsset = realPath.includes(`${path.sep}assets${path.sep}`)
      res.writeHead(200, { ...securityHeaders, 'Content-Type': mime[extension] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': immutableAsset ? 'public, max-age=31536000, immutable' : 'no-store' })
      if (req.method === 'HEAD') { res.end(); return }
      const stream = fs.createReadStream(realPath)
      stream.on('error', () => { if (!res.headersSent) sendError(res, 500, 'Internal Server Error'); else res.destroy() })
      stream.pipe(res)
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      const message = error instanceof HttpError ? error.message : 'Internal Server Error'
      if (!res.headersSent) sendJson(res, status, { error: message }); else res.destroy()
    }
  })
}

if (require.main === module) {
  createServer().listen(PORT, HOST, () => { console.log(`Momentum ready at http://${HOST}:${PORT}`) })
}

module.exports = { createServer, protectSecret, unprotectSecret, validateImagePayload }
