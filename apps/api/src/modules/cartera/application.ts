import type { Actor, Input } from '@puesto/shared'
import type { DebtRepository, Fields } from '../../application/ports'
import { demand, found, pesos } from '../../domain/rules'
import type { Catalog } from '../catalogo/application'
import type { CashBook } from '../caja/application'
export class Receivables {
  constructor(
    private repo: DebtRepository,
    private actor: Actor,
    private catalog: Catalog,
    private cashBook: CashBook,
  ) {}
  charges(customerId: number) {
    return this.repo.charges(customerId)
  }
  debt(customerId: number, amount: number, source: string, reason: string, extra: Fields = {}) {
    if (amount > 0)
      pesos(this.repo.charges(customerId).reduce((total, charge) => total + charge.balance, amount))
    return this.repo.insert('debt', {
      customerId,
      amount,
      source,
      reason,
      userId: this.actor.id,
      ...extra,
    })
  }
  openingDebt(input: Input<'openingDebt'>) {
    this.catalog.active('customers', input.customerId)
    return { id: this.debt(input.customerId, input.amount, 'opening', input.reason) }
  }
  pay(input: Input<'payment'>) {
    const shiftId = this.cashBook.shift(),
      charges = this.repo.charges(input.customerId)
    demand(
      input.amount <= charges.reduce((n, c) => n + c.balance, 0),
      'El abono supera el saldo pendiente.',
    )
    let remaining = input.amount
    const id = this.cashBook.cash(
      shiftId,
      input.amount,
      input.method,
      'payment',
      'Abono a cartera',
      input.customerId,
    )
    for (const charge of charges) {
      if (!remaining) break
      const amount = Math.min(charge.balance, remaining)
      this.debt(input.customerId, -amount, 'payment', 'Abono', {
        chargeId: charge.id,
        saleId: charge.saleId,
        method: input.method,
      })
      remaining -= amount
    }
    return { id }
  }
  correct(input: Input<'correct'>) {
    const original = this.repo.record('debt', input.chargeId)
    const customerId = Number(original.customerId)
    demand(customerId === input.customerId, 'El cargo pertenece a otro cliente.')
    const charge = found(
      this.repo.charges(customerId).find((c) => c.id === input.chargeId),
      'Cargo sin saldo disponible.',
    )
    demand(input.amount <= charge.balance, 'La corrección supera el cargo pendiente.')
    return {
      id: this.debt(customerId, -input.amount, 'correction', input.reason, {
        chargeId: charge.id,
        saleId: charge.saleId,
      }),
    }
  }
}
