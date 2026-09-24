# 2 Sets — Diseño de la versión 1

Fecha: 2026-09-24
Estado: aprobado en conversación, pendiente de revisión escrita

## 1. Objetivo

"2 Sets" es una app web instalable (PWA) para registrar sesiones de calistenia con lastre siguiendo el **2 Set Method de Ian Barseagle**. Cada usuario la usa en su propio teléfono con sus propios datos. La app tiene que hacer tres cosas bien:

1. Cargar una sesión en el gimnasio en segundos, con todo prellenado.
2. Aplicar las reglas de progresión del método y sugerir los pesos de la próxima sesión.
3. Mostrar la evolución: pesos, carga total, 1RM estimado, PRs e hitos.

Usuarios: 1 a 4 personas, cada una en Android o iPhone. No hay cuentas, no hay sincronización, nadie ve los datos de otro.

## 2. Alcance de la versión 1

Incluido:

- Sesiones push y pull con cinco bloques (ver sección 4).
- Carga por serie en tres modos: lastre, peso corporal, banda elástica de asistencia.
- Timer de descanso con alarma, rango fijo de 3 a 7 minutos.
- Sugerencia de próxima sesión con las reglas del método.
- Historial editable, gráficos, PRs e hitos.
- Ajustes: peso corporal, bandas, complementarios, descansos, incrementos, tema, export e import.
- PWA offline instalable, estética estoica con paleta terracota y arena.

Fuera de la versión 1:

- Cámara, conteo por voz y validación de reps (segunda etapa, con spike propio).
- Día de piernas, skills, dieta.
- Cuentas, sync, hosting compartido.

## 3. Reglas del método (dominio)

Fuente: PDF original de 34 páginas del programa, más ajustes del usuario.

### 3.1 Ejercicios

| Día | Principal (método 2 Sets) | Segundo ejercicio | Complementarios |
|---|---|---|---|
| Push | Fondos en paralelas lastrados (`dips`) | Flexiones declinadas (`decline_pushups`) | hombros, tríceps, abdominales |
| Pull | Dominadas lastradas (`pullups`) | Remo australiano (`australian_rows`) | bíceps, hombros, abdominales |

### 3.2 Principal: dos series al fallo

- **Serie 1**: max out con el "peso perfecto". Meta de fallo: 10 reps en fondos, 8 en dominadas.
- **Serie 2**: max out con 20 a 25% menos de carga que la serie 1. Meta de fallo: 15 reps en fondos, 12 en dominadas.
- Las dos series tienen **peso propio** y **regla propia**; avanzan por separado.
- Descanso entre series de trabajo: 5 a 7 minutos.

### 3.3 Regla de progresión por serie

Para cada serie del ejercicio principal, mirando la última sesión de ese ejercicio:

- Si `reps >= meta` de esa serie → **sumar el incremento** la próxima vez.
- Si `reps < meta` → **mismo peso**, buscar la meta.
- Incremento por defecto 5 kg. Ajustable a 2,5 kg por ejercicio. La app sugiere pasar a 2,5 cuando, después de subir peso, las reps de la serie 1 caen 3 o más respecto de la sesión anterior.
- Modo peso corporal y `reps >= meta` → sugerir pasar a lastre con el incremento.
- Modo banda y `reps >= meta` → sugerir banda más liviana o peso corporal; el usuario elige.
- Sin historial: las dos series arrancan en peso corporal con el aviso "encontrá tu peso perfecto: el que te haga fallar cerca de la meta".
- Primera vez que la serie 1 tiene lastre y la serie 2 no tiene historial con lastre: la serie 2 se sugiere en 80% del lastre de la serie 1, redondeado hacia abajo a múltiplos de 2,5.

### 3.4 Segundo ejercicio

- 2 series de 12 a 15 reps al fallo, con o sin carga.
- Regla: si las dos series llegan a 15 o más → sumar el incremento del segundo ejercicio (2,5 kg por defecto). Si alguna queda abajo de 12 → mantener. Entre medio → mantener.

### 3.5 Complementarios

Libres. Series, reps y carga por serie. Sin regla de progresión, solo historial.

### 3.6 Carga total y métricas

- `cargaTotal = pesoCorporal + lastreKg - asistenciaBandaKg`
- 1RM estimado (Epley): `cargaTotal * (1 + reps / 30)`
- PRs por ejercicio y por serie (serie 1 y serie 2 por separado en el principal): mejor lastre, mejor carga total, mejor 1RM, mejores reps a peso corporal.
- Hitos del programa: fondos +40 kg × 10 reps y dominadas +20 kg × 10 reps en serie 1. Progreso = mejor lastre con `reps >= 10` sobre el objetivo.

