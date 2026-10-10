# Техническое задание
## EventDraw — система регистрации гостей и проведения розыгрышей

## 1. Цель проекта

Разработать веб-приложение для регистрации участников мероприятий и проведения публичных розыгрышей призов.

Первое использование:

**открытие учебного центра.**

Приложение должно быть универсальным, чтобы впоследствии его можно было использовать на:

- открытиях;
- днях открытых дверей;
- конференциях;
- семинарах;
- выставках;
- образовательных мероприятиях;
- корпоративных событиях.

Основной сценарий:

```text
Создать мероприятие
        ↓
Добавить призы
        ↓
Получить QR-код
        ↓
Гости регистрируются
        ↓
Получают номера
        ↓
Ведущий запускает розыгрыш
        ↓
Supabase выбирает победителя
        ↓
Победитель показывается на большом экране
        ↓
Результат сохраняется
```

---

# 2. Главный архитектурный принцип

Вся серверная инфраструктура проекта должна работать через:

# Supabase

Не создавать отдельный backend на:

```text
Node.js
Express
NestJS
Next.js API Routes
FastAPI
Django
Laravel
```

Backend проекта состоит только из компонентов Supabase:

```text
Supabase PostgreSQL
Supabase Auth
Supabase Row Level Security
Supabase Storage
Supabase Realtime
Supabase Database Functions / RPC
Supabase Edge Functions
Supabase migrations
```

Frontend обращается напрямую к Supabase через:

```text
@supabase/supabase-js
```

---

# 3. Технологический стек

## Frontend

```text
React
Vite
TypeScript
Tailwind CSS
React Router
TanStack Query
```

Допустимые библиотеки:

```text
@supabase/supabase-js
lucide-react
react-hook-form
zod
date-fns
canvas-confetti
qrcode.react
```

---

# 4. Supabase

Использовать:

```text
PostgreSQL
Auth
Storage
Realtime
RPC
Edge Functions
RLS
Database Triggers
```

Все изменения базы должны находиться в:

```text
supabase/migrations/
```

Edge Functions:

```text
supabase/functions/
```

---

# 5. Структура проекта

```text
/
├── src/
│
│   ├── app/
│   │   ├── router/
│   │   └── providers/
│
│   ├── components/
│   │   ├── ui/
│   │   ├── participants/
│   │   ├── prizes/
│   │   ├── draws/
│   │   └── screen/
│
│   ├── pages/
│   │
│   │   ├── public/
│   │   │   ├── EventPage.tsx
│   │   │   ├── RegistrationPage.tsx
│   │   │   ├── RegistrationSuccessPage.tsx
│   │   │   ├── CheckInPage.tsx
│   │   │   └── ScreenPage.tsx
│   │
│   │   ├── admin/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── EventsPage.tsx
│   │   │   ├── EventDashboardPage.tsx
│   │   │   ├── ParticipantsPage.tsx
│   │   │   ├── PrizesPage.tsx
│   │   │   ├── DrawsPage.tsx
│   │   │   └── SettingsPage.tsx
│   │
│   │   └── host/
│   │       └── HostPage.tsx
│
│   ├── lib/
│   │   └── supabase.ts
│
│   ├── services/
│   │   ├── events.ts
│   │   ├── participants.ts
│   │   ├── prizes.ts
│   │   └── draws.ts
│
│   ├── hooks/
│   ├── types/
│   └── utils/
│
├── supabase/
│
│   ├── migrations/
│
│   ├── functions/
│   │   ├── register-participant/
│   │   └── check-in/
│
│   ├── seed.sql
│   └── config.toml
│
├── .env.example
└── README.md
```

---

# 6. Авторизация

Использовать только:

```text
Supabase Auth
```

Метод входа MVP:

```text
email + password
```

Роли:

```text
admin
host
```

Не хранить роль только в localStorage.

Создать таблицу:

```sql
profiles
```

Структура:

```text
id uuid PK
role text
display_name text
created_at timestamptz
```

`id` соответствует:

```text
auth.users.id
```

Роли:

```text
admin
host
```

---

# 7. События

Таблица:

```sql
events
```

Поля:

