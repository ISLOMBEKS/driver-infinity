import * as THREE from 'three';

export interface GameCallbacks {
  onScoreUpdate: (score: number) => void;
  onSpeedUpdate: (pct: number) => void;
  onGameOver: (score: number) => void;
  onStateChange: (state: GameState) => void;
}

export type GameState = 'start' | 'playing' | 'falling' | 'gameover';

export interface GameController {
  start: () => void;
  resume: () => void;
  destroy: () => void;
  getScore: () => number;
}

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const ROAD_W       = 10;
const SEG_LEN      = 40;
const SEG_COUNT    = 12;
const SPEED_BASE   = 16;
const SPEED_MAX    = 45;
const TURN_SPEED   = 5.5;
const TURN_INERTIA = 7;
const CAR_HALF_W   = ROAD_W / 2 - 0.8;
const OBS_INTERVAL0 = 2.8;
const OBS_FALL_G   = 22;
const CAM_H        = 5.5;
const CAM_DIST     = 13;
const SKID_WIDTH   = 0.18;
const MAX_SKID_PTS = 220;

// ── HELPERS ──────────────────────────────────────────────────────────────────
function addBox(
  parent: THREE.Group,
  w: number, h: number, d: number,
  mat: THREE.Material,
  px = 0, py = 0, pz = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(px, py, pz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function makeTrapezoidGeo(wBot: number, wTop: number, h: number, d: number) {
  const hb = wBot / 2, ht = wTop / 2, hd = d / 2;
  const pos: number[] = [], nrm: number[] = [];
  type V3 = [number, number, number];
  function face(v0: V3, v1: V3, v2: V3, v3: V3, nx: number, ny: number, nz: number) {
    pos.push(...v0, ...v1, ...v2, ...v0, ...v2, ...v3);
    for (let i = 0; i < 6; i++) nrm.push(nx, ny, nz);
  }
  const p: V3[] = [
    [-hb, 0, hd], [hb, 0, hd], [hb, 0, -hd], [-hb, 0, -hd],
    [-ht, h, hd], [ht, h, hd], [ht, h, -hd], [-ht, h, -hd],
  ];
  face(p[0], p[1], p[5], p[4],  0, 0,  1);
  face(p[2], p[3], p[7], p[6],  0, 0, -1);
  face(p[3], p[0], p[4], p[7], -1, 0,  0);
  face(p[1], p[2], p[6], p[5],  1, 0,  0);
  face(p[4], p[5], p[6], p[7],  0, 1,  0);
  face(p[3], p[2], p[1], p[0],  0, -1, 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(nrm), 3));
  return geo;
}

function makeStripeTexture() {
  const W = 512, H = 64;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const stripes = 8, sw = W / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#111111' : '#f0f0f0';
    ctx.fillRect(i * sw, 0, sw, H);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// ── LICENSE PLATE TEXTURE ─────────────────────────────────────────────────────
function makeLicensePlateTexture() {
  const W = 512, H = 140;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;

  // Plate background — жёлтый с синей рамкой (европейский стиль)
  const r = 14;
  ctx.fillStyle = '#F5E642';
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(W - r, 0);
  ctx.quadraticCurveTo(W, 0, W, r);
  ctx.lineTo(W, H - r); ctx.quadraticCurveTo(W, H, W - r, H);
  ctx.lineTo(r, H); ctx.quadraticCurveTo(0, H, 0, H - r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath(); ctx.fill();

  // Синяя полоса слева (EU стиль)
  ctx.fillStyle = '#0052FF';
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(62, 0); ctx.lineTo(62, H); ctx.lineTo(r, H);
  ctx.quadraticCurveTo(0, H, 0, H - r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath(); ctx.fill();

  // Звёзды ЕС (упрощённо — маленькие точки)
  ctx.fillStyle = '#FFD700';
  const starCx = 31, starCy = H / 2;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const sx = starCx + Math.cos(angle) * 22;
    const sy = starCy + Math.sin(angle) * 22;
    ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
  }

  // "B" буква под звёздами
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('B', starCx, H - 8);

  // Рамка вокруг всей таблички
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(W - r, 0);
  ctx.quadraticCurveTo(W, 0, W, r);
  ctx.lineTo(W, H - r); ctx.quadraticCurveTo(W, H, W - r, H);
  ctx.lineTo(r, H); ctx.quadraticCurveTo(0, H, 0, H - r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath(); ctx.stroke();

  // Текст номера
  ctx.fillStyle = '#111';
  ctx.font = 'bold 72px "Arial Narrow", Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BASE·001', W / 2 + 30, H / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── SKID TRAIL ────────────────────────────────────────────────────────────────
interface SkidPt { cx: number; cz: number; rotY: number; }
interface SkidTrail {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  posAttr: THREE.BufferAttribute;
  positions: Float32Array;
  pts: SkidPt[];
  addPoint: (cx: number, cz: number, rotY: number) => void;
  clear: () => void;
}

function createSkidTrail(scene: THREE.Scene): SkidTrail {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_SKID_PTS * 2 * 3);
  const indices = new Uint16Array((MAX_SKID_PTS - 1) * 6);
  for (let i = 0; i < MAX_SKID_PTS - 1; i++) {
    const b = i * 6, v = i * 2;
    indices[b] = v; indices[b+1] = v+1; indices[b+2] = v+2;
    indices[b+3] = v+1; indices[b+4] = v+3; indices[b+5] = v+2;
  }
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x111111, transparent: true, opacity: 0.50,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const pts: SkidPt[] = [];

  return {
    mesh, geo, posAttr, positions, pts,
    addPoint(cx, cz, rotY) {
      pts.push({ cx, cz, rotY });
      if (pts.length > MAX_SKID_PTS) pts.shift();
      const n = pts.length;
      if (n < 2) { geo.setDrawRange(0, 0); return; }
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const hw = SKID_WIDTH / 2;
        const cosR = Math.cos(p.rotY), sinR = Math.sin(p.rotY);
        const vi = i * 6;
        positions[vi]   = p.cx - cosR * hw; positions[vi+1] = 0.20; positions[vi+2] = p.cz + sinR * hw;
        positions[vi+3] = p.cx + cosR * hw; positions[vi+4] = 0.20; positions[vi+5] = p.cz - sinR * hw;
      }
      posAttr.needsUpdate = true;
      geo.setDrawRange(0, (n - 1) * 6);
    },
    clear() { pts.length = 0; geo.setDrawRange(0, 0); },
  };
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export function initGame(canvas: HTMLCanvasElement, callbacks: GameCallbacks): GameController {
  // ── Renderer ────────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // ── Scene / Sky ─────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 64; skyCanvas.height = 1024;
  const skyCtx = skyCanvas.getContext('2d')!;
  const skyGrad = skyCtx.createLinearGradient(0, 0, 0, skyCanvas.height);
  skyGrad.addColorStop(0.0,  '#08142f');
  skyGrad.addColorStop(0.22, '#12306f');
  skyGrad.addColorStop(0.48, '#2d67c7');
  skyGrad.addColorStop(0.72, '#d96a42');
  skyGrad.addColorStop(1.0,  '#f3c76a');
  skyCtx.fillStyle = skyGrad;
  skyCtx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.minFilter = THREE.LinearFilter;
  skyTex.magFilter = THREE.LinearFilter;
  scene.background = skyTex;
  scene.fog = new THREE.FogExp2(0xe08850, 0.011);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 350);

  // ── Lighting ─────────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xfff0e0, 0.6));
  const sun = new THREE.DirectionalLight(0xffeedd, 1.1);
  sun.position.set(15, 40, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, far: 160 });
  scene.add(sun); scene.add(sun.target);
  const skyLight = new THREE.DirectionalLight(0x8ebbff, 0.35);
  skyLight.position.set(-8, 10, -10);
  scene.add(skyLight);

  // ── Road ──────────────────────────────────────────────────────────────────────
  const matRoad   = new THREE.MeshLambertMaterial({ color: 0x2c2c2c });
  const matSide   = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const matCenter = new THREE.MeshLambertMaterial({ color: 0xffcc00 });
  const matShldr  = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const gRoad  = new THREE.BoxGeometry(ROAD_W, 0.18, SEG_LEN);
  const gShldr = new THREE.BoxGeometry(1.8, 0.15, SEG_LEN);
  const gEdge  = new THREE.BoxGeometry(0.14, 0.22, SEG_LEN);
  const gDash  = new THREE.BoxGeometry(0.10, 0.22, 3.5);

  const segments: THREE.Group[] = [];
  function makeSeg(z: number) {
    const g = new THREE.Group();
    const r = new THREE.Mesh(gRoad, matRoad); r.receiveShadow = true; g.add(r);
    for (const sx of [-(ROAD_W/2+0.9), ROAD_W/2+0.9]) {
      const sh = new THREE.Mesh(gShldr, matShldr); sh.position.set(sx, -0.015, 0); g.add(sh);
    }
    for (const sx of [-(ROAD_W/2-0.18), ROAD_W/2-0.18]) {
      const el = new THREE.Mesh(gEdge, matSide); el.position.set(sx, 0.01, 0); g.add(el);
    }
    for (let dz = -SEG_LEN/2+2; dz < SEG_LEN/2; dz += 9) {
      const d = new THREE.Mesh(gDash, matCenter); d.position.set(0, 0.01, dz); g.add(d);
    }
    g.position.set(0, 0, z); scene.add(g); return g;
  }
  for (let i = 0; i < SEG_COUNT; i++) segments.push(makeSeg(i * SEG_LEN));

  // ── Car ───────────────────────────────────────────────────────────────────────
  const car = new THREE.Group(); scene.add(car);
  const mBody  = new THREE.MeshLambertMaterial({ color: 0x0052FF }); // Base blue
  const mCabin = new THREE.MeshLambertMaterial({ color: 0x4488ff });
  const mGlass = new THREE.MeshLambertMaterial({ color: 0xbbddff, transparent: true, opacity: 0.65 });
  const mWheel = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const mHub   = new THREE.MeshLambertMaterial({ color: 0xcccccc });
  const mTail  = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: new THREE.Color(0xff0000), emissiveIntensity: 0.5 });
  const mBump  = new THREE.MeshLambertMaterial({ color: 0xdddddd });
  const mUnder = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  addBox(car, 1.8,  0.55, 3.8, mBody,  0, 0.55,  0);
  addBox(car, 1.75, 0.12, 3.6, mUnder, 0, 0.22,  0);
  addBox(car, 1.55, 0.5,  2.1, mCabin, 0, 1.1,  -0.1);
  addBox(car, 1.45, 0.35, 0.08, mGlass, 0, 1.05,  0.97);
  addBox(car, 1.45, 0.35, 0.08, mGlass, 0, 1.05, -1.22);
  addBox(car, 1.5,  0.07, 0.3,  mBody,  0, 1.36, -1.1);
  addBox(car, 1.82, 0.25, 0.12, mBump,  0, 0.38,  1.97);
  addBox(car, 1.82, 0.25, 0.12, mBump,  0, 0.38, -1.97);
  for (const sx of [-0.58, 0.58]) addBox(car, 0.45, 0.16, 0.07, mTail, sx, 0.55, -1.9);

  // ── License plate on rear bumper ──────────────────────────────────────────────
  const plateTex = makeLicensePlateTexture();
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTex });
  const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.22), plateMat);
  plateMesh.position.set(0, 0.42, -2.04); // задний бампер, смотрит назад
  car.add(plateMesh);

  // ── Wheels ───────────────────────────────────────────────────────────────────
  const gWRim = new THREE.CylinderGeometry(0.30, 0.30, 0.20, 14);
  gWRim.rotateZ(Math.PI / 2);
  const gWHub = new THREE.CylinderGeometry(0.12, 0.12, 0.22, 8);
  gWHub.rotateZ(Math.PI / 2);
  const wheels: THREE.Group[] = [];
  for (const [wx, wy, wz] of [[-1.07, .30, 1.25], [1.07, .30, 1.25], [-1.07, .30, -1.25], [1.07, .30, -1.25]]) {
    const wg = new THREE.Group();
    wg.add(new THREE.Mesh(gWRim, mWheel));
    wg.add(new THREE.Mesh(gWHub, mHub));
    wg.position.set(wx, wy, wz);
    wg.castShadow = true;
    car.add(wg); wheels.push(wg);
  }
  car.position.set(0, 0.18, 4);

  // ── Skid marks ───────────────────────────────────────────────────────────────
  const skidL = createSkidTrail(scene);
  const skidR = createSkidTrail(scene);

  // ── Obstacles ────────────────────────────────────────────────────────────────
  const obstacles: THREE.Group[] = [];
  const mBarGray   = new THREE.MeshLambertMaterial({ color: 0xdcdcdc });
  const mBarStripe = new THREE.MeshLambertMaterial({ map: makeStripeTexture() });
  const mBarBand   = [mBarStripe, mBarStripe, mBarGray, mBarGray, mBarStripe, mBarStripe];

  function makeBarrier() {
    const g = new THREE.Group();
    const D = 1.15, H = 1.1, wBot = 2.2, wTop = 1.05;
    const bandH = 0.22, bandW = 1.10;
    const body = new THREE.Mesh(makeTrapezoidGeo(wBot, wTop, H, D), mBarGray);
    g.add(body);
    const band = new THREE.Mesh(new THREE.BoxGeometry(bandW, bandH, D + 0.02), mBarBand as THREE.Material[]);
    band.position.y = H - bandH / 2;
    g.add(band);
    return g;
  }

  function spawnObs() {
    const x = (Math.random() - 0.5) * (ROAD_W + 3.0);
    const z = car.position.z + 65 + Math.random() * 20;
    const b = makeBarrier();
    b.position.set(x, 14 + Math.random() * 4, z);
    b.userData = { vy: 0, landed: false };
    scene.add(b); obstacles.push(b);
  }

  // ── Resize ────────────────────────────────────────────────────────────────────
  function resize() {
    const w = canvas.parentElement?.clientWidth ?? window.innerWidth;
    const h = canvas.parentElement?.clientHeight ?? window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Input ─────────────────────────────────────────────────────────────────────
  let inputX = 0;
  let touchStartX = 0, touchCurX = 0, touchDown = false;
  const keys: Record<string, boolean> = {};

  function onDown(e: MouseEvent | TouchEvent) {
    const t = 'touches' in e ? e.touches[0] : e;
    touchStartX = t.clientX; touchCurX = t.clientX; touchDown = true;
  }
  function onMove(e: MouseEvent | TouchEvent) {
    if (!touchDown) return;
    touchCurX = ('touches' in e ? e.touches[0] : e).clientX;
  }
  function onUp() { touchDown = false; inputX = 0; }
  function onKey(e: KeyboardEvent) { keys[e.code] = e.type === 'keydown'; }

  canvas.addEventListener('touchstart',  e => { e.preventDefault(); onDown(e); }, { passive: false });
  canvas.addEventListener('touchmove',   e => { e.preventDefault(); onMove(e); }, { passive: false });
  canvas.addEventListener('touchend',    e => { e.preventDefault(); onUp(); },    { passive: false });
  canvas.addEventListener('mousedown',   onDown as EventListener);
  canvas.addEventListener('mousemove',   onMove as EventListener);
  canvas.addEventListener('mouseup',     onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup',   onKey);

  // ── Game state ────────────────────────────────────────────────────────────────
  let gameState: GameState = 'start';
  let distance  = 0;
  let carSpeed  = SPEED_BASE;
  let carVelX   = 0;
  let rollAngle = 0;
  let fallTimer = 0;
  let obsTimer  = 0;
  let obsInterval = OBS_INTERVAL0;

  // ── Audio ─────────────────────────────────────────────────────────────────────
  let audioCtx: AudioContext | null = null;
  let musicStarted = false;
  let musicTimer: ReturnType<typeof setTimeout> | null = null;
  const activeMusicTimeouts: ReturnType<typeof setTimeout>[] = [];
  const activeMusicNodes: AudioNode[] = [];
  let musicGain: GainNode | null = null;
  let masterBus: GainNode | null = null;
  let reverbBus: ConvolverNode | null = null;

  function initAudio() {
    if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {}); return; }
    audioCtx = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const master = audioCtx.createGain(); master.gain.value = 0.85; master.connect(audioCtx.destination);
    masterBus = master;
    musicGain = audioCtx.createGain(); musicGain.gain.value = 0.0001; musicGain.connect(masterBus);
    const revLen = audioCtx.sampleRate * 2.0;
    const revBuf = audioCtx.createBuffer(2, revLen, audioCtx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = revBuf.getChannelData(c);
      for (let i = 0; i < revLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / revLen, 2.5);
    }
    const reverb = audioCtx.createConvolver(); reverb.buffer = revBuf;
    const revGain = audioCtx.createGain(); revGain.gain.value = 0.18;
    reverb.connect(revGain); revGain.connect(master);
    reverbBus = reverb;
  }

  function stopMusic(immediate = false) {
    if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
    activeMusicTimeouts.forEach(id => clearTimeout(id));
    activeMusicTimeouts.length = 0;
    if (audioCtx && musicGain) {
      const now = audioCtx.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      if (immediate) {
        musicGain.gain.setValueAtTime(0, now);
      } else {
        const cur = Math.max(0.0001, musicGain.gain.value || 0.0001);
        musicGain.gain.setValueAtTime(cur, now);
        musicGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      }
    }
    const stopAt = audioCtx ? audioCtx.currentTime + (immediate ? 0.01 : 0.25) : 0;
    activeMusicNodes.forEach(node => { try { (node as OscillatorNode).stop(stopAt); node.disconnect(); } catch {} });
    activeMusicNodes.length = 0;
    musicStarted = false;
  }

  function startMusic() {
    if (!audioCtx || !musicGain || musicStarted) return;
    musicStarted = true;
    const now = audioCtx.currentTime;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(0.0001, now);
    musicGain.gain.exponentialRampToValueAtTime(0.7, now + 0.35);

    const BPM = 110, B = 60 / BPM;
    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 8; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.15;
    comp.connect(musicGain);

    function reg(n: AudioNode) { activeMusicNodes.push(n); return n; }
    function schedTO(fn: () => void, ms: number) {
      const id = setTimeout(() => { activeMusicTimeouts.splice(activeMusicTimeouts.indexOf(id), 1); fn(); }, ms);
      activeMusicTimeouts.push(id); return id;
    }
    function pad(freq: number, vol: number, dur: number, when: number) {
      [-4, 0, 4].forEach(cents => {
        const o = reg(audioCtx!.createOscillator()) as OscillatorNode;
        const g = audioCtx!.createGain(), f = audioCtx!.createBiquadFilter();
        o.type = 'triangle'; o.frequency.value = freq * Math.pow(2, cents / 1200);
        f.type = 'lowpass'; f.frequency.value = freq * 3.5; f.Q.value = 0.7;
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(vol, when + 0.12);
        g.gain.setValueAtTime(vol, when + dur - 0.25);
        g.gain.linearRampToValueAtTime(0, when + dur);
        o.connect(f); f.connect(g); g.connect(reverbBus!); g.connect(comp);
        o.start(when); o.stop(when + dur + 0.05);
      });
    }
    function bass(freq: number, vol: number, dur: number, when: number) {
      const o = reg(audioCtx!.createOscillator()) as OscillatorNode;
      const g = audioCtx!.createGain(), f = audioCtx!.createBiquadFilter();
      o.type = 'sine'; o.frequency.value = freq;
      f.type = 'lowpass'; f.frequency.value = 280;
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      o.connect(f); f.connect(g); g.connect(comp);
      o.start(when); o.stop(when + dur + 0.05);
    }
    function pluck(freq: number, vol: number, dur: number, when: number) {
      const o = reg(audioCtx!.createOscillator()) as OscillatorNode;
      const o2 = reg(audioCtx!.createOscillator()) as OscillatorNode;
      const g = audioCtx!.createGain(), f = audioCtx!.createBiquadFilter();
      o.type = 'square'; o.frequency.value = freq;
      o2.type = 'sine'; o2.frequency.value = freq * 2.01;
      f.type = 'lowpass'; f.frequency.value = freq * 4; f.Q.value = 1.2;
      const g2 = audioCtx!.createGain(); g2.gain.value = 0.3;
      g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      o.connect(f); o2.connect(g2); g2.connect(f);
      f.connect(g); g.connect(reverbBus!); g.connect(comp);
      o.start(when); o2.start(when); o.stop(when + dur + 0.05); o2.stop(when + dur + 0.05);
    }
    function kick(when: number) {
      const o = reg(audioCtx!.createOscillator()) as OscillatorNode;
      const g = audioCtx!.createGain();
      o.frequency.setValueAtTime(200, when); o.frequency.exponentialRampToValueAtTime(35, when + 0.10);
      g.gain.setValueAtTime(1.0, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
      o.connect(g); g.connect(comp); o.start(when); o.stop(when + 0.2);
    }
    function clap(when: number) {
      for (let i = 0; i < 3; i++) {
        const t = when + i * 0.012;
        const buf = audioCtx!.createBuffer(1, audioCtx!.sampleRate * 0.08, audioCtx!.sampleRate);
        const d = buf.getChannelData(0);
        for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * Math.exp(-j / (audioCtx!.sampleRate * 0.025));
        const src = reg(audioCtx!.createBufferSource()) as AudioBufferSourceNode; src.buffer = buf;
        const flt = audioCtx!.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 1200; flt.Q.value = 0.8;
        const g = audioCtx!.createGain(); g.gain.value = 0.45;
        src.connect(flt); flt.connect(g); g.connect(comp); src.start(t); src.stop(t + 0.09);
      }
    }
    function hihat(when: number, open = false) {
      const buf = audioCtx!.createBuffer(1, audioCtx!.sampleRate * (open ? 0.12 : 0.04), audioCtx!.sampleRate);
      const d = buf.getChannelData(0);
      for (let j = 0; j < d.length; j++) d[j] = Math.random() * 2 - 1;
      const src = reg(audioCtx!.createBufferSource()) as AudioBufferSourceNode; src.buffer = buf;
      const flt = audioCtx!.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 10000;
      const g = audioCtx!.createGain(); g.gain.value = open ? 0.09 : 0.06;
      src.connect(flt); flt.connect(g); g.connect(comp); src.start(when); src.stop(when + (open ? 0.13 : 0.05));
    }

    const progression = [
      { pad: [130.8, 164.8, 196, 261.6], bass: 65.4 },
      { pad: [174.6, 220, 261.6, 349.2], bass: 87.3 },
      { pad: [220, 261.6, 329.6, 440],   bass: 110  },
      { pad: [196, 246.9, 293.7, 392],   bass: 98   },
    ];
    const melody = [
      523.2, 493.9, 440, 493.9, 523.2, 587.3, 659.3, 587.3,
      523.2, 440, 493.9, 440, 392, 440, 493.9, 523.2,
    ];
    let bar = 0;

    function scheduleBar(when: number) {
      const prog = progression[bar % 4];
      const mel  = melody.slice((bar % 4) * 4, (bar % 4) * 4 + 4);
      prog.pad.forEach(f => pad(f * 0.5, 0.055, B * 4, when));
      prog.pad.forEach(f => pad(f, 0.04, B * 4, when));
      bass(prog.bass, 0.55, B * 0.7, when);
      bass(prog.bass, 0.45, B * 0.5, when + B * 1.5);
      bass(prog.bass * 1.5, 0.35, B * 0.3, when + B * 2.5);
      bass(prog.bass, 0.50, B * 0.7, when + B * 3);
      kick(when); kick(when + B * 2);
      clap(when + B); clap(when + B * 3);
      for (let i = 0; i < 8; i++) hihat(when + i * B * 0.5, i % 4 === 2);
      mel.forEach((f, i) => pluck(f, 0.12, B * 0.55, when + i * B));
      bar++;
      musicTimer = schedTO(() => scheduleBar(audioCtx!.currentTime + 0.05), B * 4 * 1000 - 80);
    }
    musicTimer = schedTO(() => scheduleBar(audioCtx!.currentTime + 0.1), 50);
  }

  // ── Update ────────────────────────────────────────────────────────────────────
  let camX = 0, camY = CAM_H;

  function resetCar() {
    car.position.set(0, 0.18, 4);
    car.rotation.set(0, 0, 0);
    car.scale.set(1, 1, 1);
  }

  function updateGame(dt: number) {
    if (gameState === 'playing') {
      carSpeed    = Math.min(SPEED_MAX, SPEED_BASE + distance * 0.018);
      obsInterval = Math.max(0.7, OBS_INTERVAL0 - distance * 0.004);

      if (touchDown) {
        inputX = Math.max(-1, Math.min(1, -(touchCurX - touchStartX) / 75));
      } else {
        inputX = keys['ArrowLeft'] || keys['KeyA'] ?  1
               : keys['ArrowRight'] || keys['KeyD'] ? -1 : 0;
      }

      carVelX += (inputX * TURN_SPEED - carVelX) * TURN_INERTIA * dt;
      car.position.z += carSpeed * dt;
      car.position.x  = Math.max(-ROAD_W, Math.min(ROAD_W, car.position.x + carVelX * dt));

      const edgeX  = ROAD_W / 2 + 1.4;
      const overEdge = Math.abs(car.position.x) - edgeX;
      if (overEdge > 0) {
        const dir = car.position.x > 0 ? 1 : -1;
        rollAngle += dir * (2.0 + overEdge * 4.0) * dt;
        carSpeed  *= Math.pow(0.92, dt * 60);
      } else {
        rollAngle *= Math.pow(0.05, dt);
      }

      car.rotation.z = THREE.MathUtils.lerp(car.rotation.z, -carVelX * 0.06 - rollAngle, 10 * dt);
      car.rotation.y = THREE.MathUtils.lerp(car.rotation.y,  carVelX * 0.09, 10 * dt);
      wheels.forEach(w => w.rotation.x += carSpeed * dt * 0.7);

      if (Math.abs(carVelX) > 1.8) {
        const intensity = Math.min(1, Math.abs(carVelX) / TURN_SPEED);
        const rotY = car.rotation.y;
        const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
        const lx = car.position.x - 1.07 * cosR + 1.25 * sinR;
        const lz = car.position.z - 1.07 * sinR - 1.25 * cosR;
        const rx = car.position.x + 1.07 * cosR + 1.25 * sinR;
        const rz = car.position.z + 1.07 * sinR - 1.25 * cosR;
        for (const trail of [skidL, skidR]) {
          const last = trail.pts[trail.pts.length - 1];
          if (last && Math.abs(car.position.z - last.cz) > 5) trail.clear();
        }
        skidL.addPoint(lx, lz, rotY);
        skidR.addPoint(rx, rz, rotY);
        const op = 0.25 + intensity * 0.45;
        skidL.mesh.material instanceof THREE.MeshBasicMaterial && (skidL.mesh.material.opacity = op);
        skidR.mesh.material instanceof THREE.MeshBasicMaterial && (skidR.mesh.material.opacity = op);
      }

      distance += carSpeed * dt;
      callbacks.onScoreUpdate(Math.floor(distance));
      callbacks.onSpeedUpdate(Math.round(((carSpeed - SPEED_BASE) / (SPEED_MAX - SPEED_BASE)) * 100));

      if (Math.abs(rollAngle) > 1.35) {
        gameState = 'falling';
        fallTimer = 0;
        stopMusic(); // плавно останавливаем музыку при съезде с дороги
        callbacks.onStateChange('falling');
      }

      obsTimer -= dt;
      if (obsTimer <= 0) { spawnObs(); obsTimer = obsInterval; }
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        if (!o.userData.landed) {
          o.userData.vy -= OBS_FALL_G * dt;
          o.position.y  += o.userData.vy * dt;
          if (o.position.y <= 0.09) { o.position.y = 0.09; o.userData.landed = true; }
        }
        if (o.userData.landed) {
          if (Math.abs(car.position.x - o.position.x) < 1.65 && Math.abs(car.position.z - o.position.z) < 2.6) {
            gameState = 'gameover';
            stopMusic(); // останавливаем музыку при столкновении
            callbacks.onGameOver(Math.floor(distance));
            callbacks.onStateChange('gameover');
          }
        }
        if (o.position.z < car.position.z - 30) { scene.remove(o); obstacles.splice(i, 1); }
      }

      let maxZ = -Infinity;
      segments.forEach(s => { maxZ = Math.max(maxZ, s.position.z); });
      segments.forEach(s => {
        if (s.position.z < car.position.z - SEG_LEN) { s.position.z = maxZ + SEG_LEN; maxZ += SEG_LEN; }
      });

    } else if (gameState === 'falling') {
      fallTimer += dt;
      const side = carVelX >= 0 ? 1 : -1;
      car.position.y -= (4 + fallTimer * 14) * dt;
      car.position.z += carSpeed * 0.25 * dt;
      car.rotation.z += (1.8 + fallTimer * 4) * side * dt;
      car.rotation.x += 1.2 * dt;
      carSpeed *= 0.97;
      wheels.forEach(w => w.rotation.x += carSpeed * dt * 0.7);
      if (fallTimer >= 2.0) {
        gameState = 'gameover';
        stopMusic(true);
        callbacks.onGameOver(Math.floor(distance));
        callbacks.onStateChange('gameover');
      }
    }

    camX = THREE.MathUtils.lerp(camX, car.position.x * 0.45, 6 * dt);
    camY = THREE.MathUtils.lerp(camY, car.position.y + CAM_H, 8 * dt);
    camera.position.set(camX, camY, car.position.z - CAM_DIST);
    camera.lookAt(car.position.x * 0.25, car.position.y + 0.6, car.position.z + 18);
    sun.position.set(car.position.x + 15, 40, car.position.z + 10);
    sun.target.position.set(car.position.x, 0, car.position.z + 5);
    sun.target.updateMatrixWorld();
  }

  // ── Loop ──────────────────────────────────────────────────────────────────────
  let animId = 0;
  let lastT  = performance.now();
  function loop(ts: number) {
    animId = requestAnimationFrame(loop);
    const dt = Math.min((ts - lastT) / 1000, 0.05);
    lastT = ts;
    updateGame(dt);
    renderer.render(scene, camera);
  }

  camera.position.set(0, CAM_H, 4 - CAM_DIST);
  camera.lookAt(0, 0.6, 30);
  renderer.render(scene, camera);
  animId = requestAnimationFrame(loop);

  // ── Public API ────────────────────────────────────────────────────────────────
  function startFresh() {
    stopMusic(true);
    gameState   = 'playing';
    distance    = 0;
    carSpeed    = SPEED_BASE;
    carVelX     = 0;
    fallTimer   = 0;
    obsTimer    = 0;
    obsInterval = OBS_INTERVAL0;
    inputX      = 0;
    rollAngle   = 0;
    touchDown   = false;
    resetCar();
    obstacles.forEach(o => scene.remove(o));
    obstacles.length = 0;
    skidL.clear(); skidR.clear();
    segments.forEach((s, i) => { s.position.z = i * SEG_LEN; });
    callbacks.onStateChange('playing');
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    if (!musicStarted) startMusic();
  }

  function resume() {
    // Разрешаем resume из gameover И falling (на случай если оплата пришла до конца анимации)
    if (gameState !== 'gameover' && gameState !== 'falling') return;
    stopMusic(true);

    gameState = 'playing';
    fallTimer = 0;
    rollAngle = 0;
    carVelX   = 0;
    inputX    = 0;
    touchDown = false;

    // Сбрасываем машину на центр дороги
    car.rotation.set(0, 0, 0);
    car.scale.set(1, 1, 1);
    car.position.y = 0.18;
    car.position.x = Math.max(-CAR_HALF_W, Math.min(CAR_HALF_W, car.position.x));

    // Убираем все препятствия рядом с машиной
    for (let i = obstacles.length - 1; i >= 0; i--) {
      if (Math.abs(car.position.z - obstacles[i].position.z) < 15) {
        scene.remove(obstacles[i]); obstacles.splice(i, 1);
      }
    }

    skidL.clear(); skidR.clear();
    callbacks.onStateChange('playing');

    // Запускаем музыку заново
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    startMusic();
  }

  function destroy() {
    cancelAnimationFrame(animId);
    stopMusic(true);
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup',   onKey);
    renderer.dispose();
  }

  return { start: startFresh, resume, destroy, getScore: () => Math.floor(distance) };
}
