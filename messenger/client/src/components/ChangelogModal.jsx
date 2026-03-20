import React from 'react';
import { X, Sparkles, Zap, Wrench, Star } from 'lucide-react';

const CHANGELOG = [
  {
    version: 'v0.3.0',
    date: '20 марта 2026',
    icon: <Sparkles size={13} />,
    items: [
      'Кроппер изображений — выбирайте нужную зону для аватарки и баннера',
      'Сетка карточек на странице профиля — информация теперь удобно разложена по блокам',
      'Цвет акцента применяется к имени, рамке аватарки и элементам сайдбара',
      'Улучшена адаптация под широкие экраны',
    ],
  },
  {
    version: 'v0.2.0',
    date: '18 марта 2026',
    icon: <Star size={13} />,
    items: [
      'Полноценная страница профиля с сайдбаром и вкладками',
      'Редактирование профиля прямо на странице без перехода',
      'Вкладка «Настройки» с управлением аккаунтом',
      'Toast-уведомление после сохранения профиля',
      'Дата регистрации отображается в профиле',
    ],
  },
  {
    version: 'v0.1.1',
    date: '15 марта 2026',
    icon: <Zap size={13} />,
    items: [
      'Онбординг после первой регистрации — 3 шага настройки профиля',
      'Загрузка аватарки и баннера',
      'Выбор цвета акцента из палитры или своего через color picker',
      'Отображаемое имя и bio',
      'После онбординга автоматический переход на профиль',
    ],
  },
  {
    version: 'v0.1.0',
    date: '12 марта 2026',
    icon: <Wrench size={13} />,
    items: [
      'Регистрация и вход с валидацией полей',
      'Хеширование паролей через bcrypt',
      'JWT-авторизация с хранением токена',
      'База данных SQLite — автоматически создаётся при запуске',
      'Чёрно-белый дизайн с иконками lucide-react',
      'Показ/скрытие пароля в форме входа',
    ],
  },
];

export default function ChangelogModal({ onClose }) {
  return (
    <div className="changelog-overlay" onClick={onClose}>
      <div className="changelog-modal" onClick={e => e.stopPropagation()}>
        <div className="changelog-header">
          <h2>Что нового</h2>
          <button className="changelog-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="changelog-body">
          {CHANGELOG.map((release, i) => (
            <div key={release.version} className="changelog-release">
              <div className="changelog-release-header">
                <span className="changelog-badge">{release.icon}{release.version}</span>
                <span className="changelog-date">{release.date}</span>
              </div>
              <ul className="changelog-list">
                {release.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
              {i < CHANGELOG.length - 1 && <div className="changelog-divider" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