```text
id uuid primary key

name text not null
slug text unique not null

description text

logo_path text

status text

registration_enabled boolean default true
check_in_required boolean default false

allow_multiple_wins boolean default false

require_phone boolean default true
require_email boolean default false

show_participant_name boolean default true
show_ticket_number boolean default true

ticket_digits integer default 3

sound_enabled boolean default true
confetti_enabled boolean default true

draw_animation_seconds integer default 4

primary_color text

created_by uuid

created_at timestamptz
updated_at timestamptz
```

status:

```text
draft
active
finished
archived
```

---

# 8. Участники

Создать:

```sql
participants
```

Поля:

```text
id uuid primary key

event_id uuid not null
references events(id)

name text not null

phone text
email text

ticket_number integer not null

checked_in boolean default false
checked_in_at timestamptz

is_active boolean default true

is_test boolean default false

created_at timestamptz
updated_at timestamptz
```

---

# 9. Уникальный номер участника

Номер должен присваиваться на стороне PostgreSQL.

Нельзя вычислять следующий номер на клиенте:

```text
max(ticket_number) + 1
```

потому что это создаст race condition.

Создать безопасную серверную функцию или sequence-механику.

Номер должен быть уникальным внутри мероприятия:

```sql
unique(event_id, ticket_number)
```

---

# 10. Отображение номера

В БД хранить:

```text
1
2
3
57
143
```

На frontend показывать:

```text
001
002
003
057
143
```

При превышении:

```text
999
```

автоматически перейти на:

```text
1000
```

---

# 11. Публичная регистрация

URL:

```text
/event/:eventSlug/register
```

Форма:

```text
Имя

Телефон

Email
```

Обязательность полей определяется настройками event.

После регистрации:

```text
Вы участвуете в розыгрыше!

Ваш номер

№143

Желаем удачи!
```

---

# 12. Регистрация через Edge Function

Публичный клиент НЕ должен напрямую делать:

```text
insert into participants
```

Регистрацию реализовать через Supabase Edge Function:

```text
register-participant
```

Запрос:

```json
{
  "event_slug": "opening-2026",
  "name": "Дана",
  "phone": "+77011234567",
  "email": null
}
```

Edge Function должна:

1. проверить мероприятие;
2. убедиться, что оно активно;
3. проверить `registration_enabled`;
4. проверить обязательные поля;
5. нормализовать телефон;
6. проверить повторную регистрацию;
7. вызвать защищенную PostgreSQL RPC;
8. получить номер участника;
9. вернуть результат.

---

# 13. Результат регистрации

Пример:

```json
{
  "success": true,
  "participant_id": "...",
  "ticket_number": 143
}
```

Если такой телефон уже зарегистрирован:

```json
{
  "success": true,
  "already_registered": true,
  "ticket_number": 57
}
```

---

# 14. Телефон

Основной формат Казахстана:

```text
+7XXXXXXXXXX
```

Нормализовать:

```text
87011234567
77011234567
+77011234567
8 701 123 45 67
```

до:

```text
+77011234567
```

---

# 15. Защита от дублей

При наличии телефона создать уникальность:

```text
event_id + normalized_phone
```

Но NULL phone должен быть допустим, если мероприятие не требует телефон.

Использовать partial unique index.

---

# 16. Защита регистрации

Edge Function должна иметь возможность реализовать:

```text
rate limiting
IP throttling
anti-bot проверки
```

Архитектуру подготовить для последующего подключения:

```text
Cloudflare Turnstile
```

---

# 17. Призы

Таблица:

```sql
prizes
```

Поля:

```text
id uuid primary key

event_id uuid not null

name text not null

description text

image_path text

quantity integer default 1

sort_order integer default 0

is_active boolean default true

created_at timestamptz
updated_at timestamptz
```

---

# 18. Количество призов

Пример:

```text
Сертификат 20 000 ₸
quantity = 3

Бесплатный курс
quantity = 1

Скидка 50%
quantity = 5
```

Система должна показывать:

```text
выдано 2 из 3
```

---

# 19. Draws

Создать таблицу:

```sql
draws
```

Поля:

```text
id uuid primary key

event_id uuid not null
prize_id uuid not null
participant_id uuid not null

status text not null

participants_count integer not null

created_by uuid

drawn_at timestamptz
confirmed_at timestamptz
cancelled_at timestamptz

created_at timestamptz
```

