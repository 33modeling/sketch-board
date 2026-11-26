// 손그림 느낌 선 만들기. 요소마다 seed 를 두고 같은 seed 면 늘 같은 흔들림이 나오게 한다(다시 그려도 선이 떨리지 않음).
// 결과는 SVG path 문자열 목록이라 캔버스(Path2D)와 SVG 내보내기가 같은 모양을 쓴다.

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

const f = (n) => (Math.round(n * 100) / 100).toString();

// 작은 도형은 덜 흔들리게(작은 상자가 지렁이처럼 보이지 않게)
export function effectiveRoughness(el) {
  const r = el.roughness ?? 1;
  const w = Math.abs(el.width || 0), h = Math.abs(el.height || 0);
  const big = Math.max(w, h), small = Math.min(w, h);
  const linear = el.type === 'line' || el.type === 'arrow';
  if ((small >= 24 && big >= 48) || (linear && big >= 48)) return r;
  return Math.min(r * (big < 12 ? 0.3 : 0.5), 2);
}

// 한 선분을 3차 베지어 하나로: 양 끝과 중간 두 점을 선에 수직으로 조금 민다.
function wobblySegment(x1, y1, x2, y2, rough, rand, first) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (rough <= 0 || len < 0.5) {
    return `${first ? `M${f(x1)} ${f(y1)}` : ''}L${f(x2)} ${f(y2)}`;
  }
  const amp = Math.min(rough * Math.max(1.2, len * 0.015), rough * 4);
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const nx = -uy, ny = ux;
  const j = () => (rand() * 2 - 1) * amp;
  const end = () => (rand() * 2 - 1) * amp * 0.5;
  // 끝을 선 방향으로 조금 넘기거나 모자라게(모서리가 살짝 삐져나온 손그림 느낌)
  const over = () => (rand() * 1.5 - 0.5) * amp * 0.8;
  const o0 = over(), o3 = over();
  const sx = x1 - ux * o0 + end(), sy = y1 - uy * o0 + end();
  const ex = x2 + ux * o3 + end(), ey = y2 + uy * o3 + end();
  const t1 = 0.25 + rand() * 0.2, t2 = 0.55 + rand() * 0.2;
  const o1 = j(), o2 = j();
  const c1x = sx + (ex - sx) * t1 + nx * o1, c1y = sy + (ey - sy) * t1 + ny * o1;
  const c2x = sx + (ex - sx) * t2 + nx * o2, c2y = sy + (ey - sy) * t2 + ny * o2;
  return `M${f(sx)} ${f(sy)}C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(ex)} ${f(ey)}`;
}

// 꺾은선(닫힘 여부 선택). 거칠기가 있으면 두 번 그어 연필로 덧그은 느낌을 낸다.
export function roughPolyline(points, { roughness = 1, seed = 1, closed = false, passes } = {}) {
  const rand = rng(seed);
  const pts = closed ? [...points, points[0]] : points;
  const n = passes ?? (roughness > 0 ? 2 : 1);
  const out = [];
  for (let p = 0; p < n; p++) {
    let d = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      d += wobblySegment(x1, y1, x2, y2, roughness * (p ? 1.1 : 1), rand, i === 0 || roughness > 0);
    }
    if (roughness <= 0 && closed) d += 'Z';
    if (d) out.push(d);
  }
  return out;
}

// 점들을 지나는 매끈한 닫힌/열린 곡선(Catmull-Rom → 베지어)
export function smoothPath(pts, closed) {
  if (pts.length < 2) return '';
  const P = (i) => closed ? pts[(i + pts.length) % pts.length] : pts[Math.max(0, Math.min(pts.length - 1, i))];
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const last = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

export function ellipsePoints(cx, cy, rx, ry, n = 36) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

// 타원: 반지름을 조금씩 흔든 점을 이어 그리고, 한 바퀴보다 조금 더 돌아 끝이 겹치게 한다.
export function roughEllipse(cx, cy, rx, ry, { roughness = 1, seed = 1 } = {}) {
  if (roughness <= 0) return [smoothPath(ellipsePoints(cx, cy, rx, ry, 24), true)];
  const rand = rng(seed);
  const out = [];
  const perim = Math.PI * (Math.abs(rx) + Math.abs(ry));
  const n = Math.max(8, Math.min(24, Math.round(perim / 30)));
  for (let p = 0; p < 2; p++) {
    const start = rand() * Math.PI * 2;
    const overlap = 0.15 + rand() * 0.35;
    const pts = [];
    const total = n + Math.ceil(overlap * n / (Math.PI * 2) * Math.PI);
    const amp = roughness * Math.min(Math.abs(rx), Math.abs(ry)) * 0.035 + roughness;
    for (let i = 0; i <= total; i++) {
      const a = start + (i / n) * Math.PI * 2;
      const k = 1 + ((rand() * 2 - 1) * amp) / Math.max(1, Math.min(Math.abs(rx), Math.abs(ry)));
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    out.push(smoothPath(pts, false));
  }
  return out;
}

// 다각형 안을 비스듬한 빗금으로 채운다. 각 빗금은 다각형 경계와 만나는 곳까지 자른다.
export function hachureLines(poly, { gap = 8, angle = -41, roughness = 1, seed = 7 } = {}) {
  const rand = rng(seed);
  const a = (angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  // 회전해서 수평 주사선으로 자른 뒤 다시 돌린다
  const rot = poly.map(([x, y]) => [x * cos + y * sin, -x * sin + y * cos]);
  const ys = rot.map((p) => p[1]);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const out = [];
  for (let y = minY + gap / 2; y < maxY; y += gap) {
    const xs = [];
    for (let i = 0; i < rot.length; i++) {
      const [x1, y1] = rot[i], [x2, y2] = rot[(i + 1) % rot.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const back = ([x, yy]) => [x * cos - yy * sin, x * sin + yy * cos];
      const [p1x, p1y] = back([xs[i] + 1, y]), [p2x, p2y] = back([xs[i + 1] - 1, y]);
      if (Math.hypot(p2x - p1x, p2y - p1y) < 2) continue;
      out.push(wobblySegment(p1x, p1y, p2x, p2y, roughness * 0.6, rand, true));
    }
  }
  return out;
}
