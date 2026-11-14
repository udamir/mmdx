# Sequence diagrams

mmdx reads, draws and edits Mermaid sequence diagrams (`sequenceDiagram`), and writes them back as Mermaid code, so a file still opens in stock Mermaid. Participants, messages, notes, blocks, boxes and processes (activation bars) are items of their own: they are selected, styled and layered like flowchart items, with their looks in the metadata, while their order is the order of the code. This page lists the syntax mmdx reads, how it draws it, and how the editor changes it.

<MmdxDemo example="docker-deploy-sequence" history controls="zoom code history export theme" />

## Syntax

```mmdx
sequenceDiagram
  autonumber
  actor U as User
  participant API@{ "type": "queue" } as Orders
  participant DB as Database
  U->>+API: place order
  API->>DB: insert
  DB-->>API: id
  alt in stock
    API-->>U: confirmed
  else out of stock
    API--xU: rejected
  end
  API-)DB: audit
  deactivate API
  note right of DB: kept for a year
```

mmdx reads each statement the way Mermaid's lexer reads it (`sequenceDiagram.jison`, the same in 11.17.2 and 12.2): its participant token, its 26 arrow tokens in the lexer's order (the first that matches wins, so `-->>` is never read as `-->`), the `+` / `-` / `()` markers and the declaration's id, `@{…}` and alias. The model is checked against the one Mermaid's own SequenceDB builds, in both versions.

