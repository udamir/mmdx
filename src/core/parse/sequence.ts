// Mermaid sequenceDiagram parser (A.9).
// items: message | note | blockStart | blockElse | blockEnd | activate | deactivate
import type {
  BlockKind, MessageHead, Participant, SeqBlockStart, SeqBox, SeqItem, SequenceModel,
} from '../model.js';
import { diag } from '../types.js';
import { isColorLiteral } from '../validate.js';
import { cleanLabel } from './label.js';
import { ItemBudget } from './limits.js';

const ARROWS = ['<<-->>', '<<->>', '-->>', '->>', '--x', '-x', '--)', '-)', '-->', '->'];
// The first arrow after at least one character, as the prototype's `^(.+?)\s*(arrow)\s*([+-])?\s*(.+?)\s*:(.*)$`
// reads it; found by a scan rather than that regex, which backtracks quadratically on long runs of spaces.
const ARROW = new RegExp(ARROWS.map((a) => a.replace(/[)]/g, '\\)')).join('|'), 'g');

interface RawMessage { from: string; arrow: string; act: string; to: string; text: string }
function splitMessage(t: string): RawMessage | null {
  ARROW.lastIndex = 1;
  const a = ARROW.exec(t);
  if (!a) return null;
  const from = t.slice(0, a.index).trim();
  const arrow = a[0];
  let r = t.slice(a.index + arrow.length).trimStart();
  let act = '';
  if (r[0] === '+' || r[0] === '-') { act = r[0]; r = r.slice(1).trimStart(); }
  const colon = r.indexOf(':', 1);
  if (!from || colon < 0) return null;
  return { from, arrow, act, to: r.slice(0, colon).trim(), text: r.slice(colon + 1) };
}
const BLOCKS: readonly BlockKind[] = ['loop', 'alt', 'opt', 'par', 'critical', 'break', 'rect'];
const BLOCK = new RegExp(`^(${BLOCKS.join('|')})\\b\\s*(.*)$`);
// Mermaid features the renderer has no model for: reported instead of silently dropped.
const UNSUPPORTED = /^(destroy|accTitle|accDescr)\b/;

export function emptySequence(): SequenceModel {
  return { type: 'sequence', participants: [], items: [], boxes: [], autonumber: false, title: '', diagnostics: [] };
}

/** `box` arguments: an optional leading colour, then the label. */
function boxColor(rest: string): { color: string | null; label: string; bad?: string } {
  let m = /^((?:rgba?|hsla?)\([^)]*\)?)\s*(.*)$/i.exec(rest) ?? /^(#[0-9a-fA-F]{3,8})(?=\s|$)\s*(.*)$/.exec(rest);
  if (m) {
    const c = m[1] ?? '';
    return isColorLiteral(c) ? { color: c, label: m[2] ?? '' } : { color: null, label: m[2] ?? '', bad: c };
  }
  // a first word that is not a colour is part of the label
  m = /^([a-zA-Z]+)(?=\s|$)\s*(.*)$/.exec(rest);
  if (m && isColorLiteral(m[1])) return { color: m[1] ?? null, label: m[2] ?? '' };
  return { color: null, label: rest };
}

