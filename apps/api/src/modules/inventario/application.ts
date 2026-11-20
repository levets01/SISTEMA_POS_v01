import type { Actor, Input } from '@puesto/shared'
import type { CatalogRepository } from '../../application/ports'
import { demand, pesos } from '../../domain/rules'

export class Inventory {
  constructor(
    private repo: CatalogRepository,
    private actor: Actor,
  ) {}
  product(id: number) {
    return this.repo.product(id)
  }
  movement(productId: number, qty: number, reason: string, reference: number | null) {
    const p = this.repo.product(productId)
    demand(p.stock + qty >= 0, 'Existencia insuficiente para ' + p.name + '.', 'OUT_OF_STOCK')
    this.repo.update('products', productId, { stock: pesos(p.stock + qty) })
    return this.repo.insert('inventory', { productId, qty, reason, reference, userId: this.actor.id })
  }
  adjust(input: Input<'adjust'>) {
    return { id: this.movement(input.productId, input.qty, input.reason, null) }
  }
}
