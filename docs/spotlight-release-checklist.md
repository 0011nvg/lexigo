# Spotlight navigation release isolation

Release branch: `release/spotlight-navigation-safe` (created from `main`).
Source: PR #7, `integration/secure-lessons-growth`, reviewed head `2281d0a5d97ea299e7335cd3d0f260820f0be823`.

## Release constraints
- Preserve all 1,035 vocabulary entries and source order.
- Preserve all ten practice modes, local progress and exact A4 printing.
- Port the focused book > module > lesson > mode navigation and responsive layouts only after dependency audit.
- Do not ship authenticated Supabase cabinets, API keys, server game endpoints, role management, or database migrations.
- Keep `main`, GitHub Pages deployment and PR #7 unchanged until explicit release approval.

## Required before release
- [ ] Audit dependency graph for `navigation-controller.js`, `navigation.css`, `index.html`, and all shared game modules.
- [ ] Extract a self-contained static-only navigation implementation; ensure no hidden dependency on server modules.
- [ ] Confirm 1,035 words, 10 modes, local practice and print A4 (5/10/20/25/30 questions).
- [ ] Run browser navigation/mobile/desktop, security and print regression tests on the release commit.
- [ ] Obtain green CI on the release branch and review its diff against main.
- [ ] Request explicit approval before merging or deploying.

This checklist documents release work; it does not assert that extraction or tests have been completed.

## Dependency audit — 2026-10-24

Inspected PR #7 source and current main repository trees. The new UI is **not** a standalone drop-in: PR #7 `index.html` loads `game-components.js`, `game-engine.js`, `local-storage.js`, `local-game-adapter.js`, `practice-controller.js`, `server-storage.js`, `server-game-adapter.js`, `progress-controller.js`, `cabinet-controller.js`, and `navigation-controller.js`. The main branch instead has a monolithic `index.html`. The new navigation controller directly references `serverWorkspace` and `serverGamesOpen` and supports a cabinet route. Therefore copying PR #7's `index.html` or `navigation-controller.js` unchanged would violate static-only isolation and risk regressions.

Extraction requires removing the embedded cabinet mounting block, server scripts, cabinet route and related DOM dependencies, then adapting the practice controller and browser tests to the static-only entry point. No static-only extraction is asserted complete by this audit.
