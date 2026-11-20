import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
const root = mkdtempSync(join(tmpdir(), 'puesto-desktop-'))
const binary = resolve('release/win-unpacked/Puesto POS.exe')
const env = {
  ...process.env,
  PUESTO_DATA: join(root, 'datos'),
  PUESTO_PORT: '48735',
  PUESTO_LOOPBACK_ONLY: '1',
}
const password = randomBytes(22).toString('hex')
let application
try {
  for (let run = 0; run < 2; run++) {
    application = await electron.launch({
      executablePath: binary,
      args: ['--user-data-dir=' + join(root, 'perfil')],
      env,
      timeout: 90000,
    })
    const page = await application.firstWindow()
    await page.waitForURL('http://127.0.0.1:48735/', { timeout: 60000 })
    if (run === 0) {
      await page.getByLabel('Usuario', { exact: true }).fill('Prueba local')
      await page.getByLabel('Contraseña', { exact: true }).fill(password)
      await page.getByRole('button', { name: 'Crear cuenta' }).click()
      await page.getByRole('navigation', { name: 'Principal' }).waitFor()
      const result = await page.evaluate(
        async (key) =>
          (
            await fetch('/api/cash/open', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key, base: 43210 }),
            })
          ).status,
        randomUUID(),
      )
      assert.equal(result, 200)
    } else {
      const auth = await page.evaluate(
        async (password) =>
          (
            await fetch('/api/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: 'Prueba local', password }),
            })
          ).status,
        password,
      )
      assert.equal(auth, 200)
      const cash = await page.evaluate(async () => (await fetch('/api/cash')).json())
      assert.equal(cash.base, 43210)
    }
    await application.close()
    application = undefined
  }
  assert.ok(existsSync(join(root, 'datos', 'negocio.sqlite')))
  console.log('Electron empaquetado: inicio, cuenta, caja y persistencia tras reiniciar verificados.')
} finally {
  if (application) await application.close()
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
