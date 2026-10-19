// 화면 3: 주행 3D 장면(차 모델·코스 장면·밤·비눈·게임 패드·미끄럼 효과).
// 여러 파일이 전역 이름을 함께 씁니다(sim.js·course.js·dynamics.js 다음, 이 순서대로 불러와야 합니다).
// ---- 휴대폰: 한 손가락은 페이지 스크롤, 두 손가락일 때만 3D 시점을 돌린다 ----
// OrbitControls(r128)는 touchstart/touchmove에서 스크롤을 막으므로, 바깥 상자에서 한 손가락 터치를 먼저 가로챈다.
function touchGuard(el) {
  ['touchstart', 'touchmove'].forEach(t => el.addEventListener(t, e => { if (e.touches.length < 2) e.stopPropagation(); }, { capture: true, passive: true }));
}
['box3F', 'box3R', 'lab3d', 'box3D', 'boxT'].forEach(id => touchGuard($(id)));
function twoFingerTouch(controls) { controls.touches = { ONE: -1, TWO: THREE.TOUCH.DOLLY_ROTATE }; }

// ---- 주행 3D: 차는 제자리에 두고 길과 주변을 뒤로 흘려 보낸다 (차의 앞은 −z) ----
const drive = { ready: false, loading: false, visible: false, dist: 0, wheel: 0, acc: 0, lastV: 0, pitch: 0, pv: 0, size: 0,
  props: [], wheels: [], strips: [], evtN: 0, tipDone: false, wheelF: 0, surf: '' };
