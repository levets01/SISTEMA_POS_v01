import type { Input } from '@puesto/shared'
import type { CatalogRepository } from '../../application/ports'
import { demand } from '../../domain/rules'
import type { Inventory } from '../inventario/application'
export class Catalog {
  constructor(
    private repo: CatalogRepository,
    private inventory: Inventory,
  ) {}
  save(
    table: 'products' | 'customers' | 'suppliers',
    input: Input<'saveProduct'> | Input<'saveCustomer'>,
  ) {
    const { id, active, ...rest } = input
    const fields = { ...rest, active: Number(active) }
    if (id) {
      this.repo.update(table, id, fields)
      return { id }
    }
    return { id: this.repo.insert(table, fields) }
  }
  active(table: 'customers' | 'suppliers', id: number) {
    demand(this.repo.record(table, id).active, 'El registro está desactivado.')
  }
  demo() {
    demand(!this.repo.hasProducts(), 'La carga de muestra requiere un catálogo vacío.')
    const examples = [
      {
        name: 'Café molido',
        presentation: 'Bolsa de 250 g',
        price: 15000,
        cost: 10500,
        barcode: '7701234567897',
      },
      { name: 'Pan de la casa', presentation: 'Unidad', price: 2500, cost: 1400, barcode: '00012348' },
      {
        name: 'Agua natural',
        presentation: 'Botella de 600 ml',
        price: 3000,
        cost: 1600,
        barcode: 'POS-AGUA-600',
      },
    ]
    for (const p of examples) {
      const { id } = this.save('products', {
        ...p,
        category: 'Muestra',
        internal: '',
        minStock: 3,
        image: '',
        active: true,
      })
      this.inventory.movement(id, 12, 'Carga de muestra solicitada', null)
    }
    return { ok: true }
  }
}
