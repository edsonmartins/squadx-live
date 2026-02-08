'use client';

import React, { useState, useCallback } from 'react';
import {
  Download,
  X,
  Image,
  FileCode,
  FileText,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import type { ExcalidrawElement, AppState, BinaryFiles } from '../types';

type ExportFormat = 'png' | 'svg' | 'pdf' | 'json';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  exportToBlob: (opts?: {
    mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
    quality?: number;
    exportPadding?: number;
  }) => Promise<Blob | null>;
  exportToSvg: (opts?: { exportPadding?: number }) => Promise<SVGSVGElement | null>;
  boardTitle?: string;
  className?: string;
}

interface ExportOption {
  format: ExportFormat;
  label: string;
  description: string;
  icon: typeof Image;
  extension: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    format: 'png',
    label: 'PNG',
    description: 'Imagem rasterizada de alta qualidade',
    icon: Image,
    extension: '.png',
  },
  {
    format: 'svg',
    label: 'SVG',
    description: 'Gráfico vetorial escalável',
    icon: FileCode,
    extension: '.svg',
  },
  {
    format: 'pdf',
    label: 'PDF',
    description: 'Documento para impressão',
    icon: FileText,
    extension: '.pdf',
  },
  {
    format: 'json',
    label: 'JSON',
    description: 'Dados do Excalidraw (backup)',
    icon: FileCode,
    extension: '.excalidraw',
  },
];

/**
 * Export dialog for whiteboard content
 */
export function ExportDialog({
  isOpen,
  onClose,
  elements,
  appState,
  files,
  exportToBlob,
  exportToSvg,
  boardTitle = 'whiteboard',
  className = '',
}: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('png');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [exportPadding, setExportPadding] = useState(20);
  const [includeBackground, setIncludeBackground] = useState(true);
  const [scale, setScale] = useState(2);

  const getFileName = useCallback(() => {
    const date = new Date().toISOString().split('T')[0];
    const option = EXPORT_OPTIONS.find((o) => o.format === selectedFormat);
    return `${boardTitle}-${date}${option?.extension || ''}`;
  }, [boardTitle, selectedFormat]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPng = async () => {
    const blob = await exportToBlob({
      mimeType: 'image/png',
      quality: 1,
      exportPadding,
    });

    if (!blob) {
      throw new Error('Falha ao gerar imagem PNG');
    }

    downloadBlob(blob, getFileName());
  };

  const handleExportSvg = async () => {
    const svg = await exportToSvg({ exportPadding });

    if (!svg) {
      throw new Error('Falha ao gerar SVG');
    }

    const svgString = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, getFileName());
  };

  const handleExportPdf = async () => {
    // Get PNG blob first
    const blob = await exportToBlob({
      mimeType: 'image/png',
      quality: 1,
      exportPadding,
    });

    if (!blob) {
      throw new Error('Falha ao gerar imagem para PDF');
    }

    // Convert to data URL
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Create PDF using jsPDF (dynamically imported)
    const { jsPDF } = await import('jspdf');

    // Create image to get dimensions
    const img = new window.Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = dataUrl;
    });

    // Calculate PDF dimensions (A4 as base, adjust to fit)
    const pdfWidth = 210; // A4 width in mm
    const pdfHeight = (img.height * pdfWidth) / img.width;

    const pdf = new jsPDF({
      orientation: pdfHeight > pdfWidth ? 'portrait' : 'landscape',
      unit: 'mm',
      format: [pdfWidth, pdfHeight],
    });

    pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(getFileName());
  };

  const handleExportJson = async () => {
    const exportData = {
      type: 'excalidraw',
      version: 2,
      source: 'squadx-whiteboard',
      elements: elements.filter((el) => !el.isDeleted),
      appState: {
        gridSize: appState.gridModeEnabled ? 20 : null,
        viewBackgroundColor: includeBackground
          ? (appState as Record<string, unknown>).viewBackgroundColor || '#ffffff'
          : 'transparent',
      },
      files: Object.keys(files).length > 0 ? files : undefined,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    downloadBlob(blob, getFileName());
  };

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    setSuccess(false);

    try {
      switch (selectedFormat) {
        case 'png':
          await handleExportPng();
          break;
        case 'svg':
          await handleExportSvg();
          break;
        case 'pdf':
          await handleExportPdf();
          break;
        case 'json':
          await handleExportJson();
          break;
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Export error:', err);
      setError(err instanceof Error ? err.message : 'Falha ao exportar');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const activeElements = elements.filter((el) => !el.isDeleted);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Download className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Exportar Whiteboard
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Element count */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {activeElements.length} elemento{activeElements.length !== 1 ? 's' : ''} no
            board
          </div>

          {/* Format selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Formato
            </label>
            <div className="grid grid-cols-2 gap-2">
              {EXPORT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedFormat === option.format;

                return (
                  <button
                    key={option.format}
                    onClick={() => setSelectedFormat(option.format)}
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-colors ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 mt-0.5 ${
                        isSelected
                          ? 'text-indigo-500'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                    />
                    <div>
                      <p
                        className={`font-medium ${
                          isSelected
                            ? 'text-indigo-700 dark:text-indigo-300'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {option.label}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {option.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Options for image formats */}
          {(selectedFormat === 'png' || selectedFormat === 'svg') && (
            <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              {/* Padding */}
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  Padding
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={exportPadding}
                    onChange={(e) => setExportPadding(Number(e.target.value))}
                    className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-10 text-right">
                    {exportPadding}px
                  </span>
                </div>
              </div>

              {/* Scale (PNG only) */}
              {selectedFormat === 'png' && (
                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-700 dark:text-gray-300">
                    Escala
                  </label>
                  <select
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value={1}>1x</option>
                    <option value={2}>2x (Recomendado)</option>
                    <option value={3}>3x</option>
                    <option value={4}>4x</option>
                  </select>
                </div>
              )}

              {/* Include background */}
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  Incluir fundo
                </label>
                <button
                  onClick={() => setIncludeBackground(!includeBackground)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${
                    includeBackground
                      ? 'bg-indigo-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      includeBackground ? 'translate-x-4' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || activeElements.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-400 rounded-lg transition-colors"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : success ? (
              <Check className="h-4 w-4" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span>
              {isExporting ? 'Exportando...' : success ? 'Exportado!' : 'Exportar'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExportDialog;
