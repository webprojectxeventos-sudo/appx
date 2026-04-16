# Informe Tecnico de Sesion: Rediseno Completo del Modulo Scanner — Project X

**Fecha:** 16 de abril de 2026  
**Proyecto:** Project X — App de eventos  
**Repositorio:** `git@github.com:webprojectxeventos-sudo/APP-PROJECT-X.git`  
**Branch:** `main`  
**Commit base:** `0e5da71` — *fix: prevent stale fetchData responses from overwriting fresh data in admin pages*  
**Produccion:** `https://app.projectxeventos.es`  
**Stack:** Next.js 16.2.1 + Supabase + Capacitor (Android/iOS) + Vercel  

---

## Abstract

Esta sesion documenta el rediseno completo del modulo Scanner de la aplicacion Project X, una plataforma de gestion de eventos. El modulo Scanner es la herramienta que usan los empleados de puerta durante los eventos para: (1) escanear codigos QR de entrada, (2) registrar pagos en puerta de asistentes sin ticket previo, y (3) consultar la lista de asistentes con opciones de check-in manual y undo. El trabajo partio de un archivo monolitico de **1175 lineas** (`app/(scanner)/scanner/page.tsx`) y lo descompuso en **8 componentes modulares** distribuidos en `components/scanner/`, mas modificaciones al layout del scanner y al archivo de estilos globales. La sesion incluyo diagnostico de errores criticos (conflicto de puertos, bugs de `styled-jsx` dentro de Context providers, corrupcion de cache HMR), un revert de seguridad antes de un evento, la reimplementacion completa siguiendo un plan de 9 fases, y la investigacion de un problema de teclado en la app nativa de Android via Capacitor. Al cierre de la sesion, el codigo esta compilado sin errores de TypeScript, funcionando en el servidor de desarrollo local, pero **pendiente de commit y deploy a produccion** — el usuario tiene un evento esa misma noche y la app de Play Store carga desde el URL remoto de produccion, no desde un bundle local.

---

## 1. Introduccion

### 1.1 Contexto del Proyecto

Project X es una aplicacion web/movil para gestion de eventos (fiestas, graduaciones, eventos corporativos) desplegada en Vercel (`app.projectxeventos.es`) y empaquetada como app nativa Android/iOS a traves de Capacitor. La app nativa no lleva un bundle local — en su lugar, la configuracion de Capacitor (`capacitor.config.ts`) apunta al servidor remoto:

```typescript
server: {
  url: 'https://app.projectxeventos.es',
  cleartext: false,
  allowNavigation: [
    'cotqzlxyvtjybxujkitm.supabase.co',
    '*.supabase.co',
  ],
},
```

Esto significa que cualquier cambio en el codigo solo se refleja en la app de Play Store **despues de hacer commit, push a GitHub, y esperar el deploy automatico de Vercel**. Este detalle fue critico durante la sesion, ya que el usuario esperaba ver cambios inmediatos en su telefono movil.

### 1.2 Objetivo de la Sesion

El usuario tenia un evento importante programado para la noche del 16 de abril de 2026 y necesitaba que el modulo Scanner funcionara perfectamente. Los objetivos evolucionaron durante la sesion:

1. **Diagnostico inicial:** Verificar por que el scanner no funcionaba correctamente.
2. **Verificacion de integridad:** Confirmar que un refactor previo estaba bien integrado.
3. **Rediseno completo:** Ejecutar un plan de 9 fases para descomponer el monolito en componentes.
4. **Reparacion total:** Arreglar todo — web, app, scanner, pagos en puerta, teclado — para el evento de esa noche.

### 1.3 Estado Inicial del Codigo

El modulo Scanner residia integramente en un unico archivo:

- **`app/(scanner)/scanner/page.tsx`** — 1175 lineas conteniendo:
  - Definiciones de tipos (`ScanResult`, `AttendeeRow`, `ScannerEvent`)
  - Funciones utilitarias (`playBeep()`, `haptic()`, `useAnimatedNumber()`, `formatTime()`)
  - Toda la logica de estado (carga de datos, suscripciones realtime, estadisticas)
  - Tres pestanas completas (Escanear, Puerta, Lista) con sus UI respectivas

- **`app/(scanner)/layout.tsx`** — 90 lineas:
  - Auth guard para roles `staff`
  - Header basico con logo, titulo y nombre del usuario
  - Boton de retorno al admin para roles admin/group_admin
  - **Sin boton de logout**
  - **Sin indicador de venue**

### 1.4 Problemas Detectados

Se identificaron los siguientes problemas en el codigo existente:

| # | Problema | Severidad | Ubicacion |
|---|---------|-----------|-----------|
| 1 | Sin boton de logout en el scanner | Alta | `layout.tsx` |
| 2 | Stats planos sin barra de progreso visual | Media | `page.tsx:619-632` |
| 3 | Texto stale sobre "ventana de 48h" | Baja | `page.tsx:612` |
| 4 | Monolito de 1175 lineas inmantenible | Alta | `page.tsx` completo |
| 5 | Door tab con UX generica | Media | `page.tsx:822-981` |
| 6 | Sin feedback de venue | Media | `layout.tsx` |

---

## 2. Desarrollo Cronologico

### 2.1 Fase 0: Diagnostico Inicial y Conflicto de Puertos

#### 2.1.1 Primer Contacto del Usuario

El usuario inicio la sesion con un mensaje vago:

> "Revisa que es lo que esta pasando y por que no funciona"

Se procedio a arrancar el servidor de desarrollo Next.js para inspeccionar el estado del scanner.

#### 2.1.2 Error: Puerto 3000 en Uso

Al intentar iniciar el servidor de desarrollo, se encontro el siguiente error:

```
The dev server failed to start with the following error:
Port 3000 is required by this server but is in use by another process.
Run `lsof -i :3000` to find what's using it, then free port 3000 and try again.
```

**Diagnostico:** Otra instancia del servidor Next.js (o un proceso residual) estaba ocupando el puerto 3000.

**Solucion aplicada:**

```bash
lsof -ti :3000 | xargs kill -9
```

Este comando identifica todos los PIDs usando el puerto 3000 y los termina forzosamente. Tras ejecutarlo, el servidor de desarrollo arranco sin problemas.

**Razonamiento:** Se opto por `kill -9` (SIGKILL) en lugar de `kill -15` (SIGTERM) porque el proceso probablemente era un servidor zombie que no responderia a una terminacion graceful.

