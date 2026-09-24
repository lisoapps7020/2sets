// Escena 3D del personaje: estatua procedural con Three.js (cargado bajo demanda desde jsdelivr).
// createAvatar(canvas, params) → Promise<{ update, setVisible, dispose, debug } | null>.
// Devuelve null si no hay WebGL o si la librería no se pudo cargar; nunca lanza.

export const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const TINTS = { blanco: 0xEDE6DE, crema: 0xE6D8C3, gris: 0xB8B0A6 };
const GOLD = 0xC9A55A;
const TERRACOTTA = 0x895B3E;
const LAUREL = 0x8A9A5B;
const AURA = '#C4A98C';
const HAIR_KINDS = ['none', 'short', 'long', 'bun'];
const BEARD_KINDS = ['none', 'short', 'full'];

const FPS_INTERVAL = 1000 / 30;
const AUTO_SPEED = 0.3; // rad/s
const DRAG_GAIN = 0.01; // rad por px
const INERTIA = 0.92;
const HEAD_R = 0.13;

let threePromise = null;
let liveRenderers = 0;

function loadThree() {
  if (!threePromise) {
    threePromise = import(THREE_URL).catch((e) => { threePromise = null; throw e; });
  }
  return threePromise;
}

const num = (v, def) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
const unit = (v, def) => Math.min(1, Math.max(0, num(v, def)));

export function normalizeParams(p) {
  const src = p && typeof p === 'object' ? p : {};
  const u = src.unlocks && typeof src.unlocks === 'object' ? src.unlocks : {};
  return {
    lat: unit(src.lat, 0.35),
    biceps: unit(src.biceps, 0.35),
    triceps: unit(src.triceps, 0.35),
    chest: unit(src.chest, 0.35),
    delt: unit(src.delt, 0.35),
    forearm: unit(src.forearm, 0.35),
    waist: unit(src.waist, 0.4),
    belly: unit(src.belly, 0.2),
    scale: Math.min(1.3, Math.max(0.7, num(src.scale, 1))),
    mass: Math.min(1.3, Math.max(0.8, num(src.mass, 1))),
    aura: unit(src.aura, 0),
    unlocks: { belt: !!u.belt, laurel: !!u.laurel, pedestal: !!u.pedestal, gold: !!u.gold, cape: !!u.cape },
    tint: Object.prototype.hasOwnProperty.call(TINTS, src.tint) ? src.tint : 'blanco',
    hair: HAIR_KINDS.includes(src.hair) ? src.hair : 'short',
    beard: BEARD_KINDS.includes(src.beard) ? src.beard : 'none',
  };
}

