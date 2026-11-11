// The manifest line of a kind plugin (A11c/A11e): one call registers a new diagram type everywhere a component looks
// for one — its header and starter (core/kinds/info.ts), where its view, diff and extras kinds load
// (platform/kinds.ts), its theme editor section (core/schema/style-fields.ts) and what the UIs show of it
// (ui/diagram/kind-ui.ts). The editor's side is `registerEditorKind` (editor/kinds/loader.ts). The kind API is
// internal (decision 2026-11-10); this is the shape a public one would take.
import { registerKindInfo, type KindInfo } from '../core/kinds/info.js';
import { registerThemeSection, type ThemeSection } from '../core/schema/style-fields.js';
import { registerKindModules, type KindModules } from '../platform/kinds.js';
import { registerKindUi, type KindUi } from '../ui/diagram/kind-ui.js';

export interface KindPlugin {
  /** The type, its header, starter, i18n name key and whether it has Mermaid style statements. */
  readonly info: KindInfo;
  /** Where its view kind (required), diff kind and extras kind (outline, portable styles) load from. */
  readonly modules: KindModules;
  /** Its section in the theme editor (the theme JSON's section of the same name). */
  readonly themeSection?: ThemeSection;
  /** Its names, previews, pictogram and theme editor sample. */
  readonly ui?: KindUi;
}

export function registerKindPlugin(p: KindPlugin): void {
  registerKindInfo(p.info);
  registerKindModules(p.info.type, p.modules);
  if (p.themeSection) registerThemeSection(p.info.type, p.themeSection);
  if (p.ui) registerKindUi(p.info.type, p.ui);
}
