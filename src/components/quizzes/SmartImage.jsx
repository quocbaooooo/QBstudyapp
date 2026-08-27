import React, { useState, useEffect } from 'react';
import { getMediaFromIDB } from '../../utils/audioStorage';

/**
 * SmartImage component that transparently hydrates Base64 images from IndexedDB
 * if data was sanitized for Firestore/localStorage quota limits.
 */
export default function SmartImage({ img, alt, onClick, style, title, className }) {
  const initialSrc = (img && img.data !== '[STORED_IN_INDEXEDDB]') ? (img.data || img.url) : '';
  const [src, setSrc] = useState(initialSrc);

  useEffect(() => {
    let isMounted = true;
    if (!img) return;

    const currentSrc = img.data || img.url;
    if (!currentSrc || currentSrc === '[STORED_IN_INDEXEDDB]') {
      getMediaFromIDB(img.id).then(storedData => {
        if (isMounted && storedData) {
          setSrc(storedData);
        }
      });
    } else {
      setSrc(currentSrc);
    }

    return () => { isMounted = false; };
  }, [img]);

  if (!src) {
    return (
      <div 
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          background: 'rgba(0,0,0,0.4)', 
          borderRadius: '8px', 
          padding: '12px', 
          color: 'rgba(255,255,255,0.4)',
          fontSize: '12px',
          ...style 
        }}
      >
        📷 Đang tải ảnh...
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || img?.name || 'Image'}
      onClick={() => onClick && onClick(src)}
      style={style}
      title={title}
      className={className}
    />
  );
}
