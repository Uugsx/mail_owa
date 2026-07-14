import React, { useState, useRef, useEffect, ReactNode } from 'react';

interface ResizableSidebarProps {
  children: ReactNode;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
}

const ResizableSidebar: React.FC<ResizableSidebarProps> = ({ 
  children, 
  minWidth = 100, 
  maxWidth = 400, 
  defaultWidth = 120 
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = e.clientX;
      
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, minWidth, maxWidth]);

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  return (
    <div 
      ref={sidebarRef}
      className="relative flex"
      style={{ width: `${width}px` }}
    >
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
      
      {/* Resize handle */}
      <div
        className="w-1 bg-transparent hover:bg-blue-500 transition-colors cursor-col-resize relative group"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-y-0 -inset-x-1 group-hover:bg-blue-500/20" />
      </div>
    </div>
  );
};

export default ResizableSidebar;