const DRIVE_CAMS = { back: [-4.5, 2.4, 8.5], side: [-9.5, 1.4, -1], top: [-0.01, 15, 2] };
// 시점: 차 기준 오프셋을 차의 위치·방향으로 옮긴다. 이후 매 프레임 차를 따라 같은 상대 위치를 유지한다(끌어서 돌린 것도 유지)
function driveCam(name) {
  const P = drive.pose || { x: 0, y: 0, z: 0, psi: 0 }, o = new THREE.Vector3(...DRIVE_CAMS[name]).applyAxisAngle(new THREE.Vector3(0, 1, 0), P.psi);
  drive.camera.position.set(P.x + o.x, P.y + o.y, P.z + o.z);
  const t = new THREE.Vector3(0, 0.7, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), P.psi);
  drive.controls.target.set(P.x + t.x, P.y + t.y, P.z + t.z); drive.controls.update(); drive.camPsi = P.psi; drive.prevPose = Object.assign({ camPsi: P.psi }, P);
}
// 옆모습 단면(z: 앞 −, y: 위 +)을 폭 방향(x)으로 밀어 만든다
function sideExtrude(T3, pts, width, arcs) {
  const sh = new T3.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p === 'arc') { const a = arcs.shift(); sh.lineTo(a[0] - a[2], 0.30); sh.absarc(a[0], a[1], a[2], Math.PI, 0, true); }
    else sh.lineTo(p[0], p[1]);
  }
  const g = new T3.ExtrudeGeometry(sh, { depth: width, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 16 });
  g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2);
  return g;
}
// ---- 차 모델: 쏘나타(DN8)급 중형 세단. 전장 4.9m, 전폭 1.86m, 전고 1.45m, 휠베이스 2.84m ----
// 옆모습 경로(z 앞 −, y 위)를 폭 방향으로 밀어 낸 뒤, 꼭짓점을 오므려 위로 좁아지는 차체(텀블홈)와 둥근 모서리를 만든다
function sidePath(T3, cmds) {
  const sh = new T3.Shape();
  cmds.forEach(c => {
    if (c[0] === 'M') sh.moveTo(c[1], c[2]); else if (c[0] === 'L') sh.lineTo(c[1], c[2]);
    else if (c[0] === 'Q') sh.quadraticCurveTo(c[1], c[2], c[3], c[4]);
    else if (c[0] === 'A') { sh.lineTo(c[1] - c[3], c[2] - 0.04); sh.absarc(c[1], c[2], c[3], Math.PI, 0, true); }
  });
  return sh;
}
function sideSolid(T3, cmds, width, shapeFn, bevel) {
  const g = new T3.ExtrudeGeometry(sidePath(T3, cmds), { depth: width, bevelEnabled: bevel !== false, bevelThickness: 0.045, bevelSize: 0.045, bevelSegments: 4, curveSegments: 20 });
  g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2);                 // 경로의 (z, y) → 차의 (z, y), 폭 → x
  if (shapeFn) { const P = g.attributes.position; for (let i = 0; i < P.count; i++) P.setX(i, P.getX(i) * shapeFn(P.getY(i), P.getZ(i))); }
  g.computeVertexNormals(); return g;
}
function softShadowTex(T3) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  const gr = c.createRadialGradient(64, 64, 8, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 128, 128); return new T3.CanvasTexture(cv);
}
const PAINTS = [['오렌지', 0xd9480f], ['화이트', 0xe9e7e1], ['그레이', 0x50555c], ['블랙', 0x141518], ['블루', 0x1f3d66], ['레드', 0x8f1d21]];
function buildCar(T3, std) {
  const car = new T3.Group(), o = { car, wheels: [], pivots: [] };
  car.rotation.order = 'YXZ';
  const sh = new T3.Mesh(new T3.PlaneGeometry(2.6, 5.6), new T3.MeshBasicMaterial({ map: softShadowTex(T3), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; car.add(sh);
  const body = new T3.Group(); body.position.y = 0.45; car.add(body); o.body = body;   // 차체 기울기의 회전 중심(차축 높이 근처)
  const paint = new T3.MeshPhysicalMaterial({ color: PAINTS[0][1], metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
  const glass = std(0x0e141a, { metalness: 0.9, roughness: 0.05, envMapIntensity: 1.2 }), black = std(0x15171a, { roughness: 0.5 }), gloss = std(0x0b0c0e, { metalness: 0.7, roughness: 0.15 });
  const chrome = std(0xdfe3e8, { metalness: 1, roughness: 0.12 }), trim = std(0x26282c, { roughness: 0.7 });
  o.paint = paint;
  const part = (geo, mat, x, y, z, rx) => { const m = new T3.Mesh(geo, mat); m.position.set(x, y - 0.45, z); if (rx) m.rotation.x = rx; body.add(m); return m; };
  const WB = 1.42, R = CFG.tireR;
  // 차체: 범퍼·보닛·트렁크와 휠 아치. 위로 갈수록, 앞뒤 끝으로 갈수록 폭을 줄인다
  part(sideSolid(T3, [['M', -2.36, 0.30], ['A', -WB, R, 0.43], ['L', 0.99, 0.30], ['A', WB, R, 0.43], ['L', 2.33, 0.31],
    ['Q', 2.47, 0.34, 2.46, 0.55], ['Q', 2.45, 0.78, 2.36, 0.86], ['Q', 2.25, 0.98, 1.95, 1.0], ['L', 1.62, 0.99], ['L', -0.88, 0.95],
    ['Q', -1.6, 0.92, -2.18, 0.80], ['Q', -2.40, 0.74, -2.47, 0.60], ['Q', -2.50, 0.40, -2.36, 0.30]], 1.76,
    (y, z) => { let k = 1; if (y > 0.78) k *= 1 - 0.07 * Math.min(1, (y - 0.78) / 0.22); const az = Math.abs(z); if (az > 1.85) k *= 1 - 0.13 * Math.pow(Math.min(1, (az - 1.85) / 0.62), 2);
      if (y < 0.42) k *= 1 - 0.05 * Math.min(1, (0.42 - y) / 0.12); return k; }), paint, 0, 0, 0);
  // 유리 지붕(그린하우스): 앞유리 경사, 둥근 지붕, 패스트백 뒷유리. 위로 갈수록 20% 좁아짐
  const gh = y => 1 - 0.2 * clamp((y - 0.96) / 0.48, 0, 1);
  part(sideSolid(T3, [['M', -0.88, 0.94], ['L', -0.12, 1.41], ['Q', 0.55, 1.47, 1.05, 1.40], ['Q', 1.45, 1.20, 1.66, 0.98], ['L', -0.88, 0.94]], 1.50, (y) => gh(y)), glass, 0, 0, 0);
  part(sideSolid(T3, [['M', -0.04, 1.405], ['Q', 0.55, 1.465, 1.02, 1.395], ['L', 1.0, 1.425], ['Q', 0.55, 1.495, -0.04, 1.432]], 1.17, null, false), paint, 0, 0, 0);   // 지붕 패널
  // 필러: A(앞유리 양옆), B(검은 유광), C(뒷유리 양옆, 굵게)
  const pillar = (z0, y0, z1, y1, w, mat) => { const len = Math.hypot(z1 - z0, y1 - y0), ym = (y0 + y1) / 2, half = 0.75 * gh(ym);
    [-1, 1].forEach(s => part(new T3.BoxGeometry(w, 0.05, len), mat, s * (half - w / 2 + 0.01), ym, (z0 + z1) / 2, -Math.atan2(y1 - y0, z1 - z0))); };
  pillar(-0.86, 0.95, -0.12, 1.41, 0.07, paint); pillar(1.05, 1.40, 1.64, 0.99, 0.16, paint);
  [-1, 1].forEach(s => part(new T3.BoxGeometry(0.03, 0.42, 0.07), gloss, s * 0.69, 1.17, 0.50));
  [-1, 1].forEach(s => part(new T3.BoxGeometry(0.012, 0.02, 2.46), chrome, s * 0.80, 0.975, 0.37));                    // 벨트라인 크롬
  // 사이드미러, 문 이음매, 손잡이, 사이드 스커트
  [-1, 1].forEach(s => { const m = part(new T3.SphereGeometry(0.1, 16, 10), paint, s * 0.99, 1.0, -0.70); m.scale.set(1.1, 0.75, 1.4);
    part(new T3.BoxGeometry(0.12, 0.03, 0.06), black, s * 0.88, 0.97, -0.70); });
  [-0.82, 0.47, 1.55].forEach(z => [-1, 1].forEach(s => part(new T3.BoxGeometry(0.006, 0.55, 0.008), trim, s * 0.928, 0.66, z)));
  [-0.25, 1.05].forEach(z => [-1, 1].forEach(s => part(new T3.BoxGeometry(0.012, 0.03, 0.15), chrome, s * 0.935, 0.86, z)));
  [-1, 1].forEach(s => part(new T3.BoxGeometry(0.04, 0.07, 1.95), black, s * 0.90, 0.33, 0));
  // 앞: 캐스케이딩 그릴, 가늘고 긴 헤드램프, 보닛 끝 주간주행등, 아래 흡기구, 번호판
  const grille = new T3.Shape(); grille.moveTo(-0.62, 0.38); grille.lineTo(0.62, 0.38); grille.lineTo(0.52, 0.66); grille.lineTo(-0.52, 0.66); grille.lineTo(-0.62, 0.38);
  const gg = new T3.ExtrudeGeometry(grille, { depth: 0.06, bevelEnabled: false }); part(gg, gloss, 0, 0, -2.52);
  for (let i = 0; i < 5; i++) part(new T3.BoxGeometry(1.1 - i * 0.04, 0.008, 0.02), chrome, 0, 0.42 + i * 0.05, -2.47);
  o.head = std(0xffffff, { emissive: 0xfff4d6, emissiveIntensity: 0.9 });
  [-1, 1].forEach(s => { const h = part(new T3.BoxGeometry(0.42, 0.065, 0.12), o.head, s * 0.56, 0.73, -2.33); h.rotation.y = -s * 0.25;
    part(new T3.BoxGeometry(0.46, 0.012, 0.02), o.head, s * 0.36, 0.805, -2.24); });
  part(new T3.BoxGeometry(1.3, 0.09, 0.05), black, 0, 0.33, -2.40);
  part(new T3.BoxGeometry(0.52, 0.11, 0.015), std(0xf2f2f2), 0, 0.47, -2.52);
  // 뒤: 가로로 이어진 테일램프, 램프 묶음, 후진등, 디퓨저와 머플러, 번호판
  o.tail = std(0x7a1010, { emissive: 0x550000, roughness: 0.3 }); o.rev = std(0xdddddd, { emissive: 0x000000 });
  part(new T3.BoxGeometry(1.62, 0.04, 0.03), o.tail, 0, 0.885, 2.405);
  [-1, 1].forEach(s => { const t = part(new T3.BoxGeometry(0.34, 0.08, 0.06), o.tail, s * 0.68, 0.86, 2.36); t.rotation.y = s * 0.3; });
  [-1, 1].forEach(s => part(new T3.BoxGeometry(0.12, 0.05, 0.02), o.rev, s * 0.5, 0.52, 2.46));
  part(new T3.BoxGeometry(1.2, 0.08, 0.06), black, 0, 0.34, 2.43);
  const pipe = new T3.CylinderGeometry(0.04, 0.04, 0.1, 16); pipe.rotateX(Math.PI / 2);
  [-1, 1].forEach(s => part(pipe, chrome, s * 0.45, 0.34, 2.47));
  part(new T3.BoxGeometry(0.52, 0.11, 0.015), std(0xf2f2f2), 0, 0.64, 2.465);
  // 휠 하우스 안쪽(검은 라이너): 아치 속으로 반대편이 비쳐 보이지 않게
  const liner = new T3.CylinderGeometry(0.45, 0.45, 1.62, 24, 1, true, -Math.PI / 2, Math.PI); liner.rotateZ(Math.PI / 2);
  [-WB, WB].forEach(z => part(liner, std(0x0b0b0c, { side: T3.DoubleSide, roughness: 1 }), 0, R, z));
  // 바퀴: 둥근 옆면 타이어 + 5스포크 알로이 휠, 돌지 않는 브레이크 디스크와 빨간 캘리퍼
  const tireG = new T3.LatheGeometry([[0.22, -0.105], [0.3, -0.108], [0.325, -0.095], [R, -0.06], [R, 0.06], [0.325, 0.095], [0.3, 0.108], [0.22, 0.105]].map(([r, w]) => new T3.Vector2(r, w)), 40);
  tireG.rotateZ(Math.PI / 2);
  const tireM = std(0x131313, { roughness: 0.92 }), rimM = std(0xc8ccd2, { metalness: 0.85, roughness: 0.25 }), barrel = new T3.CylinderGeometry(0.212, 0.212, 0.2, 28, 1, true); barrel.rotateZ(Math.PI / 2);
  const discG = new T3.CylinderGeometry(0.165, 0.165, 0.025, 28); discG.rotateZ(Math.PI / 2);
  [[-0.81, -WB], [0.81, -WB], [-0.81, WB], [0.81, WB]].forEach(([x, z], i) => {
    const side = Math.sign(x), pv = new T3.Group(); pv.position.set(x, R, z); car.add(pv); if (i < 2) o.pivots.push(pv);
    const w = new T3.Group(); pv.add(w); o.wheels.push(w);
    w.add(new T3.Mesh(tireG, tireM)); w.add(new T3.Mesh(barrel, std(0x2a2c30, { side: T3.DoubleSide })));
    const lip = new T3.Mesh(new T3.RingGeometry(0.2, 0.225, 32), rimM); lip.rotation.y = side * Math.PI / 2; lip.position.x = side * 0.1; w.add(lip);
    for (let k = 0; k < 5; k++) { const sp = new T3.Mesh(new T3.BoxGeometry(0.025, 0.16, 0.05), rimM), a = k * TAU / 5;
      sp.position.set(side * 0.095, Math.cos(a) * 0.125, Math.sin(a) * 0.125); sp.rotation.x = -a; w.add(sp); }
    const cap = new T3.Mesh(new T3.CylinderGeometry(0.05, 0.05, 0.03, 20), rimM); cap.rotation.z = Math.PI / 2; cap.position.x = side * 0.1; w.add(cap);
    const disc = new T3.Mesh(discG, std(0x6d7076, { metalness: 0.8, roughness: 0.4 })); disc.position.x = side * 0.035; pv.add(disc);
    const cal = new T3.Mesh(new T3.BoxGeometry(0.05, 0.1, 0.13), std(0xb3261e, { roughness: 0.4 })); cal.position.set(side * 0.055, 0.1, z < 0 ? 0.09 : -0.09); pv.add(cal);
  });
  return o;
}
// 금속·도장이 비치도록 하늘 그라데이션 + 해를 환경맵으로
function skyEnv(T3, renderer) {
  const es = new T3.Scene(), sg = new T3.SphereGeometry(100, 32, 16), col = [], P = sg.attributes.position;
  for (let i = 0; i < P.count; i++) { const t = P.getY(i) / 100; const c = t > 0 ? [0.55 + 0.3 * t, 0.65 + 0.25 * t, 0.78 + 0.2 * t] : [0.25 + 0.1 * t, 0.27 + 0.1 * t, 0.24 + 0.1 * t]; col.push(...c); }
  sg.setAttribute('color', new T3.Float32BufferAttribute(col, 3));
  es.add(new T3.Mesh(sg, new T3.MeshBasicMaterial({ vertexColors: true, side: T3.BackSide })));
  const sun = new T3.Mesh(new T3.SphereGeometry(8, 16, 8), new T3.MeshBasicMaterial({ color: 0xffffff })); sun.position.set(-40, 60, 30); es.add(sun);
  const pm = new T3.PMREMGenerator(renderer), tex = pm.fromScene(es, 0.02).texture; pm.dispose(); return tex;
}

// ---- 코스 장면: 지형(높이장), 도로, 차선, 가드레일, 연석, 나무, 출발선 ----
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function buildCourseScene(T3, c, std) {
  const g = new T3.Group(), def = c.def, w = def.width, N = c.N, rnd = seeded(c.L | 0);
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const right = i => [Math.cos(c.psi[i]), -Math.sin(c.psi[i])];        // 앞 방향(−sinψ, −cosψ)의 오른쪽
  // 가장 가까운 도로점(성긴 탐색 후 근처를 다시 봄)
  const nearest = (x, z) => { let bi = 0, bd = Infinity; for (let i = 0; i < N; i += 4) { const d = (c.x[i] - x) ** 2 + (c.z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
    for (let j = -4; j <= 4; j++) { const i = (bi + j + N) % N, d = (c.x[i] - x) ** 2 + (c.z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } } return [bi, Math.sqrt(bd)]; };
  const A = { country: 9, mountain: 26, circuit: 1.2 }[def.kind === 'road' ? 'country' : def.kind];
  const hills = (x, z) => A * (Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.009) + 0.5 * Math.sin(x * 0.027) * Math.sin(z * 0.023 + 0.7));
  const terrainH = (x, z) => { const [i, d] = nearest(x, z), b = ss(w / 2 + 2, w / 2 + 55, d);
    return c.y[i] - 0.35 + b * (hills(x, z) + (def.kind === 'mountain' ? (d - w / 2) * 0.18 : 0)); };
  // 지형: 코스 둘레 220m까지 덮는 격자. 색은 높이·경사·도로와의 거리로
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, c.x[i]); x1 = Math.max(x1, c.x[i]); z0 = Math.min(z0, c.z[i]); z1 = Math.max(z1, c.z[i]); }
  const M = 220, nx = 170, nz = Math.round(nx * (z1 - z0 + 2 * M) / (x1 - x0 + 2 * M));
  const tg = new T3.PlaneGeometry(x1 - x0 + 2 * M, z1 - z0 + 2 * M, nx, nz); tg.rotateX(-Math.PI / 2); tg.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const TP = tg.attributes.position, tcol = [];
  for (let i = 0; i < TP.count; i++) {
    const x = TP.getX(i), z = TP.getZ(i), [ni, d] = nearest(x, z), h = terrainH(x, z); TP.setY(i, h);
    const n = 0.85 + 0.15 * rnd(), rock = def.kind === 'mountain' ? ss(8, 30, h - c.y[ni]) : 0, sh = 1 - ss(w / 2, w / 2 + 2.5, d);
    const grass = [0.33 * n, 0.45 * n, 0.24 * n], stone = [0.46 * n, 0.45 * n, 0.42 * n], gravel = [0.5, 0.48, 0.44];
    const col = grass.map((v, k) => v * (1 - rock) + stone[k] * rock).map((v, k) => v * (1 - sh) + gravel[k] * sh); tcol.push(...col);
  }
  tg.setAttribute('color', new T3.Float32BufferAttribute(tcol, 3)); tg.computeVertexNormals();
  const terrainMat = std(0xffffff, { vertexColors: true, roughness: 1 }), terrain = new T3.Mesh(tg, terrainMat); g.add(terrain);
  // 띠 만들기: 가운데 선에서 오른쪽으로 a~b만큼 떨어진 띠(only로 일부 구간만)
  const ribbon = (a, b, dy, mat, only, colorFn) => {
    const pos = [], col = [];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N; if (only && !only(i)) continue;
      const [ri, rj] = [right(i), right(j)], P = (k, r, off) => [c.x[k] + r[0] * off, c.y[k] + dy, c.z[k] + r[1] * off];
      const q = [P(i, ri, a), P(i, ri, b), P(j, rj, a), P(j, rj, b)];
      pos.push(...q[0], ...q[1], ...q[2], ...q[1], ...q[3], ...q[2]);          // 위를 보는 면
      if (colorFn) { const cc = colorFn(i); for (let t = 0; t < 6; t++) col.push(...cc); }
    }
    const geo = new T3.BufferGeometry(); geo.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
    if (colorFn) geo.setAttribute('color', new T3.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals(); const m = new T3.Mesh(geo, mat); g.add(m); return m;
  };
  const roadM = std(0x3a3d42, { roughness: 0.92 }), whiteM = std(0xeeeeee, { roughness: 0.6 }), yellowM = std(0xf2c230, { roughness: 0.6 });
  ribbon(-w / 2, w / 2, 0.02, roadM);
  if (def.kind === 'circuit') {
    ribbon(-w / 2 + 0.3, -w / 2 + 0.55, 0.035, whiteM); ribbon(w / 2 - 0.55, w / 2 - 0.3, 0.035, whiteM);
    // 연석: 코너(반경 110m 아래)의 양쪽 바깥, 2m마다 빨강·흰색
    const sharp = i => Math.abs(c.kap[i]) > 1 / 110 || Math.abs(c.kap[(i + 6) % N]) > 1 / 110 || Math.abs(c.kap[(i - 6 + N) % N]) > 1 / 110;
    const curbM = std(0xffffff, { vertexColors: true, roughness: 0.7 }), rw = i => (i % 2 ? [0.85, 0.12, 0.12] : [0.95, 0.95, 0.95]);
    ribbon(w / 2, w / 2 + 1.2, 0.06, curbM, sharp, rw); ribbon(-w / 2 - 1.2, -w / 2, 0.06, curbM, sharp, rw);
    // 출발선(바둑판), 메인 직선의 피트 벽과 관람석
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 16; const cx = cv.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { cx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; cx.fillRect(i * 8, j * 8, 8, 8); }
    const fin = new T3.Mesh(new T3.PlaneGeometry(w, 1.5), new T3.MeshStandardMaterial({ map: new T3.CanvasTexture(cv), roughness: 0.8 }));
    fin.rotation.set(-Math.PI / 2, 0, 0); fin.position.set(c.x[0], c.y[0] + 0.04, c.z[0]); g.add(fin);
    const wall = new T3.Mesh(new T3.BoxGeometry(0.5, 1.1, 360), std(0xd9dde2)); wall.position.set(c.x[0] - w / 2 - 4, c.y[0] + 0.55, -180); g.add(wall);
    const stand = new T3.Mesh(new T3.BoxGeometry(14, 7, 160), std(0x8a8f96)); stand.position.set(c.x[0] - w / 2 - 22, c.y[0] + 3.5, -120); stand.rotation.z = -0.35; g.add(stand);
    const roof = new T3.Mesh(new T3.BoxGeometry(18, 0.4, 164), std(0xb8332e)); roof.position.set(c.x[0] - w / 2 - 22, c.y[0] + 9.5, -120); g.add(roof);
    const gantry = new T3.Group(); [-1, 1].forEach(sd => { const p = new T3.Mesh(new T3.BoxGeometry(0.4, 6, 0.4), std(0x2a2c30)); p.position.set(sd * (w / 2 + 1), 3, 0); gantry.add(p); });
    const beam = new T3.Mesh(new T3.BoxGeometry(w + 2.4, 0.9, 0.4), std(0xd9480f)); beam.position.y = 6; gantry.add(beam);
    gantry.position.set(c.x[0], c.y[0], c.z[0]); gantry.rotation.y = c.psi[0]; g.add(gantry);
  } else {
    ribbon(-0.2, -0.08, 0.035, yellowM); ribbon(0.08, 0.2, 0.035, yellowM);              // 중앙선(노란 겹실선)
    ribbon(-w / 2 + 0.15, -w / 2 + 0.3, 0.035, whiteM); ribbon(w / 2 - 0.3, w / 2 - 0.15, 0.035, whiteM);
  }
  // 가드레일: 산길은 양쪽 전부, 국도는 굽은 곳만
  if (def.kind !== 'circuit') {
    const need = def.kind === 'mountain' ? null : i => Math.abs(c.kap[i]) > 1 / 220;
    const railM = std(0xb7bcc2, { metalness: 0.7, roughness: 0.35, side: T3.DoubleSide });
    [-1, 1].forEach(sd => {
      const off = sd * (w / 2 + 0.9), pos = [];
      for (let i = 0; i < N; i++) { if (need && !need(i)) continue; const j = (i + 1) % N, ri = right(i), rj = right(j);
        const p = (k, r, y) => [c.x[k] + r[0] * off, c.y[k] + y, c.z[k] + r[1] * off];
        const a = p(i, ri, 0.45), b = p(i, ri, 0.8), cc = p(j, rj, 0.45), d = p(j, rj, 0.8); pos.push(...a, ...cc, ...b, ...b, ...cc, ...d); }
      if (!pos.length) return;
      const geo = new T3.BufferGeometry(); geo.setAttribute('position', new T3.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals(); g.add(new T3.Mesh(geo, railM));
      const idx = []; for (let i = 0; i < N; i += 2) if (!need || need(i)) idx.push(i);
      const posts = new T3.InstancedMesh(new T3.BoxGeometry(0.12, 0.8, 0.12), std(0x8d9299, { metalness: 0.6 }), idx.length), m4 = new T3.Matrix4();
      idx.forEach((i, k) => { const r = right(i); m4.makeTranslation(c.x[i] + r[0] * off, c.y[i] + 0.4, c.z[i] + r[1] * off); posts.setMatrixAt(k, m4); }); g.add(posts);
    });
  }
  // 나무: 도로에서 6m 넘게 떨어진 곳에만, 지형 높이에 맞춰 심는다
  const trees = []; let tries = 0;
  const want = def.kind === 'circuit' ? 260 : 650;
  while (trees.length < want && tries++ < want * 6) {
    const x = x0 - M * 0.8 + rnd() * (x1 - x0 + 1.6 * M), z = z0 - M * 0.8 + rnd() * (z1 - z0 + 1.6 * M), [, d] = nearest(x, z);
    if (d < w / 2 + 6 + (def.kind === 'circuit' ? 14 : 0)) continue;
    trees.push([x, terrainH(x, z), z, 0.7 + rnd() * 0.8]);
  }
  const trunkI = new T3.InstancedMesh(new T3.CylinderGeometry(0.18, 0.26, 2.2, 7), std(0x5f4632), trees.length);
  const crownI = new T3.InstancedMesh(new T3.ConeGeometry(1.6, 4.4, 9), std(0x2e5e3c, { roughness: 0.9 }), trees.length);
  const m4 = new T3.Matrix4(), q = new T3.Quaternion(), S = new T3.Vector3(), V = new T3.Vector3();
  trees.forEach(([x, y, z, k], i) => { S.set(k, k, k); V.set(x, y + 1.1 * k, z); m4.compose(V, q, S); trunkI.setMatrixAt(i, m4); V.set(x, y + 3.9 * k, z); m4.compose(V, q, S); crownI.setMatrixAt(i, m4); });
  g.add(trunkI); g.add(crownI);
  // 굽은 길 경고판: 반경 70m 아래 코너의 40m 앞, 바깥쪽
  const signsXZ = [];
  if (def.kind !== 'circuit') {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const cx = cv.getContext('2d');
    cx.fillStyle = '#f2c230'; cx.fillRect(0, 0, 128, 64); cx.fillStyle = '#111'; for (let k = 0; k < 3; k++) { cx.beginPath(); cx.moveTo(18 + k * 36, 12); cx.lineTo(40 + k * 36, 32); cx.lineTo(18 + k * 36, 52); cx.lineTo(30 + k * 36, 52); cx.lineTo(52 + k * 36, 32); cx.lineTo(30 + k * 36, 12); cx.fill(); }
    const tex = new T3.CanvasTexture(cv), signM = new T3.MeshStandardMaterial({ map: tex, side: T3.DoubleSide }), signMf = signM.clone(); signMf.map = tex.clone(); signMf.map.repeat.x = -1; signMf.map.offset.x = 1; signMf.map.needsUpdate = true;
    for (let i = 0; i < N; i++) {
      const k0 = c.kap[i], k1 = c.kap[(i - 1 + N) % N], ahead = Math.round(40 / c.ds);
      if (Math.abs(k0) > 1 / 70 && Math.abs(k1) <= 1 / 70) {
        const j = (i - ahead + N) % N, r = right(j), sd = -Math.sign(k0), off = sd * (w / 2 + 2.2);
        const sign = new T3.Group(), board = new T3.Mesh(new T3.PlaneGeometry(1.4, 0.7), k0 > 0 ? signM : signMf), pole = new T3.Mesh(new T3.BoxGeometry(0.08, 1.6, 0.08), std(0x9aa0a6));
        board.position.y = 1.8; pole.position.y = 0.8; sign.add(board); sign.add(pole);
        sign.position.set(c.x[j] + r[0] * off, c.y[j], c.z[j] + r[1] * off); sign.rotation.y = c.psi[j]; g.add(sign); signsXZ.push([sign.position.x, sign.position.z, 0.1]);
      }
    }
  }
  g.userData = { terrainMat, roadM, obstacles: trees.map(([x, , z, k]) => [x, z, 0.25 * k]).concat(signsXZ) };
  return g;
}

// ---- 밤 주행: 하늘·안개를 어둡게, 해 대신 희미한 달빛, 전조등을 켠다 ----
const NIGHT = { on: false, applied: null };
function applyNight() {
  if (NIGHT.applied === NIGHT.on || !drive.hemi) return;
  NIGHT.applied = NIGHT.on; const n = NIGHT.on;
  drive.sky.setHex(n ? 0x0a0f1a : 0xa9bccf); drive.scene.fog.color.copy(drive.sky);
  drive.hemi.intensity = n ? 0.1 : 0.75; drive.hemi.color.setHex(n ? 0x34466a : 0xe6eef5);
  drive.sunL.intensity = n ? 0.12 : 1.0; drive.sunL.color.setHex(n ? 0x8fa3c8 : 0xfff6e8);
  drive.scene.environment = n ? null : drive.envTex;
  drive.lamps.forEach(L => { L.intensity = n ? 3.2 : 0; });
  drive.headMat.emissiveIntensity = n ? 2.2 : 0.9;
}
// ---- 비·눈: 빗길이면 빗줄기, 눈길이면 눈송이. 카메라 둘레 60m 상자 안에서 떨어지고, 세상에 머무르도록 카메라 이동만큼 거꾸로 옮긴다 ----
const WX = { kind: '', last: null };
function buildWeather(T3, scene) {
  const N = 1400, pos = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 60, y = (Math.random() - 0.5) * 24, z = (Math.random() - 0.5) * 60; pos.set([x, y, z, x, y - 0.5, z], i * 6); }
  const rg = new T3.BufferGeometry(); rg.setAttribute('position', new T3.BufferAttribute(pos, 3));
  WX.rain = new T3.LineSegments(rg, new T3.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.45 })); WX.rain.visible = false; WX.rain.frustumCulled = false;
  const sp = new Float32Array(N * 3); for (let i = 0; i < N; i++) sp.set([(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 60], i * 3);
  const sg = new T3.BufferGeometry(); sg.setAttribute('position', new T3.BufferAttribute(sp, 3));
  WX.snow = new T3.Points(sg, new T3.PointsMaterial({ color: 0xffffff, size: 0.14, transparent: true, opacity: 0.9 })); WX.snow.visible = false; WX.snow.frustumCulled = false;
  scene.add(WX.rain); scene.add(WX.snow);
}
function updateWeather(dt) {
  if (!WX.rain) return;
  const kind = sim.surface === 'wet' ? 'rain' : sim.surface === 'snow' ? 'snow' : '';
  WX.rain.visible = kind === 'rain'; WX.snow.visible = kind === 'snow';
  if (!kind) { WX.last = null; return; }
  const cam = drive.camera.position, obj = kind === 'rain' ? WX.rain : WX.snow, A = obj.geometry.attributes.position, a = A.array;
  const d = WX.last ? cam.clone().sub(WX.last) : new THREE.Vector3(); WX.last = cam.clone(); obj.position.copy(cam);
  const fall = kind === 'rain' ? 16 * dt : 1.2 * dt, wrap = (v, h) => v < -h ? v + 2 * h : v > h ? v - 2 * h : v;
  const step = kind === 'rain' ? 3 : 3, per = kind === 'rain' ? 2 : 1;
  for (let i = 0; i < a.length; i += step * per) {
    for (let j = 0; j < per; j++) { const k = i + j * 3; a[k] -= d.x; a[k + 1] -= d.y + fall; a[k + 2] -= d.z; if (kind === 'snow') { a[k] += Math.sin(k + performance.now() / 900) * 0.3 * dt; } }
    const k0 = i; let dx = 0, dy = 0, dz = 0;
    const nx = wrap(a[k0], 30), ny = wrap(a[k0 + 1], 12), nz = wrap(a[k0 + 2], 30); dx = nx - a[k0]; dy = ny - a[k0 + 1]; dz = nz - a[k0 + 2];
    for (let j = 0; j < per; j++) { const k = i + j * 3; a[k] += dx; a[k + 1] += dy; a[k + 2] += dz; }
  }
  A.needsUpdate = true;
}

// ---- 게임 패드·레이싱 휠(표준 배치): 왼쪽 스틱 핸들, RT 가속, LT 브레이크, B 사이드, LB/RB 수동 내림·올림, A=D, X=R, Y=N ----
const PAD = { prev: [], active: false, th: -1 };
window.addEventListener('gamepadconnected', e => say(`게임 패드 연결: ${e.gamepad.id.slice(0, 40)}. 왼쪽 스틱 핸들, RT 가속, LT 브레이크, B 사이드, LB/RB 단 내림·올림, A=D, X=R, Y=N.`));
window.addEventListener('gamepaddisconnected', () => { PAD.active = false; say('게임 패드 연결이 끊겼습니다.'); });
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; const gp = [...pads].find(p => p && p.connected);
  if (!gp) return;
  const btn = i => gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0, pressed = i => btn(i) > 0.5;
  const edge = i => pressed(i) && !PAD.prev[i];
  const ax = Math.abs(gp.axes[0] || 0) > 0.08 ? gp.axes[0] : 0;
  if (ax) { if (COURSE.c && STEER.mode === 'auto') setSteerMode('manual'); STEER.target = ax; STEER.keyUsed = false; PAD.steer = true; }
  else if (PAD.steer) { PAD.steer = false; STEER.keyUsed = true; }        // 스틱을 놓으면 핸들이 저절로 가운데로
  const rt = btn(7), lt = btn(6);
  if (rt > 0.02 || PAD.th > 0) { const v = Math.round(rt * 100); if (v !== PAD.th) { setThrottle(v); PAD.th = v; } }
  if (lt > 0.3 !== !!PAD.brake) { PAD.brake = lt > 0.3; setBrake(PAD.brake); }
  if (pressed(1) !== HB.on && (pressed(1) || PAD.prev[1])) setHB(pressed(1));
  if (edge(0)) requestLever('D'); if (edge(2)) requestLever('R'); if (edge(3)) requestLever('N');
  const tg = targetGear();
  if (edge(5) && typeof tg === 'number' && tg < 6) requestManual(tg + 1);
  if (edge(4) && typeof tg === 'number' && tg > 1) requestManual(tg - 1);
  PAD.prev = gp.buttons.map(b => b.pressed);
}

// ---- 미끄럼 효과: 타이어 자국(바닥에 남는 검은 줄)과 타이어 연기 ----
// 직선 도로는 세상이 뒤로 흐르므로 효과 묶음을 sim.x만큼 함께 옮긴다(코스에서는 제자리)
const FX = { reset: false, mi: 0, lastS: null, smoke: [], x0: 0, wheel: 0 };
function buildFX(T3, scene) {
  const g = new T3.Group(); scene.add(g); FX.group = g;
  const N = 1200, geo = new T3.PlaneGeometry(0.22, 0.34); geo.rotateX(-Math.PI / 2);
  const mat = new T3.MeshBasicMaterial({ color: 0x0b0b0b, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  FX.marks = new T3.InstancedMesh(geo, mat, N); FX.marks.frustumCulled = false; FX.N = N;
  const zero = new T3.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < N; i++) FX.marks.setMatrixAt(i, zero); g.add(FX.marks);
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'), gr = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(236,236,236,0.95)'); gr.addColorStop(1, 'rgba(236,236,236,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  const tex = new T3.CanvasTexture(cv);
  for (let i = 0; i < 56; i++) { const sp = new T3.Sprite(new T3.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 })); sp.visible = false; g.add(sp); FX.smoke.push({ sp, life: 0 }); }
}
function updateFX(P, dt) {
  if (!FX.group) return;
  const T3 = THREE, C = COURSE.c;
  if (FX.reset) {
    const zero = new T3.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < FX.N; i++) FX.marks.setMatrixAt(i, zero);
    FX.marks.instanceMatrix.needsUpdate = true; FX.smoke.forEach(p => { p.life = 0; p.sp.visible = false; }); FX.reset = false; FX.lastS = null; FX.x0 = sim.x;
  }
  FX.group.position.z = C ? 0 : sim.x - FX.x0;
  const o = DYNS.out, v = Math.abs(sim.v), rear = o ? o.slipR : 0, front = o ? o.slipF : 0;
  const spinning = sim.spin > 0.15 && v < 15;                           // 출발 때 헛도는 앞바퀴도 자국을 남긴다
  const skid = v > 1.5 && (rear > 0.12 || front > 0.4 || spinning);
  drive.car.updateMatrixWorld();
  const local = (x, y, z) => { const p = drive.car.localToWorld(new T3.Vector3(x, y, z)); p.z -= FX.group.position.z; return p; };
  if (skid && (FX.lastS === null || drive.dist - FX.lastS > 0.3)) {
    FX.lastS = drive.dist;
    const yaw = P.psi - (o ? o.beta : 0), q = new T3.Quaternion().setFromAxisAngle(new T3.Vector3(0, 1, 0), yaw), one = new T3.Vector3(1, 1, 1), m4 = new T3.Matrix4();
    const ws = []; if (rear > 0.12) ws.push([-0.81, 1.42], [0.81, 1.42]); if (front > 0.4 || spinning) ws.push([-0.81, -1.42], [0.81, -1.42]);
    ws.forEach(([x, z]) => { m4.compose(local(x, 0.035, z), q, one); FX.marks.setMatrixAt(FX.mi++ % FX.N, m4); });
    FX.marks.instanceMatrix.needsUpdate = true;
  } else if (!skid) FX.lastS = null;
  // 연기: 뒤(사이드·드리프트) 또는 앞(헛돎) 바퀴에서 피어올라 커지며 옅어진다
  const smokeAmt = Math.max(rear > 0.3 && v > 3 ? rear : 0, spinning ? sim.spin : 0);
  if (smokeAmt > 0 && Math.random() < 0.35 + smokeAmt * 0.5) {
    const p = FX.smoke.find(q => q.life <= 0);
    if (p) { FX.wheel ^= 1; const z = spinning && rear < 0.3 ? -1.42 : 1.42; p.sp.position.copy(local(FX.wheel ? 0.81 : -0.81, 0.3, z));
      p.life = p.max = 1.2 + Math.random() * 0.6; p.amt = smokeAmt; p.sp.visible = true; }
  }
  FX.smoke.forEach(p => {
    if (p.life <= 0) return;
    p.life -= dt; const k = 1 - p.life / p.max;
    if (p.life <= 0) { p.sp.visible = false; return; }
    p.sp.position.y += 0.6 * dt; p.sp.scale.setScalar(0.8 + k * 3.2); p.sp.material.opacity = 0.42 * (1 - k) * Math.min(1, p.amt + 0.3);
  });
}
// 미끄럼 정도(0~1): 타이어 소리와 계기판 표시에 쓴다
function slipAmount() {
  const o = DYNS.out, v = Math.abs(sim.v);
  const tire = o ? Math.max(o.slipR, o.slipF * 0.8) : 0;
  return clamp(Math.max(tire * Math.min(1, v / 8), sim.spin * 0.8), 0, 1);
}
