// Shared types of the view kernel (component architecture §7): modes, stages, slots, and the actions and events every
// diagram component (viewer, editor, diff) has. Products extend the action and event maps with their own.
import type { DiagramMeta } from '../core/meta/types.js';
import type { DiagramModel } from '../core/model.js';

/** Edit or View. The viewer and the diff are always `view`. */
export type Mode = 'edit' | 'view';

/**
 * What the component shows (§8.2), orthogonal to the mode: its document; an old version of it, read-only in the
 * document's own scene (History, a version picked; the editor); or History's comparison (or a version in a host
 * without a document scene of its own).
 */
export type Stage = 'document' | 'version' | 'history';

/** Named places in the shell that modules fill (§7.1). */
export type SlotName =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'left-stack'
  | 'left-dock'
  | 'right-stack'
  | 'bottom-center'
  | 'bottom-right'
  | 'canvas'
  | 'overlay';

export type Tool = 'pointer' | 'hand' | 'pen' | 'shapes' | 'paint';

/** Display settings shared by every canvas (view settings card). */
export interface Display {
  labels: boolean;
  hoverHighlight: boolean;
  /** Animated edges move (T06; `prefers-reduced-motion` stops them as well). */
  animate: boolean;
}

/** An export entry contributed by a module (`exportFormats`). */
export interface ExportFormat {
  id: string;
  label: string;
  title?: string;
  /** Entries with the same section are grouped; sections are separated. */
  section?: string;
  run(): void | Promise<void>;
}

/** Actions every component may provide; modules call them through `core.run()`. */
export interface ViewActions {
  fitView(): void;
  /**
   * Opens or closes the History of the document (when there is a history). Opening shows the version panel only;
   * `compare`: opens on the newest change compared (the studio's Diff).
   */
  toggleHistory(on?: boolean, opts?: { compare?: boolean }): void;
  /** Export formats of the installed modules, in menu order. */
  exportFormats(): ExportFormat[];
  setTool(tool: Tool): void;
  setPanel(name: string, open: boolean): void;
  /** The shown document's model (hover highlight, labels). */
  documentModel(): DiagramModel | null;
  /** The shown document's metadata (layers of the view settings). */
  documentMeta(): DiagramMeta | null;
  /** The shown document's Mermaid code (without `%%@` metadata), for the code view. */
  documentCode(): string | null;
  /** The document's full source as it is now (History's working copy). */
  documentSource(): string | null;
  /** File name stem of exports. */
  documentName(): string;
  /** Opens a version in the document as one undoable change (the editor; History's Restore). */
  restoreVersion(source: string, version: { id: string }): void;
  /** Puts copied items on the host's item clipboard (the editor; copying from History). */
  setClipboard(data: unknown): void;
  /**
   * Shows a version of the document read-only in the host's own scene, drawn as the document is (the editor;
   * History's version view), or the document again (null). Nothing writes the document while a version shows.
   */
  showVersion(version: { id: string; source: string } | null): void;
}

/**
 * Kernel events, by name → payload (`void`: none). An open map: a product extends it (`interface MyEvents extends
 * ViewEvents { … }`) and passes it to `ViewCore<Actions, Panels, MyEvents>`.
 */
export interface ViewEvents {
  /** The attached scene painted. */
  draw: void;
  /** Pan, zoom or the canvas insets changed. */
  view: void;
  theme: void;
  mode: void;
  stage: void;
  tool: void;
  panels: void;
  model: void;
  selection: void;
  overlay: void;
  /** The shown document changed (a new source). */
  document: void;
}

export type ViewEvent = keyof ViewEvents;

/** A button a module adds to the tool dock (the toolDock module renders them by section, then order). */
export interface DockItem {
  id: string;
  /** `tools` (hand, pen, editor tools), `panels` (panel toggles, History), `edit` (undo / redo, own card). */
  section: 'tools' | 'panels' | 'edit';
  order: number;
  el: HTMLElement;
}

/** A side panel a module adds to a panel stack (left: code, History; right: view settings, changes). */
export interface PanelItem {
  id: string;
  side: 'left' | 'right';
  order: number;
  /** The panel element (a SidePanel block's element). */
  el: HTMLElement;
  /** Shown only while this is true (and the panel is open), e.g. the diff's change list outside History mode. */
  visible?: () => boolean;
}
