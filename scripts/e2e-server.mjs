import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fork } from 'node:child_process'
const dir = mkdtempSync(join(tmpdir(), 'puesto-browser-'))
const child = fork('build/service.cjs', [], {
  env: { ...process.env, PUESTO_DATA: dir, PUESTO_PORT: '48732', PUESTO_LOOPBACK_ONLY: '1' },
})
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => child.kill())
child.on('exit', (code) => {
  rmSync(dir, { recursive: true, force: true })
  process.exit(code ?? 0)
})
