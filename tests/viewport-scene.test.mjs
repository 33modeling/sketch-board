import test from 'node:test';
import assert from 'node:assert/strict';
import { toScene, toScreen, zoomAt, pinch, fitBounds, clampZoom, MIN_ZOOM, MAX_ZOOM } from '../src/viewport.js';
import { serializeScene, parseScene, restoreElement, cloneElements, newElement } from '../src/scene.js';
import { makeItem, mergeItems, instantiate, serializeLibrary, parseLibrary } from '../src/library.js';
import { exportSvg, sceneFromSvg } from '../src/export-svg.js';
import { bringToFront, sendToBack, duplicate, moveBy, applyStyle } from '../src/ops.js';
import { commonBounds } from '../src/geometry.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('확대해도 손가락(마우스) 아래 점은 그대로', () => {
  const vp = { zoom: 1, scrollX: 30, scrollY: -10 };
  const before = toScene(vp, 200, 150);
  const next = zoomAt(vp, 2.5, 200, 150);
  const after = toScene(next, 200, 150);
  near(before[0], after[0]); near(before[1], after[1]);
  const [sx, sy] = toScreen(next, ...after);
  near(sx, 200); near(sy, 150);
  assert.equal(clampZoom(100), MAX_ZOOM);
  assert.equal(clampZoom(0), MIN_ZOOM);
});

test('두 손가락: 벌리면 확대, 같이 끌면 이동', () => {
  const vp = { zoom: 1, scrollX: 0, scrollY: 0 };
  const z = pinch(vp, [[100, 100], [200, 100]], [[50, 100], [250, 100]]);
  near(z.zoom, 2);
  const c = toScene(z, 150, 100);
  near(c[0], 150); near(c[1], 100);
  const p = pinch(vp, [[100, 100], [200, 100]], [[130, 140], [230, 140]]);
  near(p.zoom, 1); near(p.scrollX, 30); near(p.scrollY, 40);
});

test('모두 보기', () => {
  const v = fitBounds([0, 0, 1000, 500], 500, 500, 0, 5);
  near(v.zoom, 0.5);
  const [cx, cy] = toScene(v, 250, 250);
  near(cx, 500); near(cy, 250);
});

test('장면 JSON 저장 → 불러오기 그대로', () => {
  const a = { ...newElement('rectangle', 10, 20), width: 100, height: 40 };
  const t = { ...newElement('text', 0, 0), text: '안녕\n하세요', width: 50, height: 60 };
  const json = serializeScene([a, t], { viewBackgroundColor: '#fff9db' });
  const r = parseScene(json);
  assert.deepEqual(r.elements, [a, t]);
  assert.equal(r.appState.viewBackgroundColor, '#fff9db');
  assert.throws(() => parseScene('{"type":"other","elements":[]}'), /장면 파일이 아닙니다/);
  assert.throws(() => parseScene('nope'), /JSON/);
});

test('Excalidraw 장면의 기본 도형을 읽고, 모르는 것은 버린다', () => {
  const r = parseScene(JSON.stringify({
    type: 'excalidraw', version: 2, elements: [
      { id: 'x1', type: 'rectangle', x: 0, y: 0, width: -50, height: 20, strokeColor: '#e03131', roughness: 2, seed: 7, groupIds: ['g'] },
      { id: 'x2', type: 'freedraw', x: 0, y: 0, points: [[0, 0], [5, 5]], pressures: [0.3, 0.6] },
      { id: 'x3', type: 'image', x: 0, y: 0 },
      { id: 'x4', type: 'text', x: 0, y: 0, text: '', fontSize: 20 },
      { id: 'x5', type: 'ellipse', x: 0, y: 0, width: 5, height: 5, isDeleted: true },
    ], appState: { viewBackgroundColor: '#ffffff' },
  }));
  assert.equal(r.from, 'excalidraw');
  assert.deepEqual(r.elements.map((e) => e.id), ['x1', 'x2']);
  assert.deepEqual([r.elements[0].x, r.elements[0].width, r.elements[0].strokeColor, r.elements[0].roughness], [-50, 50, '#e03131', 2]);
  assert.deepEqual(r.elements[1].points[1], [5, 5, 0.6]);
  assert.equal(restoreElement({ type: 'line', points: [] }), null);
});

