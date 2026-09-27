# SiteKeep

Extensión Chromium Manifest V3 para **proteger los sitios importantes y limpiar datos de los demás**. Funciona localmente, sin cuentas, telemetría ni servidores propios. La versión se obtiene de `manifest.json`.

## Uso

- En el popup, **Proteger sitio** conserva el sitio actual y sus subdominios. **Quitar protección** permite incluirlo de nuevo en una limpieza. **Borrar datos de este sitio** solo está disponible si no está protegido.
- En el dashboard se gestionan sitios protegidos, se ordenan sitios por cookies, nombre o visitas y se consulta la vista previa antes de una limpieza manual.
- **Borrar todo** significa borrar los datos gestionados de sitios no protegidos descubiertos. Nunca ejecuta un borrado global de todo el navegador.
- La limpieza automática puede estar desactivada, programarse cada 24 horas, 3 días o 7 días, o ejecutarse al cerrar la última ventana normal. Recalcula candidatos y protección en cada ejecución.
- La **limpieza reciente** ofrece 1 hora, 2 horas y 24 horas. Solo incluye cookies cuya creación o modificación SiteKeep haya observado durante ese periodo. Caché y almacenamiento no participan en esta modalidad.
- **Más visitados** pide el permiso opcional de historial al seleccionarse. Si se deniega, el resto del dashboard funciona normalmente.

**Espacio liberable** es una estimación parcial de bytes de cookies que el plan actual considera eliminables. Cada cookie se asigna a una sola fila, por lo que la suma de las filas coincide con el KPI. No incluye tamaños de caché ni almacenamiento, que Chromium no proporciona por origen de forma fiable.

## Instalación local y desarrollo

Requiere Chromium 130 o superior. En `chrome://extensions`, active el modo desarrollador y cargue `C:\src\sitekeep` como extensión descomprimida. Para probar acciones de limpieza, use un perfil de navegador de prueba. La lista protegida empieza vacía y su almacenamiento es independiente del de CookieKeep.

El proyecto no necesita dependencias npm. Con Node.js instalado:

```text
npm test
npm run build
```

El build valida el código y genera los iconos locales. Las pruebas usan APIs simuladas; no borran datos del perfil real.

## Documentación

- [Capacidades y permisos](CAPABILITIES.md): matriz por tipo de dato y límites de seguridad.
- [Arquitectura](ARCHITECTURE.md): inventario, política, vista previa, ejecución y revalidación.
- [Estado para continuar el proyecto](HANDOFF.md): decisiones, cobertura y siguientes pasos.

No se gestionan historial, descargas, contraseñas, autofill, pagos ni ajustes del navegador como datos a borrar. El historial opcional se consulta únicamente para ordenar los sitios.
