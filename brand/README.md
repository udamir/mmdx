# Diagram Studio logo

The mark is a sprout drawn by a pencil. The SVGs are the masters; the PNGs are exported from them.

| File | Use |
| --- | --- |
| `logo.svg` | Light backgrounds (navy ink, white eraser) |
| `logo-dark.svg` | Dark backgrounds (light ink) |
| `logo-mono.svg` | One colour, follows `currentColor` (inline SVG, print, stamps) |
| `icon.svg`, `icon-dark.svg`, `icon-mono.svg` | The same, on a square canvas |
| `favicon.svg` | Square, switches ink with `prefers-color-scheme` |
| `png/icon-{light,dark}-{16…1024}.png` | Square icons; 16–48 px use heavier strokes so they stay legible |
| `png/logo-{light,dark}-{256,512,1024}.png` | The logo at fixed widths |

Colours: ink `#061958` (dark: `#EEF0FF`), pencil `#8E5EFB`, pencil tip `#E7DDFD`.

The studio site's favicons, app icons and web manifest are in `apps/studio-site/public/`; the header mark is `src/ui/logo.ts`.
