# Ficha de progreso — Diseño (etapa 1 a 3)

Fecha: 2026-09-24
Estado: aprobado en conversación
Depende de: `2026-09-24-2sets-design.md` (v1 publicada como 1.2.1)

## 1. Objetivo

Convertir la pestaña Progreso en una ficha de personaje: nivel y experiencia, seis atributos, fuerza relativa con escalones, tendencia y estancamiento por ejercicio, composición corporal con objetivo, y constancia. Todo calculado en el teléfono a partir de las sesiones y de datos nuevos del cuerpo. El personaje 3D queda para una etapa posterior que consume estos mismos atributos.

## 2. Alcance

Incluido:

- Perfil: sexo, altura, objetivo corporal (bajar, mantener, subir) con peso y grasa objetivo opcionales.
- Mediciones con cinta métrica (cintura, cuello, cadera) o con balanza de bioimpedancia (porcentaje de grasa), mezclables.
- Grasa estimada con la fórmula de la Marina de EE. UU., masa magra estimada, tendencias de peso y grasa.
- Motor de estadísticas: fuerza relativa y escalones, pendiente, estancamiento con acción, constancia, volumen, seis atributos, experiencia, nivel y título.
- Pantalla Progreso nueva con la ficha arriba y lo actual abajo. Formulario de mediciones. Recordatorio cada 28 días.
- Migración de base a versión 2 y de backups.

Fuera:

- Personaje 3D, desbloqueos cosméticos, escalones distintos por sexo, unidades imperiales.

## 3. Datos

### 3.1 Perfil (store `settings`, key `profile`), campos nuevos

```js
sex: 'm' | 'f',                 // default 'm'
heightCm: number | null,        // default null
goal: {
  direction: 'bajar' | 'mantener' | 'subir',   // default 'mantener'
  targetWeightKg: number | null,
  targetBodyFatPct: number | null,
  setAt: 'YYYY-MM-DD' | null,   // cuándo se fijó el objetivo
  startWeightKg: number | null, // peso promedio semanal al fijarlo
}
```

### 3.2 Mediciones (store nuevo `measurements`, keyPath `id`, índice `date`)

```js
{ id: 'mea_…', date: 'YYYY-MM-DD', source: 'cinta' | 'balanza',
  waistCm: number | null, neckCm: number | null, hipCm: number | null,   // cinta
  bodyFatPct: number | null }                                            // balanza (manual)
```

`bodyFatOf(row, profile)` devuelve `row.bodyFatPct` si existe; si no, la fórmula de la Marina con los centímetros y el perfil; `null` si faltan datos.

### 3.3 Base y backups

- `DB_VERSION` pasa a 2: `onupgradeneeded` crea `measurements` si no existe. Los stores anteriores no cambian.
- Export `schemaVersion: 2` con la sección `measurements`. `validateExport` acepta 1 y 2. `migrate` lleva 1 a 2 agregando `measurements: []`.
- `STORES` incluye `measurements`; `ensureSeeds` no siembra mediciones.

## 4. Fórmulas

### 4.1 Grasa corporal (Marina de EE. UU., centímetros, log10)

- Hombres: `495 / (1.0324 − 0.19077·log10(cintura − cuello) + 0.15456·log10(altura)) − 450`
- Mujeres: `495 / (1.29579 − 0.35004·log10(cintura + cadera − cuello) + 0.22100·log10(altura)) − 450`
- Resultado redondeado a 0,1 y acotado a 2..60. `null` si cintura ≤ cuello, si falta altura, o si falta cadera en mujeres. En pantalla: "estimación con cinta, margen de unos 3 puntos".
- Masa magra: `peso × (1 − grasa / 100)`.

### 4.2 Peso

- `weeklyAvg(rows, endISO)`: promedio de las entradas en los 7 días que terminan en `endISO` inclusive; `null` si no hay.
- `delta30(rows, todayISO)`: `weeklyAvg(hoy) − weeklyAvg(hoy − 30 días)`; si la ventana vieja está vacía, usa la entrada más cercana anterior a hoy − 30; `null` si no hay dato viejo.
- Grasa: misma lógica sobre `bodyFatOf` de las mediciones, con `deltaFat30`.

### 4.3 Fuerza relativa y escalones

