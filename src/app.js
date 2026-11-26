// 손그림 보드 화면: 캔버스 입력(마우스·펜·터치), 도구, 속성, 라이브러리, 파일
import { drawElement, measureText } from './render.js';
import { elementBounds, commonBounds, topHit, elementsInBox, handlePositions, hitHandle, resizeElements, syncLinearSize } from './geometry.js';
import { selectionForHit, expandToGroups, groupElements, ungroupElements } from './groups.js';
import { History } from './history.js';
import { toScene, toScreen, zoomAt, pinch, fitBounds, clampZoom, ZOOM_STEP } from './viewport.js';
import { newElement, serializeScene, parseScene, DEFAULT_STYLE } from './scene.js';
import { makeItem, mergeItems, instantiate, serializeLibrary, parseLibrary } from './library.js';
import { exportSvg, sceneFromSvg } from './export-svg.js';
import { bringToFront, sendToBack, removeIds, duplicate, moveBy, applyStyle } from './ops.js';
import { FONT_STACK, LINE_HEIGHT } from './shapes.js';

const $ = (s) => document.querySelector(s);
const SCENE_KEY = 'sketch-board:scene';
const LIB_KEY = 'sketch-board:library';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

const canvas = $('#board');
const ctx = canvas.getContext('2d');
const S = {
  elements: [], selected: [], editingGroupId: null, tool: 'select',
  style: { ...DEFAULT_STYLE }, vp: { zoom: 1, scrollX: 0, scrollY: 0 }, bg: '#ffffff',
  library: [], action: null, pointers: new Map(), space: false, lastTap: null,
};
const history = new History();
let dpr = 1, W = 0, H = 0;

// ---------- 저장 ----------
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set(SCENE_KEY, serializeScene(S.elements, { viewBackgroundColor: S.bg })), 300);
}
function commit() {
  if (history.record(S.elements)) persist();
  syncUi();
}
function setElements(els) { S.elements = els; const ids = new Set(els.map((e) => e.id)); S.selected = S.selected.filter((id) => ids.has(id)); }

// ---------- 그리기 ----------
let raf = 0;
const redraw = () => { if (!raf) raf = requestAnimationFrame(render); };
function resize() {
  dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  redraw();
}
const selectedEls = () => { const s = new Set(S.selected); return S.elements.filter((e) => s.has(e.id)); };
const handleRadius = () => 22 / S.vp.zoom / 2;

function render() {
  raf = 0;
  const { zoom, scrollX, scrollY } = S.vp;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * zoom * scrollX, dpr * zoom * scrollY);
  const [vx1, vy1] = toScene(S.vp, 0, 0), [vx2, vy2] = toScene(S.vp, W, H);
  for (const el of S.elements) {
    if (S.action?.kind === 'text' && S.action.id === el.id) continue;
    const [a, b, c, d] = elementBounds(el);
    if (c < vx1 - 50 || a > vx2 + 50 || d < vy1 - 50 || b > vy2 + 50) continue;
    drawElement(ctx, el);
  }
  // 선택 표시
  ctx.lineWidth = 1 / zoom;
  const sel = selectedEls();
  if (sel.length && S.action?.kind !== 'text') {
    ctx.strokeStyle = '#6965db';
    if (sel.length > 1) { ctx.setLineDash([4 / zoom, 3 / zoom]); for (const el of sel) strokeBox(elementBounds(el), 3); ctx.setLineDash([]); }
    const b = commonBounds(sel);
    strokeBox(b, 6);
    const r = 5 / zoom;
    ctx.fillStyle = '#ffffff';
    for (const [x, y] of Object.values(handlePositions(pad(b, 6)))) { ctx.beginPath(); ctx.rect(x - r, y - r, r * 2, r * 2); ctx.fill(); ctx.stroke(); }
  }
  if (S.editingGroupId) {
    const g = S.elements.filter((e) => e.groupIds.includes(S.editingGroupId));
    if (g.length) { ctx.strokeStyle = '#a9a7f0'; ctx.setLineDash([6 / zoom, 4 / zoom]); strokeBox(commonBounds(g), 12); ctx.setLineDash([]); }
  }
  if (S.action?.kind === 'marquee') {
    const { x0, y0, x1, y1 } = S.action;
    ctx.fillStyle = 'rgba(105,101,219,0.08)'; ctx.strokeStyle = '#6965db';
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  }
}
const pad = ([a, b, c, d], p) => { const q = p / S.vp.zoom; return [a - q, b - q, c + q, d + q]; };
function strokeBox(b, p) { const [a, c, d, e] = pad(b, p); ctx.strokeRect(a, c, d - a, e - c); }

