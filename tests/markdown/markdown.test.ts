import { describe, expect, it } from 'vitest';
import { diagramHtml, markdownItMmdx, rehypeMmdx, scriptSafe } from '../../src/markdown/index.js';
import { decodeHash, encodeHash } from '../../src/adapters/share.js';

describe('markdown plugins', () => {
  it('pre-renders supported diagrams with the source for hydration', () => {
    const html = diagramHtml('flowchart LR\n  a --> b', { theme: 'clean' });
    expect(html).toMatch(/^<mmdx-viewer theme="clean" style="aspect-ratio:\d+ \/ \d+"><svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(html).toContain('data-ds-ssr');
    expect(html).toContain('<script type="text/mermaid">flowchart LR\n  a --> b</script>');
  });
  it('leaves unsupported types to the viewer fallback', () => {
    const html = diagramHtml('pie title X\n "a": 1');
    expect(html).not.toContain('<svg');
  });
  it('cannot break out of the script element', () => {
    const src = 'flowchart LR\n  a["</script><script>alert(1)</script>"] --> b';
    const html = diagramHtml(src, { prerender: false });
    expect(html.match(/<\/script>/g)?.length).toBe(1);
    expect(scriptSafe('</SCRIPT>')).toBe('<\\/SCRIPT>');
  });
  it('rehype plugin replaces pre > code.language-mermaid', () => {
    const tree = { type: 'root', children: [{ type: 'element', tagName: 'pre', children: [{ type: 'element', tagName: 'code', properties: { className: ['language-mermaid'] }, children: [{ type: 'text', value: 'flowchart LR\n  a --> b\n' }] }] }] };
    rehypeMmdx()(tree);
    expect(tree.children[0]).toMatchObject({ type: 'raw' });
  });
  it('markdown-it plugin renders mermaid fences and delegates others', () => {
    const md = { renderer: { rules: { fence: () => '<pre>other</pre>' } as Record<string, ((t: { info: string; content: string }[], i: number) => string) | undefined> } };
    markdownItMmdx(md);
    expect(md.renderer.rules['fence']!([{ info: 'mermaid', content: 'flowchart LR\n a-->b\n' }], 0)).toContain('<mmdx-viewer');
    expect(md.renderer.rules['fence']!([{ info: 'js', content: 'x' }], 0)).toBe('<pre>other</pre>');
  });
});

describe('share links', () => {
  it('round-trips through deflate + base64url', async () => {
    const src = 'flowchart LR\n  a["Ünïcødé ✓"] --> b\n%%@ node a {"x":1,"y":2}\n';
    const enc = await encodeHash(src);
    expect(enc).toMatch(/^[\w-]+$/);
    expect(await decodeHash(enc!)).toBe(src);
  });
  it('rejects garbage', async () => {
    expect(await decodeHash('not-valid-deflate')).toBeNull();
  });
});
