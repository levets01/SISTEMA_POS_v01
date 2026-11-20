# Arquitectura de Puesto POS

El PC es el único escritor. Electron supervisa un proceso de servicio con Express y SQLite. React sirve la misma aplicación en la ventana de escritorio y en el navegador móvil. El escritorio usa loopback. El teléfono usa HTTPS en la IPv4 privada seleccionada. Todos los recursos se distribuyen con el instalador.

Los contratos Zod del paquete compartido describen la entrada y salida HTTP. Presentación autentica sesiones y traduce errores. Aplicación coordina casos de uso con un puerto de almacenamiento y una unidad de trabajo. Dominio valida importes, cantidades y pagos. Infraestructura implementa SQL, migraciones, certificados y respaldos. Express y Electron quedan fuera del dominio.

## Modelo previo a la implementación

| Entidad | Responsabilidad |
|---|---|
| Usuarios y sesiones | Roles administrador y vendedor, credencial derivada y token de sesión con expiración |
| Productos y movimientos de inventario | Una presentación por código textual único, precio COP, existencia y libro de cambios |
| Clientes y movimientos de cartera | Compras a crédito, deuda inicial, abonos y compensaciones con referencia al origen |
| Ventas y líneas | Cantidades enteras, nombre y precio históricos, cliente opcional y cantidades devueltas |
| Caja y movimientos | Un turno abierto por negocio, ingresos y egresos firmados, medio y origen |
| Proveedores, compras y líneas | Recepción atómica e incremento de existencias |
| Operaciones y auditoría | Clave de reintento, carga original, respuesta y actor |
| Configuración y respaldos | Datos del negocio, retención e historial persistente de copias |

Una venta adquiere el bloqueo de escritura antes de validar existencias. Sus líneas, movimientos de stock, recaudos y deuda se confirman juntos. Una devolución compensa primero la deuda pendiente atribuible a la venta y devuelve el remanente por el medio elegido. Los abonos se aplican a las deudas más antiguas primero.

Los importes se expresan en pesos enteros. Los reportes usan el día comercial colombiano. El carrito pendiente vive en el navegador y conserva la clave de confirmación para recuperar la respuesta después de un corte. Las fotos opcionales forman parte del respaldo SQLite. Las credenciales TLS pertenecen a la instalación local y se mantienen separadas de los datos comerciales.

## Implementación y límites

La capa de aplicación se divide en catálogo, inventario, ventas, caja, cartera y compras bajo `apps/api/src/modules`. Los repositorios SQLite de catálogo, ventas, cartera y caja comparten la conexión que administra la unidad de trabajo. Una transacción `BEGIN IMMEDIATE` abarca sus escrituras. Los lectores de reportes e historiales tienen consultas específicas en infraestructura. El registro de rutas común aplica validación, sesión y permisos antes de llamar a cada módulo.

SQLite registra la versión en `PRAGMA user_version` y la identidad en `application_id`. El esquema 1 crea tablas y restricciones. El esquema 2 añade índices. El diario WAL, las claves foráneas y el modo síncrono FULL se activan al abrir. Cada confirmación guarda el UUID, usuario, tipo de operación, huella del cuerpo validado y respuesta dentro del mismo commit. Una repetición devuelve el comprobante anterior. Reutilizar el UUID con otra carga genera conflicto.

El nombre del cliente es obligatorio y el teléfono es opcional. Se permite un turno global compartido por los dispositivos. Un cargo de cartera se compensa con registros de signo opuesto vinculados al asiento original. Las devoluciones se aplican contra el saldo pendiente de esa venta y limitan el reembolso a los cobros realizados. Cada presentación conserva su propio código y solo admite unidades enteras.

El lockfile fija las versiones resueltas. Se usan Node 24.19.0 x64 con SQLite incorporado, Express 5, React 19, Vite 8, Zod 4, Electron 45, electron-builder 26 y electron-updater 6. El servicio nativo se empaqueta junto a Electron. El navegador inicia el decodificador ZXing bajo demanda y carga sus archivos desde el PC.

