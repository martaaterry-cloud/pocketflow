# Pocketflow — App de Control Financiero Personal

Pocketflow es una aplicación financiera personal con **sincronización en la nube (Supabase) y funcionamiento offline robusto (IndexedDB)** para la gestión integral de gastos diarios, dinero disponible real, presupuestos, ahorro por objetivos, reservas de gastos previstos y planificación financiera personal de medio plazo.

Funciona como **Progressive Web App (PWA)** instalable en **iPhone y Windows** y cuenta con proyecto nativo **Capacitor 8** preparado para iOS/Xcode.

URL pública en producción: **https://martaaterry-cloud.github.io/pocketflow/**

---

## 📱 Instalación PWA en iPhone (Sin necesidad de Mac)

Puedes instalar Pocketflow en tu iPhone en 10 segundos como si fuera una app nativa:

1. Abre **Safari** en tu iPhone y entra en:
   `https://martaaterry-cloud.github.io/pocketflow/`
2. Toca en el botón **Compartir** (icono de la caja con flecha hacia arriba en la barra inferior de Safari).
3. Desplázate hacia abajo y selecciona **"Añadir a la pantalla de inicio"**.
4. Pulsa **Añadir**. Aparecerá el icono de Pocketflow con el diseño esmeralda y titanio en tu pantalla principal.
5. Al abrirla desde la pantalla de inicio, se ejecuta en modo pantalla completa (*standalone*) con safe areas respetadas, soporte offline y persistencia robusta en **IndexedDB**.

---

## ⚡ Atajo de iOS "Añadir gasto" (Vía Web o Nativa)

Pocketflow admite registrar gastos desde la app **Atajos (Shortcuts)** tanto mediante URL web pública (ideal para PWA sin Mac) como mediante esquema nativo `pocketflow://`.

### Formato de URL pública para Atajos:
```text
https://martaaterry-cloud.github.io/pocketflow/?action=expense&amount=12.50&description=Mercadona&category=food
```
O bien mediante esquema nativo:
```text
pocketflow://expense?amount=12.50&description=Mercadona&category=food
```

### Reglas y seguridad:
- **Acción exclusiva**: Solo se admite la acción `expense` (bloquea transferencias, ingresos, borrado o ajustes).
- **Importe obligatorio y numérico**: `amount > 0` y finito. Soporta punto decimal (`12.50`) y coma europea (`12,50`).
- **Codificación segura**: Soporta espacios, tildes, signos y `ñ` (`decodeURIComponent`).
- **Limpieza de URL**: Al abrirse desde navegador o PWA, los parámetros se procesan y se limpian automáticamente de la barra de direcciones con `history.replaceState` para no duplicar el gasto al recargar.
- **Protección anti-duplicados**: Deduplicador temporal de 2.500 ms ante invocaciones repetidas de Safari.
- **Feedback inmediato**: Muestra un toast *"Gasto añadido"* en la parte superior y te sitúa en la pestaña Inicio.

### Cómo configurar el Atajo en la app Atajos de iOS:
1. Abre **Atajos** y pulsa **+** para crear uno nuevo (*"Añadir gasto"*).
2. **Acción 1**: *Solicitar entrada* → Tipo: **Número** (permite decimales). Pregunta: *¿Cuánto has gastado?*.
3. **Acción 2**: *Solicitar entrada* → Tipo: **Texto**. Pregunta: *¿Concepto?* (ej. Café, Taxi).
4. **Acción 3**: *Elegir del menú*:
   - 🍏 Alimentación → Texto `food`
   - 🎟️ Ocio → Texto `leisure`
   - 🚗 Transporte → Texto `transport`
   - 👕 Ropa → Texto `clothes`
   - 🔄 Suscripciones → Texto `subscriptions`
   - 🏋️ Deporte → Texto `sport`
   - ✈️ Viajes → Texto `travel`
   - 📦 Otros → Texto `other`
5. **Acción 4**: *Codificar URL* → entrada: variable del concepto (Acción 2).
6. **Acción 5**: *Texto* con la URL pública:
   ```text
   https://martaaterry-cloud.github.io/pocketflow/?action=expense&amount=[Importe]&description=[Concepto Codificado]&category=[Categoría]
   ```
7. **Acción 6**: *Abrir URL* → abre la URL en Pocketflow.

---

## 💾 Copias de Seguridad (Backup & Restore)

En **Más → Copias de seguridad**:
- **Exportar copia completa**: Genera un archivo `.json` estructurado y versionado con todos tus movimientos, presupuestos, objetivos y configuración financiera. En iPhone, puedes guardarlo directamente en **Archivos / iCloud Drive** mediante el diálogo nativo de compartir.
- **Importar y restaurar**: Selector de archivo `.json` con validación estricta de esquema y comprobación de versión. Muestra una vista previa con el recuento exacto de entidades antes de restaurar y solicita confirmación explícita para evitar pérdidas accidentales.
- **Registro de fecha**: Muestra la fecha y hora de la última copia de seguridad realizada.

---

## 🔒 Persistencia: IndexedDB + Respaldo en LocalStorage

- **Motor principal**: Almacenamiento local en **IndexedDB** (`pocketflow_db`), permitiendo almacenar grandes volúmenes de transacciones y estados complejos sin limitaciones de cuota reducida.
- **Migración automática**: Si la app arranca y detecta datos en `localStorage`, los migra automáticamente a IndexedDB manteniendo la copia de `localStorage` como respaldo.
- **Respaldo espejo**: Cada guardado sincroniza tanto en IndexedDB como en `localStorage` para garantizar la máxima durabilidad en entornos PWA y navegadores móviles.
- **Fallback seguro**: Si IndexedDB está bloqueado (navegación privada estricta), recurre transparentemente a `localStorage` sin interrumpir la app.

---

## 🛠️ Desarrollo y Tests

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo
npm run dev

# Ejecutar suite de 108 tests unitarios
npm test

# Compilación de producción
npm run build

# Sincronización con proyecto nativo Xcode (Capacitor)
npx cap sync ios
```
