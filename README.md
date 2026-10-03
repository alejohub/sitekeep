# SiteKeep

Extensión Chromium Manifest V3 para **proteger los sitios importantes y limpiar datos de los demás**. Funciona localmente, sin cuentas, telemetría ni servidores propios. La versión se obtiene de `manifest.json`.

## Uso

- En el popup, **Proteger sitio** conserva el sitio actual y sus subdominios. **Quitar protección** permite incluirlo de nuevo en una limpieza. **Borrar datos de este sitio** solo está disponible si no está protegido.
- En el dashboard se gestionan sitios protegidos, se ordenan sitios por cookies, nombre o visitas y se consulta la vista previa antes de una limpieza manual.
- **Limpiar todo**, junto a «Actualizar», significa borrar los datos gestionados de sitios no protegidos descubiertos. Nunca ejecuta un borrado global de todo el navegador.
- La limpieza automática puede estar desactivada, programarse cada 24 horas, 3 días o 7 días, o ejecutarse al cerrar la última ventana normal. Recalcula candidatos y protección en cada ejecución.
- La **limpieza reciente** ofrece 1 hora, 2 horas y 24 horas. «Limpiar selección» y «Dry run» se aplican globalmente a los sitios no protegidos y usan ese intervalo; solo incluyen cookies cuya creación o modificación SiteKeep haya observado durante el periodo. Caché y almacenamiento no participan en esta modalidad.
- **Más visitados** pide el permiso opcional de historial al seleccionarse. Si se deniega, el resto del dashboard funciona normalmente.

**Espacio liberable** es una estimación parcial de bytes de cookies que el plan actual considera eliminables. Cada cookie se asigna a una sola fila, por lo que la suma de las filas coincide con el KPI. No incluye tamaños de caché ni almacenamiento, que Chromium no proporciona por origen de forma fiable.

## Progreso de limpieza

Popup y dashboard muestran el progreso de todas las limpiezas: completas, por sitio, recientes y automáticas cuando hay una página abierta. El porcentaje cuenta operaciones reales del plan revalidado: una por cookie candidata y una por llamada de caché/almacenamiento para cada origen. Chromium no expone el avance interno de estas últimas; ese paso solo se completa cuando responde la API. Se muestran borrados, omisiones y fallos. Solo se ejecuta una limpieza a la vez.

El estado vive en el servicio y se guarda temporalmente en `chrome.storage.session`, con contadores sin dominios ni valores de cookies. Cerrar el popup no controla la operación; al reabrirlo se recupera el estado activo. Al terminar, la barra llega al 100 % y se oculta tras 1,5 segundos; el resumen permanece aparte. Si Chromium interrumpe el servicio, se muestra el resultado parcial del último estado guardado y se requiere una vista previa nueva. No se reanudan borrados automáticamente ni se ofrece una cancelación ficticia.

## Instalación local y desarrollo

Requiere Chromium 130 o superior. En `chrome://extensions`, active el modo desarrollador y cargue `C:\src\sitekeep` como extensión descomprimida. Para probar acciones de limpieza, use un perfil de navegador de prueba. La lista protegida empieza vacía y su almacenamiento es independiente del de CookieKeep.

El proyecto no necesita dependencias npm. Con Node.js instalado:

```text
npm test
npm run build
```

El build valida el código y genera los iconos locales. Las pruebas usan APIs simuladas; no borran datos del perfil real.

## Release 0.1.0

La rama `main` incluye ahora el seguimiento de progreso desarrollado después de esta release. El ZIP de `v0.1.0` conserva el contenido original; para usar el nuevo progreso, cargue el proyecto actual como extensión descomprimida.

La [release v0.1.0](https://github.com/alejohub/sitekeep/releases/tag/v0.1.0) contiene un ZIP para Chromium. Descomprímalo en una carpeta propia y use **Cargar descomprimida** en `chrome://extensions`. El ZIP incluye `manifest.json`, `src/` e `icons/`; no incluye perfiles, datos de navegación ni herramientas de desarrollo. El archivo de suma SHA-256 publicado junto al ZIP permite comprobar la descarga.

Para generar y verificar el paquete desde el código fuente, ejecute primero `npm run build` y después `powershell -NoProfile -File scripts/package.ps1`. El paquete se guarda en `releases/`, directorio excluido de Git. Consulte [notas de la versión](RELEASE_NOTES.md) para funciones y límites de esta entrega.

## Documentación

- [Capacidades y permisos](CAPABILITIES.md): matriz por tipo de dato y límites de seguridad.
- [Arquitectura](ARCHITECTURE.md): inventario, política, vista previa, ejecución y revalidación.
- [Estado para continuar el proyecto](HANDOFF.md): decisiones, cobertura y siguientes pasos.

No se gestionan historial, descargas, contraseñas, autofill, pagos ni ajustes del navegador como datos a borrar. El historial opcional se consulta únicamente para ordenar los sitios.
