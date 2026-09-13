import { spawn } from 'node:child_process'
import { createServer } from 'vite'

const server = await createServer({
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
})

let testProcess
const close = async () => {
  if (testProcess && !testProcess.killed) testProcess.kill('SIGINT')
  await server.close()
}

process.once('SIGINT', async () => {
  await close()
  process.exitCode = 130
})

try {
  await server.listen()
  testProcess = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  })
  process.exitCode = await new Promise((resolve, reject) => {
    testProcess.once('error', reject)
    testProcess.once('exit', code => resolve(code ?? 1))
  })
} finally {
  await close()
}
