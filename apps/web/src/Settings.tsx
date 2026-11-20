import { useState } from 'react'
import { Database, Plus, Smartphone } from 'lucide-react'
import { call, message, time, useRead } from './client'
import { Amount, Field, Form, Modal, Notice, num, Panel, ReadState, str, Table, Text } from './ui'
const desktop = location.hostname === '127.0.0.1' || location.hostname === 'localhost'
export function Network() {
  const data = useRead('network', {})
  return (
    <Panel title="Conectar un celular" action={<Smartphone size={22} />}>
      <ReadState state={data} />
      {data.data && (
        <>
          {data.data.url ? (
            <div className="network">
              <img src={data.data.qr} alt="QR de acceso al POS por HTTPS" />
              <div>
                <h3>Acceso por wifi</h3>
                <p>
                  Conecta ambos equipos a la misma red privada. Instala el certificado público en el
                  celular y comprueba su huella antes de escanear el QR.
                </p>
                <strong>{data.data.url}</strong>
              </div>
            </div>
          ) : (
            <p>
              Conecta el PC a una red privada y reinicia la aplicación para obtener una dirección móvil.
            </p>
          )}
          <dl>
            <dt>Certificado público para el celular</dt>
            <dd>{data.data.caPath || 'Pendiente de conexión wifi'}</dd>
            <dt>Huella SHA-256</dt>
            <dd>
              <code>{data.data.fingerprint || '—'}</code>
            </dd>
            <dt>Directorio de datos</dt>
            <dd>{data.data.dataDir}</dd>
          </dl>
          <a className="button" href="/manual/acceso-movil.md" download="Acceso móvil Puesto POS.txt">
            Descargar guía de conexión
          </a>
        </>
      )}
    </Panel>
  )
}
export function Settings({ reload, version }: { reload: () => void; version: string }) {
  const [rev, set] = useState(0),
    [tab, select] = useState('business'),
    [modal, open] = useState(''),
    [restore, choose] = useState(''),
    [notice, say] = useState(''),
    [error, fail] = useState(''),
    [busy, lock] = useState(false)
  const cfg = useRead('config', {}, rev),
    users = useRead('users', {}, rev),
    backups = useRead('backups', {}, rev)
  async function action(fn: () => Promise<string>) {
    if (busy) return
    lock(true)
    fail('')
    say('')
    try {
      say(await fn())
      set(rev + 1)
    } catch (e) {
      fail(message(e))
    } finally {
      lock(false)
    }
  }
  return (
    <div className="stack">
      <div className="tabs wrap">
        {Object.entries({
          business: 'Negocio',
          users: 'Usuarios',
          backups: 'Respaldos',
          ...(desktop ? { update: 'Actualizaciones' } : {}),
        }).map(([k, v]) => (
          <button
            key={k}
            onClick={() => {
              select(k)
              say('')
              fail('')
            }}
            className={tab === k ? 'selected' : ''}
          >
            {v}
          </button>
        ))}
      </div>
      <Notice>{notice}</Notice>
      <Notice bad>{error}</Notice>
      {tab === 'business' && (
        <Panel title="Configuración del negocio">
          <ReadState state={cfg} />
          {cfg.data && (
            <Form
              key={rev}
              submit={async (f) => {
                await call('saveConfig', {
                  business: str(f, 'business'),
                  retention: num(f, 'retention'),
                  exportDir: str(f, 'exportDir'),
                })
                set(rev + 1)
                say('Configuración guardada.')
                reload()
              }}
            >
              <Text name="business" label="Nombre comercial" value={cfg.data.business} required />
              <Amount
                name="retention"
                label="Cantidad de respaldos locales a conservar"
                min={1}
                value={cfg.data.retention}
              />
              <Field label="Carpeta adicional para copias (por ejemplo, USB)">
                <input
                  name="exportDir"
                  defaultValue={cfg.data.exportDir}
                  placeholder="E:\RespaldosPOS"
                />
              </Field>
              <p className="muted">Moneda COP · Versión {version}</p>
            </Form>
          )}
        </Panel>
      )}
      {tab === 'users' && (
        <Panel
          title="Usuarios"
          action={
            <button className="primary" onClick={() => open('user')}>
              <Plus size={16} /> Nuevo usuario
            </button>
          }
        >
          <ReadState state={users} />
          <Table
            headers={['Nombre', 'Rol']}
            rows={(users.data ?? []).map((u) => [
              u.name,
              u.role === 'admin' ? 'Administrador' : 'Vendedor',
            ])}
          />
        </Panel>
      )}
      {tab === 'backups' && (
        <Panel
          title="Historial de respaldos"
          action={
            <button
              disabled={busy}
              className="primary"
              onClick={() =>
                action(async () => 'Respaldo verificado · ' + (await call('backup', {})).file)
              }
            >
              <Database size={16} /> Respaldar ahora
            </button>
          }
        >
          <ReadState state={backups} />
          {desktop && (
            <button
              onClick={() => {
                choose('')
                open('restore')
              }}
            >
              Restaurar desde archivo…
            </button>
          )}
          <Table
            headers={['Fecha', 'Operación', 'Resultado', 'Ubicación', '']}
            rows={(backups.data ?? []).map((b) => [
              time(b.created),
              b.action,
              b.result,
              <span className="filepath">{b.location}</span>,
              desktop && b.result === 'Correcto' && !b.action.startsWith('Restauración') ? (
                <button
                  onClick={() => {
                    choose(b.location)
                    open('restore')
                  }}
                >
                  Restaurar
                </button>
              ) : (
                ''
              ),
            ])}
          />
        </Panel>
      )}
      {tab === 'update' && (
        <Panel title={'Puesto POS ' + version}>
          <p>
            Comprueba la disponibilidad de una versión firmada. Puedes descargarla y elegir el momento de
            instalarla.
          </p>
          <div className="actions">
            {(['check', 'download', 'install', 'manual'] as const).map((a, i) => (
              <button
                disabled={busy}
                key={a}
                onClick={() =>
                  a === 'install' || a === 'manual'
                    ? open(a)
                    : action(async () => (await call('update', { action: a })).message)
                }
              >
                {['Buscar versión', 'Descargar', 'Instalar descarga', 'Instalar desde carpeta'][i]}
              </button>
            ))}
          </div>
        </Panel>
      )}
      {modal === 'user' && (
        <Modal title="Nuevo usuario" close={() => open('')}>
          <Form
            submit={async (f) => {
              await call('user', {
                name: str(f, 'name'),
                password: str(f, 'password'),
                role: str(f, 'role') as 'admin' | 'seller',
              })
              open('')
              set(rev + 1)
              say('Usuario creado.')
            }}
          >
            <Text name="name" label="Nombre de usuario" required />
            <Field label="Contraseña (mínimo 10 caracteres)">
              <input
                required
                name="password"
                type="password"
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Rol">
              <select name="role">
                <option value="seller">Vendedor</option>
                <option value="admin">Administrador</option>
              </select>
            </Field>
          </Form>
        </Modal>
      )}
      {modal === 'restore' && (
        <Modal title="Restaurar datos del negocio" close={() => open('')}>
          <p>
            La aplicación respaldará el estado actual, reemplazará los datos por la copia seleccionada y
            cerrará todas las sesiones.
          </p>
          <Form
            label="Confirmar restauración"
            submit={async (f) => {
              await call('restore', { file: str(f, 'file') })
              location.reload()
            }}
          >
            <Field label="Ruta completa o nombre del respaldo">
              <input name="file" defaultValue={restore} required />
            </Field>
          </Form>
        </Modal>
      )}
      {(modal === 'install' || modal === 'manual') && (
        <Modal title="Instalar actualización" close={() => open('')}>
          <p>Se verificarán el respaldo y la firma antes de reiniciar la aplicación.</p>
          <Form
            label="Continuar"
            submit={async () => {
              const r = await call('update', { action: modal as 'manual' | 'install' })
              say(r.message)
              open('')
            }}
          />
        </Modal>
      )}
    </div>
  )
}