// ---------- 입력 ----------
const scenePt = (e) => { const r = canvas.getBoundingClientRect(); return toScene(S.vp, e.clientX - r.left, e.clientY - r.top); };
const screenPt = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

canvas.addEventListener('pointerdown', (e) => {
  if (S.action?.kind === 'text') { finishText(); return; }
  canvas.setPointerCapture?.(e.pointerId);
  S.pointers.set(e.pointerId, screenPt(e));
  if (S.pointers.size === 2) { startPinch(); return; }
  if (S.pointers.size > 2) return;
  const [x, y] = scenePt(e);
  if (e.button === 1 || S.tool === 'hand' || S.space) { S.action = { kind: 'pan', sx: e.clientX, sy: e.clientY, vp: { ...S.vp } }; canvas.classList.add('panning'); return; }
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  S.downAt = { x, y, t: Date.now(), sx: e.clientX, sy: e.clientY };
  if (S.tool === 'select') return selectDown(x, y, e);
  if (S.tool === 'text') { e.preventDefault(); startText(x, y); return; }
  const el = newElement(S.tool, x, y, S.style);
  if (S.tool === 'freedraw') el.points = [[0, 0, e.pointerType === 'pen' ? e.pressure : 0.5]];
  S.elements = [...S.elements, el];
  S.selected = [];
  S.action = { kind: 'draw', id: el.id, x0: x, y0: y, before: null };
  redraw();
});

function selectDown(x, y, e) {
  const sel = selectedEls();
  if (sel.length) {
    const b = pad(commonBounds(sel), 6);
    const h = hitHandle(b, x, y, handleRadius());
    if (h) { S.action = { kind: 'resize', handle: h, bounds: commonBounds(sel), originals: sel.map((el) => structuredClone(el)) }; return; }
  }
  const tol = 10 / S.vp.zoom;
  const hit = topHit(S.elements, x, y, tol);
  if (hit) {
    const ids = selectionForHit(S.elements, hit, S.editingGroupId);
    if (e.shiftKey) {
      const has = ids.every((id) => S.selected.includes(id));
      S.selected = has ? S.selected.filter((id) => !ids.includes(id)) : [...new Set([...S.selected, ...ids])];
    } else if (!ids.every((id) => S.selected.includes(id))) {
      S.selected = ids;
    }
    if (S.editingGroupId && !hit.groupIds.includes(S.editingGroupId)) S.editingGroupId = null;
  } else if (sel.length && inside(commonBounds(sel), x, y)) {
    // 선택 상자 안 빈 곳을 눌러도 옮길 수 있게
  } else {
    if (!e.shiftKey) { S.selected = []; S.editingGroupId = null; }
    S.action = { kind: 'marquee', x0: x, y0: y, x1: x, y1: y, base: [...S.selected] };
    syncUi(); redraw();
    return;
  }
  S.action = { kind: 'move', x0: x, y0: y, base: S.elements, ids: [...S.selected], moved: false };
  syncUi(); redraw();
}
const inside = ([a, b, c, d], x, y) => x >= a && x <= c && y >= b && y <= d;

