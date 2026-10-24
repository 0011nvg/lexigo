# LEXIGO — technical audit, 2026-10-24

Scope: branch `design/lexigo-illustrated-experience`, based on merge `b8323d366cc9bab420311527d33ca69fc9d6a6ef`. This is a source inspection, NOT a completed browser/security/CI validation. The container could not clone GitHub because DNS resolution failed; source files were read through the GitHub connector.

## Confirmed source checks
- Parsed `data.json` directly: Spotlight 2 = 236 records / 33 sections; Spotlight 3 = 423 / 47; Spotlight 4 = 376 / 48. Total 1035 records across 128 sections, 1035 distinct word IDs.
- `index.html` is 43,303 characters and includes extensive inline CSS and page markup. It loads `data.js`, `game-components.js`, `game-engine.js`, `local-storage.js`, `local-game-adapter.js`, `practice-controller.js`, `navigation-controller.js`, plus `navigation.css`.
- Nine distinct `data-mode` buttons in HTML: cards, quiz, spell, pairs, truefalse, fix, audio, crystals, boss. Daily practice may be a separate flow, but requires tracing controller code. Do not claim all 10 are E2E-verified.
- Teacher interface `#teacherPage` and role toggle `#roleSwitch` exist. Role toggle is not itself authorization; inspect server policies before claiming separation.
- Mobile CSS at max-width 760px hides `#catalogAside` by default and exposes `.catalog-toggle`; this fails the approved always-visible compact left rail.
- Print CSS sets `@page{size:A4;margin:15mm 17mm}`, followed by overrides forcing 8pt question text and 7pt options. This is below the requested 10–11pt and has not been proven to fit 20 questions on exactly one A4 page.
- Print UI `#testCount` supports 5/10/15/20/25/30/all, `#printTest` exists; `#showReport` is described as local-browser results rather than class server reporting.
- `.github/workflows/pages.yml` triggers on push to main, not on pushes to this design branch; a branch push does not publish production.

## Required follow-up audit
1. Inspect complete contents of all seven referenced JS files and navigation.css; inventory all 10 modes, score storage, daily flow, XSS/sanitization, and adapters.
2. Enumerate .github/workflows, Supabase migrations/policies, role routes, and tests. Validate role access with negative tests.
3. Check whether data.js and data.json have identical 1035 records and order; reject unintended changes.
4. Run actual desktop/mobile browser E2E at 320/375/390/768/1440px and inspect screenshots and touch targets.
5. Render long-translation 20-question Classic and Adventure PDF in headless browser; assert page count == 1, A4 dimensions, no clipping.
6. Run CI on branch and provide exact run URLs, plus an isolated preview, before asking for approval.

## Implementation order
A. Isolate reusable theme tokens, layout components, illustrated asset slots; preserve existing JS entry points.
B. Keep permanent compact module rail on narrow screens and ensure no horizontal overflow.
C. Create mascot asset pack based on user-provided London kitten: BOTH turquoise eyes open in all variants. Use consistent silhouette; optimize web assets.
D. Replace emoji mode visuals with coherent bespoke art; verify real mode bindings.
E. Add bounded, mastery-based crystal rewards after reviewing existing progress model; never grant repeatable rewards merely for clicks.
F. Implement Classic/Adventure teacher print CSS and variant controls with actual PDF regression tests.
G. Validate counts, mechanics, roles, accessibility, CI and isolated preview; no merge without explicit user approval.

## Release status
No redesign code, art assets, test PDFs or E2E success are claimed by this audit. Production main unchanged.