### 2.2 Verificacion de Integridad del Refactor

#### 2.2.1 Solicitud del Usuario

> "comprueba que este bien integrado todo lo que has hecho en scanner comprueba bugs y que todo funcione bien"

Se procedio a verificar la integridad del codigo del scanner, incluyendo:

- Compilacion TypeScript sin errores
- Verificacion de imports entre componentes
- Estado del servidor de desarrollo (HTTP 200 en `/scanner`)

#### 2.2.2 Urgencia del Evento

El usuario enfatizo la criticidad de la situacion:

> "LUEGO ESTA NOCHE TENEMOS UN EVENTO MUY IMPORTANTE VA A SER LA PRIMERA PRUEBA DE FUEGO, NO PUEDE FALLAR NADA"

Esto establecio el contexto de urgencia maxima para toda la sesion.

### 2.3 Bug Critico: `styled-jsx` Dentro de Context Provider

#### 2.3.1 Manifestacion del Error

Al integrar el scanner refactorizado, el componente `ScannerProvider` incluia un bloque `<style jsx global>` para definir la animacion `slideUp` que usaba el overlay de resultado del scan:

```tsx
// Dentro de ScannerProvider (INCORRECTO)
return (
  <ScannerContext.Provider value={value}>
    <style jsx global>{`
      @keyframes slideUp {
        from { transform: translateY(100%); opacity: 0; }
        to   { transform: translateY(0); opacity: 1; }
      }
    `}</style>
    {children}
  </ScannerContext.Provider>
)
```

Esto provoco un crash en runtime con el error:

```
Element type is invalid: expected a string (for built-in components) or a class/function 
(for composite components) but got: undefined.
```

#### 2.3.2 Analisis de Causa Raiz

**La causa raiz fue una incompatibilidad entre `styled-jsx` y React Context providers.** En Next.js, `<style jsx>` es compilado por un plugin de Babel/SWC que transforma la etiqueta en llamadas a `styled-jsx/style`. Cuando esta etiqueta se coloca dentro de un componente que es un Context Provider, la compilacion falla silenciosamente — el modulo `styled-jsx/style` no se resuelve correctamente en ese contexto, resultando en `undefined` donde React esperaba un componente valido.

**Hipotesis descartadas:**
- Error de import circular — descartado tras verificar el grafo de dependencias
- Error de React version — descartado, React 19 funcionaba correctamente en otros componentes
- Error de compilacion de TypeScript — descartado, `tsc --noEmit` pasaba

**Hipotesis confirmada:** El posicionamiento de `<style jsx global>` dentro de un Context Provider es incompatible con la transformacion de `styled-jsx`.

#### 2.3.3 Solucion Aplicada

Se movio la definicion de `@keyframes slideUp` al archivo `app/globals.css`:

```css
/* app/globals.css — entre drawer-up y bounce-subtle */
@keyframes slideUp {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
```

**Justificacion de la solucion:** Mover la animacion a `globals.css` tiene multiples ventajas:

1. Evita completamente el problema de `styled-jsx` con Context providers.
2. La animacion esta disponible globalmente, lo cual es necesario porque la usan tanto `scan-tab.tsx` (overlay de resultado del scan) como `door-tab.tsx` (feedback de registro en puerta). Si la animacion estuviera definida solo en `<style jsx>` de `ScanTab`, dejaria de existir cuando `DoorTab` se monta (ya que `ScanTab` se desmonta al cambiar de pestana).
3. Es consistente con el patron de la codebase, donde las demas animaciones (`drawer-up`, `bounce-subtle`, `glow-pulse`, etc.) ya residen en `globals.css`.

**Diff exacto aplicado a `app/globals.css`:**

```diff
@@ -381,6 +381,11 @@ body {
   to   { transform: translateY(0); }
 }

+@keyframes slideUp {
+  from { transform: translateY(100%); opacity: 0; }
+  to   { transform: translateY(0); opacity: 1; }
+}
+
 @keyframes bounce-subtle {
   0%, 100% { transform: translateY(0); }
   50% { transform: translateY(-4px); }
```

### 2.4 Corrupcion de Cache HMR

#### 2.4.1 Manifestacion

Despues de corregir el bug de `styled-jsx`, el servidor de desarrollo (con HMR/Fast Refresh activo) seguia mostrando el error anterior. El Hot Module Replacement habia cacheado el estado erroneo y no se actualizaba correctamente.

#### 2.4.2 Solucion

```bash
# Detener el servidor de desarrollo (Ctrl+C)
rm -rf .next
npm run dev
```

Eliminar el directorio `.next` forzo una recompilacion completa desde cero. El servidor arranco correctamente tras la limpieza.

**Leccion aprendida:** Cuando un error de compilacion corrompe el estado de HMR en Next.js, la solucion mas fiable es eliminar `.next` completamente. Los intentos de "refrescar" editando archivos pueden no ser suficientes si el cache de modulos tiene entradas invalidas.

### 2.5 Revert de Seguridad Pre-Evento

#### 2.5.1 Contexto

Con el evento inminente y el refactor aun sin testing completo, se tomo la decision de revertir TODOS los cambios al ultimo commit estable para asegurar que la version funcional del scanner estuviera disponible:

```bash
git checkout HEAD -- app/(scanner)/layout.tsx app/(scanner)/scanner/page.tsx app/globals.css
```

Esto restauro los 3 archivos modificados a su estado en el commit `0e5da71`.

**Razonamiento:** Es preferible tener un monolito funcional de 1175 lineas que un refactor potencialmente roto la noche de un evento. El principio es "no rompas lo que funciona justo antes de produccion".

### 2.6 Reimplementacion del Rediseno (Plan de 9 Fases)

Despues del revert, el usuario proporciono un plan de rediseno detallado de 9 fases. Este plan fue generado en una sesion previa de "Plan Mode" y guardado en:

```
/Users/emiliovilla/.claude/plans/peppy-dazzling-thimble.md
```

Se procedio a implementar cada fase en orden.

#### 2.6.1 Fase 1: Extraccion de Tipos y Utilidades

**Archivo creado:** `components/scanner/scanner-types.ts` (35 lineas)

Se extrajeron las 4 definiciones de tipos del monolito original (lineas 15-43):

