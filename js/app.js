// 화면: 계기판, 3D(주행·변속기 단면·유성기어), 기록, 과제, 공부 모드. js/sim.js 다음에 불러옵니다.
(() => {
// ---------- UI ----------
const $ = id => document.getElementById(id);
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
  drive.controls.target.set(P.x + t.x, P.y + t.y, P.z + t.z); drive.controls.update(); drive.prevPose = Object.assign({}, P);
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
        sign.position.set(c.x[j] + r[0] * off, c.y[j], c.z[j] + r[1] * off); sign.rotation.y = c.psi[j]; g.add(sign);
      }
    }
  }
  g.userData = { terrainMat, roadM };
  return g;
}

function buildDrive() {
  const T3 = THREE, box = $('box3D');
  const renderer = new T3.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(PR()); renderer.outputEncoding = T3.sRGBEncoding;
  box.appendChild(renderer.domElement);
  const scene = new T3.Scene(), sky = new T3.Color(0xa9bccf);
  scene.background = sky; scene.fog = new T3.Fog(sky, 30, 110);
  const camera = new T3.PerspectiveCamera(45, 16 / 9, 0.1, 1500);
  scene.add(new T3.HemisphereLight(0xe6eef5, 0x4a5a40, 0.75));
  const sunL = new T3.DirectionalLight(0xfff6e8, 1.0); sunL.position.set(-40, 60, 30); scene.add(sunL);
  scene.environment = skyEnv(T3, renderer);
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
  drive.body.rotation.x = drive.pitch;
  // 바퀴: 왼쪽(0, 2)·오른쪽(1, 3) 속도가 회전 반경에 따라 다르다. 앞바퀴는 헛돌면 더 돈다
  const fl = 1 + STEER.k, fr = 1 - STEER.k;
  drive.roll = drive.roll || [0, 0, 0, 0];
  [fl, fr, fl, fr].forEach((f, i) => { drive.roll[i] -= (v / CFG.tireR * f + (i < 2 ? sim.spin * 30 * sim.Fdir : 0)) * dt; drive.wheels[i].rotation.x = drive.roll[i]; });
  drive.pivots.forEach(p => { p.rotation.y = -STEER.delta; });          // 실제 바퀴 조향각
  const ay = isFinite(STEER.R) ? v * v / STEER.R * Math.sign(STEER.v) : 0;
  drive.body.rotation.z += (clamp(ay * 0.006, -0.06, 0.06) - drive.body.rotation.z) * Math.min(1, dt * 6);   // 바깥으로 기우는 차체
  const turning = isFinite(STEER.R) && Math.abs(v) > 0.3;
  $('dTurnBox').hidden = !turning;
  if (turning) setText('dTurn', '반경 ' + STEER.R.toFixed(0) + 'm · 바깥 바퀴 +' + (Math.abs(STEER.k) * 100).toFixed(0) + '% · ' + (Math.abs(ay) / G0).toFixed(2) + 'G');
  updateCourseHud(P);
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
  drive.controls.update(); drive.renderer.render(drive.scene, drive.camera);
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
const LAT = { e: 0, h: 0, off: false };
// 속도 감응 조향: 빠를수록 같은 핸들 각에 바퀴가 덜 꺾인다(36km/h에서 절반, 100km/h에서 약 1/9)
const steerGain = () => 1 / (1 + Math.pow(Math.abs(sim.v) / 10, 2));
function roadEdges() {
  const C = COURSE.c;
  return C ? { lo: -(C.def.width / 2 + C.def.lane), hi: C.def.width / 2 - C.def.lane, wall: C.def.kind === 'mountain' ? 1.0 : C.def.kind === 'circuit' ? 9 : 12 } : { lo: -6, hi: 2, wall: 12 };
}
function updateLateral(dt) {
  const C = COURSE.c, v = sim.v;
  if (C && STEER.mode === 'auto') {
    LAT.e *= Math.max(0, 1 - dt * 2); LAT.h *= Math.max(0, 1 - dt * 4); ROAD.curvOverride = null; ROAD.offroad = LAT.off = false; return;
  }
  const kCar = Math.tan(STEER.v * 0.6 * steerGain()) / 2.84, kRoad = C ? C.curvAt(sim.x) : 0;
  LAT.h = clamp(LAT.h + (kCar - kRoad) * v * dt, -1.2, 1.2);
  LAT.e += v * Math.sin(LAT.h) * dt;
  ROAD.curvOverride = kCar;
  const E = roadEdges(), off = LAT.e < E.lo - 0.2 || LAT.e > E.hi + 0.2;
  if (off && !LAT.off && Math.abs(v) > 1) say('도로를 벗어났습니다. 풀밭에서는 차가 느려집니다.', true);
  LAT.off = ROAD.offroad = off;
  if (LAT.e < E.lo - E.wall || LAT.e > E.hi + E.wall) {                   // 가드레일·방호벽: 부딪히면 크게 감속하고 벽을 따라 선다
    LAT.e = clamp(LAT.e, E.lo - E.wall, E.hi + E.wall);
    if (Math.abs(v) > 3) say(C && C.def.kind === 'mountain' ? '가드레일에 부딪혔습니다! 핸들을 길 쪽으로 돌리세요.' : '방호벽에 부딪혔습니다! 핸들을 길 쪽으로 돌리세요.', true);
    if (Math.abs(v) > 1) sim.v *= 0.5;
    LAT.h *= 0.2;
  }
}
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
    const k = sim.curv, d = Math.atan(2.84 * k); STEER.delta = d;
    STEER.v = clamp(d / 0.6, -1, 1); STEER.target = STEER.v; STEER.R = Math.abs(k) < 1e-4 ? Infinity : 1 / Math.abs(k); STEER.k = 0.8 * k;
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
function setRoadNow(pct) { if (COURSE.id !== 'straight') selectCourse('straight'); ROAD.reset(pct / 100, sim.x); $('grade').value = pct; $('gradeLabel').textContent = gradeText(pct); }

// ---- 도로 고르기: 직선(무한 직선 + 경사 슬라이더) 또는 코스(굽은 국도·산길·서킷, 닫힌 고리) ----
const COURSE = { id: 'straight', c: null, cache: {}, lap: 0, lapT0: null, last: null, best: {}, mapCv: null, mapDrawT: 0 };
try { COURSE.best = JSON.parse(localStorage.getItem('sonata6at.laps') || '{}') || {}; } catch (e) {}
const fmtLap = t => t == null ? '–' : Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0');
function selectCourse(id) {
  if (COURSE.id === id && (id === 'straight' || COURSE.c)) return;
  COURSE.id = id; COURSE.lap = 0; COURSE.lapT0 = null; COURSE.last = null; COURSE.mapCv = null;
  LAT.e = 0; LAT.h = 0; STEER.target = 0; ROAD.curvOverride = null; ROAD.offroad = false;
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
  const p = C.at(sim.x), off = C.def.lane + LAT.e - (STEER.mode === 'auto' ? Math.sign(p.kap) * sim.slide * 3 : 0);
  return { x: p.x + Math.cos(p.psi) * off, y: p.y, z: p.z - Math.sin(p.psi) * off, psi: p.psi - LAT.h, grade: p.grade, kap: p.kap };
}
// 카메라: 지난 프레임의 차 기준 상대 위치를 그대로 유지하며 따라간다(코너에서 함께 돈다)
function followCam(P) {
  const Q = drive.prevPose, cam = drive.camera.position, Y = new THREE.Vector3(0, 1, 0);
  if (Q) {
    const d = cam.clone().sub(new THREE.Vector3(Q.x, Q.y, Q.z)).applyAxisAngle(Y, P.psi - Q.psi);
    cam.set(P.x + d.x, P.y + d.y, P.z + d.z);
    const t = drive.controls.target.clone().sub(new THREE.Vector3(Q.x, Q.y, Q.z)).applyAxisAngle(Y, P.psi - Q.psi);
    drive.controls.target.set(P.x + t.x, P.y + t.y, P.z + t.z);
  }
  drive.prevPose = Object.assign({}, P);
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
  const v = Math.abs(sim.v), nc = C.nextCorner(sim.x, 220, sim.mu), cor = $('dCorner');
  if (nc) {
    const need = v > nc.v ? (v * v - nc.v * nc.v) / (2 * 5) : 0, late = v > nc.v * 1.08 && nc.d < need + 25;
    setText('dCorner', `${nc.dir > 0 ? '↱ 오른쪽' : '↰ 왼쪽'} 코너 ${Math.round(nc.d)}m · 권장 ${Math.round(nc.v * 3.6)}km/h${late ? ' · 감속!' : ''}`);
    cor.classList.toggle('warn', late || sim.slide > 0.05);
  } else { setText('dCorner', sim.slide > 0.05 ? '바깥으로 밀림! 속도를 줄이세요' : '직선'); cor.classList.toggle('warn', sim.slide > 0.05); }
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
  // 레벨 막대와 안내: 실제로 소리가 나가는지 보여 준다
  snd.an.getFloatTimeDomainData(snd.buf); let e = 0; for (const x of snd.buf) e += x * x;
  const rms = Math.sqrt(e / snd.buf.length); $('sndMeter').style.width = Math.min(100, rms * 400) + '%';
  const hint = !snd.on ? '' : snd.ctx.state !== 'running' ? '브라우저가 소리를 막고 있습니다. "엔진 소리" 버튼을 한 번 더 눌러 주세요.' :
    rms > 0.01 ? '소리가 나가고 있습니다(초록 막대). 들리지 않으면 기기 음량과, 휴대폰은 무음 모드를 확인하세요.' : '';
  if ($('sndHint').textContent !== hint) { $('sndHint').textContent = hint; $('sndHint').hidden = !hint; }
}

// ---- 키보드 조작 ----
function setThrottle(pct) { thEl.value = clamp(pct, 0, 100); thEl.dispatchEvent(new Event('input')); }
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, select, summary, a')) return;
  const k = e.code;
  if (k === 'ArrowUp') setThrottle(+thEl.value + 10);
  else if (k === 'ArrowDown') { if (!e.repeat) setThrottle(0); setBrake(true); }
  else if (k === 'KeyR' || k === 'KeyN' || k === 'KeyD') requestLever(k.slice(3));
  else if (/^Digit[1-6]$/.test(k)) requestManual(+k.slice(5));
  else if (k === 'Digit0') requestManual(null);
  else if (k === 'ArrowLeft' || k === 'ArrowRight') { if (COURSE.c && STEER.mode === 'auto') setSteerMode('manual'); STEER.key = k === 'ArrowLeft' ? -1 : 1; STEER.keyUsed = true; }
  else if (k === 'KeyS') soundToggle();
  else if (k === 'KeyM') { const ks = Object.keys(MODES); $('modeSeg').querySelector(`[data-k="${ks[(ks.indexOf(sim.mode) + 1) % ks.length]}"]`).click(); }
  else return;
  e.preventDefault();
});
document.addEventListener('keyup', e => { if (e.code === 'ArrowDown') setBrake(false); if ((e.code === 'ArrowLeft' && STEER.key < 0) || (e.code === 'ArrowRight' && STEER.key > 0)) STEER.key = 0; });

