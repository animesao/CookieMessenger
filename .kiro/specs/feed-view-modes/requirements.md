# Requirements Document

## Introduction

Добавление режимов просмотра в главную ленту (Feed) мессенджера. Пользователь сможет переключаться между несколькими фильтрами ленты: все посты, посты друзей, посты из каналов (на которые подписан), посты людей (не друзей). Переключение реализуется через вкладки в шапке ленты — аналогично ВКонтакте.

Стек: React + Express + SQLite (better-sqlite3). Фронт: `messenger/client/src`, бэк: `messenger/server`.

## Glossary

- **Feed** — страница главной ленты (`/feed`), отображающая посты пользователей и каналов
- **ViewMode** — режим фильтрации ленты: `all`, `friends`, `channels`, `people`
- **Feed_API** — серверный маршрут `GET /api/feed` с поддержкой параметра `mode`
- **Feed_Page** — клиентский компонент `Feed.jsx`
- **Post** — запись пользователя в таблице `posts`
- **ChannelPost** — запись канала в таблице `channel_posts`
- **Friend** — пользователь, связанный через таблицу `friendships` со статусом `accepted`
- **People** — пользователи, не являющиеся друзьями текущего пользователя
- **Channel** — канал из таблицы `channels`, на который подписан пользователь (`channel_subscribers`)

## Requirements

### Requirement 1: Режимы просмотра ленты

**User Story:** As a user, I want to switch between feed view modes, so that I can see only the posts relevant to me at any given moment.

#### Acceptance Criteria

1. THE Feed_Page SHALL display four tabs in the feed header: "Все посты", "Друзья", "Каналы", "Люди".
2. WHEN a user selects a tab, THE Feed_Page SHALL set the active ViewMode to the corresponding value (`all`, `friends`, `channels`, `people`).
3. WHEN the Feed_Page loads, THE Feed_Page SHALL set the default active ViewMode to `all`.
4. WHEN the active ViewMode changes, THE Feed_Page SHALL reset the post list and load page 1 for the new mode.
5. THE Feed_Page SHALL visually highlight the currently active tab to distinguish it from inactive tabs.

---

### Requirement 2: Серверная фильтрация по режиму

**User Story:** As a user, I want the server to return only the posts matching the selected mode, so that the feed content is accurate and consistent.

#### Acceptance Criteria

1. WHEN a request `GET /api/feed?mode=all` is received, THE Feed_API SHALL return posts from all users ordered by `created_at DESC` with pagination (`page`, `limit=20`).
2. WHEN a request `GET /api/feed?mode=friends` is received, THE Feed_API SHALL return only posts authored by users who are Friends of the requesting user.
3. WHEN a request `GET /api/feed?mode=channels` is received, THE Feed_API SHALL return only ChannelPosts from Channels to which the requesting user is subscribed.
4. WHEN a request `GET /api/feed?mode=people` is received, THE Feed_API SHALL return only posts authored by users who are not Friends of the requesting user and are not the requesting user themselves.
5. IF the `mode` parameter is absent or invalid, THEN THE Feed_API SHALL treat the request as `mode=all`.
6. THE Feed_API SHALL return a `hasMore` boolean indicating whether additional pages exist for the current mode.

---

### Requirement 3: Пагинация по режиму

**User Story:** As a user, I want to load more posts in any view mode, so that I can browse the full history without reloading the page.

#### Acceptance Criteria

1. WHEN a user clicks "Загрузить ещё", THE Feed_Page SHALL request the next page for the current active ViewMode.
2. WHEN a new page is loaded, THE Feed_Page SHALL append the new posts to the existing list without replacing it.
3. WHEN the Feed_Page switches ViewMode, THE Feed_Page SHALL reset the page counter to 1 before fetching.
4. WHILE `hasMore` is `false` for the current ViewMode, THE Feed_Page SHALL hide the "Загрузить ещё" button.

---

### Requirement 4: Пустое состояние по режиму

**User Story:** As a user, I want to see a meaningful message when a view mode has no posts, so that I understand why the feed is empty.

#### Acceptance Criteria

1. WHEN the `friends` mode returns zero posts, THE Feed_Page SHALL display the message "У ваших друзей пока нет постов".
2. WHEN the `channels` mode returns zero posts, THE Feed_Page SHALL display the message "Нет постов в ваших каналах".
3. WHEN the `people` mode returns zero posts, THE Feed_Page SHALL display the message "Нет постов от других пользователей".
4. WHEN the `all` mode returns zero posts, THE Feed_Page SHALL display the existing message "Пока нет постов".

---

### Requirement 5: Совместимость с реальным временем (WebSocket)

**User Story:** As a user, I want real-time post updates to respect the active view mode, so that I don't see irrelevant posts appear in a filtered feed.

#### Acceptance Criteria

1. WHEN a `new_post` WebSocket event is received and the active ViewMode is `all`, THE Feed_Page SHALL prepend the post to the list if it is not already present.
2. WHEN a `new_post` WebSocket event is received and the active ViewMode is `friends`, THE Feed_Page SHALL prepend the post only if the post author is a Friend of the current user.
3. WHEN a `new_post` WebSocket event is received and the active ViewMode is `people`, THE Feed_Page SHALL prepend the post only if the post author is not a Friend of the current user and is not the current user.
4. WHEN a `new_post` WebSocket event is received and the active ViewMode is `channels`, THE Feed_Page SHALL ignore the event (channel posts arrive via `channel_post` events, not `new_post`).
5. WHEN a `delete_post` WebSocket event is received, THE Feed_Page SHALL remove the post from the list regardless of the active ViewMode.
