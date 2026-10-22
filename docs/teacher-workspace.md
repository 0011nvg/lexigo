# Teacher workspace (integration only)

The shared cabinet provides class creation and renaming (grades 2–4), an active
roster, one-use pupil invitations, enrollment revocation, individual and whole
class assignments, local-time deadlines, opaque assignment links and assignment
revocation. Existing classes cannot change grade and invalidate their lessons.

Teachers can filter saved attempts by class, pupil and state, inspect server
correctness, hints, retries and self-ratings, and record/revoke a review. A review
does not change a score. Raw typed answers are not retained by the existing API;
the report displays vocabulary and the server's evaluation of each event.

All reads use existing RLS. Mutations use Edge-verified identity and service-only
RPCs with fixed search paths, ownership checks and audit entries. Class creation
derives organization and teacher from the authenticated profile. Neither pupil
nor teacher can invoke these RPCs directly. Revoked or expired assignments deny
new attempts and subsequent game actions. Previously saved reports remain
available to authorized teachers while the pupil's enrollment remains active.

Invitations appear once in memory, expire after 48 hours, and require an existing
pupil profile in the same organization. This stage does not implement production
account provisioning. Removing a pupil also revokes unused class invitations.

`tests/teacher-workspace-browser.mjs` exercises real browser actions against
disposable local Supabase: create/rename, invite/join, whole-class assignment,
pupil link and answer, teacher error report/filter/review after reload, another
teacher's denied reads/writes, direct-RPC denial, assignment and enrollment
revocation, logout and mobile width. Existing suites still cover individual
assignments, all ten games and A4 PDF output. No production deployment or merge.

Next stage: pupil cabinet navigation and assignment/progress presentation.
Pilot readiness still requires the remaining mastery/growth work and a separately
approved hosted test environment; localhost CI is not a student-accessible site.
