// The editor's kind loader (A10g; T01: types load on demand): the kinds of a document's diagram type are loaded the
// first time it is drawn; meanwhile it draws as not yet supported, and once they arrive the host redraws. Callers can
// wait for them (`ready`), and a load can owe the view a fit that it could not do while the kind was missing.
import { detectType } from '../../core/parse/dispatch.js';
import type { DiagramType } from '../../core/types.js';

export interface KindLoaderHost {
  /** The type's kinds are loaded (`editorHasKind`). */
  has(t: DiagramType): boolean;
  /** Loads the type's kinds (`loadEditorKind`). */
  load(t: DiagramType): Promise<void>;
  /** The editor is on the page (or someone waits): a load that arrives after it left does nothing. */
  live(): boolean;
  /** The kinds arrived: parse and draw again; `fit`: the view owes the document a fit. */
  loaded(fit: boolean): void;
  failed(e: unknown): void;
}

export class KindLoader {
  private readonly waiters: (() => void)[] = [];
  private fit = false;

  constructor(private readonly host: KindLoaderHost) {}

  /** Loads the kinds of the code's diagram type when they are not loaded yet. */
  need(code: string): void {
    const t = detectType(code);
    if (!t || this.host.has(t)) return;
    void this.host.load(t).then(() => {
      if (!this.host.live() && !this.waiters.length) return;
      const fit = this.fit;
      this.fit = false;
      this.host.loaded(fit);
      this.release();
    }, (e: unknown) => {
      this.host.failed(e);
      this.release();
    });
  }

  /** Resolves once the kinds of the code's diagram type are loaded (at once when they are). */
  ready(code: string): Promise<void> {
    if (!this.missing(code)) return Promise.resolve();
    return new Promise((r) => {
      this.waiters.push(r);
      this.need(code);
    });
  }

  /** The view just fitted this code: when its kinds are still loading, fit again once they are (its bounds change). */
  oweFit(code: string): void {
    this.fit = this.missing(code);
  }

  /** The code's diagram type is known and its kinds are not loaded yet. */
  private missing(code: string): boolean {
    const t = detectType(code);
    return !!t && !this.host.has(t);
  }

  private release(): void {
    for (const f of this.waiters.splice(0)) f();
  }
}
