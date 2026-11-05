// Stock Mermaid in tests (T10.5): every op output of every kind must parse in Mermaid 12.2 (the dev dependency,
// `mermaid`) and 11.17 (`mermaid-11`, an alias of mermaid@11.17.2). The parsers load once per test file.
type Parser = (code: string) => Promise<unknown>;

export type MermaidVersion = '12' | '11';
export const MERMAID_VERSIONS: readonly MermaidVersion[] = ['12', '11'];

let loaded: Promise<Record<MermaidVersion, Parser>> | null = null;

function load(): Promise<Record<MermaidVersion, Parser>> {
  loaded ??= (async () => {
    const [{ default: m12 }, { default: m11 }] = await Promise.all([import('mermaid'), import('mermaid-11')]);
    m12.initialize({ startOnLoad: false });
    m11.initialize({ startOnLoad: false });
    return { '12': (code) => m12.parse(code), '11': (code) => m11.parse(code) };
  })();
  return loaded;
}

/** Whether each Mermaid version reads the code. */
export async function stockResults(code: string): Promise<Record<MermaidVersion, boolean>> {
  const p = await load();
  const ok = async (v: MermaidVersion): Promise<boolean> => {
    try {
      await p[v](code);
      return true;
    } catch {
      return false;
    }
  };
  const [a, b] = await Promise.all([ok('12'), ok('11')]);
  return { '12': a, '11': b };
}

/** Resolves when both Mermaid versions read the code; rejects with the first version's error otherwise. */
export async function stockParse(code: string): Promise<true> {
  const p = await load();
  for (const v of MERMAID_VERSIONS) {
    try {
      await p[v](code);
    } catch (e) {
      throw new Error(`Mermaid ${v} rejects it: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return true;
}

/** True when both Mermaid versions read the code. */
export async function stockOk(code: string): Promise<boolean> {
  const r = await stockResults(code);
  return r['12'] && r['11'];
}

/** True when neither Mermaid version reads the code. */
export async function stockRejects(code: string): Promise<boolean> {
  const r = await stockResults(code);
  return !r['12'] && !r['11'];
}
