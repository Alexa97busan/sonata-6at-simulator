// 차량 물리(js/sim.js) 자동 검사. 실행: npm test  (또는 node --test tests/*.test.js)
// 화면 없이 물리만 돌려, 고친 뒤에도 가속·제동·변속·연비가 예전 범위에 있는지 확인한다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SIM_CODE = fs.readFileSync(path.join(ROOT, 'js/sim.js'), 'utf8');
const DT = 0.008;
const RATIO = { 1: 4.4, 2: 2.726, 3: 1.834, 4: 1.392, 5: 1, 6: 0.774 };

// 검사마다 새 물리 상태를 만든다(전역 const를 꺼내 돌려준다)
function make() {
  const ctx = vm.createContext({ console, Math });
  vm.runInContext(SIM_CODE + '\n;globalThis.__E = { sim, step, requestLever, requestManual, ROAD, MODES, MU, CFG, rpmAt, upRpm, dnRpm };', ctx);
  return ctx.__E;
}
function run(E, seconds, each) { for (let t = 0; t < seconds; t += DT) { E.step(DT); if (each && each(t)) return t; } return null; }
// 레버를 거치지 않고 바로 그 단·속도로 달리는 상태를 만든다
function cruising(E, gear, kmh) {
  Object.assign(E.sim, { lever: 'D', cur: gear, v: kmh / 3.6, lastShift: -9 });
  E.sim.we = E.sim.v / E.CFG.tireR * RATIO[gear] * E.CFG.final;
}
const kmh = E => E.sim.v * 3.6;
function zeroTo100(mode, surface) {
  const E = make(); if (mode) E.sim.mode = mode; if (surface) E.sim.mu = E.MU[surface];
  E.requestLever('D'); E.sim.th = 1;
  return run(E, 60, () => kmh(E) >= 100);
}

test('공식 변속비와 종감속이 그대로다', () => {
  const E = make();
  assert.deepEqual({ ...E.CFG.ratios }, { 1: 4.4, 2: 2.726, 3: 1.834, 4: 1.392, 5: 1, 6: 0.774, R: -3.44 });
  assert.equal(E.CFG.final, 3.51);
});

test('0→100km/h: 보통 10.5~13초, 스포츠 < 보통 < 에코', () => {
  const normal = zeroTo100('normal'), sport = zeroTo100('sport'), eco = zeroTo100('eco');
  assert.ok(normal > 10.5 && normal < 13, `보통 ${normal}`);
  assert.ok(sport < normal && normal < eco, `스포츠 ${sport}, 보통 ${normal}, 에코 ${eco}`);
});

test('눈길에서는 바퀴가 헛돌고 훨씬 느리다', () => {
  const E = make(); E.sim.mu = E.MU.snow; E.requestLever('D'); E.sim.th = 1;
  let spun = false; run(E, 5, () => { if (E.sim.spin > 0.1) spun = true; });
  assert.ok(spun, '헛돎 표시가 없음');
  assert.ok(zeroTo100('normal', 'snow') > 25);
});

test('100km/h 제동 거리: 마른 길 50~70m, 눈길은 150m 넘게', () => {
  for (const [surface, lo, hi] of [['dry', 50, 70], ['snow', 150, 260]]) {
    const E = make(); E.sim.mu = E.MU[surface]; cruising(E, 6, 100); E.sim.brake = true;
    run(E, 30, () => E.sim.v <= 0);
    assert.ok(E.sim.x > lo && E.sim.x < hi, `${surface} ${E.sim.x.toFixed(1)}m`);
  }
});

test('킥다운: 6단 80km/h에서 페달을 끝까지 밟으면 3단으로 한 번에', () => {
  const E = make(); cruising(E, 6, 80); E.sim.th = 0.2;
  run(E, 3, t => { if (t > 1) E.sim.th = 1; return !!E.sim.kd; });
  assert.ok(E.sim.kd, '킥다운이 일어나지 않음');
  assert.equal(E.sim.kd.from, 6); assert.equal(E.sim.kd.to, 3);
});