status:

```text
pending
confirmed
cancelled
```

---

# 20. Главное правило розыгрыша

Frontend никогда не выбирает победителя.

Запрещено использовать для определения победителя:

```javascript
Math.random()
```

или другую клиентскую логику.

Победитель определяется исключительно:

# PostgreSQL внутри Supabase

через RPC.

---

# 21. RPC draw_winner

Создать PostgreSQL функцию:

```sql
draw_winner(
    p_event_id uuid,
    p_prize_id uuid
)
```

Функция должна работать атомарно.

---

# 22. Алгоритм draw_winner

Функция должна:

1. определить текущего пользователя;
2. проверить его права;
3. получить event;
4. проверить статус event;
5. проверить `draw_enabled`;
6. проверить prize;
7. проверить, что количество призов не исчерпано;
8. сформировать список допустимых участников;
9. проверить наличие участников;
10. случайно выбрать одного;
11. создать `draw`;
12. изменить состояние большого экрана;
13. вернуть победителя.

Все операции должны выполняться:

```text
в одной транзакции
```

---

# 23. Кто участвует

Основной фильтр:

```text
event_id = event
AND is_active = true
AND is_test = false
```

Если:

```text
check_in_required = true
```

добавить:

```text
checked_in = true
```

---

# 24. Повторный выигрыш

Если:

```text
allow_multiple_wins = false
```

исключить участников, имеющих:

```text
draws.status = confirmed
```

---

# 25. Тестовые участники

Тестовые участники:

```text
is_test = true
```

По умолчанию никогда не должны участвовать в production-розыгрыше.

Предусмотреть отдельный dev/test режим при необходимости.

---

# 26. Случайный выбор

Случайный выбор выполняет PostgreSQL.

Необходимо реализовать корректный случайный выбор одного кандидата.

Результат определяется на сервере до начала UI-анимации.

Логика:

```text
Host
 ↓
Supabase RPC
 ↓
PostgreSQL определяет победителя
 ↓
создает draw
 ↓
Realtime уведомляет Screen
 ↓
Screen показывает анимацию
 ↓
Screen показывает заранее выбранного победителя
```

---

# 27. Защита от двойного запуска

Если ведущий дважды нажмет кнопку или два ведущих нажмут одновременно:

не должно быть двух случайных победителей одного розыгрыша.

Использовать:

```text
PostgreSQL transaction
locking
constraints
```

при необходимости:

```text
pg_advisory_xact_lock
```

---

# 28. Подтверждение победителя

Создать RPC:

```text
confirm_draw(p_draw_id uuid)
```

Функция:

1. проверяет пользователя;
2. проверяет draw;
3. проверяет status = pending;
4. переводит его в:

```text
confirmed
```

5. устанавливает:

```text
confirmed_at
```

6. обновляет состояние экрана.

---

# 29. Победитель отсутствует

Создать RPC:

```text
cancel_draw(p_draw_id uuid)
```

Она должна установить:

```text
status = cancelled
cancelled_at = now()
```

После этого ведущий может запустить новый draw.

---

# 30. Не использовать is_winner как главный источник истины

Не хранить бизнес-истину только в:

```text
participants.is_winner
```

Источником истины должна быть:

```text
draws
```

Победитель определяется наличием:

```text
confirmed draw
```

Если для UI понадобится быстрый флаг, его можно вычислять view или query.

---

# 31. Screen State

Создать:

```sql
event_screen_state
```

Структура:

```text
event_id uuid primary key

mode text

current_prize_id uuid
current_draw_id uuid

countdown_end timestamptz

updated_at timestamptz
```

mode:

```text
waiting
countdown
drawing
winner
paused
```

---

# 32. Realtime

Использовать:

# Supabase Realtime

Для синхронизации:

```text
Host
↕
Supabase
↕
Big Screen
```

Realtime использовать для:

```text
нового участника

изменения screen state

начала розыгрыша

появления winner

подтверждения winner

отмены draw

изменения счетчика участников
```

---

# 33. Большой экран

URL:

```text
/event/:eventSlug/screen
```

Большой экран не требует авторизации.

Но публично он получает только безопасные данные.

