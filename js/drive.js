// 화면 4: 주행 계기판, 핸들·차량 운동·ESC·충돌, 도로 고르기, 주행 모드, 엔진 소리.
// 여러 파일이 전역 이름을 함께 씁니다(sim.js·course.js·dynamics.js 다음, 이 순서대로 불러와야 합니다).
// ---- 주행 화면 계기판: RPM·속도 바늘과 기어 단, 드리프트 각 ----
function drawDash() {
  const cv = $('dash'); if (!cv || !drive.visible) return;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W) return;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const c = cv.getContext('2d'), s = W / 360, font = getComputedStyle(document.body).fontFamily, acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  c.setTransform(dpr * s, 0, 0, dpr * s, 0, 0); c.clearRect(0, 0, 360, H / s);
  const gauge = (cx, cy, R, val, max, step, label, labelEvery, red, unit) => {
    const a0 = 0.75 * Math.PI, sw = 1.5 * Math.PI, ang = x => a0 + sw * Math.min(x, max) / max;
    c.lineCap = 'round'; c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.arc(cx, cy, R, a0, a0 + sw); c.stroke();
    if (red) { c.strokeStyle = '#ff453a'; c.beginPath(); c.arc(cx, cy, R, ang(red), a0 + sw); c.stroke(); }
    c.strokeStyle = acc; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R, a0, ang(val)); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '500 9px ' + font; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let x = 0; x <= max; x += step) { const a = ang(x), big = x % labelEvery === 0;
      c.strokeStyle = 'rgba(255,255,255,' + (big ? .7 : .3) + ')'; c.lineWidth = big ? 1.6 : 1; c.beginPath();
      c.moveTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6)); c.lineTo(cx + Math.cos(a) * (R - (big ? 11 : 9)), cy + Math.sin(a) * (R - (big ? 11 : 9))); c.stroke();
      if (big) c.fillText(label(x), cx + Math.cos(a) * (R - 20), cy + Math.sin(a) * (R - 20)); }
    const a = ang(val); c.strokeStyle = '#fff'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8)); c.stroke();
    c.fillStyle = acc; c.beginPath(); c.arc(cx, cy, 3.5, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.5)'; c.font = '9px ' + font; c.fillText(unit, cx, cy + R * 0.55);
  };
  gauge(62, 66, 50, disp.rpm, 7000, 500, x => String(x / 1000), 1000, 6500, '×1000 rpm');
  gauge(298, 66, 50, disp.kmh, 240, 10, x => String(x), 40, 0, 'km/h');
  const tg = targetGear(), gl = tg === 'N' ? 'N' : tg === 'R' ? 'R' : (sim.manual ? 'M' : 'D') + tg;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = sim.shift ? '#ffffff' : acc; c.font = '600 40px ' + font; c.fillText(gl, 180, 58);
  c.fillStyle = '#fff'; c.font = '300 22px ' + font; c.fillText(Math.round(disp.kmh) + ' km/h', 180, 88);
  const o = DYNS.out, beta = o ? Math.abs(o.beta) * 180 / Math.PI : 0;
  const msg = DYNS.esc ? 'ESC 작동' : HB.on ? '사이드 브레이크' : LAT.off ? '도로 밖' : beta > 8 && Math.abs(sim.v) > 4 ? '드리프트 ' + Math.round(beta) + '°' : sim.spin > 0.15 ? '바퀴 헛돎' : slipAmount() > 0.25 ? '미끄러짐' : sim.shift ? '변속 중' : '';
  if (msg) { c.fillStyle = HB.on || LAT.off ? '#ff9f0a' : '#ffd60a'; c.font = '600 12px ' + font; c.fillText(msg, 180, 112); }
}