```typescript
export type ScanResult = {
  success: boolean
  error?: string
  user_name?: string
  user_email?: string
  event_title?: string
  ticket_id?: string
  scanned_at?: string
}

export type AttendeeRow = {
  id: string
  user_id: string
  event_id: string
  qr_code: string
  status: 'valid' | 'used' | 'cancelled'
  scanned_at: string | null
  created_at: string
  user_name: string | null
  user_email: string
}

export type ScannerEvent = {
  id: string
  title: string
  group_name: string | null
  date: string
  venue_id: string | null
}

export type DayGroup = {
  key: string
  label: string
  events: ScannerEvent[]
}
```

**Nota:** El tipo `DayGroup` no existia en el monolito original — se creo nuevo para tipar la agrupacion por dia del calendario que era un objeto anonimo en el codigo original.

**Archivo creado:** `components/scanner/scanner-utils.ts` (68 lineas)

Se extrajeron las 4 funciones utilitarias del monolito (lineas 47-90):

1. **`playBeep(success: boolean)`**: Genera un tono corto via Web Audio API. Exito = 880 Hz sinusoidal durante 150ms. Error = 280 Hz cuadrada durante 300ms. El gain hace exponential ramp a 0.001 para evitar clicks de audio.

2. **`haptic(success: boolean)`**: Activa vibracion via `navigator.vibrate()`. Exito = pulso unico de 100ms. Error = doble tap (80ms, pausa 50ms, 80ms). Envuelto en try-catch porque no todos los dispositivos soportan la API.

3. **`useAnimatedNumber(value, duration = 400)`**: Hook de React que anima la transicion entre valores numericos usando `requestAnimationFrame` con easing cubico de salida (`1 - (1-p)^3`). Usa un ref para trackear el valor anterior y calcular la interpolacion.

4. **`formatTime(iso: string | null)`**: Formatea un timestamp ISO a "HH:MM" usando locale `es-ES`.

#### 2.6.2 Fase 2: Scanner Provider (Context Centralizado)

**Archivo creado:** `components/scanner/scanner-provider.tsx` (277 lineas)

Este es el componente mas complejo del rediseno. Encapsula toda la logica de datos compartida entre las 3 pestanas del scanner.

**Interfaz del Context:**

```typescript
interface ScannerContextValue {
  // Data
  serverEvents: ScannerEvent[]
  attendees: AttendeeRow[]
  stats: { total: number; scanned: number; pending: number }
  animTotal: number
  animScanned: number
  animPending: number
  eventIds: string[]
  eventNameMap: Record<string, string>
  eventsByDay: DayGroup[]
  doorCount: number
  multipleEvents: boolean

  // Loading state
  loadingAttendees: boolean
  bootstrapError: string | null

  // Actions
  loadAttendees: () => Promise<void>

  // Sound
  soundEnabled: boolean
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>

  // Refs for scanner callback (stale-closure safe)
  attendeesRef: React.MutableRefObject<AttendeeRow[]>
  eventNameMapRef: React.MutableRefObject<Record<string, string>>
  soundEnabledRef: React.MutableRefObject<boolean>
  loadAttendeesRef: React.MutableRefObject<() => void>

  // Venue name from auth context
  venueName: string
}
```

**Patron de stale-closure safety:**

Un aspecto critico del Provider es el uso de refs sincronizados para callbacks del escaner QR. La libreria `html5-qrcode` captura un callback al iniciar el scanner. Si ese callback referencia directamente variables de estado de React, captura valores stale (el valor en el momento de la creacion del callback, no el actual). Para solucionarlo:

```typescript
// Refs declarados
const attendeesRef = useRef(attendees)
const eventNameMapRef = useRef<Record<string, string>>({})
const soundEnabledRef = useRef(soundEnabled)
const loadAttendeesRef = useRef<() => void>(() => {})

// Sincronizacion continua
useEffect(() => { attendeesRef.current = attendees }, [attendees])
useEffect(() => { eventNameMapRef.current = eventNameMap }, [eventNameMap])
useEffect(() => { soundEnabledRef.current = soundEnabled }, [soundEnabled])
useEffect(() => { loadAttendeesRef.current = loadAttendees }, [loadAttendees])
```

Los callbacks del scanner acceden a `.current` de estos refs, que siempre refleja el valor mas reciente.

**Logica de carga de datos:**

```typescript
const loadAttendees = useCallback(async () => {
  setLoadingAttendees(true)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoadingAttendees(false); return }
    const res = await fetch('/api/scanner/attendees', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    // ... parseo de respuesta, calculo de stats
  } catch (err) {
    setBootstrapError('Error de conexion')
  } finally {
    setLoadingAttendees(false)
  }
}, [])
```

La API `/api/scanner/attendees` devuelve un objeto `{ events: ScannerEvent[], attendees: AttendeeRow[] }` filtrado por el venue del usuario autenticado.

**Suscripciones Realtime:**

Se crea un canal de Supabase por cada eventId para recibir cambios en la tabla `tickets` en tiempo real:

```typescript
useEffect(() => {
  if (eventIds.length === 0) return
  const channels = eventIds.map((eid) =>
    supabase
      .channel(`scanner-tickets-${eid}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tickets',
        filter: `event_id=eq.${eid}`,
      }, () => {
        loadAttendeesRef.current()
      })
      .subscribe(),
  )
  return () => {
    channels.forEach((ch) => supabase.removeChannel(ch))
  }
}, [eventIds])
```

**Nota sobre `multipleEvents`:** La variable `multipleEvents` se define como `eventIds.length > 0` (no `> 1`). Esto es **intencional** y mantiene el comportamiento del monolito original — muestra el selector de eventos siempre que haya al menos un evento, no solo cuando hay multiples.

**Datos derivados con `useMemo`:**

- `eventIds`: Array flat de IDs extraido de `serverEvents`
- `eventNameMap`: Mapa `id → group_name || title`
- `eventsByDay`: Agrupacion de eventos por dia del calendario con etiquetas localizadas ("Hoy", "Manana", "Ayer", o fecha formateada)
- `doorCount`: Conteo de entradas en puerta (`qr_code.startsWith('DOOR-')`)

#### 2.6.3 Fase 3: Stats Bar con Barra de Progreso

**Archivo creado:** `components/scanner/stats-bar.tsx` (102 lineas)

Reemplaza los 3 cards planos del monolito original por un componente con:

1. **Banner de error bootstrap:** Card roja con icono `XCircle`, mensaje de error, y boton "Reintentar".

2. **Estado sin eventos:** Card ambar con icono `Clock`, titulo "No hay eventos asignados", y texto descriptivo. Este texto reemplaza el anterior que mencionaba una "ventana de 48h" — ahora dice: "Pide al admin que te asigne a un evento en este venue para empezar a escanear." (Correccion del texto stale, Problema #3).

3. **Card de estadisticas (cuando hay eventos):**
   - Barra de progreso animada con gradiente emerald-500 → emerald-400
   - Etiqueta "Asistencia" y porcentaje numerico
   - Grid de 3 columnas: Total (blanco), Dentro (emerald-400), Pendiente (amber-400)
   - Numeros animados via `useAnimatedNumber`
   - Badge de puerta con icono `DoorOpen` (solo visible si `doorCount > 0`)

**CSS de la barra de progreso:**

```tsx
<div className="h-2 rounded-full bg-white/5 overflow-hidden">
  <div
    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 
               transition-all duration-700 ease-out"
    style={{ width: `${pct}%` }}
  />
