import { useState } from 'react'
import { Plus, SlidersHorizontal } from 'lucide-react'
import type { Actor, Output } from '@puesto/shared'
import { call, cop, message, time, uid, useRead } from './client'
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
  SearchBox,
  str,
  Table,
  Text,
} from './ui'
export function Catalog({
  user,
  initial,
  consume,
}: {
  user: Actor
  initial: string | null
  consume: () => void
}) {
  const [rev, setRev] = useState(0),
    [q, setQ] = useState(''),
    [offset, page] = useState(0),
    [editor, edit] = useState<Output<'productDetail'> | true | null>(initial !== null ? true : null),
    [error, fail] = useState(''),
    [notice, say] = useState('')
  const data = useRead('products', { q, offset, limit: 40, active: 'all' }, rev)
  const item = editor && editor !== true ? editor : undefined
  const [sample, confirmSample] = useState(false)
  const close = () => {
    edit(null)
    consume()
  }
  return (
    <>
      <Panel
        title="Productos y presentaciones"
        action={
          user.role === 'admin' && (
            <button className="primary" onClick={() => edit(true)}>
              <Plus size={17} /> Nuevo producto
            </button>
          )
        }
      >
        <SearchBox
          value={q}
          set={(s) => {
            setQ(s)
            page(0)
          }}
        />
        <ReadState state={data} />
        <Notice>{notice}</Notice>
        <Notice bad>{error}</Notice>
        <Table
          headers={['Producto', 'Código', 'Precio', 'Existencia', 'Estado', '']}
          rows={(data.data ?? []).map((p) => [
            <>
              <strong>{p.name}</strong>
              <small>
                {p.presentation} · {p.category || 'General'}
              </small>
            </>,
            <code>{p.barcode}</code>,
            cop(p.price),
            p.stock,
            p.active ? 'Activo' : 'Inactivo',
            <button
              onClick={async () => {
                try {
                  edit(await call('productDetail', { id: p.id }))
                } catch (e) {
                  fail(message(e))
                }
              }}
            >
              {user.role === 'admin' ? 'Editar' : 'Ver'}
            </button>,
          ])}
        />
        <Pager offset={offset} set={page} length={data.data?.length ?? 0} />
      </Panel>
      {user.role === 'admin' && !q && !offset && data.data?.length === 0 && (
        <button className="textbtn" onClick={() => confirmSample(true)}>
          Cargar productos de muestra…
        </button>
      )}
      {sample && (
        <Modal title="Cargar catálogo de muestra" close={() => confirmSample(false)}>
          <p>Se agregarán café, pan y agua con doce unidades de cada presentación para practicar.</p>
          <Form
            label="Cargar tres productos"
            submit={async () => {
              await call('demo', {})
              confirmSample(false)
              setRev(rev + 1)
              say('Catálogo de muestra cargado.')
            }}
          />
        </Modal>
      )}
      {editor && (
        <Modal title={item ? 'Ficha de producto' : 'Nuevo producto'} close={close}>
          <Form
            disabled={user.role !== 'admin'}
            submit={async (f) => {
              const upload = f.get('photo') as File
              let image = item?.image ?? ''
              if (upload?.size) {
                if (upload.size > 1000000) throw Error('La imagen debe pesar menos de 1 MB.')
                image = await new Promise<string>((yes, no) => {
                  const reader = new FileReader()
                  reader.onload = () => yes(String(reader.result))
                  reader.onerror = no
                  reader.readAsDataURL(upload)
                })
              }
              await call('saveProduct', {
                id: item?.id,
                name: str(f, 'name'),
                category: str(f, 'category'),
                presentation: str(f, 'presentation'),
                barcode: str(f, 'barcode'),
                internal: str(f, 'internal'),
                cost: num(f, 'cost'),
                price: num(f, 'price'),
                minStock: num(f, 'minStock'),
                active: f.has('active'),
                image,
              })
              close()
              setRev(rev + 1)
              say('Producto guardado.')
            }}
          >
            <Text name="name" label="Nombre del producto" value={item?.name} required />
            <div className="fields2">
              <Text name="category" label="Categoría" value={item?.category} />
              <Text
                name="presentation"
                label="Presentación"
                value={item?.presentation ?? 'Unidad'}
                required
              />
              <Text
                name="barcode"
                label="Código de barras"
                value={item?.barcode ?? initial ?? ''}
                required
              />
              <Text name="internal" label="Código interno" value={item?.internal} />
              <Amount name="cost" label="Costo" value={item?.cost} />
              <Amount name="price" label="Precio de venta" value={item?.price} />
            </div>
            <Amount name="minStock" label="Stock mínimo" value={item?.minStock} />
            {item?.image && <img className="photo" src={item.image} alt={item.name} />}
            <Field label="Imagen local (hasta 1 MB)">
              <input type="file" name="photo" accept="image/png,image/jpeg,image/webp" />
            </Field>
            <label className="check">
              <input type="checkbox" name="active" defaultChecked={item ? !!item.active : true} />{' '}
              Producto activo
            </label>
          </Form>
        </Modal>
      )}
    </>
  )
}
export function Inventory({ user }: { user: Actor }) {
  const [rev, set] = useState(0),
    [offset, page] = useState(0),
    [modal, open] = useState(false),
    [key, newKey] = useState(uid),
    [notice, say] = useState(''),
    [tab, select] = useState('stock')
  const moves = useRead('stock', { offset, limit: 40 }, rev),
    products = useRead('products', { offset, limit: 40, active: 'all' }, rev)
  return (
    <>
      <Panel
        title="Control de inventario"
        action={
          user.role === 'admin' && (
            <button
              className="primary"
              onClick={() => {
                newKey(uid())
                open(true)
              }}
            >
              <SlidersHorizontal size={16} /> Ajustar stock
            </button>
          )
        }
      >
        <div className="tabs">
          {['stock', 'moves'].map((t) => (
            <button
              key={t}
              className={t === tab ? 'selected' : ''}
              onClick={() => {
                select(t)
                page(0)
              }}
            >
              {t === 'stock' ? 'Existencias' : 'Movimientos'}
            </button>
          ))}
        </div>
        <Notice>{notice}</Notice>
        <ReadState state={tab === 'stock' ? products : moves} />
        {tab === 'stock' ? (
          <Table
            headers={['Producto', 'Código', 'Existencia', 'Mínimo', 'Alerta']}
            rows={(products.data ?? []).map((p) => [
              p.name,
              p.barcode,
              p.stock,
              p.minStock,
              p.stock <= p.minStock ? <span className="warn">Stock bajo</span> : 'Disponible',
            ])}
          />
        ) : (
          <Table
            headers={['Fecha', 'Producto', 'Unidades', 'Motivo', 'Usuario']}
            rows={(moves.data ?? []).map((m) => [time(m.created), m.name, m.qty, m.reason, m.user])}
          />
        )}
        <Pager
          offset={offset}
          set={page}
          length={(tab === 'stock' ? products : moves).data?.length ?? 0}
        />
      </Panel>
      {modal && (
        <Modal title="Ajustar existencia" close={() => open(false)}>
          <Form
            submit={async (f) => {
              await call('adjust', {
                key,
                productId: num(f, 'product'),
                qty: num(f, 'qty'),
                reason: str(f, 'reason'),
              })
              open(false)
              set(rev + 1)
              say('Ajuste registrado.')
            }}
          >
            <Picker kind="products" label="Producto" name="product" />
            <Amount label="Unidades a sumar o restar" name="qty" min={-999999} value={1} />
            <Text name="reason" label="Motivo" required />
          </Form>
        </Modal>
      )}
    </>
  )
}
