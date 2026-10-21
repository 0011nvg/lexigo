# LEXIGO — модель данных для будущего Supabase (проект, без подключения)

Текущий прототип: `cabinet.html` и локальный ключ `lexigo_cabinet_demo_v1`. Все персонажи, классы и показатели вымышлены. Никаких серверных запросов, регистрации и персональных данных учащихся нет.

## Предлагаемые сущности

| Таблица | Основные поля | Связи и ограничения |
| --- | --- | --- |
| profiles | id UUID PK, auth_user_id UUID UNIQUE, display_name, role enum(teacher,student,parent) | Связь с auth.users только после реализации авторизации |
| classes | id UUID PK, teacher_id UUID FK profiles, grade int, label text, school_year text | teacher_id должен иметь роль teacher |
| enrollments | id UUID PK, class_id UUID FK, student_id UUID FK profiles | UNIQUE(class_id,student_id) |
| parent_students | parent_id UUID FK profiles, student_id UUID FK profiles | Составной PK, только подтверждённые связи |
| vocabulary_sections | id text PK, grade int, section_index int, title text | UNIQUE(grade,section_index), ссылки на неизменяемый Spotlight словарь |
| vocabulary_words | id text PK, section_id text FK, position int, en text, ru text | Слова и порядок берутся из проверенного data.json, 1035 записей, не редактировать |
| assignments | id UUID PK, class_id UUID FK, section_id text FK, mode text, due_at timestamptz, created_by UUID FK profiles, created_at | mode только из разрешённого списка |
| assignment_students | assignment_id UUID FK, student_id UUID FK, status enum(assigned,started,submitted,verified), submitted_at, verified_at | Составной PK, не приравнивать самоподтверждение к verified |
| attempts | id UUID PK, assignment_id UUID FK, student_id UUID FK, word_id text FK, mode text, correct boolean, hinted boolean, retry boolean, occurred_at timestamptz | Отдельно хранить первую попытку и повторение |
| word_progress | student_id UUID FK, word_id text FK, recall_count int, recognition_count int, error_count int, due_at timestamptz | Составной PK; вычисляется по проверенным попыткам |

## Доступ и безопасность

- Teacher: только собственные классы, их назначения и агрегированные результаты.
- Student: только собственные задания, попытки и прогресс.
- Parent: только сведения детей с подтверждённой связью parent_students, без доступа к другим ученикам.
- Все таблицы с персональными сведениями — Row Level Security, default deny. Никаких публичных списков детей, email или идентификаторов.
- Учитель не должен видеть реальные имена до создания проверенного аккаунта и разрешённой привязки.
- Статус «отмечено выполненным» в демо соответствует будущему `submitted`, **не** `verified`. Оценка должна строиться на игровых попытках, а не на кнопке ученика.
- Время и даты хранить в UTC, показывать в локальной временной зоне.
- Предусмотреть удаление данных и экспорт результатов, минимизацию персональных данных и защиту детских аккаунтов.

## Порядок реализации

1. Довести интерфейсы и E2E тесты на демоданных.
2. Зафиксировать контракт DTO и миграции SQL; не смешивать localStorage с серверной истиной.
3. Подключить Supabase Auth, роли и RLS в тестовом проекте после отдельного согласования.
4. Провести пилот на тестовых аккаунтах без настоящих детей.
5. Только после проверки приватности и согласий — реальные классы.

## Локальная интеграция (реализовано в прототипе)

- Учитель назначает раздел и режим; запись хранится в `lexigo_cabinet_demo_v1`.
- Кабинет ученика открывает `index.html?assignment=<id>`. Игровая страница сверяет ID, класс 2А, учебник 2 и индекс раздела с текущими локальными заданиями, затем выбирает соответствующий раздел и режим. Для остальных демоучеников нет отдельного игрового профиля: их показатели по-прежнему демонстрационные.
- После завершения или прерывания игры локальная история `lexigo_cabinet_attempts_v1` хранит идентификатор задания, дату, режим, завершённость, исходные/повторные ответы, подсказки и флаг `verified:false`. Не хранит введённый учеником текст ответа.
- История видна всем трём демонстрационным ролям **только в одном браузере**. Это не система прав доступа: переключатель ролей не заменяет авторизацию или RLS.
- Отметка ученика «Выполнено» остаётся самостоятельной отметкой и не становится подтверждённым результатом. Автоматически оценённые ответы в игре — локальная проверка, но не оценка учителя. Карточки остаются самооценкой, не проверкой знаний.
- История ограничена последними 100 сессиями и 500 событиями на сессию; при подключении сервера ограничения и экспорт данных нужно спроектировать отдельно.
