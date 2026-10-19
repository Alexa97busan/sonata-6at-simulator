// 화면 2: 3D 보기 공통(three.js 불러오기), 단일·라비뇨 유성기어 3D, 변속기 단면 3D, 오일 흐름.
// 여러 파일이 전역 이름을 함께 씁니다(sim.js·course.js·dynamics.js 다음, 이 순서대로 불러와야 합니다).
// ---- 3D 보기 (three.js는 처음 3D를 켤 때 한 번만 불러옵니다) ----
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
function loadScript(src) {
  return new Promise((res, rej) => {
    const el = document.createElement('script'); el.src = src; el.async = false;
    el.onload = res; el.onerror = () => rej(new Error('load failed: ' + src)); document.head.appendChild(el);
  });
}
let threeP = null;
function ensureThree() {
  if (!threeP) threeP = loadScript(THREE_URL).then(() => loadScript(ORBIT_URL)).catch(e => { threeP = null; throw e; });
  return threeP;
}
// 3D 가볍게: 해상도 1배, 두 프레임에 한 번만 그린다. 터치 기기에서는 기본으로 켠다
let LITE = matchMedia('(pointer: coarse)').matches, FRAME_N = 0;
const PR = () => LITE ? 1 : Math.min(window.devicePixelRatio || 1, 2);
const RM = matchMedia('(prefers-reduced-motion: reduce)');
function initView(ctl) {
  const T3 = THREE, box = $(ctl.box);
  const renderer = new T3.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(PR());
  renderer.outputEncoding = T3.sRGBEncoding; renderer.setClearColor(0x000000, 0); renderer.autoClear = false;
  box.appendChild(renderer.domElement);
  const scene = new T3.Scene(), camera = new T3.PerspectiveCamera(40, 1, 1, 4000);
  camera.up.set(0, -1, 0);                       // 2D 화면과 같은 좌표 방향(x 오른쪽, y 아래쪽)으로 본다
  scene.add(new T3.HemisphereLight(0xffffff, 0x445566, 0.95));
  const l1 = new T3.DirectionalLight(0xffffff, 0.9); l1.position.set(-60, -90, -140); scene.add(l1);
  const l2 = new T3.DirectionalLight(0xffffff, 0.35); l2.position.set(80, 60, -60); scene.add(l2);
  const group = new T3.Group(); scene.add(group);
  const controls = new T3.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false; twoFingerTouch(controls);
  controls.addEventListener('change', () => { ctl.camMoved = true; });
  const fadeScene = new T3.Scene(), fadeCam = new T3.OrthographicCamera(-1, 1, 1, -1, 0, 1);   // 잔상용: 이전 화면을 서서히 지우는 판
  const fadeMat = new T3.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.1, depthTest: false, depthWrite: false,
    blending: T3.CustomBlending, blendEquation: T3.AddEquation, blendSrc: T3.ZeroFactor, blendDst: T3.OneMinusSrcAlphaFactor });
  fadeScene.add(new T3.Mesh(new T3.PlaneGeometry(2, 2), fadeMat));
  Object.assign(ctl, { renderer, scene, camera, controls, group, fadeScene, fadeCam, fadeMat, size: 0, ready: true });
}
function setCamCtl(ctl, name) {
  const T3 = THREE, D = ctl.camD();
  const dir = { front: [0, 0, -1], oblique: [-0.55, -0.55, -0.9], side: [-1, 0, -0.12] }[name];
  const v = new T3.Vector3(...dir).normalize().multiplyScalar(D);
  const tz = ctl.targetZ || 0;
  ctl.camera.position.set(v.x, v.y, v.z + tz); ctl.controls.target.set(0, 0, tz);
  ctl.controls.minDistance = 30; ctl.controls.maxDistance = D * 2.5; ctl.controls.update(); ctl.camMoved = true;
}
function disposeGroup(ctl) {
  const g = ctl.group;
  while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
}
function renderCtl(ctl) {
  if (!ctl.ready) return;
  const key = ctl.key3();
  if (key !== ctl.key) { const first = !ctl.obj; disposeGroup(ctl); ctl.obj = ctl.build(ctl); ctl.key = key; ctl.camMoved = true; if (first) setCamCtl(ctl, 'oblique'); }
  const w = Math.max(1, Math.round($(ctl.box).clientWidth));
  if (w !== ctl.size) { ctl.size = w; ctl.renderer.setSize(w, w, false); ctl.camera.aspect = 1; ctl.camera.updateProjectionMatrix(); ctl.camMoved = true; }
  if (LITE && FRAME_N % 2) return;
  ctl.update(ctl, ctl.obj);
  ctl.controls.update();
  const r = ctl.renderer;
  if (TRAIL.tau > 0 && !ctl.camMoved) { ctl.fadeMat.opacity = 1 - Math.exp(-FRAME_DT / TRAIL.tau); r.render(ctl.fadeScene, ctl.fadeCam); }
  else r.clear(true, true, true);
  r.clearDepth(); r.render(ctl.scene, ctl.camera);
  ctl.camMoved = false;
}
function setSegIdx(el, i) { el.style.setProperty('--i', i); el.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-checked', j === i)); }
function ctlShow(ctl, v) {
  ctl.mode = v;
  $(ctl.cv2).hidden = v === '3d'; $(ctl.cv3).hidden = v !== '3d'; $(ctl.tools).hidden = v !== '3d';
  setSegIdx($(ctl.seg), v === '3d' ? 1 : 0);
}
async function ctlInit(ctl) {
  if (ctl.ready) return true;
  if (ctl.loading) return false;
  ctl.loading = true; $(ctl.msg).textContent = '3D 엔진을 불러오는 중…';
  try { await ensureThree(); initView(ctl); $(ctl.msg).textContent = ''; }
  catch (e) { $(ctl.msg).textContent = '3D를 불러오지 못했습니다. 인터넷 연결과 브라우저의 WebGL 지원을 확인해 주세요.'; ctl.loading = false; return false; }
  ctl.loading = false; return true;
}
function makeCtl(o) {
  const ctl = Object.assign({ mode: '2d', want: '2d', ready: false, loading: false, key: '', obj: null, size: 0, camMoved: true }, o);
  buildSegStr($(o.seg), [{ v: '2d', t: '2D' }, { v: '3d', t: '3D' }], '2d', async v => {
    ctl.want = v;
    if (v === '2d') { ctlShow(ctl, '2d'); return; }
    setSegIdx($(o.seg), 1);
    const ok = await ctlInit(ctl);
    if (ctl.want !== '3d') return;
    if (ok) { ctl.key = ''; ctlShow(ctl, '3d'); } else ctlShow(ctl, '2d');
  });
  document.querySelectorAll(`[data-ctl="${o.name}"]`).forEach(b => b.addEventListener('click', () => { if (ctl.ready) setCamCtl(ctl, b.dataset.cam); }));
  return ctl;
}

// ---- 단일 유성기어 3D (실험실·앞 유성기어 공용) ----
function simpleColors() {
  const cs = getComputedStyle(document.documentElement);
  return { sun: cs.getPropertyValue('--accent').trim(), on: cs.getPropertyValue('--on').trim(), ring: '#aeb1b7', pin: '#e9e9ea' };
}
function buildSimple3D(ctl, spec) {
  const T3 = THREE, { Zs, Zp, Zr, n, fixed } = spec, thick = 6, rc = (Zs + Zp) / 2, g = ctl.group, C = simpleColors();
  const mat = (color, fx) => new T3.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.5, transparent: !!fx, opacity: fx ? 0.55 : 1 });
  const dot = (color, r) => new T3.Mesh(new T3.SphereGeometry(r, 16, 12), new T3.MeshStandardMaterial({ color, roughness: 0.4 }));
  const o = { pins: [], arms: [], cyl: [] };
  o.sun = new T3.Mesh(makeGearGeom(T3, Zs, Zs / 2, thick, false), mat(C.sun, fixed === 'sun'));
  let d = dot(0xffffff, 1.3); d.position.set(Zs * 0.3, 0, -thick / 2 - 0.2); o.sun.add(d);
  o.ring = new T3.Mesh(makeGearGeom(T3, Zr, Zr / 2, thick, true, Zr / 2 + 6), mat(C.ring, fixed === 'ring'));
  const rm = new T3.Mesh(new T3.BoxGeometry(3, 3, 1.4), new T3.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })); rm.position.set(Zr / 2 + 6 - 1.2, 0, -thick / 2 - 0.5); o.ring.add(rm);
  const pg = makeGearGeom(T3, Zp, Zp / 2, thick, false), pm = mat(C.pin, false), am = mat(C.on, fixed === 'carrier');
  const armG = new T3.BoxGeometry(rc, 2.6, 1.8), cylG = new T3.CylinderGeometry(1, 1, thick + 2.8, 16); cylG.rotateX(Math.PI / 2);
  for (let i = 0; i < n; i++) {
    const m = new T3.Mesh(pg, pm); d = dot(0x222222, 1); d.position.set(Zp * 0.3, 0, -thick / 2 - 0.2); m.add(d); o.pins.push(m); g.add(m);
    const a = new T3.Mesh(armG, am); o.arms.push(a); g.add(a);
    const c = new T3.Mesh(cylG, am); o.cyl.push(c); g.add(c);
  }
  const hub = new T3.Mesh(new T3.CylinderGeometry(3.5, 3.5, 1.8, 24), am); hub.rotation.x = Math.PI / 2; hub.position.z = thick / 2 + 0.9;
  g.add(o.sun); g.add(o.ring); g.add(hub);
  return o;
}
function updateSimple3D(o, spec, ang) {
  const { Zs, Zp, n } = spec, rc = (Zs + Zp) / 2, thick = 6;
  o.sun.rotation.z = ang.thS; o.ring.rotation.z = ang.thR;
  for (let i = 0; i < n; i++) {
    const a = ang.thC + i * TAU / n, cx = Math.cos(a), sy = Math.sin(a);
    o.pins[i].position.set(rc * cx, rc * sy, 0); o.pins[i].rotation.z = meshPlanet(ang.thS, Zs, a, Zp);
    o.cyl[i].position.set(rc * cx, rc * sy, 0.4);
    o.arms[i].position.set(rc / 2 * cx, rc / 2 * sy, thick / 2 + 0.9); o.arms[i].rotation.z = a;
  }
}

