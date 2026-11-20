import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Barcode,
  Camera,
  Minus,
  Plus,
  ReceiptText,
  ShoppingBasket,
  Trash2,
} from 'lucide-react'
import type { Actor, Product, Receipt, SaleInput } from '@puesto/shared'
import { call, cop, HttpError, message, time, uid, useRead } from './client'
import {
  Empty,
  Field,
  Form,
  Modal,
  Notice,
  num,
  Pager,
  Panel,
  Picker,
  ReadState,
  SearchBox,
  Table,
} from './ui'
import { Scanner } from './CameraView'
type CartLine = { product: Product; qty: number }
type Draft = { lines: CartLine[]; pending?: SaleInput }
export function addUnit(lines: CartLine[], p: Product): CartLine[] {
  const exists = lines.some((l) => l.product.id === p.id)
  return exists
    ? lines.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l))
    : [...lines, { product: p, qty: 1 }]
}
export function Ticket({
  data,
  business,
  close,
}: {
  data: Receipt
  business: string
  close: () => void
}) {
  const { sale, lines } = data
  return (
    <Modal title={'Comprobante #' + sale.id} close={close}>
      <div className="ticket">
        <ReceiptText size={32} />
        <h2>{business}</h2>
        <p>Comprobante no fiscal · Venta #{sale.id}</p>
        <p>
          {time(sale.created)} · {sale.user}
        </p>
        {sale.customer && <p>Cliente · {sale.customer}</p>}
        <Table
          headers={['Producto', 'Cant.', 'Precio', 'Importe']}
          rows={lines.map((l) => [l.name, l.qty, cop(l.price), cop(l.qty * l.price)])}
        />
        {[
          ['Total', sale.total],
          ['Efectivo aplicado', sale.cash],
          ['Transferencia', sale.transfer],
          ['Cambio', sale.change],
          ['Fiado inicial', sale.credit],
          ['Devuelto', sale.returned],
        ].map(([name, n]) => (
          <div className="pair" key={name}>
            <span>{name}</span>
            <strong>{cop(Number(n))}</strong>
          </div>
        ))}
      </div>
      <button className="primary noprint" onClick={() => window.print()}>
        Imprimir comprobante
      </button>
    </Modal>
  )
}
function Tender({ total, credit }: { total: number; credit: boolean }) {
  const [cash, setCash] = useState(String(credit ? 0 : total)),
    [transfer, setTransfer] = useState('0')
  const difference = Number(cash) + Number(transfer) - total
  return (
    <>
      <div className="fields2">
        {[
          { name: 'cash', label: 'Efectivo recibido', value: cash, set: setCash },
          { name: 'transfer', label: 'Transferencia', value: transfer, set: setTransfer },
        ].map((f) => (
          <Field key={f.name} label={f.label}>
            <input
              name={f.name}
              type="number"
              min="0"
              max={f.name === 'transfer' ? total : 999999999999}
              step="1"
              inputMode="numeric"
              required
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
            />
          </Field>
        ))}
      </div>
      <div className="pair">
        <span>
          {difference < 0 ? (credit ? 'Saldo fiado' : 'Falta por cubrir') : 'Cambio en efectivo'}
        </span>
        <b>{cop(Math.abs(difference))}</b>
      </div>
    </>
  )
}
export function Sale({
  user,
  business,
  online,
  create,
  goCash,
}: {
  user: Actor
  business: string
  online: boolean
  create: (code: string) => void
  goCash: () => void
}) {
  const key = 'puesto.cart.v1.' + user.id
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? { lines: [] }
    } catch {
      return { lines: [] }
    }
  })
  const latest = useRef(draft),
    locked = useRef(false),
    lookups = useRef(0)
  const [q, search] = useState(''),
    [off, page] = useState(0),
    [manual, setManual] = useState(''),
    [camera, scan] = useState(false),
    [pay, checkout] = useState(false),
    [credit, setCredit] = useState(false),
    [ticket, receipt] = useState<Receipt | null>(null),
    [cancel, confirmCancel] = useState(false)
  const [notice, feedback] = useState(''),
    [error, fail] = useState(''),
    [unknown, missing] = useState(''),
    [revision, refresh] = useState(0),
    [busy, working] = useState(false)
  const products = useRead('products', { q, offset: off, limit: 12 }, revision),
    shift = useRead('current', {}, revision)
  const alive = useRef(true)
  useEffect(() => {
    const clock = setInterval(() => refresh((r) => r + 1), 12000)
    return () => clearInterval(clock)
  }, [])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  function save(data: Draft) {
    sessionStorage.setItem(key, JSON.stringify(data))
    latest.current = data
    setDraft(data)
  }
  function add(p: Product) {
    if (latest.current.pending || locked.current) return
    save({ lines: addUnit(latest.current.lines, p) })
    feedback(p.name + ' agregado · ' + cop(p.price))
    fail('')
    missing('')
  }
  async function lookup(code: string) {
    if (!code || latest.current.pending || locked.current) return
    lookups.current++
    try {
      const p = await call('barcode', { code })
      if (alive.current) add(p)
    } catch (e) {
      if (alive.current) {
        fail(message(e))
        if (e instanceof HttpError && e.status === 404) missing(code)
      }
    } finally {
      lookups.current--
    }
  }
  function change(id: number, qty: number) {
    if (!Number.isInteger(qty) || qty < 0 || qty > 999999 || latest.current.pending || locked.current)
      return
    save({
      lines: latest.current.lines
        .map((l) => (l.product.id === id ? { ...l, qty } : l))
        .filter((l) => l.qty),
    })
  }
  const total = draft.lines.reduce((n, l) => n + l.qty * l.product.price, 0),
    count = draft.lines.reduce((n, l) => n + l.qty, 0)
  async function commit(input: SaleInput) {
    if (locked.current) return
    locked.current = true
    working(true)
    fail('')
    try {
      save({ ...latest.current, pending: input })
      const result = await call('checkout', input)
      save({ lines: [] })
      receipt(result)
      checkout(false)
      feedback('Venta #' + result.sale.id + ' registrada.')
      refresh((r) => r + 1)
    } catch (e) {
      if (e instanceof HttpError && [400, 404, 409].includes(e.status)) {
        save({ lines: latest.current.lines })
        checkout(false)
      }
      fail(message(e))
      throw e
    } finally {
      locked.current = false
      working(false)
    }
  }
  function startPayment() {
    if (lookups.current) {
      fail('Espera a que termine la lectura.')
      return
    }
    scan(false)
    setCredit(false)
    checkout(true)
  }
  const disabled = !!draft.pending || busy
  return (
    <>
      <div className="salegrid">
        <div className="stack">
          <Panel title="Agregar productos" action={<Barcode size={22} />}>
            <div className="scanrow">
              <form
                className="codeinput"
                onSubmit={(e) => {
                  e.preventDefault()
                  lookup(manual)
                  setManual('')
                }}
              >
                <Barcode size={19} />
                <input
                  aria-label="Código de barras"
                  placeholder="Ingresa o lee un código"
                  value={manual}
                  disabled={disabled}
                  onChange={(e) => setManual(e.target.value)}
                />
                <button
                  title="Agregar código"
                  aria-label="Agregar código"
                  disabled={disabled || !manual}
                >
                  <ArrowRight size={16} />
                </button>
              </form>
              <button className="primary" disabled={disabled} onClick={() => scan(!camera)}>
                <Camera size={18} />
                {camera ? 'Cerrar cámara' : 'Escanear producto'}
              </button>
            </div>
            {camera && <Scanner code={lookup} close={() => scan(false)} error={fail} />}
            <Notice>{notice}</Notice>
            <Notice bad>{error}</Notice>
            {unknown && user.role === 'admin' && (
              <button onClick={() => create(unknown)}>Crear producto con este código</button>
            )}
          </Panel>
          <Panel title="Catálogo" action={<span className="muted">Por presentación</span>}>
            <SearchBox
              value={q}
              set={(s) => {
                search(s)
                page(0)
              }}
              placeholder="Buscar por nombre o código…"
            />
            <ReadState state={products} />
            {products.data?.length === 0 && (
              <Empty>{q ? 'Sin coincidencias' : 'Todavía no hay productos activos'}</Empty>
            )}
            <div className="catalog">
              {products.data?.map((p) => (
                <button
                  className="producttile"
                  key={p.id}
                  onClick={() => add(p)}
                  disabled={disabled || p.stock === 0}
                >
                  <small>
                    {p.category || 'General'} · {p.stock} disp.
                  </small>
                  <strong>{p.name}</strong>
                  <span>{p.presentation}</span>
                  <footer>
                    <b>{cop(p.price)}</b>
                    <Plus size={16} />
                  </footer>
                </button>
              ))}
            </div>
            <Pager offset={off} set={page} length={products.data?.length ?? 0} limit={12} />
          </Panel>
        </div>
        <Panel title="Cuenta actual" action={<span className="count">{count}</span>}>
          {!count ? (
            <div className="cartempty">
              <ShoppingBasket size={38} strokeWidth={1.25} />
              <h3>Tu cuenta está vacía</h3>
              <p>Escanea un código o elige un producto del catálogo.</p>
            </div>
          ) : (
            <div className="cartlines">
              {draft.lines.map(({ product: p, qty }) => (
                <article key={p.id}>
                  <div className="pair">
                    <strong>{p.name}</strong>
                    <b>{cop(qty * p.price)}</b>
                  </div>
                  <div className="pair">
                    <small>{cop(p.price)} / unidad</small>
                    <div className="quantity">
                      <button
                        disabled={disabled}
                        aria-label={'Restar ' + p.name}
                        onClick={() => change(p.id, qty - 1)}
                      >
                        <Minus size={13} />
                      </button>
                      <input
                        aria-label={'Cantidad de ' + p.name}
                        type="number"
                        min="1"
                        max="999999"
                        disabled={disabled}
                        value={qty}
                        onChange={(e) => {
                          if (e.target.value) change(p.id, Number(e.target.value))
                        }}
                      />
                      <button
                        aria-label={'Sumar ' + p.name}
                        disabled={disabled}
                        onClick={() => change(p.id, qty + 1)}
                      >
                        <Plus size={13} />
                      </button>
                      <button
                        aria-label={'Quitar ' + p.name}
                        disabled={disabled}
                        onClick={() => change(p.id, 0)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="totals">
            <span>Total de la venta</span>
            <strong data-testid="cart-total">{cop(total)}</strong>
            <small>
              COP · {count} {count === 1 ? 'unidad' : 'unidades'}
            </small>
          </div>
          {draft.pending ? (
            <>
              <Notice bad>
                Hay una confirmación pendiente. Reintenta para consultar el resultado del servidor.
              </Notice>
              <button
                className="primary wide"
                disabled={!online || busy}
                onClick={() => void commit(draft.pending!).catch(() => {})}
              >
                Reintentar confirmación
              </button>
            </>
          ) : (
            <>
              <button
                className="primary wide"
                disabled={!count || !online || busy || !shift.data}
                onClick={startPayment}
              >
                Ir a cobrar <ArrowRight size={18} />
              </button>
              {shift.data === null && (
                <button className="textbtn wide" onClick={goCash}>
                  Abrir caja para cobrar
                </button>
              )}
              {count > 0 && (
                <button className="textbtn wide" onClick={() => confirmCancel(true)}>
                  Cancelar venta
                </button>
              )}
            </>
          )}
        </Panel>
      </div>
      {camera && (
        <div className="mobiletotal">
          <span>Cuenta · {count} unidades</span>
          <strong>{cop(total)}</strong>
        </div>
      )}
      {pay && (
        <Modal
          title="Cobrar venta"
          close={() => {
            if (!busy) checkout(false)
          }}
        >
          <div className="paytotal">
            <span>Total</span>
            <strong>{cop(total)}</strong>
          </div>
          <Form
            label="Confirmar venta"
            disabled={!online || busy}
            submit={async (f) =>
              commit(
                draft.pending ?? {
                  key: uid(),
                  lines: draft.lines.map((l) => ({
                    productId: l.product.id,
                    qty: l.qty,
                    price: l.product.price,
                  })),
                  cash: num(f, 'cash'),
                  transfer: num(f, 'transfer'),
                  customerId: num(f, 'customer') || null,
                  credit,
                },
              )
            }
          >
            <Field label="Tipo de venta">
              <select
                value={credit ? 'credit' : 'cash'}
                onChange={(e) => setCredit(e.target.value === 'credit')}
              >
                <option value="cash">Contado</option>
                <option value="credit">Fiado con o sin abono</option>
              </select>
            </Field>
            <Tender key={String(credit)} total={total} credit={credit} />
            <Picker kind="customers" label="Cliente" name="customer" optional={!credit} />
          </Form>
        </Modal>
      )}
      {cancel && (
        <Modal title="¿Cancelar esta cuenta?" close={() => confirmCancel(false)}>
          <p>Se retirarán los productos del carrito.</p>
          <button
            className="danger"
            onClick={() => {
              save({ lines: [] })
              confirmCancel(false)
              feedback('Cuenta cancelada.')
            }}
          >
            Sí, cancelar venta
          </button>
        </Modal>
      )}
      {ticket && <Ticket data={ticket} business={business} close={() => receipt(null)} />}
    </>
  )
}
