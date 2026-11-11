// Importing an element module must not throw outside a browser (SSR frameworks import components on the server;
// Node build scripts import entry points). Elements extend this instead of HTMLElement directly.
export const ElementBase: typeof HTMLElement =
  typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as unknown as typeof HTMLElement);

/** Options to change; one set to `undefined` goes back to its default. */
export type Patch<O> = { [K in keyof O]?: O[K] | undefined };

/** An attribute: the option it sets and its value as that option (`null`: absent; `undefined`: the option's default). */
export type AttrSpec<O> = readonly [key: keyof O, parse: (v: string | null) => unknown];

const warned = new Set<string>();

const propertyLists = new WeakMap<object, readonly string[]>();

/**
 * The properties an element class has: every accessor with a setter on its prototype chain below HTMLElement (the
 * one list the React wrapper and the lazy-property upgrade read, so they cannot drift from the element; B15, B16).
 */
export function elementProperties(cls: CustomElementConstructor | (abstract new () => HTMLElement)): readonly string[] {
  let list = propertyLists.get(cls);
  if (!list) {
    const names = new Set<string>();
    for (let p = cls.prototype as object | null; p && p !== ElementBase.prototype && p !== Object.prototype; p = Object.getPrototypeOf(p))
      for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(p))) if (d.set && !k.startsWith('_')) names.add(k);
    list = [...names];
    propertyLists.set(cls, list);
  }
  return list;
}

/** Warns once per message (an option that cannot change on a live component). */
export function warnOnce(msg: string): void {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(`[mmdx] ${msg}`);
}

// ---- inline sources: <script type="text/mermaid"> ----------------------------------------------------------------

/**
 * Text safe inside `<script type="text/mermaid">` (B17): `</script` would end the element, and `<!--` followed by
 * `<script` would make the parser swallow the rest of the page, so `<!--`, `<script` and `</script` are broken with a
 * backslash. `readInlineSource` takes the backslashes out again.
 */
export const scriptSafe = (s: string): string => s.replace(/<(!--|\/?script)/gi, '<\\$1');

/** The reverse of `scriptSafe`. */
export const scriptUnsafe = (s: string): string => s.replace(/<\\(!--|\/?script)/gi, '<$1');

/** Removes the common indentation of an inline `<script type="text/mermaid">` block. */
export function dedent(s: string): string {
  const lines = s.replace(/^\s*\n/, '').trimEnd().split('\n');
  let ind = Infinity;
  for (const l of lines) if (l.trim()) ind = Math.min(ind, /^[ \t]*/.exec(l)![0].length);
  return Number.isFinite(ind) && ind > 0 ? lines.map((l) => l.slice(ind)).join('\n') : lines.join('\n');
}

/**
 * The source written inside an element (`<script type="text/mermaid">` or `text/x-mermaid`, else a `data-source`
 * attribute): scriptSafe reversed and the common indentation removed — the same for the viewer and the editor (B17).
 */
export function readInlineSource(host: Element): string | null {
  const script = host.querySelector(':scope > script[type="text/mermaid"], :scope > script[type="text/x-mermaid"]');
  const raw = script?.textContent ?? host.getAttribute('data-source');
  return raw == null ? null : dedent(scriptUnsafe(raw));
}

/** A space-separated list attribute (`controls`, `features`): the named entries; `none` is the empty list. */
export const words = (v: string): string[] => (v === 'none' ? [] : v.split(/[\s,]+/).filter(Boolean));

/**
 * The custom elements' common lifecycle. Options set as properties go to one store, connected or not, and are reused
 * whenever the component is created; an attribute change applies just that option (`undefined` when removed) and
 * replaces a value set earlier as a property. Moving the element in the DOM keeps its component: destroying waits a
 * microtask and is skipped when the element is connected again by then (a move keeps the document, the undo history,
 * the selection and an open History).
 */
export abstract class MmdxElement<O extends object, I extends { destroy(): void }> extends ElementBase {
  /** The options set as properties (what is not an attribute). */
  protected props: Partial<O> = {};
  private inst: I | null = null;

  /** Attribute name → option (the attributes observed). */
  protected abstract attrs(): Readonly<Record<string, AttrSpec<O>>>;
  /** Creates the component from the attributes and the properties. */
  protected abstract create(o: Partial<O>): I;
  /** Applies changed options to the live component. */
  protected abstract apply(inst: I, patch: Patch<O>): void;
  /** Called before the component is destroyed (not on a move): keep what the next one should start from. */
  protected keep(_inst: I): void {}

  private upgraded = false;

  connectedCallback(): void {
    if (!this.upgraded) {
      this.upgraded = true;
      this.upgradeProperties();
    }
    this.inst ??= this.create({ ...this.attrOptions(), ...this.props });
  }

  /**
   * A property set on the element before its class was defined (`el.source = …` and then `define()`, or a framework
   * that sets properties first) is an own data property that hides the class's accessor: it is taken off and set
   * again through the accessor (B16).
   */
  private upgradeProperties(): void {
    const self = this as unknown as Record<string, unknown>;
    for (const k of elementProperties(this.constructor as CustomElementConstructor)) {
      if (!Object.hasOwn(this, k)) continue;
      const v = self[k];
      delete self[k];
      self[k] = v;
    }
  }

  disconnectedCallback(): void {
    queueMicrotask(() => {
      const inst = this.inst;
      if (this.isConnected || !inst) return;
      this.inst = null;
      this.keep(inst);
      inst.destroy();
    });
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    const a = this.attrs()[name];
    if (!a || old === value) return;
    delete this.props[a[0]];
    if (this.inst) this.apply(this.inst, { [a[0]]: a[1](value) } as Patch<O>);
  }

  /** The component (advanced use); null while the element is not connected. */
  get instance(): I | null {
    return this.isConnected ? this.inst : null;
  }

  /** The live component, also between a disconnect and its deferred destroy. */
  protected get live(): I | null {
    return this.inst;
  }

  /** Sets options as properties: remembered, and applied to the live component. */
  protected setOpt(patch: Patch<O>): void {
    for (const k of Object.keys(patch) as (keyof O)[]) {
      if (patch[k] === undefined) delete this.props[k];
      else this.props[k] = patch[k] as O[keyof O];
    }
    if (this.inst) this.apply(this.inst, patch);
  }

  protected attrOptions(): Partial<O> {
    const o: Partial<O> = {};
    for (const [name, [key, parse]] of Object.entries(this.attrs())) {
      const v = parse(this.getAttribute(name));
      if (v !== undefined) o[key] = v as O[keyof O];
    }
    return o;
  }
}
