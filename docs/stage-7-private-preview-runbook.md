# LEXIGO Stage 7 — private pilot deployment runbook (PREPARATION ONLY)

Status: **NO DEPLOYMENT AUTHORIZED**. PR #5 remains draft. Do not change `main`, the public GitHub Pages site, or any production Supabase project. This is a staging checklist, not evidence of a hosted pilot.

## Proposed isolated architecture

- One **new** Supabase project (suggested name: `lexigo-pilot-isolated`), separate project reference, database, Auth users, URL, and API keys from production. Do not link the current local CI project to production.
- One **separate HTTPS preview origin** behind an access gate (identity-aware proxy / basic auth at hosting edge, plus Supabase Auth). Do not use `0011nvg.github.io/lexigo` or GitHub Pages from `main`. No public preview until the owner approves the exact host and access policy.
- Supabase Edge Function `learning-api` deployed only to that isolated project after review; server-side `SUPABASE_SERVICE_ROLE_KEY` stays in the function environment, never in client HTML, repository, URL parameters, logs, or screenshots. Browser receives only the publishable/anon key and a fixed project URL.
- `LEXIGO_PILOT_ORIGINS` in Edge Function environment is a comma-separated list of **exact HTTPS origins**, e.g. `https://pilot.example.org` (placeholder, not a deployed URL). Do not allow wildcard origins. The local test origins remain available in source for CI; before exposing a hosted pilot, consider disabling them for the hosted environment.
- The current `stage7-local-cabinet.html` is deliberately localhost-only and **cannot be published as-is**. A separate pilot frontend must use a build-time fixed HTTPS API URL, no free-form project URL/key fields, no client-side role switching, no service credentials, no localStorage-based demo progress, and clear logout/session-expiry behavior.
- Protect preview at both layers: preview access gate plus Supabase Auth JWT, server-side role checks and RLS. CORS is **not** an access-control substitute.

## Account and invitation plan (synthetic only)

- Create 2 or 3 teacher identities (`pilot-teacher-01` through `03`) and 3 to 5 pupil identities (`pilot-pupil-01` through `05`) with fake display names and dedicated controlled test mailboxes; do **not** use `@example.invalid` for hosted email delivery. Never commit credentials or invitation tokens.
- Disable open email signup, anonymous signup and unneeded OAuth/phone providers in the **hosted** Supabase Auth project; require email confirmation as appropriate. The repository's `supabase/config.toml` enables signup for **local CI only** and is **not** a hosted production security baseline.
- Bootstrap the initial teacher users and their `lexigo.profiles` role and organization through a **one-time administrator-only server-side provisioning procedure** after verifying IDs from Supabase Auth. Never accept role or organization from a browser request. No self-service teacher signup.
- Teacher issues pupil invitations using the existing `issue-invitation` RPC, scoped to an authorized class, with short expiry (prefer 24h or less), one-time redemption and revocation. The invited pupil must already have an approved Auth identity; invitation redemption does not itself create an Auth user. Never expose raw invitation tokens in logs or screenshots.
- Use 2 fake classes, 2–3 teacher test accounts and 3–5 fake pupil accounts. Seed only synthetic fixture words/assignments, or import the verified 1035-word public vocabulary separately after checksum validation. No real pupil names, emails, grades, school rosters or personal data.
- Provide unique passwords by a private credential manager, not GitHub issues/PR comments. Require test account removal and data wipe after the agreed pilot window.

## Required preflight: stop gates

1. Obtain explicit owner approval for preview host, independent Supabase project, cost limits, access gate, retention period and test roster **before creating/deploying anything**.
2. Verify the exact Supabase project reference is **not** production. Confirm migrations in an isolated throwaway project; inspect grants and RLS on all `lexigo` tables, especially `profiles`, `classes`, `enrollments`, `assignments`, `assignment_recipients`, `attempts`, `attempt_events`, `invitations` and teacher review tables. Direct client writes must be denied.
3. Validate Auth config: open signup OFF, password policy and email confirmation reviewed, rate limiting and bot/abuse protection configured, redirect URLs limited to preview host. Local CI uses email confirmation OFF and signup ON intentionally; do not reuse that hosted.
4. Review `verify_jwt=false` in `supabase/config.toml`: Edge code calls `auth.getUser(token)` on each request, but the gateway is not verifying JWT. Explicitly test forged, missing, expired, foreign-project and revoked JWTs; consider enabling gateway JWT verification if compatible with project key format.
5. Review CORS: only exact preview HTTPS origin is accepted; hostile Origin preflight and POST must be denied; no `*` origin; no secrets in preflight. Test allowed-origin `OPTIONS` and `POST`. For server-to-server requests with no Origin, JWT/RLS still apply.
6. Review public `anon` key versus secret `service_role`: browser may contain only anon/publishable key. Confirm no service role, admin key, Auth JWT, invite token, email, password or private URL in static files, CI artifacts, errors or access logs.
7. Confirm no direct PostgREST privilege escalation or cross-organization data reads; test pupil A versus pupil B, teacher A versus teacher B, parent role, revoked enrollment, invite expiry/replay and duplicate/concurrent submissions.
8. Run a **hosted** browser E2E against the private preview (not just localhost): teacher login → assignment → pupil login → quiz/spell/pairs/truefalse/fix/audio/crystals/boss → cards/daily self-rating → finish → teacher result/review → logout/relogin → revoke. Test mobile width and keyboard interactions. Distinguish verified scores from self-assessment. All 1035 words and all games must remain intact.
9. Set up a rollback: disable preview access at host, revoke preview sessions/invitations, stop preview Edge Function, and remove synthetic accounts/data. Do not roll back by altering production.
10. Owner reviews the staging URL, account matrix, screenshots and **all** hosted security/functional CI results, then authorizes opening the pilot explicitly. Without this approval: **NO-GO**.

## Tester instructions (draft; do not distribute yet)

Use only the supplied fake account and preview URL from the private channel. Never enter real pupil data. Teacher: sign in, create an assignment for the fake class and test each game mode; check results and review. Pupil tester: sign in with the assigned fake identity, open assigned games, answer and finish; note that `cards` and `daily` are **self-assessments**, not server-verified knowledge scores. Log out when finished. Record issues as mode + action + expected/actual result + browser/device; do not include passwords, access tokens, invite links, screenshots with credentials or personal information.

## Current evidence and unresolved items

- Local GitHub Actions at `8d71fb9`: five workflows SUCCESS, including local Supabase HTTP and real Chromium E2E.
- **No hosted preview, Supabase project, invitations or hosted users have been created**. No external hosted E2E, privacy approval or operational cost review has occurred.
- The existing browser pilot is localhost-only. Server CORS can be configured via `LEXIGO_PILOT_ORIGINS`, but this alone does not make the frontend or Auth safe to publish.
- The existing teacher UI has no hosted invitation redemption screen or managed account provisioning. These are required before an external pilot.
