# Plan de ejecucion — Scanner al siguiente nivel

**Fecha:** 17 de abril de 2026  
**Estado actual:** scanner en produccion es monolito de 1175 lineas sin desplegar refactor  
**Objetivo:** convertir el scanner en una herramienta que la gente de puerta **ame usar**, no que toleren

---

## 0. Contexto honesto

Lo que estas viendo en la app de Play Store / `app.projectxeventos.es` es el **scanner viejo**. El refactor que hice antes (8 componentes, barra de progreso, logout, venue badge, viewfinder con esquinas, etc.) esta en local sin commitear.

**Pero tienes razon:** incluso el refactor se queda en "funcional bonito". No es un scanner de **evento profesional**. Le falta el factor "wow" que hace que tu staff de puerta quiera trabajar con esta app y no con otra.

Este plan va en 4 fases. Fase 1 es lo minimo para esta noche. Fase 2-4 es vision a medio plazo.

---

## 1. Diagnostico del scanner actual (el que ves en produccion)

### Lo que esta bien
- Funciona (escanea, valida, actualiza)
- Realtime entre scanners
- Dark mode nativo
- Responsive en movil

### Lo que **no** esta al nivel de una app de evento profesional

| Area | Problema |
|---|---|
| **Header** | Nombre del usuario en texto plano. Sin logout. Sin avatar. Sin feedback de venue. |
| **Stats** | 3 numeros planos. Sin barra de progreso. Sin porcentaje. Sin tasa de entrada. Sin ETA. Sin comparacion con ritmo esperado. |
| **Camara** | Cuadro negro enorme vacio cuando esta inactivo. Sin "hero moment" al escanear. Sin animacion de exito contundente. Sin linterna para venue oscuro. Sin deteccion de iluminacion. |
| **Feedback** | Beep basico. Vibracion basica. Sin "bienvenida" personalizada (nombre grande en pantalla). Sin mensajes diferenciados (VIP vs estandar). |
| **Puerta** | Formulario plano. Sin UX para cobro. Sin ranking de organizador. Sin foto opcional. Sin quick-add de cantidades. |
| **Lista** | Busqueda basica. Sin filtros avanzados. Sin acciones en lote. Sin export a PDF. Sin timeline por asistente. |
| **Estado** | Sin indicador de conexion. Sin modo offline. Si se cae internet, el scanner muere. |
| **Social** | El staff no ve lo que hacen los demas scanners. Cada uno en su isla. |

---

## 2. Vision — ¿que deberia ser el scanner?

Piensa en las mejores apps de eventos que existen (Dice, ShowSlinger, Eventbrite Organizer). Que tienen:

1. **Hero moments** — al escanear correctamente, el nombre del asistente **llena la pantalla** en verde vivo durante medio segundo. El staff siente que valido una persona real, no un string.
2. **Informacion densa pero digerible** — sabes exactamente cuantas personas faltan, a que ritmo van entrando, y si vas a terminar a tiempo.
3. **Ergonomia de puerta** — boton de linterna a un tap, camara arranca en 200ms, feedback haptico inmediato.
4. **Vida** — el scanner "respira": pulsos, skeletons, transiciones cubic-bezier, micro-animaciones al cambiar tab.
5. **Zero-friction** — nada de "carga", "error", "retry manual". Todo reacciona o se recupera solo.

El scanner de Project X **no tiene que parecer una app de graduacion** — tiene que parecer una herramienta de control de acceso de una discoteca premium.

---

## 3. Plan por fases

### Fase 1 — Ship lo que ya esta hecho (1-2 horas, HOY)

**Objetivo:** Deployar el refactor actual para que al menos lo que ya existe funcione en produccion.

- [ ] Commit + push del refactor scanner (8 componentes, layout con logout, venue badge, progress bar)
- [ ] Verificar deploy automatico Vercel
- [ ] Prueba end-to-end en `app.projectxeventos.es/scanner` con usuario real
- [ ] Rollout: la Play Store app lo coge automaticamente (remote URL)
- [ ] Smoke test: QR, puerta, lista, logout, filtros, export

**Deliverable esta noche:** scanner con progress bar animada, logout tap-to-confirm, venue badge, viewfinder con esquinas, stats animados, 8 componentes modulares.

### Fase 2 — Hero moments + ergonomia minima (2-4 horas, HOY si hay tiempo)

Lo que eleva el scanner de "funcional" a "profesional". Todo implementable en una sesion intensa.

#### 2.1 Hero moment de scan exitoso
- Al escanear OK: el overlay ocupa **toda la pantalla** durante 1.2s
- Nombre en font-size 48px con gradiente dorado/verde
- Circulo verde animado con check rebotando
- Numero "Dentro 55 / 268" en subtitulo
- Auto-dismiss con fade-out suave

