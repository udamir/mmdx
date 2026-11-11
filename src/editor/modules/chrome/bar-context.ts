// What the editor's toolbars share (5.5): the core, the messages, the live edit that coalesces a slider's changes
// into one history step, and the item the bars act on.
import type { EditorCore, Sel } from '../../core.js';
import type { LiveEdit } from '../../ops/live.js';
import type { ItemRef } from '../../../core/types.js';

export interface BarContext {
  core: EditorCore;
  t: EditorCore['i18n']['t'];
  live: LiveEdit;
  /** The item the bars act on: the one whose text is edited, else the first selected (null outside Edit). */
  primary(): Sel | null;
  /** Several items are selected. */
  multi(): boolean;
}

/** A key of a list of items (what a bar shows changed when it changes). */
export const selectionKey = (sel: readonly ItemRef[]): string => sel.map((x) => `${x.kind}:${x.id}`).join('|');