canvas.addEventListener('pointermove', (e) => {
  if (S.pointers.has(e.pointerId)) S.pointers.set(e.pointerId, screenPt(e));
  const A = S.action;
  if (!A) { hover(e); return; }
  if (A.kind === 'pinch') {
    const pts = [...S.pointers.values()];
    if (pts.length >= 2) { S.vp = pinch(A.vp, A.pts, [pts[0], pts[1]]); redraw(); syncZoom(); }
    return;
  }
  if (A.kind === 'pan') {
    S.vp = { ...A.vp, scrollX: A.vp.scrollX + (e.clientX - A.sx) / S.vp.zoom, scrollY: A.vp.scrollY + (e.clientY - A.sy) / S.vp.zoom };
    redraw(); return;
  }
  const [x, y] = scenePt(e);
  if (A.kind === 'draw') return drawMove(A, x, y, e);
  if (A.kind === 'move') {
    let dx = x - A.x0, dy = y - A.y0;
    if (!A.moved && Math.hypot(dx, dy) * S.vp.zoom < 3) return;
    A.moved = true;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    S.elements = moveBy(A.base, A.ids, dx, dy);
    redraw(); return;
  }
  if (A.kind === 'resize') {
    const next = resizeElements(A.originals, A.bounds, A.handle, x, y, { keepRatio: e.shiftKey });
    const m = new Map(next.map((el) => [el.id, el]));
    S.elements = S.elements.map((el) => m.get(el.id) || el);
    redraw(); return;
  }
  if (A.kind === 'marquee') {
    A.x1 = x; A.y1 = y;
    const ids = elementsInBox(S.elements, [A.x0, A.y0, x, y]).map((el) => el.id);
    S.selected = expandToGroups(S.elements, [...new Set([...A.base, ...ids])], S.editingGroupId);
    redraw();
  }
});

function drawMove(A, x, y, e) {
  const idx = S.elements.findIndex((el) => el.id === A.id);
  if (idx < 0) return;
  const el = { ...S.elements[idx], version: S.elements[idx].version + 1 };
  if (el.type === 'freedraw') {
    const last = el.points[el.points.length - 1];
    const px = x - el.x, py = y - el.y;
    if (Math.hypot(px - last[0], py - last[1]) * S.vp.zoom < 1.5) return;
    el.points = [...el.points, [px, py, e.pointerType === 'pen' ? e.pressure : 0.5]];
    Object.assign(el, syncLinearSize(el));
  } else if (el.type === 'line' || el.type === 'arrow') {
    let dx = x - A.x0, dy = y - A.y0;
    if (e.shiftKey) { const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12), l = Math.hypot(dx, dy); dx = Math.cos(a) * l; dy = Math.sin(a) * l; }
    el.points = [[0, 0], [dx, dy]];
    Object.assign(el, syncLinearSize(el));
  } else {
    let w = x - A.x0, h = y - A.y0;
    if (e.shiftKey) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
    el.x = Math.min(A.x0, A.x0 + w); el.y = Math.min(A.y0, A.y0 + h); el.width = Math.abs(w); el.height = Math.abs(h);
  }
  const next = S.elements.slice(); next[idx] = el; S.elements = next;
  redraw();
}

