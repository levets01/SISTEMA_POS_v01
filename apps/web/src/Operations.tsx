import { useState } from 'react'
import { Download, Plus } from 'lucide-react'
import type { Actor, Receipt } from '@puesto/shared'
import { call, cop, message, time, today, uid, useRead } from './client'
import {
  Amount,
  Field,
  Form,
  Modal,
  Notice,
  num,
  Pager,
  Panel,
  Picker,
  ReadState,
  str,
  Table,
  Text,
} from './ui'
import { Ticket } from './Sale'
export function SalesHistory({ user, business }: { user: Actor; business: string }) {
  const [off, page] = useState(0),
    [rev, set] = useState(0),
    [ticket, show] = useState<Receipt | null>(null),
    [reverse, choose] = useState<Receipt | null>(null),
    [key, newKey] = useState(uid),
    [error, fail] = useState(''),
    [mode, setMode] = useState<'void' | 'return'>('return')
  const data = useRead('sales', { offset: off, limit: 40 }, rev)
  async function select(id: number, refund: boolean) {
    try {
      const r = await call('receipt', { id })
      if (refund) {
        newKey(uid())
        setMode('return')
        choose(r)
      } else show(r)
    } catch (e) {
      fail(message(e))
    }
  }
  return (
    <Panel title="Historial de ventas">
      <Notice bad>{error}</Notice>
      <ReadState state={data} />
      <Table
        headers={['Venta', 'Fecha', 'Cliente', 'Importe', 'Estado', '']}
        rows={(data.data ?? []).map((s) => [
          '#' + s.id,
          time(s.created),
          s.customer ?? 'Contado sin cliente',
          cop(s.total - s.returned),
          {
            confirmed: 'Confirmada',
            partial: 'Devolución parcial',
            returned: 'Devuelta',
            void: 'Anulada',
          }[s.status],
          <div className="actions">
            <button onClick={() => select(s.id, false)}>Comprobante</button>
            {user.role === 'admin' && ['confirmed', 'partial'].includes(s.status) && (
              <button onClick={() => select(s.id, true)}>Devolver</button>
            )}
          </div>,
        ])}
      />
      <Pager offset={off} set={page} length={data.data?.length ?? 0} />
      {ticket && <Ticket data={ticket} business={business} close={() => show(null)} />}
      {reverse && (
        <Modal title={'Reversar venta #' + reverse.sale.id} close={() => choose(null)}>
          <Form
            label="Confirmar reversión"
            submit={async (f) => {
              const lines = reverse.lines
                .map((l) => ({
                  productId: l.productId,
                  qty: mode === 'void' ? l.qty : num(f, 'qty' + l.productId),
                }))
                .filter((l) => l.qty > 0)
              const r = await call('reverse', {
                key,
                saleId: reverse.sale.id,
                mode,
                reason: str(f, 'reason'),
                method: str(f, 'method') as 'cash' | 'transfer',
                lines,
              })
              choose(null)
              show(r)
              set(rev + 1)
            }}
          >
            <Field label="Operación">
              <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="return">Devolver unidades</option>
                {reverse.sale.status === 'confirmed' && (
                  <option value="void">Anular toda la venta</option>
                )}
              </select>
            </Field>
            {mode === 'return' &&
              reverse.lines
                .filter((l) => l.qty > l.returnedQty)
                .map((l) => (
                  <Field label={l.name + ' · hasta ' + (l.qty - l.returnedQty)} key={l.productId}>
                    <input
                      type="number"
                      name={'qty' + l.productId}
                      min="0"
                      max={l.qty - l.returnedQty}
                      step="1"
                      defaultValue="0"
                    />
                  </Field>
                ))}
            <Text name="reason" label="Motivo de reversión" required />
            <Field label="Medio para el reembolso después de descontar deuda">
              <select name="method">
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
              </select>
            </Field>
          </Form>
        </Modal>
      )}
    </Panel>
  )
}
export function Purchases() {
  const [rev, set] = useState(0),
    [off, page] = useState(0),
    [modal, open] = useState(false),
    [key, newKey] = useState(uid),
    [lines, change] = useState<{ productId: number; name: string; qty: number; cost: number }[]>([]),
    [notice, say] = useState('')
  const data = useRead('purchases', { offset: off, limit: 40 }, rev)
  return (
    <Panel
      title="Recepción de mercancía"
      action={
        <button
          className="primary"
          onClick={() => {
            newKey(uid())
            change([])
            open(true)
          }}
        >
          <Plus size={16} /> Nueva compra
        </button>
      }
    >
      <Notice>{notice}</Notice>
      <ReadState state={data} />
      <Table
        headers={['Compra', 'Fecha', 'Proveedor', 'Costo total']}
        rows={(data.data ?? []).map((p) => ['#' + p.id, time(p.created), p.name, cop(p.total)])}
      />
      <Pager offset={off} set={page} length={data.data?.length ?? 0} />
      {modal && (
        <Modal title="Registrar compra" close={() => open(false)}>
          <Form
            label="Agregar línea"
            submit={async (f) => {
              const p = await call('productDetail', { id: num(f, 'product') })
              if (lines.some((l) => l.productId === p.id))
                throw Error('Quita la línea anterior para cambiar su cantidad.')
              change([
                ...lines,
                { productId: p.id, name: p.name, qty: num(f, 'qty'), cost: num(f, 'cost') },
              ])
            }}
          >
            <Picker kind="products" name="product" label="Producto" />
            <div className="fields2">
              <Amount name="qty" label="Unidades" min={1} value={1} />
              <Amount name="cost" label="Costo por unidad" />
            </div>
          </Form>
          <Table
            headers={['Producto', 'Unidades', 'Subtotal', '']}
            rows={lines.map((l) => [
              l.name,
              l.qty,
              cop(l.qty * l.cost),
              <button onClick={() => change(lines.filter((x) => x !== l))}>Quitar</button>,
            ])}
          />
          <Form
            label="Confirmar compra"
            disabled={!lines.length}
            submit={async (f) => {
              await call('purchase', {
                key,
                supplierId: num(f, 'supplier'),
                lines: lines.map(({ name, ...line }) => line),
              })
              set(rev + 1)
              open(false)
              say('Compra confirmada. Inventario actualizado.')
            }}
          >
            <Picker kind="suppliers" name="supplier" label="Proveedor" />
            <div className="paytotal">
              <span>Total</span>
              <strong>{cop(lines.reduce((n, l) => n + l.cost * l.qty, 0))}</strong>
            </div>
          </Form>
        </Modal>
      )}
    </Panel>
  )
}
export function Reports() {
  const [kind, setKind] = useState<
      'sales' | 'products' | 'collections' | 'closings' | 'debt' | 'stock' | 'low'
    >('sales'),
    [from, start] = useState(today),
    [to, end] = useState(today)
  const query = { kind, from, to },
    data = useRead('report', query)
  return (
    <Panel
      title="Reportes del negocio"
      action={
        <a className="button" download href={'/api/reports.csv?' + new URLSearchParams(query)}>
          <Download size={16} /> Exportar CSV
        </a>
      }
    >
      <div className="filters">
        <Field label="Reporte">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {Object.entries({
              sales: 'Ventas por período',
              products: 'Ventas por producto',
              collections: 'Recaudos por medio',
              closings: 'Cierres de caja',
              debt: 'Cartera pendiente',
              stock: 'Existencias actuales',
              low: 'Stock bajo actual',
            }).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Desde">
          <input type="date" value={from} onChange={(e) => start(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <input type="date" value={to} onChange={(e) => end(e.target.value)} />
        </Field>
      </div>
      <ReadState state={data} />
      {data.data && (
        <Table
          headers={data.data.columns}
          rows={data.data.rows.map((r) =>
            r.map((v) => (typeof v === 'number' ? v.toLocaleString('es-CO') : v)),
          )}
        />
      )}
    </Panel>
  )
}
