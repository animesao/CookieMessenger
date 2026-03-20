import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera, ImagePlus, User, FileText, Palette,
  ArrowRight, Sparkles, Check
} from 'lucide-react';
import ImageCropper from '../components/ImageCropper';

const ACCENT_COLORS = [
  '#ffffff', '#a8a8a8', '#ff6b6b', '#ffa94d',
  '#ffd43b', '#69db7c', '#4dabf7', '#da77f2'
];

function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

export default function SetupProfile({ onComplete }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    display_name: '',
    bio: '',
    avatar: null,
    banner: null,
    accent_color: '#ffffff',
  });
  const [saving, setSaving] = useState(false);
  const avatarRef = useRef();
  const bannerRef = useRef();
  const navigate = useNavigate();
  const [cropSrc, setCropSrc] = useState(null);
  const [cropType, setCropType] = useState(null);

  const handleAvatar = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setCropSrc(ev.target.result); setCropType('avatar'); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleBanner = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setCropSrc(ev.target.result); setCropType('banner'); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropDone = result => {
    if (cropType === 'avatar') setForm(f => ({ ...f, avatar: result }));
    if (cropType === 'banner') setForm(f => ({ ...f, banner: result }));
    setCropSrc(null); setCropType(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/profile/update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        onComplete(data);
        navigate('/profile');
      }
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    onComplete(null);
    navigate('/profile');
  };

  return (
    <div className="setup-wrapper">
      <div className="setup-card">

        {/* Header */}
        <div className="setup-header">
          <div className="setup-sparkle"><Sparkles size={20} /></div>
          <h2>Настройте профиль</h2>
          <p>Сделайте аккаунт своим — это займёт минуту</p>
          <div className="setup-steps">
            {[1, 2, 3].map(s => (
              <div key={s} className={`setup-step-dot ${step >= s ? 'active' : ''}`} />
            ))}
          </div>
        </div>

        {/* Step 1 — Avatar & Banner */}
        {step === 1 && (
          <div className="setup-step">
            <p className="step-label">Шаг 1 — Фото профиля и баннер</p>

            {/* Banner */}
            <div
              className="banner-upload"
              style={{ backgroundImage: form.banner ? `url(${form.banner})` : undefined }}
              onClick={() => bannerRef.current.click()}
            >
              {!form.banner && (
                <div className="banner-placeholder">
                  <ImagePlus size={22} />
                  <span>Загрузить баннер</span>
                </div>
              )}
              {form.banner && <div className="banner-overlay"><ImagePlus size={18} /></div>}
              <input ref={bannerRef} type="file" accept="image/*" hidden onChange={handleBanner} />
            </div>

            {/* Avatar */}
            <div className="avatar-upload-wrap">
              <div
                className="avatar-upload"
                style={{ backgroundImage: form.avatar ? `url(${form.avatar})` : undefined, borderColor: form.accent_color }}
                onClick={() => avatarRef.current.click()}
              >
                {!form.avatar && <User size={28} />}
                <div className="avatar-cam"><Camera size={13} /></div>
              </div>
              <input ref={avatarRef} type="file" accept="image/*" hidden onChange={handleAvatar} />
            </div>

            <button className="btn-next" onClick={() => setStep(2)}>
              Далее <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* Step 2 — Name & Bio */}
        {step === 2 && (
          <div className="setup-step">
            <p className="step-label">Шаг 2 — Имя и описание</p>

            <div className="setup-field">
              <label><User size={13} /> Отображаемое имя</label>
              <input
                type="text"
                placeholder="Как вас называть?"
                value={form.display_name}
                onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                maxLength={32}
              />
            </div>

            <div className="setup-field">
              <label><FileText size={13} /> О себе</label>
              <textarea
                placeholder="Расскажите немного о себе..."
                value={form.bio}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                maxLength={160}
                rows={3}
              />
              <span className="char-count">{form.bio.length}/160</span>
            </div>

            <div className="step-nav">
              <button className="btn-back" onClick={() => setStep(1)}>Назад</button>
              <button className="btn-next" onClick={() => setStep(3)}>
                Далее <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Accent color */}
        {step === 3 && (
          <div className="setup-step">
            <p className="step-label">Шаг 3 — Цвет акцента</p>

            <div className="color-preview" style={{ borderColor: form.accent_color }}>
              <div
                className="color-avatar"
                style={{
                  backgroundImage: form.avatar ? `url(${form.avatar})` : undefined,
                  borderColor: form.accent_color
                }}
              >
                {!form.avatar && <User size={24} />}
              </div>
              <div>
                <p className="color-name">{form.display_name || 'Ваше имя'}</p>
                <p className="color-bio">{form.bio || 'Описание профиля'}</p>
              </div>
            </div>

            <div className="color-grid">
              {ACCENT_COLORS.map(c => (
                <button
                  key={c}
                  className={`color-swatch ${form.accent_color === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setForm(f => ({ ...f, accent_color: c }))}
                >
                  {form.accent_color === c && <Check size={14} color="#000" />}
                </button>
              ))}
            </div>

            <div className="setup-field" style={{ marginTop: '1rem' }}>
              <label><Palette size={13} /> Свой цвет</label>
              <div className="custom-color-row">
                <input
                  type="color"
                  value={form.accent_color}
                  onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))}
                  className="color-picker"
                />
                <span>{form.accent_color}</span>
              </div>
            </div>

            <div className="step-nav">
              <button className="btn-back" onClick={() => setStep(2)}>Назад</button>
              <button className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Сохранение...' : <><Check size={16} /> Готово</>}
              </button>
            </div>
          </div>
        )}

        <button className="btn-skip" onClick={skip}>Пропустить</button>
      </div>

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspect={cropType === 'avatar' ? 1 : 16 / 5}
          title={cropType === 'avatar' ? 'Обрезать аватарку' : 'Обрезать баннер'}
          onDone={handleCropDone}
          onCancel={() => { setCropSrc(null); setCropType(null); }}
        />
      )}
    </div>
  );
}
