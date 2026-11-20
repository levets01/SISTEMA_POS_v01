import type { Actor, Output, Product, Receipt } from '@puesto/shared'
export type Value = string | number | null
export type Fields = Record<string, Value>
export type Table =
  | 'users'
  | 'sessions'
  | 'products'
  | 'customers'
  | 'suppliers'
  | 'shifts'
  | 'sales'
  | 'saleLines'
  | 'purchases'
  | 'purchaseLines'
  | 'cash'
  | 'inventory'
  | 'debt'
  | 'reversals'
  | 'reversalLines'
  | 'audit'
  | 'operations'
  | 'settings'
export interface RowRepository {
  insert(table: Table, fields: Fields): number
  update(table: Table, id: number, fields: Fields): void
  record(table: Table, id: number): Fields
}
export interface CatalogRepository extends RowRepository {
  product(id: number): Product
  hasProducts(): boolean
}
export interface SaleRepository extends RowRepository {
  receipt(id: number): Receipt
  setReturned(saleId: number, productId: number, qty: number): void
  refundable(saleId: number): number
}
export interface CashRepository extends RowRepository {
  current(): Output<'current'>
}
export interface DebtRepository extends RowRepository {
  charges(customerId: number): { id: number; balance: number; saleId: number | null }[]
}
export interface Repository extends RowRepository {
  readonly catalog: CatalogRepository
  readonly cash: CashRepository
  readonly debts: DebtRepository
  readonly sales: SaleRepository
  transaction<T>(fn: () => T): T
  operation(
    key: string,
  ): { userId: number; action: string; digest: string; response: string } | undefined
  user(name: string): (Actor & { hash: string }) | undefined
  session(token: string): Actor | undefined
  removeSession(token: string): void
  hasUsers(): boolean
}
