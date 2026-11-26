// 경계 상자, 누른 곳 찾기(hit test), 크기 조절 계산. DOM 을 쓰지 않아 node 시험이 된다.
import { isLinear, hasFill, arrowHead } from './shapes.js';

export function elementBounds(el) {
  if (isLinear(el) || el.type === 'freedraw') {
    const pts = el.points?.length ? el.points : [[0, 0]];
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const [x, y] of pts) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
    if (el.type === 'arrow') for (const [x, y] of arrowHead(pts, el.strokeWidth) || []) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
    return [el.x + x1, el.y + y1, el.x + x2, el.y + y2];
  }
  return [el.x, el.y, el.x + el.width, el.y + el.height];
}

export function commonBounds(els) {
  if (!els.length) return null;
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const el of els) {
    const [a, c, d, e] = elementBounds(el);
    b = [Math.min(b[0], a), Math.min(b[1], c), Math.max(b[2], d), Math.max(b[3], e)];
  }
  return b;
}

export function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distToPolyline(px, py, pts, closed) {
  let d = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    d = Math.min(d, distToSegment(px, py, a[0], a[1], b[0], b[1]));
  }
  if (pts.length === 1) d = Math.hypot(px - pts[0][0], py - pts[0][1]);
  return d;
}

export function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// 요소가 (x,y) 를 덮는지. 채우지 않은 도형은 테두리 근처(tol)만 누를 수 있다.
export function hitElement(el, x, y, tol = 8) {
  const lx = x - el.x, ly = y - el.y;
  const t = tol + (el.strokeWidth || 2) / 2;
  if (el.type === 'text') return lx >= -tol && ly >= -tol && lx <= el.width + tol && ly <= el.height + tol;
  if (isLinear(el) || el.type === 'freedraw') {
    const pts = el.points || [];
    if (distToPolyline(lx, ly, pts, false) <= t) return true;
    if (el.type === 'arrow') { const h = arrowHead(pts, el.strokeWidth); if (h && distToPolyline(lx, ly, h, false) <= t) return true; }
    return false;
  }
  const w = el.width, h = el.height;
  if (el.type === 'rectangle') {
    const poly = [[0, 0], [w, 0], [w, h], [0, h]];
    if (hasFill(el) && lx >= 0 && ly >= 0 && lx <= w && ly <= h) return true;
    return distToPolyline(lx, ly, poly, true) <= t;
  }
  if (el.type === 'diamond') {
    const poly = [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
    if (hasFill(el) && pointInPolygon(lx, ly, poly)) return true;
    return distToPolyline(lx, ly, poly, true) <= t;
  }
  if (el.type === 'ellipse') {
    const rx = Math.max(w / 2, 0.5), ry = Math.max(h / 2, 0.5);
    const nx = (lx - rx) / rx, ny = (ly - ry) / ry;
    const r = Math.hypot(nx, ny);
    if (hasFill(el) && r <= 1) return true;
    // 테두리까지 거리(근사): 반지름 방향 차이
    return Math.abs(r - 1) * Math.min(rx, ry) <= t || (r < 1e-6 && Math.min(rx, ry) <= t);
  }
  return false;
}

export function topHit(elements, x, y, tol) {
  for (let i = elements.length - 1; i >= 0; i--) if (hitElement(elements[i], x, y, tol)) return elements[i];
  return null;
}

// 상자 안에 완전히 들어간 요소
export function elementsInBox(elements, [x1, y1, x2, y2]) {
  const bx1 = Math.min(x1, x2), by1 = Math.min(y1, y2), bx2 = Math.max(x1, x2), by2 = Math.max(y1, y2);
  return elements.filter((el) => { const [a, b, c, d] = elementBounds(el); return a >= bx1 && b >= by1 && c <= bx2 && d <= by2; });
}

// 선택 상자의 손잡이 8개(화면 크기와 무관하게 장면 좌표로)
export const HANDLE_NAMES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export function handlePositions([x1, y1, x2, y2]) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return { nw: [x1, y1], n: [mx, y1], ne: [x2, y1], e: [x2, my], se: [x2, y2], s: [mx, y2], sw: [x1, y2], w: [x1, my] };
}

export function hitHandle(bounds, x, y, radius) {
  const pos = handlePositions(bounds);
  for (const name of HANDLE_NAMES) {
    const [hx, hy] = pos[name];
    if (Math.abs(x - hx) <= radius && Math.abs(y - hy) <= radius) return name;
  }
  return null;
}

// 손잡이를 끈 만큼 선택 묶음 전체를 맞은편 꼭짓점 기준으로 늘리고 줄인다.
export function resizeElements(originals, startBounds, handle, x, y, { keepRatio = false } = {}) {
  const [x1, y1, x2, y2] = startBounds;
  const ow = Math.max(x2 - x1, 1), oh = Math.max(y2 - y1, 1);
  const ax = handle.includes('w') ? x2 : x1;
  const ay = handle.includes('n') ? y2 : y1;
  let sx = handle.includes('e') ? (x - x1) / ow : handle.includes('w') ? (x2 - x) / ow : 1;
  let sy = handle.includes('s') ? (y - y1) / oh : handle.includes('n') ? (y2 - y) / oh : 1;
  const onlyText = originals.length === 1 && originals[0].type === 'text';
  if (keepRatio || onlyText) {
    if (handle.length === 2) { const s = Math.max(sx, sy); sx = sy = s; }
    else if (handle === 'e' || handle === 'w') sy = sx;
    else sx = sy;
  }
  const MIN = 0.02;
  sx = Math.max(sx, MIN); sy = Math.max(sy, MIN);
  // 한 방향만 미는 손잡이(n·s·e·w)는 반대쪽 축 중심을 기준으로
  const cx = handle === 'n' || handle === 's' ? (x1 + x2) / 2 : ax;
  const cy = handle === 'e' || handle === 'w' ? (y1 + y2) / 2 : ay;
  return originals.map((el) => scaleElement(el, cx, cy, sx, sy));
}

export function scaleElement(el, ax, ay, sx, sy) {
  const n = { ...el, x: ax + (el.x - ax) * sx, y: ay + (el.y - ay) * sy };
  if (el.points) n.points = el.points.map(([px, py, p]) => (p === undefined ? [px * sx, py * sy] : [px * sx, py * sy, p]));
  if (el.type === 'text') {
    const s = Math.min(sx, sy);
    n.fontSize = Math.max(6, el.fontSize * s);
    n.width = el.width * (n.fontSize / el.fontSize);
    n.height = el.height * (n.fontSize / el.fontSize);
  } else {
    n.width = el.width * sx;
    n.height = el.height * sy;
  }
  return n;
}

// 선·화살표·펜 요소의 width/height 를 점에서 다시 계산
export function syncLinearSize(el) {
  if (!el.points) return el;
  const xs = el.points.map((p) => p[0]), ys = el.points.map((p) => p[1]);
  return { ...el, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