### 3.7 Alternancia de días

La app propone el día contrario al de la última sesión. Sin historial propone pull. El usuario puede elegir el otro.

## 4. La sesión: cinco bloques

| Bloque | Nombre en UI | Contenido | Registro |
|---|---|---|---|
| 1 | Ignis | Articulaciones, estiramiento, bombeo suave | checklist de 3 ítems, sin reps |
| 2 | Aproximación | 2 series de 5 reps, carga libre (lastre, PC o banda) | carga y reps por serie |
| 3 | Duo | Ejercicio principal, serie 1 y serie 2 max out | carga, reps, al fallo |
| 4 | Secundus | Segundo ejercicio, 2 series de 12 a 15 al fallo | carga, reps |
| 5 | Extra | Complementarios opcionales del catálogo | ejercicio, series con carga y reps |

Flujo de una serie: el usuario ajusta carga y reps con controles grandes y toca **Listo**. Eso marca la serie hecha y abre la pantalla de descanso. La pantalla de descanso se puede saltar. Después de la última serie de Extra, o al tocar **Terminar**, se muestra el resumen y se guarda.

Sesión activa: se persiste con `status: 'active'` en cada cambio. Si la app se recarga, se retoma donde estaba.

## 5. Modelo de datos

IndexedDB, base `twosets`, versión 1. Cinco object stores.

```js
// settings  (keyPath: 'key')
{ key: 'profile', value: {
    name: 'Julián',
    unit: 'kg',
    incrementKg: { dips: 5, pullups: 5, second: 2.5 },
    restMainSec: 300,       // 180..420
    restApproachSec: 180,   // 180..420
    theme: 'auto',          // 'auto' | 'light' | 'dark'
    schemaVersion: 1
} }

// bodyweight  (keyPath: 'id')
{ id: 'bw_…', date: '2026-09-24', kg: 78.5 }

// bands  (keyPath: 'id')
{ id: 'band_…', name: 'Roja', color: '#b03a2e', assistKg: 15 }

// extras  (keyPath: 'id')  catálogo de complementarios
{ id: 'ex_…', name: 'Curl de bíceps', day: 'pull', archived: false }
// day: 'push' | 'pull' | 'any'

// sessions  (keyPath: 'id', index: 'date')
{
  id: 'ses_…',
  date: '2026-09-24',
  day: 'push',                  // 'push' | 'pull'
  status: 'active',             // 'active' | 'done'
  startedAt: 1758720000000,
  finishedAt: null,
  bodyweightKg: 78.5,
  blocks: {
    warmup:   { items: [true, true, false] },
    approach: { sets: [Set, Set] },
    main:     { exerciseId: 'dips', sets: [Set, Set] },
    second:   { exerciseId: 'decline_pushups', sets: [Set, Set] },
    extra:    [ { exerciseId: 'ex_…', sets: [Set, …] } ]
  },
  notes: ''
}

// Set
{
  load: { mode: 'weight', kg: 20, bandId: null },  // mode: 'weight' | 'bodyweight' | 'band'
  reps: 9,
  halfReps: 0,        // reservado para cámara
  failedReps: 0,      // reservado para cámara
  toFailure: true,
  done: true,
  source: 'manual'    // 'manual' | 'camera'
}
```

Identificadores: prefijo más `crypto.randomUUID()`. Fechas de sesión en formato `YYYY-MM-DD` local. Timestamps en milisegundos.

Export: un JSON `{ app: '2sets', schemaVersion: 1, exportedAt, settings, bodyweight, bands, extras, sessions }`. Import: valida `app` y `schemaVersion`, pide confirmación y reemplaza todo. Un `migrate(data)` en `db.js` sube versiones futuras.

## 6. Módulos

```
2sets/
  index.html              shell, barra de tabs, contenedores de pantallas, overlay de descanso
  manifest.webmanifest    nombre, ícono, colores, display standalone
  sw.js                   cache de app shell, notificación al terminar descanso
  css/tokens.css          variables de color, tipografía, espaciado, modo oscuro
  css/app.css             layout, componentes: tarjetas, chips, steppers, botones, tabs
  js/app.js               arranque, router por hash, registro de pantallas, tema
  js/db.js                apertura de IndexedDB, get/put/getAll/delete por store, export/import, migrate
  js/model.js             funciones puras de dominio (sección 7)
  js/templates.js         plantillas push y pull, catálogo de ejercicios fijos, seeds de extras y bandas
  js/timer.js             descanso (sección 8)
  js/charts.js            gráfico de líneas SVG
  js/quotes.js            citas estoicas y selección por fecha
  js/ui.js                helpers de DOM, formato de fechas y kilos, toasts
  js/screens/home.js
  js/screens/session.js
  js/screens/history.js
  js/screens/progress.js
  js/screens/settings.js
  assets/icons/           ícono PWA 192 y 512, logo II en SVG
  assets/audio/           silencio en loop y alarma, como data URI generados en código
  tests/model.test.mjs
  tests/timer.test.mjs
  docs/superpowers/specs/ este documento
  docs/superpowers/plans/ plan de implementación
```

