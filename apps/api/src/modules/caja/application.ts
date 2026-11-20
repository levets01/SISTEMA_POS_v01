import type { Actor, Input } from '@puesto/shared'
import type { CashRepository } from '../../application/ports'
import { demand } from '../../domain/rules'

export class CashBook {
  constructor(
    private repo: CashRepository,
    private actor: Actor,
  ) {}
  shift() {
    const shift = this.repo.current()
    demand(shift, 'Abre la caja antes de registrar la operación.', 'CASH_CLOSED')
    return shift.id
  }
  cash(
    shiftId: number,
    amount: number,
    method: string,
    source: string,
    reason: string,
    reference: number | null,
  ) {
    return this.repo.insert('cash', {
      shiftId,
      amount,
      method,
      source,
      reason,
      reference,
      userId: this.actor.id,
    })
  }
  open(input: Input<'open'>) {
    demand(!this.repo.current(), 'Ya hay una caja abierta.')
    return { id: this.repo.insert('shifts', { base: input.base, userId: this.actor.id }) }
  }
  close(input: Input<'close'>) {
    const id = this.shift()
    this.repo.update('shifts', id, {
      counted: input.counted,
      closed: new Date().toISOString(),
      closedBy: this.actor.id,
    })
    return { id }
  }
  cashMove(input: Input<'cashMove'>) {
    return {
      id: this.cash(
        this.shift(),
        input.amount * (input.direction === 'in' ? 1 : -1),
        'cash',
        'manual',
        input.reason,
        null,
      ),
    }
  }
}
