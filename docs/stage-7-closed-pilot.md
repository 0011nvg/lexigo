# LEXIGO — Stage 7 closed pilot: audit and release gates

Branch: `stage7/closed-pilot`. Based on tested Stage 5 SHA `4f783d0fd777ce5947da94bdb952d85f243af2c4`. **Not deployed.** Do not merge to `main` or enable real pupil accounts without explicit approval.

## Evidence-based implementation audit (2026-10-21)

| Area | Verified in repository | Pilot gap |
| --- | --- | --- |
| Student and teacher cabinets | `cabinet.html` has role views, demo pupils/classes, teacher assignment form, and browser `localStorage` completion | Replace synthetic identities and browser-only state with authenticated server data; do not treat role tabs as authorization |
| Registration and login | Stage 5 isolated Supabase Auth E2E obtains real local Auth JWT for synthetic `@example.invalid` accounts | No deployed identity provider, user-facing login/logout, invitation acceptance, email flow or account recovery |
| Role isolation | SQL migrations and RLS plus local HTTP tests exercise authorization and negative scenarios | Verify end-to-end account provisioning and UI role gating with real deployed backend |
| Assignments | Privileged RPC for server-side assignments and teacher access constraints exist | Teacher cabinet assignment form is not connected to authenticated API and live pupil roster |
| Progress | Local browser completion plus server-owned game attempts/events in Stage 5 | Authenticated progress dashboard and cross-device continuity not connected; define accepted scoring and retention |
| Games | 1035 dictionary entries, server challenge verification in local CI | Hosted pilot API + integrated gameplay; distinguish self-assessed cards/daily from verified scores |
| Hosting | Pages currently configured to deploy from `main` root; separate workflow also has main push trigger | Never deploy pilot through current production Pages; use isolated preview origin/backend and test accounts |

## Minimum pilot slice — implementation sequence

1. Create separate **pilot Supabase project** (not production); secrets only in server-side settings. Require Auth, RLS, least-privilege RPC, CORS allowlist, rate limiting, logs with no JWT or personal details. Review Edge gateway JWT verification and disable public signup unless explicitly invited.
2. Implement teacher/admin invitation provisioning and authenticated login/logout/session restoration. Never allow clients to choose or elevate their own role; verify on the server. Use only synthetic aliases and test email identities at first.
3. Replace demo cabinet storage with authenticated API: teacher's authorized classes and assignments; student's own assignments, server-verified attempts and progress. Show explicit server-vs-self-assessed status. Do not migrate fabricated demo progress.
4. Integrate existing games with verified attempt/question API; show safe errors, loading and expired-session handling. Preserve 1035 dictionary records and all modes.
5. Add negative browser/HTTP E2E: unauthenticated access, pupil-to-pupil isolation, pupil-to-teacher escalation, assignment spoofing, replay/concurrent submissions, logout/relogin, teacher revoke, mobile flow.
6. Deploy only to an **independent pilot preview** (separate hostname, no shared Pages `main` deployment), protect access with allowlisted test identities and preferably preview-level access control; explicitly review data processing and consent before involving minors.

## Go/no-go

**GO for colleagues testing visual demo:** current public site with no real pupil accounts or personal data, and clear explanation that progress may not persist.

**NO-GO for real pupil accounts:** until identity, authorization, backend deployment, data retention/consent, cross-device progress and privacy tests are verified in hosted preview.

**First external pilot:** 2–3 teachers and 3–5 **synthetic pupil accounts** operated by adult testers. Invite real minors only after separate privacy/parental-consent review and school approval as applicable.

## Release boundary

PR #2, #3 and #4 stay draft and unmerged. `main` and `https://0011nvg.github.io/lexigo/` must remain unchanged. Stage 7 changes only in `stage7/closed-pilot`; no production Supabase credentials or personal data in GitHub.
