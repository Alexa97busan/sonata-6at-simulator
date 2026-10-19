// 화면 1: 변속 레버·페달·작동 요소 표·게이지, 2D 유성기어, 동력 경로, 공부 모드 1·2, 유성기어 실험실.
// 여러 파일이 전역 이름을 함께 씁니다(sim.js·course.js·dynamics.js 다음, 이 순서대로 불러와야 합니다).
// ---------- UI ----------
const $ = id => document.getElementById(id);
function setText(id, t) { const e = $(id); if (e.textContent !== t) e.textContent = t; }   // 글자가 바뀔 때만 고친다(여러 파일이 씀)
// 화면에 보이는 카드만 그린다(각도 계산은 계속). 아래쪽 카드는 스크롤해 올 때까지 그리지 않아 처음 화면이 가볍다
const SEEN = { gt: false, lab: false, study: false };
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(es => es.forEach(e => { SEEN[e.target.dataset.seen] = e.isIntersecting; }), { rootMargin: '200px 0px' });
  [['gt', 'gt'], ['lab', 'lab'], ['study', 'study']].forEach(([id, k]) => { const el = $(id); el.dataset.seen = k; io.observe(el); });
} else Object.keys(SEEN).forEach(k => { SEEN[k] = true; });
const LEVERS = ['R', 'N', 'D'];
const NAMES = { R: 'R 후진', N: 'N 중립', D: 'D 주행' };

$('seg').innerHTML = '<span class="ind"></span>' + LEVERS.map(k =>
  `<button type="button" role="radio" data-k="${k}" aria-checked="false">${NAMES[k]}</button>`).join('');
$('gears').innerHTML = [1, 2, 3, 4, 5, 6].map(n => `<button type="button" data-n="${n}" aria-pressed="false">${n}</button>`).join('');
$('seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) requestLever(b.dataset.k); });
$('seg').addEventListener('keydown', e => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = LEVERS.indexOf(sim.lever) + (e.key === 'ArrowRight' ? 1 : -1);
  requestLever(LEVERS[(i + 3) % 3]); $('seg').querySelector('[aria-checked="true"]').focus();
});
$('gears').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const n = +b.dataset.n; requestManual(sim.manual === n ? null : n);
});

const thEl = $('th');
thEl.addEventListener('input', () => { sim.th = thEl.value / 100; $('thLabel').textContent = thEl.value + '%'; });
$('release').addEventListener('click', () => { thEl.value = 0; thEl.dispatchEvent(new Event('input')); });
const brake = $('brake');
const setBrake = on => { sim.brake = on; brake.classList.toggle('down', on); };
brake.addEventListener('pointerdown', e => { brake.setPointerCapture(e.pointerId); setBrake(true); });
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => brake.addEventListener(ev, () => setBrake(false)));
brake.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setBrake(true); } });
brake.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') setBrake(false); });

// 작동 요소 표 (A6 계열 작동표)
const EL = [
  { id: 'UD', name: 'UD', desc: '클러치' }, { id: 'OD', name: 'OD', desc: '클러치' }, { id: '35R', name: '3-5/R', desc: '클러치' },
  { id: '26', name: '2-6', desc: '브레이크' }, { id: 'LR', name: 'L&R', desc: '브레이크' }, { id: 'OWC', name: 'OWC', desc: '원웨이' }
];
const CHART = { 1: ['UD', 'OWC'], 2: ['UD', '26'], 3: ['UD', '35R'], 4: ['UD', 'OD'], 5: ['OD', '35R'], 6: ['OD', '26'], R: ['35R', 'LR'], N: [] };
// 요소별 물림 정도(0~1). 변속 중에는 풀리는 요소(off-going)가 줄어드는 동안 물리는 요소(on-coming)가 차오르는 클러치 투 클러치 겹침을 흉내 낸다
function engageLevels() {
  const L = {}, kmh = Math.abs(sim.v) * 3.6;
  const els = g => g === 'N' ? [] : (g === 1 && kmh > 8 ? ['UD', 'OWC', 'LR'] : CHART[g]);
  const sh = sim.shift;
  if (!sh) { els(sim.cur).forEach(id => { L[id] = 1; }); return L; }
  const p = sh.t / sh.dur, sm = (a, b) => { const x = clamp((p - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  const A = els(sh.from), B = els(sh.to);
  A.forEach(id => { L[id] = B.includes(id) ? 1 : 1 - sm(0.2, 0.62); });
  B.forEach(id => { if (!A.includes(id)) L[id] = sm(0.32, 0.8); });
  return L;
}
$('els').innerHTML = EL.map(e => `<div class="el" data-e="${e.id}">${e.name}<small>${e.desc}</small></div>`).join('');

$('tbody').innerHTML = [1, 2, 3, 4, 5, 6, 'R'].map(g => {
  const tot = Math.abs(CFG.ratios[g]) * CFG.final;
  const kmh = 6000 * Math.PI / 30 / tot * CFG.tireR * 3.6;
  const label = g === 'R' ? 'R (후진)' : g + '단';
  return `<tr data-g="${g}"><td><button type="button">${label}</button></td>
    <td class="num"><button type="button" tabindex="-1">${Math.abs(CFG.ratios[g]).toFixed(3)}</button></td>
    <td class="num"><button type="button" tabindex="-1">${tot.toFixed(3)}</button></td>
    <td class="num"><button type="button" tabindex="-1">${kmh.toFixed(0)} km/h</button></td></tr>`;
}).join('');
$('tbody').addEventListener('click', e => {
  const tr = e.target.closest('tr'); if (!tr) return;
  const g = tr.dataset.g; if (g === 'R') requestLever('R'); else requestManual(+g);
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});

// 게이지
const cv = $('cv'), ctx = cv.getContext('2d');
const disp = { rpm: CFG.idle, kmh: 0 };
const cssv = () => { const s = getComputedStyle(document.documentElement); return n => s.getPropertyValue(n).trim(); };
function dial(cx, cy, R, val, max, step, labelEvery, labelFn, redFrom, unit, c) {
  const a0 = 0.75 * Math.PI, sw = 1.5 * Math.PI, ang = x => a0 + sw * x / max;
  ctx.lineCap = 'round';
  ctx.lineWidth = 6; ctx.strokeStyle = c.dim; ctx.globalAlpha = .35;
  ctx.beginPath(); ctx.arc(cx, cy, R, ang(0), ang(redFrom ?? max)); ctx.stroke();
  if (redFrom != null) { ctx.strokeStyle = c.red; ctx.globalAlpha = .9; ctx.beginPath(); ctx.arc(cx, cy, R, ang(redFrom), ang(max)); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.font = '500 15px "Noto Sans KR", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= max / step + 1e-6; i++) {
    const a = ang(i * step), long = i % labelEvery === 0, c1 = Math.cos(a), s1 = Math.sin(a);
    ctx.lineWidth = long ? 2.2 : 1.2; ctx.strokeStyle = c.ink;
    ctx.beginPath(); ctx.moveTo(c1 * (R - 12) + cx, s1 * (R - 12) + cy); ctx.lineTo(c1 * (R - (long ? 26 : 20)) + cx, s1 * (R - (long ? 26 : 20)) + cy); ctx.stroke();
    if (long) { ctx.fillStyle = c.ink; ctx.fillText(labelFn(i * step), c1 * (R - 46) + cx, s1 * (R - 46) + cy); }
  }
  ctx.fillStyle = c.dim; ctx.font = '13px "Noto Sans KR", sans-serif'; ctx.fillText(unit, cx, cy + R * 0.42);
  const a = ang(clamp(val, 0, max));
  ctx.strokeStyle = c.accent; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * 14, cy - Math.sin(a) * 14); ctx.lineTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22)); ctx.stroke();
  ctx.fillStyle = c.accent; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 7); ctx.fill();
}