Sin dependencias externas en tiempo de ejecución. Fuentes de Google (Nunito, Cormorant Garamond) con fallback a sistema; el service worker las cachea al primer uso.

## 7. Lógica de dominio: `model.js`

Funciones puras, sin acceso a DOM ni a la base. Todas testeadas con `node --test`.

```js
totalLoad(set, bodyweightKg, bandsById) → number
epley1RM(totalLoadKg, reps) → number
roundDown2_5(kg) → number
EXERCISES → { dips: {day:'push', role:'main', targets:[10,15]},
              pullups: {day:'pull', role:'main', targets:[8,12]},
              decline_pushups: {day:'push', role:'second', range:[12,15]},
              australian_rows: {day:'pull', role:'second', range:[12,15]} }
suggestMain(exerciseId, lastMainBlock, opts) → { sets: [ {load, hint}, {load, hint} ], switchTo2_5: bool }
suggestSecond(exerciseId, lastSecondBlock, opts) → { load, hint }
nextDay(lastSession) → 'push' | 'pull'
computePRs(sessions, bodyweightByDate, bandsById) → { [exerciseId]: { set1: {...}, set2: {...} } }
detectNewPRs(prsBefore, session, …) → [ { exerciseId, slot, type, value } ]
milestones(prs) → { dips: {targetKg:40, bestKg, pct}, pullups: {targetKg:20, bestKg, pct} }
seriesFor(sessions, exerciseId, slot, metric, …) → [ {date, value} ]   // metric: 'added' | 'total' | 'e1rm' | 'reps'
clampRest(sec) → number   // 180..420
```

`opts` lleva `incrementKg`, `previousMainBlock` (para la sugerencia de pasar a 2,5) y `bandsById`.

## 8. Timer de descanso: `timer.js`

- Duración por bloque: Aproximación y Extra usan `restApproachSec`; Duo y Secundus usan `restMainSec`. El usuario puede ajustar en el overlay dentro del rango.
- `start(seconds, meta)`: clamp a 180..420, guarda `restEndAt` en `localStorage`, pide wake lock de pantalla, arranca el audio silencioso en loop, muestra el overlay.
- `adjust(deltaSec)`: cambia el fin dentro del rango.
- `skip()`: cierra sin alarma.
- Tick cada 250 ms calcula `restante = restEndAt - Date.now()`. Nunca cuenta con `setInterval` acumulado.
- Al llegar a cero: sonido de alarma con WebAudio (tres tonos), `navigator.vibrate` si existe, notificación vía `registration.showNotification` si hay permiso, overlay en estado "terminado" hasta que el usuario lo cierre.
- `visibilitychange` a visible: recalcula; si el fin ya pasó, dispara la alarma en el acto.
- Al iniciar la app, si hay `restEndAt` guardado y vigente, reabre el overlay.
- Permiso de notificaciones: se pide la primera vez que el usuario toca "Start rest". Si lo niega, la app sigue con sonido y vibración.
- iOS: sin `vibrate`; el audio silencioso evita la suspensión de la página en Safari cuando la app está instalada. Se prueba en ambos teléfonos antes de dar por buena la estrategia.

## 9. Pantallas

Navegación por hash con cinco tabs fijas abajo: Inicio, Entrenar, Historial, Progreso, Ajustes.

**Inicio.** Saludo con nombre y fecha en castellano. Cita estoica del día. Tarjeta principal "Hoy toca PULL" con los pesos sugeridos de serie 1 y serie 2 y botón "Empezar". Si hay sesión activa, la tarjeta dice "Sesión en curso" y retoma. Fila de estadísticas: sesiones totales, esta semana, último PR.

**Entrenar.** Si no hay sesión activa: elegir push o pull, con el sugerido marcado. Con sesión activa: los cinco bloques como tarjetas expandibles con el nombre latino y un subtítulo. Cada serie es una fila con selector de modo (Lastre, PC, Banda), stepper de kilos de a 2,5 con entrada directa, selector de banda, stepper de reps grande, y botón "Listo". Debajo de cada serie del principal y del segundo ejercicio se ve lo que se hizo la última vez. Botón "Terminar" al pie. Resumen al terminar: duración, PRs nuevos, sugerencia de la próxima, botón "Guardar".

