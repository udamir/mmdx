// DiffExporter (A13c): the export half of a DiffSession — a standalone SVG or PNG of the view shown, the shown
// versions' sources (as they are, or portable Mermaid), the unified code diff and the change report. File name and
// content come from the same `shown` model (B23); the PNG rasteriser and the download load on first use.
import { getShared } from '../platform/config.js';
import type { CoreContext } from '../core/context.js';
import type { DiffIgnore } from '../core/diff/index.js';
import { diffSvg, type DiffRendered, type DiffSvgOptions } from '../core/diff/render.js';
import { diffReport, unifiedDiff, type VersionInfo } from '../core/diff/report.js';
import { renderSourceWith, standaloneSvg, type Rendered } from '../core/pipeline-core.js';
import { loadedKinds, loadExtrasKind, renderShapes } from '../platform/kinds.js';
import { detectType } from '../core/parse/dispatch.js';
import type { Translate } from '../ui/blocks/block.js';
import type { ReadSignal } from '../reactive/signal.js';
import type { DiffExportKind, DiffExportOptions, DiffViewName } from '../view/history.js';
import { loadKindsOf } from './kinds.js';
import type { Shown } from './shown.js';

/** What the exporter reads of its session. */
export interface ExportSource {
  readonly shown: ReadSignal<Shown>;
  readonly base: ReadSignal<string | null>;
  readonly head: ReadSignal<string | null>;
  /** The viewed version (also outside History mode: the one `version: 'viewed'` exports). */
  readonly viewing: ReadSignal<string | null>;
  readonly rendered: ReadSignal<DiffRendered | null>;
  readonly view: ReadSignal<DiffViewName>;
  readonly dim: ReadSignal<boolean>;
  readonly ignore: ReadSignal<DiffIgnore>;
  readonly versions: ReadSignal<readonly VersionInfo[]>;
  /** The viewed version's picture once it is rendered (never another version's under its name). */
  viewedPicture(): Rendered | null;
  sourceOf(id: string | null): Promise<string>;
}

export interface ExporterOptions {
  ctx: CoreContext;
  t: Translate;
  emit(type: string, detail: unknown, cancelable?: boolean): boolean;
  scheme(): 'light' | 'dark';
  name(): string;
}

export class DiffExporter {
  constructor(private readonly s: ExportSource, private readonly o: ExporterOptions) {}

  /** Standalone SVG of a view (default: the current one), or of the viewed version in History mode. */
  toSvg(o: DiffExportOptions = {}): string {
    const s = this.s;
    if (s.shown.peek().kind === 'version') {
      const plain = s.viewedPicture();
      return plain ? standaloneSvg(plain) : '';
    }
    const D = s.rendered.peek();
    if (!D) return '';
    const view = o.view ?? s.view.peek();
    const t = this.o.t;
    const label = (id: string | null, fallback: string): string => (id ? `${fallback} · ${id}` : fallback);
    const so: DiffSvgOptions = {
      view: view === 'merged' && !D.merged ? 'after' : view, dim: s.dim.peek(), highlights: o.highlights ?? true, legend: o.legend ?? true,
      scheme: o.scheme ?? this.o.scheme(),
      titles: { before: label(s.base.peek(), t('diff.view.before')), after: label(s.head.peek(), t('diff.view.after')) },
    };
    return diffSvg(D, so);
  }

  async toPng(o: DiffExportOptions = {}): Promise<Blob> {
    const svg = this.toSvg(o);
    if (!svg) throw new Error('Nothing rendered');
    const m = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(svg);
    const { fontsMissing, svgToPng, imagesMissing } = await import('../dom/export.js');
    const bg = this.s.rendered.peek()?.after.result.page.background;
    const res = await svgToPng(svg, Number(m?.[1] ?? 800), Number(m?.[2] ?? 600), { scale: Math.min(4, Math.max(1, o.scale ?? 2)), fonts: getShared().fonts, ...(bg && bg !== 'transparent' ? { background: bg } : {}) });
    // the diff reports what its PNG drew without too, as the viewer and the editor do
    if (res.missingFonts.length) this.o.emit('mmdx-error', { diagnostics: [fontsMissing(res.missingFonts)] });
    if (res.missingImages) this.o.emit('mmdx-error', { diagnostics: [imagesMissing(res.missingImages)] });
    return res.blob;
  }

