import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { CODE_VIEW_CSS, createCodeView, type CodeLanguage, type CodeViewProps } from '../../src/ui/blocks/code-view.js';
import { createI18n } from '../../src/i18n.js';
import { diffLines } from '../../src/core/diff/text.js';
import { DIFF_TOKENS } from '../../src/diff/styles.js';
import { chromeHost, exampleHistory } from '../support.js';

type Args = { mode: 'plain' | 'diff'; language: CodeLanguage; example: string; narrowed: boolean; copy: boolean; ui: 'light' | 'dark' };

/** Mermaid code or `%%@` metadata lines of a source. */
const part = (src: string, language: CodeLanguage): string[] =>
  src.replace(/\n$/, '').split('\n').filter((l) => (language === 'meta') === l.trimStart().startsWith('%%@'));

/** The two newest versions of an example history: one as a listing, or the diff between them. */
function codeView(a: Args): HTMLElement {
  const { host, root } = chromeHost([DIFF_TOKENS, CODE_VIEW_CSS, '.card{width:520px;height:560px;display:flex;flex-direction:column;overflow:hidden;background:var(--mmdx-surface);border:1px solid var(--mmdx-border);border-radius:14px;box-shadow:var(--mmdx-shadow);}'], { ui: a.ui });
  const versions = exampleHistory(a.example);
  const before = part(versions[1]?.source ?? '', a.language), after = part(versions[0]?.source ?? '', a.language);
  const t = createI18n().t;
  // the narrowing: the changed lines of the after side and the lines around them, as the diff selects an item's lines
  const changed = new Set(after.flatMap((l, i) => (before.includes(l) ? [] : [i])));
  const sel = { a: new Set<number>(), b: new Set([...changed].slice(0, 3)), label: 'first changes' };
  const label = a.language === 'meta' ? 'Metadata' : 'Mermaid code';
  let narrowed = a.narrowed;
  const props = (): CodeViewProps => (a.mode === 'plain'
    ? { mode: 'plain', lines: after, language: a.language, label, t, copy: a.copy }
    : { mode: 'diff', a: before, b: after, ops: diffLines(before, after), language: a.language, label, t, copy: a.copy, notes: ['style removed'], sel: narrowed ? sel : null, onShowAll: () => ((narrowed = false), cv.update(props())) });
  const cv = createCodeView(props());
  const card = document.createElement('div');
  card.className = 'card';
  card.append(cv.el);
  root.append(card);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/CodeView',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Read-only highlighted code. `plain`: a numbered listing (the viewer\'s code view, History mode). `diff`: the unified ' +
          'line diff of two sources with both line numbers, collapsed unchanged runs ("⋯ N unchanged lines" expands them) and ' +
          'the narrowing to the lines of one item with "Show all". Mermaid or `%%@` metadata highlighting, optional Copy.',
      },
    },
  },
  render: (a) => codeView(a),
  argTypes: {
    mode: { control: 'inline-radio', options: ['plain', 'diff'] },
    language: { control: 'inline-radio', options: ['mermaid', 'meta'] },
    example: { control: 'select', options: ['production-microservices', 'docker-deploy-sequence', 'atom-schema-er', 'fusion-services', 'microservice-patterns', 'simple-flow'] },
    narrowed: { control: 'boolean', description: 'Diff: narrow to a few changed lines (as when a change is selected).' },
    copy: { control: 'boolean' },
    ui: { control: 'inline-radio', options: ['light', 'dark'] },
  },
  args: { mode: 'diff', language: 'mermaid', example: 'production-microservices', narrowed: false, copy: true },
};
export default meta;

type Story = StoryObj<Args>;

export const Diff: Story = {};
export const Narrowed: Story = { args: { narrowed: true } };
export const Metadata: Story = { args: { language: 'meta' } };
export const Plain: Story = { args: { mode: 'plain' } };
export const Dark: Story = { args: { ui: 'dark' } };