// ---------- 가상 유성기어 모델 ----------
const PG = { Zs: 80, Zr: 96, Zp: 8, nF: 4, Z1: 56, Z2: 32, ZR: 112, Zpl: 40, Zps: 10, nR: 4, custom: false };
const PG0 = Object.assign({}, PG);
PG.k = PG.Zs / (PG.Zs + PG.Zr);                         // 앞 유성기어 감속(캐리어/입력)
const TAU = Math.PI * 2, PI = Math.PI;
const meshPlanet = (thA, ZA, beta, ZP) => beta + PI - PI / ZP + (ZA / ZP) * (beta - thA);   // 외접 기어의 이가 홈에 맞물리는 피니언 각도
let rL, rS, dLS, phi, pF0, ringF0, thS0, gam0, thL0, ringR0, sun2_0;
// 초기 위상: 모든 이가 처음부터 맞물리도록 계산 (잇수를 바꿀 때마다 다시 계산)
function pgDerive() {
  PG.k = PG.Zs / (PG.Zs + PG.Zr);
  rL = (PG.Z2 + PG.Zpl) / 2; rS = (PG.Z1 + PG.Zps) / 2; dLS = (PG.Zps + PG.Zpl) / 2;
  phi = Math.acos(clamp((rS * rS + rL * rL - dLS * dLS) / (2 * rS * rL), -1, 1));
  pF0 = meshPlanet(0, PG.Zs, 0, PG.Zp);
  ringF0 = -TAU * (PG.Zp * (0 - pF0) / TAU + 0.5) / PG.Zr;
  thS0 = meshPlanet(0, PG.Z1, phi, PG.Zps);
  gam0 = Math.atan2(0 - rS * Math.sin(phi), rL - rS * Math.cos(phi));
  thL0 = meshPlanet(thS0, PG.Zps, gam0, PG.Zpl);
  ringR0 = -TAU * (PG.Zpl * (0 - thL0) / TAU + 0.5) / PG.ZR;
  sun2_0 = -(TAU / PG.Z2) * (0.5 - PG.Zpl * (PI - thL0) / TAU);
}
pgDerive();

// 뒤 유성기어: 요소 연결 조건 2개 + 윌리스 식 2개를 풀어 각 요소의 속도를 구한다.
function solveRear(g, w, active) {
  if (g === 'N') return { w1: 0, w2: 0, wc: 0, wr: 0 };
  const cons = {};
  active.forEach(id => {
    if (id === 'UD') cons[0] = PG.k * w; else if (id === '35R') cons[1] = w; else if (id === 'OD') cons[2] = w;
    else if (id === '26') cons[1] = 0; else if (id === 'LR' || id === 'OWC') cons[2] = 0;
  });
  const { Z1, Z2, ZR } = PG;
  const A = [[0, Z2, -(ZR + Z2), ZR, 0], [-Z1, 0, Z1 - ZR, ZR, 0]];
  Object.keys(cons).forEach(i => { const row = [0, 0, 0, 0, cons[i]]; row[i] = 1; A.push(row); });
  if (A.length !== 4) return { w1: 0, w2: 0, wc: 0, wr: 0 };
  for (let c = 0; c < 4; c++) {
    let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let j = c; j < 5; j++) A[r][j] -= f * A[c][j]; }
  }
  return { w1: A[0][4] / A[0][0], w2: A[1][4] / A[1][1], wc: A[2][4] / A[2][2], wr: A[3][4] / A[3][3] };
}
const modelRatio = g => { if (g === 'N') return null; const a = CHART[g].slice(); const s = solveRear(g, 1, a); return 1 / s.wr; };

const vis = { win: 0, w1: 0, w2: 0, wc: 0, wr: 0, thS: 0, thC: 0, th1: 0, th2: sun2_0, thCR: 0, thR: ringR0, slow: 0.02 };

function buildSeg2(el, opts, cur, cb) {
  el.innerHTML = '<span class="ind"></span>' + opts.map(o => `<button type="button" role="radio" data-k="${o.v}" aria-checked="false">${o.t}</button>`).join('');
  const set = v => { el.style.setProperty('--i', opts.findIndex(o => o.v === v)); el.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', +b.dataset.k === v)); cb(v); };
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (b) set(+b.dataset.k); });
  set(cur);
}
buildSeg2($('segSlow'), [{ v: 0.01, t: '1/100' }, { v: 0.02, t: '1/50' }, { v: 0.05, t: '1/20' }], 0.02, v => { vis.slow = v; });

