# Personaje 3D — Diseño

Fecha: 2026-09-24
Estado: aprobado en conversación
Depende de: `2026-09-24-ficha-progreso-design.md` (v1.3.0 publicada)

## 1. Objetivo

Una estatua de mármol estilizada, rotable con el dedo, arriba de Progreso, cuyas proporciones salen de los atributos de la ficha y cuyos adornos se desbloquean por nivel. Personalizable en tono de mármol, pelo y barba para que cada usuario la sienta propia. No es un escaneo ni un clon: es una figura simple que se vuelve más grande por los números y más tuya por los detalles.

## 2. Alcance

Incluido: módulo puro de proporciones, escena Three.js procedural, tarjeta en Progreso con personalizador y lista de desbloqueos, persistencia en el perfil, cache offline de la librería, pausa del render fuera de pantalla, fallback sin WebGL.

Fuera: modelos descargados, animaciones de ejercicio, exportar imagen, compartir.

## 3. Datos

`profile.avatar` (nuevo, en `settings/profile`, exportado con el backup):

```js
avatar: { tint: 'blanco' | 'crema' | 'gris', hair: 'none' | 'short' | 'long' | 'bun', beard: 'none' | 'short' | 'full' }
// default: { tint: 'blanco', hair: 'short', beard: 'none' }
```

## 4. Proporciones: `js/avatar/params.js`

`avatarParams(sheet, profile)` → objeto plano de números 0..1 (salvo `scale` y `mass`) y flags. `sheet` es el resultado de `characterSheet` (puede tener nulls); `profile` aporta `heightCm` y `avatar`.

Mapa de atributos (`a` es el atributo 0..100; `null` → valor neutro 0.35):

- `lat = m(tiron)`; `biceps = 0.6·m(tiron) + 0.4·m(base)`; `triceps = m(empuje)`; `chest = m(empuje)`; `delt = 0.7·m(empuje) + 0.3·m(tiron)`; `forearm = m(base)`, con `m(a) = 0.15 + 0.85·a/100` y `m(null) = 0.35`.
- `waist`: desde `sheet.body.currentFat`: 8 % → 0, 35 % → 1, lineal acotado; `null` → 0.4.
- `belly`: 15 % → 0, 35 % → 1; `null` → 0.2.
- `scale`: desde `profile.heightCm`: 150 → 0.90, 200 → 1.10, lineal acotado; `null` → 1.
- `mass`: desde `sheet.body.currentWeight`: 55 → 0.90, 110 → 1.15; `null` → 1.
- `aura`: `constancia / 100`; `null` → 0.
- `unlocks`: `{ belt: level >= 5, laurel: level >= 10, pedestal: level >= 15, gold: level >= 20, cape: level >= 30 }`.
- `tint`, `hair`, `beard` copiados del perfil con defaults.

Regla: sin datos la figura es neutra. Nunca `NaN`; todo acotado.

`UNLOCKS` exportado: lista `[{ key, level, name }]` con nombres: Cinturón de lastre (5), Corona de laurel (10), Pedestal de mármol (15), Acabado dorado (20), Capa (30).

## 5. Escena: `js/avatar/scene.js`

- Carga Three.js con `import()` dinámico desde `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`. Solo se importa cuando la tarjeta se monta.
- `createAvatar(canvas, params)` → `Promise<{ update(params), setVisible(bool), dispose() } | null>`; `null` si no hay WebGL o falla la carga.
- Figura procedural con primitivas dentro de un `Group` raíz: cabeza (esfera), pelo en relieve (casquete un 6 % más grande; `long` agrega volumen hacia la nuca; `bun` agrega esfera arriba), barba (`short`: banda fina bajo el rostro; `full`: volumen mayor), cuello (cilindro), pecho (cápsula escalada en ancho por `lat` y profundidad por `chest`), abdomen (esfera escalada por `waist` y `belly`), pelvis, hombros (esferas escaladas por `delt`), brazos superiores (cápsulas escaladas por `biceps`/`triceps`), antebrazos (`forearm`), manos, muslos y pantorrillas (cápsulas, escala por `mass`), pies. Todo el grupo escalado por `scale`.
- Material `MeshStandardMaterial` mate: blanco `#EDE6DE`, crema `#E6D8C3`, gris `#B8B0A6`; roughness 0.75, metalness 0. Con `gold`: color `#C9A55A`, metalness 0.85, roughness 0.35.
- Adornos: `belt` toro en la cintura color terracota; `laurel` toro inclinado sobre la cabeza color `#8A9A5B`; `pedestal` cilindro bajo los pies del tono del mármol; `cape` plano curvo detrás de la espalda color terracota. `aura`: sprite radial detrás de la figura, opacidad = `aura × 0.6`, color dorado.
- Luces: hemisférica cálida más direccional; fondo transparente para que la tarjeta de la app se vea detrás.
- Interacción: arrastre horizontal rota el grupo en Y con inercia; sin interacción rota sola a 0,3 rad/s. Pinch o rueda no hacen zoom.
- Rendimiento: `pixelRatio = min(devicePixelRatio, 2)`, render solo mientras `setVisible(true)`, `requestAnimationFrame` limitado a 30 fps. `dispose()` libera geometrías, materiales y el renderer.

## 6. Tarjeta en Progreso

Primera tarjeta, antes de la ficha: título "Tu personaje", canvas a todo el ancho con altura 380, leyenda "Nivel N · Título", pista "Girá con el dedo". Botón "Personalizar" abre un panel dentro de la tarjeta con tres selectores: mármol (blanco, crema, gris), pelo (sin, corto, largo, rodete), barba (sin, corta, completa). Cada cambio guarda el perfil y actualiza la figura sin recargar. Lista de desbloqueos con los cinco adornos y su nivel, atenuados los que faltan. Si `createAvatar` devuelve `null`: texto "Tu navegador no puede mostrar la figura 3D" y el resto de la tarjeta igual.

Un `IntersectionObserver` sobre la tarjeta llama `setVisible`. Al salir de la pantalla se llama `dispose()`.

## 7. Offline y publicación

- `sw.js`: los recursos externos ya se cachean con red primero y cache de respaldo; jsdelivr sirve con CORS, así que el módulo queda cacheado tras la primera carga. `VERSION` a `v1.4.0` y los módulos nuevos en `SHELL`.
- Primera carga sin conexión antes de haber abierto Progreso con internet: la tarjeta muestra "La figura necesita conexión la primera vez" y no rompe nada más.

## 8. Testing

- `tests/avatar.params.test.mjs`: cada mapa con valores conocidos y nulls, acotaciones, desbloqueos por nivel en los bordes (4, 5, 30), defaults de personalización, ausencia de `NaN`.
- `tests/browser/avatar.html`: monta `createAvatar` con params fijos en Chrome headless, verifica que devuelva la API, que el canvas tenga contexto WebGL, que `update` con otros params cambie las escalas (se expone `debug()` con las escalas de pecho, cintura y brazo para la prueba), y captura pantalla para revisión visual.
- `tests/browser/sheet-flow.js`: la tarjeta existe, el canvas existe, el personalizador guarda `profile.avatar`, y los desbloqueos muestran el estado correcto para el nivel.

## 9. Decisiones

- Three.js es la primera dependencia externa; se acepta porque escribir WebGL a mano no es razonable y la librería se cachea offline.
- Figura procedural, sin modelos: cero descargas aparte de la librería, y las proporciones son controlables.
- Estatua de mármol, pelo y barba como relieve monocromo; sin colores de piel.
