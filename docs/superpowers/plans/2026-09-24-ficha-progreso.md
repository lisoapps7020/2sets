# Ficha de progreso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Progreso tab into a character sheet: level and XP, six attributes, relative strength tiers, trend and stagnation per exercise, body composition with a goal, and consistency, fed by sessions plus new body data.

**Architecture:** Two new pure modules (`js/body.js`, `js/stats.js`) hold every formula and are unit-tested with `node --test`. `db.js` moves to IndexedDB version 2 with a `measurements` store and export schema 2. A `measure.js` form and a Cuerpo section in Ajustes capture body data. `progress.js` calls one aggregator, `characterSheet()`, and renders the sheet above the existing chart.

**Tech Stack:** Vanilla ES modules, IndexedDB, SVG. No dependencies.

**Spec:** `docs/superpowers/specs/2026-09-24-ficha-progreso-design.md`

## Global Constraints

- No build step, no runtime dependencies. UI copy in rioplatense Spanish.
- Every formula lives in `js/body.js` or `js/stats.js` and returns `null` on insufficient data; never `NaN`.
- Units: kg and cm. Percentages as numbers 0..100.
- Tier tables: pullups `[1.00, 1.25, 1.50, 1.75, 2.00]`, dips `[1.10, 1.40, 1.70, 2.00, 2.30]`, names `Novato, Iniciado, Intermedio, Avanzado, Élite`, below first `Base`.
- XP: 100 per session + min(150, 50 × PRs) + 200 per fulfilled week; `xpForLevel(n) = round(400 × (n − 1)^1.4)`.
- Bump `VERSION` in `sw.js` before publishing; add new modules to `SHELL`.

## Review Focus

1. A measurement with waist ≤ neck, or missing height, must not produce a number → `navyBodyFat` returns null (Task 2 tests).
2. Backups from v1 (schemaVersion 1, no measurements) must import into DB v2 without error → migrate test (Task 1) and browser `db.html` check.
3. Users with sessions but no bodyweight ever: attributes Tirón/Empuje/Cuerpo are null, the sheet still renders with "sin datos" (Task 3 tests `attributes without bodyweight`, Task 6 flow).
4. Stagnation must not fire for a user with fewer than 4 sessions, nor when the last session set a PR (Task 3 tests).
5. Week boundaries: a session on Sunday belongs to the week that started the previous Monday; a session on Monday starts a new week (Task 3 `weeklyCounts` tests).

---

### Task 1: DB v2, measurements store, export schema 2, profile defaults

**Files:** Modify `js/db.js`, `tests/db.pure.test.mjs`, `tests/browser/db.html`

**Interfaces:** Produces `STORES` (now with `measurements`), `DB_VERSION = 2`, `DEFAULT_PROFILE.sex = 'm'`, `DEFAULT_PROFILE.heightCm = null`, `DEFAULT_PROFILE.goal = { direction: 'mantener', targetWeightKg: null, targetBodyFatPct: null, setAt: null, startWeightKg: null }`, `listMeasurements()` (sorted by date desc), `latestMeasurement()`, `validateExport` accepting schemaVersion 1 or 2, `migrate` filling `measurements: []` and setting `schemaVersion: 2`, `exportAll` with `schemaVersion: 2`.

- [ ] Tests (RED):

```js
test('STORES includes measurements and export is v2', () => {
  assert.ok(STORES.includes('measurements'));
  assert.equal(DB_VERSION, 2);
});
test('validateExport accepts v1 and v2, rejects v3', () => {
  assert.equal(validateExport({ app: '2sets', schemaVersion: 1 }).ok, true);
  assert.equal(validateExport({ app: '2sets', schemaVersion: 2, measurements: [] }).ok, true);
  assert.equal(validateExport({ app: '2sets', schemaVersion: 3 }).ok, false);
});
test('migrate v1 → v2 adds measurements', () => {
  const d = migrate({ app: '2sets', schemaVersion: 1, sessions: [] });
  assert.deepEqual(d.measurements, []); assert.equal(d.schemaVersion, 2);
});
test('DEFAULT_PROFILE body fields', () => {
  assert.equal(DEFAULT_PROFILE.sex, 'm'); assert.equal(DEFAULT_PROFILE.heightCm, null);
  assert.deepEqual(DEFAULT_PROFILE.goal, { direction: 'mantener', targetWeightKg: null, targetBodyFatPct: null, setAt: null, startWeightKg: null });
});
```

