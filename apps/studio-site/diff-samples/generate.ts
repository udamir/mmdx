// Generates the "after" side of the diff samples with few / medium / many changes, by applying the editor's own
// ops (src/core/ops) to an example with a seeded random choice of edits. Re-run after changing it:
//   npx esbuild apps/studio-site/diff-samples/generate.ts --bundle --platform=node --format=esm --outfile=/tmp/gen.mjs && node /tmp/gen.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { joinSource, pruneMeta, splitSource } from '../../../src/core/meta/index.js';
import type { DiagramMeta, ItemMeta } from '../../../src/core/meta/types.js';
import type { ErModel, FlowchartModel, SequenceModel } from '../../../src/core/model.js';
import {
  addERRel, addFlowEdge, addFlowNode, addNote, addSeqMessageAt, deleteER, deleteFlow, deleteSeq, relabelFlowEdge,
  relabelFlowNode, relabelSeq, updateEntity, updateRel, usedIds,
} from '../../../src/core/ops/index.js';
import { remapSequenceMeta } from '../../../src/core/ops/remap.js';
import { parse } from '../../../src/core/parse/index.js';

const OUT = 'apps/studio-site/diff-samples/';

function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Doc {
  code: string;
  meta: DiagramMeta;
  constructor(src: string, readonly r: () => number) {
    const { doc } = splitSource(src);
    this.code = doc.code;
    this.meta = doc.meta;
  }
  get model() {
    return parse(this.code);
  }
  pick<T>(xs: readonly T[]): T | undefined {
    return xs.length ? xs[Math.floor(this.r() * xs.length)] : undefined;
  }
  int(a: number, b: number): number {
    return Math.round(a + this.r() * (b - a));
  }
  sign(): 1 | -1 {
    return this.r() < 0.5 ? -1 : 1;
  }
  coll(name: keyof DiagramMeta): Record<string, ItemMeta> {
    return ((this.meta as unknown as Record<string, Record<string, ItemMeta>>)[name] ??= {});
  }
  setCode(code: string): void {
    const before = this.model;
    const oldCode = this.code;
    this.code = code;
    const after = this.model;
    if (before.type === 'sequence' && after.type === 'sequence') this.meta = remapSequenceMeta(this.meta, before, oldCode, after, code);
    this.meta = pruneMeta(this.meta, usedIds(after));
  }
  source(): string {
    return joinSource({ code: this.code, meta: this.meta });
  }
}

const WORDS = ['v2', 'Primary', 'Internal', 'Public', 'Async', 'Cluster', 'Edge', 'Core', 'Legacy', 'Regional', 'Shared', 'Read-only', 'HA', 'Batch', 'Streaming'];
const FILLS = ['@sky', '@sand', '@lime', '@peach', '@lavender', '@mint', '@pale-rose', '@butter', '@ice', '@lilac'];

/** A plausible edit of a label: add, drop or swap a word. */
function editText(d: Doc, s: string): string {
  const words = s.split(' ').filter(Boolean);
  const w = d.pick(WORDS)!;
  const op = d.int(0, 3);
  if (op === 0 || words.length < 2) return `${s} ${w}`;
  if (op === 1) return `${w} ${s}`;
  const i = d.int(0, words.length - 1);
  if (op === 2) return words.map((x, j) => (j === i ? w : x)).join(' ');
  return words.filter((_, j) => j !== i).join(' ');
}

// ---- flowchart --------------------------------------------------------------------------------------------------

const flow = (d: Doc) => d.model as FlowchartModel;

