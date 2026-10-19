// 화면 6: 3D 가볍게, 느린 기기 감지, 매 프레임 루프(frame).
// 여러 파일이 전역 이름을 함께 씁니다(sim.js·course.js·dynamics.js 다음, 이 순서대로 불러와야 합니다).
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

function frame(now) {
  const dtR = Math.min(0.05, (now - prev) / 1000); prev = now;
  const dt = dtR * timeScale();                       // 변속 슬로 모션이면 변속 중 시간이 느려진다
  const n = Math.ceil(dt / 0.008);
  for (let i = 0; i < n; i++) step(dt / n);
  pollGamepad();
  updateSteer(dtR);
  updateLateral(dt);
  checkCollisions(dt);
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
  drawDash();
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
