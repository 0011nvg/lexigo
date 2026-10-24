# Pupil workspace (integration only)

Assignments show lesson names, class, due date, server-derived completion and
current coverage. Filters distinguish new, attempted and completed lessons.
Opaque assignment links keep access checks and provide a return to all tasks.
No client-written progress or accuracy contributes to these views.

Play starts a new attempt. Continue reopens the newest unfinished attempt using
its RLS-visible ID; the server rechecks ownership, enrollment, deadline and
revocation for every action. Returning to the cabinet does not finish the attempt.
Reloading restores card position, matched pairs, crystal board and vocabulary
phase, and the boss stage from server data. The challenge response projects only
public state; expected answers and private grading structures stay on the server.
Expired question sessions must start a new attempt; the interface explains this.

The pupil's history shows saved coverage, accuracy, self-rating, ranking eligibility
and word evaluations, including hints and retries. Existing results remain readable
after deadline or assignment revocation, but play is denied. Revoked enrollment
removes history access too. Another pupil or a teacher of a different class cannot
read these attempts. No new browser credential persistence is introduced.

Real Supabase browser tests now reload within all ten game modes, check the same
challenge/attempt and saved state, complete the lesson, verify filters and history,
and deny foreign access. Teacher/pupil multi-context E2E also checks expiry and
revocation preserve history while denying new attempts. Existing mobile and A4
tests remain gates. This branch is not a hosted student pilot.

Next stage: validate and refine mastery criteria and progress navigation by
grade/module/section; then the planned learning-growth companion and pilot gates.
