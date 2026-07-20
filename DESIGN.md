# Design System: Neo-Brutalist 2.0

How the toolbox looks, why it is built this way, and what to do when you add a tool.

## The look

One indigo accent. 2px ink borders. Hard offset shadows, never blurred. Zero corner radius. Heavy uppercase headings in Helvetica. Dark mode mirrors the launcher: deep navy surfaces with light-blue borders.

Only system fonts are used. The toolbox is offline-first, so there are no webfont downloads and no CDN links anywhere.

## Where the design lives

`styles/theme.css` is the single source of truth. Nothing else defines the design system.

The tools' Content-Security-Policy is `default-src 'none'` with `style-src 'unsafe-inline'`, which means **a linked stylesheet will not load**. So `scripts/build.mjs` inlines the theme into every tool between `TOOLKIT:THEME:neo-brutalist` markers.

**Edit `styles/theme.css`, then run `npm run build`.** Never hand-edit the generated block inside a tool: the next build overwrites it, and CI fails if generated output is not committed.

Verify with `npm run verify` (build + tests + self-containment checks) before pushing.

## Tokens

Every tool inherits these. Use them instead of literal colors.

| Token | Meaning |
| --- | --- |
| `--t-bg` | Page background |
| `--t-panel` / `--t-panel2` | Panel surface / recessed inset |
| `--t-ink` / `--t-ink2` | Primary / secondary text |
| `--t-line` | Border color (also the shadow color in light mode) |
| `--t-accent` / `--t-accent-ink` / `--t-accent-soft` | Accent, text on accent, tinted accent background |
| `--t-ok` `--t-warn` `--t-err` (+ `-bg` variants) | Status colors |
| `--t-shadow-color` | Offset shadow color |
| `--t-font-sans` / `--t-font-mono` | Type stacks |

Both light and dark values are defined for all of them, so a token-based rule works in both modes automatically.

### Legacy variable families

Tools were written independently and use five different naming schemes (`--bg-primary`, `--bg-deep`, `--bg-color`, `--bg`, `--panel-bg`, and so on). The theme maps all of them onto the tokens above, which is why old tools got theming without being rewritten.

**New tools should use `--t-*` tokens directly.** Do not add a sixth naming family.

## Dark mode

Every tool has a toggle. The build injects one (bottom-right, `localStorage` key `toolbox-theme`, follows system preference until the user chooses) into every tool that does not already have its own.

The mode is expressed as `data-theme="light" | "dark"` on `<html>`. If a tool ships its own toggle, it **must** set that attribute — a toggle that only sets a body class will fight the theme's `prefers-color-scheme` fallback and lock the page into one mode. That was a real bug in the regulatory-marks tool.

Toggle icons must use `currentColor`, never a hardcoded stroke, or the icon disappears in one of the modes.

## Navigation

The build injects a "← Toolbox" chip at the bottom-left of every tool, mirroring the theme toggle at bottom-right. Both are hidden in print output.

Do not add your own back link. The theme hides any stray `href="../index.html"` anchors so the placement stays consistent.

## Rules for tool CSS

These are the mistakes that actually broke tools in this repo. They are worth reading before styling anything.

**Never use translucent black for a surface.** `rgba(0, 0, 0, 0.2)` looks like a subtle inset on a dark background and like muddy grey on a light one. Use `var(--t-panel2)` for a recessed surface. The only acceptable use is an overlay chip sitting on a permanently dark graphic.

**Decide whether a dark area is a surface or a stage.** A *surface* holds themed text and must follow the theme. A *stage* is a visualization viewport (canvas, SVG scene) that stays dark in both modes; give it a committed solid color such as `#111a2b` and use fixed light colors for labels drawn on top of it. Do not use theme tokens for text sitting on a stage — it will go dark-on-dark in light mode.

**`.container` is a page wrapper, not a panel.** In nearly every tool it only does max-width centering. Giving it a border and shadow puts a frame around the whole page. Panels are `.card` and `.panel`.

**Do not force colors onto semantic controls.** Buttons like `.level-btn`, `.mode-btn`, and `.preset-btn` encode meaning (IP levels, fps presets, severity). The theme deliberately styles only generic actions: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-clear`.

**Scroll wrappers are not panels.** Bordering an `overflow-x: auto` wrapper collapses its width and crushes the content inside.

**Hover states need visible colors in both modes.** A white-overlay hover border is invisible on a light background; use `var(--t-accent)`.

**Skip gradient-clipped headings.** Several tools used `background-clip: text` on `h1`; the theme flattens them to solid ink. Just use `color: var(--t-ink)`.

## Adding a new tool

1. Create `your_tool/your_tool.html` as a single self-contained page.
2. Add it to `tool-manifest.json` with an id, path, title, and tags. The launcher card, README inventory, theme, toggle, back link, and CSP meta tag are all generated from there.
3. Add a matching launcher card anchor in `index.html` (the build fills in its metadata and title).
4. Style with `--t-*` tokens and the rules above.
5. Run `npm run verify` and commit **all** changed files, including regenerated tool HTML. CI re-runs the build and fails if the committed output differs.

### Self-containment constraints

Enforced by `scripts/verify.mjs`, not just convention:

- No remote resources (no CDN scripts, stylesheets, fonts, or images).
- No root-relative URLs; everything is relative so the toolbox works from any subdirectory or the filesystem.
- No network calls at runtime (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`).
- Large dependencies are vendored under `vendor/` and inlined by the build, with their license embedded.
- Shared logic belongs in `scripts/runtime/*.mjs` so it can be unit-tested, then inlined into the tools that need it.

## Content guidance

Long free text (the FMEA causes and actions columns are the example) needs a minimum column width and a capped height with inner scrolling, so one long entry cannot blow up a row. Expand the field while it is focused and re-clamp on blur, and remove the cap in print styles so nothing is cut off on paper.
