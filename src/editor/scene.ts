// StoreScene (component architecture §7.3): the editor's scene source. The document store → a synchronous render
// (gestures preview through it), the selection decorations and the overlay painters. Only paints while attached:
// a change while another scene owns the canvas (History) marks it dirty, and it repaints in full when it is back.
import { BaseScene } from '../view/scene.js';
import type { EditorCore } from './core.js';

export class StoreScene extends BaseScene {
  readonly id = 'store';

  constructor(private readonly core: EditorCore) {
    super();
  }

  protected paint(): void {
    this.core.paintDocument();
  }
}
