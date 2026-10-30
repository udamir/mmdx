// Pure editing operations (§6.2): Mermaid source rewrites (prototype edit.js / connect.js) and metadata ops
// (prototype app.js). Every op returns a new value; nothing here touches the DOM or module state.
export * from './types.js';
export * from './ids.js';
export * from './connect.js';
export * from './flowchart.js';
export * from './er.js';
export * from './sequence.js';
export * from './reorder.js';
export * from './style-env.js';
export * from './meta-ops.js';
export * from './clipboard.js';
export * from './order.js';
export { boxOfItem, cloneMeta, uniqueRefs } from './meta-util.js';
export { applyEdits, indentOf } from './lines.js';