// 범례
const LEG = {
  F: [['선기어 80T', 'var(--accent)'], ['링기어 96T', '#aeb1b7'], ['캐리어', 'var(--on)'], ['피니언 8T×4', '#e9e9ea']],
  R: [['선기어 1 · 56T', 'var(--accent)'], ['선기어 2 · 32T', 'var(--s2)'], ['캐리어', 'var(--on)'], ['링기어 112T', '#aeb1b7'], ['피니언 40T·24T×4', '#e9e9ea']]
};
['F', 'R'].forEach(k => {
  $('lg' + k).innerHTML = LEG[k].map((r, i) => `<div class="lr"><i style="background:${r[1]}"></i><span id="${k}n${i}">${r[0]}</span><em id="${k}r${i}">—</em><b class="num" id="${k}v${i}">0 rpm</b></div>`).join('');
});

const gcF = $('gcF'), gcR = $('gcR'), cF = gcF.getContext('2d'), cR = gcR.getContext('2d');
let FRAME_DT = 0.016;
const TRAIL = { tau: 0.14 };                       // 잔상 지속 시간(초). 0이면 끔
function fit(cv, c) {
  const px = Math.round(cv.clientWidth * (window.devicePixelRatio || 1));
  let resized = false;
  if (px > 0 && cv.width !== px) { cv.width = cv.height = px; resized = true; }
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (TRAIL.tau > 0 && !resized) {                   // 이전 프레임을 서서히 지워 잔상을 만든다
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = 'rgba(0,0,0,' + (1 - Math.exp(-FRAME_DT / TRAIL.tau)).toFixed(3) + ')';
    c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'source-over';
  } else c.clearRect(0, 0, cv.width, cv.height);
  c.setTransform(cv.width / 400, 0, 0, cv.width / 400, 0, 0);
}
function teeth(c, cx, cy, r, Z, ang, len, col, lw) {
  c.save(); c.translate(cx, cy); c.rotate(ang); c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
  for (let i = 0; i < Z; i++) { const a = i * TAU / Z, co = Math.cos(a), si = Math.sin(a); c.moveTo(co * (r - len / 2), si * (r - len / 2)); c.lineTo(co * (r + len / 2), si * (r + len / 2)); }
  c.stroke(); c.restore();
}
function marker(c, cx, cy, r, ang, col, size) {
  c.beginPath(); c.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, size, 0, 7); c.fillStyle = col; c.fill();
}
function body(c, cx, cy, r, col, alpha, fillA, dash) {
  c.save(); c.globalAlpha = alpha; c.beginPath(); c.arc(cx, cy, r, 0, 7);
  c.globalAlpha = alpha * fillA; c.fillStyle = col; c.fill(); c.globalAlpha = alpha; c.strokeStyle = col; c.lineWidth = 1.6; if (dash) c.setLineDash([5, 4]); c.stroke(); c.restore();
}

