import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { call, cop, time, uid, useRead } from './client'
import { Amount, Field, Form, Modal, Notice, num, Pager, Panel, ReadState, str, Table, Text } from './ui'
export function Cash() {
  const [rev, set] = useState(0),
    [off, page] = useState(0),
    [modal, open] = useState(''),
    [key, newKey] = useState(uid),
    [notice, say] = useState(''),
    [history, choose] = useState(0)
  const current = useRead('current', {}, rev),
    shifts = useRead('shifts', { offset: off, limit: 40 }, rev)
  function start(m: string) {
    newKey(uid())
    open(m)
  }
  return (
    <div className="stack">
      <Panel title="Turno de caja" action={<Wallet size={21} />}>
        <Notice>{notice}</Notice>
        <ReadState state={current} />
        {current.data ? (
          <>
            <div className="stats">
              {[
                ['Base inicial', current.data.base],
                ['Efectivo esperado', current.data.expected],
                ['Transferencias netas', current.data.transfer],
              ].map(([l, n]) => (
                <div key={l}>
                  <small>{l}</small>
                  <strong>{cop(Number(n))}</strong>
                </div>
              ))}
            </div>
            <div className="actions">
              <button className="primary" onClick={() => start('move')}>
                Entrada o salida
              </button>
              <button onClick={() => start('close')}>Cerrar caja</button>
            </div>
          </>
        ) : (
          current.data === null && (
            <>
              <p>La caja está cerrada. Registra la base inicial para comenzar el turno.</p>
              <button className="primary" onClick={() => start('open')}>
                Abrir caja
              </button>
            </>
          )
        )}
      </Panel>
      <Panel title="Historial de caja">
        <ReadState state={shifts} />
        <Table
          headers={['Turno', 'Apertura', 'Cierre', 'Contado', 'Diferencia', '']}
          rows={(shifts.data ?? []).map((s) => [
            '#' + s.id,
            time(s.opened),
            time(s.closed),
            s.counted === null ? '—' : cop(s.counted),
            s.difference === null ? '—' : cop(s.difference),
            <button onClick={() => choose(s.id)}>Movimientos</button>,
          ])}
        />
        <Pager offset={off} set={page} length={shifts.data?.length ?? 0} />
      </Panel>
      {modal && (
        <Modal
          title={
            { open: 'Abrir caja', move: 'Movimiento de efectivo', close: 'Cerrar caja' }[modal] ?? ''
          }
          close={() => open('')}
        >
          <Form
            label="Confirmar"
            submit={async (f) => {
              let feedback = 'Movimiento registrado.'
              if (modal === 'open') {
                await call('open', { key, base: num(f, 'amount') })
                feedback = 'Caja abierta.'
              } else if (modal === 'close') {
                const r = await call('close', { key, counted: num(f, 'amount') })
                feedback = 'Turno cerrado · ' + r.backup
              } else
                await call('cashMove', {
                  key,
                  amount: num(f, 'amount'),
                  reason: str(f, 'reason'),
                  direction: str(f, 'direction') as 'in' | 'out',
                })
              open('')
              set(rev + 1)
              say(feedback)
            }}
          >
            {modal === 'move' && (
              <Field label="Movimiento">
                <select name="direction">
                  <option value="in">Entrada</option>
                  <option value="out">Salida</option>
                </select>
              </Field>
            )}
            <Amount
              name="amount"
              label={
                modal === 'open' ? 'Base inicial' : modal === 'close' ? 'Efectivo contado' : 'Valor'
              }
              min={modal === 'move' ? 1 : 0}
            />
            {modal === 'move' && <Text label="Motivo" name="reason" required />}
          </Form>
        </Modal>
      )}
      {history > 0 && <ShiftHistory id={history} close={() => choose(0)} />}
    </div>
  )
}
function ShiftHistory({ id, close }: { id: number; close: () => void }) {
  const [off, page] = useState(0),
    data = useRead('cashLedger', { shiftId: id, limit: 40, offset: off })
  return (
    <Modal title={'Movimientos · Turno #' + id} close={close}>
      <ReadState state={data} />
      <Table
        headers={['Fecha', 'Concepto', 'Medio', 'Importe', 'Usuario']}
        rows={(data.data ?? []).map((m) => [
          time(m.created),
          m.reason,
          m.method === 'cash' ? 'Efectivo' : 'Transferencia',
          cop(m.amount),
          m.user,
        ])}
      />
      <Pager offset={off} set={page} length={data.data?.length ?? 0} />
    </Modal>
  )
}
