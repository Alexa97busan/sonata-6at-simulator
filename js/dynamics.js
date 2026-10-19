// 차량 평면 운동: 자전거 모델 + 단순 마법 공식(Pacejka) 타이어. 화면 없이 계산만 하며 js/app.js와 tests/가 씁니다.
// 좌표는 차 기준: 앞 +x(속도 vx), 오른쪽 +(옆 속도 vy), 오른쪽으로 도는 쪽이 요 각속도 r +, 조향각 δ도 오른쪽 +.
// 앞바퀴굴림이라 구동력은 앞 타이어가 내고, 그만큼 앞 타이어가 옆으로 버틸 힘이 줄어든다(마찰원).
'use strict';
const DYN = {
  m: 1500, Iz: 2700,            // 질량(kg), 요 관성 모멘트(kg·m²)
  L: 2.84, a: 1.136, b: 1.704,  // 휠베이스, 무게중심~앞축, 무게중심~뒤축(앞 60% 하중)
  hcg: 0.55,                    // 무게중심 높이: 가속·제동 때 앞뒤 하중 이동
  B: 16, C: 1.4,                // 타이어 곡선 모양: 미끄럼 각 약 7°에서 최대 힘, 크게 미끄러지면 최대의 약 80%
  kinV: 1.5,                    // 이보다 느리면 미끄럼 없는 기하학 모델로
  rearBrake: 0.35,              // 발 브레이크의 뒤바퀴 몫
  track: 1.6,                   // 윤거(ESC가 한쪽 바퀴만 잡을 때의 팔 길이 = 윤거/2)
  Kus: 0.0022                   // 언더스티어 계수: ESC가 목표로 삼는 요 각속도에 쓴다
};
// 미끄럼 각 α(rad)에서 타이어 옆 힘(N). 미끄럼 반대 방향, 최대 cap
function tireForce(alpha, Fz, mu, cap) {
  const F = -mu * Fz * Math.sin(DYN.C * Math.atan(DYN.B * alpha));
  return Math.max(-cap, Math.min(cap, F));
}
// 상태 S = { vy, r }를 dt만큼 진행. 입력 I = { vx, delta, mu, ax, brake, hb }
//  ax: 차의 앞뒤 가속도(하중 이동), brake: 발 브레이크 감속도(m/s²), hb: 사이드 브레이크(뒷바퀴 잠김)
// 돌려주는 값: dvx(타이어 옆 힘과 회전이 앞뒤 속도에 주는 가속도), 미끄럼 정보
function dynStep(S, I, dt) {
  const { m, Iz, a, b, L, hcg } = DYN, g = 9.81, vx = I.vx, d = I.delta;
  const out = { dvx: 0, ay: 0, alphaF: 0, alphaR: 0, slipF: 0, slipR: 0, beta: 0 };
  if (vx < DYN.kinV) {                                   // 느리거나 후진: 미끄럼 없이 바퀴가 가리키는 대로
    S.r = vx * Math.tan(d) / L; S.vy = b * S.r; out.ay = vx * S.r; return out;
  }
  const mg = m * g, ax = Math.max(-12, Math.min(8, I.ax || 0));
  const Fzf = Math.max(0.15 * mg, mg * b / L - m * ax * hcg / L), Fzr = Math.max(0.15 * mg, mg * a / L + m * ax * hcg / L);
  // 앞 타이어: 구동(가속) 또는 제동(65%)에 쓰는 힘만큼 옆 여유가 준다
  const FxF = ax > 0 ? m * ax : m * (I.brake || 0) * (1 - DYN.rearBrake);
  const capF = Math.sqrt(Math.max(0, (I.mu * Fzf) ** 2 - FxF * FxF)) + 0.05 * I.mu * Fzf;
  const af = Math.atan2(S.vy + a * S.r, vx) - d, ar = Math.atan2(S.vy - b * S.r, vx);
  const Fyf = tireForce(af, Fzf, I.mu, capF);
  let Fyr, FxR = 0;
  if (I.hb) {                                             // 사이드 브레이크: 뒷바퀴가 잠겨 미끄럼 마찰(0.8μ)만, 미끄러지는 반대쪽으로
    const vrx = vx, vry = S.vy - b * S.r, vr = Math.hypot(vrx, vry) || 1, Fk = 0.8 * I.mu * Fzr;
    Fyr = -Fk * vry / vr; FxR = -Fk * vrx / vr;
  } else {
    const FxRb = m * (I.brake || 0) * DYN.rearBrake;
    Fyr = tireForce(ar, Fzr, I.mu, Math.sqrt(Math.max(0, (I.mu * Fzr) ** 2 - FxRb * FxRb)) + 0.05 * I.mu * Fzr);
  }
  const cd = Math.cos(d), sd = Math.sin(d);
  // ESC(차체 자세 제어): 운전자가 원하는 요 각속도(핸들·속도·접지로 정함)와 실제가 어긋나거나 차체가 많이 돌아가면
  // 한쪽 바퀴에 브레이크를 걸어 반대 방향 회전력(최대 약 6kN·m)을 만든다. 그만큼 차가 느려진다
  let Mz = 0;
  if (I.esc && vx > 3) {
    const rMax = 0.85 * I.mu * 9.81 / vx, rRef = Math.max(-rMax, Math.min(rMax, vx * Math.tan(d) / (L * (1 + DYN.Kus * vx * vx))));
    const err = S.r - rRef, beta = Math.atan2(S.vy, vx), Mmax = 0.5 * I.mu * mg * DYN.track / 2;
    const dead = 0.08 + 0.3 * Math.abs(rRef);              // 꺾기 시작할 때의 자연스러운 늦음은 무시한다
    if (vx > 5 && (Math.abs(err) > dead || Math.abs(beta) > 0.1)) Mz = -Math.max(-Mmax, Math.min(Mmax, (Math.abs(err) > dead ? err - Math.sign(err) * dead : 0) * 60000 + beta * 20000));
    out.esc = Mz !== 0;
  }
  const dvy = (Fyf * cd + Fyr) / m - vx * S.r, dr = (a * Fyf * cd - b * Fyr + Mz) / Iz;
  S.vy += dvy * dt; S.r += dr * dt;
  out.dvx = (-Fyf * sd + FxR - Math.abs(Mz) / (DYN.track / 2)) / m + S.vy * S.r;   // 앞바퀴 옆 힘의 뒤쪽 성분, 잠긴 뒷바퀴, ESC 브레이크, 회전에 따른 속도 교환
  out.ay = (Fyf * cd + Fyr) / m;
  out.alphaF = af; out.alphaR = ar; out.beta = Math.atan2(S.vy, vx);
  // 미끄러짐 정도(0~1): 최대 힘을 내는 각(약 7°)을 넘은 정도, 사이드 브레이크면 뒤는 미끄럼 속도로
  const peak = Math.tan(Math.PI / (2 * DYN.C)) / DYN.B;
  out.slipF = Math.min(1, Math.max(0, (Math.abs(af) - peak) / 0.25));
  out.slipR = I.hb ? Math.min(1, Math.hypot(vx, S.vy - b * S.r) / 15) : Math.min(1, Math.max(0, (Math.abs(ar) - peak) / 0.25));
  return out;
}

