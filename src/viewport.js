// 확대·이동. 화면 좌표 = (장면 좌표 + scroll) × zoom.
export const MIN_ZOOM = 0.1, MAX_ZOOM = 30, ZOOM_STEP = 0.1;
export const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 1e6) / 1e6));
export const toScene = (vp, sx, sy) => [sx / vp.zoom - vp.scrollX, sy / vp.zoom - vp.scrollY];
export const toScreen = (vp, x, y) => [(x + vp.scrollX) * vp.zoom, (y + vp.scrollY) * vp.zoom];

// 화면의 (sx,sy) 아래 장면 점이 그대로 있도록 확대
export function zoomAt(vp, nextZoom, sx, sy) {
  const zoom = clampZoom(nextZoom);
  const [x, y] = toScene(vp, sx, sy);
  return { zoom, scrollX: sx / zoom - x, scrollY: sy / zoom - y };
}

// 두 손가락: 처음 상태(start)·처음 두 점·지금 두 점으로 새 화면 상태
export function pinch(start, [a0, b0], [a1, b1]) {
  const d0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) || 1;
  const d1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]) || 1;
  const c0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
  const c1 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
  const zoom = clampZoom(start.zoom * (d1 / d0));
  const [x, y] = toScene(start, c0[0], c0[1]);
  return { zoom, scrollX: c1[0] / zoom - x, scrollY: c1[1] / zoom - y };
}

// 장면 상자가 화면(w×h)에 다 들어오게
export function fitBounds(bounds, w, h, pad = 40, maxZoom = 2) {
  if (!bounds) return { zoom: 1, scrollX: 0, scrollY: 0 };
  const [x1, y1, x2, y2] = bounds;
  const bw = Math.max(x2 - x1, 1), bh = Math.max(y2 - y1, 1);
  const zoom = clampZoom(Math.min((w - pad * 2) / bw, (h - pad * 2) / bh, maxZoom));
  return { zoom, scrollX: w / 2 / zoom - (x1 + bw / 2), scrollY: h / 2 / zoom - (y1 + bh / 2) };
}
