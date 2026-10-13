# Criterios económicos de PocketFlow

Los saldos se calculan con los registros originales. La clasificación económica es una proyección de lectura: no cambia importes, IDs, vínculos ni almacenamiento.

`classifyEconomicMovements` distingue compras, ingresos reales, reembolsos, transferencias internas y ajustes. Reconoce Banco → Efectivo por `cash_withdrawal` y su vínculo, y Efectivo → Banco por la salida de efectivo vinculada a una entrada bancaria sin vínculos de reparto/reembolso a otro gasto. No infiere traslados por descripción ni por coincidencia de importe.

`selectEconomicExpenses` proporciona el mismo universo de compras para resúmenes, categorías, detalles, estadísticas y exportación. El bruto es el importe desembolsado; el neto es `max(0, bruto − reembolsos aplicables)`. Gastos pagados por un contacto no son desembolsos del usuario. Las liquidaciones reales conservan su tratamiento de gasto y los cobros esperados o perdonados no reducen el neto. El reembolso reduce el gasto en su fecha económica, aunque se cobre posteriormente; el resumen de reembolsos recibidos utiliza la fecha del cobro.

`selectEconomicSummary` permite ámbitos Banco, Efectivo y Total. Banco incluye Bizum bancario; Total suma ambos orígenes. `selectNetPersonalExpensesForPeriod` mantiene su ámbito bancario para compatibilidad. `selectTotalEconomicConsumptionForPeriod` ya no resta retiradas de un neto que las ha excluido: `linkedWithdrawalsDeducted` queda en 0 y `transferredToCash` es informativo.

Transferencias y ajustes cambian saldos, pero no gasto, ingreso económico ni reembolsos. Una retirada marcada sin entrada vinculada tampoco se convierte en compra. La integridad del vínculo es independiente de la clasificación.

Las fechas económicas se interpretan según el día escrito en el registro, también para los límites de día/semana/mes/año y las series. Los importes se redondean a céntimos. Las rosquillas y sus detalles usan el mismo origen y rango, en bruto y neto.

`toUnifiedMovements` conserva ambas patas y sus registros originales. `collapseInternalTransfers` muestra una sola fila cuando ambas patas vinculadas están en la vista global; las vistas de origen conservan su propia pata. No oculta la única pata que pertenece al periodo seleccionado y no agrupa traslados independientes del mismo importe.

## Regresiones

- Traslado de 300 € Banco → Efectivo: saldo Banco −300, saldo Efectivo +300, Total constante y gasto/ingreso económico 0.
- Traslado más compras de 50 € Banco y 20 € Efectivo: gasto Banco 50, Efectivo 20 y Total/categorías/estadísticas 70.
- Traslado inverso: gasto, ingreso económico y reembolsos 0.
- Reembolsos entre medios y meses; cuotas compartidas, sobrepagos y perdón; ajustes; límites de periodo y céntimos.
- Pruebas de inmutabilidad y conservación de saldos, más renderizado de resúmenes, gráficos, detalles y cronología.

Ver `tests/economicCriteria.test.ts` y `tests/economicViews.test.ts`. Validar con `npm test` y `npm run build`; las regresiones se comprueban también con `TZ=Europe/Madrid`.
