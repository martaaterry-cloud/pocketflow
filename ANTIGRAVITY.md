# Contexto para Antigravity / Gemini

Este repositorio es el starter de Pocketflow, una app personal para iPhone destinada a llevar gastos y ahorro sin conexión bancaria automática.

## Producto ya decidido
- Se registrarán gastos principalmente mediante un Atajo de iPhone y también manualmente desde la app.
- Hay dos cuentas internas: `Cuenta diaria` y `Ahorro`.
- Las transferencias entre ambas no cuentan como gasto.
- Pantalla Inicio: disponible real, gasto mensual en rueda por categorías y últimos movimientos.
- Pantallas principales: Inicio, Movimientos, Calendario, Ahorro, Más.
- Más: estadísticas, presupuestos, recurrentes, cuentas, categorías y ajustes.
- Calendario: gasto total por día + detalle del día.
- Resúmenes futuros: día, semana, mes, año y comparación con periodos anteriores.
- Objetivos de ahorro con progreso.
- Gastos programados/recurrentes que reduzcan el `disponible real` antes de cobrarse.
- Local-first; no login en V1.
- App web durante desarrollo y empaquetada con Capacitor para iPhone.
- Seguridad futura: Face ID, mínimos datos financieros, backup cifrado.

## No hacer todavía
- Open Banking / PSD2.
- Sincronización con imagin o Revolut.
- Backend remoto/login.
- Funciones sociales.

## Prioridad de desarrollo
Mantener el proyecto utilizable tras cada cambio. Antes de añadir features nuevas, completar correctamente la persistencia y CRUD de movimientos.

## Diseño
Estética minimalista, limpia, móvil-first, cálida y adulta. Evitar apariencia de dashboard empresarial. La rueda de categorías debe ser protagonista pero no ocupar toda la pantalla. Colores suaves diferenciados por categoría.
