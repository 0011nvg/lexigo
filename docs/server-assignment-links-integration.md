# Server-backed assignment links — integration gate for PR #6

Status: **blocked pending Stage 7 backend integration**. This PR currently targets `main`, which does not contain Supabase migrations, Edge Function `learning-api`, JWT authentication, or RLS policies. A cross-device authenticated assignment cannot safely be implemented by sharing `localStorage` task IDs or accepting a pupil ID from the URL.

## Existing behavior

- `?lessonGrade=2&lessonSection=0`: public, read-only lesson selector. It does not create an assignment, establish student identity, or synchronize results.
- `?assignment=...&pupil=...`: legacy **single-browser demo** only. Data is read from that browser's localStorage; never describe this as secure or cross-device.
- Parent role was removed from the demo UI in this PR.

## Required server contract

1. A teacher logs in with Supabase Auth JWT and is verified as a teacher by the backend. The server validates membership in the class, vocabulary section, selected game mode, due date and recipient enrollment.
2. `POST /functions/v1/learning-api/create-assignment` creates the assignment using authenticated identity, returning a server-generated UUID. Do not trust `actorId`, `role`, `classId` or `pupilId` from an untrusted URL.
3. Teacher shares `/pilot-assignment.html?assignment=<uuid>` (opaque assignment ID only, no access token, service-role key, email, or pupil ID). URL alone must **never grant access**.
4. Pupil signs in, server checks assignment recipient/class enrollment, then `start-attempt`, `next-question`, `answer-question` / `play-round` / `append-event` and `finish-attempt` persist the result server-side. Teacher reads only authorized class attempts via RLS.
5. Deny and test: unauthenticated link, other-class pupil, forged teacher, changed assignment UUID, expired/revoked assignment, replayed answer/challenge, concurrent duplicate submissions, unauthorized results, CORS origins, and sign-out.
6. Use only the separate closed-pilot Supabase project with allowlisted origins and server-side service-role secret. Never expose a service-role key in static pages or GitHub.
7. Browser E2E must use **two isolated browser contexts** (teacher and pupil) and the actual local Supabase stack. Assert teacher sees the pupil's completed result after reload, and unrelated teacher/pupil cannot see it. Test cards/daily, quiz, spell, pairs, truefalse, fix, audio, crystals and boss.

## Dependency and release safety

The implementation exists in draft PR #5 (Stage 7 branch) and must be integrated **without merging either PR to main**. First choose an integration branch or explicitly rebase PR #6 onto the Stage 7 branch, resolve differences and run real local Supabase HTTP and browser E2E. Do not deploy to production or enable real invitations before user approval. Do not report the cross-device feature as delivered until the backend and browser E2E are green.
