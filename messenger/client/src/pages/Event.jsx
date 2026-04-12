import { useState, useEffect, useRef } from 'react';

const EVENT_TARGET = 75; // users needed

function useUserCount() {
  const [data, setData] = useState({ total: 0, target: EVENT_TARGET });
  useEffect(() => {
    fetch('/api/users/count', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(setData).catch(() => {});
    const id = setInterval(() => {
      fetch('/api/users/count', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
        .then(r => r.json()).then(setData).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, []);
  return data;
}

// Animated scramble text
function ScrambleText({ text, active }) {
  const [display, setDisplay] = useState(text);
  const chars = '!@#$%^&*?><[]{}|~';
  const ref = useRef();

  useEffect(() => {
    if (!active) { setDisplay(text); return; }
    let frame = 0;
    const total = 20;
    const id = setInterval(() => {
      frame++;
      if (frame >= total) { setDisplay(text); clearInterval(id); return; }
      setDisplay(text.split('').map((c, i) =>
        i < Math.floor((frame / total) * text.length) ? c : chars[Math.floor(Math.random() * chars.length)]
      ).join(''));
    }, 40);
    return () => clearInterval(id);
  }, [active, text]);

  return <span ref={ref}>{display}</span>;
}

// Blinking cursor
function Cursor() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn(v => !v), 530);
    return () => clearInterval(id);
  }, []);
  return <span style={{ opacity: on ? 1 : 0, color: '#a855f7' }}>█</span>;
}

export default function Event() {
  const { total, target } = useUserCount();
  const pct = Math.min(100, Math.round((total / target) * 100));
  const remaining = Math.max(0, target - total);
  const unlocked = total >= target;

  const [scramble, setScramble] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [secret, setSecret] = useState(false);
  const [glitchLine, setGlitchLine] = useState(null);

  // Random glitch on lines
  useEffect(() => {
    const id = setInterval(() => {
      setGlitchLine(Math.floor(Math.random() * 4));
      setTimeout(() => setGlitchLine(null), 200);
    }, 2000 + Math.random() * 3000);
    return () => clearInterval(id);
  }, []);

  // Scramble on hover
  const handleHover = () => { setScramble(true); setTimeout(() => setScramble(false), 900); };

  // Easter egg
  const handleClick = () => {
    const n = clicks + 1;
    setClicks(n);
    if (n >= 7) { setSecret(true); setClicks(0); }
  };

  const lines = [
    '> инициализация протокола...',
    '> загрузка данных участников...',
    `> прогресс: ${total}/${target} [${pct}%]`,
    '> ожидание триггера...',
  ];

  return (
    <div className="ev-page">
      {/* Scanlines overlay */}
      <div className="ev-scanlines" />

      <div className="ev-inner">

        {/* Terminal header */}
        <div className="ev-terminal-bar">
          <span className="ev-dot ev-dot-r" />
          <span className="ev-dot ev-dot-y" />
          <span className="ev-dot ev-dot-g" />
          <span className="ev-terminal-title">rlc_event.exe</span>
        </div>

        {/* Terminal body */}
        <div className="ev-terminal">
          {lines.map((line, i) => (
            <div key={i} className={`ev-line ${glitchLine === i ? 'ev-line-glitch' : ''}`}>
              <span className="ev-prompt">$</span>
              <span className="ev-line-text">{line}</span>
            </div>
          ))}
          <div className="ev-line">
            <span className="ev-prompt">$</span>
            <Cursor />
          </div>
        </div>

        {/* Main title */}
        <div className="ev-title-wrap" onMouseEnter={handleHover} onClick={handleClick}>
          <div className="ev-eyebrow">СЕКРЕТНЫЙ ИВЕНТ</div>
          <h1 className="ev-title">
            <ScrambleText text={unlocked ? 'РАЗБЛОКИРОВАНО' : '???'} active={scramble} />
          </h1>
          <p className="ev-desc">
            {unlocked
              ? 'Ивент начался. Проверь ленту.'
              : `Ивент разблокируется когда в RLC наберётся ${target} пользователей.`
            }
          </p>
        </div>

        {/* Progress bar */}
        <div className="ev-progress-wrap">
          <div className="ev-progress-header">
            <span className="ev-progress-label">УЧАСТНИКИ</span>
            <span className="ev-progress-count">
              <span className="ev-progress-current">{total}</span>
              <span className="ev-progress-sep"> / </span>
              <span className="ev-progress-target">{target}</span>
            </span>
          </div>
          <div className="ev-progress-track">
            <div className="ev-progress-fill" style={{ width: `${pct}%` }}>
              <div className="ev-progress-glow" />
            </div>
          </div>
          <div className="ev-progress-footer">
            {unlocked
              ? <span className="ev-unlocked-badge">✓ РАЗБЛОКИРОВАНО</span>
              : <span className="ev-remaining">ещё {remaining} {remaining === 1 ? 'пользователь' : remaining < 5 ? 'пользователя' : 'пользователей'}</span>
            }
            <span className="ev-pct">{pct}%</span>
          </div>
        </div>

        {/* Redacted blocks */}
        <div className="ev-redacted-wrap">
          <div className="ev-redacted-row">
            <span className="ev-tag">СТАТУС</span>
            <span className={`ev-redacted-val ${unlocked ? 'ev-unlocked' : ''}`}>
              {unlocked ? 'АКТИВЕН' : '████████'}
            </span>
          </div>
          <div className="ev-redacted-row">
            <span className="ev-tag">НАГРАДА</span>
            <span className="ev-redacted-val">████████████</span>
          </div>
          <div className="ev-redacted-row">
            <span className="ev-tag">ДЕТАЛИ</span>
            <span className="ev-redacted-val">███ ████ ██████</span>
          </div>
        </div>

        {/* Secret easter egg */}
        {secret && (
          <div className="ev-secret">
            <span>🔓</span>
            <p>Секрет найден. Скоро всё узнаешь.</p>
          </div>
        )}

        <div className="ev-footer-text">RLC · {new Date().getFullYear()} · CLASSIFIED</div>
      </div>
    </div>
  );
}
