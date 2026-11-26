// 캔버스에 장면 그리기(화면용·PNG 내보내기용 공통)
import { buildShape, dashArray, FONT_STACK, LINE_HEIGHT } from './shapes.js';

const cache = new WeakMap();
function paths(el) {
  let p = cache.get(el);
  if (!p) {
    const s = buildShape(el);
    p = { fills: s.fills.map((d) => new Path2D(d)), hatch: s.hatch.map((d) => new Path2D(d)), strokes: s.strokes.map((d) => new Path2D(d)), dots: s.dots };
    cache.set(el, p);
  }
  return p;
}

export function measureText(ctx, el) {
  ctx.save();
  ctx.font = `${el.fontSize}px ${FONT_STACK}`;
  const lines = String(el.text || '').split('\n');
  const width = Math.max(4, ...lines.map((l) => ctx.measureText(l).width));
  ctx.restore();
  return { width, height: lines.length * el.fontSize * LINE_HEIGHT };
}

export function drawElement(ctx, el) {
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.globalAlpha = (el.opacity ?? 100) / 100;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (el.type === 'text') {
    ctx.font = `${el.fontSize}px ${FONT_STACK}`;
    ctx.fillStyle = el.strokeColor;
    ctx.textBaseline = 'alphabetic';
    String(el.text || '').split('\n').forEach((l, i) => ctx.fillText(l, 0, el.fontSize * 0.9 + i * el.fontSize * LINE_HEIGHT));
    ctx.restore();
    return;
  }
  const p = paths(el);
  const sw = el.strokeWidth || 2;
  ctx.fillStyle = el.backgroundColor;
  for (const f of p.fills) ctx.fill(f);
  if (p.hatch.length) {
    ctx.strokeStyle = el.backgroundColor;
    ctx.lineWidth = Math.max(1, sw / 2);
    for (const h of p.hatch) ctx.stroke(h);
  }
  ctx.strokeStyle = el.strokeColor;
  ctx.lineWidth = el.type === 'freedraw' ? sw * 1.6 : sw;
  const dash = dashArray(el);
  if (dash) ctx.setLineDash(dash);
  for (const s of p.strokes) ctx.stroke(s);
  ctx.setLineDash([]);
  ctx.fillStyle = el.strokeColor;
  for (const [x, y] of p.dots) { ctx.beginPath(); ctx.arc(x, y, ctx.lineWidth / 2 + 0.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