let lastActive = [];
function drawGears(dt, tg, active) {
  lastActive = active;
  // 목표 속도 (실제 rad/s)
  const winT = sim.cur === 'N' ? 0.1 * sim.we : sim.v / CFG.tireR * ratioOf(sim.cur);
  const tgt = solveRear(tg, winT, active);
  const a = 1 - Math.exp(-dt / 0.15);
  vis.win += (winT - vis.win) * a;
  vis.w1 += (tgt.w1 - vis.w1) * a; vis.w2 += (tgt.w2 - vis.w2) * a;
  vis.wc += (tgt.wc - vis.wc) * a; vis.wr += (tgt.wr - vis.wr) * a;
  const s = dt * vis.slow;
  vis.thS += vis.win * s; vis.thC += PG.k * vis.win * s;
  vis.th1 += vis.w1 * s; vis.th2 += vis.w2 * s; vis.thCR += vis.wc * s; vis.thR += vis.wr * s;

  const cs = getComputedStyle(document.documentElement);
  const ACC = cs.getPropertyValue('--accent').trim(), ON = cs.getPropertyValue('--on').trim(), S2 = cs.getPropertyValue('--s2').trim();
  const INK = '#e9e9ea', RING = '#aeb1b7';
  const held = { F: true };
  // ---- 앞 유성기어 ----
  if (!SEEN.gt) { /* 안 보이면 그리지 않음 */ } else if (ctlF.mode === '3d') renderCtl(ctlF); else { fit(gcF, cF);
  { const c = cF, m = 172 / (PG.Zr / 2), cx = 200, cy = 200, rr = PG.Zr / 2 * m, rs = PG.Zs / 2 * m, rp = PG.Zp / 2 * m, rc = (PG.Zs + PG.Zp) / 2 * m;
    body(c, cx, cy, rr + 9, RING, .5, 0, true);
    body(c, cx, cy, rr, RING, .9, 0.06, false);
    teeth(c, cx, cy, rr, PG.Zr, ringF0, 3.4, RING, 1.4);
    marker(c, cx, cy, rr + 4.5, ringF0, RING, 3);
    body(c, cx, cy, rs, ACC, 1, 0.14, false);
    teeth(c, cx, cy, rs, PG.Zs, vis.thS, 3.4, ACC, 1.4);
    marker(c, cx, cy, rs * .8, vis.thS, ACC, 5);
    for (let i = 0; i < PG.nF; i++) {
      const al = vis.thC + i * TAU / PG.nF, px = cx + Math.cos(al) * rc, py = cy + Math.sin(al) * rc;
      c.strokeStyle = ON; c.lineWidth = 2; c.globalAlpha = .9; c.beginPath(); c.moveTo(cx, cy); c.lineTo(px, py); c.stroke(); c.globalAlpha = 1;
      const tp = meshPlanet(vis.thS, PG.Zs, al, PG.Zp);
      body(c, px, py, rp, INK, 1, 0.1, false);
      teeth(c, px, py, rp, PG.Zp, tp, 3.4, INK, 1.4);
      marker(c, px, py, rp * .5, tp, INK, 2.2);
      c.beginPath(); c.arc(px, py, 2.6, 0, 7); c.fillStyle = ON; c.fill();
    }
    c.beginPath(); c.arc(cx, cy, 9, 0, 7); c.fillStyle = ON; c.fill();
  } }
  // ---- 뒤 라비뇨 유성기어 ----
  const has = id => active.includes(id);
  const s1Alpha = has('UD') ? 1 : .75, s2Alpha = has('26') ? .55 : 1, ringA = 1;
  if (!SEEN.gt) { /* 안 보이면 그리지 않음 */ } else if (ctlR.mode === '3d') renderCtl(ctlR); else { fit(gcR, cR);
  { const c = cR, m = 176 / (PG.ZR / 2), cx = 200, cy = 200, rr = PG.ZR / 2 * m, r1 = PG.Z1 / 2 * m, r2 = PG.Z2 / 2 * m;
    const rpl = PG.Zpl / 2 * m, rps = PG.Zps / 2 * m, RL = rL * m, RS = rS * m;
    body(c, cx, cy, rr + 9, RING, .5, 0, false);
    body(c, cx, cy, rr, RING, ringA, 0.06, false);
    teeth(c, cx, cy, rr, PG.ZR, vis.thR, 3, RING, 1.2);
    marker(c, cx, cy, rr + 4.5, vis.thR, RING, 3.4);
    // 선기어 1 (짧은 피니언과 맞물림)
    body(c, cx, cy, r1, ACC, s1Alpha, 0.07, false);
    teeth(c, cx, cy, r1, PG.Z1, vis.th1, 3, ACC, 1.2);
    marker(c, cx, cy, r1 * .86, vis.th1, ACC, 4.2);
    // 선기어 2 (긴 피니언과 맞물림)
    body(c, cx, cy, r2, S2, s2Alpha, 0.2, has('26'));
    teeth(c, cx, cy, r2, PG.Z2, vis.th2, 3, S2, 1.2);
    marker(c, cx, cy, r2 * .62, vis.th2, S2, 4.2);
    for (let i = 0; i < PG.nR; i++) {
      const al = vis.thCR + i * TAU / PG.nR;
      const lx = cx + Math.cos(al) * RL, ly = cy + Math.sin(al) * RL, sx = cx + Math.cos(al + phi) * RS, sy = cy + Math.sin(al + phi) * RS;
      const ths = meshPlanet(vis.th1, PG.Z1, al + phi, PG.Zps);
      const thl = meshPlanet(ths, PG.Zps, gam0 + al, PG.Zpl);
      c.strokeStyle = ON; c.lineWidth = 2; c.globalAlpha = .85; c.beginPath(); c.moveTo(lx, ly); c.lineTo(cx, cy); c.lineTo(sx, sy); c.stroke(); c.globalAlpha = 1;
      body(c, sx, sy, rps, INK, .95, 0.08, false); teeth(c, sx, sy, rps, PG.Zps, ths, 3, INK, 1.2); marker(c, sx, sy, rps * .55, ths, INK, 2.4);
      body(c, lx, ly, rpl, INK, .95, 0.12, false); teeth(c, lx, ly, rpl, PG.Zpl, thl, 3, INK, 1.2); marker(c, lx, ly, rpl * .6, thl, INK, 2.8);
      c.beginPath(); c.arc(sx, sy, 2.4, 0, 7); c.fillStyle = ON; c.fill(); c.beginPath(); c.arc(lx, ly, 2.8, 0, 7); c.fillStyle = ON; c.fill();
    }
    c.beginPath(); c.arc(cx, cy, 8, 0, 7); c.fillStyle = ON; c.fill();
  } }
  // ---- 범례 값 ----
  const rp = w => (Math.abs(w * 30 / PI) < 0.5 ? 0 : w * 30 / PI);
  const fmtR = w => Math.round(rp(w)) + ' rpm';
  const front = [['입력', vis.win], ['고정', 0], ['출력', PG.k * vis.win], ['자전', PG.Zs / PG.Zp * (vis.win - PG.k * vis.win) * -1 + PG.k * vis.win]];
  front.forEach((r, i) => { setText('Fr' + i, r[0]); setText('Fv' + i, fmtR(r[1])); });
  const carRole = has('OD') ? '입력' : (has('LR') || has('OWC')) ? '고정' : '자유';
  const rear = [[has('UD') ? '입력' : '자유', vis.w1], [has('35R') ? '입력' : has('26') ? '고정' : '자유', vis.w2], [carRole, vis.wc], ['출력', vis.wr],
    ['자전', PG.Z1 / PG.Zps * (vis.wc - vis.w1) + vis.wc]];
  rear.forEach((r, i) => { setText('Rr' + i, r[0]); setText('Rv' + i, fmtR(r[1])); });
  const mr = modelRatio(tg);
  setText('modelRatio', tg === 'N' ? '중립 (동력 전달 없음)' : PG.custom ? '사용자 잇수 ' + Math.abs(mr).toFixed(3) + ' (공식 ' + Math.abs(CFG.ratios[tg]).toFixed(3) + ')' : '가상 ' + Math.abs(mr).toFixed(3) + ' / 공식 ' + Math.abs(CFG.ratios[tg]).toFixed(3));
}

// ---------- 동력 경로 ----------
const VAR_OF = { UD: 0, '35R': 1, '26': 1, OD: 2, LR: 2, OWC: 2 };
function comboInfo(active) {
  const vars = new Set(active.map(id => VAR_OF[id]));
  if (vars.size < 2) return '동력 전달 없음 (작동 요소 부족)';
  if (vars.size > 2) return '요소 3개 이상 동시 작동: 변속기가 잠기는 인터록 상태';
  const s = solveRear('X', 1, active);
  if (Math.abs(s.wr) < 1e-9) return '출력 정지 (고정 요소만 2개)';
  return '변속비 <b>' + Math.abs(1 / s.wr).toFixed(3) + ' : 1</b> (가상 모델)' + (s.wr < 0 ? ' · 역회전' : '');
}
function pathHTML(active) {
  const has = id => active.includes(id), br = has('LR') || has('OWC');
  const nd = (t, cls, sub) => `<span class="nd ${cls || ''}">${t}${sub ? `<small>${sub}</small>` : ''}</span>`;
  const cn = c => `<i class="cn ${c || ''}"></i>`;
  const on = b => b ? 'on' : '';
  const l1 = nd('입력축', 'on') + cn('on') + nd('앞 유성', 'on', '×' + PG.k.toFixed(2)) + cn(on(has('UD'))) + nd('UD', on(has('UD'))) + cn(on(has('UD'))) + nd('선기어1', on(has('UD')), has('UD') ? '구동' : '자유');
  const l2 = nd('입력축', 'on') + cn(on(has('35R'))) + nd('3-5/R', on(has('35R'))) + cn(on(has('35R'))) +
    nd('선기어2', has('35R') ? 'on' : has('26') ? 'hold' : '', has('35R') ? '구동' : has('26') ? '고정' : '자유') + cn(has('26') ? 'hold' : '') + nd('2-6', has('26') ? 'hold' : '');
  const l3 = nd('입력축', 'on') + cn(on(has('OD'))) + nd('OD', on(has('OD'))) + cn(on(has('OD'))) +
    nd('캐리어', has('OD') ? 'on' : br ? 'hold' : '', has('OD') ? '구동' : br ? '고정' : '자유') + cn(br ? 'hold' : '') + nd('L&R·OWC', br ? 'hold' : '');
  return `<div class="lane">${l1}</div><div class="lane">${l2}</div><div class="lane">${l3}</div>
    <div class="outrow">선기어1·선기어2·캐리어 → 라비뇨 유성기어 → 링기어(출력) : ${comboInfo(active)}</div>`;
}
let lastPathLive = '';
function updatePathLive(active) { const h = pathHTML(active); if (h !== lastPathLive) { lastPathLive = h; $('pathLive').innerHTML = h; } }

