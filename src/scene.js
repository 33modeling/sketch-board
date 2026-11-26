// 장면 JSON 저장·불러오기. 파일 형식: { type: "sketch-board", version: 1, elements, appState }.
// Excalidraw 장면(.excalidraw)의 기본 도형(사각형·마름모·원·선·화살표·펜·글자)도 읽는다.
import { newId } from './groups.js';
import { randomSeed } from './rough.js';
import { syncLinearSize } from './geometry.js';

export const FILE_TYPE = 'sketch-board';
export const VERSION = 1;
export const TYPES = ['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'freedraw', 'text'];

export const DEFAULT_STYLE = {
  strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'hachure',
  strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, fontSize: 24,
};

export function newElement(type, x, y, style = {}, extra = {}) {
  const s = { ...DEFAULT_STYLE, ...style };
  const el = {
    id: newId(), type, x, y, width: 0, height: 0,
    strokeColor: s.strokeColor, backgroundColor: s.backgroundColor, fillStyle: s.fillStyle,
    strokeWidth: s.strokeWidth, strokeStyle: s.strokeStyle, roughness: s.roughness, opacity: s.opacity,
    seed: randomSeed(), version: 1, groupIds: [],
  };
  if (type === 'line' || type === 'arrow' || type === 'freedraw') el.points = [[0, 0]];
  if (type === 'text') { el.text = ''; el.fontSize = s.fontSize; }
  return { ...el, ...extra };
}

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v, d) => (typeof v === 'string' ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

export function restoreElement(raw) {
  if (!raw || typeof raw !== 'object' || raw.isDeleted) return null;
  const type = raw.type;
  if (!TYPES.includes(type)) return null;
  const el = {
    id: str(raw.id, newId()) || newId(), type,
    x: num(raw.x, 0), y: num(raw.y, 0), width: num(raw.width, 0), height: num(raw.height, 0),
    strokeColor: str(raw.strokeColor, DEFAULT_STYLE.strokeColor),
    backgroundColor: str(raw.backgroundColor, 'transparent'),
    fillStyle: pick(raw.fillStyle, ['hachure', 'cross-hatch', 'solid'], 'hachure'),
    strokeWidth: Math.max(0.5, Math.min(num(raw.strokeWidth, 2), 40)),
    strokeStyle: pick(raw.strokeStyle, ['solid', 'dashed', 'dotted'], 'solid'),
    roughness: Math.max(0, Math.min(num(raw.roughness, 1), 3)),
    opacity: Math.max(0, Math.min(num(raw.opacity, 100), 100)),
    seed: Math.floor(num(raw.seed, randomSeed())), version: Math.floor(num(raw.version, 1)),
    groupIds: Array.isArray(raw.groupIds) ? raw.groupIds.filter((g) => typeof g === 'string') : [],
  };
  if (type === 'line' || type === 'arrow' || type === 'freedraw') {
    const pts = Array.isArray(raw.points) ? raw.points.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];
    if (!pts.length) return null;
    const pr = Array.isArray(raw.pressures) ? raw.pressures : null;
    el.points = pts.map((p, i) => (type === 'freedraw' && (p[2] ?? pr?.[i]) !== undefined ? [p[0], p[1], num(p[2] ?? pr[i], 0.5)] : [p[0], p[1]]));
    return syncLinearSize(el);
  }
  if (type === 'text') {
    el.text = str(raw.text, str(raw.originalText, ''));
    el.fontSize = Math.max(4, num(raw.fontSize, 24));
    if (!el.text.trim()) return null;
  }
  if (el.width < 0) { el.x += el.width; el.width = -el.width; }
  if (el.height < 0) { el.y += el.height; el.height = -el.height; }
  return el;
}

export function restoreElements(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const el = restoreElement(raw);
    if (!el) continue;
    if (seen.has(el.id)) el.id = newId();
    seen.add(el.id);
    out.push(el);
  }
  return out;
}

export function serializeScene(elements, appState = {}) {
  return JSON.stringify({
    type: FILE_TYPE, version: VERSION, source: 'sketch-board',
    elements,
    appState: { viewBackgroundColor: appState.viewBackgroundColor || '#ffffff' },
  }, null, 2);
}

export function parseScene(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('JSON 형식이 아닙니다'); }
  if (!data || (data.type !== FILE_TYPE && data.type !== 'excalidraw') || !Array.isArray(data.elements)) {
    throw new Error('손그림 보드 장면 파일이 아닙니다');
  }
  const bg = typeof data.appState?.viewBackgroundColor === 'string' ? data.appState.viewBackgroundColor : '#ffffff';
  return { elements: restoreElements(data.elements), appState: { viewBackgroundColor: bg }, from: data.type };
}

// 복제: 새 id·새 seed, 묶음 id 도 새로(같은 묶음끼리는 같은 새 id)
export function cloneElements(els, dx = 0, dy = 0) {
  const gmap = new Map();
  const g = (id) => { if (!gmap.has(id)) gmap.set(id, newId()); return gmap.get(id); };
  return els.map((el) => ({
    ...structuredClone(el), id: newId(), x: el.x + dx, y: el.y + dy, version: 1,
    groupIds: (el.groupIds || []).map(g),
  }));
}