function auraTexture(THREE) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, AURA);
  g.addColorStop(0.35, 'rgba(196,169,140,0.55)');
  g.addColorStop(1, 'rgba(196,169,140,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function createAvatar(canvas, params) {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  let THREE;
  try { THREE = await loadThree(); } catch { return null; }

  const attrs = { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false };
  let gl = null;
  try { gl = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs); } catch { gl = null; }
  if (!gl) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true });
  } catch { return null; }
  liveRenderers += 1;

  const width = () => canvas.clientWidth || 320;
  const height = () => canvas.clientHeight || 380;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.setSize(width(), height(), false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, width() / height(), 0.1, 50);
  camera.position.set(0, 1.35, 4.3);
  camera.lookAt(0, 0.95, 0);

  scene.add(new THREE.HemisphereLight(0xf5efe6, 0x3a2f25, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-2.2, 4, 3);
  scene.add(sun);

  // --- materiales (uno solo para el cuerpo, así `update` lo cambia en el lugar) ---
  const bodyMat = new THREE.MeshStandardMaterial({ color: TINTS.blanco, roughness: 0.75, metalness: 0 });
  const pedestalMat = new THREE.MeshStandardMaterial({ color: TINTS.blanco, roughness: 0.8, metalness: 0 });
  const beltMat = new THREE.MeshStandardMaterial({ color: TERRACOTTA, roughness: 0.7, metalness: 0 });
  const laurelMat = new THREE.MeshStandardMaterial({ color: LAUREL, roughness: 0.7, metalness: 0 });
  const capeMat = new THREE.MeshStandardMaterial({ color: TERRACOTTA, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const materials = [bodyMat, pedestalMat, beltMat, laurelMat, capeMat];
  const geometries = new Set();
  const geo = (g) => { geometries.add(g); return g; };
  const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo(g), m); o.position.set(x, y, z); return o; };

  // --- figura (de pie, mirando a +Z, pies en y=0, ~2.0 de alto antes de `scale`) ---
  const root = new THREE.Group();
  scene.add(root);

  const pedestal = mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.14, 48), pedestalMat, 0, -0.07, 0);
  root.add(pedestal);

  const footGeo = new THREE.BoxGeometry(0.15, 0.09, 0.28);
  const feet = [-1, 1].map((s) => mesh(footGeo, bodyMat, s * 0.14, 0.045, 0.06));
  const calfGeo = new THREE.CapsuleGeometry(0.07, 0.3, 4, 16);
  const calves = [-1, 1].map((s) => mesh(calfGeo, bodyMat, s * 0.14, 0.31, 0));
  const thighGeo = new THREE.CapsuleGeometry(0.09, 0.34, 4, 16);
  const thighs = [-1, 1].map((s) => mesh(thighGeo, bodyMat, s * 0.13, 0.76, 0));
  const pelvis = mesh(new THREE.SphereGeometry(0.19, 32, 20), bodyMat, 0, 1.02, 0);
  const abdomen = mesh(new THREE.SphereGeometry(0.17, 32, 20), bodyMat, 0, 1.2, 0);
  const chestGeo = new THREE.CapsuleGeometry(0.15, 0.16, 6, 24);
  chestGeo.rotateZ(Math.PI / 2); // horizontal: el eje largo queda en X (ancho); así scale.x sigue siendo "ancho"
  chestGeo.scale(1, 1.1, 1);
  const chest = mesh(chestGeo, bodyMat, 0, 1.42, 0);
  const shoulderGeo = new THREE.SphereGeometry(0.1, 24, 16);
  const shoulders = [-1, 1].map((s) => mesh(shoulderGeo, bodyMat, s * 0.29, 1.53, 0));
  const neck = mesh(new THREE.CylinderGeometry(0.06, 0.068, 0.14, 20), bodyMat, 0, 1.64, 0);

  // brazos: cápsulas verticales inclinadas hacia afuera; el largo no cambia, sólo el radio (scale x/z)
  const UPPER_LEN = 0.26 + 2 * 0.062, FORE_LEN = 0.24 + 2 * 0.052;
  const UPPER_TILT = 0.2, FORE_TILT = 0.12;
  const upperGeo = new THREE.CapsuleGeometry(0.062, 0.26, 4, 16);
  const foreGeo = new THREE.CapsuleGeometry(0.052, 0.24, 4, 16);
  const handGeo = new THREE.SphereGeometry(0.055, 16, 12);
  const upperArms = [], forearms = [], hands = [];
  for (const s of [-1, 1]) {
    const jx = s * 0.29, jy = 1.53;
    const ux = jx + s * (UPPER_LEN / 2) * Math.sin(UPPER_TILT), uy = jy - (UPPER_LEN / 2) * Math.cos(UPPER_TILT);
    const up = mesh(upperGeo, bodyMat, ux, uy, 0);
    up.rotation.z = s * UPPER_TILT;
    const ex = jx + s * UPPER_LEN * Math.sin(UPPER_TILT), ey = jy - UPPER_LEN * Math.cos(UPPER_TILT);
    const fx = ex + s * (FORE_LEN / 2) * Math.sin(FORE_TILT), fy = ey - (FORE_LEN / 2) * Math.cos(FORE_TILT);
    const fore = mesh(foreGeo, bodyMat, fx, fy, 0);
    fore.rotation.z = s * FORE_TILT;
    const wx = ex + s * FORE_LEN * Math.sin(FORE_TILT), wy = ey - FORE_LEN * Math.cos(FORE_TILT);
    const hand = mesh(handGeo, bodyMat, wx + s * 0.005, wy - 0.02, 0.01);
    hand.scale.set(0.85, 1.2, 0.6);
    upperArms.push(up); forearms.push(fore); hands.push(hand);
  }

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.82, 0);
  const head = mesh(new THREE.SphereGeometry(HEAD_R, 32, 24), bodyMat, 0, 0, 0);
  const nose = mesh(new THREE.SphereGeometry(0.022, 12, 10), bodyMat, 0, -0.01, HEAD_R - 0.006);
  nose.scale.set(1, 1.3, 1.2);
  headGroup.add(head, nose);

  // adornos (las rotaciones van horneadas en la geometría para que scale x/y/z sigan los ejes del mundo)
  const beltGeo = new THREE.TorusGeometry(0.17, 0.04, 12, 40);
  beltGeo.rotateX(Math.PI / 2);
  const belt = mesh(beltGeo, beltMat, 0, 1.1, 0);

  const laurel = new THREE.Group();
  laurel.position.set(0, 1.885, -0.005);
  laurel.rotation.x = -0.25; // frente un poco más alto, apoyada en la frente
  const ringGeo = new THREE.TorusGeometry(0.125, 0.018, 10, 40);
  ringGeo.rotateX(Math.PI / 2);
  laurel.add(mesh(ringGeo, laurelMat));
  const leafGeo = new THREE.SphereGeometry(0.03, 10, 8);
  for (let i = 0; i < 14; i++) {
    const t = (i / 14) * Math.PI * 2;
    const leaf = mesh(leafGeo, laurelMat, 0.125 * Math.cos(t), (i % 2 ? 0.008 : -0.006), 0.125 * Math.sin(t));
    leaf.scale.set(0.55, 0.35, 1.1);
    leaf.rotation.y = -t;
    leaf.rotation.z = (i % 2 ? 0.35 : -0.35);
    laurel.add(leaf);
  }

  const capeGeo = new THREE.CylinderGeometry(0.3, 0.44, 1.15, 28, 1, true, Math.PI * 0.6, Math.PI * 0.8);
  const cape = mesh(capeGeo, capeMat, 0, 1.02, -0.06);

  root.add(...feet, ...calves, ...thighs, pelvis, abdomen, chest, ...shoulders, ...upperArms, ...forearms, ...hands, neck, headGroup, belt, laurel, cape);

  // pelo y barba: relieve monocromo; se reconstruyen sólo cuando cambia el tipo
  let hairMeshes = [], beardMeshes = [], hairKind = null, beardKind = null;
  const dropMeshes = (list) => {
    for (const m of list) { headGroup.remove(m); geometries.delete(m.geometry); m.geometry.dispose(); }
  };
  const buildHair = (kind) => {
    const out = [];
    if (kind === 'none') return out;
    const cap = mesh(new THREE.SphereGeometry(HEAD_R * 1.06, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), bodyMat);
    cap.rotation.x = -0.4; // línea del pelo alta adelante, nuca cubierta atrás
    out.push(cap);
    if (kind === 'long') {
      const back = mesh(new THREE.CapsuleGeometry(0.085, 0.16, 4, 16), bodyMat, 0, -0.12, -0.075);
      back.scale.set(1.35, 1, 0.7);
      out.push(back);
    } else if (kind === 'bun') {
      out.push(mesh(new THREE.SphereGeometry(0.06, 16, 12), bodyMat, 0, HEAD_R * 1.02, -0.03));
    }
    return out;
  };
  const buildBeard = (kind) => {
    if (kind === 'short') {
      // banda fina sobre la mandíbula (mitad frontal de la esfera, franja baja)
      return [mesh(new THREE.SphereGeometry(HEAD_R * 1.035, 32, 12, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.6, Math.PI * 0.28), bodyMat)];
    }
    if (kind === 'full') {
      const band = mesh(new THREE.SphereGeometry(HEAD_R * 1.06, 32, 14, Math.PI * 0.05, Math.PI * 0.9, Math.PI * 0.58, Math.PI * 0.42), bodyMat);
      const chin = mesh(new THREE.SphereGeometry(0.075, 20, 14), bodyMat, 0, -0.1, 0.045);
      chin.scale.set(1.25, 1.2, 1);
      return [band, chin];
    }
    return [];
  };

  // aura: sprite con degradé radial, fijo en la escena (no gira con la figura)
  const auraTex = auraTexture(THREE);
  const auraMat = new THREE.SpriteMaterial({ map: auraTex, transparent: true, depthWrite: false, opacity: 0 });
  const auraSprite = new THREE.Sprite(auraMat);
  auraSprite.position.set(0, 1.15, -0.7);
  auraSprite.scale.set(2.4, 2.4, 1);
  scene.add(auraSprite);

  let current = null;
  const massRadius = (mass) => 0.85 + 0.3 * (mass - 0.9) / 0.25;

  function applyParams(p) {
    current = p;
    chest.scale.set(0.85 + 0.5 * p.lat, 1, 0.7 + 0.5 * p.chest);
    abdomen.scale.set(0.7 + 0.5 * p.waist, 0.9, 0.6 + 0.6 * p.belly);
    pelvis.scale.set(0.9 + 0.3 * p.waist, 0.7, 0.75);
    const ds = 0.7 + 0.6 * p.delt;
    for (const s of shoulders) s.scale.setScalar(ds);
    const ar = 0.7 + 0.6 * (0.5 * p.biceps + 0.5 * p.triceps);
    for (const a of upperArms) a.scale.set(ar, 1, ar);
    const fr = 0.7 + 0.5 * p.forearm;
    for (const f of forearms) f.scale.set(fr, 1, fr);
    const lr = massRadius(p.mass);
    for (const t of thighs) t.scale.set(lr, 1, lr);
    for (const c of calves) c.scale.set(lr, 1, lr);
    root.scale.setScalar(p.scale);

    if (p.unlocks.gold) {
      bodyMat.color.setHex(GOLD); bodyMat.metalness = 0.85; bodyMat.roughness = 0.35;
    } else {
      bodyMat.color.setHex(TINTS[p.tint]); bodyMat.metalness = 0; bodyMat.roughness = 0.75;
    }
    pedestalMat.color.setHex(TINTS[p.tint]);

    belt.visible = p.unlocks.belt;
    belt.scale.set(0.8 + 0.45 * p.waist, 0.8, 0.65 + 0.55 * p.belly);
    laurel.visible = p.unlocks.laurel;
    pedestal.visible = p.unlocks.pedestal;
    cape.visible = p.unlocks.cape;
    auraMat.opacity = p.aura * 0.6;
    auraSprite.visible = p.aura > 0;

    if (p.hair !== hairKind) {
      dropMeshes(hairMeshes);
      hairMeshes = buildHair(p.hair);
      if (hairMeshes.length) headGroup.add(...hairMeshes);
      hairKind = p.hair;
    }
    if (p.beard !== beardKind) {
      dropMeshes(beardMeshes);
      beardMeshes = buildBeard(p.beard);
      if (beardMeshes.length) headGroup.add(...beardMeshes);
      beardKind = p.beard;
    }
  }

  // --- interacción: arrastre horizontal con inercia; giro automático en reposo ---
  let dragging = false, pointerId = null, lastX = 0, lastY = 0, velocity = 0;
  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true; pointerId = e.pointerId; lastX = e.clientX; lastY = e.clientY; velocity = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
  };
  const onMove = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (Math.abs(dx) > Math.abs(dy) && e.cancelable) e.preventDefault();
    root.rotation.y += dx * DRAG_GAIN;
    velocity = dx * DRAG_GAIN;
  };
  const onUp = (e) => {
    if (e.pointerId !== pointerId) return;
    dragging = false; pointerId = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
  };
  const prevTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove, { passive: false });
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  // --- bucle de render (~30 fps, sólo mientras está visible) ---
  let visible = false, rafId = 0, lastFrame = 0, disposed = false;
  function step(dt) {
    if (dragging) { velocity *= 0.85; return; }
    if (Math.abs(velocity) >= 0.001) {
      root.rotation.y += velocity;
      velocity *= INERTIA;
    } else {
      velocity = 0;
      root.rotation.y += AUTO_SPEED * dt;
    }
  }
  function frame(now) {
    if (disposed || !visible) { rafId = 0; return; }
    rafId = requestAnimationFrame(frame);
    if (now - lastFrame < FPS_INTERVAL - 1) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    step(dt);
    renderer.render(scene, camera);
  }
  const renderOnce = () => { if (!disposed) renderer.render(scene, camera); };

  let resizeObs = null;
  const resize = () => {
    if (disposed) return;
    const w = width(), h = height();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!visible) renderOnce();
  };
  if (typeof ResizeObserver !== 'undefined') {
    try { resizeObs = new ResizeObserver(resize); resizeObs.observe(canvas); } catch { resizeObs = null; }
  }

  applyParams(normalizeParams(params));
  renderOnce();

  const api = {
    update(next) {
      if (disposed) return;
      applyParams(normalizeParams(next));
      if (!visible) renderOnce();
    },
    setVisible(v) {
      if (disposed) return;
      visible = !!v;
      if (visible && !rafId) {
        lastFrame = performance.now() - FPS_INTERVAL;
        rafId = requestAnimationFrame(frame);
      } else if (!visible && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; visible = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.style.touchAction = prevTouchAction;
      scene.remove(root, auraSprite);
      for (const g of geometries) g.dispose();
      geometries.clear();
      for (const m of materials) m.dispose();
      auraMat.dispose();
      auraTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      liveRenderers -= 1;
    },
    debug() {
      return {
        contexts: liveRenderers,
        chestScale: chest.scale.x,
        waistScale: abdomen.scale.x,
        upperArmScale: upperArms[0].scale.x,
        parts: root.children.length,
        rotationY: root.rotation.y,
        gold: bodyMat.metalness > 0.5,
        visible,
        disposed,
        hair: hairKind,
        beard: beardKind,
        aura: current ? current.aura : 0,
      };
    },
  };
  return api;
}