function buildDrive() {
  const T3 = THREE, box = $('box3D');
  const renderer = new T3.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(PR()); renderer.outputEncoding = T3.sRGBEncoding;
  box.appendChild(renderer.domElement);
  const scene = new T3.Scene(), sky = new T3.Color(0xa9bccf);
  scene.background = sky; scene.fog = new T3.Fog(sky, 30, 110);
  const camera = new T3.PerspectiveCamera(45, 16 / 9, 0.1, 1500);
  const hemi = new T3.HemisphereLight(0xe6eef5, 0x4a5a40, 0.75); scene.add(hemi);
  const sunL = new T3.DirectionalLight(0xfff6e8, 1.0); sunL.position.set(-40, 60, 30); scene.add(sunL);
  const envTex = skyEnv(T3, renderer); scene.environment = envTex;
  Object.assign(drive, { hemi, sunL, envTex, sky });
  const root = new T3.Group(); scene.add(root);
  const std = (color, o) => new T3.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0.1 }, o));
  // 길이 방향으로 잘게 나눈 띠. 매 프레임 도로 높이(ROAD)에 맞춰 꼭짓점 높이를 바꿔 언덕 모양을 만든다(앞 200m, 뒤 60m)
  const flat = (w, mat, x, y) => {
    const geo = new T3.PlaneGeometry(w, 260, 1, 104); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -70);
    const m = new T3.Mesh(geo, mat); m.position.set(x, y, 0); root.add(m); drive.strips.push(geo); return m;
  };
  // 땅과 도로: 차는 오른쪽 차로(x −2~2) 가운데. 중앙선은 x=−2
  drive.groundMat = std(0x4f6b3e); drive.roadMat = std(0x3a3d42, { roughness: 0.92 });
  flat(400, drive.groundMat, 0, 0);
  flat(8.4, drive.roadMat, -2, 0.01);
  const white = std(0xe9e9ea, { roughness: 0.5 });
  flat(0.15, white, 2.0, 0.02); flat(0.15, white, -6.0, 0.02);
  const add = (obj, period, count, offset) => { for (let i = 0; i < count; i++) { const o = i === 0 ? obj : obj.clone(); root.add(o);
    drive.props.push({ o, base: i * period + (offset || 0), L: period * count, y0: o.position.y, flat: o.rotation.x !== 0 }); } };
  const dash = new T3.Mesh(new T3.PlaneGeometry(0.15, 3), std(0xf2c94c, { roughness: 0.5 })); dash.rotation.x = -Math.PI / 2; dash.position.set(-2, 0.02, 0);
  add(dash, 9, 16);
  // 노면 이음매: 4m마다 지나가 고속에서도 속도감이 남는다
  const seam = new T3.Mesh(new T3.PlaneGeometry(8.2, 0.14), std(0x232528, { roughness: 1 })); seam.rotation.x = -Math.PI / 2; seam.position.set(-2, 0.015, 0);
  add(seam, 4, 36);
  // 길가 기둥(반사판)과 나무
  const post = new T3.Group(), pm = std(0xd9dde2);
  const pole = new T3.Mesh(new T3.BoxGeometry(0.12, 1.0, 0.12), pm); pole.position.y = 0.5; post.add(pole);
  const refl = new T3.Mesh(new T3.BoxGeometry(0.13, 0.12, 0.13), std(0xff9f1a, { emissive: 0x663300 })); refl.position.y = 0.9; post.add(refl);
  post.position.x = 2.8; add(post, 8, 18);
  const post2 = post.clone(); post2.position.x = -6.8; add(post2, 8, 18, 4);
  const tree = new T3.Group();
  const trunk = new T3.Mesh(new T3.CylinderGeometry(0.15, 0.2, 1.4, 8), std(0x6b4f3a)); trunk.position.y = 0.7; tree.add(trunk);
  const crown = new T3.Mesh(new T3.ConeGeometry(1.1, 2.6, 10), std(0x2f6b45)); crown.position.y = 2.6; tree.add(crown);
  tree.position.x = 6.5; add(tree, 17, 8);
  const tree2 = tree.clone(); tree2.position.x = -10.5; tree2.scale.setScalar(1.25); add(tree2, 23, 6, 9);
  // 차(js/app.js의 buildCar). 직선 도로에서는 원점에, 코스에서는 코스 위 위치로 옮긴다
  const C = buildCar(T3, std), car = C.car, body = C.body; scene.add(car);
  // 전조등: 밤에만 켜는 스포트라이트 두 개(차와 함께 움직인다)
  drive.lamps = [-0.6, 0.6].map(x => { const L = new T3.SpotLight(0xfff1d6, 0, 90, 0.42, 0.6, 1.3); L.position.set(x, 0.75, -2.3); L.target.position.set(x * 2, 0, -24); car.add(L); car.add(L.target); return L; });
  drive.headMat = C.head;
  buildWeather(T3, scene);
  Object.assign(drive, { wheels: C.wheels, pivots: C.pivots, tail: C.tail, rev: C.rev, paint: C.paint, std, courseScenes: {} });
  setPaint(PAINT.i);
  const controls = new T3.OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 4; controls.maxDistance = 30; controls.maxPolarAngle = Math.PI / 2 - 0.04;
  twoFingerTouch(controls);
  // 차를 누르면(끌지 않고) 변속기 3D로 넘어간다
  const ray = new T3.Raycaster(), ndc = new T3.Vector2(); let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(car, true).length) goTrans();
  });
  buildFX(T3, scene);
  Object.assign(drive, { renderer, scene, camera, controls, body, root, car, ready: true });
  driveCam('back');
}
function goTrans() {
  $('trans3d').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
$('toTrans').addEventListener('click', goTrans);
async function initDrive() {
  if (drive.ready || drive.loading) return;
  drive.loading = true; $('msg3D').textContent = '3D 엔진을 불러오는 중…';
  try { await ensureThree(); buildDrive(); $('msg3D').textContent = ''; }
  catch (e) { $('msg3D').textContent = '3D를 불러오지 못했습니다. 인터넷 연결과 브라우저의 WebGL 지원을 확인해 주세요.'; }
  drive.loading = false;
}
// 화면에 보일 때만 불러오고 그린다
if ('IntersectionObserver' in window) {
  new IntersectionObserver(es => es.forEach(e => { drive.visible = e.isIntersecting; if (e.isIntersecting) initDrive(); })).observe($('drive'));
} else { drive.visible = true; initDrive(); }
document.querySelectorAll('[data-dcam]').forEach(b => b.addEventListener('click', () => { if (drive.ready) driveCam(b.dataset.dcam); }));
const gName = g => g === 'N' ? 'N' : g === 'R' ? 'R' : g + '단';
function renderDrive(dt) {
  const v = sim.v, a = dt > 0 ? (v - drive.lastV) / dt : 0;
  drive.lastV = v; drive.dist += Math.abs(v) * dt; drive.wheel -= v / CFG.tireR * dt;
  drive.wheelF -= (v / CFG.tireR + sim.spin * 30 * sim.Fdir) * dt;     // 앞바퀴(구동륜)는 헛돌면 더 빨리 돈다
  drive.acc += (a - drive.acc) * Math.min(1, dt * 8);
  // 차체 기울기: 가속도에 비례하는 목표각으로 감쇠 스프링처럼 따라간다(앞이 −z이므로 양수면 앞이 들림)
  const target = clamp(drive.acc * 0.012, -0.06, 0.06);
  // 변속 충격: 요소가 물리는 순간 차체를 한 번 툭 친다(올림은 앞이 숙고, 힘주어 내리면 앞이 들림)
  const ev = sim.shiftEvt;
  if (ev && ev.n !== drive.evtN) {
    drive.evtN = ev.n;
    const num = typeof ev.from === 'number' && typeof ev.to === 'number';
    if (!RM.matches) drive.pv += num ? (ev.to > ev.from ? -0.3 : (sim.th > 0.3 ? 0.3 : -0.2)) : -0.18;
  }
  drive.pv += ((target - drive.pitch) * 90 - drive.pv * 12) * dt; drive.pitch += drive.pv * dt;
  if (!drive.tipDone && drive.dist > 2) { drive.tipDone = true; $('driveTip').classList.add('off'); }
  if (!drive.ready || !drive.visible || (LITE && FRAME_N % 2)) return;
  const w = Math.round($('box3D').clientWidth);
  const h = Math.round($('box3D').clientHeight);
  if (w > 0 && h > 0 && w * 10000 + h !== drive.size) { drive.size = w * 10000 + h; drive.renderer.setSize(w, h, false); drive.camera.aspect = w / h; drive.camera.updateProjectionMatrix(); }
  const fov = 45 + (RM.matches ? 0 : Math.min(14, Math.abs(v) * 3.6 * 0.07));  // 빠를수록 시야를 넓혀 속도감을 더한다
  if (Math.abs(drive.camera.fov - fov) > 0.05) { drive.camera.fov = fov; drive.camera.updateProjectionMatrix(); }
  // 차의 자세(위치·방향)를 정하고 장면을 맞춘다
  const P = carPose(); drive.pose = P;
  const C = COURSE.c;
  drive.root.visible = !C;
  Object.entries(drive.courseScenes).forEach(([id, g]) => { g.visible = !!C && id === C.id; });
  if (C && !drive.courseScenes[C.id]) { drive.courseScenes[C.id] = buildCourseScene(THREE, C, drive.std); drive.scene.add(drive.courseScenes[C.id]); drive.surf = ''; }
  const fogFar = C ? 520 : 110; if (drive.scene.fog.far !== fogFar) { drive.scene.fog.far = fogFar; drive.scene.fog.near = C ? 80 : 30; }
  if (!C) {
    // 직선 도로: 차는 원점에 두고 길과 주변을 흘려 보낸다. 지역 z의 점은 도로 거리 s = x − z (앞이 −z)
    const x = sim.x, H0 = ROAD.heightAt(x), hAt = z => ROAD.heightAt(x - z) - H0;
    drive.strips.forEach(geo => {
      const Pg = geo.attributes.position;
      for (let i = 0; i < Pg.count; i++) Pg.setY(i, hAt(Pg.getZ(i)));
      Pg.needsUpdate = true; geo.computeVertexNormals();
    });
    drive.props.forEach(p => {
      const z = ((p.base + x) % p.L + p.L) % p.L - (p.L - 20);
      p.o.position.z = z; p.o.position.y = p.y0 + hAt(z);
      if (p.flat) p.o.rotation.x = -Math.PI / 2 + Math.atan(ROAD.gradeAt(x - z));
    });
  }
  drive.car.position.set(P.x, P.y, P.z); drive.car.rotation.y = P.psi; drive.car.rotation.x = Math.atan(P.grade);
  followCam(P);
  updateFX(P, dt);
  drive.body.rotation.x = drive.pitch;
  // 바퀴: 왼쪽(0, 2)·오른쪽(1, 3) 속도가 회전 반경에 따라 다르다. 앞바퀴는 헛돌면 더 돈다
  const fl = 1 + STEER.k, fr = 1 - STEER.k;
  drive.roll = drive.roll || [0, 0, 0, 0];
  [fl, fr, fl, fr].forEach((f, i) => { drive.roll[i] -= (v / CFG.tireR * f + (i < 2 ? sim.spin * 30 * sim.Fdir : 0)) * dt; drive.wheels[i].rotation.x = drive.roll[i]; });
  drive.pivots.forEach(p => { p.rotation.y = -STEER.delta; });          // 실제 바퀴 조향각
  const ay = DYNS.out ? DYNS.out.ay : isFinite(STEER.R) ? v * v / STEER.R * Math.sign(STEER.v) : 0;
  drive.body.rotation.z += (clamp(ay * 0.006, -0.06, 0.06) - drive.body.rotation.z) * Math.min(1, dt * 6);   // 바깥으로 기우는 차체
  const turning = isFinite(STEER.R) && Math.abs(v) > 0.3;
  $('dTurnBox').hidden = true;                                          // 회전 정보는 계기판(드리프트 각)으로 옮김
  if (turning) setText('dTurn', '반경 ' + STEER.R.toFixed(0) + 'm · 바깥 바퀴 +' + (Math.abs(STEER.k) * 100).toFixed(0) + '% · ' + (Math.abs(ay) / G0).toFixed(2) + 'G');
  updateCourseHud(P);
  applyNight(); updateWeather(dt);
  if (drive.surf !== sim.surface) {                                            // 노면에 따라 땅과 도로 색을 바꾼다
    drive.surf = sim.surface;
    const S = { dry: [0x4f6b3e, 0x3a3d42, 0.92, 0.0, 0xffffff], wet: [0x3f5733, 0x26292d, 0.25, 0.35, 0xb9c4b4], snow: [0xdfe6ea, 0x6a7176, 0.85, 0.0, 0xf4f7f9] }[sim.surface];
    drive.groundMat.color.setHex(S[0]); drive.roadMat.color.setHex(S[1]); drive.roadMat.roughness = S[2]; drive.roadMat.metalness = S[3];
    Object.values(drive.courseScenes).forEach(g => { const u = g.userData; u.roadM.color.setHex(S[1]); u.roadM.roughness = S[2]; u.roadM.metalness = S[3];
      u.terrainMat.color.setHex(S[4]); u.terrainMat.emissive.setHex(sim.surface === 'snow' ? 0x9aa4ab : 0x000000); });
  }
  drive.tail.emissive.setHex(sim.brake ? 0xff2020 : 0x660000);
  drive.rev.emissive.setHex(sim.cur === 'R' ? 0xffffff : 0x000000);
  const d = drive.dist;
  setText('dDist', d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(2) + ' km');
  setText('dAcc', (drive.acc / G0).toFixed(2) + ' G');
  setText('dWheel', Math.round(Math.abs(v) / CFG.tireR * 30 / Math.PI) + ' rpm');
  const tg = targetGear(), gl = tg === 'N' ? 'N' : tg === 'R' ? 'R' : (sim.manual ? 'M' : 'D') + tg;
  const els = lastActive.map(id => EL.find(e => e.id === id).name).join(' + ') || '해제';
  setText('dGear', gl + ' · ' + els + (sim.shift ? ' (변속 중)' : ''));
  setText('dFuel', fuelText());
  const ayNow = isFinite(STEER.R) ? sim.v * sim.v / STEER.R : 0;
  const warn = sim.holding ? '언덕 밀림 방지 중' : LAT.off ? '도로 밖!' : sim.spin > 0.05 ? '바퀴 헛돎' : ayNow > sim.mu * G0 * 0.85 ? '옆으로 미끄러질 속도' : '';
  setText('dWarn', warn); $('dWarnBox').hidden = !warn;
  drive.controls.update();
  let sh = null;                                           // 부딪혔을 때 잠깐 흔들림
  if (drive.shake > 0 && !RM.matches) { const k = drive.shake * 0.5; sh = new THREE.Vector3((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k); drive.camera.position.add(sh); drive.shake -= dt; }
  drive.renderer.render(drive.scene, drive.camera);
  if (sh) drive.camera.position.sub(sh);
}

// ---- 핸들: 앞바퀴 조향각 최대 34°, 휠베이스 2.84m, 윤거 1.6m. 회전 반경 R = L / tan δ ----
// 핸들 각(화면의 핸들)은 바퀴 조향각 × 13(조향비): 최대 약 ±450°
const STEER = { v: 0, target: 0, key: 0, k: 0, R: Infinity, mode: 'manual', drag: false, delta: 0 };
const steerEl = $('steer');
steerEl.addEventListener('input', () => { STEER.target = steerEl.value / 100; STEER.keyUsed = false; if (COURSE.c && STEER.mode === 'auto') setSteerMode('manual'); });
steerEl.addEventListener('change', () => { STEER.keyUsed = true; });                  // 손을 떼면 핸들이 저절로 가운데로
$('steerC').addEventListener('click', () => { STEER.target = 0; steerEl.value = 0; });
function setSteerMode(m) {
  STEER.mode = m;
  const t = m === 'auto' ? '핸들: 자동' : '핸들: 직접';
  ['steerMode', 'fSteerMode'].forEach(id => { $(id).textContent = t; $(id).setAttribute('aria-pressed', m === 'manual'); });
  if (m === 'manual') say('직접 핸들: 핸들을 끌거나 ←/→ 키로 조향하세요. 길을 벗어나면 느려지고, 가드레일에 부딪히면 크게 감속합니다.');
  else say('자동 핸들: 차가 길을 따라갑니다. 속도와 변속만 직접 하세요.');
}
['steerMode', 'fSteerMode'].forEach(id => $(id).addEventListener('click', () => setSteerMode(STEER.mode === 'auto' ? 'manual' : 'auto')));
['steerMode', 'fSteerMode'].forEach(id => { $(id).hidden = true; });               // 직선 도로에서는 늘 직접 핸들
// 차의 옆 움직임(직접 핸들): e = 차로 가운데에서 오른쪽으로 벗어난 거리(m), h = 도로 방향보다 오른쪽으로 틀어진 각(rad)
const LAT = { e: 0, h: 0, vy: 0, r: 0, off: false };   // roadStep(js/dynamics.js)의 상태를 겸한다
// 속도 감응 조향: 빠를수록 같은 핸들 각에 바퀴가 덜 꺾인다(36km/h에서 절반, 100km/h에서 약 1/9)
const steerGain = () => 1 / (1 + Math.pow(Math.abs(sim.v) / 10, 2));
function roadEdges() {
  const C = COURSE.c;
  return C ? { lo: -(C.def.width / 2 + C.def.lane), hi: C.def.width / 2 - C.def.lane, wall: C.def.kind === 'mountain' ? 1.0 : C.def.kind === 'circuit' ? 9 : 12 } : { lo: -6, hi: 2, wall: 12 };
}
// 직접 핸들·사이드 브레이크일 때는 타이어 모델(js/dynamics.js)로 차의 옆 미끄럼 vy와 요 각속도 r을 풀고,
// 도로 기준 옆 위치 e와 방향 오차 h를 적분한다. 자동 핸들도 같은 물리 위에서 운전 보조(autoSteer)가 핸들을 돌린다
const DYNS = { out: null, lastV: 0, ax: 0 };
const ESC = { on: true };
const latMu = () => sim.mu * 0.85 * (LAT.off ? 0.55 : 1);   // 타이어 옆 접지(일반 도로 타이어 μ≈1). 풀밭은 그 55%
const HB = { on: false };
function resetDyn() { LAT.vy = 0; LAT.r = 0; DYNS.out = null; LAT.e = 0; LAT.h = 0; ROAD.curvOverride = null; ROAD.offroad = LAT.off = false; FX.reset = true; }
function updateLateral(dt) {
  const C = COURSE.c, auto = C && STEER.mode === 'auto';
  if (HB.on && auto) setSteerMode('manual');                                // 사이드 브레이크를 당기면 직접 운전으로
  ROAD.curvOverride = 0;                                  // 코너 미끄럼은 타이어 모델이 맡는다(sim.js의 단순 끌림은 끔)
  const ax = dt > 0 ? (sim.v - DYNS.lastV) / dt : 0; DYNS.lastV = sim.v; DYNS.ax += (ax - DYNS.ax) * Math.min(1, dt * 10);
  const n = Math.max(1, Math.ceil(dt / 0.004)), hs = dt / n, mu = latMu();
  const brake = sim.brake ? Math.min(7.5, sim.mu * G0 * 0.95) : 0;
  let r = null, d = 0;
  for (let k = 0; k < n; k++) {
    const kRoad = C ? C.curvAt(sim.x) : 0;
    d = STEER.mode === 'auto' && C ? autoSteer(LAT, kRoad, sim.v) : STEER.v * 0.6 * steerGain();
    r = roadStep(LAT, { vx: sim.v, delta: d, mu, ax: DYNS.ax, brake, hb: HB.on, esc: ESC.on }, kRoad, hs);
    sim.v = Math.max(sim.v < 0 ? -50 : 0, sim.v + r.dvx * hs);
    sim.x += (r.along - sim.v) * hs;                      // sim.js는 차 속도만큼 나아가게 했으므로 도로 방향 성분으로 바로잡는다
  }
  DYNS.out = r && r.out; DYNS.esc = !!(r && r.out.esc);
  if (auto) { STEER.delta = d; STEER.v = clamp(d / 0.6, -1, 1); STEER.target = STEER.v; }   // 화면 핸들·바퀴에 보조가 꺾은 각을 보인다
  // ESC가 작동하면 엔진 힘도 줄인다(가속 페달은 그대로 두고 실제 출력만)
  const want = thEl.value / 100; sim.th = DYNS.esc ? Math.min(want, 0.15) : want;
  const E = roadEdges(), off = LAT.e < E.lo - 0.2 || LAT.e > E.hi + 0.2, v = sim.v;
  if (off && !LAT.off && Math.abs(v) > 1) say('도로를 벗어났습니다. 풀밭에서는 미끄럽고 느려집니다.', true);
  LAT.off = ROAD.offroad = off;
  if (LAT.e < E.lo - E.wall || LAT.e > E.hi + E.wall) {                   // 가드레일·방호벽: 부딪히면 튕기며 크게 감속
    LAT.e = clamp(LAT.e, E.lo - E.wall, E.hi + E.wall);
    if (Math.abs(v) > 3) say(C && C.def.kind === 'mountain' ? '가드레일에 부딪혔습니다! 핸들을 길 쪽으로 돌리세요.' : '방호벽에 부딪혔습니다! 핸들을 길 쪽으로 돌리세요.', true);
    if (Math.abs(v) > 1) { sim.v *= 0.5; drive.shake = 0.35; }
    LAT.vy *= -0.3; LAT.r *= 0.3; LAT.h *= 0.4;
  }
}
// 스핀하거나 길 밖에 멈췄을 때: 차를 차로 가운데로 되돌려 세운다(타이어 자국은 남김)
$('recover').addEventListener('click', () => { LAT.vy = 0; LAT.r = 0; DYNS.out = null; LAT.e = 0; LAT.h = 0; LAT.off = ROAD.offroad = false; sim.v = 0; setThrottle(0); say('차를 차로 가운데로 되돌렸습니다.'); });
// ---- 충돌: 나무·기둥·표지판. 차는 앞뒤 두 원(중심 ±1.4m, 반지름 0.95m)으로 본다 ----
const HIT = { cool: 0, grid: null, gridId: '' };
function obstaclesNear(x, z) {
  const C = COURSE.c;
  if (!C) {                                               // 직선 도로: 흘러가는 기둥·나무(지역 좌표 = 차 기준)
    const out = []; (drive.props || []).forEach(p => { if (p.flat) return;
      const zz = ((p.base + sim.x) % p.L + p.L) % p.L - (p.L - 20); if (Math.abs(zz - z) < 4) out.push([p.o.position.x, zz, p.o.position.x === 2.8 || p.o.position.x === -6.8 ? 0.1 : 0.3 * (p.o.scale.x || 1)]); });
    return out;
  }
  const g = drive.courseScenes && drive.courseScenes[C.id]; if (!g) return [];
  if (HIT.gridId !== C.id) {                              // 8m 칸 격자로 나눠 가까운 것만 본다
    HIT.grid = new Map(); HIT.gridId = C.id;
    g.userData.obstacles.forEach(o => { const k = Math.floor(o[0] / 8) + ',' + Math.floor(o[1] / 8); (HIT.grid.get(k) || HIT.grid.set(k, []).get(k)).push(o); });
  }
  const out = [], cx = Math.floor(x / 8), cz = Math.floor(z / 8);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) (HIT.grid.get((cx + i) + ',' + (cz + j)) || []).forEach(o => out.push(o));
  return out;
}
function checkCollisions(dt) {
  HIT.cool -= dt; if (HIT.cool > 0 || Math.abs(sim.v) < 0.5) return;
  let cx, cz, fx, fz;
  if (COURSE.c) { const P = carPose(); cx = P.x; cz = P.z; fx = -Math.sin(P.psi); fz = -Math.cos(P.psi); }
  else { cx = LAT.e; cz = 0; fx = Math.sin(LAT.h); fz = -Math.cos(LAT.h); }
  const circles = [[cx + fx * 1.4, cz + fz * 1.4], [cx - fx * 1.4, cz - fz * 1.4]];
  for (const o of obstaclesNear(cx, cz)) for (const [px, pz] of circles) {
    if (Math.hypot(px - o[0], pz - o[1]) < 0.95 + o[2]) {
      const kmh = Math.abs(sim.v) * 3.6;
      say(o[2] > 0.15 ? `나무에 부딪혔습니다(${Math.round(kmh)}km/h)! 후진(R)으로 빠져나오세요.` : `기둥에 부딪혔습니다(${Math.round(kmh)}km/h)!`, true);
      sim.v *= o[2] > 0.15 ? -0.1 : 0.4; LAT.vy *= 0.2; LAT.r *= 0.2; sim.x -= Math.sign(sim.v || 1) * 0.4;
      drive.shake = Math.min(0.6, 0.15 + kmh / 120); HIT.cool = 0.6; return;
    }
  }
}
// ESC 켜기·끄기: 켜면 미끄러질 때 한쪽 바퀴 브레이크와 엔진 출력 제한으로 차를 잡는다. 드리프트하려면 끈다
function setESC(on) {
  ESC.on = on; ['escBtn', 'fEsc'].forEach(id => { $(id).textContent = on ? 'ESC 켜짐' : 'ESC 꺼짐'; $(id).setAttribute('aria-pressed', on); });
  say(on ? 'ESC 켜짐: 미끄러지면 차가 스스로 자세를 잡습니다.' : 'ESC 꺼짐: 차가 돌아가도 잡아 주지 않습니다. 드리프트를 연습해 보세요.');
}
['escBtn', 'fEsc'].forEach(id => $(id).addEventListener('click', () => setESC(!ESC.on)));
$('nightBtn').addEventListener('click', () => { NIGHT.on = !NIGHT.on; $('nightBtn').setAttribute('aria-pressed', NIGHT.on); $('nightBtn').textContent = NIGHT.on ? '☾ 밤' : '☀ 낮'; });
// 사이드 브레이크: 버튼(누르고 있기)과 Space 키
function setHB(on) {
  if (HB.on === on) return; HB.on = on;
  ['hbBtn', 'fHb', 'hbCtl'].forEach(id => $(id).classList.toggle('down', on));
  if (on && Math.abs(sim.v) > 3) say('사이드 브레이크: 뒷바퀴가 잠겨 미끄러집니다. 핸들을 꺾으며 당기면 뒤가 돌아 나갑니다(드리프트).');
}
['hbBtn', 'fHb', 'hbCtl'].forEach(id => {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} setHB(true); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, () => setHB(false)));
  b.addEventListener('contextmenu', e => e.preventDefault());
});
// 화면 핸들: 끌어서 돌린 각도만큼 조향. 놓으면 저절로 가운데로 돌아온다
(() => {
  const w = $('wheelW'); let d = null;
  const ang = (e, c) => Math.atan2(e.clientY - c[1], e.clientX - c[0]);
  w.addEventListener('pointerdown', e => {
    const r = w.getBoundingClientRect(), c = [r.left + r.width / 2, r.top + r.height / 2];
    d = { c, last: ang(e, c), s: STEER.target }; try { w.setPointerCapture(e.pointerId); } catch (_) {}
    if (COURSE.c && STEER.mode === 'auto') setSteerMode('manual');
    STEER.drag = true; STEER.keyUsed = false; e.preventDefault();
  });
  w.addEventListener('pointermove', e => {
    if (!d) return;
    let a = ang(e, d.c), da = a - d.last; da -= Math.round(da / TAU) * TAU; d.last = a;
    d.s = clamp(d.s + da * 180 / Math.PI / 450, -1, 1); STEER.target = d.s;
  });
  const up = () => { if (!d) return; d = null; STEER.drag = false; STEER.keyUsed = true; };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => w.addEventListener(ev, up));
})();
// ◀ ▶ 버튼: 누르고 있는 동안 그쪽으로 핸들을 돌리고, 떼면 가운데로(화살표 키와 같음)
[['stL', -1], ['stR', 1]].forEach(([id, dir]) => {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {}
    if (COURSE.c && STEER.mode === 'auto') setSteerMode('manual'); STEER.key = dir; STEER.keyUsed = true; b.classList.add('down'); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, () => { if (STEER.key === dir) STEER.key = 0; b.classList.remove('down'); }));
  b.addEventListener('contextmenu', e => e.preventDefault());
});
function drawWheel() {
  const deg = STEER.v * 450, wh = $('wheelW');
  wh.firstElementChild.style.transform = `rotate(${deg.toFixed(1)}deg)`; wh.setAttribute('aria-valuenow', Math.round(deg));
  setText('wheelTag', (COURSE.c && STEER.mode === 'auto' ? '자동 · ' : '') + '핸들 ' + Math.round(deg) + '°');
}
function updateSteer(dt) {
  if (COURSE.c && STEER.mode === 'auto') {                // 자동 핸들: 도로 곡률에 맞춰 tan δ = L·κ
    const d = STEER.delta || 0, k = Math.tan(d) / 2.84;     // 각은 updateLateral의 운전 보조가 정한다
    STEER.R = Math.abs(k) < 1e-4 ? Infinity : 1 / Math.abs(k); STEER.k = 0.8 * k;
    steerEl.value = Math.round(STEER.v * 100); steerEl.disabled = true;
    setText('steerLabel', '자동(코스) · ' + (!isFinite(STEER.R) ? '직진' : (d > 0 ? '오른쪽 ' : '왼쪽 ') + Math.round(Math.abs(d) * 180 / Math.PI) + '° · 반경 ' + STEER.R.toFixed(0) + ' m'));
    drawWheel(); return;
  }
  steerEl.disabled = false;
  if (STEER.key) STEER.target = clamp(STEER.target + STEER.key * dt * 0.6, -1, 1);
  else if (STEER.keyUsed) STEER.target = Math.abs(STEER.target) < dt * 1.6 ? 0 : STEER.target - Math.sign(STEER.target) * dt * 1.6;   // 키를 놓으면 저절로 가운데로
  if (STEER.key || STEER.keyUsed || STEER.drag) steerEl.value = Math.round(STEER.target * 100);
  if (!STEER.key && STEER.target === 0) STEER.keyUsed = false;
  STEER.v += (STEER.target - STEER.v) * Math.min(1, dt * 8);
  const d = STEER.v * 0.6 * steerGain(); STEER.delta = d;
  STEER.R = Math.abs(d) < 0.003 ? Infinity : 2.84 / Math.tan(Math.abs(d));
  STEER.k = Math.sign(d) * (isFinite(STEER.R) ? 0.8 / STEER.R : 0);                 // 오른쪽(+)으로 돌면 왼쪽 바퀴가 바깥
  setText('steerLabel', !isFinite(STEER.R) ? '직진' : (d > 0 ? '오른쪽 ' : '왼쪽 ') + Math.round(Math.abs(d) * 180 / Math.PI) + '° · 반경 ' + STEER.R.toFixed(1) + ' m');
  drawWheel();
}