const FLOW_OPS: Record<string, (d: Doc) => boolean> = {
  relabelNode(d) {
    const n = d.pick([...flow(d).nodes.values()]);
    if (!n) return false;
    d.setCode(relabelFlowNode(d.code, flow(d), n.id, editText(d, n.label)).code);
    return true;
  },
  relabelEdge(d) {
    const e = d.pick(flow(d).edges);
    if (!e) return false;
    d.setCode(relabelFlowEdge(d.code, flow(d), e.id, e.label ? editText(d, e.label) : d.pick(['HTTPS', 'gRPC', 'events', 'reads', 'writes', 'sync'])!).code);
    return true;
  },
  removeNode(d) {
    const n = d.pick([...flow(d).nodes.values()]);
    if (!n) return false;
    d.setCode(deleteFlow(d.code, flow(d), [{ kind: 'node', id: n.id }]).code);
    return true;
  },
  removeEdge(d) {
    const e = d.pick(flow(d).edges);
    if (!e) return false;
    d.setCode(deleteFlow(d.code, flow(d), [{ kind: 'edge', id: e.id }]).code);
    return true;
  },
  addNode(d) {
    const nodes = d.coll('nodes');
    const anchor = d.pick([...flow(d).nodes.values()].filter((n) => nodes[n.id]?.x !== undefined));
    if (!anchor) return false;
    const label = `${d.pick(['Audit', 'Billing', 'Search', 'Feature flags', 'Rate limiter', 'Tracing', 'Scheduler', 'Notifications', 'Reports', 'Backup'])!} ${d.pick(['service', 'worker', 'store', 'API'])!}`;
    const r = addFlowNode(d.code, flow(d), { label, shape: d.pick(['rect', 'rounded', 'cylinder', 'stadium'] as const)!, group: anchor.parent });
    d.setCode(r.code);
    d.setCode(addFlowEdge(d.code, anchor.id, r.select.id).code);
    const a = nodes[anchor.id]!;
    nodes[r.select.id] = { x: (a.x ?? 0) + d.sign() * d.int(160, 280), y: (a.y ?? 0) + d.int(90, 180), w: 190, h: 64 };
    return true;
  },
  addEdge(d) {
    const ns = [...flow(d).nodes.keys()];
    const a = d.pick(ns), b = d.pick(ns);
    if (!a || !b || a === b || flow(d).edges.some((e) => e.from === a && e.to === b)) return false;
    d.setCode(addFlowEdge(d.code, a, b).code);
    return true;
  },
  moveNode(d) {
    const nodes = d.coll('nodes');
    const id = d.pick(Object.keys(nodes).filter((k) => nodes[k]!.x !== undefined));
    if (!id) return false;
    const m = nodes[id]!;
    m.x = (m.x ?? 0) + d.sign() * d.int(40, 180);
    m.y = (m.y ?? 0) + d.sign() * d.int(0, 120);
    return true;
  },
  restyleNode(d) {
    const n = d.pick([...flow(d).nodes.keys()]);
    if (!n) return false;
    const m = (d.coll('nodes')[n] ??= {});
    if (d.r() < 0.7) m.fill = d.pick(FILLS)!;
    else m.strokeWidth = d.int(2, 3);
    return true;
  },
  restyleEdge(d) {
    const e = d.pick(flow(d).edges);
    if (!e) return false;
    (d.coll('edges')[e.id] ??= {}).preset = d.pick(['sync', 'rest', 'write', 'read', 'alert', 'grpc', 'event', 'strong'])!;
    return true;
  },
};

// ---- sequence ---------------------------------------------------------------------------------------------------

const seq = (d: Doc) => d.model as SequenceModel;
const msgs = (d: Doc) => seq(d).items.filter((x) => x.kind === 'message');

