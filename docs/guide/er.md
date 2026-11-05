# ER diagrams

mmdx reads, draws and edits Mermaid entity relationship diagrams (`erDiagram`), and writes them back as Mermaid code, so a file still opens in stock Mermaid. Tables are cards with their attributes, relationships are crow's-foot lines, and subgraphs (Mermaid 11.17+) are frames around tables, laid out with the [compound layout](/components/editor#auto-layout) like flowchart subgraphs. This page lists the syntax mmdx reads, how it draws it, and how the editor changes it.

<MmdxDemo example="shop-domains-er" controls="zoom code export theme" />

## Syntax

```mmdx
---
title: Online shop
---
erDiagram
  direction LR
  CUSTOMER["**Customer**"]:::core {
    string id PK
    string email UK "login"
    string? phone
  }
  CUSTOMER ||--o{ ORDER : places
  ORDER only one to one or more LINE-ITEM : contains
  subgraph Catalog [Catalog domain]
    PRODUCT
  end
  LINE-ITEM }o..|| PRODUCT : "refers to"
  classDef core fill:#e8f1ff,stroke:#3b6fd8
```

mmdx reproduces Mermaid's own lexer for ER diagrams (`erDiagram.jison`, the same in 11.17 and 12.2: its rules, start conditions and first-match order) over the code as Mermaid's preprocessing leaves it, so what Mermaid reads as one token mmdx reads the same way, and a file means the same diagram in both. The model is checked against the one Mermaid's own ErDB builds.

