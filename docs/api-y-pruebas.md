# API y comprobaciones

## Contratos HTTP

La raíz es `/api`. `GET /status` informa si el negocio tiene administrador y si hay una sesión válida. `POST /setup` crea la primera cuenta una sola vez desde loopback. `POST /login` establece la cookie de sesión HttpOnly, Secure y SameSite=Strict con vencimiento de doce horas. El servidor almacena una huella del token. `POST /logout` la invalida. Las contraseñas se derivan con scrypt y sal aleatoria.

Los contratos de `packages/shared` generan OpenAPI 3.1. Express valida tanto entradas como respuestas. Swagger UI se incluye en el paquete y requiere sesión administrativa. Abre `http://127.0.0.1:47830/docs/` después de iniciar sesión en ese navegador. En el teléfono usa el mismo origen HTTPS del POS. Los permisos se aplican en cada petición.

| Operación | Acceso |
|---|---|
| Venta, caja, clientes, lectura de productos y cartera, abonos | Vendedor o administrador |
| Escritura de productos, inventario, proveedores, compras, reversiones, reportes, datos de muestra y configuración | Administrador |
| Restauración, conexión móvil y actualización | Administrador en el PC |
| Primer administrador | PC antes de inicializar el negocio |

Las listas paginadas admiten `limit` de 1 a 200, por defecto 50, y `offset` desde 0. Un resultado corto indica la última página. Catálogo y directorios permiten `q`. Los filtros por cliente, turno y producto aparecen en el contrato del recurso. Las fechas de los reportes son días de Colombia con extremos incluidos. Existencias y mínimos reflejan el momento de consulta. Cartera usa el saldo al final del día seleccionado.

### Venta fiada con abono inicial

Este cuerpo corresponde a `POST /api/sales` con caja abierta, cliente 3, producto 9 disponible y precio vigente de 15.000 COP. Transmite el UUID una sola vez por intención de cobro y reutilízalo con el mismo cuerpo si se pierde la respuesta.

```json
{
  "key": "e52cc931-506d-4b3b-a423-73e398711ee9",
  "customerId": 3,
  "lines": [{"productId": 9, "qty": 2, "price": 15000}],
  "cash": 10000,
  "transfer": 0,
  "credit": true
}
```

La respuesta 200 contiene `sale` y `lines`. El comprobante conserva `total=30000`, `cash=10000`, `credit=20000`, el detalle y el precio histórico. Para registrar 5.000 COP posteriores, envía a `POST /api/debts/pay` un UUID nuevo, el cliente 3, `amount=5000` y `method="cash"` o `"transfer"`. Queda un saldo de 15.000. Los reportes de ventas solo consideran ventas y devoluciones. Los recaudos se desglosan por origen y medio.

Consulta un código completo mediante `GET /api/barcode?code=00012348`. El código es texto desde la entrada hasta SQLite. El listado de nombres usa `GET /api/products?q=pan&limit=40&offset=0`. El CSV usa la misma consulta que el reporte y entrega UTF-8 con BOM y separador de punto y coma. Se protegen los campos de texto que Excel interpretaría como fórmulas.

Los errores contienen `code` y `error`. Los estados habituales son 400 para datos inválidos, 401 para sesión inválida, 403 para permisos insuficientes, 404 para un código ausente, 409 para conflictos de negocio o claves reutilizadas con otro cuerpo, 429 para demasiados intentos y 503 durante mantenimiento. Tras un fallo de red al confirmar una venta, el carrito conserva el cuerpo y el UUID en sessionStorage. Vuelve a abrir la misma pestaña y usa **Reintentar confirmación**. Cerrar la pestaña puede descartar su almacenamiento temporal. Ante duda, consulta el historial antes de volver a cobrar.

## Pruebas reproducibles

- **Vitest** abre SQLite en directorios temporales y ejercita Express a través de HTTP. Verifica contado y pago mixto, fiado de 30.000, abonos de 10.000 y 5.000, sobreabonos, devoluciones, precios históricos, permisos, reintentos y dos sesiones compitiendo por una unidad. Una prueba provoca un fallo real al insertar el último asiento y verifica que toda la venta se revierta.
- **Persistencia** verifica recepción única de una compra, respaldo manual y al cierre, restauración y revocación de sesiones. Una base con esquema v1 y ventas, clientes, existencias y deuda se abre con v2. Se comprueba el respaldo pre-migración, el rechazo de copias incompatibles y el rollback de una migración interrumpida.
- **HTTPS** negocia una conexión con la CA generada. La prueba comprueba el rechazo sin esa CA, la aceptación con ella y la reemisión al cambiar la IP.
- **Escáner** usa un adaptador simulado para probar secuencias completas, cuadros perdidos, rearme, cantidades, cierre y ceros iniciales. Playwright además dibuja barras EAN-8 en un flujo de vídeo sintético que atraviesa el decodificador ZXing real.
- **Playwright** crea el administrador y el catálogo por interfaz, ajusta existencias, abre caja, registra desde un segundo navegador con tamaño móvil, corta la red, pierde deliberadamente la respuesta de un cobro y recupera el comprobante. Verifica un solo registro y el cierre con respaldo.
- **Escritorio** ofrece `node tests/desktop-smoke.mjs` después de generar el instalador. Ejecuta el binario empaquetado dos veces con un perfil temporal y verifica el servicio incluido y la persistencia entre arranques.

Otro recorrido de Playwright recibe una compra de un proveedor, vende dos unidades fiadas y registra el abono posterior desde el historial del cliente. Verifica los 15.000 COP pendientes y el efectivo separado de la transferencia.

Las pruebas de navegador requieren el frontend compilado. Mantén libres los puertos de prueba 48732, 48735 y 48736. Para la cámara física y la instalación de la CA, usa el protocolo en [acceso móvil](acceso-movil.md). Para una distribución de producción valida además una actualización online y otra por USB entre dos versiones firmadas, la cancelación de descarga, el rechazo de un paquete modificado y la recuperación de una copia externa en un PC distinto.

