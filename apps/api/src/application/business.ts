import { createHash } from 'node:crypto'
import type { Actor } from '@puesto/shared'
import { demand } from '../domain/rules'
import type { Repository } from './ports'
import { Inventory } from '../modules/inventario/application'
import { Catalog } from '../modules/catalogo/application'
import { CashBook } from '../modules/caja/application'
import { Receivables } from '../modules/cartera/application'
import { Sales } from '../modules/ventas/application'
import { Purchases } from '../modules/compras/application'
export class Business {
  readonly inventory: Inventory
  readonly catalog: Catalog
  readonly cashBook: CashBook
  readonly receivables: Receivables
  readonly sales: Sales
  readonly purchases: Purchases
  constructor(
    private repo: Repository,
    readonly actor: Actor,
  ) {
    this.inventory = new Inventory(repo.catalog, actor)
    this.catalog = new Catalog(repo.catalog, this.inventory)
    this.cashBook = new CashBook(repo.cash, actor)
    this.receivables = new Receivables(repo.debts, actor, this.catalog, this.cashBook)
    this.sales = new Sales(
      repo.sales,
      actor,
      this.inventory,
      this.catalog,
      this.cashBook,
      this.receivables,
    )
    this.purchases = new Purchases(repo.catalog, actor, this.inventory, this.catalog)
  }
  run<T>(action: string, input: object & { key?: string }, work: () => T): T {
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    return this.repo.transaction(() => {
      if (input.key) {
        const last = this.repo.operation(input.key)
        if (last) {
          demand(
            last.userId === this.actor.id && last.action === action && last.digest === digest,
            'La clave de confirmación pertenece a otra operación.',
          )
          return JSON.parse(last.response) as T
        }
      }
      const result = work()
      let reference: number | null = null
      if (result && typeof result === 'object') {
        if ('id' in result) reference = Number(result.id)
        else if (
          'sale' in result &&
          result.sale &&
          typeof result.sale === 'object' &&
          'id' in result.sale
        )
          reference = Number(result.sale.id)
      }
      this.repo.insert('audit', { action, userId: this.actor.id, reference })
      if (input.key)
        this.repo.insert('operations', {
          key: input.key,
          userId: this.actor.id,
          action,
          digest,
          response: JSON.stringify(result),
        })
      return result
    })
  }
}