function buildSegStr(el, opts, cur, cb) {
  el.innerHTML = '<span class="ind"></span>' + opts.map(o => `<button type="button" role="radio" data-k="${o.v}" aria-checked="false">${o.t}</button>`).join('');
  const set = v => { el.style.setProperty('--i', opts.findIndex(o => o.v === v)); el.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.k === v)); cb(v); };
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (b) set(b.dataset.k); });
  set(cur);
}

// ---------- 공부 모드 1: 작동표 퀴즈 ----------
const ELN = { UD: 'UD', OD: 'OD', '35R': '3-5/R', '26': '2-6', LR: 'L&R', OWC: 'OWC' };
const GN = g => g === 'R' ? '후진(R)' : g + '단';
const EXPL = {
  1: 'UD로 선기어1을 구동(감속 입력)하고 캐리어를 OWC로 고정합니다. 수동 1단(L)에서는 L&R이 함께 작동해 엔진 브레이크가 걸립니다.',
  2: 'UD로 선기어1을 구동하고 2-6 브레이크로 선기어2를 고정합니다.',
  3: 'UD(선기어1)와 3-5/R(선기어2)로 두 선기어를 함께 구동합니다.',
  4: 'UD로 선기어1을 구동하고 OD로 캐리어를 직결 입력합니다.',
  5: 'OD(캐리어)와 3-5/R(선기어2)이 함께 직결 입력되어 전체가 한 덩어리로 돌아 1:1 직결이 됩니다.',
  6: 'OD로 캐리어를 직결 입력하고 2-6 브레이크로 선기어2를 고정해 증속합니다.',
  R: '3-5/R로 선기어2를 구동하고 L&R로 캐리어를 고정하면 링기어가 반대로 돕니다.'
};
const validSets = g => g === 1 ? [['UD', 'OWC'], ['UD', 'LR']] : [CHART[g]];
const qz = { c: 0, n: 0, streak: 0, q: null, sel: [], done: false };
const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
function scoreTxt() { return `정답 ${qz.c} / ${qz.n} · 연속 ${qz.streak}`; }

function newQ() {
  let q;
  do { q = { type: Math.random() < 0.6 ? 'els' : 'gear', g: [1, 2, 3, 4, 5, 6, 'R'][Math.floor(Math.random() * 7)] }; }
  while (qz.q && qz.q.type === q.type && qz.q.g === q.g);
  qz.q = q; qz.sel = []; qz.done = false;
  const fb = $('qFb'); fb.hidden = true;
  if (q.type === 'els') {
    $('qText').textContent = GN(q.g) + '에서 작동하는 요소 2개를 고르세요.';
    $('qOpts').className = 'q-opts';
    $('qOpts').innerHTML = Object.keys(ELN).map(id => `<button class="qchip" type="button" data-e="${id}" aria-pressed="false">${ELN[id]}</button>`).join('');
    $('qPath').innerHTML = pathHTML([]);
  } else {
    const els = q.g === 1 ? ['UD', 'OWC'] : CHART[q.g];
    $('qText').textContent = els.map(id => ELN[id]).join(' + ') + ' 이(가) 작동 중입니다. 몇 단일까요?';
    $('qOpts').className = 'q-opts g4';
    $('qOpts').innerHTML = [1, 2, 3, 4, 5, 6, 'R'].map(g => `<button class="qchip" type="button" data-g="${g}" aria-pressed="false">${g}</button>`).join('');
    $('qPath').innerHTML = pathHTML(els);
  }
  $('qCheck').disabled = true; $('qNext').disabled = false;
}
$('qOpts').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || qz.done) return;
  if (qz.q.type === 'els') {
    const id = b.dataset.e, i = qz.sel.indexOf(id);
    if (i >= 0) qz.sel.splice(i, 1); else { qz.sel.push(id); if (qz.sel.length > 2) qz.sel.shift(); }
    $('qOpts').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', qz.sel.includes(x.dataset.e)));
    $('qPath').innerHTML = pathHTML(qz.sel);
    $('qCheck').disabled = qz.sel.length !== 2;
  } else {
    qz.sel = [b.dataset.g];
    $('qOpts').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
    $('qCheck').disabled = false;
  }
});
$('qCheck').addEventListener('click', () => {
  if (qz.done) return;
  const q = qz.q; qz.done = true; qz.n++;
  let ok, correct;
  if (q.type === 'els') { ok = validSets(q.g).some(v => same(v, qz.sel)); correct = validSets(q.g)[0]; }
  else { ok = String(q.g) === qz.sel[0]; correct = q.g === 1 ? ['UD', 'OWC'] : CHART[q.g]; }
  qz.streak = ok ? qz.streak + 1 : 0; if (ok) qz.c++;
  $('scoreChart').textContent = scoreTxt();
  const fb = $('qFb'); fb.hidden = false; fb.className = 'fb ' + (ok ? 'ok' : 'bad');
  const ans = q.type === 'els' ? correct.map(id => ELN[id]).join(' + ') : GN(q.g);
  fb.innerHTML = `<b>${ok ? '정답입니다.' : '오답입니다.'}</b> ${ok ? '' : '정답: ' + ans + '. '}${GN(q.g)} · ${EXPL[q.g]} (공식 변속비 ${Math.abs(CFG.ratios[q.g]).toFixed(3)})`;
  $('qOpts').querySelectorAll('button').forEach(x => {
    x.disabled = true;
    const isRight = q.type === 'els' ? correct.includes(x.dataset.e) || (q.g === 1 && ok && qz.sel.includes(x.dataset.e)) : String(q.g) === x.dataset.g;
    const isSel = q.type === 'els' ? qz.sel.includes(x.dataset.e) : qz.sel[0] === x.dataset.g;
    x.classList.toggle('right', isRight); x.classList.toggle('wrong', isSel && !isRight);
  });
  $('qPath').innerHTML = pathHTML(q.type === 'els' && ok ? qz.sel : correct);
  $('qCheck').disabled = true;
});
$('qNext').addEventListener('click', newQ);

