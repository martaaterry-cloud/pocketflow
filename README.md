# Pocketflow — starter

Starter funcional para una app personal de control de gastos, ahorro y presupuesto.

## Stack
- React 19 + TypeScript
- Vite 8
- Capacitor 8 preparado para iOS
- Persistencia temporal en `localStorage` para acelerar la primera fase
- Arquitectura preparada para sustituir el store por SQLite más adelante

## Funcionalidad incluida
- Inicio con disponible real, saldo diario, comprometido y rueda de gastos
- Últimos movimientos
- Alta manual de gasto, ingreso o transferencia
- Dos cuentas internas: Cuenta diaria + Ahorro
- Transferencias entre cuentas que no cuentan como gasto
- Calendario mensual con gasto por día
- Objetivos de ahorro
- Pagos recurrentes de muestra
- Navegación inferior de 5 apartados
- Datos demo
- Soporte base para deep link `pocketflow://expense?...` pensado para Atajos de iPhone

## Desarrollo
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Preparar iOS
En macOS con Xcode:
```bash
npm install @capacitor/ios
npx cap add ios
npm run cap:ios
```

> El proyecto todavía NO incluye el directorio `ios/` para mantener el ZIP ligero y evitar archivos generados. Se crea con `npx cap add ios` cuando se vaya a probar en iPhone.

## Atajo iPhone — objetivo
El esquema previsto es:

`pocketflow://expense?amount=12.50&description=Mercadona&category=food`

Cuando iOS abra ese deep link, la app registra el movimiento. Falta configurar el URL Scheme nativo en Xcode cuando se genere el proyecto iOS.

## Siguiente fase recomendada
1. Fijar estética final.
2. Completar CRUD de movimientos.
3. Persistencia SQLite.
4. CRUD de categorías, cuentas, presupuestos, objetivos y recurrentes.
5. Cálculo correcto de recurrentes pendientes dentro del mes.
6. Estadísticas día/semana/mes/año.
7. Configurar Atajos/deep link real en iOS.
8. Face ID / bloqueo biométrico.
9. Backup/exportación cifrada.

## Reglas de producto
- Local-first.
- No guardar credenciales bancarias, PIN, CVV ni números completos de tarjeta.
- Mantener Cuenta diaria y Ahorro separadas internamente.
- Las transferencias internas NO son gastos.
- La cifra principal es `disponible real`, no el patrimonio total.
- Evitar que la app culpabilice: informar, no regañar.
