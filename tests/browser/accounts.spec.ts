import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { fork } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
test('recibe una compra, vende dos unidades fiadas y recauda un abono posterior', async ({
  browser,
}) => {
  const root = mkdtempSync(join(tmpdir(), 'puesto-cartera-')),
    baseURL = 'http://127.0.0.1:48736'
  const service = fork('build/service.cjs', [], {
    env: { ...process.env, PUESTO_DATA: root, PUESTO_PORT: '48736', PUESTO_LOOPBACK_ONLY: '1' },
    silent: true,
  })
  const ready = new Promise<void>((ok, fail) => {
    service.on('message', (m) => {
      if (m && typeof m === 'object' && 'type' in m && m.type === 'ready') ok()
    })
    service.once('exit', () => fail(Error('El servicio de prueba se detuvo.')))
  })
  const ctx = await browser.newContext({ baseURL })
  try {
    await ready
    const api = ctx.request
    async function post(path: string, data: object) {
      const r = await api.post('/api/' + path, { data })
      expect(r.ok(), path).toBeTruthy()
      return r.json()
    }
    await post('setup', { name: 'Operador', password: 'prueba-de-cartera' })
    const p = await post('products', {
      name: 'Arroz especial',
      presentation: 'Bolsa',
      category: 'Granos',
      barcode: '00003000',
      internal: '',
      cost: 9000,
      price: 15000,
      minStock: 1,
      active: true,
      image: '',
    })
    const c = await post('customers', { name: 'Marta Torres', phone: '', active: true })
    const s = await post('suppliers', { name: 'Granos del campo', phone: '', active: true })
    await post('cash/open', { key: randomUUID(), base: 0 })
    const page = await ctx.newPage()
    await page.goto('/')
    const nav = (name: string) =>
      page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
    await nav('Compras')
    await page.getByRole('button', { name: 'Nueva compra' }).click()
    await page.getByRole('combobox', { name: 'Producto', exact: true }).selectOption(String(p.id))
    await page.getByLabel('Unidades', { exact: true }).fill('3')
    await page.getByLabel('Costo por unidad').fill('9000')
    await page.getByRole('button', { name: 'Agregar línea' }).click()
    await page.getByRole('combobox', { name: 'Proveedor', exact: true }).selectOption(String(s.id))
    await page.getByRole('button', { name: 'Confirmar compra' }).click()
    await expect(page.getByText('Compra confirmada. Inventario actualizado.')).toBeVisible()
    await nav('Punto de venta')
    await page.getByLabel('Código de barras', { exact: true }).fill('00003000')
    await page.getByRole('button', { name: 'Agregar código' }).click()
    await page.getByRole('button', { name: 'Sumar Arroz especial' }).click()
    await expect(page.getByTestId('cart-total')).toHaveText(/30.000/)
    await page.getByRole('button', { name: 'Ir a cobrar' }).click()
    await page.getByRole('combobox', { name: 'Tipo de venta' }).selectOption('credit')
    await page.getByLabel('Efectivo recibido').fill('10000')
    await page.getByRole('combobox', { name: 'Cliente', exact: true }).selectOption(String(c.id))
    await page.getByRole('button', { name: 'Confirmar venta' }).click()
    await expect(page.getByRole('dialog')).toContainText('Comprobante no fiscal')
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await nav('Clientes y fiados')
    await expect(page.getByRole('row', { name: /Marta Torres/ })).toContainText('20.000')
    await page.getByRole('button', { name: 'Historial', exact: true }).click()
    await page.getByRole('button', { name: 'Abonar', exact: true }).click()
    await page.getByLabel('Valor en pesos').fill('5000')
    await page.getByRole('combobox', { name: 'Medio de pago' }).selectOption('transfer')
    await page.getByRole('button', { name: 'Registrar movimiento' }).click()
    await expect(page.getByText('Movimiento registrado.')).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await expect(page.getByRole('row', { name: /Marta Torres/ })).toContainText('15.000')
    const cash = await (await api.get('/api/cash')).json()
    expect(cash).toMatchObject({ expected: 10000, transfer: 5000 })
    const stock = await (await api.get('/api/product?id=' + p.id)).json()
    expect(stock.stock).toBe(1)
  } finally {
    await ctx.close()
    if (service.exitCode === null && service.signalCode === null)
      await new Promise<void>((ok) => {
        service.once('exit', () => ok())
        service.kill()
      })
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