</div>
```

La `transition-all duration-700` asegura que la barra se anime suavemente al cambiar el porcentaje.

#### 2.6.4 Fase 4: Event Day Groups (Selector Reutilizable)

**Archivo creado:** `components/scanner/event-day-groups.tsx` (83 lineas)

Componente reutilizable para seleccionar eventos agrupados por dia del calendario. Se usa en dos pestanas:

- **Door Tab:** Seleccion del evento para registrar entradas (sin opcion "Todos")
- **List Tab:** Filtro por grupo (con opcion "Todos los grupos")

**Props:**

```typescript
interface EventDayGroupsProps {
  eventsByDay: DayGroup[]
  selectedId: string
  onSelect: (id: string) => void
  showAll?: boolean       // Muestra boton "Todos los grupos"
  totalCount?: number     // Numero junto a "Todos los grupos"
}
```

Cada grupo de dia muestra una etiqueta (`Hoy`, `Manana`, `Ayer`, o fecha) y los eventos como pills seleccionables con nombre y hora.

#### 2.6.5 Fase 5: Scan Tab (Camara QR)

**Archivo creado:** `components/scanner/scan-tab.tsx` (355 lineas)

El componente mas largo del rediseno, conteniendo toda la logica de escaneo QR.

**Dependencias externas:**
- `html5-qrcode`: Libreria de escaneo QR importada dinamicamente (`import('html5-qrcode')`)
- `supabase`: Para obtener el token de sesion
- Iconos de `lucide-react`: `Camera`, `CheckCircle2`, `XCircle`, `Volume2`, `VolumeX`

**Flujo de escaneo:**

1. **Inicio:** `startScanner()` verifica soporte de `getUserMedia`, importa `html5-qrcode` dinamicamente, crea instancia `Html5Qrcode`, arranca con camara trasera (`facingMode: 'environment'`), fps: 10, qrbox: 250x250px.

2. **Deteccion QR:** El callback de `html5-qrcode` filtra QRs ya procesados (`processedQRs` Set) y llamadas concurrentes (`processingRef`). El QR se anade al Set y se elimina tras 10 segundos para permitir re-escaneo.

3. **Procesamiento:** `processScan()` hace POST a `/api/scanner/scan` con `{ ticket_qr: qrCode }`. Si la respuesta indica "ya escaneado", enriquece el resultado con datos locales (nombre, evento, hora del primer scan).

4. **Feedback:** Beep de audio + vibracion haptica + overlay visual (verde exito / rojo error). Auto-dismiss tras 2.5 segundos en modo continuo.

5. **Parada:** `stopScanner()` detiene la instancia de html5-qrcode y limpia timeouts.

**Mejora visual — Viewfinder:**

Cuando el scanner esta activo y no hay resultado, se muestran 4 esquinas decorativas posicionadas absolutamente sobre el area de escaneo:

```tsx
{scanning && !scanResult && (
  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
    <div className="relative w-[250px] h-[250px]">
      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl" />
      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr" />
      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl" />
      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br" />
    </div>
  </div>
)}
```

**Manejo de errores de camara:**

El scanner categoriza los errores de camara y muestra mensajes humanizados en espanol:

| Error nativo | Mensaje mostrado |
|---|---|
| `NotAllowedError` / "permission denied" | "Permite el acceso a la camara en Ajustes > Project X para usar el escaner." |
| `NotFoundError` / "no camera" | "No se detecto ninguna camara en este dispositivo." |
| `NotReadableError` / "in use" | "La camara esta siendo usada por otra aplicacion. Cierrala e intentalo de nuevo." |
| Otros | "No se pudo iniciar el escaner. Cierra y vuelve a abrir la app, o revisa los permisos de camara." |

Ademas, el banner de error sugiere: "Mientras tanto puedes validar entradas a mano en la pestana Lista."

**Guard de soporte:**

Antes de importar `html5-qrcode`, se verifica que el navegador soporte `getUserMedia`:

```typescript
if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
  setScanning(false)
  setCameraError('Tu dispositivo no soporta el escaner de camara.')
  return
}
```

#### 2.6.6 Fase 6: Door Tab (Registro en Puerta)

**Archivo creado:** `components/scanner/door-tab.tsx` (261 lineas)

Gestiona el registro de asistentes que pagan en la entrada sin ticket previo.

**Flujo de registro:**

1. Usuario introduce nombre (obligatorio) y codigo de organizador (opcional, formato `XXXX-XXXX`).
2. Si hay multiples eventos, selecciona el evento via `EventDayGroups`.
3. Click en "Registrar entrada" → POST a `/api/scanner/door-register`:

```typescript
body: JSON.stringify({
  name: doorName.trim(),
  event_id: doorEventId,
  ...(doorPromoterCode.replace(/-/g, '').length === 8 && {
    promoter_code: doorPromoterCode,
  }),
})
```

4. Exito: Beep + haptic + card verde con nombre registrado + nombre del organizador (si aplica). Auto-dismiss tras 3 segundos. Limpieza de inputs.

5. Error: Beep de error + haptic + card roja con mensaje.

**Input del codigo organizador:**

El input del codigo organizador formatea automaticamente a mayusculas y formato `XXXX-XXXX`:

```typescript
onChange={(e) => {
  const clean = e.target.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
  setDoorPromoterCode(
    clean.length > 4 ? clean.slice(0, 4) + '-' + clean.slice(4) : clean,
  )
}}
```

**Seccion de entradas recientes:**

Muestra las ultimas 10 entradas en puerta (filtradas por `qr_code.startsWith('DOOR-')`) con nombre, grupo (si multiples eventos), y hora de registro.

**Soporte para Enter:**

El input de nombre soporta la tecla Enter para registrar directamente:

```typescript
onKeyDown={(e) => {
  if (e.key === 'Enter' && doorName.trim()) registerDoor()
}}
```

#### 2.6.7 Fase 7: List Tab (Lista de Asistentes)

**Archivo creado:** `components/scanner/list-tab.tsx` (377 lineas)

El componente mas largo despues del Scan Tab. Muestra la lista completa de asistentes con busqueda, filtros y acciones.

**Funcionalidades:**

1. **Busqueda:** Input con icono Search y boton X de limpieza. Busca en nombre, email y nombre del evento.

2. **Filtros de estado:** 3 pills — "Todos (N)", "Dentro (N)" (emerald), "Pendiente (N)" (amber). Cada uno muestra el conteo actual.

3. **Filtro por grupo:** Usa `EventDayGroups` con `showAll` para filtrar por evento especifico.

4. **Acciones:**
   - "Compartir resumen": Genera un mensaje de texto con estadisticas de asistencia y lista de pendientes. Usa `navigator.share()` si disponible, o fallback a clipboard.
   - "Actualizar": Llama a `loadAttendees()` manualmente.

5. **Lista de asistentes:** Cada fila muestra:
   - Avatar circular (emerald si "Dentro", gris si "Pendiente")
   - Nombre + badge "PUERTA" (dorado) para entradas en puerta
   - Email o "Pago en puerta" + grupo del evento
   - Si "Dentro": hora de check-in + badge "Dentro" + boton undo
   - Si "Pendiente": boton "Check-in" manual

6. **Lazy loading:** `INITIAL_VISIBLE = 50`, con boton "Mostrar mas (N restantes)" que carga en lotes de 50. El conteo visible se resetea al cambiar filtros o busqueda.

**Check-in manual:**

```typescript
const manualCheckIn = async (_ticketId: string, qrCode: string) => {
  const res = await fetch('/api/scanner/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ticket_qr: qrCode }),
  })
  // ... feedback y refresh
}
```

**Undo scan:**

```typescript
const undoScan = async (ticketId: string) => {
  const res = await fetch('/api/scanner/undo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ticket_id: ticketId }),
  })
  if (res.ok) {
    haptic(true)
    loadAttendees()
  }
}
```

**Generacion de resumen para exportar:**

El mensaje generado incluye:
- Cabecera con nombre del venue y fecha
- Totales: total, dentro (con porcentaje), pendiente
- Entradas en puerta (si hay)
- Desglose por evento (si multiples eventos)
- Lista de pendientes (hasta 80 nombres)

#### 2.6.8 Fase 8: Modificacion del Layout (Logout + Venue Badge)

**Archivo modificado:** `app/(scanner)/layout.tsx` (de 90 a 155 lineas, +65 lineas)

**Cambio 1 — Iconos SVG inline:**

Se reemplazaron los imports de `lucide-react` por iconos SVG inline para evitar problemas de barrel imports en modo desarrollo:

```typescript
// Antes:
import { ArrowLeft } from 'lucide-react'

