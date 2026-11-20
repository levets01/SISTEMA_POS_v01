import type { Actor, PurchaseInput } from '@puesto/shared'
import type { CatalogRepository } from '../../application/ports'
import { demand, pesos, uniqueLines } from '../../domain/rules'
import type { Inventory } from '../inventario/application'
import type { Catalog } from '../catalogo/application'
export class Purchases {
  constructor(
    private repo: CatalogRepository,
    private actor: Actor,
    private inventory: Inventory,
    private catalog: Catalog,
  ) {}
  purchase(input: PurchaseInput) {
    uniqueLines(input.lines)
    this.catalog.active('suppliers', input.supplierId)
    const total = pesos(input.lines.reduce((n, l) => n + l.qty * l.cost, 0))
    const id = this.repo.insert('purchases', {
      supplierId: input.supplierId,
      userId: this.actor.id,
      total,
    })
    for (const line of input.lines) {
      demand(this.repo.product(line.productId).active, 'Producto desactivado.')
      this.repo.insert('purchaseLines', { purchaseId: id, ...line })
      this.inventory.movement(line.productId, line.qty, 'Compra', id)
      this.repo.update('products', line.productId, { cost: line.cost })
    }
    return { id }
  }
}
