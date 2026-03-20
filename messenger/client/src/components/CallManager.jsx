import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket, wsSend } from '../hooks/useWebSocket';
import {
  Phone, PhoneOff, PhoneIncoming, Video, VideoOff,
  Mic, MicOff, Monitor, MonitorOff, X,
} from 'lucide-react';

// ── ICE servers (STUN) ────────────────────────────────────────────────────────
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ── Ringtone via Web Audio ────────────────────────────────────────────────────
function useRingtone() {
  const ctx = useRef(null);
  const nodes = useRef([]);
  const interval = useRef(null);

  const ring = useCallback(() => {
    stop();
    const play = () => {
      try {
        const c = new (window.AudioContext || window.webkitAudioContext)();
        ctx.current = c;
        [0, 0.2].forEach(offset => {
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.connect(gain); gain.connect(c.destination);
          osc.frequency.value = 440 + offset * 200;
          gain.gain.setValueAtTime(0.2, c.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + offset + 0.15);
          osc.start(c.currentTime + offset);
          osc.stop(c.currentTime + offset + 0.15);
          nodes.current.push(osc);
        });
      } catch {}
    };
    play();
    interval.current = setInterval(play, 1500);
  }, []);

  const stop = useCallback(() => {
    clearInterval(interval.current);
    try { ctx.current?.close(); } catch {}
    nodes.current = [];
  }, []);

  return { ring, stop };
}