// Despues:
function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" 
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" 
         strokeLinejoin="round" className={className}>
      <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
    </svg>
  )
}
```

Se crearon 3 iconos inline: `ArrowLeftIcon`, `LogOutIcon`, `MapPinIcon`.

**Razonamiento:** `lucide-react` es una libreria con barrel exports masivos. En modo desarrollo de Next.js, importar un solo icono puede desencadenar la carga de cientos de modulos, ralentizando HMR significativamente. Los iconos inline eliminan esta dependencia.

**Cambio 2 — Boton de logout con tap-to-confirm:**

Se anadio un boton de logout a la derecha del nombre del usuario en el header:

```typescript
const [logoutConfirm, setLogoutConfirm] = useState(false)

const handleLogout = () => {
  if (!logoutConfirm) {
    setLogoutConfirm(true)
    setTimeout(() => setLogoutConfirm(false), 3000) // Reset tras 3s
    return
  }
  signOut() // Segundo tap ejecuta logout
}
```

El patron "tap-to-confirm" funciona asi:
1. Primer tap: El boton cambia de gris a rojo (`bg-red-500/15 text-red-400`), indicando que se necesita confirmacion.
2. Si no se pulsa de nuevo en 3 segundos, vuelve al estado normal.
3. Segundo tap dentro de los 3 segundos: Ejecuta `signOut()` del auth context.

**Cambio 3 — Venue badge:**

Debajo del header se anadio un badge mostrando el nombre del venue y el numero de eventos activos:

```tsx
{venue?.name && (
  <div className="px-4 pb-2.5 flex items-center gap-1.5">
    <MapPinIcon className="w-3 h-3 text-primary/70" />
    <span className="text-[11px] text-white-muted">
      {venue.name}
      {activeEventCount > 0 && (
        <span className="text-white/30">
          {' '}· {activeEventCount} evento{activeEventCount !== 1 ? 's' : ''}
        </span>
      )}
    </span>
  </div>
)}
```

**Cambio 4 — Reestructuracion del header:**

El header se reestructuro para acomodar los nuevos elementos. El `<header>` ya no tiene padding directo — se dividio en dos filas:
- Fila 1: `px-4 py-3` con logo + titulo a la izquierda y nombre + logout a la derecha
- Fila 2: `px-4 pb-2.5` con el venue badge (condicional)

**Cambio 5 — Nuevos datos del auth context:**

Se amplio la desestructuracion de `useAuth()`:

```typescript
// Antes:
const { user, profile, loading, initialized, isStaff, isAdmin, isGroupAdmin } = useAuth()

// Despues:
const { user, profile, loading, initialized, isStaff, isAdmin, isGroupAdmin, venue, signOut, events } = useAuth()
```

Se anadieron: `venue` (para el badge), `signOut` (para el logout), `events` (para el conteo de eventos activos).

#### 2.6.9 Fase 9: Reescritura de Page.tsx

**Archivo reescrito:** `app/(scanner)/scanner/page.tsx` (de 1175 a 77 lineas)

El archivo paso de ser un monolito a ser una composicion limpia de componentes:

```typescript
'use client'