function endPointer(e) {
  const wasPinch = S.action?.kind === 'pinch';
  S.pointers.delete(e.pointerId);
  if (wasPinch) { if (S.pointers.size === 0) { S.action = null; } return; }
  const A = S.action;
  if (!A || A.kind === 'text') return;
  S.action = null;
  canvas.classList.remove('panning');
  if (A.kind === 'draw') {
    const el = S.elements.find((x) => x.id === A.id);
    const tiny = el && el.type !== 'freedraw' && Math.max(el.width, el.height) * S.vp.zoom < 4;
    if (!el || tiny) { S.elements = removeIds(S.elements, [A.id]); redraw(); return; }
    if (S.tool !== 'freedraw' && !S.toolLock) { setTool('select'); S.selected = [el.id]; }
    commit(); redraw(); return;
  }
  if (A.kind === 'move' && !A.moved) {
    checkDoubleTap(e);
    return;
  }
  if (A.kind === 'marquee' && Math.hypot(A.x1 - A.x0, A.y1 - A.y0) * S.vp.zoom < 3) checkDoubleTap(e);
  if (A.kind === 'move' || A.kind === 'resize') commit();
  syncUi(); redraw();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', (e) => { endPointer(e); });

// 두 번 누르기: 글자 고치기, 묶음 안으로 들어가기, 빈 곳이면 새 글자
function checkDoubleTap(e) {
  const now = Date.now();
  const [x, y] = scenePt(e);
  const prev = S.lastTap;
  S.lastTap = { t: now, cx: e.clientX, cy: e.clientY };
  if (!prev || now - prev.t > 350 || Math.hypot(e.clientX - prev.cx, e.clientY - prev.cy) > 24) return;
  S.lastTap = null;
  const hit = topHit(S.elements, x, y, 10 / S.vp.zoom);
  if (hit?.type === 'text') { editText(hit); return; }
  if (hit && hit.groupIds.length) {
    const g = hit.groupIds;
    const cur = S.editingGroupId && g.includes(S.editingGroupId) ? g.indexOf(S.editingGroupId) : g.length;
    if (cur > 0) { S.editingGroupId = g[cur - 1]; S.selected = selectionForHit(S.elements, hit, S.editingGroupId); }
    syncUi(); redraw(); return;
  }
  if (!hit) startText(x, y);
}

function startPinch() {
  const A = S.action;
  // 한 손가락으로 막 시작한 일은 취소하고 두 손가락 확대로 바꾼다
  if (A?.kind === 'draw') S.elements = removeIds(S.elements, [A.id]);
  if (A?.kind === 'move') S.elements = A.base;
  if (A?.kind === 'resize') { const m = new Map(A.originals.map((el) => [el.id, el])); S.elements = S.elements.map((el) => m.get(el.id) || el); }
  if (A?.kind === 'marquee') S.selected = A.base;
  const pts = [...S.pointers.values()];
  S.action = { kind: 'pinch', vp: { ...S.vp }, pts: [pts[0], pts[1]] };
  redraw();
}

function hover(e) {
  if (S.tool !== 'select' || e.pointerType !== 'mouse') return;
  const [x, y] = scenePt(e);
  const sel = selectedEls();
  let cursor = '';
  if (sel.length) {
    const h = hitHandle(pad(commonBounds(sel), 6), x, y, handleRadius());
    if (h) cursor = ({ n: 'ns', s: 'ns', e: 'ew', w: 'ew', nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw' })[h] + '-resize';
  }
  if (!cursor && topHit(S.elements, x, y, 10 / S.vp.zoom)) cursor = 'move';
  canvas.style.cursor = cursor;
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [sx, sy] = screenPt(e);
  if (e.ctrlKey || e.metaKey) {
    const factor = Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.01);
    S.vp = zoomAt(S.vp, S.vp.zoom * factor, sx, sy);
    syncZoom();
  } else {
    const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX, dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
    S.vp = { ...S.vp, scrollX: S.vp.scrollX - dx / S.vp.zoom, scrollY: S.vp.scrollY - dy / S.vp.zoom };
  }
  redraw();
}, { passive: false });
// 사파리 트랙패드 확대 몸짓이 페이지 확대가 되지 않게
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault());

