-- Ending an assignment blocks play, but preserves its owner's report.
-- Teaching the same pupil in another class must not grant access to this attempt.
begin;
alter policy attempt_read on lexigo.attempts using (
 ((pupil_user_id=(select auth.uid()) or lexigo.is_parent_of((select auth.uid()),pupil_user_id))
  and lexigo.can_see_assignment(assignment_id,pupil_user_id))
 or exists(select 1 from lexigo.assignments a where a.id=assignment_id
  and lexigo.is_teacher_of(a.class_id,(select auth.uid()))
  and lexigo.is_active_pupil(a.class_id,pupil_user_id))
);
alter policy event_read on lexigo.attempt_events using (
 exists(select 1 from lexigo.attempts a where a.id=attempt_id)
);
commit;
