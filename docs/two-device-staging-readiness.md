# LEXIGO: isolated two-device staging readiness

Status: **not deployed**. This document does not authorize production or create a public instance.

## Separation
- PR #7 remains draft and its base is stage7/closed-pilot; no merge to main.
- The pilot cabinet and API currently accept localhost only. A phone and a laptop cannot share the same localhost server.
- Do not remove the localhost guards until a dedicated staging hostname, TLS, access policy and server-side environment have been configured and reviewed.
- The free-play legacy index still uses browser-local progress. Authenticated server games run in a first-party, iframe-free pilot page. This is a navigable integration, **not yet** a complete replacement of all legacy game renderers.

## Two-device rollout gates
1. Create a distinct Supabase staging project, with separate database and keys, no production data and synthetic teacher/pupil accounts.
2. Keep service_role, JWT signing secrets and database credentials exclusively in server-side secret storage. The browser may receive only a staging publishable/anon key.
3. Restrict staging access to invited test users, enforce HTTPS, allowed CORS origins, Supabase Auth redirect allowlist and a staging-only CSP. Never put JWTs or secret keys into assignment links.
4. Replace localhost guards with a compile-time explicit staging origin allowlist **only after** steps 1–3. Make default build deny external access. Use a distinct hostname from production.
5. Run teacher on device A and pupil on device B: create assignment, share opaque UUID, verify pupil enrollment, complete all ten modes, refresh both devices and compare server-sourced progress/leaderboards.
6. Negative tests: unknown and expired assignment IDs, foreign pupil, foreign teacher, revoked enrollment, concurrent duplicate events, expired JWT, tampered challenge ID, replayed word ID and offline/retry behavior.
7. Before staging is enabled, confirm full GitHub Actions SUCCESS at a single commit and explicitly approve the environment configuration.

## Acceptance
- No production deployment or repository merge.
- Teacher sees only own classes and enrolled pupils; pupil sees only own records.
- A completed lesson requires all words, and mastery requires two clean verified attempts; self-ratings remain separate.
- Ten modes and all 1,035 words preserved.
- A4 printing remains 20 questions per student page, with a separate key and 5/10/20/25/30 PDF checks.

## Known remaining work
- Consolidate free-play and server-backed game rendering into one shared game engine rather than separate navigable pages.
- Provision staging infrastructure, apply origin restrictions, and execute physical two-device E2E. CI currently validates local isolated services and browser contexts, not a remote deployment.
