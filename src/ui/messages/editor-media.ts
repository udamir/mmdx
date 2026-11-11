// English strings of the editor's insert parts that load on demand (T05): the Shapes palette's sections, the pickers'
// toasts and the Properties panel's Icon and Image sections. Registered by
// those chunks (registerMessages), so the editor's first chunk carries only the dock's labels (ui/messages/editor.ts).
import type { Messages } from '../../i18n.js';

export const EDITOR_MEDIA_MESSAGES: Messages = {
  'shapes.cat.basic': 'Basic', 'shapes.cat.process': 'Process', 'shapes.cat.technical': 'Technical', 'shapes.cat.annotation': 'Annotation',
  'shapes.dragTip': 'drag onto the canvas or click to add (Alt-click: give the selected nodes this shape)',
  'media.blocked': 'This image URL is not allowed here',
  'props.icon': 'Icon', 'props.image': 'Image', 'props.imageNone': 'No image',
  'props.iconTokenMmdx': 'Shown by mmdx only: stock Mermaid draws Font Awesome icons in labels and shows this one as text', 'props.toIconNode': 'Convert to icon node', 'props.changeImage': 'Change image', 'props.setImage': 'Set image',
  'props.removeImage': 'Remove image', 'props.labelPos': 'Label', 'props.iconForm': 'Frame', 'props.mediaW': 'Width', 'props.mediaH': 'Height',
  'props.fit': 'Fit', 'props.aspect': 'Keep aspect ratio', 'props.imageUrl': 'Image URL',
  'media.pos.t': 'above', 'media.pos.b': 'below', 'media.form.none': 'none', 'media.form.square': 'square', 'media.form.circle': 'circle', 'media.form.rounded': 'rounded',
  'media.fit.contain': 'contain', 'media.fit.cover': 'cover', 'media.fit.stretch': 'stretch',
};