Никогда не отдавать:

```text
телефон
email
служебные данные
```

---

# 34. Waiting screen

Показывать:

```text
ЛОГОТИП

ОТКРЫТИЕ УЧЕБНОГО ЦЕНТРА

УЧАСТВУЙТЕ В РОЗЫГРЫШЕ

[ QR ]

Сканируйте QR-код

Участников: 187
```

---

# 35. Drawing screen

При:

```text
mode = drawing
```

показывать динамичную анимацию.

Например:

```text
№027
№183
№094
№141
№063
```

Анимация:

```text
3–5 секунд
```

Продолжительность брать из:

```text
events.draw_animation_seconds
```

---

# 36. Важно

Показываемые во время анимации номера:

```text
не являются попытками выбора победителя
```

Это исключительно визуальный эффект.

Настоящий победитель уже получен из Supabase.

---

# 37. Winner screen

После завершения анимации:

```text
🏆 ПОБЕДИТЕЛЬ

№083

ДАНА

Бесплатный курс английского языка

ПОЗДРАВЛЯЕМ!
```

Запустить:

```text
confetti
```

При необходимости:

```text
sound
```

---

# 38. Панель ведущего

URL:

```text
/host/:eventId
```

Показать:

```text
Открытие учебного центра

Участников: 187

Присутствует: 154

Победителей: 7
```

---

# 39. Управление розыгрышем

Главный UX:

```text
Выбрать приз

↓

НАЧАТЬ РОЗЫГРЫШ

↓

анимация

↓

победитель

↓

Подтвердить
или
Победитель отсутствует

↓

Следующий приз
```

---

# 40. QR

QR должен вести на:

```text
/event/opening-2026/register
```

В административной панели:

```text
Показать QR

Скачать PNG

Открыть страницу регистрации
```

---

# 41. Check-in

Предусмотреть:

```text
/event/:eventSlug/check-in
```

Check-in можно производить:

```text
по номеру участника
по телефону
по персональному QR
```

---

# 42. Check-in backend

Использовать Edge Function:

```text
check-in
```

или защищенную RPC для authenticated staff.

После подтверждения:

```text
checked_in = true
checked_in_at = now()
```

---

# 43. Индивидуальный QR

После регистрации можно генерировать персональный QR:

```text
/event/opening-2026/check-in?t=<token>
```

Не помещать напрямую:

```text
participant_id
телефон
email
```

в QR.

При необходимости использовать отдельный случайный token.

---

# 44. Supabase Storage

Использовать:

# Supabase Storage

Для:

```text
логотипов мероприятий
изображений призов
фоновых изображений
```

Buckets:

```text
event-assets
```

Структура:

```text
events/{event_id}/logo.*
events/{event_id}/background.*
events/{event_id}/prizes/{prize_id}.*
```

---

# 45. Storage policies

Настроить RLS / policies.

Публично разрешать только чтение файлов, предназначенных для публичного показа.

Upload/Delete:

```text
только admin
```

---

# 46. RLS

Row Level Security обязательно включить для всех пользовательских таблиц.

В частности:

```text
profiles
events
participants
prizes
draws
event_screen_state
audit_logs
```

---

# 47. Публичный пользователь

Anon не должен иметь прямого:

```text
INSERT participants
UPDATE participants
DELETE participants

INSERT draws
UPDATE draws
DELETE draws

SELECT phone
SELECT email
```

Регистрация осуществляется через:

```text
Edge Function
```

---

# 48. Публичные данные мероприятия

Создать безопасное представление:

```sql
public_event_view
```

Поля:

```text
id
name
slug
description
logo
primary_color
registration_enabled
status
```

Не публиковать внутренние настройки без необходимости.

---

# 49. Public screen view

Создать:

```text
public_screen_state
```

или RPC, который возвращает:

```text
event name
current mode
participant count
current prize
winner name
winner ticket number
```

Только разрешенные публичные данные.

---

# 50. Безопасность SECURITY DEFINER

Если используются функции:

```text
SECURITY DEFINER
```

обязательно:

```text
жестко задавать search_path
проверять auth.uid()
проверять role
ограничивать EXECUTE permissions
```

Не создавать SECURITY DEFINER функции без проверки доступа.