```tsx
// Pseudocodigo
<div className="fixed inset-0 bg-emerald-500/95 backdrop-blur-3xl z-50
                animate-hero-enter flex flex-col items-center justify-center">
  <div className="w-32 h-32 rounded-full bg-white/20 flex items-center justify-center
                  animate-bounce-in">
    <CheckCircle2 className="w-20 h-20 text-white" />
  </div>
  <h1 className="text-5xl font-black text-white mt-6">{user_name}</h1>
  <p className="text-white/70 text-lg mt-2">Dentro · {scanned}/{total}</p>
</div>
```

#### 2.2 Hero moment de rechazo
- Overlay rojo ocupando toda pantalla
- Shake haptic fuerte (patron [100, 50, 100])
- X grande + mensaje claro ("Ya entro a las 01:23", "Ticket invalido", "Evento equivocado")
- Confirmacion con tap para volver — **no auto-dismiss** (el staff tiene que leer)

#### 2.3 Linterna / flash
- Boton dedicado en la esquina del viewfinder (junto al sonido)
- Solo visible si el device la soporta (`navigator.mediaDevices.getSupportedConstraints().torch`)
- Toggle con icono Flashlight / FlashlightOff
- Esencial para venues oscuros

#### 2.4 Tasa de entrada en vivo
- En StatsBar, debajo de la barra de progreso, linea secundaria:
- "12 / min · Terminamos ~01:45" (calculado con tasa de los ultimos 60s)
- Actualizacion en tiempo real con el realtime subscription

```typescript
// Calculo de ETA
const last60s = attendees.filter(a =>
  a.scanned_at && Date.now() - new Date(a.scanned_at).getTime() < 60_000
)
const rate = last60s.length // por minuto
const remaining = stats.pending
const etaMinutes = rate > 0 ? remaining / rate : Infinity
const etaTime = new Date(Date.now() + etaMinutes * 60_000)
```

#### 2.5 Indicador de conexion
- Dot pulsante en el header junto al venue badge
- Verde: conectado + realtime activo
- Amarillo: conectado pero realtime roto
- Rojo: offline (pero scanner sigue funcionando en queue local)

### Fase 3 — Polish + diferenciacion (1-2 dias, semana proxima)

Esto separa tu app del resto.

#### 3.1 Swipe entre tabs
- Gestos touch horizontal en mobile → cambio de tab
- Animacion de slide lateral con `transform: translateX()`
- Indicador swipeable (puntos o underline animado)

#### 3.2 Modo bulk / speed scan
- Toggle "Modo rapido" en la top bar
- Suprime el overlay de confirmacion
- Solo haptic + beep ligero
- Perfect para colas largas cuando ya conoces el flujo

#### 3.3 Busqueda fuzzy con tildes
- Libreria `fuse.js` para tolerar typos, acentos, mayusculas
- "maria" → encuentra "Maria", "MARIA", "María"
- Weight por relevancia (nombre > email > grupo)

#### 3.4 Acciones por asistente
- Tap largo en fila de asistente → bottom sheet
- Opciones: llamar, WhatsApp, marcar VIP, anadir nota, historial
- Notas van a campo nuevo en tabla `tickets` (migration necesaria)

#### 3.5 Ranking de organizadores
- En Door tab, seccion "Tu ranking hoy"
- Top 5 organizadores por numero de entradas en puerta
- Con avatares + numero + tendencia (arrow up/down vs evento anterior)

#### 3.6 Export profesional
- Boton "Exportar" en Lista tab con menu:
  - Texto (actual, via clipboard/share)
  - PDF (libreria `jsPDF` o server-side Puppeteer)
  - Excel / CSV
  - Link compartible con caducidad

### Fase 4 — Vision a largo plazo (meses)

Ideas ambiciosas. Van al roadmap, no son prioridad inmediata.

- **Modo offline total** — IndexedDB + Service Worker con sync en background
- **Voz** — anuncio automatico al escanear: "Juan Perez, dentro 55 de 268"
- **Feed en vivo** — stream de todas las entradas visible a admin (un WebSocket global)
- **Analytics post-evento** — dashboard con graficos de picos, no-shows, tiempos medios
- **Reconocimiento facial** — foto opcional al registrar puerta, match al salir (privacy-first)
- **Accesibilidad** — modo alto contraste, tipografia grande, voice-over compatible
- **Colores por venue** — paleta personalizable por organizacion
- **White label** — permitir que terceros revendan tu scanner con su branding

---

## 4. Detalle tecnico por fase 2

### 4.1 Archivos a crear / modificar

```
components/scanner/
  ├─ hero-overlay.tsx          ← NUEVO: full-screen success/error
  ├─ rate-indicator.tsx         ← NUEVO: tasa + ETA
  ├─ connection-dot.tsx         ← NUEVO: indicador de realtime
  ├─ torch-button.tsx           ← NUEVO: linterna
  ├─ stats-bar.tsx              ← MODIFICAR: integrar rate-indicator
  ├─ scan-tab.tsx               ← MODIFICAR: usar hero-overlay + torch
  └─ scanner-provider.tsx       ← MODIFICAR: exponer rate, connection status

app/globals.css                 ← MODIFICAR: @keyframes hero-enter, bounce-in
```

