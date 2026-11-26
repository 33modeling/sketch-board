// 요소 하나를 그릴 모양(요소 기준 좌표의 SVG path 목록)으로 바꾼다. 캔버스와 SVG 가 같이 쓴다.
import { roughPolyline, roughEllipse, hachureLines, smoothPath, ellipsePoints, effectiveRoughness } from './rough.js';

export const isLinear = (el) => el.type === 'line' || el.type === 'arrow';
export const hasFill = (el) => el.backgroundColor && el.backgroundColor !== 'transparent';

export function outlinePolygon(el) {
  const w = el.width, h = el.height;
  if (el.type === 'rectangle') return [[0, 0], [w, 0], [w, h], [0, h]];
  if (el.type === 'diamond') return [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
  if (el.type === 'ellipse') return ellipsePoints(w / 2, h / 2, w / 2, h / 2, 36);
  return null;
}

export function arrowHead(points, strokeWidth = 2) {
  if (points.length < 2) return null;
  const [x2, y2] = points[points.length - 1];
  let i = points.length - 2;
  while (i > 0 && Math.hypot(points[i][0] - x2, points[i][1] - y2) < 1) i--;
  const [x1, y1] = points[i];
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) return null;
  const size = Math.min(14 + strokeWidth * 3, len * 0.6);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const wing = (s) => [x2 - size * Math.cos(ang + s), y2 - size * Math.sin(ang + s)];
  return [wing(Math.PI / 7), [x2, y2], wing(-Math.PI / 7)];
}

// 점이 너무 촘촘한 펜 획은 줄여서 곡선으로 잇는다
export function simplifyPoints(pts, minDist = 2) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [lx, ly] = out[out.length - 1];
    if (Math.hypot(pts[i][0] - lx, pts[i][1] - ly) >= minDist) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function buildShape(el) {
  const rough = effectiveRoughness(el);
  const seed = el.seed || 1;
  const sw = el.strokeWidth || 2;
  const shape = { strokes: [], fills: [], hatch: [], dots: [] };
  const poly = outlinePolygon(el);
  if (poly) {
    if (hasFill(el)) {
      if (el.fillStyle === 'solid') {
        shape.fills.push(smoothOrPoly(el, poly));
      } else {
        const gap = Math.max(6, sw * 4);
        shape.hatch.push(...hachureLines(poly, { gap, roughness: rough, seed: seed + 3 }));
        if (el.fillStyle === 'cross-hatch') shape.hatch.push(...hachureLines(poly, { gap, angle: 49, roughness: rough, seed: seed + 5 }));
      }
    }
    if (el.type === 'ellipse') shape.strokes.push(...roughEllipse(el.width / 2, el.height / 2, el.width / 2, el.height / 2, { roughness: el.strokeStyle !== 'solid' ? 0 : rough, seed }));
    else shape.strokes.push(...roughPolyline(poly, { roughness: rough, seed, closed: true, passes: el.strokeStyle !== 'solid' || rough <= 0 ? 1 : 2 }));
    return shape;
  }
  if (isLinear(el)) {
    const pts = el.points || [];
    const passes = el.strokeStyle !== 'solid' || rough <= 0 ? 1 : 2;
    shape.strokes.push(...roughPolyline(pts, { roughness: rough, seed, passes }));
    if (el.type === 'arrow') {
      const head = arrowHead(pts, sw);
      if (head) shape.strokes.push(...roughPolyline(head, { roughness: rough * 0.6, seed: seed + 11, passes: 1 }));
    }
    return shape;
  }
  if (el.type === 'freedraw') {
    const pts = simplifyPoints(el.points || []);
    if (pts.length === 1 || (pts.length === 2 && Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) < 1)) shape.dots.push(pts[0]);
    else shape.strokes.push(smoothPath(pts, false));
    return shape;
  }
  return shape;
}

function smoothOrPoly(el, poly) {
  if (el.type === 'ellipse') return smoothPath(ellipsePoints(el.width / 2, el.height / 2, el.width / 2, el.height / 2, 24), true);
  return 'M' + poly.map(([x, y]) => `${x} ${y}`).join('L') + 'Z';
}

export const dashArray = (el) => (el.strokeStyle === 'dashed' ? [8, 8 + (el.strokeWidth || 2)] : el.strokeStyle === 'dotted' ? [1.5, 6 + (el.strokeWidth || 2)] : null);
export const FONT_STACK = '"Nanum Pen Script", "Gaegu", "Segoe Print", "Comic Sans MS", cursive, sans-serif';
export const LINE_HEIGHT = 1.25;