// ---------- 글자 ----------
const textarea = $('#text-editor');
function startText(x, y) {
  const el = newElement('text', x, y - S.style.fontSize * 0.6, S.style);
  S.elements = [...S.elements, el];
  editText(el, true);
}
function editText(el, isNew = false) {
  S.selected = [el.id];
  S.action = { kind: 'text', id: el.id, isNew };
  const [sx, sy] = toScreen(S.vp, el.x, el.y);
  Object.assign(textarea.style, {
    display: 'block', left: sx + 'px', top: sy + 'px',
    fontSize: el.fontSize * S.vp.zoom + 'px', lineHeight: String(LINE_HEIGHT), fontFamily: FONT_STACK, color: el.strokeColor,
  });
  textarea.value = el.text || '';
  fitTextarea();
  textarea.focus();
  setTimeout(() => textarea.focus(), 0);
  redraw();
}
function fitTextarea() {
  textarea.style.width = '1px'; textarea.style.height = '1px';
  textarea.style.width = Math.min(textarea.scrollWidth + 24, W - parseFloat(textarea.style.left) - 4) + 'px';
  textarea.style.height = textarea.scrollHeight + 'px';
}
textarea.addEventListener('input', fitTextarea);
textarea.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) { e.preventDefault(); finishText(); }
  e.stopPropagation();
});
textarea.addEventListener('blur', () => finishText());
function finishText() {
  const A = S.action;
  if (A?.kind !== 'text') return;
  S.action = null;
  textarea.style.display = 'none';
  if (document.activeElement === textarea) textarea.blur();
  canvas.focus({ preventScroll: true });
  const text = textarea.value.replace(/\s+$/, '');
  const idx = S.elements.findIndex((e) => e.id === A.id);
  if (idx >= 0) {
    if (!text.trim()) { S.elements = removeIds(S.elements, [A.id]); S.selected = []; }
    else {
      const el = { ...S.elements[idx], text, version: S.elements[idx].version + 1 };
      Object.assign(el, measureText(ctx, el));
      const next = S.elements.slice(); next[idx] = el; S.elements = next;
    }
  }
  if (!S.toolLock) setTool('select');
  commit(); redraw();
}

// ---------- 도구·속성 ----------
function setTool(t) {
  S.tool = t;
  for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  canvas.dataset.tool = t;
  if (t !== 'select') { S.selected = []; S.editingGroupId = null; }
  syncUi(); redraw();
}
document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
$('#tool-lock').addEventListener('click', (e) => { S.toolLock = !S.toolLock; e.currentTarget.setAttribute('aria-pressed', String(!!S.toolLock)); });

const measure = (el) => measureText(ctx, el);
document.querySelectorAll('[data-prop]').forEach((b) => b.addEventListener('click', () => {
  const key = b.dataset.prop;
  const raw = b.dataset.value;
  const value = ['strokeWidth', 'roughness', 'opacity', 'fontSize'].includes(key) ? Number(raw) : raw;
  S.style[key] = value;
  if (S.selected.length) { S.elements = applyStyle(S.elements, S.selected, key, value, measure); commit(); }
  syncUi(); redraw();
}));

const act = {
  undo() { const els = history.undo(); if (els) { setElements(els); persist(); } syncUi(); redraw(); },
  redo() { const els = history.redo(); if (els) { setElements(els); persist(); } syncUi(); redraw(); },
  delete() { if (!S.selected.length) return; S.elements = removeIds(S.elements, S.selected); S.selected = []; commit(); redraw(); },
  duplicate() { if (!S.selected.length) return; const r = duplicate(S.elements, S.selected); S.elements = r.elements; S.selected = r.ids; commit(); redraw(); },
  group() { const r = groupElements(S.elements, S.selected, S.editingGroupId); if (r.groupId) { S.elements = r.elements; commit(); toast('묶었어요'); } redraw(); },
  ungroup() { const r = ungroupElements(S.elements, S.selected, S.editingGroupId); if (r.removed.length) { S.elements = r.elements; commit(); toast('묶음을 풀었어요'); } redraw(); },
  front() { S.elements = bringToFront(S.elements, S.selected); commit(); redraw(); },
  back() { S.elements = sendToBack(S.elements, S.selected); commit(); redraw(); },
  selectAll() { setTool('select'); S.selected = S.elements.map((e) => e.id); S.editingGroupId = null; syncUi(); redraw(); },
  zoomIn() { S.vp = zoomAt(S.vp, S.vp.zoom + ZOOM_STEP, W / 2, H / 2); syncZoom(); redraw(); },
  zoomOut() { S.vp = zoomAt(S.vp, S.vp.zoom - ZOOM_STEP, W / 2, H / 2); syncZoom(); redraw(); },
  zoomReset() { S.vp = zoomAt(S.vp, 1, W / 2, H / 2); syncZoom(); redraw(); },
  fit() { S.vp = fitBounds(commonBounds(S.selected.length ? selectedEls() : S.elements), W, H); syncZoom(); redraw(); },
  addToLibrary() { if (!S.selected.length) return toast('먼저 도형을 고르세요'); addLibrary([makeItem(selectedEls())]); },
  library() { togglePanel('#library', true); },
  props() { togglePanel('#props'); },
  menu() { $('#menu').showModal(); },
};
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act[b.dataset.act]()));