**Historial.** Lista de sesiones agrupada por mes, cada una con día, ejercicio principal y las dos series. Detalle con todos los bloques, edición inline de carga y reps, borrado con confirmación.

**Progreso.** Selector de ejercicio y de serie, selector de métrica (lastre, carga total, 1RM, reps). Gráfico de líneas SVG con puntos y fechas. Lista de PRs. Barras de hitos.

**Ajustes.** Nombre, peso corporal con fecha, bandas (alta, baja, edición), complementarios (alta, baja, archivado), descanso por defecto principal y de aproximación, incremento por ejercicio, tema, exportar, importar, acerca del método.

## 10. Estética

Referencia: app "El Templo - Calistenia". Clima estoico, paleta terracota y arena, ícono de templo, nombres latinos, cita en serif itálica, etiquetas en mayúsculas con espaciado, botones píldora.

Tokens claros: `--bg #EDE6DE`, `--surface #F5F0E8`, `--surface-2 #D3C7BB`, `--primary #895B3E`, `--primary-strong #AE6A47`, `--ink #3E3125`, `--ink-muted #7A6656`, `--gold #AB8D74`, `--card-dark #332A1F`.

Tokens oscuros: `--bg #1D1A16`, `--surface #2B261F`, `--surface-2 #3A332B`, `--ink #EDE6DE`, `--ink-muted #B8A896`, `--primary #AE6A47`, `--gold #C4A98C`.

Tipografía: Nunito para interfaz, Cormorant Garamond itálica para citas y lemas. Logo: numeral romano II entre dos columnas, SVG inline. La pantalla de descanso siempre en modo oscuro con el contador grande.

Móvil primero, una mano, botones de 48 px mínimo, sin scroll horizontal, gutter de 16 px. Respeta `prefers-color-scheme` con override manual.

## 11. Persistencia y errores

- Toda escritura pasa por `db.js`, devuelve promesas y propaga errores. Las pantallas muestran un toast "No se pudo guardar" y mantienen el estado en memoria para reintentar.
- La sesión activa se guarda en cada cambio, con debounce de 300 ms.
- `localStorage` solo para `restEndAt`, tema y última pestaña. Todo con try/catch.
- Import: validación de esquema, confirmación explícita, backup automático del estado actual a un JSON descargable antes de reemplazar.

## 12. PWA y hosting

- `manifest.webmanifest` con `display: standalone`, `theme_color #895B3E`, íconos 192 y 512.
- `sw.js` precachea el app shell y responde cache-first para los archivos propios, network-first para fuentes. Versionado por constante; al cambiar, borra caches viejos.
- Desarrollo local: `python -m http.server 8000` en la carpeta del proyecto. En teléfono hace falta HTTPS para instalar la PWA y para notificaciones: GitHub Pages es la opción prevista, no forma parte de esta versión.

## 13. Testing

- `node --test tests/` cubre `model.js` completo y las partes puras de `timer.js` (clamp, cálculo de restante, decisión de disparo tras suspensión).
- Casos mínimos de progresión: sube peso al llegar a la meta, mantiene si no llega, dominadas con 8 y 12, sugerencia de 2,5, banda y peso corporal, primera sesión sin historial, serie 2 seed al 80%.
- Casos de PR: primer registro es PR, mejora por lastre, mejora por 1RM sin cambiar lastre, no hay PR si empeora.
- UI: prueba manual en Android e iPhone con checklist: instalar, sesión completa, descanso con pantalla bloqueada, export e import.

## 14. Segunda etapa: cámara

Queda fuera de esta versión, pero el modelo ya la contempla: cada `Set` tiene `halfReps`, `failedReps` y `source`. Diseño previsto: MediaPipe Pose Landmarker en el browser, máquina de estados por rep con tres veredictos (completa, media, fallida), voz con `speechSynthesis` en castellano, modo asistido donde el usuario confirma el conteo antes de guardar. Se decide entonces si las medias reps alimentan la regla de progresión; la recomendación es que no.

## 15. Decisiones tomadas

- Vanilla PWA sin build, sin dependencias, git en la carpeta del proyecto.
- Local-first por usuario, sin backend.
- Split push y pull, sin piernas.
- Carga en tres modos, incluida banda de asistencia, también en las series principales.
- Timer clamped a 3 a 7 minutos con notificación como alarma principal.
- Estética El Templo adaptada, nombre "2 Sets", logo II.
