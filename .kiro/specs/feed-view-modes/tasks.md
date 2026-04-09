# Implementation Plan: Feed View Modes

## Overview

Добавление четырёх режимов просмотра ленты (`all`, `friends`, `channels`, `people`) через вкладки в Feed.jsx и серверную фильтрацию в feed.js.

## Tasks

- [x] 1. Серверная фильтрация по mode в GET /api/feed
  - [x] 1.1 Добавить фильтрацию по mode=all|friends|channels|people в feed.js
    - Заменить текущий SELECT на условный по mode
    - mode=friends: WHERE p.user_id IN (друзья через friendships WHERE status='accepted')
    - mode=channels: SELECT FROM channel_posts JOIN channels, нормализовать в формат постов
    - mode=people: WHERE p.user_id NOT IN (friend_ids) AND p.user_id != me
    - Невалидный/отсутствующий mode → трактовать как all
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 2. Клиентские вкладки и state в Feed.jsx
  - [x] 2.1 Добавить state viewMode и TabBar в Feed.jsx
    - Добавить const TABS и state viewMode (default 'all')
    - Рендерить 4 кнопки с классом feed-tab--active для активной
    - При смене вкладки: setPosts([]), setPage(1), setHasMore(true), loadPosts(newMode, 1, true)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 2.2 Передавать mode в запросы и фильтровать WS-события
    - loadPosts принимает mode, передаёт ?mode=X&page=Y
    - WS new_post: mode=all → добавить если нет; mode=friends → только если автор в friends; mode=people → только если не друг и не я; mode=channels → игнорировать
    - Для WS-фильтрации friends/people: загружать список друзей через /api/friends
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.3 Пустые состояния по режиму
    - mode=friends → "У ваших друзей пока нет постов"
    - mode=channels → "Нет постов в ваших каналах"
    - mode=people → "Нет постов от других пользователей"
    - mode=all → существующее "Пока нет постов"
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 3. Checkpoint — убедиться что всё работает
  - Ensure all tests pass, ask the user if questions arise.
