-- LEXIGO Stage 5 / proposal only. Never run against production without a security review.
-- No credentials, users, or real children's records are included.
begin;
create extension if not exists pgcrypto;
create schema if not exists lexigo;
revoke all on schema lexigo from public, anon;
grant usage on schema lexigo to authenticated,service_role;

create type lexigo.member_role as enum ('teacher','pupil','parent');
create type lexigo.audience_kind as enum ('class','individual');
create type lexigo.attempt_state as enum ('started','finished');
create type lexigo.event_kind as enum ('answer','card_self_rating');

create table lexigo.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 180)
);
create table lexigo.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 organization_id uuid not null references lexigo.organizations(id),
 role lexigo.member_role not null,
 display_name text not null check(length(display_name) between 1 and 100),
 created_at timestamptz not null default now()
);
create table lexigo.classes (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references lexigo.organizations(id),
 teacher_user_id uuid not null references lexigo.profiles(user_id),
 grade integer not null check(grade between 2 and 4),
 title text not null check(length(title) between 1 and 80),
 unique(id,organization_id)
);
create table lexigo.enrollments (
 id uuid primary key default gen_random_uuid(),
 class_id uuid not null references lexigo.classes(id) on delete cascade,
 pupil_user_id uuid not null references lexigo.profiles(user_id),
 status text not null default 'active' check(status in ('active','revoked')),
 unique(class_id,pupil_user_id)
);
create table lexigo.parent_pupils (
 parent_user_id uuid not null references lexigo.profiles(user_id),
 pupil_user_id uuid not null references lexigo.profiles(user_id),
 verified_by uuid not null references lexigo.profiles(user_id),
 verified_at timestamptz not null default now(),
 revoked_at timestamptz,
 primary key(parent_user_id,pupil_user_id)
);
create table lexigo.vocabulary_sections (
 id text primary key, grade integer not null check(grade between 2 and 4),
 module text not null, title text not null, order_index integer not null check(order_index>=0),
 unique(grade,order_index)
);
create table lexigo.vocabulary_words (
 id text primary key, section_id text not null references lexigo.vocabulary_sections(id),
 en text not null, ru text not null, order_index integer not null check(order_index>=0),
 unique(section_id,order_index)
);
create table lexigo.assignments (
 id uuid primary key default gen_random_uuid(),
 class_id uuid not null references lexigo.classes(id),
 created_by uuid not null references lexigo.profiles(user_id),
 section_id text not null references lexigo.vocabulary_sections(id),
 mode text not null check(mode in ('daily','cards','quiz','spell','pairs','truefalse','fix','audio','crystals','boss')),
 due_at timestamptz not null, audience_type lexigo.audience_kind not null,
 created_at timestamptz not null default now()
);
create table lexigo.assignment_recipients (
 assignment_id uuid not null references lexigo.assignments(id) on delete cascade,
 pupil_user_id uuid not null references lexigo.profiles(user_id),
 primary key(assignment_id,pupil_user_id)
);
create table lexigo.attempts (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null references lexigo.assignments(id),
 pupil_user_id uuid not null references lexigo.profiles(user_id),
 client_session_id uuid not null,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 status lexigo.attempt_state not null default 'started',
 unique(pupil_user_id,client_session_id),
 check ((status='started' and finished_at is null) or (status='finished' and finished_at is not null))
);
create table lexigo.attempt_events (
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null references lexigo.attempts(id) on delete cascade,
 word_id text not null references lexigo.vocabulary_words(id),
 event_index integer not null check(event_index between 0 and 499),
 event_type lexigo.event_kind not null,
 correct boolean, hinted boolean not null default false,
 retry boolean not null default false,
 self_rating text check(self_rating in ('known','unknown')),
 created_at timestamptz not null default now(),
 unique(attempt_id,event_index),
 check((event_type='answer' and correct is not null and self_rating is null)
    or (event_type='card_self_rating' and correct is null and self_rating is not null))
);
create table lexigo.teacher_reviews (
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null references lexigo.attempts(id),
 teacher_user_id uuid not null references lexigo.profiles(user_id),
 reviewed_at timestamptz not null default now(),
 revoked_at timestamptz,
 unique(attempt_id,teacher_user_id)
);
create table lexigo.invitations (
 id uuid primary key default gen_random_uuid(),
 class_id uuid references lexigo.classes(id),
 target_role lexigo.member_role not null,
 token_digest bytea not null unique,
 created_by uuid not null references lexigo.profiles(user_id),
 expires_at timestamptz not null,
 redeemed_by uuid references lexigo.profiles(user_id),
 redeemed_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 check(expires_at>created_at),
 check((redeemed_by is null)=(redeemed_at is null))
);
create table lexigo.audit_log (
 id bigint generated always as identity primary key,
 actor_user_id uuid references lexigo.profiles(user_id),
 action text not null,
 subject_type text not null,
 subject_id uuid,
 at timestamptz not null default now()
);

