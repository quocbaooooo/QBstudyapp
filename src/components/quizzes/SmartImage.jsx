import React, { useState, useEffect } from 'react';
import { getMediaFromIDB } from '../../utils/audioStorage';

export default function SmartImage({ img, src, alt = 'Image', style, title, onClick, ...props }) {
  const initialSrc = typeof img === 'object' ? (img.data || img.url) : src;
  const [resolvedSrc, setResolvedSrc] = useState(() => {
    return initialSrc && initialSrc !== '[STORED_IN_INDEXEDDB]' ? initialSrc : '';
  });

  useEffect(() => {
    let isMounted = true;
    const currentSrc = typeof img === 'object' ? (img.data || img.url) : src;

    if (currentSrc && currentSrc !== '[STORED_IN_INDEXEDDB]') {
      setResolvedSrc(currentSrc);
    } else {
      const imgId = typeof img === 'object' ? img.id : null;
      if (imgId) {
        getMediaFromIDB(imgId).then(data => {
          if (isMounted && data) {
            setResolvedSrc(data);
          }
        });
      }
    }

    return () => {
      isMounted = false;
    };
  }, [img, src]);

  return (
    <img
      src={resolvedSrc || initialSrc || ''}
      alt={typeof img === 'object' ? (img.name || alt) : alt}
      style={style}
      title={title}
      onClick={() => {
        if (onClick) onClick(resolvedSrc || initialSrc);
      }}
      {...props}
    />
  );
}
