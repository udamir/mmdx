// Mermaid Studio — animated tour of the basic features.
//
// Drives the real studio (npm run dev) in a visible browser with a fake cursor, click ripples and captions, and
// records the run to a .webm video:
//   1. a small plain Mermaid diagram, no styles
//   2. styling it in the visual editor: Properties shown once, then the floating toolbar and the page badge only — the Mermaid text stays clean
//   3. changing the content visually (drop a shape, connect it) and in the code
//   4. the same diagram after N more iterations (fast-forward)
//   5. History: stepping through the versions to see the evolution
//   6. Diff: merged / before / after / side by side, filters, change list, code diff
//
// Usage (with `pnpm dev` running; once: `pnpm exec playwright install chromium`):
//   pnpm tour [--url http://localhost:8790/] [--headless] [--speed 1] [--video out-dir] [--shots out-dir] [--iterations 5]
// --speed scales the pauses (0.5 is twice as fast), --shots saves a screenshot at the end of every captioned step.
// See "Feature tour" in docs/guide/contributing.md.
import { chromium } from 'playwright';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? def : (process.argv[i + 1] ?? true);
};
const URL = arg('url', 'http://localhost:8790/');
const HEADLESS = process.argv.includes('--headless');
let SPEED = Number(arg('speed', 1));
const VIDEO = arg('video', null);
const ITERATIONS = Math.min(5, Number(arg('iterations', 5)));
const W = 1440, H = 900, STRIP = 64; // the app keeps 1440×900; the caption strip sits below it

