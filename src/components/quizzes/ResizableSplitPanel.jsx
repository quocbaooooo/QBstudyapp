import { useState, useRef } from 'react';

export default function ResizableSplitPanel({ leftContent, rightContent, defaultLeftPercent = 42 }) {
  const [leftWidthPercent, setLeftWidthPercent] = useState(defaultLeftPercent);
  const isDraggingRef = useRef(false);
  const containerRef = useRef(null);

  const handleMouseDown = (e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const offsetX = moveEvent.clientX - rect.left;
      let newPercent = (offsetX / rect.width) * 100;
      if (newPercent < 20) newPercent = 20;
      if (newPercent > 80) newPercent = 80;
      setLeftWidthPercent(newPercent);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        width: '100%',
        position: 'relative',
        alignItems: 'stretch'
      }}
    >
      {/* Left Column */}
      <div style={{ width: `${leftWidthPercent}%`, minWidth: '200px', flexShrink: 0, paddingRight: '8px' }}>
        {leftContent}
      </div>

      {/* Resizer bar */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: '16px',
          cursor: 'col-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          userSelect: 'none',
          zIndex: 10
        }}
        title="Kéo thanh này để thay đổi kích thước 2 bên"
      >
        <div style={{
          width: '4px',
          height: '56px',
          borderRadius: '4px',
          background: 'linear-gradient(180deg, #f472b6, #00e3fd)',
          boxShadow: '0 0 10px rgba(236,72,153,0.55)'
        }} />
      </div>

      {/* Right Column */}
      <div style={{ flex: 1, minWidth: '260px', paddingLeft: '8px' }}>
        {rightContent}
      </div>
    </div>
  );
}