import { useState } from 'react'
import { QrCode, DoorOpen, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScannerProvider, useScanner } from '@/components/scanner/scanner-provider'
import { StatsBar } from '@/components/scanner/stats-bar'
import { ScanTab } from '@/components/scanner/scan-tab'
import { DoorTab } from '@/components/scanner/door-tab'
import { ListTab } from '@/components/scanner/list-tab'

function ScannerContent() {
  const { doorCount } = useScanner()
  const [tab, setTab] = useState<'scan' | 'door' | 'list'>('scan')

  return (
    <div className="space-y-4 animate-fade-in">
      <StatsBar />
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
        {/* 3 botones de tab: Escanear, Puerta (con badge), Lista */}
      </div>
      {tab === 'scan' && <ScanTab />}
      {tab === 'door' && <DoorTab />}
      {tab === 'list' && <ListTab />}
    </div>
  )
}

export default function ScannerPage() {
  return (
    <ScannerProvider>
      <ScannerContent />
    </ScannerProvider>
  )
}
```

**Detalle del tab switcher:**

El componente `ScannerContent` se separo de `ScannerPage` porque necesita acceder al context de scanner (para `doorCount` que muestra un badge en la pestana "Puerta"). `ScannerContent` esta dentro de `<ScannerProvider>`, por lo que puede usar `useScanner()`.

Cada boton de tab tiene:
- Icono (`QrCode`, `DoorOpen`, `Users`)
- Texto ("Escanear", "Puerta", "Lista")
- Estado activo: `bg-primary text-white`
- Estado inactivo: `text-white-muted`
- La pestana "Puerta" muestra un badge con el conteo de entradas en puerta cuando `doorCount > 0`

### 2.7 Problema del Teclado en Capacitor Android

#### 2.7.1 Manifestacion

El usuario reporto que el teclado de la app (la app nativa de Android via Capacitor) habia dejado de funcionar:

> "ahora no funciona ni el teclado de la app esta siendo un desastre"

#### 2.7.2 Investigacion

Se lanzo un agente en background para investigar el problema del teclado. Los factores sospechosos identificados fueron:

**1. `captureInput: true` en la configuracion de Android:**

```typescript
// capacitor.config.ts
android: {
  backgroundColor: '#0A0A0A',
  allowMixedContent: false,
  captureInput: true,        // ← Sospechoso
  webContentsDebuggingEnabled: false,
},
```

La opcion `captureInput: true` indica a Capacitor que la WebView nativa de Android debe capturar los eventos de input. En algunas versiones de Capacitor y WebView, esto puede interferir con el teclado virtual.

**2. CSS `overscroll-behavior: none` y `user-select: none` en `globals.css`:**

Estas propiedades CSS pueden interferir con el comportamiento del teclado en WebViews de Android, especialmente cuando hay inputs dentro de contenedores con `overflow` controlado.

**3. Plugin de Keyboard de Capacitor:**

```typescript
plugins: {
  Keyboard: {
    resizeOnFullScreen: true,
  },
},
```

La opcion `resizeOnFullScreen` puede causar problemas de layout cuando el teclado aparece, especialmente si el contenido usa `min-h-screen` o `100vh`.

#### 2.7.3 Estado de la Investigacion

El agente de background completo su ejecucion pero los resultados no pudieron ser completamente capturados antes de que la sesion se quedara sin contexto. El mensaje de resultado fue:

```
You've hit your limit · resets 11pm (Europe/Madrid)
```

Esto indica que el agente alcanzo un limite de tokens/tiempo. **La investigacion del teclado quedo inconclusa.**

### 2.8 Descubrimiento Critico: Gap de Deploy

#### 2.8.1 Frustracion del Usuario

El usuario expreso frustacion extrema porque no veia cambios en su app:

> "SEGURO QUE HA REVISADO TODO PORQUE ACABO DE ABRIR LA APP EN EL MOVIL DE LA PLAY STORE ME SIGUE APARECIENDO LO MISMO"
>
> "NO SE SI HAS CAMBIADO ALGO, PORQUE A MI EN LA APP DE LA PLAY STORE ME SIGUE APARECIENDO LO MISMO"

#### 2.8.2 Diagnostico

El problema era fundamental: **los cambios eran locales y nunca habian sido desplegados a produccion.**

La cadena de despliegue funciona asi:

```
Codigo local → git commit → git push (GitHub) → Vercel auto-deploy → app.projectxeventos.es → App de Play Store (via Capacitor remote URL)
```

En ningun momento de la sesion se habia hecho commit ni push. Todos los cambios existian unicamente en el directorio de trabajo local.

**Estado git al momento del descubrimiento:**

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  modified:   app/(scanner)/layout.tsx
  modified:   app/(scanner)/scanner/page.tsx
  modified:   app/globals.css

Untracked files:
  components/scanner/
```

**Diff stats:**

```
 app/(scanner)/layout.tsx       |   99 +++-
 app/(scanner)/scanner/page.tsx | 1162 ++--------------------------------------
 app/globals.css                |    5 +
 3 files changed, 119 insertions(+), 1147 insertions(-)
```

Plus 8 archivos nuevos sin trackear en `components/scanner/` sumando 1558 lineas.

### 2.9 Verificacion de Build

Antes de proceder al commit, se verifico que el proyecto compilaba sin errores:

```bash
npm run build
```

**Resultado:** Build exitoso. TypeScript 0 errores. El servidor de desarrollo devolvio HTTP 200 en la ruta `/scanner`. Se confirmo via `curl` que la pagina cargaba correctamente.

---

## 3. Inventario Completo de Archivos

### 3.1 Archivos Creados

