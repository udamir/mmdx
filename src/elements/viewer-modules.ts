// The viewer's own module: its export formats (SVG, PNG, the source as .mmdx) for the view-params Export menu.
import type { ViewCore } from '../view/core.js';
import type { ViewModule } from '../view/module.js';

/** What the export formats need from the viewer (not the viewer itself: this chunk does not depend on it). */
export interface ExportSource {
  readonly fileName: string;
  readonly sourceText: string | null;
  toSvg(): string;
  toPng(): Promise<Blob>;
}

export function viewerExportModule(viewer: ExportSource): ViewModule<ViewCore> {
  return {
    id: 'viewer-export',
    enabled: (core) => core.feature('export'),
    install(scope) {
      const core = scope.core;
      const t = core.i18n.t;
      const download = async (file: string, data: string | Blob, type?: string): Promise<void> => (await import('../dom/export.js')).download(file, data, type);
      const name = (): string => viewer.fileName;
      scope.contribute(core.exportFormats, { id: 'svg', label: t('export.svg'), section: 'image', run: () => download(`${name()}.svg`, viewer.toSvg(), 'image/svg+xml') });
      scope.contribute(core.exportFormats, { id: 'png', label: t('export.png'), section: 'image', run: async () => download(`${name()}.png`, await viewer.toPng()) });
      scope.contribute(core.exportFormats, { id: 'mmdx', label: t('export.mmdx'), section: 'source', run: () => download(`${name()}.mmdx`, viewer.sourceText ?? '') });
    },
  };
}
