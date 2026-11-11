// English strings of the insert blocks (T05): the shape palette, the icon picker, the image tool and the emoji
// picker. Each block registers the table on creation (registerMessages); the blocks are lazy chunks of the editor, so
// a page that never opens them ships none of these strings.
import type { Messages } from '../i18n.js';

export const BLOCK_MESSAGES_MEDIA: Messages = {
  // shape palette
  'palette.search': 'Search shapes', 'palette.searchPlaceholder': 'Search shapes…',
  'palette.results': 'Results', 'palette.none': 'No shapes match “{q}”', 'palette.shapes': 'Shapes',
  // icon picker
  'icons.title': 'Choose an icon…', 'icons.search': 'Search icons', 'icons.searchPlaceholder': 'Search icons',
  'icons.none': 'No icons match “{q}”', 'icons.empty': 'No icons in this pack', 'icons.grid': 'Icons',
  'icons.license': 'Licence: {license}',
  // image tool
  'image.title': 'Image', 'image.url': 'Image URL', 'image.urlPlaceholder': 'https://…', 'image.add': 'Add image', 'image.replace': 'Replace image',
  'image.remove': 'Remove image', 'image.drop': 'Drop an image here, paste it, or', 'image.choose': 'choose a file',
  'image.types': 'PNG, JPEG, GIF, WebP, SVG or AVIF', 'image.uploading': 'Uploading {name}…', 'image.uploadFailed': 'Upload failed: {msg}',
  'image.notImage': '{name} is not an image', 'image.big': '{name} is {w} × {h} px.', 'image.reduce': 'Reduce to {n} px', 'image.asIs': 'Upload as is',
  'image.noUpload': 'Images can be added by URL; uploading is not configured here',
  'image.source': 'Image source', 'image.tabLibrary': 'Library', 'image.tabUpload': 'Upload', 'image.tabUrl': 'URL', 'image.tabIcon': 'Icon',
  'image.library': 'Image library', 'image.librarySearch': 'Search images', 'image.libraryMore': 'Load more', 'image.libraryLoading': 'Loading images…',
  'image.libraryEmpty': 'No images in the library yet', 'image.libraryNone': 'No images match “{query}”', 'image.libraryFailed': 'The library could not be loaded: {msg}',
  'image.libraryBlocked': '{name} cannot be used here: {why}',
  'image.reason.invalid': 'This is not a valid image URL', 'image.reason.protocol': 'Only https images are allowed here (http images are blocked; use https)',
  'image.reason.data-off': 'data: images are blocked here; use an https URL', 'image.reason.data-type': 'This data: image type is not allowed',
  'image.reason.data-size': 'This data: image is too large', 'image.reason.host': 'Images from this host are not allowed here',
  'image.reason.relative': 'Relative image URLs are not allowed here; use a full https URL',
  // emoji picker
  'emoji.title': 'Emoji', 'emoji.search': 'Search emoji', 'emoji.searchPlaceholder': 'Search emoji', 'emoji.recent': 'Recent',
  'emoji.none': 'No emoji match “{q}”', 'emoji.tone': 'Skin tone', 'emoji.loading': 'Loading emoji…', 'emoji.failed': 'Emoji could not be loaded',
  'emoji.tone.0': 'Default', 'emoji.tone.1': 'Light', 'emoji.tone.2': 'Medium-light', 'emoji.tone.3': 'Medium', 'emoji.tone.4': 'Medium-dark', 'emoji.tone.5': 'Dark',
  'emoji.group.smileys': 'Smileys & emotion', 'emoji.group.people': 'People & body', 'emoji.group.animals': 'Animals & nature',
  'emoji.group.food': 'Food & drink', 'emoji.group.travel': 'Travel & places', 'emoji.group.activities': 'Activities',
  'emoji.group.objects': 'Objects', 'emoji.group.symbols': 'Symbols', 'emoji.group.flags': 'Flags',
};