// ---- 뒤 라비뇨 3D: 기어 세트 + 클러치·브레이크 팩 ----
function labelSprite(text) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const c = cv.getContext('2d');
  c.fillStyle = 'rgba(20,21,24,0.78)'; c.fillRect(8, 8, 240, 80);
  c.font = 'bold 44px sans-serif'; c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 50);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
  sp.scale.set(16, 6, 1); sp.renderOrder = 10; return sp;
}
function ringGeom(T3, ro, ri, th) {
  const sh = new T3.Shape(); sh.absarc(0, 0, ro, 0, TAU, false);
  const h = new T3.Path(); h.absarc(0, 0, ri, 0, TAU, true); sh.holes.push(h);
  const g = new T3.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 40 }); g.translate(0, 0, -th / 2); return g;
}
// ly: 라벨 높이. 이웃 팩끼리 높이를 엇갈려 옆에서 볼 때 라벨이 겹치지 않게 한다.
const PACKS = [
  { id: 'UD', z: -22, kind: 'clutch', label: 'UD', drum: 'slow', hub: 'th1', hubIn: 2.2, ly: -33 },
  { id: 'OD', z: 15, kind: 'clutch', label: 'OD', drum: 'in', hub: 'thCR', hubIn: 3.6, ly: -33 },
  { id: 'LR', z: 25, kind: 'brake', label: 'L&R', drum: 'fixed', hub: 'thCR', hubIn: 3.6, ly: -42 },
  { id: '35R', z: 35, kind: 'clutch', label: '3-5/R', drum: 'in', hub: 'th2', hubIn: 1.6, ly: -33 },
  { id: '26', z: 45, kind: 'brake', label: '2-6', drum: 'fixed', hub: 'th2', hubIn: 1.6, ly: -42 }
];
const GREY = 0x7d8086;
function buildRear3D(ctl) {
  const T3 = THREE, g = ctl.group, T = 6, { Z1, Z2, ZR, Zpl, Zps, nR } = PG, C = simpleColors();
  const cs = getComputedStyle(document.documentElement);
  C.s2 = cs.getPropertyValue('--s2').trim(); C.red = cs.getPropertyValue('--red').trim();
  const mat = (color, op) => new T3.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.5, transparent: op < 1, opacity: op });
  const dot = (color, r) => new T3.Mesh(new T3.SphereGeometry(r, 16, 12), new T3.MeshStandardMaterial({ color, roughness: 0.4 }));
  const o = { pairs: [], packs: [], C };
  // 앞층(z<0): 선기어1 + 짧은 피니언 / 뒤층(z>0): 선기어2 + 링기어 + 긴 피니언 (짧은 피니언은 두 층에 걸쳐 있음)
  o.s1 = new T3.Mesh(makeGearGeom(T3, Z1, Z1 / 2, T, false), mat(C.sun, 1)); o.s1.position.z = -3.5;
  let d = dot(0xffffff, 1.3); d.position.set(Z1 * 0.4, 0, -T / 2 - 0.2); o.s1.add(d);
  o.s2 = new T3.Mesh(makeGearGeom(T3, Z2, Z2 / 2, T, false), mat(C.s2, 1)); o.s2.position.z = 3.5;
  d = dot(0xffffff, 1.2); d.position.set(Z2 * 0.3, 0, -T / 2 - 0.2); o.s2.add(d);
  o.ring = new T3.Mesh(makeGearGeom(T3, ZR, ZR / 2, T, true, ZR / 2 + 6), mat(C.ring, 0.85)); o.ring.position.z = 3.5;
  const rm = new T3.Mesh(new T3.BoxGeometry(3, 3, 1.4), new T3.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })); rm.position.set(ZR / 2 + 6 - 1.2, 0, -T / 2 - 0.5); o.ring.add(rm);
  const sg = makeGearGeom(T3, Zps, Zps / 2, 13, false), lg = makeGearGeom(T3, Zpl, Zpl / 2, T, false);
  const pm = mat(C.pin, 1), am = mat(C.on, 1), rS3 = (Z1 + Zps) / 2, rL3 = (Z2 + Zpl) / 2;
  const armS = new T3.BoxGeometry(rS3, 2.6, 1.6), armL = new T3.BoxGeometry(rL3, 2.6, 1.6), cylG = new T3.CylinderGeometry(1, 1, 17, 16); cylG.rotateX(Math.PI / 2);
  for (let i = 0; i < nR; i++) {
    const P = {};
    P.s = new T3.Mesh(sg, pm); d = dot(0x222222, 1); d.position.set(Zps * 0.3, 0, -13 / 2 - 0.2); P.s.add(d); g.add(P.s);
    P.l = new T3.Mesh(lg, pm); P.l.position.z = 3.5; d = dot(0x222222, 1); d.position.set(Zpl * 0.3, 0, -T / 2 - 0.2); P.l.add(d); g.add(P.l);
    P.armS = new T3.Mesh(armS, am); P.armL = new T3.Mesh(armL, am); P.cS = new T3.Mesh(cylG, am); P.cL = new T3.Mesh(cylG, am);
    [P.armS, P.armL, P.cS, P.cL].forEach(m => g.add(m)); o.pairs.push(P);
  }
  const hub = new T3.Mesh(new T3.CylinderGeometry(5, 5, 1.6, 24), am); hub.rotation.x = Math.PI / 2; hub.position.z = 8.8; g.add(hub);
  g.add(o.s1); g.add(o.s2); g.add(o.ring);
  // 축: 선기어1 축(-z), 선기어2 축(+z), 캐리어 튜브(+z)
  const shaft = (r, z0, z1, open) => { const m = new T3.Mesh(new T3.CylinderGeometry(r, r, z1 - z0, 20, 1, !!open), new T3.MeshStandardMaterial({ color: GREY, metalness: 0.3, roughness: 0.5, transparent: !!open, opacity: open ? 0.5 : 1, side: open ? T3.DoubleSide : T3.FrontSide }));
    m.rotation.x = Math.PI / 2; m.position.z = (z0 + z1) / 2; g.add(m); return m; };
  o.sh1 = shaft(2.2, -26, -6.5); o.sh2 = shaft(1.6, 6.5, 49.5); o.shC = shaft(3.6, 9.6, 29, true);
  // 클러치·브레이크 팩
  const discTh = 0.7, cache = {};
  PACKS.forEach(pk => {
    const P = { def: pk, gap: 0.9, drums: [], hubs: [], color: new T3.Color(GREY), tgt: new T3.Color() };
    P.mat = new T3.MeshStandardMaterial({ color: GREY, metalness: 0.4, roughness: 0.5, emissive: 0x000000 });
    const dg = cache.d || (cache.d = ringGeom(T3, 26, 13, discTh)), hk = 'h' + pk.hubIn, hg = cache[hk] || (cache[hk] = ringGeom(T3, 20, pk.hubIn, discTh));
    for (let i = 0; i < 5; i++) {
      const drum = i % 2 === 0, m = new T3.Mesh(drum ? dg : hg, P.mat);
      const b = new T3.Mesh(new T3.BoxGeometry(2.6, 2.6, 1.2), new T3.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })); b.position.set(drum ? 24 : 18, 0, -discTh / 2 - 0.3); m.add(b);
      g.add(m); (drum ? P.drums : P.hubs).push(m);
    }
    P.shell = new T3.Mesh(new T3.CylinderGeometry(27, 27, 7, 32, 1, true), new T3.MeshStandardMaterial({ color: GREY, transparent: true, opacity: 0.22, side: T3.DoubleSide, metalness: 0.2, roughness: 0.6 }));
    P.shell.rotation.x = Math.PI / 2; P.shell.position.z = pk.z;
    if (pk.kind === 'brake') {           // 고정된 케이스 돌기 3개
      const lm = new T3.MeshStandardMaterial({ color: 0xb0b3b8, roughness: 0.5 }), lgm = new T3.BoxGeometry(3.4, 3.4, 6);
      for (let k = 0; k < 3; k++) { const l = new T3.Mesh(lgm, lm), a = k * TAU / 3; l.position.set(Math.cos(a) * 28.5, Math.sin(a) * 28.5, pk.z); l.rotation.z = a; g.add(l); }
    } else {                             // 회전하는 드럼 표시
      const mk = new T3.Mesh(new T3.BoxGeometry(3.4, 6, 3.4), new T3.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })); mk.position.set(27.5, 0, 0); P.shell.add(mk);
    }
    g.add(P.shell);
    const sp = labelSprite(pk.label); sp.position.set(0, pk.ly, pk.z); g.add(sp); P.label = sp;
    o.packs.push(P);
  });
  return o;
}
function updateRear3D(ctl, o) {
  const has = id => lastActive.includes(id), C = o.C, T3 = THREE, n = PG.nR;
  const on = { UD: has('UD'), OD: has('OD'), LR: has('LR') || has('OWC'), '35R': has('35R'), '26': has('26') };
  const S = (PG.Z1 + PG.Zps) / 2, L = (PG.Z2 + PG.Zpl) / 2;
  o.s1.rotation.z = vis.th1; o.s2.rotation.z = vis.th2; o.ring.rotation.z = vis.thR;
  for (let i = 0; i < n; i++) {
    const P = o.pairs[i], al = vis.thCR + i * TAU / n, as = al + phi;
    const ths = meshPlanet(vis.th1, PG.Z1, as, PG.Zps), thl = meshPlanet(ths, PG.Zps, gam0 + al, PG.Zpl);
    P.s.position.set(S * Math.cos(as), S * Math.sin(as), 0); P.s.rotation.z = ths;
    P.l.position.x = L * Math.cos(al); P.l.position.y = L * Math.sin(al); P.l.rotation.z = thl;
    P.cS.position.set(S * Math.cos(as), S * Math.sin(as), 1.1); P.cL.position.set(L * Math.cos(al), L * Math.sin(al), 1.1);
    P.armS.position.set(S / 2 * Math.cos(as), S / 2 * Math.sin(as), 8.8); P.armS.rotation.z = as;
    P.armL.position.set(L / 2 * Math.cos(al), L / 2 * Math.sin(al), 8.8); P.armL.rotation.z = al;
  }
  const a = 1 - Math.exp(-FRAME_DT / 0.12), th = 0.7;
  o.packs.forEach(P => {
    const pk = P.def, eng = on[pk.id];
    P.gap += ((eng ? 0.05 : 0.9) - P.gap) * a;
    P.tgt.set(eng ? (pk.kind === 'brake' ? C.red : C.on) : GREY); P.mat.color.lerp(P.tgt, a); P.mat.emissive.copy(P.mat.color).multiplyScalar(eng ? 0.3 : 0);
    P.shell.material.color.copy(P.mat.color);
    const dAng = pk.drum === 'slow' ? vis.thC : pk.drum === 'in' ? vis.thS : 0, hAng = vis[pk.hub];
    for (let i = 0; i < 5; i++) {
      const drum = i % 2 === 0, m = drum ? P.drums[i / 2] : P.hubs[(i - 1) / 2];
      m.position.z = pk.z + (i - 2) * (th + P.gap); m.rotation.z = drum ? dAng : hAng;
    }
    if (pk.kind === 'clutch') P.shell.rotation.y = dAng;
  });
  // 팩은 기어 세트 뒤에 있어 정면에 가까울수록 라벨이 한데 몰리므로, 축에서 벗어난 정도에 따라 라벨을 흐리게 한다.
  const cd = ctl.camera.position.clone().sub(ctl.controls.target), off = Math.hypot(cd.x, cd.y) / cd.length();
  const lo = Math.min(1, Math.max(0, (off - 0.35) / 0.25));
  o.packs.forEach(P => { P.label.material.opacity = lo; P.label.visible = lo > 0.01; });
  const col = (m, c) => { m.material.color.lerp(new T3.Color(c), a); };
  col(o.sh1, on.UD ? C.on : GREY); col(o.sh2, on['35R'] ? C.on : on['26'] ? C.red : GREY); col(o.shC, on.OD ? C.on : on.LR ? C.red : GREY);
}

