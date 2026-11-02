---
target: PlanB app interface
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Tom Dwayne\\Waywise\\client\\src\\App.jsx"
target_fingerprint: "sha256:90b3698a876b34364b1f6dbdf6c4b88b82e1fd7bbbc53e849e0944d9e17dfcba"
target_path: "C:\\Users\\Tom Dwayne\\Waywise\\client\\src\\App.jsx"
timestamp: 2026-11-02T13-52-28Z
slug: client-src-app-jsx
---
Method: dual-agent (A: `/root/design_assessment` · B: `/root/detector_assessment`)

## Design health: 24/40 — Acceptable

| # | Nielsen heuristic | Score | Key issue |
| --- | --- | ---: | --- |
| 1 | Visibility of system status | 3 | Source and loading states are visible; local replans have no clear updated-plan announcement. |
| 2 | Match with the real world | 2 | “Utility score,” “modeled quality,” and “greedy” need plain-language translation. |
| 3 | User control and freedom | 2 | Skip can be restored, but completed stops cannot be undone. |
| 4 | Consistency and standards | 3 | Controls and visual roles are coherent; “Refresh demo plan” conflicts with automatic recomputation. |
| 5 | Error prevention | 2 | Two categories appear disabled at the default 4/4 without an explanation. |
| 6 | Recognition rather than recall | 3 | Labels are visible, but mobile users must remember setup choices while reading distant rationale. |
| 7 | Flexibility and efficiency | 2 | Overrides exist; there is no fast route summary or jump to the result on mobile. |
| 8 | Aesthetic and minimalist design | 2 | Long schematic and technical analysis compete with the itinerary. |
| 9 | Error recovery | 3 | Errors provide recovery paths; completion lacks Undo. |
| 10 | Help and documentation | 2 | Hints exist but do not quickly explain weights or the live setup prerequisites. |
| **Total** | | **24/40** | **Acceptable** |

## Design specificity verdict

The planner, numbered itinerary, synthetic-data labels, and 384-plan count belong to this multi-errand agent. The teal and orange cards and broad slogan are more generic. The key product distinction—why these venues and this order beat the alternatives—appears too late. Assessment B found zero deterministic anti-patterns in `client/src/App.jsx` and no horizontal overflow at 390 px; those results do not negate Assessment A's information-hierarchy findings. The detector logged “No anti-patterns found” after successful injection in a headless Chrome tab. No user-visible overlay was available because the computer-use browser host was unavailable.

## Overall impression

The app feels trustworthy and orderly on desktop. On mobile, the task result and the Google Maps action arrive after a long setup and itinerary scroll. The largest opportunity is to surface the chosen trip and its reason earlier.

## What works

- Demo and Live provenance is clear; fictional values and navigation recalculation are stated honestly.
- The desktop planner, schematic, metrics, and numbered stops form a coherent route workflow.
- Preference switching, venue overrides, and skip/restore make the agent's local recomputation visible through changed results.

## Cognitive load and emotional journey

The checklist passes grouping and fails seven items: single focus, chunking, visual hierarchy, one thing at a time, minimal choices, working memory, and progressive disclosure. Six errand chips exceed the four-option decision threshold. The default 4/4 selection disables Pharmacy and Restaurant without saying why. A first-time user sees transparent source labels, then technical metrics; on mobile the payoff and rationale are separated by a long scroll. Completion changes the remaining route immediately, with no Undo or reassurance. The final Maps handoff is clear but distant from the opening view.

## Priority issues

1. **P1 — Mobile route payoff is too late.** At 390 px, controls and map precede the itinerary. Add a compact selected-route summary and a “View itinerary” jump near the top; disclose detailed math later. Suggested: `/impeccable adapt`, `/impeccable layout`.
2. **P1 — Four selected errands make alternatives look unavailable.** Explain “Remove one to add another” at the chips or start with fewer. Suggested: `/impeccable clarify`, `/impeccable onboard`.
3. **P1 — Completion is irreversible in this session.** Name the next stop in the action, announce the new remaining plan, and provide Undo. Suggested: `/impeccable harden`, `/impeccable clarify`.
4. **P2 — Why this plan is distant and technical.** Put one factual chosen-versus-baseline sentence near metrics; keep full model detail in a disclosure. Suggested: `/impeccable distill`, `/impeccable clarify`.
5. **P2 — Demo primary action implies staleness.** “Refresh demo plan” appears while a complete route already exists and preference switching is automatic. Relabel or relocate it. Suggested: `/impeccable clarify`, `/impeccable layout`.

## Persona red flags

- **Jordan, first-time user:** Utility math and 384 routes appear before the next action; disabled Pharmacy and Restaurant lack a reason.
- **Sam, keyboard or screen-reader user:** Native controls and focus styles help, but local replans have no live itinerary announcement; focus order was not exercised in the available browser.
- **Casey, distracted mobile user:** Reaching the Maps handoff requires a long scroll, and a page refresh loses in-memory progress.

## Minor observations

The map labels its line schematic, but the line can still resemble a road route. The timestamp lacks a “Calculated” label. One-decimal utility percentages may suggest more precision than the simple model has.

## Questions to consider

What should a hurried user learn first: 384 calculations, or the chosen stops and reason? Should the Maps action remain below every venue row on mobile? Does a utility percentage earn more trust than a direct time-and-quality comparison?