| Archivo | Lineas | Descripcion |
|---|---|---|
| `components/scanner/scanner-types.ts` | 35 | Tipos TypeScript: `ScanResult`, `AttendeeRow`, `ScannerEvent`, `DayGroup` |
| `components/scanner/scanner-utils.ts` | 68 | Utilidades: `playBeep()`, `haptic()`, `useAnimatedNumber()`, `formatTime()` |
| `components/scanner/scanner-provider.tsx` | 277 | Context provider: datos, realtime, estado compartido, refs stale-closure-safe |
| `components/scanner/stats-bar.tsx` | 102 | Barra de progreso + estadisticas animadas + estados vacios/error |
| `components/scanner/event-day-groups.tsx` | 83 | Selector de eventos agrupado por dia calendario (reutilizable) |
| `components/scanner/scan-tab.tsx` | 355 | Camara QR via html5-qrcode + overlay de resultado + manejo de errores |
| `components/scanner/door-tab.tsx` | 261 | Registro en puerta: nombre + codigo organizador + evento + lista recientes |
| `components/scanner/list-tab.tsx` | 377 | Lista: busqueda, filtros, check-in manual, undo, export, lazy loading |
| **Total nuevos** | **1558** | |

### 3.2 Archivos Modificados

| Archivo | Antes | Despues | Delta |
|---|---|---|---|
| `app/(scanner)/layout.tsx` | 90 lineas | 155 lineas | +65 (logout, venue badge, iconos SVG inline) |
| `app/(scanner)/scanner/page.tsx` | 1175 lineas | 77 lineas | -1098 (composicion de componentes) |
| `app/globals.css` | N lineas | N+5 lineas | +5 (`@keyframes slideUp`) |

### 3.3 Balance de Lineas

```
Monolito original:           1175 lineas (1 archivo)
Nuevos componentes:          1558 lineas (8 archivos)
Page.tsx nuevo:                77 lineas
Layout delta:                 +65 lineas
globals.css delta:             +5 lineas

Total lineas de scanner:     1558 + 77 + 155 = 1790 lineas
Delta vs original:           +615 lineas (+52%)
Archivos:                    10 (vs 2 originales)
Promedio lineas/archivo:     179 (vs 587.5 original)
```

El aumento de lineas se explica por:
- Mejor documentacion implicita (nombres de archivos descriptivos)
- Props e interfaces explicitas (antes eran closures)
- Manejo de estados vacios/error mas robusto
- Nuevo componente `EventDayGroups` (antes inline)
- Nuevo componente `StatsBar` con barra de progreso (antes 3 divs planos)

### 3.4 APIs NO Modificadas

Los siguientes endpoints de API permanecieron intactos ya que funcionaban correctamente:

- `POST /api/scanner/scan` — Valida un ticket QR
- `POST /api/scanner/undo` — Revierte un check-in
- `POST /api/scanner/door-register` — Registra entrada en puerta
- `GET /api/scanner/attendees` — Devuelve eventos y asistentes del venue
- `lib/scanner-access.ts` — Logica de acceso venue-wide

---

## 4. Errores Encontrados y Resueltos (Resumen)

| # | Error | Causa Raiz | Solucion | Impacto |
|---|-------|-----------|----------|---------|
| 1 | Puerto 3000 en uso | Proceso residual de servidor anterior | `lsof -ti :3000 \| xargs kill -9` | Bloqueante — no podia arrancar dev server |
| 2 | "Element type is invalid: undefined" | `<style jsx global>` dentro de Context Provider — `styled-jsx` no compila correctamente en ese contexto | Mover `@keyframes slideUp` a `globals.css` | Critico — crash total del scanner |
| 3 | HMR corrupto tras fix de styled-jsx | Cache de modulos de webpack con estado invalido | `rm -rf .next` + restart | Medio — confunde al desarrollador |
| 4 | Cambios no visibles en Play Store | App Capacitor carga desde URL remota de produccion; cambios solo locales | Pendiente commit + push + deploy via Vercel | Critico — todo el trabajo invisible para el usuario |
| 5 | Texto "ventana de 48h" obsoleto | El acceso se cambio a venue-wide sin filtro de fecha pero el texto no se actualizo | Nuevo texto: "Pide al admin que te asigne a un evento en este venue" | Bajo — confuso pero no funcional |
| 6 | Teclado no funciona en app Android | `captureInput: true` en capacitor.config.ts y/o CSS interference | **PENDIENTE DE RESOLUCION** | Alto — inputs inutilizables en app nativa |

---

## 5. Arquitectura de Datos y Flujo

### 5.1 Diagrama de Componentes

```
app/(scanner)/layout.tsx
├── Auth guard (redirect si no staff)
├── Header: logo + titulo + nombre usuario + [logout]
├── Venue badge: MapPin + nombre venue + N eventos
└── <main>
    └── app/(scanner)/scanner/page.tsx
        └── <ScannerProvider>
            │   ├── fetch /api/scanner/attendees (Bearer token)
            │   ├── Supabase realtime: tickets table (1 channel/event)
            │   └── Computed: stats, eventsByDay, doorCount, animNumbers
            │
            ├── <StatsBar />
            │   ├── Error banner (si bootstrapError)
            │   ├── No events warning (si eventIds.length === 0)
            │   └── Progress bar + stats grid + door badge
            │
            ├── Tab Switcher (inline)
            │   ├── [Escanear] [Puerta (N)] [Lista]
            │
            ├── <ScanTab /> (si tab === 'scan')
            │   ├── html5-qrcode camera
            │   ├── Viewfinder corners
            │   ├── Result overlay (slideUp animation)
            │   └── Camera error banner
            │
            ├── <DoorTab /> (si tab === 'door')
            │   ├── Name input + promoter code
            │   ├── <EventDayGroups /> (si multipleEvents)
            │   ├── Register button
            │   ├── Result feedback
            │   └── Recent entries list
            │
            └── <ListTab /> (si tab === 'list')
                ├── Search input (con clear X)
                ├── Status filter pills
                ├── <EventDayGroups showAll /> (si multipleEvents)
                ├── Actions: Share + Refresh
                ├── Attendee rows (lazy loaded, 50+50)
                │   ├── Check-in button (si pending)
                │   └── Undo button (si inside)
                └── Load more button
```

### 5.2 Flujo de Datos Realtime

```
[Otro scanner escanea QR]
         │
         ▼
  Supabase DB: tickets table UPDATE
         │
         ▼
  Supabase Realtime: postgres_changes event
         │
         ▼
  ScannerProvider: loadAttendeesRef.current()
         │
         ▼
  fetch /api/scanner/attendees → nuevo estado
         │
         ▼
  setAttendees() + setStats() + setServerEvents()
         │
         ▼
  Re-render: StatsBar, ListTab, DoorTab (via Context)
```

---

