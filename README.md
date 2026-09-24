# 2 Sets

App web instalable (PWA) para registrar sesiones de calistenia con lastre siguiendo el **2 Set Method** de Ian Barseagle. Todo vive en tu teléfono: sin cuentas, sin servidor, sin sync.

## Qué hace

- Sesiones push y pull con cinco bloques: Ignis (entrada en calor), Aproximación (2 × 5), Duo (las dos series al fallo), Secundus (segundo ejercicio, 12 a 15 al fallo) y Extra (complementarios).
- Carga por serie en tres modos: lastre, peso corporal o banda elástica de asistencia.
- Timer de descanso de 3 a 7 minutos con alarma, vibración y notificación.
- Sugerencia de la próxima sesión con las reglas del método: 10 y 15 reps en fondos, 8 y 12 en dominadas, incrementos de 5 o 2,5 kg.
- Historial editable, gráficos de lastre, carga total, 1RM estimado y reps, PRs e hitos.
- Carga de sesiones pasadas desde Progreso, para pasar lo anotado en papel y ver la curva desde el día 1. Quedan marcadas como "papel" en el Historial.
- Export e import de backup en JSON.

## Correr localmente

Sin build ni dependencias. Cualquier servidor estático sirve:

```bash
python -m http.server 8000
```

Abrí `http://localhost:8000` en el navegador.

## Tests

```bash
npm test
```

Corre los tests de dominio con el runner de Node. Los flujos de pantalla se verifican en Chrome headless:

```bash
node tools/headless.mjs "http://127.0.0.1:8000/index.html#/inicio" --wait "document.querySelector('#screen .card')" --script tests/browser/session-flow.js
```

Otros scripts en `tests/browser/`: `history-flow.js`, `progress-flow.js`, `settings-flow.js`, y las páginas `db.html` y `timer.html`.

## Publicar cambios

El service worker sirve los archivos propios desde su cache. Cada vez que cambies algo y lo publiques, subí la constante `VERSION` en `sw.js`; si no, los teléfonos siguen viendo la versión vieja. En desarrollo, para no pelear con la cache, abrí DevTools, pestaña Application, y marcá "Update on reload" o "Bypass for network".

## Instalar en el teléfono

La cámara, las notificaciones y la instalación como PWA piden HTTPS. La opción prevista es GitHub Pages:

1. Subí el repo a GitHub y activá Pages desde la rama principal, carpeta raíz.
2. Abrí la URL en el teléfono.
3. Android: menú de Chrome, "Agregar a pantalla de inicio". iPhone: compartir en Safari, "Agregar a inicio". En iPhone hace falta iOS 16.4 o superior para las notificaciones.

## Checklist de prueba en teléfono

- Instalación limpia: 4 bandas y 6 complementarios de fábrica, Inicio sugiere PULL.
- Sesión pull completa con banda en aproximación, peso corporal en serie 1 y lastre en el segundo ejercicio. El resumen muestra PRs.
- Descanso: −30 s en 03:00 no baja, +30 s en 07:00 no sube. Bloquear el teléfono durante un descanso de 3 minutos: llega la alarma o la notificación. Al volver a abrir, dice "Descanso terminado".
- Recargar en medio de una sesión la retoma.
- Exportar, importar un backup vacío válido, importar el archivo original: el historial vuelve idéntico.
- Modo oscuro manual y automático.
- Sin scroll horizontal a 360 px de ancho.

## Estructura

```
index.html            shell, tabs, overlay de descanso
manifest.webmanifest  PWA
sw.js                 cache offline y notificaciones
css/                  tokens (paleta terracota y arena) y componentes
js/model.js           reglas del método, PRs, hitos, series (puro, testeado)
js/db.js              IndexedDB, export e import
js/templates.js       plantillas de sesión y datos semilla
js/timer.js           descanso: wake lock, audio, alarma, notificación
js/charts.js          gráfico SVG
js/quotes.js          citas estoicas
js/setrow.js          fila de serie
js/screens/           inicio, entrenar, historial, progreso, ajustes
tests/                node --test y flujos de browser
tools/                headless.mjs y make_icons.py
docs/superpowers/     spec y plan de la versión 1
```

## Segunda etapa

Conteo de repeticiones por cámara con MediaPipe Pose en el browser, voz que cuenta, aviso de rep fallida y media rep por rango corto. El modelo de datos ya reserva `halfReps`, `failedReps` y `source` en cada serie.