---

# 51. Audit logs

Создать:

```sql
audit_logs
```

Поля:

```text
id uuid

event_id uuid

user_id uuid

action text

entity_type text
entity_id uuid

metadata jsonb

created_at timestamptz
```

---

# 52. Логировать

Как минимум:

```text
event_created

participant_created

participant_disabled

check_in

draw_started

draw_confirmed

draw_cancelled

prize_created

settings_updated
```

---

# 53. Логирование через database

По возможности критические операции логировать внутри той же PostgreSQL transaction.

Например:

```text
draw_winner
```

должен одновременно создать:

```text
draw

audit_log
```

---

# 54. Участники — административная страница

URL:

```text
/admin/events/:eventId/participants
```

Таблица:

```text
№

Имя

Телефон

Email

Check-in

Статус

Дата регистрации
```

---

# 55. Фильтры

Добавить:

```text
поиск

все

присутствуют

не пришли

активные

отключенные

победители
```

---

# 56. Административные операции

Администратор может:

```text
деактивировать

активировать

сделать check-in

отменить check-in
```

Не удалять обычного участника физически без необходимости.

Использовать:

```text
is_active
```

---

# 57. История розыгрышей

URL:

```text
/admin/events/:eventId/draws
```

Показывать:

```text
Время

Приз

№ участника

Имя

Статус

Количество участников
```

---

# 58. Призы

URL:

```text
/admin/events/:eventId/prizes
```

CRUD:

```text
Создать

Редактировать

Деактивировать

Изменить порядок
```

---

# 59. Dashboard

URL:

```text
/admin/events/:eventId
```

Карточки:

```text
Участников
187

Присутствует
154

Победителей
8

Призов осталось
6
```

---

# 60. Realtime participant counter

Счетчик участников большого экрана должен обновляться автоматически.

Например:

```text
187
↓
188
```

без перезагрузки страницы.

---

# 61. Performance

Не загружать на Big Screen весь список участников.

Для счетчика использовать:

```text
count
```

или специальную агрегирующую функцию.

Не подписываться на ненужные персональные данные.

---

# 62. Views

Создать удобные views:

```text
event_stats
prize_stats
confirmed_winners
```

Например:

```text
event_stats
```

может возвращать:

```text
participants_count
checked_in_count
confirmed_winners_count
remaining_prizes_count
```

---

# 63. Тестовые участники

В admin добавить:

```text
Создать тестовых участников
```

Варианты:

```text
10
50
100
500
```

Для них:

```text
is_test = true
```

Добавить:

```text
Удалить тестовых участников
```

---

# 64. Import

После MVP предусмотреть:

```text
XLSX
CSV
```

Импорт проводить не прямыми insert из браузера, а:

```text
Edge Function
```

или специальной RPC.

---

# 65. Export

Экспорт:

```text
Все участники

Присутствующие

Победители

История розыгрышей
```

Форматы:

```text
XLSX
CSV
```

---

# 66. Environment variables

Frontend:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Не помещать во frontend:

```text
SUPABASE_SECRET_KEY
service role key
database password
```

---

# 67. Edge Function secrets

Все секреты серверной части хранить через:

```text
Supabase Secrets
```

Не коммитить их в Git.

---

# 68. Supabase CLI

Проект должен поддерживать:

```text
supabase init

supabase start

supabase db reset

supabase migration up

supabase functions serve
```

---

# 69. Миграции

Нельзя создавать production schema только вручную через Supabase Dashboard.

Все изменения должны иметь migration.

Например:

```text
202610070001_create_profiles.sql

202610070002_create_events.sql

202610070003_create_participants.sql

202610070004_create_prizes.sql

202610070005_create_draws.sql

202610070006_create_screen_state.sql

202610070007_create_rls.sql

202610070008_create_draw_functions.sql
```

---

# 70. Database indexes

Создать как минимум:

```text
events(slug)

participants(event_id)

participants(event_id, ticket_number)

participants(event_id, checked_in)

participants(event_id, is_active)

draws(event_id)

draws(event_id, participant_id)

draws(event_id, prize_id)

prizes(event_id)
```

---

# 71. Constraints

Обязательно использовать database constraints.

Например:

