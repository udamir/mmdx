// Feature modules of the editor. Each one installs gestures, overlay painters, shortcuts, actions and DOM on the
// EditorCore, and returns a cleanup function that removes everything it added (§8: no leaks on disconnect).
import type { EditorCore, EditorFeatures } from './core.js';

export interface EditorModule {
  id: string;
  /** Scoped CSS adopted into the editor's shadow root. */
  css?: string;
  /** Install only when this returns true (feature flags, read-only…). */
  enabled?(features: EditorFeatures): boolean;
  install(core: EditorCore): () => void;
}