// ---------- 공부 모드 2: 변속비 계산 ----------
const qc = { c: 0, n: 0, streak: 0, q: null, done: false };
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const TYPES = ['pinion', 'ring', 'sun', 'carrier', 'ratio'];
function newCalc() {
  let q;
  do {
    const Zs = pick([24, 28, 32, 36, 40, 44, 48]), Zp = pick([8, 10, 12, 14, 16, 18, 20]), Zr = Zs + 2 * Zp;
    const type = pick(TYPES);
    q = { type, Zs, Zp, Zr };
    if (type === 'pinion') { q.text = `선기어 ${Zs}T, 링기어 ${Zr}T일 때 피니언 기어의 잇수는?`; q.ans = Zp; q.exp = `링기어 = 선기어 + 피니언 × 2 이므로<br>피니언 = (링기어 − 선기어) ÷ 2 = (${Zr} − ${Zs}) ÷ 2 = <b>${Zp}T</b>`; }
    if (type === 'ring') { q.text = `선기어 ${Zs}T, 피니언 ${Zp}T일 때 링기어의 잇수는?`; q.ans = Zr; q.exp = `링기어 = 선기어 + 피니언 × 2 = ${Zs} + ${Zp} × 2 = <b>${Zr}T</b>`; }
    if (type === 'sun') { q.text = `링기어 ${Zr}T, 피니언 ${Zp}T일 때 선기어의 잇수는?`; q.ans = Zs; q.exp = `선기어 = 링기어 − 피니언 × 2 = ${Zr} − ${Zp} × 2 = <b>${Zs}T</b>`; }
    if (type === 'carrier') { q.text = `선기어 ${Zs}T, 링기어 ${Zr}T일 때 캐리어의 가상 잇수는?`; q.ans = Zs + Zr; q.exp = `캐리어 가상 잇수 = 선기어 + 링기어 = ${Zs} + ${Zr} = <b>${Zs + Zr}T</b>`; }
    if (type === 'ratio') { q.text = `선기어 ${Zs}T, 링기어 ${Zr}T입니다. 링기어를 고정하고 선기어로 입력해 캐리어로 출력할 때 변속비(감속비)는? 소수 둘째 자리까지 쓰세요.`; q.ans = (Zs + Zr) / Zs;
      q.exp = `변속비 = (선기어 + 링기어) ÷ 선기어 = (${Zs} + ${Zr}) ÷ ${Zs} = <b>${q.ans.toFixed(2)} : 1</b> (감속)`; }
  } while (qc.q && qc.q.type === q.type && qc.q.Zs === q.Zs && qc.q.Zp === q.Zp);
  qc.q = q; qc.done = false;
  $('cText').textContent = q.text;
  $('cIn').value = ''; $('cIn').disabled = false; $('cCheck').disabled = false;
  $('cFb').hidden = true; $('qcvBox').hidden = true; $('cLegend').hidden = true; qv.on = false;
}
function checkCalc() {
  if (qc.done) return;
  const q = qc.q, v = parseFloat($('cIn').value.replace(',', '.'));
  const fb = $('cFb'); fb.hidden = false;
  if (Number.isNaN(v)) { fb.className = 'fb'; fb.textContent = '숫자로 입력해 주세요.'; return; }
  qc.done = true; qc.n++;
  const ok = q.type === 'ratio' ? Math.abs(v - q.ans) <= 0.02 : v === q.ans;
  qc.streak = ok ? qc.streak + 1 : 0; if (ok) qc.c++;
  $('scoreCalc').textContent = `정답 ${qc.c} / ${qc.n} · 연속 ${qc.streak}`;
  fb.className = 'fb ' + (ok ? 'ok' : 'bad');
  fb.innerHTML = `<b>${ok ? '정답입니다.' : '오답입니다.'}</b><br>${q.exp}`;
  $('cIn').disabled = true; $('cCheck').disabled = true;
  startQV(q);
}
$('cCheck').addEventListener('click', checkCalc);
$('cIn').addEventListener('keydown', e => { if (e.key === 'Enter') checkCalc(); });
$('cNext').addEventListener('click', newCalc);

