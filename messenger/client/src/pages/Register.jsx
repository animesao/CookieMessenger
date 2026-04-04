import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, UserPlus, MessageCircle, Eye, EyeOff, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

export default function Register() {
  const [step, setStep] = useState(1);
  const [discordKey, setDiscordKey] = useState(null);
  const [discordUser, setDiscordUser] = useState(null);
  const [discordLoading, setDiscordLoading] = useState(false);

  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [captcha, setCaptcha] = useState(null); // { token, question }
  const [captchaInput, setCaptchaInput] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Load captcha from server
  const loadCaptcha = async () => {
    try {
      const res = await fetch('/api/auth/captcha');
      if (res.ok) setCaptcha(await res.json());
    } catch {}
    setCaptchaInput('');
  };

  useEffect(() => { loadCaptcha(); }, []);

  // Handle Discord OAuth callback — get session by temp key
  useEffect(() => {
    const dk = searchParams.get('dk');
    const err = searchParams.get('error');

    if (err) {
      setError('Ошибка авторизации через Discord. Попробуйте снова.');
      window.history.replaceState({}, '', '/register');
      return;
    }

    if (dk) {
      window.history.replaceState({}, '', '/register');
      setDiscordLoading(true);
      fetch('/api/auth/discord/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: dk }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.error) { setError(data.error); return; }
          setDiscordKey(data.key);
          setDiscordUser({ username: data.username, email: data.email, avatar: data.avatar });
          if (data.email) setForm(f => ({ ...f, email: data.email }));
          setStep(2);
        })
        .catch(() => setError('Ошибка получения данных Discord'))
        .finally(() => setDiscordLoading(false));
    }
  }, []);

  const handleDiscordLogin = () => {
    setDiscordLoading(true);
    window.location.href = '/api/auth/discord?mode=register';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!captcha) return setError('Капча не загружена');
    if (!captchaInput.trim()) return setError('Введите ответ на капчу');
    if (!discordKey) return setError('Требуется подтверждение через Discord');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          captchaToken: captcha.token,
          captchaAnswer: captchaInput,
          discordKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        loadCaptcha();
        return setError(data.error);
      }
      setSuccess('Аккаунт создан! Перенаправляем...');
      setTimeout(() => navigate('/login'), 1500);
    } catch {
      setError('Ошибка соединения с сервером');
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <div className="auth-logo">
          <div className="auth-logo-icon"><MessageCircle size={22} /></div>
          <span>RLC</span>
        </div>

        <h2 className="auth-title">Создать аккаунт</h2>

        {error && <div className="alert alert-error"><AlertCircle size={15} />{error}</div>}
        {success && <div className="alert alert-success"><CheckCircle size={15} />{success}</div>}

        {/* Шаг 1 — Discord */}
        {step === 1 && (
          <>
            <p className="auth-subtitle" style={{ marginBottom: '1.5rem' }}>
              Для регистрации необходимо подтвердить аккаунт через Discord
            </p>

            <div className="register-steps">
              <div className="register-step active">
                <span className="register-step-num">1</span>
                <span>Войти через Discord</span>
              </div>
              <div className="register-step-line" />
              <div className="register-step">
                <span className="register-step-num">2</span>
                <span>Заполнить данные</span>
              </div>
            </div>

            <button type="button" className="btn-discord" onClick={handleDiscordLogin} disabled={discordLoading}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
              </svg>
              {discordLoading ? 'Перенаправление...' : 'Войти через Discord'}
            </button>

            <div className="auth-divider">или</div>
            <p className="auth-link">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
          </>
        )}

        {/* Шаг 2 — Форма */}
        {step === 2 && (
          <>
            <div className="register-steps" style={{ marginBottom: '1.25rem' }}>
              <div className="register-step done">
                <span className="register-step-num">✓</span>
                <span>Discord подтверждён</span>
              </div>
              <div className="register-step-line active" />
              <div className="register-step active">
                <span className="register-step-num">2</span>
                <span>Заполнить данные</span>
              </div>
            </div>

            <div className="discord-verified-badge">
              {discordUser?.avatar && <img src={discordUser.avatar} alt="discord" className="discord-avatar" />}
              <div>
                <span className="discord-verified-label">✓ Discord подтверждён</span>
                <span className="discord-verified-name">@{discordUser?.username}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label><User size={13} /> Имя пользователя</label>
                <div className="input-wrapper">
                  <User size={16} />
                  <input type="text" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="username" required />
                </div>
              </div>

              <div className="form-group">
                <label><Mail size={13} /> Email</label>
                <div className="input-wrapper">
                  <Mail size={16} />
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required />
                </div>
              </div>

              <div className="form-group">
                <label><Lock size={13} /> Пароль</label>
                <div className="input-wrapper">
                  <Lock size={16} />
                  <input type={showPass ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Минимум 8 символов" required />
                  <button type="button" className="password-toggle" onClick={() => setShowPass(!showPass)}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Капча — сколько будет?</label>
                <div className="captcha-row">
                  <div className="captcha-question">{captcha ? captcha.question + ' = ?' : '...'}</div>
                  <div className="input-wrapper captcha-input-wrap">
                    <input type="number" value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} placeholder="Ответ" required />
                  </div>
                  <button type="button" className="captcha-refresh" onClick={loadCaptcha} title="Новая капча">
                    <RefreshCw size={15} />
                  </button>
                </div>
              </div>

              <button type="submit" className="btn-submit">
                <UserPlus size={17} />
                Создать аккаунт
              </button>
            </form>

            <div className="auth-divider">или</div>
            <p className="auth-link">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
          </>
        )}
      </div>
    </div>
  );
}
