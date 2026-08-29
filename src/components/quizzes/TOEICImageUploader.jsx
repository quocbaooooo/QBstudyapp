import React, { useState, useRef } from 'react';
import { Upload, Link as LinkIcon, Trash2, Image as ImageIcon, Plus, Check, Clipboard, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { compressBase64Image } from '../../utils/imageCompressor';
import { saveMediaToIDB } from '../../utils/audioStorage';
import SmartImage from './SmartImage';

export default function TOEICImageUploader({
  images = [],
  onImagesChange,
  setActiveLightboxImage,
  accentColor = '#00e3fd',
  label = '🖼️ HÌNH ẢNH:',
  isTesting = false
}) {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const containerRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    setIsCompressing(true);
    try {
      const readPromises = fileArray.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const rawDataUrl = ev.target.result;
            // Fast local canvas compression (e.g. 5MB -> 80KB in ~20ms)
            const compressed = await compressBase64Image(rawDataUrl, 1000, 1000, 0.7);
            const imgId = uuidv4();
            // Save to IndexedDB safely
            await saveMediaToIDB(imgId, compressed);
            resolve({
              id: imgId,
              name: file.name || 'Image',
              data: compressed,
              url: compressed
            });
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      }));

      const newImgs = await Promise.all(readPromises);
      const updated = [...(images || []), ...newImgs];
      onImagesChange(updated);
      showToast(`🎉 Đã thêm & lưu ${newImgs.length} ảnh!`);
    } catch (err) {
      console.error('Error processing image upload:', err);
      showToast('❌ Có lỗi khi xử lý hình ảnh');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleFileInputChange = (e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  };

  const handleAddUrlImage = async () => {
    const url = urlInputValue.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:image/')) {
      alert('Vui lòng nhập URL hình ảnh hợp lệ (bắt đầu bằng http:// hoặc https://)');
      return;
    }

    let finalUrl = url;
    if (url.startsWith('data:image/')) {
      finalUrl = await compressBase64Image(url, 1000, 1000, 0.7);
    }

    const imgId = uuidv4();
    if (finalUrl) await saveMediaToIDB(imgId, finalUrl);

    const newImg = {
      id: imgId,
      name: 'Link Image',
      data: finalUrl,
      url: finalUrl
    };

    onImagesChange([...(images || []), newImg]);
    setUrlInputValue('');
    setShowUrlInput(false);
    showToast('🎉 Đã thêm ảnh từ Link!');
  };

  const handlePaste = async (e) => {
    // 1. Check for image files in clipboard (Snipping Tool, Ctrl+C image)
    const items = e.clipboardData?.items;
    let foundImage = false;

    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            foundImage = true;
            await handleFiles([blob]);
          }
        }
      }
    }

    // 2. Check for pasted image URL text
    if (!foundImage) {
      const pastedText = e.clipboardData?.getData('text')?.trim();
      if (pastedText && (pastedText.startsWith('http://') || pastedText.startsWith('https://') || pastedText.startsWith('data:image/'))) {
        e.preventDefault();
        let finalUrl = pastedText;
        if (pastedText.startsWith('data:image/')) {
          finalUrl = await compressBase64Image(pastedText, 1000, 1000, 0.7);
        }
        const imgId = uuidv4();
        if (finalUrl) await saveMediaToIDB(imgId, finalUrl);
        onImagesChange([...(images || []), { id: imgId, name: 'Pasted URL', data: finalUrl, url: finalUrl }]);
        showToast('🎉 Đã nhận diện & dán ảnh thành công!');
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDeleteImage = (imgId) => {
    const remaining = (images || []).filter(x => x.id !== imgId);
    onImagesChange(remaining);
  };

  if (isTesting) {
    if (!images || images.length === 0) return null;
    return (
      <div style={{ marginTop: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {images.map(img => (
            <SmartImage
              key={img.id}
              img={img}
              alt={img.name}
              onClick={(src) => setActiveLightboxImage && setActiveLightboxImage(src || img.data || img.url)}
              style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', background: '#000' }}
              title="Click để xem phóng to ảnh (Lightbox)"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      tabIndex={0}
      style={{
        background: isDragOver ? 'rgba(6,182,212,0.18)' : 'rgba(0,0,0,0.25)',
        padding: '12px',
        borderRadius: '10px',
        border: isDragOver ? `2px dashed ${accentColor}` : `1px dashed ${accentColor}44`,
        transition: 'all 0.2s ease',
        outline: 'none',
        position: 'relative'
      }}
    >
      {toastMessage && (
        <div style={{
          position: 'absolute',
          top: '-12px',
          right: '12px',
          background: 'linear-gradient(135deg, #10b981, #059669)',
          color: '#fff',
          fontSize: '11px',
          fontWeight: 700,
          padding: '3px 10px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(16,185,129,0.4)',
          zIndex: 10
        }}>
          {toastMessage}
        </div>
      )}

      {isCompressing && (
        <div style={{
          position: 'absolute',
          top: '-12px',
          left: '12px',
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          color: '#fff',
          fontSize: '11px',
          fontWeight: 700,
          padding: '3px 10px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '5px'
        }}>
          <Loader2 size={12} className="animate-spin" /> ⚡ Đang tối ưu hóa & nén ảnh...
        </div>
      )}

      <div style={{ fontSize: '11px', fontWeight: 700, color: accentColor, marginBottom: '8px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <ImageIcon size={14} /> {label}
        </div>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', textTransform: 'none', fontWeight: 400 }}>
          💡 Bấm vào đây & bấm <strong>Ctrl + V</strong> để dán ảnh trực tiếp
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        {/* Upload local file */}
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
          background: `${accentColor}22`, borderRadius: '6px', fontSize: '12px',
          color: accentColor, cursor: 'pointer', fontWeight: 700, border: `1px solid ${accentColor}44`
        }}>
          <Upload size={13} /> Chọn ảnh từ máy...
          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileInputChange} />
        </label>

        {/* Link input button */}
        <button
          type="button"
          onClick={() => setShowUrlInput(!showUrlInput)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
            background: 'rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '12px',
            color: '#e2e8f0', cursor: 'pointer', fontWeight: 600, border: '1px solid rgba(255,255,255,0.15)'
          }}
        >
          <LinkIcon size={13} /> {showUrlInput ? 'Thu gọn ▲' : '🔗 Dán Link Ảnh...'}
        </button>

        {/* Paste hint badge */}
        <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Clipboard size={12} color="#fbbf24" /> Hỗ trợ <strong>Ctrl + V</strong> dán ảnh/link
        </div>
      </div>

      {/* Inline Link input box */}
      {showUrlInput && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', marginTop: '4px' }}>
          <input
            type="text"
            value={urlInputValue}
            onChange={e => setUrlInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddUrlImage()}
            placeholder="Dán URL hình ảnh tại đây (Ví dụ: https://example.com/image.png)..."
            style={{
              flex: 1,
              background: 'rgba(0,0,0,0.4)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              outline: 'none'
            }}
          />
          <button
            type="button"
            onClick={handleAddUrlImage}
            style={{
              padding: '6px 12px',
              background: accentColor,
              color: '#000',
              fontWeight: 700,
              fontSize: '12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Plus size={14} /> Thêm Link
          </button>
        </div>
      )}

      {/* Image Thumbnails Grid */}
      {images && images.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
          {images.map(img => (
            <div key={img.id} style={{ position: 'relative', display: 'inline-block' }}>
              <SmartImage
                img={img}
                alt={img.name}
                onClick={(src) => setActiveLightboxImage && setActiveLightboxImage(src || img.data || img.url)}
                style={{ width: '65px', height: '65px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', background: '#000' }}
                title="Click để xem phóng to ảnh (Lightbox)"
              />
              <button
                type="button"
                onClick={() => handleDeleteImage(img.id)}
                style={{
                  position: 'absolute', top: 2, right: 2, background: 'rgba(239,68,68,0.9)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0
                }}
                title="Xóa ảnh này"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