// ---- 0→100km/h 측정 ----
const LS_KEY = 'sonata6at.t100';
const t100 = { state: 'idle', ready: false, t0: 0, last: null, best: null };
try { const b = parseFloat(localStorage.getItem(LS_KEY)); if (b > 0) t100.best = b; } catch (e) {}
function t100Say(m) { setText('t100msg', m); }
function updateT100() {
  const kmh = sim.v * 3.6;
  if (t100.state === 'idle') {
    if (sim.lever === 'D' && Math.abs(sim.v) < 0.3) t100.ready = true;
    if (t100.ready && kmh > 1) { t100.state = 'run'; t100.t0 = sim.t; t100.ready = false; t100Say('측정 중… 100km/h까지 페달을 유지하세요.'); }
  } else {
    const el = sim.t - t100.t0;
    if (kmh >= 100) {
      t100.state = 'idle'; t100.last = el;
      const nb = t100.best === null || el < t100.best;
      if (nb) { t100.best = el; try { localStorage.setItem(LS_KEY, String(el)); } catch (e) {} }
      t100Say(nb ? '새 최고 기록입니다! 멈춘 뒤 다시 출발하면 또 잽니다.' : '측정 완료. 멈춘 뒤 다시 출발하면 또 잽니다.');
    } else if (sim.brake || kmh < 0.5 || sim.lever !== 'D') { t100.state = 'idle'; t100Say('측정이 취소되었습니다. 멈춘 뒤 다시 출발하세요.'); }
  }
  const f = x => x === null ? '–' : x.toFixed(1) + ' s';
  setText('t100', t100.state === 'run' ? (sim.t - t100.t0).toFixed(1) + ' s' : '–');
  $('t100').classList.toggle('run', t100.state === 'run');
  setText('t100last', f(t100.last)); setText('t100best', f(t100.best));
  setText('fuelNow', fuelText());
  setText('fuelAvg', sim.fuel.dist > 50 ? (sim.fuel.dist / 1000 / (sim.fuel.total / 745)).toFixed(1) + ' km/L' : '–');
  const sl = sim.shiftLog;
  setText('shiftInfo', sim.shift ? gName(sim.shift.from) + '→' + gName(sim.shift.to) + ' …' : sl ? gName(sl.from) + '→' + gName(sl.to) + ' ' + sl.dur.toFixed(2) + ' s' : '–');
}

// ---- 주행 기록 그래프: 속도·rpm·단수를 세로로 쌓은 작은 그래프 3개(축 하나씩), 시간축 공유 ----
const LOG_SEC = 60, LOG_DT = 0.1, LOG_N = LOG_SEC / LOG_DT;
const log = { buf: [], next: 0, visible: false, hover: null, drawT: 0 };
const gearNum = g => g === 'N' ? 0 : g === 'R' ? -1 : g;
function logSample() {
  if (sim.t < log.next) return;
  log.next = sim.t + LOG_DT;
  log.buf.push({ t: sim.t, kmh: Math.abs(sim.v) * 3.6, rpm: sim.we * 30 / Math.PI, g: gearNum(sim.cur), th: sim.th, gr: sim.grade, fuel: sim.fuel.gps });
  if (log.buf.length > LOG_N) log.buf.shift();
}
$('logClear').addEventListener('click', () => { log.buf = []; sim.fuel.total = 0; sim.fuel.dist = 0; t100.last = null; t100.best = null; try { localStorage.removeItem(LS_KEY); } catch (e) {} $('logTable').innerHTML = ''; });
const logCv = $('logCv'), lc = logCv.getContext('2d');
if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => { log.visible = e.isIntersecting; })).observe(logCv);
else log.visible = true;
const LOG_L = 72, LOG_R = 10, LOG_STRIPS = [
  { key: 'kmh', title: '속도', unit: 'km/h', color: '--accent', max: () => Math.max(60, Math.ceil(Math.max(...log.buf.map(p => p.kmh), 0) / 20) * 20), min: () => 0 },
  { key: 'rpm', title: '엔진', unit: 'rpm', color: '--s2', max: () => 7000, min: () => 0, ticks: [0, 3500, 7000] },
  { key: 'g', title: '단수', unit: '', color: '--on', max: () => 6, min: () => -1, ticks: [0, 2, 4, 6], step: true, fmt: x => x === -1 ? 'R' : x === 0 ? 'N' : String(x) }
];
function drawLog(now) {
  if (!log.visible || now - log.drawT < 100) return;
  log.drawT = now;
  const dpr = window.devicePixelRatio || 1, W = logCv.clientWidth, H = logCv.clientHeight;
  if (!W) return;
  if (logCv.width !== Math.round(W * dpr)) { logCv.width = Math.round(W * dpr); logCv.height = Math.round(H * dpr); }
  lc.setTransform(dpr, 0, 0, dpr, 0, 0); lc.clearRect(0, 0, W, H);
  const v = cssv(), ink = v('--ink'), ink2 = v('--ink-2'), line = v('--line');
  const tNow = sim.t, x = t => LOG_L + (W - LOG_L - LOG_R) * (1 - (tNow - t) / LOG_SEC);
  const top = 6, axisH = 20, gap = 24, sh = (H - top - axisH - gap * 2) / 3;
  lc.font = '11px ' + getComputedStyle(document.body).fontFamily; lc.textBaseline = 'middle';
  LOG_STRIPS.forEach((S, i) => {
    const y0 = top + i * (sh + gap), lo = S.min(), hi = S.max(), y = val => y0 + sh - (val - lo) / (hi - lo) * sh;
    const ticks = S.ticks || [0, hi / 2, hi];
    lc.strokeStyle = line; lc.lineWidth = 1; lc.fillStyle = ink2; lc.textAlign = 'right';
    ticks.forEach(t => { const yy = Math.round(y(t)) + 0.5; lc.beginPath(); lc.moveTo(LOG_L, yy); lc.lineTo(W - LOG_R, yy); lc.stroke(); lc.fillText(S.fmt ? S.fmt(t) : String(t), LOG_L - 8, yy); });
    lc.textAlign = 'left'; lc.fillStyle = ink; lc.fillText(S.title, 0, y0 + 6);
    if (S.unit) { lc.fillStyle = ink2; lc.fillText(S.unit, 0, y0 + 20); }
    const pts = log.buf; if (pts.length < 2) return;
    lc.save(); lc.beginPath(); lc.rect(LOG_L, y0 - 2, W - LOG_L - LOG_R, sh + 4); lc.clip();
    lc.strokeStyle = v(S.color); lc.lineWidth = 2; lc.lineJoin = 'round'; lc.beginPath();
    pts.forEach((p, j) => {
      const px = x(p.t), py = y(p[S.key]);
      if (!j) lc.moveTo(px, py); else if (S.step) { lc.lineTo(px, y(pts[j - 1][S.key])); lc.lineTo(px, py); } else lc.lineTo(px, py);
    });
    lc.stroke(); lc.restore();
  });
  // 시간축
  const yA = top + 3 * sh + 2 * gap + 12; lc.fillStyle = ink2; lc.textAlign = 'center';
  [60, 45, 30, 15, 0].forEach(s => lc.fillText(s ? s + '초 전' : '지금', Math.min(W - 18, x(tNow - s)), yA));
  // 호버: 세 그래프를 가로지르는 세로선 + 툴팁
  const tip = $('logTip');
  if (log.hover !== null && log.buf.length) {
    const tH = tNow - (1 - (log.hover - LOG_L) / (W - LOG_L - LOG_R)) * LOG_SEC;
    let best = log.buf[0]; log.buf.forEach(p => { if (Math.abs(p.t - tH) < Math.abs(best.t - tH)) best = p; });
    const hx = Math.round(x(best.t)) + 0.5;
    lc.strokeStyle = ink2; lc.lineWidth = 1; lc.beginPath(); lc.moveTo(hx, top); lc.lineTo(hx, top + 3 * sh + 2 * gap); lc.stroke();
    LOG_STRIPS.forEach((S, i) => { const y0 = top + i * (sh + gap), yy = y0 + sh - (best[S.key] - S.min()) / (S.max() - S.min()) * sh;
      lc.beginPath(); lc.arc(hx, yy, 4, 0, 7); lc.fillStyle = v(S.color); lc.fill(); lc.lineWidth = 2; lc.strokeStyle = v('--bg'); lc.stroke(); });
    tip.hidden = false;
    tip.innerHTML = `<span>${(tNow - best.t).toFixed(1)}초 전</span><br>속도 <b>${Math.round(best.kmh)}</b> km/h<br>엔진 <b>${Math.round(best.rpm / 10) * 10}</b> rpm<br>단수 <b>${LOG_STRIPS[2].fmt(best.g)}</b>`;
    const tw = tip.offsetWidth; tip.style.left = (hx + 8 + 12 + tw > W ? hx + 8 - tw - 12 : hx + 8 + 12) + 'px';
  } else tip.hidden = true;
}
logCv.addEventListener('pointermove', e => { const r = logCv.getBoundingClientRect(), px = e.clientX - r.left; log.hover = px >= LOG_L ? px : null; });
logCv.addEventListener('pointerleave', () => { log.hover = null; });
document.querySelector('#logCard details').addEventListener('toggle', e => {
  if (!e.target.open) return;
  const rows = []; for (let s = 0; s <= LOG_SEC; s += 5) { const t = sim.t - s; let best = null; log.buf.forEach(p => { if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p; }); if (best && Math.abs(best.t - t) < 1) rows.push([s, best]); }
  $('logTable').innerHTML = rows.length ? '<table class="log-table num"><thead><tr><th>시점</th><th>속도(km/h)</th><th>엔진(rpm)</th><th>단수</th></tr></thead><tbody>' +
    rows.map(([s, p]) => `<tr><td>${s ? s + '초 전' : '지금'}</td><td>${Math.round(p.kmh)}</td><td>${Math.round(p.rpm / 10) * 10}</td><td>${LOG_STRIPS[2].fmt(p.g)}</td></tr>`).join('') + '</tbody></table>' : '<p class="gt-sub">아직 기록이 없습니다.</p>';
});

