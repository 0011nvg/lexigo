-- Read-only, RLS-invoker lesson progress and ranking eligibility.
-- No client may write rankings or completion flags. A finished attempt alone is insufficient.
begin;
create or replace view lexigo.lesson_attempt_progress
with (security_invoker=true) as
select a.id as attempt_id,a.assignment_id,a.pupil_user_id,ass.section_id,ass.mode,
 a.status,a.started_at,a.finished_at,
 count(distinct w.id)::integer as total_words,
 count(distinct e.word_id) filter(where e.id is not null)::integer as covered_words,
 count(e.id) filter(where e.event_type='answer')::integer as checked_answers,
 count(e.id) filter(where e.event_type='answer' and e.correct=true)::integer as correct_answers,
 count(e.id) filter(where e.event_type='card_self_rating')::integer as self_ratings,
 (a.status='finished' and count(distinct w.id)>0 and
  count(distinct e.word_id) filter(where e.id is not null)=count(distinct w.id)) as lesson_completed,
 (a.status='finished' and count(distinct w.id)>0 and
  count(distinct e.word_id) filter(where e.id is not null)=count(distinct w.id)
  and (ass.mode in ('cards','daily') or count(e.id) filter(where e.event_type='answer')>0)) as ranking_eligible,
 -- Cards/daily are self-rated; do not disguise them as verified accuracy.
 case when ass.mode in ('cards','daily') then null::numeric
 else round(100.0*count(e.id) filter(where e.event_type='answer' and e.correct=true)
 /nullif(count(e.id) filter(where e.event_type='answer'),0),1) end as accuracy_pct,
 case when a.finished_at is not null then greatest(0,extract(epoch from (a.finished_at-a.started_at)))::integer end as duration_seconds
from lexigo.attempts a
join lexigo.assignments ass on ass.id=a.assignment_id
join lexigo.vocabulary_words w on w.section_id=ass.section_id
left join lexigo.attempt_events e on e.attempt_id=a.id and e.word_id=w.id
group by a.id,a.assignment_id,a.pupil_user_id,ass.section_id,ass.mode,a.status,a.started_at,a.finished_at;
revoke all on lexigo.lesson_attempt_progress from public,anon;
grant select on lexigo.lesson_attempt_progress to authenticated,service_role;
commit;