  /** Builds an export and offers it to the host (`mmdx-export`, cancelable), else downloads it. */
  async exportAs(kind: DiffExportKind, o: DiffExportOptions = {}): Promise<void> {
    const s = this.s;
    const name = this.fileName(kind, o);
    let data: string | Blob;
    let type = 'text/plain';
    const D = s.rendered.peek();
    switch (kind) {
      case 'svg':
        data = this.toSvg(o);
        if (!data) return;
        type = 'image/svg+xml';
        break;
      case 'png':
        data = await this.toPng(o);
        break;
      case 'mmdx':
      case 'mmd': {
        const src = await s.sourceOf(this.versionId(o.version));
        data = kind === 'mmd' ? await this.portable(src) : src;
        break;
      }
      case 'diff': {
        if (!D) return;
        const [a, b] = await Promise.all([s.sourceOf(s.base.peek()), s.sourceOf(s.head.peek())]);
        data = unifiedDiff(a, b, { name: `${this.o.name()}.mmdx`, ...(o.filtered === false ? {} : { ignore: s.ignore.peek() }) });
        type = 'text/x-diff';
        break;
      }
      case 'json':
      case 'md': {
        if (!D) return;
        const info = (id: string | null): VersionInfo | undefined => (id ? s.versions.peek().find((v) => v.id === id) : undefined);
        const before = info(s.base.peek()), after = info(s.head.peek());
        data = diffReport(o.filtered === false ? D.raw : D.diff, { format: kind === 'md' ? 'markdown' : 'json', name: this.o.name(), ...(before ? { before } : {}), ...(after ? { after } : {}) });
        type = kind === 'md' ? 'text/markdown' : 'application/json';
        break;
      }
      default:
        return;
    }
    if (!this.o.emit('mmdx-export', { kind, name, data }, true)) return;
    const { download } = await import('../dom/export.js');
    download(name, data, type);
  }

  private fileName(kind: DiffExportKind, o: DiffExportOptions): string {
    const s = this.s, shown = s.shown.peek();
    const stem = this.o.name();
    const safe = (x: string | null): string => (x ?? '').replace(/[^\w.-]+/g, '_');
    if (kind === 'mmdx' || kind === 'mmd') return `${stem}-${safe(this.versionId(o.version))}.${kind}`;
    if (shown.kind === 'version' && (kind === 'svg' || kind === 'png')) return `${stem}-${safe(shown.id)}.${kind}`;
    const view = kind === 'svg' || kind === 'png' ? `-${o.view ?? s.view.peek()}` : '';
    return `${stem}-${safe(s.base.peek())}..${safe(s.head.peek())}${view}.${kind}`;
  }

  /**
   * The version a source export writes — one answer for its name and its content (B23): `before` / `after` the
   * comparison's ends, `viewed` the version shown, none: the version shown when one is, else the after version.
   */
  private versionId(which: DiffExportOptions['version']): string | null {
    const s = this.s, shown = s.shown.peek();
    if (which === 'before') return s.base.peek();
    if (which === 'after') return s.head.peek();
    return which === 'viewed' || shown.kind === 'version' ? s.viewing.peek() : s.head.peek();
  }

  private async portable(src: string): Promise<string> {
    const type = detectType(src);
    const [{ toPortableMermaid }] = await Promise.all([import('../core/export/portable.js'), loadKindsOf(src), type ? loadExtrasKind(type) : null]);
    const r = await renderShapes(() => renderSourceWith(loadedKinds(), src, this.o.ctx));
    return toPortableMermaid(r.doc.code, r.doc.meta, r.model, r.theme, r.rctx.color);
  }
}