-- SECURITY DEFINER helpers avoid recursive RLS lookups. Owner must be a privileged
-- migration role. Fixed search_path and schema-qualified relations are mandatory.
create function lexigo.is_teacher_of(p_class uuid, p_teacher uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from lexigo.classes c join lexigo.profiles p on p.user_id=c.teacher_user_id
 where c.id=p_class and c.teacher_user_id=p_teacher and p.role='teacher'
 and p.organization_id=c.organization_id)
$$;
create function lexigo.is_active_pupil(p_class uuid,p_pupil uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from lexigo.enrollments e join lexigo.profiles p on p.user_id=e.pupil_user_id
 join lexigo.classes c on c.id=e.class_id where e.class_id=p_class and e.pupil_user_id=p_pupil
 and e.status='active' and p.role='pupil' and p.organization_id=c.organization_id)
$$;
create function lexigo.is_parent_of(p_parent uuid,p_pupil uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from lexigo.parent_pupils pp join lexigo.profiles p on p.user_id=pp.parent_user_id
 where pp.parent_user_id=p_parent and pp.pupil_user_id=p_pupil and pp.revoked_at is null and p.role='parent')
$$;
create function lexigo.can_see_assignment(p_assignment uuid,p_pupil uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from lexigo.assignments a where a.id=p_assignment
 and lexigo.is_active_pupil(a.class_id,p_pupil)
 and (a.audience_type='class' or exists(select 1 from lexigo.assignment_recipients r
 where r.assignment_id=a.id and r.pupil_user_id=p_pupil)))
