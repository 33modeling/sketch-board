import test from 'node:test';
import assert from 'node:assert/strict';
import { elementBounds, commonBounds, hitElement, topHit, elementsInBox, hitHandle, resizeElements } from '../src/geometry.js';

const rect = (o = {}) => ({ id: 'r', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, strokeWidth: 2, backgroundColor: 'transparent', groupIds: [], ...o });

test('경계 상자: 도형·선(점 기준)·여러 개', () => {
  assert.deepEqual(elementBounds(rect({ x: 10, y: 20 })), [10, 20, 110, 70]);
  const line = { type: 'line', x: 50, y: 50, points: [[0, 0], [-20, 30], [40, 10]] };
  assert.deepEqual(elementBounds(line), [30, 50, 90, 80]);
  assert.deepEqual(commonBounds([rect(), rect({ x: 200, y: -10, width: 10, height: 10 })]), [0, -10, 210, 50]);
  assert.equal(commonBounds([]), null);
});

test('누르기: 빈 사각형은 테두리만, 채운 사각형은 안쪽도', () => {
  assert.ok(hitElement(rect(), 1, 25));
  assert.ok(!hitElement(rect(), 50, 25));
  assert.ok(hitElement(rect({ backgroundColor: '#ffc9c9' }), 50, 25));
  assert.ok(!hitElement(rect(), 150, 25));
});

test('누르기: 원·마름모·선·글자', () => {
  const ell = { type: 'ellipse', x: 0, y: 0, width: 100, height: 100, strokeWidth: 2, backgroundColor: 'transparent' };
  assert.ok(hitElement(ell, 100, 50));
  assert.ok(!hitElement(ell, 50, 50));
  assert.ok(hitElement({ ...ell, backgroundColor: '#fff' }, 50, 50));
  const dia = { ...ell, type: 'diamond' };
  assert.ok(hitElement(dia, 25, 25));
  assert.ok(!hitElement(dia, 2, 2));
  const line = { type: 'line', x: 0, y: 0, points: [[0, 0], [100, 100]], strokeWidth: 2 };
  assert.ok(hitElement(line, 50, 52));
  assert.ok(!hitElement(line, 50, 80));
  assert.ok(hitElement({ type: 'text', x: 0, y: 0, width: 60, height: 30 }, 30, 15));
});

test('위에 있는 것부터 찾는다', () => {
  const a = rect({ id: 'a', backgroundColor: '#fff' }), b = rect({ id: 'b', backgroundColor: '#fff', x: 50 });
  assert.equal(topHit([a, b], 70, 25).id, 'b');
  assert.equal(topHit([b, a], 70, 25).id, 'a');
  assert.equal(topHit([a, b], 500, 500), null);
});

test('상자로 고르기는 완전히 들어간 것만', () => {
  const a = rect({ id: 'a' }), b = rect({ id: 'b', x: 150 });
  assert.deepEqual(elementsInBox([a, b], [-5, -5, 120, 60]).map((e) => e.id), ['a']);
  assert.deepEqual(elementsInBox([a, b], [300, 80, -5, -5]).map((e) => e.id), ['a', 'b']);
});

test('손잡이 찾기와 크기 조절', () => {
  const b = [0, 0, 100, 50];
  assert.equal(hitHandle(b, 101, 49, 6), 'se');
  assert.equal(hitHandle(b, 50, 0, 6), 'n');
  assert.equal(hitHandle(b, 50, 25, 6), null);
  const [r] = resizeElements([rect()], b, 'se', 200, 100);
  assert.deepEqual([r.x, r.y, r.width, r.height], [0, 0, 200, 100]);
  const [l] = resizeElements([rect()], b, 'nw', 50, 25);
  assert.deepEqual([l.x, l.y, l.width, l.height], [50, 25, 50, 25]);
  const [e] = resizeElements([rect()], b, 'e', 150, 999);
  assert.deepEqual([e.width, e.height], [150, 50]);
  const [k] = resizeElements([rect()], b, 'se', 300, 60, { keepRatio: true });
  assert.equal(k.width / k.height, 2);
});

test('여러 개 크기 조절은 함께 늘고, 선의 점도 늘어난다', () => {
  const a = rect({ id: 'a' });
  const ln = { id: 'l', type: 'line', x: 100, y: 0, width: 100, height: 50, points: [[0, 0], [100, 50]], groupIds: [] };
  const b = commonBounds([a, ln]);
  const out = resizeElements([a, ln], b, 'se', 400, 100);
  assert.equal(out[0].width, 200);
  assert.equal(out[1].x, 200);
  assert.deepEqual(out[1].points[1], [200, 100]);
});

test('글자 하나는 비율 유지, 글자 크기가 같이 바뀐다', () => {
  const t = { id: 't', type: 'text', x: 0, y: 0, width: 100, height: 30, fontSize: 24, text: '안녕' };
  const [n] = resizeElements([t], [0, 0, 100, 30], 'se', 200, 40);
  assert.equal(n.fontSize, 48);
  assert.equal(n.width, 200);
});
