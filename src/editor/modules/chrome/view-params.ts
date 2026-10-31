// The editor's part of the view parameters (A.8 rows 72, 73, 81, 82, 83): its export formats in the kernel's
// `Export ▾` menu (.mmdx and .mmd, then SVG and PNG), the ⋯ menu with Open… and Auto layout, and `setTheme`. The bar,
// the light / dark toggle and the theme menu are the standard `viewParams` module: the theme is the component's state
// and never touches the document (component architecture §7.5). The diagram type is shown on the page's own badge;
// the theme editor and Plain Mermaid live in the host's shell (<mmdx-studio>; `DiagramEditor.plainMermaid()`).
import { attachMenu, type MenuEntry } from '../../../ui/blocks/menu.js';
import { h, icon } from '../../../ui/h.js';
import { ICONS } from '../../../ui/icons.js';
import type { EditorModule } from '../../module.js';

const LABELS: Record<string, [string, string]> = {
  mmdx: ['export.mmdx', 'export.mmdxTip'], mmd: ['export.mmd', 'export.mmdTip'], svg: ['export.svg', ''], png: ['export.png', 'export.pngTip'],
};

export const editorParamsModule: EditorModule = {
  id: 'editor-params',
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const f = core.features;

    core.provide('setTheme', (id) => core.themes.choose(id));

    // ---- export formats (the Export ▾ menu of the view params)
    if (f.export)
      for (const kind of f.exportFormats) {
        const [k, tip] = LABELS[kind]!;
        scope.contribute(core.exportFormats, { id: kind, label: t(k), ...(tip ? { title: t(tip) } : {}), section: kind === 'mmdx' || kind === 'mmd' ? 'text' : 'image', run: () => core.run('exportAs', kind) ?? undefined });
      }

    // ---- ⋯ more: open, auto layout
    let fileInput: HTMLInputElement | null = null;
    if (f.open) {
      fileInput = h('input', { type: 'file', accept: '.mmdx,.mmd,.md,.txt,.json', multiple: true, hidden: true });
      scope.listen(fileInput, 'change', () => {
        const files = fileInput?.files;
        if (files?.length) void core.run('openFiles', Array.from(files));
        if (fileInput) fileInput.value = '';
      });
    }
    const moreBtn = h('button', { type: 'button', class: 'vp-btn', title: t('more.title'), 'aria-label': t('more.title') }, icon(ICONS.more, 18));
    const moreEntries = (): MenuEntry[] => {
      const out: MenuEntry[] = [];
      const editing = core.mode.peek() === 'edit';
      if (f.open && editing && core.has('openFiles')) out.push({ label: t('more.open'), title: t('more.openTip'), run: () => fileInput?.click() });
      if (f.autoLayout && editing && core.has('autoLayout') && core.model.type) out.push({ label: t('more.autoLayout'), title: t('more.autoLayoutTip'), run: () => core.run('autoLayout') });
      return out;
    };
    scope.onDispose(attachMenu({ button: moreBtn, popovers: core.popovers, label: t('more.title'), entries: moreEntries, within: () => core.root }));
    const more = h('span', { class: 'vp-more', style: 'display:contents' }, moreBtn, fileInput);
    scope.contribute(core.paramItems, { id: 'more', section: 'tools', order: 10, el: more });
    const syncMore = (): void => {
      moreBtn.hidden = !moreEntries().length;
    };
    core.on('mode', syncMore);
    core.on('model', syncMore);
    core.on('draw', syncMore);
    queueMicrotask(syncMore);
  },
};