// ---- overlay: cursor, click ripple, caption ----------------------------------------------------------------------
const OVERLAY = (STRIP) => {
  const install = () => {
    if (document.getElementById('tour-overlay')) return;
    const root = document.createElement('div');
    root.id = 'tour-overlay';
    root.innerHTML = `
      <style>
        #tour-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font: 14px/1.4 -apple-system, system-ui, sans-serif; }
        #tour-cursor { position: absolute; left: 0; top: 0; width: 22px; height: 22px; transform: translate(-200px, -200px); transition: none; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
        .tour-ripple { position: absolute; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; border: 3px solid #6d5dfc; animation: tour-r .55s ease-out forwards; }
        @keyframes tour-r { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }
        mmdx-studio { height: calc(100% - ${STRIP}px) !important; }
        #tour-cap { position: absolute; left: 0; right: 0; bottom: 0; height: ${STRIP}px; box-sizing: border-box; background: #111328; color: #fff; padding: 11px 24px; display: flex; flex-direction: column; justify-content: center; }
        #tour-cap > * { transition: opacity .25s; } #tour-cap:not(.on) > * { opacity: 0; }
        #tour-cap .ch { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #a8a2ff; margin-bottom: 2px; }
        #tour-cap .tx { font-size: 16px; }
        #tour-ff { position: absolute; right: 24px; bottom: 18px; background: #6d5dfc; color: #fff; border-radius: 999px; padding: 4px 12px; font-weight: 600; display: none; }
        #tour-title { position: absolute; inset: 0; display: none; place-items: center; background: rgba(10,12,30,.82); color: #fff; text-align: center; }
        #tour-title h1 { font-size: 40px; margin: 0 0 8px; } #tour-title p { font-size: 18px; color: #c9c6ff; margin: 0; }
      </style>
      <svg id="tour-cursor" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.4 L10.1 13 L16 13 Z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>
      <div id="tour-cap"><div class="ch"></div><div class="tx"></div></div>
      <div id="tour-ff">⏩ fast-forward</div>
      <div id="tour-title"><div><h1></h1><p></p></div></div>`;
    document.documentElement.appendChild(root);
    const cur = root.querySelector('#tour-cursor');
    window.addEventListener('mousemove', (e) => { cur.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`; }, true);
    window.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.className = 'tour-ripple';
      r.style.left = `${e.clientX}px`; r.style.top = `${e.clientY}px`;
      root.appendChild(r);
      setTimeout(() => r.remove(), 600);
    }, true);
    window.__tour = {
      caption(ch, tx) {
        const c = root.querySelector('#tour-cap');
        if (!tx) { c.classList.remove('on'); return; }
        c.querySelector('.ch').textContent = ch; c.querySelector('.tx').textContent = tx; c.classList.add('on');
      },
      ff(on) { root.querySelector('#tour-ff').style.display = on ? 'block' : 'none'; },
      title(h, p) {
        const t = root.querySelector('#tour-title');
        t.style.display = h ? 'grid' : 'none';
        if (h) { t.querySelector('h1').textContent = h; t.querySelector('p').textContent = p ?? ''; }
      },
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
};

// ---- driver helpers ------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ headless: HEADLESS, args: [`--window-size=${W},${H + STRIP + 90}`] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H + STRIP },
  bypassCSP: true,
  ...(VIDEO ? { recordVideo: { dir: VIDEO, size: { width: W, height: H + STRIP } } } : {}),
});
await ctx.addInitScript(OVERLAY, STRIP);
const p = await ctx.newPage();
const S = p.locator('mmdx-studio');
let mouse = { x: W / 2, y: H / 2 };

const wait = (ms) => p.waitForTimeout(ms * SPEED);
const SHOTS = arg('shots', null);
let shot = 0;
// with --shots <dir>: a screenshot of the end of every captioned step, to review the run without the video
async function caption(ch, tx) {
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/${String(++shot).padStart(2, '0')}.png` });
  await p.evaluate(([a, b]) => window.__tour.caption(a, b), [ch, tx ?? null]);
}
const fastForward = (on) => p.evaluate((v) => window.__tour.ff(v), on);
const title = (h, sub) => p.evaluate(([a, b]) => window.__tour.title(a, b), [h ?? null, sub ?? null]);

async function moveTo(x, y) {
  const d = Math.hypot(x - mouse.x, y - mouse.y);
  const steps = Math.max(8, Math.round(d / (14 / SPEED)));
  await p.mouse.move(x, y, { steps });
  mouse = { x, y };
}
async function center(loc) {
  await loc.waitFor({ state: 'visible', timeout: 10000 }).catch(async (e) => {
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/fail.png` });
    throw e;
  });
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function click(loc, { pause = 350 } = {}) {
  const c = await center(loc);
  await moveTo(c.x, c.y);
  await wait(pause);
  await p.mouse.click(c.x, c.y);
  await wait(250);
}
async function drag(from, to) {
  await moveTo(from.x, from.y);
  await wait(250);
  await p.mouse.down();
  await moveTo((from.x + to.x) / 2, (from.y + to.y) / 2 - 20);
  await moveTo(to.x, to.y);
  await wait(200);
  await p.mouse.up();
  await wait(400);
}
const btn = (f) => S.locator(`[data-f="${f}"]`).first();
const node = (id) => S.locator(`g.el[data-kind="node"][data-id="${id}"]`).first();
const code = () => p.getByRole('textbox', { name: 'Mermaid code' });
const source = () => code().inputValue();
async function typeSlow(text, delay = 45) {
  await p.keyboard.type(text, { delay: delay * SPEED });
}
async function fit() {
  await click(btn('fit'), { pause: 150 });
  await wait(500);
}
async function deselect() {
  // an empty spot of the canvas, clear of the panels and the floating toolbars
  await moveTo(760, 780);
  await p.mouse.click(760, 780);
  await wait(250);
}
// select one node: from a clean selection, so the floating toolbar of the previous one does not cover it
async function select(id) {
  if (await S.locator('button.mtb-btn[title="Style presets"]:visible').count()) await deselect();
  await click(node(id));
}
// a style preset from the floating toolbar's Style presets popover (no Properties panel)
async function preset(id, name) {
  await select(id);
  await wait(300);
  await click(S.locator('button.mtb-btn[title="Style presets"]'));
  await click(S.locator(`button.pp-item[title='Style preset "${name}"']:visible`));
  await wait(300);
  await p.keyboard.press('Escape');
  await wait(300);
}
// page settings from the page badge's toolbar: `button` is the toolbar button's title start, `item` the option
async function pageSetting(button, item) {
  await deselect();
  await click(S.locator('.page-badge'));
  await click(S.locator(`button.mtb-btn[title^="${button}"]:visible`));
  await click(S.locator('button.mtb-item:visible', { hasText: item }));
  await wait(400);
  await p.keyboard.press('Escape');
  await wait(600);
}
// shapes without colour presets (cylinders, stadiums, hexagons): the floating toolbar's fill swatches
async function fill(id, swatch, { bold = false } = {}) {
  await select(id);
  await wait(300);
  if (bold) await click(S.locator('button.mtb-btn[title="Bold"]'));
  await click(S.locator('button.mtb-btn[title="Fill colour"]'));
  await click(S.locator(`button.mtb-sw[title="${swatch}"]`));
  await p.keyboard.press('Escape');
  await wait(300);
}
async function clearCodeFilter() {
  const x = S.locator('[aria-label="Clear filter (Esc)"]:visible').first();
  if (await x.count()) await click(x, { pause: 150 });
}
async function appendCode(lines, delay = 45) {
  await clearCodeFilter();
  const ta = code();
  const b = await ta.boundingBox();
  await moveTo(b.x + 200, b.y + 120);
  await wait(200);
  await ta.click({ position: { x: 200, y: 120 } });
  await p.keyboard.press('Meta+ArrowDown');
  const src = await source();
  if (!src.endsWith('\n')) await p.keyboard.press('Enter');
  for (const l of lines) {
    await typeSlow(`  ${l}`, delay);
    await p.keyboard.press('Enter');
    await wait(500);
  }
  await wait(600);
}
async function saveVersion(message) {
  await click(p.getByRole('button', { name: 'Save version' }));
  await wait(300);
  await typeSlow(message, 35);
  await wait(300);
  await p.keyboard.press('Enter');
  await wait(1100);
}
async function idOfLabel(label) {
  const src = await source();
  const m = new RegExp(`(\\w+)\\s*\\W*\\["?${label}"?\\]`).exec(src);
  return m?.[1];
}

// ---- the tour ------------------------------------------------------------------------------------------------------
await p.goto(URL);
await p.evaluate(() => localStorage.clear());
await p.goto(URL);
await p.waitForTimeout(2000);
await p.mouse.move(mouse.x, mouse.y);

await title('Mermaid Studio', 'Basic features — style, edit, history and diff');
await wait(2500);
await title();

// 1 — plain Mermaid
const CH1 = '1 · Start';
await caption(CH1, 'Start from a small plain Mermaid diagram — no classes, no styles');
await click(S.getByRole('button', { name: '＋ New', exact: true }));
await click(p.getByRole('menuitem', { name: 'Flowchart' }));
await wait(600);
// more room for the canvas: the Properties panel is shown once (chapter 2), the editing happens on the canvas
await click(btn('panel-layers'));
await click(btn('panel-props'));
await click(code());
await p.keyboard.press('Meta+A');
await typeSlow('flowchart LR\n  user([User]) --> web[Web app]\n  web --> api[API]\n  api --> orders[Orders]\n  orders --> db[(Orders DB)]\n', 18);
await wait(800);
await fit();
await caption(CH1, 'Rendered as typed — this is the plain Mermaid you already have');
await wait(1800);
await saveVersion('v1 · plain Mermaid');

// 2 — style in the visual editor
const CH2 = '2 · Style visually';
await caption(CH2, 'The Properties panel (I) has every style field of the selection — e.g. a style preset…');
await click(btn('panel-props'));
await wait(500);
await click(node('api'));
await wait(400);
await click(S.locator(`button.pp-item[title='Style preset "gateway"']`));
await wait(900);
await caption(CH2, '…but you rarely need it: close it and style right on the canvas');
await click(btn('panel-props'));
await wait(600);
await caption(CH2, 'Floating toolbar → Style presets');
await preset('orders', 'domain');
await caption(CH2, 'Floating toolbar: bold, fill colour…');
await fill('user', 'sky', { bold: true });
await fill('web', 'mint');
await fill('db', 'butter');
await deselect();
await caption(CH2, 'Page badge → page settings: a Whiteboard page and right-angle lines');
await pageSetting('Page preset', 'Whiteboard');
await pageSetting('Lines', 'Right angles');
await clearCodeFilter();
await caption(CH2, 'The Mermaid text is untouched — positions and styles live in the metadata block');
await click(btn('tab-meta'));
await wait(2200);
await click(btn('tab-code'));
await wait(1200);
await saveVersion('v2 · styled in the visual editor');

// 3 — content, visually and in code
const CH3 = '3 · Edit content';
await caption(CH3, 'Visual editor: drag a shape from the Shapes menu onto the canvas and name it');
await click(btn('tool-shapes'));
const orders = await center(node('orders'));
await drag(await center(S.locator('button.pal-item[title^="Queue"]')), { x: orders.x + 40, y: orders.y + 150 });
await typeSlow('Events', 70);
await p.keyboard.press('Enter');
await wait(800);
const eventsId = (await idOfLabel('Events')) ?? 'n1';
await caption(CH3, 'Connect it: drag from a node handle to the new shape');
await click(node('orders'));
await wait(400);
const handle = S.locator(`g.conn-dot[data-id="orders"][data-side="b"]`).first();
await drag(await center(handle), await center(node(eventsId)));
await deselect();
await wait(600);
await caption(CH3, 'Code: type Mermaid in the left panel — the canvas follows as you type');
await appendCode(['api --> auth[Auth]', 'auth --> users[(Users DB)]']);
await fit();
await wait(1200);
await saveVersion('v3 · events queue + auth');

// 4 — N iterations later
const CH4 = `4 · ${ITERATIONS} iterations later`;
await caption(CH4, `The same diagram, iterated ${ITERATIONS} more times — code and visual edits, a version each`);
await fastForward(true);
const speed0 = SPEED;
SPEED = speed0 * 0.45;
const iterations = [
  async () => { await appendCode(['api --> catalog[Catalog]', 'catalog --> cache[(Cache)]'], 25); return 'v4 · catalog + cache'; },
  async () => { await preset('auth', 'security'); await preset('catalog', 'api'); await fill('cache', 'peach'); await fill('users', 'butter'); await deselect(); return 'v5 · styles for the new services'; },
  async () => { await appendCode([`${eventsId} -.-> notify[Notifier]`, 'notify --> mail{{Mail}}'], 25); return 'v6 · notifier'; },
  async () => { await pageSetting('Direction', 'Top → bottom'); return 'v7 · top-down layout'; },
  async () => { await fill(eventsId, 'lilac'); await preset('notify', 'service'); await fill('mail', 'lavender'); await deselect(); return 'v8 · notifier styles'; },
];
for (const it of iterations.slice(0, ITERATIONS)) {
  const msg = await it();
  await fit();
  await saveVersion(msg);
}
SPEED = speed0;
await fastForward(false);
await fit();
await caption(CH4, `After ${ITERATIONS + 3} versions: the plain 5-node sketch grew into a styled architecture diagram`);
await wait(3000);

// 5 — history
const CH5 = '5 · History';
await caption(CH5, 'History (tool dock) lists every saved version — step through them oldest to newest');
await click(btn('history'));
await wait(900);
const versions = S.locator('button.version-main');
const n = await versions.count();
for (let i = n - 1; i >= 0; i--) {
  const label = (await versions.nth(i).locator('xpath=./*[1]').textContent())?.trim();
  await caption(CH5, `Viewing ${label} — each version opens as it was: layout, styles and all`);
  await click(versions.nth(i), { pause: 200 });
  await wait(i === n - 1 || i === 0 ? 2200 : 1500);
}
const back = S.locator('[data-f="pill-action"]:visible').first();
if (await back.count()) await click(back);
await wait(800);

// 6 — diff
const CH6 = '6 · Diff';
await caption(CH6, 'Diff mode: the latest change, item by item — the code diff on the left');
await click(btn('mode-diff'));
await wait(2200);
await caption(CH6, 'Compare the very first version with the current one: pick v1 as Before');
const oldestNode = S.locator('button.vnode').last();
await click(oldestNode);
await wait(1500);
await fit();
await wait(1200);
for (const [f, text] of [
  ['view-before', 'Before — v1, the plain Mermaid'],
  ['view-after', 'After — the current diagram'],
  ['view-side', 'Side by side'],
  ['view-merged', 'Merged — added, removed and changed items marked on one canvas'],
]) {
  await caption(CH6, text);
  await click(btn(f));
  await wait(400);
  await fit();
  await wait(1800);
}
// filters: each change kind (added, removed, content, layout, style) has a toggle with its count
const hide = ['flt-style', 'flt-layout'];
await caption(CH6, 'Filters: hide the style and layout changes — only the content changes stay marked');
for (const f of hide) if (await S.locator(`[data-f="${f}"]:visible`).count()) { await click(btn(f)); await wait(900); }
await wait(1200);
for (const f of hide) if (await S.locator(`[data-f="${f}"]:visible`).count()) { await click(btn(f), { pause: 150 }); await wait(300); }
await caption(CH6, 'The change list: diagram-wide settings and every item change; click one to focus it and its code lines');
await click(btn('changes'));
await wait(2200);
const someChange = S.locator('button.change[role="option"]:visible').first();
if (await someChange.count()) { await click(someChange); await wait(2200); }
await click(btn('changes')); // close the change list
await caption(CH6, 'Click any version to compare it with the current one — here v4');
const v4 = S.locator('button.version-main', { hasText: 'v4' });
if (await v4.count()) { await click(v4); await wait(800); await fit(); await wait(2200); }
await caption(CH6, 'Or just one step: ⋮ → Compare with the previous version — v5 only restyled the new services');
const v5menu = S.locator('button.vmenu').nth(await S.locator('button.version-main').evaluateAll((els) => els.findIndex((e) => e.textContent.includes('v5'))));
await click(v5menu);
await click(p.getByRole('menuitem', { name: 'Compare with the previous version' }));
await wait(800);
await fit();
await wait(2400);
await caption(CH6, 'Swap Before and After with one click');
await click(btn('pill-swap'));
await wait(2200);

await caption();
await title('That’s the tour', 'Plain Mermaid in, styled diagrams out — with history and visual diff');
await wait(3000);

const video = p.video();
await ctx.close();
await browser.close();
if (video) console.log('video:', await video.path());
