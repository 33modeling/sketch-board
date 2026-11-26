// 브라우저 시험(Chromium 하나). playwright 가 없으면 건너뛴다.
// 실행: PLAYWRIGHT=<playwright 모듈 경로> SHOTS=<스크린샷 폴더> npm run test:e2e
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pw = null;
try { pw = await import(process.env.PLAYWRIGHT || 'playwright'); } catch { /* 없음 */ }
const PORT = 5187;
const URL = `http://127.0.0.1:${PORT}/`;

test('브라우저 흐름', { skip: !pw && 'playwright 없음' }, async (t) => {
  const server = spawn(process.execPath, [join(root, 'scripts/serve.mjs'), String(PORT), process.env.SERVE_DIR || root], { stdio: 'pipe' });
  await new Promise((r) => server.stdout.once('data', r));
  const browser = await (pw.chromium || pw.default.chromium).launch();
  const errors = [];
  const S = (page) => page.evaluate(() => { const s = window.__sketch.state; return { n: s.elements.length, sel: s.selected.length, zoom: s.vp.zoom, types: s.elements.map((e) => e.type), groups: s.elements.map((e) => e.groupIds.length), lib: s.library.length, texts: s.elements.filter((e) => e.type === 'text').map((e) => e.text) }; });
  try {
    await t.test('PC: 그리기·고르기·묶기·실행 취소·확대·라이브러리·내보내기·열기', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(URL);
      const drag = async (x1, y1, x2, y2) => { await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 }); await page.mouse.move(x2, y2, { steps: 4 }); await page.mouse.up(); };
      await page.keyboard.press('r'); await drag(400, 200, 560, 300);
      assert.deepEqual(await S(page).then((s) => [s.n, s.sel]), [1, 1]);
      await page.keyboard.press('o'); await drag(620, 200, 760, 320);
      await page.keyboard.press('a'); await drag(560, 250, 620, 260);
      await page.keyboard.press('p'); await drag(400, 400, 600, 460);
      await page.keyboard.press('t'); await page.mouse.click(420, 520);
      await page.keyboard.type('손그림 보드'); await page.keyboard.press('Escape');
      let s = await S(page);
      assert.deepEqual(s.types, ['rectangle', 'ellipse', 'arrow', 'freedraw', 'text']);
      assert.deepEqual(s.texts, ['손그림 보드']);
      // 실행 취소·다시 실행
      await page.keyboard.press('Control+z'); assert.equal((await S(page)).n, 4);
      await page.keyboard.press('Control+Shift+z'); assert.equal((await S(page)).n, 5);
      // 상자로 사각형+원 고르고 묶기 → 하나만 눌러도 둘 다
      await page.keyboard.press('v');
      await drag(380, 180, 780, 340);
      assert.equal((await S(page)).sel, 3);
      await page.keyboard.press('Control+g');
      s = await S(page); assert.deepEqual(s.groups.slice(0, 3), [1, 1, 1]);
      await page.mouse.click(1000, 700); assert.equal((await S(page)).sel, 0);
      await page.mouse.click(400, 250); assert.equal((await S(page)).sel, 3);
      // 옮기기
      const before = await page.evaluate(() => window.__sketch.state.elements[0].x);
      await drag(400, 250, 450, 280);
      const after = await page.evaluate(() => window.__sketch.state.elements[0].x);
      assert.equal(Math.round(after - before), 50);
      // 크기 조절(오른쪽 아래 손잡이)
      const box = await page.evaluate(() => { const s = window.__sketch.state; const r = s.elements[0]; return [r.width]; });
      const h = await page.evaluate(() => { const s = window.__sketch.state; const els = s.elements.filter((e) => s.selected.includes(e.id)); let x2 = -1e9, y2 = -1e9; for (const e of els) { const xs = e.points ? e.points.map((p) => e.x + p[0]) : [e.x + e.width]; const ys = e.points ? e.points.map((p) => e.y + p[1]) : [e.y + e.height]; x2 = Math.max(x2, ...xs); y2 = Math.max(y2, ...ys); } const z = s.vp.zoom; return [(x2 + s.vp.scrollX) * z + 6, (y2 + s.vp.scrollY) * z + 6]; });
      await drag(h[0], h[1], h[0] + 100, h[1] + 50);
      const box2 = await page.evaluate(() => window.__sketch.state.elements[0].width);
      assert.ok(box2 > box[0] * 1.1, `크기 ${box[0]} → ${box2}`);
      // 라이브러리에 넣고 놓기
      await page.click('#props [data-act=addToLibrary]');
      assert.equal((await S(page)).lib, 1);
      await page.click('.lib-put');
      s = await S(page); assert.equal(s.n, 8);
      await page.keyboard.press('Delete'); assert.equal((await S(page)).n, 5);
      // Ctrl+휠 확대
      await page.mouse.move(640, 400);
      await page.keyboard.down('Control'); await page.mouse.wheel(0, -200); await page.keyboard.up('Control');
      assert.ok((await S(page)).zoom > 1.2);
      await page.click('#zoom-label'); assert.equal((await S(page)).zoom, 1);
      // 내보내기
      await page.click('[data-act=menu]'); await page.click('#m-export');
      let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ex-svg')]);
      const svg = await readFile(await dl.path(), 'utf8');
      assert.match(svg, /<svg[^>]+viewBox/); assert.match(svg, /sketch-board-scene/);
      await page.click('[data-act=menu]'); await page.click('#m-export');
      [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ex-png')]);
      const png = await readFile(await dl.path());
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      await page.click('[data-act=menu]');
      [dl] = await Promise.all([page.waitForEvent('download'), page.click('#m-save')]);
      const json = await readFile(await dl.path(), 'utf8');
      assert.equal(JSON.parse(json).elements.length, 5);
      // 새 장면 → JSON 열기, SVG 열기
      page.once('dialog', (d) => d.accept());
      await page.click('[data-act=menu]'); await page.click('#m-new');
      assert.equal((await S(page)).n, 0);
      const dir = await mkdtemp(join(tmpdir(), 'sb-'));
      await writeFile(join(dir, 'a.svg'), svg);
      await page.setInputFiles('#open-file', join(dir, 'a.svg'));
      await page.waitForFunction(() => window.__sketch.state.elements.length === 5);
      await page.screenshot({ path: process.env.SHOTS ? join(process.env.SHOTS, 'desktop.png') : join(dir, 'desktop.png') });
      // 새로고침해도 남아 있음(localStorage)
      await page.waitForTimeout(400);
      await page.reload();
      assert.equal((await S(page)).n, 5);
      assert.equal((await S(page)).lib, 1);
      await ctx.close();
    });

    await t.test('휴대폰: 손가락 그리기·두 손가락 확대·넘침 없음·누름 44px', async () => {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(URL);
      const cdp = await ctx.newCDPSession(page);
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
      await page.tap('[data-tool=rectangle]');
      await touch('touchStart', [[80, 200]]);
      for (let i = 1; i <= 5; i++) await touch('touchMove', [[80 + i * 30, 200 + i * 20]]);
      await touch('touchEnd', []);
      let s = await S(page);
      assert.deepEqual([s.n, s.types[0]], [1, 'rectangle']);
      // 두 손가락 벌리기
      await touch('touchStart', [[150, 400], [210, 400]]);
      for (let i = 1; i <= 5; i++) await touch('touchMove', [[150 - i * 15, 400], [210 + i * 15, 400]]);
      await touch('touchEnd', []);
      s = await S(page);
      assert.ok(s.zoom > 1.8, `zoom ${s.zoom}`);
      assert.equal(s.n, 1, '확대하다 도형이 생기지 않음');
      // 펜 도구로 한 손가락 시작 후 두 번째 손가락 → 그리던 선 취소
      await page.tap('[data-tool=freedraw]');
      await touch('touchStart', [[100, 300]]); await touch('touchMove', [[110, 310]]);
      await touch('touchStart', [[100, 300], [200, 300]]); await touch('touchMove', [[90, 300], [220, 300]]);
      await touch('touchEnd', []);
      assert.equal((await S(page)).n, 1);
      const m = await page.evaluate(() => {
        const bad = [];
        for (const b of document.querySelectorAll('button, label, input[type=checkbox]')) {
          const r = b.getBoundingClientRect();
          if (!r.width || getComputedStyle(b).visibility === 'hidden' || b.closest('[hidden], dialog:not([open])')) continue;
          if (b.matches('input[type=checkbox]')) continue;
          if (r.width < 43.5 || r.height < 43.5) bad.push(`${b.getAttribute('aria-label') || b.textContent.trim()} ${r.width}x${r.height}`);
        }
        return { overflow: document.documentElement.scrollWidth - innerWidth, bad };
      });
      assert.equal(m.overflow, 0);
      assert.deepEqual(m.bad, []);
      await page.tap('[data-act=props]');
      if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, 'mobile.png') });
      const m2 = await page.evaluate(() => { const bad = []; for (const b of document.querySelectorAll('#props button')) { const r = b.getBoundingClientRect(); if (r.width && (r.width < 43.5 || r.height < 43.5)) bad.push(b.textContent.trim() || b.getAttribute('aria-label')); } return { bad, overflow: document.documentElement.scrollWidth - innerWidth }; });
      assert.deepEqual(m2, { bad: [], overflow: 0 });
      await ctx.close();
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.kill();
  }
});
