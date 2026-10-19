// 차량 평면 운동(js/dynamics.js) 검사. 실행: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'js/dynamics.js'), 'utf8');
function make() { const ctx = vm.createContext({ Math }); vm.runInContext(CODE + '\n;globalThis.__E = { DYN, dynStep, tireForce };', ctx); return ctx.__E; }
const deg = x => x * 180 / Math.PI;
// 일정 속도·조향으로 t초 달리며 마지막 상태를 본다(속도는 고정: 엔진이 유지한다고 가정)
function hold(E, vx, delta, t, opt = {}) {
  const S = { vy: 0, r: 0 }; let o, v = vx, maxBeta = 0;
  for (let k = 0; k < t / 0.004; k++) { o = E.dynStep(S, { vx: v, delta, mu: opt.mu || 1.0, ax: 0, brake: 0, hb: opt.hb && k * 0.004 > (opt.hbAt || 0) }, 0.004); if (opt.free) v = Math.max(0, v + o.dvx * 0.004); maxBeta = Math.max(maxBeta, Math.abs(o.beta)); }
  return { S, o, v, maxBeta };
}

test('타이어 옆 힘: 미끄럼 반대 방향, 약 7°에서 최대, 접지 한계를 넘지 않는다', () => {
  const E = make(), Fz = 5000;
  assert.ok(E.tireForce(0.05, Fz, 1, 1e9) < 0 && E.tireForce(-0.05, Fz, 1, 1e9) > 0);
  const f = a => Math.abs(E.tireForce(a * Math.PI / 180, Fz, 1, 1e9));
  assert.ok(f(7) > f(3) && f(7) > f(20), `3°:${f(3)} 7°:${f(7)} 20°:${f(20)}`);
  assert.ok(f(7) <= Fz * 1.0001);
});

test('천천히 돌면 기하학 반경(L / tan δ)대로 돈다', () => {
  const E = make(), d = 0.1, v = 5;
  const { S } = hold(E, v, d, 6);
  const R = v / S.r, R0 = E.DYN.L / Math.tan(d);
  assert.ok(Math.abs(R - R0) / R0 < 0.15, `반경 ${R.toFixed(1)}m, 기하 ${R0.toFixed(1)}m`);
});

test('빠른 속도에서 핸들을 많이 꺾으면 앞이 밀린다(언더스티어): 회전 반경이 기하보다 훨씬 크다', () => {
  const E = make(), d = 0.12, v = 25;
  const { S, o } = hold(E, v, d, 4);
  const R = v / S.r, R0 = E.DYN.L / Math.tan(d);
  assert.ok(R > 2 * R0, `반경 ${R.toFixed(1)}m, 기하 ${R0.toFixed(1)}m`);
  assert.ok(o.slipF > o.slipR, `앞 미끄럼 ${o.slipF}, 뒤 ${o.slipR}`);
  assert.ok(Math.abs(o.ay) < 1.05 * 9.81, `옆 가속도 ${o.ay}`);
});

test('사이드 브레이크를 당기며 꺾으면 뒤가 돌아 나간다(드리프트): 차체 미끄럼 각 20° 이상', () => {
  const E = make();
  const { maxBeta, o } = hold(E, 18, 0.15, 1.0, { hb: true, hbAt: 0.4, free: true });
  assert.ok(deg(maxBeta) > 20, `미끄럼 각 ${deg(maxBeta).toFixed(1)}°`);
  assert.ok(o.slipR > 0.5, `뒤 미끄럼 ${o.slipR}`);
});

test('사이드 브레이크는 속도를 줄이고, 곧게 가면 차가 돌지 않는다', () => {
  const E = make(); const { S, v } = hold(E, 20, 0, 1.5, { hb: true, free: true });
  assert.ok(v < 20 - 3.5, `속도 ${v}`); assert.ok(Math.abs(S.r) < 1e-6);   // 뒷바퀴만 잠기므로 약 3m/s² 감속
});

test('미끄러운 길(μ 0.2)에서는 같은 코너에서 옆 가속도가 2m/s² 남짓으로 제한된다', () => {
  const E = make(); const { o } = hold(E, 15, 0.08, 4, { mu: 0.2 });
  assert.ok(Math.abs(o.ay) < 0.2 * 9.81 * 1.1, `옆 가속도 ${o.ay}`);
});

test('ESC를 켜면 사이드 브레이크로 뒤가 돌아도 차체 미끄럼 각이 20° 아래로 잡힌다(끄면 스핀)', () => {
  const E = make();
  const run = esc => { const S = { vy: 0, r: 0 }; let v = 22, mb = 0;
    for (let k = 0; k < 750; k++) { const t = k * 0.004, o = E.dynStep(S, { vx: v, delta: t < 1 ? 0.08 : 0, mu: 1, ax: 0, brake: 0, hb: t > 0.3 && t < 0.75, esc }, 0.004);
      v = Math.max(0, v + o.dvx * 0.004); mb = Math.max(mb, Math.abs(o.beta)); } return deg(mb); };
  const off = run(false), on = run(true);
  assert.ok(off > 45, `ESC 끔 ${off.toFixed(1)}°`); assert.ok(on < 20, `ESC 켬 ${on.toFixed(1)}°`);
});

