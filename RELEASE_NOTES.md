# SiteKeep v0.1.0

Primera release de SiteKeep para Chromium 130 o superior. Es una extensión independiente de CookieKeep: protege sitios completos y limpia datos de sitios no protegidos con procesamiento local.

## Incluye

- Protección por hostname y subdominios, con prioridad sobre cada limpieza. El popup permite proteger el sitio actual, borrar sus datos si no está protegido y abrir el dashboard con un botón verde destacado.
- Dashboard con «Limpiar todo» junto a «Actualizar», acciones por sitio, vista previa manual y limpieza automática por intervalo o al cerrar la última ventana normal.
- Limpieza reciente global para cookies observadas por SiteKeep en la última 1, 2 o 24 horas. «Limpiar selección» y «Dry run» usan el periodo elegido; «Limpiar todo» lo ignora.
- Orden por visitas de 7, 30 o 90 días, o todo el historial disponible. El permiso de historial es opcional y se solicita al elegir «Más visitados».
- Estimación parcial de espacio liberable por sitio, coherente con el KPI y calculada solo a partir de cookies eliminables.

## Garantías y límites

Cada confirmación manual permanece dentro de la vista previa revisada y revalida la protección. La limpieza automática calcula candidatos actuales. La limpieza reciente no incluye cookies sin observación temporal ni caché o almacenamiento. Con cualquier sitio protegido, SiteKeep omite los tipos gestionados por `browsingData` para evitar un posible alcance a datos de terceros incrustados. Los orígenes sin pestaña ni cookie pueden quedar fuera del inventario. El espacio liberable no representa el tamaño físico completo de un sitio.

No hay telemetría ni envío de navegación. Las pruebas usan APIs simuladas; no se han ejecutado limpiezas sobre el perfil normal del navegador. Consulte [CAPABILITIES.md](CAPABILITIES.md) y [HANDOFF.md](HANDOFF.md) para detalles técnicos y continuidad.

Validación de esta release: 42 pruebas aprobadas, build correcto y paquete verificado contra sus 24 archivos de runtime mediante SHA-256. Queda pendiente una revisión visual en un perfil aislado de Chromium.

## Instalación

Descargue `SiteKeep-v0.1.0-chromium.zip`, compruebe su SHA-256 con el archivo de checksum adjunto, descomprímalo y cargue la carpeta mediante **Cargar descomprimida** en `chrome://extensions`. Pruebe las acciones de limpieza en un perfil de navegador aislado.
