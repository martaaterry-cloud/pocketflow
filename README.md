# Pocketflow — App de Control Financiero Personal

Pocketflow es una aplicación local-first para la gestión integral de gastos diarios, dinero disponible real, presupuestos, ahorro por objetivos, reservas de gastos previstos y planificación financiera personal de medio plazo.

Construida con **React 19**, **TypeScript**, **Vite 8**, **Lucide React** y empaquetada como app nativa para iPhone mediante **Capacitor 8**.

---

## iPhone / Atajo "Añadir gasto"

Pocketflow se integra con la app **Atajos de Apple (Shortcuts)** en iOS para registrar gastos de forma inmediata desde la pantalla de inicio, la pantalla de bloqueo, el botón de acción del iPhone o mediante Siri.

### 1. Requisitos
- Ordenador con macOS y Xcode 15+ instalado.
- iPhone físico con iOS 16 o superior.
- Cable de conexión al ordenador (USB-C o Lightning).
- Cuenta de Apple ID (la gratuita estándar es suficiente para firmar e instalar en tu propio iPhone).

### 2. Instalación local en iPhone (Paso a Paso)
1. **Compilar los assets web y sincronizar con iOS**:
   ```bash
   npm run build
   npx cap sync ios
   ```
2. **Abrir el proyecto en Xcode**:
   ```bash
   npx cap open ios
   # O abre directamente ios/App/App.xcworkspace desde Finder
   ```
3. **Configurar la firma de desarrollo (Signing)**:
   - En la barra lateral izquierda de Xcode, haz clic en el icono azul raíz del proyecto (**App**).
   - En el panel central, entra en la pestaña **Signing & Capabilities**.
   - Marca la casilla **Automatically manage signing**.
   - En el desplegable **Team**: si no aparece tu cuenta, haz clic en *Add Account...* e inicia sesión con tu Apple ID. Selecciónala como tu *Personal Team*.
   - El Bundle Identifier configurado es: `com.martaaterry.pocketflow`.
4. **Conectar e instalar en el iPhone**:
   - Conecta el iPhone por cable al ordenador y pulsa *Confiar en este ordenador* en la pantalla del teléfono si te lo solicita.
   - En la barra superior de Xcode, en el selector de destino (junto al botón de Play ▶), selecciona tu iPhone físico.
   - Pulsa el botón **Play (Run)** o presiona `Cmd + R` para compilar e instalar la app.
5. **Primera apertura en el iPhone**:
   - Si iOS bloquea la apertura indicando *Desarrollador no fiable*, ve en tu iPhone a:
     **Ajustes → General → VPN y gestión de dispositivos** (o *Gestión de dispositivos*).
   - Toca en tu Apple ID y pulsa **Confiar en [tu correo]**.
   - Abre Pocketflow.

---

### 3. Cómo funciona el Deep Link
Pocketflow registra en iOS el esquema nativo de URL: `pocketflow://`.

La estructura para crear gastos rápidos es:
```
pocketflow://expense?amount=12.50&description=Mercadona&category=food
```

#### Validaciones de seguridad (V1)
- **Acción exclusiva**: Solo se admite la acción `expense`. Cualquier intento de transferir, ingresar o acceder a ajustes es bloqueado.
- **Importe obligatorio y numérico**: `amount` debe ser mayor que 0 y finito. Soporta tanto punto decimal (`12.50`) como coma europea (`12,50`).
- **Codificación segura**: Soporta espacios, tildes, signos y `ñ` (`decodeURIComponent`). Se sanea la longitud máxima a 120 caracteres.
- **Categoría validada**: Si la categoría especificada no existe, aplica un fallback seguro a `other` (*Otros*) para no corromper la base de datos ni bloquear la app.
- **Protección anti-duplicados**: Incluye un deduplicador temporal de 2.500 ms para evitar que llamadas repetidas de `appUrlOpen` de iOS dupliquen movimientos ante un mismo toque.
- **Feedback automático**: Muestra un toast breve y no invasivo en la parte superior (*"Gasto añadido"*) y redirige inmediatamente a la pestaña Inicio.

---

### 4. Construcción del Atajo en iOS (Paso a Paso)

Abre la app **Atajos (Shortcuts)** en tu iPhone y crea un nuevo atajo llamado **"Añadir gasto"**:

1. **Acción 1 (Importe)**:
   - Añade la acción: **Solicitar entrada**.
   - Tipo de entrada: **Número**.
   - Pregunta: *¿Cuánto has gastado?*.
   - Permitir decimales: **Sí**.
2. **Acción 2 (Concepto)**:
   - Añade la acción: **Solicitar entrada**.
   - Tipo de entrada: **Texto**.
   - Pregunta: *¿En qué concepto?* (ej. Café, Comida, Taxi).
3. **Acción 3 (Categoría)**:
   - Añade la acción: **Elegir del menú**.
   - Opciones del menú:
     - 🍏 **Alimentación** → Define una variable de texto con valor `food`.
     - 🎟️ **Ocio** → Define texto con valor `leisure`.
     - 🚗 **Transporte** → Define texto con valor `transport`.
     - 👕 **Ropa** → Define texto con valor `clothes`.
     - 🔄 **Suscripciones** → Define texto con valor `subscriptions`.
     - 🏋️ **Deporte** → Define texto con valor `sport`.
     - ✈️ **Viajes** → Define texto con valor `travel`.
     - 📦 **Otros** → Define texto con valor `other`.
4. **Acción 4 (Codificación URL del concepto)**:
   - Añade la acción: **Codificar URL**.
   - Entrada: la variable del Concepto de la Acción 2.
5. **Acción 5 (Construcción del enlace)**:
   - Añade la acción: **Texto** y escribe exactamente:
     ```text
     pocketflow://expense?amount=[Importe]&description=[Concepto Codificado]&category=[Categoría]
     ```
6. **Acción 6 (Ejecución)**:
   - Añade la acción: **Abrir URL**.
   - Selecciona el resultado del Texto anterior.

> 💡 **Consejo de uso**: Puedes asignar este atajo al **Botón de Acción** (en iPhone 15 Pro / 16) o a la pulsación trasera (*Tocar atrás* en Ajustes → Accesibilidad → Tocar).

---

### 5. Limitaciones actuales y roadmap
- **Almacenamiento Local (localStorage)**: En esta fase, todos los datos persisten localmente en el motor de almacenamiento de la WebView de Capacitor en tu iPhone. Se conservan al cerrar la app y al reiniciar el teléfono. No obstante, no existe sincronización remota con la nube. En una fase posterior se migrará de forma transparente a SQLite nativo (`@capacitor-community/sqlite`).
- **Seguridad local**: La aplicación es 100% offline, privada y local-first. No envía datos a ningún servidor externo.

---

## Desarrollo Web y Tests

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo local
npm run dev

# Ejecutar suite de pruebas unitarias (96 tests)
npm test

# Compilación de producción
npm run build

# Sincronización con iOS
npx cap sync ios
```
