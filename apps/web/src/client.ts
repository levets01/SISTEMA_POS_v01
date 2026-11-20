import { useEffect, useState } from 'react'
import { api, type Endpoint, type Input, type Output } from '@puesto/shared'
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
  }
}
type Pending = { key: 'payment'; data: Input<'payment'> } | { key: 'purchase'; data: Input<'purchase'> }
const ownerKey = 'puesto.session.user'
const pendingKey = () => 'puesto.pending.' + sessionStorage.getItem(ownerKey)
export function pendingOperation(): Pending | null {
  const value = sessionStorage.getItem(pendingKey())
  return value ? (JSON.parse(value) as Pending) : null
}
export async function recoverPending() {
  const pending = pendingOperation()
  if (pending) await call(pending.key, pending.data)
}
export async function call<K extends Endpoint>(key: K, data: Input<K>): Promise<Output<K>> {
  const durable = key === 'payment' || key === 'purchase'
  const storageKey = durable ? pendingKey() : ''
  if (durable) {
    const pending = pendingOperation()
    if (pending && (pending.key !== key || JSON.stringify(pending.data) !== JSON.stringify(data)))
      throw Error('Recupera la operación pendiente antes de registrar otra compra o abono.')
    sessionStorage.setItem(storageKey, JSON.stringify({ key, data }))
  }
  const r = api[key],
    params = new URLSearchParams()
  if (r.verb === 'get')
    for (const [k, v] of Object.entries(data)) if (v !== undefined) params.set(k, String(v))
  const res = await fetch(
    '/api' + r.path + (params.size ? '?' + params : ''),
    r.verb === 'get'
      ? { cache: 'no-store', signal: key === 'status' ? AbortSignal.timeout(4500) : undefined }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
  )
  const body = await res.json()
  if (durable && (res.ok || [400, 404, 409].includes(res.status))) sessionStorage.removeItem(storageKey)
  if (key === 'status' && body.user) sessionStorage.setItem(ownerKey, String(body.user.id))
  if (!res.ok) {
    if (res.status === 401 && key !== 'login') window.dispatchEvent(new Event('sesion'))
    throw new HttpError(body.error ?? 'Error del servidor', res.status, body.code)
  }
  return body as Output<K>
}
export const message = (e: unknown) =>
  e instanceof TypeError || (e instanceof Error && e.name === 'TimeoutError')
    ? 'Sin respuesta del PC. Comprueba la conexión.'
    : e instanceof Error
      ? e.message
      : 'Error de operación.'
export function useRead<K extends Endpoint>(key: K, input: Input<K>, revision = 0) {
  const json = JSON.stringify(input)
  const [state, set] = useState<{ data?: Output<K>; error?: string; loading: boolean }>({
    loading: true,
  })
  useEffect(() => {
    let mounted = true
    set({ loading: true })
    call(key, JSON.parse(json))
      .then((data) => {
        if (mounted) set({ data, loading: false })
      })
      .catch((e) => {
        if (mounted) set({ error: message(e), loading: false })
      })
    return () => {
      mounted = false
    }
  }, [key, json, revision])
  return state
}
export const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)
export const time = (s: string | null) =>
  s
    ? new Date(s).toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : 'Abierta'
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
export const uid = () => crypto.randomUUID()
