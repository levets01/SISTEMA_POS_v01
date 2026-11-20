# Persistencia y recuperación

## Ubicación

Electron deriva el directorio del negocio de `app.getPath('userData')`. En Windows, normalmente queda en `%APPDATA%\Puesto POS\datos`. **Acceso móvil** muestra la ruta efectiva. El modo de navegador independiente usa por defecto `%LOCALAPPDATA%\Puesto POS\datos`. Para compartir los datos entre modos usa el mismo directorio con un único proceso de servicio. Desarrollo y pruebas deben tener sus propias carpetas.

Para elegir otra ubicación, cierra la aplicación y crea `ubicacion.json` en el directorio `userData`. Asegura que solo la cuenta Windows del negocio tenga acceso de escritura. Ejemplo con las dos opciones disponibles:

```json
{"dataDir":"D:\\DatosPuesto","ip":"192.168.1.20"}
```

Ambas propiedades son opcionales. Una ubicación nueva y vacía inicia un negocio vacío. Para trasladar datos, crea una copia y verifica su historial antes de cerrar. Traslada la carpeta del negocio **con el servicio detenido** o restaura el respaldo verificado. Conserva o vuelve a instalar la confianza TLS según el equipo. Usa disco local para la base activa. La copia externa admite USB u otra carpeta.

En desarrollo se pueden fijar `PUESTO_DATA`, `PUESTO_LAN_IP`, `PUESTO_PORT`, `PUESTO_HTTPS_PORT` y `PUESTO_LOOPBACK_ONLY=1`. Evita el repositorio y la carpeta de instalación como destino de datos. Los puertos por defecto son 47830 en loopback y 47831 en la IPv4 privada.

## Copias y restauración

**Configuración → Respaldos → Respaldar ahora** genera una instantánea SQLite, la abre de solo lectura y comprueba integridad, referencias y versión. Se escribe primero un archivo parcial. Solo una copia verificada se renombra con extensión `.sqlite`. Las imágenes de producto están dentro de la copia. La CA y sus claves quedan en la instalación del PC.

Se utiliza `VACUUM INTO` sobre la conexión viva. SQLite produce una instantánea consistente con WAL activo. Las copias también se generan al cerrar caja, antes de aplicar migraciones a un esquema existente y antes de instalar una actualización. [Mecanismo de instantáneas de SQLite](https://www.sqlite.org/lang_vacuum.html#vacuum_with_an_into_clause)

Configura en **Negocio** la cantidad de copias locales a conservar y la carpeta para una segunda copia. La rotación solo afecta a los archivos de respaldo generados en la carpeta local. El propietario gestiona el espacio y la custodia del medio externo. Una copia en el mismo disco ayuda a corregir errores operativos. Una segunda copia en otro dispositivo permite recuperar el negocio tras perder el PC. Protege el disco y los USB mediante controles de acceso y cifrado de Windows cuando corresponda.

El historial en `respaldos.jsonl` conserva fecha, ubicación y resultado, incluso después de una restauración. Una entrada histórica puede referirse a un archivo ya rotado. Si falla una copia al cierre, el turno ya cerrado conserva su conteo. La interfaz informa del fallo. Corrige la ubicación y genera una copia manual.

**Restaurar** requiere administrador en el PC. Puedes elegir una copia del historial o introducir la ruta absoluta de una copia externa. Verifica que corresponde al negocio deseado antes de confirmar. Se validan integridad, claves foráneas, identificador de aplicación, versión y estructura. Se respalda el negocio actual. Una transacción exclusiva reemplaza los registros, invalida todas las sesiones y comprueba su consistencia. Si hay un fallo antes del commit, se conserva el estado anterior. Después de restaurar, usa las credenciales existentes en la copia. El historial de respaldos registra el resultado.

## Incidentes

- **Migración fallida o esquema más reciente.** El servicio se cierra antes de aceptar operaciones. Las modificaciones de una migración fallida revierten juntas. Conserva el directorio completo con el proceso detenido, incluida la copia previa. Revisa espacio, permisos y disponibilidad del disco de respaldo. Reintenta con el binario compatible corregido.
- **Recuperación desde un esquema anterior.** Conserva intacta la copia original. Configura una carpeta nueva y vacía, coloca allí una copia verificada como `negocio.sqlite` con el POS detenido y arranca una versión que soporte migrar ese esquema. Creará otra copia antes de migrar. Verifica ventas, saldos y existencias antes de usarla como carpeta operacional.
- **Reversión del programa.** Reinstalar un binario antiguo no revierte el esquema. Para volver a una versión anterior se requiere un respaldo compatible y una evaluación de las operaciones posteriores que quedarían fuera de esa copia.
- **Pérdida del equipo.** Instala una distribución de confianza. Configura una carpeta nueva y restaura la copia externa. Genera una nueva CA en ese equipo y actualiza la confianza de los celulares. El comprobante del último cierre ayuda a cotejar el efectivo y los saldos.
- **Puerto ocupado o red seleccionada ausente.** Cierra la otra instancia o corrige el adaptador en la configuración. Comprueba el diagnóstico de inicio antes de cambiar datos.