```text
quantity > 0

ticket_number > 0

draw_animation_seconds BETWEEN 1 AND 15
```

status ограничивать:

```text
CHECK
```

или PostgreSQL enum.

---

# 72. Realtime channels

Использовать минимум подписок.

Для screen предпочтительно отслеживать:

```text
event_screen_state
```

а не несколько таблиц одновременно.

---

# 73. Broadcast

Если потребуется более плавная синхронизация UI, допускается использовать:

```text
Supabase Realtime Broadcast
```

для событий:

```text
DRAW_STARTED

DRAW_REVEAL

DRAW_CONFIRMED
```

Но состояние должно всегда восстанавливаться из БД.

Broadcast не должен быть единственным источником истины.

---

# 74. Source of truth

Источники истины:

```text
PostgreSQL
```

Не:

```text
React state
localStorage
Realtime event
```

После перезагрузки любого окна интерфейс должен восстановить актуальное состояние из Supabase.

---

# 75. Fullscreen

Большой экран должен поддерживать:

```text
Fullscreen API
```

Кнопка:

```text
На весь экран
```

Элементы управления скрывать через несколько секунд бездействия.

---

# 76. Дизайн

Стиль:

```text
современный

минималистичный

праздничный

премиальный

крупная типографика
```

Не делать интерфейс похожим на:

```text
казино
ставки
слот-машины
```

---

# 77. Mobile First

Регистрация ориентирована прежде всего на телефон.

Проверить:

```text
iPhone

Android

iPad

desktop
```

---

# 78. Ошибка соединения

Frontend должен показывать:

```text
Онлайн

Переподключение

Нет соединения
```

Если Host потерял связь с Supabase:

```text
НАЧАТЬ РОЗЫГРЫШ
```

должна быть отключена.

---

# 79. Не проводить розыгрыш offline

Категорически запрещено делать fallback:

```text
Math.random()
```

при отсутствии Supabase.

Лучше показать:

```text
Нет соединения с сервером.
Розыгрыш временно недоступен.
```

---

# 80. Первый MVP

Обязательно реализовать:

```text
Supabase Auth

profiles + роли

events

participants

public registration

ticket numbers

QR

prizes

draws

RPC draw_winner

RPC confirm_draw

RPC cancel_draw

host interface

big screen

Realtime

event_screen_state

RLS

Storage для логотипа

audit log

confetti

история победителей
```

---

# 81. Пока не делать

В первую версию не включать:

```text
SMS

WhatsApp

Telegram

email-рассылки

Kaspi

платежи

сложную аналитику

мобильное приложение

multi-tenant SaaS
```

---

# 82. Подготовка к SaaS

Хотя первая версия предназначена для собственного использования, структура не должна мешать добавить позже:

```text
organizations

organization_users

несколько администраторов

разные компании

тарифы
```

Но сейчас таблицу organizations можно не создавать.

---

# 83. Seed

Создать:

```text
supabase/seed.sql
```

Тестовое событие:

```text
Открытие учебного центра
```

Призы:

```text
Сертификат 20 000 ₸

Скидка 50%

Бесплатный курс

Фирменный подарок

Главный приз
```

Создать тестовые данные для разработки.

---

# 84. Database tests

Проверить сценарии:

```text
нельзя зарегистрировать одинаковый телефон два раза

ticket_number уникален

неактивный пользователь не участвует

unchecked участник не участвует при check_in_required

победитель не выигрывает второй раз

cancelled draw не считается победой

confirmed draw считается победой

два параллельных draw не ломают данные

обычный anon не может читать телефоны

host не имеет admin-прав
```

---

# 85. Frontend tests

Проверить:

```text
регистрация

duplicate registration

Host draw flow

confirm

cancel

Realtime screen update

reconnect
```

---

# 86. README

Codex должен создать:

```text
README.md
```

Описать:

```text
архитектуру

Supabase setup

Supabase CLI

env

migrations

seed

Edge Functions

local development

production deployment
```

---

# 87. Главный end-to-end сценарий

MVP считается рабочим только если выполняется полностью:

