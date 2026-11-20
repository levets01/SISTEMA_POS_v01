import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { api, type Endpoint, type Input, type Output, type Actor } from '@puesto/shared'
import { Store } from '../infra/store'
import { Queries, csv } from '../infra/queries'
import { Backups } from '../infra/backups'
import { Business } from '../application/business'
import { Auth, digest } from '../application/auth'
import { PosError, demand } from '../domain/rules'
import { specification } from './openapi'
export interface Options {
  web: string
  swagger: string
  version: string
  hosts: Set<string>
  network: Output<'network'>
  update?: (action: Input<'update'>['action']) => Promise<string>
}
const local = (req: Request) =>
  req.socket.remoteAddress === '127.0.0.1' ||
  req.socket.remoteAddress === '::1' ||
  req.socket.remoteAddress === '::ffff:127.0.0.1'
const token = (req: Request) =>
  digest(String(req.headers.cookie ?? '').match(/(?:^|;\s*)puesto=([a-f0-9]{64})(?:;|$)/)?.[1] ?? '')
export function createApp(repo: Store, backups: Backups, options: Options) {
  const app = express(),
    auth = new Auth(repo),
    read = new Queries(repo.db)
  let maintenance = false,
    writers = 0
  const attempts = new Map<string, { count: number; until: number }>()
  const permit = (req: Request, access: string) => {
    const user = repo.session(token(req))
    if ((access === 'local' || access === 'desktop') && !local(req))
      throw new PosError(403, 'LOCAL', 'Esta acción requiere el PC principal.')
    if (['user', 'admin', 'desktop'].includes(access) && !user)
      throw new PosError(401, 'SESSION', 'Inicia sesión.')
    if (['admin', 'desktop'].includes(access) && user?.role !== 'admin')
      throw new PosError(403, 'ROLE', 'Se requiere administrador.')
    return user
  }
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    if (!options.hosts.has(req.headers.host ?? ''))
      return next(new PosError(403, 'HOST', 'Dirección no autorizada.'))
    if (
      req.method === 'POST' &&
      req.headers.origin &&
      req.headers.origin !== req.protocol + '://' + req.headers.host
    )
      return next(new PosError(403, 'ORIGIN', 'Origen no autorizado.'))
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(self), microphone=()',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
    })
    next()
  })
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  app.use(express.json({ limit: '2mb' }))
  function rate(req: Request) {
    const key = req.socket.remoteAddress ?? '',
      now = Date.now()
    for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k)
    const entry = attempts.get(key) ?? { count: 0, until: now + 300000 }
    entry.count++
    attempts.set(key, entry)
    if (entry.count > 20) throw new PosError(429, 'RATE', 'Demasiados intentos. Espera cinco minutos.')
  }
  function session(res: Response, user: Actor) {
    res.cookie('puesto', auth.issue(user.id), {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 43200000,
    })
    return user
  }
  function bind<K extends Endpoint>(
    key: K,
    fn: (
      input: ReturnType<(typeof api)[K]['input']['parse']>,
      ctx: { user: Actor; req: Request; res: Response; b: Business },
    ) => unknown,
  ) {
    const r = api[key]
    app[r.verb]('/api' + r.path, async (req, res) => {
      const user = permit(req, r.access)
      const parsed = r.input.safeParse(r.verb === 'get' ? req.query : req.body)
      if (!parsed.success)
        throw new PosError(
          400,
          'VALIDATION',
          parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join(' · '),
        )
      const write = r.verb === 'post'
      if (write && maintenance) throw new PosError(503, 'MAINTENANCE', 'Actualización en curso.')
      if (write) writers++
      try {
        const data = await fn(parsed.data as ReturnType<(typeof api)[K]['input']['parse']>, {
          user: user!,
          req,
          res,
          b: new Business(repo, user!),
        })
        res.json(r.output.parse(data))
      } finally {
        if (write) writers--
      }
    })
  }
  bind('status', (_, { user }) => ({
    ready: repo.hasUsers(),
    user: user ?? null,
    version: options.version,
    business: repo.record('settings', 1).business,
  }))
  bind('setup', async (i, { res }) =>
    session(res, await auth.create({ ...i, role: 'admin' }, true, null)),
  )
  bind('login', async (i, { req, res }) => {
    rate(req)
    const u = await auth.login(i)
    attempts.delete(req.socket.remoteAddress ?? '')
    return session(res, u)
  })
  bind('logout', (_, { req, res }) => {
    repo.removeSession(token(req))
    res.clearCookie('puesto', { path: '/', secure: true, sameSite: 'strict' })
    return { ok: true }
  })
  bind('users', () => read.users())
  bind('user', async (i, { user }) => auth.create(i, false, user.id))
  for (const k of [
    'products',
    'customers',
    'suppliers',
    'stock',
    'sales',
    'shifts',
    'cashLedger',
    'debtLedger',
    'purchases',
  ] as const)
    bind(k, (i) => read.list(k, i))
  bind('barcode', (i) => read.barcode(i.code))
  bind('productDetail', (i) => repo.record('products', i.id))
  bind('receipt', (i) => repo.sales.receipt(i.id))
  bind('current', () => repo.cash.current())
  bind('saveProduct', (i, { b }) => b.run('product', i, () => b.catalog.save('products', i)))
  bind('demo', (i, { b }) => b.run('demo', i, () => b.catalog.demo()))
  bind('saveCustomer', (i, { b }) => b.run('customer', i, () => b.catalog.save('customers', i)))
  bind('saveSupplier', (i, { b }) => b.run('supplier', i, () => b.catalog.save('suppliers', i)))
  bind('adjust', (i, { b }) => b.run('adjust', i, () => b.inventory.adjust(i)))
  bind('open', (i, { b }) => b.run('open', i, () => b.cashBook.open(i)))
  bind('close', (i, { b }) => {
    const result = b.run('close', i, () => b.cashBook.close(i))
    const action = 'Cierre #' + result.id
    const previous = backups.history().find((x) => x.operation === i.key && x.action === action)
    try {
      return {
        ...result,
        backup:
          previous?.result === 'Correcto'
            ? previous.file
            : backups.configured(action, { operation: i.key }),
      }
    } catch {
      return {
        ...result,
        backup: 'Caja cerrada. Falló el respaldo. Revisa la ubicación en Configuración.',
      }
    }
  })
  bind('cashMove', (i, { b }) => b.run('cashMove', i, () => b.cashBook.cashMove(i)))
  bind('checkout', (i, { b }) => b.run('checkout', i, () => b.sales.checkout(i)))
  bind('reverse', (i, { b }) => b.run('reverse', i, () => b.sales.reverse(i)))
  bind('openingDebt', (i, { b }) => b.run('openingDebt', i, () => b.receivables.openingDebt(i)))
  bind('payment', (i, { b }) => b.run('payment', i, () => b.receivables.pay(i)))
  bind('correct', (i, { b }) => b.run('correct', i, () => b.receivables.correct(i)))
  bind('purchase', (i, { b }) => b.run('purchase', i, () => b.purchases.purchase(i)))
  bind('report', (i) => read.report(i))
  app.get('/api/reports.csv', (req, res) => {
    permit(req, 'admin')
    const p = api.report.input.safeParse(req.query)
    if (!p.success) throw new PosError(400, 'FILTER', 'Filtro inválido.')
    res
      .attachment('puesto-' + p.data.kind + '.csv')
      .type('text/csv; charset=utf-8')
      .send(csv(read.report(p.data)))
  })
  bind('config', () => repo.record('settings', 1))
  bind('saveConfig', (i, { b }) =>
    b.run('settings', i, () => {
      repo.update('settings', 1, i)
      return { ok: true }
    }),
  )
  bind('backups', () => backups.history())
  bind('backup', () => ({ file: backups.configured('Manual') }))
  bind('restore', (i, { user }) => {
    demand(writers === 1, 'Hay una operación en curso.')
    backups.restore(i.file, user.id)
    return { ok: true }
  })
  bind('network', () => options.network)
  bind('update', async (i, { user }) => {
    demand(options.update, 'La actualización requiere la aplicación de escritorio.')
    const installing = i.action === 'install' || i.action === 'manual'
    if (installing) {
      demand(writers === 1, 'Hay una operación en curso.')
      maintenance = true
    }
    try {
      if (installing) backups.configured('Antes de actualizar')
      const message = await options.update(i.action)
      if (message !== 'Instalando actualización.') maintenance = false
      repo.insert('audit', { userId: user.id, action: 'update-' + i.action, reference: null })
      return { message }
    } catch (e) {
      if (installing) maintenance = false
      throw e
    }
  })
  app.use('/docs', (req, _res, next) => {
    permit(req, 'admin')
    next()
  })
  app.get('/docs/openapi.json', (_req, res) => res.json(specification(options.version)))
  app.get('/docs/init.js', (_req, res) =>
    res
      .type('js')
      .send(
        'window.onload=()=>SwaggerUIBundle({url:"/docs/openapi.json",dom_id:"#swagger-ui",validatorUrl:null});',
      ),
  )
  app.get(['/docs', '/docs/'], (_req, res) =>
    res.send(
      '<!doctype html><html lang="es"><meta charset="utf-8"><title>API Puesto POS</title><link rel="stylesheet" href="/docs/swagger-ui.css"><div id="swagger-ui"></div><script src="/docs/swagger-ui-bundle.js"></script><script src="/docs/init.js"></script></html>',
    ),
  )
  app.use('/docs', express.static(options.swagger, { index: false }))
  app.use('/api', () => {
    throw new PosError(404, 'NOT_FOUND', 'Ruta inexistente.')
  })
  if (existsSync(options.web)) app.use(express.static(options.web))
  app.get('/', (_req, res) => res.sendFile(join(options.web, 'index.html')))
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof PosError) {
      res.status(err.status).json({ error: err.message, code: err.code })
      return
    }
    if (/UNIQUE constraint failed/.test(err.message)) {
      res
        .status(409)
        .json({ error: 'Ya existe un registro con ese código o nombre.', code: 'DUPLICATE' })
      return
    }
    if (err.status === 400 || err.status === 413) {
      res
        .status(err.status)
        .json({ error: 'Cuerpo de solicitud inválido o demasiado grande.', code: 'INPUT' })
      return
    }
    res.status(500).json({
      error: 'No se completó la operación. Revisa los datos y el almacenamiento del PC.',
      code: 'INTERNAL',
    })
  })
  return app
}