// 도로 위 진행: 차 기준 운동(dynStep)을 도로 기준으로 바꿔, 차로 가운데에서 오른쪽으로 벗어난 거리 e와
// 도로 방향보다 오른쪽으로 틀어진 각 h를 적분한다. kRoad는 지금 위치의 도로 곡률(오른쪽 +).
// 돌려주는 값: dvx(앞뒤 속도 변화율), along(도로 방향 속도), out(미끄럼 정보)
function roadStep(S, I, kRoad, dt) {
  const out = dynStep(S, I, dt), v = I.vx + out.dvx * dt * (I.vx > DYN.kinV ? 1 : 0);
  const ch = Math.cos(S.h), sh = Math.sin(S.h), along = v * ch - S.vy * sh, lat = v * sh + S.vy * ch;
  S.h += (S.r - kRoad * along) * dt; S.h -= Math.round(S.h / (2 * Math.PI)) * 2 * Math.PI;
  S.e += lat * dt;
  return { dvx: I.vx > DYN.kinV ? out.dvx : 0, along, out };
}
// 자동 핸들(운전 보조): 도로 곡률만큼 미리 꺾고(앞먹임), 방향 오차와 옆 오차를 줄이도록 더 꺾는다(Stanley 방식).
// 타이어 한계를 넘는 속도면 핸들을 꺾어도 앞이 밀려 바깥으로 나간다(실제처럼)
function autoSteer(S, kRoad, v) {
  const ff = Math.atan(DYN.L * kRoad * (1 + DYN.Kus * v * v));
  const fb = -1.1 * S.h - Math.atan(0.9 * S.e / Math.max(3, v));
  return Math.max(-0.6, Math.min(0.6, ff + fb));
}
