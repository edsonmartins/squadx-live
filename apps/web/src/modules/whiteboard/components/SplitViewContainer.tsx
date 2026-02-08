'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GripVertical } from 'lucide-react';

interface SplitViewContainerProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  initialSplit?: number; // 0-100 percentage for left panel
  minLeftWidth?: number; // Minimum width in pixels
  minRightWidth?: number; // Minimum width in pixels
  direction?: 'horizontal' | 'vertical';
  className?: string;
  onSplitChange?: (split: number) => void;
}

/**
 * Resizable split view container with drag handle
 */
export function SplitViewContainer({
  leftPanel,
  rightPanel,
  initialSplit = 50,
  minLeftWidth = 200,
  minRightWidth = 200,
  direction = 'horizontal',
  className = '',
  onSplitChange,
}: SplitViewContainerProps) {
  const [split, setSplit] = useState(initialSplit);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();

      let newSplit: number;

      if (direction === 'horizontal') {
        const x = e.clientX - rect.left;
        const containerWidth = rect.width;

        // Calculate percentage
        newSplit = (x / containerWidth) * 100;

        // Apply min width constraints
        const minLeftPercent = (minLeftWidth / containerWidth) * 100;
        const minRightPercent = (minRightWidth / containerWidth) * 100;

        newSplit = Math.max(minLeftPercent, Math.min(100 - minRightPercent, newSplit));
      } else {
        const y = e.clientY - rect.top;
        const containerHeight = rect.height;

        newSplit = (y / containerHeight) * 100;

        const minTopPercent = (minLeftWidth / containerHeight) * 100;
        const minBottomPercent = (minRightWidth / containerHeight) * 100;

        newSplit = Math.max(minTopPercent, Math.min(100 - minBottomPercent, newSplit));
      }

      setSplit(newSplit);
      onSplitChange?.(newSplit);
    },
    [isDragging, direction, minLeftWidth, minRightWidth, onSplitChange]
  );

  // Add global mouse event listeners when dragging
  useEffect(() => {
    if (!isDragging) {
      return;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Change cursor globally while dragging
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp, direction]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} h-full w-full overflow-hidden ${className}`}
    >
      {/* Left/Top Panel */}
      <div
        className="overflow-hidden"
        style={{
          [isHorizontal ? 'width' : 'height']: `${split}%`,
          flexShrink: 0,
        }}
      >
        {leftPanel}
      </div>

      {/* Resize Handle */}
      <div
        className={`group relative flex items-center justify-center ${
          isHorizontal
            ? 'w-1 cursor-col-resize hover:w-2'
            : 'h-1 cursor-row-resize hover:h-2'
        } bg-gray-200 dark:bg-gray-700 hover:bg-indigo-400 dark:hover:bg-indigo-500 transition-all ${
          isDragging ? 'bg-indigo-500 dark:bg-indigo-400' : ''
        }`}
        onMouseDown={handleMouseDown}
      >
        {/* Grip icon */}
        <div
          className={`absolute ${
            isHorizontal ? 'rotate-0' : 'rotate-90'
          } opacity-0 group-hover:opacity-100 transition-opacity`}
        >
          <GripVertical className="h-4 w-4 text-white" />
        </div>

        {/* Larger hit area */}
        <div
          className={`absolute ${
            isHorizontal ? 'w-4 h-full -left-1.5' : 'h-4 w-full -top-1.5'
          }`}
        />
      </div>

      {/* Right/Bottom Panel */}
      <div
        className="flex-1 overflow-hidden"
        style={{
          [isHorizontal ? 'width' : 'height']: `${100 - split}%`,
        }}
      >
        {rightPanel}
      </div>
    </div>
  );
}

export default SplitViewContainer;