### 4.2 Hooks nuevos

```typescript
// components/scanner/hooks/use-scan-rate.ts
export function useScanRate(attendees: AttendeeRow[]) {
  const [rate, setRate] = useState(0) // scans per minute

  useEffect(() => {
    const calc = () => {
      const now = Date.now()
      const last60s = attendees.filter(a =>
        a.scanned_at && now - new Date(a.scanned_at).getTime() < 60_000
      )
      setRate(last60s.length)
    }
    calc()
    const id = setInterval(calc, 5000) // Recalc cada 5s
    return () => clearInterval(id)
  }, [attendees])

  return rate
}

// components/scanner/hooks/use-connection-status.ts
export function useConnectionStatus() {
  const [online, setOnline] = useState(true)
  const [realtimeOk, setRealtimeOk] = useState(true)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Ping heartbeat para detectar realtime roto
  useEffect(() => {
    const channel = supabase.channel('heartbeat')
    channel
      .on('presence', { event: 'sync' }, () => setRealtimeOk(true))
      .subscribe(status => {
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setRealtimeOk(false)
      })
    return () => { supabase.removeChannel(channel) }
  }, [])

  return { online, realtimeOk }
}
```

### 4.3 Animaciones en globals.css

```css
@keyframes hero-enter {
  from { opacity: 0; transform: scale(1.1); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes hero-exit {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.95); }
}

@keyframes bounce-in {
  0%   { transform: scale(0); }
  60%  { transform: scale(1.1); }
  100% { transform: scale(1); }
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.5; transform: scale(0.95); }
}
```

### 4.4 Compatibilidad torch

```typescript
// components/scanner/torch-button.tsx
export function TorchButton({ videoTrack }: { videoTrack: MediaStreamTrack | null }) {
  const [on, setOn] = useState(false)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    if (!videoTrack) return
    const caps = videoTrack.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
    setSupported(!!caps.torch)
  }, [videoTrack])

  const toggle = async () => {
    if (!videoTrack || !supported) return
    const next = !on
    await videoTrack.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
    setOn(next)
  }

  if (!supported) return null

  return (
    <button
      onClick={toggle}
      className={cn('w-12 h-12 rounded-full flex items-center justify-center',
        on ? 'bg-amber-500 text-black' : 'bg-white/10 text-white/60')}
    >
      {on ? <Flashlight className="w-5 h-5" /> : <FlashlightOff className="w-5 h-5" />}
    </button>
  )
}
```

---

## 5. Prioridades esta noche

Si estamos en la tarde del evento y tienes **2 horas utiles antes de que empiece**:

### Must (hora 1)
1. Deploy del refactor (30 min)
2. Verificar en produccion (15 min)
3. **Hero overlay de exito** (30 min) — es el que mas impacto tiene visualmente
4. **Linterna** (15 min) — crucial si venue oscuro

### Should (hora 2)
5. **Rate indicator** en StatsBar (30 min)
6. **Connection dot** en header (20 min)
7. **Hero overlay de error** (20 min)

### Could (si da tiempo)
8. Swipe entre tabs (30 min)
9. Fuzzy search con fuse.js (30 min)

### Won't (para la semana que viene)
- Modo offline total
- Ranking de organizadores
- Export PDF
- Acciones long-press
- Todo lo de Fase 4

---

## 6. Riesgos

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| Bug en el refactor que no detecte en local | Alto — no se puede usar en evento | Deploy YA y usar proxima hora para verificar con usuario real |
| Animaciones pesadas en moviles viejos | Medio — lag perceptible | `prefers-reduced-motion` + feature flag |
| Linterna rompe camara en Android antiguo | Medio | Try/catch + fallback a camara sin torch |
| Supabase se satura otra vez | Critico | Plan Pro activo, monitoreo de IO budget |
| Teclado sigue sin funcionar en Capacitor | Critico para Puerta | Investigar `captureInput`, `resizeOnFullScreen` |

---

## 7. Decision que necesito de ti

Tengo que saber:

1. **¿Ship ya el refactor actual?** → Commit + push → live en 5 minutos. Sin esperar.

2. **¿Cuanto tiempo antes del evento?** → segun eso vamos con Fase 2 completa, parcial, o solo Fase 1.

3. **¿Que te molesta MAS ahora?**
   - (a) Que los numeros se vean planos → Hero overlay y progress bar resuelven
   - (b) Que no haya feedback al escanear → Hero overlay lo soluciona
   - (c) Que el header sea feo → venue badge y logout del refactor ayudan
   - (d) Que sea "aburrido" → Hero overlays + animaciones + rate indicator
   - (e) Otra cosa que te irrita especificamente

Contestame eso y ejecuto inmediatamente.