// ---- 계기판: 변속 중 표시 ----
function drawShiftBadge(c) {
  const s = sim.shift, sl = sim.shiftLog, recent = sl && sim.t - sl.at < 1.5;
  if (!s && !recent) return;
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (s) {
    ctx.fillStyle = c.accent; ctx.font = '500 20px ' + getComputedStyle(document.body).fontFamily;
    const kd = sim.kd && sim.kd.to === s.to && sim.t - sim.kd.at < s.dur + 0.05;
    ctx.fillText((kd ? '킥다운 ' : '') + gName(s.from) + ' → ' + gName(s.to), 320, 278);
    ctx.globalAlpha = .35; ctx.fillStyle = c.dim; ctx.fillRect(270, 296, 100, 4);
    ctx.globalAlpha = 1; ctx.fillStyle = c.accent; ctx.fillRect(270, 296, 100 * Math.min(1, s.t / s.dur), 4);
  } else {
    ctx.globalAlpha = 1 - (sim.t - sl.at) / 1.5; ctx.fillStyle = c.ink; ctx.font = '13px ' + getComputedStyle(document.body).fontFamily;
    ctx.fillText(gName(sl.to) + ' 변속 완료 · ' + sl.dur.toFixed(2) + ' s', 320, 290);
  }
  ctx.restore();
}

function drawLab(dt) {
  const base = lab.speed * 2.2 * dt, w = lab.w;
  lab.thS += w.sun * base; lab.thC += w.carrier * base; lab.thR += w.ring * base;
  lab.rev.sun += w.sun * base / TAU; lab.rev.carrier += w.carrier * base / TAU; lab.rev.ring += w.ring * base / TAU; lab.rev.pin += lab.wp * base / TAU;
  if (!SEEN.lab) return;
  if (ctlL.mode === '3d') renderCtl(ctlL);
  else drawSimple(gcL, cL, { Zs: lab.Zs, Zr: labZr(), Zp: lab.Zp, fixed: lab.fixed, n: lab.n }, lab.thS, lab.thC, lab.thR);
  LK.concat(['pin']).forEach(k => setText('lv_' + k, fmtRev(lab.rev[k])));
}

// ---- 앞·뒤 유성기어 잇수 직접 설정 ----
const stepperHTML = (id, label, step) => `<div class="st"><span>${label}</span><div class="stp"><button type="button" data-f="${id}" data-d="-${step}" aria-label="${label} 줄이기">−</button><input id="in_${id}" type="text" inputmode="numeric" class="num" aria-label="${label}"><button type="button" data-f="${id}" data-d="${step}" aria-label="${label} 늘리기">+</button></div></div>`;
function pgAfterChange() {
  PG.custom = ['Zs', 'Zr', 'Zp', 'nF', 'Z1', 'Z2', 'ZR', 'Zpl', 'Zps', 'nR'].some(k => PG[k] !== PG0[k]);
  pgDerive();
  vis.thS = 0; vis.thC = 0; vis.th1 = 0; vis.thCR = 0; vis.th2 = sun2_0; vis.thR = ringR0;
  const L = { F: [`선기어 ${PG.Zs}T`, `링기어 ${PG.Zr}T`, '캐리어', `피니언 ${PG.Zp}T×${PG.nF}`],
    R: [`선기어 1 · ${PG.Z1}T`, `선기어 2 · ${PG.Z2}T`, '캐리어', `링기어 ${PG.ZR}T`, `피니언 ${PG.Zpl}T·${PG.Zps}T×${PG.nR}`] };
  ['F', 'R'].forEach(k => L[k].forEach((t, i) => setText(k + 'n' + i, t)));
}
const fillSel = (id, ns, cur) => { $(id).innerHTML = ns.map(n => `<option value="${n}"${n === cur ? ' selected' : ''}>${n}개</option>`).join(''); };
function simpleEdit(S, which, raw, L) {
  const val = Math.round(parseFloat(raw)); let msg = '';
  if (!Number.isFinite(val)) return msg;
  if (which === 's') S.Zs = clamp(val, L.sMin, L.sMax);
  else if (which === 'p') S.Zp = clamp(val, L.pMin, L.pMax);
  else {
    const Zr = which === 'r' ? val : val - S.Zs;
    S.Zp = clamp(Math.round((Zr - S.Zs) / 2), L.pMin, L.pMax);
    const fz = S.Zs + 2 * S.Zp;
    if (which === 'r' && fz !== Zr) msg = `링기어 = 선기어 + 피니언 × 2 이므로 ${fz}T로 맞췄습니다.`;
    if (which === 'c' && S.Zs + fz !== val) msg = `캐리어 가상 잇수 = 선기어 + 링기어 이므로 ${S.Zs + fz}T로 맞췄습니다.`;
  }
  if (S.Zs + 2 * S.Zp > L.rMax) { S.Zp = Math.floor((L.rMax - S.Zs) / 2); msg = `링기어는 최대 ${L.rMax}T까지 지원합니다. 피니언을 줄여 맞췄습니다.`; }
  return msg;
}

// 앞 유성기어 편집기
const FED = { Zs: PG.Zs, Zp: PG.Zp, n: PG.nF, msg: '' }, FLIM = { sMin: 12, sMax: 100, pMin: 6, pMax: 50, rMax: 200 };
$('setF').innerHTML = `<div class="stepgrid">${stepperHTML('Fs', '선기어 잇수', 1)}${stepperHTML('Fr', '링기어 잇수', 2)}${stepperHTML('Fp', '피니언 잇수', 1)}${stepperHTML('Fc', '캐리어 가상 잇수', 2)}</div>
  <div class="two-col" style="margin-top:10px"><label class="sub" style="margin:0">피니언 개수<select class="sel num" id="Fn_sel" style="margin-top:6px"></select></label><div style="align-self:end"><button class="qb" id="Freset" type="button" style="width:100%">기본값으로</button></div></div>
  <p class="lab-msg" id="Fmsg" aria-live="polite" style="margin-top:8px"></p>`;
function frontApply() {
  const ns = validNs(FED.Zs, FED.Zp);
  if (!ns.includes(FED.n)) FED.n = [4, 3, 2, 1].find(n => ns.includes(n));
  PG.Zs = FED.Zs; PG.Zp = FED.Zp; PG.Zr = FED.Zs + 2 * FED.Zp; PG.nF = FED.n;
  fillSel('Fn_sel', ns, FED.n);
  $('in_Fs').value = FED.Zs; $('in_Fp').value = FED.Zp; $('in_Fr').value = PG.Zr; $('in_Fc').value = FED.Zs + PG.Zr;
  $('Fmsg').textContent = FED.msg; pgAfterChange();
}
const fmap = { Fs: 's', Fr: 'r', Fp: 'p', Fc: 'c' };
function frontSet(id, raw) { FED.msg = simpleEdit(FED, fmap[id], raw, FLIM); frontApply(); }
$('setF').querySelectorAll('.stp button').forEach(b => b.addEventListener('click', () => {
  const cur = { Fs: FED.Zs, Fr: PG.Zr, Fp: FED.Zp, Fc: FED.Zs + PG.Zr }[b.dataset.f]; frontSet(b.dataset.f, cur + (+b.dataset.d));
}));
['Fs', 'Fr', 'Fp', 'Fc'].forEach(id => { $('in_' + id).addEventListener('change', e => frontSet(id, e.target.value)); $('in_' + id).addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); }); });
$('Fn_sel').addEventListener('change', e => { FED.n = +e.target.value; FED.msg = ''; frontApply(); });
$('Freset').addEventListener('click', () => { Object.assign(FED, { Zs: PG0.Zs, Zp: PG0.Zp, n: PG0.nF, msg: '' }); frontApply(); });

