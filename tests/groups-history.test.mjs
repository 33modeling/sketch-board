import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionForHit, expandToGroups, groupElements, ungroupElements } from '../src/groups.js';
import { History } from '../src/history.js';

const els = () => [
  { id: 'a', groupIds: [] }, { id: 'b', groupIds: [] }, { id: 'c', groupIds: [] }, { id: 'd', groupIds: [] },
];

test('묶으면 하나를 눌러도 묶음 전체가 골라진다', () => {
  const { elements, groupId } = groupElements(els(), ['a', 'c']);
  assert.ok(groupId);
  assert.deepEqual(elements.map((e) => e.id), ['b', 'a', 'c', 'd'], '묶은 것은 서로 붙여 둔다');
  const a = elements.find((e) => e.id === 'a');
  assert.deepEqual(selectionForHit(elements, a).sort(), ['a', 'c']);
  assert.deepEqual(selectionForHit(elements, elements.find((e) => e.id === 'b')), ['b']);
  assert.deepEqual(expandToGroups(elements, ['c']), ['a', 'c']);
});

test('겹친 묶음: 바깥 먼저, 묶음 안에 들어가면 한 단계 안쪽', () => {
  let r = groupElements(els(), ['a', 'b']);
  const inner = r.groupId;
  r = groupElements(r.elements, ['a', 'b', 'c']);
  const outer = r.groupId;
  const E = r.elements;
  const a = E.find((e) => e.id === 'a');
  assert.deepEqual(a.groupIds, [inner, outer]);
  assert.deepEqual(selectionForHit(E, a).sort(), ['a', 'b', 'c']);
  assert.deepEqual(selectionForHit(E, a, outer).sort(), ['a', 'b']);
  assert.deepEqual(selectionForHit(E, a, inner), ['a']);
  const u = ungroupElements(E, ['a', 'b', 'c']);
  assert.deepEqual(u.removed, [outer]);
  assert.deepEqual(u.elements.find((e) => e.id === 'a').groupIds, [inner]);
  assert.deepEqual(ungroupElements(E, ['a']).removed, [], '묶음 일부만 고르면 풀지 않음');
});

test('하나만 고르면 묶지 않음', () => {
  assert.equal(groupElements(els(), ['a']).groupId, null);
});

test('실행 취소·다시 실행, 새로 기록하면 다시 실행 목록이 비워진다', () => {
  const h = new History();
  h.reset([]);
  assert.equal(h.canUndo, false);
  h.record([{ id: 1 }]);
  h.record([{ id: 1 }, { id: 2 }]);
  assert.equal(h.record([{ id: 1 }, { id: 2 }]), false, '같은 상태는 기록 안 함');
  assert.deepEqual(h.undo(), [{ id: 1 }]);
  assert.deepEqual(h.undo(), []);
  assert.equal(h.undo(), null);
  assert.deepEqual(h.redo(), [{ id: 1 }]);
  h.record([{ id: 3 }]);
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.undo(), [{ id: 1 }]);
});

test('기록 한도', () => {
  const h = new History(3);
  h.reset([]);
  for (let i = 0; i < 10; i++) h.record([i]);
  let n = 0;
  while (h.undo()) n++;
  assert.equal(n, 3);
});