```text
Admin входит через Supabase Auth
        ↓
Создает Event
        ↓
Добавляет Prize
        ↓
Получает QR
        ↓
Гость открывает QR
        ↓
Edge Function регистрирует гостя
        ↓
PostgreSQL выдает №001
        ↓
Realtime обновляет счетчик
        ↓
Host выбирает Prize
        ↓
Host нажимает DRAW
        ↓
RPC draw_winner
        ↓
Postgres выбирает победителя
        ↓
draw сохраняется
        ↓
event_screen_state меняется
        ↓
Realtime сообщает Big Screen
        ↓
анимация
        ↓
показывается победитель
        ↓
Host подтверждает победителя
        ↓
RPC confirm_draw
        ↓
результат сохраняется
        ↓
победитель исключается из следующих розыгрышей
```

---

# 88. Приоритет архитектуры

При конфликте требований приоритет:

```text
1. Целостность данных
2. Честность розыгрыша
3. Безопасность
4. Надежность во время мероприятия
5. Простота UX
6. Визуальный эффект
7. Дополнительные функции
```

---

# 89. Правила для Codex

Codex должен:

1. сначала изучить существующий repository;
2. не создавать отдельный backend;
3. использовать Supabase как единственный backend;
4. не помещать secret/service keys во frontend;
5. использовать TypeScript strict;
6. не использовать `any` без крайней необходимости;
7. все изменения БД оформлять migrations;
8. включить RLS;
9. отдельно проверить anon/authenticated permissions;
10. бизнес-логику розыгрыша держать в PostgreSQL;
11. Edge Functions использовать только там, где они действительно нужны;
12. не дублировать серверную бизнес-логику в React;
13. после каждого этапа запускать build;
14. исправлять TypeScript ошибки;
15. документировать принятые архитектурные решения.

---

# 90. Порядок реализации

## Этап 1 — Foundation

```text
Vite
React
TypeScript
Tailwind
Router
Supabase client
Supabase CLI
project structure
```

## Этап 2 — Database

```text
profiles
events
participants
prizes
draws
event_screen_state
audit_logs
```

Добавить:

```text
indexes
constraints
triggers
RLS
```

## Этап 3 — Auth

```text
Login
profiles
roles
admin layout
route guards
```

## Этап 4 — Events

```text
create
edit
list
settings
```

## Этап 5 — Registration

```text
register-participant Edge Function
phone normalization
ticket generation
duplicate protection
registration page
success page
QR
```

## Этап 6 — Participants

```text
list
filters
check-in
activate/deactivate
```

## Этап 7 — Prizes

```text
CRUD
quantity
ordering
images
```

## Этап 8 — Draw Engine

```text
draw_winner
confirm_draw
cancel_draw
locking
audit logs
```

## Этап 9 — Host

```text
host screen
select prize
draw
confirm
cancel
next prize
```

## Этап 10 — Big Screen

```text
waiting
drawing
winner
Realtime
animations
confetti
fullscreen
```

## Этап 11 — Hardening

```text
RLS audit
race-condition tests
error states
reconnect
responsive
```

---

# 91. Что должен предоставить Codex после выполнения

Отчет:

```text
Что реализовано

Какие таблицы созданы

Какие migrations созданы

Какие RPC функции реализованы

Какие Edge Functions реализованы

Какие RLS policies созданы

Какие Storage buckets нужны

Какие ENV нужны

Как запустить локально

Как выполнить migrations

Как выполнить seed

Как deploy Edge Functions

Как создать первого admin

Как протестировать полный розыгрыш

Какие задачи остались
```

---

# 92. Финальное архитектурное правило

Проект должен следовать модели:

```text
React
   │
   │ supabase-js
   ▼
┌─────────────────────────────┐
│          SUPABASE           │
│                             │
│  Auth                       │
│  PostgreSQL                 │
│  RLS                        │
│  RPC                        │
│  Realtime                   │
│  Storage                    │
│  Edge Functions             │
│  Database Triggers          │
│  Audit                      │
└─────────────────────────────┘
```

Не должно быть дополнительного backend API.

Критическая логика:

```text
розыгрыш
нумерация
права доступа
подтверждение результата
целостность данных
```

реализуется внутри Supabase.

React отвечает преимущественно за:

```text
UI
формы
визуализацию
анимацию
подписку на Realtime
```

а не за критическую бизнес-логику.