// 뒤 라비뇨 편집기: 조립 가능한 조합만 허용
const RED = { Z1: PG.Z1, Z2: PG.Z2, Zpl: PG.Zpl, Zps: PG.Zps, n: PG.nR, msg: '' }, RLIM = { Z1: [16, 90], Z2: [10, 60], Zpl: [8, 50], Zps: [8, 50] };
const rearZR = S => S.Z2 + 2 * S.Zpl;
function rearCheck(S) {
  const ZR = rearZR(S), rSx = (S.Z1 + S.Zps) / 2, rLx = (S.Z2 + S.Zpl) / 2, d = (S.Zps + S.Zpl) / 2;
  if (!(d < rSx + rLx && d > Math.abs(rSx - rLx))) return '피니언과 선기어의 중심 거리가 맞지 않아 조립할 수 없는 조합입니다.';
  if (S.Z1 + 2 * S.Zps > ZR - 2) return '짧은 피니언이 링기어에 닿는 조합입니다.';
  if (S.Z1 < S.Z2 + 2) return '선기어 1은 선기어 2보다 2T 이상 커야 짧은 피니언이 선기어 2에 닿지 않습니다.';
  if (ZR > 200) return '링기어는 최대 200T까지 지원합니다.';
  return '';
}
function rearNs(S) {
  const ZR = rearZR(S), rSx = (S.Z1 + S.Zps) / 2, rLx = (S.Z2 + S.Zpl) / 2, fam = a => Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  return [1, 2, 3, 4, 5, 6].filter(N => {
    if ((S.Z1 + S.Z2) % N || (ZR - S.Z1) % N) return false;
    if (N === 1) return true;
    const pos = (r, a) => [r * Math.cos(a), r * Math.sin(a)], ph = Math.acos(clamp(((rSx * rSx + rLx * rLx - ((S.Zps + S.Zpl) / 2) ** 2) / (2 * rSx * rLx)), -1, 1));
    const rs = S.Zps / 2, rl = S.Zpl / 2;
    for (let j = 1; j < N; j++) {
      const a = j * TAU / N, L0 = pos(rLx, 0), Lj = pos(rLx, a), S0 = pos(rSx, ph), Sj = pos(rSx, a + ph);
      const dist = (u, v) => fam([u[0] - v[0], u[1] - v[1]]);
      if (dist(L0, Lj) < 2 * rl + 1.5 || dist(S0, Sj) < 2 * rs + 1.5 || dist(L0, Sj) < rl + rs + 1.5 || dist(S0, Lj) < rl + rs + 1.5) return false;
    }
    return true;
  });
}
$('setR').innerHTML = `<div class="stepgrid">${stepperHTML('R1', '선기어 1 잇수', 1)}${stepperHTML('R2', '선기어 2 잇수', 1)}${stepperHTML('Rr', '링기어 잇수', 2)}${stepperHTML('Rl', '긴 피니언 잇수', 1)}${stepperHTML('Rs', '짧은 피니언 잇수', 1)}</div>
  <div class="two-col" style="margin-top:10px"><label class="sub" style="margin:0">피니언 쌍 개수<select class="sel num" id="Rn_sel" style="margin-top:6px"></select></label><div style="align-self:end"><button class="qb" id="Rreset" type="button" style="width:100%">기본값으로</button></div></div>
  <p class="lab-msg" id="Rmsg" aria-live="polite" style="margin-top:8px"></p>
  <p class="hint3" style="margin-top:0">링기어 = 선기어 2 + 긴 피니언 × 2. 실제로 조립할 수 있는 조합만 적용되며, 변속비는 잇수에 따라 공식 값과 달라집니다.</p>`;
function rearApply() {
  const ns = rearNs(RED);
  if (!ns.includes(RED.n)) RED.n = [4, 3, 2, 1].find(n => ns.includes(n)) || 1;
  Object.assign(PG, { Z1: RED.Z1, Z2: RED.Z2, Zpl: RED.Zpl, Zps: RED.Zps, ZR: rearZR(RED), nR: RED.n });
  fillSel('Rn_sel', ns.length ? ns : [1], RED.n);
  $('in_R1').value = RED.Z1; $('in_R2').value = RED.Z2; $('in_Rr').value = rearZR(RED); $('in_Rl').value = RED.Zpl; $('in_Rs').value = RED.Zps;
  $('Rmsg').textContent = RED.msg; pgAfterChange();
}
function rearSet(id, raw) {
  const val = Math.round(parseFloat(raw)); if (!Number.isFinite(val)) return rearApply();
  const bak = Object.assign({}, RED), S = Object.assign({}, RED); let msg = '';
  if (id === 'R1') S.Z1 = clamp(val, ...RLIM.Z1);
  else if (id === 'R2') S.Z2 = clamp(val, ...RLIM.Z2);
  else if (id === 'Rl') S.Zpl = clamp(val, ...RLIM.Zpl);
  else if (id === 'Rs') S.Zps = clamp(val, ...RLIM.Zps);
  else { S.Zpl = clamp(Math.round((val - S.Z2) / 2), ...RLIM.Zpl); if (rearZR(S) !== val) msg = `링기어 = 선기어 2 + 긴 피니언 × 2 이므로 ${rearZR(S)}T로 맞췄습니다.`; }
  let why = rearCheck(S);
  if (why && id !== 'Rs') {          // 짧은 피니언을 조정해서 조립 가능한 조합을 찾아본다
    for (let dz = 0; dz <= 42 && why; dz++) for (const sg of [1, -1]) {
      const z = RED.Zps + sg * dz; if (z < RLIM.Zps[0] || z > RLIM.Zps[1]) continue;
      const T = Object.assign({}, S, { Zps: z }); if (!rearCheck(T)) { S.Zps = z; why = ''; msg = (msg ? msg + ' ' : '') + `짧은 피니언을 ${z}T로 맞췄습니다.`; break; }
    }
  }
  if (why) { Object.assign(RED, bak); RED.msg = why + ' 입력을 되돌렸습니다.'; return rearApply(); }
  Object.assign(RED, S, { msg }); rearApply();
}
$('setR').querySelectorAll('.stp button').forEach(b => b.addEventListener('click', () => {
  const cur = { R1: RED.Z1, R2: RED.Z2, Rr: rearZR(RED), Rl: RED.Zpl, Rs: RED.Zps }[b.dataset.f]; rearSet(b.dataset.f, cur + (+b.dataset.d));
}));
['R1', 'R2', 'Rr', 'Rl', 'Rs'].forEach(id => { $('in_' + id).addEventListener('change', e => rearSet(id, e.target.value)); $('in_' + id).addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); }); });
$('Rn_sel').addEventListener('change', e => { RED.n = +e.target.value; RED.msg = ''; rearApply(); });
$('Rreset').addEventListener('click', () => { Object.assign(RED, { Z1: PG0.Z1, Z2: PG0.Z2, Zpl: PG0.Zpl, Zps: PG0.Zps, n: PG0.nR, msg: '' }); rearApply(); });
frontApply(); rearApply();

labApply();

// 탭
buildSegStr($('segStudy'), [{ v: 'chart', t: '작동표 퀴즈' }, { v: 'sit', t: '상황 퀴즈' }, { v: 'calc', t: '잇수 계산' }], 'chart', v => {
  $('pChart').hidden = v !== 'chart'; $('pCalc').hidden = v !== 'calc'; $('pSit').hidden = v !== 'sit';
});
newQ(); newCalc();

