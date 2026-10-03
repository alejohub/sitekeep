# Matriz de capacidades — SiteKeep 0.1.1

Fuente principal: [API oficial de browsingData](https://developer.chrome.com/docs/extensions/reference/api/browsingData) y [API oficial de cookies](https://developer.chrome.com/docs/extensions/reference/api/cookies).

| Tipo | API | ¿Inventariable? | ¿Tamaño por sitio? | ¿Borrable por origen? | ¿Tiempo fiable? | ¿Con protegidos? | Incluido y limitación |
|---|---|---|---|---|---|---|---|
| Cookies | `cookies.getAll`, `cookies.remove`, `cookies.onChanged` | Sí, en stores y particiones visibles | Estimación de campos UTF-8 | Individual, tras verificar alcance colateral | Solo cambios observados durante 1, 2 o 24 h | Sí, con revalidación | Sí; las no observadas se excluyen de «reciente» |
| Caché HTTP | `browsingData.remove({origins}, {cache:true})` | No por origen | No | Filtro de orígenes, sin inventario | `since` sin vista previa precisa | No; se omite | Sí, solo si no hay sitios protegidos |
| Cache Storage | `browsingData.remove` | No | No | Igual | Igual | No; se omite | Sí, solo si no hay sitios protegidos |
| LocalStorage | `browsingData.remove` | No | No | Igual | Igual | No; se omite | Sí, solo si no hay sitios protegidos |
| IndexedDB | `browsingData.remove` | No | No | Igual | Igual | No; se omite | Sí, solo si no hay sitios protegidos |
| Service Workers | `browsingData.remove` | No | No | Igual | Igual | No; se omite | Sí, solo si no hay sitios protegidos |
| File systems web | `browsingData.remove` | No | No | Igual | Igual | No; se omite | Sí, solo si no hay sitios protegidos |
| WebSQL / AppCache | API obsoleta o sin efecto reciente | No | No | No útil | No | — | No |
| Historial | `chrome.history` opcional | Visitas por URL, agregadas en memoria | No aplica | No se borra | 7, 30, 90 días o todo | Sí, solo lectura | Consulta opcional para ordenar |
| Descargas, autofill, contraseñas, pagos | Datos globales | Fuera de alcance | No aplica | No | No | — | No |

## Alcance y protección

Una entrada protegida es un hostname normalizado, por ejemplo `reddit.com`. Protege exactamente ese hostname y todos sus subdominios (`www.reddit.com`, `old.reddit.com`); no protege `evilreddit.com`. La comparación usa igualdad o un punto como límite. La entrada no distingue `http` de `https` ni puertos. Las cookies compartidas con ese sitio se conservan, incluso cuando el selector de borrado podría alcanzar un dominio relacionado o una partición.

`Limpiar todo` construye una lista de orígenes concretos a partir de pestañas y dominios de cookies. No usa un borrado global. Los datos de un origen que no tenga pestaña ni cookie pueden quedar sin descubrir y, por tanto, sin borrar. Para dominios de cookie conocidos, se consideran los orígenes HTTP y HTTPS con puerto predeterminado; otros puertos solo aparecen si tienen pestaña. La UI no afirma saber si hay LocalStorage, IndexedDB o caché, ni presenta tamaños de esos datos.

La vista previa fija sitios, orígenes y cookies autorizados. Al confirmar, se reconstruye el plan actual y se intersecta con lo autorizado. Cada eliminación consulta nuevamente la lista protegida. La limpieza automática construye su propio plan actual. Si el service worker se reinicia, una vista previa anterior caduca y se necesita otra. Los errores de un tipo no habilitan borrados globales; el resultado registra fallos parciales.

`browsingData` se usa solo con `originTypes.unprotectedWeb`, nunca con orígenes de otras extensiones o aplicaciones web instaladas. La limpieza se limita a los tipos citados y no incluye `cookies` en esa llamada; estas se borran por separado para evitar que el filtro por origen elimine cookies de todo el dominio registrable. Chromium no expone inventario completo ni tamaño fiable de caché y almacenamiento por sitio en esta API.

El [filtro interno de Chromium](https://chromium.googlesource.com/chromium/src/+/refs/tags/136.0.7103.25/content/public/browser/browsing_data_filter_builder.h) puede incluir claves de almacenamiento de terceros incrustados bajo el origen seleccionado. La API de extensiones no permite elegir otro modo de coincidencia. Por ello, si hay **cualquier** sitio protegido, SiteKeep no ejecuta `browsingData.remove` para caché o almacenamiento; solo borra cookies tras verificar la protección. Sin sitios protegidos, sí limpia esos tipos por origen. Esta limitación es intencionada para conservar la garantía de protección.

## Permisos

- `browsingData`: borrar caché y almacenamientos por origen.
- `cookies` y hosts HTTP/HTTPS: inventariar y borrar cookies con selector individual.
- `storage`: guardar lista protegida, programación e historial local, y recuperar el estado de la última ventana normal.
- `alarms`: ejecutar intervalos incluso si se suspende el service worker.
- `tabs`: conocer el sitio activo y los orígenes de pestañas abiertas.
- `history` (opcional): consultar visitas únicamente al activar «Más visitados». Se pide mediante una acción explícita en el dashboard; denegarlo no afecta a protección o limpieza.

No se solicitan permisos de descargas, contraseñas, autofill ni acceso de red a servidores.

## Más visitados

El dashboard ofrece «Más visitados», «Más cookies» y «A-Z». «Más visitados» usa un único `history.search` por ventana temporal y `getVisits` para las URL relevantes. Cuenta visitas individuales dentro de 7, 30, 90 días o todo el historial disponible; incluye recargas y visitas sincronizadas y excluye subframes. Una fila de `reddit.com` suma también los subdominios mediante igualdad o límite de punto, nunca por substring. Se señala si Chromium truncó la búsqueda o hay visitas sin fecha. Sin registros, la cifra es 0; sin permiso, la tabla permanece operativa y muestra un mensaje discreto. Solo se guardan orden y periodo; los agregados viven en memoria temporal y no se persisten URL.

## Espacio liberable

La cifra es una **estimación parcial de los bytes de cookies que el plan actual considera eliminables**. Cada cookie se aproxima mediante los bytes UTF-8 de sus campos serializados. El dashboard y el Dry run llaman a `buildCleanupPlan()` y usan `measured.releasableBytes`; tras proteger, desproteger o limpiar se reconstruye el plan con el inventario actual. Cada cookie se asigna una sola vez a una fila, de modo que la suma de todas las filas es exactamente el KPI. Las filas protegidas muestran `0 B`. El cálculo interno distingue bytes medibles totales, conservados por protección o ambigüedad y liberables. Un conjunto vacío se muestra como `0 B`.

No se suman caché HTTP, Cache Storage, IndexedDB, LocalStorage, Service Workers ni otros almacenamientos: `browsingData` no ofrece un inventario fiable de sus bytes por origen. Además, cuando hay algún sitio protegido, la política conservadora no borra esos tipos. La cifra tampoco es una predicción exacta de espacio físico recuperado en disco; la compresión, índices y otros detalles de almacenamiento no son medibles aquí.

## Limpieza reciente

Chromium no expone la fecha de creación de cada cookie a `chrome.cookies`. SiteKeep registra los cambios que recibe mediante `cookies.onChanged` y conserva en `storage.session` solo una huella SHA-256 de la identidad de la cookie y la hora observada. No guarda allí dominio, URL ni valor en claro. Las cookies anteriores a la instalación o no observadas quedan fuera. «Limpiar selección» y «Dry run» recorren globalmente los sitios no protegidos y seleccionan únicamente cookies observadas en el periodo de 1, 2 o 24 horas elegido; caché y almacenamiento se excluyen porque `browsingData.since` no proporciona un inventario preciso para la vista previa. Una modificación entre vista previa y confirmación invalida la autorización anterior. Al ejecutar se revalidan el periodo, la existencia, el alcance y la protección. «Limpiar todo» y la limpieza automática siempre usan el plan completo, independientemente del selector reciente.
