# Nóminas por usuario y sincronización

## Auditoría previa

PayrollPage almacenaba arrays sin ID en `pocketflow:payroll:local:<userId>`, reemplazando por mes y sin sincronización. Sus dos efectos de lectura/escritura podían reutilizar estado de la identidad anterior durante un cambio de usuario. MorePage permitía construir la clave `guest`.

La autenticación reside en App y Supabase mantiene la sesión. Los datos financieros usan useFinance, adaptadores por usuario, cola offline y Realtime propios. Las nóminas no estaban en PersistedState, backups financieros ni tablas de movimientos. Integrarlas en la restauración financiera podía hacer que una nómina cambiase saldos o se perdiera al restaurar un backup del libro financiero.

## Implementación

- Nóminas utiliza modelos, almacenamiento, cola y canal Realtime independientes. App mantiene `usePayroll` durante toda la sesión. Guardar, eliminar o recuperar una nómina nunca invoca funciones financieras.
- Identidades UUID válidas y autenticación verificada por `auth.getUser()` antes de consultar o escribir. La UI no renderiza el estado de otra identidad durante una transición, y los controladores cerrados ignoran respuestas pendientes.
- Tabla `public.payroll_events` con RLS por `auth.uid()`, SELECT/INSERT para authenticated, sin acceso anon ni UPDATE/DELETE. Orden de versiones generado por PostgreSQL; los clientes no controlan la secuencia ni la fecha de aceptación. La eliminación es una nueva versión, no una operación destructiva.
- Los eventos son inmutables y tienen IDs estables durante reintentos. El cliente confirma contenido e identidad antes de retirar una operación pendiente. Lecturas paginadas evitan truncar historiales grandes.
- Caché durable `pocketflow:payroll:v1:<UUID>`. Los errores de almacenamiento se muestran, no se anuncian como guardados. Los eventos offline se reintentan al conectar, al volver a la app, mediante Realtime y cada 30 segundos mientras la página es visible.
- Migración conservadora: IDs SHA-256 deterministas por propietario y contenido, importación idempotente y conservación de la clave local original. No se adopta la clave guest. Registros corruptos o inválidos se señalan y su copia original permanece intacta.
- Una migración nunca reemplaza un guardado o una eliminación ya existentes. Las versiones locales distintas de un mismo mes se conservan. En ediciones normales, la última versión aceptada por el servidor es la actual; los cambios locales pendientes se muestran mientras se sincronizan. Todas las versiones siguen disponibles para recuperar explícitamente una anterior.
- Los backups/restauraciones financieros conservan su comportamiento: no incluyen ni reemplazan el historial de nóminas.

## Activación y validación

Aplicar `supabase/migrations/20261013120000_payroll_events.sql` al proyecto Supabase desde el editor SQL antes de publicar la aplicación. Es idempotente y solo añade el módulo Nóminas. No ejecutar `tests/payrollRls.sql` en el proyecto real: crea datos y roles exclusivamente para una base vacía de pruebas.

La migración real se aplica manualmente por el propietario del proyecto; no requiere credenciales administrativas dentro de la app o de GitHub Pages.

`npm test` incluye pruebas de validación, aislamiento, migración repetida, offline/reinicio, confirmaciones perdidas, concurrencia, eliminaciones, recuperación, respuestas ajenas, almacenamiento corrupto y renderizado de la pantalla.

`PAYROLL_TEST_CONTAINER=<contenedor PostgreSQL vacío> node scripts/testPayrollRls.mjs` aplica dos veces la migración y prueba permisos, RLS, constraints, IDs por usuario, secuencia, publicación Realtime y ausencia de efectos sobre movimientos ficticios. GitHub Actions ejecuta estas pruebas en un servicio PostgreSQL 17 antes del despliegue, además de la suite y compilación habituales.
