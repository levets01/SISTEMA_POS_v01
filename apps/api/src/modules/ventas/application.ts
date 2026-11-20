import type { Actor, Input, SaleInput } from '@puesto/shared'
import type { SaleRepository } from '../../application/ports'
import { demand, found, pesos, uniqueLines, settle } from '../../domain/rules'
import type { Inventory } from '../inventario/application'
import type { Catalog } from '../catalogo/application'
import type { CashBook } from '../caja/application'
import type { Receivables } from '../cartera/application'
export class Sales {
  constructor(
    private repo: SaleRepository,
    private actor: Actor,
    private inventory: Inventory,
    private catalog: Catalog,
    private cashBook: CashBook,
    private receivables: Receivables,
  ) {}
  checkout(input: SaleInput) {
    const shiftId = this.cashBook.shift()
    uniqueLines(input.lines)
    if (input.customerId) this.catalog.active('customers', input.customerId)
    const lines = input.lines.map((line) => {
      const p = this.inventory.product(line.productId)
      demand(p.active, 'Producto desactivado: ' + p.name)
      demand(
        p.price === line.price,
        'Cambió el precio de ' + p.name + '. Vuelve a agregarlo.',
        'PRICE_CHANGED',
      )
      return { ...line, name: p.name }
    })
    const total = pesos(lines.reduce((n, l) => n + l.qty * l.price, 0))
    const payment = settle(total, input)
    const id = this.repo.insert('sales', {
      userId: this.actor.id,
      customerId: input.customerId,
      shiftId,
      total,
      ...payment,
    })
    for (const l of lines) {
      this.repo.insert('saleLines', { saleId: id, ...l })
      this.inventory.movement(l.productId, -l.qty, 'Venta', id)
    }
    for (const method of ['cash', 'transfer'] as const)
      if (payment[method]) this.cashBook.cash(shiftId, payment[method], method, 'sale', 'Venta', id)
    if (payment.credit && input.customerId)
      this.receivables.debt(input.customerId, payment.credit, 'sale', 'Venta fiada', { saleId: id })
    return this.repo.receipt(id)
  }
  reverse(input: Input<'reverse'>) {
    const shiftId = this.cashBook.shift()
    const { sale, lines } = this.repo.receipt(input.saleId)
    uniqueLines(input.lines)
    demand(sale.status !== 'void' && sale.status !== 'returned', 'Venta ya revertida.')
    if (input.mode === 'void')
      demand(
        sale.status === 'confirmed' && input.lines.length === lines.length,
        'La anulación requiere la venta completa.',
      )
    const changes = input.lines.map((l) => {
      const original = found(lines.find((x) => x.productId === l.productId))
      demand(
        l.qty <= original.qty - original.returnedQty,
        'La cantidad supera las unidades disponibles.',
      )
      if (input.mode === 'void')
        demand(l.qty === original.qty, 'La anulación requiere todas las unidades.')
      return { ...l, price: original.price, returnedQty: original.returnedQty + l.qty }
    })
    const amount = pesos(changes.reduce((n, l) => n + l.qty * l.price, 0))
    const reversalId = this.repo.insert('reversals', {
      saleId: sale.id,
      userId: this.actor.id,
      mode: input.mode,
      reason: input.reason,
      total: amount,
    })
    for (const line of changes) {
      this.repo.setReturned(sale.id, line.productId, line.returnedQty)
      this.repo.insert('reversalLines', {
        reversalId,
        productId: line.productId,
        qty: line.qty,
        price: line.price,
      })
      this.inventory.movement(line.productId, line.qty, 'Devolución · ' + input.reason, reversalId)
    }
    let refund = amount
    if (sale.customerId) {
      const charge = this.receivables.charges(sale.customerId).find((c) => c.saleId === sale.id)
      if (charge && refund) {
        const credit = Math.min(charge.balance, refund)
        this.receivables.debt(sale.customerId, -credit, 'return', input.reason, {
          chargeId: charge.id,
          saleId: sale.id,
        })
        refund -= credit
      }
    }
    refund = Math.min(refund, this.repo.refundable(sale.id))
    if (refund) this.cashBook.cash(shiftId, -refund, input.method, 'refund', input.reason, reversalId)
    const complete = this.repo.receipt(sale.id).lines.every((l) => l.qty === l.returnedQty)
    this.repo.update('sales', sale.id, {
      returned: sale.returned + amount,
      status: input.mode === 'void' ? 'void' : complete ? 'returned' : 'partial',
    })
    return this.repo.receipt(sale.id)
  }
}
