// Shared types of the view kernel (component architecture §7): modes, stages, slots, and the actions and events every
// diagram component (viewer, editor, diff) has. Products extend the action and event maps with their own.
import type { DiagramMeta } from '../core/meta/types.js';
import type { DiagramModel } from '../core/model.js';
import type { Rect } from '../core/types.js';

/** Edit or View. The viewer and the diff are always `view`. */
export type Mode = 'edit' | 'view';

/** What the component shows: its document, or the History of it (§8.2). Orthogonal to the mode. */
export type Stage = 'document' | 'history';

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
  toggleHelp(on?: boolean): void;
  /** Opens or closes the History of the document (when there is a history). */
  toggleHistory(on?: boolean): void;
  /** Export formats of the installed modules, in menu order. */
  exportFormats(): ExportFormat[];
  /** The bounds of what the main canvas shows. */
  contentBounds(): Rect | null;
  setTool(tool: Tool): void;
  setPanel(name: string, open: boolean): void;
  /** The shown document's model (hover highlight, labels). */
  documentModel(): DiagramModel | null;
  /** The shown document's metadata (layers of the view settings). */
  documentMeta(): DiagramMeta | null;
  /** The shown document's Mermaid code (without `%%@` metadata), for the code view. */
  documentCode(): string | null;
}

/** Kernel events (no payload); products add their own. */
export type ViewEvent = 'draw' | 'view' | 'theme' | 'mode' | 'stage' | 'tool' | 'panels' | 'model' | 'selection' | 'overlay';

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
