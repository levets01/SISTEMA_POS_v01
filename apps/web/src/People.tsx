import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { Actor, Person } from '@puesto/shared'
import { call, cop, time, uid, useRead } from './client'
import {
  Amount,
  Field,
  Form,
  Modal,
  Notice,
  num,
  Pager,
  Panel,
  ReadState,
  SearchBox,
  str,
  Table,
  Text,
} from './ui'
export function People({ user, suppliers = false }: { user: Actor; suppliers?: boolean }) {
  const [q, setQ] = useState(''),
    [offset, page] = useState(0),
    [rev, setRev] = useState(0),
    [edit, editor] = useState<Person | true | null>(null),
    [selected, choose] = useState<{ id: number; name: string } | null>(null),
    [notice, say] = useState('')
  const data = useRead(suppliers ? 'suppliers' : 'customers', { q, offset, limit: 40 }, rev),
    p = edit && edit !== true ? edit : undefined
  return (
    <>
      <Panel
        title={suppliers ? 'Directorio de proveedores' : 'Clientes y cartera'}
        action={
          <button className="primary" onClick={() => editor(true)}>
            <Plus size={16} />
            {suppliers ? 'Nuevo proveedor' : 'Nuevo cliente'}
          </button>
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
        <Table
          headers={['Nombre', 'Teléfono', ...(suppliers ? [] : ['Saldo fiado']), 'Estado', '']}
          rows={(data.data ?? []).map((x) => [
            <strong>{x.name}</strong>,
            x.phone || '—',
            ...(suppliers ? [] : [cop(Number('balance' in x ? x.balance : 0))]),
            x.active ? 'Activo' : 'Inactivo',
            <div className="actions">
              {!suppliers && <button onClick={() => choose(x)}>Historial</button>}
              <button onClick={() => editor(x)}>Editar</button>
            </div>,
          ])}
        />
        <Pager offset={offset} set={page} length={data.data?.length ?? 0} />
      </Panel>
      {edit && (
        <Modal title={suppliers ? 'Proveedor' : 'Cliente'} close={() => editor(null)}>
          <Form
            submit={async (f) => {
              await call(suppliers ? 'saveSupplier' : 'saveCustomer', {
                id: p?.id,
                name: str(f, 'name'),
                phone: str(f, 'phone'),
                active: f.has('active'),
              })
              editor(null)
              setRev(rev + 1)
              say('Registro guardado.')
            }}
          >
            <Text name="name" label="Nombre" value={p?.name} required />
            <Text name="phone" label="Teléfono (opcional)" value={p?.phone} type="tel" />
            <label className="check">
              <input name="active" type="checkbox" defaultChecked={!p || !!p.active} /> Activo
            </label>
          </Form>
        </Modal>
      )}
      {selected && (
        <Customer
          user={user}
          person={selected}
          close={() => {
            choose(null)
            setRev(rev + 1)
          }}
        />
      )}
    </>
  )
}
function Customer({
  user,
  person,
  close,
}: {
  user: Actor
  person: { id: number; name: string }
  close: () => void
}) {
  const [rev, set] = useState(0),
    [action, select] = useState('history'),
    [off, page] = useState(0),
    [key, newKey] = useState(uid),
    [notice, say] = useState('')
  const ledger = useRead('debtLedger', { customerId: person.id, offset: off, limit: 40 }, rev),
    sales = useRead('sales', { customerId: person.id, offset: off, limit: 40 }, rev)
  return (
    <Modal title={person.name} close={close}>
      <div className="tabs wrap">
        {[
          ['history', 'Cartera'],
          ['sales', 'Compras'],
          ['payment', 'Abonar'],
          ...(user.role === 'admin'
            ? [
                ['opening', 'Deuda inicial'],
                ['correct', 'Corregir cargo'],
              ]
            : []),
        ].map(([id, name]) => (
          <button
            key={id}
            className={id === action ? 'selected' : ''}
            onClick={() => {
              select(id)
              page(0)
              newKey(uid())
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <Notice>{notice}</Notice>
      {action === 'history' || action === 'sales' ? (
        <>
          <ReadState state={action === 'history' ? ledger : sales} />
          {action === 'history' ? (
            <Table
              headers={['Cargo / mov.', 'Fecha', 'Concepto', 'Valor']}
              rows={(ledger.data ?? []).map((d) => [d.id, time(d.created), d.reason, cop(d.amount)])}
            />
          ) : (
            <Table
              headers={['Venta', 'Fecha', 'Total', 'Fiado original']}
              rows={(sales.data ?? []).map((s) => [s.id, time(s.created), cop(s.total), cop(s.credit)])}
            />
          )}
          <Pager
            offset={off}
            set={page}
            length={(action === 'history' ? ledger : sales).data?.length ?? 0}
          />
        </>
      ) : (
        <Form
          key={action}
          label="Registrar movimiento"
          submit={async (f) => {
            const amount = num(f, 'amount'),
              reason = str(f, 'reason'),
              customerId = person.id
            if (action === 'payment')
              await call('payment', {
                key,
                customerId,
                amount,
                method: str(f, 'method') as 'cash' | 'transfer',
              })
            else if (action === 'opening') await call('openingDebt', { key, customerId, amount, reason })
            else await call('correct', { key, chargeId: num(f, 'chargeId'), amount, reason, customerId })
            select('history')
            set(rev + 1)
            say('Movimiento registrado.')
          }}
        >
          <Amount name="amount" label="Valor en pesos" min={1} value={1} />
          {action === 'payment' ? (
            <Field label="Medio de pago">
              <select name="method">
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
              </select>
            </Field>
          ) : (
            <Text name="reason" label="Motivo" required />
          )}
          {action === 'correct' && (
            <Amount name="chargeId" label="Número del cargo original" min={1} value={1} />
          )}
        </Form>
      )}
    </Modal>
  )
}