test('복제는 새 id, 같은 묶음은 같은 새 묶음 id', () => {
  const src = [{ id: 'a', x: 0, y: 0, groupIds: ['g1'] }, { id: 'b', x: 5, y: 5, groupIds: ['g1'] }];
  const c = cloneElements(src, 10, 0);
  assert.notEqual(c[0].id, 'a');
  assert.equal(c[0].groupIds[0], c[1].groupIds[0]);
  assert.notEqual(c[0].groupIds[0], 'g1');
  assert.equal(c[1].x, 15);
});

test('라이브러리: 같은 모양은 한 번만, 놓으면 가운데·한 묶음', () => {
  const a = { ...newElement('rectangle', 100, 100), width: 40, height: 40 };
  const b = { ...newElement('ellipse', 150, 100), width: 20, height: 20 };
  const item = makeItem([a, b]);
  assert.deepEqual(commonBounds(item.elements).slice(0, 2), [0, 0]);
  let r = mergeItems([], [item]);
  assert.equal(r.added, 1);
  const moved = makeItem([{ ...a, x: 500, id: 'z', seed: 3 }, { ...b, x: 550, id: 'w' }]);
  r = mergeItems(r.items, [moved]);
  assert.equal(r.added, 0, '위치·id·seed 만 다르면 같은 모양');
  const placed = instantiate(item, 0, 0);
  const bb = commonBounds(placed);
  near((bb[0] + bb[2]) / 2, 0); near((bb[1] + bb[3]) / 2, 0);
  assert.equal(placed[0].groupIds.length, 1);
  assert.equal(placed[0].groupIds[0], placed[1].groupIds[0]);
  const back = parseLibrary(serializeLibrary(r.items));
  assert.equal(back.length, 1);
  const ex = parseLibrary(JSON.stringify({ type: 'excalidrawlib', version: 2, libraryItems: [{ id: 'i', elements: [a] }] }));
  assert.equal(ex.length, 1);
  assert.throws(() => parseLibrary('{"type":"x"}'), /라이브러리 파일이 아닙니다/);
});

test('SVG 내보내기: 손그림 path, 한글 글자 이스케이프, 장면 넣고 다시 꺼내기', () => {
  const a = { ...newElement('rectangle', 0, 0), width: 100, height: 50, backgroundColor: '#a5d8ff' };
  const t = { ...newElement('text', 0, 80), text: '<회의> & 정리', width: 120, height: 30 };
  const json = serializeScene([a, t]);
  const svg = exportSvg([a, t], { sceneJson: json });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.ok((svg.match(/<path /g) || []).length > 3);
  assert.match(svg, /&lt;회의&gt; &amp; 정리/);
  assert.equal(sceneFromSvg(svg), json);
  assert.equal(sceneFromSvg(exportSvg([a])), null);
  assert.equal(parseScene(sceneFromSvg(svg)).elements.length, 2);
});

test('순서·이동·복제·속성 바꾸기', () => {
  const E = [{ id: 'a', x: 0, y: 0, version: 1 }, { id: 'b', x: 0, y: 0, version: 1 }, { id: 'c', x: 0, y: 0, version: 1 }];
  assert.deepEqual(bringToFront(E, ['a']).map((e) => e.id), ['b', 'c', 'a']);
  assert.deepEqual(sendToBack(E, ['c']).map((e) => e.id), ['c', 'a', 'b']);
  const m = moveBy(E, ['b'], 5, -2);
  assert.deepEqual([m[1].x, m[1].y, m[1].version], [5, -2, 2]);
  const d = duplicate(E.map((e) => ({ ...e, groupIds: [] })), ['a']);
  assert.equal(d.elements.length, 4);
  assert.equal(d.elements[3].x, 10);
  const s = applyStyle(E, ['a', 'c'], 'strokeColor', '#e03131');
  assert.deepEqual(s.map((e) => e.strokeColor), ['#e03131', undefined, '#e03131']);
  assert.equal(applyStyle(E, ['a'], 'x', 9), E, '모양 속성이 아니면 그대로');
});
