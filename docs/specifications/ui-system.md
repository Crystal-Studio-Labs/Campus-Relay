# UI System

One product, one design language, many experiences. The interface is an adaptive
client of the operational engine, not the engine itself.

## The design language: bright institutional

The shipped look is **modern institutional**: white surfaces on a soft blue-grey
page, one confident blue for action, green for done, soft elevation, generous
whitespace and sentence-case labels. It is built to read as trustworthy to a
registrar and familiar to a student.

- **Rounded surfaces** (10–22px radii) with soft elevation instead of hard edges.
- **One action colour** (blue) plus semantic green/amber/red.
- **Sentence-case labels** and larger headings for fast scanning.
- **Colour has meaning**: each status chip carries its word as well as its
  colour, so nothing depends on hue alone.
- **Identifiers in tabular monospace** so `0` never reads as `O`.

Three further design languages ship as skins — **engineering blueprint**
(technical, squared, blueprint grid), **government portal** (flat, dense,
print-first) and **university portal** (serif, crest-driven). A skin restyles
structure only; the palette stays in the theme layer, so contrast is never at
risk. See [THEMES.md](THEMES.md).

## Layered stylesheet

One manifest (`frontend/src/styles/index.css`) imports four layers in cascade
order:

```
tokens.css  →  base.css  →  components.css  →  app.css
```

| Layer | Contents |
| :-- | :-- |
| `tokens.css` | Colours, typography, spacing, radii, borders, shadows, breakpoints, status colours |
| `base.css` | Element defaults, focus rings, print rules, reduced-motion |
| `components.css` | `.btn`, `.card`, `.panel`, `.badge`, `.table`, forms, timeline |
| `app.css` | Shell, page structure, kiosk, landing, guide, device lab |

Nothing else in the app imports CSS.

## Two independent axes

| Axis | Question | Values | Stored |
| :-- | :-- | :-- | :-- |
| **Theme** | How much light comes off the screen | `light`, `dark` | per device (`campusrelay.theme`) |
| **Skin** | What the interface looks like | `industrial` (shipped) | per deployment (institution config) |

A **skin is a token set, never a fork**. No component branches on the skin name;
the skin only changes values in `tokens.css`. `govt-portal` and
`university-portal` are registered as `planned` (see `frontend/src/theme/registry.ts`)
and deliberately not selectable until their token blocks exist — a switch that
does nothing is worse than no switch. See `docs/THEMES.md`.

## Layouts

One shell (`layouts/AppShell.tsx`) with device-dependent form: bottom tabs on a
phone, a grouped rail on a desktop. Navigation is grouped into **Work / Manage /
Stations / Device** and filtered by permission **and** role.

Dedicated shells/layouts:

- `KioskShell` — huge targets, idle reset, clock, channel `KIOSK`.
- Helpdesk, staff tasks, security gate desk — their own page structures inside
  the shared shell.

The build spec's separate mobile/desktop layouts are realised as responsive
variants of one shell per role rather than 12 duplicated files, so business
logic is never duplicated.

## Shared components (`frontend/src/components/`)

`ui.tsx` (Button, Card, Badge, Metric, Tabs, Modal, Select, KV, PageHeader,
EmptyState/LoadingState/ErrorState), `CaseCard`, `NoticeCard`, `Timeline`,
`StatusChip`, `OfflineBar` (connectivity + sync centre sheet), `ScanTarget`
(camera + manual QR entry), `Assistant`, `Guide`.

## Accessibility

- WCAG AA contrast across both themes; `--muted-ink` is a measured colour, not
  faded body text.
- Large touch targets (`--touch-min: 46px`), semantic HTML, keyboard navigation,
  visible focus rings, `prefers-reduced-motion` and `prefers-contrast` support.
- Status is never colour-only.

## Responsiveness

Layouts are fluid from small phones to ultrawide. Tables use a
`.table-wrap.become-cards` pattern that converts to stacked cards on narrow
screens instead of scrolling sideways. Short-landscape phones drop the fixed
bottom bar so content is not eaten.