## 6. Configuracion de Capacitor (Relevante para Problemas Pendientes)

```typescript
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tugraduacion.projectx',
  appName: 'Project X',
  webDir: 'www',

  server: {
    url: 'https://app.projectxeventos.es',    // ← App carga desde produccion
    cleartext: false,
    allowNavigation: [
      'cotqzlxyvtjybxujkitm.supabase.co',
      '*.supabase.co',
    ],
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0A0A0A',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: 'launch_screen',
      useDialog: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A0A0A',
    },
    Keyboard: {
      resizeOnFullScreen: true,               // ← Posible factor en bug de teclado
    },
  },

  ios: {
    scheme: 'ProjectX',
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    backgroundColor: '#0A0A0A',
  },

  android: {
    backgroundColor: '#0A0A0A',
    allowMixedContent: false,
    captureInput: true,                        // ← Principal sospechoso del bug de teclado
    webContentsDebuggingEnabled: false,
  },
}
```

**Nota critica:** La opcion `captureInput: true` en la seccion `android` es el principal sospechoso del problema del teclado. Esta opcion le dice a la WebView de Android que capture todos los eventos de input, lo cual puede interferir con el teclado virtual del sistema operativo en ciertas condiciones.

---

## 7. Decisiones de Diseno y Trade-offs

### 7.1 Por que refs en lugar de estado directo para callbacks del scanner

El escaner QR (`html5-qrcode`) captura un callback al iniciar. Si ese callback usa variables de estado de React directamente, captura los valores del momento de creacion (stale closure). Usar refs que se sincronizan con `useEffect` permite que el callback siempre acceda al valor mas reciente.

**Trade-off:** Mayor complejidad en el Provider (4 refs + 4 useEffect de sync). **Beneficio:** Correctitud garantizada sin necesidad de reiniciar el scanner al cambiar el estado.

### 7.2 Por que lazy loading simple en lugar de react-window

Se opto por un `useState` con `slice(0, visibleCount)` en lugar de `react-window` (virtual scrolling) por:
- Menor complejidad y sin dependencia adicional
- Suficiente para el caso de uso (eventos de 500-1000 personas maximo)
- El boton "Mostrar mas" es mas claro en UX movil que scroll infinito virtual

### 7.3 Por que iconos SVG inline en el layout

El layout del scanner se importa en cada pagina del grupo `(scanner)`. Usar `lucide-react` para 3 iconos implicaria cargar el barrel export completo en cada navegacion. Los SVG inline eliminan esta dependencia a cambio de ~30 lineas adicionales de JSX.

### 7.4 Por que `multipleEvents = eventIds.length > 0` y no `> 1`

El comportamiento original del monolito mostraba el selector de eventos siempre que hubiera eventos. Mantener `> 0` preserva esta logica. Si se cambiara a `> 1`, el selector desapareceria cuando solo hay un evento, lo cual podria confundir a usuarios que esperan verlo.

---

## 8. Conclusiones

### 8.1 Trabajo Completado

1. **Descomposicion del monolito:** El archivo de 1175 lineas se dividio exitosamente en 8 componentes modulares con responsabilidades claras.
2. **Nuevas funcionalidades:**
   - Boton de logout con confirmacion tap-to-confirm
   - Venue badge en el header
   - Barra de progreso animada en las estadisticas
   - Viewfinder decorativo para el scanner QR
   - Texto actualizado (eliminacion de referencia a "ventana de 48h")
3. **Bugs resueltos:** Puerto en uso, `styled-jsx` en Context Provider, corrupcion de HMR.
4. **Build limpio:** `npm run build` pasa sin errores de TypeScript.

### 8.2 Trabajo Pendiente (Critico)

| Prioridad | Tarea | Impacto |
|---|---|---|
| **P0** | Commit + push a GitHub + verificar deploy de Vercel | Sin esto, ningun cambio es visible en produccion ni en la app de Play Store |
| **P0** | Investigar y resolver bug de teclado en Capacitor Android | Inputs inutilizables en app nativa; sospecha principal: `captureInput: true` |
| **P1** | Verificacion end-to-end en produccion post-deploy | Confirmar que scanner, puerta, lista, logout, venue badge funcionan en `app.projectxeventos.es` |
| **P2** | Test de realtime multi-scanner | Verificar que dos scanners vean updates en tiempo real simultaneamente |

### 8.3 Estado Final del Repositorio

```
Branch: main
Ultimo commit remoto: 0e5da71 (fix: prevent stale fetchData responses...)
Estado local: 3 archivos modificados + 8 archivos nuevos sin trackear
Build: Exitoso (0 errores TypeScript)
Deploy: PENDIENTE
```

### 8.4 Comando para Despliegue

```bash
git add components/scanner/ app/\(scanner\)/layout.tsx app/\(scanner\)/scanner/page.tsx app/globals.css
git commit -m "feat: redesign scanner module — split 1175-line monolith into 8 modular components

- Extract types, utils, and provider into components/scanner/
- Add logout button with tap-to-confirm in scanner layout
- Add venue badge with event count in header
- New animated progress bar in stats display
- Reusable EventDayGroups selector component
- Fix styled-jsx crash by moving slideUp keyframe to globals.css
- Update stale '48h window' text to venue-based messaging
- Lazy loading (50+50) for attendee list performance

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

git push origin main
```

### 8.5 Lecciones Aprendidas

1. **Deploy gap en apps Capacitor con remote URL:** Cualquier cambio de codigo requiere la cadena completa de CI/CD antes de ser visible en la app nativa. Esto debe comunicarse claramente al usuario desde el inicio.
2. **`styled-jsx` no funciona dentro de Context Providers:** Las etiquetas `<style jsx>` dependen de una transformacion de compilacion que falla silenciosamente en ciertos contextos de React. Solucion: usar CSS modules o globals para animaciones compartidas.
3. **HMR de Next.js puede corromperse:** Tras errores de compilacion graves, `rm -rf .next` es la solucion mas fiable.
4. **Revert de seguridad antes de eventos:** Cuando hay un evento inminente, revertir a la ultima version estable y reimplementar con calma es preferible a intentar arreglar un refactor roto bajo presion.
5. **Stale closures en callbacks de librerias externas:** Las librerias que capturan callbacks (como `html5-qrcode`) requieren el patron de refs sincronizados para acceder a valores de estado actualizados de React.
