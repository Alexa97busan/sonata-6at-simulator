// 코스(js/course.js)와 코스 위 물리 검사. 실행: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'js/sim.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'js/course.js'), 'utf8');
function make() {
  const ctx = vm.createContext({ console, Math });
  vm.runInContext(CODE + '\n;globalThis.__E = { sim, step, requestLever, ROAD, MU, makeCourse, COURSE_DEFS };', ctx);
  return ctx.__E;
}
const IDS = ['country', 'mountain', 'circuit'];

test('코스는 닫힌 고리: 한 바퀴 돌면 같은 자리·같은 높이·같은 방향', () => {
  const E = make();
  for (const id of IDS) {
    const c = E.makeCourse(id), a = c.at(0), b = c.at(c.L), m = c.at(c.L * 0.37);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-6, id);
    assert.ok(Math.hypot(a.x - m.x, a.z - m.z) > 50, id + ' 중간이 출발점과 떨어져 있어야 함');
    let turn = 0; for (let i = 0; i < c.N; i++) turn += c.kap[i] * c.ds;
    assert.ok(Math.abs(Math.abs(turn) - 2 * Math.PI) < 0.05, `${id} 한 바퀴 회전 ${turn}`);
  }
});

test('산길은 오르내림이 크고 헤어핀이 있으며, 서킷은 거의 평평하다', () => {
  const E = make(), range = c => { let lo = Infinity, hi = -Infinity; for (const v of c.y) { lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo; };
  const kmax = c => Math.max(...Array.from(c.kap, Math.abs));
  const m = E.makeCourse('mountain'), ci = E.makeCourse('circuit');
  assert.ok(range(m) > 50, `산길 고도차 ${range(m)}`);
  assert.ok(1 / kmax(m) < 35, `산길 최소 반경 ${1 / kmax(m)}`);
  assert.ok(range(ci) < 6, `서킷 고도차 ${range(ci)}`);
});

test('도로의 서로 다른 구간이 겹치지 않는다(200m 넘게 떨어진 구간끼리 50m 이상)', () => {
  const E = make();
  for (const id of IDS) {
    const c = E.makeCourse(id), sep = Math.round(200 / c.ds);
    for (let i = 0; i < c.N; i += 2) for (let j = i + sep; j < c.N; j += 2) {
      if (c.N - (j - i) < sep) continue;
      assert.ok(Math.hypot(c.x[i] - c.x[j], c.z[i] - c.z[j]) > 50, `${id} s=${i * c.ds}, ${j * c.ds}`);
    }
  }
});

test('물리는 코스의 경사를 따른다', () => {
  const E = make(), c = E.makeCourse('mountain'); E.ROAD.course = c;
  for (const s of [100, 500, 1200]) { E.sim.x = s; E.step(0.008); assert.ok(Math.abs(E.sim.grade - c.gradeAt(s)) < 1e-6); }
});

test('헤어핀에 너무 빨리 들어가면 바깥으로 밀리며 속도를 잃는다', () => {
  const E = make(), c = E.makeCourse('mountain'); E.ROAD.course = c;
  let sMax = 0, kMax = 0; for (let i = 0; i < c.N; i++) if (Math.abs(c.kap[i]) > kMax) { kMax = Math.abs(c.kap[i]); sMax = i * c.ds; }
  Object.assign(E.sim, { lever: 'D', cur: 3, v: 70 / 3.6, x: sMax - 5 }); E.sim.we = E.sim.v / 0.334 * 1.834 * 3.51;
  const v0 = E.sim.v; let mx = 0; for (let t = 0; t < 0.5; t += 0.008) { E.step(0.008); mx = Math.max(mx, E.sim.slide); }
  assert.ok(mx > 0.15, `최대 미끄러짐 ${mx}`);
  assert.ok(E.sim.v < v0 - 1, `속도 ${E.sim.v * 3.6}km/h`);
});

test('권장 속도를 지키며 달리면 서킷 한 바퀴를 크게 미끄러지지 않고 돈다', () => {
  const E = make(), c = E.makeCourse('circuit'); E.ROAD.course = c; E.requestLever('D');
  let t = 0, maxSlide = 0;
  while (E.sim.x < c.L && t < 400) {
    const nc = c.nextCorner(E.sim.x, 150, E.sim.mu), here = Math.abs(c.curvAt(E.sim.x));
    let target = 45;                                                   // m/s 상한
    if (here > 1 / 250) target = Math.min(target, Math.sqrt(0.85 * E.sim.mu * 9.81 / here));
    if (nc) target = Math.min(target, Math.sqrt(nc.v * nc.v + 2 * 4 * nc.d));   // 4m/s²로 미리 줄여 코너에 맞춘다
    const err = target - E.sim.v;
    E.sim.th = err > 0 ? Math.min(1, err * 0.4) : 0; E.sim.brake = err < -0.2;
    E.step(0.008); t += 0.008; maxSlide = Math.max(maxSlide, E.sim.slide);
  }
  assert.ok(E.sim.x >= c.L, `${t.toFixed(0)}초 동안 ${E.sim.x.toFixed(0)}m`);
  assert.ok(t > 60 && t < 200, `랩 ${t.toFixed(1)}초`);
  assert.ok(maxSlide < 0.08, `최대 미끄러짐 ${maxSlide}`);
});