export function parseSequence(code: string): SequenceModel {
  const model = emptySequence();
  const D = model.diagnostics;
  const budget = new ItemBudget(D);
  const byId = new Map<string, Participant>();
  const blocks = new Map<string, SeqBlockStart>(); // block id -> start item, for else/end (linear, not items.find)
  let box: SeqBox | null = null;
  let mi = 0, ni = 0, bi = 0;
  const blockStack: string[] = [];
  let curLine = 0;

  const touch = (rawId: string, label?: string, kind: 'participant' | 'actor' = 'participant'): Participant | null => {
    const id = rawId.trim();
    let p = byId.get(id);
    if (!p) {
      if (!budget.take(curLine)) return null;
      p = { id, label: id, kind, box: box?.id ?? null, lines: new Set() };
      byId.set(id, p);
      model.participants.push(p);
      if (box) box.members.push(id);
    }
    if (label) p.label = cleanLabel(label);
    if (kind === 'actor') p.kind = 'actor';
    p.lines.add(curLine);
    return p;
  };
  const push = (item: SeqItem): void => { if (budget.take(curLine)) model.items.push(item); };
  const cannot = (t: string, li: number): void => { D.push(diag('warning', 'seq.cannot-parse', `cannot parse "${t}"`, li)); };

  const lines = code.split('\n');
  for (let li = 0; li < lines.length && !budget.over; li++) {
    curLine = li;
    const t = (lines[li] ?? '').trim();
    if (!t || t.startsWith('%%') || /^sequenceDiagram\b/.test(t)) continue;
    let m: RegExpExecArray | null;
    if (/^autonumber\b/.test(t)) { model.autonumber = true; continue; }
    if ((m = /^title\s*:?\s*(.+)$/.exec(t))) { model.title = m[1] ?? ''; continue; }
    if (UNSUPPORTED.test(t)) { D.push(diag('warning', 'seq.unsupported', `cannot parse "${t}"`, li)); continue; }
    if ((m = /^(create\s+)?(participant|actor)\s+(.+?)(?:(?<!\s)\s+as\s+(.+))?$/.exec(t))) {
      const decl = m[3] ?? '';
      // `id@{ … }`: the first `@{` when the declaration ends with `}` (indexOf, not a backtracking regex)
      const at = decl.endsWith('}') ? decl.indexOf('@{') : -1;
      const p = touch((at < 0 ? decl : decl.slice(0, at)).trim(), m[4], m[2] === 'actor' ? 'actor' : 'participant');
      if (!p) continue;
      p.defLine = li;
      if (m[1]) p.created = true;
      if (box && p.box !== box.id) { p.box = box.id; if (!box.members.includes(p.id)) box.members.push(p.id); }
      const typ = /"type"\s*:\s*"(\w+)"/.exec(decl);
      if (typ && typ[1]) p.shape = typ[1];
      continue;
    }
    if ((m = /^box\b\s*(.*)$/.exec(t))) {
      const { color, label, bad } = boxColor((m[1] ?? '').trim());
      if (bad !== undefined) D.push(diag('warning', 'seq.bad-color', `invalid color "${bad}" for box`, li));
      box = { id: `box${model.boxes.length + 1}`, color, label, members: [], line: li };
      model.boxes.push(box);
      continue;
    }
    if ((m = /^(activate|deactivate)\s+(.+)$/.exec(t))) {
      const who = (m[2] ?? '').trim();
      touch(who);
      push({ kind: m[1] === 'activate' ? 'activate' : 'deactivate', who, src: li });
      continue;
    }
    if ((m = /^note\s+(left of|right of|over)\s+([^:]+):(.*)$/i.exec(t))) {
      const targets = (m[2] ?? '').split(',').map((s) => s.trim());
      for (const x of targets) touch(x);
      const pos = (m[1] ?? '').toLowerCase() as 'left of' | 'right of' | 'over';
      push({ kind: 'note', id: `n${++ni}`, pos, targets, text: cleanLabel(m[3]), src: li });
      continue;
    }
    if ((m = BLOCK.exec(t))) {
      const kind = m[1] as BlockKind;
      const arg = m[2] ?? '';
      let color: string | null = null;
      if (kind === 'rect') {
        const c = arg.trim();
        if (isColorLiteral(c)) color = c;
        else if (c) D.push(diag('warning', 'seq.bad-color', `invalid color "${c}" for rect`, li));
      }
      const blk: SeqBlockStart = {
        kind: 'blockStart', id: `b${++bi}`, block: kind, label: kind === 'rect' ? '' : cleanLabel(arg), color, src: li, lines: [li],
      };
      if (!budget.take(li)) continue;
      blocks.set(blk.id, blk);
      blockStack.push(blk.id);
      model.items.push(blk);
      continue;
    }
    if ((m = /^(else|and|option)\b\s*(.*)$/.exec(t))) {
      const bid = blockStack[blockStack.length - 1];
      if (bid === undefined) { cannot(t, li); continue; }
      blocks.get(bid)?.lines.push(li);
      push({ kind: 'blockElse', id: bid, label: cleanLabel(m[2]), src: li });
      continue;
    }
    if (t === 'end') {
      const bid = blockStack.pop();
      if (bid !== undefined) {
        blocks.get(bid)?.lines.push(li);
        push({ kind: 'blockEnd', id: bid, src: li });
      } else if (box) { box.endLine = li; box = null; }
      continue;
    }
    const msg = splitMessage(t);
    if (msg) {
      const { from, arrow, act, to } = msg;
      touch(from); touch(to);
      const head: MessageHead = arrow.endsWith('>>') ? 'arrow' : arrow.endsWith('x') ? 'cross' : arrow.endsWith(')') ? 'async' : 'open';
      push({
        kind: 'message', id: `m${++mi}`, from, to, text: cleanLabel(msg.text),
        line: arrow.includes('--') ? 'dotted' : 'solid', head, both: arrow.startsWith('<<'),
        activate: act === '+', deactivate: act === '-', src: li,
      });
      continue;
    }
    if (/^(links?|properties|details)\b/.test(t)) continue;
    cannot(t, li);
  }
  return model;
}