const SEQ_OPS: Record<string, (d: Doc) => boolean> = {
  relabelMessage(d) {
    const m = d.pick(msgs(d));
    if (!m || m.kind !== 'message') return false;
    d.setCode(relabelSeq(d.code, seq(d), { kind: 'message', id: m.id }, editText(d, m.text)).code);
    return true;
  },
  removeMessage(d) {
    const m = d.pick(msgs(d).filter((x) => x.kind === 'message' && !x.activate && !x.deactivate));
    if (!m) return false;
    const r = deleteSeq(d.code, seq(d), [{ kind: 'message', id: m.id }]);
    if (r.reason || r.code === d.code) return false;
    d.setCode(r.code);
    return true;
  },
  addMessage(d) {
    const at = d.pick(msgs(d));
    const ps = seq(d).participants.map((p) => p.id);
    const from = d.pick(ps), to = d.pick(ps);
    if (!at || !from || !to) return false;
    const r = addSeqMessageAt(d.code, seq(d), from, to, at.src);
    d.setCode(r.code);
    const added = msgs(d).find((x) => x.src === r.line);
    if (added) d.setCode(relabelSeq(d.code, seq(d), { kind: 'message', id: added.id }, d.pick(['Check health', 'Retry request', 'Publish event', 'Read config', 'Validate token', 'Write audit record', 'Emit metrics', 'Acknowledge'])!).code);
    return true;
  },
  addNote(d) {
    const at = d.pick(msgs(d));
    if (!at || at.kind !== 'message') return false;
    const r = addNote(d.code, seq(d), { over: at.from, afterLine: at.src });
    d.setCode(r.code);
    const n = seq(d).items.find((x) => x.kind === 'note' && x.src === r.line);
    if (n?.kind !== 'note') return true;
    d.setCode(relabelSeq(d.code, seq(d), { kind: 'note', id: n.id }, d.pick(['idempotent', 'times out after 30 s', 'cached for 5 min', 'see ADR-12', 'TODO: batch this'])!).code);
    return true;
  },
  relabelParticipant(d) {
    const p = d.pick(seq(d).participants);
    if (!p) return false;
    d.setCode(relabelSeq(d.code, seq(d), { kind: 'participant', id: p.id }, editText(d, p.label || p.id)).code);
    return true;
  },
  moveParticipant(d) {
    const ps = d.coll('participants');
    const id = d.pick(Object.keys(ps).filter((k) => ps[k]!.x !== undefined));
    if (!id) return false;
    ps[id]!.x = (ps[id]!.x ?? 0) + d.sign() * d.int(30, 90);
    return true;
  },
  restyleParticipant(d) {
    const p = d.pick(seq(d).participants);
    if (!p) return false;
    (d.coll('participants')[p.id] ??= {}).fill = d.pick(FILLS)!;
    return true;
  },
};

// ---- ER ---------------------------------------------------------------------------------------------------------

const er = (d: Doc) => d.model as ErModel;
const NEW_ATTRS = [
  { type: 'VARCHAR(32)', name: 'status' }, { type: 'DATETIME', name: 'deleted_at' }, { type: 'INT(11)', name: 'version' },
  { type: 'INT(11)', name: 'tenant_id', keys: ['FK'] }, { type: 'VARCHAR(64)', name: 'external_ref' }, { type: 'TEXT', name: 'notes' },
  { type: 'BOOLEAN', name: 'is_public' }, { type: 'DATETIME', name: 'published_at' },
];
const TYPE_CHANGES: Record<string, string> = { 'INT(11)': 'BIGINT', 'VARCHAR(255)': 'VARCHAR(512)', 'VARCHAR(7)': 'VARCHAR(16)', TEXT: 'MEDIUMTEXT', DATETIME: 'TIMESTAMP' };

