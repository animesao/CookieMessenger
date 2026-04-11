import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, X, Search, ArrowLeft, Upload, Check } from 'lucide-react';

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}`, ...opts.headers },
  });
}

function fileToBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

export default function Stickers({ user }) {
  const [tab, setTab] = useState('my'); // my | browse
  const [myPacks, setMyPacks] = useState([]);
  const [publicPacks, setPublicPacks] = useState([]);
  const [activePack, setActivePack] = useState(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createPublic, setCreatePublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef();
  const accent = user.accent_color || '#fff';

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000); };

  const loadMy = useCallback(async () => {
    const res = await api('/api/stickers/my');
    if (res.ok) setMyPacks(await res.json());
  }, []);

  const loadPublic = useCallback(async (q = '') => {
    const res = await api(`/api/stickers/public${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    if (res.ok) setPublicPacks(await res.json());
  }, []);

  useEffect(() => { loadMy(); }, [loadMy]);
  useEffect(() => { if (tab === 'browse') loadPublic(search); }, [tab]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    const res = await api('/api/stickers/packs', {
      method: 'POST',
      body: JSON.stringify({ name: createName, description: createDesc, is_public: createPublic }),
    });
    const data = await res.json();
    if (res.ok) {
      setMyPacks(p => [data, ...p]);
      setActivePack(data);
      setShowCreate(false);
      setCreateName(''); setCreateDesc('');
      flash('ok', 'Пак создан!');
    } else flash('err', data.error);
    setCreating(false);
  };

  const handleUploadSticker = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !activePack) return;
    setUploading(true);
    for (const file of files) {
      if (file.size > 500 * 1024) { flash('err', `${file.name} слишком большой (макс 500KB)`); continue; }
      const image = await fileToBase64(file);
      const res = await api(`/api/stickers/packs/${activePack.id}/stickers`, {
        method: 'POST',
        body: JSON.stringify({ image }),
      });
      if (res.ok) {
        const sticker = await res.json();
        setActivePack(p => ({ ...p, stickers: [...(p.stickers || []), sticker] }));
        setMyPacks(packs => packs.map(p => p.id === activePack.id
          ? { ...p, stickers: [...(p.stickers || []), sticker] }
          : p
        ));
      }
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleDeleteSticker = async (stickerId) => {
    await api(`/api/stickers/packs/${activePack.id}/stickers/${stickerId}`, { method: 'DELETE' });
    setActivePack(p => ({ ...p, stickers: p.stickers.filter(s => s.id !== stickerId) }));
    setMyPacks(packs => packs.map(p => p.id === activePack.id
      ? { ...p, stickers: p.stickers.filter(s => s.id !== stickerId) }
      : p
    ));
  };

  const handleDeletePack = async (packId) => {
    if (!confirm('Удалить пак? Все стикеры будут удалены.')) return;
    await api(`/api/stickers/packs/${packId}`, { method: 'DELETE' });
    setMyPacks(p => p.filter(pk => pk.id !== packId));
    if (activePack?.id === packId) setActivePack(null);
    flash('ok', 'Пак удалён');
  };

  const handleAddPack = async (packId) => {
    const res = await api(`/api/stickers/packs/${packId}/add`, { method: 'POST' });
    if (res.ok) {
      setPublicPacks(p => p.map(pk => pk.id === packId ? { ...pk, added: 1 } : pk));
      loadMy();
      flash('ok', 'Пак добавлен!');
    }
  };

  const handleRemovePack = async (packId) => {
    await api(`/api/stickers/packs/${packId}/remove`, { method: 'DELETE' });
    setMyPacks(p => p.filter(pk => pk.id !== packId));
    setPublicPacks(p => p.map(pk => pk.id === packId ? { ...pk, added: 0 } : pk));
    if (activePack?.id === packId) setActivePack(null);
    flash('ok', 'Пак удалён из коллекции');
  };

  return (
    <div className="stickers-page">
      <div className="stickers-header">
        <h2>Стикеры</h2>
        <div className="stickers-tabs">
          <button className={`stickers-tab ${tab === 'my' ? 'active' : ''}`}
            onClick={() => setTab('my')} style={tab === 'my' ? { color: accent, borderColor: accent } : {}}>
            Мои паки
          </button>
          <button className={`stickers-tab ${tab === 'browse' ? 'active' : ''}`}
            onClick={() => { setTab('browse'); loadPublic(); }}
            style={tab === 'browse' ? { color: accent, borderColor: accent } : {}}>
            Обзор
          </button>
        </div>
      </div>

      {msg && (
        <div className={`stickers-flash ${msg.type === 'ok' ? 'flash-ok' : 'flash-err'}`}>
          {msg.text}
        </div>
      )}

      {/* MY PACKS */}
      {tab === 'my' && (
        <div className="stickers-content">
          {/* Pack list */}
          {!activePack && (
            <>
              <button className="stickers-create-btn" onClick={() => setShowCreate(true)}
                style={{ borderColor: accent, color: accent }}>
                <Plus size={16} /> Создать пак
              </button>

              {showCreate && (
                <div className="stickers-create-form">
                  <input placeholder="Название пака" value={createName}
                    onChange={e => setCreateName(e.target.value)} maxLength={64} />
                  <input placeholder="Описание (необязательно)" value={createDesc}
                    onChange={e => setCreateDesc(e.target.value)} maxLength={200} />
                  <label className="stickers-toggle-row">
                    <input type="checkbox" checked={createPublic} onChange={e => setCreatePublic(e.target.checked)} />
                    Публичный пак (другие смогут добавить)
                  </label>
                  <div className="stickers-form-actions">
                    <button onClick={() => setShowCreate(false)}>Отмена</button>
                    <button onClick={handleCreate} disabled={creating || !createName.trim()}
                      style={{ background: accent, color: '#000' }}>
                      {creating ? 'Создание...' : 'Создать'}
                    </button>
                  </div>
                </div>
              )}

              {myPacks.length === 0 && !showCreate && (
                <div className="stickers-empty">
                  <p>У вас нет стикер-паков</p>
                  <span>Создайте свой или найдите в обзоре</span>
                </div>
              )}

              <div className="stickers-pack-list">
                {myPacks.map(pack => (
                  <div key={pack.id} className="stickers-pack-row" onClick={() => setActivePack(pack)}>
                    <div className="stickers-pack-preview">
                      {(pack.stickers || []).slice(0, 4).map((s, i) => (
                        <img key={i} src={s.image} alt="" loading="lazy" />
                      ))}
                      {(!pack.stickers || pack.stickers.length === 0) && (
                        <div className="stickers-pack-empty-thumb">📦</div>
                      )}
                    </div>
                    <div className="stickers-pack-info">
                      <span className="stickers-pack-name">{pack.name}</span>
                      <span className="stickers-pack-count">{pack.sticker_count || (pack.stickers?.length || 0)} стикеров</span>
                    </div>
                    <div className="stickers-pack-actions" onClick={e => e.stopPropagation()}>
                      {pack.owner_id === user.id ? (
                        <button className="stickers-pack-delete" onClick={() => handleDeletePack(pack.id)} title="Удалить пак">
                          <Trash2 size={14} />
                        </button>
                      ) : (
                        <button className="stickers-pack-remove" onClick={() => handleRemovePack(pack.id)} title="Убрать из коллекции">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Pack editor */}
          {activePack && (
            <div className="stickers-editor">
              <div className="stickers-editor-header">
                <button className="stickers-back-btn" onClick={() => setActivePack(null)}>
                  <ArrowLeft size={16} />
                </button>
                <div>
                  <span className="stickers-editor-name">{activePack.name}</span>
                  <span className="stickers-editor-count">{activePack.stickers?.length || 0} стикеров</span>
                </div>
                {activePack.owner_id === user.id && (
                  <button className="stickers-upload-btn" onClick={() => fileRef.current.click()}
                    disabled={uploading} style={{ background: accent, color: '#000' }}>
                    <Upload size={14} /> {uploading ? 'Загрузка...' : 'Добавить'}
                  </button>
                )}
              </div>

              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleUploadSticker} />

              {activePack.stickers?.length === 0 && (
                <div className="stickers-empty">
                  <p>Пак пустой</p>
                  {activePack.owner_id === user.id && <span>Нажмите "Добавить" чтобы загрузить стикеры</span>}
                </div>
              )}

              <div className="stickers-grid">
                {(activePack.stickers || []).map(s => (
                  <div key={s.id} className="stickers-item">
                    <img src={s.image} alt="sticker" loading="lazy" />
                    {activePack.owner_id === user.id && (
                      <button className="stickers-item-delete" onClick={() => handleDeleteSticker(s.id)}>
                        <X size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* BROWSE */}
      {tab === 'browse' && (
        <div className="stickers-content">
          <div className="stickers-search">
            <Search size={14} />
            <input placeholder="Поиск паков..." value={search}
              onChange={e => { setSearch(e.target.value); loadPublic(e.target.value); }} />
            {search && <button onClick={() => { setSearch(''); loadPublic(''); }}><X size={12} /></button>}
          </div>

          {publicPacks.length === 0 && (
            <div className="stickers-empty"><p>Паков не найдено</p></div>
          )}

          <div className="stickers-browse-list">
            {publicPacks.map(pack => (
              <div key={pack.id} className="stickers-browse-row">
                <div className="stickers-pack-preview">
                  {(pack.preview || []).map((src, i) => (
                    <img key={i} src={src} alt="" loading="lazy" />
                  ))}
                  {(!pack.preview || pack.preview.length === 0) && (
                    <div className="stickers-pack-empty-thumb">📦</div>
                  )}
                </div>
                <div className="stickers-pack-info">
                  <span className="stickers-pack-name">{pack.name}</span>
                  <span className="stickers-pack-count">{pack.sticker_count} стикеров · @{pack.owner_username}</span>
                </div>
                <button
                  className={`stickers-add-btn ${pack.added ? 'added' : ''}`}
                  onClick={() => pack.added ? handleRemovePack(pack.id) : handleAddPack(pack.id)}
                  style={!pack.added ? { background: accent, color: '#000' } : {}}
                >
                  {pack.added ? <><Check size={13} /> Добавлен</> : <><Plus size={13} /> Добавить</>}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
