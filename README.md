# Puesto POS

Punto de venta local para Windows x64 con acceso desde celulares en la misma red. El PC guarda una sola base SQLite y procesa todos los cobros. El celular acumula productos, muestra el total y obtiene el comprobante cuando el servidor confirma la venta. Moneda COP y comprobante no fiscal.

## Ejecutar desde el código

En Windows con Node **24.19.0 x64**, abre PowerShell en la raíz del proyecto.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

La primera instalación de dependencias y del runtime de Electron requiere internet. Para trabajar con el programa ya instalado, basta con abrir **Puesto POS** desde Inicio.

1. Crea el primer administrador en el PC. La contraseña tiene al menos diez caracteres.
2. En **Productos**, crea una presentación con su código completo y su precio. Para disponer de unidades, registra **Inventario → Ajustar stock** con el conteo inicial o confirma una compra de un proveedor.
3. Abre **Caja** con la base inicial. Crea los clientes que comprarán fiado en **Clientes y fiados**.
4. En **Punto de venta**, agrega productos, consulta la cuenta y pulsa **Ir a cobrar**. En una venta fiada, selecciona cliente y registra únicamente lo recibido. Los abonos posteriores se registran desde el historial del cliente.
5. Para usar la cámara del celular, completa la instalación del certificado y escanea el QR de **Acceso móvil**.

La instalación comienza vacía. Para practicar, un administrador puede elegir **Productos → Cargar productos de muestra** y confirmar la carga de tres presentaciones. Solo se admite con el catálogo vacío. Las pruebas crean sus propios datos en carpetas temporales. La aplicación conserva ventas, imágenes, cartera y existencias fuera de la carpeta instalada.

## Comandos

| Comando en la raíz | Resultado |
|---|---|
| `corepack pnpm dev` | Compilar y abrir Electron con el servicio supervisado |
| `corepack pnpm build` | Compilar interfaz, servicio y escritorio |
| `corepack pnpm serve` | Ejecutar el servicio compilado y usar el navegador en http://127.0.0.1:47830 |
| `corepack pnpm check` | Comprobar tipos TypeScript |
| `corepack pnpm test` | Probar API, dominio, TLS, escáner, respaldo y migraciones |
| `corepack pnpm exec playwright install chromium` | Instalar Chromium para las pruebas E2E |
| `corepack pnpm test:e2e` | Probar el frontend compilado en el navegador |
| `corepack pnpm dist:win` | Construir instalador local x64 en `release/` |
| `corepack pnpm release:win` | Firmar y publicar una distribución con los secretos configurados |

Ejecuta `build` antes de `serve` o `test:e2e`. El script de Playwright usa Edge instalado en Windows si está disponible fuera de CI. Para modificar el código, vuelve a ejecutar `dev` tras cerrar la ventana anterior.

## Guías

- [Arquitectura, modelo y reglas de negocio](docs/arquitectura.md)
- [Acceso móvil, certificados, firewall y prueba de cámara](docs/acceso-movil.md)
- [Persistencia, respaldos, restauración y recuperación](docs/operacion.md)
- [Instalador, firma y publicación mediante Git](docs/distribucion.md)
- [Contratos de la API y pruebas](docs/api-y-pruebas.md)

En una sesión de administrador, abre `/docs/` en el mismo navegador para consultar Swagger UI y `/docs/openapi.json` para obtener OpenAPI 3.1. El sistema opera en red local y emite comprobantes no fiscales. La integración DIAN queda fuera del alcance de esta versión.

