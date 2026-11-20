import { DatabaseSync } from 'node:sqlite'
import { actor, product, receipt, shift } from '@puesto/shared'
import type { Fields, Repository, Table } from '../application/ports'
import { found } from '../domain/rules'
export const salesView =
  'SELECT s.*,c.name customer,u.name user FROM sales s LEFT JOIN customers c ON c.id=s.customerId JOIN users u ON u.id=s.userId'
export const shiftView = `SELECT s.*,s.base+coalesce(sum(m.amount) FILTER(WHERE m.method='cash'),0) expected,coalesce(sum(m.amount) FILTER(WHERE m.method='transfer'),0) transfer,s.counted-s.base-coalesce(sum(m.amount) FILTER(WHERE m.method='cash'),0) difference FROM shifts s LEFT JOIN cash m ON m.shiftId=s.id`
class SqlRows {
  constructor(readonly db: DatabaseSync) {}
  insert(table: Table, fields: Fields) {
    const keys = Object.keys(fields)
    return Number(
      this.db
        .prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
        .run(...Object.values(fields)).lastInsertRowid,
    )
  }
  update(table: Table, id: number, fields: Fields) {
    const result = this.db
      .prepare(
        `UPDATE ${table} SET ${Object.keys(fields)
          .map((k) => k + '=?')
          .join(',')} WHERE id=?`,
      )
      .run(...Object.values(fields), id)
    if (!result.changes) found(undefined)
  }
  record(table: Table, id: number) {
    return found(this.db.prepare('SELECT * FROM ' + table + ' WHERE id=?').get(id)) as Fields
  }
}
class SqlCatalog extends SqlRows {
  product(id: number) {
    return product.parse(this.record('products', id))
  }
  hasProducts() {
    return !!this.db.prepare('SELECT id FROM products LIMIT 1').get()
  }
}
class SqlSales extends SqlRows {
  receipt(id: number) {
    return receipt.parse({
      sale: found(this.db.prepare(salesView + ' WHERE s.id=?').get(id)),
      lines: this.db.prepare('SELECT * FROM saleLines WHERE saleId=? ORDER BY id').all(id),
    })
  }
  refundable(saleId: number) {
    const row = this.db
      .prepare(
        "SELECT cash+transfer-coalesce((SELECT sum(amount) FROM debt WHERE saleId=s.id AND source='payment'),0)+coalesce((SELECT sum(c.amount) FROM cash c JOIN reversals r ON r.id=c.reference WHERE r.saleId=s.id AND c.source='refund'),0) available FROM sales s WHERE id=?",
      )
      .get(saleId)
    return Number(found(row).available)
  }
  setReturned(saleId: number, productId: number, qty: number) {
    this.db
      .prepare('UPDATE saleLines SET returnedQty=? WHERE saleId=? AND productId=?')
      .run(qty, saleId, productId)
  }
}
class SqlCash extends SqlRows {
  current() {
    const row = this.db.prepare(shiftView + ' WHERE s.closed IS NULL GROUP BY s.id').get()
    return row ? shift.parse(row) : null
  }
}
class SqlDebt extends SqlRows {
  charges(customerId: number) {
    return this.db
      .prepare(
        'SELECT d.id,d.saleId,d.amount+coalesce(sum(a.amount),0) balance FROM debt d LEFT JOIN debt a ON a.chargeId=d.id WHERE d.customerId=? AND d.amount>0 GROUP BY d.id HAVING balance>0 ORDER BY d.id',
      )
      .all(customerId) as { id: number; saleId: number | null; balance: number }[]
  }
}
export class Store extends SqlRows implements Repository {
  readonly catalog: SqlCatalog
  readonly cash: SqlCash
  readonly debts: SqlDebt
  readonly sales: SqlSales
  constructor(db: DatabaseSync) {
    super(db)
    this.catalog = new SqlCatalog(db)
    this.cash = new SqlCash(db)
    this.debts = new SqlDebt(db)
    this.sales = new SqlSales(db)
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }
  operation(key: string) {
    return this.db.prepare('SELECT * FROM operations WHERE key=?').get(key) as ReturnType<
      Repository['operation']
    >
  }
  user(name: string) {
    const row = this.db.prepare('SELECT * FROM users WHERE name=?').get(name)
    return row ? { ...actor.parse(row), hash: String(row.hash) } : undefined
  }
  session(token: string) {
    const row = this.db
      .prepare(
        'SELECT u.* FROM users u JOIN sessions s ON s.userId=u.id WHERE s.token=? AND s.expires>?',
      )
      .get(token, Date.now())
    return row ? actor.parse(row) : undefined
  }
  removeSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token=? OR expires<=?').run(token, Date.now())
  }
  hasUsers() {
    return !!this.db.prepare('SELECT id FROM users LIMIT 1').get()
  }
}
