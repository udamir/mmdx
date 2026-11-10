// English strings of the style toolbar's icon, image and shape palette controls (T05). Registered by the toolbar
// itself when it is created (it is a lazy chunk of the editor), not with the editor's first chunk.
import type { Messages } from '../i18n.js';

export const TOOLBAR_MEDIA_MESSAGES: Messages = {
  'tb.icon': 'Icon — choose, replace or remove', 'tb.iconOf': 'Icon: {name} — replace or remove', 'tb.mediaImage': 'Picture settings — fit, aspect ratio, label position', 'tb.mediaIcon': 'Icon settings — frame, label position',
  'tb.changeImage': 'Change image', 'tb.changeImageIcon': 'Change image — now the icon {name}',
  'tb.labelPos': 'Label position', 'tb.iconForm': 'Icon frame', 'tb.fit': 'Fit', 'tb.aspect': 'Keep aspect ratio',
  'tb.imageUrl': 'Image URL', 'tb.cat.basic': 'Basic', 'tb.cat.process': 'Process', 'tb.cat.technical': 'Technical',
  'tb.cat.annotation': 'Annotation', 'tb.cat.figure': 'Figures', 'tb.cat.media': 'Media',
  'tb.form.none': 'No frame', 'tb.form.square': 'Square', 'tb.form.circle': 'Circle', 'tb.form.rounded': 'Rounded',
  'tb.fit.contain': 'Contain', 'tb.fit.cover': 'Cover', 'tb.fit.stretch': 'Stretch', 'tb.labelAbove': 'Above', 'tb.labelBelow': 'Below',
};
