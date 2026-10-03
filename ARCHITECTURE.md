# Arquitectura

SiteKeep es una extensión Manifest V3. `src/background/worker.js` recibe mensajes del popup y dashboard, mantiene las vistas previas en memoria, programa alarmas y coordina la limpieza. `src/lib/state.js` guarda la lista protegida y la configuración en el almacenamiento propio de la extensión. El service worker puede suspenderse sin dejar una autorización manual persistente.

## Flujo de limpieza

1. **Inventario:** `src/lib/compat.js` enumera cookies visibles en todos los stores; `src/lib/sites.js` descubre hosts y orígenes mediante cookies y pestañas. No presume un inventario de datos de `browsingData` que la API no da.
2. **Política:** `src/lib/domains.js` normaliza hostnames y comprueba igualdad o límite de punto. `src/lib/sites.js` excluye sitios protegidos y cookies compartidas que puedan afectarles.
3. **Plan y vista previa:** `buildCleanupPlan()` selecciona sitios, orígenes y cookies. `src/lib/engine.js` produce el resumen y la estimación parcial. La vista previa manual autoriza un conjunto fijo durante diez minutos.
4. **Revalidación:** antes de ejecutar se construye otro plan con datos actuales. Se intersecta con lo autorizado y cada acción irreversible lee otra vez la lista protegida. Cambios de cookies invalidan la autorización reciente afectada.
5. **Ejecución y resultado:** `executeCleanupPlan()` borra cookies una a una con comprobación de alcance y, solo si no hay ningún sitio protegido, llama a `browsingData.remove` por origen para caché y almacenamiento. Registra borrados, omisiones y errores parciales.

La limpieza automática omite la vista previa manual y calcula candidatos actuales al dispararse una alarma o cerrarse la última ventana normal. Nunca usa `runtime.onSuspend` para hacer trabajo asíncrono.

## Progreso y ciclo de vida MV3

`src/lib/job.js` es el coordinador central, instanciado una vez en el service worker. `start()` bloquea una segunda limpieza antes de iniciar trabajo de API. Asigna un `operationId` y publica estado `running` con porcentaje 0 y fase `preparing`. El motor obtiene el plan actual e informa `total = cookies candidatas + llamadas por origen`; cada paso que termina incrementa `completed`, incluso si se omite por protección o falla. Mantiene contadores separados de cookies y orígenes, además de borrados, omisiones y fallos. Los cambios de protección siguen serializados con cada borrado en la cola original.

`executeCleanupPlan(..., {onProgress})` publica contadores cada 200 ms como máximo, más transiciones de fase y el resultado final. Cada llamada `browsingData.remove` agrupa todos los tipos admitidos para un origen y cuenta como un paso indivisible: la fase indica que está en curso y el paso no se completa hasta recibir respuesta. No se inventa progreso interno. Los resultados parciales se conservan y un estado `completed` con `failed > 0` se presenta explícitamente como completado con errores.

El job guarda únicamente agregados, fases, identificador y tiempos bajo `sitekeepCleanupProgress` en `storage.session`. No guarda el plan, cookies ni orígenes. Los checkpoints se limitan a uno cada 200 ms, salvo inicio, cambios de fase y final. El servicio responde a `status` y añade `progress` al `snapshot` existente. Una lectura inicial fallida o un fallo del checkpoint inicial impiden comenzar la limpieza. Un fallo posterior de checkpoint no provoca repetición de borrados: el estado en memoria sigue disponible mediante `status`.

`src/lib/progress-ui.js` se comparte entre popup y dashboard. Lee `status` al abrir, escucha cambios del storage de sesión y consulta `status` cada 500 ms solo mientras la operación está activa, como respaldo. Bloquea controles conflictivos y descartará respuestas antiguas. Un resultado reciente permanece visible 1,5 segundos y después el contenedor `hidden` deja de ocupar espacio; el resumen queda en el aviso. Al completar no permanecen timers de consulta. La UI no incorpora botón de cancelación.

Cerrar una página no detiene el trabajo del servicio. Un reinicio real del worker convierte cualquier checkpoint `running` en `failed` con `interrupted: true`; se muestra el último recuento conocido y nunca se reproduce la limpieza anterior. No es una promesa de ejecución persistente frente a cualquier interrupción de Chromium. Un checkpoint recuperado puede estar ligeramente atrasado respecto al último estado en memoria. El componente contempla ese retroceso al informar interrupción, sin quedarse bloqueado ni aceptar después un estado activo antiguo.

## Modalidades

**Completa:** popup por sitio y dashboard global comparten el motor. `Limpiar todo` significa todos los candidatos no protegidos descubiertos; está junto a «Actualizar» y no usa el selector de tiempo reciente. No se usa un borrado global del navegador.

**Reciente:** `src/lib/recent-cookies.js` observa cambios de cookies y guarda huellas y marcas de tiempo en `storage.session`. «Limpiar selección» y «Dry run» usan un host nulo, de modo que recorren globalmente los sitios no protegidos, limitados al intervalo elegido de 1, 2 o 24 horas. La caché y el almacenamiento quedan fuera de esta modalidad. Si el worker se reinicia, una vista previa manual anterior caduca; las observaciones de sesión pueden recuperarse.

**Ordenación por visitas:** `src/lib/history.js` consulta el historial solo tras concederse el permiso opcional. Agrega visitas por hostname y sus subdominios en memoria. Solo se persisten la preferencia de orden y el periodo, nunca URLs ni agregados de visitas.

## Estimación y privacidad

`src/lib/cookies.js` calcula bytes aproximados de los campos de cada cookie. El plan atribuye cada cookie segura a una sola fila. La suma de filas es el KPI y la vista previa del mismo plan. Los bytes de caché, IndexedDB, LocalStorage y demás almacenamientos no se inventan.

No hay llamadas a servidores de SiteKeep ni telemetría. Los tests en `tests/` usan APIs simuladas; `scripts/build.mjs` valida el código y genera iconos. Consulte [CAPABILITIES.md](CAPABILITIES.md) para los permisos y límites exactos.
