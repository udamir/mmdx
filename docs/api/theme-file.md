# Theme file

A theme is a JSON file (`*.theme.json`) with a colour palette, the default style of every item type, named presets and page settings. Only the base theme (`default-light`) defines everything; other themes `extend` it and store only what they change. Theme files are validated when they are registered or saved: invalid values are dropped with a diagnostic, unknown keys are kept.

```json
{
  "id": "ocean",
  "name": "Ocean",
  "extends": "default-light",
  "appearance": "light",
  "counterpart": "ocean-dark",
  "palette": { "sky": "#cfe8ff", "ink": "#0b2545" },
  "flowchart": { "node": { "radius": 12 }, "nodePresets": { "core": { "fill": "@sky" } } }
}
```

Register a file with [`registerThemes`](/api/configuration#registerthemes), serve a set of files through a manifest and [`fetchThemeSource`](/api/adapters#fetchthemesource), or edit themes in [`<mmdx-theme-editor>`](/components/theme-editor). The guide is at [Themes](/guide/themes).

## Top-level keys

| Key | Type | Holds |
|---|---|---|
| `id` | `string` | Required. The theme's id; diagrams and hosts refer to the theme by it |
| `name` | `string` | Display name (the id when omitted) |
| `extends` | `string` | Id of the theme this one builds on (`default-light` when omitted) |
| `appearance` | `'light' \| 'dark'` | The kind of page the theme draws on (inherited through `extends`) |
| `counterpart` | `string` | Id of the linked theme of the other appearance |
| `schemaVersion` | `number` | Version of the theme file format (current: `1`) |
| `palette` | `Record<string, string>` | Named colours, referenced as `@name` |
| `font` | `string` | Font family list of every text |
| `canvas` | `PageSettings` | Page defaults: padding, background, grid and border |
| `flowchart` | `FlowchartTheme` | `node`, `group`, `edge`, their `…Presets`, `nodeShapes` and `pagePresets` |
| `sequence` | `SequenceTheme` | `participant`, `message`, `note`, `block`, `box`, `lifeline`, `activation`, their `…Presets`, `participantShapes`, `layout` and `pagePresets` |
| `er` | `ErTheme` | `entity`, `rel`, their `…Presets` and `pagePresets` |

Any other top-level key (the built-in files carry `source`, for example) is kept as it is and never read by a renderer.

### `id`

A non-empty string of at most 100 characters without control characters. A file without a valid `id`, or one that is not a JSON object, is rejected as a whole (`theme.missing-id`, `theme.not-object`). Registering a file whose id is already registered replaces that theme. Earlier ids of the built-in themes are still accepted and mapped wherever a theme id is read (`id`, `extends`, `counterpart`, a host's `theme` attribute):

| Earlier id | Current id |
|---|---|
| `baseline`, `studio` | `default-light` |
| `studio-dark` | `default-dark` |

### `name`

A string of at most 200 characters; control characters are removed. The name is not inherited: a theme without one is listed under its id.

### `extends`

The id of the parent theme, a string of at most 200 characters (control characters removed, earlier built-in ids mapped). It defaults to `default-light`. The base theme `default-light` never extends anything. See [Inheritance](#inheritance) for how the chain is merged.

### `appearance`

`"light"` or `"dark"`: the kind of page the theme draws on. It is inherited through `extends`, so a dark theme that extends `default-light` must set `"dark"` itself. A theme source lists themes from the file alone (not through `extends`), so set `appearance` in every file you serve.

### `counterpart`

The id of the theme of the same family with the other appearance (`github-light` ↔ `github-dark`). It must match `[\w.-]{1,100}` and may not be the theme's own id, otherwise it is dropped (`not a theme id`). When the UI switches between light and dark, a diagram is shown in its theme's counterpart; `theme-dark="auto"` uses it too. The link is the theme's own: it is never inherited through `extends`. When a theme has no usable link, the theme that links to it is used, else the house theme of that appearance (`default-light` or `default-dark`). Links should be mutual and point to a theme of the other appearance.

### `schemaVersion`

An integer, at least 1. A file without it is version 1, the current version. A file with a higher version loads with an info diagnostic (`theme.newer-version`). See [`migrateTheme`](#migratetheme).

### `font`

The font family list of every text, unless a style sets `fontFamily`: family names, quoted (`'Segoe UI'`, `"Segoe UI"`) or bare (`Roboto`, `sans-serif`), separated by commas, at most 300 characters. URLs, `;`, braces and `<` are not allowed (`not a font family list`). Default Light uses `"Roboto, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"`. Theme files cannot load fonts: the host page provides them.

### `palette`

Named colours that `@name` references resolve to. Names match `[\w-]+` (`pale-blue`, `sky`); values are colour literals only (see [Colour values](#colour-values)): a palette entry cannot be a reference. Invalid entries are dropped one by one (`palette.<name>`). Palettes merge through `extends` name by name, so a theme that changes one colour lists only that one.

Every theme should define the names the base theme uses, since the base theme's presets refer to them. A name a theme lacks falls back to the base theme's colour.

::: details Palette names of Default Light
`paper`, `ink`, `line`, `charcoal`, `title`, `slate`, `grey`, `muted`, `frame`, `silver`, `smoke`, `mist`, `cream`, `butter`, `gold`, `sand`, `peach`, `apricot`, `orange`, `ochre`, `lime`, `pale-lime`, `green`, `moss`, `sage`, `mint`, `ice`, `sky`, `cornflower`, `pale-blue`, `blue`, `violet`, `lilac`, `lavender`, `pink`, `rose`, `pale-rose`, `red`, `coral`, `rust`, `brown`, `bronze`, `emerald`, `jade`, `forest`, `teal`, `azure`, `iris`, `magenta`.

`paper` has a special role: it is the colour behind label halos and inside markers when the page background is transparent.
:::

### `canvas`

Page defaults of every diagram type. The renderer reads four keys from the theme's `canvas`:

| Key | Type | Meaning |
|---|---|---|
| `pad` | `number` | Space around the content, in px (default `16`) |
| `background` | colour | Page background (transparent when not set) |
| `grid` | colour | Colour of a 24 px grid drawn on the page (no grid when not set) |
| `border` | colour | Colour of a 2 px page border (none when not set) |

Page settings in effect are, later wins: the theme's `canvas` → the diagram type's page preset chosen by the diagram (`%%@ canvas {"preset": …}`) → the diagram's own `%%@ canvas` values. The other page settings (`routing`, `ratio`, `gap`, `rowH`, `mirror`, `blockSpan`, `margin`) belong in [`pagePresets`](#pagepresets) and in the diagram; `canvas` accepts them (they are validated like any page setting) but rendering does not read them from there.

## Colours

### Colour values

Every colour key (`fill`, `stroke`, `text`, `color`, `labelColor`, `titleColor`, `attrColor`, `background`, `border`, `grid`) takes a colour literal or a palette reference.

| Form | Example | Meaning |
|---|---|---|
| Hex | `#5d9cf0`, `#fff`, `#5d9cf080` | 3, 4, 6 or 8 hex digits |
| Function | `rgb(0,0,0)`, `rgba(0,0,0,0.05)`, `hsl(210 50% 40%)` | `rgb()`, `rgba()`, `hsl()`, `hsla()` with numbers only |
| Name | `red`, `transparent`, `none`, `currentColor` | Any CSS colour name, `none`, `transparent`, `currentColor` |
| Reference | `@sky` | The palette colour `sky` of the theme in use |
| Shifted reference | `@sky~+12,-5,+8`, `@sand~=349.3,+53.5,-5.7` | The palette colour shifted in hue, saturation and lightness |

A colour value is at most 64 characters. `labelColor` may also be `null`: no own colour, the label follows the line.

### `@name`

A reference names a palette colour; each theme has its own version of it, so a diagram restyles itself when its theme changes. References are resolved when a theme is merged and when a diagram renders.

### `@name~h,s,l`

A shifted reference is a palette colour plus a shift, so that a custom colour follows other themes: each theme applies the same shift to its own version of the colour. The grammar is `@name~H,S,L`:

| Part | Form | Meaning |
|---|---|---|
| `H` | `+12`, `-30`, `12` | Hue shift in degrees, added to the palette colour's hue (wraps around 360) |
| `H` | `=210` | Absolute hue in degrees, used as is (written for greys, whose hue means nothing) |
| `S` | `+10`, `-5.5` | Saturation shift in percentage points, added; the result is clamped to 0–100 |
| `L` | `+8`, `-12` | Lightness shift in percentage points, added; the result is clamped to 0–100 |

The sign is optional (`+` when omitted) and decimals are allowed; there are no units. The result is a hex colour. A shift applies only when the palette colour is a 3- or 6-digit hex colour; any other palette colour is used without the shift.

[`relativeColor`](/api/core#relativecolor) writes these references: it picks the nearest palette colour and encodes the difference (`@name` when it is exact), rounded to one decimal; for a grey palette colour (saturation below 6 %) it writes the absolute hue `=h`. [`resolveColor`](/api/core#resolvecolor) turns a reference back into a colour.

### Resolution

A reference is looked up in the theme's palette (inherited names included), then in the base theme's palette. When a diagram renders, names from the diagram's own palette (`%%@ style.palette <name> {"color": …}`) come between the two: a diagram can add names, but not override the theme's. A name found nowhere resolves to the bare name (`@red` → `red`), which is kept only when it is a CSS colour name; anything else that does not end up as a colour literal is dropped, and the style of the layer below applies.

## Style properties

`StyleProps` is the set of style keys shared by the item blocks of a theme (`node`, `edge`, …), presets, per-shape defaults and the per-item `%%@` metadata of a diagram. Every value goes through the same validator wherever it comes from; an invalid value is dropped with a diagnostic. Unknown keys are kept and ignored.

A style is resolved in this order, later wins: the theme's base style → the shape's default (`nodeShapes`, `participantShapes`) → the diagram's base style for the kind → the preset (from metadata or a Mermaid class such as `A:::core`) → Mermaid `classDef` / `style` / `linkStyle` → the item's own metadata. In this merge `null` and `""` count as not set: they do not override a lower layer.

Not every key applies to every item type: see [which keys each item reads](#flowchart).

### Box

| Key | Type | Allowed values | Meaning |
|---|---|---|---|
| `fill` | colour | [Colour value](#colour-values) | Fill of a shape |
| `stroke` | colour | Colour value | Border colour |
| `strokeWidth` | `number` | 0–100 | Border width |
| `fillOpacity` | `number` | 0–1 | Fill opacity |
| `strokeOpacity` | `number` | 0–1 | Border or line opacity |
| `radius` | `number` | 0–100000 | Corner radius |
| `stack` | `boolean \| number` | `false`, `true`, integer 0–10 | Copies drawn behind the shape: `true` is one, `2` and `3` are two and three (at most 3 are drawn) |
| `dash` | `string` | Up to 8 numbers 0–1000, separated by spaces or commas; `""` or `"none"` is solid | Dash pattern of the border or line (`"6 4"` dashed, `"1.5 4"` dotted) |
| `shape` | `string` | A name matching `[A-Za-z][\w-]{0,39}` | Node or participant shape (see [`nodeShapes`](#nodeshapes)) |

### Text

| Key | Type | Allowed values | Meaning |
|---|---|---|---|
| `text` | colour | Colour value | Text colour |
| `fontSize` | `number` | 0–1000 | Font size of the item's text |
| `fontWeight` | `number \| string` | 1–1000, or `normal`, `bold`, `bolder`, `lighter`, a numeric string | Font weight |
| `fontFamily` | `string` | A font family list (see [`font`](#font)) | Font of this item instead of the theme font |
| `align` | `string` | `left`, `center`, `right` | Horizontal text alignment |
| `valign` | `string` | `top`, `middle`, `bottom` | Vertical text alignment |
| `wrap` | `boolean` | | Word wrap: text breaks into lines that fit the shape's width (it grows taller to fit) |

### Size

Sizing keys are set in themes; most items take their size from the layout or from per-item `w` / `h`.

| Key | Type | Allowed values | Meaning |
|---|---|---|---|
| `padX` | `number` | 0–100000 | Horizontal padding between text and border |
| `padY` | `number` | 0–100000 | Vertical padding between text and border |
| `minW` | `number` | 0–100000 | Minimum width |
| `minH` | `number` | 0–100000 | Minimum height |
| `maxW` | `number` | 0–100000 | Maximum width: the wrap width of a node or participant, the width limit of an ER table |
| `w` | `number` | 0–100000 | Width (the bar width of an activation) |
| `h` | `number` | 0–100000 | Height (the head height of a participant) |

### Group title

| Key | Type | Allowed values | Meaning |
|---|---|---|---|
| `titleSize` | `number` | 0–1000 | Title font size; `0` hides the title |
| `titleColor` | colour | Colour value | Title colour |
| `titleAlign` | `string` | `left`, `center`, `right` | Title alignment |
| `titleWeight` | `number \| string` | As `fontWeight` | Title weight (also the table name weight of an ER entity) |
| `pad` | `number` | 0–100000 | Space between the group border and its content |
| `padTop` | `number` | 0–100000 | Space above the content (holds the title; `pad` when not set) |

### Lines

| Key | Type | Allowed values | Meaning |
|---|---|---|---|
| `color` | colour | Colour value | Line colour |
| `width` | `number` | 0–100 | Line width |
| `arrow` | `string` | `open`, `filled`, `arrow`, `cross`, `circle`, `dot`, `none` | Arrow head drawn where the Mermaid source has one; `none` or an unknown name draws none |
| `startArrow` | `string` | As `arrow` | Head at the start of an edge |
| `endArrow` | `string` | As `arrow` | Head at the end of an edge |
| `labelColor` | colour `\| null` | Colour value or `null` | Label colour; `null` follows the line colour |
| `labelSize` | `number` | 0–1000 | Label font size |
| `curve` | `number` | −100–100 | Curvature of a curved line (`1` is the default; `0` is straight) |
| `routing` | `string` | `curved`, `orthogonal`, `straight` | How a relationship line is routed |
| `labelAt` | `number` | 0–1 | Label position along a relationship line |
| `replyDash` | `string` | As `dash` | Dash pattern of reply messages (`-->>`) |
| `labelOnLine` | `boolean` | | Message label sits on the line instead of above it |

### Sequence and ER

| Key | Type | Allowed values | Meaning |
|---|---|---|---|
| `showTag` | `boolean` | | Show the block kind (`loop`, `alt`, …) in a tag at the block's corner |
| `attrSize` | `number` | 0–1000 | Font size of ER attributes |
| `attrColor` | colour | Colour value | Colour of ER attributes |
| `mode` | `string` | `compact`, `table` | ER table layout: attributes as text, or as columns |
| `showTypes` | `boolean` | | Show attribute types |
| `showComments` | `boolean` | | Show attribute comments |
| `pkUnderline` | `boolean` | | Underline primary key attributes |

### Preset keys

| Key | Type | Allowed values | Meaning |
|---|---|---|---|
| `for` | `string` | A name matching `[A-Za-z][\w-]{0,39}` | The shape a node or participant preset belongs to when it sets no `shape` (groups presets by shape in the theme editor) |
| `label` | `string` | At most 200 characters | Display name of a page preset |

## `flowchart`

| Key | Type | Holds |
|---|---|---|
| `node` | `StyleProps` | Base style of every node |
| `nodeShapes` | `Record<string, StyleProps>` | Default style per node shape, keyed by shape name |
| `nodePresets` | `Record<string, StyleProps>` | Named node presets |
| `group` | `StyleProps` | Base style of every subgraph |
| `groupPresets` | `Record<string, StyleProps>` | Named group presets |
| `edge` | `StyleProps` | Base style of every connector |
| `edgePresets` | `Record<string, StyleProps>` | Named edge presets |
| `pagePresets` | `Record<string, PageSettings>` | Page presets of flowcharts |

Keys each item reads. The first column lists what the theme editor and the Properties panel show; the second lists keys the renderer also reads, set in theme files.

| Item | Editable keys | Also read |
|---|---|---|
| `node` | `fill`, `stroke`, `text`, `strokeWidth`, `fontSize`, `fontWeight`, `align`, `valign`, `wrap`, `radius`, `stack`, `shape`, `dash` | `padX`, `padY`, `minW`, `minH`, `maxW`, `fontFamily`, `fillOpacity`, `strokeOpacity` |
| `group` | `fill`, `stroke`, `strokeWidth`, `radius`, `stack`, `titleSize`, `titleColor`, `titleWeight`, `titleAlign`, `pad`, `padTop` | `dash`, `fontFamily`, `fillOpacity`, `strokeOpacity` |
| `edge` | `color`, `width`, `dash`, `arrow`, `labelColor`, `labelSize`, `curve` | `fontFamily`, `fontWeight`, `strokeOpacity` |

Some presets are picked without being named: a node drawn as a cylinder (`[(…)]`) takes `db` and a diamond (`{…}`) takes `decision`; a dotted edge (`-.->`) takes `sync` and a thick edge (`==>`) takes `strong`; a group without a preset takes `box`. Each applies only when the theme defines it.

::: details Default Light values
```json
{
  "node": { "fill": "@paper", "stroke": "@ink", "strokeWidth": 1.6, "text": "@ink", "fontSize": 18, "fontWeight": 400, "radius": 10, "stack": false, "shape": "rect", "minW": 120, "minH": 56, "padX": 18, "padY": 12 },
  "group": { "fill": "@mist", "stroke": "@silver", "strokeWidth": 1.2, "radius": 12, "stack": false, "titleSize": 14, "titleColor": "@title", "titleWeight": 600, "titleAlign": "center", "pad": 14, "padTop": 34 },
  "edge": { "color": "@line", "width": 1.3, "dash": "", "arrow": "open", "labelSize": 12, "labelColor": null, "curve": 1 }
}
```

Node presets: `client`, `ui`, `core`, `analytics`, `worker`, `domain`, `api`, `storage`, `legacy`, `service`, `gateway`, `external`, `security`, `sandbox`, `infra`, `metrics`, `plain`, `db`, `event-bus`, `data-bus`, `queue`, `decision`. Group presets: `lane`, `wrapper`, `proxy`, `frame`, `bundle`, `box`. Edge presets: `sync`, `rest`, `write`, `read`, `alert`, `logs`, `grpc`, `grpc-alt`, `stream`, `event`, `mq`, `strong`. Page presets: `whiteboard`, `grid`, `technical`, `slide`.
:::

### `nodeShapes`

The default style of each node shape, applied after `node` and before presets: `"nodeShapes": { "diamond": { "fill": "@cream" } }`. A key is a shape's id or any name the [shape catalogue](/guide/shapes#the-catalogue) knows for it — Mermaid's short name or an alias (`"cyl"`, `"lean-r"`, `"disk"`) — and is matched to the shape's id when the theme is used; where two keys name one shape, the id's own key wins. Names the catalogue does not know are kept, so a theme may style shapes a newer renderer knows. The ids are those of the catalogue: `rect`, `rounded`, `stadium`, `subroutine`, `cylinder`, `circle`, `doublecircle`, `diamond`, `hexagon`, `parallelogram`, `parallelogram-alt`, `trapezoid`, `trapezoid-alt`, `asymmetric`, `hcyl`, `document`, `card` for the shapes mmdx drew before 0.4, and Mermaid's short names for the others (`lin-cyl`, `notch-pent`, `bow-rect`, …).

## `sequence`

| Key | Type | Holds |
|---|---|---|
| `participant` | `StyleProps` | Base style of every participant head |
| `participantShapes` | `Record<string, StyleProps>` | Default style per participant shape |
| `participantPresets` | `Record<string, StyleProps>` | Named participant presets |
| `lifeline` | `StyleProps` | Style of lifelines (no presets) |
| `activation` | `StyleProps` | Base style of activation bars (processes) |
| `activationPresets` | `Record<string, StyleProps>` | Named activation presets |
| `message` | `StyleProps` | Base style of every message |
| `messagePresets` | `Record<string, StyleProps>` | Named message presets |
| `note` | `StyleProps` | Base style of every note |
| `notePresets` | `Record<string, StyleProps>` | Named note presets |
| `block` | `StyleProps` | Base style of `loop` / `alt` / `opt` / `par` / … blocks |
| `blockPresets` | `Record<string, StyleProps>` | Named block presets |
| `box` | `StyleProps` | Base style of participant groups (`box`) |
| `boxPresets` | `Record<string, StyleProps>` | Named box presets |
| `layout` | `SequenceLayout` | Spacing of the sequence layout |
| `pagePresets` | `Record<string, PageSettings>` | Page presets of sequence diagrams |

| Item | Editable keys | Also read |
|---|---|---|
| `participant` | `fill`, `stroke`, `text`, `strokeWidth`, `fontSize`, `wrap`, `radius`, `stack`, `shape` | `padX`, `padY`, `minW`, `maxW`, `h`, `fontWeight`, `fontFamily` |
| `message` | `color`, `width`, `dash`, `arrow`, `labelSize`, `labelColor`, `labelOnLine` | `replyDash`, `fontWeight`, `fontFamily`, `strokeOpacity` |
| `note` | `fill`, `stroke`, `strokeWidth`, `dash`, `text`, `fontSize` | `radius`, `fontWeight`, `fontFamily`, `fillOpacity`, `strokeOpacity` |
| `block` | `fill`, `stroke`, `strokeWidth`, `labelSize`, `labelColor`, `showTag`, `radius` | `fontWeight`, `fontFamily` |
| `box` | `fill`, `stroke`, `strokeWidth`, `dash`, `text`, `labelSize` | |
| `lifeline` | `color`, `width`, `dash` | |
| `activation` | `fill`, `stroke`, `strokeWidth`, `dash`, `w` (bar width) | |

A lifeline dash that starts with `0` (`"0.1 6"`) is drawn with round caps, as dots. A message's `arrow` is the head of messages written with an arrow (`->>`); the other message forms keep their own heads.

### `participantShapes`

The default style of each participant shape, applied after `participant` and before presets. The participant shapes are `box`, `rounded`, `stadium`, `actor` (stick figure), `database`, `hcyl`.

### `layout`

Spacing of the sequence layout, in px unless noted. A diagram's page settings (`gap`, `rowH`, `mirror`, `margin`, from a page preset or `%%@ canvas`) override the matching keys.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `gap` | `number` | `90` | Space between participants |
| `top` | `number` | `30` | Top of the participant heads |
| `rowH` | `number` | `52` | Height of a message row |
| `lineH` | `number` | `1.35` | Line height of message labels, as a multiple of the font size (0–10) |
| `blockGapTop` | `number` | `58` | Space above a block's first row (half of it for a block without a label or tag) |
| `blockGapBottom` | `number` | `26` | Space below a block |
| `blockPad` | `number` | `12` | Inset of a nested block per nesting level (plus 6) |
| `mirror` | `boolean` | `false` | Repeat the participant heads at the bottom |
| `margin` | `number` | `26` | Space left of the first participant |
| `blockSpan` | `'full' \| 'touched'` | | Block width: across every participant or only the ones it touches. Rendering reads it from the page settings (a page preset or `%%@ canvas`), where the default is `full` |

::: details Default Light values
```json
{
  "participant": { "fill": "@paper", "stroke": "@ink", "strokeWidth": 2.2, "radius": 16, "text": "@ink", "fontSize": 30, "fontWeight": 400, "minW": 300, "h": 86, "padX": 24, "shape": "box" },
  "lifeline": { "color": "@ink", "width": 2.2, "dash": "0.1 6" },
  "activation": { "fill": "@paper", "stroke": "@ink", "strokeWidth": 2.4, "w": 14 },
  "message": { "color": "@ink", "width": 2.6, "arrow": "filled", "labelSize": 16, "labelColor": "@ink", "dash": "", "replyDash": "", "labelOnLine": true },
  "note": { "fill": "@cream", "stroke": "@ink", "strokeWidth": 1.4, "fontSize": 15, "text": "@ink", "radius": 4 },
  "block": { "fill": "@pale-lime", "stroke": "@ink", "strokeWidth": 2.6, "labelSize": 20, "labelColor": "@ink", "showTag": false, "radius": 0 },
  "box": { "fill": "@smoke", "stroke": "@frame", "strokeWidth": 1.2, "labelSize": 16 }
}
```

Participant presets: `blue`, `green`, `yellow`, `pink`. Activation presets: `accent`, `info`, `error`, `async`. Message presets: `big`, `async`, `error`. Note presets: `info`, `warning`, `error`, `plain`. Block presets: `blue`, `rose`, `none`. Box presets: `blue`, `green`, `rose`, `outline`. Page presets: `document`, `compact`, `spacious`, `mirrored`.
:::

## `er`

| Key | Type | Holds |
|---|---|---|
| `entity` | `StyleProps` | Base style of every table |
| `entityPresets` | `Record<string, StyleProps>` | Named table presets |
| `rel` | `StyleProps` | Base style of every relationship |
| `relPresets` | `Record<string, StyleProps>` | Named relationship presets |
| `pagePresets` | `Record<string, PageSettings>` | Page presets of ER diagrams |

| Item | Editable keys | Also read |
|---|---|---|
| `entity` | `fill`, `stroke`, `text`, `strokeWidth`, `radius`, `stack`, `titleSize`, `attrSize`, `attrColor`, `mode`, `showTypes`, `showComments`, `pkUnderline`, `maxW` | `padX`, `padY`, `minW`, `titleWeight`, `fontFamily`, `fillOpacity`, `strokeOpacity` |
| `rel` | `color`, `width`, `dash`, `labelSize`, `labelColor`, `curve`, `routing`, `labelAt` | `fontWeight`, `fontFamily`, `strokeOpacity` |

An identifying relationship (`--`) is always solid; `dash` applies to non-identifying ones (`..`). A diagram's page `routing` overrides the theme's `rel.routing` unless the relationship sets its own.

::: details Default Light values
```json
{
  "entity": { "fill": "@mint", "stroke": "@ink", "strokeWidth": 1.6, "radius": 18, "text": "@ink", "titleSize": 19, "titleWeight": 700, "attrSize": 18, "attrColor": "@ink", "mode": "compact", "showTypes": false, "showComments": true, "pkUnderline": false, "padX": 14, "padY": 12, "maxW": 330, "minW": 160 },
  "rel": { "color": "@ink", "width": 1, "dash": "6 4", "labelSize": 13, "labelColor": "@ink", "curve": 1, "labelAt": 0.18, "routing": "curved" }
}
```

Entity presets: `mint`, `peach`, `yellow`, `gold`, `sky`, `blue`, `lavender`, `white`. Relationship presets: `strong`, `muted`. Page presets: `whiteboard`, `schema`, `slide`.
:::

## Presets

### Item presets

Each `…Presets` key is a record of named style objects (`StyleProps`). An item uses a preset when its metadata names it (`%%@ node api {"preset": "core"}`) or, in flowcharts, when it has a Mermaid class of that name (`api:::core`). A diagram may define presets of its own (`%%@ style.node <name> {…}`); one with the same name as a theme preset replaces it in that diagram. A preset that sets `shape` changes the item's shape; `for` only records which shape the preset belongs to.

```json
{
  "flowchart": {
    "nodePresets": {
      "core": { "fill": "@lime", "stack": true },
      "db": { "shape": "cylinder", "fill": "@paper", "fontSize": 12, "minW": 56, "minH": 44 }
    }
  }
}
```

### `pagePresets`

Page presets are per diagram type (`flowchart.pagePresets`, `sequence.pagePresets`, `er.pagePresets`) and chosen by `%%@ canvas {"preset": "<name>"}`. Each holds page settings plus a display `label`:

| Key | Type | Allowed values | Meaning |
|---|---|---|---|
| `label` | `string` | At most 200 characters | Name shown in the page preset menu |
| `background` | colour | Colour value | Page background |
| `border` | colour | Colour value | Page border colour |
| `grid` | colour | Colour value | Grid line colour |
| `pad` | `number` | 0–100000 | Space around the content |
| `routing` | `string` | `curved`, `orthogonal`, `straight` | Default routing of edges and relationships |
| `ratio` | `string` | `"W:H"` such as `"16:9"`, or `""` | Locked page proportions; the page grows around the content to match |
| `gap` | `number` | 0–100000 | Sequence: space between participants |
| `rowH` | `number` | 0–100000 | Sequence: message row height |
| `mirror` | `boolean` | | Sequence: participant heads at the bottom too |
| `blockSpan` | `string` | `full`, `touched` | Sequence: block width |
| `margin` | `number` | 0–100000 | Sequence: space left of the first participant |

```json
{
  "flowchart": {
    "pagePresets": {
      "technical": { "label": "Technical — right angles", "background": "@paper", "grid": "rgba(0,0,0,0.05)", "routing": "orthogonal" },
      "slide": { "label": "Slide 16 : 9", "background": "@paper", "ratio": "16:9", "pad": 40 }
    }
  }
}
```

## Inheritance

[`ThemeRegistry`](/api/core#themeregistry) merges a theme with the chain of themes it extends, then resolves every colour reference.

- Objects merge key by key, at any depth; any other value, arrays included, replaces the inherited one. A preset or a palette entry can therefore be changed one key at a time.
- `name` and `counterpart` are the theme's own; `appearance` and everything else are inherited.
- An `extends` id that is not registered is treated as `default-light`.
- A chain that loops back on itself, or runs deeper than 5 levels above the theme, is cut there and rooted on `default-light`, so every merged theme has every section the base theme defines.
- Asking for an unregistered theme id gives `default-light`.

The resolved theme has every section and key group (empty when nothing defines it) and `canvas.pad` defaults to 16. Colour keys that do not resolve to a colour literal are removed from it.

## Validation

[`validateTheme`](/api/core#validatetheme) checks a file before it is registered or saved. Theme JSON may come from a store the host does not control, so every style value goes through the same validators as `%%@` metadata, fonts must be family names and palette entries colour literals. The result is a deep copy without the values that failed, migrated to the current schema version, plus diagnostics.

| Input | Result |
|---|---|
| Not a JSON object | Rejected (`theme.not-object`, error) |
| No valid `id` | Rejected (`theme.missing-id`, error) |
| Invalid `name`, `extends`, `appearance`, `counterpart`, `schemaVersion`, `font` | Key dropped (`theme.bad-value`, warning) |
| `palette` not an object | Palette dropped (`theme.bad-value`) |
| Palette entry with an invalid name or a value that is not a colour literal | Entry dropped (`theme.bad-value`, path `palette.<name>`) |
| `canvas`, a section, an item block or a preset that is not an object | That object dropped (`theme.bad-value`) |
| A style value that fails its check | That value dropped (`theme.bad-value`, path such as `flowchart.node.fill`) |
| `schemaVersion` above the current version | Loaded, with `theme.newer-version` (info) |
| Unknown key at any level | Kept as it is, never rendered |

Inside `flowchart`, `sequence` and `er`, a key ending in `Presets` or `Shapes` must be a record of style objects; any other key (`node`, `layout`, …) must be a style object. The `theme.bad-value` message reads `invalid value for "<path>" — ignored`, and the path is in the diagnostic's `params.key`.

### `migrateTheme`

[`migrateTheme`](/api/core#migratetheme) upgrades a file from its `schemaVersion` step by step to the current version; `validateTheme` calls it. The current version is 1 and there are no upgrade steps yet: a file without `schemaVersion` is version 1 and passes unchanged, and so does a file with a newer version.

## Theme manifest

A manifest lists theme files for [`fetchThemeSource`](/api/adapters#fetchthemesource). The package ships one at `@mmdx/studio/themes/index.json`:

```json
{
  "themes": [
    "default-light.theme.json",
    "default-dark.theme.json",
    "github-light.theme.json",
    "github-dark.theme.json",
    "catppuccin-latte.theme.json",
    "catppuccin-mocha.theme.json",
    "rose-pine-dawn.theme.json",
    "dracula.theme.json"
  ]
}
```

```ts
import { configure } from '@mmdx/studio/viewer';
import { fetchThemeSource } from '@mmdx/studio/adapters';

configure({ themeSource: fetchThemeSource('/themes/index.json') });
```

- `themes` is an array of file URLs, resolved relative to the manifest URL; entries that are not strings are ignored.
- Files are fetched once and cached; a file that fails to load (non-OK response) or has no string `id` is left out.
- A failed manifest request throws, and the next call tries again.
- Requests use `{ credentials: 'same-origin' }` unless a second argument gives other `fetch` options.
- The source does not validate: the registry validates each file when it is registered.

## Full example

GitHub Light (`themes/github-light.theme.json`), shortened: it extends Default Light, replaces the palette with GitHub Primer colours, adds a `border` colour and points the borders at it.

```json
{
  "id": "github-light",
  "name": "GitHub Light",
  "extends": "default-light",
  "appearance": "light",
  "counterpart": "github-dark",
  "source": "https://github.com/primer/primitives (MIT) — generated by tools/build-themes.mjs",
  "palette": {
    "paper": "#ffffff",
    "ink": "#1f2328",
    "line": "#454c54",
    "muted": "#818b98",
    "sky": "#b5d2f4",
    "lime": "#ced5bb",
    "red": "#cf222e",
    "azure": "#0969da",
    "border": "#818b98"
  },
  "canvas": { "background": "#ffffff" },
  "flowchart": {
    "pagePresets": {
      "whiteboard": { "background": "#ffffff" },
      "grid": { "background": "#ffffff" }
    },
    "node": { "stroke": "@border" },
    "groupPresets": {
      "wrapper": { "stroke": "@border" },
      "frame": { "stroke": "@border" }
    }
  },
  "sequence": {
    "participant": { "stroke": "@border" },
    "note": { "stroke": "@border" },
    "lifeline": { "color": "@muted" },
    "message": { "color": "@line" }
  },
  "er": {
    "entity": { "stroke": "@border" },
    "rel": { "color": "@line" }
  }
}
```

The page presets keep their `label`, `grid` and `routing` from Default Light and change only the background; `source` is an unknown key, kept and ignored.

## Related

- [`validateTheme`](/api/core#validatetheme), [`migrateTheme`](/api/core#migratetheme), [`ThemeRegistry`](/api/core#themeregistry)
- [`resolveColor`](/api/core#resolvecolor), [`relativeColor`](/api/core#relativecolor)
- [`registerThemes`](/api/configuration#registerthemes), [`fetchThemeSource`](/api/adapters#fetchthemesource)
- Guides: [Themes](/guide/themes), [Styling](/guide/styling), [The .mmdx format](/guide/mmdx-format)
- Component: [`<mmdx-theme-editor>`](/components/theme-editor)
