import { z } from 'zod'
export { z }
export const label = z.string().trim().min(1).max(140)
export const short = z.string().trim().max(140)
export const money = z.number().int().min(0).max(999999999999)
export const units = z.number().int().min(1).max(999999)
export const id = z.number().int().positive()
export const bit = z.union([z.literal(0), z.literal(1)])
export const role = z.enum(['admin', 'seller'])
export const method = z.enum(['cash', 'transfer'])
const stamp = z.string()
export const actor = z.object({ id, name: label, role })
export const credentials = z.object({ name: label, password: z.string().min(1).max(128) })
export const newUser = credentials.extend({ password: z.string().min(10).max(128), role })
export const productInput = z.object({
  name: label,
  category: short,
  presentation: label,
  barcode: z.string().min(1).max(100),
  internal: short,
  cost: money,
  price: money,
  minStock: money,
  active: z.boolean(),
  image: z
    .string()
    .max(1400000)
    .regex(/^$|^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/),
})
export const product = productInput
  .omit({ image: true, active: true })
  .extend({ id, stock: money, active: bit })
export const personInput = z.object({ name: label, phone: short, active: z.boolean() })
export const person = personInput.extend({ id, active: bit })
export const item = z.object({ productId: id, qty: units, price: money })
export const saleInput = z.object({
  key: z.uuid(),
  customerId: id.nullable(),
  lines: z.array(item).min(1).max(200),
  cash: money,
  transfer: money,
  credit: z.boolean(),
})
export const purchaseInput = z.object({
  key: z.uuid(),
  supplierId: id,
  lines: z
    .array(z.object({ productId: id, qty: units, cost: money }))
    .min(1)
    .max(200),
})
export const sale = z.object({
  id,
  customerId: id.nullable(),
  customer: z.string().nullable(),
  user: z.string(),
  created: stamp,
  total: money,
  cash: money,
  transfer: money,
  change: money,
  credit: money,
  returned: money,
  status: z.enum(['confirmed', 'partial', 'returned', 'void']),
})
export const saleLine = z.object({
  productId: id,
  name: label,
  price: money,
  qty: units,
  returnedQty: money,
})
export const receipt = z.object({ sale, lines: saleLine.array() })
export const shift = z.object({
  id,
  opened: stamp,
  closed: stamp.nullable(),
  base: money,
  counted: money.nullable(),
  expected: z.number(),
  transfer: z.number(),
  difference: z.number().nullable(),
})
export const ledger = z.object({
  id,
  created: stamp,
  reason: z.string(),
  amount: z.number(),
  source: z.string(),
  method: z.string().nullable(),
  user: z.string(),
  reference: z.number().nullable(),
})
export const inventory = z.object({
  id,
  created: stamp,
  reason: z.string(),
  qty: z.number(),
  name: label,
  user: label,
  reference: z.number().nullable(),
})
export const settings = z.object({
  business: label,
  retention: z.number().int().min(1).max(365),
  exportDir: z.string().max(512),
})
export const backupRecord = z.object({
  operation: z.string().optional(),
  file: z.string(),
  created: stamp,
  action: z.string(),
  result: z.string(),
  location: z.string(),
})
export const reports = z.enum(['sales', 'products', 'collections', 'closings', 'debt', 'stock', 'low'])
export const reportData = z.object({
  columns: z.string().array(),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
})
export const page = z.object({
  q: z.string().max(140).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
const date = z.iso.date()
export const reportQuery = z.object({ kind: reports, from: date, to: date })
export type Actor = z.infer<typeof actor>
export type Product = z.infer<typeof product>
export type Person = z.infer<typeof person>
export type Receipt = z.infer<typeof receipt>
export type SaleInput = z.infer<typeof saleInput>
export type PurchaseInput = z.infer<typeof purchaseInput>
export type Role = Actor['role']
const ok = z.object({ ok: z.literal(true) })
const empty = z.object({})
const ref = z.object({ id })
const key = z.uuid()
const keyReason = z.object({ key, reason: label })
const detail = z.object({ id: z.coerce.number().int().positive() })
function route<I extends z.ZodType, O extends z.ZodType>(
  verb: 'get' | 'post',
  path: string,
  access: 'public' | 'local' | 'user' | 'admin' | 'desktop',
  summary: string,
  input: I,
  output: O,
) {
  return { verb, path, access, summary, input, output }
}
export const api = {
  status: route(
    'get',
    '/status',
    'public',
    'Estado del servicio y sesión',
    empty,
    z.object({ ready: z.boolean(), user: actor.nullable(), version: z.string(), business: z.string() }),
  ),
  setup: route(
    'post',
    '/setup',
    'local',
    'Crear el primer administrador en el PC',
    newUser.omit({ role: true }),
    actor,
  ),
  login: route('post', '/login', 'public', 'Iniciar sesión', credentials, actor),
  logout: route('post', '/logout', 'user', 'Cerrar sesión', empty, ok),
  users: route('get', '/users', 'admin', 'Usuarios', empty, actor.array()),
  user: route('post', '/users', 'admin', 'Crear usuario', newUser, ref),
  products: route(
    'get',
    '/products',
    'user',
    'Catálogo por nombre o código',
    page.extend({ active: z.enum(['all', 'yes']).default('yes') }),
    product.array(),
  ),
  barcode: route(
    'get',
    '/barcode',
    'user',
    'Buscar código completo',
    z.object({ code: z.string().min(1).max(100) }),
    product,
  ),
  productDetail: route(
    'get',
    '/product',
    'user',
    'Ficha con imagen local',
    detail,
    product.extend({ image: z.string() }),
  ),
  saveProduct: route(
    'post',
    '/products',
    'admin',
    'Guardar presentación',
    productInput.extend({ id: id.optional() }),
    ref,
  ),
  demo: route(
    'post',
    '/demo',
    'admin',
    'Cargar tres presentaciones de muestra en un catálogo vacío',
    empty,
    ok,
  ),
  customers: route(
    'get',
    '/customers',
    'user',
    'Directorio de clientes',
    page,
    person.extend({ balance: money }).array(),
  ),
  saveCustomer: route(
    'post',
    '/customers',
    'user',
    'Guardar cliente',
    personInput.extend({ id: id.optional() }),
    ref,
  ),
  suppliers: route('get', '/suppliers', 'admin', 'Directorio de proveedores', page, person.array()),
  saveSupplier: route(
    'post',
    '/suppliers',
    'admin',
    'Guardar proveedor',
    personInput.extend({ id: id.optional() }),
    ref,
  ),
  stock: route(
    'get',
    '/inventory',
    'user',
    'Movimientos por producto',
    page.extend({ productId: z.coerce.number().optional() }),
    inventory.array(),
  ),
  adjust: route(
    'post',
    '/inventory',
    'admin',
    'Registrar ajuste con motivo',
    keyReason.extend({
      productId: id,
      qty: z
        .number()
        .int()
        .min(-999999)
        .max(999999)
        .refine((v) => v !== 0),
    }),
    ref,
  ),
  sales: route(
    'get',
    '/sales',
    'user',
    'Historial de ventas',
    page.extend({ customerId: z.coerce.number().optional() }),
    sale.array(),
  ),
  receipt: route('get', '/receipt', 'user', 'Comprobante no fiscal', detail, receipt),
  checkout: route('post', '/sales', 'user', 'Confirmar venta una vez', saleInput, receipt),
  reverse: route(
    'post',
    '/returns',
    'admin',
    'Anular o devolver unidades',
    keyReason.extend({
      saleId: id,
      mode: z.enum(['void', 'return']),
      method,
      lines: z
        .array(z.object({ productId: id, qty: units }))
        .min(1)
        .max(200),
    }),
    receipt,
  ),
  current: route('get', '/cash', 'user', 'Turno abierto', empty, shift.nullable()),
  shifts: route('get', '/closings', 'user', 'Historial de turnos', page, shift.array()),
  cashLedger: route(
    'get',
    '/cash/movements',
    'user',
    'Movimientos de un turno',
    page.extend({ shiftId: z.coerce.number().int().positive() }),
    ledger.array(),
  ),
  open: route('post', '/cash/open', 'user', 'Abrir caja', z.object({ key, base: money }), ref),
  cashMove: route(
    'post',
    '/cash/movements',
    'user',
    'Entrada o salida manual',
    keyReason.extend({ direction: z.enum(['in', 'out']), amount: money.positive() }),
    ref,
  ),
  close: route(
    'post',
    '/cash/close',
    'user',
    'Cerrar caja y respaldar',
    z.object({ key, counted: money }),
    z.object({ id, backup: z.string() }),
  ),
  debtLedger: route(
    'get',
    '/debts',
    'user',
    'Libro de cartera del cliente',
    page.extend({ customerId: z.coerce.number().int().positive() }),
    ledger.array(),
  ),
  openingDebt: route(
    'post',
    '/debts/opening',
    'admin',
    'Registrar deuda inicial',
    keyReason.extend({ customerId: id, amount: money.positive() }),
    ref,
  ),
  payment: route(
    'post',
    '/debts/pay',
    'user',
    'Registrar abono por antigüedad',
    z.object({ key, customerId: id, amount: money.positive(), method }),
    ref,
  ),
  correct: route(
    'post',
    '/debts/correct',
    'admin',
    'Compensar un cargo pendiente',
    keyReason.extend({ customerId: id, chargeId: id, amount: money.positive() }),
    ref,
  ),
  purchase: route('post', '/purchases', 'admin', 'Confirmar compra', purchaseInput, ref),
  purchases: route(
    'get',
    '/purchases',
    'admin',
    'Compras recibidas',
    page,
    z.object({ id, created: stamp, name: label, total: money }).array(),
  ),
  report: route(
    'get',
    '/reports',
    'admin',
    'Reporte por día comercial de Colombia',
    reportQuery,
    reportData,
  ),
  config: route('get', '/settings', 'admin', 'Configuración del negocio', empty, settings),
  saveConfig: route('post', '/settings', 'admin', 'Guardar configuración', settings, ok),
  backups: route(
    'get',
    '/backups',
    'admin',
    'Historial de respaldo y restauración',
    empty,
    backupRecord.array(),
  ),
  backup: route(
    'post',
    '/backups',
    'admin',
    'Crear respaldo consistente',
    empty,
    z.object({ file: z.string() }),
  ),
  restore: route(
    'post',
    '/restore',
    'desktop',
    'Restaurar una copia verificada',
    z.object({ file: z.string().min(1).max(512) }),
    ok,
  ),
  network: route(
    'get',
    '/network',
    'desktop',
    'Acceso móvil y certificado público',
    empty,
    z.object({
      url: z.string(),
      qr: z.string(),
      caPath: z.string(),
      fingerprint: z.string(),
      dataDir: z.string(),
    }),
  ),
  update: route(
    'post',
    '/updates',
    'desktop',
    'Gestionar actualización de escritorio',
    z.object({ action: z.enum(['check', 'download', 'install', 'manual']) }),
    z.object({ message: z.string() }),
  ),
}
export type Endpoint = keyof typeof api
export type Input<K extends Endpoint> = z.input<(typeof api)[K]['input']>
export type Output<K extends Endpoint> = z.output<(typeof api)[K]['output']>
