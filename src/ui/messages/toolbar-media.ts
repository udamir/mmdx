// English strings of the style toolbar's icon, image and shape palette controls (T05). Registered by the toolbar
// itself when it is created (it is a lazy chunk of the editor), not with the editor's first chunk.
import type { Messages } from '../i18n.js';

export const TOOLBAR_MEDIA_MESSAGES: Messages = {
  'tb.icon': 'Icon — choose, replace or remove', 'tb.iconOf': 'Icon: {name} — replace or remove', 'tb.media': 'Icon & image',
  'tb.mediaH': 'Height', 'tb.mediaW': 'Width', 'tb.labelPos': 'Label', 'tb.iconForm': 'Frame', 'tb.fit': 'Fit', 'tb.aspect': 'Keep aspect ratio',
  'tb.imageUrl': 'Image URL', 'tb.replaceImage': 'Replace image…', 'tb.toIconNode': 'Convert to icon node', 'tb.toIconNodeTip': 'Make the label\'s icon the node: an icon with the label as its caption', 'tb.cat.basic': 'Basic', 'tb.cat.process': 'Process', 'tb.cat.technical': 'Technical',
  'tb.cat.annotation': 'Annotation', 'tb.cat.figure': 'Figures', 'tb.cat.media': 'Media',
  'tb.form.none': 'none', 'tb.form.square': 'square', 'tb.form.circle': 'circle', 'tb.form.rounded': 'rounded',
  'tb.fit.contain': 'contain', 'tb.fit.cover': 'cover', 'tb.fit.stretch': 'stretch',
};
