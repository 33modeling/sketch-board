// 장면 편집 동작(순수 함수): 순서 바꾸기, 지우기, 복제, 밀기, 모양 속성 바꾸기
import { cloneElements } from './scene.js';
import { randomSeed } from './rough.js';

const bump = (el, patch) => ({ ...el, ...patch, version: (el.version || 0) + 1 });

export function bringToFront(elements, ids) {
  const s = new Set(ids);
  return [...elements.filter((e) => !s.has(e.id)), ...elements.filter((e) => s.has(e.id))];
}
export function sendToBack(elements, ids) {
  const s = new Set(ids);
  return [...elements.filter((e) => s.has(e.id)), ...elements.filter((e) => !s.has(e.id))];
}
export function removeIds(elements, ids) {
  const s = new Set(ids);
  return elements.filter((e) => !s.has(e.id));
}
// 복제본은 원본 바로 위(맨 위)에, 10px 옮겨서
export function duplicate(elements, ids, offset = 10) {
  const s = new Set(ids);
  const copies = cloneElements(elements.filter((e) => s.has(e.id)), offset, offset).map((e) => ({ ...e, seed: randomSeed() }));
  return { elements: [...elements, ...copies], ids: copies.map((e) => e.id) };
}
export function moveBy(elements, ids, dx, dy) {
  const s = new Set(ids);
  return elements.map((e) => (s.has(e.id) ? bump(e, { x: e.x + dx, y: e.y + dy }) : e));
}
export const STYLE_KEYS = ['strokeColor', 'backgroundColor', 'fillStyle', 'strokeWidth', 'strokeStyle', 'roughness', 'opacity', 'fontSize'];
export function applyStyle(elements, ids, key, value, measure) {
  if (!STYLE_KEYS.includes(key)) return elements;
  const s = new Set(ids);
  return elements.map((e) => {
    if (!s.has(e.id)) return e;
    if (key === 'fontSize') {
      if (e.type !== 'text') return e;
      const n = bump(e, { fontSize: value });
      if (measure) Object.assign(n, measure(n));
      return n;
    }
    return bump(e, { [key]: value });
  });
}
