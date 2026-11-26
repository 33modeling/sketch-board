// 묶기. 요소마다 groupIds 를 안쪽 묶음부터 바깥 묶음 순서로 둔다.
// 누르면 가장 바깥 묶음이 통째로 골라지고, 두 번 누르면(묶음 안으로 들어가기) 한 단계 안쪽이 골라진다.
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function elementsInGroup(elements, gid) {
  return elements.filter((el) => el.groupIds?.includes(gid));
}

// 눌린 요소 하나에서 실제로 고를 id 목록
export function selectionForHit(elements, el, editingGroupId = null) {
  const g = el.groupIds || [];
  if (!g.length) return [el.id];
  let target;
  if (editingGroupId && g.includes(editingGroupId)) {
    const idx = g.indexOf(editingGroupId);
    target = idx > 0 ? g[idx - 1] : null;
  } else {
    target = g[g.length - 1];
  }
  if (!target) return [el.id];
  return elementsInGroup(elements, target).map((e) => e.id);
}

// 골라진 id 를 묶음 단위로 넓힌다(사각형 끌어 고르기 등)
export function expandToGroups(elements, ids, editingGroupId = null) {
  const set = new Set(ids);
  for (const el of elements) {
    if (!set.has(el.id)) continue;
    for (const id of selectionForHit(elements, el, editingGroupId)) set.add(id);
  }
  return elements.filter((e) => set.has(e.id)).map((e) => e.id);
}

export function groupElements(elements, ids, editingGroupId = null) {
  if (ids.length < 2) return { elements, groupId: null };
  const gid = newId();
  const set = new Set(ids);
  const next = elements.map((el) => {
    if (!set.has(el.id)) return el;
    const g = [...(el.groupIds || [])];
    const at = editingGroupId ? g.indexOf(editingGroupId) : -1;
    if (at >= 0) g.splice(at, 0, gid); else g.push(gid);
    return { ...el, groupIds: g, version: (el.version || 0) + 1 };
  });
  // 묶은 요소들은 순서상 서로 붙여 둔다(맨 위 요소 자리로)
  const picked = next.filter((e) => set.has(e.id));
  const lastIdx = next.reduce((m, e, i) => (set.has(e.id) ? i : m), -1);
  const rest = next.filter((e) => !set.has(e.id));
  const insertAt = next.slice(0, lastIdx + 1).filter((e) => !set.has(e.id)).length;
  rest.splice(insertAt, 0, ...picked);
  return { elements: rest, groupId: gid };
}

// 고른 요소들의 가장 바깥 공통 묶음을 푼다
export function ungroupElements(elements, ids, editingGroupId = null) {
  const set = new Set(ids);
  const remove = new Set();
  for (const el of elements) {
    if (!set.has(el.id)) continue;
    const g = el.groupIds || [];
    const top = editingGroupId && g.includes(editingGroupId) ? g[g.indexOf(editingGroupId) - 1] : g[g.length - 1];
    if (top && elementsInGroup(elements, top).every((e) => set.has(e.id))) remove.add(top);
  }
  if (!remove.size) return { elements, removed: [] };
  return {
    elements: elements.map((el) => (el.groupIds?.some((g) => remove.has(g)) ? { ...el, groupIds: el.groupIds.filter((g) => !remove.has(g)), version: (el.version || 0) + 1 } : el)),
    removed: [...remove],
  };
}
