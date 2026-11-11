// The component shell (A8): what every mmdx element sets up the same way, whatever it shows — its shadow root, the
// shared i18n and an instance's core context, UI preference storage (replaceable at run time), popovers, dialogs
// (made on first use), the chrome's light / dark scheme remembered per product, and its DOM events. The view kernel
// (ViewCore) is built on it, and so are the two components without a scene kernel: the theme editor and the studio.
import { localStorageAdapter, memoryStorage } from '../adapters/storage.js';
import type { CoreContext } from '../core/context-base.js';
import type { IconPack } from '../core/icons/types.js';
import type { I18n } from '../i18n.js';
import { getShared, instanceContext } from '../platform/config.js';
import type { StorageAdapter } from '../ports.js';
import { Owner } from '../reactive/owner.js';
import type { ReadSignal } from '../reactive/signal.js';
import { Dialogs } from '../ui/kit/dialog.js';
import { watchUiScheme } from '../ui/kit/base.js';
import { PopoverManager } from '../ui/kit/popover.js';
import { schemeState, type Scheme, type SchemeState, type UiOption } from './theme.js';

/** Local storage where there is one, else memory (UI preferences only, never the document). */
export const defaultStorage = (): StorageAdapter => (typeof localStorage !== 'undefined' ? localStorageAdapter() : memoryStorage());

export interface ComponentShellOptions {
  /** The product (`viewer`, `editor`, `diff`, `studio`, `theme-editor`): the key its preferences are kept under. */
  product: string;
  storage?: StorageAdapter | undefined;
  ctx?: Partial<CoreContext> | undefined;
  iconPacks?: readonly IconPack[] | undefined;
  /** The chrome's scheme: light, dark, or auto (the page's, else the one the user picked last). */
  ui?: UiOption | undefined;
  /** The storage key of the picked scheme (default `<product>.ui`; the studio keeps its earlier `ui`). */
  schemeKey?: string;
}

export class ComponentShell {
  readonly product: string;
  readonly shadow: ShadowRoot;
  readonly i18n: I18n;
  readonly ctx: CoreContext;
  /** UI preferences; reads and writes reach the adapter set last (`setStorage`). */
  readonly storage: StorageAdapter;
  readonly popovers: PopoverManager;
  readonly owner: Owner;
  private prefs: StorageAdapter;
  private readonly schemes: SchemeState;
  private dlg: Dialogs | null = null;
  private gone = false;

  constructor(readonly host: HTMLElement, o: ComponentShellOptions) {
    this.product = o.product;
    this.owner = new Owner(o.product);
    this.i18n = getShared().i18n;
    this.prefs = o.storage ?? defaultStorage();
    this.storage = { get: (k) => this.prefs.get(k), set: (k, v) => this.prefs.set(k, v), remove: (k) => this.prefs.remove(k) };
    this.ctx = instanceContext(o.ctx, o.iconPacks);
    this.shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    this.popovers = new PopoverManager(this.shadow);
    this.schemes = schemeState(this.storage, o.schemeKey ?? `${o.product}.ui`, o.ui);
    this.owner.add(watchUiScheme(() => this.schemes.apply()));
    this.owner.add(() => this.popovers.close());
  }

  /** The chrome's scheme now (follows the page while `ui` is auto). */
  get scheme(): ReadSignal<Scheme> {
    return this.schemes.scheme;
  }

  /** The `ui` option (light, dark, auto). */
  setUi(ui: UiOption | undefined): void {
    this.schemes.setUi(ui);
  }

  /** The user picked a scheme: remembered for the product. */
  chooseScheme(s: Scheme): void {
    this.schemes.choose(s);
  }

  /** Changes where UI preferences live (the remembered scheme is read again). */
  setStorage(s: StorageAdapter | undefined): void {
    this.prefs = s ?? defaultStorage();
    this.schemes.apply();
  }

  /** Confirm and choice dialogs in the shadow root, made on first use. */
  get dialogs(): Dialogs {
    return (this.dlg ??= new Dialogs(this.shadow, this.i18n.t));
  }

  /**
   * Dispatches a DOM event from the host (`mmdx-*`, bubbling, composed). Returns false when a cancelable one was
   * prevented. A component being destroyed emits nothing (its modules closing on the way out are not user actions).
   */
  emit(type: string, detail: unknown, cancelable = false): boolean {
    if (this.gone) return true;
    return this.host.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));
  }

  destroy(): void {
    if (this.gone) return;
    this.gone = true;
    this.dlg?.destroy();
    this.owner.dispose();
  }
}