// ---- 도로 경사 ----
const gradeText = g => g === 0 ? '0% 평지' : (g > 0 ? '+' + g + '% 오르막' : g + '% 내리막');
$('grade').addEventListener('input', e => {
  if (COURSE.c) return;
  const g = +e.target.value; ROAD.set(g / 100, sim.x + (sim.v < 0 ? -15 : 15));   // 15m 앞부터 12m에 걸쳐 바뀐다
  $('gradeLabel').textContent = gradeText(g);
});
function setRoadNow(pct) { if (COURSE.id !== 'straight') selectCourse('straight'); resetDyn(); ROAD.reset(pct / 100, sim.x); $('grade').value = pct; $('gradeLabel').textContent = gradeText(pct); }

// ---- 도로 고르기: 직선(무한 직선 + 경사 슬라이더) 또는 코스(굽은 국도·산길·서킷, 닫힌 고리) ----
const COURSE = { id: 'straight', c: null, cache: {}, lap: 0, lapT0: null, last: null, best: {}, mapCv: null, mapDrawT: 0 };
try { COURSE.best = JSON.parse(localStorage.getItem('sonata6at.laps') || '{}') || {}; } catch (e) {}
const fmtLap = t => t == null ? '–' : Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0');
function selectCourse(id) {
  if (COURSE.id === id && (id === 'straight' || COURSE.c)) return;
  COURSE.id = id; COURSE.lap = 0; COURSE.lapT0 = null; COURSE.last = null; COURSE.mapCv = null;
  resetDyn(); STEER.target = 0;
  STEER.mode = id === 'straight' ? 'manual' : 'auto'; ['steerMode', 'fSteerMode'].forEach(b => { $(b).textContent = STEER.mode === 'auto' ? '핸들: 자동' : '핸들: 직접'; $(b).hidden = id === 'straight'; });
  setThrottle(0); sim.v = 0; sim.lock = false; sim.slide = 0;
  if (id === 'straight') {
    COURSE.c = null; ROAD.reset(0, sim.x); $('grade').disabled = false; $('grade').value = 0; $('gradeLabel').textContent = gradeText(0);
    setText('courseInfo', '끝없는 직선 도로입니다. 아래 "앞 도로 경사"로 오르막·내리막을 만들 수 있습니다.');
  } else {
    const c = COURSE.cache[id] || (COURSE.cache[id] = makeCourse(id));
    COURSE.c = c; ROAD.course = c; sim.x = 0; $('grade').disabled = true;
    setText('courseInfo', `${c.def.name}: ${c.def.note}. 한 바퀴 ${(c.L / 1000).toFixed(2)}km, 고도차 ${(Math.max(...c.y) - Math.min(...c.y)).toFixed(0)}m. 핸들은 자동이고, 코스 앞 코너와 권장 속도를 화면 아래에 알려 줍니다.`);
    say(c.def.name + ' 코스를 고르셨습니다. D로 놓고 출발하세요.' + (c.def.kind === 'circuit' ? ' 출발선을 지나면 랩 기록을 잽니다.' : ''));
  }
  $('courseSeg').querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-checked', b.dataset.k === id));
  $('courseSeg').style.setProperty('--i', ['straight', 'country', 'mountain', 'circuit'].indexOf(id));
  $('miniMap').hidden = id === 'straight'; $('courseBar').hidden = id === 'straight';
  $('miniMap').parentElement.classList.toggle('has-map', id !== 'straight');
  if (drive.ready) { drive.pose = carPose(); driveCam('back'); }
}
buildSegStr($('courseSeg'), [{ v: 'straight', t: '직선 도로' }, { v: 'country', t: '굽은 국도' }, { v: 'mountain', t: '산길' }, { v: 'circuit', t: '서킷' }], 'straight', v => selectCourse(v));
// 차의 자세: 직선 도로는 원점, 코스는 가운데 선에서 차로만큼 오른쪽(+ 미끄러지면 바깥으로)
function carPose() {
  const C = COURSE.c;
  if (!C) return { x: LAT.e, y: 0, z: 0, psi: -LAT.h, grade: ROAD.gradeAt(sim.x) };
  const p = C.at(sim.x), off = C.def.lane + LAT.e;
  return { x: p.x + Math.cos(p.psi) * off, y: p.y, z: p.z - Math.sin(p.psi) * off, psi: p.psi - LAT.h, grade: p.grade, kap: p.kap };
}
// 카메라: 지난 프레임의 차 기준 상대 위치를 그대로 유지하며 따라간다(코너에서 함께 돈다)
// 카메라: 차의 방향이 아니라 차가 실제로 움직이는 방향(차체 방향 − 미끄럼 각)을 0.35초 늦게 따라간다.
// 그래서 드리프트·스핀 때 화면은 진행 방향을 유지하고 차체가 옆으로 돌아가는 모습이 보인다
function followCam(P) {
  const Q = drive.prevPose, cam = drive.camera.position, Y = new THREE.Vector3(0, 1, 0);
  const o = DYNS.out, beta = o && Math.abs(sim.v) > 3 ? o.beta : 0, want = P.psi - beta;
  if (drive.camPsi === undefined || !Q) drive.camPsi = want;
  else { let d = want - drive.camPsi; d -= Math.round(d / TAU) * TAU; drive.camPsi += d * Math.min(1, FRAME_DT / 0.35); }
  if (Q) {
    let rot = drive.camPsi - Q.camPsi; rot -= Math.round(rot / TAU) * TAU;
    const dd = cam.clone().sub(new THREE.Vector3(Q.x, Q.y, Q.z)).applyAxisAngle(Y, rot);
    cam.set(P.x + dd.x, P.y + dd.y, P.z + dd.z);
    const t = drive.controls.target.clone().sub(new THREE.Vector3(Q.x, Q.y, Q.z)).applyAxisAngle(Y, rot);
    drive.controls.target.set(P.x + t.x, P.y + t.y, P.z + t.z);
  }
  drive.prevPose = Object.assign({ camPsi: drive.camPsi }, P);
}
// 랩·코너 안내·지도
function updateLaps() {
  const C = COURSE.c; if (!C) return;
  if (COURSE.lapT0 === null && Math.abs(sim.v) > 0.3) COURSE.lapT0 = sim.t;      // 출발하는 순간부터 잰다
  const n = Math.floor(sim.x / C.L);
  if (n > COURSE.lap) {
    const t = sim.t - COURSE.lapT0; COURSE.last = t; COURSE.lapT0 = sim.t; COURSE.lap = n;
    const best = COURSE.best[C.id];
    if (best == null || t < best) { COURSE.best[C.id] = t; try { localStorage.setItem('sonata6at.laps', JSON.stringify(COURSE.best)); } catch (e) {} say(`${C.def.name} 새 최고 랩 ${fmtLap(t)}!`); }
    else say(`랩 ${fmtLap(t)} (최고 ${fmtLap(best)})`);
  } else if (n < COURSE.lap) COURSE.lap = n;
}
function updateCourseHud(P) {
  const C = COURSE.c; if (!C) return;
  const v = Math.abs(sim.v), nc = C.nextCorner(sim.x, 220, latMu()), cor = $('dCorner'), sliding = slipAmount() > 0.3;
  if (nc) {
    const need = v > nc.v ? (v * v - nc.v * nc.v) / (2 * 5) : 0, late = v > nc.v * 1.08 && nc.d < need + 25;
    setText('dCorner', `${nc.dir > 0 ? '↱ 오른쪽' : '↰ 왼쪽'} 코너 ${Math.round(nc.d)}m · 권장 ${Math.round(nc.v * 3.6)}km/h${late ? ' · 감속!' : ''}`);
    cor.classList.toggle('warn', late || sliding);
  } else { setText('dCorner', sliding ? '미끄러짐! 속도를 줄이세요' : '직선'); cor.classList.toggle('warn', sliding); }
  const s = ((sim.x % C.L) + C.L) % C.L, cur = COURSE.lapT0 === null ? 0 : sim.t - COURSE.lapT0;
  setText('dLap', C.def.kind === 'circuit' ? `랩 ${COURSE.lap + 1} · ${fmtLap(cur)} · 최고 ${fmtLap(COURSE.best[C.id])}` : `${(s / 1000).toFixed(2)} / ${(C.L / 1000).toFixed(2)} km · 경사 ${(P.grade * 100).toFixed(1)}%`);
  drawMiniMap();
}
function drawMiniMap() {
  const C = COURSE.c, cv = $('miniMap'); if (!C || performance.now() - COURSE.mapDrawT < 100) return;
  COURSE.mapDrawT = performance.now();
  const W = 160, ctx2 = cv.getContext('2d');
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < C.N; i += 4) { x0 = Math.min(x0, C.x[i]); x1 = Math.max(x1, C.x[i]); z0 = Math.min(z0, C.z[i]); z1 = Math.max(z1, C.z[i]); }
  const k = (W - 24) / Math.max(x1 - x0, z1 - z0), ox = (W - (x1 - x0) * k) / 2, oz = (W - (z1 - z0) * k) / 2;
  const X = x => ox + (x - x0) * k, Z = z => oz + (z - z0) * k;
  ctx2.clearRect(0, 0, W, W);
  ctx2.lineWidth = 5; ctx2.strokeStyle = 'rgba(233,233,234,.85)'; ctx2.lineJoin = 'round'; ctx2.beginPath();
  for (let i = 0; i <= C.N; i += 3) { const j = i % C.N; i ? ctx2.lineTo(X(C.x[j]), Z(C.z[j])) : ctx2.moveTo(X(C.x[j]), Z(C.z[j])); }
  ctx2.closePath(); ctx2.stroke();
  ctx2.fillStyle = '#e9e9ea'; ctx2.fillRect(X(C.x[0]) - 6, Z(C.z[0]) - 1.5, 12, 3);             // 출발선
  const p = C.at(sim.x);
  ctx2.beginPath(); ctx2.arc(X(p.x), Z(p.z), 6, 0, 7); ctx2.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); ctx2.fill();
  ctx2.lineWidth = 2; ctx2.strokeStyle = '#101113'; ctx2.stroke();
}
// 차 색
const PAINT = { i: 0 };
try { const pi = +localStorage.getItem('sonata6at.paint'); if (pi >= 0 && pi < 6) PAINT.i = pi; } catch (e) {}
function setPaint(i) {
  PAINT.i = i; if (drive.paint) drive.paint.color.setHex(PAINTS[i][1]);
  $('paintRow').querySelectorAll('.swatch').forEach((b, k) => b.setAttribute('aria-checked', k === i));
  try { localStorage.setItem('sonata6at.paint', String(i)); } catch (e) {}
}
$('paintRow').innerHTML = PAINTS.map(([n, c], i) => `<button type="button" class="swatch" role="radio" aria-label="${n}" title="${n}" style="background:#${c.toString(16).padStart(6, '0')}" aria-checked="${i === PAINT.i}"></button>`).join('');
$('paintRow').addEventListener('click', e => { const b = e.target.closest('.swatch'); if (b) setPaint([...$('paintRow').children].indexOf(b)); });
setText('courseInfo', '끝없는 직선 도로입니다. 아래 "앞 도로 경사"로 오르막·내리막을 만들 수 있습니다.');