// 컨트롤러: 실험실(L) · 앞 유성기어(F) · 뒤 유성기어(R)
const ctlL = makeCtl({ name: 'L', seg: 'labView', cv2: 'labCv2', cv3: 'labCv3', box: 'lab3d', tools: 'lab3dTools', msg: 'lab3dMsg',
  key3: () => [lab.Zs, lab.Zp, lab.n, lab.fixed].join('|'), camD: () => (labZr() / 2 + 6) * 3.8,
  build: c => buildSimple3D(c, { Zs: lab.Zs, Zp: lab.Zp, Zr: labZr(), n: lab.n, fixed: lab.fixed }),
  update: (c, o) => updateSimple3D(o, { Zs: lab.Zs, Zp: lab.Zp, n: lab.n }, { thS: lab.thS, thC: lab.thC, thR: lab.thR }) });
const ctlF = makeCtl({ name: 'F', seg: 'viewF', cv2: 'cv2F', cv3: 'cv3F', box: 'box3F', tools: 'tools3F', msg: 'msg3F',
  key3: () => [PG.Zs, PG.Zp, PG.nF].join('|'), camD: () => (PG.Zr / 2 + 6) * 3.8,
  build: c => buildSimple3D(c, { Zs: PG.Zs, Zp: PG.Zp, Zr: PG.Zr, n: PG.nF, fixed: 'ring' }),
  update: (c, o) => updateSimple3D(o, { Zs: PG.Zs, Zp: PG.Zp, n: PG.nF }, { thS: vis.thS, thC: vis.thC, thR: ringF0 }) });
const ctlR = makeCtl({ name: 'R', seg: 'viewR', cv2: 'cv2R', cv3: 'cv3R', box: 'box3R', tools: 'tools3R', msg: 'msg3R', targetZ: 11,
  key3: () => [PG.Z1, PG.Z2, PG.ZR, PG.Zpl, PG.Zps, PG.nR].join('|'), camD: () => (PG.ZR / 2 + 6) * 3.7,
  build: c => buildRear3D(c), update: (c, o) => updateRear3D(c, o) });

