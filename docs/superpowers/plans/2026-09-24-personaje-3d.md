# Personaje 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rotatable marble statue on top of Progreso whose proportions come from the character sheet attributes, with level unlocks and a small customizer.

**Architecture:** `js/avatar/params.js` is a pure mapping from sheet + profile to numbers (tested in Node). `js/avatar/scene.js` builds a procedural Three.js figure (dynamic import from jsdelivr) and exposes `createAvatar(canvas, params)`. `progress.js` mounts the card, wires visibility and the customizer, and persists `profile.avatar`.

**Tech Stack:** Three.js 0.170.0 ES module from cdn.jsdelivr.net, vanilla JS, IntersectionObserver, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-24-personaje-3d-design.md`

## Global Constraints

- Three.js only via dynamic `import()` in `scene.js`; nothing else in the app may import it. Pin `three@0.170.0`.
- Every number from `avatarParams` is finite and clamped; nulls become the spec's neutral values.
- Render only while visible; cap pixel ratio at 2; 30 fps.
- UI copy in rioplatense Spanish. Bump `sw.js` VERSION to `v1.4.0` before publishing.

## Review Focus

1. A sheet with every attribute null must still produce a neutral, valid figure (Task 1 test `all null → neutral`, Task 3 flow with an empty database).
2. Navigating away from Progreso must dispose the renderer (no WebGL context leak on repeated visits) → Task 3 flow visits Progreso 5 times and checks `debug().contexts <= 1`.
3. Offline first visit without the library cached must not break the rest of Progreso → Task 3 handles the import rejection and renders the message.
4. `profile.avatar` missing on old profiles → defaults applied (Task 1 test, `getProfile` merge in Task 3).
5. Touch drag must rotate without scrolling the page vertically; vertical swipes must still scroll (Task 2: `touch-action: pan-y` on the canvas, horizontal-only handling).

---

### Task 1: `js/avatar/params.js` (agent A)
Exports `avatarParams(sheet, profile)`, `UNLOCKS`, `DEFAULT_AVATAR`, `clamp01`. Tests in `tests/avatar.params.test.mjs` with the exact maps from spec section 4.

### Task 2: `js/avatar/scene.js` + `tests/browser/avatar.html` (agent B)
`createAvatar(canvas, params)` per spec section 5, `debug()` returning `{ contexts, chestScale, waistScale, upperArmScale, parts }`. Test page mounts with fixed params, asserts API and WebGL context, calls `update` with bigger values and asserts scales grew, screenshot.

### Task 3: Progreso card + customizer + persistence (main session)
Card per spec section 6; `profile.avatar` defaults in `db.js` `getProfile`; sheet-flow assertions; dispose on `destroy()`; offline message.

### Task 4: Publish
SW `v1.4.0`, SHELL additions, README, full suite + flows, merge, push, live check.
