<script setup lang="ts">
// The shape catalogue as a table, generated from the catalogue itself (src/core/shapes) when the page is built: each
// shape's preview is the catalogue's own drawing, serialized by the core's scene serializer (no user content in it).
import { SHAPES, shapesIn } from '../../../src/core/shapes/catalog.js';
import type { ShapeCategory, ShapeDef } from '../../../src/core/shapes/catalog.js';
import { serializeNodes } from '../../../src/core/scene/serialize.js';

const props = defineProps<{ category?: ShapeCategory }>();

const preview = (d: ShapeDef): string => {
  const { w, h } = d.size;
  const side = Math.max(w * 1.15, h * 1.3);
  const k = side / 40;
  const body = serializeNodes(d.draw({ x: 0, y: 0, w, h }, { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 * k, radius: 4 * k }, {}));
  return `<svg viewBox="${-side / 2} ${-side / 2} ${side} ${side}" width="40" height="40" aria-hidden="true">${body}</svg>`;
};
const rows = (props.category ? shapesIn(props.category) : SHAPES).map((d) => ({
  d,
  svg: preview(d),
  names: [...d.aliases.filter((a) => a !== d.mermaid)].join(', '),
  legacy: (d.legacy ?? []).join(', '),
  bracket: d.bracket ? `A${d.bracket[0]}"…"${d.bracket[1]}` : '',
}));
</script>

<template>
  <table class="shape-catalog">
    <thead>
      <tr><th></th><th>Shape</th><th>Mermaid</th><th>Bracket</th><th>Also</th></tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.d.id">
        <td class="pic" v-html="r.svg"></td>
        <td><b>{{ r.d.name }}</b><br /><small>{{ r.d.title ?? '' }} · id <code>{{ r.d.id }}</code></small></td>
        <td><code v-if="r.d.mermaid">{{ r.d.mermaid }}</code><small v-else>mmdx only</small></td>
        <td><code v-if="r.bracket">{{ r.bracket }}</code></td>
        <td><small>{{ r.names }}<template v-if="r.legacy"><br />read, not written: {{ r.legacy }}</template></small></td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.shape-catalog td.pic { width: 48px; color: var(--vp-c-text-1); }
.shape-catalog td { vertical-align: middle; }
</style>