// 코스 + 엔진·변속기 + 타이어 물리 + 자동 핸들을 함께 돌린다
function lapWithAuto(id, speedFactor) {
  const ctx = vm.createContext({ console, Math });
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  vm.runInContext(read('js/sim.js') + read('js/course.js') + CODE + '\n;globalThis.__E = { sim, step, requestLever, ROAD, makeCourse, roadStep, autoSteer, DYN };', ctx);
  const E = ctx.__E, c = E.makeCourse(id); E.ROAD.course = c; E.ROAD.curvOverride = 0; E.requestLever('D');
  const S = { vy: 0, r: 0, e: 0, h: 0 }; let t = 0, maxE = 0, lastV = 0;
  while (E.sim.x < c.L && t < 300) {
    const nc = c.nextCorner(E.sim.x, 150, E.sim.mu * 0.85), here = Math.abs(c.curvAt(E.sim.x));
    let target = 45; if (here > 1 / 250) target = Math.min(target, Math.sqrt(0.85 * 0.85 * E.sim.mu * 9.81 / here) * speedFactor);
    if (nc) target = Math.min(target, Math.sqrt((nc.v * speedFactor) ** 2 + 2 * 4 * nc.d));
    const err = target - E.sim.v; E.sim.th = err > 0 ? Math.min(1, err * 0.4) : 0; E.sim.brake = err < -0.2;
    E.step(0.004);
    const k = c.curvAt(E.sim.x), ax = (E.sim.v - lastV) / 0.004; lastV = E.sim.v;
    const r = E.roadStep(S, { vx: E.sim.v, delta: E.autoSteer(S, k, E.sim.v), mu: E.sim.mu * 0.85, ax: Math.max(-8, Math.min(6, ax)), brake: E.sim.brake ? 7.5 : 0, hb: false, esc: true }, k, 0.004);
    E.sim.v = Math.max(0, E.sim.v + r.dvx * 0.004); E.sim.x += (r.along - E.sim.v) * 0.004;
    t += 0.004; maxE = Math.max(maxE, Math.abs(S.e));
  }
  return { t, maxE, done: E.sim.x >= c.L };
}

test('자동 핸들(타이어 물리 위의 운전 보조): 권장 속도로 서킷 한 바퀴를 차로 안에서 돈다', () => {
  const r = lapWithAuto('circuit', 1);
  assert.ok(r.done, `${r.t.toFixed(0)}초 동안 완주 못 함`);
  assert.ok(r.maxE < 1.2, `차로에서 최대 ${r.maxE.toFixed(2)}m 벗어남`);
});

test('서킷의 가장 급한 코너(반경 약 47m, 한계 약 78km/h)에 110km/h로 브레이크 없이 들어가면 자동 핸들이어도 바깥으로 밀려 나간다(언더스티어, ESC 끔)', () => {
  const ctx = vm.createContext({ console, Math }), read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  vm.runInContext(read('js/sim.js') + read('js/course.js') + CODE + '\n;globalThis.__E = { sim, step, ROAD, makeCourse, roadStep, autoSteer };', ctx);
  const E = ctx.__E, c = E.makeCourse('circuit'); E.ROAD.course = c; E.ROAD.curvOverride = 0;
  let sMax = 0, kMax = 0; for (let i = 0; i < c.N; i++) if (Math.abs(c.kap[i]) > kMax) { kMax = Math.abs(c.kap[i]); sMax = i * c.ds; }
  const run = kmh => {
    Object.assign(E.sim, { lever: 'D', cur: 5, v: kmh / 3.6, x: sMax - 60, th: 0.3, brake: false, lastShift: -9 }); E.sim.we = E.sim.v / 0.334 * 1.0 * 3.51;
    const S = { vy: 0, r: 0, e: 0, h: 0 }; let maxE = 0;
    for (let t = 0; t < 4; t += 0.004) { E.step(0.004); const k = c.curvAt(E.sim.x);
      const r = E.roadStep(S, { vx: E.sim.v, delta: E.autoSteer(S, k, E.sim.v), mu: E.sim.mu * 0.85, ax: 0, brake: 0, hb: false, esc: false }, k, 0.004);
      E.sim.v = Math.max(0, E.sim.v + r.dvx * 0.004); E.sim.x += (r.along - E.sim.v) * 0.004; maxE = Math.max(maxE, Math.abs(S.e)); }
    return maxE;
  };
  const slow = run(60), fast = run(110);
  assert.ok(slow < 1, `60km/h 최대 ${slow.toFixed(2)}m`); assert.ok(fast > 3, `110km/h 최대 ${fast.toFixed(2)}m`);
});