// 정답 확인용 단일 유성기어 애니메이션
const gcQ = $('gcQ'), cQ = gcQ.getContext('2d');
const qv = { on: false, z: null, w: null, thS: 0, thC: 0, thR: 0 };
function startQV(q) {
  const w = { sun: 1, ring: 0, carrier: q.Zs / (q.Zs + q.Zr) };
  const p0 = meshPlanet(0, q.Zs, 0, q.Zp);
  Object.assign(qv, { on: true, z: { Zs: q.Zs, Zr: q.Zr, fixed: 'ring' }, w, Zp: q.Zp, thS: 0, thC: 0, thR: -TAU * (q.Zp * (0 - p0) / TAU + 0.5) / q.Zr });
  $('qcvBox').hidden = false; $('cLegend').hidden = false;
  $('cLegend').textContent = `선기어 ${q.Zs}T · 피니언 ${q.Zp}T · 링기어 ${q.Zr}T (링기어 고정, 선기어 입력)`;
}
function drawSimple(cv, c, z, thS, thC, thR) {
  const Zp = z.Zp, cs = getComputedStyle(document.documentElement);
  const ACC = cs.getPropertyValue('--accent').trim(), ON = cs.getPropertyValue('--on').trim(), INK = '#e9e9ea', RING = '#aeb1b7';
  fit(cv, c);
  const cx = 200, cy = 200, m = 165 / (z.Zr / 2), rr = z.Zr / 2 * m, rs = z.Zs / 2 * m, rp = Zp / 2 * m, rc = (z.Zs + Zp) / 2 * m;
  body(c, cx, cy, rr + 9, RING, z.fixed === 'ring' ? .35 : .55, 0, z.fixed === 'ring');
  body(c, cx, cy, rr, RING, z.fixed === 'ring' ? .55 : 1, 0.06, z.fixed === 'ring');
  teeth(c, cx, cy, rr, z.Zr, thR, 3, RING, 1.3); marker(c, cx, cy, rr + 4.5, thR, RING, 3.2);
  body(c, cx, cy, rs, ACC, z.fixed === 'sun' ? .55 : 1, 0.14, z.fixed === 'sun');
  teeth(c, cx, cy, rs, z.Zs, thS, 3, ACC, 1.3); marker(c, cx, cy, rs * .8, thS, ACC, 4.5);
  const N = z.n || 4;
  for (let i = 0; i < N; i++) {
    const al = thC + i * TAU / N, px = cx + Math.cos(al) * rc, py = cy + Math.sin(al) * rc;
    c.strokeStyle = ON; c.lineWidth = 2; c.globalAlpha = z.fixed === 'carrier' ? .55 : .9; c.beginPath(); c.moveTo(cx, cy); c.lineTo(px, py); c.stroke(); c.globalAlpha = 1;
    const tp = meshPlanet(thS, z.Zs, al, Zp);
    body(c, px, py, rp, INK, 1, 0.1, false); teeth(c, px, py, rp, Zp, tp, 3, INK, 1.3); marker(c, px, py, rp * .5, tp, INK, 2.2);
    c.beginPath(); c.arc(px, py, 2.6, 0, 7); c.fillStyle = ON; c.fill();
  }
  c.beginPath(); c.arc(cx, cy, 8, 0, 7); c.fillStyle = ON; c.fill();
}
function drawQ(dt) {
  if (!qv.on) return;
  const w = qv.w, s = dt * 2.2;
  qv.thS += w.sun * s; qv.thC += w.carrier * s; qv.thR += w.ring * s;
  if (!SEEN.study) return;
  drawSimple(gcQ, cQ, { Zs: qv.z.Zs, Zr: qv.z.Zr, Zp: qv.Zp, fixed: qv.z.fixed }, qv.thS, qv.thC, qv.thR);
}

// ---------- 유성기어 실험실 ----------
const LN = { sun: '선기어', carrier: '캐리어', ring: '링기어' }, LK = ['sun', 'carrier', 'ring'];
const LCOL = { sun: 'var(--accent)', carrier: 'var(--on)', ring: '#aeb1b7' };
const lab = { view: '2d', want: '2d', fixed: 'ring', input: 'sun', Zs: 36, Zp: 12, n: 4, msg: '', speed: 1, thS: 0, thC: 0, thR: 0, rev: { sun: 0, carrier: 0, ring: 0, pin: 0 }, w: null, wp: 0 };
const LEXP = {
  'ring-sun': '선기어가 피니언을 돌리고, 피니언은 고정된 링기어 안쪽을 굴러가며 캐리어를 밀고 갑니다. 캐리어는 선기어와 같은 방향으로 느리게 돕니다. (감속)',
  'ring-carrier': '캐리어가 피니언을 끌고 고정된 링기어 안을 굴러갑니다. 이때 피니언의 자전이 선기어를 돌려 선기어는 캐리어보다 빠르게 같은 방향으로 돕니다. (증속)',
  'carrier-sun': '캐리어가 고정되면 피니언은 제자리에서 자전만 합니다. 선기어가 돌면 피니언이 방향을 뒤집고 링기어가 반대로 돕니다. (감속·역회전, 후진에 사용)',
  'carrier-ring': '캐리어가 고정되어 피니언은 제자리에서 자전만 합니다. 링기어가 돌면 선기어가 반대로 훨씬 빠르게 돕니다. (증속·역회전)',
  'sun-carrier': '선기어가 고정되어 있어서, 캐리어가 돌면 피니언이 고정된 선기어를 타고 굴러가며 링기어를 앞으로 밀어냅니다. 링기어가 캐리어보다 빠르게 돕니다. (증속, 오버드라이브)',
  'sun-ring': '선기어가 고정되어 있고 링기어가 피니언을 밀어 돌립니다. 피니언은 선기어를 타고 굴러가며 캐리어를 돌려, 캐리어는 링기어보다 느리게 돕니다. (감속)'
};
$('labRows').innerHTML = LK.concat(['pin']).map(k => `<div class="cnt"><i style="background:${k === 'pin' ? '#e9e9ea' : LCOL[k]}"></i><span id="lb_${k}">${k === 'pin' ? '피니언 (자전)' : LN[k]}</span><em id="lr_${k}">—</em><b class="num" id="lv_${k}">0.00 바퀴</b></div>`).join('');