| Syntax | Reads |
|---|---|
| `erDiagram` | The header; frontmatter, `%%{init}%%` and blank lines may come before it. Without it: `er.header` (error) |
| `CUSTOMER`, `"Line item"` | A table, created by its first mention; an id is a run of letters, digits, `_`, `-`, `*`, `.` and any non-ASCII character (Unicode and emoji), or a quoted name |
| `CUSTOMER { string name PK "comment" }` | Attributes, one per line (see [Attributes](#attributes)) |
| `p["Person"]`, `p[Person]` | An alias: the name drawn instead of the id, one word or a quoted text, drawn as markdown |
| `A \|\|--o{ B : label` | A relationship with its two cardinalities, its line and its label (see [Relationships](#relationships)) |
| `A only one to zero or more B : label` | The same in words |
| `subgraph id [Title words]` … `end` | A subgraph (Mermaid 11.17+), nested to any depth, with an optional title in square brackets (see [Subgraphs](#subgraphs)) |
| `direction LR` | `TB`, `BT`, `LR`, `RL`: at the top level, the diagram's direction; in a subgraph, the subgraph's |
| `classDef name fill:#f00,stroke:#333`, `classDef default …` | A class (two `classDef` lines of one name are merged); `default` styles every table |
| `class A,B name`, `A:::c1,c2` | Classes of tables and subgraphs; `:::` also after either end of a relationship |
| `style A fill:#f00` | The style of tables and subgraphs |
| `accTitle: …`, `accDescr: …`, `accDescr { … }`; frontmatter `title:` | The accessible name and description (the SVG's `<title>` and `<desc>`); the title, drawn above the diagram |
| `%% comment` | A comment line |
| `#9829;`, emoji | An entity code, emoji as text |

Mermaid's statement rules are kept, and some of them are easy to trip over:

- A relationship label is one word or a quoted text: `A ||--o{ B : places order` labels the relationship "places" and adds a table `order`. Quote labels with spaces (`: "places order"`).
- A table's alias is the first one written: a later `A["Other"]` does not rename it.
- `direction TD` is not a direction in an ER diagram: Mermaid reads the tables `direction` and `TD`, and so does mmdx.
- Words the lexer reads as something else cannot be bare ids: cardinality words (`one`, `many`, `only one`…), `to`, numbers, and keywords such as `end`, `class`, `classDef`, `style` and `subgraph`. Quote them (`"end"`); the editor quotes every id Mermaid would not read as one word.
- `classDef`, `class`, `:::` and `style` apply to the tables and subgraphs that exist when the line is read, as in Mermaid's ErDB.

### Diagnostics

| Code | Severity | Meaning |
|---|---|---|
| `er.header` | error | The `erDiagram` header is missing |
| `er.cannot-parse` | error | A statement Mermaid cannot read (a character no rule reads, a relationship without a cardinality or an end, a label of several unquoted words after `:`…); it is skipped and the parse goes on at the next line |
| `er.bad-attribute` | error | An attribute Mermaid cannot read (no type, no name, keys before the name); the rest of the block is read |
| `er.rel-label` | error | A relationship without its `: label`, which Mermaid requires; mmdx draws it. Fix: **Add an empty label** (`: ""`) |
| `er.rel-alias` | error | An alias on a relationship line (`A["Alias"] \|\|--o{ B : x`), which Mermaid rejects; mmdx reads both. Fix: **Move the alias to its own line** |
| `er.unclosed` | error | A subgraph without its `end`; its contents are kept |
| `er.title-statement` | warning | A `title …` statement: Mermaid reads its words as tables; mmdx draws it as the title. Fix: **Move to the frontmatter** |
| `er.subgraph-later` | warning | A relationship names a subgraph before the subgraph's `end`; Mermaid links it to a table of that id, which it does not draw, while mmdx draws it to the subgraph |
| `er.id-clash` | warning | A table with attributes or an alias has the id of a subgraph: Mermaid draws only the subgraph, and so does mmdx |
| `er.bad-style` | warning | A value of `classDef` or `style` that is not valid |
| `er.md-parent` | info | Mermaid's `u` cardinality, which has no marker of its own: mmdx draws it as exactly one |

## Attributes

An attribute line is `type name`, then optional keys and a comment: `string email UK "login"`, `int orderId PK, FK`. The keys are `PK`, `FK` and `UK`, separated by commas; the comment is in double quotes. A type ending in `?` is optional (`string? phone`, Mermaid 11.16+), shown as written. Types and names take any non-ASCII character, and a type may hold brackets, dots and commas (`decimal(10,2)`, `varchar(255)`).

A table is drawn as a card with its name and its attributes, either compact (the attributes as text) or as a table with columns (`mode: table`); types, comments and key underlines are theme settings ([Theme file → er](/api/theme-file#er)). Metadata `attrs` highlights single attributes (bold, italic, underline, a colour or one of the attribute looks).

## Relationships

A relationship is `A <left><line><right> B : label`. Mermaid's 21 cardinality spellings:

| Cardinality | Left of the line | Right of the line | Words (either side) |
|---|---|---|---|
| Zero or one | `\|o` | `o\|` | `zero or one`, `one or zero` |
| Exactly one | `\|\|` | `\|\|` | `only one`, `one`, `1` |
| Zero or more | `}o` | `o{` | `zero or more`, `zero or many`, `0+`, `many(0)`, `many` |
| One or more | `}\|` | `\|{` | `one or more`, `one or many`, `1+`, `many(1)` |

The line is `--` or `to` for an identifying relationship (solid), `..`, `.-`, `-.` or `optionally to` for a non-identifying one (dashed with the theme's `rel.dash`). Mermaid also reads `u` before a line (`u--o{`); it has no marker of its own, and mmdx draws it as exactly one (`er.md-parent`).

A relationship from a table to itself is a loop beside the table — on its right, or below it when the diagram runs left to right — with both cardinality markers, its label and its line; the layout leaves room for it.

## Aliases and markdown

`CUSTOMER["**Customer**"]` draws the alias instead of the id. Mermaid draws ER aliases as markdown, and so does mmdx: `**bold**` and `*italic*` runs are drawn as such, and a markdown string's backticks (`` "`**x**`" ``) are not part of the text. The id stays the table's id in relationships, metadata and the editor.

A table's icon is a label token at the start of its alias: `CUSTOMER["fa:fa-user Customer"]`. mmdx draws it before the title (metadata `iconPos` `l`, the default), or above or below it (`t`, `b`), at the text's size or `iconSize`, in `iconColor`. Only an alias holds an icon: a bare `CUSTOMER` is its id as text. The editor's Icons tool (and the Icon button of a table's toolbar) writes the token into the alias, giving a bare table one (`CUSTOMER["fa:fa-user CUSTOMER"]`) and declaring a table that only appears in relationships; the alias stays when the icon is removed. Stock Mermaid draws `fa:` tokens in aliases, and shows other packs' tokens as text. Emoji go in the alias as well. Tables have no images (metadata `img` is ignored and the Image tool is hidden). mmdx also draws icon tokens in relationship labels and subgraph titles.

## Classes, styles and presets

`classDef` and `style` are applied as in Mermaid: `fill`, `stroke`, `stroke-width`, `stroke-dasharray` and `color` (which colours the title and the attributes; font sizes stay the card's). A table is styled, later wins, by the theme, the diagram's base style, its preset, `classDef default`, its classes, its `style` line and its own metadata. A class that names a preset — of the theme's `er.entityPresets` or the diagram's own (`%%@ style.entity <name>`) — draws the table with that preset; a preset chosen in the editor goes into the metadata (`preset`), as do the toolbar's looks. A class used but defined nowhere, neither as a `classDef` nor as a preset, is listed in the editor's Problems.

## Subgraphs

`subgraph id [Title words]` … `end` (Mermaid 11.17+) draws a frame with a title around the tables it holds; the title is optional (the id is shown without one). As in Mermaid, a subgraph holds the tables its statements name — a table declared in it, and both ends of a relationship written in it — and a table named by several belongs to the first subgraph that closes, so an inner subgraph claims its tables before the one around it. A relationship to a subgraph's id ends on its frame; write it after the subgraph's `end`, since before it Mermaid links it to a table of that id (`er.subgraph-later`).

Frames take the flowchart's subgraph style (`flowchart.group`) and its group presets, `box` by default; `classDef`, `class`, `:::` and `style` apply to subgraphs too, and a class naming a group preset gives the frame that preset.

`direction LR` inside a subgraph lays out its contents that way, unless a relationship from outside reaches a table inside it (Mermaid's rule); without one, a subgraph follows the direction around it.

## Layout

A diagram without subgraphs is laid out in layers, in its `direction` (`TB` without one). With subgraphs, mmdx uses the compound layout: each subgraph is laid out as a container of its own and moves as one box, so frames never overlap each other or other tables, and relationships between auto-placed tables go around the frames and tables that hold neither of their ends.

As in a flowchart, a table moved by hand keeps its place (metadata `x` / `y`), a subgraph resized by hand keeps its frame, and relationships take bend points, ports and routing from their metadata (`%%@ rel CUSTOMER--ORDER {…}`); subgraphs are `%%@ group <id>` lines. The editor's **Auto layout** and **Reset positions in this group** work as for flowcharts ([Auto layout](/components/editor#auto-layout)).

## Editing

A new ER diagram starts from `erDiagram` (the ER diagram card of the editor's "Start a diagram" chooser, the studio's New menu, `starterSource('er')`). The editor writes every change to the Mermaid code, splicing only what changes:

- **Shapes menu** (`S`, Table): a table `ENTITY_1 { string id PK }`, with the chosen table preset, at the drop point; dropped on a subgraph, it is written before the subgraph's `end`.
- **Attributes**: double-click a table's attributes to edit them on the canvas, or edit them in Properties, one line each (`type name PK (comment)`); see [the editor page](/components/editor#er-diagrams).
- **Connecting**: drag from a table's or a subgraph's connection handles to another one for `A ||--o{ B : ""`, at the end of the code. Reconnecting an end rewrites only that id; a table that lived only in that relationship stays, declared on its own line.
- **Relationships**: Properties set the cardinality of each side, **Identifying** and the label. Each change rewrites its own token and keeps the form written there: words stay words (`zero or more`, `optionally to`), symbols stay symbols (`o{`, `..`); a missing label is added.
- **Text**: double-click (or Properties) edits a table's name, a relationship's label or a subgraph's title. A table's name is its alias, rewritten where Mermaid reads it (the first one written), with its `:::` classes and its block kept. Ids, labels and titles are quoted where Mermaid would not read them as one word.
- **Subgraphs**: ⌘G on tables and subgraphs of one scope wraps them in `subgraph group1 ["Group"]` … `end`, written where the first selected item is; **Ungroup** and **Delete** remove the frame and keep what it holds (the relationships to the subgraph itself go with it). Properties set a subgraph's **Direction** (Mermaid's default, as the diagram, or `TB`, `BT`, `LR`, `RL`, as its block's line). A click inside a subgraph selects it first, as in flowcharts.
- **Page**: the page's Direction writes the top-level `direction` line.
- **Deleting** a table removes its statements and every relationship touching it; a table that lived only in a deleted relationship stays, declared where the relationship was, so it keeps its subgraph.
- **Copies**: ⌘C / ⌘V, ⌘D and Alt-drag copy tables with new ids, their attributes and the relationships between the copies; a copy of a table in a subgraph goes into the same subgraph.

Every change is one undo step, and every output is code stock Mermaid 11.17 and 12.2 parse (the test suite checks each op against both, and every one of the 21 cardinality and 6 line spellings through an edit and back).

<MmdxDemo kind="editor" example="atom-schema-er" />

## History and diff

The [diff](/components/diff) and History match tables and subgraphs by id and relationships by their ends. A table's name, its attributes and their order, a relationship's label, cardinalities and line, and a subgraph's title are content; a table or a subgraph moved into another subgraph, and a subgraph's direction, are layout changes; classes, `style`, `classDef` and metadata looks are style. The merged picture keeps a removed table and a removed subgraph in their old subgraph, and marks changed text word by word.

## What stock Mermaid shows

The same file opens in stock Mermaid (GitHub, GitLab, Mermaid Live) with the same tables, attributes and relationships — mmdx's model is checked against the one Mermaid 11.17 and 12.2 build — but laid out by Mermaid's own layout. Besides the layout, stock Mermaid:

- draws subgraphs from version 11.17 on only;
- fails on a relationship without a label and on an alias on a relationship line (mmdx draws them, with errors and fixes);
- reads a `title` statement as tables (mmdx draws it as the title, with a warning);
- links a relationship that names a subgraph before its `end` to an undrawn table;
- styles a class that names an mmdx preset only if the class has a `classDef`;
- knows nothing of the `%%@` metadata: positions, bend points, routing, presets, looks and attribute highlights there are mmdx's.

The editor's **Plain Mermaid** preview shows what stock Mermaid draws.
