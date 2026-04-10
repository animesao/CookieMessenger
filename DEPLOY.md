# Инструкция по деплою изменений

## Проблема
После git pull изменения не появляются на сайте.

## Решение

### 1. На сервере выполните:

```bash
cd /var/www/CookieMessenger
git pull origin main
pm2 restart rlc
```

### 2. Проверьте что изменения применились:

```bash
bash scripts/check-deploy.sh
```

Должно показать:
- ✅ Username change feature found in client build
- ✅ Username change endpoint found in server

### 3. Очистите кеш браузера

**Важно!** Браузер кеширует JavaScript файлы. Нужно:

#### Chrome/Edge:
- Нажмите `Ctrl + Shift + Delete`
- Выберите "Кешированные изображения и файлы"
- Нажмите "Удалить данные"
- Или просто `Ctrl + F5` для жесткой перезагрузки

#### Firefox:
- Нажмите `Ctrl + Shift + Delete`
- Выберите "Кеш"
- Нажмите "Удалить сейчас"
- Или `Ctrl + Shift + R` для жесткой перезагрузки

### 4. Проверьте в браузере

1. Откройте сайт
2. Откройте DevTools (F12)
3. Перейдите на вкладку Network
4. Обновите страницу (F5)
5. Найдите файл `index-BbWcR0BX.js`
6. Проверьте что он загружается с сервера (Status: 200, не из кеша)

### 5. Проверьте функционал

1. Войдите в аккаунт
2. Откройте Настройки
3. В секции "Аккаунт" должен быть пункт "Изменить username" с иконкой @
4. Нажмите на него
5. Введите новый username и пароль
6. Сохраните

## Что было добавлено

### Серверная часть:
- `PUT /api/settings/change-username` - endpoint для изменения username
- Валидация: 3-20 символов, только a-z, A-Z, 0-9, _
- Проверка уникальности username
- Подтверждение паролем

### Клиентская часть:
- Новый пункт в настройках "Изменить username"
- Форма с полями для нового username и пароля
- Валидация на клиенте
- Обновление UI после изменения

## Файлы изменены:
- `messenger/server/routes/settings.js`
- `deploy/routes/settings.js`
- `messenger/client/src/pages/Settings.jsx`
- `deploy/client/dist/assets/index-BbWcR0BX.js` (собранный)
