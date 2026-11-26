// 자주 쓰는 도형 라이브러리. 항목 = { id, created, elements(원점 기준) }.
// 같은 모양(위치·id·seed 빼고 같은 요소들)은 두 번 넣지 않는다.
import { newId } from './groups.js';
import { commonBounds } from './geometry.js';
import { restoreElements, cloneElements } from './scene.js';

export const LIB_TYPE = 'sketch-board-library';

export function signature(elements) {
  const b = commonBounds(elements) || [0, 0];
  return JSON.stringify(elements.map((e) => {
    const { id, seed, version, groupIds, x, y, ...rest } = e;
    return { ...rest, x: Math.round(x - b[0]), y: Math.round(y - b[1]), g: (groupIds || []).length };
  }));
}

export function makeItem(elements) {
  const b = commonBounds(elements);
  const els = elements.map((e) => ({ ...structuredClone(e), x: e.x - b[0], y: e.y - b[1] }));
  return { id: newId(), created: Date.now(), elements: els };
}

// 새 항목을 앞에 두고, 이미 있는 모양은 건너뛴다
export function mergeItems(existing, incoming) {
  const sigs = new Set(existing.map((i) => signature(i.elements)));
  const added = [];
  for (const it of incoming) {
    const s = signature(it.elements);
    if (!it.elements.length || sigs.has(s)) continue;
    sigs.add(s);
    added.push(it);
  }
  return { items: [...added, ...existing], added: added.length };
}

// 장면에 놓기: 가운데가 (cx,cy) 가 되게, 여러 요소면 한 묶음으로
export function instantiate(item, cx, cy) {
  const b = commonBounds(item.elements);
  const dx = cx - (b[0] + b[2]) / 2, dy = cy - (b[1] + b[3]) / 2;
  const els = cloneElements(item.elements, dx, dy);
  if (els.length > 1) {
    const gid = newId();
    for (const e of els) e.groupIds = [...e.groupIds, gid];
  }
  return els;
}

export function serializeLibrary(items) {
  return JSON.stringify({ type: LIB_TYPE, version: 1, source: 'sketch-board', items }, null, 2);
}

// 이 앱 라이브러리와 Excalidraw 라이브러리(.excalidrawlib v1·v2) 읽기
export function parseLibrary(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('JSON 형식이 아닙니다'); }
  let raw = [];
  if (d?.type === LIB_TYPE && Array.isArray(d.items)) raw = d.items.map((i) => i.elements);
  else if (d?.type === 'excalidrawlib') raw = Array.isArray(d.libraryItems) ? d.libraryItems.map((i) => i.elements) : Array.isArray(d.library) ? d.library : [];
  else throw new Error('라이브러리 파일이 아닙니다');
  return raw.map((els) => restoreElements(els)).filter((els) => els.length).map((els) => makeItem(els));
}
