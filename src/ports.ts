// The host interfaces (architecture §8.1 `ports`): what a host plugs in. Types only; src/adapters/ has the
// implementations that ship with mmdx.

/** Minimal surface of stock Mermaid used by the fallback renderer and the plain-Mermaid compare view. */
export interface MermaidLike {
  initialize(cfg: Record<string, unknown>): void;
  render(id: string, text: string, container?: Element): Promise<{ svg: string }>;
  /** Mermaid 11.1+: the icon packs `fa:` tokens, icon nodes and architecture diagrams draw from (T04: mmdx forwards its packs). */
  registerIconPacks?(packs: { name: string; icons?: unknown; loader?: () => Promise<unknown> }[]): void;
}