- [ ] Implement: `DB_VERSION = 2`; in `onupgradeneeded` create `measurements` with index `date`; `getProfile` merges `goal` deep like `incrementKg`; `exportAll` → `schemaVersion: 2`; `validateExport` max 2; `migrate` → 2. `db.html`: import a v1 backup (no measurements) then `listMeasurements()` returns `[]` and `res.v1ImportOk = true`.
- [ ] Run `npm test` + `db.html` headless → PASS. Commit `feat(db): version 2 with measurements store and export schema 2`.

### Task 2: `js/body.js`

**Files:** Create `js/body.js`, `tests/body.test.mjs`

**Interfaces:** `navyBodyFat({ sex, heightCm, waistCm, neckCm, hipCm })` → number|null (1 decimal, clamped 2..60); `bodyFatOf(row, profile)`; `leanMass(weightKg, bfPct)`; `weeklyAvg(rows, endISO)`; `delta30(rows, todayISO)` → `{ now, before, delta }|null`; `fatSeries(measurements, profile)` → `[{ date, value }]` (nulls dropped, ascending); `deltaFat30(measurements, profile, todayISO)`; `needsMeasurementPrompt(latest, todayISO)` (none or > 28 days); `addDays(iso, n)`.

- [ ] Tests (RED), known values: male 178 cm, waist 85, neck 38 → 17.6 (±0.2); female 165 cm, waist 75, neck 33, hip 95 → 24.7 (±0.3); waist ≤ neck → null; no height → null; female without hip → null; clamp: extreme inputs stay within 2..60. `bodyFatOf` prefers manual pct. `leanMass(80, 20) = 64`. `weeklyAvg` averages entries within 7 days inclusive, null when empty. `delta30` uses the nearest earlier entry when the old window is empty and returns null with a single entry. `needsMeasurementPrompt(null) = true`, 28 days → false, 29 → true. `addDays('2026-03-01', -1) = '2026-02-28'`.
- [ ] Implement per spec 4.1–4.2. Run → PASS. Commit `feat(body): body fat, lean mass, weight and fat trends`.

### Task 3: `js/stats.js`

**Files:** Create `js/stats.js`, `tests/stats.test.mjs`

**Interfaces:** `TIERS`, `TIER_NAMES`, `bestRecentE1RM(sessions, exerciseId, opts, todayISO, weeks = 8)` → `{ e1rm, bw, date }|null`; `relativeStrength(...)` → `{ ratio, e1rm, bw }|null`; `tierFor(ratio, exerciseId)` → `{ name, index, nextName, nextRatio }`; `kgToNextTier(ratio, bw, exerciseId)` → number|null (added kg at target reps, 0.5 steps); `slope(values)` → number|null (needs ≥ 3); `trendLabel(slope)`; `stagnation(sessions, exerciseId, opts)` → `{ count, stagnant, suggestion }`; `weekStart(iso)`; `weeklyCounts(sessions, todayISO, n)`; `consistency(sessions, todayISO)` → `{ counts, fulfilled, streak, score }`; `sessionTonnage(session, opts)`; `weeklyTonnage(sessions, todayISO, n, opts)`; `volumeScore(sessions, todayISO, opts)`; `attributes(input)` → `{ tiron, empuje, base, constancia, volumen, cuerpo }`; `xpTotal(sessions, opts)` → `{ xp, breakdown }`; `xpForLevel(n)`; `levelFor(xp)` → `{ level, xpToNext, nextLevelXp }`; `titleFor(level)`; `characterSheet({ sessions, bodyweightRows, measurements, profile, bandsById, todayISO })`.