- `ratio = e1RM_serie1 / pesoCorporal` usando el mejor 1RM estimado de la serie 1 en las últimas 8 semanas y el peso de esa sesión (o el último conocido).
- Escalones (`TIERS`): dominadas `[1.00 Novato, 1.25 Iniciado, 1.50 Intermedio, 1.75 Avanzado, 2.00 Élite]`; fondos `[1.10, 1.40, 1.70, 2.00, 2.30]` con los mismos nombres. Debajo del primero: "Base".
- `tierFor(ratio, table)` → `{ name, index, nextName, nextRatio }` (`nextRatio` null en Élite).
- Kilos para el siguiente escalón, expresados como lastre en serie 1 a la meta de reps del ejercicio: `total = nextRatio·bw / (1 + meta/30)`, `lastre = max(0, total − bw)`, redondeado a 0,5.

### 4.4 Tendencia y estancamiento

- `slope(points)`: regresión lineal por mínimos cuadrados sobre los últimos 6 puntos de 1RM de la serie 1 (x = 0..n−1). Etiqueta: `> +0.75` creciendo, `< −0.75` cayendo, si no estable; con menos de 3 puntos "sin datos".
- `stagnation(sessions, exerciseId, opts)`: recorre las sesiones del ejercicio en orden; una sesión mejora si la carga total de la serie 1 supera la mejor previa, o iguala la carga con más reps. Cuenta las sesiones consecutivas sin mejora al final. `stagnant = count >= 4`. Sugerencia: si las notas de las últimas 3 sesiones mencionan `dorm` o `sueñ` → "Revisá el sueño: tus notas lo mencionan"; si el incremento del ejercicio es 5 → "Pasá a incrementos de 2,5 kg"; si no → "Semana de descarga: 50% de la carga, después volvé a tu peso".

### 4.5 Constancia y volumen

- Semanas ISO de lunes a domingo. `weeklyCounts(sessions, todayISO, 8)` → 8 números, la última es la semana en curso.
- Semana cumplida: 2 o más sesiones. `streak`: semanas cumplidas consecutivas contando desde la semana pasada (la actual suma si ya cumple).
- Atributo Constancia = `cumplidas / 8 × 100` sobre las 8 semanas, redondeado.
- Tonelaje de una sesión: Σ sobre series de principal y segundo con reps > 0 de `cargaTotal × reps`. `weeklyTonnage` para las últimas 8 semanas. `Volumen = promedio últimas 4 / mejor promedio de 4 semanas consecutivas en todo el historial × 100`, acotado a 100; `null` sin datos.

### 4.6 Atributos (0 a 100, enteros; `null` cuando no hay datos)

- Tirón: `ratio` de dominadas mapeado linealmente 0,80 → 0 y 2,20 → 100, acotado.
- Empuje: `ratio` de fondos mapeado 0,90 → 0 y 2,50 → 100.
- Base: reps estimadas a peso corporal `30·(ratio − 1)` por ejercicio, o las reps reales en modo PC si son mayores; dominadas sobre 20 y fondos sobre 30; promedio de ambos porcentajes, acotado.
- Constancia y Volumen: 4.5.
- Cuerpo: con `delta30` del peso `d` y objetivo: mantener → `100 − |d|·25`; bajar → `50 − d·25`; subir → `50 + d·25`; acotado 0..100. Si hay `targetWeightKg` y `startWeightKg`: `100 × (1 − |actual − objetivo| / |inicio − objetivo|)` acotado, y se usa ese en lugar del anterior. Si hay `targetBodyFatPct` y grasa actual, el atributo es el promedio con `100 × (1 − |grasa − objetivo| / max(1, |grasaInicial − objetivo|))`, donde grasa inicial es la primera medición desde `setAt`. Sin peso → `null`.

### 4.7 Experiencia, nivel y título

- Por sesión terminada: 100 + `min(150, 50 × PRs de esa sesión)`; los PRs se detectan en orden cronológico contra las sesiones anteriores.
- Por semana cumplida (2 o más sesiones): 200.
- Nivel: el mayor `n` tal que `xp >= xpForLevel(n)`, con `xpForLevel(1) = 0` y `xpForLevel(n) = round(400 × (n − 1)^1.4)`.
- Título: 1–4 Tiro, 5–9 Miles, 10–14 Decurión, 15–19 Centurión, 20–29 Tribuno, 30+ Espartano.
- `xpToNext`: puntos que faltan para `n + 1`.

