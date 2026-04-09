import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CreatePost from '../components/CreatePost';
import PostCard from '../components/PostCard';
import { useWebSocket } from '../hooks/useWebSocket';
import { Loader } from 'lucide-react';

const TABS = [
  { key: 'all',      label: 'Все посты' },
  { key: 'friends',  label: 'Друзья' },
  { key: 'channels', label: 'Каналы' },
  { key: 'people',   label: 'Люди' },
];

const EMPTY_MESSAGES = {
  all:      { title: 'Пока нет постов',                    sub: 'Будьте первым — напишите что-нибудь' },
  friends:  { title: 'У ваших друзей пока нет постов',     sub: '' },
  channels: { title: 'Нет постов в ваших каналах',         sub: '' },
  people:   { title: 'Нет постов от других пользователей', sub: '' },
};

export default function Feed({ user }) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('all');
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initial, setInitial] = useState(true);
  const [error, setError] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [friendIds, setFriendIds] = useState(new Set());
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  const loadPosts = useCallback(async (mode, p = 1, replace = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/feed?mode=${mode}&page=${p}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
      setPosts(prev => replace ? (data.posts || []) : [...prev, ...(data.posts || [])]);
      setHasMore(data.hasMore ?? false);
      setPage(p);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setInitial(false);
    }
  }, []);

  useEffect(() => {
    loadPosts('all', 1, true);
    fetch('/api/users/online', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(ids => setOnlineUsers(new Set(ids))).catch(() => {});
    fetch('/api/friends', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(list => setFriendIds(new Set((list || []).map(f => f.id)))).catch(() => {});
  }, [loadPosts]);

  const handleTabChange = (key) => {
    setViewMode(key);
    setPosts([]);
    setPage(1);
    setHasMore(true);
    setInitial(true);
    loadPosts(key, 1, true);
  };

  useWebSocket({
    new_post: (post) => {
      const mode = viewModeRef.current;
      if (mode === 'channels') return; // channel posts come via channel_post events
      if (post.user_id === user.id) return; // already added optimistically
      if (mode === 'friends' && !friendIds.has(post.user_id)) return;
      if (mode === 'people' && (friendIds.has(post.user_id) || post.user_id === user.id)) return;
      setPosts(prev => prev.find(p => p.id === post.id) ? prev : [post, ...prev]);
    },
    delete_post: ({ postId }) => {
      setPosts(prev => prev.filter(p => p.id !== postId));
    },
    like_update: ({ postId, liked, count, actorId }) => {
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        if (actorId === user.id) return { ...p, liked, likes: count };
        return { ...p, likes: count };
      }));
    },
    new_comment: ({ postId, comment }) => {
      if (comment.user_id === user.id) return;
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, commentsCount: (p.commentsCount || 0) + 1 } : p
      ));
      // ws_comment is auto-dispatched by useWebSocket hook
    },
    poll_update: ({ postId, poll }) => {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, poll } : p));
    },
    notification: (notif) => {
      window.dispatchEvent(new CustomEvent('ws_notification_bump', { detail: notif }));
    },
    // friend_request, friend_accepted, new_message, user_online, user_offline
    // are auto-dispatched as ws_* DOM events by the useWebSocket hook
    user_online: ({ userId }) => {
      setOnlineUsers(prev => new Set([...prev, userId]));
    },
    user_offline: ({ userId }) => {
      setOnlineUsers(prev => { const s = new Set(prev); s.delete(userId); return s; });
    },
  });

  const handlePost = (newPost) => {
    setPosts(prev => prev.find(p => p.id === newPost.id) ? prev : [newPost, ...prev]);
  };

  const handleLike = async (postId) => {
    const res = await fetch(`/api/feed/${postId}/like`, {
      method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, liked: data.liked, likes: data.count } : p));
  };

  const handleDelete = async (postId) => {
    const res = await fetch(`/api/feed/${postId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (res.ok) setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const handleVote = async (postId, optionId) => {
    const res = await fetch(`/api/feed/poll/${optionId}/vote`, {
      method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok) return;
    const updatedPoll = await res.json();
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, poll: updatedPoll } : p));
  };

  return (
    <div className="feed-page">
      <div className="feed-header">
        <span className="feed-title">Лента</span>
        <div className="feed-tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`feed-tab${viewMode === tab.key ? ' feed-tab--active' : ''}`}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="feed-content">
        {viewMode === 'all' && <CreatePost user={user} onPost={handlePost} />}

        {initial && loading && (
          <div className="feed-loader"><Loader size={20} className="spin" /></div>
        )}

        {error && (
          <div className="feed-empty">
            <p>Ошибка загрузки</p>
            <span>{error}</span>
            <button className="feed-load-more" style={{ marginTop: '1rem' }} onClick={() => loadPosts(viewMode, 1, true)}>
              Попробовать снова
            </button>
          </div>
        )}

        <div className="feed-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={{ ...post, isOnline: onlineUsers.has(post.user_id) }}
              currentUserId={user.id}
              onLike={handleLike}
              onDelete={handleDelete}
              onVote={handleVote}
              onUserClick={(username) => {
                if (username !== user.username) navigate(`/profile/${username}`);
              }}
            />
          ))}
        </div>

        {!initial && !error && posts.length === 0 && (
          <div className="feed-empty">
            <p>{EMPTY_MESSAGES[viewMode].title}</p>
            {EMPTY_MESSAGES[viewMode].sub && <span>{EMPTY_MESSAGES[viewMode].sub}</span>}
          </div>
        )}

        {hasMore && !loading && !error && (
          <button className="feed-load-more" onClick={() => loadPosts(viewMode, page + 1)}>
            Загрузить ещё
          </button>
        )}

        {loading && !initial && (
          <div className="feed-loader"><Loader size={18} className="spin" /></div>
        )}
      </div>
    </div>
  );
}