function togglePanel(sel, force) {
  const p = $(sel);
  const open = force ?? p.hidden;
  p.hidden = !open;
  document.querySelectorAll(`[aria-controls="${sel.slice(1)}"]`).forEach((b) => b.setAttribute('aria-expanded', String(open)));
}
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => togglePanel('#' + b.dataset.close, false)));

function syncZoom() { $('#zoom-label').textContent = Math.round(S.vp.zoom * 100) + '%'; }
function syncUi() {
  $('[data-act=undo]').disabled = !history.canUndo;
  $('[data-act=redo]').disabled = !history.canRedo;
  const sel = selectedEls();
  const has = sel.length > 0;
  for (const b of document.querySelectorAll('.needs-sel')) b.disabled = !has;
  $('[data-act=group]').disabled = sel.length < 2;
  $('[data-act=ungroup]').disabled = !sel.some((e) => e.groupIds.length);
  // 속성 단추는 고른 요소(없으면 지금 스타일) 값을 눌린 상태로
  const ref = sel[0] || S.style;
  for (const b of document.querySelectorAll('[data-prop]')) {
    const v = ref[b.dataset.prop] ?? S.style[b.dataset.prop];
    b.setAttribute('aria-pressed', String(String(v) === b.dataset.value));
  }
  $('#font-row').hidden = !(S.tool === 'text' || sel.some((e) => e.type === 'text'));
  $('#sel-count').textContent = has ? `${sel.length}개 고름${S.editingGroupId ? ' · 묶음 안' : ''}` : '';
  syncZoom();
}

// ---------- 키보드 ----------
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input,textarea,dialog')) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (e.key === ' ' && !S.space) { S.space = true; canvas.classList.add('pan-ready'); e.preventDefault(); return; }
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? act.redo() : act.undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); act.redo(); return; }
  if (mod && k === 'g') { e.preventDefault(); e.shiftKey ? act.ungroup() : act.group(); return; }
  if (mod && k === 'd') { e.preventDefault(); act.duplicate(); return; }
  if (mod && k === 'a') { e.preventDefault(); act.selectAll(); return; }
  if (mod && k === 's') { e.preventDefault(); saveJson(); return; }
  if (mod && k === 'o') { e.preventDefault(); $('#open-file').click(); return; }
  if (mod && (k === '=' || k === '+')) { e.preventDefault(); act.zoomIn(); return; }
  if (mod && k === '-') { e.preventDefault(); act.zoomOut(); return; }
  if (mod && k === '0') { e.preventDefault(); act.zoomReset(); return; }
  if (mod) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); act.delete(); return; }
  if (e.key === 'Escape') { if (S.editingGroupId) S.editingGroupId = null; else S.selected = []; setTool('select'); return; }
  if (e.key === 'Enter' && S.selected.length === 1) { const el = selectedEls()[0]; if (el.type === 'text') { e.preventDefault(); editText(el); } return; }
  if (e.key.startsWith('Arrow') && S.selected.length) {
    e.preventDefault();
    const d = e.shiftKey ? 10 : 1;
    const [dx, dy] = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
    S.elements = moveBy(S.elements, S.selected, dx, dy); commit(); redraw(); return;
  }
  const tools = { v: 'select', 1: 'select', h: 'hand', r: 'rectangle', 2: 'rectangle', d: 'diamond', 3: 'diamond', o: 'ellipse', 4: 'ellipse', a: 'arrow', 5: 'arrow', l: 'line', 6: 'line', p: 'freedraw', 7: 'freedraw', t: 'text', 8: 'text' };
  if (tools[k]) setTool(tools[k]);
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') { S.space = false; canvas.classList.remove('pan-ready'); } });

