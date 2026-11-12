// @vitest-environment jsdom
// Opening documents in the studio: one path for files (a drop on the editor's canvas is opened once, under the
// studio's name and versions), a slow example load never replaces what the user opened meanwhile, and the studio
// reads the editor through its public API.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { extractMermaid, readDocumentFiles } from '../../src/editor/lib/files.js';
import { DiagramStudio } from '../../src/elements/studio.js';

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

const wait = async (f: () => unknown, ms = 4000): Promise<void> => {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

const studios: DiagramStudio[] = [];
afterEach(() => {
  for (const s of studios.splice(0)) s.destroy();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const mount = (o: ConstructorParameters<typeof DiagramStudio>[1] = {}): { studio: DiagramStudio; root: ShadowRoot; confirms: () => number } => {
  const host = document.createElement('div');
  document.body.append(host);
  const studio = new DiagramStudio(host, { persist: [], storage: memoryStorage(), ...o });
  studios.push(studio);
  let n = 0;
  (studio as unknown as { dialogs: { confirm: () => Promise<boolean> } }).dialogs.confirm = async () => {
    n++;
    return true;
  };
  return { studio, root: host.shadowRoot!, confirms: () => n };
};

/** A dropped file (jsdom's File has no `text()`). */
const file = (name: string, text: string, type = ''): File => ({ name, type, text: async () => text }) as unknown as File;

/** A drop event as the browser sends it (jsdom has no DragEvent / DataTransfer). */
const drop = (target: Element, files: File[]): Event => {
  const ev = new Event('drop', { bubbles: true, composed: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', { value: { files, types: ['Files'] } });
  target.dispatchEvent(ev);
  return ev;
};

describe('studio: opening files', () => {
  beforeEach(() => vi.stubGlobal('fetch', async () => new Response('', { status: 404 })));

  it('a drop on the editor canvas is opened once, by the studio, under its name', async () => {
    const { studio, root, confirms } = mount();
    await wait(() => studio.editor?.getSource().startsWith('flowchart'));
    const ed = studio.editor!;
    ed.core.change('Snap', () => void (ed.core.meta.canvas.snap = 4));
    expect(ed.dirty).toBe(true);
    const ops: string[] = [];
    ed.core.host.addEventListener('mmdx-op', (e) => ops.push((e as CustomEvent<{ type: string }>).detail.type));
    const wrap = ed.core.dom.wrap;
    const ev = drop(wrap, [file('notes.md', '# Notes\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n')]);
    expect(ev.defaultPrevented).toBe(true);
    await wait(() => ed.getSource().startsWith('sequenceDiagram'));
    await new Promise((r) => setTimeout(r, 30));
    expect(confirms()).toBe(1);
    // not loaded a second time by the editor's own path (an undoable `doc.open` step)
    expect(ops).not.toContain('doc.open');
    expect(root.querySelector('.name')!.textContent).toBe('notes');
    expect(ed.fileName).toBe('notes');
    // opened as a new document (the studio's path), not as an undoable step of the old one
    expect(ed.store.canUndo.peek()).toBe(false);
  });

  it('an image dropped on the canvas is not opened as the document (B4)', async () => {
    const { studio, confirms } = mount();
    await wait(() => studio.editor?.getSource().startsWith('flowchart'));
    const ed = studio.editor!;
    const before = ed.getSource();
    drop(ed.core.dom.wrap, [file('photo.png', '\u0089PNG', 'image/png')]);
    await new Promise((r) => setTimeout(r, 60));
    expect(confirms()).toBe(0);
    expect(ed.getSource().startsWith('flowchart')).toBe(true);
    expect(ed.getSource()).not.toContain('PNG');
    expect(before.startsWith('flowchart')).toBe(true);
  });

  it('only diagram, Markdown, text and sidecar files are read as documents', async () => {
    expect(await readDocumentFiles([file('photo.png', 'x', 'image/png')], () => 'cur')).toBeNull();
    expect(await readDocumentFiles([file('photo.png', 'x', 'image/png'), file('a.mmd', 'flowchart LR\n  A')], () => 'cur')).toMatchObject({ name: 'a.mmd' });
  });

  it('a slow example never replaces a file opened meanwhile', async () => {
    let release: (() => void) | null = null;
    vi.stubGlobal('fetch', async (u: string | URL) => {
      const path = new URL(String(u), 'http://localhost/').pathname;
      if (path === '/examples/index.json') return new Response(JSON.stringify({ examples: [{ id: 'slow', title: 'Slow', file: 'slow.mmd' }] }));
      if (path === '/examples/slow.mmd') {
        await new Promise<void>((r) => (release = r));
        return new Response('flowchart LR\n  slow --> example\n');
      }
      return new Response('', { status: 404 });
    });
    const { studio } = mount({ examples: '/examples/index.json', initial: 'slow' });
    await wait(() => release);
    await studio.openFiles([file('mine.mmd', 'flowchart LR\n  mine --> file\n')]);
    expect(studio.editor!.getSource()).toContain('mine --> file');
    release!();
    await new Promise((r) => setTimeout(r, 30));
    expect(studio.editor!.getSource()).toContain('mine --> file');
  });

  it('destroy is idempotent', () => {
    const { studio } = mount();
    studio.destroy();
    expect(() => studio.destroy()).not.toThrow();
  });
});

describe('the Markdown mermaid block', () => {
  it('is the text of a .md file; other files are taken as they are', () => {
    const md = 'Intro\n\n```mermaid title="x"\nflowchart LR\n  A --> B\n```\n';
    expect(extractMermaid(md, 'a.md')).toBe('flowchart LR\n  A --> B\n');
    expect(extractMermaid(md, 'a.mmd')).toBe(md);
    expect(extractMermaid('no block', 'a.md')).toBe('no block');
  });
});
