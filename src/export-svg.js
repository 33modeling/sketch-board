// SVG 내보내기. 캔버스와 같은 모양(buildShape)을 써서 화면과 같은 손그림 선이 나온다.
// 장면 JSON 을 <metadata> 에 base64 로 넣어 두면, 그 SVG 를 다시 열어 고칠 수 있다.
import { buildShape, dashArray, hasFill, FONT_STACK, LINE_HEIGHT } from './shapes.js';
import { commonBounds } from './geometry.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function b64encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function b64decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function elementSvg(el) {
  const op = (el.opacity ?? 100) / 100;
  const parts = [];
  const sw = el.strokeWidth || 2;
  const dash = dashArray(el);
  const dashAttr = dash ? ` stroke-dasharray="${dash.join(' ')}"` : '';
  if (el.type === 'text') {
    const lines = String(el.text || '').split('\n');
    const lh = el.fontSize * LINE_HEIGHT;
    const tspans = lines.map((l, i) => `<tspan x="0" y="${(el.fontSize * 0.9 + i * lh).toFixed(2)}">${esc(l) || ' '}</tspan>`).join('');
    parts.push(`<text font-family="${esc(FONT_STACK)}" font-size="${el.fontSize}" fill="${esc(el.strokeColor)}" xml:space="preserve">${tspans}</text>`);
  } else {
    const s = buildShape(el);
    for (const d of s.fills) parts.push(`<path d="${d}" fill="${esc(el.backgroundColor)}" stroke="none"/>`);
    for (const d of s.hatch) parts.push(`<path d="${d}" fill="none" stroke="${esc(el.backgroundColor)}" stroke-width="${Math.max(1, sw / 2)}" stroke-linecap="round"/>`);
    const w = el.type === 'freedraw' ? sw * 1.6 : sw;
    for (const d of s.strokes) parts.push(`<path d="${d}" fill="none" stroke="${esc(el.strokeColor)}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}/>`);
    for (const [x, y] of s.dots) parts.push(`<circle cx="${x}" cy="${y}" r="${w / 2 + 0.5}" fill="${esc(el.strokeColor)}"/>`);
  }
  return `<g transform="translate(${+el.x.toFixed(2)} ${+el.y.toFixed(2)})"${op < 1 ? ` opacity="${op}"` : ''}>${parts.join('')}</g>`;
}

export function exportSvg(elements, { background = '#ffffff', padding = 16, sceneJson = null } = {}) {
  const b = commonBounds(elements) || [0, 0, 100, 100];
  const pad = padding + 4;
  const x = b[0] - pad, y = b[1] - pad, w = b[2] - b[0] + pad * 2, h = b[3] - b[1] + pad * 2;
  const bg = background ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${esc(background)}"/>` : '';
  const meta = sceneJson ? `<metadata id="sketch-board-scene">${b64encode(sceneJson)}</metadata>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}" width="${Math.ceil(w)}" height="${Math.ceil(h)}">${meta}${bg}${elements.map(elementSvg).join('')}</svg>`;
}

export function sceneFromSvg(svgText) {
  const m = /<metadata id="sketch-board-scene">([A-Za-z0-9+/=]+)<\/metadata>/.exec(svgText);
  return m ? b64decode(m[1]) : null;
}

export { hasFill };