// ---------- 라이브러리 ----------
function loadLibrary() {
  try { const d = JSON.parse(store.get(LIB_KEY) || '[]'); S.library = Array.isArray(d) ? d.filter((i) => Array.isArray(i?.elements)) : []; } catch { S.library = []; }
}
function saveLibrary() { if (!store.set(LIB_KEY, JSON.stringify(S.library))) toast('이 브라우저에는 라이브러리를 저장할 수 없어요'); }
function addLibrary(items) {
  const r = mergeItems(S.library, items);
  S.library = r.items; saveLibrary(); renderLibrary();
  toast(r.added ? `라이브러리에 ${r.added}개 넣었어요` : '이미 라이브러리에 있어요');
  togglePanel('#library', true);
}
function renderLibrary() {
  const box = $('#lib-items');
  box.textContent = '';
  $('#lib-empty').hidden = S.library.length > 0;
  for (const item of S.library) {
    const cell = document.createElement('div');
    cell.className = 'lib-item';
    const put = document.createElement('button');
    put.className = 'lib-put';
    put.setAttribute('aria-label', '장면에 놓기');
    put.innerHTML = exportSvg(item.elements, { background: null, padding: 4 });
    put.addEventListener('click', () => {
      const [cx, cy] = toScene(S.vp, W / 2, H / 2);
      const els = instantiate(item, cx, cy);
      S.elements = [...S.elements, ...els];
      setTool('select');
      S.selected = els.map((e) => e.id);
      commit(); redraw();
      if (matchMedia('(max-width: 720px)').matches) togglePanel('#library', false);
    });
    const del = document.createElement('button');
    del.className = 'lib-del'; del.textContent = '×'; del.setAttribute('aria-label', '라이브러리에서 지우기');
    del.addEventListener('click', () => { S.library = S.library.filter((i) => i.id !== item.id); saveLibrary(); renderLibrary(); });
    cell.append(put, del);
    box.append(cell);
  }
}
$('#lib-export').addEventListener('click', () => { if (!S.library.length) return toast('라이브러리가 비어 있어요'); download(new Blob([serializeLibrary(S.library)], { type: 'application/json' }), 'sketch-board-library.json'); });
$('#lib-import').addEventListener('click', () => $('#lib-file').click());
$('#lib-file').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { addLibrary(parseLibrary(await f.text())); } catch (err) { toast(err.message); }
});

