import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X, Check, ZoomIn, ZoomOut } from 'lucide-react';

async function getCroppedImg(imageSrc, pixelCrop) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y,
    pixelCrop.width, pixelCrop.height,
    0, 0,
    pixelCrop.width, pixelCrop.height
  );

  return canvas.toDataURL('image/jpeg', 0.92);
}

export default function ImageCropper({ src, aspect, onDone, onCancel, title }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleDone = async () => {
    const result = await getCroppedImg(src, croppedAreaPixels);
    onDone(result);
  };

  return (
    <div className="cropper-overlay">
      <div className="cropper-modal">
        <div className="cropper-header">
          <span>{title}</span>
          <button className="cropper-close" onClick={onCancel}><X size={18} /></button>
        </div>

        <div className="cropper-area">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid={false}
            style={{
              containerStyle: { background: '#0a0a0a' },
              cropAreaStyle: { border: '2px solid rgba(255,255,255,0.6)', borderRadius: aspect === 1 ? '50%' : '8px' },
            }}
          />
        </div>

        <div className="cropper-footer">
          <div className="cropper-zoom">
            <button onClick={() => setZoom(z => Math.max(1, z - 0.1))}><ZoomOut size={16} /></button>
            <input
              type="range" min={1} max={3} step={0.05}
              value={zoom} onChange={e => setZoom(Number(e.target.value))}
              className="zoom-slider"
            />
            <button onClick={() => setZoom(z => Math.min(3, z + 0.1))}><ZoomIn size={16} /></button>
          </div>
          <div className="cropper-actions">
            <button className="btn-crop-cancel" onClick={onCancel}>Отмена</button>
            <button className="btn-crop-done" onClick={handleDone}><Check size={15} /> Применить</button>
          </div>
        </div>
      </div>
    </div>
  );
}
