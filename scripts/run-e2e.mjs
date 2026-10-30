import { spawn } from 'node:child_process'
import { createServer, preview } from 'vite'

const production = process.argv.includes('--production')
const server = production
  ? await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } })
  : await createServer({ server: { host: '127.0.0.1', port: 4173, strictPort: true } })

let testProcess
const close = async () => {
  if (testProcess && !testProcess.killed) testProcess.kill('SIGINT')
  if ('close' in server) await server.close()
  else await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
}

process.once('SIGINT', async () => {
  await close()
  process.exitCode = 130
})

try {
  if ('listen' in server) await server.listen()
  testProcess = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2).filter(argument => argument !== '--production')], {
    stdio: 'inherit',
    env: { ...process.env, MULTIPLIFE_E2E_PRODUCTION: production ? '1' : '0' },
  })
  process.exitCode = await new Promise((resolve, reject) => {
    testProcess.once('error', reject)
    testProcess.once('exit', code => resolve(code ?? 1))
  })
} finally {
  await close()
}
