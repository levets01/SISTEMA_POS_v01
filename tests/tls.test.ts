import { it, expect } from 'vitest'
import https from 'node:https'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localTLS } from '../apps/api/src/infra/network'
it('negocia HTTPS únicamente con una autoridad de confianza y conserva la CA al cambiar IP', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puesto-tls-'))
  try {
    const first = await localTLS(root, '127.0.0.1', 48899)
    const server = https.createServer(first.tls, (_q, r) => r.end('Puesto'))
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
    const a = server.address()
    if (!a || typeof a === 'string') throw Error()
    const get = (ca?: Buffer) =>
      new Promise<number | undefined>((ok, fail) => {
        https
          .get({ hostname: '127.0.0.1', port: a.port, ca }, (r) => {
            r.resume()
            ok(r.statusCode)
          })
          .on('error', fail)
      })
    try {
      await expect(get()).rejects.toThrow()
      expect(await get(readFileSync(first.info.caPath))).toBe(200)
    } finally {
      await new Promise<void>((ok) => server.close(() => ok()))
    }
    const next = await localTLS(root, '192.168.10.44', 48899)
    expect(next.info.fingerprint).toBe(first.info.fingerprint)
    expect(next.tls.cert).not.toBe(first.tls.cert)
    expect(next.info.qr).toMatch(/^data:image\/png/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
