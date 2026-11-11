<script setup lang="ts">
// A live mmdx component on a docs page, built from the library's source (src/) like the demo site and Storybook.
// The element is created in the browser only (the pages are pre-rendered in Node); attributes other than the props
// below go to the element as they are (`controls="zoom layers"`, `read-only`, `view="side"`…).
//
//   ```mermaid controls="zoom layers"      a live viewer of the block (the markdown config emits <MmdxDemo code=…>)
//   <MmdxDemo example="simple-flow" />      a viewer of a shipped example (examples/<id>.mmdx); `history` adds its versions
//   <MmdxDemo kind="editor" example="…" />  an editor on an in-memory document
//   <MmdxDemo kind="diff" sample="flow-few" />  a diff of a sample pair (apps/studio-site/diff-samples), or `example` + `history`
//   <MmdxDemo kind="theme-editor" />        the theme editor on an in-memory store of the built-in themes
import { onMounted, ref, useAttrs } from 'vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    kind?: 'viewer' | 'editor' | 'diff' | 'theme-editor';
    /** URI-encoded Mermaid source (from a ```mermaid block). */
    code?: string;
    /** A shipped example's id. */
    example?: string;
    /** Give the component the example's version history. */
    history?: boolean;
    /** A diff sample pair's name. */
    sample?: string;
    /** CSS height of the component (the viewer sizes itself by default). */
    height?: string;
  }>(),
  { kind: 'viewer', history: false },
);

const attrs = useAttrs();
const host = ref<HTMLElement | null>(null);
const failed = ref('');

const examples = import.meta.glob<string>('../../../examples/*.mmdx', { query: '?raw', import: 'default' });
const histories = import.meta.glob<{ versions: { id: string; source: string }[] }>('../../../examples/history/*.json', { import: 'default' });
const samples = import.meta.glob<string>('../../../apps/studio-site/diff-samples/*.mmd', { query: '?raw', import: 'default' });

const themeFiles = import.meta.glob<unknown>('../../../themes/*.theme.json', { import: 'default' });
let themesReady: Promise<void> | null = null;

// every shipped theme, registered once from the bundle (no theme source to fetch from): the theme menus list them
// and `theme="dracula"` works on any demo
function registerShippedThemes(): Promise<void> {
  return (themesReady ??= (async () => {
    const [{ registerThemes }, files] = await Promise.all([import('../../../src/platform/themes.js'), Promise.all(Object.values(themeFiles).map((f) => f()))]);
    registerThemes(files);
  })());
}

const DEFAULT_HEIGHT: Record<string, string> = { editor: '560px', diff: '600px', 'theme-editor': '640px' };

async function load<T>(files: Record<string, () => Promise<T>>, name: string): Promise<T> {
  const key = Object.keys(files).find((k) => k.endsWith(`/${name}`));
  if (!key) throw new Error(`no file ${name}`);
  return files[key]!();
}

async function exampleSource(): Promise<string> {
  if (props.code !== undefined) return decodeURIComponent(props.code);
  if (props.example) return load(examples, `${props.example}.mmdx`);
  return '';
}

async function versions() {
  return props.history && props.example ? (await load(histories, `${props.example}.json`)).versions : undefined;
}

async function create(): Promise<HTMLElement> {
  // each kind's entry registers its element on import
  switch (props.kind) {
    case 'editor': {
      const [{ memoryDocumentAdapter }, { memoryStorage }] = await Promise.all([
        import('../../../src/adapters/documents.js'),
        import('../../../src/adapters/storage.js'),
        import('../../../src/editor.js'),
      ]);
      const el = document.createElement('mmdx-editor') as HTMLElement & Record<string, unknown>;
      // the docs column is narrow: the canvas starts alone (the tool dock opens the panels), and UI preferences stay
      // with the page instead of following the reader from demo to demo
      el['storage'] = memoryStorage();
      el['panels'] = { code: false, properties: false, layers: false };
      el['adapter'] = memoryDocumentAdapter(await exampleSource(), props.example ?? 'diagram');
      const h = await versions();
      if (h) el['history'] = h;
      return el;
    }
    case 'diff': {
      await import('../../../src/diff.js');
      const el = document.createElement('mmdx-diff') as HTMLElement & Record<string, unknown>;
      if (props.sample) {
        const [before, after] = await Promise.all([load(samples, `${props.sample}.before.mmd`), load(samples, `${props.sample}.after.mmd`)]);
        el['beforeSource'] = before;
        el['afterSource'] = after;
      } else {
        el['history'] = await versions();
      }
      return el;
    }
    case 'theme-editor': {
      const { memoryThemeStore, BUILTIN_THEMES } = await import('../../../src/theme-editor.js');
      const el = document.createElement('mmdx-theme-editor') as HTMLElement & Record<string, unknown>;
      el['store'] = memoryThemeStore(BUILTIN_THEMES);
      return el;
    }
    default: {
      await import('../../../src/viewer.js');
      const el = document.createElement('mmdx-viewer') as HTMLElement & Record<string, unknown>;
      el['source'] = await exampleSource();
      const h = await versions();
      if (h) {
        // History draws comparisons with <mmdx-diff>'s code, loaded when it is opened
        el['history'] = h;
      }
      return el;
    }
  }
}

onMounted(async () => {
  try {
    await registerShippedThemes();
    const el = await create();
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class' || k === 'style') continue;
      el.setAttribute(k, v === true || v === '' ? '' : String(v));
    }
    const height = props.height ?? DEFAULT_HEIGHT[props.kind];
    if (height) el.style.height = height;
    host.value?.replaceChildren(el);
  } catch (e) {
    failed.value = String(e);
  }
});
</script>

<template>
  <div ref="host" class="mmdx-demo" :class="[`mmdx-demo--${props.kind}`, attrs.class]" :style="{ minHeight: props.height ?? DEFAULT_HEIGHT[props.kind] }">
    <p v-if="failed" class="mmdx-demo__error">{{ failed }}</p>
  </div>
</template>
