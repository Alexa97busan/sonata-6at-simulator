// 쏘나타 2.0 6단 자동변속기: 차량 물리(엔진·토크 컨버터·TCU·경사·접지·연료).
// 화면 코드 없이 혼자 돌아가며, js/app.js와 tests/가 이 파일의 전역 const(sim, step, CFG …)를 씁니다.
'use strict';
/*SIM_START*/
const CFG = { ratios: { 1: 4.400, 2: 2.726, 3: 1.834, 4: 1.392, 5: 1.000, 6: 0.774, R: -3.440 },
  final: 3.510, tireR: 0.334, mass: 1500, ps: 140, nPeak: 6000, redline: 6500, idle: 800 };
const Je = 0.25, Kc = 30.8, ETA = 0.92, G0 = 9.81, RHO = 1.2, CDA = 0.65, CRR = 0.012;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const T_REF = CFG.ps * 735.5 / (CFG.nPeak * Math.PI / 30);          // 6,000rpm에서 140PS가 되는 토크(N·m)
const tq = rpm => { const x = rpm / CFG.nPeak; return T_REF * Math.max(0.55 + 1.35 * x - 0.9 * x * x, 0.2); };
const fr = rpm => 14 + 0.004 * rpm;                                  // 엔진 마찰 토크
const ratioOf = g => g === 'N' ? 0 : CFG.ratios[g] * CFG.final;
const rpmAt = (v, g) => Math.abs(v) / CFG.tireR * Math.abs(ratioOf(g)) * 30 / Math.PI;
// 주행 모드: 올림·내림 기준 rpm(가속 페달 0%일 때 + 페달 비례분), 변속 시간, 록업을 허용하는 최저 단, 출발 단
const MODES = {
  eco:    { name: '에코',   up0: 1450, upK: 2900, dn0: 900,  dnK: 1000, dur: 0.70, lockG: 2, minG: 1 },
  normal: { name: '보통',   up0: 1700, upK: 3700, dn0: 950,  dnK: 1300, dur: 0.60, lockG: 3, minG: 1 },
  sport:  { name: '스포츠', up0: 2100, upK: 4200, dn0: 1250, dnK: 1900, dur: 0.40, lockG: 4, minG: 1 },
  snow:   { name: '눈길 출발', up0: 1500, upK: 2600, dn0: 900,  dnK: 900,  dur: 0.70, lockG: 2, minG: 2 }
};
const upRpm = (M, th) => M.up0 + th * M.upK, dnRpm = (M, th) => M.dn0 + th * M.dnK;
const MU = { dry: 1.2, wet: 0.55, snow: 0.2 };                          // 노면 마찰계수(단순화)
// 도로 높이: 경사가 바뀌는 지점마다 12m에 걸쳐 부드럽게 이어진다. s는 출발점부터의 거리(m)
const ROAD = { g0: 0, c0: 0, ch: [], L: 12, target: 0,
  course: null,              // 코스(js/course.js의 makeCourse)를 달면 경사·높이·곡률을 코스에서 읽는다
  curvOverride: null,        // 직접 핸들일 때 차가 실제로 도는 곡률(1/m). null이면 도로 곡률
  offroad: false,            // 도로 밖(풀·흙)이면 구름 저항이 커진다
  gradeAt(s) { if (this.course) return this.course.gradeAt(s); let g = this.g0; for (const c of this.ch) g += c.d * clamp((s - c.s) / this.L, 0, 1); return g; },
  curvAt(s) { return this.course ? this.course.curvAt(s) : 0; },
  heightAt(s) {
    if (this.course) return this.course.heightAt(s);
    let h = this.g0 * s + this.c0;
    for (const c of this.ch) { const u = s - c.s; if (u > 0) h += u < this.L ? c.d * u * u / (2 * this.L) : c.d * (u - this.L / 2); }
    return h;
  },
  set(g, s) { if (g === this.target) return; this.ch.push({ s, d: g - this.target }); this.target = g; },
  reset(g, s) { this.course = null; this.g0 = g; this.c0 = -g * (s || 0); this.ch = []; this.target = g; },
  prune(x) {                                                          // 300m 넘게 지난 변화는 기본 직선에 합친다
    this.ch = this.ch.filter(c => { if (c.s + this.L < x - 300) { this.g0 += c.d; this.c0 -= c.d * (c.s + this.L / 2); return false; } return true; });
  }
};
const sim = { v: 0, we: CFG.idle * Math.PI / 30, cur: 'N', lever: 'N', manual: null, th: 0, brake: false,
  lock: false, shift: null, lastShift: -9, t: 0, Teng: 0, msg: '', warn: false,
  grade: 0,                  // 도로 경사(오르막 +, 비율. 0.1 = 10%)
  shiftEvt: null,            // 변속 요소가 물리는 순간 { from, to, n }
  shiftLog: null,            // 마지막으로 끝난 변속 { from, to, dur, at }
  mode: 'normal', surface: 'dry', mu: MU.dry,
  x: 0,                      // 출발점부터 달린 거리(m, 후진하면 줄어듦)
  holdT: -1, holding: false, brakePrev: false,   // 언덕 밀림 방지
  thLowT: 0, kdArmed: true, kd: null,            // 킥다운 { from, to, at, n }
  spin: 0, Fdir: 1,                              // 바퀴 헛돎 정도(0~1)
  curv: 0, slide: 0,                             // 도로 곡률(1/m, 오른쪽 +), 코너에서 바깥으로 밀리는 정도(0~1)
  fuel: { gps: 0, total: 0, dist: 0 },           // 연료(g/s, 누적 g, 누적 m)
  tc: { pump: CFG.idle, turb: 0, sr: 0, mult: 2, lock: false } };