- [ ] Tests (RED), including: `tierFor(1.6,'pullups')` → Intermedio next Avanzado 1.75; `tierFor(0.9,'pullups')` → Base; `tierFor(2.4,'dips')` → Élite next null; `kgToNextTier(1.6, 80, 'pullups')` = total 140/(1+8/30)=110.5 → 30.5 added; `slope([100,102,104])` = 2; `slope([5])` null; `trendLabel(0.5)` estable; stagnation: 5 sessions flat → count 4 stagnant true; last session PR → count 0; 3 sessions → stagnant false; suggestion picks sleep when notes mention 'dormí mal'; `weekStart('2026-09-27')` (Sunday) = '2026-09-21', `weekStart('2026-09-28')` = '2026-09-28'; `weeklyCounts` with sessions on Sun 27 and Mon 28 → different weeks; consistency fulfilled/streak/score; tonnage `80 kg bw, set1 +20×10, set2 +15×15 → 100×10 + 95×15 = 2425` (second exercise sets added); `volumeScore` 100 when current 4 weeks are the best; `attributes` maps ratio 1.5 pull → 50, null bw → null; `xpForLevel(1)=0`, `xpForLevel(2)=400`, `levelFor(399)` = 1 with xpToNext 1, `levelFor(400)` = 2; `titleFor(1)` Tiro, `titleFor(30)` Espartano; `xpTotal` for 2 sessions same fulfilled week with 1 PR in the second = 100 + 150 + 200 = 450 (first session's PRs also count: first session all-PR → +150 → 600 total; assert exact per implementation with detectNewPRs); `characterSheet` returns nulls gracefully with empty input.
- [ ] Implement per spec 4.3–4.7. Run → PASS. Commit `feat(stats): strength tiers, trends, stagnation, consistency, volume, attributes, xp`.

### Task 4: Ajustes → sección Cuerpo, and `measure.js` form

**Files:** Create `js/measure.js`; modify `js/screens/settings.js`, `tests/browser/settings-flow.js` (or new `tests/browser/body-flow.js`)

**Interfaces:** `measureForm({ profile, onSaved, onCancel })` → element; validation from spec 7; saves `{ id: uid('mea'), date, source, waistCm, neckCm, hipCm, bodyFatPct }`. Settings section "Cuerpo": sexo (seg), altura (number), objetivo (seg bajar/mantener/subir + target weight + target fat); on direction change store `setAt = today` and `startWeightKg = weeklyAvg(bodyweight, today) ?? latest kg`; list of last 5 measurements with delete and a "Registrar medidas" button.

- [ ] Browser flow `body-flow.js`: set sex m, height 178 → profile saved; open measure form, cinta: waist 85, neck 38 → preview shows `17,6 %`; save → `listMeasurements()` length 1 with computed `bodyFatOf` 17.6; balanza: pct 18 → saved with `bodyFatPct: 18`; invalid (waist 30, neck 38) → toast error, not saved; goal bajar with target 76 → profile goal setAt today, startWeightKg equals latest bodyweight.
- [ ] Implement, run flow → PASS. Commit `feat(settings): body profile, goal and measurements`.

### Task 5: `radarChart` in `charts.js`

**Files:** Modify `js/charts.js`, `tests/charts.test.mjs`

- [ ] Test (RED): `radarChart([{label:'Tirón', value:50}, …6 items])` returns svg with one `<polygon>` for the data, 6 axis lines, 6 labels; null values render as 0 with class `muted`; size respected.
- [ ] Implement: hexagon grid at 25/50/75/100, axes, polygon fill `var(--primary)` at 0.35 opacity, labels outside. Commit `feat(charts): radar chart`.

### Task 6: Progreso screen with the sheet

**Files:** Modify `js/screens/progress.js`, `css/app.css`; create `tests/browser/sheet-flow.js`

- [ ] Implement layout from spec 5 using `characterSheet()`; measurement reminder via `needsMeasurementPrompt`; "Registrar medidas" opens `measureForm` inline; keep backfill, chart, PRs, milestones below.
- [ ] Flow `sheet-flow.js`: import 10 sessions over 6 weeks (pull/push alternating, growing loads, bodyweight 80, one stagnating stretch for dips) → check: level ≥ 2 and title text, radar polygon present, pullups tier chip text, "Te faltan … kg" text present, dips card shows "Estancado" with a suggestion, consistency grid has 8 cells, body card shows "sin datos" for fat until a measurement exists, then shows a percentage after adding one via the form.
- [ ] Screenshot at 390 px and review. Commit `feat(progress): character sheet with level, radar, strength, body and consistency`.

### Task 7: Publish

- [ ] `sw.js`: `VERSION = 'v1.3.0'`, add `./js/body.js`, `./js/stats.js`, `./js/measure.js` to `SHELL`. README: new features. Run `npm test` and all browser flows. Commit `feat: publish 1.3.0`, push, verify live `sw.js` version and Progreso renders the sheet.
