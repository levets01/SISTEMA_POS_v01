import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { api, type Endpoint, type Input, type Output } from '@puesto/shared'
import { createApp } from '../apps/api/src/presentation/http'
import { Store } from '../apps/api/src/infra/store'
import { openDatabase } from '../apps/api/src/infra/backups'
type Raw = { status: number; body: Record<string, unknown>; cookie: string }
describe('Flujos del POS sobre HTTP y SQLite', () => {
  let root: string,
    storage: ReturnType<typeof openDatabase>,
    server: http.Server,
    url: string,
    cookie: string
  async function raw(
    path: string,
    verb: string,
    body?: unknown,
    session = cookie,
    extra: Record<string, string> = {},
  ): Promise<Raw> {
    const res = await fetch(url + path, {
      method: verb,
      headers: { Cookie: session ?? '', 'Content-Type': 'application/json', ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const data = await res.json()
    return { status: res.status, body: data, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' }
  }
  async function request<K extends Endpoint>(
    key: K,
    data: Input<K>,
    session = cookie,
  ): Promise<Output<K>> {
    const route = api[key],
      get = route.verb === 'get',
      params = new URLSearchParams(Object.entries(data).map(([k, v]) => [k, String(v)]))
    const r = await raw(
      '/api' + route.path + (get ? '?' + params : ''),
      route.verb,
      get ? undefined : data,
      session,
    )
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    return route.output.parse(r.body) as Output<K>
  }
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'puesto-test-'))
    storage = openDatabase(root)
    cookie = ''
    const hosts = new Set<string>()
    const app = createApp(new Store(storage.db), storage.backups, {
      version: '1.0.0',
      web: root,
      swagger: root,
      hosts,
      network: { url: '', qr: '', caPath: '', fingerprint: '', dataDir: root },
    })
    server = http.createServer(app)
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const addr = server.address()
    if (!addr || typeof addr === 'string') throw Error()
    hosts.add('127.0.0.1:' + addr.port)
    url = 'http://127.0.0.1:' + addr.port
    const res = await raw('/api/setup', 'POST', { name: 'Admin', password: 'prueba-segura-1' })
    expect(res.status).toBe(200)
    cookie = res.cookie
  })
  afterEach(async () => {
    await new Promise<void>((done) => server.close(() => done()))
    storage.db.close()
    rmSync(root, { recursive: true, force: true })
  })
  const key = randomUUID
  const productFields = {
    name: 'Café molido',
    category: 'Abarrotes',
    presentation: 'Bolsa',
    barcode: '00123456',
    internal: '',
    cost: 7000,
    price: 15000,
    minStock: 2,
    active: true,
    image: '',
  }
  async function product(qty: number, barcode = productFields.barcode) {
    const { id } = await request('saveProduct', { ...productFields, barcode })
    await request('adjust', { key: key(), productId: id, qty, reason: 'Conteo inicial' })
    return id
  }
  const line = (productId: number, qty: number) => ({ productId, qty, price: 15000 })
  const sale = (productId: number, qty = 1) => ({
    key: key(),
    customerId: null,
    lines: [line(productId, qty)],
    cash: qty * 15000,
    transfer: 0,
    credit: false,
  })
  it('confirma una venta mixta, mantiene precios históricos y separa medios en el cierre', async () => {
    const id = await product(5)
    expect((await request('barcode', { code: '00123456' })).id).toBe(id)
    expect((await raw('/api/barcode?code=123456', 'GET')).status).toBe(404)
    await request('open', { key: key(), base: 20000 })
    const input = { ...sale(id, 2), cash: 25000, transfer: 10000 }
    const r = await request('checkout', input)
    expect(r.sale).toMatchObject({ total: 30000, cash: 20000, transfer: 10000, change: 5000 })
    expect(await request('checkout', input)).toEqual(r)
    expect((await raw('/api/sales', 'POST', { ...input, cash: 30000 })).status).toBe(409)
    expect((await request('productDetail', { id })).stock).toBe(3)
    await request('saveProduct', { ...productFields, id, price: 18000 })
    expect((await request('receipt', { id: r.sale.id })).lines[0].price).toBe(15000)
    const close = await request('close', { key: key(), counted: 39500 })
    const exportResponse = await fetch(url+'/api/reports.csv?kind=stock&from=2020-01-01&to=2099-01-01',{headers:{Cookie:cookie}})
    const csv = Buffer.from(await exportResponse.arrayBuffer())
    expect([...csv.subarray(0,3)]).toEqual([239,187,191])
    expect(csv.toString('utf8')).toContain('"\'00123456";')
    expect(existsSync(join(root, 'respaldos', close.backup))).toBe(true)
    expect((await request('shifts', {}))[0]).toMatchObject({
      expected: 40000,
      transfer: 10000,
      difference: -500,
    })
  })
  it('registra fiado, aplica abono una sola vez y devuelve deuda antes de reembolsar', async () => {
    const id = await product(3),
      c = await request('saveCustomer', { name: 'Luz', phone: '', active: true })
    await request('open', { key: key(), base: 0 })
    const r = await request('checkout', { ...sale(id, 2), customerId: c.id, cash: 10000, credit: true })
    expect(r.sale.credit).toBe(20000)
    const payment = { key: key(), customerId: c.id, amount: 5000, method: 'transfer' as const }
    await Promise.all([request('payment', payment), request('payment', payment)])
    expect((await request('customers', {}))[0].balance).toBe(15000)
    expect((await raw('/api/debts/pay', 'POST', { ...payment, key: key(), amount: 15001 })).status).toBe(
      409,
    )
    const period = { from: '2020-01-01', to: '2099-01-01' }
    expect((await request('report', { kind: 'sales', ...period })).rows[0].slice(1)).toEqual([
      30000, 0, 30000,
    ])
    expect((await request('report', { kind: 'collections', ...period })).rows).toContainEqual([
      'transfer',
      'payment',
      5000,
    ])
    const refund = await request('reverse', {
      key: key(),
      saleId: r.sale.id,
      mode: 'void',
      method: 'cash',
      reason: 'Anulada por cliente',
      lines: [{ productId: id, qty: 2 }],
    })
    expect(refund.sale.status).toBe('void')
    expect((await request('customers', {}))[0].balance).toBe(0)
    expect((await request('current', {}))?.expected).toBe(-5000)
    expect((await request('productDetail', { id })).stock).toBe(3)
  })
  it('resuelve contención de la última unidad y revierte una venta fallida de varias líneas', async () => {
    const a = await product(1),
      b = await product(1, '00000002')
    await request('open', { key: key(), base: 0 })
    const second = (await raw('/api/login', 'POST', { name: 'Admin', password: 'prueba-segura-1' }))
      .cookie
    const attempts = await Promise.all([
      raw('/api/sales', 'POST', sale(b)),
      raw('/api/sales', 'POST', sale(b), second),
    ])
    expect(attempts.map((x) => x.status).sort()).toEqual([200, 409])
    const bad = { ...sale(a), lines: [line(a, 1), line(b, 1)], cash: 30000 }
    expect((await raw('/api/sales', 'POST', bad)).status).toBe(409)
    expect((await request('productDetail', { id: a })).stock).toBe(1)
    expect((await request('sales', {})).length).toBe(1)
    expect(await request('current', {})).toMatchObject({ expected: 15000 })
  })
  it('recibe compras una vez y restaura el conjunto de datos revocando sesiones', async () => {
    const id = await product(1),
      supplier = await request('saveSupplier', { name: 'Distribuidora', phone: '', active: true })
    const order = { key: key(), supplierId: supplier.id, lines: [{ productId: id, qty: 4, cost: 5500 }] }
    await request('purchase', order)
    await request('purchase', order)
    const customer = await request('saveCustomer', { name: 'Ana', phone: '', active: true })
    await request('open', { base: 0, key: key() })
    await request('checkout', { ...sale(id), cash: 0, credit: true, customerId: customer.id })
    const exportDir = join(root,'copia-adicional')
    await request('saveConfig', { business: 'Mi tienda', retention: 1, exportDir })
    const { file } = await request('backup', {})
    expect(existsSync(join(exportDir,file))).toBe(true)
    await request('adjust', { key: key(), productId: id, qty: -4, reason: 'Conteo posterior' })
    await request('restore', { file })
    expect((await raw('/api/products', 'GET')).status).toBe(401)
    cookie = (await raw('/api/login', 'POST', { name: 'Admin', password: 'prueba-segura-1' })).cookie
    expect(await request('productDetail', { id })).toMatchObject({ stock: 4, cost: 5500 })
    expect((await request('customers', {}))[0].balance).toBe(15000)
    expect((await request('purchases', {})).length).toBe(1)
    expect((await request('sales', {})).length).toBe(1)
    expect((await request('backups', {})).map((b) => b.action)).toContain('Antes de restaurar')
  })
  it('exige roles, origen local y contraseñas propias y publica OpenAPI protegido', async () => {
    expect((await raw('/api/setup', 'POST', { name: 'X', password: 'prueba-segura-2' })).status).toBe(
      409,
    )
    await request('user', { name: 'Caja', role: 'seller', password: 'prueba-segura-2' })
    const seller = (await raw('/api/login', 'POST', { name: 'Caja', password: 'prueba-segura-2' }))
      .cookie
    expect((await raw('/api/products', 'POST', productFields, seller)).status).toBe(403)
    expect((await raw('/api/restore', 'POST', { file: 'x' }, seller)).status).toBe(403)
    expect(
      (
        await raw('/api/cash/open', 'POST', { key: key(), base: 0 }, seller, {
          Origin: 'https://externo.invalid',
        })
      ).status,
    ).toBe(403)
    expect((await raw('/docs/openapi.json', 'GET', undefined, seller)).status).toBe(403)
    const docs = await raw('/docs/openapi.json', 'GET')
    expect(docs.status).toBe(200)
    expect(docs.body.openapi).toBe('3.1.0')
    expect((await raw('/api/products', 'POST', { ...productFields, price: 2.5 })).status).toBe(400)
  })
  it('registra deuda inicial y corrección compensatoria sin alterar el cargo', async () => {
    const c = await request('saveCustomer', { name: 'Sol', active: true, phone: '' })
    const charge = await request('openingDebt', {
      key: key(),
      customerId: c.id,
      amount: 8000,
      reason: 'Saldo de libreta',
    })
    await request('correct', {
      key: key(),
      customerId: c.id,
      chargeId: charge.id,
      amount: 3000,
      reason: 'Corrección de transcripción',
    })
    expect((await request('debtLedger', { customerId: c.id })).map((m) => m.amount)).toEqual([
      -3000, 8000,
    ])
    await request('saveCustomer', { id: c.id, name: 'Sol', active: false, phone: '' })
    expect((await request('customers', {}))[0]).toMatchObject({ active: 0, balance: 5000 })
  })
  it('revierte líneas, pagos, stock y clave si falla el último asiento de cartera', async () => {
    const id = await product(2),
      customer = await request('saveCustomer', { name: 'Ana', phone: '', active: true })
    await request('open', { base: 0, key: key() })
    storage.db.exec(
      "CREATE TEMP TRIGGER fail_debt BEFORE INSERT ON debt BEGIN SELECT RAISE(ABORT,'injected test failure'); END",
    )
    const input = { ...sale(id), customerId: customer.id, cash: 5000, credit: true }
    expect((await raw('/api/sales', 'POST', input)).status).toBe(500)
    expect(await request('sales', {})).toHaveLength(0)
    expect((await request('current', {}))?.expected).toBe(0)
    expect((await request('productDetail', { id })).stock).toBe(2)
    storage.db.exec('DROP TRIGGER fail_debt')
    expect((await request('checkout', input)).sale.credit).toBe(10000)
  })
  it('carga muestras solo por solicitud y conserva el catálogo existente', async () => {
    expect(await request('products', {})).toEqual([])
    await request('demo', {})
    expect(await request('products', {})).toHaveLength(3)
    expect((await raw('/api/demo', 'POST', {})).status).toBe(409)
    expect(await request('stock', {})).toHaveLength(3)
  })
})
