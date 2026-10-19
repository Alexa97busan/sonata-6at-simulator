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
