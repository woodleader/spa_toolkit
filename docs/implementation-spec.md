# Offline-first architecture implementation

The deployed GitHub Pages artifact keeps every existing tool URL and remains a
collection of independent, self-contained HTML applications.

## Required behavior

1. Deployed HTML makes no runtime request for scripts, styles, fonts, images, or data.
2. Imported CSV, DBC, and JSON values cannot become executable markup.
3. Engineering calculations are exposed through deterministic calculation interfaces.
4. FPD-Link and GMSL2 share one channel-budget implementation.
5. Stateful tools use validated, versioned workspace persistence.
6. Launcher metadata and J1939 reference data have canonical structured sources.
7. One verification command checks generated artifacts, links, offline behavior, and tests.

Generated runtime modules are embedded into each consuming HTML file by
`npm run build`; no runtime module loader or client-side router is introduced.
