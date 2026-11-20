import { app, dialog } from 'electron'
import { autoUpdater, type NsisUpdater } from 'electron-updater'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer, type Server } from 'node:http'
import { createReadStream, readFileSync, existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import type { Input } from '@puesto/shared'
const execute = promisify(execFile)
async function signature(path: string, publisher: string) {
  const command =
    "$s=Get-AuthenticodeSignature -LiteralPath $env:PUESTO_SIGNED_FILE; if ($s.Status -ne 'Valid' -or $s.SignatureType -ne 'Authenticode') {exit 2}; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); [Console]::Write($s.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false))"
  const system = process.env.SystemRoot ?? 'C:\\Windows'
  const result = await execute(
    join(system, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, timeout: 45000, env: { ...process.env, PUESTO_SIGNED_FILE: path } },
  )
  if (result.stdout !== publisher)
    throw Error('El firmante del instalador no coincide con el editor de la aplicación.')
}
async function manualSource(dir: string) {
  const prefix = '/' + randomBytes(20).toString('hex') + '/'
  const server = createServer((req, res) => {
    let name: string
    try {
      name = decodeURIComponent((req.url ?? '').split('?')[0].slice(prefix.length))
    } catch {
      res.writeHead(400).end()
      return
    }
    if (
      !req.url?.startsWith(prefix) ||
      name !== basename(name) ||
      !/^(latest\.yml|[\w.-]+\.exe(?:\.blockmap)?)$/.test(name)
    ) {
      res.writeHead(404).end()
      return
    }
    const path = join(dir, name)
    if (!existsSync(path) || !statSync(path).isFile()) {
      res.writeHead(404).end()
      return
    }
    res.setHeader('Content-Length', statSync(path).size)
    createReadStream(path)
      .on('error', () => res.destroy())
      .pipe(res)
  })
  await new Promise<void>((done, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', done)
  })
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw Error('No se pudo abrir el paquete.')
  return { server, url: 'http://127.0.0.1:' + addr.port + prefix }
}
export function updates() {
  let downloaded: string | undefined,
    downloadVersion: string | undefined,
    downloadHash: string | undefined,
    busy = false
  const meta = join(__dirname, 'distribution.json')
  const publisher = existsSync(meta) ? String(JSON.parse(readFileSync(meta, 'utf8')).publisher) : ''
  let updater: NsisUpdater
  function configure() {
    if (!app.isPackaged || !publisher)
      throw Error('Las actualizaciones requieren una distribución firmada por el propietario.')
    updater = autoUpdater as NsisUpdater
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.allowDowngrade = false
    updater.allowPrerelease = false
    updater.disableDifferentialDownload = true
    updater.logger = null
    updater.verifyUpdateCodeSignature = async (_names, path) => {
      try {
        await signature(path, publisher)
        return null
      } catch {
        return 'Firma Authenticode inválida o editor incorrecto.'
      }
    }
  }
  async function check() {
    const result = await updater.checkForUpdates()
    return result?.isUpdateAvailable ? result.updateInfo : null
  }
  async function download() {
    const paths = await updater.downloadUpdate()
    if (!paths[0]) throw Error('Descarga incompleta.')
    await signature(paths[0], publisher)
    downloaded = paths[0]
  }
  async function install() {
    if (!downloaded || !downloadHash || !downloadVersion)
      throw Error('Primero descarga una actualización.')
    const hash = createHash('sha512')
    for await (const bytes of createReadStream(downloaded)) hash.update(bytes)
    if (hash.digest('base64') !== downloadHash)
      throw Error('El archivo descargado cambió. Descarga nuevamente.')
    await signature(downloaded, publisher)
    process.env.PUESTO_VERIFIED_UPDATE = downloadVersion
    setTimeout(() => updater.quitAndInstall(false, true), 500)
    return 'Instalando actualización.'
  }
  return async (action: Input<'update'>['action']) => {
    if (busy) throw Error('Ya se está comprobando una actualización.')
    busy = true
    let server: Server | undefined
    try {
      configure()
      if (action === 'install') return await install()
      if (action === 'manual') {
        const selection = await dialog.showOpenDialog({
          title: 'Carpeta con latest.yml e instalador firmado',
          properties: ['openDirectory'],
        })
        if (selection.canceled) return 'Instalación pospuesta.'
        const source = await manualSource(selection.filePaths[0])
        server = source.server
        updater.setFeedURL({ provider: 'generic', url: source.url })
      } else {
        // Restore the installed GitHub feed after using removable media.
        updater.updateConfigPath = join(process.resourcesPath, 'app-update.yml')
      }
      const info = await check()
      if (!info) return 'La versión instalada está al día.'
      if (action === 'check') return 'Disponible: ' + info.version
      const sha512 = info.files.find((f) => f.url.toLowerCase().endsWith('.exe'))?.sha512
      if (!sha512) throw Error('El manifiesto no contiene la huella SHA-512 del instalador.')
      await download()
      downloadVersion = info.version
      downloadHash = sha512
      return action === 'manual'
        ? await install()
        : 'Descarga verificada. Puedes instalarla cuando termines de trabajar.'
    } finally {
      server?.close()
      busy = false
    }
  }
}
