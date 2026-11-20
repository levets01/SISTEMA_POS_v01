# Acceso desde el celular

## Preparar el PC

Conecta el PC y el celular a la misma red privada de confianza. Mantén el PC encendido con Puesto POS abierto. Evita la red de invitados con aislamiento entre clientes. Conviene reservar la dirección del PC en el DHCP del router. La aplicación escucha HTTP únicamente en loopback y HTTPS en una IPv4 privada específica.

**Acceso móvil** muestra la URL real, un QR, la ruta del certificado público y su huella SHA-256. El QR contiene la dirección del POS. La CA local se genera en el primer inicio con red privada. La clave RSA se guarda en el perfil del usuario de Windows. El certificado del servidor contiene la IP en su extensión SAN y se renueva al arrancar cuando cambia la IP o faltan siete días para su vencimiento. Se conserva la misma CA.

## Instalar la confianza

1. Desde el PC, transfiere únicamente **Puesto-POS-CA.crt** al celular por USB, AirDrop u otro canal local de confianza. La carpeta también contiene claves privadas de la instalación que deben permanecer en el PC.
2. En Android, abre los ajustes de seguridad y busca **Instalar certificado → Certificado de CA**. La ruta exacta depende del fabricante. Selecciona el archivo y confirma el bloqueo de pantalla si el sistema lo pide. Comprueba la huella en los detalles del certificado.
3. En iPhone, abre el certificado, instala el perfil desde Ajustes y revisa sus detalles. En **General → Información → Ajustes de confianza de certificados**, habilita la confianza total para esa CA. Verifica la huella con la mostrada en el PC.
4. Escanea el QR de **Acceso móvil** con la cámara del teléfono, abre el sitio y comprueba que no aparezca una advertencia de certificado. Inicia sesión. En **Punto de venta**, pulsa **Escanear producto** y permite usar la cámara.

Las políticas MDM de una organización pueden requerir que su administrador instale el perfil. Si cambias la red o la IP, reinicia el POS y consulta el nuevo QR. Si se pierde o compromete una clave de la CA, cierra el POS, retira su confianza de cada teléfono, conserva la evidencia necesaria y regenera la carpeta TLS y la confianza. Los certificados locales del POS y el certificado Authenticode del instalador tienen funciones independientes.

Los navegadores exigen un contexto seguro para solicitar cámara. Se sirven localmente el decodificador ZXing, la interfaz y las fuentes. [Documentación de getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) · [Confianza de certificados en iOS](https://support.apple.com/en-us/102390) · [ZXing Browser](https://github.com/zxing-js/browser)

## Firewall y selección de red

En Windows, marca la red de confianza como **Privada** en la configuración de Wi-Fi o Ethernet. Comprueba el perfil con `Get-NetConnectionProfile`. Si el firewall bloquea el acceso, un administrador de Windows puede añadir esta regla en PowerShell. Cambia la IP de ejemplo por la de **Acceso móvil**.

```powershell
New-NetFirewallRule -DisplayName "Puesto POS HTTPS local" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 47831 -LocalAddress 192.168.1.20 -RemoteAddress LocalSubnet -Profile Private
```

El instalador deja la decisión de firewall al propietario del PC. Usa exclusivamente la subred privada. Mantén desactivados el reenvío de puertos y los túneles públicos. Para retirar la regla, usa `Remove-NetFirewallRule -DisplayName "Puesto POS HTTPS local"`.

Cuando hay adaptadores VPN o virtuales, fija la IPv4 de wifi en `ubicacion.json` según la guía de operación. Si se inicia sin wifi, el escritorio sigue disponible. Conecta la red y reinicia para activar HTTPS móvil.

## Validación en equipos físicos

Repite en Chrome Android y Safari iPhone. Usa etiquetas EAN-13, EAN-8, UPC-A, UPC-E y Code 128 conocidas, incluida una con ceros iniciales. Registra antes los códigos que emite el lector para cada presentación.

- Comprueba el certificado sin excepciones y concede cámara solo al pulsar el botón.
- Enfoca A, mantenlo quieto cuatro segundos y verifica cantidad 1. Retíralo durante aproximadamente un segundo y vuelve a mostrarlo. Debe pasar a 2. Alterna A y B y compara los subtotales con las etiquetas.
- Prueba un código desconocido, poca luz, inclinación y una pérdida breve de enfoque. La lectura se rearma tras varios cuadros consecutivos sin detección durante al menos 650 ms. Una pérdida prolongada de visibilidad puede parecer una retirada física. Los controles de cantidad permiten corregir la cuenta.
- Comprueba que el indicador de cámara se apague al cerrar el escáner, cambiar de pantalla o pasar al fondo. Prueba volver tras denegar permiso. No se almacenan imágenes ni vídeo de la cámara.
- Desconecta el wifi con un carrito abierto. Comprueba el aviso, reconecta y verifica que la cuenta persista en la misma pestaña. Reintenta una confirmación interrumpida y compara el número de comprobante con el historial del PC.
- En el PC, enfoca el campo de código para un lector USB configurado con sufijo Enter. El campo manual se envía completo al pulsar Enter.

