// 화면 5: 키보드, 0→100, 기록 그래프, 잇수 설정, 퀴즈, 용어, 토크 컨버터, 변속 지도, 과제, 공유, 크게 보기, 휴대폰 조작.
// 여러 파일이 전역 이름을 함께 씁니다(sim.js·course.js·dynamics.js 다음, 이 순서대로 불러와야 합니다).
// ---- 키보드 조작 ----
function setThrottle(pct) { thEl.value = clamp(pct, 0, 100); thEl.dispatchEvent(new Event('input')); }
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, select, summary, a')) return;
  const k = e.code;
  if (k === 'ArrowUp') { pb.gas = true; setBrake(false); }                   // 누르고 있는 동안 밟히고, 떼면 놓인다
  else if (k === 'ArrowDown') { if (!e.repeat) setThrottle(0); setBrake(true); }
  else if (k === 'KeyR' || k === 'KeyN' || k === 'KeyD') requestLever(k.slice(3));
  else if (/^Digit[1-6]$/.test(k)) requestManual(+k.slice(5));
  else if (k === 'Digit0') requestManual(null);
  else if (k === 'ArrowLeft' || k === 'ArrowRight') { if (COURSE.c && STEER.mode === 'auto') setSteerMode('manual'); STEER.key = k === 'ArrowLeft' ? -1 : 1; STEER.keyUsed = true; }
  else if (k === 'Space') { if (e.target.closest('button')) e.target.blur(); setHB(true); }
  else if (k === 'KeyE') setESC(!ESC.on);
  else if (k === 'KeyS') soundToggle();
  else if (k === 'KeyM') { const ks = Object.keys(MODES); $('modeSeg').querySelector(`[data-k="${ks[(ks.indexOf(sim.mode) + 1) % ks.length]}"]`).click(); }
  else return;
  e.preventDefault();
});
document.addEventListener('keyup', e => { if (e.code === 'ArrowUp' && pb.gas) { pb.gas = false; setThrottle(0); } if (e.code === 'Space' && HB.on) { e.preventDefault(); setHB(false); } if (e.code === 'ArrowDown') setBrake(false); if ((e.code === 'ArrowLeft' && STEER.key < 0) || (e.code === 'ArrowRight' && STEER.key > 0)) STEER.key = 0; });

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
