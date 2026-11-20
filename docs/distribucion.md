# Instalación y publicación

## Compilación

Desde un checkout limpio usa Node 24.19.0 x64 y Corepack. Ejecuta `corepack pnpm install --frozen-lockfile`, `corepack pnpm check`, `corepack pnpm test`, `corepack pnpm build` y `corepack pnpm test:e2e`. Después, `corepack pnpm dist:win` genera el instalador NSIS local. Este perfil sirve para validación y deshabilita el canal de actualizaciones firmado. Para clientes, distribuye el artefacto del perfil de publicación firmado.

El instalador incluye Electron, los recursos de React, Swagger, el motor de lectura y el runtime Node x64 con su licencia. El backend usa el módulo nativo **node:sqlite** del mismo runtime distribuido en `resources/runtime/node.exe`. Electron inicia ese proceso y supervisa sus salidas. Esta decisión evita mezclar ABI de extensiones nativas de Node y Electron. El cliente final puede usar el POS sin instalar Node, pnpm, Git, un servidor SQLite ni herramientas para emitir certificados.

Para pasar de una instalación de evaluación sin firma a la primera distribución firmada, crea y verifica una copia externa, cierra el POS, desinstala el programa de evaluación e instala la distribución firmada del propietario. El desinstalador conserva el directorio de datos. Verifica el negocio antes de retomar la caja.

## Configurar el canal del propietario

1. Asocia este repositorio a tu origen en GitHub y configura el entorno de Actions **distribucion**. El repositorio de Releases debe ser públicamente legible por los clientes. Si el código fuente es privado, usa un repositorio público separado, en `POS_RELEASE_REPO` con formato `propietario/repositorio`.
2. Proporciona un certificado Authenticode de firma de código admitido por Windows y un mecanismo de sellado de tiempo accesible al constructor. Este perfil de CI admite material **PFX** disponible legal y técnicamente para tu sistema de firma. Un certificado con clave exclusiva en HSM o un servicio de firma requiere adaptar el paso de firma del constructor al proveedor antes de publicar.
3. Configura los secretos `WIN_CSC_LINK` (PFX codificado en base64 o ubicación segura admitida por electron-builder) y `WIN_CSC_KEY_PASSWORD`. Configura la variable `POS_PUBLISHER` con el nombre simple exacto del editor en el certificado. La app compara el firmante y exige estado Authenticode válido. La distribución inicial también debe llegar por un canal confiable.
4. El token temporal de Actions necesita permiso de escritura de contenido en el repositorio de Releases. Si es un repositorio distinto, proporciona `POS_RELEASE_TOKEN` como secreto de CI limitado a ese destino. Los clientes consultan Releases públicos. Ninguna credencial de GitHub debe incluirse en el artefacto.
5. Protege tags y el entorno de publicación. Prueba el canal primero en una instalación independiente con datos de prueba.

## Publicar y actualizar

Cambia la versión de `package.json`, confirma los cambios y publica un tag coincidente, por ejemplo `v1.1.0`. El flujo valida tipos, pruebas unitarias, API y navegador en Windows. Solo el trabajo de tags firma y publica instalador, blockmap y `latest.yml`. Un push común no instala automáticamente código en el computador del cliente. El cliente no ejecuta `git pull`.

En **Configuración → Actualizaciones**, el administrador consulta la versión, descarga y decide cuándo instalar. Puede seguir trabajando después de descargar. La instalación requiere un respaldo verificado. Mientras se prepara, el backend bloquea escrituras y rechaza el inicio si existe una operación en curso. Al reiniciar, abre el directorio persistente y ejecuta migraciones pendientes antes de atender solicitudes.

Para actualizar sin internet, lleva a una carpeta del PC o USB los archivos de la misma Release firmada, incluidos `latest.yml`, el instalador y su blockmap. Inicia **Instalar desde carpeta** desde la aplicación instalada. Se sirve el paquete temporalmente en loopback con una ruta aleatoria. El mismo actualizador comprueba versión, SHA-512, firma Authenticode y editor. La comprobación de confianza de Windows debe poder validar la cadena del certificado en ese PC. Si falla, se bloquea la instalación. El instalador detecta una instalación existente y exige haber iniciado el flujo de actualización desde el POS.

Las versiones se distribuyen como incrementos semánticos. Las migraciones se respaldan y ejecutan en una transacción. Un fallo bloquea el arranque operativo. Consulta [recuperación y compatibilidad](operacion.md). Para cambiar de certificado, prepara primero una versión puente firmada con la identidad ya confiada y adapta la lista de editores si el nombre cambia.

La firma de producción, la confianza de Windows y la actualización real entre dos Releases del propietario requieren su certificado y un repositorio de publicación. [Actualizaciones con electron-builder](https://www.electron.build/v26/auto-update.html) · [Firma y configuración Windows](https://www.electron.build/v26/docs/win/)

