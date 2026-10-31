// Feature modules of the editor (component architecture §7.2): the kernel's module contract on EditorCore. Each one
// installs gestures, overlay painters, shortcuts, actions and DOM through its scope (or on the core while installing,
// which records them in the scope), and may return a cleanup; the kernel suspends a module whose `when` no longer
// matches and uninstalls it with nothing left behind.
import type { ViewModule } from '../view/module.js';
import type { EditorCore } from './core.js';

export type { EditorFeatures } from './core.js';
export type EditorModule = ViewModule<EditorCore>;
