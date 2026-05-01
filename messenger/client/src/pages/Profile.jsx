import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  User, Camera, ImagePlus, FileText, Palette, Check,
  Pencil, X, Save, AtSign, Calendar, Shield, LogOut, Rss, Settings as SettingsIcon, Sticker, Sparkle,
  Users, MessageSquare, FileImage, Loader, ShieldAlert, UsersRound,
  Sparkles, Music, Upload, Bookmark,
} from 'lucide-react';
import ImageCropper from '../components/ImageCropper';
import ChangelogModal from '../components/ChangelogModal';
import CallManager from '../components/CallManager';
import NotificationBell from '../components/NotificationPanel';
import PostCard from '../components/PostCard';
import ProfileMusicPlayer from '../components/ProfileMusicPlayer';
import VerifiedBadge from '../components/VerifiedBadge';
import UserProfile from './UserProfile';
import { validateFileSize } from '../utils/imageCompressor';
import Admin from './Admin';
import Settings from './Settings';
import Feed from './Feed';
import Friends from './Friends';
import Messages from './Messages';
import Groups from './Groups';
import Channels from './Channels';
import Bookmarks from './Bookmarks';
import Stickers from './Stickers';
import Event from './Event';

const ACCENT_COLORS = [
  '#ffffff', '#a8a8a8', '#ff6b6b', '#ffa94d',
  '#ffd43b', '#69db7c', '#4dabf7', '#da77f2',
  '#f783ac', '#63e6be', '#74c0fc', '#e599f7'
];

function fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Profile({ user, onUpdate, onLogout }) {
  const { username } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Derive initial tab from URL path
  const TAB_ROUTES = ['feed', 'friends', 'messages', 'groups', 'channels', 'bookmarks', 'settings', 'admin', 'community'];
  const pathTab = TAB_ROUTES.find(t => location.pathname === `/${t}`);

  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState(pathTab || 'profile');
  const [profileTab, setProfileTab] = useState('info');
  const [communitySubTab, setCommunitySubTab] = useState('friends');
  // Support opening chat from UserProfile page via navigation state
  const [chatTarget, setChatTarget] = useState(location.state?.chatTarget || null);

  // Sync tab → URL
  const switchTab = useCallback((newTab) => {
    setTab(newTab);
    if (newTab === 'profile') {
      navigate('/profile', { replace: true });
    } else {
      navigate(`/${newTab}`, { replace: true });
    }
  }, [navigate]);

  // When location changes (e.g. navigate('/messages', { state: { chatTarget } }))
  // update tab and chatTarget accordingly — component may not remount
  useEffect(() => {
    const newPathTab = TAB_ROUTES.find(t => location.pathname === `/${t}`);
    if (newPathTab) {
      setTab(newPathTab);
    }
    if (location.state?.chatTarget) {
      setChatTarget(location.state.chatTarget);
    }
  }, [location.pathname, location.state]);

  // Unread counters for sidebar badges
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadGroups, setUnreadGroups] = useState(0);
  const [pendingFriends, setPendingFriends] = useState(0);

  // Load unread counts on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/messages/unread-count', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setUnreadMessages(d.count || 0)).catch(() => {});
    fetch('/api/friends/requests', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setPendingFriends(Array.isArray(d) ? d.length : 0)).catch(() => {});
  }, []);

  // Real-time unread updates
  useEffect(() => {
    const onMsg = (e) => {
      const msg = e.detail;
      if (msg.sender_id !== user.id && tab !== 'messages') {
        setUnreadMessages(n => n + 1);
      }
    };
    const onGroupMsg = (e) => {
      if (tab !== 'groups') setUnreadGroups(n => n + 1);
    };
    const onFriendReq = () => setPendingFriends(n => n + 1);
    const onFriendAcc = () => setPendingFriends(n => Math.max(0, n - 1));
    window.addEventListener('ws_new_message', onMsg);
    window.addEventListener('ws_group_message', onGroupMsg);
    window.addEventListener('ws_friend_request', onFriendReq);
    window.addEventListener('ws_friend_accepted', onFriendAcc);
    return () => {
      window.removeEventListener('ws_new_message', onMsg);
      window.removeEventListener('ws_group_message', onGroupMsg);
      window.removeEventListener('ws_friend_request', onFriendReq);
      window.removeEventListener('ws_friend_accepted', onFriendAcc);
    };
  }, [user.id, tab]);

  // Stats
  const [stats, setStats] = useState({ followers: 0, following: 0, postsCount: 0 });

  // My posts
  const [myPosts, setMyPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsLoaded, setPostsLoaded] = useState(false);

  const loadStats = useCallback(async () => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/users/${user.username}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setStats({ followers: data.followers, following: data.following, postsCount: data.postsCount });
    }
  }, [user.username]);

  const loadMyPosts = useCallback(async () => {
    if (postsLoaded) return;
    setPostsLoading(true);
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/users/${user.username}/posts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setMyPosts(data.posts || []);
      setPostsLoaded(true);
    }
    setPostsLoading(false);
  }, [user.username, postsLoaded]);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Real-time stats update
  useEffect(() => {
    const onFollow = () => loadStats();
    window.addEventListener('ws_notification', onFollow);
    return () => window.removeEventListener('ws_notification', onFollow);
  }, [loadStats]);

  useEffect(() => {
    if (profileTab === 'posts') loadMyPosts();
  }, [profileTab, loadMyPosts]);

  const handleLike = async (postId) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/feed/${postId}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setMyPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: data.likes, liked: data.liked } : p));
    }
  };

  const handleDelete = async (postId) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/feed/${postId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setMyPosts(prev => prev.filter(p => p.id !== postId));
      setStats(s => ({ ...s, postsCount: Math.max(0, s.postsCount - 1) }));
    }
  };

  const handleVote = async (postId, optionId) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/feed/poll/${optionId}/vote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setMyPosts(prev => prev.map(p => p.id === postId ? { ...p, poll: data } : p));
    }
  };
  const [form, setForm] = useState({
    display_name: user.display_name || '',
    bio: user.bio || '',
    avatar: user.avatar || null,
    banner: user.banner || null,
    accent_color: user.accent_color || '#ffffff',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const avatarRef = useRef();
  const bannerRef = useRef();
  const musicRef = useRef();

  // VIP state
  const [hasVIP, setHasVIP] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [vipForm, setVipForm] = useState({ animated_name: user.animated_name || '', profile_music: user.profile_music || null });
  const [vipSaving, setVipSaving] = useState(false);
  const [vipMsg, setVipMsg] = useState(null);
  const [showVipPanel, setShowVipPanel] = useState(false);

  // Gradient builder state
  const [gradColors, setGradColors] = useState(() => {
    // Parse existing gradient or defaults
    if (user.animated_name) {
      const matches = user.animated_name.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g);
      if (matches && matches.length >= 2) return matches.slice(0, 3);
    }
    return ['#ff0080', '#7928ca', '#ff0080'];
  });
  const [gradAngle, setGradAngle] = useState(() => {
    if (user.animated_name) {
      const m = user.animated_name.match(/(\d+)deg/);
      if (m) return parseInt(m[1]);
    }
    return 90;
  });
  const [gradEnabled, setGradEnabled] = useState(!!user.animated_name);

  // Cropper state
  const [cropSrc, setCropSrc] = useState(null);
  const [cropType, setCropType] = useState(null); // 'avatar' | 'banner'

  const accent = editing ? form.accent_color : (user.accent_color || '#ffffff');

  // Load VIP permissions + verified status from server
  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/roles/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (!d || d.error) return;
        setHasVIP(d.permissions?.includes('animated_name') || d.permissions?.includes('profile_music'));
        const adminRoles = ['admin', 'owner'];
        const hasAdminRole = Array.isArray(d.roles) && d.roles.some(r => adminRoles.includes(r));
        setIsAdmin(hasAdminRole);
      })
      .catch(() => {});

    // Reload verified + animated_name from server (not stored in localStorage)
    fetch('/api/profile/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) onUpdate({ ...user, verified: data.verified, animated_name: data.animated_name, profile_music: data.profile_music });
      })
      .catch(() => {});
  }, []);

  // Sync gradient builder → vipForm
  useEffect(() => {
    if (!gradEnabled) {
      setVipForm(f => ({ ...f, animated_name: '' }));
      return;
    }
    const grad = `linear-gradient(${gradAngle}deg, ${gradColors.join(', ')})`;
    setVipForm(f => ({ ...f, animated_name: grad }));
  }, [gradColors, gradAngle, gradEnabled]);

  const handleAvatar = async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!validateFileSize(file)) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => { setCropSrc(ev.target.result); setCropType('avatar'); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleBanner = async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!validateFileSize(file)) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => { setCropSrc(ev.target.result); setCropType('banner'); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropDone = (result) => {
    if (cropType === 'avatar') setForm(f => ({ ...f, avatar: result }));
    if (cropType === 'banner') setForm(f => ({ ...f, banner: result }));
    setCropSrc(null);
    setCropType(null);
  };

  const handleCropCancel = () => {
    setCropSrc(null);
    setCropType(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/profile/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        onUpdate(data);
        setEditing(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm({
      display_name: user.display_name || '',
      bio: user.bio || '',
      avatar: user.avatar || null,
      banner: user.banner || null,
      accent_color: user.accent_color || '#ffffff',
    });
    setEditing(false);
  };

  const handleMusicUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setVipMsg({ ok: false, text: 'Только аудио файлы (MP3, OGG, WAV)' });
      setTimeout(() => setVipMsg(null), 3000);
      return;
    }
    const MAX = 15 * 1024 * 1024;
    if (file.size > MAX) {
      setVipMsg({ ok: false, text: 'Файл слишком большой. Максимум 15MB' });
      setTimeout(() => setVipMsg(null), 3000);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setVipForm(f => ({ ...f, profile_music: ev.target.result }));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleVipSave = async () => {
    setVipSaving(true);
    try {
      const token = localStorage.getItem('token');

      // Save gradient (small, always send)
      const gradRes = await fetch('/api/profile/vip', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ animated_name: vipForm.animated_name }),
      });
      const gradData = await gradRes.json();
      if (!gradRes.ok) {
        setVipMsg({ ok: false, text: gradData.error || 'Ошибка сохранения градиента' });
        setVipSaving(false);
        setTimeout(() => setVipMsg(null), 3500);
        return;
      }

      // Save music separately only if a new file was selected
      let musicSaved = false;
      if (vipForm.profile_music && vipForm.profile_music.startsWith('data:')) {
        const musicRes = await fetch('/api/profile/vip', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ profile_music: vipForm.profile_music }),
        });
        const musicData = await musicRes.json();
        if (!musicRes.ok) {
          setVipMsg({ ok: false, text: musicData.error || 'Ошибка сохранения музыки' });
          setVipSaving(false);
          setTimeout(() => setVipMsg(null), 3500);
          return;
        }
        musicSaved = true;
      } else if (vipForm.profile_music === '') {
        // Explicitly remove music
        await fetch('/api/profile/vip', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ profile_music: null }),
        });
      }

      setVipMsg({ ok: true, text: 'VIP настройки сохранены' });
      setShowVipPanel(false);
      onUpdate({
        ...user,
        animated_name: gradData.animated_name,
        profile_music: musicSaved ? vipForm.profile_music : (vipForm.profile_music === '' ? null : user.profile_music),
      });
    } catch (e) {
      setVipMsg({ ok: false, text: 'Ошибка сети: ' + (e.message || 'неизвестная ошибка') });
    } finally {
      setVipSaving(false);
      setTimeout(() => setVipMsg(null), 4000);
    }
  };

  const displayAvatar = editing ? form.avatar : user.avatar;
  const displayBanner = editing ? form.banner : user.banner;
  const displayName = user.display_name || user.username;

  // Viewing another user's profile — render inside full layout
  if (username && username !== user.username) {
    return (
      <div className="profile-page">
        <aside className="profile-sidebar">
          <div className="sidebar-logo" onClick={() => navigate('/profile')} style={{ cursor: 'pointer' }}>
            <div className="sidebar-logo-icon" style={{ borderColor: user.accent_color || '#fff' }}>
              {user.avatar ? <img src={user.avatar} alt="avatar" /> : <User size={18} />}
            </div>
            <span>RLC</span>
          </div>
          <nav className="sidebar-nav">
            <button className="sidebar-item" onClick={() => navigate('/profile')} style={{ color: user.accent_color || '#fff' }}>
              <User size={17} /> Профиль
            </button>
            <button className="sidebar-item" onClick={() => navigate('/feed')}>
              <Rss size={17} /> Лента
            </button>
            <button className="sidebar-item" onClick={() => navigate('/friends')}>
              <Users size={17} /> Друзья
            </button>
            <button className="sidebar-item" onClick={() => navigate('/messages')}>
              <MessageSquare size={17} /> Сообщения
            </button>
            <button className="sidebar-item" onClick={() => navigate('/groups')}>
              <UsersRound size={17} /> Группы
            </button>
            <button className="sidebar-item" onClick={() => navigate('/settings')}>
              <SettingsIcon size={17} /> Настройки
            </button>
          </nav>
          <div className="sidebar-footer">
            <a href="/terms" className="sidebar-footer-link">Условия использования</a>
            <a href="/privacy" className="sidebar-footer-link">Конфиденциальность</a>
            <a href="/cookies" className="sidebar-footer-link">Политика Cookies</a>
            <a href="https://discord.gg/yWMf2HfRbH" target="_blank" rel="noopener noreferrer" className="sidebar-footer-link sidebar-discord-link">Discord сервер</a>
            <span className="sidebar-footer-copy">© 2026 RLC</span>
          </div>
          <button className="sidebar-logout" onClick={onLogout}>
            <LogOut size={15} /> Выйти
          </button>
        </aside>
        <main className="profile-main">
          <UserProfile
            username={username}
            currentUser={user}
            onBack={() => navigate(-1)}
            onOpenChat={(targetUser) => {
              navigate('/messages', { state: { chatTarget: targetUser } });
            }}
          />
        </main>
        <CallManager currentUser={user} />
      </div>
    );
  }

  return (
    <div className="profile-page">
      {/* Sidebar */}
      <aside className="profile-sidebar">
        <div className="sidebar-logo" onClick={() => setShowChangelog(true)} style={{ cursor: 'pointer' }}>
          <div className="sidebar-logo-icon" style={{ borderColor: accent }}>
            {user.avatar ? <img src={user.avatar} alt="avatar" /> : <User size={18} />}
          </div>
          <span>RLC</span>
        </div>

        <nav className="sidebar-nav">
          <button data-nav="profile" className={`sidebar-item ${tab === 'profile' ? 'active' : ''}`}
            onClick={() => switchTab('profile')} style={tab === 'profile' ? { color: accent } : {}}>
            <User size={17} /> Профиль
          </button>
          <button data-nav="feed" className={`sidebar-item ${tab === 'feed' ? 'active' : ''}`}
            onClick={() => switchTab('feed')} style={tab === 'feed' ? { color: accent } : {}}>
            <Rss size={17} /> Лента
          </button>
          <button data-nav="friends" className={`sidebar-item ${tab === 'friends' ? 'active' : ''}`}
            onClick={() => { switchTab('friends'); setPendingFriends(0); }} style={tab === 'friends' ? { color: accent } : {}}>
            <Users size={17} /> Друзья
            {pendingFriends > 0 && <span className="sidebar-badge">{pendingFriends}</span>}
          </button>
          {/* Mobile-only: "Сообщество" merges friends+groups+channels */}
          <button data-nav="chat-mobile" className={`sidebar-item sidebar-item--mobile-only ${['friends','groups','channels','bookmarks','community'].includes(tab) ? 'active' : ''}`}
            onClick={() => { switchTab('community'); setPendingFriends(0); }}
            style={['friends','groups','channels','bookmarks','community'].includes(tab) ? { color: accent } : {}}>
            <Users size={17} /> Сообщество
            {(pendingFriends + unreadGroups) > 0 && <span className="sidebar-badge">{pendingFriends + unreadGroups}</span>}
          </button>
          <button data-nav="messages" className={`sidebar-item ${tab === 'messages' ? 'active' : ''}`}
            onClick={() => { switchTab('messages'); setUnreadMessages(0); }} style={tab === 'messages' ? { color: accent } : {}}>
            <MessageSquare size={17} /> Сообщения
            {unreadMessages > 0 && <span className="sidebar-badge">{unreadMessages}</span>}
          </button>
          <button data-nav="groups" className={`sidebar-item ${tab === 'groups' ? 'active' : ''}`}
            onClick={() => { switchTab('groups'); setUnreadGroups(0); }} style={tab === 'groups' ? { color: accent } : {}}>
            <UsersRound size={17} /> Группы
            {unreadGroups > 0 && <span className="sidebar-badge">{unreadGroups}</span>}
          </button>
          <button data-nav="channels" className={`sidebar-item ${tab === 'channels' ? 'active' : ''}`}
            onClick={() => switchTab('channels')} style={tab === 'channels' ? { color: accent } : {}}>
            <Rss size={17} /> Каналы
          </button>
          <button data-nav="bookmarks" className={`sidebar-item ${tab === 'bookmarks' ? 'active' : ''}`}
            onClick={() => switchTab('bookmarks')} style={tab === 'bookmarks' ? { color: accent } : {}}>
            <Bookmark size={17} /> Закладки
          </button>
          <button data-nav="stickers" className={`sidebar-item ${tab === 'stickers' ? 'active' : ''}`}
            onClick={() => switchTab('stickers')} style={tab === 'stickers' ? { color: accent } : {}}>
            <Sticker size={17} /> Стикеры
          </button>
          <button data-nav="settings" className={`sidebar-item ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => switchTab('settings')} style={tab === 'settings' ? { color: accent } : {}}>
            <SettingsIcon size={17} /> Настройки
          </button>
          {(user.email === 'yamekel0@gmail.com' || isAdmin) && (
            <button data-nav="admin" className={`sidebar-item ${tab === 'admin' ? 'active' : ''}`}
              onClick={() => switchTab('admin')} style={tab === 'admin' ? { color: '#ff6b6b' } : { color: '#ff6b6b', opacity: 0.6 }}>
              <ShieldAlert size={17} /> Админ-панель
            </button>
          )}
          <button data-nav="event" className={`sidebar-item sidebar-item--event ${tab === 'event' ? 'active' : ''}`}
            onClick={() => switchTab('event')}>
            <Sparkle size={17} /> Ивент
          </button>
        </nav>

        <div className="sidebar-footer">
          <a href="/terms" className="sidebar-footer-link">Условия использования</a>
          <a href="/privacy" className="sidebar-footer-link">Конфиденциальность</a>
          <a href="/cookies" className="sidebar-footer-link">Политика Cookies</a>
          <a href="https://discord.gg/yWMf2HfRbH" target="_blank" rel="noopener noreferrer" className="sidebar-footer-link sidebar-discord-link">Discord сервер</a>
          <span className="sidebar-footer-copy">© 2026 RLC</span>
        </div>
        <button className="sidebar-logout" onClick={onLogout}>
          <LogOut size={15} /> Выйти
        </button>
      </aside>

      {/* Main */}
      <main className="profile-main">

        {tab === 'profile' && (
          <div className="profile-content">

            {/* Hero: banner + avatar */}
            <div className="profile-hero">
              <div className="profile-banner"
                style={{ backgroundImage: displayBanner ? `url(${displayBanner})` : undefined }}>
                {!displayBanner && <div className="banner-empty" />}
                {editing && (
                  <button className="banner-edit-btn" onClick={() => bannerRef.current.click()}>
                    <ImagePlus size={15} /> Изменить баннер
                  </button>
                )}
                <input ref={bannerRef} type="file" accept="image/*" hidden onChange={handleBanner} />
              </div>

              <div className="profile-avatar-row">
                <div className="profile-avatar"
                  style={{ borderColor: accent, backgroundImage: displayAvatar ? `url(${displayAvatar})` : undefined }}
                  onClick={editing ? () => avatarRef.current.click() : undefined}>
                  {!displayAvatar && <User size={36} />}
                  {editing && <div className="avatar-edit-overlay"><Camera size={18} /></div>}
                </div>
                <input ref={avatarRef} type="file" accept="image/*" hidden onChange={handleAvatar} />

                <div className="profile-title-row">
                  <div>
                    <span className="verified-name-row" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <h1 
                        className={`profile-name${user.animated_name ? ' gradient-name' : ''}`}
                        style={user.animated_name 
                          ? { background: user.animated_name, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', color: 'transparent' }
                          : { color: accent }
                        }
                      >
                        {displayName}
                      </h1>
                      {user.verified ? <VerifiedBadge size={20} /> : null}
                    </span>
                    <p className="profile-username">@{user.username}</p>
                  </div>
                  {!editing
                    ? <button className="btn-edit-profile" onClick={() => setEditing(true)}>
                        <Pencil size={14} /> Редактировать
                      </button>
                    : <div className="edit-actions">
                        <button className="btn-cancel-edit" onClick={handleCancel}><X size={15} /></button>
                        <button className="btn-save-edit" onClick={handleSave} disabled={saving}
                          style={{ borderColor: accent, color: accent }}>
                          {saving ? '...' : <><Save size={14} /> Сохранить</>}
                        </button>
                      </div>
                  }
                </div>
              </div>

              {/* Stats bar */}
              {!editing && (
                <div className="profile-stats-bar">
                  <div className="profile-stat">
                    <span className="profile-stat-num" style={{ color: accent }}>{stats.postsCount}</span>
                    <span className="profile-stat-label">постов</span>
                  </div>
                  <div className="profile-stat-divider" />
                  <div className="profile-stat">
                    <span className="profile-stat-num" style={{ color: accent }}>{stats.followers}</span>
                    <span className="profile-stat-label">подписчиков</span>
                  </div>
                  <div className="profile-stat-divider" />
                  <div className="profile-stat">
                    <span className="profile-stat-num" style={{ color: accent }}>{stats.following}</span>
                    <span className="profile-stat-label">подписок</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
