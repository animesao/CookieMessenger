import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X, Eye, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

function fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function timeAgo(str) {
  const diff = (Date.now() - new Date(str + 'Z')) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин.`;
  return `${Math.floor(diff / 3600)} ч.`;
}

// ── Story Viewer ──────────────────────────────────────────────────────────────
function StoryViewer({ groups, startGroupIndex, currentUser, onClose, onDelete }) {
  const [groupIdx, setGroupIdx] = useState(startGroupIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState([]);
  const intervalRef = useRef(null);
  const token = localStorage.getItem('token');

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];
  const isOwn = story?.user_id === currentUser.id;
  const DURATION = (story?.duration || 5) * 1000;

  const markViewed = useCallback(async (id) => {
    await fetch(`/api/stories/${id}/view`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
  }, [token]);

  useEffect(() => {
    if (story) markViewed(story.id);
  }, [story?.id]);

  const goNext = useCallback(() => {
    setProgress(0);
    if (storyIdx < group.stories.length - 1) {
      setStoryIdx(i => i + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(i => i + 1);
      setStoryIdx(0);
    } else {
      onClose();
    }
  }, [storyIdx, groupIdx, group, groups, onClose]);

  const goPrev = useCallback(() => {
    setProgress(0);
    if (storyIdx > 0) {
      setStoryIdx(i => i - 1);
    } else if (groupIdx > 0) {
      setGroupIdx(i => i - 1);
      setStoryIdx(0);
    }
  }, [storyIdx, groupIdx]);

  useEffect(() => {
    if (paused) { clearInterval(intervalRef.current); return; }
    const step = 50;
    intervalRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { goNext(); return 0; }
        return p + (step / DURATION) * 100;
      });
    }, step);
    return () => clearInterval(intervalRef.current);
  }, [paused, goNext, DURATION, story?.id]);

  const loadViewers = async () => {
    const res = await fetch(`/api/stories/${story.id}/viewers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setViewers(await res.json());
    setShowViewers(true);
  };

  if (!group || !story) return null;

  return (
    <div className="story-viewer" onClick={e => e.stopPropagation()}>
      {/* Background */}
      <div className="story-viewer-bg" onClick={onClose} />

      <div className="story-viewer-container">
        {/* Progress bars */}
        <div className="story-progress-bars">
          {group.stories.map((_, i) => (
            <div key={i} className="story-progress-track">
              <div className="story-progress-fill" style={{
                width: i < storyIdx ? '100%' : i === storyIdx ? `${progress}%` : '0%'
              }} />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="story-header">
          <div className="story-header-left">
            <div className="story-avatar" style={{
              backgroundImage: group.avatar ? `url(${group.avatar})` : 'none',
              borderColor: group.accent_color || '#fff',
            }}>
              {!group.avatar && (group.display_name || group.username)[0].toUpperCase()}
            </div>
            <div>
              <span className="story-username">{group.display_name || group.username}</span>
              <span className="story-time">{timeAgo(story.created_at)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="story-btn" onClick={() => setPaused(v => !v)}>
              {paused ? '▶' : '⏸'}
            </button>
            {isOwn && (
              <>
                <button className="story-btn" onClick={loadViewers} title="Просмотры">
                  <Eye size={16} />
                </button>
                <button className="story-btn story-btn-danger" onClick={async () => {
                  await onDelete(story.id);
                  goNext();
                }} title="Удалить">
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <button className="story-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {/* Media */}
        <div className="story-media-wrap">
          {story.media_type === 'video'
            ? <video src={story.media} className="story-media" autoPlay muted loop />
            : <img src={story.media} alt="story" className="story-media" />
          }
          {story.text && <div className="story-text">{story.text}</div>}
        </div>

        {/* Nav zones */}
        <button className="story-nav story-nav-prev" onClick={goPrev}><ChevronLeft size={28} /></button>
        <button className="story-nav story-nav-next" onClick={goNext}><ChevronRight size={28} /></button>

        {/* Group nav dots */}
        {groups.length > 1 && (
          <div className="story-group-dots">
            {groups.map((_, i) => (
              <div key={i} className={`story-group-dot ${i === groupIdx ? 'active' : ''}`} />
            ))}
          </div>
        )}
      </div>

      {/* Viewers panel */}
      {showViewers && (
        <div className="story-viewers-panel" onClick={e => e.stopPropagation()}>
          <div className="story-viewers-header">
            <span><Eye size={14} /> {viewers.length} просмотров</span>
            <button onClick={() => setShowViewers(false)}><X size={16} /></button>
          </div>
          {viewers.map(v => (
            <div key={v.id} className="story-viewer-row">
              <div className="story-viewer-avatar" style={{ backgroundImage: v.avatar ? `url(${v.avatar})` : 'none', borderColor: v.accent_color || '#fff' }}>
                {!v.avatar && (v.display_name || v.username)[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#ccc' }}>{v.display_name || v.username}</div>
                <div style={{ fontSize: '0.72rem', color: '#555' }}>{timeAgo(v.viewed_at)}</div>
              </div>
            </div>
          ))}
          {viewers.length === 0 && <div style={{ padding: '1rem', color: '#444', fontSize: '0.85rem', textAlign: 'center' }}>Никто ещё не смотрел</div>}
        </div>
      )}
    </div>
  );
}

// ── Stories Bar ───────────────────────────────────────────────────────────────
export default function StoriesBar({ user }) {
  const [groups, setGroups] = useState([]);
  const [viewerOpen, setViewerOpen] = useState(null); // groupIndex
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();
  const token = localStorage.getItem('token');

  const load = useCallback(async () => {
    const res = await fetch('/api/stories', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setGroups(await res.json());
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Максимум 5MB'); return; }
    setUploading(true);
    const media = await fileToBase64(file);
    const media_type = file.type.startsWith('video/') ? 'video' : 'image';
    await fetch('/api/stories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ media, media_type }),
    });
    await load();
    setUploading(false);
    e.target.value = '';
  };

  const handleDelete = async (storyId) => {
    await fetch(`/api/stories/${storyId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    await load();
  };

  const myGroup = groups.find(g => g.user_id === user.id);
  const otherGroups = groups.filter(g => g.user_id !== user.id);
  const accent = user.accent_color || '#fff';

  return (
    <>
      <div className="stories-bar">
        {/* Add / view my story button */}
        <div className="story-add-wrap">
          <button className="story-add-btn" onClick={() => {
            if (myGroup) setViewerOpen(groups.indexOf(myGroup));
            else fileRef.current.click();
          }} disabled={uploading} style={{ borderColor: myGroup ? accent : '#333' }}>
            {myGroup
              ? <img src={myGroup.avatar || user.avatar} alt="my" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              : (user.avatar ? <img src={user.avatar} alt="me" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : <span style={{ fontSize: '1.4rem', color: '#555' }}>{(user.display_name || user.username)[0].toUpperCase()}</span>)
            }
            <div className="story-add-plus" style={{ background: accent, color: '#000' }}
              onClick={e => { e.stopPropagation(); fileRef.current.click(); }}>
              {uploading ? '...' : <Plus size={10} />}
            </div>
          </button>
          <span className="story-label">Моя история</span>
          <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={handleUpload} />
        </div>

        {/* Friends' stories */}
        {otherGroups.map((g) => {
          const idx = groups.indexOf(g);
          return (
            <div key={g.user_id} className="story-item-wrap" onClick={() => setViewerOpen(idx)}>
              <div className={`story-ring ${g.has_unseen ? 'story-ring-unseen' : 'story-ring-seen'}`}
                style={g.has_unseen ? { borderColor: accent } : {}}>
                <div className="story-thumb" style={{
                  backgroundImage: g.avatar ? `url(${g.avatar})` : 'none',
                  backgroundColor: g.avatar ? 'transparent' : '#1a1a1a',
                }}>
                  {!g.avatar && (g.display_name || g.username)[0].toUpperCase()}
                </div>
              </div>
              <span className="story-label">{g.display_name || g.username}</span>
            </div>
          );
        })}
      </div>

      {viewerOpen !== null && (
        <StoryViewer
          groups={groups}
          startGroupIndex={viewerOpen}
          currentUser={user}
          onClose={() => { setViewerOpen(null); load(); }}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
