# Themes and design languages

This product keeps two visual axes deliberately separate, and that separation is
what lets any college adopt it — and change its mind later — without forking.

| Axis | Question it answers | Who chooses | Where it lives |
| --- | --- | --- | --- |
| **Theme** | How much light comes off the screen? | The person using the device | `data-theme="light\|dark"` on `<html>`, remembered per device |
| **Skin** | What does the interface look like? | The institution | `data-skin="…"` on `<html>`, set from `config/institution.json` |

There is also a third, smaller switch: **text size** (`data-text="normal|large"`),
a per-device accessibility choice, the mirror image of the theme.

Because the axes are independent, a college that switches to a government-portal
look keeps dark mode, keeps large text, and keeps every contrast guarantee. The
palette lives in the theme layer; a skin only changes structural tokens.

---

## 1. The shipped skins

Four design languages ship today. **Modern institutional** is the default.

### Modern institutional (default)

A calm, contemporary public-service interface: white surfaces on a soft
blue-grey page, one confident blue for action, green for done, soft elevation
instead of hard edges, generous whitespace and sentence-case labels. It is
designed to read as trustworthy to a registrar and familiar to a student.

- **Rounded surfaces** (10–22px radii) with soft elevation (`--shadow*`).
- **One action colour** (blue) plus semantic green/amber/red; colour is never the
  only signal, every chip carries its word.
- **Sentence-case labels** and larger headings for fast scanning.
- **No page texture**: the surface is clean, and content is the loudest thing.

### Engineering blueprint

A technical, drawing-sheet variant that keeps the original brutalist vocabulary:

- **Squared corners** (2px radius) and 1–3px hard rules.
- **Engineering-paper grid** behind the page (`--grid-line` at 28px, with a
  heavier rule every fifth cell).
- **Hard plate edges instead of blurred shadows** (`--plate-lift*`).
- **Hazard markings** reserved for the brand plate and live/urgent states.
- **Stencilled labels**: uppercase, wide tracking.

### Government portal and university portal

Flat, dense, print-first (government) and serif-headed, crest-driven, generous
measure (university). Both keep every accessibility guarantee.

### Common to all skins

- **Identifiers in tabular monospace** (`.ident`): case numbers, asset codes and
  roll numbers line up in columns and never confuse 0 with O.
- **Status is always colour plus a word.** Every chip carries its label.
- **Palettes live in the theme layer**, so a skin cannot break contrast.

### Where the files are

```
frontend/src/styles/
  index.css      the manifest — four layers, imported in order
  tokens.css     1. design tokens: type, spacing, themes, skins
  base.css       2. reset, typography, accessibility, layout primitives
  components.css 3. plates, buttons, chips, forms, tables, overlays
  app.css        4. shell, page structure, stations, landing, device lab
```

The cascade rule: a later layer may build on an earlier one but never re-declares
a rule an earlier layer owns. Each file opens with its contents list. Add a new
stylesheet by giving it a layer number — not by appending another override pass.

### The two themes, and the dark-mode traps already paid for

Both palettes live in `tokens.css` under `[data-theme='light']` and
`[data-theme='dark']`, held to the same standard: body copy clears 7:1, muted
copy and chip labels clear 4.5:1, `--muted-ink` is a real measured colour (never
body text at 60% opacity), and `prefers-color-scheme` is honoured only until the
app has read the saved preference.

The traps this theme set has already been through, encoded as rules so they are
not re-introduced by the next redesign:

1. **Structure is not text.** Borders use `--line` / `--line-soft`, which are
   softer than `--ink` in dark mode. A screen edged in pure white at night is
   physically painful.
2. **Tinted blocks pin their own copy.** Any `.tint-*` block forces
   `--on-block` copy and renders nested chips black-on-white. Without this,
   light-coloured blocks inherit pale dark-theme text and read as empty boxes.
3. **Text on danger uses `--on-danger`** — white in light, near-black in dark —
   because white on a mid red fails contrast in one of the two themes.
4. **No flash of the wrong theme.** `index.html` runs a pre-paint script that
   sets `data-theme`, `data-skin` and `data-text` before first paint, from
   localStorage (with the cached institution config consulted for the skin).

---

## 2. The skin registry

`frontend/src/theme/registry.ts` is the single list of design languages. Each
entry records its id, status (`shipped` or `planned`), a one-line summary, the
characteristics an administrator can check, and who asked for it.

- `modern` — **shipped**. The default: bright institutional, soft elevation,
  one confident blue for action, generous whitespace, sentence-case labels.
