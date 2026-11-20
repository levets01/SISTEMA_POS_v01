import { app, BrowserWindow, dialog, session } from 'electron'
import { fork, type ChildProcess } from 'node:child_process'
import { join, resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { updates } from './updates'
app.setName('Puesto POS')
let service: ChildProcess | undefined,
  window: BrowserWindow | undefined,
  closing = false,
  restarts = 0
const manageUpdates = updates()
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    window?.restore()
    window?.focus()
  })
  app.on('before-quit', () => {
    closing = true
    service?.kill()
  })
  app.on('window-all-closed', () => app.quit())
  app
    .whenReady()
    .then(() => {
      const configPath = join(app.getPath('userData'), 'ubicacion.json')
      const cfg: { dataDir?: string; ip?: string } = existsSync(configPath)
        ? JSON.parse(readFileSync(configPath, 'utf8'))
        : {}
      const port = process.env.PUESTO_PORT ?? '47830',
        origin = 'http://127.0.0.1:' + port
      session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) =>
        callback(
          permission === 'media' &&
            wc === window?.webContents &&
            new URL(wc.getURL()).origin === origin &&
            'mediaTypes' in details &&
            !details.mediaTypes?.includes('audio'),
        ),
      )
      window = new BrowserWindow({
        width: 1360,
        height: 880,
        minWidth: 800,
        minHeight: 550,
        title: 'Puesto POS',
        backgroundColor: '#f4f6fa',
        autoHideMenuBar: true,
        webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
      })
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      window.webContents.on('will-navigate', (event, url) => {
        if (new URL(url).origin !== origin) event.preventDefault()
      })
      function launch() {
        const dir = app.isPackaged ? join(process.resourcesPath, 'service') : resolve(__dirname)
        service = fork(join(dir, 'service.cjs'), [], {
          execPath: app.isPackaged
            ? join(process.resourcesPath, 'runtime/node.exe')
            : (process.env.npm_node_execpath ?? 'node'),
          silent: true,
          env: {
            ...process.env,
            PUESTO_VERSION: app.getVersion(),
            PUESTO_APP_DIR: app.isPackaged ? join(app.getPath('exe'), '..') : resolve(__dirname, '..'),
            PUESTO_DATA:
              cfg.dataDir ?? process.env.PUESTO_DATA ?? join(app.getPath('userData'), 'datos'),
            PUESTO_LAN_IP: cfg.ip ?? process.env.PUESTO_LAN_IP,
          },
        })
        let reason = ''
        service.stderr?.on('data', (chunk) => {
          reason = String(chunk).slice(-500)
        })
        service.on(
          'message',
          async (msg: { type: string; action: Parameters<typeof manageUpdates>[0]; id: string }) => {
            if (msg.type === 'ready') {
              await window?.loadURL(origin)
              return
            }
            if (msg.type === 'update') {
              try {
                const message = await manageUpdates(msg.action)
                service?.send({ id: msg.id, message })
              } catch (e) {
                service?.send({
                  id: msg.id,
                  error: e instanceof Error ? e.message : 'Error de actualización.',
                })
              }
            }
          },
        )
        service.on('exit', () => {
          if (closing) return
          if (++restarts <= 3) {
            setTimeout(launch, 1500)
            return
          }
          dialog.showErrorBox(
            'Puesto POS',
            'El servicio local se detuvo. Revisa la ubicación de datos, la red y los puertos.\n' +
              reason,
          )
          app.quit()
        })
      }
      launch()
      if (app.isPackaged) {
        const check = () => {
          void manageUpdates('check').catch(() => {})
        }
        setTimeout(check, 45000).unref()
        setInterval(check, 6 * 3600000).unref()
      }
    })
    .catch((e) => {
      dialog.showErrorBox('Puesto POS', String(e.message))
      app.quit()
    })
}
