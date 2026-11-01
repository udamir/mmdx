// The editor's part of the view parameters (A.8 rows 72, 73, 81, 82, 83): its export formats in the kernel's
// `Export` menu (.mmdx and .mmd, then SVG and PNG) and `setTheme` (no menu of its own: opening files and Auto
// layout are the `openFiles` and `autoLayout` actions, for hosts to offer where they want). The bar,
// the light / dark toggle and the theme menu are the standard `viewParams` module: the theme is the component's state
// and never touches the document (component architecture §7.5). The diagram type is shown on the page's own badge;
// the theme editor and Plain Mermaid live in the host's shell (<mmdx-studio>; `DiagramEditor.plainMermaid()`).
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

    // ---- export formats (the Export menu of the view params)
    if (f.export)
      for (const kind of f.exportFormats) {
        const [k, tip] = LABELS[kind]!;
        scope.contribute(core.exportFormats, { id: kind, label: t(k), ...(tip ? { title: t(tip) } : {}), section: kind === 'mmdx' || kind === 'mmd' ? 'text' : 'image', run: () => core.run('exportAs', kind) ?? undefined });
      }
  },
};
