import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { installTestCamera } from './camera-fixture'
test('del primer inicio a una venta móvil, recupera un cobro sin respuesta y cierra caja', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto('/')
  await page.getByLabel('Usuario', { exact: true }).fill('Administrador')
  await page.getByLabel('Contraseña', { exact: true }).fill('solo-pruebas-2026')
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  const nav = (name: string) =>
    page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Punto de venta', exact: true })).toBeVisible()
  await nav('Productos')
  for (const [name, code, price] of [
    ['Pan', '00012345', '2500'],
    ['Café', '7701234567897', '5000'],
  ]) {
    await page.getByRole('button', { name: 'Nuevo producto' }).click()
    await page.getByLabel('Nombre del producto').fill(name)
    await page.getByLabel('Código de barras', { exact: true }).fill(code)
    await page.getByLabel('Precio de venta').fill(price)
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await nav('Inventario')
  for (const id of ['1', '2']) {
    await page.getByRole('button', { name: 'Ajustar stock' }).click()
    await page.getByRole('combobox', { name: 'Producto', exact: true }).selectOption(id)
    await page.getByLabel('Unidades a sumar o restar').fill('5')
    await page.getByLabel('Motivo').fill('Inicial')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await nav('Caja')
  await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
  await page.getByLabel('Base inicial').fill('20000')
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.getByText('Caja abierta.', { exact: true })).toBeVisible()
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL })
  const phone = await mobile.newPage()
  try {
    await phone.goto('/')
    await phone.getByLabel('Usuario', { exact: true }).fill('Administrador')
    await phone.getByLabel('Contraseña', { exact: true }).fill('solo-pruebas-2026')
    await phone.getByRole('button', { name: 'Entrar al puesto' }).click()
    const code = phone.getByRole('textbox', { name: 'Código de barras', exact: true })
    await code.fill('0001')
    await expect(phone.getByTestId('cart-total')).toContainText('0')
    for (const barcode of ['00012345', '7701234567897', '00012345']) {
      await code.fill(barcode)
      await code.press('Enter')
      await expect(phone.getByText(/agregado ·/)).toBeVisible()
    }
    await expect(phone.getByTestId('cart-total')).toHaveText(/10.000/)
    await mobile.setOffline(true)
    await expect(phone.getByRole('button', { name: 'Ir a cobrar' })).toBeDisabled()
    await mobile.setOffline(false)
    await phone.reload()
    await expect(phone.getByTestId('cart-total')).toHaveText(/10.000/)
    await phone.getByRole('button', { name: 'Ir a cobrar' }).click()
    await phone.route(
      '**/api/sales',
      async (route) => {
        await route.fetch()
        await route.abort('connectionreset')
      },
      { times: 1 },
    )
    await phone.getByRole('button', { name: 'Confirmar venta' }).click()
    await expect(phone.getByRole('alert').last()).toContainText(/Sin respuesta/)
    await phone.reload()
    await phone.getByRole('button', { name: 'Reintentar confirmación' }).click()
    await expect(phone.getByRole('dialog')).toContainText('Comprobante no fiscal')
    await phone.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await expect(phone.getByTestId('cart-total')).toHaveText(/\$\s*0/)
  } finally {
    await mobile.close()
  }
  await nav('Historial de ventas')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await nav('Caja')
  await expect(page.getByText(/30.000/)).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar caja' }).click()
  await page.getByLabel('Efectivo contado').fill('30000')
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.getByText(/Turno cerrado · puesto-/)).toBeVisible()
  await nav('Configuración')
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await expect(page.getByText('Cierre #1')).toBeVisible()
})
test('ZXing decodifica vídeo sintético y rearma el mismo EAN-8 al retirarlo', async ({ page }) => {
  const status = await (await page.request.get('/api/status')).json()
  const auth = await page.request.post(status.ready ? '/api/login' : '/api/setup', {
    data: { name: 'Administrador', password: 'solo-pruebas-2026' },
  })
  expect(auth.ok()).toBeTruthy()
  for (const [barcode, name, price] of [
    ['00012348', 'Galleta', 2000],
    ['12345670', 'Mango', 3500],
  ] as const) {
    const product = await page.request.post('/api/products', {
      data: {
        barcode,
        name,
        price,
        cost: 1000,
        minStock: 1,
        presentation: 'Unidad',
        internal: '',
        category: '',
        active: true,
        image: '',
      },
    })
    expect(product.ok()).toBeTruthy()
    const { id } = await product.json()
    const stock = await page.request.post('/api/inventory', {
      data: { productId: id, qty: 5, reason: 'Prueba cámara', key: randomUUID() },
    })
    expect(stock.ok()).toBeTruthy()
  }
  await installTestCamera(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Escanear producto' }).click()
  const show = (code: string) =>
    page.evaluate((s) => {
      window.dispatchEvent(new CustomEvent('fixture-barcode', { detail: s }))
    }, code)
  await show('00012348')
  const total = page.getByTestId('cart-total')
  await expect(total).toHaveText(/2.000/, { timeout: 15000 })
  // Leave the barcode stationary across multiple decode cycles.
  await page.waitForTimeout(1500)
  await expect(total).toHaveText(/2.000/)
  await show('12345670')
  await expect(total).toHaveText(/5.500/)
  await show('')
  await page.waitForTimeout(1500)
  await show('12345670')
  await expect(total).toHaveText(/9.000/)
  await page.getByRole('button', { name: 'Cerrar escáner', exact: true }).click()
  await expect(page.locator('video')).toHaveCount(0)
})