// ---------- 파일 ----------
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
function saveJson() { download(new Blob([serializeScene(S.elements, { viewBackgroundColor: S.bg })], { type: 'application/json' }), `손그림-${stamp()}.json`); toast('장면을 저장했어요'); }
function loadScene(text) {
  const svgScene = text.trimStart().startsWith('<') ? sceneFromSvg(text) : null;
  if (text.trimStart().startsWith('<') && !svgScene) throw new Error('이 SVG 에는 장면 정보가 없어요');
  const r = parseScene(svgScene || text);
  S.elements = r.elements; S.bg = r.appState.viewBackgroundColor; S.selected = []; S.editingGroupId = null;
  history.reset(S.elements); persist();
  act.fit(); syncUi();
  toast(`${r.elements.length}개 도형을 열었어요${r.from === 'excalidraw' ? ' (Excalidraw 파일)' : ''}`);
}
$('#open-file').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  $('#menu').close();
  try { loadScene(await f.text()); } catch (err) { toast(err.message); }
});
$('#m-open').addEventListener('click', () => $('#open-file').click());
$('#m-save').addEventListener('click', () => { $('#menu').close(); saveJson(); });
$('#m-new').addEventListener('click', () => {
  $('#menu').close();
  if (S.elements.length && !confirm('지금 장면을 지우고 새로 시작할까요? (실행 취소로 되돌릴 수 있어요)')) return;
  S.elements = []; S.selected = []; S.editingGroupId = null; commit(); redraw();
});
$('#m-export').addEventListener('click', () => { $('#menu').close(); $('#ex-selected').disabled = !S.selected.length; $('#ex-selected').checked = false; $('#export').showModal(); });
document.querySelectorAll('[data-bg]').forEach((b) => b.addEventListener('click', () => { S.bg = b.dataset.bg; persist(); redraw(); syncBg(); }));
function syncBg() { document.querySelectorAll('[data-bg]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.bg === S.bg))); }
document.querySelectorAll('dialog [data-dismiss]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

function exportTargets() {
  const els = $('#ex-selected').checked && S.selected.length ? selectedEls() : S.elements;
  return { els, bg: $('#ex-bg').checked ? S.bg : null };
}
$('#ex-png').addEventListener('click', () => {
  const { els, bg } = exportTargets();
  if (!els.length) return toast('내보낼 도형이 없어요');
  const scale = Number(document.querySelector('[name=ex-scale]:checked').value);
  const b = commonBounds(els), p = 20;
  const w = b[2] - b[0] + p * 2, h = b[3] - b[1] + p * 2;
  const max = 16384 / scale;
  if (w > max || h > max) return toast('그림이 너무 커서 PNG 로 만들 수 없어요. 배율을 낮춰 보세요');
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
  const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); }
  x.setTransform(scale, 0, 0, scale, (p - b[0]) * scale, (p - b[1]) * scale);
  for (const el of els) drawElement(x, el);
  c.toBlob((blob) => { if (blob) { download(blob, `손그림-${stamp()}.png`); toast('PNG 를 저장했어요'); } else toast('PNG 를 만들지 못했어요'); }, 'image/png');
  $('#export').close();
});
$('#ex-svg').addEventListener('click', () => {
  const { els, bg } = exportTargets();
  if (!els.length) return toast('내보낼 도형이 없어요');
  const json = $('#ex-embed').checked ? serializeScene(els, { viewBackgroundColor: S.bg }) : null;
  download(new Blob([exportSvg(els, { background: bg, padding: 20, sceneJson: json })], { type: 'image/svg+xml' }), `손그림-${stamp()}.svg`);
  toast('SVG 를 저장했어요');
  $('#export').close();
});

// 파일을 끌어 놓아 열기
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  try { const t = await f.text(); if (/"excalidrawlib"|"sketch-board-library"/.test(t.slice(0, 200))) addLibrary(parseLibrary(t)); else loadScene(t); } catch (err) { toast(err.message); }
});

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---------- 시작 ----------
function boot() {
  const saved = store.get(SCENE_KEY);
  if (saved) { try { const r = parseScene(saved); S.elements = r.elements; S.bg = r.appState.viewBackgroundColor; } catch { /* 망가진 저장본은 무시 */ } }
  history.reset(S.elements);
  loadLibrary(); renderLibrary();
  if (matchMedia('(max-width: 720px)').matches) togglePanel('#props', false);
  resize(); setTool('select'); syncBg();
  if (S.elements.length) act.fit();
  window.addEventListener('resize', resize);
  // 시험용 손잡이(화면 조작 시험에서 상태 확인)
  window.__sketch = { get state() { return S; }, history };
}
boot();