// ── Main CallManager ──────────────────────────────────────────────────────────
export default function CallManager({ currentUser }) {
  // Call state
  const [callState, setCallState] = useState('idle'); // idle | calling | incoming | active
  const [callType, setCallType] = useState('audio');  // audio | video
  const [remoteUser, setRemoteUser] = useState(null);
  const [incomingData, setIncomingData] = useState(null);

  // Media state
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Refs
  const pc = useRef(null);
  const localStream = useRef(null);
  const screenStream = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const durationTimer = useRef(null);
  const ringtone = useRingtone();

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    clearInterval(durationTimer.current);
    ringtone.stop();
    localStream.current?.getTracks().forEach(t => t.stop());
    screenStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    screenStream.current = null;
    pc.current?.close();
    pc.current = null;
    setCallState('idle');
    setCallDuration(0);
    setMicOn(true); setCamOn(true); setScreenOn(false);
    setRemoteUser(null); setIncomingData(null);
  }, [ringtone]);

  // ── Create PeerConnection ──────────────────────────────────────────────────
  const createPC = useCallback((targetId) => {
    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    conn.onicecandidate = (e) => {
      if (e.candidate) wsSend('call_ice', targetId, { candidate: e.candidate });
    };

    conn.ontrack = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    conn.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(conn.connectionState)) {
        endCall();
      }
    };

    pc.current = conn;
    return conn;
  }, []);

  // ── Get local media ────────────────────────────────────────────────────────
  const getMedia = useCallback(async (type) => {
    const constraints = {
      audio: true,
      video: type === 'video' ? { width: 1280, height: 720 } : false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStream.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }, []);

  // ── Initiate call ──────────────────────────────────────────────────────────
  const startCall = useCallback(async (targetUser, type = 'audio') => {
    if (callState !== 'idle') return;
    setCallState('calling');
    setCallType(type);
    setRemoteUser(targetUser);

    try {
      const stream = await getMedia(type);
      const conn = createPC(targetUser.id);
      stream.getTracks().forEach(t => conn.addTrack(t, stream));

      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);

      wsSend('call_offer', targetUser.id, {
        offer,
        type,
        callerName: currentUser.display_name || currentUser.username,
        callerAvatar: currentUser.avatar,
        callerAccent: currentUser.accent_color,
      });
    } catch (err) {
      console.error('Call error:', err);
      cleanup();
    }
  }, [callState, getMedia, createPC, currentUser, cleanup]);

  // ── Answer call ────────────────────────────────────────────────────────────
  const answerCall = useCallback(async () => {
    if (!incomingData) return;
    ringtone.stop();
    setCallState('active');

    try {
      const stream = await getMedia(incomingData.type);
      const conn = createPC(incomingData.from);
      stream.getTracks().forEach(t => conn.addTrack(t, stream));

      await conn.setRemoteDescription(new RTCSessionDescription(incomingData.offer));
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);

      wsSend('call_answer', incomingData.from, { answer });

      // Start timer
      durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } catch (err) {
      console.error('Answer error:', err);
      cleanup();
    }
  }, [incomingData, ringtone, getMedia, createPC, cleanup]);

  // ── Reject incoming call ───────────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    if (incomingData) wsSend('call_reject', incomingData.from, {});
    cleanup();
  }, [incomingData, cleanup]);

  // ── End active call ────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    if (remoteUser) wsSend('call_end', remoteUser.id, {});
    else if (incomingData) wsSend('call_end', incomingData.from, {});
    cleanup();
  }, [remoteUser, incomingData, cleanup]);

  // ── Toggle mic ─────────────────────────────────────────────────────────────
  const toggleMic = () => {
    localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setMicOn(v => !v);
  };

  // ── Toggle camera ──────────────────────────────────────────────────────────
  const toggleCam = () => {
    localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCamOn(v => !v);
  };

  // ── Screen share ───────────────────────────────────────────────────────────
  const toggleScreen = async () => {
    if (!pc.current) return;

    if (screenOn) {
      // Stop screen share, restore camera
      screenStream.current?.getTracks().forEach(t => t.stop());
      screenStream.current = null;
      const videoTrack = localStream.current?.getVideoTracks()[0];
      if (videoTrack) {
        const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
        sender?.replaceTrack(videoTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream.current;
      }
      setScreenOn(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStream.current = screen;
        const screenTrack = screen.getVideoTracks()[0];

        const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        } else {
          pc.current.addTrack(screenTrack, screen);
        }

        if (localVideoRef.current) localVideoRef.current.srcObject = screen;

        screenTrack.onended = () => toggleScreen();
        setScreenOn(true);
      } catch {}
    }
  };

  // ── WebSocket signaling events ─────────────────────────────────────────────
  useWebSocket({
    call_offer: (data) => {
      if (callState !== 'idle') {
        wsSend('call_busy', data.from, {});
        return;
      }
      setIncomingData(data);
      setCallType(data.type || 'audio');
      setRemoteUser({
        id: data.from,
        display_name: data.callerName,
        avatar: data.callerAvatar,
        accent_color: data.callerAccent,
      });
      setCallState('incoming');
      ringtone.ring();
    },

    call_answer: async (data) => {
      if (!pc.current) return;
      await pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      setCallState('active');
      durationTimer.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    },

    call_ice: async (data) => {
      try {
        if (pc.current && data.candidate) {
          await pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch {}
    },

    call_reject: () => {
      cleanup();
    },

    call_end: () => {
      cleanup();
    },

    call_busy: () => {
      cleanup();
    },
  });

  // Expose startCall globally so Messages.jsx can trigger it
  useEffect(() => {
    window.__startCall = startCall;
    return () => { delete window.__startCall; };
  }, [startCall]);

  // Format duration
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const accent = remoteUser?.accent_color || currentUser.accent_color || '#fff';
  const remoteName = remoteUser?.display_name || remoteUser?.username || '...';

  if (callState === 'idle') return null;

  return (
    <div className="call-overlay">
      {/* ── Incoming call ── */}
      {callState === 'incoming' && (
        <div className="call-modal call-modal--incoming">
          <div className="call-avatar-wrap">
            <div className="call-avatar" style={{
              backgroundImage: remoteUser?.avatar ? `url(${remoteUser.avatar})` : undefined,
              borderColor: accent,
            }}>
              {!remoteUser?.avatar && remoteName[0]?.toUpperCase()}
            </div>
          </div>
          <p className="call-label">Входящий {callType === 'video' ? 'видео' : 'аудио'} звонок</p>
          <h3 className="call-name" style={{ color: accent }}>{remoteName}</h3>
          <div className="call-actions">
            <button className="call-btn call-btn--reject" onClick={rejectCall} title="Отклонить">
              <PhoneOff size={22} />
            </button>
            <button className="call-btn call-btn--accept" onClick={answerCall} title="Принять">
              {callType === 'video' ? <Video size={22} /> : <Phone size={22} />}
            </button>
          </div>
        </div>
      )}

      {/* ── Calling (outgoing, waiting) ── */}
      {callState === 'calling' && (
        <div className="call-modal call-modal--calling">
          <div className="call-avatar-wrap">
            <div className="call-avatar call-avatar--pulse" style={{
              backgroundImage: remoteUser?.avatar ? `url(${remoteUser.avatar})` : undefined,
              borderColor: accent,
            }}>
              {!remoteUser?.avatar && remoteName[0]?.toUpperCase()}
            </div>
          </div>
          <h3 className="call-name" style={{ color: accent }}>{remoteName}</h3>
          <p className="call-label">Вызов...</p>
          <div className="call-actions">
            <button className="call-btn call-btn--reject" onClick={endCall} title="Отменить">
              <PhoneOff size={22} />
            </button>
          </div>
        </div>
      )}

      {/* ── Active call ── */}
      {callState === 'active' && (
        <div className="call-active">
          {/* Remote video (full bg) */}
          <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline />

          {/* No video placeholder */}
          {callType === 'audio' && (
            <div className="call-audio-bg">
              <div className="call-avatar call-avatar--lg" style={{
                backgroundImage: remoteUser?.avatar ? `url(${remoteUser.avatar})` : undefined,
                borderColor: accent,
              }}>
                {!remoteUser?.avatar && remoteName[0]?.toUpperCase()}
              </div>
              <h3 className="call-name" style={{ color: accent }}>{remoteName}</h3>
            </div>
          )}

          {/* Local video (PiP) */}
          {(callType === 'video' || screenOn) && (
            <video ref={localVideoRef} className="call-local-video" autoPlay playsInline muted />
          )}

          {/* HUD */}
          <div className="call-hud">
            <div className="call-hud-info">
              <span className="call-hud-name" style={{ color: accent }}>{remoteName}</span>
              <span className="call-hud-timer">{fmt(callDuration)}</span>
            </div>

            <div className="call-controls">
              <button className={`call-ctrl ${!micOn ? 'call-ctrl--off' : ''}`} onClick={toggleMic} title={micOn ? 'Выкл. микрофон' : 'Вкл. микрофон'}>
                {micOn ? <Mic size={18} /> : <MicOff size={18} />}
              </button>

              {callType === 'video' && (
                <button className={`call-ctrl ${!camOn ? 'call-ctrl--off' : ''}`} onClick={toggleCam} title={camOn ? 'Выкл. камеру' : 'Вкл. камеру'}>
                  {camOn ? <Video size={18} /> : <VideoOff size={18} />}
                </button>
              )}

              <button className={`call-ctrl ${screenOn ? 'call-ctrl--active' : ''}`} onClick={toggleScreen} title={screenOn ? 'Остановить демонстрацию' : 'Демонстрация экрана'}>
                {screenOn ? <MonitorOff size={18} /> : <Monitor size={18} />}
              </button>

              <button className="call-ctrl call-ctrl--end" onClick={endCall} title="Завершить">
                <PhoneOff size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
