import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Globe, Lock, Heart, Eye, ArrowLeft } from 'lucide-react';

function timeAgo(str) {
  const diff = (Date.now() - new Date(str + 'Z')) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин.`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч.`;
  return `${Math.floor(diff / 86400)} дн.`;
}

function SpoilerImage({ src, spoiler }) {
  const [revealed, setRevealed] = useState(false);
  if (!spoiler || revealed) return <img src={src} alt="media" className="ch-post-media" />;
  return (
    <div className="ch-spoiler-wrap" onClick={() => setRevealed(true)}>
      <img src={src} alt="media" className="ch-post-media ch-spoiler-img" />
      <div className="ch-spoiler-overlay"><span>🔞 Нажмите чтобы показать</span></div>
    </div>
  );
}

export default function ChannelPreview() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if user is logged in
  const isLoggedIn = !!localStorage.getItem('token');

  useEffect(() => {
    fetch(`/api/channels/public/${username}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) return (
    <div className="cprev-wrap">
      <div className="cprev-loading">Загрузка...</div>
    </div>
  );

  if (error) return (
    <div className="cprev-wrap">
      <div className="cprev-error">
        <p>Канал не найден</p>
        <span>@{username} не существует или является приватным</span>
        <button className="cprev-open-btn" onClick={() => navigate('/')}>На главную</button>
      </div>
    </div>
  );

  const { channel, posts } = data;

  return (
    <div className="cprev-wrap">
      <div className="cprev-page">
        {/* Header */}
        <div className="cprev-header">
          <div className="cprev-avatar">
            {channel.avatar
              ? <img src={channel.avatar} alt={channel.name} />
              : <span>{(channel.name || '?')[0].toUpperCase()}</span>
            }
          </div>
          <h1 className="cprev-name">{channel.name}</h1>
          <p className="cprev-username">@{channel.username}</p>
          {channel.description && <p className="cprev-desc">{channel.description}</p>}
          <div className="cprev-meta">
            <span><Users size={14} /> {channel.subscribers_count} подписчиков</span>
            <span>{channel.type === 'public' ? <><Globe size={14} /> Публичный</> : <><Lock size={14} /> Приватный</>}</span>
          </div>

          {/* CTA button */}
          {isLoggedIn
            ? <button className="cprev-open-btn" onClick={() => navigate('/channels')}>
                Открыть в RLC
              </button>
            : <div className="cprev-cta-group">
                <button className="cprev-open-btn" onClick={() => navigate('/register')}>
                  Зарегистрироваться
                </button>
                <button className="cprev-login-btn" onClick={() => navigate('/login')}>
                  Войти
                </button>
              </div>
          }
        </div>

        {/* Posts */}
        <div className="cprev-posts">
          <div className="cprev-posts-title">Последние посты</div>
          {posts.length === 0 && (
            <div className="cprev-empty">Постов пока нет</div>
          )}
          {posts.map(post => (
            <div key={post.id} className="cprev-post">
              <div className="cprev-post-author">
                <div className="cprev-post-avatar">
                  {channel.avatar
                    ? <img src={channel.avatar} alt={channel.name} />
                    : <span>{(channel.name || '?')[0].toUpperCase()}</span>
                  }
                </div>
                <div>
                  <span className="cprev-post-name">{channel.name}</span>
                  <span className="cprev-post-time"> · {timeAgo(post.created_at)}</span>
                </div>
              </div>
              {post.content && <p className="cprev-post-content">{post.content}</p>}
              {post.media && (post.media_type === 'image' || post.media_type === 'gif') && (
                <SpoilerImage src={post.media} spoiler={post.spoiler} />
              )}
              {post.media && post.media_type === 'video' && (
                <video src={post.media} controls className="ch-post-media" />
              )}
              <div className="cprev-post-footer">
                <span><Heart size={13} /> {post.reactions_count || 0}</span>
                <span><Eye size={13} /> {post.views || 0}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="cprev-footer">
          <span>© 2026 RLC</span>
          <a href="/terms">Условия</a>
          <a href="/privacy">Конфиденциальность</a>
        </div>
      </div>
    </div>
  );
}