| Syntax | Reads |
|---|---|
| `participant A`, `actor A` | A participant, or an actor (a stick figure); a participant is also created by its first mention in a message or note |
| `participant A as Alice` | A participant with a display name other than its id |
| `participant A@{ "type": "database" }`, `@{ type: database }` | Mermaid's participant type, drawn as Mermaid draws it (see [Participant types](#participant-types)); the type in `@{}` wins over the `actor` keyword, as in Mermaid |
| `participant A@{ "alias": "Alice" }` | The display name in the participant's data (Mermaid 11.13+); an `as` alias on the same line wins, as in Mermaid |
| `create participant B`, `create actor B` | A participant created by the next message, which must be to it (see [Create and destroy](#create-and-destroy)) |
| `destroy B` | The next message, from or to B, destroys it |
| `A->>B: text`, `A-->>B: text` | A message, solid or dotted; its text may be empty, the `:` is required |
| `A->>+B: text`, `B-->>-A: text` | A message that opens a process on its receiver, or closes one on its sender |
| `activate A`, `deactivate A` | Open or close a process on A |
| `A->>()B`, `A()->>B`, `A()->>()B` | Central connections: the arrow ends at a small circle on the lifeline |
| `note right of A: text`, `note left of A: text`, `note over A,B: text` | A note beside a participant or over one or two |
| `loop text`, `opt text`, `break text` … `end` | A block around the statements up to its `end` |
| `alt text` … `else text` … `end` | A block with branches; also `par` … `and`, `critical` … `option` |
| `rect rgb(200, 220, 255)` … `end` | A highlighted region; its argument is its colour, not a text |
| `box Aqua Payments` … `end` | A box around the participants declared in it, with an optional colour and a title |
| `autonumber`, `autonumber 10`, `autonumber 10 5`, `autonumber off` | Message numbers (see [Numbering](#numbering)) |
| `title Text`, `title: Text` | The diagram's title, drawn above the participants |
| `accTitle: …`, `accDescr: …`, `accDescr { … }` | The accessible name and description: the SVG's `<title>` and `<desc>` and the viewer's accessible name |
| `link A: Dashboard @ https://…`, `links A: {"Dashboard": "https://…"}` | A participant's links (see [Links](#links)) |
| `properties A: {"icon": "https://…"}`, `details A: element-id` | Read and kept; `properties` must be a JSON object, and its `icon` URL is drawn as the participant's image (see [Icons and images](#icons-and-images)) |
| `%% comment` | A comment line |
| `<br/>`, `#9829;`, emoji | A line break, an entity code, emoji as text |

The 26 arrows:

- `->>` and `-->>` (an arrow head), `->` and `-->` (no head), `-x` and `--x` (a cross), `-)` and `--)` (an open, asynchronous head), `<<->>` and `<<-->>` (heads at both ends): the first of each pair is solid, the second dotted.
- Half arrows (Mermaid 11.17+): `-|\` and `-|/` draw a filled half head above or below the line, `-\\` and `-//` a single stroke above or below it; each has a dotted form (`--|\`, `--|/`, `--\\`, `--//`), and written before the line (`/|-`, `\|-`, `//-`, `\\-`, and the dotted `/|--`, `\|--`, `//--`, `\\--`) the head is at the sender's end.

Mermaid 12.1 reads three forms that Mermaid 11 rejects: whitespace before `@{` (`participant A @{…}`), a hyphen in an id that has `@{…}` (`participant my-svc@{…}`), and `Link`, `Links`, `Properties` or `Details` as an id (they start a statement only when an id and `:` follow). mmdx reads them and reports each line with the info `seq.v12-syntax`; the editor never writes them.

### Diagnostics

| Code | Severity | Meaning |
|---|---|---|
| `seq.cannot-parse` | warning | A line mmdx cannot read (an `else` outside a block, a declaration Mermaid's lexer rejects, a bad `autonumber`…); it is skipped |
| `seq.bad-color` | warning | The colour of a `box` or a `rect` is not valid |
| `seq.create-existing` | warning | `create participant X` for a participant that exists already, which Mermaid rejects |
| `seq.create-message` | warning | The message after `create X` is not to X, which Mermaid rejects |
| `seq.destroy-message` | warning | The message after `destroy X` is neither from nor to X, which Mermaid rejects |
| `seq.bad-json` | warning | The value of `links` or `properties` is not a JSON object; Mermaid ignores it |
| `seq.bad-type` | warning | A participant `type` Mermaid does not draw; the participant is drawn as a box |
| `seq.v12-syntax` | info | Syntax that Mermaid 12.1 and later read and Mermaid 11 rejects |

## Participant types

| Type | Drawn as |
|---|---|
| `participant` (the default) | A box with the name in it |
| `actor` (the keyword, or `"type": "actor"`) | A stick figure, the name under it |
| `boundary`, `control`, `entity` | Their UML figures, 40 px tall, the name under them |
| `database` | A cylinder with the name in it |
| `collections` | Stacked boxes with the name in the front one |
| `queue` | A horizontal cylinder with the name in it |

The editor's shape picker on a participant lists the eight types and two looks of mmdx's own, Rounded and Stadium. A type is written to the code: `actor` and `participant` as the keyword (a `type` entry in `@{}` is removed, and an emptied `@{}` with it), the others as `@{ "type": "queue" }`, keeping the rest of `@{}`, the alias and `create`. A participant whose id holds a hyphen or `=` keeps its type in metadata, since Mermaid 11 rejects `@{}` after such an id. Rounded and Stadium are metadata `shape`, drawn by mmdx only. An older file's metadata `shape: "hcyl"` or `"database"` is still drawn; choosing the shape again writes the type to the code.

## Icons and images

A participant's icon token at the start of its display name (`participant A as fa:fa-user Alice`) is drawn above the name (metadata `iconPos` `t`, the default for participants; `l` inline before it, `b` below; `iconSize` and `iconColor` as for [state diagrams](/guide/state)); stock Mermaid shows it as text. The editor has no Icon button for participants: an icon is the source of an image participant (below).

A participant's picture is metadata, drawn as a flowchart [image node](/guide/flowchart): the picture is the head, the name its caption, with the flowchart's keys (`img` or `icon`, `w`, `h`, `constraint`, `pos`, `form`, `imgFit`; `imgW` / `imgH` still size a picture) — `%%@ participant A {"img":"https://…","w":120,"h":90,"pos":"b","constraint":"on"}`; it takes the place of the box or the figure, and the mirrored foot repeats it. Mermaid's `properties A: {"icon": "https://…"}` is drawn the same way when the participant has no picture in its metadata, and kept as written; the editor never writes it. URLs go through the [image policy](/guide/security#image-policy). The Image tool adds a participant with the picture, and **Change image** changes it, as in a flowchart.

Icon tokens in messages and notes are drawn too (without markdown); emoji are text everywhere.

## Messages

A message is an arrow from its sender's lifeline to its receiver's, with its text above the line (or on it, with `labelOnLine`); a message to the sender itself is a loop. A dotted message (`-->>`, `-->`, `--x`, `--)` and the dotted half arrows) is dashed with the theme's `replyDash` (`4 3` in the built-in themes), unless a preset or the message's own metadata sets a `dash`. Half arrows draw half a triangle, or a single stroke, above or below the line at the receiver, or, reversed, at the sender.

A central connection's end is a small circle on the lifeline's centre, where the arrow stops. Mermaid opens a process at such an end that it never closes, so it draws no activation bar there, and neither does mmdx.

## Numbering

`autonumber` numbers the messages after it. As in Mermaid, the counter starts at 1 and steps by 1; every message counts, numbered or not, and messages to the sender are numbered too. A diagram may have several `autonumber` statements: each switches the numbers on (`autonumber off`: off) and sets the next number (`autonumber 10`) and the step (`autonumber 10 5`) when it gives them, so a diagram can number one part, stop, and restart with other numbers. The text outline ([`outline()`](/api/core#outline)) uses the same numbers.

## Create and destroy

`create participant B` (or `create actor B`) declares a participant that appears with the next message, which must be to it: its head is drawn at that message's row, and its lifeline starts there. `destroy B` ends B's lifeline at the next message, which must be from or to B, with a cross; with mirrored heads, B's lower head sits under the cross. A message that breaks these rules is drawn as written and reported (`seq.create-message`, `seq.destroy-message`), since stock Mermaid rejects the file.

## Blocks and boxes

`loop`, `alt`, `opt`, `par`, `critical` and `break` are frames around their statements, with their condition at the top and a tag with the block's kind in the corner, as Mermaid draws them; `else`, `and` and `option` start a branch, under a dashed divider with its condition. `rect` is a filled region without a tag or text. Nested blocks are inset per level.

The kind tags are on by default (the theme's `block.showTag`). The page preset **Blocks without kind tags** (`plain-blocks`) of the built-in themes hides them, and so does the page setting `blockTags: false` (`%%@ canvas {"blockTags":false}`); a block's own `showTag` (its metadata or its preset) still wins. See [Theme file → sequence](/api/theme-file#sequence).

`box` … `end` groups the participants declared inside it under a title, in its colour.

## Links

`link A: Dashboard @ https://dash.example.com` gives participant A a link labelled "Dashboard" (Mermaid cuts the label one character before the `@`), and `links A: {"Dashboard": "https://…", "Wiki": "https://…"}` gives it several; a label given again keeps its place with the new URL. Every URL goes through the [link policy](/guide/security#link-policy). The first link that passes is the participant's link, unless its metadata has a `link` of its own; when the participant has two or more, a click on it in the viewer (and in the editor's View mode) opens a menu of them at the pointer, as Mermaid's popup does, and the chosen one fires `mmdx-link`.

`properties A: {…}` is read as JSON and kept; `details A: element-id` names an element of the host page, from which Mermaid reads its JSON, and is kept without being read.

## Layout

The layout follows the code: participants from left to right in the order they are declared or first mentioned, messages, notes and blocks in rows from top to bottom. The page settings `gap`, `rowH`, `mirror` (heads at the bottom too), `blockSpan` (`full` or `touched`) and `margin`, from a page preset or `%%@ canvas`, set the spacing ([Theme file → layout](/api/theme-file#layout)); metadata `x` and `w` move and size a participant, and `dy` adds space above a message, a note or a block.

## Editing

A new sequence diagram starts from `sequenceDiagram` (the Sequence card of the editor's "Start a diagram" chooser, the studio's New menu, `starterSource('sequence')`). The editor writes every change to the Mermaid code and keeps the rest of each line as written:

- **Shapes menu** (`S`): Participant, Actor and Database add `participant P1`, `actor Actor1` or `participant P1@{ "type": "database" }` before the participant right of the drop point; Note, dropped next to a participant, adds `Note over P1: note` after the message above the drop; Loop, Alternative, Optional, Parallel, Critical region, Break and Highlight (`rect`), dropped on a message, wrap it in a block (or wrap the selected messages).
- **Messages**: drag from a lifeline's circle sideways to another lifeline for a new message (back to the same one for a message to itself), up or down for a process. A message's end circle dragged up or down to another message makes a process between the two; dragged sideways to another lifeline, it re-attaches that end there ("Message re-attached to B"). Two selected messages become one process with **Show as process**.
- **Arrow**: the floating toolbar's arrow popover writes Mermaid's ten arrows in two rows, solid (`->>`, `->`, `-x`, `-)`, `<<->>`) and dotted (`-->>`, `-->`, `--x`, `--)`, `<<-->>`), with previews; only the token changes, `()` and `+` / `-` stay. Half arrows are read and kept but not offered. **Reverse** swaps the message's ends (a central connection's circle stays with its participant); it is refused for a message to its sender and where the processes would no longer balance.
- **Notes**: the toolbar's left of, right of and over buttons, and Properties' **Note placement**, rewrite the note's placement (a note over two participants goes beside the first). Dragging a note's edges spans it over more participants or fewer; while it covers one participant, it keeps `left of` / `right of`.
- **Blocks**: on an `alt`, `par` or `critical` block, the toolbar's **Add branch** writes an `else`, `and` or `option` at the end of the block and **Delete the last branch** removes the last one; Properties lists the **Branch conditions**, one row per branch after the first (edited in place), with **Add branch** and a **Delete branch** button per branch, which removes the branch with its statements (refused when that would leave a process unbalanced). Dragging a block's edges takes statements in or out.
- **Text**: double-click (or Properties) edits a participant's name, a message's or a note's text, a block's condition and a box's title. A rename changes only the alias: the `as` alias, else `@{ "alias": … }` when that is the form in use, else a new ` as …` after the id or its `@{…}`; `create`, the id and the `@{…}` data stay. A `rect` has no text, so it has none to edit and its colour is never overwritten.
- **Participants**: the ◀ ▶ arrows over a selected participant move it left or right in the code; ⌘G puts the selected participants in a `box`, Ungroup removes it.
- **Processes**: the top and bottom handles of an activation bar move its start and end to other messages.

Every change is one undo step, and every output is code stock Mermaid 11.17 and 12.2 parse (the test suite checks each op against both). Sequence items are not copied (⌘C works for flowchart and ER items).

## History and diff

The [diff](/components/diff) and History match participants by id; messages are aligned in order, by their ends, text and arrow, so a message inserted above shifts the others without changing them; notes by their participants, blocks by their kind and condition. A message's text, its arrow as written (`->>` or `-->>`, a central connection's `()`) and its process markers are content, as are a participant's name, kind, type, box and order, a note's text and placement, and a block's condition; a `rect`'s colour and metadata looks are style; the title and numbering are changes of the page.

## What stock Mermaid shows

The same file opens in stock Mermaid (GitHub, GitLab, Mermaid Live) with the same participants, messages, notes, blocks and numbers. Besides its own spacing, stock Mermaid:

- shows icon tokens as text in sequence diagrams, Font Awesome's included;
- rejects the Mermaid 12.1 forms in version 11 (`seq.v12-syntax`), and a `create` or `destroy` its next message does not match;
- knows nothing of the `%%@` metadata: positions, widths, extra space, presets, looks and the hidden block tags there are mmdx's.

The editor's **Plain Mermaid** preview shows what stock Mermaid draws.