const fmtRev = v => (Math.abs(v) < 0.005 ? '0.00' : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2)) + ' 바퀴';
function labZr() { return lab.Zs + 2 * lab.Zp; }
function labRecalc() {
  const Zs = lab.Zs, Zr = labZr(), K = { sun: Zs, ring: Zr, carrier: -(Zs + Zr) };
  const out = LK.find(k => k !== lab.fixed && k !== lab.input);
  const w = { sun: 0, ring: 0, carrier: 0 }; w[lab.input] = 1; w[out] = -K[lab.input] / K[out];
  lab.w = w; lab.out = out; lab.wp = w.carrier - (Zs / lab.Zp) * (w.sun - w.carrier);
  const p0 = meshPlanet(0, Zs, 0, lab.Zp);
  lab.thS = 0; lab.thC = 0; lab.thR = -TAU * (lab.Zp * (0 - p0) / TAU + 0.5) / Zr;
  Object.keys(lab.rev).forEach(k => lab.rev[k] = 0);
  const ratio = 1 / w[out];
  LK.forEach(k => { const e = $('lr_' + k); const r = k === lab.fixed ? '고정' : k === lab.input ? '입력' : '출력'; e.textContent = r; e.className = r === '고정' ? 'fx' : r === '입력' ? 'on' : ''; });
  $('labSum').innerHTML = `${LN[lab.input]} 1바퀴 → ${LN[out]} <b>${w[out].toFixed(3)}바퀴</b><br>변속비 = ${ratio.toFixed(3)} : 1 · ${Math.abs(ratio) > 1 ? '감속' : '증속'}${ratio < 0 ? ' · 역회전' : ' · 정회전'}`;
  $('labExp').textContent = LEXP[lab.fixed + '-' + lab.input];
}
buildSegStr($('labFix'), LK.map(k => ({ v: k, t: LN[k] })), 'ring', v => { lab.fixed = v; if (lab.input === v) { lab.input = LK.find(k => k !== v); syncLabIn(); } labRecalc(); });
buildSegStr($('labIn'), LK.map(k => ({ v: k, t: LN[k] })), 'sun', v => { lab.input = v; if (lab.fixed === v) { lab.fixed = LK.find(k => k !== v); syncLabFix(); } labRecalc(); });
function syncSeg3(el, v) { el.style.setProperty('--i', LK.indexOf(v)); el.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.k === v)); }
function syncLabIn() { syncSeg3($('labIn'), lab.input); }
function syncLabFix() { syncSeg3($('labFix'), lab.fixed); }

// 잇수 설정: 링기어 = 선기어 + 피니언×2, 캐리어 가상 잇수 = 선기어 + 링기어
const validNs = (Zs, Zp) => [1, 2, 3, 4, 5, 6].filter(N => (2 * (Zs + Zp)) % N === 0 && (N === 1 || Math.sin(PI / N) >= Zp / (Zs + Zp) * 0.999));
function labApply() {
  const ns = validNs(lab.Zs, lab.Zp);
  if (!ns.includes(lab.n)) lab.n = [4, 3, 2, 1].find(n => ns.includes(n));
  $('labN').innerHTML = ns.map(n => `<option value="${n}"${n === lab.n ? ' selected' : ''}>${n}개</option>`).join('');
  $('tS').value = lab.Zs; $('tP').value = lab.Zp; $('tR').value = labZr(); $('tC').value = lab.Zs + labZr();
  $('labMsg').textContent = lab.msg;
  labRecalc();
}
function setTeeth(which, raw) {
  const val = Math.round(parseFloat(raw)); lab.msg = '';
  if (!Number.isFinite(val)) return labApply();
  if (which === 's') lab.Zs = clamp(val, 12, 60);
  else if (which === 'p') lab.Zp = clamp(val, 6, 40);
  else {
    const Zr = which === 'r' ? val : val - lab.Zs;
    lab.Zp = clamp(Math.round((Zr - lab.Zs) / 2), 6, 40);
    const fixedZr = lab.Zs + 2 * lab.Zp;
    if (which === 'r' && fixedZr !== Zr) lab.msg = `링기어 = 선기어 + 피니언 × 2 이므로 ${fixedZr}T로 맞췄습니다.`;
    if (which === 'c' && lab.Zs + fixedZr !== val) lab.msg = `캐리어 가상 잇수 = 선기어 + 링기어 이므로 ${lab.Zs + fixedZr}T로 맞췄습니다.`;
  }
  if (lab.Zs + 2 * lab.Zp > 160) { lab.Zp = Math.floor((160 - lab.Zs) / 2); lab.msg = '링기어는 최대 160T까지 지원합니다. 피니언을 줄여 맞췄습니다.'; }
  labApply();
}
document.querySelectorAll('.stp button').forEach(b => b.addEventListener('click', () => {
  const f = b.dataset.f, cur = { s: lab.Zs, r: labZr(), p: lab.Zp, c: lab.Zs + labZr() }[f];
  setTeeth(f, cur + (+b.dataset.d));
}));
[['tS', 's'], ['tR', 'r'], ['tP', 'p'], ['tC', 'c']].forEach(([id, f]) => {
  $(id).addEventListener('change', e => setTeeth(f, e.target.value));
  $(id).addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
});
$('labN').addEventListener('change', e => { lab.n = +e.target.value; labRecalc(); });

// 잔상 길이 (모든 애니메이션에 적용)
const TRAIL_OPTS = [{ v: '0', t: '끔' }, { v: '0.14', t: '보통' }, { v: '0.32', t: '길게' }];
function setTrail(v) {
  TRAIL.tau = +v;
  ['trailLab', 'trailGt'].forEach(id => { const el = $(id); el.style.setProperty('--i', TRAIL_OPTS.findIndex(o => o.v === String(v))); el.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.k === String(v))); });
}
['trailLab', 'trailGt'].forEach(id => buildSegStr($(id), TRAIL_OPTS, '0.14', setTrail));
$('labSpd').addEventListener('input', e => { lab.speed = +e.target.value; $('labSpdTxt').textContent = lab.speed.toFixed(1); });
$('labReset').addEventListener('click', () => Object.keys(lab.rev).forEach(k => lab.rev[k] = 0));
const gcL = $('gcL'), cL = gcL.getContext('2d');
/*G3D_START*/
// 이가 달린 기어 형상. 이의 중심은 각도 k·(2π/Z)에 두어 2D 모델의 맞물림 위상과 같게 만든다.
function makeGearGeom(T3, Z, r, thick, internal, rimOut) {
  const p = 2 * Math.PI / Z, pts = [];
  const tip = internal ? r - 1 : r + 1, root = internal ? r + 1.25 : r - 1.25;
  const prof = [[-0.30, root], [-0.15, tip], [0.15, tip], [0.30, root]];
  for (let k = 0; k < Z; k++) for (const [f, rad] of prof) { const a = (k + f) * p; pts.push(new T3.Vector2(Math.cos(a) * rad, Math.sin(a) * rad)); }
  let shape;
  if (internal) { shape = new T3.Shape(); shape.absarc(0, 0, rimOut, 0, 2 * Math.PI, false); shape.holes.push(new T3.Path(pts)); }
  else shape = new T3.Shape(pts);
  const g = new T3.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 48 });
  g.translate(0, 0, -thick / 2);
  return g;
}
/*G3D_END*/
