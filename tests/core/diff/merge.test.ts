import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diffModels, mergeDiagrams, mergeText, MARK, stripMarks } from '../../../src/core/diff/index.js';

const { DEL_OPEN, DEL_CLOSE, INS_OPEN, INS_CLOSE } = MARK;
import { splitSource } from '../../../src/core/meta/index.js';
import type { ErModel, FlowchartModel, SequenceModel, SupportedModel } from '../../../src/core/model.js';
import { parse } from '../../../src/core/parse/index.js';

const load = (name: string) => {
  const [a, b] = ['before', 'after'].map((s) => splitSource(readFileSync(`apps/studio-site/diff-samples/${name}.${s}.mmd`, 'utf8')).doc);
  const ma = parse(a!.code) as SupportedModel, mb = parse(b!.code) as SupportedModel;
  return mergeDiagrams(diffModels(ma, mb, a!.meta, b!.meta), ma, mb, a!.meta, b!.meta)!;
};

describe('mergeText', () => {
  it('marks removed and added words', () => {
    expect(mergeText('Load Balancer', 'Load Balancer (L7)')).toBe(`Load Balancer ${INS_OPEN}(L7)${INS_CLOSE}`);
    const m = mergeText('GET Request to inspect network by name', 'GET /networks/{name}');
    expect(m).toBe(`GET ${DEL_OPEN}Request to inspect network by name${DEL_CLOSE} ${INS_OPEN}/networks/{name}${INS_CLOSE}`);
    expect(mergeText('same', 'same')).toBe('same');
    expect(mergeText('Order\nservice', 'Order\nworker')).toBe(`Order\n${DEL_OPEN}service${DEL_CLOSE} ${INS_OPEN}worker${INS_CLOSE}`);
  });
});

describe('mergeDiagrams', () => {
  it('flowchart: keeps removed nodes and edges, marks relabels', () => {
    const m = load('architecture');
    const f = m.model as FlowchartModel;
    // the removed node shows as removed; its text is not marked as well
    expect(f.nodes.get('desktop~del')?.label).toBe('Desktop');
    expect(f.edges.find((e) => e.id === 'desktop->gw~del')).toMatchObject({ from: 'desktop~del', to: 'gw' });
    expect(stripMarks(f.nodes.get('lb')!.label)).toBe('Load Balancer (L7)');
    expect(m.meta.nodes?.['desktop~del']).toMatchObject({ x: 665, y: 110 });
    expect(m.status.get('node:desktop~del')?.status).toBe('removed');
  });

  it('sequence: removed messages stay in order next to their old neighbours', () => {
    const s = load('sequence').model as SequenceModel;
    const texts = s.items.filter((x) => x.kind === 'message').map((x) => (x.kind === 'message' ? stripMarks(x.text) : ''));
    const i = texts.indexOf('Parsing volume from description file');
    expect(texts[i - 1]).toBe('Parsing volume');
    expect(texts[i + 1]).toBe('Save volume to Repository');
  });

  it('a removed item keeps its text unmarked (labels, ER rows, messages, notes)', () => {
    const marked = (v: string | undefined): boolean => !!v && v !== stripMarks(v);
    const f = load('architecture').model as FlowchartModel;
    const gone = [...f.nodes.values(), ...f.groups.values()].filter((x) => x.id.endsWith('~del'));
    expect(gone.length).toBeGreaterThan(0);
    for (const x of gone) expect(marked(x.label)).toBe(false);
    for (const e of f.edges.filter((x) => x.id.endsWith('~del'))) expect(marked(e.label)).toBe(false);
    const er = load('schema').model as ErModel;
    for (const [id, e] of er.entities) if (id.endsWith('~del')) for (const a of e.attrs) expect([a.name, a.type, a.comment].some(marked)).toBe(false);
    const seq = load('sequence').model as SequenceModel;
    const removed = seq.items.filter((x) => (x.kind === 'message' || x.kind === 'note') && x.id.endsWith('~del'));
    expect(removed.length).toBeGreaterThan(0);
    for (const x of removed) expect(marked(x.kind === 'message' || x.kind === 'note' ? x.text : '')).toBe(false);
  });

  it('ER: removed attributes return in place, changed types are marked', () => {
    const m = load('schema').model as ErModel;
    const names = m.entities.get('user')!.attrs.map((a) => a.name);
    // like a text diff: removed rows first, then the added ones
    expect(names.map(stripMarks)).toEqual(['id', 'username', 'email', 'sha1_password', 'salt', 'password_hash', 'last_login_at']);
    expect(names[3]).toBe(`${DEL_OPEN}sha1_password${DEL_CLOSE}`);
    expect(names[5]).toBe(`${INS_OPEN}password_hash${INS_CLOSE}`);
    expect(m.entities.get('acl_group_i18n')!.attrs[0]!.type).toContain(DEL_OPEN);
  });
});