// ---- 상황 퀴즈: 토크 컨버터, 킥다운, 경사, 주행 모드, 차동기어 등 시뮬레이터 동작을 묻는다 ----
const SIT = { n: 0, ok: 0, streak: 0, cur: null };
const SIT_GEN = [
  () => { const P = pick([1800, 2200, 2600]), sr = pick([0.15, 0.4, 0.95, 1]), lock = sr === 1;
    const T = Math.round(P * sr / 10) * 10, ans = lock ? '록업' : sr < 0.85 ? '토크 증대' : '유체 연결';
    return { q: `엔진(펌프) ${P}rpm, 터빈 ${T}rpm${lock ? ', 두 쪽이 완전히 같은 속도로 돕니다' : ''}. 토크 컨버터는 어떤 상태일까요?`, opts: ['토크 증대', '유체 연결', '록업'], ans,
      why: '속도비(터빈÷펌프)가 0.85 아래면 스테이터가 멈춰 기름 방향을 바꿔 토크를 키우고(최대 2배), 그 위에서는 그냥 기름으로 전하는 유체 연결, 록업 클러치가 붙으면 두 쪽이 한 몸이 됩니다.' }; },
  () => { const g = pick([5, 6]), kmh = pick([70, 80, 90]);
    let k = g; while (k - 1 >= 1 && rpmAt(kmh / 3.6, k - 1) < 5400) k--;
    return { q: `D ${g}단 ${kmh}km/h로 달리다 가속 페달을 순간적으로 끝까지 밟았습니다(킥다운). 몇 단으로 내려갈까요?`, opts: ['2단', '3단', '4단', '5단'].filter(o => +o[0] < g), ans: k + '단',
      why: `킥다운은 엔진이 5,400rpm을 넘지 않는 가장 낮은 단으로 한 번에 내립니다. ${kmh}km/h에서 ${k}단은 ${Math.round(rpmAt(kmh / 3.6, k))}rpm, ${k - 1}단은 ${Math.round(rpmAt(kmh / 3.6, k - 1))}rpm입니다.` }; },
  () => ({ q: '8% 내리막에서 D로 달리다 가속 페달을 놓았습니다. 평지라면 단을 올렸을 상황에서 이 변속기는 어떻게 할까요?', opts: ['한 단 올린다', '지금 단을 붙잡는다', 'N으로 바꾼다'], ans: '지금 단을 붙잡는다',
      why: '경사 로직은 내리막에서 가속을 놓으면 올림을 막아 엔진 브레이크를 씁니다. 여기서 브레이크까지 밟으면 한 단 더 내려 엔진 브레이크를 키웁니다.' }),
  () => { const th = pick([0.2, 0.4, 0.6]);
    return { q: `가속 페달 ${th * 100}%로 출발할 때, 1단에서 2단으로 가장 늦게(높은 속도에서) 올리는 주행 모드는?`, opts: ['에코', '보통', '스포츠'], ans: '스포츠',
      why: `올림 기준 rpm(페달 ${th * 100}%): 에코 ${upRpm(MODES.eco, th)}, 보통 ${upRpm(MODES.normal, th)}, 스포츠 ${upRpm(MODES.sport, th)}rpm. 스포츠는 엔진을 높은 rpm까지 끌고 올립니다.` }; },
  () => ({ q: '오른쪽으로 핸들을 꺾고 달릴 때 차동기어 안에서 일어나는 일은?', opts: ['왼쪽 바퀴가 더 빨리 돈다', '오른쪽 바퀴가 더 빨리 돈다', '두 바퀴 속도가 같다'], ans: '왼쪽 바퀴가 더 빨리 돈다',
      why: '오른쪽으로 돌면 왼쪽 바퀴가 바깥쪽이라 더 먼 길을 갑니다. 차동기어의 피니언이 자전하며 바깥 사이드 기어는 케이스보다 빠르게, 안쪽은 느리게 돌게 합니다.' }),
  () => ({ q: '10% 오르막에서 멈췄다가 브레이크를 떼었습니다. 언덕 밀림 방지는 몇 초 동안 차를 붙잡을까요?', opts: ['0.5초', '2초', '10초'], ans: '2초',
      why: '경사에서 멈춘 채 브레이크를 떼면 2초 동안 가려는 반대 방향으로 밀리지 않게 붙잡습니다. 그 사이 가속 페달을 밟으면 됩니다.' }),
  () => { const g = pick([2, 3, 4, 5, 6]), nx = g < 6 ? g + 1 : g - 1, A = CHART[g], B = CHART[nx], off = A.filter(x => !B.includes(x)), on = B.filter(x => !A.includes(x));
    const nm = id => EL.find(e => e.id === id).name;
    return { q: `${g}단에서 ${nx}단으로 바꿀 때, 풀리는 요소와 물리는 요소는?`, opts: [nm(off[0]) + ' 풀림 · ' + nm(on[0]) + ' 물림', nm(on[0]) + ' 풀림 · ' + nm(off[0]) + ' 물림', '모두 그대로'], ans: nm(off[0]) + ' 풀림 · ' + nm(on[0]) + ' 물림',
      why: `${g}단(${A.map(nm).join('+')}) → ${nx}단(${B.map(nm).join('+')}). 하나는 그대로 두고 하나만 바꾸는 클러치 투 클러치 변속입니다. 단면 3D의 변속 슬로 모션으로 볼 수 있습니다.` }; }
];
function newSit() {
  const q = pick(SIT_GEN)(); SIT.cur = q;
  $('sitText').textContent = q.q; $('sitFb').hidden = true;
  $('sitOpts').className = 'q-opts' + (q.opts.length === 4 ? ' g4' : '');
  $('sitOpts').innerHTML = q.opts.map(o => `<button class="qchip" type="button" data-o="${o}">${o}</button>`).join('');
}
$('sitOpts').addEventListener('click', e => {
  const b = e.target.closest('.qchip'); if (!b || !SIT.cur || b.disabled) return;
  const ok = b.dataset.o === SIT.cur.ans; SIT.n++; if (ok) { SIT.ok++; SIT.streak++; } else SIT.streak = 0;
  $('sitOpts').querySelectorAll('.qchip').forEach(x => { x.disabled = true; if (x.dataset.o === SIT.cur.ans) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
  const fb = $('sitFb'); fb.hidden = false; fb.className = 'fb ' + (ok ? 'ok' : 'bad'); fb.textContent = (ok ? '정답! ' : '정답은 ' + SIT.cur.ans + '. ') + SIT.cur.why;
  $('scoreSit').textContent = `정답 ${SIT.ok} / ${SIT.n} · 연속 ${SIT.streak}`;
});
$('sitNext').addEventListener('click', newSit);
newSit();

// ---- 용어 설명: 설명 글 속 용어를 누르거나 마우스를 올리면 짧은 풀이가 뜬다 ----
const TERMS = {
  '토크 컨버터': '엔진과 변속기 사이에서 기름으로 힘을 전하는 장치. 펌프(엔진 쪽)가 기름을 돌려 터빈(변속기 쪽)을 돌리고, 출발할 때는 토크를 최대 2배쯤 키웁니다.',
  '록업 클러치': '토크 컨버터 안의 클러치. 펌프와 터빈 속도가 비슷해지면 둘을 붙여 기름 미끄럼으로 잃는 힘을 없앱니다.',
  '록업': '토크 컨버터의 록업 클러치가 붙어 엔진과 변속기 입력축이 한 몸으로 도는 상태.',
  '스테이터': '토크 컨버터 가운데의 작은 날개 바퀴. 터빈에서 나온 기름의 방향을 바꿔 토크를 키우고, 원웨이 클러치로 한쪽으로만 돕니다.',
  '킥다운': '가속 페달을 갑자기 끝까지 밟으면 큰 힘을 내려고 여러 단을 한꺼번에 내리는 변속.',
  '원웨이 클러치': '한쪽 방향으로만 힘을 전하고 반대쪽으로는 헛도는 클러치(OWC). 1단에서 가속할 때는 잡고, 가속을 놓으면 풀립니다.',
  '라비뇨': '선기어 두 개, 긴·짧은 피니언, 링기어 하나로 이루어진 복합 유성기어(Ravigneaux). 적은 부품으로 여러 변속비를 냅니다.',
  '유성기어': '가운데 선기어, 바깥 링기어, 그 사이를 도는 피니언과 캐리어로 된 기어 세트. 셋 중 하나를 잡고 하나를 돌리면 나머지가 정해진 비로 돕니다.',
  '캐리어': '유성기어에서 피니언들의 축을 붙잡고 함께 도는 틀.',
  '종감속': '변속기에서 나온 회전을 바퀴에 맞게 한 번 더 줄이는 기어. 이 차는 3.510배.',
  '차동기어': '굽은 길에서 바깥 바퀴는 빨리, 안쪽 바퀴는 느리게 돌 수 있게 해 주는 기어 장치.',
  '헬리컬 기어': '이가 축에 비스듬히 난 기어. 여러 이가 동시에 맞물려 조용하고 힘을 잘 전합니다.',
  '클러치 투 클러치': '한 클러치를 풀면서 동시에 다른 클러치를 물려 동력이 끊기지 않게 바꾸는 변속 방식.',
  '엔진 브레이크': '가속을 놓았을 때 엔진의 저항으로 차가 느려지는 것. 낮은 단일수록 강합니다.',
  '히스테리시스': '올리는 기준과 내리는 기준 사이에 일부러 둔 틈. 경계에서 변속이 왔다 갔다 하는 것을 막습니다.',
  '트랜스퍼 기어': '변속기 출력 기어의 회전을 옆의 축으로 옮겨 종감속 기어로 보내는 기어.',
  '피스톤': '유압으로 밀려 클러치 판들을 눌러 붙이는 부품.'
};
(() => {
  const names = Object.keys(TERMS).sort((a, b) => b.length - a.length);
  document.querySelectorAll('.gt-sub, .hint3, .note, .sub, header p').forEach(el => {
    const used = new Set();
    const walk = node => {
      if (node.nodeType === 3) {
        for (const t of names) {
          if (used.has(t) || [...used].some(u => u.includes(t))) continue;
          const i = node.nodeValue.indexOf(t); if (i < 0) continue;
          used.add(t);
          const after = node.splitText(i), rest = after.splitText(t.length);
          const b = document.createElement('button'); b.type = 'button'; b.className = 'term'; b.dataset.term = t; b.textContent = t;
          after.parentNode.replaceChild(b, after); walk(rest); return;
        }
      } else if (node.nodeType === 1 && !node.classList.contains('term')) [...node.childNodes].forEach(walk);
    };
    walk(el);
  });
  const pop = document.createElement('div'); pop.className = 'term-pop'; pop.hidden = true; pop.setAttribute('role', 'tooltip'); document.body.appendChild(pop);
  let cur = null;
  const show = b => { cur = b; pop.innerHTML = '<b>' + b.dataset.term + '</b>' + TERMS[b.dataset.term]; pop.hidden = false;
    const r = b.getBoundingClientRect(), w = Math.min(300, window.innerWidth - 24);
    pop.style.maxWidth = w + 'px'; pop.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + scrollX - 20)) + 'px'; pop.style.top = (r.bottom + scrollY + 6) + 'px'; };
  const hide = () => { pop.hidden = true; cur = null; };
  document.addEventListener('click', e => { const b = e.target.closest('.term'); if (b) { cur === b ? hide() : show(b); } else if (!e.target.closest('.term-pop')) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  if (matchMedia('(hover: hover)').matches) { document.addEventListener('mouseover', e => { const b = e.target.closest('.term'); if (b && b !== cur) show(b); });
    document.addEventListener('mouseout', e => { const b = e.target.closest('.term'); if (b && !e.relatedTarget?.closest?.('.term-pop')) hide(); }); }
})();

// ---- 토크 컨버터: 왼쪽 펌프(엔진), 오른쪽 터빈(변속기 입력). 실제 속도의 1/40로 돌린다 ----
const tcv = { visible: false, aP: 0, aT: 0, drawT: 0, lastState: '' };
const tcCv = $('tcCv'), tcc = tcCv.getContext('2d');
if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => { tcv.visible = e.isIntersecting; })).observe(tcCv); else tcv.visible = true;
function drawTC(dt) {
  const T = sim.tc;
  tcv.aP += T.pump * Math.PI / 30 * dt / 40; tcv.aT += T.turb * Math.PI / 30 * dt / 40 * (sim.v < 0 ? -1 : 1);
  if (performance.now() - tcv.drawT > 150) {
    tcv.drawT = performance.now();
    setText('tcP', Math.round(T.pump / 10) * 10 + ' rpm'); setText('tcT', Math.round(T.turb / 10) * 10 + ' rpm');
    setText('tcSr', Math.round(T.sr * 100) + '%'); setText('tcM', '×' + T.mult.toFixed(2));
    const st = sim.cur === 'N' ? 'N: 터빈이 펌프를 따라 헛돌 뿐, 바퀴로 힘이 가지 않습니다.' : T.lock ? '록업 접합: 펌프와 터빈이 한 몸으로 돌아 손실이 없습니다.' :
      T.mult > 1.05 ? '토크 증대 중: 터빈이 펌프보다 많이 느려 힘이 ' + T.mult.toFixed(2) + '배로 커집니다.' : '유체 연결: 속도 차가 작아 토크 증대 없이 기름으로 힘을 전합니다.';
    if (st !== tcv.lastState) { tcv.lastState = st; $('tcState').textContent = st; }
  }
  if (!tcv.visible) return;
  const dpr = window.devicePixelRatio || 1, W = tcCv.clientWidth, H = tcCv.clientHeight;
  if (!W) return;
  if (tcCv.width !== Math.round(W * dpr)) { tcCv.width = Math.round(W * dpr); tcCv.height = Math.round(H * dpr); }
  tcc.setTransform(dpr * W / 400, 0, 0, dpr * W / 400, 0, 0); tcc.clearRect(0, 0, 400, 200);
  const v = cssv(), font = getComputedStyle(document.body).fontFamily;
  const fan = (cx, ang, col, label, rpm) => {
    tcc.save(); tcc.translate(cx, 92);
    tcc.beginPath(); tcc.arc(0, 0, 62, 0, 7); tcc.fillStyle = 'rgba(255,255,255,.04)'; tcc.fill(); tcc.strokeStyle = col; tcc.lineWidth = 2; tcc.stroke();
    tcc.rotate(ang); tcc.strokeStyle = col; tcc.lineWidth = 3; tcc.lineCap = 'round';
    for (let i = 0; i < 12; i++) { tcc.rotate(Math.PI / 6); tcc.beginPath(); tcc.moveTo(14, 0); tcc.quadraticCurveTo(38, 12, 58, 6); tcc.stroke(); }
    tcc.restore();
    tcc.beginPath(); tcc.arc(cx, 92, 9, 0, 7); tcc.fillStyle = col; tcc.fill();
    tcc.fillStyle = '#e9e9ea'; tcc.font = '500 13px ' + font; tcc.textAlign = 'center'; tcc.fillText(label, cx, 176);
    tcc.fillStyle = '#8b8e94'; tcc.font = '12px ' + font; tcc.fillText(Math.round(rpm) + ' rpm', cx, 192);
  };
  fan(100, tcv.aP, v('--accent'), '펌프 (엔진)', T.pump);
  fan(300, tcv.aT, v('--s2'), '터빈 (변속기)', T.turb);
  // 가운데: 록업이면 두 축을 잇는 초록 막대, 아니면 기름 흐름(점선 화살표)
  tcc.save();
  if (T.lock) { tcc.fillStyle = v('--on'); tcc.fillRect(162, 86, 76, 12); tcc.fillStyle = '#e9e9ea'; tcc.font = '500 12px ' + font; tcc.textAlign = 'center'; tcc.fillText('록업', 200, 74); }
  else {
    tcc.strokeStyle = '#8b8e94'; tcc.lineWidth = 2; tcc.setLineDash([5, 5]); tcc.lineDashOffset = -(tcv.aP * 20) % 10;
    tcc.beginPath(); tcc.moveTo(166, 80); tcc.quadraticCurveTo(200, 62, 234, 80); tcc.stroke();
    tcc.beginPath(); tcc.moveTo(234, 104); tcc.quadraticCurveTo(200, 122, 166, 104); tcc.stroke();
    tcc.setLineDash([]); tcc.fillStyle = '#8b8e94'; tcc.font = '12px ' + font; tcc.textAlign = 'center'; tcc.fillText('기름 흐름', 200, 96);
  }
  tcc.restore();
}

