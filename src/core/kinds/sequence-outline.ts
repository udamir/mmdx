// The text outline of a sequence (the core's `outline`: for screen readers and copying).
import type { SequenceModel } from '../model.js';
import type { OutlineItem } from '../outline.js';

const one = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

export function outlineSequence(model: SequenceModel): OutlineItem[] {
  const name = new Map(model.participants.map((p) => [p.id, one(p.label)]));
  const out: OutlineItem[] = [];
  let n = 0;
  for (const it of model.items) {
    if (it.kind === 'message')
      out.push({ text: `${model.autonumber ? `${++n}. ` : ''}${name.get(it.from) ?? it.from} → ${name.get(it.to) ?? it.to}${it.text ? `: ${one(it.text)}` : ''}` });
    else if (it.kind === 'note') out.push({ text: `Note (${it.targets.map((t) => name.get(t) ?? t).join(', ')}): ${one(it.text)}` });
    else if (it.kind === 'blockStart') out.push({ text: `${it.block}${it.label ? ` ${one(it.label)}` : ''}` });
    else if (it.kind === 'blockElse') out.push({ text: `else${it.label ? ` ${one(it.label)}` : ''}` });
    else if (it.kind === 'blockEnd') out.push({ text: 'end' });
  }
  return out;
}
