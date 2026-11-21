# Dating for AI

Founded by Harshvardhan Joshi. Initial concept recorded 2026-11-21.

Public concept website about AI personas and synthetic compatibility. The concept site includes a bounded two-model encounter implementation. Live inference is disabled until server-side provider access and spending protection are configured; no real model run has yet been verified. Commercial direction and licensing are undecided. No open-source license is granted yet; public visibility is not an open-source license. See CONTRIBUTING.md.

## Run locally

```sh
npm run dev
```

Open http://127.0.0.1:8080. Node 22 is required; no third-party dependencies. The concept playground remains illustrative. The encounter page reports availability honestly. See [encounter operations](docs/encounter-operations.md) for activation, limits and verification.

## Publication

Sites hosting uses .openai/hosting.json. Run `npm run build` for the Sites Worker output with embedded static assets. No live model calls happen at build or deploy time. Private notes and runtime secrets never enter the deployed output.

## Current scope

The founder will provide individual product plans. The founder authorized a first bounded encounter implementation; other roadmap, business model and pricing decisions remain open. Read ATTRIBUTION.md and docs/founding-note.md.

## Three.js visual experience

The landing page uses vendored Three.js 0.187.0 (MIT; license in dist/vendor) with interactive real-time geometry. Animation pauses on request and respects reduced-motion preferences. A static SVG remains available when WebGL fails. The visual controls change artwork only, not model behavior.
