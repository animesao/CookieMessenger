# Design Document: Feed View Modes

## Overview

Добавление четырёх режимов просмотра ленты (`all`, `friends`, `channels`, `people`) в существующий Feed.
Переключение реализуется через вкладки в шапке — аналогично ВКонтакте.

Изменения минимальны и локализованы в двух файлах:
- `messenger/server/routes/feed.js` — добавить фильтрацию по `mode` в `GET /api/feed`
- `messenger/client/src/pages/Feed.jsx` — добавить вкладки, передавать `mode` в запросы, фильтровать WS-события

## Architecture

```
Feed.jsx
  ├── TabBar (all | friends | channels | people)
  ├── state: viewMode, page, posts, hasMore
  ├── loadPosts(mode, page) → GET /api/feed?mode=X&page=Y
  └── WS handler: фильтрует new_post по viewMode

GET /api/feed?mode=X&page=Y
  ├── mode=all      → SELECT FROM posts JOIN users ORDER BY created_at DESC
  ├── mode=friends  → + WHERE p.user_id IN (SELECT friend_ids)
  ├── mode=channels → SELECT FROM channel_posts JOIN channels WHERE channel subscribed
  └── mode=people   → + WHERE p.user_id NOT IN (friend_ids) AND p.user_id != me
```

Никаких новых таблиц, сервисов или зависимостей не требуется. Все нужные таблицы уже существуют:
`posts`, `friendships`, `channel_posts`, `channel_subscribers`.

## Components and Interfaces

### TabBar (встроен в Feed.jsx)

```jsx
const TABS = [
  { key: 'all',      label: 'Все посты' },
  { key: 'friends',  label: 'Друзья' },
  { key: 'channels', label: 'Каналы' },
  { key: 'people',   label: 'Люди' },
];
```

Рендерит четыре кнопки. Активная вкладка получает CSS-класс `feed-tab--active`.

### Feed.jsx — изменения состояния

| Новое состояние | Тип | Описание |
|---|---|---|
| `viewMode` | `'all' \| 'friends' \| 'channels' \| 'people'` | Текущий режим, default `'all'` |

`loadPosts` получает дополнительный параметр `mode` и передаёт его в URL:
```
GET /api/feed?mode={mode}&page={page}
```

При смене вкладки: `setPosts([])`, `setPage(1)`, `setHasMore(true)`, затем `loadPosts(newMode, 1, true)`.

### GET /api/feed — новый параметр `mode`

| Параметр | Тип | Default | Описание |
|---|---|---|---|
| `mode` | string | `'all'` | Режим фильтрации |
| `page` | number | `1` | Страница |

Ответ не меняется: `{ posts: [...], hasMore: boolean }`.

Для `mode=channels` посты берутся из `channel_posts` и нормализуются в тот же формат что и обычные посты (добавляются поля `username`, `display_name`, `avatar`, `accent_color`, `animated_name`, `verified` из автора канала; `type='text'`; `likes=0`, `liked=false`, `commentsCount=0`, `views=cp.views`).

## Data Models

Новых таблиц нет. Используемые существующие:

```sql
-- Друзья текущего пользователя (userId)
SELECT CASE WHEN requester_id = :me THEN addressee_id ELSE requester_id END as friend_id
FROM friendships
WHERE (requester_id = :me OR addressee_id = :me) AND status = 'accepted'

-- Подписки на каналы
SELECT channel_id FROM channel_subscribers WHERE user_id = :me
```

### Нормализованный формат поста для mode=channels