test('내리막에서 가속을 놓으면 단을 붙잡고(엔진 브레이크), 평지에서는 올린다', () => {
  const down = make(); down.ROAD.reset(-0.08, 0); cruising(down, 4, 60); down.sim.th = 0;
  const seen = new Set(); run(down, 6, () => { seen.add(down.sim.cur); });
  assert.deepEqual([...seen], [4]);
  const flat = make(); cruising(flat, 4, 60); flat.sim.th = 0;
  run(flat, 4);
  assert.ok(flat.sim.cur > 4, `평지 ${flat.sim.cur}단`);
});

test('언덕 밀림 방지: 10% 오르막에서 브레이크를 떼도 2초 동안 뒤로 밀리지 않는다', () => {
  const E = make(); E.ROAD.reset(0.10, 0); E.requestLever('D'); E.sim.brake = true;
  run(E, 1); E.sim.brake = false;
  run(E, 1.9);
  assert.ok(E.sim.x > -0.01, `뒤로 ${(-E.sim.x).toFixed(3)}m`);
});

test('N에서는 가파른 오르막에서 뒤로 굴러간다', () => {
  const E = make(); E.ROAD.reset(0.12, 0);
  run(E, 2);
  assert.ok(E.sim.v < -0.5, `속도 ${E.sim.v}`);
});

test('정속 연비: 60km/h 15~25km/L, 100km/h 11~19km/L, 공회전 0.5~1.0L/h', () => {
  for (const [target, lo, hi] of [[60, 15, 25], [100, 11, 19]]) {
    const E = make(); cruising(E, 6, target); let f0 = 0, d0 = 0;
    run(E, 60, t => { E.sim.th = Math.max(0, Math.min(1, E.sim.th + (target / 3.6 - E.sim.v) * 0.02)); if (t > 30 && !f0) { f0 = E.sim.fuel.total; d0 = E.sim.fuel.dist; } });
    const kml = (E.sim.fuel.dist - d0) / 1000 / ((E.sim.fuel.total - f0) / 745);
    assert.ok(kml > lo && kml < hi, `${target}km/h ${kml.toFixed(1)}km/L`);
  }
  const idle = make(); run(idle, 20);
  const lph = idle.sim.fuel.gps * 3600 / 745;
  assert.ok(lph > 0.5 && lph < 1.0, `공회전 ${lph.toFixed(2)}L/h`);
});

test('도로 높이: 경사 변화는 12m에 걸쳐 이어지고 높이가 끊기지 않는다', () => {
  const E = make(); E.ROAD.reset(0, 0); E.ROAD.set(0.1, 15);
  assert.equal(E.ROAD.gradeAt(14), 0);
  assert.ok(Math.abs(E.ROAD.gradeAt(21) - 0.05) < 1e-9);
  assert.ok(Math.abs(E.ROAD.gradeAt(40) - 0.1) < 1e-9);
  for (let x = 0; x < 60; x += 0.5) assert.ok(Math.abs(E.ROAD.heightAt(x + 0.01) - E.ROAD.heightAt(x) - E.ROAD.gradeAt(x) * 0.01) < 1e-3, `x=${x}`);
});

test('눈길 출발 모드는 2단으로 출발한다', () => {
  const E = make(); E.sim.mode = 'snow'; E.requestLever('D'); run(E, 1);
  assert.equal(E.sim.cur, 2);
});

test('페이지가 불러오는 파일이 모두 있다', () => {
  const html = fs.readFileSync(path.join(ROOT, 'sonata-6at.html'), 'utf8');
  for (const f of ['css/style.css', 'js/sim.js', 'js/course.js', 'js/app.js']) {
    assert.ok(html.includes(`"${f}"`), `${f} 참조 없음`);
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} 파일 없음`);
  }
});
