'use client';

import React, { useState } from 'react';
import { Minus, Plus, X, Move } from 'lucide-react';

interface OverlayContainerProps {
  children: React.ReactNode;
  isVisible: boolean;
  onClose: () => void;
  initialOpacity?: number;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  className?: string;
}

/**
 * Floating overlay container for whiteboard in overlay mode
 */
export function OverlayContainer({
  children,
  isVisible,
  onClose,
  initialOpacity = 0.85,
  initialPosition = { x: 20, y: 20 },
  initialSize = { width: 600, height: 400 },
  className = '',
}: OverlayContainerProps) {
  const [opacity, setOpacity] = useState(initialOpacity);
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  if (!isVisible) return null;

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.overlay-controls')) return;
    e.preventDefault();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleDrag = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y,
    });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  };

  const handleResize = (e: React.MouseEvent) => {
    if (!isResizing) return;
    const newWidth = Math.max(300, e.clientX - position.x);
    const newHeight = Math.max(200, e.clientY - position.y);
    setSize({ width: newWidth, height: newHeight });
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
  };

  const decreaseOpacity = () => {
    setOpacity((prev) => Math.max(0.3, prev - 0.1));
  };

  const increaseOpacity = () => {
    setOpacity((prev) => Math.min(1, prev + 0.1));
  };

  return (
    <div
      className="fixed z-40"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }}
      onMouseMove={(e) => {
        handleDrag(e);
        handleResize(e);
      }}
      onMouseUp={() => {
        handleDragEnd();
        handleResizeEnd();
      }}
      onMouseLeave={() => {
        handleDragEnd();
        handleResizeEnd();
      }}
    >
      {/* Main container */}
      <div
        className={`relative w-full h-full rounded-xl shadow-2xl overflow-hidden border border-gray-300 dark:border-gray-600 ${className}`}
        style={{ opacity }}
      >
        {/* Header / Drag handle */}
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur border-b border-gray-200 dark:border-gray-700 cursor-move"
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center gap-2">
            <Move className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
              Whiteboard
            </span>
          </div>

          {/* Controls */}
          <div className="overlay-controls flex items-center gap-1">
            {/* Opacity controls */}
            <div className="flex items-center gap-0.5 mr-2">
              <button
                onClick={decreaseOpacity}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
                title="Diminuir opacidade"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="text-[10px] text-gray-500 w-8 text-center">
                {Math.round(opacity * 100)}%
              </span>
              <button
                onClick={increaseOpacity}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
                title="Aumentar opacidade"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
              title="Fechar overlay"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="absolute inset-0 pt-10">{children}</div>

        {/* Resize handle */}
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
          onMouseDown={handleResizeStart}
        >
          <svg
            className="w-full h-full text-gray-400"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M14 14H10V10L14 14ZM14 10H12V12H10V14L14 10Z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export default OverlayContainer;
