import http from 'node:http'
import https from 'node:https'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { openDatabase, externalDirectory } from './infra/backups'
import { lanAddress, localTLS } from './infra/network'
import { Store } from './infra/store'
import { createApp } from './presentation/http'
import { PosError } from './domain/rules'
declare const __POS_VERSION__: string
const desktop = !!process.send
const root = externalDirectory(
  process.env.PUESTO_DATA ?? join(process.env.LOCALAPPDATA ?? homedir(), 'Puesto POS', 'datos'),
  [resolve(__dirname, '..'), ...(process.env.PUESTO_APP_DIR ? [process.env.PUESTO_APP_DIR] : [])],
)
const port = Number(process.env.PUESTO_PORT ?? 47830),
  mobilePort = Number(process.env.PUESTO_HTTPS_PORT ?? 47831)
async function start() {
  const { db, backups } = openDatabase(root)
  const ip = process.env.PUESTO_LOOPBACK_ONLY === '1' ? undefined : lanAddress(process.env.PUESTO_LAN_IP)
  const lan = ip ? await localTLS(root, ip, mobilePort) : undefined
  const hosts = new Set([
    '127.0.0.1:' + port,
    'localhost:' + port,
    ...(ip ? [ip + ':' + mobilePort] : []),
  ])
  const app = createApp(new Store(db), backups, {
    web: join(__dirname, 'web'),
    swagger: join(__dirname, 'swagger'),
    version: process.env.PUESTO_VERSION ?? __POS_VERSION__,
    hosts,
    network: lan?.info ?? { url: '', qr: '', caPath: '', fingerprint: '', dataDir: root },
    update: desktop
      ? (action) =>
          new Promise((resolve, reject) => {
            const id = randomUUID()
            const receive = (msg: { id?: string; message?: string; error?: string }) => {
              if (msg.id !== id) return
              process.off('message', receive)
              if (msg.error) reject(new PosError(409, 'UPDATE', msg.error))
              else resolve(msg.message ?? '')
            }
            process.on('message', receive)
            process.send!({ type: 'update', id, action })
          })
      : undefined,
  })
  const listen = (server: http.Server, port: number, host: string) =>
    new Promise<void>((done, fail) => {
      server.once('error', fail)
      server.listen(port, host, () => done())
    })
  if (lan && ip)
    await listen(https.createServer({ ...lan.tls, minVersion: 'TLSv1.2' }, app), mobilePort, ip)
  await listen(http.createServer(app), port, '127.0.0.1')
  const url = 'http://127.0.0.1:' + port
  console.log('Puesto POS disponible en ' + url + (lan ? ' · ' + lan.info.url : ''))
  process.send?.({ type: 'ready', url })
  process.once('disconnect', () => process.exit())
}
start().catch((e) => {
  console.error('No se pudo iniciar Puesto POS: ' + String(e.message))
  process.exit(1)
})
