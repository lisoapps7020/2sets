// Escena 3D de la estatua: modelo GLB generado con MakeHuman (tools/build_statue.py) + Three.js.
// Carga Three.js y sus cargadores recién acá (import map en index.html). Nunca lanza: devuelve null si no puede.
//
// createAvatar(canvas, params) → { update(params), setVisible(bool), dispose(), debug() } | null
// params: ver js/avatar/params.js (lat, biceps, triceps, chest, delt, forearm, waist, belly, scale, mass, aura,
//         unlocks {belt, laurel, pedestal, gold, cape}, tint, hair, beard)

export const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
export const MODEL_URL = new URL('../../assets/avatar/estatua.glb', import.meta.url).href;

let libsPromise = null;
let liveRenderers = 0;

function loadLibs() {
  if (!libsPromise) {
    libsPromise = Promise.all([
      import('three'),
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/environments/RoomEnvironment.js'),
    ]).then(([THREE, gltf, env]) => ({ THREE, GLTFLoader: gltf.GLTFLoader, RoomEnvironment: env.RoomEnvironment }))
      .catch((e) => { libsPromise = null; throw e; });
  }
  return libsPromise;
}

// Descarga (o toma de cache) la librería sin crear nada. Rechaza si no hay conexión y no está cacheada.
export function preloadThree() {
  return loadLibs();
}

const NEUTRAL = { lat: 0.35, biceps: 0.35, triceps: 0.35, chest: 0.35, delt: 0.35, forearm: 0.35, waist: 0.4, belly: 0.2, scale: 1, mass: 1, aura: 0 };
const TINTS = { blanco: 0xE9E2D9, crema: 0xE4D5BF, gris: 0xB3ABA1 };
const HAIRS = ['none', 'short', 'long', 'bun'];
const BEARDS = ['none', 'short', 'full'];

