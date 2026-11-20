import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BarChart3,
  Boxes,
  ChevronRight,
  ClipboardList,
  History,
  LogOut,
  Menu,
  Package,
  Radio,
  Settings2,
  ShieldCheck,
  ShoppingBasket,
  Smartphone,
  Store,
  Truck,
  Users,
  Wallet,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { Output } from '@puesto/shared'
import '@fontsource-variable/dm-sans'
import './style.css'
import { call, message, pendingOperation, recoverPending } from './client'
import { Field, Form, Notice, str } from './ui'
import { Sale } from './Sale'
import { Catalog, Inventory } from './Catalog'
import { Cash } from './Cash'
import { People } from './People'
import { Purchases, Reports, SalesHistory } from './Operations'
import { Network, Settings } from './Settings'
const navigation = [
  {
    id: 'sell',
    title: 'Punto de venta',
    group: 'Operación',
    icon: ShoppingBasket,
    description: 'Escanea productos, arma la cuenta y registra el cobro.',
  },
  {
    id: 'sales',
    title: 'Historial de ventas',
    group: 'Operación',
    icon: History,
    description: 'Consulta comprobantes, anulaciones y devoluciones.',
  },
  {
    id: 'cash',
    title: 'Caja',
    group: 'Operación',
    icon: Wallet,
    description: 'Aperturas, movimientos y cierres del turno.',
  },
  {
    id: 'products',
    title: 'Productos',
    group: 'Gestión',
    icon: Package,
    description: 'Administra las presentaciones y sus códigos de barras.',
  },
  {
    id: 'stock',
    title: 'Inventario',
    group: 'Gestión',
    icon: Boxes,
    description: 'Consulta existencias y registra ajustes con trazabilidad.',
  },
  {
    id: 'people',
    title: 'Clientes y fiados',
    group: 'Gestión',
    icon: Users,
    description: 'Consulta compras, registra abonos y revisa los saldos pendientes.',
  },
  {
    id: 'purchases',
    title: 'Compras',
    group: 'Gestión',
    icon: ClipboardList,
    admin: true,
    description: 'Registra la mercancía recibida de tus proveedores.',
  },
  {
    id: 'suppliers',
    title: 'Proveedores',
    group: 'Gestión',
    icon: Truck,
    admin: true,
    description: 'Administra los contactos que abastecen al negocio.',
  },
  {
    id: 'reports',
    title: 'Reportes',
    group: 'Administración',
    icon: BarChart3,
    admin: true,
    description: 'Consulta resultados y exporta los registros del negocio.',
  },
  {
    id: 'network',
    title: 'Acceso móvil',
    group: 'Administración',
    icon: Smartphone,
    admin: true,
    description: 'Conecta el celular al PC mediante HTTPS.',
  },
  {
    id: 'settings',
    title: 'Configuración',
    group: 'Administración',
    icon: Settings2,
    admin: true,
    description: 'Administra el negocio, los usuarios y las copias de seguridad.',
  },
]
function Brand() {
  return (
    <div className="brand">
      <img src="/marca.svg" alt="" />
      <b>
        Puesto<span>POS</span>
      </b>
    </div>
  )
}
function App() {
  const [status, setStatus] = useState<Output<'status'> | null>(null),
    [online, connect] = useState(true),
    [error, fail] = useState(''),
    [id, select] = useState('sell'),
    [mobile, drawer] = useState(false),
    [code, prefill] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      setStatus(await call('status', {}))
      connect(true)
      fail('')
    } catch (e) {
      connect(false)
      fail(message(e))
    }
  }, [])
  useEffect(() => {
    reload()
    const t = setInterval(reload, 6000)
    const offline = () => connect(false)
    window.addEventListener('online', reload)
    window.addEventListener('offline', offline)
    window.addEventListener('sesion', reload)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', reload)
      window.removeEventListener('offline', offline)
      window.removeEventListener('sesion', reload)
    }
  }, [reload])
  function go(key: string) {
    drawer(false)
    select(key)
    window.scrollTo(0, 0)
  }
  if (!status)
    return (
      <main className="splash">
        <Brand />
        <p>{error || 'Conectando con el PC…'}</p>
        {error && <button onClick={reload}>Reintentar</button>}
      </main>
    )
  const user = status.user
  if (!user) {
    const setup = !status.ready,
      local = ['localhost', '127.0.0.1'].includes(location.hostname)
    return (
      <div className="authpage">
        <div className="authbrand">
          <Brand />
          <div className="brandart" aria-hidden="true">
            <div />
            <div />
            <div />
          </div>
          <div className="authintro">
            <div className="localtag">
              <Radio size={15} /> Sistema local
            </div>
            <h1>Punto de venta</h1>
            <p>Ventas, caja e inventario de tu negocio.</p>
          </div>
          <div className="authfoot">
            <Store size={17} />
            {status.business}
            <span>Puesto POS · v{status.version}</span>
          </div>
        </div>
        <main className="login">
          <div className="authcard">
            <div className="appmark">
              <ShieldCheck size={25} />
            </div>
            <h2>{setup ? 'Crear administrador' : 'Iniciar sesión'}</h2>
            <p>
              {setup
                ? 'Configura la primera cuenta para abrir tu punto de venta.'
                : 'Ingresa con tu cuenta del negocio.'}
            </p>
            {setup && !local ? (
              <Notice bad>Crea la primera cuenta desde el PC principal.</Notice>
            ) : (
              <Form
                label={setup ? 'Crear cuenta' : 'Entrar al puesto'}
                submit={async (f) => {
                  await call(setup ? 'setup' : 'login', {
                    name: str(f, 'name'),
                    password: str(f, 'password'),
                  })
                  go('sell')
                  await reload()
                }}
              >
                <Field label="Usuario">
                  <input
                    autoFocus
                    name="name"
                    required
                    autoComplete="username"
                    placeholder="Nombre de usuario"
                    maxLength={140}
                  />
                </Field>
                <Field label="Contraseña">
                  <input
                    type="password"
                    name="password"
                    autoComplete={setup ? 'new-password' : 'current-password'}
                    minLength={setup ? 10 : 1}
                    maxLength={128}
                    placeholder={setup ? 'Mínimo 10 caracteres' : 'Tu contraseña'}
                    required
                  />
                </Field>
              </Form>
            )}
            <small>
              <i className={'dot ' + (!online ? 'off' : '')} />
              {online ? 'Conectado al PC' : 'Sin conexión al PC'}
            </small>
          </div>
        </main>
      </div>
    )
  }
  const pages = navigation.filter(
    (p) =>
      (!p.admin || user.role === 'admin') &&
      (p.id !== 'network' || ['127.0.0.1', 'localhost'].includes(location.hostname)),
  )
  const active = pages.find((p) => p.id === id) ?? pages[0],
    Icon = active.icon
  return (
    <div className="shell">
      {mobile && (
        <button className="overlay" aria-label="Cerrar navegación" onClick={() => drawer(false)} />
      )}
      <aside className={mobile ? 'open' : ''}>
        <Brand />
        <nav aria-label="Principal">
          {['Operación', 'Gestión', 'Administración'].map(
            (group) =>
              pages.some((p) => p.group === group) && (
                <section key={group}>
                  <h3>{group}</h3>
                  {pages
                    .filter((p) => p.group === group)
                    .map((p) => (
                      <button
                        key={p.id}
                        className={p.id === active.id ? 'active' : ''}
                        onClick={() => go(p.id)}
                      >
                        <p.icon size={18} />
                        {p.title}
                        {p.id === active.id && <i />}
                      </button>
                    ))}
                </section>
              ),
          )}
        </nav>
        <div className="identity">
          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <b>{user.name}</b>
            <small>{user.role === 'admin' ? 'Administrador' : 'Vendedor'}</small>
          </div>
          <button
            aria-label="Cerrar sesión"
            onClick={async () => {
              try {
                await call('logout', {})
                await reload()
                go('sell')
              } catch (e) {
                fail(message(e))
              }
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="top">
          <button className="mobiletoggle" onClick={() => drawer(true)} aria-label="Abrir navegación">
            <Menu size={20} />
          </button>
          <Store size={17} />
          <b>{status.business}</b>
          <ChevronRight size={14} />
          <span>{active.group}</span>
          <div className={'connection ' + (!online ? 'offline' : '')}>
            {online ? <Wifi size={15} /> : <WifiOff size={15} />}{' '}
            {online ? 'Conectado al PC' : 'Sin conexión al PC'}
          </div>
        </header>
        <div className="content">
          <div className="pagehead">
            <div className="moduleicon">
              <Icon size={23} />
            </div>
            <div>
              <h1>{active.title}</h1>
              <p>{active.description}</p>
            </div>
          </div>
          {!online && (
            <Notice bad>Se perdió la conexión al PC. El carrito se conserva en esta pestaña.</Notice>
          )}
          {error && online && <Notice bad>{error}</Notice>}
          {pendingOperation() && (
            <Notice bad>
              Hay una compra o un abono pendiente de confirmación.{' '}
              <button
                disabled={!online}
                onClick={async () => {
                  try {
                    await recoverPending()
                    location.reload()
                  } catch (e) {
                    fail(message(e))
                  }
                }}
              >
                Recuperar resultado
              </button>
            </Notice>
          )}
          {active.id === 'sell' ? (
            <Sale
              user={user}
              online={online}
              business={status.business}
              create={(s) => {
                prefill(s)
                go('products')
              }}
              goCash={() => go('cash')}
            />
          ) : active.id === 'products' ? (
            <Catalog user={user} initial={code} consume={() => prefill(null)} />
          ) : active.id === 'stock' ? (
            <Inventory user={user} />
          ) : active.id === 'cash' ? (
            <Cash />
          ) : active.id === 'people' || active.id === 'suppliers' ? (
            <People key={active.id} user={user} suppliers={active.id === 'suppliers'} />
          ) : active.id === 'purchases' ? (
            <Purchases />
          ) : active.id === 'reports' ? (
            <Reports />
          ) : active.id === 'sales' ? (
            <SalesHistory user={user} business={status.business} />
          ) : active.id === 'network' ? (
            <Network />
          ) : (
            <Settings reload={reload} version={status.version} />
          )}
        </div>
      </main>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