// ---- 변속 패턴 지도: 가로 속도(0~220km/h), 세로 가속 페달(0~100%). 평지 기준 올림·내림 선 ----
const mapS = { visible: false, hover: null, drawT: 0 };
const mapCv = $('mapCv'), mc = mapCv.getContext('2d');
if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => { mapS.visible = e.isIntersecting; })).observe(mapCv); else mapS.visible = true;
const kmhAt = (rpm, g) => rpm * Math.PI / 30 / ratioOf(g) * CFG.tireR * 3.6;
function gearAt(kmh, th) {                     // 그 자리에 머물렀을 때 TCU가 고를 단(평지)
  const M = MODES[sim.mode];
  for (let g = M.minG; g < 6; g++) if (kmh < kmhAt(upRpm(M, th), g)) return g;
  return 6;
}
mapCv.addEventListener('pointermove', e => { const r = mapCv.getBoundingClientRect(); mapS.hover = [e.clientX - r.left, e.clientY - r.top]; });
mapCv.addEventListener('pointerleave', () => { mapS.hover = null; });
function drawMap(now) {
  if (!mapS.visible || now - mapS.drawT < 100) return;
  mapS.drawT = now;
  const dpr = window.devicePixelRatio || 1, W = mapCv.clientWidth, H = mapCv.clientHeight;
  if (!W) return;
  if (mapCv.width !== Math.round(W * dpr)) { mapCv.width = Math.round(W * dpr); mapCv.height = Math.round(H * dpr); }
  mc.setTransform(dpr, 0, 0, dpr, 0, 0); mc.clearRect(0, 0, W, H);
  const v = cssv(), ink = v('--ink'), ink2 = v('--ink-2'), line = v('--line'), acc = v('--accent'), font = getComputedStyle(document.body).fontFamily;
  const L = 44, R = 12, T = 22, B = 30, KMAX = 220;
  const X = k => L + (W - L - R) * k / KMAX, Y = th => T + (H - T - B) * (1 - th);
  mc.font = '11px ' + font; mc.textBaseline = 'middle'; mc.lineWidth = 1; mc.strokeStyle = line; mc.fillStyle = ink2;
  mc.textAlign = 'right'; [0, 0.5, 1].forEach(t => { const y = Math.round(Y(t)) + 0.5; mc.beginPath(); mc.moveTo(L, y); mc.lineTo(W - R, y); mc.stroke(); mc.fillText(t * 100 + '%', L - 6, y); });
  mc.textAlign = 'center'; [0, 50, 100, 150, 200].forEach(k => mc.fillText(String(k), X(k), H - B + 14));
  mc.fillText('km/h', W - R - 12, H - B + 14);
  const M = MODES[sim.mode], N = 24;
  mc.save(); mc.beginPath(); mc.rect(L, T - 2, W - L - R, H - T - B + 4); mc.clip();
  for (let g = 2; g <= 6; g++) {                       // 내림 g→g−1: 점선
    if (g <= M.minG) continue;
    mc.strokeStyle = ink2; mc.setLineDash([4, 4]); mc.lineWidth = 1.5; mc.beginPath();
    for (let i = 0; i <= N; i++) { const th = i / N, k = kmhAt(dnRpm(M, th), g); i ? mc.lineTo(X(k), Y(th)) : mc.moveTo(X(k), Y(th)); }
    mc.stroke();
  }
  mc.setLineDash([]);
  for (let g = M.minG; g < 6; g++) {                    // 올림 g→g+1: 실선
    mc.strokeStyle = acc; mc.lineWidth = 2; mc.beginPath();
    for (let i = 0; i <= N; i++) { const th = i / N, k = kmhAt(upRpm(M, th), g); i ? mc.lineTo(X(k), Y(th)) : mc.moveTo(X(k), Y(th)); }
    mc.stroke();
  }
  mc.restore();
  mc.fillStyle = ink; mc.textAlign = 'center'; mc.font = '500 11px ' + font;
  for (let g = M.minG; g < 6; g++) { const k = kmhAt(upRpm(M, 1), g); if (k < KMAX) mc.fillText(g + '→' + (g + 1), X(k), T - 10); }
  // 지금 차
  const kmh = Math.abs(sim.v) * 3.6, cx = X(Math.min(KMAX, kmh)), cy = Y(sim.th);
  mc.beginPath(); mc.arc(cx, cy, 6, 0, 7); mc.fillStyle = v('--panel'); mc.fill(); mc.lineWidth = 2.5; mc.strokeStyle = ink; mc.stroke();
  const tg = targetGear(); mc.fillStyle = ink; mc.textAlign = 'left'; mc.font = '500 12px ' + font;
  mc.fillText(tg === 'N' || tg === 'R' ? tg : tg + '단', Math.min(cx + 10, W - R - 30), cy - 12);
  // 호버: 그 지점에서 고를 단
  const tip = $('mapTip');
  if (mapS.hover && mapS.hover[0] >= L && mapS.hover[1] >= T && mapS.hover[1] <= H - B) {
    const k = (mapS.hover[0] - L) / (W - L - R) * KMAX, th = 1 - (mapS.hover[1] - T) / (H - T - B), g = gearAt(k, clamp(th, 0, 1));
    mc.strokeStyle = ink2; mc.lineWidth = 1; mc.beginPath(); mc.moveTo(mapS.hover[0] + 0.5, T); mc.lineTo(mapS.hover[0] + 0.5, H - B); mc.stroke();
    tip.hidden = false;
    tip.innerHTML = `<span>속도</span> <b>${Math.round(k)}</b> km/h · <span>페달</span> <b>${Math.round(clamp(th, 0, 1) * 100)}</b>%<br>여기서 머물면 <b>${g}단</b> (엔진 ${Math.round(rpmAt(k / 3.6, g) / 10) * 10} rpm)`;
    const tw = tip.offsetWidth; tip.style.left = (mapS.hover[0] + 20 + tw > W ? mapS.hover[0] - tw - 12 : mapS.hover[0] + 20) + 'px';
    tip.style.top = clamp(mapS.hover[1] + 14, 8, H - tip.offsetHeight) + 'px';
  } else tip.hidden = true;
  setText('mapMode', M.name + ' 모드 · 평지 기준');
}

