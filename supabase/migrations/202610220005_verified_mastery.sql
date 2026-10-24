-- Legacy client-reported correctness must never become mastery evidence.
-- Preserve the existing two-distinct-finished-attempts criterion per mode.
begin;
create or replace view lexigo.lesson_word_progress with (security_invoker=true) as
select a.pupil_user_id,ass.section_id,ass.mode,w.id as word_id,w.en,w.ru,
 count(distinct a.id) filter(where a.status='finished' and e.id is not null)::integer as finished_attempts,
 count(distinct a.id) filter(where a.status='finished' and e.event_type='answer'
  and e.verification_source='server_evaluated' and e.verified_correct=true
  and not e.hinted and not e.retry)::integer as clean_correct_attempts,
 bool_or(a.status='finished' and e.id is not null) as practiced,
 (count(distinct a.id) filter(where a.status='finished' and e.event_type='answer'
  and e.verification_source='server_evaluated' and e.verified_correct=true
  and not e.hinted and not e.retry)>=2) as mastered,
 count(e.id) filter(where a.status='finished' and e.event_type='card_self_rating' and e.self_rating='known')::integer as self_rated_known
from lexigo.attempts a
join lexigo.assignments ass on ass.id=a.assignment_id
join lexigo.vocabulary_words w on w.section_id=ass.section_id
left join lexigo.attempt_events e on e.attempt_id=a.id and e.word_id=w.id
group by a.pupil_user_id,ass.section_id,ass.mode,w.id,w.en,w.ru;
revoke all on lexigo.lesson_word_progress from public,anon;
grant select on lexigo.lesson_word_progress to authenticated,service_role;
commit;