export function normalizeParams(p) {
  const src = p && typeof p === 'object' ? p : {};
  const num = (k, def, lo = 0, hi = 1) => { const v = Number(src[k]); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
  const out = {};
  for (const [k, def] of Object.entries(NEUTRAL)) out[k] = k === 'scale' ? num(k, def, 0.7, 1.3) : k === 'mass' ? num(k, def, 0.8, 1.3) : num(k, def);
  const u = src.unlocks && typeof src.unlocks === 'object' ? src.unlocks : {};
  out.unlocks = { belt: !!u.belt, laurel: !!u.laurel, pedestal: !!u.pedestal, gold: !!u.gold, cape: !!u.cape };
  out.tint = TINTS[src.tint] ? src.tint : 'blanco';
  out.hair = HAIRS.includes(src.hair) ? src.hair : 'short';
  out.beard = BEARDS.includes(src.beard) ? src.beard : 'none';
  return out;
}

// De un parámetro 0..1 con valor neutro `n` a una influencia 0..1 de la forma de mezcla.
const above = (v, n) => Math.min(1, Math.max(0, (v - n) / (1 - n)));
const below = (v, n) => Math.min(1, Math.max(0, (n - v) / n));

export function morphInfluences(p) {
  const arm = (p.biceps + p.triceps) / 2;
  const muscle = (p.lat + p.chest + p.delt) / 3;
  return {
    chest: above(p.chest, NEUTRAL.chest),
    lat: above(p.lat, NEUTRAL.lat),
    delt: above(p.delt, NEUTRAL.delt),
    arm: above(arm, NEUTRAL.biceps),
    forearm: above(p.forearm, NEUTRAL.forearm),
    legs: Math.min(1, Math.max(0, (p.mass - 0.9) / 0.25)) * 0.8 + above(muscle, 0.35) * 0.2,
    waist: above(p.waist, NEUTRAL.waist),
    waist_thin: below(p.waist, NEUTRAL.waist) * 0.8,
    belly: above(p.belly, NEUTRAL.belly),
    abs: below(p.belly, 0.35) * above(muscle, 0.3),
  };
}

function marbleTexture(THREE) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(120,110,100,${0.05 + rnd() * 0.08})`;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    let x = rnd() * 512, y = rnd() * 512;
    g.moveTo(x, y);
    for (let k = 0; k < 12; k++) { x += (rnd() - 0.5) * 90; y += (rnd() - 0.5) * 90; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function auraTexture(THREE) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, 'rgba(196,169,140,0.9)');
  grad.addColorStop(0.5, 'rgba(196,169,140,0.35)');
  grad.addColorStop(1, 'rgba(196,169,140,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function createAvatar(canvas, rawParams) {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  let libs;
  try { libs = await loadLibs(); } catch { return null; }
  const { THREE, GLTFLoader, RoomEnvironment } = libs;
  let params = normalizeParams(rawParams);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch { return null; }
  liveRenderers += 1;
  const disposables = [];
  const track = (x) => { if (x) disposables.push(x); return x; };
  const W = () => canvas.clientWidth || 320;
  const H = () => canvas.clientHeight || 380;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W(), H(), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = track(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
  pmrem.dispose();
  scene.environment = envTex;
  const camera = new THREE.PerspectiveCamera(32, W() / H(), 0.05, 50);
  const key = new THREE.DirectionalLight(0xfff2e0, 2.6);
  key.position.set(2.5, 5, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  key.shadow.radius = 4;
  const rim = new THREE.DirectionalLight(0xc4a98c, 1.4);
  rim.position.set(-3, 3, -4);
  scene.add(key, rim, new THREE.HemisphereLight(0xf5efe6, 0x3a2f25, 0.35));

  const veins = track(marbleTexture(THREE));
  const marble = track(new THREE.MeshPhysicalMaterial({ color: TINTS.blanco, map: veins, roughness: 0.5, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.6, sheen: 0.25, sheenColor: 0xfff8f0, envMapIntensity: 0.55 }));
  const stone = track(new THREE.MeshStandardMaterial({ color: 0xD3C7BB, roughness: 0.85 }));
  const terracotta = track(new THREE.MeshStandardMaterial({ color: 0x895B3E, roughness: 0.7, side: THREE.DoubleSide }));
  const leaf = track(new THREE.MeshStandardMaterial({ color: 0x8A9A5B, roughness: 0.6 }));

  // Modelo
  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  } catch {
    liveRenderers -= 1;
    try { renderer.dispose(); } catch {}
    return null;
  }
  const root = new THREE.Group();
  const model = gltf.scene;
  const parts = {};
  model.traverse((o) => {
    if (!o.isMesh) return;
    parts[o.name] = o;
    o.material = marble;
    o.castShadow = true;
    o.receiveShadow = true;
    track(o.geometry);
  });
  const body = parts.body;
  const dict = body?.morphTargetDictionary || {};
  const setMorph = (name, v) => { const i = dict[name]; if (i !== undefined) body.morphTargetInfluences[i] = v; };
  const box0 = new THREE.Box3().setFromObject(model);
  const size0 = box0.getSize(new THREE.Vector3());
  const center0 = box0.getCenter(new THREE.Vector3());
  model.position.sub(center0);
  root.add(model);
  const half = size0.y / 2;

  // Adornos
  const belt = new THREE.Mesh(track(new THREE.TorusGeometry(0.19, 0.022, 10, 40)), terracotta);
  belt.rotation.x = Math.PI / 2;
  belt.position.set(0, half - 0.99, 0.01);
  belt.scale.set(1, 1, 0.75);
  const laurel = new THREE.Group();
  const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.105, 0.012, 8, 40)), leaf);
  ring.rotation.x = Math.PI / 2 + 0.35;
  laurel.add(ring);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const lf = new THREE.Mesh(track(new THREE.SphereGeometry(0.02, 8, 6)), leaf);
    lf.scale.set(1, 0.5, 2);
    lf.position.set(Math.cos(a) * 0.105, Math.sin(a) * 0.105 * Math.sin(0.35), Math.sin(a) * 0.105 * Math.cos(0.35));
    ring.add(lf);
  }
  laurel.position.set(0, half - 0.09, 0.01);
  const pedestal = new THREE.Mesh(track(new THREE.CylinderGeometry(0.55, 0.62, 0.12, 48)), stone);
  pedestal.position.y = -half - 0.06;
  pedestal.receiveShadow = true;
  const cape = new THREE.Mesh(track(new THREE.CylinderGeometry(0.34, 0.42, 1.25, 24, 1, true, Math.PI * 0.62, Math.PI * 0.76)), terracotta);
  cape.position.set(0, half - 0.95, 0.02);
  cape.castShadow = true;
  root.add(belt, laurel, pedestal, cape);
  const auraTex = track(auraTexture(THREE));
  const auraMat = track(new THREE.SpriteMaterial({ map: auraTex, transparent: true, opacity: 0, depthWrite: false }));
  const aura = new THREE.Sprite(auraMat);
  aura.position.set(0, 0.1, -0.9);
  aura.scale.set(2.6, 2.6, 1);
  scene.add(aura, root);

  // Cámara: figura completa con pedestal
  const fit = () => {
    const h = size0.y * params.scale + 0.2;
    const dist = (h * 1.12) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    camera.aspect = W() / H();
    camera.position.set(0, 0.02, dist);
    camera.lookAt(0, -0.06, 0);
    camera.updateProjectionMatrix();
  };

  const apply = (p) => {
    params = normalizeParams(p);
    const inf = morphInfluences(params);
    for (const [k, v] of Object.entries(inf)) setMorph(k, v);
    root.scale.setScalar(params.scale);
    for (const name of ['hair_short', 'hair_long', 'hair_bun']) if (parts[name]) parts[name].visible = name === `hair_${params.hair}`;
    for (const name of ['beard_short', 'beard_full']) if (parts[name]) parts[name].visible = name === `beard_${params.beard}`;
    if (parts.drape) parts.drape.visible = true;
    belt.visible = params.unlocks.belt;
    laurel.visible = params.unlocks.laurel;
    pedestal.visible = params.unlocks.pedestal;
    cape.visible = params.unlocks.cape;
    if (params.unlocks.gold) {
      marble.color.setHex(0xC9A55A); marble.metalness = 0.85; marble.roughness = 0.35; marble.map = null;
    } else {
      marble.color.setHex(TINTS[params.tint]); marble.metalness = 0; marble.roughness = 0.5; marble.map = veins;
    }
    marble.needsUpdate = true;
    auraMat.opacity = params.aura * 0.6;
    fit();
  };
  apply(params);

  // Interacción: arrastre horizontal rota; inercia; giro lento en reposo
  let visible = false, disposed = false, raf = 0, last = 0, dragging = false, lastX = 0, vel = 0, pointerId = null;
  root.rotation.y = 0.35;
  const onDown = (e) => { dragging = true; lastX = e.clientX; vel = 0; pointerId = e.pointerId; try { canvas.setPointerCapture(e.pointerId); } catch {} };
  const onMove = (e) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; vel = dx * 0.01; root.rotation.y += vel; if (Math.abs(dx) > 2) e.preventDefault?.(); };
  const onUp = () => { dragging = false; try { if (pointerId !== null) canvas.releasePointerCapture(pointerId); } catch {} pointerId = null; };
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { renderer.setSize(W(), H(), false); fit(); if (!visible) renderer.render(scene, camera); }) : null;
  ro?.observe(canvas);

  const frame = (t) => {
    if (!visible || disposed) return;
    raf = requestAnimationFrame(frame);
    if (t - last < 1000 / 30) return;
    const dt = Math.min(0.1, (t - last) / 1000 || 0.033);
    last = t;
    if (!dragging) {
      if (Math.abs(vel) > 0.001) { root.rotation.y += vel; vel *= 0.92; } else root.rotation.y += 0.3 * dt;
    }
    renderer.render(scene, camera);
  };
  renderer.render(scene, camera);

  return {
    update(p) { if (disposed) return; apply(p); if (!visible) renderer.render(scene, camera); },
    setVisible(v) {
      if (disposed) return;
      const next = !!v;
      if (next === visible) return;
      visible = next;
      if (visible) { last = 0; raf = requestAnimationFrame(frame); } else cancelAnimationFrame(raf);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      visible = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      ro?.disconnect();
      canvas.style.touchAction = '';
      for (const d of disposables) { try { d.dispose?.(); } catch {} }
      try { renderer.dispose(); renderer.forceContextLoss?.(); } catch {}
      liveRenderers -= 1;
    },
    debug() {
      const inf = morphInfluences(params);
      return {
        contexts: liveRenderers,
        chestScale: 1 + inf.chest,
        waistScale: 1 + inf.waist - inf.waist_thin * 0.5,
        upperArmScale: 1 + inf.arm,
        parts: Object.keys(parts).length,
        rotationY: root.rotation.y,
        gold: params.unlocks.gold,
        visible, disposed,
        hair: params.hair, beard: params.beard, aura: params.aura,
        morphs: Object.keys(dict),
        model: MODEL_URL,
      };
    },
  };
}
