import { api, type Input, type Output } from '@puesto/shared'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { salesView, shiftView } from './store'
import { demand, found } from '../domain/rules'
export class Queries {
  constructor(private db: DatabaseSync) {}
  list(
    key:
      | 'products'
      | 'customers'
      | 'suppliers'
      | 'stock'
      | 'sales'
      | 'shifts'
      | 'cashLedger'
      | 'debtLedger'
      | 'purchases',
    p: {
      q?: string
      limit: number
      offset: number
      active?: string
      productId?: number
      customerId?: number
      shiftId?: number
    },
  ) {
    const q = '%' + (p.q ?? '') + '%',
      page = [p.limit, p.offset]
    const read = (sql: string, ...args: SQLInputValue[]) =>
      this.db.prepare(sql + ' LIMIT ? OFFSET ?').all(...args, ...page)
    switch (key) {
      case 'products':
        return read(
          "SELECT id,name,category,presentation,barcode,internal,cost,price,minStock,stock,active FROM products WHERE (?='all' OR active=1) AND (name LIKE ? OR barcode LIKE ? OR internal LIKE ?) ORDER BY name,id",
          p.active ?? 'yes',
          q,
          q,
          q,
        )
      case 'customers':
        return read(
          'SELECT c.*,coalesce(sum(d.amount),0) balance FROM customers c LEFT JOIN debt d ON c.id=d.customerId WHERE c.name LIKE ? GROUP BY c.id ORDER BY c.name,c.id',
          q,
        )
      case 'suppliers':
        return read('SELECT * FROM suppliers WHERE name LIKE ? ORDER BY name,id', q)
      case 'stock':
        return read(
          'SELECT i.*,p.name,u.name user FROM inventory i JOIN products p ON p.id=i.productId JOIN users u ON u.id=i.userId WHERE (? IS NULL OR i.productId=?) ORDER BY i.id DESC',
          p.productId ?? null,
          p.productId ?? null,
        )
      case 'sales':
        return read(
          salesView + ' WHERE (? IS NULL OR s.customerId=?) ORDER BY s.id DESC',
          p.customerId ?? null,
          p.customerId ?? null,
        )
      case 'shifts':
        return read(shiftView + ' GROUP BY s.id ORDER BY s.id DESC')
      case 'cashLedger':
        return read(
          'SELECT c.*,u.name user FROM cash c JOIN users u ON u.id=c.userId WHERE shiftId=? ORDER BY c.id DESC',
          p.shiftId!,
        )
      case 'debtLedger':
        return read(
          'SELECT d.*,coalesce(d.saleId,d.chargeId) reference,u.name user FROM debt d JOIN users u ON u.id=d.userId WHERE customerId=? ORDER BY d.id DESC',
          p.customerId!,
        )
      case 'purchases':
        return read(
          'SELECT p.*,s.name FROM purchases p JOIN suppliers s ON s.id=p.supplierId ORDER BY p.id DESC',
        )
    }
  }
  barcode(code: string) {
    return api.barcode.output.parse(
      found(
        this.db.prepare('SELECT * FROM products WHERE barcode=? AND active=1').get(code),
        'Código sin producto activo.',
      ),
    )
  }
  users() {
    return this.db.prepare('SELECT id,name,role FROM users ORDER BY name').all()
  }
  report({ kind, from, to }: Input<'report'>): Output<'report'> {
    demand(from <= to, 'El período está invertido.')
    const start = from + 'T05:00:00.000Z',
      end = new Date(Date.parse(to + 'T05:00:00.000Z') + 86400000).toISOString()
    let args: SQLInputValue[] = [start, end]
    let query: string, columns: string[]
    switch (kind) {
      case 'sales':
        columns = ['Día', 'Ventas brutas', 'Devoluciones', 'Ventas netas']
        query = `WITH events AS (SELECT created,total gross,0 refunds FROM sales UNION ALL SELECT created,0,total FROM reversals) SELECT date(created,'-5 hours') day,sum(gross),sum(refunds),sum(gross-refunds) FROM events WHERE created>=? AND created<? GROUP BY day ORDER BY day`
        break
      case 'products':
        columns = ['Código', 'Producto', 'Unidades netas', 'Venta neta']
        query = `WITH events AS (SELECT s.created,l.productId,l.qty,l.price FROM saleLines l JOIN sales s ON s.id=l.saleId UNION ALL SELECT r.created,l.productId,-l.qty,l.price FROM reversalLines l JOIN reversals r ON r.id=l.reversalId) SELECT p.barcode,p.name,sum(e.qty),sum(e.qty*e.price) FROM events e JOIN products p ON p.id=e.productId WHERE e.created>=? AND e.created<? GROUP BY p.id ORDER BY p.name`
        break
      case 'collections':
        columns = ['Medio', 'Origen', 'Recaudo neto']
        query =
          "SELECT method,source,sum(amount) FROM cash WHERE created>=? AND created<? AND source!='manual' GROUP BY method,source"
        break
      case 'closings':
        columns = ['Caja', 'Cierre', 'Esperado', 'Contado', 'Diferencia', 'Transferencias']
        query =
          'SELECT id,closed,expected,counted,difference,transfer FROM (' +
          shiftView +
          ' GROUP BY s.id) WHERE closed>=? AND closed<? ORDER BY id DESC'
        break
      case 'debt':
        columns = ['Cliente', 'Saldo al cierre del período']
        query =
          'SELECT c.name,sum(d.amount) saldo FROM debt d JOIN customers c ON c.id=d.customerId WHERE d.created<? GROUP BY c.id HAVING saldo>0 ORDER BY c.name'
        args = [end]
        break
      default:
        columns = ['Código', 'Producto', 'Existencia actual', 'Mínimo']
        query =
          'SELECT barcode,name,stock,minStock FROM products WHERE active=1' +
          (kind === 'low' ? ' AND stock<=minStock' : '') +
          ' ORDER BY name'
        args = []
    }
    const rows = this.db
      .prepare(query)
      .all(...args)
      .map((row) => Object.values(row) as (string | number | null)[])
    return { columns, rows }
  }
}
export function csv(report: Output<'report'>) {
  const cell = (value: string | number | null) => {
    let s = String(value ?? '')
    if (typeof value === 'string' && (/^[\s]*[=+@-]/.test(s) || /^0\d+$/.test(s))) s = "'" + s
    return '"' + s.replaceAll('"', '""') + '"'
  }
  return '\ufeff' + [report.columns, ...report.rows].map((r) => r.map(cell).join(';')).join('\r\n')
}