// ---- 변속기 단면 3D (실물 근사) ----
// 공개 단면도의 배치를 참고한 근사 모델. 움직임(각도)은 원리 모델과 같은 vis.*를 쓴다. 앞(엔진 쪽)이 −z.
const TR = { ready: false, loading: false, visible: false, key: '', obj: null, size: 0, caseMode: 'cut', colorMode: 'real', labels: true, oil: false };
const HELIX = Math.tan(20 * Math.PI / 180);               // 비틀림각 20°
// 헬리컬 기어: 둥근 치형을 밀어낸 뒤 z에 비례해 비튼다. 비틀림 = hand·tanβ·z / 피치 반지름
// 맞물리는 바깥 기어끼리는 방향이 반대, 링기어는 맞물리는 피니언과 같은 방향
function helGear(T3, Z, r, thick, hand, internal, rimOut, bore) {
  const p = 2 * Math.PI / Z, pts = [];
  const prof = internal
    ? [[-0.34, r + 1.25], [-0.26, r + 0.35], [-0.17, r - 0.6], [-0.10, r - 1], [0.10, r - 1], [0.17, r - 0.6], [0.26, r + 0.35], [0.34, r + 1.25]]
    : [[-0.34, r - 1.25], [-0.26, r - 0.35], [-0.17, r + 0.6], [-0.10, r + 1], [0.10, r + 1], [0.17, r + 0.6], [0.26, r - 0.35], [0.34, r - 1.25]];
  for (let k = 0; k < Z; k++) for (const [f, rad] of prof) { const a = (k + f) * p; pts.push(new T3.Vector2(Math.cos(a) * rad, Math.sin(a) * rad)); }
  let shape;
  if (internal) { shape = new T3.Shape(); shape.absarc(0, 0, rimOut, 0, TAU, false); shape.holes.push(new T3.Path(pts)); }
  else { shape = new T3.Shape(pts); if (bore) { const h = new T3.Path(); h.absarc(0, 0, bore, 0, TAU, true); shape.holes.push(h); } }
  const g = new T3.ExtrudeGeometry(shape, { depth: thick, steps: Math.max(4, Math.round(thick / 1.2)), bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -thick / 2);
  const P = g.attributes.position, k = hand * HELIX / r;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), a = k * P.getZ(i), c = Math.cos(a), s = Math.sin(a); P.setXY(i, x * c - y * s, x * s + y * c); }
  g.computeVertexNormals();
  return g;
}
// 링 모양 판(구멍 뚫린 원판)
function annulus(T3, ro, ri, th, segs) {
  const sh = new T3.Shape(); sh.absarc(0, 0, ro, 0, TAU, false);
  if (ri > 0) { const h = new T3.Path(); h.absarc(0, 0, ri, 0, TAU, true); sh.holes.push(h); }
  const g = new T3.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: segs || 48 }); g.translate(0, 0, -th / 2); return g;
}
// 캐리어 판: 피니언 사이에 창이 뚫린 원판
function carrierPlate(T3, ro, ri, th, n, offset) {
  const sh = new T3.Shape(); sh.absarc(0, 0, ro, 0, TAU, false);
  const h = new T3.Path(); h.absarc(0, 0, ri, 0, TAU, true); sh.holes.push(h);
  const mid = (ro + ri) / 2, wr = (ro - ri) * 0.3;
  for (let i = 0; i < n; i++) { const a = (i + 0.5) * TAU / n + (offset || 0), w = new T3.Path(); w.absarc(Math.cos(a) * mid, Math.sin(a) * mid, wr, 0, TAU, true); sh.holes.push(w); }
  const g = new T3.ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 1, curveSegments: 40 }); g.translate(0, 0, -th / 2); return g;
}
function put(parent, m, z) { m.position.z = z; parent.add(m); return m; }
function tube(T3, r, z0, z1, mat, open) {                  // z축 방향 원통
  const m = new T3.Mesh(new T3.CylinderGeometry(r, r, z1 - z0, 32, 1, !!open), mat); m.rotation.x = Math.PI / 2; m.position.z = (z0 + z1) / 2; return m;
}
// 배치(z): 오일 펌프 → 앞 유성기어 → UD → 뒤 라비뇨(+출력 기어) → L&R·2-6 브레이크 → OD·3-5/R 클러치
const TL = { lock: -107, tc: -90, pump: -68, front: -54, UD: -38, out: -19, rear: 0, LR: 17, B26: 30, OD: 41, R35: 52, end: 61, diff: -45 };
// 트랜스퍼 기어 축(cx, cy)과 차동기어 축(dx, dy): 출력 기어(r 62)–트랜스퍼(r 55) 중심거리 117, 종감속 피니언(r 10)–링(r 39.5) 49.5
// 카메라 쪽(−x)에 두어 비스듬히 볼 때 가려지지 않게 한다. 출력 기어→바퀴 감속비 = 110/124 × 79/20 = 3.504(공식 종감속 3.510)
const TD = (() => { const cx = -110, cy = Math.sqrt(117 * 117 - 110 * 110), dx = cx - 49.5 * 0.8, dy = cy + 49.5 * 0.6; return { cx, cy, dx, dy }; })();
const TPACKS = [
  { id: 'UD', z: TL.UD, ro: 30, ri: 20, kind: 'clutch', label: 'UD', drum: 'thC', hub: 'th1' },
  { id: 'LR', z: TL.LR, ro: 64, ri: 50, kind: 'brake', label: 'L&R', drum: null, hub: 'thCR' },
  { id: '26', z: TL.B26, ro: 64, ri: 50, kind: 'brake', label: '2-6', drum: null, hub: 'th2' },
  { id: 'OD', z: TL.OD, ro: 34, ri: 22, kind: 'clutch', label: 'OD', drum: 'thS', hub: 'thCR' },
  { id: '35R', z: TL.R35, ro: 34, ri: 22, kind: 'clutch', label: '3-5/R', drum: 'thS', hub: 'th2' }
];
function transMats(T3) {
  const st = (c, o) => new T3.MeshStandardMaterial(Object.assign({ color: c, metalness: 0.8, roughness: 0.34, envMapIntensity: 0.9 }, o));
  return {
    steel: st(0x9fa4ab), dark: st(0x6c7077, { roughness: 0.45 }), shaft: st(0xa9aeb5, { roughness: 0.25 }),
    alu: new T3.MeshStandardMaterial({ color: 0x8f949b, metalness: 0.3, roughness: 0.6, side: T3.DoubleSide, envMapIntensity: 0.7 }),
    aluCut: new T3.MeshStandardMaterial({ color: 0xc4c8cd, metalness: 0.1, roughness: 0.8, side: T3.DoubleSide }),
    fric: (() => new T3.MeshStandardMaterial({ color: 0x6e5236, metalness: 0.1, roughness: 0.9 })),
    // 부품별 색 모드에서 바꿀 재질(입력, 선기어1, 선기어2, 앞 캐리어, 뒤 캐리어, 링/출력, 피니언)
    in: st(0xa9aeb5), s1: st(0xa9aeb5), s2: st(0xa9aeb5), carF: st(0xa9aeb5), carR: st(0xa9aeb5), ring: st(0xa9aeb5), pin: st(0xb7bbc1), ringF: st(0x8f949b)
  };
}
function setTransColors() {
  const M = TR.obj && TR.obj.M; if (!M) return;
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  const real = TR.colorMode === 'real';
  const set = (m, c) => { m.color.set(real ? 0xa9aeb5 : c); m.metalness = real ? 0.8 : 0.3; m.roughness = real ? 0.34 : 0.5; };
  set(M.in, v('--accent')); set(M.s1, v('--accent')); set(M.s2, v('--s2')); set(M.carF, v('--on')); set(M.carR, v('--on')); set(M.ring, '#aeb1b7'); set(M.pin, '#e9e9ea');
  M.ringF.color.set(real ? 0x8f949b : '#7d8086');
  TR.obj.clips.forEach(([b, m]) => { if (m !== TR.obj.packs.find(P => P.fm === m)?.fm) { m.color.copy(b.color); m.metalness = b.metalness; m.roughness = b.roughness; } });
}
// 단면 모드에서는 드럼·판·케이스 같은 껍데기를 카메라 쪽 절반(x<0)만큼 잘라 안을 보인다. 기어는 자르지 않는다
let TCLIP = null, TCLIP_D = null;
function buildTrans(ctl) {
  const T3 = THREE, g = ctl.group, M = transMats(T3), o = { M, packs: [], fp: [], rp: [], clips: [] };
  if (!TCLIP) TCLIP = [new T3.Plane(new T3.Vector3(1, 0, 0), 0)];
  TCLIP_D = [new T3.Plane(new T3.Vector3(1, 0, 0), -TD.dx)];   // 차동기어 케이스용
  ctl.renderer.localClippingEnabled = true;
  const C = base => { const m = base.clone(); m.side = T3.DoubleSide; m.clipIntersection = true; o.clips.push([base, m]); return m; };
  // 금속이 비치도록 간단한 환경맵(위는 밝고 아래는 어두운 방)
  if (!ctl.scene.environment) {
    const es = new T3.Scene(), sg = new T3.SphereGeometry(100, 32, 16), col = [];
    const P = sg.attributes.position; for (let i = 0; i < P.count; i++) { const t = (P.getY(i) / 100 + 1) / 2, c = 0.04 + 0.42 * t * t; col.push(c, c, c * 1.04); }
    sg.setAttribute('color', new T3.Float32BufferAttribute(col, 3));
    es.add(new T3.Mesh(sg, new T3.MeshBasicMaterial({ vertexColors: true, side: T3.BackSide })));
    [[60, 40, -30], [-50, 60, 40], [0, -70, 60]].forEach(p => { const b = new T3.Mesh(new T3.BoxGeometry(30, 30, 4), new T3.MeshBasicMaterial({ color: 0x9a9a9a })); b.position.set(...p); b.lookAt(0, 0, 0); es.add(b); });
    const pm = new T3.PMREMGenerator(ctl.renderer); ctl.scene.environment = pm.fromScene(es, 0.03).texture; pm.dispose();
  }
  const add = (m, parent) => { (parent || g).add(m); return m; };
  // 입력축(앞 유성기어 선기어, OD·3-5/R 드럼과 연결)
  o.inShaft = add(new T3.Group());
  o.inShaft.add(tube(T3, 3.2, -104, TL.end + 2, M.shaft));
  for (let i = 0; i < 12; i++) { const s = new T3.Mesh(new T3.BoxGeometry(0.7, 0.5, 10), M.shaft); const a = i * TAU / 12; s.position.set(Math.cos(a) * 3.3, Math.sin(a) * 3.3, TL.pump - 4); s.rotation.z = a; o.inShaft.add(s); }   // 스플라인
  // 오일 펌프(고정): 하우징 + 안쪽 기어
  add(new T3.Mesh(annulus(T3, 40, 4.5, 6), C(M.alu))).position.z = TL.pump;
  o.pumpGear = add(new T3.Mesh(helGear(T3, 18, 13, 4, 0, false, 0, 4), M.dark)); o.pumpGear.position.z = TL.pump - 4;
  // 앞 유성기어(선기어=입력, 링=케이스 고정, 캐리어=출력 → UD 드럼)
  { const T = 7, rc = (PG.Zs + PG.Zp) / 2;
    o.sunF = add(new T3.Mesh(helGear(T3, PG.Zs, PG.Zs / 2, T, 1, false, 0, 3.4), M.in)); o.sunF.position.z = TL.front;
    o.ringF = add(new T3.Mesh(helGear(T3, PG.Zr, PG.Zr / 2, T, -1, true, PG.Zr / 2 + 4), M.ringF)); o.ringF.position.z = TL.front;
    o.carF = add(new T3.Group()); o.carF.position.z = TL.front;
    const pg = helGear(T3, PG.Zp, PG.Zp / 2, T, -1, false), pinG = new T3.CylinderGeometry(0.9, 0.9, T + 5, 12); pinG.rotateX(Math.PI / 2);
    for (let i = 0; i < PG.nF; i++) { const a = i * TAU / PG.nF, m = new T3.Mesh(pg, M.pin); m.position.set(rc * Math.cos(a), rc * Math.sin(a), 0); o.carF.add(m); o.fp.push(m);
      const pin = new T3.Mesh(pinG, M.dark); pin.position.copy(m.position); o.carF.add(pin); }
    const pl = carrierPlate(T3, rc + PG.Zp / 2 + 1.5, 5, 1.6, PG.nF);
    const p1 = new T3.Mesh(pl, M.carF); p1.position.z = T / 2 + 1.6; o.carF.add(p1);
    // 캐리어 → UD 드럼으로 이어지는 원뿔 껍데기
    const z0 = T / 2 + 2.4, z1 = TL.UD - 5 - TL.front;        // 캐리어 그룹 안의 z
    const bell = new T3.Mesh(new T3.CylinderGeometry(31.5, rc + PG.Zp / 2 + 1.5, z1 - z0, 40, 1, true), C(M.carF)); bell.rotation.x = Math.PI / 2;
    bell.position.z = (z0 + z1) / 2; o.carF.add(bell);
  }
  // 뒤 라비뇨: 앞층(z<0) 선기어1 + 짧은 피니언, 뒤층(z>0) 선기어2 + 링기어 + 긴 피니언
  { const T = 6, { Z1, Z2, ZR, Zpl, Zps, nR } = PG, S = (Z1 + Zps) / 2, L = (Z2 + Zpl) / 2;
    o.s1 = add(new T3.Mesh(helGear(T3, Z1, Z1 / 2, T, 1, false, 0, 2.6), M.s1)); o.s1.position.z = TL.rear - 3.5;
    o.s2 = add(new T3.Mesh(helGear(T3, Z2, Z2 / 2, T, -1, false, 0, 4), M.s2)); o.s2.position.z = TL.rear + 3.5;
    o.ring = add(new T3.Group());
    put(o.ring, new T3.Mesh(helGear(T3, ZR, ZR / 2, T, 1, true, ZR / 2 + 3.5), M.ring), TL.rear + 3.5);
    // 링기어 → 출력 기어(헬리컬, 앞쪽): 이어 주는 껍데기
    const og = new T3.Mesh(helGear(T3, 124, 62, 7, -1, false, 0, ZR / 2 + 1), M.ring); og.position.z = TL.out; o.ring.add(og);
    const sh = new T3.Mesh(new T3.CylinderGeometry(ZR / 2 + 3.5, ZR / 2 + 3.5, TL.rear + 0.5 - (TL.out + 3.5), 64, 1, true), C(M.ring)); sh.rotation.x = Math.PI / 2; sh.position.z = (TL.rear + 0.5 + TL.out + 3.5) / 2; o.ring.add(sh);
    o.carR = add(new T3.Group()); o.carR.position.z = TL.rear;
    const sg = helGear(T3, Zps, Zps / 2, 13, -1, false), lg = helGear(T3, Zpl, Zpl / 2, T, 1, false), pinG = new T3.CylinderGeometry(0.8, 0.8, 19, 12); pinG.rotateX(Math.PI / 2);
    const pinLG = new T3.CylinderGeometry(0.8, 0.8, 10.2, 12); pinLG.rotateX(Math.PI / 2);
    for (let i = 0; i < nR; i++) {
      const al = i * TAU / nR, as = al + phi;
      const s = new T3.Mesh(sg, M.pin); s.position.set(S * Math.cos(as), S * Math.sin(as), 0); o.carR.add(s);
      const l = new T3.Mesh(lg, M.pin); l.position.set(L * Math.cos(al), L * Math.sin(al), 3.5); o.carR.add(l);
      const ps = new T3.Mesh(pinG, M.dark); ps.position.set(s.position.x, s.position.y, 0); o.carR.add(ps);
      const pl2 = new T3.Mesh(pinLG, M.dark); pl2.position.set(l.position.x, l.position.y, 5.1); o.carR.add(pl2);
      o.rp.push({ s, l, al, as });
    }
    const ro = L + Zpl / 2 + 1;
    put(o.carR, new T3.Mesh(carrierPlate(T3, ro, 6, 1.6, nR, phi / 2), M.carR), 10.2);                         // 뒤 판: 긴·짧은 피니언 모두
    put(o.carR, new T3.Mesh(carrierPlate(T3, S + Zps / 2 + 2.5, 6, 1.6, nR, phi / 2), M.carR), -10.2);        // 앞 판: 짧은 피니언만
    // 뒤 캐리어 → L&R 허브(바깥으로 뻗는 원판)·OD 허브(안쪽 관)
    const lz0 = 10.2, lz1 = TL.LR + 5 - TL.rear;                   // 뒤 판 가장자리에서 L&R 허브 드럼으로
    const cbell = new T3.Mesh(new T3.CylinderGeometry(50, 50, lz1 - lz0, 64, 1, true), C(M.carR)); cbell.rotation.x = Math.PI / 2; cbell.position.z = (lz0 + lz1) / 2; o.carR.add(cbell);
    o.carR.add(tube(T3, 5.5, 11, TL.OD - TL.rear + 4, M.carR));
    put(o.carR, new T3.Mesh(annulus(T3, 22, 5.5, 1.4), M.carR), TL.OD - TL.rear + 4);
  }
  // 선기어1 축: UD 허브까지 / 선기어2 축: 2-6 허브·3-5/R 허브까지
  o.sh1 = add(new T3.Group()); o.sh1.add(tube(T3, 4.6, TL.UD - 4, TL.rear - 6.5, M.s1)); put(o.sh1, new T3.Mesh(annulus(T3, 20, 4.6, 1.4), M.s1), TL.UD - 4);
  o.sh2 = add(new T3.Group()); o.sh2.add(tube(T3, 4.2, TL.rear + 6.5, TL.R35 + 4, M.s2, true));
  put(o.sh2, new T3.Mesh(annulus(T3, 50, 6, 1.4), M.s2), TL.B26 - 5.5);
  const b26 = new T3.Mesh(new T3.CylinderGeometry(50, 50, 11, 64, 1, true), C(M.s2)); b26.rotation.x = Math.PI / 2; b26.position.z = TL.B26; o.sh2.add(b26);
  put(o.sh2, new T3.Mesh(annulus(T3, 22, 4.2, 1.4), M.s2), TL.R35 + 4);
  // 입력 드럼(OD·3-5/R 바깥 드럼, 맨 뒤에서 입력축과 연결)
  o.inDrum = add(new T3.Group());
  const inC = C(M.in), idr = new T3.Mesh(new T3.CylinderGeometry(36, 36, TL.end - TL.OD + 6, 64, 1, true), inC); idr.rotation.x = Math.PI / 2; idr.position.z = (TL.end + TL.OD - 6) / 2; o.inDrum.add(idr);
  put(o.inDrum, new T3.Mesh(annulus(T3, 36, 3.2, 1.6), inC), TL.end);
  for (let i = 0; i < 8; i++) { const k = new T3.Mesh(new T3.BoxGeometry(2, 2, TL.end - TL.OD + 6), inC), a = i * TAU / 8; k.position.set(Math.cos(a) * 36.5, Math.sin(a) * 36.5, (TL.end + TL.OD - 6) / 2); o.inDrum.add(k); }
  // UD 드럼(앞 캐리어와 함께 돈다)
  const udr = new T3.Mesh(new T3.CylinderGeometry(31.5, 31.5, 10, 64, 1, true), C(M.carF)); udr.rotation.x = Math.PI / 2; udr.position.z = TL.UD; o.carF.add(udr); udr.position.z = TL.UD - TL.front;
  // 클러치·브레이크 팩: 강철판(바깥 돌기 → 드럼)과 마찰판(안쪽 → 허브)이 번갈아, 앞쪽에 피스톤
  TPACKS.forEach(pk => {
    const P = { def: pk, gap: 0.9, steel: [], fric: [], fm: C(M.fric()), pistonX: 0 };
    const stC = C(M.steel), dkC = C(M.dark);
    const sG = annulus(T3, pk.ro, pk.ri + 2.5, 0.7, 64), fG = annulus(T3, pk.ro - 2, pk.ri, 0.9, 64), lugG = new T3.BoxGeometry(2.4, 2.2, 0.7), grvG = new T3.BoxGeometry((pk.ro - 2 - pk.ri) * 0.9, 0.35, 0.95);
    for (let i = 0; i < 4; i++) { const s = new T3.Group(); s.add(new T3.Mesh(sG, stC));
      for (let k = 0; k < 6; k++) { const l = new T3.Mesh(lugG, stC), a = k * TAU / 6; l.position.set(Math.cos(a) * (pk.ro + 0.9), Math.sin(a) * (pk.ro + 0.9), 0); l.rotation.z = a; s.add(l); }
      g.add(s); P.steel.push(s); }
    for (let i = 0; i < 3; i++) { const f = new T3.Group(); f.add(new T3.Mesh(fG, P.fm));
      for (let k = 0; k < 10; k++) { const r = new T3.Mesh(grvG, dkC), a = k * TAU / 10; r.position.set(Math.cos(a) * (pk.ro - 2 + pk.ri) / 2, Math.sin(a) * (pk.ro - 2 + pk.ri) / 2, 0); r.rotation.z = a; f.add(r); }
      g.add(f); P.fric.push(f); }
    P.piston = add(new T3.Mesh(annulus(T3, pk.ro + 0.5, pk.ri + 1, 2.2), C(pk.kind === 'brake' ? M.alu : M.dark)));
    if (pk.kind === 'brake') {           // 브레이크: 케이스에 붙은 고정 링과 돌기
      const ringC = add(new T3.Mesh(new T3.CylinderGeometry(pk.ro + 2.6, pk.ro + 2.6, 10, 64, 1, true), C(M.alu))); ringC.rotation.x = Math.PI / 2; ringC.position.z = pk.z;
    } else {                             // 클러치 허브(안쪽, 허브 쪽 요소와 함께 돈다)
      P.hubM = add(new T3.Mesh(new T3.CylinderGeometry(pk.ri - 0.3, pk.ri - 0.3, 9, 48, 1, true), C(pk.hub === 'th1' ? M.s1 : pk.hub === 'th2' ? M.s2 : M.carR))); P.hubM.rotation.x = Math.PI / 2; P.hubM.position.z = pk.z;
    }
    P.label = transLabel(pk.label); g.add(P.label); placeLabel(P.label, pk.ro, pk.z, g);
    o.packs.push(P);
  });
  // ---- 토크 컨버터(앞, 엔진 쪽): 커버·펌프는 엔진과, 터빈은 입력축과 함께 돈다. 스테이터는 원웨이 클러치 위 ----
  { const lz = (pts, mat, segs) => { const v = pts.map(([r, z]) => new T3.Vector2(r, z)); const lg = new T3.LatheGeometry(v, segs || 72); lg.rotateX(Math.PI / 2); return new T3.Mesh(lg, mat); };
    const shell = (pts, th) => pts.concat(pts.slice().reverse().map(([r, z]) => [r + th * 0.7, z + (z < TL.tc ? -th : th)]));
    o.tcEng = add(new T3.Group()); o.tcTurb = add(new T3.Group()); o.tcStat = add(new T3.Group()); o.tcLock = add(new T3.Group());
    const cov = C(M.steel), pumpM = C(M.in), turbM = C(M.s2), statM = M.dark, vaneM = M.steel;
    // 커버(앞 껍데기)와 펌프 껍데기(뒤): 엔진 속도
    o.tcEng.add(lz(shell([[9, -114], [56, -114], [70, -111], [78, -104], [80, -96], [80, -90]], 2), cov));
    o.tcEng.add(lz(shell([[80, -90], [78, -83], [70, -78], [54, -75.5], [16, -75]], 2), pumpM));
    o.tcEng.add(tube(T3, 8.5, -75, TL.pump - 2, pumpM));                                       // 펌프 허브 → 오일 펌프 구동
    for (let i = 0; i < 6; i++) { const b = new T3.Mesh(new T3.CylinderGeometry(2.2, 2.2, 4, 10), cov), a = i * TAU / 6; b.rotation.x = Math.PI / 2; b.position.set(Math.cos(a) * 64, Math.sin(a) * 64, -117); o.tcEng.add(b); }  // 플렉스플레이트 볼트
    // 날개: 펌프(뒤쪽 반원), 터빈(앞쪽 반원). 반지름 방향 판을 조금 기울여 배치
    const vane = (z0, z1, r0, r1, n, tilt, mat, grp) => { const geo = new T3.BoxGeometry(r1 - r0, 0.35, z1 - z0);
      for (let i = 0; i < n; i++) { const m = new T3.Mesh(geo, mat), a = i * TAU / n; m.position.set(Math.cos(a) * (r0 + r1) / 2, Math.sin(a) * (r0 + r1) / 2, (z0 + z1) / 2); m.rotation.set(0, 0, a + tilt); grp.add(m); } };
    vane(-87, -80, 48, 75, 30, 0.18, vaneM, o.tcEng);
    o.tcTurb.add(lz(shell([[76, -95], [72, -101], [58, -104], [34, -104], [26, -101]], 1.6), turbM));
    vane(-101, -94, 44, 74, 28, -0.18, M.dark, o.tcTurb);
    o.tcTurb.add(tube(T3, 4.2, -104, -76, turbM));                                            // 터빈 허브 → 입력축 스플라인
    put(o.tcTurb, new T3.Mesh(annulus(T3, 26, 4.2, 2), turbM), -102);
    // 스테이터: 펌프와 터빈 사이 안쪽, 원웨이 클러치로 한쪽으로만 돈다
    put(o.tcStat, new T3.Mesh(annulus(T3, 40, 26, 6), statM), -90);
    vane(-93, -87, 26, 40, 14, 0.8, statM, o.tcStat);
    add(tube(T3, 6.5, -88, -72, M.dark));                                                    // 스테이터 지지축(고정)
    // 록업 클러치: 터빈과 함께 도는 피스톤 판, 붙으면 커버에 밀착
    o.lockFric = C(M.fric());
    o.tcLock.add(new T3.Mesh(annulus(T3, 70, 12, 1.4), turbM));
    put(o.tcLock, new T3.Mesh(annulus(T3, 70, 52, 0.9), o.lockFric), -0.9);
    o.lockGap = 2;
  }
  // ---- 트랜스퍼 기어 → 종감속 기어 → 차동기어 → 구동축 ----
  { const Zo = 124, Zd = 110, Zp = 20, Zr = 79, aC = Math.atan2(TD.cy, TD.cx);
    o.cs = add(new T3.Group()); o.cs.position.set(TD.cx, TD.cy, 0);
    o.csDriven = new T3.Mesh(helGear(T3, Zd, Zd / 2, 7, 1, false, 0, 5), M.ring); o.csDriven.position.z = TL.out; o.cs.add(o.csDriven);
    o.csPin = new T3.Mesh(helGear(T3, Zp, Zp / 2, 9, 1, false, 0, 3), M.ring); o.csPin.position.z = TL.diff; o.cs.add(o.csPin);
    o.cs.add(tube(T3, 5, TL.diff - 6, TL.out + 5, M.shaft));
    o.df = add(new T3.Group()); o.df.position.set(TD.dx, TD.dy, 0);
    o.dfRing = new T3.Mesh(helGear(T3, Zr, Zr / 2, 9, -1, false, 0, 22), M.ring); o.dfRing.position.z = TL.diff; o.df.add(o.dfRing);
    // 차동기어 케이스(단면에서는 카메라 쪽 1/4을 잘라 안을 보인다)
    const dcM = C(M.dark); o.dcM = dcM;
    [-1, 1].forEach(sd => {                                      // 링기어 양쪽의 종 모양 케이스 두 짝
      const dpts = [[22, 4.5], [24, 12], [20, 20], [8, 24], [8, 30]].map(([r, z]) => new T3.Vector2(r, TL.diff + sd * z));
      const dl = new T3.LatheGeometry(sd > 0 ? dpts : dpts.reverse(), 48); dl.rotateX(Math.PI / 2); o.df.add(new T3.Mesh(dl, dcM)); });
    // 베벨 기어: 원뿔에 이 모양 주름을 준다
    const bevel = (Z, r0, r1, h) => { const gg = new T3.CylinderGeometry(r0, r1, h, Z * 2, 1); const P = gg.attributes.position;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i), r = Math.hypot(x, z); if (r < 0.01) continue; const a = Math.atan2(z, x), k = Math.round(a / (TAU / (Z * 2))) % 2 ? 0.9 : 1.04; P.setX(i, x * k); P.setZ(i, z * k); }
      gg.computeVertexNormals(); return gg; };
    o.sideL = new T3.Group(); o.sideR = new T3.Group(); o.df.add(o.sideL); o.df.add(o.sideR);
    const sg = bevel(16, 9, 15, 6); sg.rotateX(Math.PI / 2);
    const sL = new T3.Mesh(sg, M.steel); sL.position.z = TL.diff - 11; o.sideL.add(sL);
    const sR = new T3.Mesh(sg.clone().rotateX(Math.PI), M.steel); sR.position.z = TL.diff + 11; o.sideR.add(sR);
    o.cross = new T3.Group(); o.cross.position.z = TL.diff; o.df.add(o.cross);
    const pinX = new T3.Mesh(new T3.CylinderGeometry(1.8, 1.8, 40, 12), M.shaft); o.cross.add(pinX);   // 십자축(케이스와 함께 돈다)
    const pg = bevel(10, 5, 9, 5);
    o.dpins = [-1, 1].map(s => { const h = new T3.Group(), m = new T3.Mesh(pg, M.steel); h.position.y = s * 13; if (s > 0) h.rotation.z = Math.PI; h.add(m); o.cross.add(h); return m; });   // 좁은 쪽이 가운데를 향함, 자기 축으로 자전
    // 구동축(왼쪽·오른쪽 바퀴로)과 등속 조인트
    [[TL.diff - 12, -150, o.sideL], [TL.diff + 12, 95, o.sideR]].forEach(([z0, z1, grp]) => {
      grp.add(tube(T3, 3.4, Math.min(z0, z1), Math.max(z0, z1), M.shaft));
      const j = new T3.Mesh(new T3.SphereGeometry(8, 20, 14), M.dark); j.position.z = z1; grp.add(j);
      for (let k = 0; k < 6; k++) { const s = new T3.Mesh(new T3.BoxGeometry(1.2, 0.8, 10), M.shaft), a = k * TAU / 6; s.position.set(Math.cos(a) * 3.6, Math.sin(a) * 3.6, z1 + (z1 > 0 ? -12 : 12)); s.rotation.z = a; grp.add(s); }   // 스플라인
    });
    o.gear = { Zo, Zd, Zp, Zr, aC, aD: Math.atan2(TD.dy - TD.cy, TD.dx - TD.cx) };
  }
  // 그 밖의 이름표
  [['록업 클러치', TL.lock, 70], ['토크 컨버터', TL.tc, 80], ['오일 펌프', TL.pump, 40], ['앞 유성기어', TL.front, PG.Zr / 2 + 4], ['라비뇨 유성기어', TL.rear + 3, PG.ZR / 2 + 3.5], ['출력 기어', TL.out, 63]].forEach(([t, z, r]) => {
    const sp = transLabel(t); g.add(sp); placeLabel(sp, r, z, g); (o.labels = o.labels || []).push(sp); });
  // 축 밖에 있는 부품: 각자의 중심에서 아래쪽(+y)으로 이름표
  // [글자, z, 부품 위 점(x, y), 이름표 위치(x, y)]
  [['트랜스퍼 기어', TL.out, [TD.cx - 55, TD.cy], [TD.cx - 92, TD.cy - 18]], ['종감속·차동기어', TL.diff, [TD.dx, TD.dy + 40], [TD.dx, TD.dy + 62]], ['구동축 (바퀴로)', 80, [TD.dx, TD.dy + 8], [TD.dx, TD.dy + 62]]].forEach(([t, z, pt, lp]) => {
    const sp = transLabel(t); g.add(sp); placeLabel(sp, 0, z, g, { pt, lp }); (o.labels = o.labels || []).push(sp); });
  // 케이스: 단면 프로필을 180°만 돌려 카메라 쪽 절반을 잘라 낸 알루미늄 껍데기
  const prof = [[88, -121], [88, -76], [44, TL.pump - 6], [PG.Zr / 2 + 7, TL.front - 8], [PG.Zr / 2 + 7, TL.out - 9], [70, TL.out - 7], [70, TL.B26 + 6], [42, TL.OD - 3], [42, TL.end + 3], [8, TL.end + 5]];
  const inner = prof.map(([r, z]) => new T3.Vector2(r, z)), outer = prof.slice().reverse().map(([r, z]) => new T3.Vector2(r + 2.5, z));
  const lathe = (phiStart, len, mat) => { const lg = new T3.LatheGeometry(inner.concat(outer, [inner[0]]), 72, phiStart, len); lg.rotateX(Math.PI / 2); const m = new T3.Mesh(lg, mat); g.add(m); return m; };
  o.caseCut = lathe(0, Math.PI, M.alu); o.caseFull = lathe(0, TAU, new T3.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.4, roughness: 0.6, transparent: true, opacity: 0.18, depthWrite: false, side: T3.DoubleSide }));
  // 잘린 단면(두 장): 밝은 색으로 칠해 단면임을 보이게
  const cutShape = new T3.Shape(inner.concat(outer).map(v => new T3.Vector2(v.x, v.y)));
  [0, Math.PI].forEach(a => { const cg = new T3.ShapeGeometry(cutShape); const m = new T3.Mesh(cg, M.aluCut); m.rotation.order = 'ZXY';
    // 프로필 평면(x=r, y=z)을 케이스 각도 a에 맞춰 세운다: lathe의 각 φ에서 점 = (r sinφ, −r cosφ, z)
    const grp = new T3.Group(); m.rotation.x = Math.PI / 2; grp.add(m); grp.rotation.z = a - Math.PI / 2; o.caseCut.add(grp); });
  buildOil(o, g);
  applyCaseMode(o); setTimeout(setTransColors);
  return o;
}
// ---- 오일 흐름: 오일 펌프 → (클러치는 축 속 유로 / 브레이크는 케이스 유로) → 피스톤. 작동 중인 요소로 가는 길에만 점이 흐른다 ----
function buildOil(o, g) {
  const T3 = THREE, k = Math.SQRT1_2, at = (r, z) => new T3.Vector3(-k * r, -k * r, z);   // 잘라 낸 쪽(카메라 쪽)에 그린다
  const paths = TPACKS.map(pk => ({ id: pk.id, pts: pk.kind === 'brake'
    ? [at(30, TL.pump), at(76, TL.pump + 4), at(76, pk.z - 7), at(pk.ro, pk.z - 7)]
    : [at(30, TL.pump), at(5, TL.pump + 3), at(5, pk.z - 7), at(pk.ri + 4, pk.z - 7)] }));
  paths.push({ id: 'LOCK', pts: [at(30, TL.pump), at(5, TL.pump - 3), at(5, -109), at(55, -109)] });
  const dotG = new T3.SphereGeometry(1.3, 10, 8), dotM = new T3.MeshBasicMaterial({ color: 0xf2b233 });
  const lineM = new T3.LineBasicMaterial({ color: 0xf2b233, transparent: true, opacity: 0.35 });
  o.oil = paths.map(P => {
    const curve = new T3.CurvePath(); for (let i = 1; i < P.pts.length; i++) curve.add(new T3.LineCurve3(P.pts[i - 1], P.pts[i]));
    const line = new T3.Line(new T3.BufferGeometry().setFromPoints(P.pts), lineM); g.add(line);
    const dots = []; for (let i = 0; i < 7; i++) { const d = new T3.Mesh(dotG, dotM); g.add(d); dots.push(d); }
    return { id: P.id, curve, line, dots, t: 0 };
  });
}
function updateOil(o, lev) {
  o.oil.forEach(P => {
    const lv = P.id === 'LOCK' ? (sim.tc.lock ? 1 : 0) : lev(P.id), show = TR.oil && lv > 0.05;
    P.line.visible = show; P.dots.forEach(d => { d.visible = show; });
    if (!show) return;
    P.t = (P.t + FRAME_DT * 0.35) % 1;
    P.dots.forEach((d, i) => { d.position.copy(P.curve.getPointAt((P.t + i / P.dots.length) % 1)); d.scale.setScalar(0.6 + 0.6 * lv); });
  });
}
// 이름표: 잘라 낸 쪽(−x, −y 방향)으로 부품 바깥에 둔다. z 순서대로 거리를 번갈아 겹침을 줄인다
function transLabel(text) {                               // 글자 길이에 맞춘 이름표
  const m = document.createElement('canvas').getContext('2d'); m.font = '600 40px sans-serif';
  const w = Math.ceil(m.measureText(text).width) + 36, cv = document.createElement('canvas'); cv.width = w; cv.height = 64;
  const c = cv.getContext('2d'); c.fillStyle = 'rgba(20,21,24,0.82)';
  if (c.roundRect) { c.beginPath(); c.roundRect(0, 0, w, 64, 14); c.fill(); } else c.fillRect(0, 0, w, 64);
  c.font = '600 40px sans-serif'; c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, 34);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
  sp.scale.set(w / 64 * 6.5, 6.5, 1); sp.renderOrder = 10; return sp;
}
// 축을 따라 부품이 촘촘하므로, z 순서대로 위·아래 줄에 번갈아 두고 가는 선으로 부품과 잇는다
function placeLabel(sp, r, z, g, opt) {
  const order = [TL.lock, TL.tc, TL.pump, TL.front, TL.UD, TL.out, TL.rear + 3, TL.LR, TL.B26, TL.OD, TL.R35].indexOf(z);
  const up = order % 2 === 0, y = up ? -96 : 96;            // 화면 위쪽이 −y
  const lp = opt && opt.lp ? opt.lp : [0, y], pt = opt && opt.pt ? opt.pt : [0, up ? -r : r];   // 이름표 위치, 선이 닿는 부품 위 점
  sp.position.set(lp[0], lp[1], z);
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(lp[0], lp[1], z), new THREE.Vector3(pt[0], pt[1], z)]);
  const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xb0b4ba, transparent: true, opacity: 0.8, depthTest: false }));
  ln.renderOrder = 9; g.add(ln); sp.userData.line = ln;
}
function applyCaseMode(o) {
  o = o || TR.obj; if (!o) return;
  o.caseCut.visible = TR.caseMode === 'cut'; o.caseFull.visible = TR.caseMode === 'ghost';
  o.clips.forEach(([, m]) => { m.clippingPlanes = TR.caseMode === 'cut' ? (m === o.dcM ? TCLIP_D : TCLIP) : null; m.needsUpdate = true; });
}
function updateTrans(ctl, o) {
  const LV = engageLevels(), lev = id => id === 'LR' ? Math.max(LV.LR || 0, LV.OWC || 0) : (LV[id] || 0);
  o.inShaft.rotation.z = vis.thS; o.inDrum.rotation.z = vis.thS; o.sunF.rotation.z = vis.thS; o.ringF.rotation.z = ringF0;
  o.carF.rotation.z = vis.thC;
  // 토크 컨버터: 펌프는 엔진 속도(같은 배율로 늦춤), 터빈은 입력축, 스테이터는 토크 증대 중엔 멈추고 결합 구간에선 함께 돈다
  TR.thP = (TR.thP || 0) + sim.we * FRAME_DT * vis.slow;
  if (sim.tc.lock || sim.tc.sr > 0.85) TR.thSt = (TR.thSt || 0) + vis.win * FRAME_DT * vis.slow * 0.97;
  o.tcEng.rotation.z = TR.thP; o.pumpGear.rotation.z = TR.thP; o.tcTurb.rotation.z = vis.thS; o.tcStat.rotation.z = TR.thSt || 0;
  o.lockGap += ((sim.tc.lock ? 0.05 : 2) - o.lockGap) * (1 - Math.exp(-FRAME_DT / 0.12));
  o.tcLock.position.z = -110.4 + o.lockGap;            // 커버 안쪽면(−112) 바로 뒤. 붙으면 틈 0 o.tcLock.rotation.z = sim.tc.lock ? TR.thP : vis.thS;
  o.lockFric.emissive.set(sim.tc.lock ? getComputedStyle(document.documentElement).getPropertyValue('--on').trim() : '#000000'); o.lockFric.emissiveIntensity = 0.55;
  // 출력 기어(링) → 트랜스퍼 → 종감속 피니언 → 차동기어 링: 바깥 기어 맞물림 위상은 meshPlanet으로
  const G = o.gear, thCs = meshPlanet(vis.thR, G.Zo, G.aC, G.Zd);
  o.csDriven.rotation.z = thCs; o.csPin.rotation.z = thCs * G.Zd / G.Zd;
  const thD = meshPlanet(thCs, G.Zp, G.aD, G.Zr);
  // 핸들을 꺾으면 바깥 바퀴가 빠르고 안쪽이 느리다: 사이드 기어가 케이스보다 ±Δ만큼 더/덜 돌고, 피니언이 그 차이로 자전한다
  const k = STEER.k, dTh = thD - (o.prevD === undefined ? thD : o.prevD); o.prevD = thD;
  o.dDelta = (o.dDelta || 0) + dTh * k;
  o.dfRing.rotation.z = thD; o.cross.rotation.z = thD; o.sideL.rotation.z = thD + o.dDelta; o.sideR.rotation.z = thD - o.dDelta;
  o.dpins.forEach((m, i) => { m.rotation.y = (i ? 1 : -1) * o.dDelta * 16 / 10; });
  updateOil(o, lev);
  o.fp.forEach((m, i) => { const a = vis.thC + i * TAU / PG.nF; m.rotation.z = meshPlanet(vis.thS, PG.Zs, a, PG.Zp) - vis.thC; });
  o.s1.rotation.z = vis.th1; o.sh1.rotation.z = vis.th1; o.s2.rotation.z = vis.th2; o.sh2.rotation.z = vis.th2; o.ring.rotation.z = vis.thR;
  o.carR.rotation.z = vis.thCR;
  o.rp.forEach(P => { const al = vis.thCR + P.al, as = vis.thCR + P.as, ths = meshPlanet(vis.th1, PG.Z1, as, PG.Zps), thl = meshPlanet(ths, PG.Zps, gam0 + al, PG.Zpl);
    P.s.rotation.z = ths - vis.thCR; P.l.rotation.z = thl - vis.thCR; });
  const a = 1 - Math.exp(-FRAME_DT / 0.12), cs = getComputedStyle(document.documentElement);
  o.packs.forEach(P => {
    const pk = P.def, lv = lev(pk.id);
    P.gap += ((0.9 - 0.85 * lv) - P.gap) * (sim.shift ? 1 : a);
    const dA = pk.drum ? vis[pk.drum] : 0, hA = vis[pk.hub];
    // 쌓는 순서: 피스톤 | 강철 마찰 강철 마찰 강철 마찰 강철
    let z = pk.z - 5.4 + (0.9 - P.gap) * 3;            // 접합하면 피스톤이 밀어 판이 뒤쪽으로 모인다
    P.piston.position.z = z - 1.6; P.piston.rotation.z = dA;
    for (let i = 0; i < 7; i++) {
      const m = i % 2 === 0 ? P.steel[i / 2] : P.fric[(i - 1) / 2];
      m.position.z = z; m.rotation.z = i % 2 === 0 ? dA : hA; z += (i % 2 === 0 ? 0.7 : 0.9) + P.gap;
    }
    if (P.hubM) P.hubM.rotation.z = hA;
    P.fm.emissive.set(cs.getPropertyValue(pk.kind === 'brake' ? '--red' : '--on').trim()).multiplyScalar(lv); P.fm.emissiveIntensity = 0.55;
    P.label.material.opacity = 0.55 + 0.45 * lv; P.lv = lv;
  });
  o.packs.concat((o.labels || []).map(s => ({ label: s }))).forEach(P => { P.label.visible = TR.labels; P.label.userData.line.visible = TR.labels; });
}
const TCAMS = { oblique: [-0.82, -0.5, -0.28], side: [-1, -0.08, 0.02], front: [-0.05, -0.05, -1] };
function transCam(name) {
  const box = $('boxT'), asp = box.clientWidth / Math.max(1, box.clientHeight), D = asp < 1.3 ? 560 : 640;   // 좁은(정사각) 화면은 더 가까이
  const v = new THREE.Vector3(...TCAMS[name]).normalize().multiplyScalar(D);
  const t = new THREE.Vector3(-55, 25, -25);                  // 변속기·차동기어 전체의 가운데쯤
  TR.ctl.camera.position.copy(t).add(v); TR.ctl.controls.target.copy(t);
  TR.ctl.controls.minDistance = 60; TR.ctl.controls.maxDistance = 1000; TR.ctl.controls.update();
}
async function initTrans() {
  if (TR.ready || TR.loading) return;
  TR.loading = true; $('msgT').textContent = '3D 엔진을 불러오는 중…';
  try {
    await ensureThree();
    const ctl = { box: 'boxT' }; initView(ctl); TR.ctl = ctl;
    ctl.camera.fov = 32; ctl.camera.far = 3000; ctl.camera.updateProjectionMatrix();
    ctl.scene.children.forEach(c => { if (c.isLight) c.intensity *= 0.6; });           // 환경맵이 있으니 조명은 줄인다
    TR.ready = true; $('msgT').textContent = ''; transCam('oblique');
  } catch (e) { $('msgT').textContent = '3D를 불러오지 못했습니다. 인터넷 연결과 브라우저의 WebGL 지원을 확인해 주세요.'; }
  TR.loading = false;
}
if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => { TR.visible = e.isIntersecting; if (e.isIntersecting) initTrans(); })).observe($('trans3d'));
else { TR.visible = true; initTrans(); }
function renderTrans() {
  if (!TR.ready || !TR.visible || (LITE && FRAME_N % 2)) return;
  const ctl = TR.ctl, key = [PG.Zs, PG.Zr, PG.Zp, PG.nF, PG.Z1, PG.Z2, PG.ZR, PG.Zpl, PG.Zps, PG.nR].join('|');
  if (key !== TR.key) { disposeGroup(ctl); TR.obj = buildTrans(ctl); TR.key = key; }
  const box = $('boxT'), w = Math.round(box.clientWidth), h = Math.round(box.clientHeight);
  if (w > 0 && h > 0 && w * 10000 + h !== TR.size) { TR.size = w * 10000 + h; ctl.renderer.setSize(w, h, false); ctl.camera.aspect = w / h; ctl.camera.updateProjectionMatrix(); }
  updateTrans(ctl, TR.obj);
  ctl.controls.update();
  ctl.renderer.clear(true, true, true); ctl.renderer.render(ctl.scene, ctl.camera);
}
document.querySelectorAll('[data-tcam]').forEach(b => b.addEventListener('click', () => { if (TR.ready) transCam(b.dataset.tcam); }));
buildSegStr($('caseSeg'), [{ v: 'cut', t: '단면' }, { v: 'ghost', t: '반투명' }, { v: 'none', t: '숨김' }], 'cut', v => { TR.caseMode = v; applyCaseMode(); });
buildSegStr($('colSeg'), [{ v: 'real', t: '실물 색' }, { v: 'parts', t: '부품별 색' }], 'real', v => { TR.colorMode = v; setTransColors(); });
$('labelBtn').addEventListener('click', () => { TR.labels = !TR.labels; $('labelBtn').setAttribute('aria-pressed', TR.labels); });
$('oilBtn').addEventListener('click', () => { TR.oil = !TR.oil; $('oilBtn').setAttribute('aria-pressed', TR.oil); });
// 변속 슬로 모션: 변속하는 동안만 시간을 1/8로 늦춘다
const SLOWMO = { on: false, shownAt: -9 };
$('slowBtn').addEventListener('click', () => { SLOWMO.on = !SLOWMO.on; $('slowBtn').setAttribute('aria-pressed', SLOWMO.on);
  say(SLOWMO.on ? '변속 슬로 모션: 변속하는 동안 시간이 1/8로 느려집니다.' : '변속 슬로 모션을 껐습니다.'); });