// ---- 운전 과제 ----
const MIS_DEFS = [
  { id: 'smooth', title: '부드러운 출발', desc: '0→60km/h까지 엔진 3,000rpm을 넘기지 마세요.', better: 'low',
    setup() { setRoadNow(0); },
    check(m) { const kmh = sim.v * 3.6, rpm = sim.we * 30 / Math.PI;
      if (kmh > 1 && rpm > 3000) return { fail: '엔진이 ' + Math.round(rpm) + 'rpm까지 올라갔습니다. 페달을 더 살살 밟아 보세요.' };
      return kmh >= 60 ? { ok: true } : { p: kmh / 60, msg: '60km/h까지 ' + Math.max(0, 60 - kmh).toFixed(0) + 'km/h 남았습니다. 지금 ' + Math.round(rpm) + 'rpm' }; } },
  { id: 'engbrake', title: '내리막 엔진 브레이크', desc: '8% 내리막에서 브레이크 없이 40~60km/h를 15초 유지하세요. 수동 2·3단을 써 보세요.', better: 'low',
    setup() { setRoadNow(-8); },
    check(m, dt) { const kmh = sim.v * 3.6;
      if (sim.brake) return { fail: '브레이크를 밟았습니다. 낮은 단(키보드 2·3)으로 엔진 브레이크를 걸어 보세요.' };
      m.hold = kmh >= 40 && kmh <= 60 ? (m.hold || 0) + dt : 0;
      return m.hold >= 15 ? { ok: true } : { p: m.hold / 15, msg: kmh < 40 ? '40km/h까지 올리세요. 지금 ' + Math.round(kmh) + 'km/h' : kmh > 60 ? '너무 빠릅니다(' + Math.round(kmh) + 'km/h). 단을 내리세요.' : '좋습니다. ' + (15 - m.hold).toFixed(1) + '초 더 유지하세요.' }; } },
  { id: 'hill', title: '언덕 출발', desc: '10% 오르막에서 브레이크를 밟은 채 시작합니다. D로 놓고 출발해 뒤로 30cm 넘게 밀리지 말고 20km/h까지 가세요.', better: 'low',
    setup(m) { setRoadNow(10); sim.v = 0; setBrake(true); m.x0 = sim.x; },
    check(m) { const kmh = sim.v * 3.6;
      if (sim.x < m.x0 - 0.3) return { fail: '뒤로 ' + (m.x0 - sim.x).toFixed(1) + 'm 밀렸습니다. 브레이크를 뗀 뒤 2초 안에 가속 페달을 밟으세요.' };
      return kmh >= 20 ? { ok: true } : { p: Math.max(0, kmh) / 20, msg: sim.lever !== 'D' ? '레버를 D로 놓으세요(브레이크는 밟힌 상태입니다).' : sim.brake ? '브레이크를 떼면 2초 동안 언덕 밀림 방지가 차를 붙잡습니다.' : '가속 페달을 밟으세요. 지금 ' + Math.round(kmh) + 'km/h' }; } },
  { id: 'kick', title: '킥다운 체험', desc: '평지에서 70km/h 넘게 달리다 가속 페달을 한 번에 끝까지 밟아, 두 단 이상 한꺼번에 내려 보세요.', better: 'low',
    setup() { setRoadNow(0); },
    check(m) { const kmh = sim.v * 3.6, k = sim.kd;
      if (k && k.at > m.t0 && k.from - k.to >= 2 && kmh >= 65) return { ok: true, note: k.from + '단 → ' + k.to + '단' };
      return { p: Math.min(1, kmh / 70) * 0.8, msg: kmh < 70 ? '페달을 반쯤 밟고 70km/h까지 가세요. 지금 ' + Math.round(kmh) + 'km/h' : '이제 가속 페달을 놓았다가 한 번에 끝까지(키보드는 ↓ 뗀 뒤 ↑를 빠르게) 밟으세요.' }; } },
  { id: 'eco', title: '연비 왕', desc: '평지에서 1km를 달리는 동안 평균 연비 14km/L 이상을 내세요.', better: 'high', unit: 'km/L',
    setup(m) { setRoadNow(0); m.f0 = sim.fuel.total; m.d0 = sim.fuel.dist; },
    check(m) { const d = sim.fuel.dist - m.d0, L = (sim.fuel.total - m.f0) / 745, kml = L > 0 ? d / 1000 / L : 0;
      if (d >= 1000) return kml >= 14 ? { ok: true, score: kml } : { fail: '평균 ' + kml.toFixed(1) + 'km/L로 목표(14km/L)에 못 미쳤습니다. 일찍 올리고 가속을 줄여 보세요.' };
      return { p: d / 1000, msg: Math.round(d) + 'm / 1,000m · 평균 ' + (L > 0 ? kml.toFixed(1) : '–') + 'km/L' }; } }
];
const MIS = { cur: null };
const misKey = id => 'sonata6at.mis.' + id;
function misBest(d) { try { const v = parseFloat(localStorage.getItem(misKey(d.id))); return v > 0 ? v : null; } catch (e) { return null; } }
function misFmt(d, v) { return d.unit ? v.toFixed(1) + ' ' + d.unit : v.toFixed(1) + '초'; }
function renderMisList() {
  $('misList').innerHTML = MIS_DEFS.map(d => { const b = misBest(d);
    return `<button class="mis" type="button" data-id="${d.id}"><b>${d.title}</b><span>${d.desc}</span>${b ? `<em>최고 기록 ${misFmt(d, b)}</em>` : ''}</button>`; }).join('');
}
renderMisList();
function startMission(id) {
  const d = MIS_DEFS.find(x => x.id === id);
  setThrottle(0); setBrake(false); sim.v = 0; sim.lock = false;
  if (sim.lever !== 'N') requestLever('N');
  const m = { d, t0: sim.t, state: 'run' };
  d.setup(m);
  MIS.cur = m;
  const box = $('misNow'); box.hidden = false; box.classList.remove('ok', 'fail');
  $('misTitle').textContent = d.title; $('misStatus').textContent = d.desc;
  say('과제 시작: ' + d.title);
  document.getElementById('drive').scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'start' });
}
$('misList').addEventListener('click', e => { const b = e.target.closest('.mis'); if (b) startMission(b.dataset.id); });
$('misRetry').addEventListener('click', () => { if (MIS.cur) startMission(MIS.cur.d.id); });
$('misStop').addEventListener('click', () => { MIS.cur = null; $('misNow').hidden = true; });
function checkMission(dt) {
  const m = MIS.cur; if (!m || m.state !== 'run') return;
  const r = m.d.check(m, dt), box = $('misNow');
  if (r.fail) { m.state = 'fail'; box.classList.add('fail'); $('misStatus').textContent = '실패: ' + r.fail; say('과제 실패: ' + m.d.title, true); return; }
  if (r.ok) {
    m.state = 'ok'; box.classList.add('ok'); $('misFill').style.width = '100%';
    const score = r.score !== undefined ? r.score : sim.t - m.t0, best = misBest(m.d);
    const nb = best === null || (m.d.better === 'high' ? score > best : score < best);
    if (nb) { try { localStorage.setItem(misKey(m.d.id), String(score)); } catch (e) {} }
    $('misStatus').textContent = '성공! ' + misFmt(m.d, score) + (r.note ? ' (' + r.note + ')' : '') + (nb ? ' · 새 최고 기록' : ' · 최고 ' + misFmt(m.d, best));
    say('과제 성공: ' + m.d.title); renderMisList(); return;
  }
  $('misFill').style.width = Math.round(clamp(r.p, 0, 1) * 100) + '%';
  setText('misStatus', r.msg);
}

// ---- CSV 내려받기, 기록 공유 ----
$('logCsv').addEventListener('click', () => {
  if (!log.buf.length) { t100Say('아직 기록이 없습니다. 조금 달린 뒤 내려받으세요.'); return; }
  const rows = [['시간(초)', '속도(km/h)', '엔진(rpm)', '단수', '가속 페달(%)', '경사(%)', '연료(g/s)']].concat(
    log.buf.map(p => [(p.t - log.buf[0].t).toFixed(1), p.kmh.toFixed(1), Math.round(p.rpm), LOG_STRIPS[2].fmt(p.g), Math.round(p.th * 100), (p.gr * 100).toFixed(1), p.fuel.toFixed(3)]));
  const blob = new Blob(['﻿' + rows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sonata-6at-주행기록.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('logShare').addEventListener('click', async () => {
  const u = new URL(location.href); u.search = '';
  if (t100.best) u.searchParams.set('t100', t100.best.toFixed(1));
  u.searchParams.set('mode', sim.mode);
  const text = t100.best ? `쏘나타 6단 시뮬레이터 0→100km/h ${t100.best.toFixed(1)}초 (${MODES[sim.mode].name} 모드). 도전해 보세요!` : '쏘나타 6단 자동변속기 시뮬레이터';
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: document.title, text, url: u.href }); return; }
    await navigator.clipboard.writeText(text + ' ' + u.href); t100Say('공유 링크를 복사했습니다. 붙여 넣어 보내세요.');
  } catch (e) { t100Say('복사하지 못했습니다. 이 주소를 직접 복사하세요: ' + u.href); }
});
(() => {                                   // 공유받은 링크로 들어온 경우
  const q = new URLSearchParams(location.search), t = parseFloat(q.get('t100')), md = q.get('mode');
  if (md && MODES[md]) $('modeSeg').querySelector(`[data-k="${md}"]`).click();
  if (t > 0) t100Say(`공유받은 기록: 0→100km/h ${t.toFixed(1)}초${md && MODES[md] ? ' (' + MODES[md].name + ' 모드)' : ''}. 이 기록을 깨 보세요!`);
})();

