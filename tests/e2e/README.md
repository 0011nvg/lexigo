# LEXI cloud end-to-end test

Проверяет регистрацию, кабинеты, задания, сохранение результатов, перенос прогресса,
изоляцию данных и удаление аккаунта на **настоящих** компонентах Supabase
(Supabase Auth/GoTrue, PostgREST, PostgreSQL + `supabase/schema.sql`), запущенных локально.

```bash
python3 -m http.server 4173 --bind 127.0.0.1 &      # сайт
eval "$(tests/e2e/start-local-supabase.sh)"           # локальный «Supabase» на :54321
node tests/e2e/cloud-journey.mjs                      # 18 сценариев
node tests/e2e/teacher-lessons.mjs                    # 11 сценариев: свои уроки, все игры, тренировка учителя
```

Отдельно, без браузера: `tests/sql/run.sh` — права доступа (RLS) и защита от накрутки XP.
