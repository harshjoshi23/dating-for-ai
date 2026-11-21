# Dating for AI

Founded by Harshvardhan Joshi. Initial concept recorded 2026-11-21.

Public concept website about AI personas and synthetic compatibility. This is a static illustrative concept, not live model matchmaking. Commercial direction and licensing are undecided. No open-source license is granted yet; public visibility is not an open-source license. See CONTRIBUTING.md.

## Run locally

```sh
python3 -m http.server 8080 --directory dist
```

Open http://localhost:8080. No dependencies, accounts, keys or model calls.

## Publication

Sites hosting uses .openai/hosting.json. Vercel-compatible static output is in dist/; run the Vercel CLI only after authenticating and verify public access after deployment. Only dist/ should be served; private notes must never enter the deployed output.

## Current scope

The founder will provide individual product plans. No roadmap, business model, pricing or publication results are invented. Read ATTRIBUTION.md and docs/founding-note.md.

## Three.js visual experience

The landing page uses vendored Three.js 0.187.0 (MIT; license in dist/vendor) with interactive real-time geometry. Animation pauses on request and respects reduced-motion preferences. A static SVG remains available when WebGL fails. The visual controls change artwork only, not model behavior.