// ---- 주행 모드와 노면 ----
buildSegStr($('modeSeg'), Object.keys(MODES).map(k => ({ v: k, t: MODES[k].name })), 'normal', v => {
  if (sim.mode === v) return; sim.mode = v;
  say({ eco: '에코: 일찍 올리고 늦게 내려 rpm을 낮게 유지합니다.', normal: '보통 모드입니다.', sport: '스포츠: 높은 rpm까지 끌고 빨리 변속합니다.', snow: '눈길 출발: 2단으로 출발해 바퀴가 덜 헛돕니다.' }[v]);
  if (v === 'snow' && sim.lever === 'D' && !sim.manual && sim.cur === 1 && Math.abs(sim.v) < 3) beginShift(2);
});
buildSegStr($('surfSeg'), [{ v: 'dry', t: '마른 길' }, { v: 'wet', t: '빗길' }, { v: 'snow', t: '눈길' }], 'dry', v => {
  if (sim.surface === v) return; sim.surface = v; sim.mu = MU[v];
  say({ dry: '마른 길: 접지력이 충분합니다.', wet: '빗길: 접지력이 절반쯤으로 줄고 제동 거리가 늘어납니다.', snow: '눈길: 접지력이 아주 낮습니다. 페달을 살살 밟으세요.' }[v]);
});
function fuelText() {
  const kmh = Math.abs(sim.v) * 3.6, gps = sim.fuel.gps;
  if (kmh < 2) return '정차 ' + (gps * 3600 / 745).toFixed(1) + ' L/h';
  if (gps === 0) return '연료 차단';
  return Math.min(99.9, Math.abs(sim.v) * 0.745 / gps).toFixed(1) + ' km/L';
}

