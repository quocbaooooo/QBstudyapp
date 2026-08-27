import React, { useState, useEffect } from 'react';
import { getMediaFromIDB } from '../../utils/audioStorage';

/**
 * SmartImage component that transparently hydrates Base64 images from IndexedDB
 * if data was sanitized for Firestore/localStorage quota limits.
 */
export default function SmartImage({ img, alt, onClick, style, title, className }) {
  const getValidSrc = (item) => {
    if (!item) return '';
    if (item.data && item.data !== '[STORED_IN_INDEXEDDB]') return item.data;
    if (item.url && item.url !== '[STORED_IN_INDEXEDDB]') return item.url;
    return '';
  };

  const [src, setSrc] = useState(() => getValidSrc(img));

  useEffect(() => {
    let isMounted = true;
    if (!img) return;

    const currentSrc = getValidSrc(img);
    if (!currentSrc) {
      getMediaFromIDB(img.id).then(storedData => {
        if (isMounted && storedData) {
          setSrc(storedData);
        }
      });
    } else {
      setSrc(currentSrc);
    }

    return () => { isMounted = false; };
  }, [img?.id, img?.data, img?.url]);

  if (!src) return null;

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