$$;
create function lexigo.can_read_pupil(p_pupil uuid,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_pupil=p_actor or lexigo.is_parent_of(p_actor,p_pupil) or exists(
 select 1 from lexigo.enrollments e where e.pupil_user_id=p_pupil and e.status='active'
 and lexigo.is_teacher_of(e.class_id,p_actor))
$$;
revoke all on function lexigo.is_teacher_of(uuid,uuid),lexigo.is_active_pupil(uuid,uuid),
 lexigo.is_parent_of(uuid,uuid),lexigo.can_see_assignment(uuid,uuid),
 lexigo.can_read_pupil(uuid,uuid) from public,anon;
grant execute on function lexigo.is_teacher_of(uuid,uuid),lexigo.is_active_pupil(uuid,uuid),
 lexigo.is_parent_of(uuid,uuid),lexigo.can_see_assignment(uuid,uuid),
 lexigo.can_read_pupil(uuid,uuid) to authenticated;

-- Explicit table grants complement RLS. No direct client writes to identity,
-- enrollments, parental links, invitations, reviews, audit log or vocabulary.
grant select on lexigo.organizations,lexigo.profiles,lexigo.classes,lexigo.enrollments,
 lexigo.parent_pupils,lexigo.vocabulary_sections,lexigo.vocabulary_words,
 lexigo.assignments,lexigo.assignment_recipients,lexigo.attempts,
 lexigo.attempt_events,lexigo.teacher_reviews to authenticated;
grant insert on lexigo.assignments,lexigo.assignment_recipients,lexigo.attempts,
 lexigo.attempt_events to authenticated;
grant update(status,finished_at) on lexigo.attempts to authenticated;
revoke all on lexigo.invitations,lexigo.audit_log from anon,authenticated;

do $$ declare t text; begin foreach t in array array[
 'organizations','profiles','classes','enrollments','parent_pupils',
 'vocabulary_sections','vocabulary_words','assignments','assignment_recipients',
 'attempts','attempt_events','teacher_reviews','invitations','audit_log'
] loop execute format('alter table lexigo.%I enable row level security',t);
 execute format('alter table lexigo.%I force row level security',t); end loop; end $$;

create policy org_read on lexigo.organizations for select to authenticated using(
 exists(select 1 from lexigo.profiles p where p.user_id=(select auth.uid()) and p.organization_id=id));
create policy profile_read on lexigo.profiles for select to authenticated using(
 user_id=(select auth.uid()) or
 (role='pupil' and lexigo.can_read_pupil(user_id,(select auth.uid()))) or
 (role='teacher' and exists(select 1 from lexigo.classes c where c.teacher_user_id=user_id
 and lexigo.is_active_pupil(c.id,(select auth.uid()))))
);
create policy class_read on lexigo.classes for select to authenticated using(
 lexigo.is_teacher_of(id,(select auth.uid())) or lexigo.is_active_pupil(id,(select auth.uid()))
 or exists(select 1 from lexigo.enrollments e where e.class_id=id and e.status='active'
 and lexigo.is_parent_of((select auth.uid()),e.pupil_user_id)));
create policy enrollment_read on lexigo.enrollments for select to authenticated using(
 pupil_user_id=(select auth.uid()) or lexigo.is_teacher_of(class_id,(select auth.uid()))
 or lexigo.is_parent_of((select auth.uid()),pupil_user_id));
create policy parent_link_read on lexigo.parent_pupils for select to authenticated using(
 parent_user_id=(select auth.uid()) or pupil_user_id=(select auth.uid())
 or exists(select 1 from lexigo.enrollments e where e.pupil_user_id=parent_pupils.pupil_user_id
 and lexigo.is_teacher_of(e.class_id,(select auth.uid()))));
create policy sections_read on lexigo.vocabulary_sections for select to authenticated using(true);
create policy words_read on lexigo.vocabulary_words for select to authenticated using(true);
create policy assignment_read on lexigo.assignments for select to authenticated using(
 lexigo.is_teacher_of(class_id,(select auth.uid())) or
 lexigo.can_see_assignment(id,(select auth.uid())) or
 exists(select 1 from lexigo.enrollments e where e.class_id=assignments.class_id
 and lexigo.is_parent_of((select auth.uid()),e.pupil_user_id)
 and lexigo.can_see_assignment(assignments.id,e.pupil_user_id)));
create policy assignment_create on lexigo.assignments for insert to authenticated with check(
 created_by=(select auth.uid()) and lexigo.is_teacher_of(class_id,(select auth.uid()))
 and exists(select 1 from lexigo.vocabulary_sections s join lexigo.classes c on c.id=class_id
 where s.id=section_id and s.grade=c.grade));
create policy recipient_read on lexigo.assignment_recipients for select to authenticated using(
 pupil_user_id=(select auth.uid()) or lexigo.is_parent_of((select auth.uid()),pupil_user_id)
 or exists(select 1 from lexigo.assignments a where a.id=assignment_id
 and lexigo.is_teacher_of(a.class_id,(select auth.uid()))));
create policy recipient_create on lexigo.assignment_recipients for insert to authenticated with check(
 exists(select 1 from lexigo.assignments a where a.id=assignment_id and a.audience_type='individual'
 and lexigo.is_teacher_of(a.class_id,(select auth.uid()))
 and lexigo.is_active_pupil(a.class_id,pupil_user_id)));
create policy attempt_read on lexigo.attempts for select to authenticated using(
 lexigo.can_read_pupil(pupil_user_id,(select auth.uid())) and
 lexigo.can_see_assignment(assignment_id,pupil_user_id));
create policy attempt_create on lexigo.attempts for insert to authenticated with check(
 pupil_user_id=(select auth.uid()) and lexigo.can_see_assignment(assignment_id,(select auth.uid()))
 and status='started' and finished_at is null);
create policy attempt_finish on lexigo.attempts for update to authenticated using(
 pupil_user_id=(select auth.uid()) and status='started'
 and lexigo.can_see_assignment(assignment_id,(select auth.uid())))
 with check(pupil_user_id=(select auth.uid()) and status='finished'
 and finished_at is not null and lexigo.can_see_assignment(assignment_id,(select auth.uid())));
create policy event_read on lexigo.attempt_events for select to authenticated using(
 exists(select 1 from lexigo.attempts a where a.id=attempt_id
 and lexigo.can_read_pupil(a.pupil_user_id,(select auth.uid()))
 and lexigo.can_see_assignment(a.assignment_id,a.pupil_user_id)));
create policy event_create on lexigo.attempt_events for insert to authenticated with check(
 exists(select 1 from lexigo.attempts a join lexigo.assignments ass on ass.id=a.assignment_id
 join lexigo.vocabulary_words w on w.id=word_id where a.id=attempt_id
 and a.pupil_user_id=(select auth.uid()) and a.status='started'
 and w.section_id=ass.section_id
 and lexigo.can_see_assignment(a.assignment_id,(select auth.uid()))));
create policy reviews_read on lexigo.teacher_reviews for select to authenticated using(
 exists(select 1 from lexigo.attempts a join lexigo.assignments ass on ass.id=a.assignment_id
 where a.id=attempt_id and (lexigo.can_read_pupil(a.pupil_user_id,(select auth.uid()))
 or lexigo.is_teacher_of(ass.class_id,(select auth.uid())))));
-- No INSERT policy on teacher_reviews: only a validated server RPC may record review.
-- No policies for invitations or audit_log: service-only, never directly exposed.

commit;
