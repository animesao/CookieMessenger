import React from 'react';
import { X, Sparkles } from 'lucide-react';

const CHANGELOG = [
  {
    version: 'v1.0.0',
    date: '3 апреля 2026',
    icon: <Sparkles size={13} />,
    items: [
      'Регистрация и вход с JWT-авторизацией и bcrypt',
      'Профиль: аватар, баннер, акцент-цвет, отображаемое имя, bio',
      'Кроппер изображений для аватарки (1:1) и баннера (16:5)',
      'Лента: посты с текстом, фото, видео и опросами',
      'Лайки, комментарии и @упоминания в постах',
      'Личные сообщения с медиа, эмодзи, стикерами и GIF',
      'Друзья: заявки, принять / отклонить / удалить',
      'Подписки на пользователей и публичные профили',
      'WebRTC звонки: аудио, видео, демонстрация экрана',
      'Уведомления в реальном времени через WebSocket',
      'Онлайн-статус пользователей',
      'Настройки: смена email, пароля, приватность, уведомления',
      'Админ-панель: статистика, управление пользователями, роли, рассылка',
      'Система ролей: Пользователь, VIP, Модератор, Администратор, Владелец',
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