const timeScale = () => SLOWMO.on && sim.shift ? 0.125 : 1;
// 변속 진행 표시: 풀리는 요소와 물리는 요소의 물림 정도
function updateShiftTL() {
  const box = $('shiftTL'), sh = sim.shift;
  if (sh) SLOWMO.shownAt = sim.t;
  if (!sh && sim.t - SLOWMO.shownAt > 1.5) { if (!box.hidden) box.hidden = true; return; }
  if (!sh) return;
  const L = engageLevels(), kmh = Math.abs(sim.v) * 3.6, els = g => g === 'N' ? [] : (g === 1 && kmh > 8 ? ['UD', 'OWC', 'LR'] : CHART[g]);
  const A = els(sh.from), B = els(sh.to), ids = [...new Set(A.concat(B))].filter(id => !(A.includes(id) && B.includes(id)));
  const cs = getComputedStyle(document.documentElement), gN = g => g === 'N' ? 'N' : g === 'R' ? 'R' : g + '단';
  box.hidden = false;
  box.innerHTML = `<div><b>${gN(sh.from)} → ${gN(sh.to)}</b> · 클러치 투 클러치 ${Math.round(sh.t / sh.dur * 100)}%</div>` + ids.map(id => {
    const lv = L[id] || 0, off = A.includes(id), name = EL.find(e => e.id === id).name, col = off ? cs.getPropertyValue('--red').trim() : cs.getPropertyValue('--on').trim();
    return `<div class="row"><span>${name}</span><div class="bar"><i style="width:${Math.round(lv * 100)}%;background:${col}"></i></div><span>${off ? '풀림' : '물림'}</span></div>`; }).join('') +
    (ids.length ? '' : '<div>바뀌는 요소가 없습니다.</div>');
}
