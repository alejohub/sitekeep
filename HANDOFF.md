# SiteKeep handoff

## Estado actual

- Proyecto local independiente: `C:\src\sitekeep`.
- Extensión Chromium Manifest V3, versión `0.1.0` en `manifest.json`; la interfaz la lee con `chrome.runtime.getManifest().version`.
- Proyecto sin dependencias npm. `npm test` ejecuta tests con mocks; `npm run build` valida fuentes y genera iconos.
- La lista protegida empieza vacía. No hay migración ni lectura del estado de CookieKeep.
- Funcionan popup y dashboard, protección, limpieza manual completa y reciente, programación automática, orden por historial opcional y estimación de espacio liberable por sitio.

## Versión y directorio

`0.1.0` en `manifest.json`. Directorio: `C:\src\sitekeep`.

## Arquitectura importante

- `manifest.json`: identidad, versión, permisos y páginas.
- `src/background/worker.js`: mensajes, programación, vistas previas y exclusión mutua.
- `src/lib/domains.js`, `sites.js`: definición de sitio, descubrimiento y política de protección.
- `src/lib/engine.js`: vista previa, revalidación, ejecución y resultado.
- `src/lib/recent-cookies.js`: observaciones efímeras para limpieza reciente.
- `src/lib/history.js`: ordenación opcional por visitas.
- `src/lib/cookies.js`, `space.js`: selectores seguros y estimación parcial.
- `src/popup/`, `src/options/`: interfaz; `tests/`: pruebas sin acceso al perfil real.
- `ARCHITECTURE.md` y `CAPABILITIES.md`: flujo y matriz por tipo de dato.

## Invariantes de seguridad

Un hostname protegido conserva sus datos y los de sus subdominios. Se comprueba la protección actual antes de cada borrado. Una vista previa manual solo autoriza los candidatos mostrados y caduca al reiniciarse el worker. La limpieza automática recalcula su plan. Ante alcance ambiguo de cookies se conserva la cookie. Si existe algún sitio protegido, se omiten caché y almacenamiento de `browsingData` por riesgo de claves de almacenamiento de terceros.

La limpieza reciente de 1, 2 o 24 horas solo considera cookies observadas por SiteKeep; no infiere la edad de cookies anteriores ni aplica un filtro temporal a caché/almacenamiento. `Borrar todo` y las limpiezas automáticas siguen siendo completas. La estimación de espacio solo mide cookies elegibles y atribuye cada una a una fila.

## Permisos

`browsingData`, `cookies`, `storage`, `alarms`, `tabs` y hosts HTTP/HTTPS son necesarios para la limpieza y el inventario. `history` es opcional y solo se solicita al usar «Más visitados». No se borra historial. Las URL de historial y los agregados no se persisten; solo orden y periodo. Las observaciones recientes se guardan como huellas y horas en `storage.session`. No hay telemetría ni servidores.

## Historial

`src/lib/history.js` consulta visitas por URL y las agrega según igualdad de hostname o subdominio con límite de punto. `src/lib/history-settings.js` valida orden y periodo. El dashboard solicita `history` solo al elegir «Más visitados», muestra el periodo 7, 30, 90 días o todo y una columna de visitas. El permiso denegado conserva la tabla con otro orden. Los resultados se reutilizan temporalmente y las URL no se persisten.

## Espacio liberable

`buildCleanupPlan()` en `src/lib/sites.js` es la fuente para filas, KPI y dry run. Suma los bytes estimados de cookies que el mismo plan puede borrar y atribuye cada cookie una sola vez a una fila. Las filas protegidas muestran `0 B`. No se cuentan bytes no medibles de caché o almacenamiento. La cifra representa bytes lógicos aproximados de campos de cookies, no espacio físico recuperado.

## Limpieza reciente

Está implementada parcialmente para cookies observadas por `cookies.onChanged`: 1, 2 y 24 horas. Las huellas SHA-256 y marcas de tiempo viven en `storage.session`; cookies sin observación quedan fuera. Una vista previa reciente fija los candidatos; se revalida el periodo al ejecutar. Cache y storage no tienen inventario temporal suficientemente preciso para esa vista previa.

## BrowsingData

La llamada se hace por origen descubierto y nunca como borrado global. Con cualquier sitio protegido se omite por el posible alcance a almacenamiento de terceros incrustados; se conservan caché y almacenamientos gestionados por esta API. Las cookies se tratan por separado con comprobaciones de alcance y protección.

## Tests y build

`npm test` ejecuta pruebas con APIs simuladas para historial, seguridad de protección, vista previa, errores parciales, programación, limpieza reciente y espacio. `npm run build` valida fuentes y genera iconos. No hay script de lint ni typecheck adicional. No se usan datos reales del navegador.

## Git/GitHub

Rama `main` y remoto `origin` del repositorio existente `alejohub/sitekeep`. La entrega incluye un único commit inicial y push normal a `main`, sin tag ni GitHub Release. Verificar el hash y el árbol actual con Git antes de cualquier trabajo posterior.

## Known issues / limitations

- El inventario de orígenes procede de pestañas y cookies; puede omitir un origen que solo tenga caché o almacenamiento.
- Chromium no expone tamaño fiable por origen de caché, Cache Storage, LocalStorage, IndexedDB ni Service Workers. El espacio liberable no los incluye.
- Con cualquier sitio protegido, los tipos de `browsingData` se omiten. Revisar esta política solo con una API que garantice ausencia de efectos en sitios protegidos.
- La estimación de cookies es aproximada y no equivale a bytes físicos recuperados.
- Validar visualmente popup y dashboard en un perfil de prueba de Chromium antes de distribuir la extensión. No probar limpiezas sobre el perfil normal.
- Mantener cobertura para subdominios, cookies compartidas, cambio de protección entre vista previa y ejecución, errores parciales y suspensión del worker.

## Next steps

Probar manualmente el diseño y la experiencia en un perfil aislado, revisar accesibilidad y comportamiento responsive, y evaluar APIs futuras para descubrir orígenes de almacenamiento sin cookies ni pestañas. Mantener la política conservadora mientras Chromium no ofrezca aislamiento verificable para datos de terceros.