const ER_OPS: Record<string, (d: Doc) => boolean> = {
  changeType(d) {
    const e = d.pick([...er(d).entities.values()]);
    const i = e ? e.attrs.findIndex((a) => TYPE_CHANGES[a.type] && !a.keys.includes('PK')) : -1;
    if (!e || i < 0) return false;
    const attrs = e.attrs.map((a, j) => (j === i ? { ...a, type: TYPE_CHANGES[a.type]! } : a));
    d.setCode(updateEntity(d.code, er(d), e.id, { attrs }).code);
    return true;
  },
  renameAttr(d) {
    const e = d.pick([...er(d).entities.values()]);
    const a = e && d.pick(e.attrs.filter((x) => !x.keys.includes('PK')));
    if (!e || !a) return false;
    const name = d.pick([`${a.name}_v2`, `legacy_${a.name}`, a.name.replace(/_id$/, '_ref'), `${a.name}_utc`])!;
    d.setCode(updateEntity(d.code, er(d), e.id, { attrs: e.attrs.map((x) => (x === a ? { ...x, name } : x)) }).code);
    return true;
  },
  addAttr(d) {
    const e = d.pick([...er(d).entities.values()]);
    const n = d.pick(NEW_ATTRS)!;
    if (!e || e.attrs.some((a) => a.name === n.name)) return false;
    d.setCode(updateEntity(d.code, er(d), e.id, { attrs: [...e.attrs, { type: n.type, name: n.name, keys: (n.keys ?? []) as never, comment: '' }] }).code);
    return true;
  },
  removeAttr(d) {
    const e = d.pick([...er(d).entities.values()]);
    const a = e && d.pick(e.attrs.filter((x) => !x.keys.includes('PK')));
    if (!e || !a) return false;
    d.setCode(updateEntity(d.code, er(d), e.id, { attrs: e.attrs.filter((x) => x !== a) }).code);
    return true;
  },
  removeEntity(d) {
    const e = d.pick([...er(d).entities.keys()]);
    if (!e) return false;
    d.setCode(deleteER(d.code, er(d), [{ kind: 'entity', id: e }]).code);
    return true;
  },
  addEntity(d) {
    const ents = d.coll('entities');
    const anchor = d.pick([...er(d).entities.keys()].filter((k) => ents[k]?.x !== undefined));
    const name = d.pick(['audit_log', 'tag', 'attachment', 'webhook', 'api_token', 'saved_search', 'import_job', 'comment'])!;
    if (!anchor || er(d).entities.has(name)) return false;
    d.setCode(`${d.code.trimEnd()}\n  ${name} {\n    INT(11) id PK\n    INT(11) ${anchor}_id FK\n    DATETIME created_at\n  }`);
    d.setCode(addERRel(d.code, anchor, name).code);
    const a = ents[anchor]!;
    ents[name] = { ...a, x: (a.x ?? 0) + d.sign() * d.int(220, 320), y: (a.y ?? 0) + d.int(60, 160) };
    delete ents[name].fill;
    return true;
  },
  relabelRel(d) {
    const r = d.pick(er(d).rels);
    if (!r) return false;
    d.setCode(updateRel(d.code, er(d), r.id, { label: r.label ? editText(d, r.label) : 'owns' }).code);
    return true;
  },
  moveEntity(d) {
    const ents = d.coll('entities');
    const id = d.pick(Object.keys(ents).filter((k) => ents[k]!.x !== undefined));
    if (!id) return false;
    ents[id]!.x = (ents[id]!.x ?? 0) + d.sign() * d.int(40, 200);
    ents[id]!.y = (ents[id]!.y ?? 0) + d.sign() * d.int(0, 140);
    return true;
  },
  restyleEntity(d) {
    const e = d.pick([...er(d).entities.keys()]);
    if (!e) return false;
    (d.coll('entities')[e] ??= {}).fill = d.pick(['@sky', '@gold', '@violet', '@brown', '@mint', '@peach'])!;
    return true;
  },
};

// ---- samples ----------------------------------------------------------------------------------------------------

/** What one op does, for commit messages. */
const VERBS: Record<string, string> = {
  relabelNode: 'rename node', relabelEdge: 'relabel connection', removeNode: 'remove node', removeEdge: 'remove connection', addNode: 'add service',
  addEdge: 'connect nodes', moveNode: 'move node', restyleNode: 'recolour node', restyleEdge: 'restyle connection',
  relabelMessage: 'reword message', removeMessage: 'drop message', addMessage: 'add message', addNote: 'add note', relabelParticipant: 'rename participant',
  moveParticipant: 'move participant', restyleParticipant: 'recolour participant',
  changeType: 'change column type', renameAttr: 'rename column', addAttr: 'add column', removeAttr: 'drop column', removeEntity: 'drop table',
  addEntity: 'add table', relabelRel: 'relabel relation', moveEntity: 'move table', restyleEntity: 'recolour table',
};
const AUTHORS = ['Damir', 'Alex', 'Maria', 'Chen', 'Priya'];

