import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PackageOpen,
  Search,
  X,
} from 'lucide-react'
import { message, useRead } from './client'
export function Notice({ children, bad = false }: { children: ReactNode; bad?: boolean }) {
  return children ? (
    <div className={'notice ' + (bad ? 'bad' : '')} role={bad ? 'alert' : 'status'}>
      {bad ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
      <span>{children}</span>
    </div>
  ) : null
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <PackageOpen size={30} strokeWidth={1.3} />
      <p>{children}</p>
    </div>
  )
}
export function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel">
      <div className="panelhead">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}
    </div>
  )
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string
  close: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId()
  useEffect(() => {
    const el = ref.current!
    el.showModal()
    return () => el.close()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <button type="button" className="icon" aria-label="Cerrar" onClick={close}>
          <X size={19} />
        </button>
      </header>
      {children}
    </dialog>
  )
}
export function Form({
  children,
  submit,
  label = 'Guardar',
  disabled = false,
}: {
  children?: ReactNode
  submit: (data: FormData) => Promise<void>
  label?: string
  disabled?: boolean
}) {
  const [error, set] = useState(''),
    [busy, lock] = useState(false),
    guard = useRef(false)
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (guard.current) return
    guard.current = true
    lock(true)
    set('')
    try {
      await submit(new FormData(e.currentTarget))
    } catch (e) {
      set(message(e))
    } finally {
      lock(false)
      guard.current = false
    }
  }
  return (
    <form onSubmit={send} className="form">
      <fieldset disabled={busy || disabled}>{children}</fieldset>
      <Notice bad>{error}</Notice>
      <button className="primary submit" disabled={busy || disabled}>
        {busy ? 'Guardando…' : label}
      </button>
    </form>
  )
}
export const str = (f: FormData, k: string) => String(f.get(k) ?? '')
export const num = (f: FormData, k: string) => Number(str(f, k))
export function Text({
  name,
  label,
  value = '',
  required = false,
  type = 'text',
}: {
  name: string
  label: string
  value?: string
  required?: boolean
  type?: string
}) {
  return (
    <Field label={label}>
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        maxLength={type === 'password' ? 128 : 140}
      />
    </Field>
  )
}
export function Amount({
  name,
  label,
  value = 0,
  min = 0,
}: {
  name: string
  label: string
  value?: number
  min?: number
}) {
  return (
    <Field label={label}>
      <input
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max="999999999999"
        step="1"
        defaultValue={value}
        required
      />
    </Field>
  )
}
export function SearchBox({
  value,
  set,
  placeholder = 'Buscar por nombre…',
}: {
  value: string
  set: (s: string) => void
  placeholder?: string
}) {
  return (
    <label className="search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  )
}
export function Pager({
  offset,
  set,
  length,
  limit = 40,
}: {
  offset: number
  set: (n: number) => void
  length: number
  limit?: number
}) {
  return offset || length === limit ? (
    <div className="pager">
      <button
        disabled={!offset}
        aria-label="Página anterior"
        onClick={() => set(Math.max(0, offset - limit))}
      >
        <ChevronLeft size={16} />
      </button>
      <span>
        {offset + 1}–{offset + length}
      </span>
      <button
        disabled={length < limit}
        aria-label="Página siguiente"
        onClick={() => set(offset + limit)}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  ) : null
}
export function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return rows.length ? (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty>Sin registros para mostrar</Empty>
  )
}
export function ReadState({ state }: { state: { loading: boolean; error?: string } }) {
  return state.loading ? <p className="muted">Cargando…</p> : <Notice bad>{state.error}</Notice>
}
export function Picker({
  kind,
  label,
  name,
  optional = false,
  onPick,
}: {
  kind: 'customers' | 'products' | 'suppliers'
  label: string
  name: string
  optional?: boolean
  onPick?: (id: number) => void
}) {
  const [q, set] = useState(''),
    [chosen, choose] = useState<number | ''>(''),
    [off, page] = useState(0)
  const data = useRead(kind, { q, limit: 40, offset: off })
  return (
    <div className="picker">
      <SearchBox
        value={q}
        set={(s) => {
          set(s)
          page(0)
          choose('')
          onPick?.(0)
        }}
        placeholder={'Filtrar ' + label.toLowerCase() + '…'}
      />
      <Field label={label}>
        <select
          name={name}
          value={chosen}
          required={!optional}
          onChange={(e) => {
            const id = Number(e.target.value)
            choose(id || '')
            onPick?.(id)
          }}
        >
          <option value="">{optional ? 'Sin asignar' : 'Seleccionar…'}</option>
          {data.data
            ?.filter((v) => v.active)
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {'barcode' in v ? ' · ' + v.barcode : ''}
              </option>
            ))}
        </select>
      </Field>
      <ReadState state={data} />
      <Pager
        offset={off}
        set={(n) => {
          page(n)
          choose('')
          onPick?.(0)
        }}
        length={data.data?.length ?? 0}
      />
    </div>
  )
}
