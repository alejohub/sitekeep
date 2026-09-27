# Arquitectura

SiteKeep es una extensión Manifest V3. `src/background/worker.js` recibe mensajes del popup y dashboard, mantiene las vistas previas en memoria, programa alarmas y coordina la limpieza. `src/lib/state.js` guarda la lista protegida y la configuración en el almacenamiento propio de la extensión. El service worker puede suspenderse sin dejar una autorización manual persistente.

## Flujo de limpieza

1. **Inventario:** `src/lib/compat.js` enumera cookies visibles en todos los stores; `src/lib/sites.js` descubre hosts y orígenes mediante cookies y pestañas. No presume un inventario de datos de `browsingData` que la API no da.
2. **Política:** `src/lib/domains.js` normaliza hostnames y comprueba igualdad o límite de punto. `src/lib/sites.js` excluye sitios protegidos y cookies compartidas que puedan afectarles.
3. **Plan y vista previa:** `buildCleanupPlan()` selecciona sitios, orígenes y cookies. `src/lib/engine.js` produce el resumen y la estimación parcial. La vista previa manual autoriza un conjunto fijo durante diez minutos.
4. **Revalidación:** antes de ejecutar se construye otro plan con datos actuales. Se intersecta con lo autorizado y cada acción irreversible lee otra vez la lista protegida. Cambios de cookies invalidan la autorización reciente afectada.
5. **Ejecución y resultado:** `executeCleanupPlan()` borra cookies una a una con comprobación de alcance y, solo si no hay ningún sitio protegido, llama a `browsingData.remove` por origen para caché y almacenamiento. Registra borrados, omisiones y errores parciales.

La limpieza automática omite la vista previa manual y calcula candidatos actuales al dispararse una alarma o cerrarse la última ventana normal. Nunca usa `runtime.onSuspend` para hacer trabajo asíncrono.

## Modalidades

**Completa:** popup por sitio y dashboard global comparten el motor. `Limpiar todo` significa todos los candidatos no protegidos descubiertos; está junto a «Actualizar» y no usa el selector de tiempo reciente. No se usa un borrado global del navegador.

**Reciente:** `src/lib/recent-cookies.js` observa cambios de cookies y guarda huellas y marcas de tiempo en `storage.session`. «Limpiar selección» y «Dry run» usan un host nulo, de modo que recorren globalmente los sitios no protegidos, limitados al intervalo elegido de 1, 2 o 24 horas. La caché y el almacenamiento quedan fuera de esta modalidad. Si el worker se reinicia, una vista previa manual anterior caduca; las observaciones de sesión pueden recuperarse.

**Ordenación por visitas:** `src/lib/history.js` consulta el historial solo tras concederse el permiso opcional. Agrega visitas por hostname y sus subdominios en memoria. Solo se persisten la preferencia de orden y el periodo, nunca URLs ni agregados de visitas.

## Estimación y privacidad

`src/lib/cookies.js` calcula bytes aproximados de los campos de cada cookie. El plan atribuye cada cookie segura a una sola fila. La suma de filas es el KPI y la vista previa del mismo plan. Los bytes de caché, IndexedDB, LocalStorage y demás almacenamientos no se inventan.

No hay llamadas a servidores de SiteKeep ni telemetría. Los tests en `tests/` usan APIs simuladas; `scripts/build.mjs` valida el código y genera iconos. Consulte [CAPABILITIES.md](CAPABILITIES.md) para los permisos y límites exactos.