const say = (m, w) => { sim.msg = m; sim.warn = !!w; return !w; };

function beginShift(to) {
  if (sim.cur === to || (sim.shift && sim.shift.to === to)) return;
  const kick = typeof sim.cur === 'number' && typeof to === 'number' && sim.cur - to >= 2;
  sim.shift = { from: sim.cur, to, t: 0, dur: (sim.cur === 'N' || to === 'N') ? 0.35 : MODES[sim.mode].dur + (kick ? 0.15 : 0), done: false };
}
function requestLever(l) {
  const kmh = sim.v * 3.6;
  if (l === 'R' && kmh > 3) return say('전진 중에는 R로 변속할 수 없습니다. 정차 후 다시 시도하세요.', true);
  if (l === 'D' && kmh < -3) return say('후진 중에는 D로 변속할 수 없습니다. 정차 후 다시 시도하세요.', true);
  sim.lever = l; sim.manual = null;
  if (l === 'N') beginShift('N');
  else if (l === 'R') beginShift('R');
  else if (typeof (sim.shift ? sim.shift.to : sim.cur) !== 'number') beginShift(MODES[sim.mode].minG);
  return say(l === 'D' ? '자동 변속 중입니다.' : l === 'R' ? '후진 기어가 물렸습니다.' : '중립: 엔진 동력이 바퀴로 전달되지 않습니다.');
}
function requestManual(n) {
  if (n === null) return requestLever('D');
  if (sim.v * 3.6 < -3) return say('후진 중에는 전진 단수를 선택할 수 없습니다.', true);
  if (rpmAt(sim.v, n) > 6300) return say('엔진 과회전 방지: 이 속도에서는 ' + n + '단으로 내릴 수 없습니다.', true);
  sim.lever = 'D'; sim.manual = n; beginShift(n);
  return say(n + '단 고정: 수동 변속 중입니다.');
}
function targetGear() { return sim.shift ? sim.shift.to : sim.cur; }

function tcu() {
  if (sim.lever !== 'D' || sim.manual !== null || sim.shift || typeof sim.cur !== 'number' || sim.v < 0) return;
  const g = sim.cur, R = CFG.ratios, n = rpmAt(sim.v, g), th = sim.th, M = MODES[sim.mode];
  // 킥다운: 가속 페달을 0.35초 안에 70% 아래에서 90% 위로 밟으면, 엔진이 5,400rpm을 넘지 않는 가장 낮은 단으로 한 번에 내린다
  if (th >= 0.9 && sim.kdArmed && sim.t - sim.thLowT < 0.35 && g > M.minG) {
    let k = g; while (k - 1 >= M.minG && rpmAt(sim.v, k - 1) < 5400) k--;
    sim.kdArmed = false;
    if (k < g) { sim.kd = { from: g, to: k, at: sim.t, n: (sim.kd ? sim.kd.n : 0) + 1 }; say('킥다운: ' + g + '단 → ' + k + '단으로 한 번에 내립니다.'); return beginShift(k); }
  }
  if (sim.t - sim.lastShift < 0.8) return;
  // 경사 로직: 오르막에서는 늦게 올리고 일찍 내린다. 내리막에서 가속을 놓으면 단수를 붙잡아 엔진 브레이크를 쓰고,
  // 브레이크를 밟으면 한 단 더 내려 엔진 브레이크를 키운다.
  const up = clamp(sim.grade / 0.1, 0, 1), down = th < 0.05 ? clamp(-sim.grade / 0.1, 0, 1) : 0;
  if (g < 6) {
    const after = n * R[g + 1] / R[g];
    if (n > upRpm(M, th) + up * 900 + down * 2300 && after > 1250) return beginShift(g + 1);
  }
  if (g > M.minG) {
    const after = n * R[g - 1] / R[g];
    if (after < 5600 && n < dnRpm(M, th) + up * 700 + (sim.brake ? down * 2200 : 0)) return beginShift(g - 1);
  }
}