export interface HistoryEntry {
  message: string;
  author: string;
  /** ISO date. */
  date: string;
  /** Diagram source; absent for the first and the last version (they are the .before / .after files). */
  source?: string;
}

/**
 * Applies the plan's ops in a random order, split into `commits` commits, and writes the first version
 * (.before.mmd), the last one (.after.mmd) and every version with its message (.history.json, oldest first).
 */
function generate(name: string, example: string, seed: number, ops: Record<string, (d: Doc) => boolean>, plan: Record<string, number>, commits: number): void {
  const before = readFileSync(`examples/${example}`, 'utf8');
  const d = new Doc(before, rng(seed));
  const queue = Object.entries(plan).flatMap(([op, n]) => Array.from({ length: n }, () => op));
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(d.r() * (i + 1));
    [queue[i], queue[j]] = [queue[j]!, queue[i]!];
  }
  const day = (n: number) => new Date(Date.UTC(2026, 9, 30, 9 + (n % 7), 15 * n) - (commits - n) * 86400000).toISOString();
  const history: HistoryEntry[] = [{ message: 'Initial version', author: AUTHORS[0]!, date: day(0) }];
  const per = Math.ceil(queue.length / commits);
  for (let c = 0; c < commits; c++) {
    const done = new Map<string, number>();
    for (const op of queue.slice(c * per, (c + 1) * per)) {
      for (let tries = 0; tries < 20; tries++)
        if (ops[op]!(d)) {
          done.set(op, (done.get(op) ?? 0) + 1);
          break;
        }
    }
    const parts = [...done].map(([op, n]) => `${VERBS[op] ?? op}${n > 1 ? ` ×${n}` : ''}`);
    const message = parts.length ? parts.join(', ').replace(/^./, (x) => x.toUpperCase()) : 'Tidy up';
    const last = c === commits - 1;
    history.push({ message, author: AUTHORS[(c + 1) % AUTHORS.length]!, date: day(c + 1), ...(last ? {} : { source: d.source() }) });
  }
  writeFileSync(`${OUT}${name}.before.mmd`, before);
  writeFileSync(`${OUT}${name}.after.mmd`, d.source());
  writeFileSync(`${OUT}${name}.history.json`, JSON.stringify(history));
}

generate('flow-few', 'production-microservices.mmd', 11, FLOW_OPS, { relabelNode: 1, addNode: 1, moveNode: 1, restyleEdge: 1 }, 2);
generate('flow-many', 'microservice-patterns.mmd', 7, FLOW_OPS, { relabelNode: 12, relabelEdge: 5, removeNode: 5, removeEdge: 3, addNode: 7, addEdge: 4, moveNode: 16, restyleNode: 10, restyleEdge: 6 }, 6);
generate('seq-medium', 'docker-deploy-sequence.mmd', 5, SEQ_OPS, { relabelMessage: 4, removeMessage: 2, addMessage: 3, addNote: 2, relabelParticipant: 1, moveParticipant: 2, restyleParticipant: 2 }, 4);
generate('seq-many', 'docker-deploy-sequence.mmd', 9, SEQ_OPS, { relabelMessage: 12, removeMessage: 6, addMessage: 8, addNote: 5, relabelParticipant: 3, moveParticipant: 5, restyleParticipant: 5 }, 6);
generate('er-medium', 'atom-schema-er.mmd', 3, ER_OPS, { changeType: 3, renameAttr: 3, addAttr: 3, removeAttr: 2, removeEntity: 1, addEntity: 1, relabelRel: 1, moveEntity: 3, restyleEntity: 2 }, 4);
generate('er-many', 'atom-schema-er.mmd', 13, ER_OPS, { changeType: 10, renameAttr: 10, addAttr: 10, removeAttr: 8, removeEntity: 4, addEntity: 4, relabelRel: 5, moveEntity: 15, restyleEntity: 8 }, 6);
