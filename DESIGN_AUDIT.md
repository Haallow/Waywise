# PlanB technical design audit (historical)

This audit records the earlier Google based interface. Waywise migrated to the OSM/ORS stack afterward; its current implementation and setup are described in `README.md`.

## Current Waywise migration review — 2026-11-02

Two independent Impeccable assessments reviewed the migrated app. The design critique scored **30/40** across Nielsen's ten heuristics; the source-level technical audit scored **15/20** (accessibility 3, performance 3, theming 2, responsive design 3, implementation integrity 4). The source detector and rendered detector at 320×720, 390×844, 768×900, and 1440×900 returned `[]`. The [critique snapshot](.impeccable/critique/2026-11-02T15-17-28Z__client-src-app-jsx.md) archives the findings; the previous comparable score was 24/40.

The review led to fixes for the missing-baseline result crash, mobile result focus and announcement, search progress/cancellation, retention of the prior route on refresh failure, the initial Live map center, stable map panning, comparison disclosure styling, disabled controls during searches, and subdued markers for other considered venues. The Leaflet route line now uses the CSS route token, primary action arrows share one SVG, and unused schematic-map styles were removed. Other hard-coded CSS colors remain a low-priority token cleanup. A complete Zurich Overpass-backed route was verified through the guarded validation script; browser interaction, physical touch, and text zoom remain unverified. Rendered detector scans alone do not establish those behaviors.

Target: `client/src/App.jsx`, `client/src/MapPanel.jsx`, and `client/src/styles.css` in the default Demo Mode. Audited 2026-11-02 with the repository-local Impeccable `audit` guidance. This is a technical audit; the formal independent-agent `critique` is pending authorization.

## Audit health: 14/20 — Good

| Dimension | Score | Evidence and limit |
| --- | ---: | --- |
| Accessibility | 3/4 | Native buttons, labeled coordinate inputs and venue select, pressed states, status/error announcements, and visible focus styles are present. Keyboard and screen-reader interaction were not exercised in a browser. |
| Performance | 3/4 | The production JavaScript bundle is 247.82 kB (77.92 kB gzip). Google Maps loads only in Live Mode with a browser key. The local font package emits multiple script subsets; no network or runtime performance trace was captured. |
| Theming | 2/4 | The light palette is coherent, but colors are repeated as literals across CSS and SVG rather than maintained as reusable tokens. No dark theme is specified or implemented. |
| Responsive design | 3/4 | Layout has 980 px and 640 px breakpoints; mobile controls have 44 px minimum heights. Impeccable rendered scans at 320×720, 768×900, and 1440×900 returned no findings. Touch gestures and text zoom were not exercised. |
| Implementation integrity | 3/4 | Product-specific itinerary, source labels, trade-off explanation, and baseline are implemented. Both source scan and rendered detector returned zero findings. Some iconography still uses Unicode arrows, and the stylesheet has appended overrides after a compressed base rule. |

## Findings

- **P2 — Color values are duplicated.** `client/src/styles.css` and `client/src/MapPanel.jsx` hard-code the same palette. A future palette change could leave the schematic map or focus state inconsistent. Use a small CSS token set and pass map colors from the same source. Suggested command: `/impeccable polish`.
- **P2 — Small supporting text needs an interactive check.** Several hints, map labels, and metric labels are 11–12 px. The detector found no contrast violations, but text zoom and reading on a physical phone were not verified. Suggested command: `/impeccable typeset` followed by `/impeccable adapt`.
- **P3 — Icon styling is inconsistent with the design skill's craft floor.** The brand and primary action use a Unicode arrow while map markers use their own shapes. Replace the arrow with a single authored SVG when refining the visual system. Suggested command: `/impeccable polish`.

## Confirmed strengths

- The interface names fictional data and distinguishes a calculation-time Google estimate from navigation after handoff.
- Skip and restore recalculate using the current snapshot; completed errands remain recorded separately.
- The same directed matrix supplies the selected plan and the nearest-next comparison.

## Verification notes

`npm test` passed 15 tests; `npm run build` passed. The Impeccable source scan and rendered scans at 320, 768, and 1440 px returned `[]`. The computer-use browser host was unavailable, so no browser interaction, overlay, physical-device check, or live-key Google session was performed. The live map, permission-denied path, focus order, text zoom, and touch input remain unverified. No live Google credentials were present.

## Follow-up refinement

The three source-level findings above were addressed after this audit snapshot: the repeated core palette and schematic SVG now share CSS color variables; the brand and action arrows use one SVG; and small 11–12 px text roles were raised by 1 px. The stylesheet was formatted and overlapping late overrides were consolidated. Font imports now load only the Latin subset used by the English interface.

After these changes, `npm test` still passed all 15 tests and `npm run build` passed. Impeccable rendered scans at 320×720, 390×844, 768×900, and 1440×900 returned `[]`. Headless Chrome screenshots at 390 and 1440 px were visually inspected; a 390 px browser walkthrough verified profile recomputation, skip/restore, completion, and no horizontal overflow or Google requests in Demo Mode. A no-key Live Mode walkthrough verified permission denial, manual coordinates, loading, error, and reset. The physical-phone, zoom, full keyboard/screen-reader, touch, and live-key checks remain open; the original 14/20 score is retained as an audit snapshot rather than presented as a post-refinement score.

## Independent critique and subsequent changes

With user authorization, Impeccable's two independent critique assessments produced a 24/40 design review and zero deterministic detector findings. The archived report is in `.impeccable/critique/`. Its five priority issues led to a mobile route preview with an early itinerary jump and Maps link, a visible explanation of the four-errand limit, explicit completion with Undo, a plain-language comparison near metrics, and removal of the redundant Demo Mode refresh action. A native disclosure now holds the detailed score and baseline panels.

The mobile preview, paired Maps URLs, completion Undo (including after all stops), and errand-category unlocking were exercised in headless Chrome. The final attempt to exercise the new disclosure click was rejected by automatic tool policy, so that interaction remains unverified. No post-refinement critique score is claimed.
