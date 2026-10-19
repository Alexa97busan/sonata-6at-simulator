// 주행 코스: 닫힌 고리 모양의 도로 데이터(가운데 선의 위치·방향·곡률·경사). 화면·3D 없이 계산만 하며,
// js/app.js(그리기)와 js/sim.js(경사·곡률), tests/가 함께 씁니다. 좌표는 m, y가 위, 출발 방향은 −z.
'use strict';
const COURSE_DEFS = {
  country: { name: '굽은 국도', width: 7.5, lane: 1.75, kind: 'road', note: '완만한 언덕과 굽은 길이 이어지는 2차로 국도',
    pts: [[0, 0, 0], [0, 2, -300], [60, 8, -520], [220, 14, -640], [420, 10, -620], [560, 4, -500], [600, -2, -300], [700, -6, -150],
      [880, -4, -120], [980, 2, -20], [960, 8, 180], [800, 10, 300], [560, 6, 320], [380, 0, 250], [220, -4, 280], [60, -2, 220]] },
  mountain: { name: '산길 와인딩', width: 6.5, lane: 1.6, kind: 'mountain', note: '헤어핀이 이어지는 가파른 오르막·내리막 산길',
    pts: [[0, 0, 0], [0, 6, -120], [40, 16, -200], [110, 26, -190], [130, 32, -120], [100, 38, -50], [120, 46, 20], [190, 54, 10],
      [220, 60, -60], [200, 66, -150], [230, 72, -230], [310, 74, -260], [400, 70, -230], [430, 62, -150], [400, 54, -70], [430, 46, 10],
      [500, 38, 40], [540, 28, 120], [500, 18, 200], [400, 11, 230], [280, 6, 200], [160, 3, 170], [60, 1, 110]] },
  circuit: { name: '서킷', width: 12, lane: 0, kind: 'circuit', note: '긴 직선, 헤어핀, 시케인이 있는 서킷. 한 바퀴 기록을 잽니다',
    pts: [[0, 0, 0], [0, 0, -500], [20, 0, -620], [90, 1, -660], [160, 2, -630], [180, 2, -560], [150, 2, -470], [160, 3, -400],
      [240, 4, -360], [330, 4, -380], [380, 3, -450], [460, 2, -470], [520, 2, -420], [520, 1, -300], [470, 1, -220], [420, 0, -120],
      [440, 0, -20], [400, 0, 80], [300, 0, 120], [180, 0, 110], [80, 0, 90], [20, 0, 60]] }
};

// 구심(centripetal) 캐트멀-롬 곡선으로 조절점을 잇고, 2m 간격으로 다시 나눈다
function makeCourse(id) {
  const def = COURSE_DEFS[id], P = def.pts, n = P.length, poly = [];
  const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const t0 = 0, t1 = t0 + Math.sqrt(d(p0, p1)), t2 = t1 + Math.sqrt(d(p1, p2)), t3 = t2 + Math.sqrt(d(p2, p3));
    const L = (a, b, ta, tb, t) => a.map((v, k) => (tb - t) / (tb - ta) * v + (t - ta) / (tb - ta) * b[k]);
    const steps = Math.max(8, Math.round(d(p1, p2) / 1.5));
    for (let j = 0; j < steps; j++) {
      const t = t1 + (t2 - t1) * j / steps;
      const A1 = L(p0, p1, t0, t1, t), A2 = L(p1, p2, t1, t2, t), A3 = L(p2, p3, t2, t3, t);
      const B1 = L(A1, A2, t0, t2, t), B2 = L(A2, A3, t1, t3, t);
      poly.push(L(B1, B2, t1, t2, t));
    }
  }
  // 수평 거리 기준 누적 길이 → 2m 간격 재표본
  const cum = [0];
  for (let i = 1; i <= poly.length; i++) { const a = poly[i - 1], b = poly[i % poly.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2])); }
  const total = cum[poly.length], N = Math.round(total / 2), ds = total / N;
  const x = new Float64Array(N), y = new Float64Array(N), z = new Float64Array(N);
  for (let k = 0, j = 0; k < N; k++) {
    const s = k * ds; while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / (cum[j + 1] - cum[j]), a = poly[j], b = poly[(j + 1) % poly.length];
    x[k] = a[0] + (b[0] - a[0]) * f; y[k] = a[1] + (b[1] - a[1]) * f; z[k] = a[2] + (b[2] - a[2]) * f;
  }
  // 방향 ψ(차의 rotation.y와 같은 정의: 앞 방향 = (−sinψ, −cosψ)), 곡률 κ(오른쪽으로 굽으면 +), 경사
  const psi = new Float64Array(N), kap = new Float64Array(N), gr = new Float64Array(N);
  const W = i => (i % N + N) % N;
  for (let k = 0; k < N; k++) { const a = W(k - 1), b = W(k + 1); psi[k] = Math.atan2(-(x[b] - x[a]), -(z[b] - z[a])); }
  const raw = new Float64Array(N), rawG = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    let dp = psi[W(k + 1)] - psi[W(k - 1)]; dp -= Math.round(dp / (2 * Math.PI)) * 2 * Math.PI;
    raw[k] = -dp / (2 * ds); rawG[k] = (y[W(k + 1)] - y[W(k - 1)]) / (2 * ds);
  }
  const smooth = (src, dst, h) => { for (let k = 0; k < N; k++) { let t = 0; for (let j = -h; j <= h; j++) t += src[W(k + j)]; dst[k] = t / (2 * h + 1); } };
  smooth(raw, kap, 3); smooth(rawG, gr, 4);
  const lerp = (arr, s) => { const u = ((s / ds) % N + N) % N, i = Math.floor(u), f = u - i; return arr[i] + (arr[W(i + 1)] - arr[i]) * f; };
  const course = {
    id, def, L: total, N, ds, x, y, z, psi, kap, gr,
    // 출발점부터 거리 s(m, 몇 바퀴째든 됨)에서의 값
    heightAt: s => lerp(y, s), gradeAt: s => lerp(gr, s), curvAt: s => lerp(kap, s),
    at(s) {
      const u = ((s / ds) % N + N) % N, i = Math.floor(u), f = u - i, j = W(i + 1);
      let dp = psi[j] - psi[i]; dp -= Math.round(dp / (2 * Math.PI)) * 2 * Math.PI;
      return { x: x[i] + (x[j] - x[i]) * f, y: y[i] + (y[j] - y[i]) * f, z: z[i] + (z[j] - z[i]) * f, psi: psi[i] + dp * f,
        kap: kap[i] + (kap[j] - kap[i]) * f, grade: gr[i] + (gr[j] - gr[i]) * f };
    },
    // 앞쪽 range(m) 안에서 가장 급한 코너: 거리, 곡률, 권장 속도(m/s, 접지 85% 사용)
    nextCorner(s, range, mu) {
      let best = null;
      for (let d = 4; d <= range; d += 4) { const k = Math.abs(lerp(kap, s + d)); if (k > 1 / 250 && (!best || k > best.k)) best = { d, k, dir: Math.sign(lerp(kap, s + d)) }; }
      if (!best) return null;
      let d0 = best.d; while (d0 > 4 && Math.abs(lerp(kap, s + d0 - 4)) > best.k * 0.6) d0 -= 4;
      return { d: d0, k: best.k, dir: best.dir, v: Math.sqrt(0.85 * mu * 9.81 / best.k) };
    }
  };
  return course;
}