// ---- 크게 보기: 주행 화면을 전체 화면으로. 전체 화면을 못 하는 기기(아이폰 등)는 화면을 덮는 방식으로 ----
const BIG = { on: false };
function setBig(on) {
  const box = $('box3D').parentElement;
  BIG.on = on; box.classList.toggle('full', on); document.body.classList.toggle('drive-full', on);
  const fs = box.requestFullscreen || box.webkitRequestFullscreen;
  if (on && fs && !document.fullscreenElement) { try { const r = fs.call(box); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
  if (!on && (document.fullscreenElement || document.webkitFullscreenElement)) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
  $('bigBtn').textContent = on ? '작게 보기' : '⤢ 크게 보기';
  drive.size = 0; if (on) initDrive();
  if (on) drive.visible = true;
}
$('bigBtn').addEventListener('click', () => setBig(!BIG.on));
$('bigExit').addEventListener('click', () => setBig(false));
['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => { if (!(document.fullscreenElement || document.webkitFullscreenElement) && BIG.on) setBig(false); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && BIG.on) setBig(false); });
$('fLever').addEventListener('click', e => { const b = e.target.closest('button'); if (b) requestLever(b.dataset.k); });

// ---- 휴대폰 운전 조작 막대 ----
const pb = { gas: false };
function holdBtn(el, on, off) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} el.classList.add('down'); on(); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => el.addEventListener(ev, () => { if (el.classList.contains('down')) { el.classList.remove('down'); off(); } }));
  el.addEventListener('contextmenu', e => e.preventDefault());
}
holdBtn($('pbGas'), () => { pb.gas = true; setBrake(false); }, () => { pb.gas = false; setThrottle(0); });
holdBtn($('pbBrake'), () => { setThrottle(0); setBrake(true); }, () => setBrake(false));
holdBtn($('fGas'), () => { pb.gas = true; setBrake(false); }, () => { pb.gas = false; setThrottle(0); });
holdBtn($('fBrake'), () => { setThrottle(0); setBrake(true); }, () => setBrake(false));
$('pbLever').addEventListener('click', e => { const b = e.target.closest('button'); if (b) requestLever(b.dataset.k); });
$('pbToggle').addEventListener('click', () => {
  const min = $('pedalbar').classList.toggle('min');
  $('pbToggle').textContent = min ? '+' : '–'; $('pbToggle').setAttribute('aria-expanded', !min);
  $('pbToggle').setAttribute('aria-label', min ? '운전 조작 펼치기' : '운전 조작 접기');
});
function updatePedalbar(dt) {
  if (pb.gas) setThrottle(+thEl.value + dt * 80);                     // 누르고 있으면 약 1.2초에 걸쳐 끝까지 밟힌다
  $('pbGasBar').style.width = thEl.value + '%';
  setText('pbGear', $('gearTxt').textContent); setText('pbKmh', $('kmhTxt').textContent + ' km/h');
  ['pbLever', 'fLever'].forEach(id => $(id).querySelectorAll('button').forEach(b => { const on = b.dataset.k === sim.lever; if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', on); }));
  if (BIG.on) { $('fGasBar').style.width = thEl.value + '%'; setText('fKmh', $('kmhTxt').textContent); setText('fGear', $('gearTxt').textContent); setText('fRpm', $('rpmTxt').textContent + ' rpm'); }
}

// ---- 처음 방문 안내(닫으면 이 브라우저에서는 다시 보이지 않음) ----
(() => { let off = false; try { off = localStorage.getItem('sonata6at.guide') === '0'; } catch (e) {}
  $('guide').hidden = off;
  $('guideClose').addEventListener('click', () => { $('guide').hidden = true; try { localStorage.setItem('sonata6at.guide', '0'); } catch (e) {} }); })();

// ---- 3D 가볍게 ----
// 느린 기기 감지: 처음 몇 초 동안 프레임이 30fps보다 느리면 한 번만 '3D 가볍게'를 자동으로 켠다(직접 누르면 다시 켜지 않음)
const PERF = { ema: 0.016, t: 0, done: false, user: false };
function watchPerf(dt) {
  if (PERF.done || PERF.user || LITE || document.hidden) return;
  PERF.ema += (dt - PERF.ema) * 0.05; PERF.t += dt;
  if (PERF.t > 3 && PERF.ema > 0.034) { PERF.done = true; setLite(true); say('화면 움직임이 느려 3D 가볍게를 켰습니다. 위쪽 버튼으로 끌 수 있습니다.'); }
  if (PERF.t > 12) PERF.done = true;
}
function setLite(on) {
  LITE = on; $('liteBtn').setAttribute('aria-pressed', on);
  [ctlL, ctlF, ctlR].forEach(c => { if (c.renderer) { c.renderer.setPixelRatio(PR()); c.size = 0; } });
  if (drive.renderer) { drive.renderer.setPixelRatio(PR()); drive.size = 0; }
  if (TR.ctl) { TR.ctl.renderer.setPixelRatio(PR()); TR.size = 0; }
}
$('liteBtn').addEventListener('click', () => { PERF.user = true; setLite(!LITE); });
setLite(LITE);

let prev = performance.now(), lastGear = null, lastLever = null, lastManual = 0, lastEl = '', lastMsg = null;
function setText(id, t) { const e = $(id); if (e.textContent !== t) e.textContent = t; }

function frame(now) {
  const dtR = Math.min(0.05, (now - prev) / 1000); prev = now;
  const dt = dtR * timeScale();                       // 변속 슬로 모션이면 변속 중 시간이 느려진다
  const n = Math.ceil(dt / 0.008);
  for (let i = 0; i < n; i++) step(dt / n);
  updateSteer(dtR);
  updateLateral(dt);
  updateLaps();
  updateShiftTL();

  const rpm = sim.we * 30 / Math.PI, kmh = Math.abs(sim.v) * 3.6;
  const k = Math.min(1, dt * 14);
  disp.rpm += (rpm - disp.rpm) * k; disp.kmh += (kmh - disp.kmh) * k;

  const px = cv.clientWidth * (window.devicePixelRatio || 1);
  if (px > 0 && cv.width !== Math.round(px)) { cv.width = Math.round(px); cv.height = Math.round(px / 2); }
  ctx.setTransform(cv.width / 640, 0, 0, cv.width / 640, 0, 0);
  ctx.clearRect(0, 0, 640, 320);
  const v = cssv();
  const c = { ink: '#e9e9ea', dim: '#7d8086', accent: v('--accent'), red: v('--red') };
  dial(160, 165, 140, disp.rpm, 7000, 500, 2, x => String(x / 1000), 6500, 'x1000 rpm', c);
  dial(480, 165, 140, disp.kmh, 240, 10, 4, x => String(x), null, 'km/h', c);
  drawShiftBadge(c);

  const tg = targetGear();
  const gTxt = tg === 'N' ? 'N' : tg === 'R' ? 'R' : (sim.manual ? 'M' : 'D') + tg;
  setText('gearTxt', gTxt);
  setText('rpmTxt', String(Math.round(rpm / 10) * 10));
  setText('kmhTxt', String(Math.round(kmh)));
  const ps = Math.max(0, sim.Teng * sim.we / 735.5);
  setText('psTxt', String(Math.round(ps)));

  if (sim.lever !== lastLever) {
    lastLever = sim.lever;
    $('seg').style.setProperty('--i', LEVERS.indexOf(sim.lever));
    $('seg').querySelectorAll('button').forEach(b => { const on = b.dataset.k === sim.lever; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
  }
  if (sim.manual !== lastManual) {
    lastManual = sim.manual;
    $('gears').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.n === sim.manual));
  }
  if (sim.msg !== lastMsg) { lastMsg = sim.msg; const m = $('msg'); m.textContent = sim.msg; m.classList.toggle('warn', sim.warn); }

  // 작동 요소: LR은 1단에서 8km/h 이상일 때 함께 작동(엔진 브레이크)
  let active = CHART[tg].slice();
  if (tg === 1 && kmh > 8) active.push('LR');
  const key = active.join(',') + (sim.shift ? '*' : '');
  if (key !== lastEl) {
    lastEl = key;
    document.querySelectorAll('.el').forEach(e => {
      const on = active.includes(e.dataset.e);
      e.classList.toggle('on', on && !sim.shift);
      e.classList.toggle('half', on && !!sim.shift);
    });
    $('elSub').textContent = tg === 'N' ? 'N 레인지: 모든 요소 해제' :
      (tg === 'R' ? 'R' : tg + '단') + ' : ' + active.map(id => EL.find(e => e.id === id).name).join(' + ') + (sim.shift ? ' (변속 중)' : '');
  }
  FRAME_DT = dt;
  drawGears(dt, tg, active);
  drawQ(dt);
  drawLab(dt);
  FRAME_N++;
  watchPerf(dtR);
  updatePedalbar(dtR);
  renderDrive(dt);
  renderTrans();
  drawTC(dt);
  drawMap(now);
  checkMission(dt);
  updateSound(rpm);
  updateT100();
  logSample();
  drawLog(now);
  updatePathLive(active);
  if (tg !== lastGear) {
    lastGear = tg;
    document.querySelectorAll('#tbody tr').forEach(tr => tr.classList.toggle('on', tr.dataset.g === String(tg)));
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
