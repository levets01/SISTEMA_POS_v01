import { it, expect, vi } from 'vitest'
import { scanContinuously, type CameraAdapter } from '../apps/web/src/scanner'
import { addUnit } from '../apps/web/src/Sale'
import type { Product } from '@puesto/shared'
it('acumula productos completos, bloquea el código sostenido, tolera un cuadro perdido y rearma al retirarlo', async () => {
  const product = (id: number, barcode: string, price: number): Product => ({
    id,
    barcode,
    price,
    active: 1,
    stock: 10,
    minStock: 1,
    name: 'Producto ' + id,
    category: '',
    presentation: 'Unidad',
    internal: '',
    cost: 0,
  })
  const catalog = [product(1, '00012345', 2500), product(2, '0012345678905', 6000)]
  let cart: ReturnType<typeof addUnit> = [],
    tick = 0,
    frame!: (s: string | null) => void
  const stop = vi.fn(),
    clock = vi.spyOn(performance, 'now').mockImplementation(() => tick)
  try {
    const adapter: CameraAdapter = {
      start: async (_, callback) => {
        frame = callback
        return stop
      },
    }
    const close = scanContinuously(
      adapter,
      { srcObject: null } as HTMLVideoElement,
      (s) => {
        const p = catalog.find((p) => p.barcode === s)
        if (p) cart = addUnit(cart, p)
      },
      (e) => {
        throw e
      },
    )
    await Promise.resolve()
    for (const code of [
      '00012345',
      '00012345',
      null,
      '00012345',
      '0012345678905',
      '0012345678905',
      null,
      null,
      null,
      null,
      '0012345678905',
      'unknown',
    ]) {
      frame(code)
      tick += 260
    }
    expect(cart.map((l) => [l.product.barcode, l.qty])).toEqual([
      ['00012345', 1],
      ['0012345678905', 2],
    ])
    expect(cart.reduce((n, l) => n + l.qty * l.product.price, 0)).toBe(14500)
    close()
    expect(stop).toHaveBeenCalledOnce()
    frame('00012345')
    expect(cart[0].qty).toBe(1)
  } finally {
    clock.mockRestore()
  }
})