// ---- 엔진 소리 ----
// 4기통은 한 바퀴에 두 번 폭발하므로 기본음 f = rpm/30(공회전 27Hz, 6,000rpm 200Hz). 이 저음은 노트북·휴대폰 스피커가 거의 못 내므로
// 2·3·4·6배음과 배기 잡음을 넉넉히 섞고, 90Hz 아래는 걸러 들리는 대역에 힘을 싣는다. 출력은 레벨 막대로 보여 준다
const snd = { ctx: null, on: false, buf: null };
const VOL = { v: 0.6 };
try { const sv = parseFloat(localStorage.getItem('sonata6at.vol')); if (sv >= 0 && sv <= 1) { VOL.v = sv; $('vol').value = Math.round(sv * 100); } } catch (e) {}
$('volLabel').textContent = Math.round(VOL.v * 100) + '%';
$('vol').addEventListener('input', e => { VOL.v = e.target.value / 100; $('volLabel').textContent = e.target.value + '%'; try { localStorage.setItem('sonata6at.vol', String(VOL.v)); } catch (_) {} });
function engineGraph(c, dest) {
  const n = {}, mk = (type, mul, g) => { const o = c.createOscillator(), gg = c.createGain(); o.type = type; gg.gain.value = g; o.connect(gg); o.start(); return { o, mul, g: gg }; };
  n.osc = [mk('sawtooth', 1, 0.22), mk('sawtooth', 2, 0.30), mk('square', 0.5, 0.10), mk('triangle', 3, 0.26), mk('sawtooth', 4, 0.18), mk('sine', 6, 0.12), mk('sine', 8, 0.08)];
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  n.noise = c.createBufferSource(); n.noise.buffer = buf; n.noise.loop = true; n.noise.start();
  n.bp = c.createBiquadFilter(); n.bp.type = 'bandpass'; n.bp.Q.value = 1.1; n.ng = c.createGain(); n.noise.connect(n.bp).connect(n.ng);
  n.lp = c.createBiquadFilter(); n.lp.type = 'lowpass'; n.lp.Q.value = 0.7;
  n.osc.forEach(x => x.g.connect(n.lp)); n.ng.connect(n.lp);
  const shaper = c.createWaveShaper(), curve = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; curve[i] = Math.tanh(2.2 * x); } shaper.curve = curve;
  n.am = c.createGain(); n.am.gain.value = 0.7;
  n.lfo = c.createOscillator(); n.lfo.type = 'sine'; const depth = c.createGain(); depth.gain.value = 0.25; n.lfo.connect(depth).connect(n.am.gain); n.lfo.start();   // 폭발 주기의 떨림
  n.hp = c.createBiquadFilter(); n.hp.type = 'highpass'; n.hp.frequency.value = 130; n.hp.Q.value = 0.5;
  n.out = c.createGain(); n.out.gain.value = 0;
  // 타이어 끌리는 소리: 잡음을 1.7kHz 근처로 좁게 걸러 미끄러질 때만 키운다
  n.sqBp = c.createBiquadFilter(); n.sqBp.type = 'bandpass'; n.sqBp.frequency.value = 1700; n.sqBp.Q.value = 7;
  n.sqG = c.createGain(); n.sqG.gain.value = 0; n.noise.connect(n.sqBp).connect(n.sqG).connect(dest);
  n.lp.connect(shaper).connect(n.am).connect(n.hp).connect(n.out).connect(dest);
  return n;
}
const engineGain = (rpm, th) => 0.22 + 0.22 * th + 0.08 * Math.min(1, rpm / 6500);
function engineSet(n, t, rpm, th, gain) {
  const f = Math.max(20, rpm / 30);
  n.osc.forEach(x => x.o.frequency.setTargetAtTime(f * x.mul, t, 0.03)); n.lfo.frequency.setTargetAtTime(f / 2, t, 0.03);
  n.bp.frequency.setTargetAtTime(300 + f * 5, t, 0.05); n.ng.gain.setTargetAtTime(0.06 + 0.22 * th, t, 0.05);
  n.lp.frequency.setTargetAtTime(1000 + rpm * 0.5 + th * 1600, t, 0.05);
  n.out.gain.setTargetAtTime(gain, t, 0.04);
}
function soundToggle() {
  if (!snd.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { say('이 브라우저는 소리를 낼 수 없습니다.', true); return; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}   // iPhone: 무음 스위치가 켜져 있어도 재생
    const c = new AC(), an = c.createAnalyser(); an.fftSize = 512; an.connect(c.destination);
    snd.ctx = c; snd.an = an; snd.buf = new Float32Array(an.fftSize); snd.n = engineGraph(c, an);
  }
  snd.on = !snd.on;
  if (snd.on) snd.ctx.resume().catch(() => {});
  $('sound').textContent = snd.on ? '엔진 소리 끄기' : '엔진 소리 켜기';
  $('sound').setAttribute('aria-pressed', snd.on);
}
$('sound').addEventListener('click', soundToggle);
document.addEventListener('visibilitychange', () => { if (snd.ctx) (document.hidden ? snd.ctx.suspend() : snd.on && snd.ctx.resume()); });
function updateSound(rpm) {
  if (!snd.ctx) return;
  const t = snd.ctx.currentTime, dip = sim.shift && sim.shift.t < sim.shift.dur * 0.6 ? 0.5 : 1;
  engineSet(snd.n, t, rpm, sim.th, snd.on ? engineGain(rpm, sim.th) * dip * VOL.v / 0.6 : 0);
  const sl = slipAmount(); snd.n.sqG.gain.setTargetAtTime(snd.on ? sl * sl * 0.55 * VOL.v / 0.6 : 0, t, 0.05); snd.n.sqBp.frequency.setTargetAtTime(1500 + 500 * sl, t, 0.1);
  // 레벨 막대와 안내: 실제로 소리가 나가는지 보여 준다
  snd.an.getFloatTimeDomainData(snd.buf); let e = 0; for (const x of snd.buf) e += x * x;
  const rms = Math.sqrt(e / snd.buf.length); $('sndMeter').style.width = Math.min(100, rms * 400) + '%';
  const hint = !snd.on ? '' : snd.ctx.state !== 'running' ? '브라우저가 소리를 막고 있습니다. "엔진 소리" 버튼을 한 번 더 눌러 주세요.' :
    rms > 0.01 ? '소리가 나가고 있습니다(초록 막대). 들리지 않으면 기기 음량과, 휴대폰은 무음 모드를 확인하세요.' : '';
  if ($('sndHint').textContent !== hint) { $('sndHint').textContent = hint; $('sndHint').hidden = !hint; }
}
