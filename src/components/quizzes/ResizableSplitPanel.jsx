import { useState, useRef, useEffect } from 'react';

export default function ResizableSplitPanel({
  leftContent,
  rightContent,
  defaultLeftPercent = 42,
  height = 'calc(100vh - 180px)',
  minHeight = '480px',
  maxHeight = '780px',
  isFullHeight = false
}) {
  const [leftWidthPercent, setLeftWidthPercent] = useState(defaultLeftPercent);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const handlePointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (e) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    let newPercent = (offsetX / rect.width) * 100;
    if (newPercent < 18) newPercent = 18;
    if (newPercent > 82) newPercent = 82;
    setLeftWidthPercent(newPercent);
  };

  const handlePointerUp = (e) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Fallback cleanup if pointer capture released automatically
      }
    }
  };

  useEffect(() => {
    if (isDragging) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        width: '100%',
        flex: height === '100%' ? 1 : 'none',
        height: isFullHeight ? 'auto' : height,
        minHeight: isFullHeight || height === '100%' ? 0 : minHeight,
        maxHeight: isFullHeight || height === '100%' ? 'none' : maxHeight,
        position: 'relative',
        alignItems: 'stretch',
        touchAction: 'none',
        transition: 'height 0.25s ease, max-height 0.25s ease'
      }}
    >
      {/* Left Column */}
      <div style={{
        width: `${leftWidthPercent}%`,
        minWidth: '180px',
        height: isFullHeight ? 'auto' : '100%',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        paddingRight: '8px',
        overflow: 'hidden'
      }}>
        {leftContent}
      </div>

      {/* Resizer bar */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: '18px',
          cursor: 'col-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          userSelect: 'none',
          touchAction: 'none',
          zIndex: 20
        }}
        title="Kéo thanh này để thay đổi kích thước 2 bên"
      >
        <div style={{
          width: isDragging ? '6px' : '4px',
          height: '60px',
          borderRadius: '4px',
          background: isDragging 
            ? 'linear-gradient(180deg, #00e3fd, #f472b6)' 
            : 'linear-gradient(180deg, #f472b6, #00e3fd)',
          boxShadow: isDragging 
            ? '0 0 16px rgba(0,227,253,0.9), 0 0 8px rgba(236,72,153,0.8)' 
            : '0 0 10px rgba(236,72,153,0.55)',
          transition: 'width 0.15s ease, boxShadow 0.15s ease'
        }} />
      </div>

      {/* Right Column */}
      <div style={{
        flex: 1,
        minWidth: '240px',
        height: isFullHeight ? 'auto' : '100%',
        display: 'flex',
        flexDirection: 'column',
        paddingLeft: '8px',
        overflow: 'hidden'
      }}>
        {rightContent}
      </div>
    </div>
  );
}
