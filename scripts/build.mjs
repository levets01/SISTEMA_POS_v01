import { build as bundle } from 'esbuild'
import { build as web } from 'vite'
import { copyFile, cp, mkdir, readFile } from 'node:fs/promises'
const metadata = JSON.parse(await readFile('package.json', 'utf8'))
await mkdir('build/swagger', { recursive: true })
await Promise.all(
  ['swagger-ui.css', 'swagger-ui-bundle.js'].map((f) =>
    copyFile('node_modules/swagger-ui-dist/' + f, 'build/swagger/' + f),
  ),
)
await Promise.all(
  [
    ['apps/api/src/server.ts', 'service'],
    ['apps/desktop/src/main.ts', 'main'],
  ].map(([entry, name]) =>
    bundle({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      target: 'node24',
      define: { __POS_VERSION__: JSON.stringify(metadata.version) },
      format: 'cjs',
      external: ['electron', 'electron-updater'],
      outfile: 'build/' + name + '.cjs',
    }),
  ),
)
await web({
  configFile: false,
  root: 'apps/web',
  base: '/',
  esbuild: { jsx: 'automatic' },
  build: { outDir: '../../build/web', emptyOutDir: true },
})
await cp('docs', 'build/web/manual', { recursive: true })