## 5. Pantalla Progreso

Orden de arriba hacia abajo:

1. **Ficha**: tarjeta oscura con título y nivel grandes, barra de experiencia y "faltan N XP para nivel M".
2. **Radar** de seis atributos en SVG, con etiquetas; los atributos `null` se dibujan en 0 con la etiqueta atenuada.
3. **Recordatorio de medición** si la última tiene más de 28 días o no hay ninguna, con botón "Registrar medidas".
4. **Fuerza**: dos tarjetas, dominadas y fondos: escalón actual como chip, ratio con una decimal, "Te faltan X kg de lastre a M reps para Intermedio", tendencia con la pendiente en kg por sesión, estado en racha o estancado con la acción sugerida.
5. **Cuerpo**: peso promedio semanal y cambio en 30 días con flecha, grasa estimada y cambio, masa magra, objetivo actual. Botón "Registrar medidas". Sin altura o sexo, aviso que apunta a Ajustes.
6. **Constancia**: ocho celdas con el número de sesiones por semana, las cumplidas en terracota; racha en texto.
7. **Lo existente**: carga desde papel, gráfico con selectores, PRs, hitos.

Formulario de mediciones (`js/measure.js`): fecha, selector cinta o balanza, campos según la fuente, vista previa de la grasa estimada mientras escribís, guardar. Últimas cinco mediciones listadas con borrar, dentro de Ajustes en la sección Cuerpo.

Ajustes, sección **Cuerpo**: sexo, altura, objetivo con dirección, peso objetivo y grasa objetivo; al guardar una dirección nueva se fijan `setAt` y `startWeightKg` con el promedio semanal actual.

## 6. Módulos

```
js/body.js      navyBodyFat, bodyFatOf, leanMass, weeklyAvg, delta30, fatSeries, needsMeasurementPrompt
js/stats.js     TIERS, relativeStrength, tierFor, kgToNextTier, slope, trendLabel, stagnation,
                weeklyCounts, consistency, sessionTonnage, weeklyTonnage, volumeScore,
                attributes, xpTotal, levelFor, titleFor, characterSheet (arma todo)
js/measure.js   formulario de mediciones
js/charts.js    + radarChart(values, { size })
js/db.js        DB_VERSION 2, store measurements, export v2, migrate 1→2, listMeasurements, latestMeasurement
js/screens/progress.js   ficha + lo existente
js/screens/settings.js   sección Cuerpo
tests/body.test.mjs, tests/stats.test.mjs, tests/db.pure.test.mjs (migración)
tests/browser/body-flow.js, tests/browser/sheet-flow.js
```

`characterSheet({ sessions, bodyweightRows, measurements, profile, bandsById, todayISO })` es la única función que la pantalla llama para la ficha; devuelve `{ level, title, xp, xpToNext, attributes, strength: { pullups, dips }, body, consistency }`.

## 7. Errores y casos vacíos

- Cualquier cálculo con datos insuficientes devuelve `null` y la pantalla muestra "sin datos" con qué falta para tenerlo.
- Grasa con cinta requiere sexo y altura; sin ellos el formulario muestra el aviso y deja guardar los centímetros igual.
- Mediciones inválidas (cintura ≤ cuello, valores fuera de 20..200 cm, grasa fuera de 2..60) no se guardan.

## 8. Testing

- `node --test`: fórmula de la Marina con valores conocidos, acotaciones, promedios y deltas con ventanas vacías, escalones y kilos al siguiente, regresión, estancamiento con y sin mejora, semanas ISO y racha, tonelaje y volumen, atributos con y sin datos, XP y niveles en los límites, migración 1→2 y validación de backups v2.
- Browser: `body-flow.js` (perfil corporal, medición con cinta y balanza, recordatorio), `sheet-flow.js` (sesiones importadas y verificación de nivel, escalón, estancamiento y radar).

## 9. Decisiones

- Escalones iguales para hombres y mujeres en esta etapa.
- Una sola tabla de mediciones con campo `source`.
- La ficha usa el mejor 1RM de las últimas 8 semanas, no el histórico, para reflejar capacidad actual; los PRs históricos siguen abajo.
- Las sesiones cargadas desde papel cuentan para todo.