- `industrial` — **shipped**. Engineering blueprint: squared plates, a faint
  drawing-sheet grid, hazard markings and stencilled labels, for a technical
  drawing-sheet feel on shared desks and projectors.
- `govt-portal` — **shipped**. Flat and dense, 1px hairlines, sentence-case
  labels, no visible grid, print-first. For colleges filing documents with
  state or central portals.
- `university-portal` — **shipped**. Serif display headings (system stack, no
  webfont), soft radius restored, longer measure. For institutions that must
  visibly match an existing website identity.

A skin becomes selectable only once its token block exists, so a switch that
nothing implements is never offered.

### Adding a skin (the whole procedure)

1. **A token block.** Copy the `[data-skin='modern']` block in
   `tokens.css`, rename the selector, change the values — radius, border
   widths, plate lift, label transform, panel head treatment, grid visibility,
   optionally the display font. Usually 15–25 lines.
2. **A registry entry.** Add it to `SKINS` in `src/theme/registry.ts` with
   `status: 'shipped'` and honest characteristics.
3. **A configuration line.** Point `appearance.skin` at it in
   `config/institution.json`.
4. **A four-width check.** Both themes at 390 / 768 / 1280 / 1600. Palettes and
   the contrast floor come from the theme layer, so they carry over untouched.

Nothing in the application branches on the skin name. A new design language
therefore cannot silently lose an accessibility guarantee, a permission check or
an offline behaviour that a shipped one has.

Example skeleton (from the registry comments):

```css
[data-skin='govt-portal'] {
  --radius: 0px;
  --border-w: 1px;
  --plate-lift: 0px;        /* no raised edges: flat tables */
  --label-transform: none;  /* sentence-case labels */
  --label-tracking: 0;
  --panel-head-bg: var(--surface-sunken);
  --grid-line: transparent; /* no visible grid */
  --font: 'Noto Sans', system-ui, sans-serif;
}
```

Both example skins are now implemented in `tokens.css` and selectable from the
account menu's design-language preview.

### Density and high contrast

Two more per-device choices sit beside the theme and text size, applied as
attributes on `<html>`:

- `data-density="compact"` tightens spacing for queue, audit and table screens
  (it does **not** shrink touch targets — density is about whitespace).
- `data-contrast="high"` widens structure and lifts muted copy to full ink,
  without changing any palette. The OS-level `prefers-contrast: more` path
  remains as well.

---

## 3. Roadmap: what colleges are expected to ask for next

### Shipped in this build

`SHIPPED_DESIGN` in the registry records what has left the roadmap, so the
setup and guide screens never list finished work as future work:

| Capability | Where it lives |
| --- | --- |
| Brand accent from the institution config | `appearance.accent`; applied by `state/theme.tsx` only after a WCAG contrast check |
| Crest and logo slot | `appearance.crest_url`; rendered by the shell with a monochrome dark-theme treatment |
| Right-to-left layout | `appearance.direction`; the shell and layout primitives use logical properties |
| Density and high-contrast variants | per-device `data-density` / `data-contrast` on `<html>` |

### Still planned

Kept in the product (`DESIGN_ROADMAP` in the registry, rendered on `/setup` and
on Guide → Themes & roadmap) rather than in a tracker nobody opens:

| Item | Effort | Note |
| --- | --- | --- |
| Time-of-day automatic theme | product change | Follows shift hours, not the device setting |
| Per-station default theme | config only | Lobby kiosk light, security post dark; belongs in the `stations` block |
| Additional institution skins | new skin | A fourth/fifth design language beyond the three shipped |
| Portable design pack (import / export) | product change | Ship a skin, accent, crest and density as one adoptable file |

Effort buckets, honestly labelled:

- **config only** — a value in `config/institution.json`.
- **one token block** — a palette or spacing set in `tokens.css`; no components.
- **new skin** — the four-step procedure above.
- **product change** — real code, and it will say so when it is estimated.

---

## 4. In-product surfaces to know about

| Surface | Route | What it shows |
| --- | --- | --- |
| Institution setup | `/setup` (`config:manage`) | Live config + provenance, edit checklist, skins with preview buttons, the design roadmap |
| Guide → Themes & roadmap | `/guide?tab=themes` | The two-axis model, registered skins, roadmap — for non-administrators and reviewers |
| Skin preview | account modal (administrators) | Per-device skin switch; the institution default is unchanged |

The preview deliberately changes only the current device: evaluating a new look
should never require risking the deployment.