```js
{
  id: cp.id,
  user_id: cp.author_id,
  type: 'text',
  content: cp.content,
  media: cp.media,
  created_at: cp.created_at,
  // поля из users (автор канала)
  username, display_name, avatar, accent_color, animated_name, verified,
  // агрегаты
  likes: 0, liked: false, commentsCount: 0, views: cp.views,
  poll: null,
  // маркер источника
  isChannelPost: true,
  channelId: cp.channel_id,
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Смена режима сбрасывает список и запрашивает страницу 1

*For any* текущего режима и любого нового режима (отличного от текущего), переключение вкладки должно привести к тому, что список постов сбрасывается в пустой массив и следующий запрос к API содержит `page=1` и `mode=<новый режим>`.

**Validates: Requirements 1.4, 3.3**

---

### Property 2: Фильтрация friends — только посты друзей

*For any* набора пользователей и дружеских связей, запрос `GET /api/feed?mode=friends` должен возвращать только посты, у которых `user_id` входит в множество друзей запрашивающего пользователя.

**Validates: Requirements 2.2**

---

### Property 3: Фильтрация channels — только посты из подписанных каналов

*For any* набора каналов и подписок, запрос `GET /api/feed?mode=channels` должен возвращать только посты, у которых `channel_id` входит в множество каналов, на которые подписан пользователь.

**Validates: Requirements 2.3**

---

### Property 4: Фильтрация people — исключает себя и друзей

*For any* набора пользователей и дружеских связей, запрос `GET /api/feed?mode=people` должен возвращать только посты, у которых `user_id` не равен `id` запрашивающего пользователя и не входит в множество его друзей.

**Validates: Requirements 2.4**

---

### Property 5: hasMore корректно отражает наличие следующей страницы

*For any* набора постов и номера страницы, поле `hasMore` в ответе должно быть `true` тогда и только тогда, когда `total > offset + limit` (т.е. `(page - 1) * 20 + 20 < total`).

**Validates: Requirements 2.6**

---

### Property 6: Добавление новой страницы не заменяет существующий список

*For any* существующего списка постов и любого набора постов новой страницы, после загрузки следующей страницы итоговый список должен содержать все посты из старого списка плюс все посты новой страницы (без дублирования, без замены).

**Validates: Requirements 3.2**

---

### Property 7: hasMore=false скрывает кнопку "Загрузить ещё"

*For any* состояния компонента Feed, где `hasMore=false`, кнопка "Загрузить ещё" не должна присутствовать в DOM.

**Validates: Requirements 3.4**

---

### Property 8: WS new_post в режиме all — идемпотентное добавление

*For any* списка постов и любого входящего WS-события `new_post`, если пост с таким `id` уже есть в списке — список не изменяется; если нет — пост добавляется в начало.

**Validates: Requirements 5.1**

---

### Property 9: WS new_post фильтруется по режиму friends/people

*For any* множества друзей и любого входящего WS-события `new_post`:
- в режиме `friends`: пост добавляется тогда и только тогда, когда `post.user_id` входит в множество друзей
- в режиме `people`: пост добавляется тогда и только тогда, когда `post.user_id` не входит в множество друзей и не равен `currentUser.id`

**Validates: Requirements 5.2, 5.3**

---

### Property 10: WS delete_post удаляет пост в любом режиме

*For any* режима просмотра и любого списка постов, получение WS-события `delete_post` с `postId=X` должно привести к тому, что пост с `id=X` отсутствует в итоговом списке.

**Validates: Requirements 5.5**

## Error Handling

| Ситуация | Поведение |
|---|---|
| `mode` отсутствует или невалиден | Сервер трактует как `mode=all` |
| Запрос к API завершился ошибкой | Feed.jsx показывает существующий блок ошибки с кнопкой "Попробовать снова" |
| `mode=friends`, нет друзей | Возвращается пустой массив, `hasMore=false` |
| `mode=channels`, нет подписок | Возвращается пустой массив, `hasMore=false` |
| `mode=people`, все пользователи — друзья | Возвращается пустой массив, `hasMore=false` |

## Testing Strategy

### Unit / Example-based тесты

- Рендер Feed: четыре вкладки с правильными лейблами (Req 1.1)
- Клик по вкладке устанавливает правильный `viewMode` (Req 1.2)
- Начальный `viewMode` равен `'all'` (Req 1.3)
- Активная вкладка имеет CSS-класс `feed-tab--active` (Req 1.5)
- Пустые состояния: каждый режим показывает правильное сообщение (Req 4.1–4.4)
- WS `new_post` в режиме `channels` игнорируется (Req 5.4)
- Невалидный `mode` на сервере → поведение как `all` (Req 2.5)

### Property-based тесты (fast-check)

Библиотека: **fast-check** (уже совместима с Vitest/Jest).
Минимум 100 итераций на каждый тест.

| # | Property | Тег |
|---|---|---|
| P1 | Смена режима сбрасывает список и запрашивает page=1 | `Feature: feed-view-modes, Property 1` |
| P2 | friends — только посты друзей | `Feature: feed-view-modes, Property 2` |
| P3 | channels — только посты из подписанных каналов | `Feature: feed-view-modes, Property 3` |
| P4 | people — исключает себя и друзей | `Feature: feed-view-modes, Property 4` |
| P5 | hasMore корректно отражает наличие следующей страницы | `Feature: feed-view-modes, Property 5` |
| P6 | Добавление страницы не заменяет список | `Feature: feed-view-modes, Property 6` |
| P7 | hasMore=false скрывает кнопку | `Feature: feed-view-modes, Property 7` |
| P8 | WS new_post идемпотентен в режиме all | `Feature: feed-view-modes, Property 8` |
| P9 | WS new_post фильтруется по friends/people | `Feature: feed-view-modes, Property 9` |
| P10 | WS delete_post удаляет пост в любом режиме | `Feature: feed-view-modes, Property 10` |

P2–P5 тестируют серверную логику фильтрации через чистые функции (вынести SQL-запросы в отдельные функции-хелперы, тестировать их с in-memory SQLite или mock-данными).
P1, P6–P10 тестируют клиентскую логику состояния (чистые редьюсеры / хуки с mock fetch/WS).
