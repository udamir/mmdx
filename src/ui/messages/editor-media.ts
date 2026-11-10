// English strings of the editor's insert parts that load on demand (T05): the Shapes palette's sections, the pickers'
// toasts and the Properties panel's Icon and Image sections. Registered by
// those chunks (registerMessages), so the editor's first chunk carries only the dock's labels (ui/messages/editor.ts).
import type { Messages } from '../i18n.js';

export const EDITOR_MEDIA_MESSAGES: Messages = {
  'shapes.cat.basic': 'Basic', 'shapes.cat.process': 'Process', 'shapes.cat.technical': 'Technical', 'shapes.cat.annotation': 'Annotation',
  'shapes.dragTip': 'drag onto the canvas or click to add (Alt-click: give the selected nodes this shape)',
  'media.selectIcon': 'Select an item to give it an icon', 'media.blocked': 'This image URL is not allowed here',
  'props.icon': 'Icon', 'props.image': 'Image', 'props.iconNone': 'No icon', 'props.imageNone': 'No image', 'props.choose': 'Choose…', 'props.removeIcon': 'Remove icon',
  'props.iconTokenMmdx': 'Shown by mmdx only: stock Mermaid draws Font Awesome icons in labels and shows this one as text', 'props.toIconNode': 'Convert to icon node', 'props.imageLibrary': 'Library…', 'props.imageUpload': 'Upload…', 'props.imageByUrl': 'URL…', 'props.imageIcon': 'Icon…', 'props.changeImage': 'Change',
  'props.iconTokenText': 'Shown by mmdx only: stock Mermaid shows icons in this diagram type as text',
  'props.removeImage': 'Remove image', 'props.labelPos': 'Label', 'props.iconForm': 'Frame', 'props.mediaW': 'Width', 'props.mediaH': 'Height',
  'props.iconPos': 'Position', 'props.iconSize': 'Icon size', 'props.fit': 'Fit', 'props.aspect': 'Keep aspect ratio', 'props.imageUrl': 'Image URL',
  'media.pos.t': 'above', 'media.pos.b': 'below', 'media.iconPos.l': 'before the text', 'media.iconPos.t': 'above the text', 'media.iconPos.b': 'below the text', 'media.form.none': 'none', 'media.form.square': 'square', 'media.form.circle': 'circle', 'media.form.rounded': 'rounded',
  'media.fit.contain': 'contain', 'media.fit.cover': 'cover', 'media.fit.stretch': 'stretch',
};
