import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket, wsSend, wsReadyState } from '../hooks/useWebSocket';
import {
  Phone, PhoneOff, Video, VideoOff,
  Mic, MicOff, Monitor, MonitorOff,
} from 'lucide-react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'turn:a.relay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:a.relay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
];

function useRingtone() {
  const interval = useRef(null);

  const ring = useCallback(() => {
    const stop = () => {
      clearInterval(interval.current);
      interval.current = null;
    };
    stop();
    const play = () => {
      try {
        const c = new AudioContext();
        [0, 0.25].forEach(offset => {
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.connect(gain); gain.connect(c.destination);
          osc.frequency.value = 440 + offset * 180;
          gain.gain.setValueAtTime(0.15, c.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + offset + 0.18);
          osc.start(c.currentTime + offset);
          osc.stop(c.currentTime + offset + 0.18);
        });
        setTimeout(() => { try { c.close(); } catch {} }, 1200);
      } catch {}
    };
    play();
    interval.current = setInterval(play, 1800);
  }, []);

  const stop = useCallback(() => {
    clearInterval(interval.current);
    interval.current = null;
  }, []);

  return { ring, stop };
}

export default function CallManager({ currentUser }) {
  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState('audio');
  const [remoteUser, setRemoteUser] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callError, setCallError] = useState(null);
  const [connectionState, setConnectionState] = useState('');

  const callStateRef = useRef('idle');
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const durationTimer = useRef(null);
  const incomingDataRef = useRef(null);
  const iceBufferRef = useRef([]);
  const reconnectAttemptsRef = useRef(0);
  const screenStreamRef = useRef(null);
  const ringtone = useRingtone();

  const setCallStateSync = (s) => {
    callStateRef.current = s;
    setCallState(s);
  };

  const cleanup = useCallback(() => {
    clearInterval(durationTimer.current);
    durationTimer.current = null;
    ringtone.stop();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (window.remoteAudioEl) {
      window.remoteAudioEl.pause();
      window.remoteAudioEl.srcObject = null;
    }

    iceBufferRef.current = [];
    reconnectAttemptsRef.current = 0;

    setCallStateSync('idle');
    setCallDuration(0);
    setConnectionState('');
    setMicOn(true); setCamOn(true); setScreenOn(false);
    setRemoteUser(null);
    setCallError(null);
  }, [ringtone]);

  const getMedia = useCallback(async (type) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Требуется HTTPS');
    }
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: type === 'video' ? { width: 1280, height: 720, facingMode: 'user' } : false,
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }, []);

  const addTracksToPC = useCallback((pc, stream) => {
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });
  }, []);

  const createPeerConnection = useCallback((targetId, onRemoteTrack) => {
    if (pcRef.current) {
      pcRef.current.close();
    }
    iceBufferRef.current = [];

    const conn = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
    });

    conn.onicecandidate = (e) => {
      if (e.candidate) {
        wsSend('call_ice', targetId, { candidate: e.candidate });
      }
    };

    conn.oniceconnectionstatechange = () => {
      const state = conn.iceConnectionState;
      console.log('[Call] ICE state:', state);
      setConnectionState(state);

      if (state === 'connected' || state === 'completed') {
        console.log('[Call] Connected!');
        reconnectAttemptsRef.current = 0;
      } else if (state === 'disconnected') {
        console.log('[Call] Disconnected, attempting reconnect...');
        if (reconnectAttemptsRef.current < 3) {
          reconnectAttemptsRef.current++;
          setTimeout(() => {
            if (conn.restartIce) conn.restartIce();
          }, 1000);
        }
      } else if (state === 'failed') {
        console.log('[Call] Connection failed!');
        if (reconnectAttemptsRef.current < 3) {
          reconnectAttemptsRef.current++;
          if (conn.restartIce) conn.restartIce();
        } else {
          setCallError('Соединение потеряно');
          cleanup();
        }
      }
    };

    conn.ontrack = (e) => {
      console.log('[Call] ontrack:', e.track.kind, 'stream:', !!e.streams[0]);
      if (onRemoteTrack && e.streams[0]) {
        onRemoteTrack(e.streams[0]);
      }
    };

    pcRef.current = conn;
    return conn;
  }, [cleanup]);

  const handleRemoteTrack = useCallback((stream) => {
    console.log('[Call] handleRemoteTrack called, stream has tracks:', stream.getTracks().map(t => t.kind));
    remoteStreamRef.current = stream;
    
    if (!window.remoteAudioEl) {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.controls = false;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      window.remoteAudioEl = audio;
      console.log('[Call] Created remote audio element');
    }
    window.remoteAudioEl.srcObject = stream;
    console.log('[Call] Set srcObject, attempting play...');
    
    const playPromise = window.remoteAudioEl.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        console.log('[Call] Audio playing!');
      }).catch(e => {
        console.log('[Call] Audio autoplay blocked:', e.message);
        // User interaction required
        const resume = () => {
          console.log('[Call] User clicked, attempting play again');
          window.remoteAudioEl?.play().catch(() => {});
          document.removeEventListener('click', resume);
        };
        document.addEventListener('click', resume, { once: true });
      });
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
    }
  }, []);

  const startCall = useCallback(async (targetUser, type = 'audio') => {
    console.log('[Call] Starting call to:', targetUser.id, 'type:', type);
    
    if (callStateRef.current !== 'idle') {
      cleanup();
      await new Promise(r => setTimeout(r, 100));
    }

    setCallStateSync('calling');
    setCallType(type);
    setRemoteUser(targetUser);
    setCallError(null);

    try {
      console.log('[Call] Getting media...');
      const stream = await getMedia(type);
      localStreamRef.current = stream;
      console.log('[Call] Media stream created, tracks:', stream.getTracks().length);

      const pc = createPeerConnection(targetUser.id, handleRemoteTrack);
      addTracksToPC(pc, stream);
      console.log('[Call] Tracks added to PC');

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[Call] Offer created');

      wsSend('call_offer', targetUser.id, {
        offer,
        type,
        callerName: currentUser.display_name || currentUser.username,
        callerAvatar: currentUser.avatar,
        callerAccent: currentUser.accent_color,
      });
      console.log('[Call] Offer sent via WS');

    } catch (err) {
      console.error('[Call] Start error:', err);
      setCallError(err.message || 'Ошибка звонка');
      cleanup();
    }
  }, [cleanup, getMedia, createPeerConnection, addTracksToPC, handleRemoteTrack, currentUser]);

  const answerCall = useCallback(async () => {
    const incoming = incomingDataRef.current;
    if (!incoming) {
      console.log('[Call] answerCall called but no incoming data!');
      return;
    }
    console.log('[Call] Answering call from:', incoming.from);

    ringtone.stop();
    setCallStateSync('active');

    try {
      const type = incoming.type || 'audio';
      console.log('[Call] Getting media for answer...');
      const stream = await getMedia(type);
      localStreamRef.current = stream;
      console.log('[Call] Media stream created');

      const pc = createPeerConnection(incoming.from, handleRemoteTrack);
      addTracksToPC(pc, stream);
      console.log('[Call] Tracks added to PC');

      await pc.setRemoteDescription(new RTCSessionDescription(incoming.offer));
      console.log('[Call] Remote description set');

      for (const c of iceBufferRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      }
      iceBufferRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[Call] Answer created');

      wsSend('call_answer', incoming.from, { answer });
      console.log('[Call] Answer sent');
      
      durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);

      setTimeout(() => {
        console.log('[Call] Attempting to play remote audio');
        window.remoteAudioEl?.play().catch(e => console.log('[Call] Audio play error:', e));
      }, 500);

    } catch (err) {
      console.error('[Call] Answer error:', err);
      setCallError(err.message || 'Ошибка при ответе');
      cleanup();
    }
  }, [ringtone, getMedia, createPeerConnection, addTracksToPC, handleRemoteTrack, cleanup]);

  const rejectCall = useCallback(() => {
    const incoming = incomingDataRef.current;
    if (incoming) {
      wsSend('call_reject', incoming.from, {});
    }
    cleanup();
  }, [cleanup]);

  const endCall = useCallback(() => {
    const ru = remoteUser;
    const incoming = incomingDataRef.current;
    if (ru) wsSend('call_end', ru.id, {});
    else if (incoming) wsSend('call_end', incoming.from, {});
    cleanup();
  }, [cleanup, remoteUser]);

  const toggleMic = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setMicOn(v => !v);
    }
  }, []);

  const toggleCam = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
      setCamOn(v => !v);
    }
  }, []);

  const toggleScreen = useCallback(async () => {
    if (!pcRef.current) return;

    if (screenOn) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;

      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(camTrack);
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setScreenOn(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screen;
        const screenTrack = screen.getVideoTracks()[0];

        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screen;
        }

        screenTrack.onended = () => {
          if (screenOn) toggleScreen();
        };
        setScreenOn(true);
      } catch (err) {
        console.error('[Screen] Error:', err);
      }
    }
  }, [screenOn]);

  useWebSocket({
    call_offer: (data) => {
      console.log('[Call] Incoming call_offer:', data);
      if (callStateRef.current !== 'idle') {
        console.log('[Call] Busy, rejecting');
        wsSend('call_busy', data.from, {});
        return;
      }

      incomingDataRef.current = data;
      setCallType(data.type || 'audio');

      const ru = {
        id: data.from,
        display_name: data.callerName,
        avatar: data.callerAvatar,
        accent_color: data.callerAccent,
      };
      setRemoteUser(ru);
      setCallStateSync('incoming');
      ringtone.ring();
      console.log('[Call] Showing incoming call UI');
      
      // Auto-answer after short delay for testing
      setTimeout(() => {
        if (callStateRef.current === 'incoming') {
          console.log('[Call] Auto-answering...');
          answerCall();
        }
      }, 1500);
    },

    call_answer: async (data) => {
      console.log('[Call] Received call_answer:', data);
      if (!pcRef.current) {
        console.log('[Call] No peer connection!');
        return;
      }

      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('[Call] Remote description set');

        for (const c of iceBufferRef.current) {
          try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        }
        iceBufferRef.current = [];

        setCallStateSync('active');
        durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);

        setTimeout(() => {
          console.log('[Call] Attempting to play remote audio');
          window.remoteAudioEl?.play().catch(e => console.log('[Call] Audio play error:', e));
        }, 500);
      } catch (err) {
        console.error('[Call] Answer set error:', err);
        setCallError('Ошибка соединения');
        cleanup();
      }
    },

    call_ice: async (data) => {
      if (!data.candidate) return;
      try {
        if (pcRef.current?.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          iceBufferRef.current.push(data.candidate);
        }
      } catch {}
    },

    call_reject: () => {
      setCallError('Звонок отклонён');
      cleanup();
    },

    call_end: () => {
      cleanup();
    },

    call_busy: () => {
      setCallError('Абонент занят');
      cleanup();
    },
  });

  const startCallRef = useRef(startCall);
  useEffect(() => { startCallRef.current = startCall; }, [startCall]);

  useEffect(() => {
    window.__startCall = (...args) => startCallRef.current(...args);
    return () => { delete window.__startCall; };
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const accent = remoteUser?.accent_color || currentUser?.accent_color || '#fff';
  const remoteName = remoteUser?.display_name || remoteUser?.username || '...';

  if (callState === 'idle' && !callError) return null;

  if (callError) return (
    <div className="call-overlay">
      <div className="call-modal call-modal--incoming">
        <p className="call-label" style={{ color: '#ff6b6b', marginBottom: 12 }}>⚠️ {callError}</p>
        <button className="call-btn call-btn--reject" onClick={() => { setCallError(null); cleanup(); }}>
          <PhoneOff size={22} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="call-overlay">
      {callState === 'incoming' && (
        <div className="call-modal call-modal--incoming">
          <div className="call-avatar-wrap">
            <div className="call-avatar" style={{ backgroundImage: remoteUser?.avatar ? `url(${remoteUser.avatar})` : undefined, borderColor: accent }}>
              {!remoteUser?.avatar && remoteName[0]?.toUpperCase()}
            </div>
          </div>
          <p className="call-label">Входящий {callType === 'video' ? 'видео' : 'аудио'} звонок</p>
          <h3 className="call-name" style={{ color: accent }}>{remoteName}</h3>
          <div className="call-actions">
            <button className="call-btn call-btn--reject" onClick={rejectCall}><PhoneOff size={22} /></button>
            <button className="call-btn call-btn--accept" onClick={answerCall}>
              {callType === 'video' ? <Video size={22} /> : <Phone size={22} />}
            </button>
          </div>
        </div>
      )}

      {callState === 'calling' && (
        <div className="call-modal call-modal--calling">
          <div className="call-avatar-wrap">
            <div className="call-avatar call-avatar--pulse" style={{ backgroundImage: remoteUser?.avatar ? `url(${remoteUser.avatar})` : undefined, borderColor: accent }}>
              {!remoteUser?.avatar && remoteName[0]?.toUpperCase()}
            </div>
          </div>
          <h3 className="call-name" style={{ color: accent }}>{remoteName}</h3>
          <p className="call-label">Вызов...</p>
          <div className="call-actions">
            <button className="call-btn call-btn--reject" onClick={endCall}><PhoneOff size={22} /></button>
          </div>
        </div>
      )}

      {callState === 'active' && (
        <div className="call-active">
          <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline />
          {callType === 'audio' && (
            <div className="call-audio-bg">
              <div className="call-avatar call-avatar--lg" style={{ backgroundImage: remoteUser?.avatar ? `url(${remoteUser.avatar})` : undefined, borderColor: accent }}>
                {!remoteUser?.avatar && remoteName[0]?.toUpperCase()}
              </div>
              <h3 className="call-name" style={{ color: accent }}>{remoteName}</h3>
            </div>
          )}
          {(callType === 'video' || screenOn) && (
            <video ref={localVideoRef} className="call-local-video" autoPlay playsInline muted />
          )}
          <div className="call-hud">
            <div className="call-hud-info">
              <span className="call-hud-name" style={{ color: accent }}>{remoteName}</span>
              <span className="call-hud-timer">{fmt(callDuration)}</span>
              {connectionState && connectionState !== 'connected' && connectionState !== 'completed' && (
                <span className="call-conn-state">{
                  connectionState === 'connecting' ? '🔄 Подключение...' :
                  connectionState === 'checking' ? '🔄 Проверка...' :
                  connectionState === 'disconnected' ? '⚠️ Переподключение...' :
                  connectionState === 'failed' ? '❌ Ошибка связи' : ''
                }</span>
              )}
            </div>
            <div className="call-controls">
              <button className={`call-ctrl ${!micOn ? 'call-ctrl--off' : ''}`} onClick={toggleMic}>
                {micOn ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
              {callType === 'video' && (
                <button className={`call-ctrl ${!camOn ? 'call-ctrl--off' : ''}`} onClick={toggleCam}>
                  {camOn ? <Video size={18} /> : <VideoOff size={18} />}
                </button>
              )}
              <button className={`call-ctrl ${screenOn ? 'call-ctrl--active' : ''}`} onClick={toggleScreen}>
                {screenOn ? <MonitorOff size={18} /> : <Monitor size={18} />}
              </button>
              <button className="call-ctrl call-ctrl--end" onClick={endCall}>
                <PhoneOff size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
