import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users, Volume2, Plus, X } from 'lucide-react';
import { useVoiceChat } from '../hooks/useVoiceChat';
import VerifiedBadge from './VerifiedBadge';

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      ...opts.headers,
    },
  });
}

function ParticipantAvatar({ user, isSpeaking, size = 48 }) {
  const accent = user?.accent_color || '#fff';
  const name = user?.display_name || user?.username || '?';
  
  return (
    <div 
      className={`vc-participant ${isSpeaking ? 'vc-participant-speaking' : ''}`}
      style={{ 
        '--accent': accent,
        width: size, 
        height: size,
        borderColor: accent,
      }}
    >
      {user?.avatar ? (
        <img src={user.avatar} alt={name} className="vc-participant-img" />
      ) : (
        <span className="vc-participant-initial">{name[0]?.toUpperCase()}</span>
      )}
      {isSpeaking && <div className="vc-speaking-ring" style={{ borderColor: accent }} />}
    </div>
  );
}

function CreateRoomModal({ onClose, onCreate, groupId }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('audio');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    const res = await api('/api/calls/rooms', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), type, group_id: groupId || null }),
    });
    
    if (res.ok) {
      const room = await res.json();
      onCreate(room);
    }
  };

  return (
    <div className="vc-modal-overlay" onClick={onClose}>
      <div className="vc-modal" onClick={e => e.stopPropagation()}>
        <div className="vc-modal-header">
          <h3>Создать голосовой чат</h3>
          <button className="vc-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="vc-form-group">
            <label>Название</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Например: Болтовня"
              maxLength={50}
              autoFocus
            />
          </div>
          <div className="vc-form-group">
            <label>Тип</label>
            <div className="vc-type-selector">
              <button
                type="button"
                className={`vc-type-btn ${type === 'audio' ? 'active' : ''}`}
                onClick={() => setType('audio')}
              >
                <Mic size={16} /> Аудио
              </button>
              <button
                type="button"
                className={`vc-type-btn ${type === 'video' ? 'active' : ''}`}
                onClick={() => setType('video')}
              >
                <Video size={16} /> Видео
              </button>
            </div>
          </div>
          <div className="vc-modal-actions">
            <button type="button" className="vc-btn vc-btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="vc-btn vc-btn-primary" disabled={!name.trim()}>
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function VoiceChatRoom({ room, currentUser, groupId, onClose }) {
  const [showCreate, setShowCreate] = useState(false);
  const [allRooms, setAllRooms] = useState([]);
  
  const {
    participants,
    localStream,
    micOn,
    camOn,
    speakingUsers,
    error,
    isJoined,
    joinRoom,
    leaveRoom,
    toggleMic,
    toggleCam,
  } = useVoiceChat(room?.id || null, currentUser);

  useEffect(() => {
    if (groupId) {
      loadGroupRooms();
    } else {
      loadPublicRooms();
    }
  }, [groupId]);

  const loadGroupRooms = async () => {
    const res = await api(`/api/calls/rooms/group/${groupId}`);
    if (res.ok) setAllRooms(await res.json());
  };

  const loadPublicRooms = async () => {
    const res = await api('/api/calls/rooms');
    if (res.ok) setAllRooms(await res.json());
  };

  const handleJoinRoom = async (selectedRoom) => {
    await joinRoom();
  };

  const handleLeaveRoom = async () => {
    await leaveRoom();
    if (room) {
      await api(`/api/calls/rooms/${room.id}/leave`, { method: 'POST' });
    }
  };

  if (showCreate) {
    return (
      <CreateRoomModal
        onClose={() => setShowCreate(false)}
        onCreate={(newRoom) => {
          setShowCreate(false);
          setAllRooms(prev => [newRoom, ...prev]);
        }}
        groupId={groupId}
      />
    );
  }

  return (
    <div className="vc-container">
      <div className="vc-header">
        <div className="vc-header-title">
          <Volume2 size={18} />
          <span>Голосовой чат</span>
        </div>
        <button className="vc-close-btn" onClick={onClose}><X size={18} /></button>
      </div>

      {error && (
        <div className="vc-error">{error}</div>
      )}

      {!isJoined ? (
        <div className="vc-lobby">
          <div className="vc-rooms-section">
            <div className="vc-section-header">
              <span>Комнаты</span>
              <button className="vc-add-btn" onClick={() => setShowCreate(true)}>
                <Plus size={14} /> Создать
              </button>
            </div>
            
            {allRooms.length === 0 ? (
              <div className="vc-empty">
                <Volume2 size={24} />
                <p>Нет активных комнат</p>
                <button className="vc-btn vc-btn-primary" onClick={() => setShowCreate(true)}>
                  Создать первую
                </button>
              </div>
            ) : (
              <div className="vc-room-list">
                {allRooms.map(r => (
                  <div key={r.id} className="vc-room-card">
                    <div className="vc-room-info">
                      <span className="vc-room-name">{r.name}</span>
                      <span className="vc-room-meta">
                        <Users size={12} /> {r.participant_count}
                      </span>
                    </div>
                    <button 
                      className="vc-btn vc-btn-small vc-btn-join"
                      onClick={() => handleJoinRoom(r)}
                    >
                      Присоединиться
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="vc-active-room">
          <div className="vc-room-title">{room?.name || 'Голосовой чат'}</div>
          
          <div className="vc-participants-grid">
            {/* Local user */}
            <div className="vc-participant-wrap">
              <div 
                className="vc-participant vc-participant-local"
                style={{ '--accent': currentUser?.accent_color || '#fff', borderColor: currentUser?.accent_color || '#fff' }}
              >
                {currentUser?.avatar ? (
                  <img src={currentUser.avatar} alt="You" className="vc-participant-img" />
                ) : (
                  <span className="vc-participant-initial">
                    {(currentUser?.display_name || currentUser?.username || '?')[0]?.toUpperCase()}
                  </span>
                )}
                {!micOn && <div className="vc-mic-off-indicator"><MicOff size={12} /></div>}
              </div>
              <span className="vc-participant-name">Вы</span>
            </div>
            
            {/* Remote participants */}
            {participants.map(p => (
              <div key={p.id} className="vc-participant-wrap">
                <div 
                  className={`vc-participant ${speakingUsers.has(p.id) ? 'vc-participant-speaking' : ''}`}
                  style={{ '--accent': p.accent_color || '#fff', borderColor: p.accent_color || '#fff' }}
                >
                  {p.avatar ? (
                    <img src={p.avatar} alt={p.display_name || p.username} className="vc-participant-img" />
                  ) : (
                    <span className="vc-participant-initial">
                      {(p.display_name || p.username || '?')[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="vc-participant-name">
                  {p.display_name || p.username}
                </span>
              </div>
            ))}
          </div>

          <div className="vc-controls">
            <button 
              className={`vc-ctrl ${!micOn ? 'vc-ctrl-off' : ''}`}
              onClick={toggleMic}
              title={micOn ? 'Выключить микрофон' : 'Включить микрофон'}
            >
              {micOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            
            {room?.type === 'video' && (
              <button 
                className={`vc-ctrl ${!camOn ? 'vc-ctrl-off' : ''}`}
                onClick={toggleCam}
                title={camOn ? 'Выключить камеру' : 'Включить камеру'}
              >
                {camOn ? <Video size={18} /> : <VideoOff size={18} />}
              </button>
            )}
            
            <button 
              className="vc-ctrl vc-ctrl-leave"
              onClick={handleLeaveRoom}
              title="Покинуть"
            >
              <PhoneOff size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
