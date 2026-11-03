// The media kit's code (see kit.ts): rich text runs and their drawing, icons from the registry, content images
// through the image policy.
import { drawIcon, iconResolver } from '../icons/draw.js';
import { labelRuns, richLines, richText } from '../render/rich-text.js';
import { runsBlockWidth, runsText, wrapRuns } from '../text/rich.js';
import { drawImage } from './image.js';
import { checkImageUrl } from './policy.js';

export const MEDIA_KIT = { labelRuns, richLines, richText, wrapRuns, runsBlockWidth, runsText, iconResolver, drawIcon, drawImage, checkImageUrl };