function engineTorque(rpm, sf) {
  const thEff = Math.max(sim.th, clamp(0.13 + (CFG.idle - rpm) * 0.0016, 0, 0.6));
  let T = thEff * tq(rpm) - (1 - thEff) * fr(rpm);
  if (T > 0) T *= sf;
  if (rpm > CFG.redline) T = Math.min(T, -fr(rpm));
  return T;
}

function step(dt) {
  sim.t += dt;
  sim.grade = ROAD.gradeAt(sim.x);
  // 코너: 원심 가속도 v²κ가 접지 한계(μg의 95%)를 넘으면 바깥으로 밀리며 타이어가 끌려 속도를 잃는다
  sim.curv = ROAD.curvOverride != null ? ROAD.curvOverride : ROAD.curvAt(sim.x);
  const ayC = sim.v * sim.v * Math.abs(sim.curv), latLim = sim.mu * G0 * 0.95, slideT = ayC > latLim ? Math.min(1, (ayC - latLim) / latLim) : 0;
  if (slideT > 0.03 && sim.slide < 0.03) say('코너가 너무 빨라 바깥으로 밀립니다. 코너 앞에서 브레이크를 밟고 단을 내리세요.', true);
  sim.slide += (slideT - sim.slide) * Math.min(1, dt * 10);
  if (sim.th < 0.7) { sim.thLowT = sim.t; sim.kdArmed = true; }
  // 언덕 밀림 방지: 경사에서 멈춘 채 브레이크를 떼면 2초 동안 가려는 반대쪽으로 밀리지 않게 붙잡는다
  const want = sim.lever === 'D' ? 1 : sim.lever === 'R' ? -1 : 0;
  if (sim.brakePrev && !sim.brake && Math.abs(sim.v) < 0.1 && Math.abs(sim.grade) > 0.02 && want) { sim.holdT = sim.t + 2; say('언덕 밀림 방지: 2초 동안 차를 붙잡습니다. 그 사이 가속 페달을 밟으세요.'); }
  sim.brakePrev = sim.brake;
  const hold = want !== 0 && sim.t < sim.holdT;
  let sf = 1;
  if (sim.shift) {
    const s = sim.shift; s.t += dt; sf = 0.55;
    if (!s.done && s.t >= s.dur / 2) { sim.cur = s.to; s.done = true; sim.shiftEvt = { from: s.from, to: s.to, n: (sim.shiftEvt ? sim.shiftEvt.n : 0) + 1 }; }
    if (s.t >= s.dur) { sim.shift = null; sim.lastShift = sim.t; sim.shiftLog = { from: s.from, to: s.to, dur: s.dur, at: sim.t }; }
  }
  tcu();
  const g = sim.cur, Rt = ratioOf(g), r = CFG.tireR;
  const wt = Rt ? sim.v / r * Rt : 0;
  const rpmT = wt * 30 / Math.PI;
  let rpmE = sim.we * 30 / Math.PI;
  let F = 0, Meq = CFG.mass + 120, Teng;

  if (g === 'N') {
    sim.lock = false;
    Teng = engineTorque(rpmE, sf);
    sim.we += Teng / Je * dt;
  } else {
    const SR = sim.we > 1 ? wt / sim.we : 0;
    let want = false;
    if (!sim.shift && rpmT > 1050 && sim.th <= 0.9) {
      want = sim.lock || (typeof g === 'number' && g >= MODES[sim.mode].lockG && rpmT > 1200 && SR > 0.92) || SR >= 1;
    }
    sim.lock = want;
    if (sim.lock) {
      sim.we = Math.max(wt, 1); rpmE = sim.we * 30 / Math.PI;
      Teng = engineTorque(rpmE, sf);
      F = Teng * Rt * ETA / r;
      Meq += Je * Rt * Rt / (r * r);
      sim.tc = { pump: rpmE, turb: rpmT, sr: 1, mult: 1, lock: true };
    } else {
      Teng = engineTorque(rpmE, sf);
      const sr = clamp(SR, 0, 1.2);
      const Tp = Kc * Math.pow(rpmE / 1000, 2) * (1 - 0.9 * Math.pow(sr, 3));
      const m = sr < 0.85 ? 1 + (1 - sr / 0.85) : 1;
      sim.we += (Teng - Tp) / Je * dt;
      F = m * Tp * Rt * ETA / r;
      sim.tc = { pump: rpmE, turb: Math.abs(rpmT), sr: Math.abs(sr), mult: m, lock: false };
    }
  }
  if (g === 'N') sim.tc = { pump: rpmE, turb: rpmE * 0.97, sr: 0.97, mult: 1, lock: false };
  // 바퀴 접지 한계: 앞바퀴굴림, 앞바퀴 하중 60%. 넘는 만큼은 헛돌며 미끄럼 마찰로 줄어든다
  const Ft = sim.mu * 0.6 * CFG.mass * G0;
  const spinT = Math.abs(F) > Ft ? Math.min(1, (Math.abs(F) - Ft) / Ft) : 0;
  if (spinT > 0) { F = Math.sign(F) * Ft * 0.85; if (sim.spin < 0.05 && spinT > 0.1) say('바퀴가 헛돕니다. 가속 페달을 살살 밟거나 눈길 출발(2단) 모드를 써 보세요.', true); }
  sim.spin += (spinT - sim.spin) * Math.min(1, dt * 10); if (F) sim.Fdir = Math.sign(F);
  sim.we = Math.max(sim.we, 300 * Math.PI / 30);
  sim.Teng = Teng;
  // 연료: 출력 × 연료소비율(부하가 낮을수록 나쁨). 가속을 놓고 엔진 브레이크 중이면 연료 차단, 그 밖에는 공회전 이상
  const rpmNow = sim.we * 30 / Math.PI, P = Math.max(0, Teng * sim.we), load = clamp(Teng / tq(rpmNow), 0, 1);
  const cut = sim.th < 0.01 && Teng < 0 && rpmNow > 1100 && g !== 'N';
  const gps = cut ? 0 : Math.max(P * (235 + 260 * (1 - load) * (1 - load)) / 3.6e6, 0.16 * Math.pow(rpmNow / CFG.idle, 0.8));
  sim.fuel.gps = gps; sim.fuel.total += gps * dt; sim.fuel.dist += Math.abs(sim.v) * dt;

  const Fb = sim.brake ? Math.min(7.5, sim.mu * G0 * 0.95) * CFG.mass : 0;   // 미끄러운 길에서는 브레이크도 접지 한계까지만(ABS 가정)
  const Frr = (CRR + (ROAD.offroad ? 0.09 : 0)) * CFG.mass * G0;
  const Fg = -CFG.mass * G0 * Math.sin(Math.atan(sim.grade));          // 경사 방향 중력(오르막이면 뒤로)
  const v = sim.v;
  if (Math.abs(v) < 0.01) {
    const Fmax = Frr + Fb, Fn = F + Fg;
    sim.v = Math.abs(Fn) <= Fmax || (hold && Math.sign(Fn) === -want) ? 0 : v + (Fn - Math.sign(Fn) * Fmax) / Meq * dt;
  } else {
    const Fres = Frr + 0.5 * RHO * CDA * v * v + Fb + CFG.mass * Math.max(0, ayC - latLim) * 0.8;   // 마지막 항: 코너에서 미끄러질 때 끌림
    let nv = v + (F + Fg - Math.sign(v) * Fres) / Meq * dt;
    if (nv * v < 0) nv = 0;
    if (hold && nv * want < 0) nv = 0;
    sim.v = nv;
  }
  sim.holding = hold && sim.v === 0;
  sim.x += sim.v * dt;
  if (sim.t % 5 < dt) ROAD.prune(sim.x);
}
/*SIM_END*/
