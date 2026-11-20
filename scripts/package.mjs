import { build, Platform, Arch } from 'electron-builder'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, delimiter } from 'node:path'
const release = process.argv.includes('--release')
const publisher = process.env.POS_PUBLISHER ?? '',
  repo = process.env.POS_RELEASE_REPO || process.env.GITHUB_REPOSITORY || ''
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw Error('Construir con Windows y Node x64.')
if (release && (!publisher || !repo || !process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD))
  throw Error('Configura repositorio, certificado y editor de Authenticode.')
const [owner, name] = repo.split('/')
process.env.PATH = resolve('scripts/tools') + delimiter + process.env.PATH
if (!release) process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL ??= '3'
const nodeLicense = existsSync(join(dirname(process.execPath), 'LICENSE'))
  ? join(dirname(process.execPath), 'LICENSE')
  : 'licenses/node-' + process.version + '.txt'
if (!existsSync(nodeLicense))
  throw Error('Usa Node 24.19.0 x64 o incluye la licencia correspondiente a tu runtime.')
writeFileSync('build/distribution.json', JSON.stringify({ publisher: release ? publisher : '' }))
await build({
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  publish: release ? 'always' : 'never',
  config: {
    appId: 'co.puestopos.desktop',
    productName: 'Puesto POS',
    directories: { output: 'release' },
    files: ['build/main.cjs', 'build/distribution.json', 'package.json'],
    asar: true,
    npmRebuild: false,
    extraResources: [
      { from: process.execPath, to: 'runtime/node.exe' },
      { from: nodeLicense, to: 'runtime/LICENSE' },
      { from: 'build', to: 'service', filter: ['service.cjs', 'web/**', 'swagger/**'] },
    ],
    asarUnpack: [],
    artifactName: 'Puesto-POS-${version}-${arch}.${ext}',
    forceCodeSigning: release,
    win: {
      target: 'nsis',
      icon: 'apps/desktop/assets/puesto.ico',
      ...(release ? { publisherName: publisher } : { signExecutable: false }),
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      deleteAppDataOnUninstall: false,
      createDesktopShortcut: true,
      include: 'scripts/installer.nsh',
    },
    publish: release ? [{ provider: 'github', owner, repo: name, releaseType: 'release' }] : null,
  },
})
