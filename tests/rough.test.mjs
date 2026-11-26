import test from 'node:test';
import assert from 'node:assert/strict';
import { rng, roughPolyline, roughEllipse, hachureLines, effectiveRoughness } from '../src/rough.js';
import { buildShape } from '../src/shapes.js';
import { newElement } from '../src/scene.js';

test('같은 seed 는 같은 난수, 다른 seed 는 다른 난수', () => {
  const a = rng(42), b = rng(42), c = rng(43);
  const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test('흔들린 선: 같은 seed 면 똑같은 모양, 거칠기 0 이면 반듯한 선 한 번', () => {
  const pts = [[0, 0], [200, 0], [200, 100]];
  assert.deepEqual(roughPolyline(pts, { seed: 5 }), roughPolyline(pts, { seed: 5 }));
  assert.notDeepEqual(roughPolyline(pts, { seed: 5 }), roughPolyline(pts, { seed: 6 }));
  assert.equal(roughPolyline(pts, { seed: 5 }).length, 2, '손그림은 두 번 긋기');
  const flat = roughPolyline(pts, { roughness: 0, seed: 5 });
  assert.equal(flat.length, 1);
  assert.equal(flat[0], 'M0 0L200 0L200 100');
});

test('흔들림은 선 길이에 비해 작다(끝점이 크게 벗어나지 않음)', () => {
  const [d] = roughPolyline([[0, 0], [300, 0]], { roughness: 2, seed: 9, passes: 1 });
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const ys = nums.filter((_, i) => i % 2 === 1);
  for (const y of ys) assert.ok(Math.abs(y) <= 10, `y=${y}`);
});

test('타원은 두 겹, 빗금은 도형 안에만', () => {
  assert.equal(roughEllipse(50, 50, 40, 30, { seed: 3 }).length, 2);
  const lines = hachureLines([[0, 0], [100, 0], [100, 100], [0, 100]], { gap: 10, roughness: 0, seed: 1 });
  assert.ok(lines.length > 8);
  for (const d of lines) for (const n of d.match(/-?\d+(\.\d+)?/g).map(Number)) assert.ok(n >= -1 && n <= 101, d);
});

test('작은 도형은 덜 흔들린다', () => {
  assert.equal(effectiveRoughness({ type: 'rectangle', width: 200, height: 100, roughness: 2 }), 2);
  assert.ok(effectiveRoughness({ type: 'rectangle', width: 10, height: 8, roughness: 2 }) < 1);
  assert.equal(effectiveRoughness({ type: 'arrow', width: 100, height: 0, roughness: 1 }), 1);
});

test('buildShape: 사각형 채우기 방식별 결과, 화살표 머리, 펜 점 하나', () => {
  const r = { ...newElement('rectangle', 0, 0), width: 120, height: 80, seed: 1 };
  assert.equal(buildShape(r).hatch.length, 0, '채우기 없으면 빗금 없음');
  assert.ok(buildShape({ ...r, backgroundColor: '#a5d8ff' }).hatch.length > 3);
  const cross = buildShape({ ...r, backgroundColor: '#a5d8ff', fillStyle: 'cross-hatch' }).hatch.length;
  assert.ok(cross > buildShape({ ...r, backgroundColor: '#a5d8ff' }).hatch.length);
  assert.equal(buildShape({ ...r, backgroundColor: '#a5d8ff', fillStyle: 'solid' }).fills.length, 1);
  const a = { ...newElement('arrow', 0, 0), points: [[0, 0], [100, 0]], width: 100, height: 0 };
  assert.equal(buildShape(a).strokes.length, 3, '몸통 두 번 + 머리');
  assert.equal(buildShape({ ...a, type: 'line' }).strokes.length, 2);
  const dot = { ...newElement('freedraw', 0, 0), points: [[0, 0, 0.5]] };
  assert.equal(buildShape(dot).dots.length, 1);
});
