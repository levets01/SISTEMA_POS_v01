import type { SaleInput } from '@puesto/shared'
export class PosError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
export function demand(value: unknown, message: string, code = 'CONFLICT'): asserts value {
  if (!value) throw new PosError(409, code, message)
}
export function found<T>(value: T | undefined, message = 'Registro inexistente'): T {
  if (value === undefined) throw new PosError(404, 'NOT_FOUND', message)
  return value
}
export function uniqueLines(lines: { productId: number }[]) {
  demand(
    new Set(lines.map((x) => x.productId)).size === lines.length,
    'Hay líneas de producto repetidas.',
  )
}
export function pesos(amount: number) {
  demand(
    Number.isSafeInteger(amount) && amount >= 0 && amount <= 999999999999,
    'El importe excede el límite de la operación.',
  )
  return amount
}
export function settle(
  total: number,
  input: Pick<SaleInput, 'cash' | 'transfer' | 'credit' | 'customerId'>,
) {
  pesos(total)
  demand(input.transfer <= total, 'La transferencia supera el total.')
  const cash = Math.min(input.cash, total - input.transfer)
  const credit = total - input.transfer - cash
  demand(
    !credit || (input.credit && input.customerId),
    'Selecciona un cliente y autoriza el saldo fiado.',
  )
  return { cash, transfer: input.transfer, credit, change: input.cash - cash }
}
